// Códigos QR (modelo 2, ISO/IEC 18004) sin dependencias: para los mapas impresos ("cómo llegar") y otros enlaces.
// Arma la matriz de módulos y la dibuja en SVG en las unidades de quien llama (mm de papel o px de pantalla).
//
//   crearQR(texto, { correccion })  → { version, tamano, modulos, correccion, mascara }
//                                      modulos[fila][columna], true = oscuro
//   qrSVG(texto, opciones)          → '<g>…</g>' (sin <svg> afuera): el código dentro de un cuadrado de lado `lado`
//   qrSVGCompleto(texto, opciones)  → '<svg …>…</svg>' suelto, para probar o descargar
//
// Usa un solo modo para todo el texto, el más corto que sirva: numérico, alfanumérico (mayúsculas, dígitos y
// " $%*+-./:") o bytes en UTF-8 (una URL común va en bytes, un byte por letra). Versiones 1 a 40, la más chica que entre.

// ---------- Tablas del estándar ----------

// Nivel de corrección: [bits que van en el formato, fila en las tablas de abajo].
const NIVELES = { L: [1, 0], M: [0, 1], Q: [3, 2], H: [2, 3] };

// Por nivel (L, M, Q, H) y versión (índice 1 a 40): palabras de corrección por bloque y cantidad de bloques.
const CORRECCION_POR_BLOQUE = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const BLOQUES = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const ALFANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
// Bits del contador de caracteres por modo (1 numérico, 2 alfanumérico, 4 bytes) y rango de versión (1-9, 10-26, 27-40).
const BITS_CUENTA = { 1: [10, 12, 14], 2: [9, 11, 13], 4: [8, 16, 16] };
const rango = (v) => (v <= 9 ? 0 : v <= 26 ? 1 : 2);

// Módulos que quedan para datos y corrección (todo menos los patrones fijos, el formato y la versión).
function modulosDatos(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}
const palabrasTotales = (v) => Math.floor(modulosDatos(v) / 8);
const palabrasDatos = (v, n) => palabrasTotales(v) - CORRECCION_POR_BLOQUE[n][v] * BLOQUES[n][v];

// Centros de los patrones de alineación (filas y columnas), según la versión.
function posAlineacion(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2;
  const paso = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = v * 4 + 10; r.length < n; p -= paso) r.splice(1, 0, p);
  return r;
}

// ---------- Reed–Solomon sobre GF(256), polinomio 0x11D ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, v = 1; i < 255; i++) {
  EXP[i] = v;
  LOG[v] = i;
  v <<= 1;
  if (v & 0x100) v ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mult = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

// Generador (x + α⁰)(x + α¹)…(x + αⁿ⁻¹), del término de mayor grado (1) al independiente.
const generadores = new Map();
function generador(grado) {
  if (generadores.has(grado)) return generadores.get(grado);
  let g = [1];
  for (let i = 0; i < grado; i++) {
    const nuevo = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      nuevo[j] ^= g[j];
      nuevo[j + 1] ^= mult(g[j], EXP[i]);
    }
    g = nuevo;
  }
  generadores.set(grado, g);
  return g;
}

// Palabras de corrección de un bloque: resto de datos·xⁿ dividido por el generador.
function restoRS(datos, gen) {
  const n = gen.length - 1;
  const resto = new Array(n).fill(0);
  for (const b of datos) {
    const f = b ^ resto.shift();
    resto.push(0);
    if (f) for (let j = 0; j < n; j++) resto[j] ^= mult(gen[j + 1], f);
  }
  return resto;
}

// ---------- Datos ----------

function poner(bits, valor, n) {
  for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
}

// Un segmento con el modo más corto que admita todo el texto.
function segmento(texto) {
  const bits = [];
  if (/^[0-9]+$/.test(texto)) {
    for (let i = 0; i < texto.length; i += 3) {
      const t = texto.slice(i, i + 3);
      poner(bits, Number(t), t.length * 3 + 1);
    }
    return { modo: 1, cuenta: texto.length, bits };
  }
  if (/^[0-9A-Z $%*+\-./:]+$/.test(texto)) {
    for (let i = 0; i < texto.length; i += 2) {
      const a = ALFANUM.indexOf(texto[i]);
      if (i + 1 < texto.length) poner(bits, a * 45 + ALFANUM.indexOf(texto[i + 1]), 11);
      else poner(bits, a, 6);
    }
    return { modo: 2, cuenta: texto.length, bits };
  }
  const bytes = new TextEncoder().encode(texto);
  for (const b of bytes) poner(bits, b, 8);
  return { modo: 4, cuenta: bytes.length, bits };
}

function elegirVersion(seg, n) {
  for (let v = 1; v <= 40; v++) {
    const nCuenta = BITS_CUENTA[seg.modo][rango(v)];
    if (seg.cuenta >= 2 ** nCuenta) continue;
    if (4 + nCuenta + seg.bits.length <= palabrasDatos(v, n) * 8) return v;
  }
  throw new Error('El texto es demasiado largo para un código QR.');
}

// Palabras de datos: modo, cuenta, datos, terminador, relleno hasta el byte y bytes de relleno (EC, 11).
function palabrasDeDatos(seg, v, n) {
  const capacidad = palabrasDatos(v, n) * 8;
  const bits = [];
  poner(bits, seg.modo, 4);
  poner(bits, seg.cuenta, BITS_CUENTA[seg.modo][rango(v)]);
  for (const b of seg.bits) bits.push(b);
  poner(bits, 0, Math.min(4, capacidad - bits.length));
  poner(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let relleno = 0xec; bits.length < capacidad; relleno ^= 0xec ^ 0x11) poner(bits, relleno, 8);
  const datos = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    datos.push(b);
  }
  return datos;
}

// Parte los datos en bloques (primero los cortos), les suma la corrección y los intercala.
function intercalar(datos, v, n) {
  const nb = BLOQUES[n][v];
  const ec = CORRECCION_POR_BLOQUE[n][v];
  const total = palabrasTotales(v);
  const cortos = nb - (total % nb);
  const largoCorto = Math.floor(total / nb) - ec;
  const gen = generador(ec);
  const bloques = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const largo = largoCorto + (i < cortos ? 0 : 1);
    const d = datos.slice(k, k + largo);
    k += largo;
    bloques.push({ d, c: restoRS(d, gen) });
  }
  const salida = [];
  for (let i = 0; i <= largoCorto; i++) for (const b of bloques) if (i < b.d.length) salida.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of bloques) salida.push(b.c[i]);
  return salida;
}

// ---------- Matriz ----------

// Información de formato: nivel y máscara con BCH (15,5), enmascarada con 101010000010010.
function bitsFormato(nivel, mascara) {
  const datos = (NIVELES[nivel][0] << 3) | mascara;
  let r = datos;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((datos << 10) | r) ^ 0x5412;
}

// Información de versión (desde la 7): BCH (18,6).
function bitsVersion(v) {
  let r = v;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  return (v << 12) | r;
}

const bit = (x, i) => ((x >>> i) & 1) === 1;

function dibujarFormato(fijar, n, bits) {
  // Copia 1, alrededor del buscador de arriba a la izquierda.
  for (let i = 0; i <= 5; i++) fijar(i, 8, bit(bits, i));
  fijar(7, 8, bit(bits, 6));
  fijar(8, 8, bit(bits, 7));
  fijar(8, 7, bit(bits, 8));
  for (let i = 9; i < 15; i++) fijar(8, 14 - i, bit(bits, i));
  // Copia 2, partida entre el de arriba a la derecha y el de abajo a la izquierda.
  for (let i = 0; i < 8; i++) fijar(8, n - 1 - i, bit(bits, i));
  for (let i = 8; i < 15; i++) fijar(n - 15 + i, 8, bit(bits, i));
  fijar(n - 8, 8, true); // módulo oscuro
}

// Matriz con los patrones fijos dibujados; `funcion` marca los módulos que no son datos.
function base(v, nivel) {
  const n = v * 4 + 17;
  const modulos = Array.from({ length: n }, () => new Array(n).fill(false));
  const funcion = Array.from({ length: n }, () => new Array(n).fill(false));
  const fijar = (f, c, oscuro) => {
    modulos[f][c] = oscuro;
    funcion[f][c] = true;
  };

  // Temporización.
  for (let i = 0; i < n; i++) {
    fijar(6, i, i % 2 === 0);
    fijar(i, 6, i % 2 === 0);
  }
  // Buscadores con su separador claro.
  for (const [cf, cc] of [[3, 3], [3, n - 4], [n - 4, 3]]) {
    for (let df = -4; df <= 4; df++) {
      for (let dc = -4; dc <= 4; dc++) {
        const f = cf + df;
        const c = cc + dc;
        if (f < 0 || c < 0 || f >= n || c >= n) continue;
        const d = Math.max(Math.abs(df), Math.abs(dc));
        fijar(f, c, d !== 2 && d !== 4);
      }
    }
  }
  // Alineación (menos donde caen los buscadores).
  const pos = posAlineacion(v);
  const u = pos.length - 1;
  for (let i = 0; i <= u; i++) {
    for (let j = 0; j <= u; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === u) || (i === u && j === 0)) continue;
      for (let df = -2; df <= 2; df++) {
        for (let dc = -2; dc <= 2; dc++) fijar(pos[i] + df, pos[j] + dc, Math.max(Math.abs(df), Math.abs(dc)) !== 1);
      }
    }
  }
  // Formato (se reescribe con la máscara elegida) y versión.
  dibujarFormato(fijar, n, bitsFormato(nivel, 0));
  if (v >= 7) {
    const bv = bitsVersion(v);
    for (let i = 0; i < 18; i++) {
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      fijar(b, a, bit(bv, i));
      fijar(a, b, bit(bv, i));
    }
  }
  return { n, modulos, funcion, fijar };
}

// Datos en zigzag: columnas de a dos desde abajo a la derecha, subiendo y bajando, salteando la columna 6.
// Los bits de resto quedan claros (después se enmascaran).
function colocar(modulos, funcion, palabras) {
  const n = modulos.length;
  const total = palabras.length * 8;
  let i = 0;
  for (let der = n - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;
    const sube = ((der + 1) & 2) === 0;
    for (let k = 0; k < n; k++) {
      const f = sube ? n - 1 - k : k;
      for (let j = 0; j < 2; j++) {
        const c = der - j;
        if (funcion[f][c] || i >= total) continue;
        modulos[f][c] = bit(palabras[i >>> 3], 7 - (i & 7));
        i++;
      }
    }
  }
}

const MASCARAS = [
  (f, c) => (f + c) % 2 === 0,
  (f) => f % 2 === 0,
  (f, c) => c % 3 === 0,
  (f, c) => (f + c) % 3 === 0,
  (f, c) => (Math.floor(f / 2) + Math.floor(c / 3)) % 2 === 0,
  (f, c) => ((f * c) % 2) + ((f * c) % 3) === 0,
  (f, c) => (((f * c) % 2) + ((f * c) % 3)) % 2 === 0,
  (f, c) => (((f + c) % 2) + ((f * c) % 3)) % 2 === 0,
];

function enmascarar(modulos, funcion, k) {
  const m = MASCARAS[k];
  for (let f = 0; f < modulos.length; f++) {
    for (let c = 0; c < modulos.length; c++) if (!funcion[f][c] && m(f, c)) modulos[f][c] = !modulos[f][c];
  }
}

// Penalización del estándar: corridas de 5 o más, bloques de 2×2, falsos buscadores y desbalance de oscuros.
function penalizacion(m) {
  const n = m.length;
  let p = 0;
  for (let a = 0; a < n; a++) {
    for (const horizontal of [true, false]) {
      const val = horizontal ? (b) => m[a][b] : (b) => m[b][a];
      let corrida = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && val(b) === val(b - 1)) corrida++;
        else {
          if (corrida >= 5) p += corrida - 2;
          corrida = 1;
        }
      }
      // 1011101 con cuatro claros antes o después (afuera del símbolo cuenta como claro).
      const claros = (desde, hasta) => {
        for (let k = Math.max(0, desde); k < Math.min(n, hasta); k++) if (val(k)) return false;
        return true;
      };
      for (let b = 0; b + 7 <= n; b++) {
        if (val(b) && !val(b + 1) && val(b + 2) && val(b + 3) && val(b + 4) && !val(b + 5) && val(b + 6)) {
          if (claros(b - 4, b)) p += 40;
          if (claros(b + 7, b + 11)) p += 40;
        }
      }
    }
  }
  let oscuros = 0;
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (m[f][c]) oscuros++;
      if (f < n - 1 && c < n - 1) {
        const x = m[f][c];
        if (x === m[f][c + 1] && x === m[f + 1][c] && x === m[f + 1][c + 1]) p += 3;
      }
    }
  }
  p += Math.floor(Math.abs((oscuros * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

// ---------- API ----------

export function crearQR(texto, { correccion = 'M' } = {}) {
  const nivel = String(correccion || 'M').toUpperCase();
  if (!NIVELES[nivel]) throw new Error(`Nivel de corrección desconocido: "${correccion}". Usá L, M, Q o H.`);
  const fila = NIVELES[nivel][1];
  const seg = segmento(String(texto ?? ''));
  const version = elegirVersion(seg, fila);
  const palabras = intercalar(palabrasDeDatos(seg, version, fila), version, fila);
  const { n, modulos, funcion, fijar } = base(version, nivel);
  colocar(modulos, funcion, palabras);

  let mascara = 0;
  let menor = Infinity;
  for (let k = 0; k < 8; k++) {
    enmascarar(modulos, funcion, k);
    dibujarFormato(fijar, n, bitsFormato(nivel, k));
    const p = penalizacion(modulos);
    if (p < menor) {
      menor = p;
      mascara = k;
    }
    enmascarar(modulos, funcion, k);
  }
  enmascarar(modulos, funcion, mascara);
  dibujarFormato(fijar, n, bitsFormato(nivel, mascara));
  return { version, tamano: n, modulos, correccion: nivel, mascara };
}

const num = (v) => String(Math.round(v * 1e4) / 1e4);
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Contorno de las manchas oscuras como un solo path (sin costuras entre módulos vecinos al imprimir).
// Cada borde oscuro/claro va orientado en sentido horario alrededor de lo oscuro y se encadenan en lazos cerrados.
function rutaQR(modulos, X, Y) {
  const n = modulos.length;
  const osc = (f, c) => f >= 0 && c >= 0 && f < n && c < n && modulos[f][c];
  const salen = new Map();
  const borde = (x1, y1, x2, y2) => {
    const k = y1 * (n + 1) + x1;
    if (!salen.has(k)) salen.set(k, []);
    salen.get(k).push([x2, y2]);
  };
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (!osc(f, c)) continue;
      if (!osc(f - 1, c)) borde(c, f, c + 1, f);
      if (!osc(f, c + 1)) borde(c + 1, f, c + 1, f + 1);
      if (!osc(f + 1, c)) borde(c + 1, f + 1, c, f + 1);
      if (!osc(f, c - 1)) borde(c, f + 1, c, f);
    }
  }
  const partes = [];
  for (const [k0, lista] of salen) {
    while (lista.length) {
      const x0 = k0 % (n + 1);
      const y0 = Math.floor(k0 / (n + 1));
      const pts = [[x0, y0]];
      let [x, y] = lista.pop();
      while (x !== x0 || y !== y0) {
        pts.push([x, y]);
        [x, y] = salen.get(y * (n + 1) + x).pop();
      }
      // Solo las esquinas.
      const esq = pts.filter((p, i) => {
        const a = pts[(i + pts.length - 1) % pts.length];
        const b = pts[(i + 1) % pts.length];
        return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
      });
      let d = `M${X(esq[0][0])} ${Y(esq[0][1])}`;
      for (let i = 1; i < esq.length; i++) {
        d += esq[i][0] === esq[i - 1][0] ? `V${Y(esq[i][1])}` : `H${X(esq[i][0])}`;
      }
      partes.push(d + 'Z');
    }
  }
  return partes.join('');
}

// El código dentro de un cuadrado de lado `lado` con esquina en (x, y), incluido el margen claro de `margen` módulos.
export function qrSVG(texto, { x = 0, y = 0, lado = 30, color = '#0a0a0a', fondo = '#ffffff', margen = 4, correccion = 'M' } = {}) {
  const qr = crearQR(texto, { correccion });
  const mg = Math.max(0, Number(margen) || 0);
  const s = lado / (qr.tamano + 2 * mg);
  const d = rutaQR(qr.modulos, (c) => num(x + (c + mg) * s), (f) => num(y + (f + mg) * s));
  const caja = fondo && fondo !== 'none'
    ? `<rect x="${num(x)}" y="${num(y)}" width="${num(lado)}" height="${num(lado)}" fill="${attr(fondo)}"/>`
    : '';
  return `<g class="qr" data-version="${qr.version}">${caja}<path d="${d}" fill="${attr(color)}"/></g>`;
}

// SVG suelto. `unidad` opcional para el ancho y alto ('mm', 'px'…); el viewBox queda en las mismas unidades que `lado`.
export function qrSVGCompleto(texto, opciones = {}) {
  const { x = 0, y = 0, lado = 30, unidad = '' } = opciones;
  const g = qrSVG(texto, opciones);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(lado)}${attr(unidad)}" height="${num(lado)}${attr(unidad)}" ` +
    `viewBox="${num(x)} ${num(y)} ${num(lado)} ${num(lado)}"><title>${attr(texto)}</title>${g}</svg>`
  );
}
