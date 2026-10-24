// Servidor local de House Mates Plano.
// Sirve la app, guarda las escenas en escenas/*.json (con respaldos automáticos) y avisa al navegador
// cuando un archivo de escena cambia en disco (por ejemplo, cuando Claude lo edita).
// Sin dependencias: alcanza con Node 18 o más nuevo.
//
// Uso: node server.mjs [--abrir] [--puerto=5178] [--red]
//   --abrir  abre el navegador al arrancar
//   --red    permite entrar desde otros equipos de la misma red (por ejemplo, el celular). Por defecto solo esta compu.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { leerConfig } from './servidor/config.mjs';
import { crearApagado, manejarApagar } from './servidor/apagado.mjs';
import { crearHistorial } from './servidor/historial.mjs';
import { crearChecklist } from './servidor/checklist.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(RAIZ, 'public');
const ESCENAS = path.join(RAIZ, 'escenas');
const RESPALDOS = path.join(ESCENAS, '.respaldos');
const FOTOS = path.join(RAIZ, 'fotos');
const argumento = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];
const PUERTO = Number(argumento('puerto') || process.env.PUERTO) || 5178;
const ABRIR = process.argv.includes('--abrir');
const RED = process.argv.includes('--red') || process.env.RED === '1';
const URL_APP = `http://localhost:${PUERTO}`;
// --oculto: abierto desde el acceso directo sin ventana; se cierra solo cuando no queda ninguna pestaña abierta.
const OCULTO = process.argv.includes('--oculto');
const CONFIG = leerConfig(RAIZ);
// Historial (git) y copia en la nube: se arman al escuchar el puerto (si el puerto está ocupado, este proceso
// se va sin tocar nada).
let historial = null;
let apagado = null;

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IMAGENES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const RESPALDO_CADA_MS = 5 * 60 * 1000;
const RESPALDOS_POR_ESCENA = 40;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

fs.mkdirSync(ESCENAS, { recursive: true });
fs.mkdirSync(FOTOS, { recursive: true });

// Datos que no son de una escena sino de House Mates en general: el catálogo propio de equipos y los
// bloques reutilizables (la cabina armada, por ejemplo). Uno por archivo en datos/.
const DATOS = path.join(RAIZ, 'datos');
const DATOS_PERMITIDOS = new Set(['catalogo', 'bloques']);
fs.mkdirSync(DATOS, { recursive: true });

const hash = (texto) => crypto.createHash('sha1').update(texto).digest('hex');
const rutaEscena = (slug) => path.join(ESCENAS, `${slug}.json`);

// Último contenido conocido de cada escena: evita avisar al navegador de sus propios guardados.
const hashes = new Map();
for (const f of fs.readdirSync(ESCENAS)) {
  if (f.endsWith('.json')) hashes.set(f.slice(0, -5), hash(fs.readFileSync(path.join(ESCENAS, f), 'utf8')));
}

const clientes = new Set();
function emitir(evento) {
  const linea = `data: ${JSON.stringify(evento)}\n\n`;
  for (const res of clientes) res.write(linea);
}
// Latido para que la conexión de avisos no se corte por inactividad.
setInterval(() => {
  for (const res of clientes) res.write(': latido\n\n');
}, 25000).unref();

const pendientes = new Map();
fs.watch(ESCENAS, (_tipo, archivo) => {
  if (!archivo || !archivo.endsWith('.json')) return;
  const slug = archivo.slice(0, -5);
  clearTimeout(pendientes.get(slug));
  pendientes.set(slug, setTimeout(() => revisarCambio(slug), 250));
});

async function revisarCambio(slug) {
  let texto;
  try {
    texto = await fsp.readFile(rutaEscena(slug), 'utf8');
  } catch {
    if (hashes.delete(slug)) {
      emitir({ tipo: 'lista' });
      historial?.alGuardar(slug);
    }
    return;
  }
  const h = hash(texto);
  if (hashes.get(slug) === h) return;
  const nueva = !hashes.has(slug);
  hashes.set(slug, h);
  try {
    JSON.parse(texto);
  } catch (e) {
    emitir({ tipo: 'error', slug, mensaje: e.message });
    return;
  }
  emitir({ tipo: 'escena', slug, nueva });
  historial?.alGuardar(slug);
}

// Antes de pisar una escena se guarda una copia, como mucho una cada 5 minutos por escena,
// y se conservan las últimas 40. Sirven para recuperar un estado anterior si algo sale mal.
// Desde la app se puede forzar una copia en el momento ("Guardar versión ahora" y antes de volver a una
// versión anterior). Si lo actual es igual a la última copia, no se duplica.
const ARCHIVO_RESPALDO = /^\d{4}-\d{2}-\d{2}[_-]\d{2}-\d{2}-\d{2}(-\d+)?\.json$/;
const ultimoRespaldo = new Map();

// Respaldos de una escena, del más nuevo al más viejo (por fecha del archivo).
async function listarRespaldos(slug) {
  const carpeta = path.join(RESPALDOS, slug);
  let archivos;
  try {
    archivos = (await fsp.readdir(carpeta)).filter((f) => ARCHIVO_RESPALDO.test(f));
  } catch {
    return [];
  }
  const lista = [];
  for (const archivo of archivos) {
    try {
      const st = await fsp.stat(path.join(carpeta, archivo));
      lista.push({ archivo, fecha: st.mtimeMs, bytes: st.size });
    } catch {}
  }
  return lista.sort((a, b) => b.fecha - a.fecha || b.archivo.localeCompare(a.archivo));
}

async function respaldar(slug, { forzar = false } = {}) {
  const ahora = Date.now();
  if (!forzar && ahora - (ultimoRespaldo.get(slug) || 0) < RESPALDO_CADA_MS) return null;
  let actual;
  try {
    actual = await fsp.readFile(rutaEscena(slug), 'utf8');
  } catch {
    return null;
  }
  const carpeta = path.join(RESPALDOS, slug);
  await fsp.mkdir(carpeta, { recursive: true });
  const previos = await listarRespaldos(slug);
  if (previos[0]) {
    const ultimo = await fsp.readFile(path.join(carpeta, previos[0].archivo), 'utf8').catch(() => null);
    if (ultimo === actual) {
      ultimoRespaldo.set(slug, ahora);
      return previos[0].archivo;
    }
  }
  // Hora local, para que el nombre coincida con el reloj de la computadora: 2026-10-23_16-58-29.json
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  const marca = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}-${dos(d.getMinutes())}-${dos(d.getSeconds())}`;
  let archivo = `${marca}.json`;
  for (let n = 2; fs.existsSync(path.join(carpeta, archivo)); n++) archivo = `${marca}-${n}.json`;
  await fsp.writeFile(path.join(carpeta, archivo), actual, 'utf8');
  ultimoRespaldo.set(slug, ahora);
  const todos = await listarRespaldos(slug);
  for (const viejo of todos.slice(RESPALDOS_POR_ESCENA)) await fsp.rm(path.join(carpeta, viejo.archivo), { force: true });
  return archivo;
}

async function guardarEscena(slug, texto, { forzarRespaldo = false } = {}) {
  const nueva = !hashes.has(slug);
  if (!nueva) await respaldar(slug, { forzar: forzarRespaldo }).catch(() => {});
  hashes.set(slug, hash(texto));
  const destino = rutaEscena(slug);
  const temporal = `${destino}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(temporal, texto, 'utf8');
  try {
    await fsp.rename(temporal, destino);
  } catch {
    await fsp.writeFile(destino, texto, 'utf8');
    await fsp.rm(temporal, { force: true });
  }
  if (nueva) emitir({ tipo: 'lista' });
  historial?.alGuardar(slug);
}

async function listarEscenas() {
  const lista = [];
  for (const f of await fsp.readdir(ESCENAS)) {
    if (!f.endsWith('.json')) continue;
    const slug = f.slice(0, -5);
    if (!SLUG.test(slug)) continue;
    const ruta = path.join(ESCENAS, f);
    let nombre = slug;
    try {
      nombre = JSON.parse(await fsp.readFile(ruta, 'utf8')).nombre || slug;
    } catch {
      nombre = `${slug} (archivo con error)`;
    }
    lista.push({ slug, nombre, modificado: (await fsp.stat(ruta)).mtimeMs });
  }
  return lista.sort((a, b) => b.modificado - a.modificado);
}

async function leerCuerpo(req, limite) {
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > limite) throw Object.assign(new Error('El archivo es demasiado grande'), { status: 413 });
    partes.push(parte);
  }
  return Buffer.concat(partes);
}

function json(res, status, datos) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(datos));
}

async function servirArchivo(res, base, relativo) {
  const ruta = path.normalize(path.join(base, relativo));
  if (ruta !== base && !ruta.startsWith(base + path.sep)) return json(res, 403, { error: 'Ruta no permitida' });
  try {
    const st = await fsp.stat(ruta);
    if (!st.isFile()) throw new Error('no es archivo');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(ruta).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(ruta).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}

// Solo se aceptan pedidos dirigidos a esta compu (evita que una página de internet use el servidor
// a través del navegador) y, para guardar, solo desde la propia app.
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);
function permitido(req) {
  const host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (!RED && !HOSTS_LOCALES.has(host)) return false;
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origen = req.headers.origin;
  if (!origen) return true;
  try {
    return new URL(origen).host.toLowerCase() === (req.headers.host || '').toLowerCase();
  } catch {
    return false;
  }
}

// Checklist del armado (celular): GET y PATCH /api/checklist/:slug, ver servidor/checklist.mjs.
const checklist = crearChecklist({ ESCENAS, SLUG, json, leerCuerpo, emitir });

// Direcciones de esta compu en la red local (para abrir el checklist desde el celular).
function direccionesRed() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PUERTO}`);
}

async function api(req, res, [recurso, slug, ...resto], url) {
  if (recurso === 'red' && !slug) return json(res, 200, { red: RED, direcciones: RED ? direccionesRed() : [] });
  if (recurso === 'eventos') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clientes.add(res);
    apagado?.conexion();
    req.on('close', () => {
      clientes.delete(res);
      apagado?.desconexion();
    });
    return;
  }

  // Cerrar la herramienta desde el botón de la app (sobre todo cuando se abrió sin ventana).
  if (recurso === 'apagar' && !slug) return manejarApagar(req, res, json, { apagar: (motivo) => (apagado ? apagado.apagar(motivo) : process.exit(0)) });
  // Estado del historial y de la copia en la nube; POST guarda en el historial ahora.
  if (recurso === 'historial' && !slug) {
    if (req.method === 'POST') await historial?.vaciar();
    return json(res, 200, { ...(historial?.estado() ?? { git: null, nube: null }), oculto: OCULTO });
  }

  if (recurso === 'escenas' && !slug && req.method === 'GET') return json(res, 200, await listarEscenas());

  if (recurso === 'escenas' && slug && !resto.length) {
    if (!SLUG.test(slug)) return json(res, 400, { error: 'Nombre de escena inválido' });
    if (req.method === 'GET') {
      try {
        const texto = await fsp.readFile(rutaEscena(slug), 'utf8');
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
        return res.end(texto);
      } catch {
        return json(res, 404, { error: `No existe la escena ${slug}` });
      }
    }
    if (req.method === 'PUT') {
      const texto = (await leerCuerpo(req, 5e6)).toString('utf8');
      try {
        const datos = JSON.parse(texto);
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('se esperaba un objeto');
      } catch (e) {
        return json(res, 400, { error: `JSON inválido: ${e.message}` });
      }
      if (url.searchParams.has('crear') && hashes.has(slug)) return json(res, 409, { error: 'Ya existe una escena con ese nombre' });
      // ?respaldar: guarda una copia de lo actual aunque la última sea reciente (al volver a una versión anterior).
      await guardarEscena(slug, texto.endsWith('\n') ? texto : `${texto}\n`, { forzarRespaldo: url.searchParams.has('respaldar') });
      return json(res, 200, { ok: true });
    }
  }

  // Plano de AutoCAD (DXF) importado como fondo: sus líneas, ya en metros, en fotos/<escena>/fondo-cad.json.
  if (recurso === 'cad' && slug && !resto.length) {
    if (!SLUG.test(slug)) return json(res, 400, { error: 'Nombre de escena inválido' });
    const ruta = path.join(FOTOS, slug, 'fondo-cad.json');
    if (req.method === 'GET') {
      try {
        const texto = await fsp.readFile(ruta, 'utf8');
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
        return res.end(texto);
      } catch {
        return json(res, 404, { error: 'Esta escena no tiene plano de AutoCAD' });
      }
    }
    if (req.method === 'PUT') {
      const texto = (await leerCuerpo(req, 25e6)).toString('utf8');
      try {
        const d = JSON.parse(texto);
        if (!Array.isArray(d?.lineas)) throw new Error('faltan las líneas');
      } catch (e) {
        return json(res, 400, { error: `JSON inválido: ${e.message}` });
      }
      await fsp.mkdir(path.join(FOTOS, slug), { recursive: true });
      await fsp.writeFile(ruta, texto, 'utf8');
      return json(res, 200, { ok: true });
    }
  }

  // Catálogo propio y bloques: GET devuelve la lista (vacía si no existe), PUT la reemplaza entera.
  if (recurso === 'datos' && slug && !resto.length) {
    if (!DATOS_PERMITIDOS.has(slug)) return json(res, 404, { error: 'Dato desconocido' });
    const ruta = path.join(DATOS, `${slug}.json`);
    if (req.method === 'GET') {
      try {
        const texto = await fsp.readFile(ruta, 'utf8');
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
        return res.end(texto);
      } catch {
        return json(res, 200, []);
      }
    }
    if (req.method === 'PUT') {
      const texto = (await leerCuerpo(req, 5e6)).toString('utf8');
      try {
        if (!Array.isArray(JSON.parse(texto))) throw new Error('se esperaba una lista');
      } catch (e) {
        return json(res, 400, { error: `JSON inválido: ${e.message}` });
      }
      const temporal = `${ruta}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fsp.writeFile(temporal, texto, 'utf8');
      try {
        await fsp.rename(temporal, ruta);
      } catch {
        await fsp.writeFile(ruta, texto, 'utf8');
        await fsp.rm(temporal, { force: true });
      }
      emitir({ tipo: 'datos', nombre: slug });
      historial?.alGuardar('datos');
      return json(res, 200, { ok: true });
    }
  }

  // Versiones anteriores: GET lista, GET /archivo devuelve una, POST guarda una copia de lo actual.
  if (recurso === 'respaldos' && slug && resto.length <= 1) {
    if (!SLUG.test(slug)) return json(res, 400, { error: 'Nombre de escena inválido' });
    const [archivo] = resto;
    if (!archivo && req.method === 'GET') return json(res, 200, await listarRespaldos(slug));
    if (!archivo && req.method === 'POST') {
      const anterior = (await listarRespaldos(slug))[0]?.archivo;
      const creado = await respaldar(slug, { forzar: true });
      if (!creado) return json(res, 404, { error: `No existe la escena ${slug}` });
      return json(res, 200, { archivo: creado, nueva: creado !== anterior });
    }
    if (archivo && req.method === 'GET') {
      if (!ARCHIVO_RESPALDO.test(archivo)) return json(res, 400, { error: 'Nombre de respaldo inválido' });
      try {
        const texto = await fsp.readFile(path.join(RESPALDOS, slug, archivo), 'utf8');
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
        return res.end(texto);
      } catch {
        return json(res, 404, { error: 'No existe ese respaldo' });
      }
    }
  }

  if (recurso === 'fotos' && slug && !resto.length) {
    if (!SLUG.test(slug)) return json(res, 400, { error: 'Nombre de escena inválido' });
    const carpeta = path.join(FOTOS, slug);
    if (req.method === 'GET') {
      let archivos = [];
      try {
        archivos = (await fsp.readdir(carpeta)).filter((f) => IMAGENES.has(path.extname(f).toLowerCase())).sort();
      } catch {}
      return json(res, 200, archivos.map((f) => ({ nombre: f, url: `/fotos/${slug}/${encodeURIComponent(f)}` })));
    }
    if (req.method === 'POST') {
      const original = path.basename(url.searchParams.get('nombre') || 'foto.jpg').replace(/[^\w.\- ]+/g, '_');
      const ext = path.extname(original).toLowerCase();
      if (!IMAGENES.has(ext)) return json(res, 415, { error: 'Solo se aceptan fotos JPG, PNG, WebP o GIF' });
      const datos = await leerCuerpo(req, 30e6);
      await fsp.mkdir(carpeta, { recursive: true });
      const base = original.slice(0, -ext.length) || 'foto';
      let nombre = `${base}${ext}`;
      for (let n = 2; fs.existsSync(path.join(carpeta, nombre)); n++) nombre = `${base}-${n}${ext}`;
      await fsp.writeFile(path.join(carpeta, nombre), datos);
      historial?.alGuardar(slug);
      return json(res, 200, { nombre, url: `/fotos/${slug}/${encodeURIComponent(nombre)}` });
    }
  }

  if (await checklist.manejar(req, res, [recurso, slug, ...resto])) return;

  return json(res, 404, { error: 'Ruta de API desconocida' });
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (!permitido(req)) return json(res, 403, { error: 'Pedido no permitido' });
    const url = new URL(req.url, 'http://localhost');
    let partes;
    try {
      partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      return json(res, 400, { error: 'Dirección mal formada' });
    }
    if (partes[0] === 'api') return await api(req, res, partes.slice(1), url);
    if (partes[0] === 'fotos') return await servirArchivo(res, FOTOS, partes.slice(1).join('/'));
    return await servirArchivo(res, PUBLICO, partes.length ? partes.join('/') : 'index.html');
  } catch (e) {
    if (!res.headersSent) json(res, e.status || 500, { error: e.message });
    else res.end();
  }
});

function abrirNavegador() {
  const comando =
    process.platform === 'win32' ? `start "" "${URL_APP}"` : process.platform === 'darwin' ? `open "${URL_APP}"` : `xdg-open "${URL_APP}"`;
  exec(comando);
}

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`House Mates Plano ya está abierto en ${URL_APP}`);
    if (ABRIR) abrirNavegador();
    setTimeout(() => process.exit(0), 300);
    return;
  }
  throw e;
});

servidor.listen(PUERTO, RED ? '0.0.0.0' : '127.0.0.1', async () => {
  console.log(`House Mates Plano funcionando en ${URL_APP}`);
  historial = await crearHistorial({ raiz: RAIZ, nube: CONFIG.nube, usarGit: CONFIG.historial, log: console.log });
  apagado = crearApagado({
    clientes,
    activo: OCULTO,
    minutos: CONFIG.apagadoMinutos,
    log: console.log,
    alApagar: async () => {
      emitir({ tipo: 'cerrado' });
      await historial?.detener();
    },
  });
  // Al cerrar la ventana (o Ctrl+C) se guarda lo pendiente en el historial y la nube antes de salir.
  for (const senal of ['SIGINT', 'SIGBREAK', 'SIGHUP']) process.on(senal, () => apagado.apagar(`Señal ${senal}`));
  if (RED) {
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => `http://${i.address}:${PUERTO}`);
    if (ips.length) console.log(`Desde otro equipo de la misma red: ${ips.join('  ')}`);
  }
  if (!OCULTO) console.log('Dejá esta ventana abierta mientras uses la herramienta. Para cerrarla: Ctrl+C o cerrar la ventana.');
  if (ABRIR) abrirNavegador();
});
