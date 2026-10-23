// Checklist del armado: el equipo marca desde el celular qué material llegó, qué está armado y qué tiene
// un problema. Se guarda aparte de la escena, en escenas/.checklist/<slug>.json, así marcar desde varios
// celulares no pisa el archivo de la escena que se edita en la compu.
//
// Rutas (las `partes` son los pedazos de la dirección después de /api):
//   GET   /api/checklist/:slug → { estados: { [id]: { estado, hora, quien, nota, foto } }, actualizado, version, ahora }
//   PATCH /api/checklist/:slug ← { id, estado?, quien?, nota?, foto? }
//                              → { ok, id, item, actualizado, version, ahora }  y avisa por SSE { tipo: 'checklist', slug, id, version }
//
// El PATCH cambia solo lo que viene: `estado` también anota la hora (del servidor) y quién; `nota` o `foto`
// vacías ('' o null) se borran. `id` es el de un objeto de la escena o el de un renglón agrupado
// ("grupo:<tipo>|<medida>|<ref>", ver checklist-datos.js).

import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const ESTADOS_CHECKLIST = ['pendiente', 'llego', 'armado', 'problema'];
const ESTADOS = new Set(ESTADOS_CHECKLIST);
const CAMPOS = new Set(['id', 'estado', 'quien', 'nota', 'foto']);
const LIMITE_CUERPO = 20 * 1024;
const MAX_ITEMS = 5000;
const MAX_ID = 200;
const MAX_QUIEN = 40;
const MAX_NOTA = 500;
// Ids: letras (con tildes), números, espacios y unos pocos signos. Sin <, >, comillas, barras ni caracteres de control.
const ID = /^[\p{L}\p{N}_.,:|()#+×-][\p{L}\p{N}_.,:|()#+× -]*$/u;
const RESERVADOS = new Set(['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf']);
// Nombre de una foto ya subida a fotos/<slug>/ (el servidor de fotos deja solo letras, números, _ . - y espacios).
const FOTO = /^[\w-][\w.\- ]{0,118}\.(jpe?g|png|webp|gif)$/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idValido = (id) => typeof id === 'string' && id.length <= MAX_ID && ID.test(id) && !RESERVADOS.has(id);

// Texto libre: sin caracteres de control. Una línea (quien) o varias (nota).
function texto(v, { lineas = false } = {}) {
  let s = String(v).replace(/\r\n?/g, '\n').replace(CONTROL, '');
  s = lineas ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

// Revisa el cuerpo del PATCH. Devuelve { error } o { id, cambios }.
function validar(pedido) {
  if (!esObjeto(pedido)) return { error: 'Se esperaba un objeto { id, estado, quien, nota, foto }' };
  const extra = Object.keys(pedido).filter((k) => !CAMPOS.has(k));
  if (extra.length) return { error: `Campo desconocido: ${extra.slice(0, 3).join(', ')}` };
  if (!idValido(pedido.id)) return { error: 'El id del ítem no es válido' };
  const cambios = {};
  if (pedido.estado !== undefined) {
    if (!ESTADOS.has(pedido.estado)) return { error: `Estado inválido: tiene que ser ${ESTADOS_CHECKLIST.join(', ')}` };
    cambios.estado = pedido.estado;
  }
  if (pedido.quien !== undefined && pedido.quien !== null) {
    if (typeof pedido.quien !== 'string') return { error: 'El nombre de quien marca tiene que ser un texto' };
    const quien = texto(pedido.quien);
    if (quien.length > MAX_QUIEN) return { error: `El nombre es muy largo (máximo ${MAX_QUIEN} letras)` };
    cambios.quien = quien;
  }
  if (pedido.nota !== undefined) {
    if (pedido.nota !== null && typeof pedido.nota !== 'string') return { error: 'La nota tiene que ser un texto' };
    const nota = pedido.nota === null ? '' : texto(pedido.nota, { lineas: true });
    if (nota.length > MAX_NOTA) return { error: `La nota es muy larga (máximo ${MAX_NOTA} caracteres)` };
    cambios.nota = nota;
  }
  if (pedido.foto !== undefined) {
    if (pedido.foto !== null && typeof pedido.foto !== 'string') return { error: 'La foto tiene que ser el nombre de un archivo' };
    const foto = pedido.foto === null ? '' : pedido.foto.trim();
    if (foto && !FOTO.test(foto)) return { error: 'Nombre de foto inválido' };
    cambios.foto = foto;
  }
  if (cambios.estado === undefined && cambios.nota === undefined && cambios.foto === undefined) {
    return { error: 'No hay nada para cambiar (mandá estado, nota o foto)' };
  }
  return { id: pedido.id, cambios };
}

// Un ítem guardado, siempre con las claves en el mismo orden. null si quedó vacío.
function ordenar(e) {
  const out = {};
  if (ESTADOS.has(e.estado)) {
    out.estado = e.estado;
    if (typeof e.hora === 'string' && e.hora) out.hora = e.hora.slice(0, 40);
    if (typeof e.quien === 'string' && e.quien) out.quien = texto(e.quien).slice(0, MAX_QUIEN);
  }
  if (typeof e.nota === 'string' && e.nota) out.nota = texto(e.nota, { lineas: true }).slice(0, MAX_NOTA);
  if (typeof e.foto === 'string' && FOTO.test(e.foto)) out.foto = e.foto;
  return Object.keys(out).length ? out : null;
}

function aplicar(previo, { estado, quien, nota, foto }, ahora) {
  const e = { ...(previo || {}) };
  if (estado !== undefined) {
    e.estado = estado;
    e.hora = ahora;
    e.quien = quien || '';
  }
  if (nota !== undefined) e.nota = nota;
  if (foto !== undefined) e.foto = foto;
  return ordenar(e);
}

// Lo que se lee del disco se revisa igual que lo que llega por la red (el archivo se puede editar a mano).
function sanear(d) {
  const estados = {};
  if (esObjeto(d?.estados)) {
    for (const [id, e] of Object.entries(d.estados)) {
      if (!idValido(id) || !esObjeto(e)) continue;
      const limpio = ordenar(e);
      if (limpio) estados[id] = limpio;
    }
  }
  return {
    version: Number.isInteger(d?.version) && d.version >= 0 ? d.version : 0,
    actualizado: typeof d?.actualizado === 'string' ? d.actualizado : null,
    estados,
  };
}

// Un ítem por renglón, para que el archivo se pueda leer (y revisar a mano) sin herramientas.
function serializar(datos) {
  const ids = Object.keys(datos.estados);
  const renglones = ids.map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(datos.estados[id])}`);
  return (
    '{\n' +
    `  "version": ${datos.version},\n` +
    `  "actualizado": ${JSON.stringify(datos.actualizado)},\n` +
    (renglones.length ? `  "estados": {\n${renglones.join(',\n')}\n  }\n` : '  "estados": {}\n') +
    '}\n'
  );
}

export function crearChecklist({ ESCENAS, SLUG, json, leerCuerpo, emitir }) {
  const CARPETA = path.join(ESCENAS, '.checklist');
  const rutaDe = (slug) => path.join(CARPETA, `${slug}.json`);

  // Los cambios de una misma escena se hacen de a uno (varios celulares a la vez no se pisan).
  const filas = new Map();
  function enFila(slug, tarea) {
    const esta = (filas.get(slug) || Promise.resolve()).then(tarea);
    const cola = esta.catch(() => {});
    filas.set(slug, cola);
    cola.then(() => {
      if (filas.get(slug) === cola) filas.delete(slug);
    });
    return esta;
  }

  async function existeEscena(slug) {
    try {
      return (await fsp.stat(path.join(ESCENAS, `${slug}.json`))).isFile();
    } catch {
      return false;
    }
  }

  async function leer(slug) {
    const ruta = rutaDe(slug);
    let contenido;
    try {
      contenido = await fsp.readFile(ruta, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return sanear(null);
      throw e;
    }
    try {
      return sanear(JSON.parse(contenido));
    } catch (e) {
      // Un archivo roto (por ejemplo, editado a mano) se aparta con otro nombre para no perderlo y se sigue de cero.
      const aparte = path.join(CARPETA, `${slug}.roto-${Date.now()}.json`);
      await fsp.rename(ruta, aparte).catch(() => {});
      console.warn(`El checklist de ${slug} tenía un error (${e.message}). Se guardó aparte como ${path.basename(aparte)}.`);
      return sanear(null);
    }
  }

  // Escritura atómica: archivo temporal y después renombrar. Si Windows no deja renombrar (antivirus,
  // archivo abierto), se reintenta y como último recurso se escribe directo.
  async function guardar(slug, datos) {
    await fsp.mkdir(CARPETA, { recursive: true });
    const destino = rutaDe(slug);
    const contenido = serializar(datos);
    const temporal = `${destino}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fsp.writeFile(temporal, contenido, 'utf8');
    for (let intento = 0; intento < 4; intento++) {
      try {
        await fsp.rename(temporal, destino);
        return;
      } catch {
        await new Promise((ok) => setTimeout(ok, 40 * (intento + 1)));
      }
    }
    await fsp.writeFile(destino, contenido, 'utf8');
    await fsp.rm(temporal, { force: true });
  }

  async function obtener(res, slug) {
    if (!(await existeEscena(slug))) return json(res, 404, { error: `No existe la escena ${slug}` });
    const datos = await enFila(slug, () => leer(slug));
    return json(res, 200, { ...datos, ahora: new Date().toISOString() });
  }

  async function cambiar(req, res, slug) {
    let cuerpo;
    try {
      cuerpo = await leerCuerpo(req, LIMITE_CUERPO);
    } catch (e) {
      if (e.status === 413) return json(res, 413, { error: 'El pedido es demasiado grande (máximo 20 KB)' });
      throw e;
    }
    let pedido;
    try {
      pedido = JSON.parse(cuerpo.toString('utf8'));
    } catch {
      return json(res, 400, { error: 'El pedido no es un JSON válido' });
    }
    const v = validar(pedido);
    if (v.error) return json(res, 400, { error: v.error });
    if (!(await existeEscena(slug))) return json(res, 404, { error: `No existe la escena ${slug}` });

    const r = await enFila(slug, async () => {
      const datos = await leer(slug);
      const previo = Object.prototype.hasOwnProperty.call(datos.estados, v.id) ? datos.estados[v.id] : null;
      if (!previo && Object.keys(datos.estados).length >= MAX_ITEMS) return { error: 'El checklist ya tiene demasiados ítems' };
      const ahora = new Date().toISOString();
      const item = aplicar(previo, v.cambios, ahora);
      if (item) datos.estados[v.id] = item;
      else delete datos.estados[v.id];
      datos.version++;
      datos.actualizado = ahora;
      await guardar(slug, datos);
      return { item, version: datos.version, actualizado: ahora };
    });
    if (r.error) return json(res, 409, { error: r.error });
    emitir({ tipo: 'checklist', slug, id: v.id, version: r.version });
    return json(res, 200, { ok: true, id: v.id, item: r.item, version: r.version, actualizado: r.actualizado, ahora: r.actualizado });
  }

  // Devuelve true si el pedido era del checklist (y ya se respondió).
  async function manejar(req, res, partes) {
    if (!Array.isArray(partes) || partes[0] !== 'checklist') return false;
    try {
      const [, slug, ...resto] = partes;
      if (!slug || resto.length) {
        json(res, 404, { error: 'Ruta de API desconocida' });
        return true;
      }
      if (!SLUG.test(slug)) {
        json(res, 400, { error: 'Nombre de escena inválido' });
        return true;
      }
      if (req.method === 'GET' || req.method === 'HEAD') await obtener(res, slug);
      else if (req.method === 'PATCH') await cambiar(req, res, slug);
      else {
        res.setHeader('Allow', 'GET, HEAD, PATCH');
        json(res, 405, { error: 'Método no permitido' });
      }
    } catch (e) {
      if (!res.headersSent) json(res, e.status || 500, { error: e.message || 'Error del checklist' });
      else res.end();
    }
    return true;
  }

  return { manejar, leer: (slug) => enFila(slug, () => leer(slug)) };
}
