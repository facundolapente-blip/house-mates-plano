// Mapa para el público: una pieza con la identidad de House Mates (no un plano técnico) para subir a
// Instagram o imprimir en el lugar, con lo que la gente busca: escenario, barras, baños, agua, salidas,
// primeros auxilios, punto de encuentro, estacionamiento, zonas y caminos.
//
// Todo se arma en una grilla de 1080 de ancho (la medida de Instagram). El afiche usa la misma grilla
// escalada a milímetros, así que se ve igual en todos los formatos. No usa el motor 3D: anda en Node.

import { TIPOS_DATOS } from './tipos-datos.js';
import { esquinas, puntosMundo, esPoligono, cajaDe, areaFirmada, puntoEnPoligono } from './geometria.js';
import { plazasEstacionamiento, lineaLocal, moduloVallado } from './predio.js';
import { tieneGeo, escenaAGeo, enlaceComoLlegar } from './geo.js';
import { rutaIcono } from './iconos.js';
import { esc } from './formato.js';
import { qrSVG as qrDeLaApp } from './qr.js';

export const FORMATOS = {
  historia: { nombre: 'Historia de Instagram', ancho: 1080, alto: 1920, unidad: 'px' },
  posteo: { nombre: 'Posteo', ancho: 1080, alto: 1350, unidad: 'px' },
  cuadrado: { nombre: 'Cuadrado', ancho: 1080, alto: 1080, unidad: 'px' },
  afiche: { nombre: 'Afiche A3', ancho: 297, alto: 420, unidad: 'mm' },
};

// Márgenes en la grilla de 1080 y tamaño relativo de la letra. En las historias, Instagram tapa unos
// 250 px arriba (nombre de la cuenta) y abajo (respuesta): ahí no va nada importante.
const DISENO = {
  historia: { arriba: 268, abajo: 262, lados: 64, t: 1 },
  posteo: { arriba: 76, abajo: 64, lados: 72, t: 0.92 },
  cuadrado: { arriba: 58, abajo: 50, lados: 60, t: 0.84 },
  afiche: { arriba: 84, abajo: 72, lados: 80, t: 1 },
};

export const COLORES_MARCA = {
  negro: '#0A0A0A',
  blanco: '#FAFAFA',
  azul: '#2447F5',
  violeta: '#8A4FFF',
  calido: '#E8AA4C',
  verde: '#2FBF71',
  rojo: '#FF3B30',
};

const FUENTE = 'General Sans, Helvetica, Arial, sans-serif';

const TEMAS = {
  oscuro: {
    fondo: '#0A0A0A', tarjeta: '#121212', borde: '#262626', area: '#1A1A1A', areaTecho: '#222222', pared: '#4A4A4A',
    texto: '#FAFAFA', suave: '#9A9A9A', contexto: '#FFFFFF', opContexto: 0.055, opHuella: 0.6, opZona: 0.16,
    opCamino: 0.28, brillo: 0.3, neutro: '#FAFAFA', neutroIcono: '#0A0A0A', insignia: '#FAFAFA', insigniaTexto: '#0A0A0A',
    lineas: { azul: '#7088FF', violeta: '#B08CFF', calido: '#E8AA4C', verde: '#2FBF71', neutro: '#9A9A9A' },
  },
  claro: {
    fondo: '#FAFAFA', tarjeta: '#FFFFFF', borde: '#E4E4E4', area: '#F0F0EE', areaTecho: '#E6E6E4', pared: '#B4B4B4',
    texto: '#0A0A0A', suave: '#666666', contexto: '#0A0A0A', opContexto: 0.06, opHuella: 0.45, opZona: 0.11,
    opCamino: 0.2, brillo: 0.12, neutro: '#0A0A0A', neutroIcono: '#FAFAFA', insignia: '#0A0A0A', insigniaTexto: '#FAFAFA',
    lineas: { azul: '#2447F5', violeta: '#7A3FF0', calido: '#B97D1F', verde: '#1D8A55', neutro: '#666666' },
  },
};

// Qué busca la gente en el mapa. "color" es una clave de la paleta (los pines usan la marca tal cual);
// "contar" agrega "×8" cuando se juntan varios iguales; "porNombre" junta solo los que se llaman igual.
export const CATEGORIAS_MAPA = {
  escenario: { nombre: 'Escenarios', uno: 'Escenario', icono: 'cabina_dj', color: 'violeta', prioridad: 100, grande: true },
  salida: { nombre: 'Salidas', uno: 'Salida', icono: 'salida', color: 'verde', prioridad: 96, porNombre: true },
  primeros_auxilios: { nombre: 'Primeros auxilios', uno: 'Primeros auxilios', icono: 'cruz', color: 'cruz', prioridad: 94 },
  punto_encuentro: { nombre: 'Puntos de encuentro', uno: 'Punto de encuentro', icono: 'punto_encuentro', color: 'verde', prioridad: 92 },
  barra: { nombre: 'Barras', uno: 'Barra', icono: 'barra', color: 'calido', prioridad: 90, contar: true },
  banos: { nombre: 'Baños', uno: 'Baño', icono: 'bano_quimico', color: 'azul', prioridad: 88, contar: true },
  agua: { nombre: 'Agua', uno: 'Agua', icono: 'agua', color: 'azul', prioridad: 86, contar: true },
  estacionamiento: { nombre: 'Estacionamiento', uno: 'Estacionamiento', icono: 'P', color: 'azul', prioridad: 84 },
  acceso: { nombre: 'Accesos', uno: 'Acceso', icono: 'acceso', color: 'neutro', prioridad: 82, porNombre: true },
  foodtruck: { nombre: 'Comida', uno: 'Comida', icono: 'foodtruck', color: 'calido', prioridad: 80, contar: true },
  boleteria: { nombre: 'Boletería', uno: 'Boletería', icono: 'boleteria', color: 'neutro', prioridad: 74 },
  control_acceso: { nombre: 'Control de acceso', uno: 'Control de acceso', icono: 'control_acceso', color: 'neutro', prioridad: 72 },
  guardarropa: { nombre: 'Guardarropa', uno: 'Guardarropa', icono: 'guardarropa', color: 'neutro', prioridad: 70 },
  info: { nombre: 'Información', uno: 'Información', icono: 'info', color: 'neutro', prioridad: 68 },
  carga_celulares: { nombre: 'Carga de celulares', uno: 'Carga de celulares', icono: 'carga_celulares', color: 'neutro', prioridad: 64 },
  otro: { nombre: '', uno: '', icono: 'marcador', color: 'neutro', prioridad: 40, porNombre: true },
};

const CATEGORIA_DE_TIPO = {
  barra: 'barra',
  bano_quimico: 'banos',
  agua: 'agua',
  primeros_auxilios: 'primeros_auxilios',
  punto_encuentro: 'punto_encuentro',
  guardarropa: 'guardarropa',
  info: 'info',
  carga_celulares: 'carga_celulares',
  boleteria: 'boleteria',
  control_acceso: 'control_acceso',
  foodtruck: 'foodtruck',
};

// Zonas: las que se rotulan y con qué color. Las de trabajo no salen en el mapa del público.
const USOS_ZONA = {
  pista: { nombre: 'Pista', color: 'violeta' },
  vip: { nombre: 'VIP', color: 'calido' },
  fumadores: { nombre: 'Fumadores', color: 'neutro' },
  barra: { nombre: '', color: 'calido' },
  general: { nombre: '', color: 'neutro' },
};
const ZONAS_OCULTAS = new Set(['backstage', 'staff', 'descarga']);
const CAMINOS_OCULTOS = new Set(['proveedores', 'staff']);

// Íconos que no están en iconos.js (grilla de 24, mismo trazo).
const ICONOS_PROPIOS = {
  salida: 'M11 4H5v16h6M9 12h11M16 8l4 4-4 4',
  casa: 'M3 11 12 3.5l9 7.5v9.5H3z',
};
const trazoIcono = (n) => ICONOS_PROPIOS[n] || rutaIcono(n) || rutaIcono('marcador');

/* ------------------------------------------------------------------ medidas de texto */

// Ancho de cada letra de General Sans (centésimas de la altura de la letra), medido sobre los woff2 de
// public/vendor/fuentes. Sirve para que los rótulos no se pisen sin tener que dibujarlos.
const LETRAS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;()-/\'!?&+%#"·×–¿¡°';
const ANCHOS = {
  400: '53605460563558572222512291575860603552385649765049486962776857528072245862528973806080646460686692646260583151575654544959542126262626303036482625446166996639266650442547',
  600: '55625762584061592626582692596062624155425954805754537365797360578076306268579376806580686664737097726764613656586057585159582126262626323236502629526966996645266650522948',
  700: '56645964594262602828622893606164644456446057826157557566797562598078336571599578806880716766767299757066633858586158595359592126262626323236522630567366996647266650563048',
};
const TABLAS = {};
for (const [peso, cifras] of Object.entries(ANCHOS)) {
  const m = new Map();
  [...LETRAS].forEach((c, i) => m.set(c, Number(cifras.slice(i * 2, i * 2 + 2)) / 100));
  TABLAS[peso] = m;
}

// Ancho aproximado (un poco de más, a propósito) de un texto de alto t con espaciado ls entre letras.
export function anchoTexto(s, t, peso = 400, ls = 0) {
  const tabla = TABLAS[peso >= 650 ? 700 : peso >= 500 ? 600 : 400];
  const letras = [...String(s ?? '')];
  let a = 0;
  for (const c of letras) {
    let w = tabla.get(c);
    if (w === undefined) w = tabla.get(c.normalize('NFD')[0]) ?? 0.64;
    a += w;
  }
  const n = letras.length;
  return Math.max(a * 1.04, 0.56 * n) * t + (ls > 0 ? n * ls : Math.max(0, n - 1) * ls);
}

function envolver(s, t, peso, ancho, ls = 0) {
  const palabras = String(s ?? '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (actual && anchoTexto(prueba, t, peso, ls) > ancho) {
      lineas.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function recortar(s, t, peso, ancho, ls = 0) {
  let r = String(s ?? '');
  if (anchoTexto(r, t, peso, ls) <= ancho) return r;
  while (r.length > 1 && anchoTexto(r + '…', t, peso, ls) > ancho) r = r.slice(0, -1);
  return r.trimEnd() + '…';
}

// Hasta "max" líneas: achica la letra hasta que entre (sin bajar de "min") y si igual no entra, corta.
function bloqueTexto(s, t, peso, ancho, max, min, ls = 0) {
  let tam = t;
  const lsDe = (x) => (ls * x) / t;
  let lineas = envolver(s, tam, peso, ancho, lsDe(tam));
  while (tam > min && (lineas.length > max || lineas.some((l) => anchoTexto(l, tam, peso, lsDe(tam)) > ancho))) {
    tam = Math.max(min, tam * 0.93);
    lineas = envolver(s, tam, peso, ancho, lsDe(tam));
  }
  if (lineas.length > max) lineas = [...lineas.slice(0, max - 1), lineas.slice(max - 1).join(' ')];
  lineas = lineas.map((l) => recortar(l, tam, peso, ancho, lsDe(tam)));
  return { lineas, t: tam, ls: lsDe(tam) };
}

/* ------------------------------------------------------------------ utilidades */

const n1 = (v) => Math.round(v * 10) / 10;
const pts = (lista) => lista.map(([x, y]) => `${n1(x)},${n1(y)}`).join(' ');
const finito = (v) => typeof v === 'number' && Number.isFinite(v);
const esPunto = (p) => Array.isArray(p) && finito(Number(p[0])) && finito(Number(p[1]));
const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Copia del objeto con números seguros (la escena puede venir sin normalizar).
function limpio(o) {
  if (!o || typeof o !== 'object' || !esPunto(o.pos)) return null;
  const base = TIPOS_DATOS[o.tipo]?.dims || [1, 1, 1];
  const dims = [0, 1, 2].map((i) => {
    const v = Math.abs(Number(o.dims?.[i]));
    return finito(v) && (i === 2 || v >= 0.01) ? v : base[i];
  });
  const puntos = Array.isArray(o.puntos) ? o.puntos.filter(esPunto).map(([x, y]) => [Number(x), Number(y)]) : undefined;
  return { ...o, pos: [Number(o.pos[0]), Number(o.pos[1])], dims, rot: Number(o.rot) || 0, puntos };
}

// Nombre que puso la persona, si no es el del tipo ("Barra", "Baño químico 3", "Zona 2" no cuentan).
function nombrePropio(o, extras = []) {
  const n = String(o.nombre ?? '').trim();
  if (!n) return '';
  const genericos = [TIPOS_DATOS[o.tipo]?.nombre, ...extras].filter(Boolean).map(normalizar);
  const nn = normalizar(n).replace(/\s*\d+$/, '').trim();
  return !nn || genericos.includes(nn) ? '' : n;
}

function centroInterior(P) {
  const n = P.length;
  const A = areaFirmada(P);
  let cx = 0;
  let cy = 0;
  if (Math.abs(A) > 1e-9) {
    for (let i = 0; i < n; i++) {
      const [x1, y1] = P[i];
      const [x2, y2] = P[(i + 1) % n];
      const f = x1 * y2 - x2 * y1;
      cx += (x1 + x2) * f;
      cy += (y1 + y2) * f;
    }
    cx /= 6 * A;
    cy /= 6 * A;
  } else {
    for (const [x, y] of P) {
      cx += x / n;
      cy += y / n;
    }
  }
  if (n < 3 || puntoEnPoligono(cx, cy, P)) return [cx, cy];
  // Forma en L o en U: el punto de adentro más cercano al centro.
  const b = cajaDe(P);
  let mejor = null;
  let dm = Infinity;
  for (let i = 1; i < 16; i++) {
    for (let j = 1; j < 16; j++) {
      const x = b.minX + ((b.maxX - b.minX) * i) / 16;
      const y = b.minY + ((b.maxY - b.minY) * j) / 16;
      const d = Math.hypot(x - cx, y - cy);
      if (d < dm && puntoEnPoligono(x, y, P)) {
        dm = d;
        mejor = [x, y];
      }
    }
  }
  return mejor || [cx, cy];
}

const separacion = (A, B) =>
  Math.hypot(Math.max(0, A.minX - B.maxX, B.minX - A.maxX), Math.max(0, A.minY - B.maxY, B.minY - A.maxY));

function unirPorCercania(lista, cerca) {
  const padre = lista.map((_, i) => i);
  const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) if (cerca(lista[i], lista[j])) padre[raiz(i)] = raiz(j);
  }
  const grupos = new Map();
  lista.forEach((x, i) => {
    const r = raiz(i);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(x);
  });
  return [...grupos.values()];
}

function reglasOcultar(lista) {
  const r = { tipo: new Set(), id: new Set(), camino: new Set(), zona: new Set(), categoria: new Set(), area: new Set() };
  for (const s of Array.isArray(lista) ? lista : []) {
    const [clave, ...resto] = String(s ?? '').split(':');
    const valor = resto.join(':').trim();
    if (r[clave.trim()] && valor) r[clave.trim()].add(valor);
  }
  return r;
}

const altoDePared = (P, i) => {
  if (!P || (Array.isArray(P.sin) && P.sin.map(Number).includes(i))) return 0;
  return Array.isArray(P.alto) ? Number(P.alto[i]) || 0 : Number(P.alto) || 0;
};

function usoDeZona(o) {
  if (o.uso) return String(o.uso);
  const n = normalizar(o.nombre);
  if (/\bpista\b/.test(n)) return 'pista';
  if (/fumador/.test(n)) return 'fumadores';
  if (/\bvip\b/.test(n)) return 'vip';
  if (/backstage|camarin/.test(n)) return 'backstage';
  if (/\bstaff\b|produccion/.test(n)) return 'staff';
  if (/descarga/.test(n)) return 'descarga';
  if (/estacionamiento|parking/.test(n)) return 'estacionamiento';
  return 'general';
}

/* ------------------------------------------------------------------ qué sale en el mapa */

function nuevoPin(categoria, datos) {
  const c = CATEGORIAS_MAPA[categoria] || CATEGORIAS_MAPA.otro;
  return {
    clase: 'pin',
    categoria,
    nombre: '',
    icono: c.icono,
    color: c.color,
    prioridad: c.prioridad,
    cantidad: 1,
    ids: [],
    huellas: [],
    agrupable: true,
    ...datos,
  };
}

function pinDeObjeto(o, categoria) {
  const c = CATEGORIAS_MAPA[categoria];
  const propio = categoria === 'otro' ? String(o.nombre || TIPOS_DATOS[o.tipo]?.nombre || o.tipo || '') : nombrePropio(o, [c.uno, c.nombre]);
  return nuevoPin(categoria, {
    nombre: propio,
    propio: Boolean(propio),
    icono: categoria === 'otro' ? (rutaIcono(o.tipo) ? o.tipo : 'marcador') : c.icono,
    pos: [...o.pos],
    ids: [o.id],
    tipos: [o.tipo],
    huellas: [esquinas(o)],
  });
}

const cajasDePin = (p) => (p.huellas.length ? p.huellas.map(cajaDe) : [cajaDe([p.pos])]);
const separacionPines = (a, b) => Math.min(...cajasDePin(a).flatMap((A) => cajasDePin(b).map((B) => separacion(A, B))));

// Todo lo que va al mapa, sin juntar los pines todavía.
function reunir(escena, ocultarExtra) {
  const e = escena && typeof escena === 'object' ? escena : {};
  const guardado = Array.isArray(e.mapaPublico?.ocultar) ? e.mapaPublico.ocultar : [];
  const reglas = reglasOcultar([...guardado, ...(Array.isArray(ocultarExtra) ? ocultarExtra : [])]);
  const formas = [];
  const pines = [];
  const textos = [];

  for (const a of Array.isArray(e.areas) ? e.areas : []) {
    if (!a || reglas.area.has(String(a.id))) continue;
    const cont = (Array.isArray(a.contorno) ? a.contorno : []).filter(esPunto).map(([x, y]) => [Number(x), Number(y)]);
    if (cont.length < 3) continue;
    const P = a.paredes && typeof a.paredes === 'object' ? a.paredes : null;
    const paredes = cont.map((p, i) => (altoDePared(P, i) > 0 ? [p, cont[(i + 1) % cont.length]] : null)).filter(Boolean);
    formas.push({
      clase: 'area',
      id: a.id,
      categoria: 'area',
      nombre: a.nombre ? String(a.nombre) : '',
      icono: null,
      pos: centroInterior(cont),
      forma: cont,
      techo: a.techo !== false && paredes.length > 0,
      paredes,
    });
    // Puertas marcadas como salida y entradas con nombre.
    for (const ab of Array.isArray(a.aberturas) ? a.aberturas : []) {
      if (!ab || ab.tipo === 'ventana') continue;
      const nombre = String(ab.nombre ?? '').trim();
      const salida = ab.salida === true;
      if (!salida && !/entrada|acceso|ingreso/i.test(nombre)) continue;
      const i = Number(ab.pared) || 0;
      const A = cont[i % cont.length];
      const B = cont[(i + 1) % cont.length];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (!(L > 0)) continue;
      const d = Math.min(L, Math.max(0, Number(ab.desde) || 0) + (Number(ab.ancho) || 1) / 2);
      const pos = [A[0] + ((B[0] - A[0]) * d) / L, A[1] + ((B[1] - A[1]) * d) / L];
      const cat = salida ? 'salida' : 'acceso';
      if (reglas.categoria.has(cat)) continue;
      pines.push(nuevoPin(cat, { nombre, propio: Boolean(nombre), pos, ids: [`${a.id}:${i}`], tipos: ['abertura'] }));
    }
  }

  const objetos = (Array.isArray(e.objetos) ? e.objetos : [])
    .map(limpio)
    .filter((o) => o && o.mapa !== false && !reglas.tipo.has(o.tipo) && !reglas.id.has(String(o.id)));
  const djs = [];
  const estructuras = [];
  const sonido = objetos.filter((o) => o.tipo === 'parlante' || o.tipo === 'sub');

  for (const o of objetos) {
    const forzado = o.mapa === true;
    switch (o.tipo) {
      case 'cabina_dj':
        djs.push(o);
        break;
      case 'casita':
      case 'tarima':
      case 'carpa':
        estructuras.push(o);
        break;
      case 'zona': {
        const uso = usoDeZona(o);
        if (reglas.zona.has(uso) || (ZONAS_OCULTAS.has(uso) && !forzado)) break;
        const forma = esPoligono(o) ? puntosMundo(o) : esquinas(o);
        if (uso === 'estacionamiento') {
          estacionamiento(o, forma);
          break;
        }
        const def = USOS_ZONA[uso] || USOS_ZONA.general;
        const propio = nombrePropio(o, ['zona', def.nombre]);
        formas.push({ clase: 'zona', id: o.id, categoria: 'zona', uso, nombre: propio || def.nombre, icono: null, color: def.color, pos: centroInterior(forma), forma });
        break;
      }
      case 'estacionamiento':
        estacionamiento(o, esPoligono(o) ? puntosMundo(o) : esquinas(o));
        break;
      case 'camino': {
        const uso = o.uso ? String(o.uso) : 'publico';
        if (reglas.camino.has(uso) || (CAMINOS_OCULTOS.has(uso) && !forzado)) break;
        const linea = puntosMundo({ ...o, puntos: lineaLocal(o) });
        const ancho = Number(o.ancho) > 0 ? Number(o.ancho) : 3;
        formas.push({ clase: 'camino', id: o.id, categoria: 'camino', uso, nombre: nombrePropio(o) || '', icono: 'camino', color: uso === 'emergencia' ? 'verde' : 'azul', pos: linea[Math.floor(linea.length / 2)], linea, ancho });
        break;
      }
      case 'vallado': {
        const linea = puntosMundo({ ...o, puntos: lineaLocal(o) });
        formas.push({ clase: 'vallado', id: o.id, categoria: 'vallado', nombre: '', icono: 'vallado', pos: linea[0], linea, modulo: moduloVallado(o) });
        break;
      }
      case 'acceso': {
        const cat = o.salida === false ? 'acceso' : 'salida';
        if (reglas.categoria.has(cat)) break;
        const p = pinDeObjeto(o, cat);
        p.nombre = nombrePropio(o, ['acceso', 'salida', 'porton', 'acceso o porton']);
        p.propio = Boolean(p.nombre);
        pines.push(p);
        break;
      }
      case 'arbol':
        formas.push({ clase: 'contexto', id: o.id, categoria: 'arbol', nombre: '', icono: 'arbol', pos: o.pos, radio: (o.dims[0] + o.dims[1]) / 4 });
        break;
      case 'hilera': {
        const t = (o.rot * Math.PI) / 180;
        const dx = (Math.cos(t) * o.dims[0]) / 2;
        const dy = (Math.sin(t) * o.dims[0]) / 2;
        formas.push({ clase: 'contexto', id: o.id, categoria: 'hilera', nombre: '', icono: 'hilera', pos: o.pos, linea: [[o.pos[0] - dx, o.pos[1] - dy], [o.pos[0] + dx, o.pos[1] + dy]], ancho: o.dims[1] });
        break;
      }
      case 'etiqueta':
      case 'texto': {
        const texto = String((o.tipo === 'texto' && o.texto) || o.nombre || '').trim();
        if (texto && (o.tipo === 'etiqueta' || forzado)) textos.push({ clase: 'texto', id: o.id, categoria: 'texto', nombre: texto, icono: null, pos: o.pos });
        break;
      }
      case 'persona':
        break;
      default: {
        const cat = CATEGORIA_DE_TIPO[o.tipo] || ((forzado || TIPOS_DATOS[o.tipo]?.publico) && 'otro');
        if (cat && !reglas.categoria.has(cat)) pines.push(pinDeObjeto(o, cat));
      }
    }
  }

  function estacionamiento(o, forma) {
    if (reglas.categoria.has('estacionamiento')) return;
    let plazas = 0;
    try {
      plazas = plazasEstacionamiento(o).cantidad;
    } catch {
      plazas = 0;
    }
    formas.push({ clase: 'estacionamiento', id: o.id, categoria: 'estacionamiento', nombre: '', icono: 'estacionamiento', pos: centroInterior(forma), forma, plazas });
    const propio = nombrePropio(o, ['estacionamiento', 'parking']);
    pines.push(
      nuevoPin('estacionamiento', {
        nombre: propio,
        propio: Boolean(propio),
        sub: plazas > 0 ? `${plazas} ${plazas === 1 ? 'lugar' : 'lugares'}` : '',
        pos: centroInterior(forma),
        ids: [o.id],
        tipos: [o.tipo],
        plazas,
        agrupable: false,
      }),
    );
  }

  // Escenario: cabinas cerca entre sí, más la estructura y la tarima que las rodean. Si no hay cabina
  // cargada, una estructura con al menos dos parlantes o subs al lado también es un escenario.
  const escenarios = [];
  if (!reglas.categoria.has('escenario')) {
    for (const grupo of unirPorCercania(djs, (a, b) => separacion(cajaDe(esquinas(a)), cajaDe(esquinas(b))) <= 8)) {
      escenarios.push(nuevoPin('escenario', { pos: promedio(grupo.map((o) => o.pos)), ids: grupo.map((o) => o.id), tipos: grupo.map((o) => o.tipo), huellas: grupo.map(esquinas), agrupable: false, miembros: grupo }));
    }
  }
  const sueltas = [];
  for (const s of estructuras) {
    const caja = cajaDe(esquinas(s));
    const cerca = (lista, max) => {
      let mejor = null;
      let dm = Infinity;
      for (const p of lista) {
        const d = Math.min(...cajasDePin(p).map((B) => separacion(caja, B)));
        if (d <= max && d < dm) {
          dm = d;
          mejor = p;
        }
      }
      return mejor;
    };
    const destino = cerca(escenarios, 2.5) || cerca(pines.filter((p) => p.huellas.length), 1.5);
    if (destino) {
      destino.huellas.push(esquinas(s));
      destino.ids.push(s.id);
      if (destino.miembros) destino.miembros.push(s);
    } else sueltas.push(s);
  }
  for (const s of sueltas) {
    const caja = cajaDe(esquinas(s));
    const parlantes = sonido.filter((p) => separacion(caja, cajaDe(esquinas(p))) <= 5).length;
    if (s.tipo !== 'carpa' && parlantes >= 2 && !reglas.categoria.has('escenario')) {
      escenarios.push(nuevoPin('escenario', { pos: [...s.pos], ids: [s.id], tipos: [s.tipo], huellas: [esquinas(s)], agrupable: false, miembros: [s] }));
    } else if (s.mapa === true || (s.tipo === 'casita' && nombrePropio(s))) {
      if (!reglas.categoria.has('otro')) pines.push(pinDeObjeto(s, 'otro'));
    }
  }
  escenarios.forEach((p, i) => {
    const propio = (p.miembros || []).map((o) => String(o.nombre || '')).find((n) => /\b(escenario|stage)\b/.test(normalizar(n)));
    p.nombre = propio || (escenarios.length > 1 ? `Escenario ${i + 1}` : '');
    p.propio = Boolean(p.nombre);
    delete p.miembros;
  });
  pines.unshift(...escenarios);

  // Carteles del piso que repiten lo que ya dice un pin ("BARRA" al lado de la barra) no se repiten.
  const sinRepetir = textos.filter((tx) => {
    const n = normalizar(tx.nombre);
    return !pines.some((p) => {
      const c = CATEGORIAS_MAPA[p.categoria] || CATEGORIAS_MAPA.otro;
      const nombres = [p.nombre, c.uno, c.nombre].map(normalizar).filter(Boolean);
      const cerca = Math.hypot(p.pos[0] - tx.pos[0], p.pos[1] - tx.pos[1]) <= 10;
      return cerca && nombres.some((x) => x === n || x.includes(n) || n.includes(x));
    });
  });
  return { formas, pines, textos: sinRepetir };
}

function promedio(lista) {
  const n = lista.length || 1;
  return [lista.reduce((s, p) => s + p[0], 0) / n, lista.reduce((s, p) => s + p[1], 0) / n];
}

// Junta servicios iguales que están cerca (por ejemplo, 8 baños químicos en fila → "Baños ×8").
function agrupar(pines, radio) {
  const fijos = pines.filter((p) => !p.agrupable);
  const porClave = new Map();
  for (const p of pines.filter((q) => q.agrupable)) {
    const c = CATEGORIAS_MAPA[p.categoria] || CATEGORIAS_MAPA.otro;
    const clave = p.categoria + (c.porNombre ? `|${p.icono}|${normalizar(p.nombre)}` : '');
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(p);
  }
  const juntos = [];
  for (const lista of porClave.values()) {
    for (const grupo of unirPorCercania(lista, (a, b) => separacionPines(a, b) <= radio)) {
      if (grupo.length === 1) {
        juntos.push(grupo[0]);
        continue;
      }
      const nombres = new Set(grupo.map((p) => p.nombre));
      const [primero] = grupo;
      juntos.push({
        ...primero,
        nombre: nombres.size === 1 ? primero.nombre : '',
        propio: nombres.size === 1 && primero.propio,
        pos: promedio(grupo.map((p) => p.pos)),
        cantidad: grupo.reduce((s, p) => s + (p.cantidad || 1), 0),
        ids: grupo.flatMap((p) => p.ids),
        tipos: [...new Set(grupo.flatMap((p) => p.tipos || []))],
        huellas: grupo.flatMap((p) => p.huellas),
      });
    }
  }
  return [...fijos, ...juntos].map((p) => ({ ...p, rotulo: rotuloDe(p) })).sort((a, b) => b.prioridad - a.prioridad);
}

function rotuloDe(p) {
  const c = CATEGORIAS_MAPA[p.categoria] || CATEGORIAS_MAPA.otro;
  if (p.propio && p.nombre) return p.cantidad > 1 && c.contar ? `${p.nombre} ×${p.cantidad}` : p.nombre;
  if (p.cantidad > 1) return c.contar ? `${c.nombre} ×${p.cantidad}` : c.uno || p.nombre;
  return c.uno || p.nombre;
}

function radioPorDefecto(reunido) {
  const puntos = [];
  for (const f of reunido.formas) puntos.push(...(f.forma || f.linea || [f.pos]));
  for (const p of reunido.pines) puntos.push(p.pos);
  if (!puntos.length) return 4;
  const b = cajaDe(puntos);
  return Math.min(25, Math.max(3.5, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 0.03));
}

// Lo que aparece en el mapa, en una sola lista. Cada elemento tiene clase ('area', 'zona',
// 'estacionamiento', 'camino', 'vallado', 'contexto', 'pin' o 'texto'), categoria, nombre, icono y pos
// ([x, y] en metros de la escena). Los pines traen además rotulo ("Baños ×8"), cantidad, ids, color
// (clave de la paleta) y huellas (los rectángulos de lo que representan). Las formas traen forma
// (polígono) o linea. opciones: { radio } en metros para juntar servicios iguales (por defecto, un 3 %
// del tamaño del lugar) y { ocultar } como en generarMapaPublico.
export function elementosDelMapa(escena, opciones = {}) {
  const r = reunir(escena, opciones?.ocultar);
  const radio = Number(opciones?.radio) > 0 ? Number(opciones.radio) : radioPorDefecto(r);
  return [...r.formas, ...agrupar(r.pines, radio).map(sinInternos), ...r.textos];
}

function sinInternos(p) {
  const { agrupable, propio, ...resto } = p;
  return resto;
}

/* ------------------------------------------------------------------ dibujo */

function colorPin(clave, T) {
  switch (clave) {
    case 'azul':
      return { fondo: COLORES_MARCA.azul, icono: '#FFFFFF' };
    case 'violeta':
      return { fondo: COLORES_MARCA.violeta, icono: '#FFFFFF' };
    case 'calido':
      return { fondo: COLORES_MARCA.calido, icono: COLORES_MARCA.negro };
    case 'verde':
      return { fondo: COLORES_MARCA.verde, icono: '#FFFFFF' };
    case 'cruz':
      return { fondo: '#FFFFFF', icono: COLORES_MARCA.rojo, borde: T === TEMAS.claro ? '#DADADA' : '' };
    default:
      return { fondo: T.neutro, icono: T.neutroIcono };
  }
}

const colorLinea = (clave, T) => T.lineas[clave] || T.lineas.neutro;

function icono(nombre, cx, cy, tam, color, grosor = 1.9) {
  const e = tam / 24;
  return `<path d="${trazoIcono(nombre)}" transform="translate(${n1(cx - tam / 2)} ${n1(cy - tam / 2)}) scale(${Math.round(e * 1000) / 1000})" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function txt(x, y, s, { t, peso = 400, color, ancla = 'start', ls = 0, halo = '', op = 1 }) {
  const extra =
    (ls ? ` letter-spacing="${n1(ls * 10) / 10}"` : '') +
    (ancla !== 'start' ? ` text-anchor="${ancla}"` : '') +
    (op < 1 ? ` opacity="${op}"` : '') +
    (halo ? ` stroke="${halo}" stroke-width="${n1(t * 0.24)}" stroke-linejoin="round" paint-order="stroke"` : '');
  return `<text x="${n1(x)}" y="${n1(y)}" font-family="${FUENTE}" font-size="${n1(t)}" font-weight="${peso}" fill="${color}"${extra}>${esc(s)}</text>`;
}

// Pin: círculo de color con el pictograma blanco adentro (cuadrado redondeado con una P para el
// estacionamiento, cruz roja sobre blanco para primeros auxilios) y la cantidad en una insignia.
function svgPin(p, x, y, r, T, conInsignia = true) {
  const col = colorPin(p.color, T);
  const anillo = r * 0.12;
  let s = '';
  if (p.icono === 'P') {
    const l = r * 1.8;
    s += `<rect x="${n1(x - l / 2 - anillo)}" y="${n1(y - l / 2 - anillo)}" width="${n1(l + 2 * anillo)}" height="${n1(l + 2 * anillo)}" rx="${n1(r * 0.5)}" fill="${T.tarjeta}"/>`;
    s += `<rect x="${n1(x - l / 2)}" y="${n1(y - l / 2)}" width="${n1(l)}" height="${n1(l)}" rx="${n1(r * 0.42)}" fill="${col.fondo}"/>`;
    s += txt(x, y + r * 0.42, 'P', { t: r * 1.2, peso: 700, color: col.icono, ancla: 'middle' });
    return s;
  }
  s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r + anillo)}" fill="${T.tarjeta}"/>`;
  s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${col.fondo}"${col.borde ? ` stroke="${col.borde}" stroke-width="${n1(r * 0.06)}"` : ''}/>`;
  if (p.icono === 'cruz') {
    const a = r * 1.04;
    const g = r * 0.36;
    s += `<rect x="${n1(x - g / 2)}" y="${n1(y - a / 2)}" width="${n1(g)}" height="${n1(a)}" rx="${n1(g * 0.18)}" fill="${col.icono}"/>`;
    s += `<rect x="${n1(x - a / 2)}" y="${n1(y - g / 2)}" width="${n1(a)}" height="${n1(g)}" rx="${n1(g * 0.18)}" fill="${col.icono}"/>`;
  } else s += icono(p.icono, x, y, r * 1.12, col.icono, 1.9);
  if (conInsignia && p.cantidad > 1) {
    const ins = insignia(p, x, y, r);
    s += `<rect x="${n1(ins.x0)}" y="${n1(ins.y0)}" width="${n1(ins.x1 - ins.x0)}" height="${n1(ins.y1 - ins.y0)}" rx="${n1((ins.y1 - ins.y0) / 2)}" fill="${T.insignia}" stroke="${T.tarjeta}" stroke-width="${n1(r * 0.08)}"/>`;
    s += txt((ins.x0 + ins.x1) / 2, (ins.y0 + ins.y1) / 2 + ins.t * 0.36, String(p.cantidad), { t: ins.t, peso: 700, color: T.insigniaTexto, ancla: 'middle' });
  }
  return s;
}

function insignia(p, x, y, r) {
  const t = r * 0.5;
  const h = r * 0.82;
  const w = Math.max(h, anchoTexto(String(p.cantidad), t, 700) + h * 0.5);
  const cx = x + r * 0.78;
  const cy = y - r * 0.78;
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, t };
}

// Caja que ocupa el pin, con la insignia.
function cajaPin(p, x, y, r) {
  const a = r * (p.icono === 'P' ? 1.02 : 1.12);
  const c = { x0: x - a, y0: y - a, x1: x + a, y1: y + a };
  if (p.cantidad > 1 && p.icono !== 'P') {
    const ins = insignia(p, x, y, r);
    c.x1 = Math.max(c.x1, ins.x1 + r * 0.08);
    c.y0 = Math.min(c.y0, ins.y0 - r * 0.08);
  }
  return c;
}

const rotarPunto = ([x, y], ang) => {
  const t = (ang * Math.PI) / 180;
  return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
};

function textoFecha(p) {
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const f = String(p.fecha || p.inicio || '').trim();
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let s = f;
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (Number.isFinite(d.getTime()) && +m[2] >= 1 && +m[2] <= 12) s = `${DIAS[d.getUTCDay()]} ${+m[3]} de ${MESES[+m[2] - 1]}`;
  }
  const h = String(p.inicio || '').match(/T(\d{2}):(\d{2})/);
  if (s && h) s += ` · ${+h[1]}${h[2] !== '00' ? `:${h[2]}` : ''} h`;
  return s;
}

// Puntos de cada cosa para encuadrar el mapa (en metros de la escena).
function puntosDeEncuadre(r) {
  const P = [];
  for (const f of r.formas) {
    if (f.forma) P.push(...f.forma);
    else if (f.linea) {
      const a = (f.ancho || 0) / 2;
      for (const [x, y] of f.linea) P.push([x - a, y - a], [x + a, y + a]);
    } else if (f.radio) P.push([f.pos[0] - f.radio, f.pos[1] - f.radio], [f.pos[0] + f.radio, f.pos[1] + f.radio]);
  }
  for (const p of r.pines) {
    P.push(p.pos);
    for (const h of p.huellas) P.push(...h);
  }
  for (const tx of r.textos) P.push(tx.pos);
  return P.filter(([x, y]) => finito(x) && finito(y));
}

let serie = 0;

/**
 * Mapa para el público en SVG.
 * opciones: formato (clave de FORMATOS), tema ('oscuro' | 'claro'), titulo, subtitulo,
 *   orientacion ('ajustar' | 'norte' | 'escena'), qrSVG((texto, { x, y, lado, color, fondo }) => svg; por
 *   defecto el de qr.js), qr (false para no poner el QR "Cómo llegar", que sale solo si la escena tiene geo),
 *   fuentes ({ regular, semibold, bold } en data URL de woff2), ocultar (['camino:proveedores', 'tipo:tacho', ...]),
 *   destino ([x, y] de la escena para el QR "Cómo llegar"; por defecto, el acceso o el punto de geo).
 * Lo que no venga en opciones sale de escena.mapaPublico.
 * Devuelve { svg, ancho, alto, unidad, rotacion, avisos }.
 */
export function generarMapaPublico(escena, opciones = {}) {
  const e = escena && typeof escena === 'object' ? escena : {};
  const conf = { ...(e.mapaPublico && typeof e.mapaPublico === 'object' ? e.mapaPublico : {}) };
  for (const [k, v] of Object.entries(opciones || {})) if (v !== undefined && v !== null) conf[k] = v;
  const clave = FORMATOS[conf.formato] ? conf.formato : 'historia';
  const F = FORMATOS[clave];
  const D = DISENO[clave];
  const T = conf.tema === 'claro' ? TEMAS.claro : TEMAS.oscuro;
  const W = 1080;
  const u = F.ancho / W;
  const H = F.alto / u;
  const t = D.t;
  const sx = `hm${(++serie).toString(36)}`;
  const avisos = [];
  const fondo = [];
  const partes = [];
  const proyecto = e.proyecto && typeof e.proyecto === 'object' ? e.proyecto : {};
  const titulo = String(conf.titulo || proyecto.evento || e.nombre || 'House Mates').trim();
  const subtitulo = String(conf.subtitulo || [textoFecha(proyecto), proyecto.lugar].filter(Boolean).join(' · ')).trim();
  const x0 = D.lados;
  const x1 = W - D.lados;
  const anchoUtil = x1 - x0;

  // Fondo con un brillo suave de la marca.
  fondo.push(`<rect width="${W}" height="${n1(H)}" fill="${T.fondo}"/>`);
  fondo.push(`<rect width="${W}" height="${n1(H)}" fill="url(#${sx}-b1)"/><rect width="${W}" height="${n1(H)}" fill="url(#${sx}-b2)"/>`);

  /* ---------------- lo que va en el mapa */
  const reunido = reunir(e, opciones?.ocultar);
  const leyenda = itemsLeyenda(reunido);

  // QR "Cómo llegar": al acceso (el que se llame entrada, si hay) o al punto ubicado de la escena. Va
  // arriba a la derecha, al lado de la marca y del título.
  let qr = null;
  const dibujarQR = typeof conf.qrSVG === 'function' ? conf.qrSVG : (texto, op) => qrDeLaApp(texto, { ...op, margen: 2 });
  if (conf.qr !== false && tieneGeo(e)) {
    const accesos = reunido.pines.filter((p) => p.categoria === 'salida' || p.categoria === 'acceso');
    const entrada = accesos.find((p) => /entrada|ingreso|principal/i.test(p.nombre)) || accesos[0];
    const destino = esPunto(conf.destino) ? conf.destino.map(Number) : entrada ? entrada.pos : [Number(e.geo.x) || 0, Number(e.geo.y) || 0];
    const lado = (clave === 'cuadrado' ? 136 : clave === 'afiche' ? 190 : 164) * t;
    qr = { enlace: enlaceComoLlegar(escenaAGeo(e, destino)), lado, w: lado + 28 * t, h: 34 * t + lado + 28 * t + 30 * t };
  } else if (conf.qr !== false) avisos.push('Para sumar el QR "Cómo llegar", ubicá la escena en el mapa (latitud y longitud).');

  /* ---------------- encabezado: marca, título, fecha y lugar */
  let y = D.arriba;
  const anchoTitulo = anchoUtil - (qr ? qr.w + 32 * t : 0);
  const tm = 46 * t;
  const lsM = tm * 0.16;
  const casa = tm * 1.18;
  partes.push(icono('casa', x0 + casa / 2, y + casa / 2, casa, T.texto, 2.2));
  const xm = x0 + casa + 14 * t;
  partes.push(txt(xm, y + casa / 2 + tm * 0.36, 'HOUSE MATES', { t: tm, peso: 700, color: T.texto, ls: lsM }));
  const finMarca = xm + anchoTexto('HOUSE MATES', tm, 700, lsM);
  const tp = 18 * t;
  const lsP = tp * 0.14;
  const textoP = 'MAPA DEL EVENTO';
  const wp = anchoTexto(textoP, tp, 700, lsP) + 36 * t;
  const hp = tp * 2.2;
  if (!qr && x1 - wp > finMarca + 24 * t) {
    const cy = y + casa / 2;
    partes.push(`<rect x="${n1(x1 - wp)}" y="${n1(cy - hp / 2)}" width="${n1(wp)}" height="${n1(hp)}" rx="${n1(hp / 2)}" fill="${COLORES_MARCA.azul}"/>`);
    partes.push(txt(x1 - wp / 2 + lsP / 2, cy + tp * 0.36, textoP, { t: tp, peso: 700, color: '#FFFFFF', ancla: 'middle', ls: lsP }));
  }
  const arribaQR = y;
  y += casa + 42 * t;
  const bt = bloqueTexto(titulo, 84 * t, 700, anchoTitulo, 2, 46 * t, -84 * t * 0.02);
  bt.lineas.forEach((l, i) => partes.push(txt(x0, y + bt.t * (0.78 + i * 1.02), l, { t: bt.t, peso: 700, color: T.texto, ls: bt.ls })));
  y += bt.t * (0.78 + (bt.lineas.length - 1) * 1.02 + 0.24);
  // Fecha y lugar en un renglón si entran; si no, uno abajo del otro.
  const ts0 = 30 * t;
  let renglones = [];
  if (conf.subtitulo) renglones = bloqueTexto(conf.subtitulo, ts0, 500, anchoTitulo, 2, 22 * t).lineas;
  else if (subtitulo) {
    const partesSub = [textoFecha(proyecto), proyecto.lugar].map((s) => String(s ?? '').trim()).filter(Boolean);
    renglones = anchoTexto(subtitulo, ts0, 500) <= anchoTitulo ? [subtitulo] : partesSub.map((s) => recortar(s, ts0, 500, anchoTitulo));
  }
  if (renglones.length) {
    y += 14 * t;
    renglones.forEach((l, i) => partes.push(txt(x0, y + ts0 * (0.8 + i * 1.25), l, { t: ts0, peso: 500, color: T.suave })));
    y += ts0 * (0.8 + (renglones.length - 1) * 1.25 + 0.25);
  }
  if (qr) {
    const qx = x1 - qr.w;
    const qy = arribaQR;
    const tq = 22 * t;
    partes.push(txt(qx + qr.w / 2, qy + tq * 0.82, 'Cómo llegar', { t: tq, peso: 700, color: T.texto, ancla: 'middle' }));
    const py = qy + 34 * t;
    partes.push(`<rect x="${n1(qx)}" y="${n1(py)}" width="${n1(qr.w)}" height="${n1(qr.w)}" rx="${n1(18 * t)}" fill="#FFFFFF"${T === TEMAS.claro ? ` stroke="${T.borde}" stroke-width="${n1(2 * t)}"` : ''}/>`);
    try {
      const s = dibujarQR(qr.enlace, { x: qx + 14 * t, y: py + 14 * t, lado: qr.lado, color: COLORES_MARCA.negro, fondo: '#FFFFFF' });
      if (typeof s === 'string' && s) partes.push(`<g>${s}</g>`);
      else avisos.push('El QR no se pudo dibujar.');
    } catch {
      avisos.push('El QR no se pudo dibujar.');
    }
    const tsq = 16 * t;
    partes.push(txt(qx + qr.w / 2, py + qr.w + 10 * t + tsq * 0.9, 'Escaneá el código', { t: tsq, peso: 500, color: T.suave, ancla: 'middle' }));
    y = Math.max(y, qy + qr.h);
  }
  const arribaTarjeta = y + 34 * t;

  /* ---------------- pie */
  const tf = 19 * t;
  const basePie = H - D.abajo;
  partes.push(txt(x0, basePie, 'Mapa ilustrativo. Medidas aproximadas.', { t: tf, peso: 500, color: T.suave }));
  let abajoLibre = basePie - tf * 0.9 - 24 * t;

  /* ---------------- leyenda: lo más compacta posible sin achicar mucho la letra */
  if (leyenda.length) {
    const tope = (abajoLibre - arribaTarjeta) * 0.26;
    const disp = distribuirLeyenda(leyenda, anchoUtil, 25 * t, tope);
    const arribaLeyenda = abajoLibre - disp.filas * disp.fila;
    leyenda.forEach((it, i) => {
      const x = x0 + (i % disp.cols) * disp.colW;
      const cy = arribaLeyenda + Math.floor(i / disp.cols) * disp.fila + disp.fila / 2;
      partes.push(simboloLeyenda(it, x + disp.r, cy, disp.r, T, t));
      const texto = recortar(it.texto, disp.t, 600, disp.colW - 2 * disp.r - 22 * t);
      partes.push(txt(x + 2 * disp.r + 14 * t, cy + disp.t * 0.36, texto, { t: disp.t, peso: 600, color: T.texto }));
    });
    abajoLibre = arribaLeyenda - 28 * t;
  }

  /* ---------------- tarjeta del mapa */
  const tarjeta = { x0, y0: arribaTarjeta, x1, y1: Math.max(arribaTarjeta + 160 * t, abajoLibre) };
  const radioT = 36 * t;
  fondo.push(`<rect x="${n1(tarjeta.x0)}" y="${n1(tarjeta.y0)}" width="${n1(tarjeta.x1 - tarjeta.x0)}" height="${n1(tarjeta.y1 - tarjeta.y0)}" rx="${n1(radioT)}" fill="${T.tarjeta}" stroke="${T.borde}" stroke-width="${n1(1.5 * t)}"/>`);
  const margenT = 20 * t;
  const zona = { x0: tarjeta.x0 + margenT, y0: tarjeta.y0 + margenT, x1: tarjeta.x1 - margenT, y1: tarjeta.y1 - margenT };
  const R0 = 26 * t;
  const relleno = R0 * 1.15 + 6 * t;
  const caja = { x0: zona.x0 + relleno, y0: zona.y0 + relleno, x1: zona.x1 - relleno, y1: zona.y1 - relleno };

  // Rosa de los vientos (si la escena está ubicada): se reserva su lugar arriba a la derecha.
  const geo = tieneGeo(e);
  const rn = 26 * t;
  const tN = rn * 0.62;
  const ocupado = [];
  let rosa = null;
  if (geo) {
    const m = rn + tN * 1.5;
    rosa = { cx: zona.x1 - m, cy: zona.y0 + m, m };
    ocupado.push({ x0: rosa.cx - m, y0: rosa.cy - m, x1: rosa.cx + m, y1: rosa.cy + m });
  }

  // Giro: el que mejor llena el lugar (o el norte arriba, o tal cual está dibujado).
  const puntos = puntosDeEncuadre(reunido);
  const norte = geo ? Number(e.geo.norte) || 0 : 0;
  const anguloNorte = (((-norte % 360) + 360) % 360);
  let candidatos = [0, 90, 180, 270];
  if (geo && !candidatos.includes(Math.round(anguloNorte * 1000) / 1000)) candidatos.push(anguloNorte);
  if (conf.orientacion === 'escena') candidatos = [0];
  else if (conf.orientacion === 'norte' && geo) candidatos = [anguloNorte];
  const salidas = reunido.pines.filter((p) => p.categoria === 'salida' || p.categoria === 'acceso').map((p) => p.pos);
  const anchoCaja = Math.max(10, caja.x1 - caja.x0);
  const altoCaja = Math.max(10, caja.y1 - caja.y0);
  let elegido = null;
  for (const ang of candidatos) {
    const rot = puntos.length ? puntos.map((p) => rotarPunto(p, ang)) : [[0, 0], [10, 10]];
    const b = cajaDe(rot);
    const k = Math.min(anchoCaja / Math.max(b.maxX - b.minX, 1), altoCaja / Math.max(b.maxY - b.minY, 1));
    let nota = k;
    if (ang === 0) nota *= 1.03;
    if (geo && Math.abs(ang - anguloNorte) < 1e-6) nota *= 1.025;
    if (salidas.length) {
      const medio = (b.minY + b.maxY) / 2;
      const ys = salidas.map((p) => rotarPunto(p, ang)[1]);
      if (ys.reduce((s, v) => s + v, 0) / ys.length > medio) nota *= 1.02;
    }
    if (!elegido || nota > elegido.nota) elegido = { ang, k, b, nota };
  }
  const { ang, k, b } = elegido;
  const ox = caja.x0 + (anchoCaja - (b.maxX - b.minX) * k) / 2;
  const oy = caja.y0 + (altoCaja - (b.maxY - b.minY) * k) / 2;
  const M = (p) => {
    const [rx, ry] = rotarPunto(p, ang);
    return [ox + (rx - b.minX) * k, oy + (ry - b.minY) * k];
  };

  // Servicios iguales que en el mapa quedarían encimados se juntan en un solo pin.
  const pines = agrupar(reunido.pines, (R0 * 2.4) / k);

  /* ---------------- formas */
  const mapa = [];
  for (const f of reunido.formas.filter((x) => x.clase === 'area')) {
    const P = f.forma.map(M);
    const color = f.techo ? T.areaTecho : T.area;
    mapa.push(`<polygon points="${pts(P)}" fill="${color}" stroke="${color}" stroke-width="${n1(10 * t)}" stroke-linejoin="round"/>`);
  }
  for (const f of reunido.formas.filter((x) => x.clase === 'area')) {
    for (const [a, bb] of f.paredes) {
      const [A, B] = [M(a), M(bb)];
      mapa.push(`<line x1="${n1(A[0])}" y1="${n1(A[1])}" x2="${n1(B[0])}" y2="${n1(B[1])}" stroke="${T.pared}" stroke-width="${n1(4 * t)}" stroke-linecap="round"/>`);
    }
  }
  const contexto = reunido.formas.filter((x) => x.clase === 'contexto');
  if (contexto.length) {
    let s = '';
    for (const f of contexto) {
      if (f.linea) {
        const P = f.linea.map(M);
        s += `<polyline points="${pts(P)}" fill="none" stroke="${T.contexto}" stroke-width="${n1(Math.max(f.ancho * k, 3 * t))}" stroke-linecap="round"/>`;
      } else s += `<circle cx="${n1(M(f.pos)[0])}" cy="${n1(M(f.pos)[1])}" r="${n1(Math.max(f.radio * k, 3 * t))}" fill="${T.contexto}"/>`;
    }
    mapa.push(`<g opacity="${T.opContexto}">${s}</g>`);
  }
  for (const f of reunido.formas.filter((x) => x.clase === 'estacionamiento')) {
    const P = f.forma.map(M);
    mapa.push(`<polygon points="${pts(P)}" fill="${COLORES_MARCA.azul}" fill-opacity="${T.opZona}" stroke="${colorLinea('azul', T)}" stroke-opacity="0.55" stroke-width="${n1(2 * t)}" stroke-linejoin="round"/>`);
  }
  for (const f of reunido.formas.filter((x) => x.clase === 'zona')) {
    const P = f.forma.map(M);
    const c = colorLinea(f.color, T);
    mapa.push(`<polygon points="${pts(P)}" fill="${c}" fill-opacity="${T.opZona}" stroke="${c}" stroke-opacity="0.7" stroke-width="${n1(2.2 * t)}" stroke-dasharray="${n1(9 * t)} ${n1(7 * t)}" stroke-linejoin="round"/>`);
  }
  for (const f of reunido.formas.filter((x) => x.clase === 'camino')) {
    const P = f.linea.map(M);
    const c = colorLinea(f.color, T);
    mapa.push(`<polyline points="${pts(P)}" fill="none" stroke="${c}" stroke-opacity="${T.opCamino}" stroke-width="${n1(Math.max(f.ancho * k, 9 * t))}" stroke-linecap="round" stroke-linejoin="round"/>`);
    mapa.push(`<polyline points="${pts(P)}" fill="none" stroke="${c}" stroke-width="${n1(2.6 * t)}" stroke-dasharray="${n1(12 * t)} ${n1(10 * t)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const f of reunido.formas.filter((x) => x.clase === 'vallado')) {
    const P = f.linea.map(M);
    const paso = Math.max(f.modulo * k, 12 * t);
    mapa.push(`<polyline points="${pts(P)}" fill="none" stroke="${T.suave}" stroke-opacity="0.6" stroke-width="${n1(2 * t)}" stroke-linejoin="round"/>`);
    mapa.push(`<polyline points="${pts(P)}" fill="none" stroke="${T.suave}" stroke-width="${n1(5.5 * t)}" stroke-dasharray="0 ${n1(paso)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  // Huellas: el rectángulo real del escenario, la barra, los baños...
  const huellas = new Map();
  for (const p of pines) {
    for (const h of p.huellas) {
      const P = h.map(M);
      const bb = cajaDe(P);
      if (Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) < 5 * t) continue;
      const c = colorPin(p.color, T).fondo;
      if (!huellas.has(c)) huellas.set(c, []);
      huellas.get(c).push(`<polygon points="${pts(P)}" stroke="${c}" stroke-width="${n1(3 * t)}" stroke-linejoin="round"/>`);
    }
  }
  for (const [c, lista] of huellas) mapa.push(`<g fill="${c}" opacity="${T.opHuella}">${lista.join('')}</g>`);

  /* ---------------- pines: cada uno lo más cerca posible de su lugar sin pisarse */
  // En mapas cargados los pines se achican un poco (hasta un 28 %) para que no se alejen de su lugar.
  const proyectados = pines.map((p) => M(p.pos));
  let f = 1;
  if (pines.length > 1) {
    const vecinos = proyectados.map(([x, yy], i) => Math.min(...proyectados.filter((_, j) => j !== i).map(([x2, y2]) => Math.hypot(x2 - x, y2 - yy)))).sort((a, c) => a - c);
    const mediana = vecinos[Math.floor(vecinos.length / 2)];
    const porLugar = Math.sqrt((anchoCaja * altoCaja) / (pines.length * 30000 * t * t));
    f = Math.min(1, Math.max(0.72, Math.min(porLugar, mediana / (2.4 * R0))));
  }
  const R = R0 * f;
  const dentro = (c) => c.x0 >= zona.x0 && c.y0 >= zona.y0 && c.x1 <= zona.x1 && c.y1 <= zona.y1;
  const separa = 5 * t;
  const choca = (c) => ocupado.some((o) => c.x0 < o.x1 + separa && c.x1 + separa > o.x0 && c.y0 < o.y1 + separa && c.y1 + separa > o.y0);
  const encimado = (c) => ocupado.reduce((s, o) => s + Math.max(0, Math.min(c.x1, o.x1) - Math.max(c.x0, o.x0)) * Math.max(0, Math.min(c.y1, o.y1) - Math.max(c.y0, o.y0)), 0);
  const ubicados = [];
  pines.forEach((p, i) => {
    const r = R * (CATEGORIAS_MAPA[p.categoria]?.grande ? 1.25 : 1);
    const [px, py] = proyectados[i];
    let lugar = null;
    let menosMalo = null;
    // Anillos alrededor del lugar real, hasta unas 5 veces el radio: más lejos el pin ya confunde.
    for (let anillo = 0; anillo <= 9 && !lugar; anillo++) {
      const n = anillo === 0 ? 1 : 8 + anillo * 4;
      for (let j = 0; j < n; j++) {
        const a = (2 * Math.PI * j) / n + anillo * 0.4;
        const d = anillo * r * 0.55;
        const x = px + Math.cos(a) * d;
        const yy = py + Math.sin(a) * d;
        const c = cajaPin(p, x, yy, r);
        if (!dentro(c)) continue;
        if (!choca(c)) {
          lugar = { x, y: yy, c };
          break;
        }
        const malo = encimado(c);
        if (!menosMalo || malo < menosMalo.malo) menosMalo = { x, y: yy, c, malo };
      }
    }
    if (!lugar) {
      lugar = menosMalo || { x: px, y: py, c: cajaPin(p, px, py, r) };
      avisos.push(`El pin "${p.rotulo}" quedó encimado con otro: probá otro formato o un giro distinto.`);
    }
    ocupado.push(lugar.c);
    ubicados.push({ p, r, real: [px, py], ...lugar });
  });
  const lineasGuia = [];
  for (const q of ubicados) {
    if (Math.hypot(q.x - q.real[0], q.y - q.real[1]) > q.r * 0.6) {
      const c = colorPin(q.p.color, T).fondo;
      lineasGuia.push(`<line x1="${n1(q.real[0])}" y1="${n1(q.real[1])}" x2="${n1(q.x)}" y2="${n1(q.y)}" stroke="${c}" stroke-width="${n1(2.2 * t)}" stroke-linecap="round"/>`);
      lineasGuia.push(`<circle cx="${n1(q.real[0])}" cy="${n1(q.real[1])}" r="${n1(5 * t)}" fill="${c}" stroke="${T.tarjeta}" stroke-width="${n1(1.5 * t)}"/>`);
    }
  }

  /* ---------------- rótulos */
  // Primero lo más importante (escenario, salidas, primeros auxilios, punto de encuentro), después las
  // zonas, después los demás servicios y al final los nombres de las áreas y los carteles del piso. Lo
  // que no entra sin pisar otra cosa no se pone (el pin queda y la leyenda lo explica).
  const rotulos = [];
  const tr = 23 * t * (0.88 + 0.12 * f);
  const cruza = (a, o) => a.x0 < o.x1 && a.x1 > o.x0 && a.y0 < o.y1 && a.y1 > o.y0;
  const enDosLineas = (s, tam, peso) => {
    const palabras = String(s).split(' ').filter(Boolean);
    if (palabras.length < 2) return null;
    let mejor = null;
    for (let i = 1; i < palabras.length; i++) {
      const l = [palabras.slice(0, i).join(' '), palabras.slice(i).join(' ')];
      const w = Math.max(...l.map((x) => anchoTexto(x, tam, peso)));
      if (!mejor || w < mejor.w) mejor = { l, w };
    }
    return mejor.l;
  };
  const rotularPin = (q) => {
    const texto = q.p.rotulo;
    if (!texto) return;
    const sub = q.p.sub || '';
    const ts = tr * 0.78;
    const peso = CATEGORIAS_MAPA[q.p.categoria]?.grande ? 700 : 600;
    const variantes = [[texto]];
    const dos = !sub && enDosLineas(texto, tr, peso);
    if (dos) variantes.push(dos);
    const c = q.c;
    const re = Math.max(c.x1 - q.x, q.x - c.x0, c.y1 - q.y, q.y - c.y0);
    for (const extra of [0, R * 0.9, R * 1.8]) {
      const g = 9 * t + extra;
      for (const lineas of variantes) {
        const w = Math.max(...lineas.map((l) => anchoTexto(l, tr, peso)), sub ? anchoTexto(sub, ts, 500) : 0);
        const h = tr * (1.2 + 1.15 * (lineas.length - 1)) + (sub ? tr * 0.95 : 0);
        const lugares = [
          [q.x + re + g, q.y - h / 2, 'start'],
          [q.x - re - g - w, q.y - h / 2, 'end'],
          [q.x - w / 2, q.y + re + g * 0.6, 'middle'],
          [q.x - w / 2, q.y - re - g * 0.6 - h, 'middle'],
          [q.x + re * 0.7 + g, q.y + re * 0.35, 'start'],
          [q.x + re * 0.7 + g, q.y - re * 0.35 - h, 'start'],
          [q.x - re * 0.7 - g - w, q.y + re * 0.35, 'end'],
          [q.x - re * 0.7 - g - w, q.y - re * 0.35 - h, 'end'],
        ];
        for (const [bx, by, ancla] of lugares) {
          const cj = { x0: bx, y0: by, x1: bx + w, y1: by + h };
          if (!dentro(cj) || choca(cj)) continue;
          ocupado.push(cj);
          const xt = ancla === 'start' ? cj.x0 : ancla === 'end' ? cj.x1 : (cj.x0 + cj.x1) / 2;
          lineas.forEach((l, i) => rotulos.push(txt(xt, by + tr * (0.92 + 1.15 * i), l, { t: tr, peso, color: T.texto, ancla, halo: T.tarjeta })));
          if (sub) rotulos.push(txt(xt, by + tr * (1.92 + 1.15 * (lineas.length - 1)), sub, { t: ts, peso: 500, color: T.suave, ancla, halo: T.tarjeta }));
          return;
        }
      }
    }
    avisos.push(`No entró el rótulo "${texto}": queda solo en la leyenda.`);
  };

  // Rótulos sin pin. "lugares": puntos del lienzo donde puede ir, en orden de preferencia. "evitar": cajas
  // que no tiene que tocar además de lo ya ubicado (los nombres de las áreas no van encima de una zona).
  const rotuloSuelto = (s, lugares, { tam, peso, color, ls = 0, op = 1, mayus = false, evitar = [] }) => {
    const texto = mayus ? String(s).toLocaleUpperCase('es-AR') : String(s);
    const w = anchoTexto(texto, tam, peso, ls);
    const h = tam * 1.2;
    const corrimientos = [[0, 0], [0, h * 1.1], [0, -h * 1.1], [w * 0.35, 0], [-w * 0.35, 0], [0, h * 2.2], [0, -h * 2.2]];
    for (const [px, py] of lugares) {
      for (const [dx, dy] of corrimientos) {
        const cj = { x0: px + dx - w / 2, y0: py + dy - h / 2, x1: px + dx + w / 2, y1: py + dy + h / 2 };
        if (dentro(cj) && !choca(cj) && !evitar.some((o) => cruza(cj, o))) {
          ocupado.push(cj);
          rotulos.push(txt(px + dx + (ls > 0 ? ls / 2 : 0), py + dy + tam * 0.36, texto, { t: tam, peso, color, ancla: 'middle', ls, op, halo: T.tarjeta }));
          return true;
        }
      }
    }
    return false;
  };
  const cajaPantalla = (P) => {
    const c = cajaDe(P);
    return { x0: c.minX, y0: c.minY, x1: c.maxX, y1: c.maxY };
  };
  // Puntos de adentro de una forma: el centro y, si está ocupado, arriba, abajo y a los costados.
  const lugaresAdentro = (forma, centro) => {
    const P = forma.map(M);
    const c = cajaPantalla(P);
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const medio = [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2];
    return [M(centro), [medio[0], c.y0 + h * 0.14], [medio[0], c.y1 - h * 0.14], [c.x0 + w * 0.3, medio[1]], [c.x1 - w * 0.3, medio[1]]].filter(([x, yy]) => puntoEnPoligono(x, yy, P));
  };

  ubicados.filter((q) => q.p.prioridad >= 92).forEach(rotularPin);
  for (const f2 of reunido.formas.filter((x) => x.clase === 'zona' && x.nombre)) {
    const tz = 21 * t;
    const lugares = lugaresAdentro(f2.forma, f2.pos);
    if (!rotuloSuelto(f2.nombre, lugares.length ? lugares : [M(f2.pos)], { tam: tz, peso: 700, color: colorLinea(f2.color, T), ls: tz * 0.12, mayus: true })) avisos.push(`No entró el rótulo de la zona "${f2.nombre}".`);
  }
  ubicados.filter((q) => q.p.prioridad < 92).forEach(rotularPin);
  for (const f2 of reunido.formas.filter((x) => x.clase === 'camino' && x.nombre)) {
    rotuloSuelto(f2.nombre, [M(f2.pos)], { tam: 18 * t, peso: 600, color: colorLinea(f2.color, T) });
  }
  const zonasEnPantalla = reunido.formas.filter((x) => x.clase === 'zona' || x.clase === 'estacionamiento').map((f2) => cajaPantalla(f2.forma.map(M)));
  for (const f2 of reunido.formas.filter((x) => x.clase === 'area' && x.nombre)) {
    const ta = 18 * t;
    rotuloSuelto(f2.nombre, lugaresAdentro(f2.forma, f2.pos), { tam: ta, peso: 600, color: T.suave, ls: ta * 0.14, mayus: true, op: 0.9, evitar: zonasEnPantalla });
  }
  for (const tx of reunido.textos) rotuloSuelto(tx.nombre, [M(tx.pos)], { tam: 17 * t, peso: 500, color: T.suave });

  /* ---------------- norte */
  let svgRosa = '';
  if (rosa) {
    const giro = (((norte + ang) % 360) + 360) % 360;
    const a = (giro * Math.PI) / 180;
    const nx = rosa.cx + Math.sin(a) * (rn + tN * 0.8);
    const ny = rosa.cy - Math.cos(a) * (rn + tN * 0.8);
    svgRosa =
      `<circle cx="${n1(rosa.cx)}" cy="${n1(rosa.cy)}" r="${n1(rn)}" fill="${T.tarjeta}" stroke="${T.borde}" stroke-width="${n1(2 * t)}"/>` +
      `<g transform="translate(${n1(rosa.cx)} ${n1(rosa.cy)}) rotate(${n1(giro)})">` +
      `<polygon points="0,${n1(-rn * 0.72)} ${n1(rn * 0.3)},${n1(rn * 0.42)} 0,${n1(rn * 0.2)} ${n1(-rn * 0.3)},${n1(rn * 0.42)}" fill="${T.texto}"/></g>` +
      txt(nx, ny + tN * 0.36, 'N', { t: tN, peso: 700, color: T.texto, ancla: 'middle' });
  }

  if (!pines.length && !reunido.formas.length) {
    const cx = (zona.x0 + zona.x1) / 2;
    const cy = (zona.y0 + zona.y1) / 2;
    rotulos.push(txt(cx, cy, 'Todavía no hay nada marcado para el público.', { t: 24 * t, peso: 500, color: T.suave, ancla: 'middle' }));
    avisos.push('La escena no tiene nada para mostrar en el mapa del público.');
  }

  /* ---------------- armado */
  const defs =
    `<defs>${fuentesComoCSS(conf.fuentes)}` +
    `<radialGradient id="${sx}-b1" cx="0.92" cy="0.04" r="0.7"><stop offset="0" stop-color="${COLORES_MARCA.violeta}" stop-opacity="${T.brillo}"/><stop offset="1" stop-color="${COLORES_MARCA.violeta}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${sx}-b2" cx="0.02" cy="0.98" r="0.6"><stop offset="0" stop-color="${COLORES_MARCA.azul}" stop-opacity="${T.brillo * 0.8}"/><stop offset="1" stop-color="${COLORES_MARCA.azul}" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="${sx}-recorte"><rect x="${n1(tarjeta.x0)}" y="${n1(tarjeta.y0)}" width="${n1(tarjeta.x1 - tarjeta.x0)}" height="${n1(tarjeta.y1 - tarjeta.y0)}" rx="${n1(radioT)}"/></clipPath>` +
    `</defs>`;
  const cuerpo = [
    ...fondo,
    `<g clip-path="url(#${sx}-recorte)">${mapa.join('')}</g>`,
    ...lineasGuia,
    ...ubicados.map((q) => `<g class="pin" data-categoria="${esc(q.p.categoria)}">${svgPin(q.p, q.x, q.y, q.r, T)}</g>`),
    ...rotulos,
    svgRosa,
    ...partes,
  ].join('');
  const contenido = u === 1 ? cuerpo : `<g transform="scale(${Math.round(u * 1e6) / 1e6})">${cuerpo}</g>`;
  const tamRaiz = F.unidad === 'mm' ? ` width="${F.ancho}mm" height="${F.alto}mm"` : ` width="${F.ancho}" height="${F.alto}"`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg"${tamRaiz} viewBox="0 0 ${F.ancho} ${F.alto}" font-family="${FUENTE}">` +
    `<title>${esc(`Mapa · ${titulo}`)}</title>${defs}${contenido}</svg>`;
  return { svg, ancho: F.ancho, alto: F.alto, unidad: F.unidad, rotacion: n1(ang), avisos };
}

/* ------------------------------------------------------------------ leyenda */

function itemsLeyenda(r) {
  const items = [];
  const porCat = new Map();
  for (const p of r.pines) {
    const clave = p.categoria === 'otro' ? `otro|${normalizar(p.nombre)}` : p.categoria;
    const x = porCat.get(clave) || { p, n: 0 };
    x.n += p.cantidad || 1;
    porCat.set(clave, x);
  }
  for (const { p, n } of porCat.values()) {
    const c = CATEGORIAS_MAPA[p.categoria] || CATEGORIAS_MAPA.otro;
    const texto = p.categoria === 'otro' ? p.nombre : n > 1 ? c.nombre : c.uno;
    if (texto) items.push({ tipo: 'pin', texto, icono: p.icono, color: p.color, prioridad: c.prioridad });
  }
  // Las zonas y el vallado ya tienen su rótulo en el mapa; los caminos se explican acá.
  const caminos = new Set(r.formas.filter((f) => f.clase === 'camino').map((f) => f.color));
  if (caminos.has('azul')) items.push({ tipo: 'camino', texto: 'Recorrido', color: 'azul', prioridad: 20 });
  if (caminos.has('verde')) items.push({ tipo: 'camino', texto: 'Vía de emergencia', color: 'verde', prioridad: 19 });
  return items.sort((a, b) => b.prioridad - a.prioridad);
}

// Columnas y tamaño de letra de la leyenda: la letra más grande con la que no pasa de "tope" de alto
// (si no entra con ninguna, la más baja posible). Las columnas se reparten parejas (5 → 3 + 2).
function distribuirLeyenda(items, ancho, t0, tope) {
  let mejor = null;
  for (const f of [1, 0.94, 0.88, 0.82, 0.76]) {
    const tam = t0 * f;
    const r = tam * 0.8;
    const aire = (34 * t0) / 25;
    const w = Math.max(...items.map((it) => anchoTexto(it.texto, tam, 600))) + 2 * r + aire;
    const maxCols = Math.max(1, Math.min(4, items.length, Math.floor(ancho / w)));
    const filas = Math.ceil(items.length / maxCols);
    const cols = Math.ceil(items.length / filas);
    const fila = tam * 2.2;
    const op = { cols, filas, colW: ancho / cols, t: tam, r, fila, alto: filas * fila };
    if (op.alto <= tope) return op;
    if (!mejor || op.alto < mejor.alto - 1e-6) mejor = op;
  }
  return mejor;
}

function simboloLeyenda(it, cx, cy, r, T, t) {
  if (it.tipo === 'pin') return svgPin({ icono: it.icono, color: it.color, cantidad: 1 }, cx, cy, r * 0.88, T, false);
  // Camino: la misma cinta con guiones que en el mapa.
  const c = colorLinea(it.color, T);
  return (
    `<line x1="${n1(cx - r)}" y1="${n1(cy)}" x2="${n1(cx + r)}" y2="${n1(cy)}" stroke="${c}" stroke-opacity="${T.opCamino}" stroke-width="${n1(r * 0.8)}" stroke-linecap="round"/>` +
    `<line x1="${n1(cx - r)}" y1="${n1(cy)}" x2="${n1(cx + r)}" y2="${n1(cy)}" stroke="${c}" stroke-width="${n1(2.4 * t)}" stroke-dasharray="${n1(7 * t)} ${n1(6 * t)}" stroke-linecap="round"/>`
  );
}

/* ------------------------------------------------------------------ fuentes e imagen */

// Reglas @font-face de General Sans para meter dentro del SVG, así se ve igual al pasarlo a imagen.
// fuentes: { regular, medium, semibold, bold } con data URL (o rutas) de los woff2.
export function fuentesComoCSS(fuentes) {
  if (!fuentes || typeof fuentes !== 'object') return '';
  const pesos = [['regular', 400], ['medium', 500], ['semibold', 600], ['bold', 700]];
  const reglas = [];
  for (const [clave, peso] of pesos) {
    const url = fuentes[clave];
    if (typeof url !== 'string' || !url.trim() || /[<>"&\\\s]/.test(url.trim())) continue;
    const formato = /^data:font\/woff2|^data:application\/font-woff2|\.woff2(\?|#|$)/i.test(url) ? 'woff2' : /woff/i.test(url) ? 'woff' : 'truetype';
    reglas.push(`@font-face{font-family:'General Sans';font-style:normal;font-weight:${peso};src:url("${url.trim()}") format("${formato}")}`);
  }
  return reglas.length ? `<style>${reglas.join('')}</style>` : '';
}

// Solo en el navegador: baja los woff2 de la app y los devuelve como data URL para fuentesComoCSS.
export async function cargarFuentes(base = 'vendor/fuentes/') {
  const leer = async (archivo) => {
    const r = await fetch(base + archivo);
    if (!r.ok) throw new Error(`No se pudo cargar ${archivo}`);
    const blob = await r.blob();
    return await new Promise((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result).replace(/^data:[^;,]*/, 'data:font/woff2'));
      lector.onerror = () => mal(lector.error);
      lector.readAsDataURL(blob);
    });
  };
  const [regular, semibold, bold] = await Promise.all(['general-sans-400.woff2', 'general-sans-600.woff2', 'general-sans-700.woff2'].map(leer));
  return { regular, semibold, bold };
}

// Solo en el navegador: pasa el SVG del mapa a PNG (o JPEG). ancho y alto en las unidades del formato
// (px o mm); escala multiplica esas unidades (afiche A3 a 300 dpi: escala 11.81). Devuelve un Blob.
export async function mapaAImagen(svg, ancho, alto, { escala = 1, tipo = 'image/png', calidad = 0.92 } = {}) {
  let w = Math.max(1, Math.round(ancho * escala));
  let h = Math.max(1, Math.round(alto * escala));
  // Safari no deja armar lienzos de más de ~16,7 millones de píxeles.
  const max = 16_000_000;
  if (w * h > max) {
    const f = Math.sqrt(max / (w * h));
    w = Math.floor(w * f);
    h = Math.floor(h * f);
  }
  // Tamaño en píxeles en la raíz, para que el navegador lo dibuje nítido y no estire una imagen chica.
  const fuente = String(svg).replace(/<svg\b([^>]*)>/, (_, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${w}" height="${h}">`);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fuente)}`;
  if (globalThis.document?.fonts?.ready) await document.fonts.ready.catch(() => {});
  const img = new Image();
  img.decoding = 'sync';
  await new Promise((ok, mal) => {
    img.onload = ok;
    img.onerror = () => mal(new Error('No se pudo leer el mapa como imagen.'));
    img.src = url;
  });
  if (img.decode) await img.decode().catch(() => {});
  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  const dibujar = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
  };
  dibujar();
  // Las fuentes incrustadas a veces se aplican un instante después de cargar: se dibuja de nuevo.
  await new Promise((ok) => setTimeout(ok, 150));
  dibujar();
  return await new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo armar la imagen.'))), tipo, calidad));
}
