// Vistas en alzado (de frente y de costado) de la cabina, el escenario o cualquier grupo de objetos, con todas
// las alturas acotadas desde el piso. Es para escenógrafos y riggers: a qué altura queda cada cosa.
//
// Cómo se mira: la dirección sale de un objeto de referencia (por defecto, el más grande de los elegidos).
//   frente:        parado delante del frente de la referencia (+y local), mirando hacia −y.
//                  La horizontal del dibujo es el x local de la referencia.
//   costado:       parado del lado +x local, mirando hacia −x. La horizontal es el y local; el frente de la
//                  referencia queda a la izquierda, como se ve de verdad (el dibujo no está espejado).
//   fondo:         desde atrás (−y local).        otro-costado: desde el lado −x local.
//
// Coordenadas de la vista: u (m, horizontal, crece hacia la derecha del que mira, 0 = centro de la referencia)
// y z (m, altura desde el piso). Cada objeto se arma con sólidos convexos en sus coordenadas locales
// (x, y, z) y se proyecta: la silueta de cada sólido es la envolvente convexa de sus vértices proyectados,
// así cualquier giro sale bien. Se dibuja de atrás hacia adelante (pintor) y lo lejano va más claro.
//
// No usa three: se prueba con Node. Las hojas van en milímetros de papel, como las de plano2d.js.

import { defDatos, troncoDe } from './tipos-datos.js';
import { lineaLocal } from './predio.js';
import { fm, esc } from './formato.js';
import {
  ESCALAS, tamanoPapel, marco, cuadroDatos, barraEscala, svgHoja, linea, n2, pts, anchoTexto, recortar, envolver,
  TINTA, GRIS, ACENTO, FUENTE,
} from './plano2d.js';

export const LADOS = {
  frente: { titulo: 'Vista de frente', corto: 'Frente' },
  costado: { titulo: 'Vista de costado', corto: 'Costado' },
  fondo: { titulo: 'Vista de atrás', corto: 'Atrás' },
  'otro-costado': { titulo: 'Vista del otro costado', corto: 'Otro costado' },
};

export function normalizarLado(l) {
  if (LADOS[l]) return l;
  if (l === 'atras' || l === 'atrás' || l === 'detras') return 'fondo';
  if (l === 'lateral' || l === 'derecha') return 'costado';
  if (l === 'izquierda') return 'otro-costado';
  return 'frente';
}

/* ------------------------------------------------------------------ utilidades */

const rad = (g) => ((Number(g) || 0) * Math.PI) / 180;
const num = (v, d = 0) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const limitar = (v, a, b) => Math.min(Math.max(v, a), b);
const NEGRO = '#0c0c0d';

// Texto de un nivel: +2,40 (o ±0,00 en el piso).
export const textoNivel = (z) => (Math.abs(z) < 0.005 ? '±0,00' : `${z > 0 ? '+' : '−'}${fm(Math.abs(z))}`);

const NOMBRES_COLOR = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080',
  yellow: '#ffff00', orange: '#ffa500', purple: '#800080', brown: '#a52a2a', pink: '#ffc0cb', violet: '#ee82ee',
};
function rgb(c) {
  let s = String(c || '').trim().toLowerCase();
  if (NOMBRES_COLOR[s]) s = NOMBRES_COLOR[s];
  const m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (!m) return [136, 136, 136];
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((x) => x + x).join('');
  else if (h.length >= 6) h = h.slice(0, 6);
  else return [136, 136, 136];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const hex = (v) => '#' + v.map((x) => Math.round(limitar(x, 0, 255)).toString(16).padStart(2, '0')).join('');
export const mezclar = (c1, c2, t) => {
  const a = rgb(c1);
  const b = rgb(c2);
  return hex(a.map((v, i) => v + (b[i] - v) * t));
};

// Envolvente convexa (cadena monótona). Devuelve los puntos en orden; con todos alineados, los dos extremos.
function envolvente(puntos) {
  const p = [...puntos].sort((A, B) => A[0] - B[0] || A[1] - B[1]);
  if (p.length < 3) return p;
  const cruz = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
  const lado = (lista) => {
    const r = [];
    for (const q of lista) {
      while (r.length >= 2 && cruz(r[r.length - 2], r[r.length - 1], q) <= 1e-12) r.pop();
      r.push(q);
    }
    r.pop();
    return r;
  };
  const casco = lado(p).concat(lado([...p].reverse()));
  return casco.length >= 2 ? casco : [p[0], p[p.length - 1]];
}

function cajaDeFormas(formas) {
  let u0 = Infinity;
  let u1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const f of formas) {
    u0 = Math.min(u0, f.caja.u0);
    u1 = Math.max(u1, f.caja.u1);
    z0 = Math.min(z0, f.caja.z0);
    z1 = Math.max(z1, f.caja.z1);
  }
  return { u0, u1, z0, z1 };
}

function cajaDeForma(f) {
  if (f.tipo === 'circulo') {
    const [u, z] = f.puntos[0];
    const rx = f.rx ?? f.r;
    return { u0: u - rx, u1: u + rx, z0: z - f.r, z1: z + f.r };
  }
  let u0 = Infinity;
  let u1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [u, z] of f.puntos) {
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return { u0, u1, z0, z1 };
}

const cruz3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unitario = (v) => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
};

/* ------------------------------------------------------------------ objetos */

// Objetos que no se ven en alzado: planos en el piso (zonas, caminos, carteles en el piso, textos).
function dibujable(o) {
  if (!o || !Array.isArray(o.pos)) return false;
  if (defDatos(o).piso || o.tipo === 'texto') return false;
  return dimsDe(o)[2] > 0;
}

function dimsDe(o) {
  const base = defDatos(o).dims || [1, 1, 1];
  return [0, 1, 2].map((i) => {
    const v = Math.abs(num(o.dims?.[i], base[i] ?? 1));
    return i < 2 ? Math.max(v, 0.01) : v;
  });
}

const colorDe = (o) => (typeof o.color === 'string' && o.color.trim() ? o.color : defDatos(o).color || '#888888');
const nombreDe = (o) => String(o.nombre || defDatos(o).nombre || o.tipo || 'Objeto');
const esEstimado = (o) => o.estimado === true || /estimad/i.test(String(o.nota || ''));

// El más grande de los elegidos (volumen), sin contar personas ni árboles si hay otra cosa.
function referenciaPorDefecto(objs) {
  const otros = objs.filter((o) => o.tipo !== 'persona' && o.tipo !== 'arbol');
  let mejor = null;
  let max = -1;
  for (const o of otros.length ? otros : objs) {
    const [w, p, h] = dimsDe(o);
    const v = w * p * Math.max(h, 0.05);
    if (v > max) {
      max = v;
      mejor = o;
    }
  }
  return mejor;
}

function direcciones(ref, lado) {
  const t = rad(ref?.rot);
  const ex = [Math.cos(t), Math.sin(t)];
  const ey = [-Math.sin(t), Math.cos(t)];
  const visor = lado === 'costado' ? ex : lado === 'fondo' ? [-ey[0], -ey[1]] : lado === 'otro-costado' ? [-ex[0], -ex[1]] : ey;
  // La derecha del que mira (en planta, con y hacia abajo, es girar 90° la dirección hacia el que mira).
  return { visor, der: [visor[1], -visor[0]] };
}

function medidasCasita(o, w, h) {
  const viga = Math.min(0.18, w * 0.05);
  const alero = limitar(num(o.alero), 0, 0.9) * h;
  const tirante = alero > 0 ? alero : limitar(num(o.tirante) || 0.48, 0.1, 0.9) * h;
  return { viga, alero, tirante };
}

// "Lápiz" de un objeto: arma sólidos en coordenadas locales (x, y en planta; z desde la base del objeto) y
// los proyecta a la vista. Cada forma guarda qué tan cerca está del que mira, para ordenarlas.
function lapiz(o, dims, vista, salida) {
  const [w, p] = dims;
  const t = rad(o.rot);
  const ex = [Math.cos(t), Math.sin(t)];
  const ey = [-Math.sin(t), Math.cos(t)];
  const { der, visor, origen } = vista;
  const a = ex[0] * der[0] + ex[1] * der[1];
  const b = ey[0] * der[0] + ey[1] * der[1];
  const fa = ex[0] * visor[0] + ex[1] * visor[1];
  const fb = ey[0] * visor[0] + ey[1] * visor[1];
  const rx0 = num(o.pos[0]) - origen[0];
  const ry0 = num(o.pos[1]) - origen[1];
  const uc = rx0 * der[0] + ry0 * der[1];
  const dc = rx0 * visor[0] + ry0 * visor[1];
  const e = num(o.elev);
  const color0 = colorDe(o);
  const U = (x, y) => uc + x * a + y * b;
  const D = (x, y) => dc + x * fa + y * fb;
  const agregar = (f, cerca, cercaMax) => {
    const caja = cajaDeForma(f);
    if (!Object.values(caja).every(Number.isFinite)) return;
    if (f.tipo !== 'circulo' && caja.u1 - caja.u0 < 1e-6 && caja.z1 - caja.z0 < 1e-6) return;
    salida.push({ ...f, caja, id: o.id, cerca, cercaMax, seq: salida.length });
  };
  const d = {
    w, p, a, b, fa, fb, e, U, D,
    frente: fb > 0.12,
    solido(verts, color = color0, rol = 'cuerpo', grosor = 1) {
      if (verts.length < 2) return;
      const ds = verts.map(([x, y]) => D(x, y));
      agregar({ tipo: 'poligono', puntos: envolvente(verts.map(([x, y, z]) => [U(x, y), e + z])), color, rol, grosor }, ds.reduce((s, v) => s + v, 0) / ds.length, Math.max(...ds));
    },
    caja(x0, x1, y0, y1, z0, z1, color, rol, grosor) {
      const v = [];
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) v.push([x, y, z]);
      d.solido(v, color, rol, grosor);
    },
    // Sección en el plano x-z local, extruida a lo largo de y (de y0 a y1).
    prisma(seccion, y0, y1, color, rol, grosor) {
      d.solido(seccion.flatMap(([x, z]) => [[x, y0, z], [x, y1, z]]), color, rol, grosor);
    },
    // Barra de sección cuadrada g × g entre dos puntos locales [x, y, z].
    barra(A, B, g, color, rol, grosor) {
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      if (Math.hypot(...u) < 1e-6) return;
      const n = unitario(u);
      const e1 = unitario(Math.abs(n[2]) > 0.9 ? cruz3(n, [1, 0, 0]) : cruz3(n, [0, 0, 1]));
      const e2 = cruz3(n, e1);
      const v = [];
      for (const P of [A, B]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) v.push([0, 1, 2].map((i) => P[i] + ((e1[i] * s1 + e2[i] * s2) * g) / 2));
      d.solido(v, color, rol, grosor);
    },
    // Cilindro vertical de sección elíptica (rx en x local, ry en y local).
    cil(cx, cy, rx, ry, z0, z1, color = color0, rol = 'cuerpo', grosor = 1) {
      const m = Math.hypot(a * rx, b * ry);
      const u = U(cx, cy);
      const c = D(cx, cy);
      agregar({ tipo: 'poligono', puntos: [[u - m, e + z0], [u + m, e + z0], [u + m, e + z1], [u - m, e + z1]], color, rol, grosor }, c, c + Math.hypot(fa * rx, fb * ry));
    },
    cono(cx, cy, r0, r1, z0, z1, color = color0, rol = 'cuerpo', grosor = 1) {
      const u = U(cx, cy);
      const c = D(cx, cy);
      agregar({ tipo: 'poligono', puntos: [[u - r0, e + z0], [u + r0, e + z0], [u + r1, e + z1], [u - r1, e + z1]], color, rol, grosor }, c, c + Math.max(r0, r1));
    },
    elipsoide(cx, cy, z, rx, ry, rz, color = color0, rol = 'cuerpo', grosor = 1) {
      const c = D(cx, cy);
      agregar({ tipo: 'circulo', puntos: [[U(cx, cy), e + z]], rx: Math.hypot(a * rx, b * ry), r: rz, color, rol, grosor }, c, c + Math.hypot(fa * rx, fb * ry));
    },
    esfera(cx, cy, z, r, color, rol, grosor) {
      d.elipsoide(cx, cy, z, r, r, r, color, rol, grosor);
    },
    // Círculo pintado en la cara del frente (cara = 1) o de atrás (cara = −1): solo se ve si esa cara mira
    // hacia el que mira. De costado se achica en horizontal (elipse).
    disco(cx, z, r, cara = 1, color = NEGRO, rol = 'oscuro', grosor = 0.7) {
      if (fb * cara <= 0.12) return;
      const y = cara * (p / 2 + 0.004);
      const c = D(cx, y);
      agregar({ tipo: 'circulo', puntos: [[U(cx, y), e + z]], rx: r * Math.abs(a), r, color, rol, grosor }, c, c);
    },
    // Polígono ya en coordenadas de la vista, relativo al centro del objeto: [[du, z], ...].
    plano(lista, color = color0, rol = 'cuerpo', grosor = 1) {
      const u = U(0, 0);
      const c = D(0, 0);
      agregar({ tipo: 'poligono', puntos: lista.map(([du, z]) => [u + du, e + z]), color, rol, grosor }, c, c + Math.hypot((fa * w) / 2, (fb * p) / 2));
    },
    linea(lista, color = color0, rol = 'cuerpo', grosor = 1) {
      const ds = lista.map(([x, y]) => D(x, y));
      agregar({ tipo: 'linea', puntos: lista.map(([x, y, z]) => [U(x, y), e + z]), color, rol, grosor }, Math.max(...ds) + 0.002, Math.max(...ds));
    },
  };
  return d;
}

/* ------------------------------------------------------------------ cómo se ve cada tipo */

function cajaSimple(d, [w, p, h], c) {
  d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h, c);
}

function mesa(d, [w, p, h], c) {
  const tapa = Math.min(0.04, h * 0.1);
  d.caja(-w / 2, w / 2, -p / 2, p / 2, h - tapa, h, c);
  const ix = Math.max(w / 2 - 0.06, 0);
  const iy = Math.max(p / 2 - 0.06, 0);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.caja(sx * ix - 0.025, sx * ix + 0.025, sy * iy - 0.025, sy * iy + 0.025, 0, h - tapa, c, 'estructura');
}

function vehiculo(d, [w, p, h], c, o) {
  if (o.tipo === 'auto') {
    d.caja(-w / 2, w / 2, -p / 2, p / 2, 0.2, 0.2 + h * 0.5, c);
    d.caja(-w * 0.43, w * 0.43, -p * 0.29, p * 0.21, 0.2 + h * 0.5, Math.min(0.2 + h * 0.86, h), c, 'oscuro');
  } else {
    const cabina = Math.min(p * 0.28, 2);
    d.caja(-w * 0.48, w * 0.48, p / 2 - cabina, p / 2, 0.35, Math.min(0.35 + h * 0.72, h), c);
    d.caja(-w / 2, w / 2, -p / 2, p / 2 - cabina - 0.1, 0.3, h, o.tipo === 'ambulancia' ? '#f4f4f4' : c, 'claro');
  }
  // Ruedas: prismas de ocho lados con el eje en x local.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cy = sy * (p / 2 - Math.min(0.8, p * 0.18));
      const x0 = sx * (w / 2 - 0.22);
      const x1 = sx * (w / 2);
      const v = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 + Math.PI / 8;
        for (const x of [x0, x1]) v.push([x, cy + Math.cos(ang) * 0.32, 0.32 + Math.sin(ang) * 0.32]);
      }
      d.solido(v, NEGRO, 'oscuro', 0.7);
    }
  }
}

function puestoAtencion(d, [w, p, h], c, o) {
  if (o.tipo === 'foodtruck') return vehiculo(d, [w, p, h], c, { tipo: 'camion' });
  const fondo = Math.max(p * 0.25, 0.1);
  const mostrador = Math.max(p * 0.35, 0.1);
  d.caja(-w / 2, w / 2, -p / 2, -p / 2 + fondo, 0, h, c);
  d.caja(-w / 2, w / 2, p / 2 - mostrador, p / 2, 0, Math.min(1.05, h * 0.5), c, 'claro');
  d.caja(-w / 2, w / 2, -p / 2, p / 2, h - 0.08, h, c, 'estructura');
}

function totem(d, [w, p, h], c) {
  d.cil(0, 0, 0.04, 0.04, 0, h * 0.7, '#2b2d31', 'estructura');
  const cartel = Math.min(w, h * 0.35);
  d.caja(-w / 2, w / 2, -Math.max(p, 0.04) / 2, Math.max(p, 0.04) / 2, h - cartel, h, c);
}

function carpa(d, [w, p, h], c) {
  const pared = h * 0.72;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.cil(sx * (w / 2 - 0.04), sy * (p / 2 - 0.04), 0.035, 0.035, 0, pared, '#9aa1a8', 'metal');
  d.solido([[-w / 2, -p / 2, pared], [w / 2, -p / 2, pared], [w / 2, p / 2, pared], [-w / 2, p / 2, pared], [0, 0, h]], c, 'techo');
}

function persona(d, [w, p, h], c) {
  const cabeza = Math.min(0.115, h * 0.066);
  const W = Math.max(Math.hypot((d.a * w) / 2, (d.b * p) / 2), 0.08);
  const ez = (h - cabeza * 2 + 0.02) / 0.87;
  // Mitad derecha de la silueta (fracción del medio ancho, fracción del alto del cuerpo); la otra es espejo.
  const mitad = [[0.08, 0], [0.6, 0], [0.66, 0.48], [0.66, 0.71], [0.8, 0.46], [0.99, 0.46], [1, 0.78], [0.84, 0.84], [0.2, 0.87]];
  const silueta = [
    ...mitad.map(([x, z]) => [x * W, z * ez]),
    ...[...mitad].reverse().map(([x, z]) => [-x * W, z * ez]),
    [0, 0.44 * ez],
  ];
  d.plano(silueta, c, 'persona');
  d.esfera(0, 0, h - cabeza, cabeza, c, 'persona');
}

// Estructura a dos aguas, igual que en tipos.js: pórticos adelante y atrás (postes hasta el alero y cabios
// hasta la cumbrera, o un triángulo hasta el piso con un tirante), vigas a lo largo y los dos faldones del
// techo. El contorno de afuera pasa justo por (±w/2, alero) y (0, h), así las cotas dan las medidas cargadas.
function casita(d, [w, p, h], c, o) {
  const { viga, alero, tirante } = medidasCasita(o, w, h);
  const sube = h - alero;
  const L = Math.hypot(w / 2, sube) || 1;
  const faldon = (s, grueso) => {
    const n = [(-s * sube) / L, -w / 2 / L]; // normal hacia adentro
    const P0 = [(s * w) / 2, alero];
    const P1 = [0, h];
    return [P0, P1, [P1[0] + n[0] * grueso, P1[1] + n[1] * grueso], [P0[0] + n[0] * grueso, Math.max(P0[1] + n[1] * grueso, 0)]];
  };
  const xs = (s) => (s > 0 ? [w / 2 - viga, w / 2] : [-w / 2, -w / 2 + viga]);
  for (const s of [-1, 1]) {
    const [x0, x1] = xs(s);
    d.caja(x0, x1, -p / 2, p / 2, 0, viga, c, 'estructura');
    if (alero > 0) d.caja(x0, x1, -p / 2, p / 2, Math.max(alero - viga, 0), alero, c, 'estructura');
  }
  const cumbre = h - (viga / 2) * ((2 * sube) / Math.max(w, 0.01));
  d.caja(-viga / 2, viga / 2, -p / 2, p / 2, Math.max(cumbre - viga, 0), cumbre, c, 'estructura');
  for (const y of [-p / 2 + viga / 2, p / 2 - viga / 2]) {
    const y0 = y - viga / 2;
    const y1 = y + viga / 2;
    for (const s of [-1, 1]) {
      if (alero > 0) {
        const [x0, x1] = xs(s);
        d.caja(x0, x1, y0, y1, 0, alero, c, 'estructura');
      }
      d.prisma(faldon(s, viga), y0, y1, c, 'estructura');
    }
    if (alero > 0) d.caja(-w / 2 + viga, w / 2 - viga, y0, y1, Math.max(alero - viga, 0), alero, c, 'estructura');
    else {
      const m = (w / 2) * (1 - tirante / h);
      d.caja(-m, m, y0, y1, Math.max(tirante - viga, 0), tirante, c, 'estructura');
    }
  }
  if (o.techo !== false) for (const s of [-1, 1]) d.prisma(faldon(s, 0.035), -p / 2, p / 2, c, 'techo');
  if (o.luz && d.frente) {
    const x = w / 2 - viga / 2;
    const y = p / 2 + 0.01;
    const tope = h - viga * 0.7;
    const recorrido = alero > 0 ? [[-x, y, 0], [-x, y, alero], [0, y, tope], [x, y, alero], [x, y, 0]] : [[-x, y, 0], [0, y, tope], [x, y, 0]];
    d.linea(recorrido, o.luz, 'led', 1.6);
  }
}

// Truss: cuatro cordones, montantes y diagonales en zigzag, orientado igual que en 3D (vertical si es más
// alto que largo; si no, según el lado más largo).
function truss(d, [w, p, h], c) {
  const vertical = h > Math.max(w, p);
  const enY = !vertical && p > w;
  const L = vertical ? h : Math.max(w, p);
  const sb = vertical ? w : h;
  const sc = vertical ? p : enY ? w : p;
  const r = 0.024;
  const rr = 0.011;
  const ab = Math.max(sb / 2 - r, 0.02);
  const ac = Math.max(sc / 2 - r, 0.02);
  const M = vertical ? (A, B, C) => [B, C, h / 2 + A] : enY ? (A, B, C) => [C, A, h / 2 + B] : (A, B, C) => [A, C, h / 2 + B];
  const n = Math.max(1, Math.round(L / 0.5));
  // Montantes y diagonales metidos medio grosor, así la silueta mide justo el largo cargado.
  const util = Math.max(L - rr * 2, 0.01);
  const paso = util / n;
  for (const B of [-ab, ab]) for (const C of [-ac, ac]) d.barra(M(-L / 2, B, C), M(L / 2, B, C), r * 2, c, 'metal');
  for (let i = 0; i <= n; i++) {
    const A = -util / 2 + paso * i;
    for (const C of [-ac, ac]) d.barra(M(A, -ab, C), M(A, ab, C), rr * 2, c, 'metal', 0.6);
    for (const B of [-ab, ab]) d.barra(M(A, B, -ac), M(A, B, ac), rr * 2, c, 'metal', 0.6);
    if (i < n) {
      const s = i % 2 ? -1 : 1;
      for (const C of [-ac, ac]) d.barra(M(A, -s * ab, C), M(A + paso, s * ab, C), rr * 2, c, 'metal', 0.6);
    }
  }
}

const DIBUJO = {
  caja: cajaSimple,
  cilindro: (d, [w, p, h], c) => d.cil(0, 0, w / 2, p / 2, 0, h, c),
  columna: (d, [w, p, h], c, o) => (o.forma === 'redonda' ? d.cil(0, 0, w / 2, p / 2, 0, h, c, 'estructura') : d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h, c, 'estructura')),
  tarima(d, [w, p, h], c) {
    const deck = Math.min(0.03, h);
    d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, Math.max(h - deck, 0.005), c);
    d.caja(-w / 2, w / 2, -p / 2, p / 2, Math.max(h - deck, 0), h, c, 'claro');
  },
  escalera(d, [w, p, h], c) {
    const n = Math.max(2, Math.round(h / 0.175));
    for (let i = 0; i < n; i++) d.caja(-w / 2, w / 2, p / 2 - (p / n) * (i + 1), p / 2 - (p / n) * i, 0, (h / n) * (i + 1), c, 'claro');
  },
  casita,
  carpa,
  cabina_dj(d, [w, p, h], c) {
    const tapa = Math.min(0.04, h * 0.1);
    const wi = Math.max(w - 0.04, 0.01) / 2;
    const pi = Math.max(p - 0.04, 0.01) / 2;
    d.caja(-wi, wi, -pi, pi, 0, h - tapa, c);
    d.caja(-w / 2, w / 2, -p / 2, p / 2, h - tapa, h, c, 'claro');
    // Equipos arriba (CDJ, mixer, CDJ), un poco hacia atrás.
    const anchos = w >= 1.15 ? [0.32, 0.3, 0.32] : w >= 0.5 ? [0.32] : [];
    const total = anchos.reduce((s, x) => s + x, 0) + Math.max(anchos.length - 1, 0) * 0.05;
    const fondo = Math.min(0.42, p * 0.8);
    let x = -total / 2;
    for (const an of anchos) {
      d.caja(x, x + an, -p * 0.08 - fondo / 2, -p * 0.08 + fondo / 2, h, h + 0.1, NEGRO, 'oscuro', 0.7);
      x += an + 0.05;
    }
  },
  parlante(d, [w, p, h], c) {
    d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h, c);
    const r = Math.min(w, h) * 0.32;
    d.disco(0, h * 0.36, r);
    d.disco(0, h * 0.8, r * 0.4);
  },
  sub(d, [w, p, h], c) {
    d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h, c);
    d.disco(0, h / 2, Math.min(w, h) * 0.38);
  },
  // Cabezal móvil colgado: base arriba, brazos y la cabeza abajo.
  luz(d, [w, p, h], c) {
    d.caja(-w / 2, w / 2, -p / 2, p / 2, h * 0.8, h, c);
    for (const s of [-1, 1]) d.caja(s * w * 0.4 - 0.015, s * w * 0.4 + 0.015, -0.035, 0.035, h * 0.38, h * 0.8, c, 'cuerpo', 0.7);
    d.esfera(0, 0, h * 0.4, Math.min(w, p) * 0.34, c);
  },
  par(d, [w, p, h], c) {
    for (const s of [-1, 1]) d.barra([s * w * 0.47, 0, h * 0.5], [s * w * 0.47, 0, h * 0.96], 0.02, c, 'estructura', 0.6);
    d.cil(0, 0, w / 2, p / 2, h * 0.12, h * 0.87, c);
    d.caja(-w * 0.47, w * 0.47, -0.015, 0.015, h * 0.94, h * 0.97, c, 'estructura', 0.6);
  },
  truss,
  pantalla(d, [w, p, h], c, o) {
    d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h, c, 'pantalla');
    if (d.frente) {
      const y = p / 2 + 0.003;
      d.solido([[-w * 0.475, y, h * 0.05], [w * 0.475, y, h * 0.05], [w * 0.475, y, h * 0.95], [-w * 0.475, y, h * 0.95]], o.luz || defDatos(o).luz || '#4a6cf7', 'imagen', 0.5);
    }
  },
  poste_v(d, [w, p, h], c, o) {
    const g = Math.min(0.09, w * 0.1);
    const aa = Math.max(w / 2 - g, 0.05);
    for (const s of [-1, 1]) d.barra([0, 0, g / 2], [s * aa, 0, h - g / 2], g, c);
    const yLuz = h * (defDatos(o).alturaLuz || 0.5);
    const m = (aa * 2 * (yLuz / h) + g) / 2;
    d.caja(-m, m, -0.025, 0.025, Math.max(yLuz - 0.12, 0), Math.max(yLuz - 0.08, 0.01), c, 'estructura');
    d.esfera(0, 0.04, yLuz, 0.07, o.luz || defDatos(o).luz || '#ff4a1c', 'imagen', 0.6);
  },
  farol(d, [w, p, h], c, o) {
    d.caja(-w / 2, w / 2, -p / 2, p / 2, h * 0.88, h, c);
    d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h * 0.08, c);
    d.caja(-w * 0.4, w * 0.4, -p * 0.4, p * 0.4, h * 0.08, h * 0.88, o.luz || defDatos(o).luz || '#ff6a2a', 'imagen', 0.6);
  },
  barra(d, [w, p, h], c) {
    const tapa = Math.min(0.05, h * 0.1);
    const fondo = Math.max(p - 0.12, 0.1);
    d.caja(-w / 2, w / 2, -p / 2, -p / 2 + fondo, 0, h - tapa, c);
    d.caja(-w / 2 - 0.02, w / 2 + 0.02, -p / 2, p / 2, h - tapa, h, c, 'claro');
  },
  mesa,
  mesa_alta(d, [w, p, h], c) {
    d.cil(0, 0, w / 2, p / 2, h - 0.035, h, c);
    d.cil(0, 0, 0.035, 0.035, 0, h - 0.035, c, 'estructura');
    d.cil(0, 0, Math.min(w * 0.32, 0.25), Math.min(p * 0.32, 0.25), 0, 0.02, c, 'estructura');
  },
  silla(d, [w, p, h], c) {
    const asiento = Math.min(0.45, h * 0.53);
    d.caja(-w / 2, w / 2, -p / 2, p / 2, asiento - 0.04, asiento, c);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.caja(sx * (w / 2 - 0.03) - 0.015, sx * (w / 2 - 0.03) + 0.015, sy * (p / 2 - 0.03) - 0.015, sy * (p / 2 - 0.03) + 0.015, 0, asiento - 0.04, c, 'estructura');
    d.caja(-w / 2, w / 2, -p / 2, -p / 2 + 0.04, asiento, h, c);
  },
  banqueta(d, [w, p, h], c) {
    d.cil(0, 0, w / 2, p / 2, h - 0.05, h, c);
    d.cil(0, 0, 0.03, 0.03, 0, h - 0.05, c, 'estructura');
    d.cil(0, 0, w * 0.35, p * 0.35, 0, 0.02, c, 'estructura');
  },
  sillon(d, [w, p, h], c) {
    const brazo = Math.min(0.16, w * 0.12);
    d.caja(-w / 2, w / 2, -p / 2, -p / 2 + p * 0.24, 0, h, c);
    d.caja(-w / 2 + brazo, w / 2 - brazo, -p * 0.28, p / 2, 0, h * 0.52, c, 'claro');
    for (const s of [-1, 1]) d.caja(s > 0 ? w / 2 - brazo : -w / 2, s > 0 ? w / 2 : -w / 2 + brazo, -p / 2, p / 2, 0, h * 0.72, c);
  },
  bano_quimico(d, [w, p, h], c) {
    const techo = Math.min(0.08, h * 0.05);
    d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h - techo, c);
    d.caja(-w / 2 - 0.03, w / 2 + 0.03, -p / 2 - 0.03, p / 2 + 0.03, h - techo, h, c, 'claro');
  },
  matafuego(d, [w, p, h], c) {
    d.cil(0, 0, w / 2, p / 2, 0, h * 0.84, c);
    d.cil(0, 0, w * 0.18, w * 0.18, h * 0.84, h, NEGRO, 'oscuro');
  },
  planta(d, [w, p, h], c) {
    const maceta = h * 0.28;
    d.cono(0, 0, w * 0.26, w * 0.32, 0, maceta, '#98694a');
    d.elipsoide(0, 0, maceta + (h - maceta) / 2, w / 2, p / 2, (h - maceta) / 2, c, 'copa');
  },
  tela: (d, [w, p, h], c) => d.caja(-w / 2, w / 2, -Math.max(p, 0.01) / 2, Math.max(p, 0.01) / 2, 0, h, c),
  persona,
  arbol(d, [w, p, h], c, o) {
    const tronco = troncoDe(o);
    const copa = o.forma === 'redondo' ? h * 0.6 : h * 0.42;
    const fuste = h - copa * 0.8;
    d.cono(0, 0, tronco / 2, tronco * 0.32, 0, fuste, '#6b5340', 'tronco');
    d.elipsoide(0, 0, h - copa / 2, w / 2, p / 2, copa / 2, c, 'copa');
  },
  hilera: (d, [w, p, h], c) => d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h, c, 'copa'),
  generador(d, [w, p, h], c) {
    d.caja(-w * 0.49, w * 0.49, -p * 0.45, p * 0.45, 0, h * 0.08, NEGRO, 'oscuro');
    d.caja(-w / 2, w / 2, -p / 2, p / 2, h * 0.08, h, c);
  },
  tablero: cajaSimple,
  tacho: (d, [w, p, h], c) => d.cil(0, 0, w / 2, p / 2, 0, h, c),
  agua(d, [w, p, h], c) {
    d.caja(-w / 2, w / 2, -p / 2, p / 2, 0, h * 0.75, '#e9edf1');
    d.cil(0, 0, Math.min(w, p) * 0.35, Math.min(w, p) * 0.35, h * 0.75, h, c, 'claro');
  },
  acceso(d, [w, p, h], c, o) {
    const color = o.salida === false ? c : '#1d8a55';
    const lado = Math.min(0.25, w * 0.08);
    const pp = Math.max(p, 0.1) / 2;
    for (const s of [-1, 1]) d.caja(s > 0 ? w / 2 - lado : -w / 2, s > 0 ? w / 2 : -w / 2 + lado, -pp, pp, 0, h, color, 'estructura');
    d.caja(-w / 2, w / 2, -pp, pp, h - Math.min(0.35, h * 0.12), h, color, 'estructura');
  },
  control_acceso(d, [w, p, h], c) {
    const n = Math.max(2, Math.round(w / 0.9));
    for (let i = 0; i <= n; i++) {
      const x = Math.min(Math.max(-w / 2 + (w / n) * i, -w / 2 + 0.06), w / 2 - 0.06);
      d.caja(x - 0.06, x + 0.06, -p / 2, p / 2, 0, h, c, 'metal');
    }
  },
  auto: vehiculo,
  camion: vehiculo,
  ambulancia: vehiculo,
  foodtruck: puestoAtencion,
  guardarropa: puestoAtencion,
  carga_celulares: puestoAtencion,
  boleteria: puestoAtencion,
  primeros_auxilios: carpa,
  punto_encuentro: totem,
  info: totem,
  senal(d, [w, p, h], c) {
    const panel = Math.min(w * 0.75, h * 0.45);
    d.cil(0, 0, 0.03, 0.03, 0, h - panel, '#3a3d42', 'estructura');
    d.caja(-w / 2, w / 2, -Math.max(p, 0.02) / 2, Math.max(p, 0.02) / 2, h - panel, h, c);
  },
  marcador(d, [w, , h], c) {
    const r = Math.max(w * 0.35, 0.15);
    d.cil(0, 0, 0.03, 0.03, 0, Math.max(h - r * 2, 0.01), c, 'estructura');
    d.esfera(0, 0, Math.max(h - r, r), r, c);
  },
  medicion(d, [w, , h], c) {
    d.cil(0, 0, 0.13, 0.13, 0, h * 0.75, '#2b2d31', 'estructura', 0.6);
    d.caja(-Math.max(w * 0.2, 0.06), Math.max(w * 0.2, 0.06), -0.04, 0.04, h * 0.75, h, c);
  },
  // Vallado: un paño por tramo de la línea y un poste en cada módulo.
  vallado(d, [, , h], c, o) {
    const puntos = lineaLocal(o);
    const alto = h || 1.1;
    const modulo = Number(o.modulo) > 0.3 ? Number(o.modulo) : 2.5;
    for (let i = 1; i < puntos.length; i++) {
      const [ax, ay] = puntos[i - 1];
      const [bx, by] = puntos[i];
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-3) continue;
      const nx = (-(by - ay) / L) * 0.0125;
      const ny = ((bx - ax) / L) * 0.0125;
      const v = [];
      for (const [x, y] of [[ax + nx, ay + ny], [ax - nx, ay - ny], [bx + nx, by + ny], [bx - nx, by - ny]]) for (const z of [alto * 0.07, alto * 0.93]) v.push([x, y, z]);
      d.solido(v, c, 'claro', 0.6);
      const n = Math.max(1, Math.round(L / modulo));
      for (let k = 0; k <= n; k++) d.cil(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, 0.025, 0.025, 0, alto, c, 'metal', 0.6);
    }
  },
};

/* ------------------------------------------------------------------ niveles de cada objeto */

// Alturas que importan de cada objeto (absolutas, desde el piso). prioridad: 3 = arriba de todo,
// 2 = nivel intermedio importante (alero, parte de abajo de lo colgado), 1 = base de algo elevado.
function nivelesDe(o, [w, p, h], e) {
  if (o.tipo === 'persona') return [];
  const nombre = nombreDe(o);
  const lista = [{ z: e + h, nombre, sufijo: '', prioridad: 3, tipo: o.tipo, id: o.id }];
  const agregar = (z, sufijo, prioridad) => lista.push({ z, nombre, sufijo, prioridad, tipo: o.tipo, id: o.id });
  if (o.tipo === 'casita') {
    const { alero, tirante } = medidasCasita(o, w, h);
    lista[0].sufijo = 'cumbrera';
    agregar(e + (alero > 0 ? alero : tirante), alero > 0 ? 'postes' : 'tirante', 2);
    if (e > 0.05) agregar(e, 'base', 1);
  } else if (o.tipo === 'truss' && !(h > Math.max(w, p))) {
    agregar(e, 'abajo', 2);
  } else if ((o.tipo === 'luz' || o.tipo === 'par') && e >= 1.8) {
    // Colgada: importa la parte de abajo (altura libre); arriba es donde se cuelga (el truss ya lo dice).
    lista[0].prioridad = 1;
    agregar(e, 'abajo', 2);
  } else if ((o.tipo === 'luz' || o.tipo === 'par' || o.tipo === 'pantalla') && e > 0.05) {
    agregar(e, 'abajo', 2);
  } else if (e > 0.05 && o.tipo !== 'arbol') {
    agregar(e, 'base', 1);
  }
  return lista;
}

const etiquetaNivel = (n) => (n.sufijo ? `${n.nombre} (${n.sufijo})` : n.nombre);

// Junta los niveles que caen a menos de 1,5 cm y les arma un rótulo.
function unirNiveles(lista) {
  const orden = lista.filter((n) => Number.isFinite(n.z) && n.z > 0.005).sort((a, b) => a.z - b.z);
  const grupos = [];
  for (const n of orden) {
    const g = grupos[grupos.length - 1];
    if (g && n.z - g.z0 <= 0.015) g.items.push(n);
    else grupos.push({ z0: n.z, items: [n] });
  }
  const res = [{ z: 0, etiqueta: 'Piso', ids: new Set(), prioridad: 4 }];
  for (const g of grupos) {
    const max = Math.max(...g.items.map((i) => i.prioridad));
    const top = g.items.filter((i) => i.prioridad === max);
    const n0 = top[0];
    let etiqueta;
    if (top.length === 1) etiqueta = etiquetaNivel(n0);
    else if (top.every((i) => i.tipo === n0.tipo && i.sufijo === n0.sufijo)) {
      etiqueta = `${defDatos({ tipo: n0.tipo }).nombre} × ${top.length}${n0.sufijo ? ` (${n0.sufijo})` : ''}`;
    } else etiqueta = `${etiquetaNivel(n0)} y ${top.length - 1} más`;
    res.push({ z: n0.z, etiqueta, ids: new Set(top.map((i) => i.id)), prioridad: max });
  }
  return res;
}

/* ------------------------------------------------------------------ proyección */

// Proyecta los objetos elegidos sobre un plano vertical.
//   escena: la escena. ids: ids de los objetos (los que no se ven en alzado se ignoran).
//   lado: 'frente' | 'costado' | 'fondo' | 'otro-costado'. referencia: id del objeto que da la dirección.
//   tema: 'papel' (colores para imprimir) u 'oscuro' (para la vista previa en la app).
//   escalaHumana: agrega una persona de 1,75 m al costado si no hay ninguna entre los elegidos.
// Devuelve { lado, titulo, referencia, nombreReferencia, der, visor, objetos, formas, niveles, caja }:
//   formas: [{ tipo: 'poligono'|'linea'|'circulo', puntos: [[u, z], ...], r, rx, relleno, trazo, grosor,
//            orden, id, caja }] ya ordenadas de atrás hacia adelante (orden creciente). En 'circulo', puntos
//            tiene el centro, r es el radio vertical y rx el horizontal.
//   objetos: [{ id, nombre, tipo, u0, u1, base, arriba, dims, niveles, estimado, escala, ancla }].
//   niveles: alturas unidas para acotar [{ z, etiqueta, ids, prioridad }] (incluye el piso).
export function proyectarElevacion(escena, ids, { lado = 'frente', referencia, tema = 'papel', escalaHumana = false } = {}) {
  const todos = Array.isArray(escena?.objetos) ? escena.objetos : [];
  const porId = new Map(todos.filter((o) => o && o.id !== undefined).map((o) => [o.id, o]));
  const vistos = new Set();
  const sel = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const o = porId.get(id);
    if (o && !vistos.has(id) && dibujable(o)) {
      vistos.add(id);
      sel.push(o);
    }
  }
  const l = normalizarLado(lado);
  const pedida = porId.get(referencia);
  const ref = pedida && Array.isArray(pedida.pos) ? pedida : referenciaPorDefecto(sel);
  const { visor, der } = direcciones(ref, l);
  const origen = ref ? [num(ref.pos[0]), num(ref.pos[1])] : [0, 0];
  const vista = { visor, der, origen };

  const crudas = [];
  const objetos = [];
  const dibujar = (o, escala = false) => {
    const dims = dimsDe(o);
    const desde = crudas.length;
    const d = lapiz(o, dims, vista, crudas);
    (DIBUJO[o.tipo] || cajaSimple)(d, dims, colorDe(o), o);
    const propias = crudas.slice(desde);
    const cj = propias.length ? cajaDeFormas(propias) : { u0: d.U(0, 0), u1: d.U(0, 0), z0: d.e, z1: d.e + dims[2] };
    let ancla = [(cj.u0 + cj.u1) / 2, (cj.z0 + cj.z1) / 2];
    if (o.tipo === 'casita') {
      const { alero } = medidasCasita(o, dims[0], dims[2]);
      ancla = [d.U(0, 0), d.e + (alero > 0 ? dims[2] - 0.3 * (dims[2] - alero) : dims[2] * 0.68)];
    }
    objetos.push({
      id: o.id, nombre: nombreDe(o), tipo: o.tipo, u0: cj.u0, u1: cj.u1, z0: cj.z0, z1: cj.z1,
      base: d.e, arriba: d.e + dims[2], dims, cerca: d.D(0, 0), niveles: escala ? [] : nivelesDe(o, dims, d.e),
      estimado: esEstimado(o), escala, ancla,
    });
  };
  for (const o of sel) dibujar(o);

  // Persona de referencia, parada al costado de todo y mirando al que mira.
  if (escalaHumana && sel.length && !sel.some((o) => o.tipo === 'persona')) {
    const cj = cajaDeFormas(crudas);
    const cMax = Math.max(...crudas.map((f) => f.cercaMax));
    const u = cj.u1 + 0.8 + 0.25;
    const pos = [origen[0] + der[0] * u + visor[0] * cMax, origen[1] + der[1] * u + visor[1] * cMax];
    const rot = (Math.atan2(-visor[0], visor[1]) * 180) / Math.PI;
    dibujar({ id: '__persona-escala', tipo: 'persona', nombre: 'Persona (escala)', pos, rot, dims: [0.5, 0.3, 1.75] }, true);
  }

  // Colores: lo lejano más claro (o más apagado en el tema oscuro).
  const cs = crudas.map((f) => f.cercaMax);
  const cMax = cs.length ? Math.max(...cs) : 0;
  const cMin = cs.length ? Math.min(...cs) : 0;
  const R = Math.max(cMax - cMin, 4);
  const pintar = tema === 'oscuro' ? pintarOscuro : pintarPapel;
  const formas = crudas
    .map((f) => {
      const fade = limitar((cMax - f.cercaMax) / R, 0, 0.85);
      const relleno = f.tipo === 'linea' ? 'none' : pintar(f.rol, f.color, fade);
      const trazo = f.rol === 'led' ? f.color : trazoDe(tema, fade);
      return { ...f, relleno, trazo, fade };
    })
    .sort((A, B) => A.cerca - B.cerca || A.seq - B.seq)
    .map((f, i) => {
      const { seq, cercaMax, color, rol, ...resto } = f;
      return { ...resto, rol, orden: i };
    });

  const caja = formas.length ? cajaDeFormas(formas) : { u0: 0, u1: 0, z0: 0, z1: 0 };
  return {
    lado: l,
    titulo: LADOS[l].titulo,
    referencia: ref?.id ?? null,
    nombreReferencia: ref ? nombreDe(ref) : '',
    der,
    visor,
    objetos,
    formas,
    niveles: unirNiveles(objetos.flatMap((o) => o.niveles)),
    caja,
  };
}

function pintarPapel(rol, color, f) {
  const aclarar = (c, base, extra) => mezclar(c, '#ffffff', Math.min(base + extra * f, 0.95));
  switch (rol) {
    case 'oscuro': return aclarar('#1a1a1a', 0.12, 0.45);
    case 'pantalla': return aclarar('#2a2c31', 0.08, 0.45);
    case 'imagen': return aclarar(mezclar(color, '#2a2c31', 0.45), 0.1, 0.45);
    case 'estructura': return aclarar(color, 0.42, 0.4);
    case 'techo': return aclarar(color, 0.74, 0.18);
    case 'claro': return aclarar(color, 0.72, 0.2);
    case 'metal': return aclarar(color, 0.5, 0.4);
    case 'copa': return aclarar(color, 0.8, 0.15);
    case 'tronco': return aclarar(color, 0.5, 0.35);
    default: return aclarar(color, 0.6, 0.3);
  }
}

function pintarOscuro(rol, color, f) {
  const fondo = '#0A0A0A';
  const apagar = (c) => mezclar(c, fondo, 0.6 * f);
  switch (rol) {
    case 'oscuro': return apagar('#0e0e10');
    case 'pantalla': return apagar('#141518');
    case 'imagen': return apagar(mezclar(color, '#141518', 0.3));
    case 'estructura': return apagar(mezclar(color, '#FAFAFA', 0.14));
    case 'techo': return apagar(mezclar(color, '#FAFAFA', 0.26));
    case 'claro': return apagar(mezclar(color, '#FAFAFA', 0.3));
    case 'metal': return apagar(mezclar(color, fondo, 0.35));
    case 'copa': case 'tronco': return apagar(mezclar(color, fondo, 0.4));
    default: return apagar(mezclar(color, '#FAFAFA', 0.2));
  }
}

const trazoDe = (tema, f) => (tema === 'oscuro' ? mezclar('#E6E6E6', '#0A0A0A', 0.62 * f) : mezclar(TINTA, '#ffffff', 0.62 * f));

/* ------------------------------------------------------------------ qué se acota */

const unicos = (lista, tol) => {
  const r = [];
  for (const v of [...lista].filter(Number.isFinite).sort((a, b) => a - b)) if (!r.length || v - r[r.length - 1] > tol) r.push(v);
  return r;
};

// Columnas verticales: objetos que se tocan uno arriba del otro (apoyados o colgados) y se solapan en
// horizontal. Devuelve los caminos de abajo hacia arriba (tarima → casita, sub → sub → top, cabezal → truss).
function caminosVerticales(cuerpos) {
  const arriba = new Map(cuerpos.map((c) => [c.id, []]));
  const tieneAbajo = new Set();
  for (const A of cuerpos) {
    for (const B of cuerpos) {
      if (A === B) continue;
      const solape = Math.min(A.u1, B.u1) - Math.max(A.u0, B.u0);
      const angosto = Math.min(A.u1 - A.u0, B.u1 - B.u0);
      if (Math.abs(A.arriba - B.base) <= 0.02 && solape >= 0.3 * angosto && solape > 0) {
        arriba.get(A.id).push(B);
        tieneAbajo.add(B.id);
      }
    }
  }
  const caminos = [];
  const recorrer = (c, camino) => {
    if (caminos.length >= 60) return;
    const sig = arriba.get(c.id).filter((x) => !camino.includes(x));
    if (!sig.length) caminos.push([...camino, c]);
    else for (const s of sig) recorrer(s, [...camino, c]);
  };
  for (const c of cuerpos) if (!tieneAbajo.has(c.id)) recorrer(c, []);
  return caminos;
}

// Todo lo que se acota, en metros de la vista: niveles, cadenas de cada columna, filas de abajo y de arriba.
function planCotas(proy) {
  const cuerpos = proy.objetos.filter((o) => !o.escala && o.tipo !== 'persona' && o.tipo !== 'arbol');
  const caminos = caminosVerticales(cuerpos);
  const pilas = [];
  for (const cam of caminos) {
    const zs = unicos([0, ...cam.flatMap((o) => [o.base, o.arriba, ...o.niveles.map((n) => n.z)])], 0.01);
    if (zs.length < 3) continue;
    const tope = cam[cam.length - 1];
    pilas.push({
      ids: new Set(cam.map((o) => o.id)),
      zs,
      u0: tope.u0,
      u1: tope.u1,
      clave: zs.map((z) => z.toFixed(2)).join('|'),
    });
  }
  // Fila 1: los bordes de cada columna (sin lo muy finito, como un neón visto de costado).
  const columnas = caminos
    .map((cam) => ({ u0: Math.min(...cam.map((o) => o.u0)), u1: Math.max(...cam.map((o) => o.u1)), base: Math.min(...cam.map((o) => o.base)) }))
    .filter((c) => c.u1 - c.u0 >= 0.12);
  let bordes = unicos(columnas.flatMap((c) => [c.u0, c.u1]), 0.04);
  if (bordes.length > 14) bordes = unicos(columnas.filter((c) => c.base <= 0.05).flatMap((c) => [c.u0, c.u1]), 0.04);
  const filas = [];
  if (cuerpos.length) {
    const total = [Math.min(...cuerpos.map((o) => o.u0)), Math.max(...cuerpos.map((o) => o.u1))];
    if (bordes.length >= 3) filas.push({ us: bordes, tipo: 'cadena' });
    const ref = cuerpos.find((o) => o.id === proy.referencia);
    if (ref) {
      const ancho = ref.u1 - ref.u0;
      const yaEsta = bordes.some((b, i) => i && Math.abs(bordes[i - 1] - ref.u0) < 0.03 && Math.abs(b - ref.u1) < 0.03);
      if (Math.abs(ancho - (total[1] - total[0])) > 0.02 && !yaEsta && ancho > 0.05) filas.push({ us: [ref.u0, ref.u1], tipo: 'referencia' });
    }
    if (total[1] - total[0] > 0.01) filas.push({ us: total, tipo: 'total' });
  }
  // Fila de arriba: dónde cuelga cada luz a lo largo del truss.
  let filaSup = null;
  const colgadas = cuerpos.filter((o) => (o.tipo === 'luz' || o.tipo === 'par') && o.base >= 1.8);
  if (colgadas.length >= 2) {
    const centros = colgadas.map((o) => (o.u0 + o.u1) / 2);
    const tope = Math.max(...colgadas.map((o) => o.arriba));
    const truss = cuerpos.filter((o) => o.tipo === 'truss' && o.base >= tope - 0.05 && centros.some((c) => c >= o.u0 && c <= o.u1));
    filaSup = unicos([...centros, ...truss.flatMap((t) => [t.u0, t.u1])], 0.02);
    if (filaSup.length < 2) filaSup = null;
  }
  const altoTotal = cuerpos.length ? Math.max(...cuerpos.map((o) => o.arriba)) : 0;
  const masAlto = cuerpos.find((o) => Math.abs(o.arriba - altoTotal) < 1e-6);
  return { niveles: proy.niveles, pilas, filas, filaSup, altoTotal, masAlto };
}

// Borde izquierdo y derecho de la silueta de unos objetos a una altura z (corta los polígonos).
function bordesA(formas, ids, z) {
  let min = Infinity;
  let max = -Infinity;
  const tomar = (u) => {
    min = Math.min(min, u);
    max = Math.max(max, u);
  };
  for (const f of formas) {
    if (!ids.has(f.id) || z < f.caja.z0 - 1e-4 || z > f.caja.z1 + 1e-4) continue;
    if (f.tipo === 'circulo') {
      const [u, cz] = f.puntos[0];
      const q = 1 - ((z - cz) / f.r) ** 2;
      if (q >= 0) {
        tomar(u - (f.rx ?? f.r) * Math.sqrt(q));
        tomar(u + (f.rx ?? f.r) * Math.sqrt(q));
      }
      continue;
    }
    const P = f.puntos;
    const cerrada = f.tipo === 'poligono';
    for (let i = 0; i < P.length; i++) {
      const A = P[i];
      if (Math.abs(A[1] - z) < 1e-4) tomar(A[0]);
      if (!cerrada && i === P.length - 1) break;
      const B = P[(i + 1) % P.length];
      if ((A[1] - z) * (B[1] - z) < 0) tomar(A[0] + ((B[0] - A[0]) * (z - A[1])) / (B[1] - A[1]));
    }
  }
  return { min, max };
}

/* ------------------------------------------------------------------ dibujo de la vista */

const ESTILO_PAPEL = {
  u: 1, t: 1.9, tNivel: 2, tNombre: 1.75, fuente: FUENTE, tinta: TINTA, gris: GRIS, cota: TINTA, guia: '#b9b9b9',
  suelo: '#7a7a7a', trazo: 0.22, fina: 0.1, wCota: 0.13, wTick: 0.25, nombresMax: 34, acento: ACENTO, fondoEtiqueta: '#ffffff',
};
const ESTILO_PANTALLA = {
  u: 4.2, t: 10.5, tNivel: 10.5, tNombre: 10, fuente: 'General Sans, Helvetica, Arial, sans-serif', tinta: '#FAFAFA',
  gris: '#9b9b9b', cota: '#E8AA4C', guia: '#3b3b3b', suelo: '#8a8a8a', trazo: 1.1, fina: 0.6, wCota: 0.9, wTick: 1.3,
  nombresMax: 150, acento: '#2447F5', fondoEtiqueta: '#0A0A0A',
};

function txt(x, y, s, est, { t = est.t, peso = 400, color = est.tinta, ancla = 'start', rot = 0, base = 'auto' } = {}) {
  const r = rot ? ` transform="rotate(${n2(rot)} ${n2(x)} ${n2(y)})"` : '';
  const b = base !== 'auto' ? ` dominant-baseline="${base}"` : '';
  return `<text x="${n2(x)}" y="${n2(y)}" font-family="${est.fuente}" font-size="${n2(t)}" font-weight="${peso}" fill="${color}" text-anchor="${ancla}"${b}${r}>${esc(s)}</text>`;
}

const raya = (a, b, color, w, dash = '') => linea(a, b, { w, color, dash });

function marca(x, y, est) {
  const s = 0.8 * est.u;
  return raya([x - s, y + s], [x + s, y - s], est.cota, est.wTick);
}

function formaSVG(f, X, Y, k, est) {
  const w = n2(est.trazo * (f.grosor ?? 1));
  if (f.tipo === 'circulo') {
    const [u, z] = f.puntos[0];
    const ry = f.r * k;
    const rx = (f.rx ?? f.r) * k;
    if (Math.abs(rx - ry) < 0.01) return `<circle cx="${n2(X(u))}" cy="${n2(Y(z))}" r="${n2(ry)}" fill="${f.relleno}" stroke="${f.trazo}" stroke-width="${w}"/>`;
    return `<ellipse cx="${n2(X(u))}" cy="${n2(Y(z))}" rx="${n2(Math.max(rx, 0.01))}" ry="${n2(ry)}" fill="${f.relleno}" stroke="${f.trazo}" stroke-width="${w}"/>`;
  }
  const p = pts(f.puntos.map(([u, z]) => [X(u), Y(z)]));
  if (f.tipo === 'linea') return `<polyline points="${p}" fill="none" stroke="${f.trazo}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  return `<polygon points="${p}" fill="${f.relleno}" stroke="${f.trazo}" stroke-width="${w}" stroke-linejoin="round"/>`;
}

// Reparte posiciones (ordenadas de menor a mayor) para que queden a "gap" como mínimo, entre lo y hi.
function repartir(ys, gap, lo, hi) {
  const r = [...ys];
  for (let i = 1; i < r.length; i++) if (r[i] < r[i - 1] + gap) r[i] = r[i - 1] + gap;
  if (r.length && r[r.length - 1] > hi) {
    r[r.length - 1] = hi;
    for (let i = r.length - 2; i >= 0; i--) if (r[i] > r[i + 1] - gap) r[i] = r[i + 1] - gap;
  }
  if (r.length && r[0] < lo) {
    const paso = r.length > 1 ? (hi - lo) / (r.length - 1) : 0;
    return r.map((_, i) => lo + paso * i);
  }
  return r;
}

// Espacio que necesitan las cotas alrededor del dibujo (en unidades del estilo: mm de papel o px).
function margenes(plan, est, conTitulo) {
  const u = est.u;
  const valorW = Math.max(...plan.niveles.map((n) => anchoTexto(textoNivel(n.z), est.tNivel) * 1.1), 0);
  const nombresW = Math.min(est.nombresMax, Math.max(0, ...plan.niveles.map((n) => anchoTexto(n.etiqueta, est.tNombre))));
  const izq = 10 * u + 2 * u + valorW + 1.4 * u + nombresW + u;
  const der = 9 * u + 0.7 * u + est.t * 1.2 + u;
  const nf = plan.filas.length;
  let abajo = nf ? 7 * u + 6.5 * u * (nf - 1) + 2 * u : 4 * u;
  if (conTitulo) abajo += 9 * u;
  const arriba = (plan.filaSup ? 7 * u + est.t : 2 * u) + est.tNivel;
  return { izq, der, abajo, arriba, valorW, nombresW };
}

// Cadena vertical de cotas en x, con los textos del lado "lado" (−1 izquierda, 1 derecha).
function cadenaV(x, zs, Y, est, lado) {
  const partes = [raya([x, Y(zs[0])], [x, Y(zs[zs.length - 1])], est.cota, est.wCota)];
  for (const z of zs) partes.push(marca(x, Y(z), est));
  const off = 0.7 * est.u + est.t * 0.6;
  for (let i = 1; i < zs.length; i++) {
    const largo = Y(zs[i - 1]) - Y(zs[i]);
    const s = fm(zs[i] - zs[i - 1]);
    if (largo >= anchoTexto(s, est.t) + 0.8 * est.u) {
      partes.push(txt(x + lado * off, (Y(zs[i - 1]) + Y(zs[i])) / 2, s, est, { color: est.cota, ancla: 'middle', rot: -90, base: 'middle' }));
    }
  }
  return partes.join('');
}

// Cadena horizontal de cotas en y, con los textos arriba de la línea.
function cadenaH(y, us, X, est) {
  const partes = [raya([X(us[0]), y], [X(us[us.length - 1]), y], est.cota, est.wCota)];
  for (const u of us) partes.push(marca(X(u), y, est));
  for (let i = 1; i < us.length; i++) {
    const largo = X(us[i]) - X(us[i - 1]);
    const s = fm(us[i] - us[i - 1]);
    const ancho = anchoTexto(s, est.t);
    const ty = y - 0.9 * est.u;
    if (largo >= ancho + 0.8 * est.u) partes.push(txt((X(us[i - 1]) + X(us[i])) / 2, ty, s, est, { color: est.cota, ancla: 'middle' }));
    else if (i === 1) partes.push(txt(X(us[0]) - 1.2 * est.u, ty, s, est, { color: est.cota, ancla: 'end' }));
    else if (i === us.length - 1) partes.push(txt(X(us[i]) + 1.2 * est.u, ty, s, est, { color: est.cota }));
  }
  return partes.join('');
}

// Dibuja la vista completa: guías (debajo de los objetos), objetos, suelo, niveles, cadenas y anchos.
// geo: { X, Y, k, yArriba, yAbajo } con X(u) e Y(z) en unidades del estilo.
function dibujarVista(proy, plan, geo, est) {
  const { X, Y, k } = geo;
  const u = est.u;
  const debajo = [];
  const encima = [];
  const { caja } = proy;
  const formas = proy.formas;
  const guia = (a, b) => debajo.push(raya(a, b, est.guia, est.fina, `${n2(1.2 * u)} ${n2(0.8 * u)}`));
  const y0 = Y(0);

  // Suelo con rayado.
  const xs0 = X(caja.u0) - 6 * u;
  const xs1 = X(caja.u1) + 6 * u;
  encima.push(raya([xs0, y0], [xs1, y0], est.tinta, est.trazo * 1.6));
  let rayado = '';
  for (let x = xs0 + 1.6 * u; x <= xs1 + 1e-6; x += 1.6 * u) rayado += raya([x, y0], [x - 1.4 * u, y0 + 1.4 * u], est.suelo, est.fina);
  encima.push(rayado);

  // Niveles a la izquierda: línea de ordenadas, marca en cada altura y rótulo con el valor y de qué es.
  const xO = X(caja.u0) - 10 * u;
  const valorW = Math.max(...plan.niveles.map((n) => anchoTexto(textoNivel(n.z), est.tNivel) * 1.1));
  const xValor = xO - 2 * u;
  const xNombre = xValor - valorW - 1.4 * u;
  const nombresW = Math.min(est.nombresMax, Math.max(0, ...plan.niveles.map((n) => anchoTexto(n.etiqueta, est.tNombre))));
  const gap = est.tNivel * 1.3;
  let niveles = [...plan.niveles].sort((a, b) => b.z - a.z);
  const caben = Math.max(2, Math.floor((geo.yAbajo - geo.yArriba) / gap) + 1);
  for (const p of [1, 2]) if (niveles.length > caben) niveles = niveles.filter((n) => n.prioridad > p || n === niveles[0]);
  const yl = repartir(niveles.map((n) => Y(n.z)), gap, geo.yArriba + est.tNivel * 0.6, geo.yAbajo);
  encima.push(raya([xO, y0], [xO, Y(niveles[0].z)], est.cota, est.wCota));
  niveles.forEach((n, i) => {
    const y = Y(n.z);
    encima.push(marca(xO, y, est));
    if (n.z > 0.005) {
      const b = bordesA(formas, n.ids, n.z);
      if (Number.isFinite(b.min)) guia([X(b.min) - 0.6 * u, y], [xO + 0.8 * u, y]);
    }
    encima.push(`<polyline points="${pts([[xO - 0.4 * u, y], [xValor + 0.9 * u, yl[i]], [xValor + 0.3 * u, yl[i]]])}" fill="none" stroke="${est.cota}" stroke-width="${n2(est.fina)}"/>`);
    encima.push(txt(xValor, yl[i] + est.tNivel * 0.36, textoNivel(n.z), est, { t: est.tNivel, peso: 700, color: est.cota, ancla: 'end' }));
    encima.push(txt(xNombre, yl[i] + est.tNombre * 0.36, recortar(n.etiqueta, est.tNombre, nombresW), est, { t: est.tNombre, color: est.gris, ancla: 'end' }));
  });

  // Cadenas de cada columna (tarima + estructura, pila de parlantes…), al costado de lo que acotan. Si no
  // hay lugar de ningún lado, no se dibuja (los niveles de la izquierda ya dicen las alturas).
  const ocupado = [];
  const choca = (r, ids) =>
    ocupado.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0) ||
    formas.some((f) => {
      if (ids.has(f.id)) return false;
      const fx0 = X(f.caja.u0) + 0.15 * u;
      const fx1 = X(f.caja.u1) - 0.15 * u;
      const fy0 = Y(f.caja.z1) + 0.15 * u;
      const fy1 = Y(f.caja.z0) - 0.15 * u;
      return r.x0 < fx1 && r.x1 > fx0 && r.y0 < fy1 && r.y1 > fy0;
    });
  const medio = (caja.u0 + caja.u1) / 2;
  const porClave = new Map();
  for (const p of plan.pilas) {
    if (!porClave.has(p.clave)) porClave.set(p.clave, []);
    porClave.get(p.clave).push(p);
  }
  for (const grupo of porClave.values()) {
    grupo.sort((a, b) => b.u1 - a.u1);
    for (const p of grupo) {
      const ladoPref = (p.u0 + p.u1) / 2 <= medio ? -1 : 1;
      let hecho = false;
      for (const lado of [ladoPref, -ladoPref]) {
        const x = lado < 0 ? X(p.u0) - 3.5 * u : X(p.u1) + 3.5 * u;
        const ancho = 0.7 * u + est.t * 1.1 + 0.3 * u;
        const r = lado < 0 ? { x0: x - ancho, x1: x + 0.5 * u } : { x0: x - 0.5 * u, x1: x + ancho };
        r.y0 = Y(p.zs[p.zs.length - 1]) - 0.5 * u;
        r.y1 = Y(p.zs[0]);
        if (choca(r, p.ids)) continue;
        ocupado.push(r);
        encima.push(cadenaV(x, p.zs, Y, est, lado));
        for (const z of p.zs) {
          if (z < 0.005) continue;
          const b = bordesA(formas, p.ids, z);
          const borde = lado < 0 ? b.min : b.max;
          if (Number.isFinite(borde)) guia([X(borde) - lado * 0.6 * u, Y(z)], [x - lado * 0.8 * u, Y(z)]);
        }
        hecho = true;
        break;
      }
      if (hecho) break;
    }
  }

  // Alto total a la derecha.
  if (plan.altoTotal > 0.01) {
    const x = X(caja.u1) + 9 * u;
    encima.push(cadenaV(x, [0, plan.altoTotal], Y, est, 1));
    const b = plan.masAlto ? bordesA(formas, new Set([plan.masAlto.id]), plan.altoTotal) : { max: -Infinity };
    if (Number.isFinite(b.max)) guia([X(b.max) + 0.6 * u, Y(plan.altoTotal)], [x + 0.8 * u, Y(plan.altoTotal)]);
    guia([xs1, y0], [x + 0.8 * u, y0]);
  }

  // Anchos abajo: bordes de cada columna, ancho de la referencia y ancho total.
  plan.filas.forEach((fila, i) => {
    const y = y0 + 7 * u + 6.5 * u * i;
    for (const v of fila.us) encima.push(raya([X(v), y0 + 1.2 * u], [X(v), y + 1 * u], est.guia, est.fina));
    encima.push(cadenaH(y, fila.us, X, est));
  });

  // Arriba: posición de cada luz colgada a lo largo del truss.
  if (plan.filaSup) {
    const y = Y(caja.z1) - 6 * u;
    for (const v of plan.filaSup) encima.push(raya([X(v), Y(caja.z1) - 0.8 * u], [X(v), y - 1 * u], est.guia, est.fina));
    encima.push(cadenaH(y, plan.filaSup, X, est));
  }

  return { debajo: debajo.join(''), formas: formas.map((f) => formaSVG(f, X, Y, k, est)).join(''), encima: encima.join('') };
}

// Ubica la vista centrada en un rectángulo { x, y, w, h } con escala k (unidades del estilo por metro).
function ubicar(proy, mg, rect, k, est) {
  const anchoM = Math.max(proy.caja.u1 - proy.caja.u0, 0.1);
  const altoM = Math.max(proy.caja.z1, 0.5);
  const bloqueW = mg.izq + anchoM * k + mg.der;
  const bloqueH = mg.arriba + altoM * k + mg.abajo;
  const x0 = rect.x + (rect.w - bloqueW) / 2;
  const y0 = rect.y + (rect.h - bloqueH) / 2;
  const X = (u) => x0 + mg.izq + (u - proy.caja.u0) * k;
  const Y = (z) => y0 + mg.arriba + (altoM - z) * k;
  return { X, Y, k, x0, y0, bloqueW, bloqueH, yArriba: y0, yAbajo: Y(0) + 2 * est.u };
}

/* ------------------------------------------------------------------ hoja para imprimir */

// Una hoja SVG (mm) con la vista, las cotas, las referencias y el cuadro de datos.
//   vista: { id, nombre, ids, lado, referencia, escala?, persona? } (de escena.vistas).
//   escala: denominador fijo (por ejemplo 25); si falta, la más grande que entra (1:20, 1:25, 1:50…).
//   persona: false para no dibujar la silueta de escala.
export function hojaElevacion(escena, comp, op, vista, { numeroHoja = 1, totalHojas = 1 } = {}) {
  const [W, H] = tamanoPapel(op);
  const { m, dib, col, banda } = marco(W, H);
  const v = vista || {};
  const lado = normalizarLado(v.lado);
  const proy = proyectarElevacion(escena, v.ids || [], { lado, referencia: v.referencia, tema: 'papel', escalaHumana: v.persona !== false });
  const nombreVista = v.nombre || (proy.nombreReferencia ? `${LADOS[lado].corto} de ${proy.nombreReferencia}` : 'Sin nombre');
  const titulo = `${LADOS[lado].titulo}: ${nombreVista}`;
  const est = ESTILO_PAPEL;
  const codigos = codigosDe(proy, comp);
  let N = 50;
  let k = 1000 / N;
  let cuerpo = '';

  if (proy.objetos.length) {
    const plan = planCotas(proy);
    const mg = margenes(plan, est, true);
    const anchoM = Math.max(proy.caja.u1 - proy.caja.u0, 0.1);
    const altoM = Math.max(proy.caja.z1, 0.5);
    const entra = (n) => mg.izq + anchoM * (1000 / n) + mg.der <= dib.w - 4 && mg.arriba + altoM * (1000 / n) + mg.abajo <= dib.h - 4;
    N = Number(v.escala) >= 1 ? Number(v.escala) : ESCALAS.find(entra) || ESCALAS[ESCALAS.length - 1];
    k = 1000 / N;
    const geo = ubicar(proy, mg, dib, k, est);
    const partes = dibujarVista(proy, plan, geo, est);
    cuerpo = partes.debajo + partes.formas + partes.encima + etiquetas(proy, geo, codigos, est);
    // Título del dibujo, centrado debajo de las cotas.
    const yt = geo.y0 + geo.bloqueH - 3.2;
    const cx = geo.x0 + geo.bloqueW / 2;
    const t1 = recortar(`${LADOS[lado].titulo}: ${nombreVista}`.toUpperCase(), 2.6, dib.w - 60);
    const ancho = anchoTexto(t1, 2.6) * 1.05 + anchoTexto(`  Escala 1:${N}`, 2) + 2;
    cuerpo += txt(cx - ancho / 2, yt, t1, est, { t: 2.6, peso: 700 }) + txt(cx + ancho / 2, yt, `Escala 1:${N}`, est, { t: 2, color: GRIS, ancla: 'end' });
    cuerpo += raya([cx - ancho / 2, yt + 1.2], [cx + ancho / 2, yt + 1.2], TINTA, 0.3);
  } else {
    cuerpo = txt(dib.x + dib.w / 2, dib.y + dib.h / 2, 'Esta vista no tiene objetos para dibujar.', est, { t: 3, color: GRIS, ancla: 'middle' });
  }

  // Columna (o franja de abajo en hoja vertical): título, referencias, notas, escala y cuadro de datos.
  let colS = `<rect x="${n2(col.x)}" y="${n2(col.y)}" width="${n2(col.w)}" height="${n2(col.h)}" fill="#fff" stroke="${TINTA}" stroke-width="0.35"/>`;
  const derW = banda ? Math.min(100, col.w * 0.45) : col.w;
  const derX = col.x + col.w - derW;
  const limite = col.y + col.h - 40 - 22;
  if (banda) colS += raya([derX, col.y], [derX, col.y + col.h], TINTA, 0.2);
  colS += columnaElevacion(proy, codigos, { titulo: LADOS[lado].titulo, nombreVista, x: col.x, y: col.y, w: banda ? col.w - derW : col.w, limite: banda ? col.y + col.h - 6 : limite, banda });
  colS += barraEscala(derX + 6, col.y + col.h - 40 - 14, k, derW - 45);
  colS += txt(derX + derW - 4, col.y + col.h - 40 - 12.5, 'Medidas en metros', est, { t: 1.8, color: GRIS, ancla: 'end' });
  colS += cuadroDatos(escena, op, derX, col.y + col.h - 40, derW, N, numeroHoja, totalHojas, titulo).s;

  const idClip = `elevacion-${numeroHoja}`;
  return svgHoja(W, H, [
    `<clipPath id="${idClip}"><rect x="${n2(dib.x)}" y="${n2(dib.y)}" width="${n2(dib.w)}" height="${n2(dib.h)}"/></clipPath>`,
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
    `<rect x="${m}" y="${m}" width="${n2(W - 2 * m)}" height="${n2(H - 2 * m)}" fill="none" stroke="${TINTA}" stroke-width="0.5"/>`,
    `<g clip-path="url(#${idClip})">`,
    cuerpo,
    `</g>`,
    colS,
  ]);
}

// Número de cada objeto: el mismo del listado de materiales (comp.codigoDe). Sin cómputo, se numeran en orden.
function codigosDe(proy, comp) {
  const res = new Map();
  if (comp?.codigoDe instanceof Map) {
    for (const o of proy.objetos) if (comp.codigoDe.has(o.id)) res.set(o.id, comp.codigoDe.get(o.id));
    return res;
  }
  let n = 0;
  const vistos = new Map();
  for (const o of [...proy.objetos].filter((x) => !x.escala).sort((a, b) => a.u0 - b.u0)) {
    const clave = `${o.tipo}|${o.dims.map((d) => d.toFixed(2)).join('x')}`;
    if (!vistos.has(clave)) vistos.set(clave, ++n);
    res.set(o.id, vistos.get(clave));
  }
  return res;
}

// Círculos con el número de cada objeto, sobre el dibujo (corridos si se pisan).
function etiquetas(proy, geo, codigos, est) {
  const { X, Y } = geo;
  const puestos = [];
  let s = '';
  for (const o of proy.objetos) {
    const codigo = codigos.get(o.id);
    if (o.escala || codigo === undefined) continue;
    const chico = (o.u1 - o.u0) * geo.k < 5 || (o.z1 - o.z0) * geo.k < 5;
    const r = chico ? 1.4 : 1.8;
    let p = chico ? [X(o.u1) + r + 0.4, Y(o.z1) - r - 0.2] : [X(o.ancla[0]), Y(o.ancla[1])];
    for (let i = 0; i < 10 && puestos.some(([x, y, rr]) => Math.hypot(x - p[0], y - p[1]) < r + rr + 0.4); i++) p = [p[0] + r * 2 + 0.6, p[1]];
    puestos.push([p[0], p[1], r]);
    s += `<circle cx="${n2(p[0])}" cy="${n2(p[1])}" r="${r}" fill="#fff" stroke="${est.acento}" stroke-width="0.25"/>`;
    s += txt(p[0], p[1] + 0.05, String(codigo), est, { t: chico ? 1.5 : 1.9, peso: 700, color: est.acento, ancla: 'middle', base: 'middle' });
  }
  return s;
}

// Referencias de la columna: número, nombre y alturas de cada objeto (los iguales, agrupados).
function columnaElevacion(proy, codigos, { titulo, nombreVista, x, y: yIni, w, limite, banda }) {
  const est = ESTILO_PAPEL;
  let s = '';
  let y = yIni + 7;
  s += txt(x + 4, y, titulo, est, { t: 3, peso: 700 });
  y += 4.6;
  for (const l of envolver(nombreVista, 2.1, w - 8, 2)) {
    s += txt(x + 4, y, l, est, { t: 2.1, color: GRIS });
    y += 3.2;
  }
  if (proy.nombreReferencia) {
    s += txt(x + 4, y, recortar(`Mirando desde el ${proy.lado === 'fondo' ? 'fondo' : proy.lado === 'frente' ? 'frente' : 'costado'} de: ${proy.nombreReferencia}`, 1.7, w - 8), est, { t: 1.7, color: GRIS });
    y += 3.4;
  }
  y += 3;
  s += txt(x + 4, y, 'Referencias', est, { t: 2.4, peso: 700 });
  y += 4.6;
  const grupos = new Map();
  for (const o of proy.objetos) {
    if (o.escala) continue;
    const codigo = codigos.get(o.id);
    const clave = [codigo ?? '', o.tipo, o.base.toFixed(2), o.arriba.toFixed(2), o.dims.map((d) => d.toFixed(2)).join('x')].join('|');
    if (!grupos.has(clave)) grupos.set(clave, { codigo, lista: [] });
    grupos.get(clave).lista.push(o);
  }
  const entradas = [...grupos.values()].sort((a, b) => (a.codigo ?? 1e9) - (b.codigo ?? 1e9) || b.lista[0].arriba - a.lista[0].arriba);
  const nCol = banda ? Math.max(1, Math.floor(w / 62)) : 1;
  const cw = w / nCol;
  const yTope = y;
  let c = 0;
  let estimados = false;
  let cortadas = 0;
  for (const g of entradas) {
    if (y + 6 > limite) {
      if (c + 1 < nCol) {
        c++;
        y = yTope;
      } else {
        cortadas++;
        continue;
      }
    }
    const o = g.lista[0];
    const n = g.lista.length;
    const est0 = g.lista.some((x) => x.estimado);
    estimados ||= est0;
    const xx = x + c * cw;
    const nombre = (n > 1 ? `${defDatos({ tipo: o.tipo }).nombre} × ${n}` : o.nombre) + (est0 ? ' *' : '');
    if (g.codigo !== undefined) {
      s += `<circle cx="${n2(xx + 6)}" cy="${n2(y - 0.8)}" r="1.5" fill="#fff" stroke="${ACENTO}" stroke-width="0.22"/>`;
      s += txt(xx + 6, y - 0.75, String(g.codigo), est, { t: 1.6, peso: 700, color: ACENTO, ancla: 'middle', base: 'middle' });
    } else s += txt(xx + 6, y, '—', est, { t: 1.8, color: GRIS, ancla: 'middle' });
    s += txt(xx + 9.5, y, recortar(nombre, 2, cw - 12), est, { t: 2, peso: 600 });
    y += 2.8;
    const [dw, dp, dh] = o.dims;
    const detalle = o.base > 0.005
      ? `Base ${textoNivel(o.base)} · arriba ${textoNivel(o.arriba)} · ${fm(dw)} × ${fm(dp)} × ${fm(dh)} m`
      : `Arriba ${textoNivel(o.arriba)} · ${fm(dw)} × ${fm(dp)} × ${fm(dh)} m`;
    s += txt(xx + 9.5, y, recortar(detalle, 1.65, cw - 12), est, { t: 1.65, color: GRIS });
    y += 3.6;
  }
  if (cortadas) {
    s += txt(x + 4 + c * cw, Math.min(y, limite), `y ${cortadas} más (ver la planta y el listado).`, est, { t: 1.8, color: GRIS });
    y += 3.6;
  }
  const notas = [];
  if (estimados) notas.push('* Medida estimada: confirmar en el lugar.');
  if (proy.objetos.some((o) => o.escala)) notas.push('La silueta de 1,75 m es para dar escala.');
  notas.push('Alturas desde el piso (±0,00). Los números son los del listado de materiales.');
  if (!banda) {
    y += 1.5;
    for (const nota of notas) {
      for (const l of envolver(nota, 1.7, w - 8, 3)) {
        if (y > limite) break;
        s += txt(x + 4, y, l, est, { t: 1.7, color: GRIS });
        y += 2.8;
      }
    }
  }
  return s;
}

// Hojas extra para generarHojas() de plano2d.js: una por cada vista de escena.vistas.
//   → { paginas, crear(primeraHoja, totalHojas) => [svg, ...] }. Sin vistas, 0 páginas.
export function hojasElevaciones(escena, comp, op) {
  const ids = new Set((escena?.objetos || []).filter(dibujable).map((o) => o.id));
  const vistas = (Array.isArray(escena?.vistas) ? escena.vistas : []).filter((v) => v && Array.isArray(v.ids) && v.ids.some((id) => ids.has(id)));
  return {
    paginas: vistas.length,
    crear: (primeraHoja, totalHojas) => vistas.map((v, i) => hojaElevacion(escena, comp, op, v, { numeroHoja: primeraHoja + i, totalHojas })),
  };
}

/* ------------------------------------------------------------------ vista previa en la app */

// SVG en píxeles para mostrar en pantalla (fondo transparente, pensado para el tema oscuro).
export function elevacionSVG(escena, ids, { lado = 'frente', referencia, ancho = 800, alto = 500, persona = true } = {}) {
  const est = ESTILO_PANTALLA;
  const abrir = `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(ancho)}" height="${n2(alto)}" viewBox="0 0 ${n2(ancho)} ${n2(alto)}" font-family="${est.fuente}">`;
  const proy = proyectarElevacion(escena, ids, { lado, referencia, tema: 'oscuro', escalaHumana: persona });
  if (!proy.objetos.length) {
    return abrir + txt(ancho / 2, alto / 2, 'Elegí uno o más objetos para ver su vista de frente.', est, { color: est.gris, ancla: 'middle' }) + '</svg>';
  }
  const plan = planCotas(proy);
  const mg = margenes(plan, est, false);
  const pad = 6;
  const anchoM = Math.max(proy.caja.u1 - proy.caja.u0, 0.1);
  const altoM = Math.max(proy.caja.z1, 0.5);
  let k = Math.min((ancho - 2 * pad - mg.izq - mg.der) / anchoM, (alto - 2 * pad - mg.arriba - mg.abajo) / altoM);
  if (!(k > 0)) k = 1;
  const geo = ubicar(proy, mg, { x: pad, y: pad, w: ancho - 2 * pad, h: alto - 2 * pad }, k, est);
  const partes = dibujarVista(proy, plan, geo, est);
  return abrir + partes.debajo + partes.formas + partes.encima + '</svg>';
}

/* ------------------------------------------------------------------ vistas sugeridas */

// Vista de frente de la cabina del DJ: la cabina, la estructura y la tarima donde está, y lo de sonido y
// luces que tiene cerca (hasta 2 m). Devuelve { id, nombre, ids, lado, referencia } o null si no hay cabina.
export function vistaPorDefecto(escena) {
  const objs = (escena?.objetos || []).filter(dibujable);
  const cajaPlanta = (o) => {
    const [w, p] = dimsDe(o);
    const t = rad(o.rot);
    const c = Math.abs(Math.cos(t));
    const s = Math.abs(Math.sin(t));
    const hx = (w * c + p * s) / 2;
    const hy = (w * s + p * c) / 2;
    return { minX: num(o.pos[0]) - hx, maxX: num(o.pos[0]) + hx, minY: num(o.pos[1]) - hy, maxY: num(o.pos[1]) + hy };
  };
  const dentro = (o, [x, y]) => {
    const [w, p] = dimsDe(o);
    const t = rad(o.rot);
    const dx = x - num(o.pos[0]);
    const dy = y - num(o.pos[1]);
    return Math.abs(dx * Math.cos(t) + dy * Math.sin(t)) <= w / 2 + 1e-6 && Math.abs(-dx * Math.sin(t) + dy * Math.cos(t)) <= p / 2 + 1e-6;
  };
  const SONIDO_LUCES = new Set(['parlante', 'sub', 'luz', 'par', 'truss', 'pantalla', 'tela', 'cabina_dj', 'escalera']);
  let semilla = objs.find((o) => o.tipo === 'cabina_dj' && objs.some((x) => (x.tipo === 'casita' || x.tipo === 'tarima') && dentro(x, o.pos)));
  semilla ||= objs.find((o) => o.tipo === 'cabina_dj');
  if (!semilla) {
    // Sin cabina: la tarima o estructura con más sonido cerca.
    let mejor = 0;
    for (const o of objs.filter((x) => x.tipo === 'tarima' || x.tipo === 'casita')) {
      const n = objs.filter((x) => (x.tipo === 'parlante' || x.tipo === 'sub') && Math.hypot(num(x.pos[0]) - num(o.pos[0]), num(x.pos[1]) - num(o.pos[1])) < 6).length;
      if (n > mejor) {
        mejor = n;
        semilla = o;
      }
    }
  }
  if (!semilla) return null;
  const nucleo = [semilla, ...objs.filter((o) => o !== semilla && (o.tipo === 'casita' || o.tipo === 'tarima') && dentro(o, semilla.pos))];
  const cj = nucleo.map(cajaPlanta).reduce((A, B) => ({ minX: Math.min(A.minX, B.minX), maxX: Math.max(A.maxX, B.maxX), minY: Math.min(A.minY, B.minY), maxY: Math.max(A.maxY, B.maxY) }));
  const cerca = (o) => {
    const b = cajaPlanta(o);
    const dx = Math.max(cj.minX - b.maxX, b.minX - cj.maxX, 0);
    const dy = Math.max(cj.minY - b.maxY, b.minY - cj.maxY, 0);
    return Math.hypot(dx, dy) <= 2;
  };
  const extra = objs.filter((o) => !nucleo.includes(o) && SONIDO_LUCES.has(o.tipo) && cerca(o));
  const ids = [...nucleo, ...extra].map((o) => o.id);
  const ref = nucleo.find((o) => o.tipo === 'casita') || nucleo.find((o) => o.tipo === 'tarima') || semilla;
  return { id: 'vista-cabina', nombre: semilla.tipo === 'cabina_dj' ? 'Frente de la cabina' : `Frente de ${nombreDe(semilla)}`, ids, lado: 'frente', referencia: ref.id };
}

// Entrada nueva para escena.vistas a partir de una selección (para el botón "Vista de frente de la
// selección"). No modifica la escena: el que llama la agrega.
export function nuevaVista(escena, ids, lado = 'frente', nombre) {
  const l = normalizarLado(lado);
  const porId = new Map((escena?.objetos || []).map((o) => [o.id, o]));
  const sel = (ids || []).map((id) => porId.get(id)).filter(dibujable);
  const ref = referenciaPorDefecto(sel);
  const usados = new Set((Array.isArray(escena?.vistas) ? escena.vistas : []).map((v) => v?.id));
  let i = 1;
  while (usados.has(`vista-${i}`)) i++;
  return {
    id: `vista-${i}`,
    nombre: nombre || (ref ? `${LADOS[l].corto} de ${nombreDe(ref)}` : LADOS[l].titulo),
    ids: sel.map((o) => o.id),
    lado: l,
    referencia: ref?.id ?? null,
  };
}
