// Intercambio con programas de CAD (AutoCAD, LibreCAD, DraftSight) en DXF de texto:
// - exportarDXF: la planta de la escena en DXF R12 (AC1009), en metros, con una capa por tema.
// - leerDXF: lee el plano del lugar que manda el arquitecto y lo devuelve como líneas en metros, para usarlo
//   de fondo en la escena.
//
// Ojo con el eje Y: en DXF apunta hacia arriba y en la escena hacia abajo, así que se escribe y se lee con -y.

import { esquinas, puntosMundo, esPoligono, cajaDe, areaFirmada, distanciaASegmento } from './geometria.js';
import { lineaLocal, contornoLocal, plazasEstacionamiento } from './predio.js';
import { CATEGORIAS, defDatos, catDe, troncoDe } from './tipos-datos.js';
import { geometriaArea } from './plano2d.js';
import { fm } from './formato.js';

/* ================================================================== exportar */

// Capas fijas: [nombre, color ACI, tipo de línea].
const CAPAS = [
  ['HM-MUROS', 7, 'CONTINUOUS'],
  ['HM-ABERTURAS', 4, 'CONTINUOUS'],
  ['HM-AREAS', 8, 'CONTINUOUS'],
  ['HM-ZONAS', 6, 'DASHED'],
  ['HM-CAMINOS', 5, 'CONTINUOUS'],
  ['HM-VALLADO', 9, 'CONTINUOUS'],
  ['HM-ESTACIONAMIENTO', 8, 'CONTINUOUS'],
  ['HM-TEXTOS', 7, 'CONTINUOUS'],
  ['HM-COTAS', 40, 'CONTINUOUS'],
];
const COLOR_CAT = { estructura: 7, sonido: 5, luces: 6, energia: 2, barra: 30, mobiliario: 34, servicios: 4, predio: 8, staff: 200, deco: 82, naturaleza: 3, zonas: 7, otros: 9 };

export const capaObjetos = (cat) => `HM-OBJETOS-${String(cat || 'otros').toUpperCase()}`;

// Objetos que se dibujan como círculo (o elipse si no son parejos).
const REDONDOS = new Set(['luz', 'par', 'beam', 'poste_v', 'farol', 'matafuego', 'mesa_alta', 'banqueta', 'cilindro', 'planta', 'puesto', 'marcador', 'medicion']);
// Lo que va en capas propias o no se dibuja como objeto.
const APARTE = new Set(['zona', 'estacionamiento', 'camino', 'vallado', 'persona', 'texto', 'etiqueta']);

// Número sin notación exponencial y con hasta 6 decimales.
const num = (v) => {
  const r = Math.round((Number(v) || 0) * 1e6) / 1e6;
  return String(r === 0 ? 0 : r);
};

// R12 no sabe de UTF-8: los acentos y la ñ van como \U+00E1 (AutoCAD, LibreCAD y DraftSight lo entienden).
function textoDXF(s) {
  let t = String(s ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/%%/g, '%%%%%%')
    .trim();
  t = Array.from(t)
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (c >= 32 && c < 127) return ch;
      if (c < 32 || c > 0xffff) return '?';
      return `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join('');
  return t.slice(0, 250);
}

function nuevoDibujo() {
  const filas = [];
  const caja = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const cuenta = {};
  const par = (c, v) => filas.push(String(c), String(v));
  // Punto de la escena → DXF (y invertida).
  const punto = ([x, y], base = 10) => {
    const X = Number(x) || 0;
    const Y = -(Number(y) || 0);
    caja.minX = Math.min(caja.minX, X);
    caja.minY = Math.min(caja.minY, Y);
    caja.maxX = Math.max(caja.maxX, X);
    caja.maxY = Math.max(caja.maxY, Y);
    par(base, num(X));
    par(base + 10, num(Y));
    par(base + 20, 0);
  };
  const inicio = (tipo, capa, tipoLinea) => {
    cuenta[tipo] = (cuenta[tipo] || 0) + 1;
    par(0, tipo);
    par(8, capa);
    if (tipoLinea) par(6, tipoLinea);
  };
  const limpio = (pts) => {
    const r = [];
    for (const p of pts) if (!r.length || Math.hypot(p[0] - r.at(-1)[0], p[1] - r.at(-1)[1]) > 1e-6) r.push(p);
    if (r.length > 2 && Math.hypot(r[0][0] - r.at(-1)[0], r[0][1] - r.at(-1)[1]) < 1e-6) r.pop();
    return r;
  };
  return {
    filas,
    caja,
    cuenta,
    linea(capa, a, b, tipoLinea) {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) return;
      inicio('LINE', capa, tipoLinea);
      punto(a, 10);
      punto(b, 11);
    },
    polilinea(capa, pts, cerrada = true, tipoLinea) {
      const p = limpio(pts);
      if (p.length < 2) return;
      inicio('POLYLINE', capa, tipoLinea);
      par(66, 1);
      par(10, 0);
      par(20, 0);
      par(30, 0);
      par(70, cerrada && p.length > 2 ? 1 : 0);
      for (const v of p) {
        par(0, 'VERTEX');
        par(8, capa);
        punto(v, 10);
        par(70, 0);
      }
      par(0, 'SEQEND');
      par(8, capa);
    },
    circulo(capa, c, r, tipoLinea) {
      if (!(r > 1e-6)) return;
      inicio('CIRCLE', capa, tipoLinea);
      punto(c, 10);
      par(40, num(r));
      caja.minX = Math.min(caja.minX, c[0] - r);
      caja.maxX = Math.max(caja.maxX, c[0] + r);
      caja.minY = Math.min(caja.minY, -c[1] - r);
      caja.maxY = Math.max(caja.maxY, -c[1] + r);
    },
    // Ángulos en grados del DXF (antihorario, con el eje Y hacia arriba).
    arco(capa, c, r, desde, hasta) {
      if (!(r > 1e-6)) return;
      inicio('ARC', capa);
      punto(c, 10);
      par(40, num(r));
      par(50, num(desde));
      par(51, num(hasta));
    },
    // Texto centrado en p. rot en grados del DXF.
    texto(capa, p, s, alto = 0.25, rot = 0) {
      const t = textoDXF(s);
      if (!t) return;
      inicio('TEXT', capa);
      punto(p, 10);
      par(40, num(alto));
      par(1, t);
      if (rot) par(50, num(rot));
      par(7, 'STANDARD');
      par(72, 1);
      punto(p, 11);
      par(73, 2);
    },
  };
}

// Paralela a una línea abierta, a distancia d (positiva a la izquierda en la planta). Esquinas a inglete.
function paralela(pts, d) {
  const p = [];
  for (const q of pts) if (!p.length || Math.hypot(q[0] - p.at(-1)[0], q[1] - p.at(-1)[1]) > 1e-6) p.push(q);
  if (p.length < 2) return [];
  const normal = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  };
  return p.map((q, i) => {
    const n1 = i > 0 ? normal(p[i - 1], q) : null;
    const n2 = i < p.length - 1 ? normal(q, p[i + 1]) : null;
    let m = n1 || n2;
    if (n1 && n2) {
      const s = [n1[0] + n2[0], n1[1] + n2[1]];
      const L = Math.hypot(s[0], s[1]);
      if (L > 1e-9) {
        const u = [s[0] / L, s[1] / L];
        const f = 1 / Math.max(u[0] * n1[0] + u[1] * n1[1], 0.25);
        m = [u[0] * f, u[1] * f];
      }
    }
    return [q[0] + m[0] * d, q[1] + m[1] * d];
  });
}

function elipse(c, rx, ry, rot = 0, n = 32) {
  const t = ((rot || 0) * Math.PI) / 180;
  const co = Math.cos(t);
  const si = Math.sin(t);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    pts.push([c[0] + x * co - y * si, c[1] + x * si + y * co]);
  }
  return pts;
}

// Punto del objeto en coordenadas locales (frente hacia +y con rot 0) → planta.
const enPlanta = (o, lx, ly) => {
  const t = ((o.rot || 0) * Math.PI) / 180;
  return [o.pos[0] + lx * Math.cos(t) - ly * Math.sin(t), o.pos[1] + lx * Math.sin(t) + ly * Math.cos(t)];
};

function centroide(pts) {
  const A = areaFirmada(pts);
  if (Math.abs(A) < 1e-9) {
    const b = cajaDe(pts);
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * A), cy / (6 * A)];
}

// Ángulo de un texto que sigue la dirección (dx, dy) de la planta, siempre legible (no cabeza abajo).
function anguloLegible(dx, dy) {
  let a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (a > 90.5) a -= 180;
  if (a < -89.5) a += 180;
  return a;
}

/**
 * Planta de la escena en DXF R12 (texto), en metros. Devuelve el contenido del archivo (solo ASCII).
 * Opciones: incluirArboles (true).
 */
export function exportarDXF(escena, { incluirArboles = true } = {}) {
  const d = nuevoDibujo();
  const areas = (escena.areas || []).filter((a) => Array.isArray(a.contorno) && a.contorno.length >= 3);
  const objetos = (escena.objetos || []).filter((o) => o && Array.isArray(o.pos) && Array.isArray(o.dims));

  // Ambientes: contorno, muros, aberturas y nombre.
  for (const a of areas) {
    d.polilinea('HM-AREAS', a.contorno, true);
    const g = geometriaArea(a);
    for (const m of g.muros) d.polilinea('HM-MUROS', m, true);
    for (const v of g.ventanas) {
      d.polilinea('HM-ABERTURAS', v.p, true);
      d.linea('HM-ABERTURAS', v.medio[0], v.medio[1]);
    }
    for (const pu of g.puertas) {
      if (pu.porton) {
        d.linea('HM-ABERTURAS', pu.a, pu.b, 'DASHED');
        continue;
      }
      // Hoja abierta hacia adentro y el arco que barre al cerrarse.
      const B = pu.bisagra;
      const Q = [B[0] - pu.n[0] * pu.ancho, B[1] - pu.n[1] * pu.ancho];
      d.linea('HM-ABERTURAS', B, Q);
      const ang = (P) => (Math.atan2(-(P[1] - B[1]), P[0] - B[0]) * 180) / Math.PI;
      let a0 = ang(Q);
      let a1 = ang(pu.cierre);
      if ((((a1 - a0) % 360) + 360) % 360 > 180) [a0, a1] = [a1, a0];
      d.arco('HM-ABERTURAS', B, pu.ancho, (a0 + 360) % 360, (a1 + 360) % 360);
    }
    for (const r of g.rotulos) d.texto('HM-TEXTOS', r.pos, r.texto, 0.3);
    if (a.nombre) d.texto('HM-TEXTOS', centroide(a.contorno), a.nombre, 0.5);
  }

  // Objetos. Los nombres de objetos apilados en el mismo lugar se escriben uno debajo del otro.
  const apilados = new Map();
  const rotular = (o, s) => {
    if (!s) return;
    const clave = `${Math.round(o.pos[0] * 50)},${Math.round(o.pos[1] * 50)}`;
    const k = apilados.get(clave) || 0;
    apilados.set(clave, k + 1);
    d.texto('HM-TEXTOS', [o.pos[0], o.pos[1] + k * 0.32], s, 0.25);
  };

  for (const o of objetos) {
    if (o.tipo === 'persona') continue;
    if (o.tipo === 'arbol' && !incluirArboles) continue;
    const def = defDatos(o);
    const nombre = o.nombre || def.nombre;
    const [w, p] = o.dims;

    if (o.tipo === 'zona') {
      d.polilinea('HM-ZONAS', esPoligono(o) ? puntosMundo(o) : esquinas(o), true);
      rotular(o, nombre);
      continue;
    }
    if (o.tipo === 'estacionamiento') {
      d.polilinea('HM-ESTACIONAMIENTO', puntosMundo({ ...o, puntos: contornoLocal(o) }), true);
      const { plazas } = plazasEstacionamiento(o);
      for (const q of plazas) d.polilinea('HM-ESTACIONAMIENTO', puntosMundo({ ...o, puntos: q }), true);
      rotular(o, nombre);
      continue;
    }
    if (o.tipo === 'camino') {
      const eje = puntosMundo({ ...o, puntos: lineaLocal(o) });
      const ancho = Number(o.ancho) > 0 ? Number(o.ancho) : 3;
      d.polilinea('HM-CAMINOS', eje, false, 'DASHED');
      d.polilinea('HM-CAMINOS', paralela(eje, ancho / 2), false);
      d.polilinea('HM-CAMINOS', paralela(eje, -ancho / 2), false);
      continue;
    }
    if (o.tipo === 'vallado') {
      d.polilinea('HM-VALLADO', puntosMundo({ ...o, puntos: lineaLocal(o) }), false);
      continue;
    }
    if (o.tipo === 'texto') {
      d.texto('HM-TEXTOS', o.pos, o.texto || nombre, Number(o.tamano) > 0 ? Number(o.tamano) : 0.6, -(o.rot || 0));
      continue;
    }
    if (o.tipo === 'etiqueta') {
      rotular(o, nombre);
      continue;
    }

    const capa = capaObjetos(catDe(o));
    // Lo que está colgado o en altura (truss, luces) va con línea de trazos, como en el plano impreso.
    const tl = (o.elev || 0) >= 1.8 ? 'DASHED' : undefined;
    if (o.tipo === 'arbol') {
      if (Math.abs(w - p) < 1e-6) d.circulo(capa, o.pos, w / 2, 'DASHED');
      else d.polilinea(capa, elipse(o.pos, w / 2, p / 2, o.rot), true, 'DASHED');
      d.circulo(capa, o.pos, troncoDe(o) / 2);
    } else if (REDONDOS.has(o.tipo) || (o.tipo === 'columna' && o.forma === 'redonda')) {
      const parejo = Math.abs(w - p) < 1e-6 || o.tipo === 'luz' || o.tipo === 'par' || o.tipo === 'beam';
      if (parejo) d.circulo(capa, o.pos, Math.max(w, p) / 2, tl);
      else d.polilinea(capa, elipse(o.pos, w / 2, p / 2, o.rot), true, tl);
    } else if (o.tipo === 'flecha') {
      const cabeza = Math.min(p * 0.4, w * 1.4);
      const cuerpo = w * 0.42;
      const forma = [
        [-cuerpo / 2, p / 2],
        [cuerpo / 2, p / 2],
        [cuerpo / 2, -(p / 2 - cabeza)],
        [w / 2, -(p / 2 - cabeza)],
        [0, -p / 2],
        [-w / 2, -(p / 2 - cabeza)],
        [-cuerpo / 2, -(p / 2 - cabeza)],
      ].map(([x, y]) => enPlanta(o, x, y));
      d.polilinea(capa, forma, true);
    } else {
      d.polilinea(capa, esquinas(o), true, tl);
    }
    rotular(o, nombre);
  }

  // Cotas del usuario: línea corrida "desplazo" metros, líneas de referencia, marcas a 45° y la medida.
  for (const c of escena.cotas || []) {
    if (!Array.isArray(c.a) || !Array.isArray(c.b)) continue;
    const dx = c.b[0] - c.a[0];
    const dy = c.b[1] - c.a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const u = [dx / L, dy / L];
    const n = [-u[1], u[0]];
    const s = Number(c.desplazo) || 0;
    const A = [c.a[0] + n[0] * s, c.a[1] + n[1] * s];
    const B = [c.b[0] + n[0] * s, c.b[1] + n[1] * s];
    if (Math.abs(s) > 1e-3) {
      const sg = Math.sign(s);
      const ext = (P, Q) => d.linea('HM-COTAS', [P[0] + n[0] * 0.1 * sg, P[1] + n[1] * 0.1 * sg], [Q[0] + n[0] * 0.15 * sg, Q[1] + n[1] * 0.15 * sg]);
      ext(c.a, A);
      ext(c.b, B);
    }
    d.linea('HM-COTAS', A, B);
    const m = 0.12;
    for (const P of [A, B]) d.linea('HM-COTAS', [P[0] - (u[0] + n[0]) * m, P[1] - (u[1] + n[1]) * m], [P[0] + (u[0] + n[0]) * m, P[1] + (u[1] + n[1]) * m]);
    const lado = s < 0 ? -1 : 1;
    const T = [(A[0] + B[0]) / 2 + n[0] * 0.25 * lado, (A[1] + B[1]) / 2 + n[1] * 0.25 * lado];
    d.texto('HM-COTAS', T, `${fm(L)} m`, 0.25, anguloLegible(dx, dy));
  }

  // Encabezado y tablas (se arman al final para tener los límites del dibujo).
  const caja = Number.isFinite(d.caja.minX) ? d.caja : { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const capas = [['0', 7, 'CONTINUOUS'], ...CAPAS, ...CATEGORIAS.map(([c]) => [capaObjetos(c), COLOR_CAT[c] ?? 7, 'CONTINUOUS'])];
  const h = [];
  const par = (c, v) => h.push(String(c), String(v));
  const variable = (nombre, pares) => {
    par(9, nombre);
    for (const [c, v] of pares) par(c, v);
  };
  par(0, 'SECTION');
  par(2, 'HEADER');
  variable('$ACADVER', [[1, 'AC1009']]);
  variable('$DWGCODEPAGE', [[3, 'ANSI_1252']]);
  variable('$INSBASE', [[10, 0], [20, 0], [30, 0]]);
  variable('$EXTMIN', [[10, num(caja.minX)], [20, num(caja.minY)], [30, 0]]);
  variable('$EXTMAX', [[10, num(caja.maxX)], [20, num(caja.maxY)], [30, 0]]);
  variable('$LIMMIN', [[10, num(caja.minX)], [20, num(caja.minY)]]);
  variable('$LIMMAX', [[10, num(caja.maxX)], [20, num(caja.maxY)]]);
  variable('$LTSCALE', [[40, 1]]);
  variable('$MEASUREMENT', [[70, 1]]);
  variable('$INSUNITS', [[70, 6]]);
  par(0, 'ENDSEC');

  par(0, 'SECTION');
  par(2, 'TABLES');
  // Tipos de línea: continua y de trazos (0,5 m de trazo y 0,25 m de espacio).
  par(0, 'TABLE');
  par(2, 'LTYPE');
  par(70, 2);
  for (const [nombre, desc, partes] of [
    ['CONTINUOUS', 'Solid line', []],
    ['DASHED', '__ __ __ __', [0.5, -0.25]],
  ]) {
    par(0, 'LTYPE');
    par(2, nombre);
    par(70, 0);
    par(3, desc);
    par(72, 65);
    par(73, partes.length);
    par(40, num(partes.reduce((s, v) => s + Math.abs(v), 0)));
    for (const v of partes) par(49, num(v));
  }
  par(0, 'ENDTAB');
  par(0, 'TABLE');
  par(2, 'LAYER');
  par(70, capas.length);
  for (const [nombre, color, tl] of capas) {
    par(0, 'LAYER');
    par(2, nombre);
    par(70, 0);
    par(62, color);
    par(6, tl);
  }
  par(0, 'ENDTAB');
  par(0, 'TABLE');
  par(2, 'STYLE');
  par(70, 1);
  par(0, 'STYLE');
  par(2, 'STANDARD');
  par(70, 0);
  par(40, 0);
  par(41, 1);
  par(50, 0);
  par(71, 0);
  par(42, 0.25);
  par(3, 'txt');
  par(4, '');
  par(0, 'ENDTAB');
  par(0, 'ENDSEC');

  par(0, 'SECTION');
  par(2, 'BLOCKS');
  par(0, 'ENDSEC');

  return [...h, '0', 'SECTION', '2', 'ENTITIES', ...d.filas, '0', 'ENDSEC', '0', 'EOF', ''].join('\r\n');
}

/* ================================================================== leer */

// $INSUNITS → [nombre, metros por unidad].
const UNIDADES_ARCHIVO = { 1: ['in', 0.0254], 2: ['ft', 0.3048], 4: ['mm', 0.001], 5: ['cm', 0.01], 6: ['m', 1], 7: ['km', 1000], 10: ['yd', 0.9144], 14: ['dm', 0.1] };
const METROS = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144 };
const MAX_PUNTOS = 40000;
// Tope de seguridad mientras se lee (bloques repetidos miles de veces pueden explotar la cantidad).
const MAX_CRUDOS = 3000000;
const SEG_CIRCULO = 32;

// Matrices afines [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f.
const IDENTIDAD = [1, 0, 0, 1, 0, 0];
const mul = (A, B) => [
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
];
const mover = (x, y) => [1, 0, 0, 1, x, y];
const girar = (g) => {
  const t = (g * Math.PI) / 180;
  return [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0];
};
const escalar = (sx, sy) => [sx, 0, 0, sy, 0, 0];
const ESPEJO_X = [-1, 0, 0, 1, 0, 0];

const NOMBRES_IGNORADOS = { TEXT: 'textos', MTEXT: 'textos', ATTRIB: 'textos', ATTDEF: 'textos', HATCH: 'rellenos', DIMENSION: 'cotas', LEADER: 'flechas de referencia', MLEADER: 'flechas de referencia', MULTILEADER: 'flechas de referencia', IMAGE: 'imágenes', POINT: 'puntos', VIEWPORT: 'ventanas de presentación', '3DFACE': 'caras 3D', '3DSOLID': 'sólidos 3D', REGION: 'regiones', WIPEOUT: 'máscaras' };

// Puntos de un arco entre p1 y p2 con "bulge" b (tangente de un cuarto del ángulo; positivo = antihorario).
function puntosBulge(p1, p2, b) {
  const th = 4 * Math.atan(b);
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-12 || Math.abs(th) < 1e-9) return [];
  const h = dist / 2 / Math.tan(th / 2);
  const c = [(p1[0] + p2[0]) / 2 - (dy / dist) * h, (p1[1] + p2[1]) / 2 + (dx / dist) * h];
  const r = Math.hypot(p1[0] - c[0], p1[1] - c[1]);
  const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
  const n = Math.max(2, Math.ceil((Math.abs(th) / (2 * Math.PI)) * SEG_CIRCULO));
  const res = [];
  for (let i = 1; i < n; i++) {
    const a = a0 + (th * i) / n;
    res.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return res;
}

function conBulges(pts, bulges, cerrada) {
  if (!pts.length) return [];
  const res = [];
  const n = pts.length;
  const tramos = cerrada ? n : n - 1;
  res.push(pts[0]);
  for (let i = 0; i < tramos; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (bulges[i]) res.push(...puntosBulge(a, b, bulges[i]));
    res.push(b);
  }
  return res;
}

function arcoPuntos(c, r, desde, hasta) {
  let a1 = hasta;
  while (a1 <= desde) a1 += 360;
  const barrido = a1 - desde;
  const n = Math.max(2, Math.ceil((barrido / 360) * SEG_CIRCULO));
  const res = [];
  for (let i = 0; i <= n; i++) {
    const a = ((desde + (barrido * i) / n) * Math.PI) / 180;
    res.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return res;
}

// B-spline (con pesos si los tiene) evaluada con de Boor. Si los datos no cierran, null.
function curvaSpline(ctrl, nudos, grado, pesos) {
  const n = ctrl.length;
  const p = grado;
  if (p < 1 || n <= p || nudos.length !== n + p + 1) return null;
  const w = pesos.length === n ? pesos : ctrl.map(() => 1);
  const t0 = nudos[p];
  const t1 = nudos[n];
  if (!(t1 > t0)) return null;
  const pasos = Math.min(400, Math.max(8, n * 8));
  const res = [];
  for (let s = 0; s <= pasos; s++) {
    const t = s === pasos ? t1 - 1e-9 * (t1 - t0) : t0 + ((t1 - t0) * s) / pasos;
    let k = p;
    while (k < n - 1 && t >= nudos[k + 1]) k++;
    const dd = [];
    for (let j = 0; j <= p; j++) {
      const i = k - p + j;
      dd.push([ctrl[i][0] * w[i], ctrl[i][1] * w[i], w[i]]);
    }
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = k - p + j;
        const den = nudos[i + p - r + 1] - nudos[i];
        const a = den > 1e-12 ? (t - nudos[i]) / den : 0;
        dd[j] = [(1 - a) * dd[j - 1][0] + a * dd[j][0], (1 - a) * dd[j - 1][1] + a * dd[j][1], (1 - a) * dd[j - 1][2] + a * dd[j][2]];
      }
    }
    const q = dd[p];
    if (!(Math.abs(q[2]) > 1e-12)) return null;
    res.push([q[0] / q[2], q[1] / q[2]]);
  }
  return res;
}

// Une puntos repetidos y los del medio de tramos rectos (tol en metros).
function limpiar(pts, tol) {
  const r = [];
  for (const p of pts) {
    if (r.length && Math.hypot(p[0] - r.at(-1)[0], p[1] - r.at(-1)[1]) <= tol) continue;
    while (r.length >= 2) {
      const a = r[r.length - 2];
      const b = r[r.length - 1];
      const ab = [b[0] - a[0], b[1] - a[1]];
      const bp = [p[0] - b[0], p[1] - b[1]];
      const Lap = Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (Lap < 1e-12) break;
      const desvio = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / Lap;
      if (desvio <= tol && ab[0] * bp[0] + ab[1] * bp[1] > 0) r.pop();
      else break;
    }
    r.push(p);
  }
  return r;
}

// Douglas-Peucker sin recursión.
function simplificar(pts, tol) {
  if (pts.length <= 2) return pts;
  const queda = new Uint8Array(pts.length);
  queda[0] = 1;
  queda[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop();
    let max = 0;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const dd = distanciaASegmento(pts[k], pts[i], pts[j]);
      if (dd > max) {
        max = dd;
        idx = k;
      }
    }
    if (idx >= 0 && max > tol) {
      queda[idx] = 1;
      pila.push([i, idx], [idx, j]);
    }
  }
  return pts.filter((_, k) => queda[k]);
}

const contarPuntos = (lineas) => lineas.reduce((s, l) => s + l.length, 0);
const largo = (l) => {
  let L = 0;
  for (let i = 1; i < l.length; i++) L += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
  return L;
};

/**
 * Lee un DXF de texto (R12 a 2018) y devuelve sus líneas en metros, con la orientación de la escena
 * (y hacia abajo) y la esquina mínima del dibujo en (0, 0).
 * Opciones: unidad ('mm' | 'cm' | 'm'; si se pasa, manda sobre lo que diga el archivo).
 * Devuelve { lineas, caja, cantidad, unidadDetectada, avisos, puntos, desplazo }:
 * - lineas: [[x, y], ...] por cada trazo (las cerradas repiten el primer punto al final).
 * - caja: { minX: 0, minY: 0, maxX, maxY, ancho, alto } en metros.
 * - cantidad: elementos del dibujo que se convirtieron en líneas (con los de los bloques ya expandidos).
 * - unidadDetectada: 'mm', 'cm', 'm', 'in', 'ft'... la que se usó.
 * - desplazo: [dx, dy] que se restó: el punto (X, Y) del archivo quedó en [X·u − dx, −Y·u − dy] (u = metros por unidad).
 */
export function leerDXF(texto, { unidad } = {}) {
  let t = String(texto ?? '');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  if (t.startsWith('AutoCAD Binary DXF')) throw new Error('Es un DXF binario. Guardalo de nuevo como DXF de texto (ASCII) y probá otra vez.');
  if (/^AC10\d\d/.test(t)) throw new Error('Es un archivo DWG, no DXF. Pedí el plano en DXF o exportalo como DXF desde el programa de CAD.');

  // Pares (código, valor). Si una línea de código no es un número, se corre una línea para volver a encajar.
  const filas = t.split(/\r\n|\r|\n/);
  const C = new Int32Array(Math.ceil(filas.length / 2) + 1);
  const V = new Array(C.length);
  let m = 0;
  for (let i = 0; i + 1 < filas.length; ) {
    const s = filas[i].trim();
    if (!/^-?\d+$/.test(s)) {
      i++;
      continue;
    }
    C[m] = parseInt(s, 10);
    V[m] = filas[i + 1].trim();
    m++;
    i += 2;
  }
  if (!m) throw new Error('El archivo está vacío o no es un DXF.');

  // Secciones
  const secciones = {};
  for (let i = 0; i < m; i++) {
    if (C[i] === 0 && V[i] === 'SECTION' && C[i + 1] === 2) {
      const nombre = V[i + 1].toUpperCase();
      let j = i + 2;
      while (j < m && !(C[j] === 0 && (V[j] === 'ENDSEC' || V[j] === 'EOF'))) j++;
      secciones[nombre] = [i + 2, j];
      i = j;
    }
  }
  if (!secciones.ENTITIES) {
    if (!Object.keys(secciones).length) secciones.ENTITIES = [0, m];
    else throw new Error('El DXF no tiene dibujo (falta la sección ENTITIES).');
  }

  const avisos = [];

  // Unidad que dice el archivo
  let insunits = null;
  if (secciones.HEADER) {
    const [a, b] = secciones.HEADER;
    for (let i = a; i < b; i++) {
      if (C[i] === 9 && V[i] === '$INSUNITS') {
        for (let j = i + 1; j < b && C[j] !== 9 && C[j] !== 0; j++) if (C[j] === 70) insunits = parseInt(V[j], 10);
        break;
      }
    }
  }

  // Lista de elementos de un tramo: { tipo, a, b } con los pares de cada uno en [a, b).
  const elementos = (a, b) => {
    const lista = [];
    let ini = -1;
    for (let i = a; i < b; i++) {
      if (C[i] !== 0) continue;
      if (ini >= 0) lista.push({ tipo: V[ini].toUpperCase(), a: ini + 1, b: i });
      ini = i;
    }
    if (ini >= 0) lista.push({ tipo: V[ini].toUpperCase(), a: ini + 1, b });
    return lista;
  };
  const valores = (e) => {
    const d = {};
    for (let i = e.a; i < e.b; i++) if (!(C[i] in d)) d[C[i]] = V[i];
    return d;
  };
  const f = (d, c, def = 0) => {
    const v = parseFloat(d[c]);
    return Number.isFinite(v) ? v : def;
  };
  const ent = (d, c, def = 0) => {
    const v = parseInt(d[c], 10);
    return Number.isFinite(v) ? v : def;
  };

  // Capas apagadas o congeladas: lo que está en ellas no se ve en el plano original, así que no se trae.
  const ocultas = new Set(['DEFPOINTS']);
  if (secciones.TABLES) {
    for (const e of elementos(...secciones.TABLES)) {
      if (e.tipo !== 'LAYER') continue;
      const d = valores(e);
      if (!d[2]) continue;
      if ((ent(d, 70) & 1) === 1 || ent(d, 62, 7) < 0) ocultas.add(d[2].toUpperCase());
    }
  }

  // Bloques
  const bloques = new Map();
  if (secciones.BLOCKS) {
    let actual = null;
    for (const e of elementos(...secciones.BLOCKS)) {
      if (e.tipo === 'BLOCK') {
        const d = valores(e);
        actual = { nombre: d[2] || d[3] || '', base: [f(d, 10), f(d, 20)], externo: (ent(d, 70) & 4) === 4, lista: [] };
        bloques.set(actual.nombre.toUpperCase(), actual);
      } else if (e.tipo === 'ENDBLK') actual = null;
      else if (actual) actual.lista.push(e);
    }
  }

  const crudas = [];
  const cruda = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let crudos = 0;
  let cantidad = 0;
  let cortado = false;
  const ignorados = new Map();
  const sinBloque = new Set();
  let mallas = 0;
  let ocultos = 0;
  const ignorar = (tipo) => ignorados.set(tipo, (ignorados.get(tipo) || 0) + 1);

  const guardar = (pts, T, espejo, cerrada = false) => {
    if (!pts || pts.length < 2) return;
    const M = espejo ? mul(T, ESPEJO_X) : T;
    const res = pts.map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
    if (cerrada) res.push(res[0]);
    if (!res.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return;
    for (const [x, y] of res) {
      if (x < cruda.minX) cruda.minX = x;
      if (x > cruda.maxX) cruda.maxX = x;
      if (y < cruda.minY) cruda.minY = y;
      if (y > cruda.maxY) cruda.maxY = y;
    }
    crudas.push(res);
    crudos += res.length;
    cantidad++;
    if (crudos > MAX_CRUDOS) cortado = true;
  };

  const dibujar = (lista, T, capaPadre, nivel, enBloque) => {
    for (let k = 0; k < lista.length && !cortado; k++) {
      const e = lista[k];
      const tipo = e.tipo;
      if (tipo === 'VERTEX' || tipo === 'SEQEND') continue;
      const d = valores(e);
      if (!enBloque && d[67] === '1') continue; // espacio papel (carátulas, ventanas)
      let capa = (d[8] || '0').toUpperCase();
      if (capa === '0' && capaPadre) capa = capaPadre;
      if (ocultas.has(capa)) {
        ocultos++;
        continue;
      }
      const espejo = f(d, 230, 1) < 0;

      switch (tipo) {
        case 'LINE':
          guardar(
            [
              [f(d, 10), f(d, 20)],
              [f(d, 11), f(d, 21)],
            ],
            T,
            false,
          );
          break;
        case 'LWPOLYLINE': {
          const pts = [];
          const bulges = [];
          for (let i = e.a; i < e.b; i++) {
            if (C[i] === 10) {
              pts.push([parseFloat(V[i]) || 0, 0]);
              bulges.push(0);
            } else if (C[i] === 20 && pts.length) pts[pts.length - 1][1] = parseFloat(V[i]) || 0;
            else if (C[i] === 42 && pts.length) bulges[bulges.length - 1] = parseFloat(V[i]) || 0;
          }
          const cerrada = (ent(d, 70) & 1) === 1;
          guardar(conBulges(pts, bulges, cerrada), T, espejo);
          break;
        }
        case 'POLYLINE': {
          const flags = ent(d, 70);
          const pts = [];
          const bulges = [];
          while (k + 1 < lista.length && lista[k + 1].tipo === 'VERTEX') {
            k++;
            const dv = valores(lista[k]);
            const vf = ent(dv, 70);
            if (vf & 16) continue; // punto de control de un spline ajustado
            if ((vf & 128) && !(vf & 64)) continue; // cara de una malla
            pts.push([f(dv, 10), f(dv, 20)]);
            bulges.push(f(dv, 42));
          }
          if (flags & (16 | 64)) {
            mallas++;
            break;
          }
          const es3D = (flags & 8) === 8;
          guardar(conBulges(pts, es3D ? [] : bulges, (flags & 1) === 1), T, !es3D && espejo);
          break;
        }
        case 'CIRCLE': {
          const pts = arcoPuntos([f(d, 10), f(d, 20)], f(d, 40), 0, 360);
          pts.pop();
          guardar(pts, T, espejo, true);
          break;
        }
        case 'ARC':
          guardar(arcoPuntos([f(d, 10), f(d, 20)], f(d, 40), f(d, 50), f(d, 51)), T, espejo);
          break;
        case 'ELLIPSE': {
          const c = [f(d, 10), f(d, 20)];
          const M = [f(d, 11), f(d, 21)];
          const z = f(d, 230, 1) < 0 ? -1 : 1;
          const r = f(d, 40, 1);
          const menor = [-z * M[1] * r, z * M[0] * r];
          let p0 = f(d, 41, 0);
          let p1 = f(d, 42, Math.PI * 2);
          while (p1 <= p0 + 1e-9) p1 += Math.PI * 2;
          const n = Math.max(4, Math.ceil(((p1 - p0) / (Math.PI * 2)) * 48));
          const pts = [];
          for (let i = 0; i <= n; i++) {
            const a = p0 + ((p1 - p0) * i) / n;
            pts.push([c[0] + M[0] * Math.cos(a) + menor[0] * Math.sin(a), c[1] + M[1] * Math.cos(a) + menor[1] * Math.sin(a)]);
          }
          guardar(pts, T, false);
          break;
        }
        case 'SPLINE': {
          const ctrl = [];
          const ajuste = [];
          const nudos = [];
          const pesos = [];
          for (let i = e.a; i < e.b; i++) {
            const v = parseFloat(V[i]) || 0;
            if (C[i] === 10) ctrl.push([v, 0]);
            else if (C[i] === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = v;
            else if (C[i] === 11) ajuste.push([v, 0]);
            else if (C[i] === 21 && ajuste.length) ajuste[ajuste.length - 1][1] = v;
            else if (C[i] === 40) nudos.push(v);
            else if (C[i] === 41) pesos.push(v);
          }
          const cerrada = (ent(d, 70) & 1) === 1;
          let pts = ctrl.length >= 2 ? curvaSpline(ctrl, nudos, ent(d, 71, 3), pesos) : null;
          if (!pts) pts = ajuste.length >= 2 ? ajuste : ctrl;
          guardar(pts, T, false, cerrada && pts.length > 2);
          break;
        }
        case 'SOLID':
        case 'TRACE': {
          // Las esquinas de un SOLID van en orden 1, 2, 4, 3.
          const q = [
            [f(d, 10), f(d, 20)],
            [f(d, 11), f(d, 21)],
            [f(d, 13, f(d, 12)), f(d, 23, f(d, 22))],
            [f(d, 12), f(d, 22)],
          ];
          guardar(q, T, espejo, true);
          break;
        }
        case 'INSERT': {
          const b = bloques.get((d[2] || '').toUpperCase());
          if (!b) {
            sinBloque.add(d[2] || '?');
            break;
          }
          if (b.externo || nivel >= 8) break;
          const ins = [f(d, 10), f(d, 20)];
          const sx = f(d, 41, 1) || 1;
          const sy = f(d, 42, 1) || 1;
          const rot = f(d, 50, 0);
          const cols = Math.max(1, ent(d, 70, 1));
          const filasB = Math.max(1, ent(d, 71, 1));
          const dc = f(d, 44, 0);
          const dr = f(d, 45, 0);
          const base = mul(escalar(sx, sy), mover(-b.base[0], -b.base[1]));
          const padre = espejo ? mul(T, ESPEJO_X) : T;
          for (let ci = 0; ci < Math.min(cols, 200); ci++) {
            for (let ri = 0; ri < Math.min(filasB, 200); ri++) {
              const L = mul(mover(ins[0], ins[1]), mul(girar(rot), mul(mover(ci * dc, ri * dr), base)));
              dibujar(b.lista, mul(padre, L), capa, nivel + 1, true);
            }
          }
          break;
        }
        default:
          ignorar(tipo);
      }
    }
  };

  dibujar(elementos(...secciones.ENTITIES), IDENTIDAD, null, 0, false);

  // Unidad
  const extension = crudas.length ? Math.max(cruda.maxX - cruda.minX, cruda.maxY - cruda.minY) : 0;
  let unidadDetectada;
  const delArchivo = UNIDADES_ARCHIVO[insunits];
  if (unidad && METROS[unidad]) {
    unidadDetectada = unidad;
    if (delArchivo && delArchivo[0] !== unidad) avisos.push(`El archivo dice que está en ${delArchivo[0]}, pero se leyó en ${unidad} como elegiste.`);
  } else if (delArchivo) {
    unidadDetectada = delArchivo[0];
  } else {
    unidadDetectada = extension > 5000 ? 'mm' : extension > 500 ? 'cm' : 'm';
    if (crudas.length) avisos.push(`El archivo no dice en qué unidad está: se tomó ${unidadDetectada} por el tamaño del dibujo. Si la escala no da, elegí la unidad a mano.`);
  }
  const u = METROS[unidadDetectada];

  // A metros y con la y hacia abajo.
  let lineas = crudas.map((l) => l.map(([x, y]) => [x * u, -y * u]));

  // Limpieza: puntos repetidos, tramos rectos partidos y trazos de largo cero.
  const total0 = contarPuntos(lineas);
  lineas = lineas.map((l) => limpiar(l, 0.0005)).filter((l) => l.length >= 2 && largo(l) > 0.001);

  // Si sigue siendo mucho, se simplifica cada vez más y, al final, se dejan afuera los trazos más chicos.
  let total = contarPuntos(lineas);
  if (total > MAX_PUNTOS) {
    let tolUsada = 0;
    for (const tol of [0.005, 0.01, 0.02, 0.05, 0.1, 0.25]) {
      lineas = lineas.map((l) => simplificar(l, tol)).filter((l) => l.length >= 2 && largo(l) > 0.001);
      total = contarPuntos(lineas);
      tolUsada = tol;
      if (total <= MAX_PUNTOS) break;
    }
    avisos.push(`El plano tenía ${total0.toLocaleString('es-AR')} puntos: se simplificó con una tolerancia de ${String(tolUsada * 100).replace('.', ',')} cm para que la app no se trabe.`);
    if (total > MAX_PUNTOS) {
      const tam = (l) => {
        const b = cajaDe(l);
        return Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
      };
      const orden = lineas.map((l) => [l, tam(l)]).sort((a, b) => b[1] - a[1]);
      const quedan = [];
      let suma = 0;
      for (const [l] of orden) {
        if (suma + l.length > MAX_PUNTOS) continue;
        quedan.push(l);
        suma += l.length;
      }
      avisos.push(`Se dejaron afuera ${orden.length - quedan.length} trazos chicos (detalles) para no pasar de ${MAX_PUNTOS.toLocaleString('es-AR')} puntos.`);
      lineas = quedan;
      total = suma;
    }
  }

  // Esquina mínima en (0, 0) y redondeo al milímetro.
  const b = lineas.length ? cajaDe(lineas.flat()) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const r3 = (v) => Math.round(v * 1000) / 1000 || 0;
  lineas = lineas.map((l) => l.map(([x, y]) => [r3(x - b.minX), r3(y - b.minY)]));
  const ancho = r3(b.maxX - b.minX);
  const alto = r3(b.maxY - b.minY);

  if (cortado) avisos.push('El dibujo es enorme (bloques repetidos muchas veces): se leyó solo una parte.');
  if (ocultos) avisos.push(`No se trajeron ${ocultos} elementos de capas apagadas o congeladas.`);
  if (mallas) avisos.push(`Se ignoraron ${mallas} mallas 3D.`);
  if (sinBloque.size) avisos.push(`Faltan ${sinBloque.size} bloques que el dibujo usa (${[...sinBloque].slice(0, 3).join(', ')}${sinBloque.size > 3 ? '…' : ''}).`);
  if (ignorados.size) {
    const porNombre = new Map();
    for (const [tipo, n] of ignorados) {
      const nom = NOMBRES_IGNORADOS[tipo] || tipo;
      porNombre.set(nom, (porNombre.get(nom) || 0) + n);
    }
    avisos.push(`Solo se usan las líneas: se dejaron de lado ${[...porNombre].map(([nom, n]) => `${n} ${nom}`).join(', ')}.`);
  }
  if (!lineas.length) avisos.push('No se encontraron líneas para dibujar en el archivo.');
  else if (Math.max(ancho, alto) > 3000 || Math.max(ancho, alto) < 2) {
    avisos.push(`El dibujo mide ${fm(ancho, 1)} × ${fm(alto, 1)} m: si no es correcto, elegí la unidad a mano.`);
  }

  return {
    lineas,
    caja: { minX: 0, minY: 0, maxX: ancho, maxY: alto, ancho, alto },
    cantidad,
    puntos: total,
    unidadDetectada,
    avisos,
    desplazo: [r3(b.minX), r3(b.minY)],
  };
}
