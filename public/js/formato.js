// Utilidades de texto y del archivo de escena.

import { TIPOS_DATOS as TIPOS } from './tipos-datos.js';
import { recentrar } from './geometria.js';

export const r3 = (n) => Math.round(n * 1000) / 1000;

export const nuevoId = () => 'o' + Math.random().toString(36).slice(2, 8);

export function slugificar(texto) {
  return (
    String(texto)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'escena'
  );
}

// Números en formato argentino: 1,25
export const fm = (n, dec = 2) =>
  Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export function leerNumero(texto) {
  const n = parseFloat(String(texto).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function enLinea(v) {
  if (Array.isArray(v)) return '[' + v.map(enLinea).join(', ') + ']';
  if (v && typeof v === 'object') {
    const claves = Object.keys(v).filter((k) => v[k] !== undefined);
    return claves.length ? '{ ' + claves.map((k) => JSON.stringify(k) + ': ' + enLinea(v[k])).join(', ') + ' }' : '{}';
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : 'null';
  return JSON.stringify(v ?? null);
}

// JSON legible: lo que entra en una línea queda en una línea (un objeto por renglón).
export function formatearJSON(v, sangria = '', extra = 0) {
  const linea = enLinea(v);
  if (v === null || typeof v !== 'object' || sangria.length + extra + linea.length <= 170) return linea;
  const sig = sangria + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return '[\n' + v.map((x) => sig + formatearJSON(x, sig)).join(',\n') + '\n' + sangria + ']';
  }
  const claves = Object.keys(v).filter((k) => v[k] !== undefined);
  return (
    '{\n' +
    claves
      .map((k) => {
        const pre = JSON.stringify(k) + ': ';
        return sig + pre + formatearJSON(v[k], sig, pre.length);
      })
      .join(',\n') +
    '\n' +
    sangria +
    '}'
  );
}

// Número de un archivo escrito a mano: acepta 3, "3" y "3,5". Si no se puede leer, null.
export function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) return leerNumero(v);
  return null;
}

// Punto [x, y] con números, o null si no se puede leer.
function punto(p) {
  if (!Array.isArray(p) || p.length < 2) return null;
  const x = numero(p[0]);
  const y = numero(p[1]);
  return x === null || y === null ? null : [x, y];
}

// Campos numéricos opcionales: se convierten si vienen como texto y se borran si no se pueden leer.
const OPCIONALES = ['elev', 'apertura', 'tronco', 'alero', 'tirante', 'ancho', 'calle', 'angulo', 'accesibles', 'modulo', 'potencia', 'peso', 'costo', 'capacidad', 'spl', 'dispersion', 'ganancia', 'limite', 'personas', 'tamano', 'fases', 'tension'];

// Colores: #rgb, #rrggbb (con o sin transparencia) o un nombre como "red". Lo demás se descarta, porque
// el color va directo a los atributos del plano en SVG.
const esColor = (c) => typeof c === 'string' && /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(c.trim());
function limpiarColor(obj, clave) {
  if (obj && obj[clave] !== undefined && !esColor(obj[clave])) delete obj[clave];
}

// Completa lo mínimo para poder dibujar, sin inventar datos que no estén. Corrige lo que vino escrito a
// mano como texto ("3,5") para que ninguna cuenta termine en NaN.
export function normalizarEscena(e) {
  e = e && typeof e === 'object' && !Array.isArray(e) ? e : {};
  e.nombre = e.nombre ? String(e.nombre) : 'Sin nombre';
  e.areas = Array.isArray(e.areas) ? e.areas.filter((a) => a && typeof a === 'object') : [];
  e.objetos = Array.isArray(e.objetos) ? e.objetos.filter((o) => o && typeof o === 'object') : [];
  e.areas.forEach((a, i) => {
    a.id = a.id ? String(a.id) : `area${i + 1}`;
    if (a.nombre !== undefined && a.nombre !== null) a.nombre = String(a.nombre);
    a.contorno = Array.isArray(a.contorno) ? a.contorno.map(punto).filter(Boolean) : [];
    if (a.nivel !== undefined) a.nivel = numero(a.nivel) ?? 0;
    limpiarColor(a, 'piso');
    if (a.paredes && typeof a.paredes === 'object') {
      const P = a.paredes;
      limpiarColor(P, 'color');
      if (Array.isArray(P.alto)) P.alto = P.alto.map((h) => Math.max(0, numero(h) ?? 0));
      else if (P.alto !== undefined) P.alto = Math.max(0, numero(P.alto) ?? 0);
      if (P.espesor !== undefined) P.espesor = Math.abs(numero(P.espesor) ?? 0.2) || 0.2;
      if (P.sin !== undefined) P.sin = (Array.isArray(P.sin) ? P.sin : [P.sin]).map(numero).filter((n) => n !== null);
    }
    a.aberturas = Array.isArray(a.aberturas) ? a.aberturas.filter((ab) => ab && typeof ab === 'object') : [];
    for (const ab of a.aberturas) {
      ab.pared = numero(ab.pared) ?? 0;
      for (const k of ['desde', 'ancho', 'alto', 'antepecho']) {
        if (ab[k] === undefined) continue;
        const n = numero(ab[k]);
        if (n === null) delete ab[k];
        else ab[k] = k === 'desde' ? Math.max(0, n) : Math.abs(n);
      }
    }
  });
  // Punto de partida del modo caminar.
  if (e.recorrido !== undefined) {
    const desde = punto(e.recorrido?.desde);
    const mira = punto(e.recorrido?.mira);
    if (desde) e.recorrido = mira ? { desde, mira } : { desde };
    else delete e.recorrido;
  }
  // Cotas fijas que se dibujan en el 3D y en el plano: { id, a: [x, y], b: [x, y], desplazo }
  e.cotas = (Array.isArray(e.cotas) ? e.cotas : []).filter((c) => {
    const a = punto(c?.a);
    const b = punto(c?.b);
    if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) return false;
    c.a = a;
    c.b = b;
    if (c.desplazo !== undefined) c.desplazo = numero(c.desplazo) ?? undefined;
    c.id = c.id || nuevoId();
    return true;
  });
  const ids = new Set();
  for (const o of e.objetos) {
    o.id = o.id === undefined || o.id === null || o.id === '' ? '' : String(o.id);
    if (!o.id || ids.has(o.id)) o.id = nuevoId();
    ids.add(o.id);
    o.tipo = o.tipo ? String(o.tipo) : 'caja';
    if (o.nombre !== undefined && o.nombre !== null) o.nombre = String(o.nombre);
    limpiarColor(o, 'color');
    limpiarColor(o, 'luz');
    const def = TIPOS[o.tipo];
    o.pos = punto(o.pos) || [0, 0];
    const base = def?.dims || [1, 1, 1];
    // Ancho y profundidad positivos (una medida en cero o negativa vuelve a la típica del tipo); el alto
    // puede ser 0 (zonas, carteles).
    o.dims = [0, 1, 2].map((i) => {
      const n = numero(o.dims?.[i]);
      if (n === null) return base[i];
      const v = Math.abs(n);
      return i < 2 && v < 0.01 ? base[i] || 0.01 : v;
    });
    o.rot = numero(o.rot) ?? 0;
    // Sin "elev" el objeto está apoyado en el piso. La altura típica del tipo solo se usa al agregarlo.
    for (const k of OPCIONALES) {
      if (o[k] === undefined) continue;
      const n = numero(o[k]);
      if (n === null) delete o[k];
      else o[k] = n;
    }
    if (o.apunta !== undefined) {
      const ap = Array.isArray(o.apunta) ? o.apunta.slice(0, 3).map(numero) : [];
      if (ap.length >= 2 && ap.every((n) => n !== null)) o.apunta = ap;
      else delete o.apunta;
    }
    // Forma libre: zonas y estacionamientos necesitan 3 puntos o más; caminos y vallados, 2 o más.
    if (o.puntos !== undefined) {
      const pts = Array.isArray(o.puntos) ? o.puntos.map(punto).filter(Boolean) : [];
      const minimo = def?.forma === 'linea' ? 2 : 3;
      if (pts.length >= minimo) {
        o.puntos = pts;
        recentrar(o);
      } else delete o.puntos;
    }
    if (o.cochera !== undefined) {
      const c = Array.isArray(o.cochera) ? o.cochera.slice(0, 2).map(numero) : [];
      if (c.length === 2 && c.every((n) => n !== null && n > 0.3)) o.cochera = c;
      else delete o.cochera;
    }
    for (const k of ['texto', 'turno', 'formato', 'proveedor', 'ref', 'nota', 'rol', 'uso', 'vehiculo', 'flecha', 'capa', 'grupo', 'tablero', 'alimenta', 'colgadoDe', 'costoTipo']) {
      if (o[k] === undefined) continue;
      // colgadoDe: false quiere decir "no cuelga de nada" (no deducirlo): se respeta.
      if (k === 'colgadoDe' && o[k] === false) continue;
      if (o[k] === null || typeof o[k] === 'object') delete o[k];
      else o[k] = String(o[k]);
    }
    if (!o.nombre) o.nombre = def?.nombre || o.tipo || 'Objeto';
  }
  normalizarDatosEscena(e);
  return e;
}

// Campos de la escena que agregan las herramientas del predio, producción y planos (ver docs/esquema-v2.md).
function normalizarDatosEscena(e) {
  // Ubicación real: un punto de la escena con sus coordenadas y hacia dónde está el norte.
  if (e.geo !== undefined) {
    const g = e.geo || {};
    const lat = numero(g.lat);
    const lng = numero(g.lng);
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      e.geo = { lat, lng, x: numero(g.x) ?? 0, y: numero(g.y) ?? 0, norte: ((numero(g.norte) ?? 0) % 360 + 360) % 360 };
      // desdeFondo: la ubicación salió de calibrar el fondo, así que se mueve con la imagen.
      if (g.desdeFondo === true) e.geo.desdeFondo = true;
    } else delete e.geo;
  }
  // Imagen aérea de fondo (captura de Google Maps o Google Earth) guardada en fotos/<escena>/.
  if (e.fondo !== undefined) {
    const f = e.fondo || {};
    const archivo = typeof f.archivo === 'string' ? f.archivo.split(/[\\/]/).pop() : '';
    const ancho = numero(f.ancho);
    const esImagen = /\.(png|jpe?g|webp|gif)$/i.test(archivo);
    if (archivo && esImagen && ancho && ancho > 0) {
      const opacidad = (v, def) => Math.min(1, Math.max(0.05, numero(v) ?? def));
      e.fondo = {
        archivo,
        pos: punto(f.pos) || [0, 0],
        ancho,
        proporcion: numero(f.proporcion) > 0 ? numero(f.proporcion) : 0.75,
        rot: numero(f.rot) ?? 0,
        opacidad: opacidad(f.opacidad, 0.9),
        opacidadPlano: opacidad(f.opacidadPlano, 0.55),
        oculto: f.oculto === true,
        enPlano: f.enPlano !== false,
        ...(typeof f.fuente === 'string' ? { fuente: f.fuente } : {}),
        ...(typeof f.calibrado === 'string' ? { calibrado: f.calibrado } : {}),
      };
    } else delete e.fondo;
  }
  if (e.terreno !== undefined) {
    const pts = Array.isArray(e.terreno?.puntos) ? e.terreno.puntos.map((p) => (Array.isArray(p) && p.length >= 3 ? [numero(p[0]), numero(p[1]), numero(p[2])] : null)).filter((p) => p && p.every((n) => n !== null)) : [];
    if (pts.length) e.terreno = { ...e.terreno, puntos: pts };
    else delete e.terreno;
  }
  // Listas de producción: solo objetos con id.
  for (const k of ['proveedores', 'capas', 'revisiones', 'vistas', 'fotosMapa']) {
    if (e[k] === undefined) continue;
    if (!Array.isArray(e[k])) {
      delete e[k];
      continue;
    }
    e[k] = e[k].filter((x) => x && typeof x === 'object');
    if (k !== 'revisiones') for (const x of e[k]) if (!x.id && k !== 'fotosMapa') x.id = nuevoId();
  }
  if (e.cronograma !== undefined) {
    const tareas = Array.isArray(e.cronograma?.tareas) ? e.cronograma.tareas.filter((t) => t && typeof t === 'object') : [];
    for (const t of tareas) {
      if (!t.id) t.id = nuevoId();
      if (!Array.isArray(t.ids)) t.ids = [];
    }
    e.cronograma = { ...(e.cronograma || {}), tareas };
  }
  if (e.presupuesto !== undefined) {
    const p = e.presupuesto && typeof e.presupuesto === 'object' ? e.presupuesto : {};
    const extras = Array.isArray(p.extras) ? p.extras.filter((x) => x && typeof x === 'object') : [];
    for (const x of extras) {
      if (!x.id) x.id = nuevoId();
      x.monto = numero(x.monto) ?? 0;
    }
    e.presupuesto = { ...p, extras };
  }
  if (e.proyecto && typeof e.proyecto === 'object' && e.proyecto.aforo !== undefined) {
    // Aforo entero: "1.500" es mil quinientos, no 1,5.
    const crudo = e.proyecto.aforo;
    const n = typeof crudo === 'string' ? numero(crudo.replace(/[.\s]/g, '')) : numero(crudo);
    if (n && n > 0) e.proyecto.aforo = Math.round(n);
    else delete e.proyecto.aforo;
  }
}

export function escenaVacia(nombre) {
  return {
    nombre,
    notas: '',
    densidad: [2, 3],
    areas: [
      {
        id: 'salon',
        nombre: 'Salón',
        contorno: [[0, 0], [10, 0], [10, 8], [0, 8]],
        paredes: { alto: 3, espesor: 0.2 },
        aberturas: [],
      },
    ],
    objetos: [{ id: nuevoId(), tipo: 'persona', nombre: 'Persona', pos: [5, 4], rot: 0, dims: [0.5, 0.3, 1.75] }],
  };
}
