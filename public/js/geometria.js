// Geometría en planta (x, y en metros). El giro es en grados, sentido horario visto en planta.

const rad = (g) => ((g || 0) * Math.PI) / 180;

// Esquinas del rectángulo que ocupa el objeto en el piso.
export function esquinas(o) {
  const [w, p] = o.dims;
  const t = rad(o.rot);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [
    [-w / 2, -p / 2],
    [w / 2, -p / 2],
    [w / 2, p / 2],
    [-w / 2, p / 2],
  ].map(([lx, ly]) => [o.pos[0] + lx * c - ly * s, o.pos[1] + lx * s + ly * c]);
}

// Objetos dibujados punto por punto (zonas libres, estacionamientos, caminos, vallados): "puntos" está en
// coordenadas del objeto (relativas a pos y giradas con rot). Acá se pasan a la planta.
export function puntosMundo(o) {
  if (!Array.isArray(o.puntos)) return null;
  const t = rad(o.rot);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return o.puntos.map(([lx, ly]) => [o.pos[0] + lx * c - ly * s, o.pos[1] + lx * s + ly * c]);
}

// Lo inverso: de la planta a coordenadas del objeto.
export function aLocal(o, [x, y]) {
  const t = rad(o.rot);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dx = x - o.pos[0];
  const dy = y - o.pos[1];
  return [dx * c + dy * s, -dx * s + dy * c];
}

export const esPoligono = (o) => Array.isArray(o.puntos) && o.puntos.length >= 3 && o.tipo !== 'camino' && o.tipo !== 'vallado';
export const esLinea = (o) => Array.isArray(o.puntos) && o.puntos.length >= 2 && (o.tipo === 'camino' || o.tipo === 'vallado');

export function longitud(pts, cerrada = false) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (cerrada && pts.length > 2) L += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]);
  return L;
}

// Deja los puntos centrados en el objeto (pos = centro de su rectángulo) y las medidas iguales a ese
// rectángulo, para que seleccionar, mover, girar y duplicar funcionen igual que con cualquier objeto.
export function recentrar(o) {
  if (!Array.isArray(o.puntos) || !o.puntos.length) return o;
  const b = cajaDe(o.puntos);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const r = (v) => Math.round(v * 1000) / 1000;
  if (Math.abs(cx) > 1e-6 || Math.abs(cy) > 1e-6) {
    const t = rad(o.rot);
    o.pos = [r(o.pos[0] + cx * Math.cos(t) - cy * Math.sin(t)), r(o.pos[1] + cx * Math.sin(t) + cy * Math.cos(t))];
    o.puntos = o.puntos.map(([x, y]) => [r(x - cx), r(y - cy)]);
  }
  const alto = o.dims?.[2] ?? 0;
  o.dims = [r(Math.max(b.maxX - b.minX, 0.05)), r(Math.max(b.maxY - b.minY, 0.05)), alto];
  return o;
}

// Superficie en m² que ocupa el objeto en la planta (la forma libre si la tiene).
export const superficieDe = (o) => (esPoligono(o) ? Math.abs(areaFirmada(o.puntos)) : o.dims[0] * o.dims[1]);

// ¿El punto (x, y) de la planta está dentro del objeto? Usa la forma libre si la tiene.
export function dentroDe(o, x, y) {
  if (esPoligono(o)) {
    const [lx, ly] = aLocal(o, [x, y]);
    return puntoEnPoligono(lx, ly, o.puntos);
  }
  return enRect(o, x, y);
}

// Distancia de un punto a un segmento.
export function distanciaASegmento([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function enRect(o, x, y) {
  const t = rad(o.rot);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dx = x - o.pos[0];
  const dy = y - o.pos[1];
  return Math.abs(dx * c + dy * s) <= o.dims[0] / 2 && Math.abs(-dx * s + dy * c) <= o.dims[1] / 2;
}

export function cajaDe(puntos) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of puntos) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

export function areaFirmada(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function puntoEnPoligono(x, y, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Distancia t a lo largo del rayo O + tD hasta el segmento AB, o null si no lo cruza.
function rayoSegmento(O, D, A, B) {
  const sx = B[0] - A[0];
  const sy = B[1] - A[1];
  const den = D[0] * sy - D[1] * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = A[0] - O[0];
  const qy = A[1] - O[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * D[1] - qy * D[0]) / den;
  return u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

// Desde el centro de cada lado del objeto, la distancia libre hasta la pared u objeto más cercano.
export function distanciasLados(o, segmentos, max = 40) {
  const [w, p] = o.dims;
  const t = rad(o.rot);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const lados = [
    { m: [w / 2, 0], n: [c, s] },
    { m: [-w / 2, 0], n: [-c, -s] },
    { m: [0, p / 2], n: [-s, c] },
    { m: [0, -p / 2], n: [s, -c] },
  ];
  const res = [];
  for (const { m, n } of lados) {
    const M = [o.pos[0] + m[0] * c - m[1] * s, o.pos[1] + m[0] * s + m[1] * c];
    let mejor = Infinity;
    for (const [A, B] of segmentos) {
      const d = rayoSegmento(M, n, A, B);
      if (d !== null && d > -1e-3 && d < mejor) mejor = d;
    }
    if (mejor < max) res.push({ desde: M, hasta: [M[0] + n[0] * mejor, M[1] + n[1] * mejor], dist: Math.max(mejor, 0), dir: n });
  }
  return res;
}

// Superficie (m²) dentro de una forma y cuánta queda libre de obstáculos, en una grilla de 10 cm.
// En lugares muy grandes la grilla se agranda para no pasar de unos 250.000 puntos (un campo de
// 100 × 100 m se mide cada 20 cm) y no trabar la interfaz en cada cambio.
export function superficieLibre(dentro, caja, obstaculos, paso = 0.1) {
  const sup = Math.max(0, caja.maxX - caja.minX) * Math.max(0, caja.maxY - caja.minY);
  if (!Number.isFinite(sup) || sup <= 0) return { total: 0, libre: 0 };
  paso = Math.max(paso, Math.sqrt(sup / 250000));
  const obs = obstaculos.map((o) => ({ o, c: cajaDe(esquinas(o)) }));
  let total = 0;
  let libre = 0;
  for (let x = caja.minX + paso / 2; x < caja.maxX; x += paso) {
    const columna = obs.filter(({ c }) => x >= c.minX && x <= c.maxX);
    for (let y = caja.minY + paso / 2; y < caja.maxY; y += paso) {
      if (!dentro(x, y)) continue;
      total++;
      let ocupado = false;
      for (const { o, c } of columna) {
        if (y >= c.minY && y <= c.maxY && enRect(o, x, y)) {
          ocupado = true;
          break;
        }
      }
      if (!ocupado) libre++;
    }
  }
  return { total: total * paso * paso, libre: libre * paso * paso };
}
