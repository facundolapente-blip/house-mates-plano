// Historial de cambios con git y copia de los datos a una carpeta en la nube (por ejemplo OneDrive).
//
// - Git: si está instalado, la carpeta del programa es un repositorio local. Cada vez que se guarda algo, a los
//   2 minutos sin más cambios (o a los 10 como mucho, si se sigue guardando) se hace un commit SOLO de las carpetas
//   de datos (escenas, datos, fotos). Nunca se sube nada (no hay push ni remotos) y nunca se hacen commits
//   automáticos de código. La primera vez, si el repositorio no tiene commits, se guarda todo lo que no está ignorado
//   para que el historial arranque completo.
// - Nube: a los 30 segundos de un guardado (5 minutos como mucho) se copian escenas/*.json, datos/*.json y las fotos
//   nuevas o cambiadas a la carpeta de la nube. Solo se copia lo que cambió (tamaño o fecha) y nunca se borra nada allá.
//
// Todo error queda anotado en estado() y en el log: nunca corta el servidor ni demora un pedido.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nubePorDefecto } from './config.mjs';

const MINUTO = 60_000;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());

// .gitignore del repositorio nuevo.
const IGNORAR = [
  'posteos/',
  'node_modules/',
  '*.tmp',
  'escenas/.respaldos/',
  '.claude/',
  'Thumbs.db',
  'ehthumbs.db',
  'desktop.ini',
  '.DS_Store',
  '~$*',
];
// Además del .gitignore, los commits automáticos dejan afuera esto (por si el repositorio ya existía sin ese .gitignore).
const EXCLUIR = ['**/.respaldos/**', '**/*.tmp', '**/Thumbs.db', '**/desktop.ini', '**/.DS_Store'].map(
  (g) => `:(exclude,glob)${g}`,
);
const BASURA = new Set(['thumbs.db', 'ehthumbs.db', 'desktop.ini', '.ds_store']);
const IDENTIDAD = [
  ['user.name', 'House Mates Plano'],
  ['user.email', 'plano@housemates.local'],
];
// Carpetas que se copian enteras (con subcarpetas). Las demás: solo los .json de primer nivel.
const RECURSIVAS = new Set(['fotos']);

const dos = (n) => String(n).padStart(2, '0');
function fechaCorta(d = new Date()) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

function nombres(lista) {
  const l = [...new Set(lista.filter(Boolean))];
  if (!l.length) return 'cambios';
  if (l.length <= 3) return l.join(', ');
  return `${l.slice(0, 3).join(', ')} y ${l.length - 3} más`;
}

// Demora con tope: cada pedido corre la espera de nuevo, pero se ejecuta como mucho `maximo` ms después del primero.
function crearDemora(tarea, espera, maximo) {
  let temporizador = null;
  let primero = 0;
  return {
    pedir() {
      const ahora = Date.now();
      if (!temporizador) primero = ahora;
      clearTimeout(temporizador);
      const resta = Math.max(0, Math.min(espera, primero + maximo - ahora));
      temporizador = setTimeout(() => {
        temporizador = null;
        tarea();
      }, resta);
      temporizador.unref?.();
    },
    // Cancela lo pendiente. Devuelve true si había algo.
    cancelar() {
      const habia = !!temporizador;
      clearTimeout(temporizador);
      temporizador = null;
      return habia;
    },
    pendiente: () => !!temporizador,
  };
}

// Cola de a una tarea por vez. Los errores se registran y no cortan la cola.
function crearCola(alFallar) {
  let ultima = Promise.resolve();
  const poner = (tarea) => {
    const p = ultima.then(tarea).catch(alFallar);
    ultima = p;
    return p;
  };
  return { poner, vacia: () => ultima };
}

/**
 * @param {object} op
 * @param {string} op.raiz carpeta del programa (la del repositorio).
 * @param {string[]} [op.carpetas] carpetas de datos, relativas a raiz.
 * @param {(msg: string) => void} [op.log]
 * @param {string|false|null} [op.nube] carpeta de copia. undefined = <OneDrive>\House Mates Plano (si hay OneDrive);
 *        false, null o '' = sin copia.
 * @param {boolean} [op.usarGit=true] false = sin historial con git (la copia a la nube sigue).
 * @param {string} [op.rutaGit='git'] ejecutable de git (para pruebas).
 * @param {object} [op.esperas] ms: { git: 2 min, gitMax: 10 min, nube: 30 s, nubeMax: 5 min }.
 * @returns {Promise<{ alGuardar(slug?: string): void, estado(): object, vaciar(): Promise<void>,
 *          detener(op?: { vaciar?: boolean }): Promise<void>, listo: Promise<void> }>}
 */
export async function crearHistorial({
  raiz,
  carpetas = ['escenas', 'datos', 'fotos'],
  log = console.log,
  nube,
  usarGit = true,
  rutaGit = 'git',
  esperas = {},
} = {}) {
  if (!raiz) throw new Error('crearHistorial: falta raiz');
  raiz = path.resolve(raiz);
  carpetas = carpetas.filter((c) => typeof c === 'string' && c && !path.isAbsolute(c) && !c.split(/[\\/]/).includes('..'));
  const t = { git: 2 * MINUTO, gitMax: 10 * MINUTO, nube: 30_000, nubeMax: 5 * MINUTO, ...esperas };

  const avisar = (m) => {
    try {
      log(m);
    } catch {}
  };

  const git = { disponible: false, activo: !!usarGit, preparando: !!usarGit, version: null, ultimoCommit: null, error: null };
  const enNube = { carpeta: null, activa: false, ultimaCopia: null, error: null };
  let detenido = false;

  // ---------- Carpeta de la nube ----------
  let carpetaNube = nube === undefined ? nubePorDefecto() : nube;
  if (carpetaNube) {
    carpetaNube = path.resolve(raiz, String(carpetaNube));
    const rel = path.relative(raiz, carpetaNube);
    if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      enNube.error = `La carpeta de la nube (${carpetaNube}) no puede estar dentro de la carpeta del programa. Copia apagada.`;
      avisar(enNube.error);
      enNube.carpeta = carpetaNube;
      carpetaNube = false;
    } else {
      enNube.carpeta = carpetaNube;
      enNube.activa = true;
    }
  }

  // ---------- Git ----------
  const entorno = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
  for (const k of Object.keys(entorno)) {
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|NAMESPACE|OBJECT_DIRECTORY|COMMON_DIR|CEILING_DIRECTORIES)$/i.test(k)) delete entorno[k];
  }
  // Git nunca busca un repositorio más arriba de raiz: si faltara raiz\.git, falla en vez de usar el de otra carpeta.
  entorno.GIT_CEILING_DIRECTORIES = path.dirname(raiz);
  let repoListo = false;

  function correrGit(args, { tiempo = 120_000 } = {}) {
    return new Promise((resolver, rechazar) => {
      execFile(
        rutaGit,
        args,
        { cwd: raiz, env: entorno, windowsHide: true, timeout: tiempo, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error) {
            const detalle = String(stderr || '').trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' / ');
            if (detalle) error.message = detalle;
            if (error.killed) error.message = `git tardó demasiado (${args[0]})`;
            return rechazar(error);
          }
          resolver(stdout);
        },
      );
    });
  }

  // Si quedó un index.lock viejo (git se cortó a la mitad), lo saca y prueba otra vez. Si es nuevo, espera y reintenta.
  async function conReintento(fn) {
    try {
      return await fn();
    } catch (e) {
      if (!/index\.lock/i.test(e.message)) throw e;
      const candado = path.join(raiz, '.git', 'index.lock');
      try {
        const st = await fsp.stat(candado);
        if (Date.now() - st.mtimeMs > 10 * MINUTO) {
          await fsp.rm(candado, { force: true });
          avisar('Historial: se sacó un index.lock viejo de git.');
        } else await esperar(3000);
      } catch {}
      return await fn();
    }
  }

  async function leerUltimoCommit() {
    const salida = await correrGit(['log', '-1', '--format=%h%x1f%cI%x1f%s']).catch(() => '');
    if (!salida.trim()) return null;
    const [hash, fecha, mensaje] = salida.trim().split('\x1f');
    return { hash, fecha, mensaje };
  }

  async function asegurarIgnorados() {
    const archivo = path.join(raiz, '.gitignore');
    let actual = '';
    try {
      actual = await fsp.readFile(archivo, 'utf8');
    } catch {}
    const tiene = new Set(actual.split(/\r?\n/).map((l) => l.trim()));
    const faltan = IGNORAR.filter((l) => !tiene.has(l));
    if (!faltan.length) return;
    const encabezado = actual ? '\n# House Mates Plano\n' : '# House Mates Plano: lo que no va al historial\n';
    const separador = actual && !actual.endsWith('\n') ? '\n' : '';
    await fsp.writeFile(archivo, `${actual}${separador}${encabezado}${faltan.join('\n')}\n`, 'utf8');
  }

  async function prepararGit() {
    try {
      git.version = (await correrGit(['--version'], { tiempo: 20_000 })).trim();
      git.disponible = true;
    } catch (e) {
      git.disponible = false;
      git.error =
        e.code === 'ENOENT'
          ? 'No se encontró git en esta compu: el historial está apagado (la copia en la nube sigue andando).'
          : `No se pudo usar git: ${e.message}`;
      avisar(`Historial: ${git.error}`);
      return;
    }
    await prepararRepo();
  }

  // Crea el repositorio si falta, pone la identidad y hace el primer commit. Si falla, se reintenta en el próximo guardado.
  async function prepararRepo() {
    try {
      if (!fs.existsSync(path.join(raiz, '.git'))) {
        await correrGit(['init', '-q']);
        await correrGit(['config', '--local', 'core.autocrlf', 'false']);
        avisar(`Historial: se creó el repositorio de git en ${raiz}`);
      }
      // Identidad de los commits: solo si la compu no tiene una configurada.
      for (const [clave, valor] of IDENTIDAD) {
        const actual = (await correrGit(['config', '--get', clave]).catch(() => '')).trim();
        if (!actual) await correrGit(['config', '--local', clave, valor]);
      }
      const sinCommits = await correrGit(['rev-parse', '--verify', '-q', 'HEAD']).then(
        () => false,
        () => true,
      );
      if (sinCommits) {
        await asegurarIgnorados();
        await conReintento(() => correrGit(['add', '-A'], { tiempo: 5 * MINUTO }));
        const hay = (await correrGit(['diff', '--cached', '--name-only', '-z'])).split('\0').filter(Boolean);
        if (hay.length) {
          await conReintento(() =>
            correrGit(['commit', '-q', '-m', `Estado inicial de House Mates Plano ${fechaCorta()}`], { tiempo: 5 * MINUTO }),
          );
          avisar(`Historial: primer commit con ${hay.length} archivos.`);
        }
      }
      git.ultimoCommit = await leerUltimoCommit();
      git.error = null;
      repoListo = true;
    } catch (e) {
      git.error = `No se pudo preparar el historial: ${e.message}`;
      avisar(`Historial: ${git.error}`);
    }
  }

  // A qué carpeta de datos pertenece una ruta de git ("escenas/a.json" -> "escenas").
  const carpetasGit = carpetas.map((c) => c.replace(/\\/g, '/').replace(/\/+$/, ''));
  const carpetaDe = (ruta) => carpetasGit.find((c) => ruta === c || ruta.startsWith(`${c}/`));

  const pendientesGit = new Set();
  const colaGit = crearCola((e) => {
    git.error = `No se pudo guardar en el historial: ${e?.message || e}`;
    avisar(`Historial: ${git.error}`);
  });

  async function guardarEnGit() {
    const slugs = [...pendientesGit];
    pendientesGit.clear();
    if (!git.disponible) return;
    try {
      if (!fs.existsSync(path.join(raiz, '.git'))) repoListo = false;
      if (!repoListo) await prepararRepo();
      if (!repoListo) {
        for (const s of slugs) pendientesGit.add(s);
        return;
      }
      // Carpetas que están en disco o en git (si se borró una carpeta entera, igual hay que guardar el borrado).
      // Una que no está en ningún lado haría fallar git add.
      const rastreados = (await correrGit(['ls-files', '-z', '--', ...carpetasGit])).split('\0').filter(Boolean);
      const existentes = carpetasGit.filter((c) => fs.existsSync(path.join(raiz, c)) || rastreados.some((r) => carpetaDe(r) === c));
      if (!existentes.length) return;
      await conReintento(() => correrGit(['add', '-A', '--', ...existentes, ...EXCLUIR], { tiempo: 5 * MINUTO }));
      const cambios = (await correrGit(['diff', '--cached', '--name-only', '-z', '--', ...existentes, ...EXCLUIR]))
        .split('\0')
        .filter(Boolean);
      if (!cambios.length) {
        git.error = null;
        return;
      }
      // Solo las carpetas con cambios (una carpeta vacía o sin archivos en git haría fallar el commit).
      const tocadas = [...new Set(cambios.map(carpetaDe).filter(Boolean))];
      const mensaje = `Guardado automático: ${nombres(slugs)} ${fechaCorta()}`;
      // Con rutas, git commit guarda solo esas carpetas aunque haya otras cosas preparadas (código).
      await conReintento(() => correrGit(['commit', '-q', '-m', mensaje, '--', ...tocadas, ...EXCLUIR], { tiempo: 5 * MINUTO }));
      git.ultimoCommit = await leerUltimoCommit();
      git.error = null;
      avisar(`Historial: ${mensaje} (${cambios.length} ${cambios.length === 1 ? 'archivo' : 'archivos'})`);
    } catch (e) {
      for (const s of slugs) pendientesGit.add(s);
      throw e;
    }
  }

  // ---------- Copia a la nube ----------
  async function listar(origen, recursivo, prefijo = '') {
    let entradas;
    try {
      entradas = await fsp.readdir(path.join(origen, prefijo), { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const lista = [];
    for (const e of entradas) {
      const nombre = e.name;
      if (nombre.startsWith('.') || nombre.startsWith('~$') || BASURA.has(nombre.toLowerCase())) continue;
      if (/\.tmp$/i.test(nombre)) continue;
      const rel = prefijo ? path.join(prefijo, nombre) : nombre;
      if (e.isDirectory()) {
        if (recursivo) lista.push(...(await listar(origen, true, rel)));
      } else if (e.isFile()) {
        if (recursivo || /\.json$/i.test(nombre)) lista.push(rel);
      }
    }
    return lista;
  }

  async function copiarSiCambio(desde, hacia) {
    const s = await fsp.stat(desde);
    let d = null;
    try {
      d = await fsp.stat(hacia);
    } catch {}
    if (d && d.size === s.size && Math.abs(d.mtimeMs - s.mtimeMs) < 5) return false;
    await fsp.mkdir(path.dirname(hacia), { recursive: true });
    const temporal = `${hacia}.copiando-${process.pid}.tmp`;
    try {
      await fsp.copyFile(desde, temporal);
      await fsp.utimes(temporal, s.atime, s.mtime);
      try {
        await fsp.rename(temporal, hacia);
      } catch {
        // Destino ocupado (por ejemplo, OneDrive subiéndolo): copia directa.
        await fsp.copyFile(desde, hacia);
        await fsp.utimes(hacia, s.atime, s.mtime);
      }
    } finally {
      await fsp.rm(temporal, { force: true }).catch(() => {});
    }
    return true;
  }

  const colaNube = crearCola((e) => {
    enNube.error = `No se pudo copiar a la nube: ${e?.message || e}`;
    avisar(`Nube: ${enNube.error}`);
  });

  async function copiarNube() {
    if (!carpetaNube) return;
    let copiados = 0;
    let revisados = 0;
    const fallas = [];
    try {
      await fsp.mkdir(carpetaNube, { recursive: true });
    } catch (e) {
      throw new Error(`no se pudo crear la carpeta ${carpetaNube} (${e.code || e.message})`);
    }
    for (const carpeta of carpetas) {
      const origen = path.join(raiz, carpeta);
      let archivos;
      try {
        archivos = await listar(origen, RECURSIVAS.has(carpeta));
      } catch (e) {
        fallas.push(`${carpeta}: ${e.code || e.message}`);
        continue;
      }
      for (const rel of archivos) {
        revisados++;
        try {
          if (await copiarSiCambio(path.join(origen, rel), path.join(carpetaNube, carpeta, rel))) copiados++;
        } catch (e) {
          fallas.push(`${carpeta}/${rel.split(path.sep).join('/')}: ${e.code || e.message}`);
        }
      }
    }
    enNube.ultimaCopia = { fecha: new Date().toISOString(), copiados, revisados, fallas: fallas.length };
    enNube.error = fallas.length
      ? `No se ${fallas.length === 1 ? 'pudo' : 'pudieron'} copiar ${fallas.length} ${fallas.length === 1 ? 'archivo' : 'archivos'} a la nube (${fallas[0]}).`
      : null;
    if (enNube.error) avisar(`Nube: ${enNube.error}`);
    else if (copiados) avisar(`Nube: ${copiados} ${copiados === 1 ? 'archivo copiado' : 'archivos copiados'} a ${carpetaNube}`);
  }

  // ---------- Arranque ----------
  const listo = usarGit
    ? prepararGit().finally(() => {
        git.preparando = false;
      })
    : Promise.resolve();
  // Los commits esperan a que termine la preparación (init y primer commit).
  colaGit.poner(() => listo);

  const demoraGit = crearDemora(() => colaGit.poner(guardarEnGit), t.git, t.gitMax);
  const demoraNube = crearDemora(() => colaNube.poner(copiarNube), t.nube, t.nubeMax);

  if (carpetaNube) avisar(`Nube: copia activada en ${carpetaNube}`);

  return {
    listo,
    // Avisar que se guardó algo (slug de la escena o nombre del dato). No espera ni tira errores.
    alGuardar(slug) {
      if (detenido) return;
      try {
        // Mientras se prepara git todavía no se sabe si está: se anota igual.
        if (usarGit && (git.preparando || git.disponible)) {
          pendientesGit.add(String(slug || '').slice(0, 64) || 'cambios');
          demoraGit.pedir();
        }
        if (carpetaNube) demoraNube.pedir();
      } catch (e) {
        avisar(`Historial: ${e.message}`);
      }
    },
    // Para la interfaz: { git: { disponible, ultimoCommit, error, ... }, nube: { carpeta, ultimaCopia, error, ... } }.
    estado() {
      return {
        git: {
          disponible: git.disponible,
          activo: git.activo,
          preparando: git.preparando,
          version: git.version,
          pendiente: demoraGit.pendiente() || pendientesGit.size > 0,
          ultimoCommit: git.ultimoCommit ? { ...git.ultimoCommit } : null,
          error: git.error,
        },
        nube: {
          carpeta: enNube.carpeta,
          activa: enNube.activa,
          pendiente: demoraNube.pendiente(),
          ultimaCopia: enNube.ultimaCopia ? { ...enNube.ultimaCopia } : null,
          error: enNube.error,
        },
      };
    },
    // Hace ya lo que estaba esperando (commit y copia) y espera a que termine lo que estaba en curso.
    async vaciar() {
      const tareas = [];
      if ((demoraGit.cancelar() || pendientesGit.size) && (git.disponible || git.preparando)) tareas.push(colaGit.poner(guardarEnGit));
      if (demoraNube.cancelar()) tareas.push(colaNube.poner(copiarNube));
      await Promise.all([...tareas, colaGit.vacia(), colaNube.vacia()]);
    },
    // Al cerrar el servidor: hace lo pendiente (con tope de `tope` ms) y deja de escuchar guardados.
    async detener({ vaciar = true, tope = 15_000 } = {}) {
      if (detenido) return;
      detenido = true;
      const tareas = [];
      const habiaGit = demoraGit.cancelar() || pendientesGit.size > 0;
      const habiaNube = demoraNube.cancelar();
      if (vaciar && habiaGit && (git.disponible || git.preparando)) tareas.push(colaGit.poner(guardarEnGit));
      if (vaciar && habiaNube) tareas.push(colaNube.poner(copiarNube));
      await Promise.race([Promise.all([...tareas, colaGit.vacia(), colaNube.vacia()]), esperar(tope)]);
    },
  };
}
