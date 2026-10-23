// Sol y sombra para los eventos al aire libre: dónde está el sol a cada hora, a qué hora sale y se pone,
// qué sombra hace cada objeto en el piso y cuánto de la pista (o de la barra) queda a la sombra.
//
// La posición del sol sale del algoritmo de la NOAA (el de su planilla de cálculo solar): ecuación del
// tiempo, declinación, ángulo horario y corrección por refracción. Para planificar sobra: la salida y la
// puesta dan con un error de alrededor de un minuto entre las latitudes ±72°.
//
// Fechas: "AAAA-MM-DDTHH:MM" en hora del lugar (también "AAAA-MM-DD", "DD/MM/AA" y "DD/MM/AAAA"), un Date o
// milisegundos UTC. La zona horaria es la diferencia con UTC en horas: Argentina es −3 todo el año. Se puede
// cambiar por escena con escena.geo.zonaHoraria (campo opcional).
//
// Ejes de la escena: x a la derecha, y hacia abajo en la planta, z hacia arriba. En el 3D (Three.js) el punto
// (x, y) de la planta a la altura h es (x, h, y). escena.geo.norte: hacia dónde queda el norte en la planta, en
// grados y en sentido horario (0 = el norte apunta hacia arriba, −y).

import { tieneGeo } from './geo.js';
import { esquinas, puntosMundo, esPoligono, puntoEnPoligono, cajaDe } from './geometria.js';
import { defDatos } from './tipos-datos.js';
import { esc, fm } from './formato.js';

const rad = (g) => (g * Math.PI) / 180;
const grados = (r) => (r * 180) / Math.PI;
const vuelta = (g) => ((g % 360) + 360) % 360;
const acotar = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = (n) => Math.round(n * 1000) / 1000;
const HORA = 3600000;

export const ZONA_ARGENTINA = -3;

// Con el sol muy bajo las sombras se estiran sin fin: para dibujarlas se usa como mínimo esta altura (3° = la
// sombra mide hasta 19 veces el alto del objeto). La posición del sol que se informa es la real.
const ELEVACION_MINIMA_SOMBRA = 3;
const LARGO_MAX = 1 / Math.tan(rad(ELEVACION_MINIMA_SOMBRA));

// Zona horaria de la escena (escena.geo.zonaHoraria) o la de Argentina.
export function zonaDe(escena) {
  const z = Number(escena?.geo?.zonaHoraria);
  return escena?.geo?.zonaHoraria !== undefined && Number.isFinite(z) && Math.abs(z) <= 14 ? z : ZONA_ARGENTINA;
}

/* ------------------------------------------------------------------ fechas y horas */

const dos = (n) => String(n).padStart(2, '0');

// "HH:MM" a partir de minutos desde la medianoche (se redondea al minuto).
export function horaTexto(minutos) {
  if (!Number.isFinite(minutos)) return '';
  const m = Math.round(((minutos % 1440) + 1440) % 1440) % 1440;
  return `${dos(Math.floor(m / 60))}:${dos(m % 60)}`;
}

// "AAAA-MM-DDTHH:MM" para un día ("AAAA-MM-DD") y una hora en minutos (para armar el valor de un deslizador).
export const conHora = (dia, minutos) => `${String(dia).slice(0, 10)}T${horaTexto(minutos)}`;

// Lee una fecha y devuelve el instante (ms UTC) y el día y la hora del lugar, o null si no se puede leer.
// Sin hora, se toma el mediodía.
export function leerFecha(fecha, zonaHoraria = ZONA_ARGENTINA) {
  let ms = null;
  if (fecha instanceof Date) ms = fecha.getTime();
  else if (typeof fecha === 'number') ms = fecha;
  else if (typeof fecha === 'string') {
    const t = fecha.trim();
    let a;
    let me;
    let d;
    let h = 12;
    let mi = 0;
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2})(?::(\d{2}))?)?/);
    if (m) {
      [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (m[4] !== undefined) [h, mi] = [Number(m[4]), Number(m[5] || 0)];
    } else {
      m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T\s,]+(\d{1,2})(?::(\d{2}))?)?/);
      if (!m) return null;
      [d, me, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (a < 100) a += 2000;
      if (m[4] !== undefined) [h, mi] = [Number(m[4]), Number(m[5] || 0)];
    }
    if (me < 1 || me > 12 || d < 1 || d > 31 || h > 24 || mi > 59) return null;
    ms = Date.UTC(a, me - 1, d, h, mi) - zonaHoraria * HORA;
  }
  if (!Number.isFinite(ms)) return null;
  const local = new Date(ms + zonaHoraria * HORA);
  const anio = local.getUTCFullYear();
  const mes = local.getUTCMonth() + 1;
  const dia = local.getUTCDate();
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60;
  const diaTexto = `${anio}-${dos(mes)}-${dos(dia)}`;
  return { ms, anio, mes, dia, minutos, diaTexto, texto: `${diaTexto}T${horaTexto(minutos)}` };
}

// Día del evento ("AAAA-MM-DD") según proyecto.inicio o proyecto.fecha, o null.
export function diaDelEvento(escena) {
  const p = escena?.proyecto || {};
  for (const v of [p.inicio, p.fecha]) {
    const f = v ? leerFecha(String(v), zonaDe(escena)) : null;
    if (f) return f.diaTexto;
  }
  return null;
}

/* ------------------------------------------------------------------ posición del sol (NOAA) */

// Declinación (grados) y ecuación del tiempo (minutos) en un instante.
function datosSolares(ms) {
  const jd = ms / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = vuelta(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) +
    Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const aparente = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = grados(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(aparente))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const l = rad(L0);
  const m = rad(M);
  const eqT =
    4 *
    grados(
      y * Math.sin(2 * l) -
        2 * e * Math.sin(m) +
        4 * e * y * Math.sin(m) * Math.cos(2 * l) -
        0.5 * y * y * Math.sin(4 * l) -
        1.25 * e * e * Math.sin(2 * m)
    );
  return { decl, eqT };
}

// Refracción de la atmósfera (grados que se suman a la altura geométrica), como en la planilla de la NOAA.
function refraccion(e) {
  if (e > 85) return 0;
  const te = Math.tan(rad(e));
  let s;
  if (e > 5) s = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (e > -0.575) s = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)));
  else s = -20.772 / te;
  return s / 3600;
}

function solEnInstante(ms, lat, lng) {
  const { decl, eqT } = datosSolares(ms);
  const minutosUTC = (((ms / 60000) % 1440) + 1440) % 1440;
  const solarVerdadero = (((minutosUTC + eqT + 4 * lng) % 1440) + 1440) % 1440;
  const H = solarVerdadero / 4 - 180;
  const cosZ = acotar(Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(H)), -1, 1);
  const cenit = grados(Math.acos(cosZ));
  const den = Math.cos(rad(lat)) * Math.sin(rad(cenit));
  let azimut;
  if (Math.abs(den) < 1e-9) azimut = lat > 0 ? 180 : 0;
  else {
    const a = grados(Math.acos(acotar((Math.sin(rad(lat)) * Math.cos(rad(cenit)) - Math.sin(rad(decl))) / den, -1, 1)));
    azimut = H > 0 ? vuelta(a + 180) : vuelta(540 - a);
  }
  const geometrica = 90 - cenit;
  return { azimut, elevacion: geometrica + refraccion(geometrica), declinacion: decl, ecuacionTiempo: eqT };
}

// Posición del sol: azimut (grados desde el norte, en sentido horario: 90 = este) y elevación (grados sobre
// el horizonte, con refracción; negativa = de noche).
export function posicionSol(fecha, lat, lng, zonaHoraria = ZONA_ARGENTINA) {
  const f = leerFecha(fecha, zonaHoraria);
  if (!f || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return solEnInstante(f.ms, lat, lng);
}

// Salida, puesta y mediodía solar del día de "fecha", en hora del lugar ("HH:MM"). También el crepúsculo civil
// (amanece / anochece: el sol a 6° bajo el horizonte, cuando todavía hay luz para moverse sin linternas) y los
// mismos valores en minutos desde la medianoche, para un deslizador de horas. Donde ese día el sol no sale o no
// se pone (cerca de los polos), salida y puesta quedan en null.
export function horasDeSol(fecha, lat, lng, zonaHoraria = ZONA_ARGENTINA) {
  const f = leerFecha(fecha, zonaHoraria);
  if (!f || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cero = Date.UTC(f.anio, f.mes - 1, f.dia) - zonaHoraria * HORA;
  const enMs = (min) => cero + min * 60000;
  let mediodia = 720;
  for (let i = 0; i < 3; i++) mediodia = 720 - 4 * lng - datosSolares(enMs(mediodia)).eqT + zonaHoraria * 60;
  // signo 1: a la mañana; −1: a la tarde.
  const momento = (cenit, signo) => {
    let t = mediodia;
    for (let i = 0; i < 4; i++) {
      const { decl, eqT } = datosSolares(enMs(t));
      const c = (Math.cos(rad(cenit)) - Math.sin(rad(lat)) * Math.sin(rad(decl))) / (Math.cos(rad(lat)) * Math.cos(rad(decl)));
      if (c > 1) return { nunca: 'abajo' };
      if (c < -1) return { nunca: 'arriba' };
      t = 720 - 4 * (lng + signo * grados(Math.acos(c))) - eqT + zonaHoraria * 60;
    }
    return { t };
  };
  const salida = momento(90.833, 1);
  const puesta = momento(90.833, -1);
  const amanece = momento(96, 1);
  const anochece = momento(96, -1);
  const minutos = { salida: salida.t ?? null, puesta: puesta.t ?? null, mediodia, amanece: amanece.t ?? null, anochece: anochece.t ?? null };
  return {
    salida: salida.t !== undefined ? horaTexto(salida.t) : null,
    puesta: puesta.t !== undefined ? horaTexto(puesta.t) : null,
    mediodia: horaTexto(mediodia),
    amanece: amanece.t !== undefined ? horaTexto(amanece.t) : null,
    anochece: anochece.t !== undefined ? horaTexto(anochece.t) : null,
    minutos,
    elevacionMaxima: solEnInstante(enMs(mediodia), lat, lng).elevacion,
    // Cerca de los polos: sol todo el día o nada de sol.
    solTodoElDia: salida.nunca === 'arriba',
    sinSol: salida.nunca === 'abajo',
    dia: f.diaTexto,
  };
}

/* ------------------------------------------------------------------ el sol en la escena */

// Ejes de la planta: hacia dónde quedan el este y el norte (igual que en geo.js).
function ejes(norte) {
  const t = rad(norte || 0);
  return { E: [Math.cos(t), Math.sin(t)], N: [Math.sin(t), -Math.cos(t)] };
}

// Dirección del sol en la escena. haciaSol: vector unitario del piso hacia el sol en ejes de la escena
// (dx sobre x de la planta, dy sobre y de la planta, que crece hacia abajo, y dz hacia arriba). tres: el mismo
// vector en ejes de Three.js (x, altura, y). null si la escena no está ubicada en el mapa.
export function direccionSol(escena, fecha, zonaHoraria = zonaDe(escena)) {
  if (!tieneGeo(escena)) return null;
  const { lat, lng, norte } = escena.geo;
  const p = posicionSol(fecha, lat, lng, zonaHoraria);
  if (!p) return null;
  const A = rad(p.azimut);
  const h = rad(p.elevacion);
  const { E, N } = ejes(norte);
  const este = Math.sin(A) * Math.cos(h);
  const alNorte = Math.cos(A) * Math.cos(h);
  const dx = este * E[0] + alNorte * N[0];
  const dy = este * E[1] + alNorte * N[1];
  const dz = Math.sin(h);
  return { azimut: p.azimut, elevacion: p.elevacion, haciaSol: [dx, dy, dz], tres: [dx, dz, dy], deDia: p.elevacion > 0 };
}

// Dónde poner la luz direccional del 3D: un punto a "distancia" metros del centro, hacia el sol, en ejes de
// Three.js ([x, altura, z]). El centro es un punto de la planta [x, y] (el target de la luz va ahí, a altura 0).
export function posicionLuz3D(direccion, centro = [0, 0], distancia = 100) {
  const t = direccion?.tres;
  if (!t) return null;
  return [centro[0] + t[0] * distancia, t[1] * distancia, centro[1] + t[2] * distancia];
}

// Color y fuerza de la luz del sol según la altura: blanco cálido de día, naranja cerca del horizonte, nada
// de noche. intensidad va de 0 a 1 (multiplicarla por la intensidad de día de la luz del 3D).
export function colorSol(elevacion) {
  if (!(elevacion > -0.833)) return { color: '#ff8a4a', intensidad: 0 };
  const t = acotar(elevacion / 30, 0, 1);
  const mezcla = (a, b) => Math.round(a + (b - a) * t);
  const rgb = [mezcla(0xff, 0xff), mezcla(0x8a, 0xf6), mezcla(0x4a, 0xe8)];
  const intensidad = acotar((elevacion + 0.833) / 15, 0, 1);
  return { color: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join(''), intensidad: Math.round(intensidad * 1000) / 1000 };
}

/* ------------------------------------------------------------------ sombras en el piso */

// Lo que no hace sombra: lo que va pintado en el piso, las personas de escala, marcadores y vallas (que son
// caladas). Un objeto con sombra: false tampoco (campo opcional).
const SIN_SOMBRA = new Set(['persona', 'zona', 'etiqueta', 'texto', 'flecha', 'camino', 'estacionamiento', 'puesto', 'marcador', 'medicion', 'vallado']);

export function haceSombra(o) {
  if (!o || o.sombra === false || SIN_SOMBRA.has(o.tipo)) return false;
  const def = defDatos(o);
  if (def.piso || def.sinSombra) return false;
  if (o.tipo === 'casita' && o.techo === false) return false;
  return Array.isArray(o.dims) && (Number(o.dims[2]) || 0) > 0.02 && Array.isArray(o.pos);
}

// Cuánto se corre en la planta la sombra de un punto por cada metro de altura, o null si no hay sol.
function corrimiento(direccion) {
  const S = Array.isArray(direccion) ? direccion : direccion?.haciaSol;
  if (!S || !(S[2] > 0)) return null;
  const h = Math.hypot(S[0], S[1]);
  if (h < 1e-9) return [0, 0];
  const largo = Math.min(h / S[2], LARGO_MAX);
  return [(-S[0] / h) * largo, (-S[1] / h) * largo];
}

// Envolvente convexa (cadena monótona). Devuelve los puntos en orden, sin repetir el primero.
function envolvente(puntos) {
  const p = puntos.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const cadena = (lista) => {
    const c = [];
    for (const q of lista) {
      while (c.length >= 2 && cruz(c[c.length - 2], c[c.length - 1], q) <= 1e-12) c.pop();
      c.push(q);
    }
    c.pop();
    return c;
  };
  return cadena(p).concat(cadena([...p].reverse()));
}

// Sombra de un elipsoide (copa de un árbol): el contorno que ve el sol, proyectado al piso. Es exacto: la
// silueta de una esfera vista de lejos es un círculo máximo y la deformación a elipsoide la conserva.
function sombraElipsoide(centro, zc, giro, [a, b, c], cor, lados = 28) {
  const S = [-cor[0], -cor[1], 1];
  const co = Math.cos(giro);
  const si = Math.sin(giro);
  const v = [(S[0] * co + S[1] * si) / a, (-S[0] * si + S[1] * co) / b, S[2] / c];
  const lv = Math.hypot(...v);
  const n = v.map((x) => x / lv);
  const aux = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cruz = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  let e1 = cruz(n, aux);
  const l1 = Math.hypot(...e1);
  e1 = e1.map((x) => x / l1);
  const e2 = cruz(n, e1);
  const res = [];
  for (let i = 0; i < lados; i++) {
    const t = (i / lados) * Math.PI * 2;
    const w = [0, 1, 2].map((k) => Math.cos(t) * e1[k] + Math.sin(t) * e2[k]);
    const lx = a * w[0];
    const ly = b * w[1];
    const z = zc + c * w[2];
    const x = centro[0] + lx * co - ly * si;
    const y = centro[1] + lx * si + ly * co;
    res.push([x + z * cor[0], y + z * cor[1]]);
  }
  return res;
}

// Sombra de un objeto en el piso (polígono [[x, y], ...] en la planta) con el sol en "direccion" (lo que
// devuelve direccionSol, o directamente el vector haciaSol). Es la envolvente de la caja del objeto (planta y
// altura de elev a elev + alto). Los árboles usan la copa como un elipsoide (el tronco casi no da sombra); las
// estructuras a dos aguas, su forma de casita; las carpas, solo el techo. null si no hace sombra o no hay sol.
export function sombraDe(o, direccion) {
  const cor = corrimiento(direccion);
  if (!cor || !haceSombra(o)) return null;
  const z0 = Number(o.elev) || 0;
  const [w, p, h] = o.dims.map((v) => Number(v) || 0);
  const giro = rad(o.rot || 0);
  const co = Math.cos(giro);
  const si = Math.sin(giro);
  const mundo = ([lx, ly]) => [o.pos[0] + lx * co - ly * si, o.pos[1] + lx * si + ly * co];
  const proy = ([x, y], z) => [x + z * cor[0], y + z * cor[1]];
  const puntos = [];
  // Puntos locales [lx, ly, z] (z desde la base del objeto).
  const agregar = (lista) => {
    for (const [lx, ly, z] of lista) puntos.push(proy(mundo([lx, ly]), z0 + z));
  };
  const rect = (z, ancho = w, prof = p) => [
    [-ancho / 2, -prof / 2, z],
    [ancho / 2, -prof / 2, z],
    [ancho / 2, prof / 2, z],
    [-ancho / 2, prof / 2, z],
  ];
  const elipse = (z, lados = 16) => Array.from({ length: lados }, (_, i) => [(w / 2) * Math.cos((i / lados) * 2 * Math.PI), (p / 2) * Math.sin((i / lados) * 2 * Math.PI), z]);

  if (o.tipo === 'arbol') {
    const copa = o.forma === 'redondo' ? h * 0.6 : h * 0.42;
    return envolvente(sombraElipsoide(o.pos, z0 + h - copa / 2, giro, [w / 2, p / 2, copa / 2], cor)).map(([x, y]) => [r3(x), r3(y)]);
  }
  if (o.tipo === 'casita') {
    const alero = acotar(Number(o.alero) || 0, 0, 0.9) * h;
    agregar(rect(0));
    if (alero > 0) agregar(rect(alero));
    agregar([
      [0, -p / 2, h],
      [0, p / 2, h],
    ]);
  } else if (o.tipo === 'carpa' || o.tipo === 'primeros_auxilios') {
    agregar(rect(h * 0.72));
    agregar([[0, 0, h]]);
  } else if (o.tipo === 'cilindro' || (o.tipo === 'columna' && o.forma === 'redonda')) {
    agregar(elipse(0));
    agregar(elipse(h));
  } else if (esPoligono(o)) {
    for (const q of puntosMundo(o)) puntos.push(proy(q, z0), proy(q, z0 + h));
  } else {
    for (const q of esquinas(o)) puntos.push(proy(q, z0), proy(q, z0 + h));
  }
  const res = envolvente(puntos);
  return res.length >= 3 ? res.map(([x, y]) => [r3(x), r3(y)]) : null;
}

function altoDePared(P, i) {
  if (!P || P.sin?.includes(i)) return 0;
  if (Array.isArray(P.alto)) return Number(P.alto[i]) || 0;
  return Number(P.alto) || 0;
}

// Sombras de las paredes y del techo de las áreas cerradas (las aberturas no se tienen en cuenta).
function sombrasDeAreas(escena, cor) {
  const res = [];
  const proy = ([x, y], z) => [r3(x + z * cor[0]), r3(y + z * cor[1])];
  for (const a of escena.areas || []) {
    const pts = a.contorno;
    if (!Array.isArray(pts) || pts.length < 3 || !a.paredes) continue;
    const altos = pts.map((_, i) => altoDePared(a.paredes, i));
    const altoMax = Math.max(0, ...altos);
    pts.forEach((A, i) => {
      const H = altos[i];
      if (H <= 0) return;
      const B = pts[(i + 1) % pts.length];
      const s = envolvente([A, B, proy(A, H), proy(B, H)]);
      if (s.length >= 3) res.push({ id: `${a.id}:pared-${i}`, de: 'pared', puntos: s });
    });
    if (altoMax > 0 && a.techo !== false) res.push({ id: `${a.id}:techo`, de: 'techo', puntos: pts.map((q) => proy(q, altoMax)) });
  }
  return res;
}

// Todas las sombras de la escena a esa hora: { direccion, poligonos: [{ id, de, puntos }] }. "de" es 'objeto',
// 'pared' o 'techo'. Con el sol abajo del horizonte no hay polígonos y deNoche es true. Sin ubicación en el
// mapa, direccion es null.
export function sombras(escena, fecha) {
  const direccion = direccionSol(escena, fecha);
  if (!direccion) return { direccion: null, poligonos: [] };
  const cor = corrimiento(direccion);
  if (!cor) return { direccion, poligonos: [], deNoche: true };
  const poligonos = [];
  for (const o of escena.objetos || []) {
    const s = sombraDe(o, direccion);
    if (s && s.length >= 3) poligonos.push({ id: o.id, de: 'objeto', puntos: s });
  }
  poligonos.push(...sombrasDeAreas(escena, cor));
  return { direccion, poligonos };
}

// Contorno de una zona en la planta: un objeto (su forma libre o su rectángulo), el id de un objeto o
// directamente una lista de puntos.
function contornoDe(escena, zona) {
  if (Array.isArray(zona)) return zona.length >= 3 ? zona : null;
  const o = typeof zona === 'string' ? (escena.objetos || []).find((x) => x.id === zona) : zona;
  if (!o || !Array.isArray(o.pos) || !Array.isArray(o.dims)) return null;
  return esPoligono(o) ? puntosMundo(o) : esquinas(o);
}

// Fracción (0 a 1) de un contorno tapada por alguno de los polígonos, muestreando una grilla.
function fraccionTapada(contorno, poligonos, muestras = 2500) {
  const caja = cajaDe(contorno);
  const ancho = caja.maxX - caja.minX;
  const alto = caja.maxY - caja.minY;
  if (!(ancho > 0 && alto > 0)) return 0;
  const paso = Math.sqrt((ancho * alto) / Math.max(50, muestras));
  const polis = poligonos
    .map((p) => ({ p: p.puntos || p, c: cajaDe(p.puntos || p) }))
    .filter(({ c }) => c.maxX >= caja.minX && c.minX <= caja.maxX && c.maxY >= caja.minY && c.minY <= caja.maxY);
  let total = 0;
  let tapado = 0;
  for (let x = caja.minX + paso / 2; x < caja.maxX; x += paso) {
    const columna = polis.filter(({ c }) => x >= c.minX && x <= c.maxX);
    for (let y = caja.minY + paso / 2; y < caja.maxY; y += paso) {
      if (!puntoEnPoligono(x, y, contorno)) continue;
      total++;
      for (const { p, c } of columna) {
        if (y >= c.minY && y <= c.maxY && puntoEnPoligono(x, y, p)) {
          tapado++;
          break;
        }
      }
    }
  }
  return total ? tapado / total : 0;
}

// Fracción (0 a 1) de una zona que queda a la sombra a esa hora ("La pista a las 17:00 queda 40 % a la
// sombra" = 0,4). "zona": el objeto, su id o una lista de puntos. Con el sol abajo del horizonte devuelve 1
// (no hay sol que pegue). null si la escena no está ubicada en el mapa o la zona no existe.
export function porcentajeSombra(escena, fecha, zona, { muestras = 2500 } = {}) {
  const contorno = contornoDe(escena, zona);
  if (!contorno) return null;
  const s = sombras(escena, fecha);
  if (!s.direccion) return null;
  if (s.deNoche) return 1;
  const propio = typeof zona === 'string' ? zona : zona?.id;
  return fraccionTapada(contorno, s.poligonos.filter((p) => p.id !== propio), muestras);
}

// Sombra de una zona a lo largo del día, cada "paso" minutos entre la salida y la puesta del sol:
// [{ hora: 'HH:MM', minutos, porcentaje }] (porcentaje de 0 a 1).
export function sombraDelDia(escena, dia, zona, { paso = 30, muestras = 900 } = {}) {
  if (!tieneGeo(escena)) return [];
  const zh = zonaDe(escena);
  const hs = horasDeSol(dia, escena.geo.lat, escena.geo.lng, zh);
  const contorno = contornoDe(escena, zona);
  if (!hs || !contorno || hs.minutos.salida === null || hs.minutos.puesta === null) return [];
  const propio = typeof zona === 'string' ? zona : zona?.id;
  const res = [];
  const desde = Math.ceil(hs.minutos.salida / paso) * paso;
  for (let m = desde; m < hs.minutos.puesta; m += paso) {
    const s = sombras(escena, conHora(hs.dia, m));
    const porcentaje = s.deNoche ? 1 : fraccionTapada(contorno, s.poligonos.filter((p) => p.id !== propio), muestras);
    res.push({ hora: horaTexto(m), minutos: m, porcentaje });
  }
  return res;
}

/* ------------------------------------------------------------------ plano y panel */

// Sombras para la hoja de planta (gancho "encima" de hojaPlanta): polígonos grises semitransparentes.
export function sombrasSVG(escena, fecha, M) {
  const s = sombras(escena, fecha);
  if (!s.poligonos.length) return '';
  const n2 = (v) => Math.round(v * 100) / 100;
  const polis = s.poligonos.map(({ puntos }) => `<polygon points="${puntos.map((q) => M(q).map(n2).join(',')).join(' ')}"/>`).join('');
  return `<g class="sombras" fill="#1a1a1a" opacity="0.16">${polis}</g>`;
}

const RUMBOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
const LADOS_PLANO = ['arriba', 'arriba a la derecha', 'la derecha', 'abajo a la derecha', 'abajo', 'abajo a la izquierda', 'la izquierda', 'arriba a la izquierda'];

// Tramos del día en los que la zona tiene más de la mitad a la sombra: [{ desde, hasta }] en "HH:MM".
// alFinal: el tramo sigue hasta que se pone el sol.
function tramosConSombra(dia) {
  const tramos = [];
  let actual = null;
  for (const x of dia) {
    if (x.porcentaje >= 0.5) {
      if (!actual) tramos.push((actual = { desde: x.hora, hasta: x.hora, ultimo: x }));
      else [actual.hasta, actual.ultimo] = [x.hora, x];
    } else actual = null;
  }
  const ultimo = dia[dia.length - 1];
  for (const t of tramos) t.alFinal = t.ultimo === ultimo;
  return tramos;
}

// La recorrida del día es lo más lento del panel y no depende de la hora: se guarda la última.
let ultimaRecorrida = { clave: '', valor: null };

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Zonas en las que importa la sombra: la pista, la barra y el sector de fumadores (por "uso" o por nombre).
export function zonasConSombra(escena) {
  const usos = ['pista', 'barra', 'fumadores'];
  return (escena.objetos || []).filter((o) => {
    if (o.tipo !== 'zona') return false;
    if (usos.includes(o.uso)) return true;
    const n = sinTildes(o.nombre);
    return /\bpista\b|\bbarra\b|fumador/.test(n);
  });
}

const porc = (f) => `${Math.round(f * 100)} %`;

// Panel lateral: salida y puesta del sol, altura del sol a esa hora, sombra de la pista, la barra y los
// fumadores, y avisos de sol de frente en la cabina. Clases: sol-dato y sol-detalle.
export function htmlSol(escena, fecha) {
  if (!tieneGeo(escena)) return `<div class="sol-detalle">Para ver el sol y las sombras, ubicá la escena en el mapa (latitud y longitud del lugar).</div>`;
  const zh = zonaDe(escena);
  const dia = diaDelEvento(escena);
  const f = leerFecha(fecha ?? (dia ? `${dia}T16:00` : new Date()), zh);
  if (!f) return `<div class="sol-detalle">Elegí un día y una hora para ver el sol.</div>`;
  const { lat, lng } = escena.geo;
  const hs = horasDeSol(f.ms, lat, lng, zh);
  const partes = [];
  if (hs.sinSol) partes.push(`<div class="sol-dato">Ese día el sol no sale.</div>`);
  else if (hs.solTodoElDia) partes.push(`<div class="sol-dato">Ese día el sol no se pone.</div>`);
  else partes.push(`<div class="sol-dato">Sale el sol a las <b>${hs.salida}</b> y se pone a las <b>${hs.puesta}</b>.</div>`);
  const extra = [`Mediodía solar a las ${hs.mediodia}, con el sol a ${Math.round(hs.elevacionMaxima)}° de altura.`];
  if (hs.anochece) extra.push(`Es de noche desde las ${hs.anochece}.`);
  partes.push(`<div class="sol-detalle">${esc(extra.join(' '))}</div>`);

  const d = direccionSol(escena, f.ms, zh);
  const hora = horaTexto(f.minutos);
  if (!d.deDia) {
    const antes = hs.minutos.salida !== null && f.minutos < hs.minutos.mediodia;
    partes.push(`<div class="sol-dato">A las ${hora} ${antes ? 'todavía no salió el sol' : 'el sol ya se puso'}.</div>`);
    return partes.join('');
  }
  const rumbo = RUMBOS[Math.round(vuelta(d.azimut) / 45) % 8];
  const lado = LADOS_PLANO[Math.round(vuelta(grados(Math.atan2(d.haciaSol[0], -d.haciaSol[1]))) / 45) % 8];
  partes.push(
    `<div class="sol-dato">A las ${hora} el sol está a <b>${Math.round(d.elevacion)}°</b> de altura y viene del ${rumbo} (en el plano, desde ${lado}).</div>`
  );
  const largo = d.elevacion > 0.5 ? 2 / Math.tan(rad(d.elevacion)) : null;
  if (largo !== null) partes.push(`<div class="sol-detalle">Algo de 2 m de alto hace una sombra de ${fm(Math.min(largo, 999), largo < 10 ? 1 : 0)} m de largo.</div>`);

  const zonas = zonasConSombra(escena);
  if (!zonas.length) {
    partes.push(`<div class="sol-detalle">Marcá la pista, la barra o el sector de fumadores como zona para ver cuánta sombra tienen.</div>`);
  } else {
    const s = sombras(escena, f.ms);
    for (const z of zonas) {
      const contorno = contornoDe(escena, z);
      if (!contorno) continue;
      const fr = fraccionTapada(contorno, s.poligonos.filter((p) => p.id !== z.id));
      partes.push(`<div class="sol-dato">${esc(z.nombre || 'Zona')}: <b>${porc(fr)}</b> a la sombra</div>`);
    }
    // Para la zona principal (la pista, si está): en qué horarios del día tiene más de la mitad a la sombra.
    const principal = zonas.find((z) => z.uso === 'pista' || /\bpista\b/.test(sinTildes(z.nombre))) || zonas[0];
    const clave = JSON.stringify([f.diaTexto, principal.id, escena.geo, escena.areas, escena.objetos]);
    if (ultimaRecorrida.clave !== clave) ultimaRecorrida = { clave, valor: sombraDelDia(escena, f.diaTexto, principal) };
    const recorrida = ultimaRecorrida.valor;
    if (recorrida.length) {
      const nombre = esc(principal.nombre || 'Zona');
      const tramos = tramosConSombra(recorrida);
      let t;
      if (!tramos.length) t = `${nombre}: en ningún momento del día tiene más de la mitad a la sombra.`;
      else if (tramos.length === 1 && tramos[0].desde === recorrida[0].hora && tramos[0].alFinal) t = `${nombre}: más de la mitad a la sombra todo el día.`;
      else {
        const lista = tramos.slice(0, 3).map((x) => (x.alFinal ? `desde las ${x.desde} hasta que se pone el sol` : x.desde === x.hasta ? `cerca de las ${x.desde}` : `de ${x.desde} a ${x.hasta}`));
        const unir = lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}` : lista[0];
        t = `${nombre}: más de la mitad a la sombra ${unir}${tramos.length > 3 ? ' (y otros ratos)' : ''}.`;
      }
      partes.push(`<div class="sol-detalle">${t}</div>`);
    }
  }

  // Sol bajo de frente: encandila al DJ o deja al público mirando la cabina a contraluz.
  if (d.elevacion < 30) {
    const hl = Math.hypot(d.haciaSol[0], d.haciaSol[1]) || 1;
    const sx = d.haciaSol[0] / hl;
    const sy = d.haciaSol[1] / hl;
    for (const o of (escena.objetos || []).filter((x) => x.tipo === 'cabina_dj')) {
      const t = rad(o.rot || 0);
      const frente = [-Math.sin(t), Math.cos(t)];
      const c = frente[0] * sx + frente[1] * sy;
      if (c > 0.6) partes.push(`<div class="sol-detalle">${esc(o.nombre || 'Cabina')}: a esa hora el sol le da de frente al DJ y lo encandila.</div>`);
      else if (c < -0.6) partes.push(`<div class="sol-detalle">${esc(o.nombre || 'Cabina')}: a esa hora el público mira la cabina a contraluz, con el sol atrás.</div>`);
    }
  }
  return partes.join('');
}
