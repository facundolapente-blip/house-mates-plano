// Sonido: cobertura aproximada de los parlantes y ruido que llega a los vecinos.
//
// Es un modelo simple de campo libre, para planificar (no es un estudio acústico):
// - Cada parlante o sub es una fuente puntual en su centro, a la altura elev + 60 % del alto.
// - Nivel en un punto (oído a 1,6 m): spl − 20·log10(r) (r de 1 m para arriba) + directividad − paredes − aire.
// - Directividad horizontal: 0 dB dentro de ±dispersion/2 alrededor del frente; cae suave hasta −10 dB a 1,4
//   veces el medio ángulo, −18 dB a 90° del borde y −24 dB atrás. Con dispersion 360 (subs) suena igual para
//   todos lados; con cardioide: true usa un patrón cardioide (subs armados en cardioide).
// - Cada pared con alto (de geometriaArea) que cruza la línea entre la fuente y el punto resta 15 dB.
// - Los parlantes (no los subs) pierden además 0,005 dB por metro en el aire.
// - Las fuentes se suman por energía: 10·log10(Σ 10^(L/10)).
// No tiene en cuenta rebotes (en un lugar cerrado suena más fuerte), viento, temperatura, terreno, la altura
// de las paredes ni la frecuencia (los graves pasan paredes y árboles mucho mejor que esto).
//
// Campos que usa (todos opcionales): en parlantes y subs, spl (dB a 1 m), dispersion (grados), ganancia (dB de
// ajuste, por defecto 0) y cardioide; en los puntos de medición, limite (dB); en la escena, sonido.ganancia
// (volumen general, se suma a todos los equipos).

import { TIPOS_DATOS, catDe } from './tipos-datos.js';
import { esquinas, dentroDe, cajaDe, puntosMundo, esPoligono, superficieDe } from './geometria.js';
import { fm, esc, numero } from './formato.js';
import { hojaPlanta, geometriaArea, limitesDibujo, texto, n2, envolver, recortar, anchoTexto, TINTA, GRIS } from './plano2d.js';

export const ALTURA_ESCUCHA = 1.6;
export const PERDIDA_PARED = 15;
export const AIRE_DB_M = 0.005;
const MAX_CELDAS = 200000;
const GRADOS = 180 / Math.PI;

// Bandas de nivel, de la más fuerte a la más baja. Por debajo de la última no se pinta nada.
export const BANDAS = [
  { desde: 105, hasta: null, color: '#FF3B30', nombre: 'Muy fuerte (más de 105 dB)' },
  { desde: 100, hasta: 105, color: '#E8AA4C', nombre: 'Fuerte (100 a 105 dB)' },
  { desde: 95, hasta: 100, color: '#F2D16B', nombre: 'Nivel de pista (95 a 100 dB)' },
  { desde: 85, hasta: 95, color: '#2FBF71', nombre: 'Se escucha bien (85 a 95 dB)' },
  { desde: 75, hasta: 85, color: '#2447F5', nombre: 'De fondo (75 a 85 dB)' },
  { desde: 65, hasta: 75, color: '#8A4FFF', nombre: 'Bajo (65 a 75 dB)' },
];

export const AVISO_MODELO =
  'Es una estimación simple para planificar, no un estudio acústico: cada equipo se toma como un punto, sin rebotes, ' +
  'viento ni terreno. Los dB de cada equipo son el máximo a 1 m que da el fabricante; en la fiesta suele sonar entre ' +
  '6 y 10 dB menos (ajustalo con la ganancia). Cada pared resta 15 dB, pero los graves pasan más. Para un permiso o un ' +
  'reclamo, medí en el lugar con un decibelímetro.';

export const bandaDe = (nivel) => BANDAS.find((b) => nivel >= b.desde) || null;

/* ------------------------------------------------------------------ fuentes */

// Atenuación (dB, cero o negativa) según el ángulo en grados entre el frente del equipo y el punto.
export function atenuacionDireccion(angulo, dispersion = 90, cardioide = false) {
  const a = Math.min(180, Math.abs(angulo));
  if (cardioide) return Math.max(-20, 20 * Math.log10(Math.max(1e-6, (1 + Math.cos(a / GRADOS)) / 2)));
  const h = Math.min(180, Math.max(1, dispersion / 2));
  if (h >= 180 || a <= h) return 0;
  const u1 = 1.4 * h;
  if (a <= u1) {
    const t = (a - h) / (u1 - h);
    return -10 * t * t * (3 - 2 * t);
  }
  const u2 = h + 90;
  if (a <= u2) return -10 - (8 * (a - u1)) / (u2 - u1);
  return -18 - (6 * (a - u2)) / (180 - u2);
}

// Parlantes y subs de la escena (y cualquier objeto con spl propio), con todo lo que hace falta para la cuenta.
export function fuentesSonido(escena) {
  const general = numero(escena?.sonido?.ganancia) ?? 0;
  const lista = [];
  for (const o of escena?.objetos || []) {
    if (!o || typeof o !== 'object') continue;
    const def = TIPOS_DATOS[o.tipo] || {};
    const splPropio = numero(o.spl);
    if (o.tipo !== 'parlante' && o.tipo !== 'sub' && !(splPropio > 0)) continue;
    const spl = splPropio ?? def.spl;
    if (!(spl > 0)) continue;
    const x = numero(o.pos?.[0]);
    const y = numero(o.pos?.[1]);
    if (x === null || y === null) continue;
    const alto = Math.abs(numero(o.dims?.[2]) ?? def.dims?.[2] ?? 1);
    const elev = numero(o.elev) ?? 0;
    const cardioide = o.cardioide === true;
    const dispersion = Math.min(360, Math.max(5, Math.abs(numero(o.dispersion) ?? def.dispersion ?? 90)));
    const ganancia = numero(o.ganancia) ?? 0;
    const rot = numero(o.rot) ?? 0;
    const giro = rot / GRADOS;
    lista.push({
      id: o.id,
      nombre: o.nombre || def.nombre || o.tipo,
      tipo: o.tipo,
      pos: [x, y],
      z: elev + alto * 0.6,
      spl,
      ganancia,
      nivel: spl + ganancia + general,
      dispersion,
      cardioide,
      omni: dispersion >= 360 && !cardioide,
      rot,
      // Con rot 0 el frente mira hacia +y; el giro es horario visto en planta.
      frente: [-Math.sin(giro), Math.cos(giro)],
      aire: o.tipo === 'sub' ? 0 : AIRE_DB_M,
    });
  }
  return lista;
}

// Paredes con alto, como segmentos por el medio del muro: [ax, ay, bx, by, ...]. Las puertas y portones
// cortan el muro (por ahí pasa el sonido); las ventanas cuentan como pared.
function murosDe(escena) {
  const segs = [];
  for (const a of escena?.areas || []) {
    if (!a?.paredes || !Array.isArray(a.contorno) || a.contorno.length < 3) continue;
    let g;
    try {
      g = geometriaArea(a);
    } catch {
      continue;
    }
    for (const q of g.muros) {
      if (q.length < 4) continue;
      segs.push((q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2, (q[1][0] + q[2][0]) / 2, (q[1][1] + q[2][1]) / 2);
    }
  }
  return new Float64Array(segs);
}

function preparar(escena, fuentes, muros) {
  const fs = (fuentes || fuentesSonido(escena)).map((f) => {
    let lut = null;
    if (!f.omni) {
      lut = new Float32Array(721);
      for (let i = 0; i <= 720; i++) lut[i] = atenuacionDireccion(i / 4, f.dispersion, f.cardioide);
    }
    return { x: f.pos[0], y: f.pos[1], z: f.z, nivel: f.nivel, fx: f.frente[0], fy: f.frente[1], aire: f.aire, lut };
  });
  return { fs, muros: muros || murosDe(escena) };
}

// Cuántas paredes cruza el segmento A-B.
function cruces(ax, ay, bx, by, m) {
  let n = 0;
  const dx = bx - ax;
  const dy = by - ay;
  for (let i = 0; i < m.length; i += 4) {
    const cx = m[i];
    const cy = m[i + 1];
    const ex = m[i + 2] - cx;
    const ey = m[i + 3] - cy;
    const d1 = ex * (ay - cy) - ey * (ax - cx);
    const d2 = ex * (by - cy) - ey * (bx - cx);
    if (d1 * d2 >= 0) continue;
    const d3 = dx * (cy - ay) - dy * (cx - ax);
    const d4 = dx * (m[i + 3] - ay) - dy * (m[i + 2] - ax);
    if (d3 * d4 < 0) n++;
  }
  return n;
}

function nivelModelo(mod, x, y, altura) {
  const { fs, muros } = mod;
  let suma = 0;
  for (let s = 0; s < fs.length; s++) {
    const f = fs[s];
    const dx = x - f.x;
    const dy = y - f.y;
    const dz = f.z - altura;
    const h2 = dx * dx + dy * dy;
    const r2 = h2 + dz * dz;
    let L = f.nivel - (r2 > 1 ? 10 * Math.log10(r2) : 0);
    if (f.aire) L -= f.aire * Math.sqrt(r2);
    if (f.lut) {
      const h = Math.sqrt(h2);
      const c = h > 1e-9 ? (dx * f.fx + dy * f.fy) / h : 1;
      L += f.lut[Math.round(Math.acos(c < -1 ? -1 : c > 1 ? 1 : c) * GRADOS * 4)];
    }
    if (muros.length) L -= PERDIDA_PARED * cruces(f.x, f.y, x, y, muros);
    if (Number.isFinite(L)) suma += Math.pow(10, L / 10);
  }
  // 0 dB = no llega nada (o no hay equipos).
  return suma > 1 ? 10 * Math.log10(suma) : 0;
}

// Nivel estimado (dB) en un punto de la planta.
export function nivelEn(escena, [x, y], { altura = ALTURA_ESCUCHA, fuentes } = {}) {
  return nivelModelo(preparar(escena, fuentes), Number(x) || 0, Number(y) || 0, altura);
}

/* ------------------------------------------------------------------ mapa */

// Grilla de niveles sobre la escena (más un margen). valores[j * columnas + i] es el nivel en
// [origen[0] + i·paso, origen[1] + j·paso]; la fila 0 es la de y más chica (arriba en la planta).
// caja: { minX, minY, maxX, maxY } la reemplaza (sin margen). El paso se agranda para no pasar de 200.000 puntos.
export function mapaSonido(escena, { paso, margen = 30, altura = ALTURA_ESCUCHA, caja, fuentes } = {}) {
  let b = caja;
  let m = 0;
  if (!b) {
    try {
      b = limitesDibujo(escena);
    } catch {
      b = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    }
    m = Math.max(0, numero(margen) ?? 30);
  }
  const minX = b.minX - m;
  const minY = b.minY - m;
  const ancho = Math.max(b.maxX + m - minX, 1);
  const alto = Math.max(b.maxY + m - minY, 1);
  let p = numero(paso) > 0 ? numero(paso) : 0.25;
  p = Math.max(p, Math.sqrt((ancho * alto) / MAX_CELDAS));
  let columnas;
  let filas;
  for (;;) {
    columnas = Math.ceil(ancho / p) + 1;
    filas = Math.ceil(alto / p) + 1;
    if (columnas * filas <= MAX_CELDAS) break;
    p *= 1.02;
  }
  const mod = preparar(escena, fuentes);
  const valores = new Float32Array(columnas * filas);
  let maximo = 0;
  for (let j = 0; j < filas; j++) {
    const y = minY + j * p;
    for (let i = 0; i < columnas; i++) {
      const v = nivelModelo(mod, minX + i * p, y, altura);
      valores[j * columnas + i] = v;
      if (v > maximo) maximo = v;
    }
  }
  return {
    origen: [minX, minY],
    paso: p,
    columnas,
    filas,
    valores,
    altura,
    maximo,
    // Lo que cubre cada píxel de la textura (cada valor es el centro de su píxel).
    caja: { minX: minX - p / 2, minY: minY - p / 2, maxX: minX + (columnas - 0.5) * p, maxY: minY + (filas - 0.5) * p },
  };
}

const rgbDe = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

// Colores por banda para una textura (canvas ImageData): fila 0 = y más chica. Debajo de 65 dB, transparente.
export function colorearSonido(mapa, { alfa = 0.5 } = {}) {
  const { columnas, filas, valores } = mapa;
  const rgba = new Uint8ClampedArray(columnas * filas * 4);
  const a = Math.round(Math.min(1, Math.max(0, alfa)) * 255);
  const cols = BANDAS.map((b) => rgbDe(b.color));
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    for (let k = 0; k < BANDAS.length; k++) {
      if (v >= BANDAS[k].desde) {
        const c = cols[k];
        const q = i * 4;
        rgba[q] = c[0];
        rgba[q + 1] = c[1];
        rgba[q + 2] = c[2];
        rgba[q + 3] = a;
        break;
      }
    }
  }
  return { columnas, filas, rgba };
}

/* ------------------------------------------------------------------ curvas de nivel */

// Simplificación de Douglas-Peucker (tol en metros).
function simplificar(lin, tol) {
  const n = lin.length;
  if (n < 4 || !(tol > 0)) return lin;
  const marca = new Uint8Array(n);
  marca[0] = marca[n - 1] = 1;
  const pila = [[0, n - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    const [ax, ay] = lin[a];
    const dx = lin[b][0] - ax;
    const dy = lin[b][1] - ay;
    const L = Math.hypot(dx, dy);
    let max = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = lin[i][0] - ax;
      const py = lin[i][1] - ay;
      const d = L < 1e-9 ? Math.hypot(px, py) : Math.abs(dx * py - dy * px) / L;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol) {
      marca[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return lin.filter((_, i) => marca[i]);
}

// Marching squares de un nivel. cerrar: rodea la grilla con un borde muy bajo, así todas las curvas cierran
// (sirve para rellenar). Devuelve listas de puntos [x, y] en metros; las cerradas repiten el primero al final.
function marchar(mapa, nivel, cerrar, tol) {
  const { columnas: C, filas: F, valores: v, origen, paso } = mapa;
  const [x0, y0] = origen;
  const L = nivel - 1e-4;
  const BAJO = -1e9;
  const val = (i, j) => (i < 0 || j < 0 || i >= C || j >= F ? BAJO : v[j * C + i]);
  const ancho = C + 2;
  const puntos = new Map();
  const vecinos = new Map();
  // Arista horizontal (i,j)-(i+1,j): clave par; vertical (i,j)-(i,j+1): impar.
  const arista = (i, j, vertical) => {
    const clave = ((j + 1) * ancho + (i + 1)) * 2 + (vertical ? 1 : 0);
    if (!puntos.has(clave)) {
      const i2 = vertical ? i : i + 1;
      const j2 = vertical ? j + 1 : j;
      const v1 = val(i, j);
      const v2 = val(i2, j2);
      const t = v2 === v1 ? 0.5 : Math.min(1, Math.max(0, (L - v1) / (v2 - v1)));
      puntos.set(clave, [x0 + (i + t * (i2 - i)) * paso, y0 + (j + t * (j2 - j)) * paso]);
    }
    return clave;
  };
  const unir = (a, b) => {
    if (!vecinos.has(a)) vecinos.set(a, []);
    if (!vecinos.has(b)) vecinos.set(b, []);
    vecinos.get(a).push(b);
    vecinos.get(b).push(a);
  };
  const i0 = cerrar ? -1 : 0;
  const i1 = cerrar ? C - 1 : C - 2;
  const j1 = cerrar ? F - 1 : F - 2;
  for (let j = i0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const a = val(i, j);
      const b = val(i + 1, j);
      const c = val(i + 1, j + 1);
      const d = val(i, j + 1);
      const caso = (a >= L ? 8 : 0) | (b >= L ? 4 : 0) | (c >= L ? 2 : 0) | (d >= L ? 1 : 0);
      if (caso === 0 || caso === 15) continue;
      const T = () => arista(i, j, false);
      const R = () => arista(i + 1, j, true);
      const B = () => arista(i, j + 1, false);
      const I = () => arista(i, j, true);
      switch (caso) {
        case 1: case 14: unir(I(), B()); break;
        case 2: case 13: unir(B(), R()); break;
        case 3: case 12: unir(I(), R()); break;
        case 4: case 11: unir(T(), R()); break;
        case 6: case 9: unir(T(), B()); break;
        case 7: case 8: unir(T(), I()); break;
        case 5:
        case 10: {
          // Punto silla: decide el promedio del centro.
          const alto = (a + b + c + d) / 4 >= L;
          if ((caso === 5) === alto) {
            unir(T(), I());
            unir(R(), B());
          } else {
            unir(T(), R());
            unir(I(), B());
          }
          break;
        }
      }
    }
  }
  const usados = new Set();
  const seguir = (inicio) => {
    const lin = [puntos.get(inicio)];
    usados.add(inicio);
    let actual = inicio;
    for (;;) {
      const vs = vecinos.get(actual);
      let sig = -1;
      for (const w of vs) if (!usados.has(w)) {
        sig = w;
        break;
      }
      if (sig < 0) {
        if (lin.length > 2 && vs.includes(inicio)) lin.push(lin[0]);
        break;
      }
      usados.add(sig);
      lin.push(puntos.get(sig));
      actual = sig;
    }
    return lin;
  };
  const lineas = [];
  for (const [k, vs] of vecinos) if (vs.length === 1 && !usados.has(k)) lineas.push(seguir(k));
  for (const k of vecinos.keys()) if (!usados.has(k)) lineas.push(seguir(k));
  const r = (n) => Math.round(n * 1000) / 1000;
  return lineas
    .map((l) => simplificar(l, tol).map(([x, y]) => [r(x), r(y)]))
    .filter((l) => l.length >= 2 && !(l.length < 4 && l[0][0] === l.at(-1)[0] && l[0][1] === l.at(-1)[1]));
}

// Curvas de igual nivel, unidas en polilíneas (metros de la escena). Con cerrar: true todas cierran contra
// el borde de la grilla (para rellenar bandas); por defecto quedan abiertas en el borde.
export function curvasSonido(mapa, niveles = BANDAS.map((b) => b.desde), { cerrar = false, tolerancia } = {}) {
  const tol = tolerancia ?? mapa.paso * 0.25;
  return niveles.map((nivel) => ({ nivel, lineas: marchar(mapa, nivel, cerrar, tol) }));
}

/* ------------------------------------------------------------------ análisis */

const esPista = (o) => o.tipo === 'zona' && (o.uso === 'pista' || /\bpista\b/i.test(String(o.nombre || '')));

function muestrasZona(o, mod, altura, max = 4000) {
  const contorno = esPoligono(o) ? puntosMundo(o) : esquinas(o);
  const c = cajaDe(contorno);
  const paso = Math.max(0.5, Math.sqrt(((c.maxX - c.minX) * (c.maxY - c.minY)) / max));
  const vals = [];
  for (let x = c.minX + paso / 2; x < c.maxX; x += paso) {
    for (let y = c.minY + paso / 2; y < c.maxY; y += paso) if (dentroDe(o, x, y)) vals.push(nivelModelo(mod, x, y, altura));
  }
  if (!vals.length) vals.push(nivelModelo(mod, o.pos[0], o.pos[1], altura));
  return vals;
}

// Ruido en los puntos de medición (contra su límite) y cobertura de la pista.
export function analizarRuido(escena, { altura = ALTURA_ESCUCHA } = {}) {
  const fuentes = fuentesSonido(escena);
  const mod = preparar(escena, fuentes);
  const objetos = escena?.objetos || [];
  const avisos = [];
  const dB = (v) => `${fm(v, 0)} dB`;

  const puntos = [];
  for (const o of objetos) {
    if (o?.tipo !== 'medicion' || !Array.isArray(o.pos)) continue;
    const alto = numero(o.dims?.[2]);
    const h = (numero(o.elev) ?? 0) + (alto > 0 ? alto : 1.5);
    const nivel = fuentes.length ? nivelModelo(mod, o.pos[0], o.pos[1], h) : 0;
    const limite = numero(o.limite);
    const distancia = fuentes.length ? Math.min(...fuentes.map((f) => Math.hypot(f.pos[0] - o.pos[0], f.pos[1] - o.pos[1]))) : null;
    const ok = limite === null ? null : nivel <= limite;
    const margen = limite === null ? null : limite - nivel;
    puntos.push({ id: o.id, nombre: o.nombre || 'Punto de medición', pos: [o.pos[0], o.pos[1]], nivel, limite, ok, margen, distancia });
  }

  let pista = null;
  const zonas = objetos.filter((o) => o && esPista(o));
  if (zonas.length && fuentes.length) {
    const vals = zonas.flatMap((z) => muestrasZona(z, mod, altura)).sort((a, b) => a - b);
    const p = (q) => vals[Math.floor(q * (vals.length - 1))];
    pista = {
      nombres: zonas.map((z) => z.nombre || 'Pista'),
      superficie: zonas.reduce((s, z) => s + superficieDe(z), 0),
      promedio: vals.reduce((s, v) => s + v, 0) / vals.length,
      minimo: vals[0],
      maximo: vals.at(-1),
      // Diferencia entre el 10 % más bajo y el 10 % más alto (sin los extremos de pegado a los parlantes).
      variacion: p(0.9) - p(0.1),
    };
  }

  if (!fuentes.length) {
    avisos.push({ tipo: 'aviso', texto: 'No hay parlantes ni subs en la escena. Agregalos desde la biblioteca para ver la cobertura.' });
  } else {
    for (const pt of puntos) {
      if (pt.limite === null) continue;
      if (!pt.ok) avisos.push({ tipo: 'error', texto: `${pt.nombre}: llegan unos ${dB(pt.nivel)} y el límite es ${dB(pt.limite)} (se pasa por ${dB(-pt.margen)}). Bajá el volumen, girá los parlantes para otro lado o sumá una barrera.` });
      else if (pt.margen < 3) avisos.push({ tipo: 'aviso', texto: `${pt.nombre}: queda justo, ${dB(pt.nivel)} con un límite de ${dB(pt.limite)}.` });
    }
    if (pista) {
      if (pista.promedio < 95) avisos.push({ tipo: 'aviso', texto: `La pista queda baja: promedio de ${dB(pista.promedio)}. Para bailar se busca entre 95 y 100 dB; subí la ganancia, sumá parlantes o acercalos.` });
      else if (pista.promedio > 105) avisos.push({ tipo: 'aviso', texto: `La pista promedia ${dB(pista.promedio)}: es mucho. Arriba de 100 dB conviene cortar la exposición; bajá la ganancia general o alejá los parlantes del público.` });
      if (pista.maximo > 115) avisos.push({ tipo: 'aviso', texto: `Pegado a los parlantes llegan ${dB(pista.maximo)}: dejá unos metros libres (vallado o tarima) entre la gente y los equipos.` });
      if (pista.variacion > 12) avisos.push({ tipo: 'aviso', texto: `La pista es despareja: cambia ${dB(pista.variacion)} de adelante hacia atrás. Abrí los parlantes o sumá un refuerzo para el fondo.` });
    } else {
      avisos.push({ tipo: 'nota', texto: 'Marcá la pista con una zona (uso: pista) para ver cómo llega el sonido.' });
    }
    if (!puntos.length) avisos.push({ tipo: 'nota', texto: 'Sumá un punto de medición donde están los vecinos (con su límite en dB) para controlar el ruido.' });
  }

  return {
    fuentes: fuentes.length,
    parlantes: fuentes.filter((f) => f.tipo !== 'sub').length,
    subs: fuentes.filter((f) => f.tipo === 'sub').length,
    ganancia: numero(escena?.sonido?.ganancia) ?? 0,
    altura,
    puntos,
    pista,
    avisos,
  };
}

/* ------------------------------------------------------------------ panel */

const claseDe = (pt) => (pt.ok === null ? '' : !pt.ok ? 'so-error' : pt.margen < 3 ? 'so-aviso' : 'so-ok');

// HTML para el panel lateral. Clases: so-panel, so-tarjeta, so-ok, so-aviso, so-error, so-detalle, so-cifras,
// so-puntos y so-leyenda (estilos sugeridos en ESTILOS_SONIDO).
export function htmlSonido(escena, analisis = analizarRuido(escena)) {
  const a = analisis;
  const dB = (v) => `${fm(v, 0)} dB`;
  let h = '<div class="so-panel">';
  const partes = [];
  if (a.parlantes) partes.push(`${a.parlantes} ${a.parlantes === 1 ? 'parlante' : 'parlantes'}`);
  if (a.subs) partes.push(`${a.subs} ${a.subs === 1 ? 'sub' : 'subs'}`);
  const resumen = a.fuentes
    ? `${partes.join(' y ')}. Oído a ${fm(a.altura, 1)} m${a.ganancia ? `, volumen general ${a.ganancia > 0 ? '+' : ''}${fm(a.ganancia, 0)} dB` : ''}.`
    : 'Todavía no hay equipos de sonido.';
  h += `<div class="so-tarjeta"><strong>Sonido estimado</strong><p class="so-detalle">${esc(resumen)} Estimación para planificar, no reemplaza una medición.</p></div>`;

  if (a.pista) {
    const p = a.pista;
    const bien = p.promedio >= 95 && p.promedio <= 105 && p.maximo <= 115;
    h += `<div class="so-tarjeta ${bien ? 'so-ok' : 'so-aviso'}"><strong>${esc(p.nombres.join(', '))}</strong>`;
    h += `<dl class="so-cifras"><div><dt>Promedio</dt><dd>${dB(p.promedio)}</dd></div><div><dt>Mínimo</dt><dd>${dB(p.minimo)}</dd></div><div><dt>Máximo</dt><dd>${dB(p.maximo)}</dd></div></dl>`;
    h += `<p class="so-detalle">${esc(`${fm(p.superficie, 0)} m². Para bailar se busca entre 95 y 100 dB.`)}</p></div>`;
  }

  if (a.puntos.length) {
    h += '<div class="so-tarjeta"><strong>Puntos de medición</strong><ul class="so-puntos">';
    for (const pt of a.puntos) {
      let det = pt.distancia !== null ? `A ${fm(pt.distancia, 0)} m del equipo más cercano` : '';
      if (pt.limite !== null) det += `${det ? '. ' : ''}Límite ${dB(pt.limite)}: ${pt.ok ? `sobran ${dB(pt.margen)}` : `se pasa por ${dB(-pt.margen)}`}`;
      else det += `${det ? '. ' : ''}Sin límite cargado`;
      h += `<li class="${claseDe(pt)}"><span>${esc(pt.nombre)}</span><b>${dB(pt.nivel)}</b><span class="so-detalle">${esc(det)}.</span></li>`;
    }
    h += '</ul></div>';
  }

  for (const av of a.avisos) h += `<p class="${av.tipo === 'error' ? 'so-error' : av.tipo === 'aviso' ? 'so-aviso' : 'so-detalle'}">${esc(av.texto)}</p>`;

  h += '<ul class="so-leyenda">';
  for (const b of BANDAS) h += `<li><i style="background:${b.color}"></i>${esc(b.nombre)}</li>`;
  h += `<li><i style="background:transparent;border:1px solid currentColor"></i>${esc(`Menos de ${BANDAS.at(-1).desde} dB: sin color`)}</li></ul>`;
  h += `<p class="so-detalle">${esc(AVISO_MODELO)}</p></div>`;
  return h;
}

// Estilos sugeridos para el panel (usan las variables de estilos.css).
export const ESTILOS_SONIDO = `
.so-panel { display: grid; gap: 10px; font-size: 13px; }
.so-tarjeta { background: var(--panel-2); border: 1px solid var(--linea); border-radius: var(--r-chico); padding: 10px 12px; }
.so-tarjeta > strong { display: block; margin-bottom: 4px; }
.so-tarjeta.so-ok { border-color: var(--exito); }
.so-tarjeta.so-aviso { border-color: var(--calido); }
.so-tarjeta.so-error { border-color: var(--peligro); }
.so-cifras { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 6px 0; }
.so-cifras div { margin: 0; }
.so-cifras dt { color: var(--tinta-3); font-size: 11px; }
.so-cifras dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.so-puntos { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.so-puntos li { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding-left: 9px; border-left: 3px solid var(--linea-2); }
.so-puntos li.so-ok { border-left-color: var(--exito); }
.so-puntos li.so-aviso { border-left-color: var(--calido); }
.so-puntos li.so-error { border-left-color: var(--peligro); }
.so-puntos b { font-variant-numeric: tabular-nums; }
.so-puntos .so-detalle { grid-column: 1 / -1; }
p.so-ok, p.so-aviso, p.so-error { margin: 0; padding: 8px 10px; border-radius: var(--r-chico); }
p.so-ok { background: rgba(47, 191, 113, 0.14); }
p.so-aviso { background: rgba(232, 170, 76, 0.16); }
p.so-error { background: rgba(255, 59, 48, 0.14); }
.so-detalle { color: var(--tinta-2); font-size: 12px; margin: 0; }
.so-leyenda { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 12px; }
.so-leyenda i { display: inline-block; width: 14px; height: 10px; border-radius: 2px; margin-right: 8px; vertical-align: -1px; }
`;

/* ------------------------------------------------------------------ hoja del plano */

const EN_HOJA = new Set(['parlante', 'sub', 'cabina_dj', 'zona', 'medicion']);
const OPACIDAD_HOJA = 0.3;

const colorPunto = (pt) => (pt.ok === null ? TINTA : !pt.ok ? '#FF3B30' : pt.margen < 3 ? '#B7791F' : '#1D8A55');

// Bandas rellenas, curvas y rótulos de los puntos de medición, encima de la planta.
function capaSonido({ M, k, dib, escena }, fuentes, an) {
  const [ox, oy] = M([0, 0]);
  const vis = { minX: (dib.x - ox) / k, maxX: (dib.x + dib.w - ox) / k, minY: (dib.y - oy) / k, maxY: (dib.y + dib.h - oy) / k };
  const sup = (vis.maxX - vis.minX) * (vis.maxY - vis.minY);
  // Más o menos un punto por milímetro de papel, sin pasar de 150.000.
  const paso = Math.max(1 / k, Math.sqrt(sup / 150000));
  const caja = { minX: vis.minX - 2 * paso, minY: vis.minY - 2 * paso, maxX: vis.maxX + 2 * paso, maxY: vis.maxY + 2 * paso };
  let s = '';
  if (fuentes.length) {
    const mapa = mapaSonido(escena, { caja, paso, fuentes });
    const tol = 0.12 / k;
    const niveles = BANDAS.map((b) => b.desde);
    const cerradas = curvasSonido(mapa, niveles, { cerrar: true, tolerancia: tol });
    const abiertas = curvasSonido(mapa, niveles, { tolerancia: tol });
    const ruta = (lineas, cerrar) =>
      lineas
        .map((l) => {
          const q = l.map((p) => M(p)).map(([x, y]) => `${n2(x)} ${n2(y)}`);
          return `M${q[0]}L${q.slice(1).join(' ')}${cerrar ? 'Z' : ''}`;
        })
        .join('');
    // Cada banda = lo que supera su nivel menos lo que supera el de arriba (evenodd hace el hueco).
    let rellenos = '';
    BANDAS.forEach((b, i) => {
      const lineas = i ? [...cerradas[i].lineas, ...cerradas[i - 1].lineas] : cerradas[i].lineas;
      if (cerradas[i].lineas.length) rellenos += `<path d="${ruta(lineas, true)}" fill="${b.color}" fill-opacity="${OPACIDAD_HOJA}" fill-rule="evenodd" stroke="none"/>`;
    });
    let trazos = '';
    let rotulos = '';
    // Lugares que el rótulo de una curva no tiene que tapar: nombres de zonas y puntos de medición (en mm).
    const ocupados = [...escena.objetos.filter((o) => o.tipo === 'zona').map((o) => M(o.pos)), ...an.puntos.map((pt) => M(pt.pos))];
    const enLinea = (l, largo, fr) => {
      let resto = largo * fr;
      for (let j = 1; j < l.length; j++) {
        const d = Math.hypot(l[j][0] - l[j - 1][0], l[j][1] - l[j - 1][1]);
        if (resto <= d) {
          const t = d ? resto / d : 0;
          return [l[j - 1][0] + (l[j][0] - l[j - 1][0]) * t, l[j - 1][1] + (l[j][1] - l[j - 1][1]) * t];
        }
        resto -= d;
      }
      return l.at(-1);
    };
    BANDAS.forEach((b, i) => {
      const lineas = abiertas[i].lineas;
      if (!lineas.length) return;
      trazos += `<path d="${ruta(lineas, false)}" fill="none" stroke="${b.color}" stroke-width="0.25" stroke-linejoin="round"/>`;
      // Un rótulo con el nivel en la curva más larga, si se ve bien en el papel y no tapa otro texto.
      let mejor = null;
      let largoMejor = 0;
      for (const l of lineas) {
        let L = 0;
        for (let j = 1; j < l.length; j++) L += Math.hypot(l[j][0] - l[j - 1][0], l[j][1] - l[j - 1][1]);
        if (L > largoMejor) {
          largoMejor = L;
          mejor = l;
        }
      }
      if (!mejor || largoMejor * k < 40) return;
      const libre = (q) => q[0] > dib.x + 3 && q[0] < dib.x + dib.w - 3 && q[1] > dib.y + 3 && q[1] < dib.y + dib.h - 3 && ocupados.every((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) > 9);
      const c = [0.3, 0.42, 0.18, 0.55, 0.68, 0.8, 0.08, 0.92].map((fr) => M(enLinea(mejor, largoMejor, (fr + 0.07 * i) % 1))).find(libre);
      if (!c) return;
      ocupados.push(c);
      const txt = String(b.desde);
      const w = anchoTexto(txt, 1.7) + 1.6;
      rotulos += `<rect x="${n2(c[0] - w / 2)}" y="${n2(c[1] - 1.3)}" width="${n2(w)}" height="2.6" rx="0.5" fill="#fff" stroke="${b.color}" stroke-width="0.2"/>`;
      rotulos += texto(c[0], c[1] + 0.05, txt, { t: 1.7, peso: 700, color: TINTA, ancla: 'middle', base: 'middle' });
    });
    s += `<g>${rellenos}</g><g>${trazos}</g>${rotulos}`;
  }
  // Puntos de medición: nivel estimado y nombre al costado.
  for (const pt of an.puntos) {
    const c = M(pt.pos);
    const color = colorPunto(pt);
    const l1 = `${fm(pt.nivel, 0)} dB${pt.limite !== null ? ` / límite ${fm(pt.limite, 0)}` : ''}`;
    const l2 = recortar(pt.nombre, 1.6, 34);
    const w = Math.max(anchoTexto(l1, 2), anchoTexto(l2, 1.6)) + 3;
    const derecha = c[0] + 2 + w <= dib.x + dib.w - 1;
    const x = derecha ? c[0] + 2 : c[0] - 2 - w;
    s += `<rect x="${n2(x)}" y="${n2(c[1] - 3.4)}" width="${n2(w)}" height="6.6" rx="0.8" fill="#fff" stroke="${color}" stroke-width="0.3"/>`;
    s += texto(x + 1.5, c[1] - 0.6, l1, { t: 2, peso: 700, color });
    s += texto(x + 1.5, c[1] + 2.3, l2, { t: 1.6, color: GRIS });
  }
  return s;
}

// Referencias de la hoja: leyenda, pista, puntos de medición y avisos. Se acomodan en una o varias columnas.
function columnaSonido({ col, banda, derX, derW, limite }, an) {
  const regiones = [];
  if (banda) {
    const anchoIzq = derX - col.x;
    const n = Math.max(1, Math.floor(anchoIzq / 62));
    for (let i = 0; i < n; i++) regiones.push({ x: col.x + (i * anchoIzq) / n, y: col.y + 2, w: anchoIzq / n, limite: col.y + col.h - 5 });
    regiones.push({ x: derX, y: col.y + 2, w: derW, limite });
  } else regiones.push({ x: col.x, y: col.y + 2, w: col.w, limite });
  const anchoTextos = Math.min(...regiones.map((r) => r.w)) - 8;
  const dB = (v) => `${fm(v, 0)} dB`;
  const filas = [];
  const fila = (alto, dib, junto = false) => filas.push({ alto, dib, junto });
  const parrafo = (s, t = 1.8, color = GRIS, peso = 400) => {
    for (const l of envolver(s, t, anchoTextos)) fila(t * 1.5, (x, y) => texto(x + 4, y + t * 1.1, l, { t, color, peso }));
  };
  const seccion = (s) => fila(5.6, (x, y) => texto(x + 4, y + 4.4, s, { t: 2.4, peso: 700 }), true);
  const dato = (etq, valor, color = TINTA) =>
    fila(3.8, (x, y, w) => texto(x + 4, y + 2.8, recortar(etq, 1.9, w - 28), { t: 1.9, color: GRIS }) + texto(x + w - 4, y + 2.8, valor, { t: 2, peso: 700, ancla: 'end', color }));

  fila(7, (x, y) => texto(x + 4, y + 5, 'Cobertura de sonido', { t: 3, peso: 700 }));
  parrafo('Estimación simple para planificar: no reemplaza una medición en el lugar.');

  seccion('Nivel a la altura del oído');
  for (const b of BANDAS) {
    fila(3.9, (x, y, w) =>
      `<rect x="${n2(x + 4)}" y="${n2(y + 0.5)}" width="6" height="2.7" fill="${b.color}" fill-opacity="${OPACIDAD_HOJA}" stroke="${b.color}" stroke-width="0.25"/>` +
      texto(x + 12, y + 2.75, recortar(b.nombre, 1.9, w - 16), { t: 1.9 }),
    );
  }

  if (an.pista) {
    const p = an.pista;
    seccion(recortar(p.nombres.join(', '), 2.4, anchoTextos));
    dato('Promedio', dB(p.promedio));
    dato('Mínimo', dB(p.minimo));
    dato('Máximo', dB(p.maximo));
  }

  if (an.puntos.length) {
    seccion('Puntos de medición');
    for (const pt of an.puntos) {
      const color = colorPunto(pt);
      dato(pt.nombre, dB(pt.nivel), color);
      const det = pt.limite === null ? 'Sin límite cargado' : `Límite ${dB(pt.limite)}: ${pt.ok ? `sobran ${dB(pt.margen)}` : `se pasa por ${dB(-pt.margen)}`}`;
      fila(3, (x, y, w) => texto(x + 4, y + 2, recortar(det, 1.7, w - 8), { t: 1.7, color: pt.ok === false ? color : GRIS }));
    }
  }

  const importantes = an.avisos.filter((a) => a.tipo !== 'nota');
  if (importantes.length) {
    seccion('Para revisar');
    for (const av of importantes) {
      const color = av.tipo === 'error' ? '#FF3B30' : TINTA;
      envolver(av.texto, 1.8, anchoTextos - 3).forEach((l, i) =>
        fila(2.8, (x, y) => (i ? '' : `<circle cx="${n2(x + 5)}" cy="${n2(y + 1.4)}" r="0.6" fill="${av.tipo === 'error' ? '#FF3B30' : '#E8AA4C'}"/>`) + texto(x + 7, y + 2, l, { t: 1.8, color })),
      );
      fila(0.8, () => '');
    }
  }

  const partes = [];
  if (an.parlantes) partes.push(`${an.parlantes} ${an.parlantes === 1 ? 'parlante' : 'parlantes'}`);
  if (an.subs) partes.push(`${an.subs} ${an.subs === 1 ? 'sub' : 'subs'}`);
  seccion('Equipos');
  dato('Fuentes', partes.length ? partes.join(' y ') : 'Ninguna');
  dato('Altura del oído', `${fm(an.altura, 1)} m`);
  if (an.ganancia) dato('Volumen general', `${an.ganancia > 0 ? '+' : ''}${dB(an.ganancia)}`);

  seccion('Cómo se calcula');
  parrafo(AVISO_MODELO, 1.7);

  // Se reparten las filas en las regiones; si no entra todo, queda una línea que avisa.
  let s = '';
  let r = 0;
  let y = regiones[0].y;
  let ultima = null;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const necesita = f.alto + (f.junto && filas[i + 1] ? filas[i + 1].alto : 0);
    while (r < regiones.length && y + necesita > regiones[r].limite) {
      r++;
      if (r < regiones.length) y = regiones[r].y;
    }
    if (r >= regiones.length) {
      if (ultima) s += texto(ultima.x + 4, ultima.y + 2.4, 'Sigue en el panel de sonido de la app.', { t: 1.7, color: GRIS });
      break;
    }
    s += f.dib(regiones[r].x, y, regiones[r].w);
    y += f.alto;
    ultima = { x: regiones[r].x, y };
  }
  return s;
}

// Hoja extra para generarHojas: planta con las bandas de sonido, los puntos de medición y el análisis.
export function hojaSonido(escena, comp, op) {
  return {
    paginas: 1,
    crear(numeroHoja, totalHojas) {
      const fuentes = fuentesSonido(escena);
      const an = analizarRuido(escena);
      return [
        hojaPlanta(escena, comp, op, totalHojas, {
          titulo: 'Cobertura de sonido',
          numeroHoja,
          numeros: false,
          filtro: (o) => EN_HOJA.has(o.tipo) || catDe(o) === 'estructura',
          encima: (ctx) => capaSonido(ctx, fuentes, an),
          columna: (ctx) => columnaSonido(ctx, an),
        }),
      ];
    },
  };
}
