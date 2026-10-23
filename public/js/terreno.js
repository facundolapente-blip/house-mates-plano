// Terreno con desniveles para los predios al aire libre. escena.terreno = { puntos: [[x, y, z], ...] }: alturas
// medidas en algunos puntos (z en metros y relativa: lo que importa es la diferencia entre puntos). Los puntos se
// unen en triángulos (Delaunay) para saber la altura en cualquier lugar, la pendiente, las curvas de nivel, dónde
// se junta el agua si llueve y cuánto hay que calzar una tarima o una barra.
//
// Las funciones aceptan escena.terreno, la lista de puntos sola o la escena entera. Lo que se arma con los puntos
// (triángulos e índice para buscar rápido) se guarda y se vuelve a armar solo si los puntos cambian.
//
// Ejes: x a la derecha, y hacia abajo en la planta, z hacia arriba. En el 3D (Three.js) es (x, z, y).

import { puntosMundo, esPoligono, puntoEnPoligono, cajaDe } from './geometria.js';
import { esc, fm, numero } from './formato.js';

const FUENTE = 'General Sans, Helvetica, Arial, sans-serif';
const COLOR_CURVA = '#a67c52';
const COLOR_AGUA = '#2447F5';
const r3 = (n) => Math.round(n * 1000) / 1000;
const n2 = (v) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ puntos */

function listaDe(terreno) {
  if (Array.isArray(terreno)) return terreno;
  if (Array.isArray(terreno?.puntos)) return terreno.puntos;
  if (Array.isArray(terreno?.terreno?.puntos)) return terreno.terreno.puntos;
  return null;
}

// Puntos que se pueden leer, sin repetidos (dos puntos a menos de 0,1 mm son el mismo; su altura se promedia).
// origen: índice en la lista original del primero de cada uno.
function unicos(lista) {
  const X = [];
  const Y = [];
  const Z = [];
  const cuenta = [];
  const origen = [];
  const vistos = new Map();
  lista.forEach((p, i) => {
    if (!Array.isArray(p) || p.length < 2) return;
    const x = numero(p[0]);
    const y = numero(p[1]);
    const z = numero(p[2]) ?? 0;
    if (x === null || y === null) return;
    const clave = `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
    const k = vistos.get(clave);
    if (k !== undefined) {
      Z[k] = (Z[k] * cuenta[k] + z) / (cuenta[k] + 1);
      cuenta[k]++;
      return;
    }
    vistos.set(clave, X.length);
    X.push(x);
    Y.push(y);
    Z.push(z);
    cuenta.push(1);
    origen.push(i);
  });
  return { X, Y, Z, origen };
}

/* ------------------------------------------------------------------ triangulación (Bowyer–Watson) */

// Triángulos de Delaunay sobre puntos sin repetir. Devuelve [[a, b, c], ...] en sentido antihorario (área
// positiva con la fórmula de areaFirmada). Para que los puntos en grilla o alineados (muy comunes cuando se
// mide cada tantos metros) no traben el cálculo, la conexión se decide con los puntos corridos una diez
// millonésima del tamaño del terreno; después se descartan los triángulos chatos del borde y se completa lo
// que falte para que el borde quede convexo.
function delaunay(X, Y) {
  const n = X.length;
  if (n < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, X[i]);
    maxX = Math.max(maxX, X[i]);
    minY = Math.min(minY, Y[i]);
    maxY = Math.max(maxY, Y[i]);
  }
  const tam = Math.max(maxX - minX, maxY - minY) || 1;
  const cruzOrig = (a, b, c) => (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]);
  // Todos alineados: no hay superficie.
  let a0 = 0;
  let b0 = 0;
  for (let i = 1; i < n; i++) if (Math.hypot(X[i] - X[a0], Y[i] - Y[a0]) > Math.hypot(X[b0] - X[a0], Y[b0] - Y[a0])) b0 = i;
  let lejos = 0;
  for (let i = 0; i < n; i++) lejos = Math.max(lejos, Math.abs(cruzOrig(a0, b0, i)));
  if (lejos <= 1e-9 * tam * tam) return [];

  // Coordenadas corridas apenas (siempre igual: el resultado no cambia de una vez a la otra).
  let semilla = 20261212;
  const azar = () => {
    semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0;
    return semilla / 4294967296 - 0.5;
  };
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const PX = new Float64Array(n + 3);
  const PY = new Float64Array(n + 3);
  for (let i = 0; i < n; i++) {
    PX[i] = X[i] - cx + azar() * tam * 1e-7;
    PY[i] = Y[i] - cy + azar() * tam * 1e-7;
  }
  // Súper triángulo que contiene todo.
  const R = tam * 100;
  PX[n] = -R;
  PY[n] = -R;
  PX[n + 1] = R;
  PY[n + 1] = -R;
  PX[n + 2] = 0;
  PY[n + 2] = R;

  const crear = (a, b, c) => {
    const bx = PX[b] - PX[a];
    const by = PY[b] - PY[a];
    const qx = PX[c] - PX[a];
    const qy = PY[c] - PY[a];
    const d = 2 * (bx * qy - by * qx);
    if (Math.abs(d) < 1e-300) return { a, b, c, x: 0, y: 0, r2: Infinity };
    const b2 = bx * bx + by * by;
    const c2 = qx * qx + qy * qy;
    const ux = (qy * b2 - by * c2) / d;
    const uy = (bx * c2 - qx * b2) / d;
    return { a, b, c, x: PX[a] + ux, y: PY[a] + uy, r2: ux * ux + uy * uy };
  };
  let tris = [crear(n, n + 1, n + 2)];
  const N = n + 3;
  for (let i = 0; i < n; i++) {
    const px = PX[i];
    const py = PY[i];
    const quedan = [];
    const borde = new Map();
    for (const t of tris) {
      const dx = px - t.x;
      const dy = py - t.y;
      if (dx * dx + dy * dy < t.r2) {
        for (const [p, q] of [
          [t.a, t.b],
          [t.b, t.c],
          [t.c, t.a],
        ]) {
          const k = p < q ? p * N + q : q * N + p;
          if (borde.has(k)) borde.delete(k);
          else borde.set(k, [p, q]);
        }
      } else quedan.push(t);
    }
    for (const [p, q] of borde.values()) quedan.push(crear(p, q, i));
    tris = quedan;
  }

  // Con las coordenadas reales: sin los vértices del súper triángulo, sin triángulos chatos y en sentido
  // antihorario.
  const tol = 1e-6 * tam * tam;
  const res = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const cr = cruzOrig(t.a, t.b, t.c);
    if (Math.abs(cr) <= tol) continue;
    res.push(cr > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]);
  }
  convexificar(res, X, Y, tol);
  return res;
}

// Aristas del borde (las que tiene un solo triángulo), con el interior a la izquierda: Map a → b.
function bordeDe(tris) {
  const usos = new Map();
  for (const [a, b, c] of tris) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = p < q ? `${p},${q}` : `${q},${p}`;
      const u = usos.get(k);
      if (u) u.n++;
      else usos.set(k, { p, q, n: 1 });
    }
  }
  const borde = new Map();
  for (const { p, q, n } of usos.values()) if (n === 1) borde.set(p, q);
  return borde;
}

// Si al borde le quedó algún entrante (puede pasar con el súper triángulo finito), se rellena con triángulos
// hasta que sea convexo.
function convexificar(tris, X, Y, tol) {
  const cruz = (a, b, c) => (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]);
  const dentro = (a, b, c, p) => cruz(a, b, p) > tol && cruz(b, c, p) > tol && cruz(c, a, p) > tol;
  for (let vueltas = 0; vueltas < 5000; vueltas++) {
    const borde = bordeDe(tris);
    let agregado = false;
    for (const [a, b] of borde) {
      const c = borde.get(b);
      if (c === undefined || c === a) continue;
      if (cruz(a, b, c) >= -tol) continue;
      let libre = true;
      for (let p = 0; p < X.length && libre; p++) if (p !== a && p !== b && p !== c && dentro(a, c, b, p)) libre = false;
      if (!libre) continue;
      tris.push([a, c, b]);
      agregado = true;
      break;
    }
    if (!agregado) return;
  }
}

// Triángulos de Delaunay de una lista de puntos [[x, y], ...] o [[x, y, z], ...]: [[i, j, k], ...] con los
// índices de la lista original, en sentido antihorario. Los repetidos se usan una sola vez y los que no se
// pueden leer se saltean. Con menos de 3 puntos distintos, o todos alineados, devuelve [].
export function triangular(puntos) {
  if (!Array.isArray(puntos)) return [];
  const u = unicos(puntos);
  return delaunay(u.X, u.Y).map((t) => t.map((i) => u.origen[i]));
}

/* ------------------------------------------------------------------ terreno preparado */

const guardados = new WeakMap();

function firmaDe(lista) {
  let s = lista.length;
  for (const p of lista) {
    if (!Array.isArray(p)) continue;
    s = (s * 31 + (Number(p[0]) || 0) * 1.7 + (Number(p[1]) || 0) * 3.1 + (Number(p[2]) || 0) * 5.3) % 1e12;
  }
  return s;
}

function construir(lista) {
  const { X, Y, Z } = unicos(lista);
  const n = X.length;
  if (!n) return null;
  const tris = delaunay(X, Y);
  let minimo = Infinity;
  let maximo = -Infinity;
  for (const z of Z) {
    minimo = Math.min(minimo, z);
    maximo = Math.max(maximo, z);
  }
  const caja = cajaDe(X.map((x, i) => [x, Y[i]]));
  // Pendiente (gradiente) de cada triángulo y su caja, para buscar rápido.
  const grad = [];
  const area = [];
  const calidad = [];
  for (const [a, b, c] of tris) {
    const e1x = X[b] - X[a];
    const e1y = Y[b] - Y[a];
    const e2x = X[c] - X[a];
    const e2y = Y[c] - Y[a];
    const d = e1x * e2y - e1y * e2x;
    const dz1 = Z[b] - Z[a];
    const dz2 = Z[c] - Z[a];
    grad.push([(dz1 * e2y - dz2 * e1y) / d, (e1x * dz2 - e2x * dz1) / d]);
    area.push(d / 2);
    const largo = Math.max(Math.hypot(e1x, e1y), Math.hypot(e2x, e2y), Math.hypot(X[c] - X[b], Y[c] - Y[b]));
    calidad.push(d / largo); // la menor de las tres alturas del triángulo
  }
  const vecinos = Array.from({ length: n }, () => new Set());
  for (const [a, b, c] of tris) {
    vecinos[a].add(b).add(c);
    vecinos[b].add(a).add(c);
    vecinos[c].add(a).add(b);
  }
  // Aristas del borde con su triángulo.
  const usos = new Map();
  tris.forEach(([a, b, c], k) => {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const clave = p < q ? p * n + q : q * n + p;
      const u = usos.get(clave);
      if (u) u.n++;
      else usos.set(clave, { p, q, tri: k, n: 1 });
    }
  });
  const borde = [...usos.values()].filter((u) => u.n === 1).map(({ p, q, tri }) => [p, q, tri]);
  const enBorde = new Uint8Array(n);
  for (const [p, q] of borde) enBorde[p] = enBorde[q] = 1;

  // Índice: grilla de celdas con los triángulos que tocan cada una.
  const lado = Math.max(1, Math.round(Math.sqrt(tris.length)));
  const ancho = caja.maxX - caja.minX || 1;
  const alto = caja.maxY - caja.minY || 1;
  const indice = { x0: caja.minX, y0: caja.minY, cw: ancho / lado, ch: alto / lado, nx: lado, ny: lado, celdas: Array.from({ length: lado * lado }, () => []) };
  const celda = (v, v0, c, nn) => Math.min(nn - 1, Math.max(0, Math.floor((v - v0) / c)));
  tris.forEach(([a, b, c], k) => {
    const i0 = celda(Math.min(X[a], X[b], X[c]), indice.x0, indice.cw, lado);
    const i1 = celda(Math.max(X[a], X[b], X[c]), indice.x0, indice.cw, lado);
    const j0 = celda(Math.min(Y[a], Y[b], Y[c]), indice.y0, indice.ch, lado);
    const j1 = celda(Math.max(Y[a], Y[b], Y[c]), indice.y0, indice.ch, lado);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) indice.celdas[j * lado + i].push(k);
  });
  return { __terreno: true, n, X, Y, Z, tris, grad, area, calidad, vecinos, borde, enBorde, minimo, maximo, caja, indice };
}

// Arma (o reutiliza) los triángulos y el índice de un terreno. Devuelve null si no hay ningún punto.
export function prepararTerreno(terreno) {
  if (terreno?.__terreno) return terreno;
  const lista = listaDe(terreno);
  if (!lista) return null;
  const firma = firmaDe(lista);
  const g = guardados.get(lista);
  if (g && g.firma === firma) return g.prep;
  const prep = construir(lista);
  guardados.set(lista, { firma, prep });
  return prep;
}

// Triángulo que contiene el punto, con la altura interpolada, o null si el punto queda afuera.
function ubicar(t, x, y) {
  const g = t.indice;
  if (!t.tris.length || x < t.caja.minX || x > t.caja.maxX || y < t.caja.minY || y > t.caja.maxY) return null;
  const i = Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.x0) / g.cw)));
  const j = Math.min(g.ny - 1, Math.max(0, Math.floor((y - g.y0) / g.ch)));
  const { X, Y, Z } = t;
  for (const k of g.celdas[j * g.nx + i]) {
    const [a, b, c] = t.tris[k];
    const d = 2 * t.area[k];
    const wb = ((x - X[a]) * (Y[c] - Y[a]) - (y - Y[a]) * (X[c] - X[a])) / d;
    const wc = ((X[b] - X[a]) * (y - Y[a]) - (Y[b] - Y[a]) * (x - X[a])) / d;
    const wa = 1 - wb - wc;
    const eps = -1e-9;
    if (wa >= eps && wb >= eps && wc >= eps) return { tri: k, z: wa * Z[a] + wb * Z[b] + wc * Z[c] };
  }
  return null;
}

// Punto más cercano del borde: afuera de los puntos medidos el terreno sigue con la altura del borde (sin
// inventar pendientes).
function bordeCercano(t, x, y) {
  const { X, Y, Z } = t;
  let mejor = { d: Infinity, z: 0, tri: 0 };
  for (const [p, q, tri] of t.borde) {
    const dx = X[q] - X[p];
    const dy = Y[q] - Y[p];
    const L2 = dx * dx + dy * dy;
    const u = L2 ? Math.max(0, Math.min(1, ((x - X[p]) * dx + (y - Y[p]) * dy) / L2)) : 0;
    const d = (x - X[p] - u * dx) ** 2 + (y - Y[p] - u * dy) ** 2;
    if (d < mejor.d) mejor = { d, z: Z[p] + u * (Z[q] - Z[p]), tri };
  }
  return mejor;
}

// Promedio pesado por la distancia (cuando los puntos no alcanzan para triángulos: 1 o 2, o todos alineados).
function promedioPesado(t, x, y) {
  let s = 0;
  let w = 0;
  for (let i = 0; i < t.n; i++) {
    const d2 = (x - t.X[i]) ** 2 + (y - t.Y[i]) ** 2;
    if (d2 < 1e-12) return t.Z[i];
    s += t.Z[i] / d2;
    w += 1 / d2;
  }
  return w ? s / w : 0;
}

function altura(t, x, y) {
  if (t.n === 1) return t.Z[0];
  if (!t.tris.length) return promedioPesado(t, x, y);
  const u = ubicar(t, x, y);
  return u ? u.z : bordeCercano(t, x, y).z;
}

// Altura del terreno en (x, y): interpolada en el triángulo que lo contiene; afuera de los puntos medidos, la
// del punto más cercano del borde. Sin terreno, 0.
export function alturaEn(terreno, x, y) {
  const t = prepararTerreno(terreno);
  return t ? altura(t, x, y) : 0;
}

function pendienteDe(t, x, y) {
  if (!t.tris.length) return 0;
  const u = ubicar(t, x, y);
  const [gx, gy] = t.grad[u ? u.tri : bordeCercano(t, x, y).tri];
  return Math.hypot(gx, gy) * 100;
}

// Pendiente en (x, y), en %: 2 = baja 2 cm por metro. Afuera de los puntos medidos, la del triángulo del borde
// más cercano. Sin terreno, 0.
export function pendienteEn(terreno, x, y) {
  const t = prepararTerreno(terreno);
  return t ? pendienteDe(t, x, y) : 0;
}

/* ------------------------------------------------------------------ malla para el 3D */

const PASOS = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];

// Malla de grilla regular sobre los puntos medidos más un margen, lista para un BufferGeometry de Three.js:
// posiciones = (x, altura, y) por vértice, indices = dos triángulos por celda con la cara hacia arriba.
// paso: lado de cada celda en metros (por defecto, uno redondo para tener unas 120 celdas por lado; nunca más
// de 400 × 400). minimo y maximo: alturas de la malla. Sin terreno, null.
export function mallaTerreno(terreno, { margen = 10, paso } = {}) {
  const t = prepararTerreno(terreno);
  if (!t) return null;
  const x0 = t.caja.minX - margen;
  const y0 = t.caja.minY - margen;
  const ancho = Math.max(t.caja.maxX + margen - x0, 0.5);
  const alto = Math.max(t.caja.maxY + margen - y0, 0.5);
  let p = Number(paso) > 0 ? Number(paso) : PASOS.find((v) => v >= Math.max(ancho, alto) / 120) || Math.max(ancho, alto) / 120;
  while (Math.ceil(ancho / p) > 400 || Math.ceil(alto / p) > 400) p *= 2;
  const nx = Math.max(1, Math.ceil(ancho / p));
  const ny = Math.max(1, Math.ceil(alto / p));
  const posiciones = new Float32Array((nx + 1) * (ny + 1) * 3);
  let minimo = Infinity;
  let maximo = -Infinity;
  let k = 0;
  for (let j = 0; j <= ny; j++) {
    const y = y0 + j * p;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * p;
      const z = altura(t, x, y);
      minimo = Math.min(minimo, z);
      maximo = Math.max(maximo, z);
      posiciones[k++] = x;
      posiciones[k++] = z;
      posiciones[k++] = y;
    }
  }
  const indices = new Uint32Array(nx * ny * 6);
  k = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = d;
      indices[k++] = a;
      indices[k++] = d;
      indices[k++] = b;
    }
  }
  return { posiciones, indices, minimo, maximo, paso: p, columnas: nx + 1, filas: ny + 1, caja: { minX: x0, minY: y0, maxX: x0 + nx * p, maxY: y0 + ny * p } };
}

/* ------------------------------------------------------------------ curvas de nivel */

// Curvas de nivel cada "equidistancia" metros, sobre los triángulos (solo donde hay puntos medidos):
// [{ nivel, lineas: [[[x, y], ...], ...] }]. Las líneas cerradas repiten el primer punto al final. Si saldrían
// más de 300 curvas, la equidistancia se duplica hasta que no.
export function curvasDeNivel(terreno, equidistancia = 0.25) {
  const t = prepararTerreno(terreno);
  if (!t || !t.tris.length) return [];
  let eq = Number(equidistancia) > 0 ? Number(equidistancia) : 0.25;
  while ((t.maximo - t.minimo) / eq > 300) eq *= 2;
  const res = [];
  const { X, Y, Z, n } = t;
  for (let m = Math.ceil(t.minimo / eq - 1e-9); m * eq <= t.maximo + 1e-9; m++) {
    const nivel = Math.round(m * eq * 1e6) / 1e6;
    const puntos = new Map();
    const segs = [];
    const corte = (p, q) => {
      const clave = p < q ? p * n + q : q * n + p;
      if (!puntos.has(clave)) {
        const u = (nivel - Z[p]) / (Z[q] - Z[p]);
        puntos.set(clave, [r3(X[p] + u * (X[q] - X[p])), r3(Y[p] + u * (Y[q] - Y[p]))]);
      }
      return clave;
    };
    for (const [a, b, c] of t.tris) {
      const arriba = [Z[a] >= nivel, Z[b] >= nivel, Z[c] >= nivel];
      if (arriba[0] === arriba[1] && arriba[1] === arriba[2]) continue;
      const claves = [];
      if (arriba[0] !== arriba[1]) claves.push(corte(a, b));
      if (arriba[1] !== arriba[2]) claves.push(corte(b, c));
      if (arriba[2] !== arriba[0]) claves.push(corte(c, a));
      if (claves.length === 2) segs.push(claves);
    }
    if (!segs.length) continue;
    // Unir los segmentos: dos triángulos vecinos comparten el punto de corte de su arista común.
    const porClave = new Map();
    segs.forEach(([k1, k2], s) => {
      for (const k of [k1, k2]) {
        if (!porClave.has(k)) porClave.set(k, []);
        porClave.get(k).push(s);
      }
    });
    const usado = new Uint8Array(segs.length);
    const caminar = (s0, k0) => {
      const linea = [puntos.get(k0)];
      let s = s0;
      let k = k0;
      while (s !== undefined && !usado[s]) {
        usado[s] = 1;
        const [k1, k2] = segs[s];
        k = k1 === k ? k2 : k1;
        const q = puntos.get(k);
        const ult = linea[linea.length - 1];
        if (Math.abs(q[0] - ult[0]) > 1e-6 || Math.abs(q[1] - ult[1]) > 1e-6) linea.push(q);
        s = porClave.get(k).find((x) => !usado[x]);
      }
      return linea;
    };
    const lineas = [];
    for (const [k, lista] of porClave) if (lista.length === 1 && !usado[lista[0]]) lineas.push(caminar(lista[0], k));
    for (let s = 0; s < segs.length; s++) if (!usado[s]) lineas.push(caminar(s, segs[s][0]));
    const buenas = lineas.filter((l) => l.length >= 2);
    if (buenas.length) res.push({ nivel, lineas: buenas });
  }
  return res;
}

/* ------------------------------------------------------------------ agua */

function bajosDe(t, minimo = 0.01) {
  if (!t || t.n < 4 || !t.tris.length) return [];
  const { n, Z, X, Y } = t;
  // Nivel al que llega el agua en cada punto antes de rebalsar hacia afuera (inundación desde el borde: el
  // agua de un punto sale por el camino cuyo punto más alto es el más bajo posible).
  const agua = new Float64Array(n).fill(Infinity);
  const visto = new Uint8Array(n);
  const monton = [];
  const subir = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (monton[p][0] <= monton[i][0]) break;
      [monton[p], monton[i]] = [monton[i], monton[p]];
      i = p;
    }
  };
  const sacar = () => {
    const top = monton[0];
    const ult = monton.pop();
    if (monton.length) {
      monton[0] = ult;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < monton.length && monton[l][0] < monton[m][0]) m = l;
        if (r < monton.length && monton[r][0] < monton[m][0]) m = r;
        if (m === i) break;
        [monton[m], monton[i]] = [monton[i], monton[m]];
        i = m;
      }
    }
    return top;
  };
  const meter = (nivel, i) => {
    monton.push([nivel, i]);
    subir(monton.length - 1);
  };
  for (let i = 0; i < n; i++) {
    if (t.enBorde[i]) {
      agua[i] = Z[i];
      meter(Z[i], i);
    }
  }
  while (monton.length) {
    const [nivel, v] = sacar();
    if (visto[v]) continue;
    visto[v] = 1;
    for (const u of t.vecinos[v]) {
      if (visto[u]) continue;
      const w = Math.max(Z[u], nivel);
      if (w < agua[u]) {
        agua[u] = w;
        meter(w, u);
      }
    }
  }
  // Charcos: grupos de puntos vecinos que quedan bajo el agua.
  const grupo = new Int32Array(n).fill(-1);
  const res = [];
  for (let i = 0; i < n; i++) {
    if (grupo[i] !== -1 || !(agua[i] - Z[i] > 1e-6)) continue;
    const pila = [i];
    grupo[i] = res.length;
    let hondo = i;
    let cuenta = 0;
    while (pila.length) {
      const v = pila.pop();
      cuenta++;
      if (Z[v] < Z[hondo]) hondo = v;
      for (const u of t.vecinos[v]) {
        if (grupo[u] === -1 && agua[u] - Z[u] > 1e-6) {
          grupo[u] = res.length;
          pila.push(u);
        }
      }
    }
    res.push({ x: X[hondo], y: Y[hondo], z: Z[hondo], profundidad: r3(agua[hondo] - Z[hondo]), nivelAgua: agua[hondo], puntos: cuenta });
  }
  return res.filter((b) => b.profundidad >= minimo).sort((a, b) => b.profundidad - a.profundidad);
}

// Puntos bajos donde se junta el agua si llueve: [{ x, y, z, profundidad, nivelAgua, puntos }], del más hondo
// al menos hondo. profundidad: cuánto puede subir el agua ahí antes de escurrir hacia afuera (m). Solo cuentan
// los charcos de al menos "minimo" metros y los puntos interiores (por el borde el agua se va).
export function puntosBajos(terreno, { minimo = 0.01 } = {}) {
  return bajosDe(prepararTerreno(terreno), minimo);
}

/* ------------------------------------------------------------------ objetos sobre el terreno */

// Puntos de la planta debajo de un objeto: grilla sobre su planta (esquinas, centro y algunos más si es grande).
function muestrasBajo(o) {
  const t = ((o.rot || 0) * Math.PI) / 180;
  const co = Math.cos(t);
  const si = Math.sin(t);
  const mundo = ([lx, ly]) => [o.pos[0] + lx * co - ly * si, o.pos[1] + lx * si + ly * co];
  const poli = esPoligono(o);
  const local = poli ? o.puntos : null;
  const c = poli ? cajaDe(local) : { minX: -o.dims[0] / 2, maxX: o.dims[0] / 2, minY: -o.dims[1] / 2, maxY: o.dims[1] / 2 };
  const lado = Math.max(c.maxX - c.minX, c.maxY - c.minY);
  const k = Math.min(9, Math.max(3, 2 * Math.ceil(lado / 4) + 1));
  const res = poli ? puntosMundo(o) : [];
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < k; i++) {
      const lx = c.minX + ((c.maxX - c.minX) * i) / (k - 1);
      const ly = c.minY + ((c.maxY - c.minY) * j) / (k - 1);
      if (!poli || puntoEnPoligono(lx, ly, local)) res.push(mundo([lx, ly]));
    }
  }
  return res;
}

// Altura del terreno debajo de un objeto (esquinas, centro y puntos intermedios): { minimo, maximo,
// diferencia, bajo: [x, y], alto: [x, y] }. null sin terreno.
export function desnivelBajo(o, terreno) {
  const t = prepararTerreno(terreno);
  if (!t || !Array.isArray(o?.pos) || !Array.isArray(o?.dims)) return null;
  let minimo = Infinity;
  let maximo = -Infinity;
  let bajo = o.pos;
  let alto = o.pos;
  for (const q of muestrasBajo(o)) {
    const z = altura(t, q[0], q[1]);
    if (z < minimo) [minimo, bajo] = [z, q];
    if (z > maximo) [maximo, alto] = [z, q];
  }
  return { minimo: r3(minimo), maximo: r3(maximo), diferencia: r3(maximo - minimo), bajo: bajo.map(r3), alto: alto.map(r3) };
}

const ARTICULO = {
  tarima: 'la tarima',
  barra: 'la barra',
  cabina_dj: 'la cabina',
  casita: 'la estructura',
  carpa: 'la carpa',
  generador: 'el generador',
  bano_quimico: 'el baño',
  foodtruck: 'el food truck',
  heladera: 'la heladera',
};

// Renglón para el inspector: "Desnivel bajo la tarima: 18 cm". Sin terreno, ''.
export function textoDesnivel(o, terreno) {
  const d = desnivelBajo(o, terreno);
  if (!d) return '';
  const quien = ARTICULO[o.tipo] || 'el objeto';
  const cm = Math.round(d.diferencia * 100);
  return cm < 1 ? `Bajo ${quien} el piso está a nivel.` : `Desnivel bajo ${quien}: ${cm} cm`;
}

/* ------------------------------------------------------------------ plano */

// Punto a una distancia "s" (mm) a lo largo de una línea de papel, con el ángulo del tramo.
function puntoALo(linea, s) {
  for (let i = 1; i < linea.length; i++) {
    const [ax, ay] = linea[i - 1];
    const [bx, by] = linea[i];
    const L = Math.hypot(bx - ax, by - ay);
    if (s <= L || i === linea.length - 1) {
      const u = L ? Math.min(1, s / L) : 0;
      return { p: [ax + (bx - ax) * u, ay + (by - ay) * u], ang: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI };
    }
    s -= L;
  }
  return null;
}

// Equidistancia que usa curvasSVG en un plano con k milímetros por metro: la pedida, duplicada hasta que las
// curvas queden en promedio a 1,5 mm o más una de otra en el papel (y no pasen de 300). Sirve para escribir
// "Curvas de nivel cada 0,25 m" en la hoja.
export function equidistanciaPara(terreno, k, equidistancia = 0.25) {
  const t = prepararTerreno(terreno);
  let eq = Number(equidistancia) > 0 ? Number(equidistancia) : 0.25;
  if (!t || !t.tris.length) return eq;
  while ((t.maximo - t.minimo) / eq > 300) eq *= 2;
  const media = pendientes(t).media / 100;
  if (Number(k) > 0 && media > 0) while ((eq / media) * k < 1.5) eq *= 2;
  return eq;
}

// Curvas de nivel para la hoja de planta (gancho "encima" de hojaPlanta: M pasa metros a milímetros de papel y k
// son milímetros por metro). Líneas finas y, cada cuatro, una más gruesa con su altura escrita. Si en esa escala
// quedarían muy juntas, la equidistancia se agranda (ver equidistanciaPara). Con bajos: true (por defecto) marca
// los puntos bajos donde se junta agua.
export function curvasSVG(terreno, M, k, equidistancia = 0.25, { bajos = true } = {}) {
  const t = prepararTerreno(terreno);
  if (!t || !t.tris.length || typeof M !== 'function') return '';
  const eq = equidistanciaPara(t, k, equidistancia);
  const curvas = curvasDeNivel(t, eq);
  const finas = [];
  const gruesas = [];
  const rotulos = [];
  for (const { nivel, lineas } of curvas) {
    const maestra = Math.abs(Math.round(nivel / eq)) % 4 === 0;
    for (const l of lineas) {
      // En papel, sin puntos a menos de 0,25 mm del anterior.
      const papel = [];
      for (const q of l) {
        const p = M(q);
        const u = papel[papel.length - 1];
        if (!u || Math.hypot(p[0] - u[0], p[1] - u[1]) >= 0.25) papel.push(p);
      }
      const ultimo = M(l[l.length - 1]);
      const u = papel[papel.length - 1];
      if (papel.length && (u[0] !== ultimo[0] || u[1] !== ultimo[1])) papel.push(ultimo);
      if (papel.length < 2) continue;
      const d = 'M' + papel.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L');
      (maestra ? gruesas : finas).push(`<path d="${d}"/>`);
      if (!maestra) continue;
      let largo = 0;
      for (let i = 1; i < papel.length; i++) largo += Math.hypot(papel[i][0] - papel[i - 1][0], papel[i][1] - papel[i - 1][1]);
      if (largo < 25) continue;
      const cuantos = Math.max(1, Math.floor(largo / 150));
      for (let r = 0; r < cuantos; r++) {
        const pa = puntoALo(papel, (largo * (r + 0.5)) / cuantos);
        if (!pa) continue;
        let ang = pa.ang;
        if (ang > 90) ang -= 180;
        if (ang < -90) ang += 180;
        const [x, y] = pa.p;
        rotulos.push(
          `<text x="${n2(x)}" y="${n2(y)}" font-family="${FUENTE}" font-size="1.6" font-weight="600" fill="${COLOR_CURVA}" stroke="#fff" stroke-width="0.7" paint-order="stroke" text-anchor="middle" dominant-baseline="middle" transform="rotate(${n2(ang)} ${n2(x)} ${n2(y)})">${esc(fm(nivel, 2))}</text>`
        );
      }
    }
  }
  const partes = [];
  if (finas.length) partes.push(`<g fill="none" stroke="${COLOR_CURVA}" stroke-width="0.12" stroke-linejoin="round" stroke-linecap="round">${finas.join('')}</g>`);
  if (gruesas.length) partes.push(`<g fill="none" stroke="${COLOR_CURVA}" stroke-width="0.3" stroke-linejoin="round" stroke-linecap="round">${gruesas.join('')}</g>`);
  partes.push(rotulos.join(''));
  if (bajos) {
    for (const b of bajosDe(t)) {
      const [x, y] = M([b.x, b.y]);
      partes.push(
        `<g><title>${esc(`Punto bajo: se puede juntar agua (${Math.round(b.profundidad * 100)} cm)`)}</title>` +
          `<polygon points="${n2(x - 1.1)},${n2(y - 0.9)} ${n2(x + 1.1)},${n2(y - 0.9)} ${n2(x)},${n2(y + 1.1)}" fill="${COLOR_AGUA}" stroke="#fff" stroke-width="0.25"/></g>`
      );
    }
  }
  return `<g class="curvas-nivel">${partes.join('')}</g>`;
}

/* ------------------------------------------------------------------ panel */

// Lo que tiene que estar a nivel y apoya en el piso.
const A_NIVEL = new Set(['tarima', 'barra', 'cabina_dj', 'casita']);

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cm = (m) => `${Math.round(m * 100)} cm`;

// Pendiente máxima y promedio (por superficie) de los triángulos, sin los triángulos muy finitos del borde.
function pendientes(t) {
  let maxima = 0;
  let suma = 0;
  let sup = 0;
  t.tris.forEach((_, k) => {
    const p = Math.hypot(...t.grad[k]) * 100;
    suma += p * t.area[k];
    sup += t.area[k];
    if (t.calidad[k] >= 0.1) maxima = Math.max(maxima, p);
  });
  return { maxima, media: sup ? suma / sup : 0 };
}

// Contorno de un objeto en la planta.
function contornoDe(o) {
  if (esPoligono(o)) return puntosMundo(o);
  const t = ((o.rot || 0) * Math.PI) / 180;
  const [w, p] = o.dims;
  return [
    [-w / 2, -p / 2],
    [w / 2, -p / 2],
    [w / 2, p / 2],
    [-w / 2, p / 2],
  ].map(([lx, ly]) => [o.pos[0] + lx * Math.cos(t) - ly * Math.sin(t), o.pos[1] + lx * Math.sin(t) + ly * Math.cos(t)]);
}

// Panel lateral del terreno: rango de alturas, pendiente, puntos bajos y lo que queda desnivelado (tarimas,
// barras, cabina y estructuras apoyadas en el piso con más de 5 cm de diferencia). Clases: te-dato y te-aviso.
export function htmlTerreno(escena) {
  const t = prepararTerreno(escena?.terreno);
  if (!t || t.n < 3) return `<div class="te-dato">Cargá al menos tres puntos con su altura para ver el terreno.</div>`;
  if (!t.tris.length) return `<div class="te-aviso">Los puntos de altura están todos en línea: sumá alguno que no esté sobre esa línea.</div>`;
  const partes = [];
  partes.push(`<div class="te-dato">Desnivel del terreno: <b>${fm(t.maximo - t.minimo)} m</b> (alturas de ${fm(t.minimo)} a ${fm(t.maximo)} m, en ${t.n} puntos).</div>`);
  const { maxima, media } = pendientes(t);
  partes.push(`<div class="te-dato">Pendiente máxima: <b>${fm(maxima, 1)} %</b>. Promedio: ${fm(media, 1)} %.</div>`);

  const objetos = escena.objetos || [];
  const zonas = objetos.filter((o) => o.tipo === 'zona' && Array.isArray(o.pos) && Array.isArray(o.dims));
  const bajos = bajosDe(t);
  if (bajos.length) {
    const b = bajos[0];
    const cuantos = bajos.length === 1 ? 'Hay un punto bajo' : `Hay ${bajos.length} puntos bajos`;
    partes.push(`<div class="te-aviso">${cuantos} donde se puede juntar agua si llueve. El más hondo junta hasta ${cm(b.profundidad)}, en x ${fm(b.x, 1)} · y ${fm(b.y, 1)}.</div>`);
    for (const z of zonas) {
      const c = contornoDe(z);
      if (bajos.some((p) => puntoEnPoligono(p.x, p.y, c))) partes.push(`<div class="te-aviso">${esc(z.nombre || 'Una zona')} tiene un punto bajo adentro: si llueve, se junta agua ahí.</div>`);
    }
  } else partes.push(`<div class="te-dato">No hay puntos bajos: el agua de lluvia escurre hacia afuera.</div>`);

  // Pendiente de la pista (promedio en una grilla dentro de la zona).
  for (const z of zonas.filter((o) => o.uso === 'pista' || /\bpista\b/.test(sinTildes(o.nombre)))) {
    const c = contornoDe(z);
    const b = cajaDe(c);
    let suma = 0;
    let cuenta = 0;
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        const x = b.minX + ((b.maxX - b.minX) * (i + 0.5)) / 12;
        const y = b.minY + ((b.maxY - b.minY) * (j + 0.5)) / 12;
        if (!puntoEnPoligono(x, y, c)) continue;
        suma += pendienteDe(t, x, y);
        cuenta++;
      }
    }
    if (!cuenta) continue;
    const p = suma / cuenta;
    const texto = `${esc(z.nombre || 'Pista')}: pendiente promedio de ${fm(p, 1)} %.`;
    partes.push(p > 5 ? `<div class="te-aviso">${texto} Se nota al bailar; si se puede, buscá una parte más plana.</div>` : `<div class="te-dato">${texto}</div>`);
  }

  const revisar = objetos.filter((o) => A_NIVEL.has(o.tipo) && (Number(o.elev) || 0) < 0.05 && Array.isArray(o.pos) && Array.isArray(o.dims));
  let avisos = 0;
  for (const o of revisar) {
    const d = desnivelBajo(o, t);
    if (!d || d.diferencia <= 0.05) continue;
    avisos++;
    partes.push(`<div class="te-aviso">${esc(o.nombre || 'Objeto')}: ${cm(d.diferencia)} de desnivel debajo: hace falta calzar o nivelar.</div>`);
  }
  if (revisar.length && !avisos) partes.push(`<div class="te-dato">Tarimas, barras y cabina quedan a nivel (menos de 5 cm de diferencia).</div>`);
  return partes.join('');
}
