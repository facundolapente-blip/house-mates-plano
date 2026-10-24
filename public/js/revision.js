// Revisión del plano: lo que conviene mirar antes de dar el plano por bueno. Cosas que se pisan, salidas tapadas,
// el generador cerca del público, lugares sin matafuego, la ambulancia lejos de un acceso, el camino de emergencia
// angosto y cuánto tarda en entrar la gente. También: separación entre dos objetos y un lugar libre para lo que
// se agrega. Sin Three.js: se prueba con Node.
//
// revisarPlano(escena, { personas }) → [{ nivel: 'atencion' | 'info', texto, ids }]
// ingreso(escena, personas) → { carriles, porMinuto, minutos } o null si no hay control de acceso
// separacion(a, b) → { bordes, centros } en metros (bordes = 0 si se tocan o se pisan)
// lugarLibre(escena, nuevos) → [dx, dy] para correr lo nuevo (posiciones absolutas) hasta donde no pise nada

import { defDatos, troncoDe } from './tipos-datos.js';
import { esquinas, puntosMundo, esPoligono, esLinea, distanciaASegmento, puntoEnPoligono } from './geometria.js';
import { fm } from './formato.js';

const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const nombre = (o) => `«${String(o.nombre || o.tipo).trim()}»`;
const metros = (v) => `${fm(v, v < 10 ? 1 : 0)} m`;

/* ------------------------------------------------------------------ geometría */

// Lo que ocupa en el piso: polígono (zonas libres) o rectángulo girado. De un árbol, solo el tronco.
function huella(o) {
  if (esPoligono(o)) return puntosMundo(o);
  if (o.tipo === 'arbol') {
    const t = troncoDe(o);
    return esquinas({ ...o, dims: [t, t] });
  }
  return esquinas(o);
}

// ¿Ocupa lugar en el piso y no se puede pasar por debajo? (no cuentan zonas, caminos, carteles ni carpas)
function solido(o) {
  const d = defDatos(o);
  if (!o || !Array.isArray(o.pos) || !Array.isArray(o.dims)) return false;
  if (d.piso || d.abierta || esLinea(o) || o.tipo === 'persona' || o.tipo === 'zona') return false;
  return num(o.dims[2]) > 0.05;
}

const base = (o) => num(o.elev);
const tope = (o) => num(o.elev) + num(o.dims?.[2]);

// Separados en altura (por ejemplo, una luz colgada arriba de una barra).
const separadosEnAltura = (a, b) => tope(a) <= base(b) + 0.02 || tope(b) <= base(a) + 0.02;

function proyeccion(poligono, [ex, ey]) {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of poligono) {
    const v = x * ex + y * ey;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

// Dos polígonos convexos se pisan si en ningún eje de sus lados se separan (con un margen para los que solo se tocan).
function sePisan(A, B, margen = 0.03) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i];
      const [x2, y2] = P[(i + 1) % P.length];
      const L = Math.hypot(x2 - x1, y2 - y1);
      if (L < 1e-9) continue;
      const eje = [-(y2 - y1) / L, (x2 - x1) / L];
      const [a0, a1] = proyeccion(A, eje);
      const [b0, b1] = proyeccion(B, eje);
      if (a1 - margen <= b0 || b1 - margen <= a0) return false;
    }
  }
  return true;
}

// Distancia entre dos polígonos (0 si se tocan o se pisan).
function distanciaPoligonos(A, B) {
  if (sePisan(A, B, 0)) return 0;
  let d = Infinity;
  for (const [P, Q] of [
    [A, B],
    [B, A],
  ]) {
    for (const p of P) {
      for (let i = 0; i < Q.length; i++) d = Math.min(d, distanciaASegmento(p, Q[i], Q[(i + 1) % Q.length]));
    }
  }
  return d;
}

// Los dos puntos más cercanos entre dos polígonos que no se tocan (para dejar la cota en el plano).
function puntosMasCercanos(A, B) {
  let mejor = { d: Infinity, a: null, b: null };
  const cercano = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    return [ax + t * dx, ay + t * dy];
  };
  for (const [P, Q, invertir] of [
    [A, B, false],
    [B, A, true],
  ]) {
    for (const p of P) {
      for (let i = 0; i < Q.length; i++) {
        const q = cercano(p, Q[i], Q[(i + 1) % Q.length]);
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < mejor.d) mejor = invertir ? { d, a: q, b: p } : { d, a: p, b: q };
      }
    }
  }
  return mejor;
}

export function separacion(a, b) {
  const A = huella(a);
  const B = huella(b);
  const bordes = distanciaPoligonos(A, B);
  const r = { bordes, centros: Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]), puntos: null };
  if (bordes > 0.01) {
    const m = puntosMasCercanos(A, B);
    r.puntos = [m.a, m.b];
  }
  return r;
}

const cerca = (o, lista, max) => lista.filter((x) => x !== o && distanciaPoligonos(huella(o), huella(x)) <= max);

/* ------------------------------------------------------------------ ingreso */

// Cuánto tarda en entrar la gente: cada carril de control (unos 0,9 m de ancho del control de acceso) pasa
// "personasPorMinutoCarril" personas por minuto (8 por defecto: entrada con QR y revisión).
export function ingreso(escena, personas) {
  const controles = (escena?.objetos || []).filter((o) => o.tipo === 'control_acceso' && Array.isArray(o.dims));
  if (!controles.length || !(personas > 0)) return null;
  const carriles = controles.reduce((s, o) => s + Math.max(1, Math.round(num(o.dims[0]) / 0.9)), 0);
  const ritmo = num(escena?.servicios?.personasPorMinutoCarril) > 0 ? num(escena.servicios.personasPorMinutoCarril) : 8;
  const porMinuto = carriles * ritmo;
  return { carriles, ritmo, porMinuto, minutos: Math.ceil(personas / porMinuto) };
}

/* ------------------------------------------------------------------ revisión */

const NO_PUBLICO = /backstage|staff|descarga|estacionamiento|carga|servicio/i;
const zonaPublica = (o) => o.tipo === 'zona' && !['backstage', 'staff', 'descarga', 'estacionamiento'].includes(o.uso) && !NO_PUBLICO.test(String(o.nombre || ''));

export function revisarPlano(escena, { personas = null } = {}) {
  const objs = (escena?.objetos || []).filter((o) => o && Array.isArray(o.pos) && Array.isArray(o.dims));
  const de = (...tipos) => objs.filter((o) => tipos.includes(o.tipo));
  const avisos = [];
  // arreglo: lo que la app puede resolver con un botón ({ accion: 'matafuego', id }: poner uno al lado).
  const avisar = (nivel, texto, ids, arreglo = null) => avisos.push({ nivel, texto, ids: ids.map(String), arreglo });

  // 1. Cosas que se pisan (lo más común al soltar varias cosas en el centro de la vista).
  const solidos = objs.filter(solido);
  const huellas = new Map(solidos.map((o) => [o, huella(o)]));
  const pisadas = [];
  for (let i = 0; i < solidos.length; i++) {
    for (let j = i + 1; j < solidos.length; j++) {
      const a = solidos[i];
      const b = solidos[j];
      if (separadosEnAltura(a, b)) continue;
      // Lo que va arriba de una tarima, adentro de una estructura (la cabina bajo la casita) o de un truss vertical no se pisa.
      if (['tarima', 'truss', 'casita'].includes(a.tipo) || ['tarima', 'truss', 'casita'].includes(b.tipo)) continue;
      if (a.tipo === 'arbol' && b.tipo === 'arbol') continue;
      if (sePisan(huellas.get(a), huellas.get(b))) pisadas.push([a, b]);
    }
  }
  // Agrupadas por el objeto que más se pisa con otros: "«Entrada» se pisa con «Beam», «Beam 2» y 3 más".
  let pendientes = pisadas.slice();
  let grupos = 0;
  while (pendientes.length && grupos < 6) {
    const cuenta = new Map();
    for (const [a, b] of pendientes) for (const x of [a, b]) cuenta.set(x, (cuenta.get(x) || 0) + 1);
    const centro = [...cuenta].sort((x, y) => y[1] - x[1])[0][0];
    const otros = pendientes.filter((p) => p.includes(centro)).map(([a, b]) => (a === centro ? b : a));
    pendientes = pendientes.filter((p) => !p.includes(centro));
    const lista = otros.length <= 3 ? otros.map(nombre).join(', ').replace(/, ([^,]*)$/, ' y $1') : `${otros.slice(0, 2).map(nombre).join(', ')} y ${otros.length - 2} más`;
    avisar('atencion', `${nombre(centro)} se pisa con ${lista}.`, [centro.id, ...otros.map((o) => o.id)]);
    grupos++;
  }
  if (pendientes.length) avisar('atencion', `Hay ${pendientes.length} ${pendientes.length === 1 ? 'par más' : 'pares más'} de cosas que se pisan.`, pendientes.flat().map((o) => o.id));

  // 2. Salidas tapadas: algo sólido a menos de 1,5 m de una salida.
  for (const s of de('acceso').filter((x) => x.salida !== false)) {
    const tapan = solidos.filter((o) => o !== s && o.tipo !== 'acceso' && o.tipo !== 'control_acceso' && o.tipo !== 'arbol' && distanciaPoligonos(huella(o), huella(s)) < 1.5);
    if (tapan.length) avisar('atencion', `${nombre(s)} es salida y tiene cerca ${tapan.slice(0, 3).map(nombre).join(', ')}${tapan.length > 3 ? ` y ${tapan.length - 3} más` : ''}: dejá 1,5 m libres.`, [s.id, ...tapan.map((o) => o.id)]);
  }

  // 3. Generador: lejos del público (ruido y gases) y con un matafuego al lado.
  const publico = [...objs.filter(zonaPublica), ...de('carpa')];
  const matafuegos = de('matafuego');
  for (const g of de('generador')) {
    let peor = null;
    for (const z of publico) {
      const d = distanciaPoligonos(huella(g), huella(z));
      if (d < 10 && (!peor || d < peor.d)) peor = { z, d };
    }
    if (peor) avisar('atencion', `El generador ${nombre(g)} está a ${metros(peor.d)} de ${nombre(peor.z)}: conviene a más de 10 m del público (ruido y gases).`, [g.id, peor.z.id]);
    if (!cerca(g, matafuegos, 5).length) avisar('atencion', `${nombre(g)} no tiene un matafuego a menos de 5 m.`, [g.id], { accion: 'matafuego', id: String(g.id) });
  }

  // 4. Matafuego cerca de la barra, la cabina, los tableros y la comida.
  for (const o of de('barra', 'cabina_dj', 'tablero', 'foodtruck')) {
    if (!cerca(o, matafuegos, 15).length) avisar('atencion', `${nombre(o)} no tiene un matafuego a menos de 15 m.`, [o.id], { accion: 'matafuego', id: String(o.id) });
  }

  // 5. Ambulancia cerca de un acceso, con camino de emergencia ancho.
  const accesos = de('acceso');
  for (const a of de('ambulancia')) {
    const d = accesos.length ? Math.min(...accesos.map((x) => distanciaPoligonos(huella(a), huella(x)))) : Infinity;
    if (d > 30) avisar('info', `La ambulancia ${nombre(a)} está ${accesos.length ? `a ${metros(d)} del acceso más cercano` : 'sin un acceso marcado'}: conviene al lado de una salida a la calle.`, [a.id]);
  }
  for (const c of objs.filter((o) => o.tipo === 'camino' && o.uso === 'emergencia')) {
    const ancho = num(c.ancho, 3);
    if (ancho < 3.5) avisar('atencion', `El camino de emergencia ${nombre(c)} mide ${metros(ancho)} de ancho: una ambulancia necesita 3,5 m.`, [c.id]);
  }

  // 6. Baños lejos de la pista.
  const banos = de('bano_quimico');
  const pistas = objs.filter((o) => zonaPublica(o) && (o.uso === 'pista' || /pista/i.test(String(o.nombre || ''))));
  if (banos.length) {
    for (const p of pistas) {
      const d = Math.min(...banos.map((b) => distanciaPoligonos(huella(p), huella(b))));
      if (d > 75) avisar('info', `Los baños están a ${metros(d)} de ${nombre(p)}: es mucho para ir y volver.`, [p.id]);
    }
  }

  // 7. Ingreso: si tarda más de una hora, conviene sumar carriles o abrir antes.
  const ing = ingreso(escena, personas);
  if (ing && ing.minutos > 60) {
    avisar('atencion', `Con ${ing.carriles} ${ing.carriles === 1 ? 'carril' : 'carriles'} de control, entrar ${fm(personas, 0)} personas lleva unos ${fm(ing.minutos, 0)} minutos: sumá carriles o abrí las puertas antes.`, de('control_acceso').map((o) => o.id));
  }

  // 8. Lo que quedó afuera del lugar (si hay ambientes o un predio dibujado).
  const contornos = (escena?.areas || []).filter((a) => Array.isArray(a.contorno) && a.contorno.length >= 3).map((a) => a.contorno);
  if (contornos.length) {
    const dentro = ([x, y]) => contornos.some((c) => puntoEnPoligono(x, y, c));
    const AFUERA_OK = new Set(['estacionamiento', 'camino', 'vallado', 'acceso', 'control_acceso', 'auto', 'camion', 'ambulancia', 'arbol', 'hilera', 'persona', 'texto', 'flecha', 'etiqueta', 'medicion', 'marcador', 'senal']);
    const afuera = solidos.filter((o) => !AFUERA_OK.has(o.tipo) && !huella(o).some(dentro) && !dentro(o.pos));
    if (afuera.length) avisar('info', `Quedaron afuera del lugar: ${afuera.slice(0, 4).map(nombre).join(', ')}${afuera.length > 4 ? ` y ${afuera.length - 4} más` : ''}.`, afuera.map((o) => o.id));
  }

  return avisos;
}

/* ------------------------------------------------------------------ lugar libre */

// Corre lo nuevo (con posiciones absolutas) en anillos alrededor del punto hasta que no pise nada sólido.
export function lugarLibre(escena, nuevos) {
  const existentes = (escena?.objetos || []).filter(solido);
  const propios = nuevos.filter(solido);
  if (!existentes.length || !propios.length) return [0, 0];
  const huellasExistentes = existentes.map((o) => ({ o, h: huella(o) }));
  const libre = (dx, dy) =>
    propios.every((n) => {
      const h = huella({ ...n, pos: [n.pos[0] + dx, n.pos[1] + dy] });
      return huellasExistentes.every(({ o, h: e }) => separadosEnAltura(n, o) || !sePisan(h, e, 0.05));
    });
  if (libre(0, 0)) return [0, 0];
  const tam = Math.max(1, ...propios.map((n) => Math.max(num(n.dims[0]), num(n.dims[1]))));
  const paso = Math.min(Math.max(tam / 2, 1), 5);
  for (let anillo = 1; anillo <= 30; anillo++) {
    const r = anillo * paso;
    const n = Math.max(8, Math.round((2 * Math.PI * r) / paso));
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2;
      const dx = Math.round(Math.cos(t) * r * 10) / 10;
      const dy = Math.round(Math.sin(t) * r * 10) / 10;
      if (libre(dx, dy)) return [dx, dy];
    }
  }
  return [0, 0];
}
