// Plano técnico en SVG (milímetros de papel), listo para imprimir o pasar a PDF.
// Hoja 1: planta a escala con cuadro de datos y leyenda. Hojas siguientes: listado de materiales.

import { defDatos as defDe, troncoDe } from './tipos-datos.js';
import { esquinas, cajaDe, areaFirmada, puntosMundo, esPoligono, superficieDe } from './geometria.js';
import { plazasEstacionamiento, lineaLocal, USOS_CAMINO, largoDe, textoTiempo, moduloVallado } from './predio.js';
import { rutaIcono } from './iconos.js';
import { ROLES_STAFF } from './tipos-datos.js';
import { fm, esc } from './formato.js';
import { nombreCategoria } from './computo.js';

export const PAPELES = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };
export const ESCALAS = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];

export const FUENTE = 'Helvetica, Arial, sans-serif';
export const TINTA = '#1a1a1a';
export const GRIS = '#6b6b6b';
export const ACENTO = '#2447F5';

export function opcionesHoja(escena) {
  const h = escena.hoja || {};
  return {
    papel: PAPELES[h.papel] ? h.papel : 'A3',
    orientacion: h.orientacion === 'vertical' ? 'vertical' : 'horizontal',
    // Escala fija: un denominador positivo (1:200 → 200). Cualquier otra cosa es automática.
    escala: Number(h.escala) >= 1 ? Number(h.escala) : 'auto',
    grilla: h.grilla ?? true,
    cotas: h.cotas ?? true,
    numeros: h.numeros ?? true,
    nombres: h.nombres ?? false,
    arboles: h.arboles ?? true,
    personas: h.personas ?? false,
    materiales: h.materiales ?? true,
    // Imagen aérea de fondo (si la escena tiene) y flecha del norte (si está ubicada en el mapa).
    fondo: h.fondo ?? true,
    norte: h.norte ?? true,
  };
}

export function tamanoPapel(op) {
  const [a, b] = PAPELES[op.papel];
  return op.orientacion === 'vertical' ? [b, a] : [a, b];
}

export const n2 = (v) => Math.round(v * 100) / 100;
export const pts = (lista) => lista.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ');
export const anchoTexto = (s, t) => String(s).length * t * 0.52;

export function recortar(s, t, ancho) {
  s = String(s ?? '');
  if (anchoTexto(s, t) <= ancho) return s;
  const max = Math.max(1, Math.floor(ancho / (t * 0.52)) - 1);
  return s.slice(0, max).trimEnd() + '…';
}

export function envolver(s, t, ancho, maxLineas = 99) {
  const palabras = String(s ?? '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (anchoTexto(prueba, t) > ancho && actual) {
      lineas.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maxLineas) {
    const corte = lineas.slice(0, maxLineas);
    corte[maxLineas - 1] = recortar(corte[maxLineas - 1] + ' …', t, ancho);
    return corte;
  }
  return lineas;
}

export function texto(x, y, s, { t = 2.2, peso = 400, color = TINTA, ancla = 'start', rot = 0, base = 'auto' } = {}) {
  const r = rot ? ` transform="rotate(${n2(rot)} ${n2(x)} ${n2(y)})"` : '';
  const b = base !== 'auto' ? ` dominant-baseline="${base}"` : '';
  return `<text x="${n2(x)}" y="${n2(y)}" font-family="${FUENTE}" font-size="${t}" font-weight="${peso}" fill="${color}" text-anchor="${ancla}"${b}${r}>${esc(s)}</text>`;
}

export const linea = (a, b, { w = 0.18, color = TINTA, dash = '' } = {}) =>
  `<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(b[0])}" y2="${n2(b[1])}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

// Línea de cota con líneas de referencia, marcas a 45° y el texto del lado de afuera.
export function cota(P1, P2, normal, separacion, rotulo, { color = TINTA, t = 2 } = {}) {
  const dx = P2[0] - P1[0];
  const dy = P2[1] - P1[1];
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return '';
  const u = [dx / L, dy / L];
  const nl = Math.hypot(normal[0], normal[1]) || 1;
  const n = [normal[0] / nl, normal[1] / nl];
  const Q1 = [P1[0] + n[0] * separacion, P1[1] + n[1] * separacion];
  const Q2 = [P2[0] + n[0] * separacion, P2[1] + n[1] * separacion];
  const ext = (P, Q) => linea([P[0] + n[0] * 0.8 * Math.sign(separacion || 1), P[1] + n[1] * 0.8 * Math.sign(separacion || 1)], [Q[0] + n[0] * 1.2 * Math.sign(separacion || 1), Q[1] + n[1] * 1.2 * Math.sign(separacion || 1)], { w: 0.1, color });
  const tick = (Q) => linea([Q[0] - (u[0] + n[0]) * 0.9, Q[1] - (u[1] + n[1]) * 0.9], [Q[0] + (u[0] + n[0]) * 0.9, Q[1] + (u[1] + n[1]) * 0.9], { w: 0.25, color });
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang > 90.5 || ang < -89.5) ang += 180;
  const lado = Math.sign(separacion || 1);
  const M = [(Q1[0] + Q2[0]) / 2 + n[0] * 1.6 * lado, (Q1[1] + Q2[1]) / 2 + n[1] * 1.6 * lado];
  return [
    Math.abs(separacion) > 0.01 ? ext(P1, Q1) + ext(P2, Q2) : '',
    linea(Q1, Q2, { w: 0.13, color }),
    tick(Q1),
    tick(Q2),
    texto(M[0], M[1], rotulo, { t, color, ancla: 'middle', rot: ang, base: 'middle' }),
  ].join('');
}

/* ------------------------------------------------------------------ paredes en 2D */

function altoDePared(P, i) {
  if (!P || P.sin?.includes(i)) return 0;
  if (Array.isArray(P.alto)) return Number(P.alto[i]) || 0;
  return Number(P.alto) || 0;
}

export function geometriaArea(area) {
  const pts0 = area.contorno;
  const n = pts0.length;
  const P = area.paredes;
  const espesor = Number(P?.espesor ?? 0.2) || 0.2;
  const signo = Math.sign(areaFirmada(pts0)) || 1;
  const lados = pts0.map((a, i) => {
    const b = pts0[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = L ? (b[0] - a[0]) / L : 0;
    const uy = L ? (b[1] - a[1]) / L : 0;
    return { i, a, b, L, ux, uy, nx: signo * uy, ny: -signo * ux, alto: altoDePared(P, i) };
  });
  const giro = (A, B) => (A.ux * B.uy - A.uy * B.ux) * signo;
  const sinParedes = lados.every((l) => l.alto <= 0);
  const muros = [];
  const ventanas = [];
  const puertas = [];
  const rotulos = [];
  const cotas = [];
  const en = (l, s, afuera) => [l.a[0] + l.ux * s + l.nx * afuera, l.a[1] + l.uy * s + l.ny * afuera];
  for (const l of lados) {
    if (l.L < 1e-6) continue;
    if (l.alto > 0 || sinParedes) cotas.push({ a: l.a, b: l.b, normal: [l.nx, l.ny], afuera: l.alto > 0 ? espesor : 0, L: l.L });
    if (l.alto <= 0) continue;
    const sig = lados[(l.i + 1) % n];
    let extFin = 0;
    if (sig.alto > 0) {
      const g = giro(l, sig);
      if (g > 1e-9) extFin = espesor;
      else if (g < -1e-9) extFin = -espesor;
    }
    const aberturas = (area.aberturas || [])
      .filter((ab) => ab.pared === l.i)
      .map((ab) => {
        const ventana = ab.tipo === 'ventana';
        const ini = Math.min(l.L, Math.max(0, Number(ab.desde) || 0));
        return { ...ab, ventana, ini, fin: Math.min(l.L, ini + (Number(ab.ancho) || 0.9)), base: Number(ab.antepecho ?? (ventana ? 1 : 0)) };
      })
      .sort((p, q) => p.ini - q.ini);
    // Las puertas y portones cortan el muro; las ventanas se dibujan encima.
    const tramo = (s0, s1) => [en(l, s0, 0), en(l, s1, 0), en(l, s1, espesor), en(l, s0, espesor)];
    let cursor = 0;
    for (const ab of aberturas) {
      if (ab.base > 0) continue;
      if (ab.ini > cursor) muros.push(tramo(cursor, ab.ini));
      cursor = Math.max(cursor, ab.fin);
    }
    if (l.L + extFin > cursor) muros.push(tramo(cursor, l.L + extFin));
    for (const ab of aberturas) {
      if (ab.ventana) {
        ventanas.push({ p: tramo(ab.ini, ab.fin), medio: [en(l, ab.ini, espesor / 2), en(l, ab.fin, espesor / 2)] });
      } else if (ab.tipo === 'puerta') {
        puertas.push({ bisagra: en(l, ab.ini, 0), cierre: en(l, ab.fin, 0), u: [l.ux, l.uy], n: [l.nx, l.ny], ancho: ab.fin - ab.ini });
      } else if (ab.tipo === 'porton') {
        puertas.push({ porton: true, a: en(l, ab.ini, espesor / 2), b: en(l, ab.fin, espesor / 2) });
      }
      if (ab.nombre || ab.salida) rotulos.push({ texto: ab.nombre || 'Salida', salida: Boolean(ab.salida), pos: en(l, (ab.ini + ab.fin) / 2, -0.9) });
    }
  }
  return { muros, ventanas, puertas, rotulos, cotas, sinParedes };
}

/* ------------------------------------------------------------------ símbolos */

export function simbolo(o, M, k, op) {
  const def = defDe(o);
  const esq = esquinas(o).map(M);
  const t = ((o.rot || 0) * Math.PI) / 180;
  const ex = [Math.cos(t), Math.sin(t)];
  const ey = [-Math.sin(t), Math.cos(t)];
  const L = (lx, ly) => M([o.pos[0] + lx * ex[0] + ly * ey[0], o.pos[1] + lx * ex[1] + ly * ey[1]]);
  const [w, p] = o.dims;
  const c = M(o.pos);
  const elevado = (o.elev || 0) >= 1.8;
  const dash = elevado ? ' stroke-dasharray="1.2 0.7"' : '';
  const poli = (lista, fill, stroke = TINTA, sw = 0.25, extra = '') =>
    `<polygon points="${pts(lista)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}${extra}/>`;
  const circ = (centro, r, fill, stroke = TINTA, sw = 0.25, extra = '') =>
    `<circle cx="${n2(centro[0])}" cy="${n2(centro[1])}" r="${n2(Math.max(r, 0.3))}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra}/>`;
  const frente = () => {
    const s = Math.min(w, p, 0.6) * 0.35;
    return `<polygon points="${pts([L(-s, p / 2 - s * 0.9), L(s, p / 2 - s * 0.9), L(0, p / 2 - 0.02)])}" fill="#fff"/>`;
  };
  const contorno = esPoligono(o) ? puntosMundo(o).map(M) : esq;
  const conIcono = (fill = '#fff', color = TINTA) => {
    const lado = Math.min(w, p) * k;
    return poli(esq, fill, color, 0.22) + (lado >= 2.2 ? iconoEnPapel(o.tipo, c, Math.min(lado * 0.78, 9), color, 1.7) : '');
  };
  switch (o.tipo) {
    case 'zona': {
      const color = o.color || def.color;
      return `<polygon points="${pts(contorno)}" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="0.35" stroke-dasharray="2 1"/>`;
    }
    case 'estacionamiento': {
      const { plazas, accesibles } = plazasEstacionamiento(o);
      const aMundo = (q) => q.map(([lx, ly]) => L(lx, ly));
      let s = `<polygon points="${pts(contorno)}" fill="#e7e8ea" stroke="#5a5f68" stroke-width="0.3"/>`;
      if (k >= 1.2) {
        s += plazas.map((q, i) => `<polygon points="${pts(aMundo(q))}" fill="${i < accesibles ? '#cfe0f5' : 'none'}" stroke="#7d828a" stroke-width="0.1"/>`).join('');
      }
      return s;
    }
    case 'camino': {
      const color = o.color || USOS_CAMINO[o.uso]?.color || ACENTO;
      const linea = puntosMundo({ ...o, puntos: lineaLocal(o) }).map(M);
      const ancho = Math.max((Number(o.ancho) || 3) * k, 0.6);
      return (
        `<polyline points="${pts(linea)}" fill="none" stroke="${color}" stroke-opacity="0.16" stroke-width="${n2(ancho)}" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<polyline points="${pts(linea)}" fill="none" stroke="${color}" stroke-width="0.3" stroke-dasharray="2 1.2" stroke-linejoin="round"/>`
      );
    }
    case 'vallado': {
      const linea = puntosMundo({ ...o, puntos: lineaLocal(o) }).map(M);
      let s = `<polyline points="${pts(linea)}" fill="none" stroke="#4a4f57" stroke-width="0.4" stroke-linejoin="round"/>`;
      const paso = moduloVallado(o) * k;
      if (paso >= 1.2) {
        for (let i = 1; i < linea.length; i++) {
          const [ax, ay] = linea[i - 1];
          const [bx, by] = linea[i];
          const d = Math.hypot(bx - ax, by - ay);
          const n = Math.max(1, Math.round(d / paso));
          for (let j = 0; j <= n; j++) s += `<circle cx="${n2(ax + ((bx - ax) * j) / n)}" cy="${n2(ay + ((by - ay) * j) / n)}" r="0.35" fill="#4a4f57"/>`;
        }
      }
      return s;
    }
    case 'acceso': {
      const color = o.salida === false ? TINTA : '#1d8a55';
      return poli(esq, o.salida === false ? '#fff' : '#e3f3ea', color, 0.35) + (w * k > 8 ? texto(c[0], c[1], o.salida === false ? 'ACCESO' : 'SALIDA', { t: Math.min(2.2, p * k * 0.8 + 1.2), peso: 700, color, ancla: 'middle', base: 'middle' }) : '');
    }
    case 'carpa':
      return poli(esq, '#fafafa', TINTA, 0.25, ' stroke-dasharray="1.5 0.8"') + linea(esq[0], esq[2], { w: 0.12 }) + linea(esq[1], esq[3], { w: 0.12 });
    case 'auto':
    case 'camion':
    case 'ambulancia':
    case 'foodtruck':
      return conIcono(o.tipo === 'ambulancia' ? '#fbecec' : '#f2f2f2') + frente();
    case 'generador':
    case 'tablero':
      return conIcono('#fff4dc', '#7a5200');
    case 'agua':
    case 'guardarropa':
    case 'primeros_auxilios':
    case 'punto_encuentro':
    case 'carga_celulares':
    case 'boleteria':
    case 'info':
    case 'tacho':
    case 'control_acceso':
      return conIcono('#fff', o.tipo === 'primeros_auxilios' ? '#c62828' : o.tipo === 'punto_encuentro' ? '#1d8a55' : TINTA);
    case 'puesto': {
      const color = o.color || ROLES_STAFF[o.rol]?.color || def.color;
      return circ(c, Math.max((Math.min(w, p) / 2) * k, 1.2), '#fff', color, 0.3) + texto(c[0], c[1] + 0.1, String(o.personas || 1), { t: 1.8, peso: 700, color, ancla: 'middle', base: 'middle' });
    }
    case 'senal':
      return poli(esq, '#111') + linea(L(-w / 2, p / 2 + 0.3), L(w / 2, p / 2 + 0.3), { w: 0.15, color: GRIS });
    case 'texto': {
      const t = Math.max((Number(o.tamano) || 0.6) * k, 1.4);
      return texto(c[0], c[1], o.texto || o.nombre, { t, peso: 600, color: o.color || TINTA, ancla: 'middle', base: 'middle', rot: o.rot || 0 });
    }
    case 'flecha': {
      const cabeza = Math.min(p * 0.4, w * 1.4);
      const cuerpo = w * 0.42;
      const forma = [L(-cuerpo / 2, p / 2), L(cuerpo / 2, p / 2), L(cuerpo / 2, -(p / 2 - cabeza)), L(w / 2, -(p / 2 - cabeza)), L(0, -p / 2), L(-w / 2, -(p / 2 - cabeza)), L(-cuerpo / 2, -(p / 2 - cabeza))];
      return `<polygon points="${pts(forma)}" fill="${o.color || def.color}" stroke="none"/>`;
    }
    case 'marcador':
    case 'medicion':
      return circ(c, 1.1, o.tipo === 'medicion' ? '#fff4dc' : '#e8edff', o.color || def.color, 0.35) + circ(c, 0.35, o.color || def.color, 'none', 0);
    case 'tarima':
      return poli(esq, 'url(#rayado)', TINTA, 0.35);
    case 'casita': {
      const poste = Math.min(0.18, w * 0.05);
      const postes = [
        [-w / 2 + poste / 2, -p / 2 + poste / 2],
        [w / 2 - poste / 2, -p / 2 + poste / 2],
        [w / 2 - poste / 2, p / 2 - poste / 2],
        [-w / 2 + poste / 2, p / 2 - poste / 2],
      ]
        .map(([x, y]) => `<polygon points="${pts([L(x - poste / 2, y - poste / 2), L(x + poste / 2, y - poste / 2), L(x + poste / 2, y + poste / 2), L(x - poste / 2, y + poste / 2)])}" fill="${TINTA}"/>`)
        .join('');
      return (
        `<polygon points="${pts(esq)}" fill="none" stroke="${TINTA}" stroke-width="0.3"/>` +
        linea(L(0, -p / 2), L(0, p / 2), { w: 0.18, dash: '1.5 0.8' }) +
        postes
      );
    }
    case 'cabina_dj': {
      let s = poli(esq, '#e8e8e8');
      if (w * k > 12) {
        const a = Math.min(0.32, w / 5);
        for (const x of [-a * 1.15, 0, a * 1.15]) s += poli([L(x - a / 2, -0.2), L(x + a / 2, -0.2), L(x + a / 2, 0.2), L(x - a / 2, 0.2)], '#9a9a9a', '#555', 0.12);
      }
      return s + frente();
    }
    case 'parlante':
    case 'sub':
    case 'pantalla':
      return poli(esq, '#3a3a3a') + (o.tipo === 'pantalla' ? '' : frente());
    case 'truss': {
      let s = poli(esq, '#fff', TINTA, 0.25);
      const largo = Math.max(w, p);
      const ancho = Math.min(w, p);
      const enX = w >= p;
      const n = Math.max(1, Math.round(largo / 0.5));
      const pa = [];
      for (let i = 0; i <= n; i++) {
        const a = -largo / 2 + (largo * i) / n;
        const b = (i % 2 ? 1 : -1) * (ancho / 2);
        pa.push(enX ? L(a, b) : L(b, a));
      }
      s += `<polyline points="${pts(pa)}" fill="none" stroke="${TINTA}" stroke-width="0.12"${dash}/>`;
      return s;
    }
    case 'luz':
    case 'par': {
      const r = (Math.max(w, p) / 2) * k;
      return circ(c, r, '#fff', TINTA, 0.22, dash) + linea(c, L(0, Math.max(w, p) * 0.9), { w: 0.2 });
    }
    case 'poste_v':
    case 'farol': {
      const r = Math.max(0.9, (Math.max(w, p) / 2) * k);
      const d = r * 0.7;
      return circ(c, r, '#fff', TINTA, 0.2) + linea([c[0] - d, c[1] - d], [c[0] + d, c[1] + d], { w: 0.15 }) + linea([c[0] - d, c[1] + d], [c[0] + d, c[1] - d], { w: 0.15 });
    }
    case 'barra':
      return poli(esq, '#dcdcdc') + linea(L(-w / 2, p / 2 - 0.05), L(w / 2, p / 2 - 0.05), { w: 0.45 });
    case 'heladera':
      return poli(esq, '#fff') + linea(esq[0], esq[2], { w: 0.12 }) + linea(esq[1], esq[3], { w: 0.12 });
    case 'mesa_alta':
    case 'banqueta':
    case 'cilindro':
    case 'planta':
      return `<ellipse cx="${n2(c[0])}" cy="${n2(c[1])}" rx="${n2(Math.max((w / 2) * k, 0.3))}" ry="${n2(Math.max((p / 2) * k, 0.3))}" transform="rotate(${n2(o.rot || 0)} ${n2(c[0])} ${n2(c[1])})" fill="${o.tipo === 'planta' ? '#e3ecdc' : '#fff'}" stroke="${TINTA}" stroke-width="0.22"${dash}/>`;
    case 'silla':
      return poli(esq, '#fff', TINTA, 0.18) + linea(L(-w / 2, -p / 2 + 0.06), L(w / 2, -p / 2 + 0.06), { w: 0.35 });
    case 'sillon':
      return poli(esq, '#f0f0f0') + poli([L(-w / 2, -p / 2), L(w / 2, -p / 2), L(w / 2, -p / 2 + p * 0.24), L(-w / 2, -p / 2 + p * 0.24)], '#cfcfcf', TINTA, 0.15);
    case 'bano_quimico':
      return poli(esq, '#fff') + texto(c[0], c[1], 'WC', { t: Math.min(2.4, w * k * 0.4), peso: 700, ancla: 'middle', base: 'middle' });
    case 'matafuego':
      return circ(c, Math.max(0.7, (w / 2) * k), '#d22', '#900', 0.15);
    case 'tela':
      return poli(esq, '#9a9a9a', TINTA, 0.15);
    case 'columna':
      return o.forma === 'redonda' ? circ(c, (w / 2) * k, TINTA) : poli(esq, TINTA);
    case 'escalera': {
      let s = poli(esq, '#fff');
      const n = Math.max(2, Math.round(o.dims[2] / 0.175));
      for (let i = 1; i < n; i++) {
        const y = p / 2 - (p * i) / n;
        s += linea(L(-w / 2, y), L(w / 2, y), { w: 0.1 });
      }
      return s + linea(L(0, p / 2 - 0.1), L(0, -p / 2 + 0.2), { w: 0.15 });
    }
    case 'hilera':
      return poli(esq, '#d6e2cc', '#5d7a4a', 0.2);
    case 'arbol': {
      if (!op.arboles) return '';
      const tr = (troncoDe(o) / 2) * k;
      return (
        `<ellipse cx="${n2(c[0])}" cy="${n2(c[1])}" rx="${n2((w / 2) * k)}" ry="${n2((p / 2) * k)}" fill="#6b8f5a" fill-opacity="0.08" stroke="#6b8f5a" stroke-width="0.18" stroke-dasharray="1 0.6"/>` +
        circ(c, Math.max(tr, 0.35), '#6b5340', '#4a3a2c', 0.1)
      );
    }
    case 'persona':
      return op.personas ? circ(c, (0.25 * k), '#fff', GRIS, 0.15) : '';
    case 'etiqueta':
      return '';
    default:
      return poli(esq, '#fff');
  }
}

/* ------------------------------------------------------------------ hoja de planta */

// Dónde va y qué dice el rótulo de una superficie: m² de una zona, cocheras de un estacionamiento,
// largo y tiempo caminando de un camino.
export function rotuloSuperficie(o) {
  if (o.tipo === 'camino') {
    const mundo = puntosMundo({ ...o, puntos: lineaLocal(o) });
    const L = largoDe(o);
    let resto = L / 2;
    let pos = mundo[0];
    for (let i = 1; i < mundo.length; i++) {
      const a = mundo[i - 1];
      const b = mundo[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (resto <= d) {
        pos = [a[0] + ((b[0] - a[0]) * resto) / Math.max(d, 1e-9), a[1] + ((b[1] - a[1]) * resto) / Math.max(d, 1e-9)];
        break;
      }
      resto -= d;
    }
    return { pos, color: o.color || USOS_CAMINO[o.uso]?.color || ACENTO, detalle: `${fm(L, 0)} m · ${textoTiempo(L)}` };
  }
  if (o.tipo === 'estacionamiento') {
    const { cantidad } = plazasEstacionamiento(o);
    return { pos: o.pos, color: '#3a3d44', detalle: `${cantidad} cocheras · ${fm(superficieDe(o), 0)} m²` };
  }
  return { pos: o.pos, color: o.color || '#4b3fd1', detalle: `${fm(superficieDe(o), 1)} m²` };
}

// Imagen aérea de fondo en la hoja. op.fondoHref es la dirección de la imagen (o un data: para el PDF).
export function imagenFondo(escena, op, M, k) {
  const f = escena.fondo;
  if (op.fondo === false || !f?.archivo || f.oculto || f.enPlano === false || !op.fondoHref) return '';
  const w = (Number(f.ancho) || 100) * k;
  const h = (Number(f.ancho) || 100) * (Number(f.proporcion) || 0.75) * k;
  const c = M(f.pos || [0, 0]);
  return `<image href="${op.fondoHref}" xlink:href="${op.fondoHref}" x="${n2(-w / 2)}" y="${n2(-h / 2)}" width="${n2(w)}" height="${n2(h)}" preserveAspectRatio="none" opacity="${n2(f.opacidadPlano ?? 0.55)}" transform="translate(${n2(c[0])} ${n2(c[1])}) rotate(${n2(f.rot || 0)})"/>`;
}

// Ícono de línea (grilla de 24) dibujado en el papel, centrado en c y de lado "tam" en milímetros.
export function iconoEnPapel(nombre, c, tam, color = TINTA, grosor = 1.6) {
  const d = rutaIcono(nombre);
  if (!d) return '';
  const e = tam / 24;
  return `<path d="${d}" transform="translate(${n2(c[0] - tam / 2)} ${n2(c[1] - tam / 2)}) scale(${n2(e * 1000) / 1000})" fill="none" stroke="${color}" stroke-width="${n2(grosor)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function limitesDibujo(escena) {
  const puntos = [];
  for (const a of escena.areas) if (a.contorno?.length) puntos.push(...a.contorno);
  for (const o of escena.objetos) if (o.tipo !== 'persona') puntos.push(...esquinas(o));
  for (const c of escena.cotas || []) puntos.push(c.a, c.b);
  if (!puntos.length) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return cajaDe(puntos);
}

export function escalaAuto(escena, op) {
  const [W, H] = tamanoPapel(op);
  const { dib } = marco(W, H);
  const b = limitesDibujo(escena);
  const ancho = b.maxX - b.minX + 5;
  const alto = b.maxY - b.minY + 5;
  for (const n of ESCALAS) if ((ancho * 1000) / n <= dib.w && (alto * 1000) / n <= dib.h) return n;
  return ESCALAS[ESCALAS.length - 1];
}

export function marco(W, H) {
  const m = 10;
  if (H > W) {
    // Hoja vertical: referencias y cuadro de datos en una franja abajo, así el dibujo usa todo el ancho.
    const bandaH = Math.round(H * 0.3);
    return { m, banda: true, dib: { x: m + 3, y: m + 3, w: W - 2 * m - 6, h: H - 2 * m - bandaH - 9 }, col: { x: m, y: H - m - bandaH, w: W - 2 * m, h: bandaH } };
  }
  const colW = W >= 400 ? 100 : 78;
  return { m, banda: false, dib: { x: m + 3, y: m + 3, w: W - 2 * m - colW - 9, h: H - 2 * m - 6 }, col: { x: W - m - colW, y: m, w: colW, h: H - 2 * m } };
}

export function definiciones() {
  return `<defs>
    <pattern id="rayado" patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)">
      <rect width="1.6" height="1.6" fill="#fff"/>
      <line x1="0" y1="0" x2="0" y2="1.6" stroke="#8a8a8a" stroke-width="0.18"/>
    </pattern>
  </defs>`;
}

// Barra de escala lo más larga posible sin pasar de maxAncho (mm), para que no pise el texto de al lado.
export function barraEscala(x, y, k, maxAncho = 50) {
  const largos = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  const L = [...largos].reverse().find((l) => l * k <= maxAncho) || 1;
  const seg = (L * k) / 4;
  let s = '';
  for (let i = 0; i < 4; i++) s += `<rect x="${n2(x + i * seg)}" y="${n2(y)}" width="${n2(seg)}" height="1.6" fill="${i % 2 ? '#fff' : TINTA}" stroke="${TINTA}" stroke-width="0.15"/>`;
  s += texto(x, y + 4.6, '0', { t: 1.9, ancla: 'middle' });
  s += texto(x + seg * 2, y + 4.6, fm(L / 2, L % 2 ? 1 : 0), { t: 1.9, ancla: 'middle' });
  s += texto(x + seg * 4, y + 4.6, `${L} m`, { t: 1.9, ancla: 'middle' });
  return s;
}

export function cuadroDatos(escena, op, x, y, w, escalaN, hoja, totalHojas, titulo = 'Plano de armado') {
  const pr = escena.proyecto || {};
  const filas = [
    ['Evento', pr.evento || escena.nombre],
    ['Lugar', pr.lugar || ''],
    ['Responsable', pr.responsable || ''],
  ];
  const alto = 40;
  let s = `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${alto}" fill="#fff" stroke="${TINTA}" stroke-width="0.35"/>`;
  s += texto(x + 3, y + 6.5, 'HOUSE MATES', { t: 4, peso: 700 });
  s += texto(x + w - 3, y + 6.5, recortar(titulo, 2.4, w - 40), { t: 2.4, color: GRIS, ancla: 'end' });
  s += linea([x, y + 9.5], [x + w, y + 9.5], { w: 0.2 });
  filas.forEach(([k, v], i) => {
    const yy = y + 14 + i * 4.4;
    s += texto(x + 3, yy, k, { t: 1.9, color: GRIS });
    s += texto(x + 24, yy, recortar(v, 2.2, w - 27), { t: 2.2, peso: 600 });
  });
  const yb = y + 28.5;
  s += linea([x, yb], [x + w, yb], { w: 0.2 });
  // Revisión: la última de escena.revisiones (A, B, C…), para saber si el plano impreso es el último.
  const rev = Array.isArray(escena.revisiones) && escena.revisiones.length ? escena.revisiones.at(-1).rev || '' : '—';
  const celdas = [
    ['Escala', escalaN === '—' ? 'Sin escala' : `1:${escalaN}`],
    ['Papel', op.papel],
    ['Fecha', pr.fecha || ''],
    ['Rev.', rev],
    ['Hoja', `${hoja} de ${totalHojas}`],
  ];
  const anchos = [0.22, 0.15, 0.25, 0.13, 0.25];
  let cx = x;
  celdas.forEach(([k, v], i) => {
    const cw = w * anchos[i];
    if (i) s += linea([cx, yb], [cx, y + alto], { w: 0.2 });
    s += texto(cx + 2, yb + 4, k, { t: 1.8, color: GRIS });
    s += texto(cx + 2, yb + 9, recortar(v, 2.3, cw - 3), { t: 2.3, peso: 600 });
    cx += cw;
  });
  return { s, alto };
}

// Flecha del norte, si la escena está ubicada en el mapa (escena.geo).
export function flechaNorte(escena, x, y, r = 5) {
  if (!escena.geo || !Number.isFinite(escena.geo.lat)) return '';
  const g = n2(escena.geo.norte || 0);
  return (
    `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${g})">` +
    `<circle r="${r}" fill="#fff" stroke="${TINTA}" stroke-width="0.25"/>` +
    `<polygon points="0,${n2(-r * 0.82)} ${n2(r * 0.32)},${n2(r * 0.4)} 0,${n2(r * 0.18)} ${n2(-r * 0.32)},${n2(r * 0.4)}" fill="${TINTA}"/>` +
    `</g>` +
    texto(x + Math.sin((g * Math.PI) / 180) * (r + 2.6), y - Math.cos((g * Math.PI) / 180) * (r + 2.6) + 1, 'N', { t: 2.4, peso: 700, ancla: 'middle' })
  );
}

// Hoja de planta. "extra" permite armar hojas especiales sobre la misma planta (emergencia, eléctrico,
// logística, sonido…):
//   titulo: texto del cuadro de datos ("Plano de emergencia").
//   numeroHoja: número de esta hoja (por defecto 1).
//   filtro(o): qué objetos se dibujan (por defecto, todos).
//   numeros: false para no poner los números de referencia del listado.
//   encima({ M, k, dib, escena }): SVG que se dibuja encima de la planta, dentro del área de dibujo.
//   M convierte [x, y] de la escena (m) a milímetros de papel; k son milímetros por metro.
//   columna({ col, banda, derX, derW, limite, k, escena }): SVG que reemplaza las referencias de la columna
//   (o de la franja de abajo en hoja vertical). La escala y el cuadro de datos se dibujan igual.
export function hojaPlanta(escena, comp, op, totalHojas, extra = {}) {
  const [W, H] = tamanoPapel(op);
  const { m, dib, col, banda } = marco(W, H);
  const N = op.escala === 'auto' ? escalaAuto(escena, op) : Number(op.escala) || 100;
  const k = 1000 / N;
  const b = limitesDibujo(escena);
  const ox = dib.x + (dib.w - (b.maxX - b.minX) * k) / 2 - b.minX * k;
  const oy = dib.y + (dib.h - (b.maxY - b.minY) * k) / 2 - b.minY * k;
  const M = ([x, y]) => [ox + x * k, oy + y * k];
  const ver = extra.filtro || (() => true);
  const numHoja = extra.numeroHoja || 1;

  const capas = { fondo: [], grilla: [], piso: [], objetos: [], elevados: [], muros: [], cotas: [], marcas: [] };
  capas.fondo.push(imagenFondo(escena, op, M, k));
  // Dos ambientes pegados comparten un borde: su cota se dibuja una sola vez.
  const cotasHechas = new Set();
  const claveBorde = (a, b) => [a, b].map((p) => p.map((v) => v.toFixed(2)).join(',')).sort().join('|');

  // Áreas
  for (const a of escena.areas) {
    if (!a.contorno || a.contorno.length < 3) continue;
    const g = geometriaArea({ ...a, contorno: a.contorno });
    const abierta = g.sinParedes;
    capas.piso.push(`<polygon points="${pts(a.contorno.map(M))}" fill="${abierta ? '#f6f8f3' : '#f3f3f3'}" stroke="${abierta ? '#9a9a9a' : 'none'}" stroke-width="0.2"${abierta ? ' stroke-dasharray="3 1.5"' : ''}/>`);
    if (abierta && a.nombre) {
      const cj = cajaDe(a.contorno);
      const p = M([cj.minX, cj.minY]);
      capas.marcas.push(texto(p[0] + 2, p[1] + 4, a.nombre, { t: 2.2, color: GRIS, peso: 600 }));
    }
    for (const pm of g.muros) capas.muros.push(`<polygon points="${pts(pm.map(M))}" fill="#3d3d3d" stroke="${TINTA}" stroke-width="0.2"/>`);
    for (const v of g.ventanas) {
      capas.muros.push(`<polygon points="${pts(v.p.map(M))}" fill="#fff" stroke="${TINTA}" stroke-width="0.2"/>` + linea(M(v.medio[0]), M(v.medio[1]), { w: 0.15 }));
    }
    for (const pu of g.puertas) {
      if (pu.porton) {
        capas.muros.push(linea(M(pu.a), M(pu.b), { w: 0.2, dash: '2 1' }));
        continue;
      }
      const H0 = M(pu.bisagra);
      const r = pu.ancho * k;
      const Q = [H0[0] - pu.n[0] * r, H0[1] - pu.n[1] * r];
      const R = M(pu.cierre);
      const cruz = -pu.n[0] * pu.u[1] + pu.n[1] * pu.u[0];
      capas.muros.push(linea(H0, Q, { w: 0.25 }) + `<path d="M${n2(Q[0])} ${n2(Q[1])} A${n2(r)} ${n2(r)} 0 0 ${cruz > 0 ? 0 : 1} ${n2(R[0])} ${n2(R[1])}" fill="none" stroke="${TINTA}" stroke-width="0.12" stroke-dasharray="0.8 0.5"/>`);
    }
    for (const ro of g.rotulos) {
      const p = M(ro.pos);
      capas.marcas.push(texto(p[0], p[1], ro.texto, { t: 2, peso: 700, color: ro.salida ? '#1d8a55' : TINTA, ancla: 'middle', base: 'middle' }));
    }
    if (op.cotas) {
      for (const c of g.cotas) {
        const clave = claveBorde(c.a, c.b);
        if (cotasHechas.has(clave)) continue;
        cotasHechas.add(clave);
        capas.cotas.push(cota(M(c.a), M(c.b), c.normal, c.afuera * k + 5, `${fm(c.L)} m`));
      }
    }
  }

  // Grilla de 1 m (o 5 m si la escala es chica), recortada al área de dibujo.
  if (op.grilla) {
    const paso = k >= 3 ? 1 : 5;
    const x0 = Math.floor((dib.x - ox) / k / paso) * paso;
    const x1 = Math.ceil((dib.x + dib.w - ox) / k / paso) * paso;
    const y0 = Math.floor((dib.y - oy) / k / paso) * paso;
    const y1 = Math.ceil((dib.y + dib.h - oy) / k / paso) * paso;
    let s = '';
    for (let x = x0; x <= x1; x += paso) s += linea(M([x, y0]), M([x, y1]), { w: 0.07, color: '#e1e1e1' });
    for (let y = y0; y <= y1; y += paso) s += linea(M([x0, y]), M([x1, y]), { w: 0.07, color: '#e1e1e1' });
    capas.grilla.push(s);
  }

  // Objetos
  const orden = [...escena.objetos].sort((a, b) => peso(a) - peso(b) || (a.elev || 0) - (b.elev || 0));
  for (const o of orden) {
    if (!ver(o)) continue;
    const s = simbolo(o, M, k, op);
    if (!s) continue;
    if (o.tipo === 'zona' || o.tipo === 'estacionamiento' || o.tipo === 'camino') capas.piso.push(s);
    else if ((o.elev || 0) >= 1.8) capas.elevados.push(s);
    else capas.objetos.push(s);
  }

  // Zonas: nombre y m²
  for (const o of escena.objetos.filter((x) => ver(x) && (x.tipo === 'zona' || x.tipo === 'estacionamiento' || x.tipo === 'camino'))) {
    const r = rotuloSuperficie(o);
    const c = M(r.pos);
    capas.marcas.push(texto(c[0], c[1] - 1.2, o.nombre, { t: 2.6, peso: 700, ancla: 'middle', color: r.color }) + texto(c[0], c[1] + 2.2, r.detalle, { t: 2, ancla: 'middle', color: GRIS }));
  }

  // Cotas del usuario
  if (op.cotas) {
    for (const ct of escena.cotas || []) {
      const A = M(ct.a);
      const B = M(ct.b);
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const L = Math.hypot(ct.b[0] - ct.a[0], ct.b[1] - ct.a[1]);
      capas.cotas.push(cota(A, B, [-dy, dx], (ct.desplazo || 0) * k, `${fm(L)} m`, { color: ACENTO }));
    }
  }

  // Numeración y carteles. Si dos números caen encima (objetos apilados), el segundo se corre al costado.
  const ocupados = [];
  const ubicar = (p, r) => {
    let q = [...p];
    for (let i = 0; i < 8 && ocupados.some(([x, y, rr]) => Math.hypot(x - q[0], y - q[1]) < r + rr + 0.4); i++) q = [q[0] + r * 2 + 0.6, q[1]];
    ocupados.push([q[0], q[1], r]);
    return q;
  };
  for (const o of escena.objetos) {
    if (!ver(o)) continue;
    const c = M(o.pos);
    if (o.tipo === 'etiqueta') {
      const ancho = anchoTexto(o.nombre, 2.2) + 3;
      capas.marcas.push(`<rect x="${n2(c[0] - ancho / 2)}" y="${n2(c[1] - 2)}" width="${n2(ancho)}" height="4" rx="0.6" fill="${TINTA}"/>` + texto(c[0], c[1] + 0.1, o.nombre, { t: 2.2, peso: 600, color: '#fff', ancla: 'middle', base: 'middle' }));
      continue;
    }
    const codigo = comp.codigoDe.get(o.id);
    if (op.numeros && extra.numeros !== false && codigo) {
      const chico = Math.max(o.dims[0], o.dims[1]) * k < 4;
      const r = chico ? 1.3 : 1.8;
      const pc = ubicar(chico ? [c[0] + r + 0.6, c[1] - r - 0.6] : c, r);
      capas.marcas.push(`<circle cx="${n2(pc[0])}" cy="${n2(pc[1])}" r="${r}" fill="#fff" stroke="${ACENTO}" stroke-width="0.25"/>` + texto(pc[0], pc[1] + 0.05, String(codigo), { t: chico ? 1.5 : 1.9, peso: 700, color: ACENTO, ancla: 'middle', base: 'middle' }));
    }
    if (op.nombres && o.tipo !== 'zona' && o.tipo !== 'arbol' && o.tipo !== 'persona') {
      capas.marcas.push(texto(c[0], c[1] + 3.6, recortar(o.nombre, 1.7, 30), { t: 1.7, color: GRIS, ancla: 'middle' }));
    }
  }

  // Columna (hoja horizontal) o franja de abajo (hoja vertical): referencias, zonas, notas, escala y cuadro
  // de datos. En la franja, las referencias van a la izquierda en varias columnas y el resto a la derecha.
  let colS = `<rect x="${n2(col.x)}" y="${n2(col.y)}" width="${n2(col.w)}" height="${n2(col.h)}" fill="#fff" stroke="${TINTA}" stroke-width="0.35"/>`;
  const derW = banda ? Math.min(100, col.w * 0.45) : col.w;
  const derX = col.x + col.w - derW;
  const limite = col.y + col.h - 40 - 22;
  const ref = banda ? { x: col.x, w: col.w - derW, limite: col.y + col.h - 8 } : { x: col.x, w: col.w, limite: limite - 30 };
  if (banda) colS += linea([derX, col.y], [derX, col.y + col.h], { w: 0.2 });
  const cuadro = cuadroDatos(escena, op, derX, col.y + col.h - 40, derW, N, numHoja, totalHojas, extra.titulo);
  if (extra.columna) colS += extra.columna({ col, banda, derX, derW, limite, k, escena });
  else {
  let y = col.y + 7;
  colS += texto(ref.x + 4, y, 'Referencias', { t: 3, peso: 700 });
  y += 5;
  const lh = 3.4;
  const nCol = banda ? Math.max(1, Math.floor(ref.w / 50)) : 1;
  const cw = ref.w / nCol;
  const yIni = y;
  let c = 0;
  let cortado = false;
  for (const it of comp.items) {
    if (y + lh > ref.limite) {
      if (c + 1 >= nCol) {
        cortado = true;
        break;
      }
      c++;
      y = yIni;
    }
    const x = ref.x + c * cw;
    colS += `<circle cx="${n2(x + 6)}" cy="${n2(y - 0.8)}" r="1.5" fill="#fff" stroke="${ACENTO}" stroke-width="0.22"/>`;
    colS += texto(x + 6, y - 0.75, String(it.codigo), { t: 1.6, peso: 700, color: ACENTO, ancla: 'middle', base: 'middle' });
    const nombre = it.ref ? `${it.nombre} ${it.ref}` : it.nombre;
    colS += texto(x + 9.5, y, recortar(nombre, 2, cw - 24), { t: 2, peso: 600 });
    colS += texto(x + cw - 4, y, `× ${it.cantidad}`, { t: 2, peso: 700, ancla: 'end' });
    y += 2.7;
    colS += texto(x + 9.5, y, recortar(it.medida, 1.7, cw - 14), { t: 1.7, color: GRIS });
    y += lh;
  }
  if (cortado) {
    colS += texto(ref.x + c * cw + 4, y, 'Sigue en el listado de materiales.', { t: 1.9, color: GRIS });
    y += lh;
  }
  if (!comp.items.length) {
    colS += texto(ref.x + 4, y, 'Sin materiales para computar.', { t: 2, color: GRIS });
    y += lh;
  }
  // En la franja, zonas y notas arrancan arriba del bloque derecho; en la columna, siguen a las referencias.
  if (banda) y = col.y + 7;
  const zonas = comp.superficies.filter((s) => s.tipo === 'Zona');
  if (zonas.length && y < limite - 12) {
    y += 2;
    colS += texto(derX + 4, y, 'Zonas', { t: 2.4, peso: 700 });
    y += 4;
    for (const z of zonas) {
      if (y > limite - 6) break;
      colS += texto(derX + 4, y, recortar(z.nombre, 2, derW - 30), { t: 2 }) + texto(derX + derW - 4, y, `${fm(z.m2, 1)} m²`, { t: 2, peso: 600, ancla: 'end' });
      y += lh;
    }
  }
  if (escena.notas && y < limite - 10) {
    y += 2;
    colS += texto(derX + 4, y, 'Notas', { t: 2.4, peso: 700 });
    y += 4;
    const disponibles = Math.max(1, Math.floor((limite - y) / 3));
    for (const l of envolver(escena.notas, 1.8, derW - 8, disponibles)) {
      colS += texto(derX + 4, y, l, { t: 1.8, color: GRIS });
      y += 3;
    }
  }
  }
  colS += barraEscala(derX + 6, col.y + col.h - 40 - 14, k, derW - 45);
  colS += texto(derX + derW - 4, col.y + col.h - 40 - 12.5, 'Medidas en metros', { t: 1.8, color: GRIS, ancla: 'end' });
  colS += cuadro.s;

  const marcoS = `<rect x="${m}" y="${m}" width="${n2(W - 2 * m)}" height="${n2(H - 2 * m)}" fill="none" stroke="${TINTA}" stroke-width="0.5"/>`;
  const idClip = `area-dibujo-${numHoja}`;
  const clip = `<clipPath id="${idClip}"><rect x="${n2(dib.x)}" y="${n2(dib.y)}" width="${n2(dib.w)}" height="${n2(dib.h)}"/></clipPath>`;
  return svgHoja(W, H, [
    definiciones(),
    clip,
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
    marcoS,
    `<g clip-path="url(#${idClip})">`,
    capas.fondo.join(''),
    capas.grilla.join(''),
    capas.piso.join(''),
    capas.objetos.join(''),
    capas.elevados.join(''),
    capas.muros.join(''),
    capas.cotas.join(''),
    capas.marcas.join(''),
    extra.encima ? extra.encima({ M, k, dib, escena }) : '',
    `</g>`,
    op.norte !== false ? flechaNorte(escena, dib.x + dib.w - 9, dib.y + 10) : '',
    colS,
  ]);
}

export function peso(o) {
  if (o.tipo === 'zona') return 0;
  if (o.tipo === 'arbol' || o.tipo === 'hilera') return 1;
  if (o.tipo === 'tarima') return 2;
  return 3;
}

export function svgHoja(W, H, partes) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">${partes.join('')}</svg>`;
}

/* ------------------------------------------------------------------ hojas de materiales */

function hojasMateriales(escena, comp, op, primeraHoja, totalHojasRef) {
  const [W, H] = tamanoPapel(op);
  const m = 10;
  const x0 = m + 6;
  const ancho = W - 2 * m - 12;
  const filaH = 6;
  const cols = [
    { k: 'codigo', t: 'Cód.', w: 0.06, ancla: 'middle' },
    { k: 'cat', t: 'Categoría', w: 0.16 },
    { k: 'nombre', t: 'Ítem', w: 0.2 },
    { k: 'ref', t: 'Modelo / ref.', w: 0.2 },
    { k: 'medida', t: 'Medidas', w: 0.17 },
    { k: 'cantidad', t: 'Cant.', w: 0.07, ancla: 'end' },
    { k: 'unidad', t: 'Unidad', w: 0.06 },
    { k: 'proveedor', t: 'Proveedor', w: 0.08 },
  ];
  const filas = [];
  for (const it of comp.items) filas.push({ tipo: 'item', ...it, cat: nombreCategoria(it.cat) });
  if (comp.derivados.length) {
    filas.push({ tipo: 'titulo', texto: 'Para el armado' });
    for (const d of comp.derivados) filas.push({ tipo: 'item', codigo: '', cat: '', nombre: d.nombre, ref: d.detalle, medida: '', cantidad: fm(d.cantidad, d.dec), unidad: d.unidad, proveedor: '' });
  }
  if (comp.superficies.length) {
    filas.push({ tipo: 'titulo', texto: 'Superficies' });
    for (const s of comp.superficies) filas.push({ tipo: 'item', codigo: '', cat: s.tipo, nombre: s.nombre, ref: '', medida: '', cantidad: fm(s.m2, 1), unidad: 'm²', proveedor: '' });
  }
  const yInicio = m + 30;
  const yFin = H - m - 46;
  const porHoja = Math.max(1, Math.floor((yFin - yInicio) / filaH));
  const paginas = [];
  for (let i = 0; i < Math.max(1, filas.length); i += porHoja) paginas.push(filas.slice(i, i + porHoja));
  totalHojasRef.total = primeraHoja - 1 + paginas.length;

  return (numHoja, totalHojas) =>
    paginas.map((pag, ip) => {
      let s = `<rect width="${W}" height="${H}" fill="#fff"/><rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${TINTA}" stroke-width="0.5"/>`;
      s += texto(x0, m + 12, 'Listado de materiales', { t: 5, peso: 700 });
      s += texto(x0, m + 18.5, `${escena.proyecto?.evento || escena.nombre}: ${comp.total} unidades en ${comp.items.length} ítems`, { t: 2.4, color: GRIS });
      let y = yInicio;
      let x = x0;
      s += `<rect x="${x0}" y="${y - 4.2}" width="${ancho}" height="${filaH}" fill="#111"/>`;
      for (const c of cols) {
        const w = c.w * ancho;
        const tx = c.ancla === 'end' ? x + w - 2 : c.ancla === 'middle' ? x + w / 2 : x + 2;
        s += texto(tx, y, c.t, { t: 2.2, peso: 700, color: '#fff', ancla: c.ancla || 'start' });
        x += w;
      }
      y += filaH;
      pag.forEach((f, i) => {
        if (f.tipo === 'titulo') {
          s += texto(x0 + 2, y + 1, f.texto, { t: 2.8, peso: 700 });
          s += linea([x0, y + 2.2], [x0 + ancho, y + 2.2], { w: 0.25 });
          y += filaH;
          return;
        }
        if (i % 2) s += `<rect x="${x0}" y="${y - 4.2}" width="${ancho}" height="${filaH}" fill="#f4f4f4"/>`;
        let xx = x0;
        for (const c of cols) {
          const w = c.w * ancho;
          const v = f[c.k] ?? '';
          const tx = c.ancla === 'end' ? xx + w - 2 : c.ancla === 'middle' ? xx + w / 2 : xx + 2;
          s += texto(tx, y, recortar(v, 2.3, w - 4), { t: 2.3, peso: c.k === 'cantidad' || c.k === 'codigo' ? 700 : 400, ancla: c.ancla || 'start', color: c.k === 'codigo' ? ACENTO : TINTA });
          xx += w;
        }
        y += filaH;
      });
      const cw = W >= 400 ? 100 : 78;
      const cuadro = cuadroDatos(escena, op, W - m - cw, H - m - 40, cw, '—', numHoja + ip, totalHojas);
      s += cuadro.s.replace('1:—', 'Sin escala');
      return svgHoja(W, H, [s]);
    });
}

/* ------------------------------------------------------------------ todo junto */

// extras: hojas especiales que van entre la planta y el listado de materiales, cada una como
// { paginas: cuántas hojas genera, crear(primeraHoja, totalHojas) => [svg, ...] }.
export function generarHojas(escena, comp, opciones = opcionesHoja(escena), extras = []) {
  const extraPaginas = extras.reduce((s, e) => s + (e.paginas ?? 1), 0);
  const primeraMat = 2 + extraPaginas;
  const ref = { total: 1 + extraPaginas };
  const materiales = opciones.materiales ? hojasMateriales(escena, comp, opciones, primeraMat, ref) : null;
  const total = materiales ? ref.total : 1 + extraPaginas;
  const hojas = [hojaPlanta(escena, comp, opciones, total, { filtro: opciones.filtro })];
  let n = 2;
  for (const e of extras) {
    const nuevas = e.crear(n, total) || [];
    hojas.push(...nuevas);
    n += nuevas.length;
  }
  if (materiales) hojas.push(...materiales(primeraMat, total));
  return { hojas, tamano: tamanoPapel(opciones), escala: opciones.escala === 'auto' ? escalaAuto(escena, opciones) : Number(opciones.escala) };
}
