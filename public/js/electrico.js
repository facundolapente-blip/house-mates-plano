// Plano eléctrico: generadores, tableros y equipos.
//
// Cada equipo que consume (campo "potencia" en W, o la típica de su tipo) se enchufa a un tablero o directo a
// un generador (campo "tablero" con el id). Cada tablero toma energía de un generador o de otro tablero
// (campo "alimenta"). La potencia se suma de abajo hacia arriba: equipo → tablero → generador.
// Los cables van por el piso en L (sin diagonales), suben o bajan lo que haga falta (según "elev") y llevan
// 2 m de sobra en cada punta. El largo se redondea al largo comercial siguiente (5, 10, 15… 50 m); si pasa
// de 50 m, se arma con varios cables.
//
// No usa el motor 3D ni el navegador: se puede probar con Node.

import { defDatos, catDe } from './tipos-datos.js';
import { fm, esc, numero } from './formato.js';
import { esquinas } from './geometria.js';
import { computar } from './computo.js';
import { hojaPlanta, opcionesHoja, texto, linea, pts, n2, recortar, envolver, anchoTexto, TINTA, GRIS } from './plano2d.js';

export const LARGOS_CABLE = [5, 10, 15, 20, 25, 30, 40, 50];
export const SOBRA_PUNTA = 2; // metros de sobra en cada punta del cable
export const FACTOR_POTENCIA = 0.9;
export const MARGEN = 80; // % de uso a partir del cual se avisa que queda poco margen

const RAIZ3 = Math.sqrt(3);

// Estado de cada fuente: verde si está bien, cálido si queda poco margen o falta un dato, rojo si se pasa.
export const COLOR_ESTADO = { ok: '#2FBF71', aviso: '#E8AA4C', error: '#FF3B30' };
// Lo mismo para texto sobre papel blanco (el verde y el cálido se oscurecen para que se lean impresos).
const TINTA_ESTADO = { ok: '#1D8A55', aviso: '#9A6413', error: '#FF3B30' };
// Un color por generador o tablero para seguir los cables en el plano. Sin rojo ni cálido, que son avisos.
export const COLORES_FUENTE = ['#2447F5', '#8A4FFF', '#0E8FA3', '#C2187A', '#0B5FA5', '#6B3FA0', '#5A6B7D', '#A31F6B'];

/* ------------------------------------------------------------------ datos de cada objeto */

export const esFuente = (o) => o?.tipo === 'generador' || o?.tipo === 'tablero';
const elevDe = (o) => Number(o.elev) || 0;
// Id escrito en un campo ("tablero", "alimenta", "colgadoDe"). formato.js los pasa a texto, así que false
// llega como "false": vale lo mismo que vacío.
const idTexto = (v) => {
  const s = v === undefined || v === null || v === false ? '' : String(v).trim();
  return s === 'false' || s === 'null' || s === 'undefined' ? '' : s;
};
const nombreDe = (o) => String(o.nombre || defDatos(o).nombre || o.id);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const listaNombres = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`);
const r2 = (v) => Math.round(v * 100) / 100;

// Potencia que consume un objeto (W): la suya, o la típica de su tipo, o 0. Los generadores y tableros no
// consumen: reparten.
export function potenciaDe(o) {
  if (!o || esFuente(o)) return 0;
  const n = numero(o.potencia);
  if (n !== null) return Math.max(0, n);
  return Math.max(0, Number(defDatos(o).potencia) || 0);
}

// Potencia que aguanta un generador o tablero (W). Si no está cargada, la típica del tipo (tipica: true).
export function capacidadDe(o) {
  const n = numero(o?.capacidad);
  if (n !== null && n > 0) return { valor: n, tipica: false };
  const t = Number(defDatos(o).capacidad) || 0;
  return { valor: t, tipica: t > 0 };
}

// 12.400 W → "12,4 kW"; 800 W → "800 W".
export function textoPotencia(w) {
  const v = Number(w) || 0;
  if (Math.abs(v) < 1000) return `${fm(v, 0)} W`;
  const kw = Math.round(v / 100) / 10;
  return `${fm(kw, kw % 1 ? 1 : 0)} kW`;
}

export const textoPorcentaje = (p) => (p === null || p === undefined || !Number.isFinite(p) ? 'sin dato' : `${fm(p, 0)} %`);

// Largo comercial para un tendido de "metros": el siguiente de LARGOS_CABLE. Más de 50 m se arma con
// varios cables (63 m → 50 + 15).
export function largoComercial(metros) {
  const max = LARGOS_CABLE.at(-1);
  const tramos = [];
  let resto = Math.max(0, Number(metros) || 0);
  while (resto > max + 1e-9) {
    tramos.push(max);
    resto -= max;
  }
  if (resto > 1e-9 || !tramos.length) tramos.push(LARGOS_CABLE.find((l) => l >= resto - 1e-9) ?? max);
  return { largo: tramos.reduce((s, l) => s + l, 0), tramos };
}

// Fases propias de un generador o tablero (1 o 3), o null si no se puede saber.
function fasesPropias(o) {
  const f = numero(o.fases);
  if (f === 1 || f === 3) return f;
  const t = numero(o.tension);
  if (t !== null && t >= 300) return 3;
  if (t !== null && t > 0) return 1;
  return null;
}

function tensionDe(o, fases, heredada) {
  const t = numero(o.tension);
  if (fases === 3) return t !== null && t >= 300 ? t : heredada >= 300 ? heredada : 380;
  return t !== null && t > 0 && t < 300 ? t : heredada > 0 && heredada < 300 ? heredada : 220;
}

// Corriente (A). Monofásica: I = P / 220. Trifásica, por fase y con la carga repartida parejo entre las tres:
// I = P / (√3 · 380). Con factor de potencia 0,9 la corriente real es un 11 % más (corriente / 0,9).
export const corrienteDe = (p, fases, tension) => (tension > 0 ? (fases === 3 ? p / (RAIZ3 * tension) : p / tension) : 0);

// Cable de "desde" (equipo o tablero) hasta "hasta" (tablero o generador): por el piso, en L.
function medirCable(desde, hasta, tipo) {
  const [ax, ay] = desde.pos;
  const [bx, by] = hasta.pos;
  const az = elevDe(desde);
  const bz = elevDe(hasta);
  const recorrido = Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz);
  const medido = recorrido + 2 * SOBRA_PUNTA;
  const { largo, tramos } = largoComercial(medido);
  return {
    desde: String(desde.id),
    hasta: String(hasta.id),
    tipo,
    largo,
    tramos,
    medido: r2(medido),
    recorrido: r2(recorrido),
    // En planta: del equipo en x hasta la columna del tablero y después en y.
    puntos: [[ax, ay], [bx, ay], [bx, by]],
    // Para dibujarlo en 3D: [x, y, altura]. Baja del equipo al piso, va por el piso y sube al tablero.
    puntos3d: [[ax, ay, az], [ax, ay, 0], [bx, ay, 0], [bx, by, 0], [bx, by, bz]],
  };
}

/* ------------------------------------------------------------------ análisis */

export function analizarElectrico(escena) {
  const objetos = (Array.isArray(escena?.objetos) ? escena.objetos : []).filter((o) => o && Array.isArray(o.pos));
  const porId = new Map(objetos.map((o) => [String(o.id), o]));
  const fuentesObj = objetos.filter(esFuente);
  const fuentePorId = new Map(fuentesObj.map((o) => [String(o.id), o]));
  const problemas = [];
  const avisar = (nivel, t, ids = []) => problemas.push({ nivel, texto: t, ids });

  // De qué fuente toma energía cada tablero.
  const padre = new Map();
  for (const t of fuentesObj) {
    if (t.tipo !== 'tablero') continue;
    const id = String(t.id);
    const a = idTexto(t.alimenta);
    if (!a) avisar('aviso', `${nombreDe(t)} no toma energía de ningún generador. Elegí de dónde se alimenta.`, [id]);
    else if (a === id) avisar('aviso', `${nombreDe(t)} dice que se alimenta de sí mismo. Elegí el generador o tablero del que toma energía.`, [id]);
    else if (!fuentePorId.has(a)) {
      const otro = porId.get(a);
      avisar('aviso', otro ? `${nombreDe(t)} toma energía de ${nombreDe(otro)}, que no es un generador ni un tablero.` : `${nombreDe(t)} toma energía de "${a}", que no está en la escena.`, [id]);
    } else padre.set(id, a);
  }

  // Ciclos: A alimenta a B y B alimenta a A. Ninguno recibe energía; se cortan para poder sumar.
  const enCiclo = new Set();
  const marca = new Map(); // 1 = recorriendo, 2 = listo
  for (const f of fuentesObj) {
    const camino = [];
    let n = String(f.id);
    while (n && !marca.has(n)) {
      marca.set(n, 1);
      camino.push(n);
      n = padre.get(n);
    }
    if (n && marca.get(n) === 1) {
      const ciclo = camino.slice(camino.indexOf(n));
      ciclo.forEach((c) => enCiclo.add(c));
      avisar('error', `${listaNombres(ciclo.map((c) => nombreDe(fuentePorId.get(c))))} se alimentan entre sí en círculo y ninguno recibe energía de un generador. Revisá de dónde toma energía cada uno.`, ciclo);
    }
    camino.forEach((c) => marca.set(c, 2));
  }
  for (const c of enCiclo) padre.delete(c);

  const hijos = new Map(fuentesObj.map((o) => [String(o.id), []]));
  for (const [h, p] of padre) hijos.get(p).push(h);

  // Equipos: a qué fuente se enchufa cada uno.
  const equipos = new Map(fuentesObj.map((o) => [String(o.id), []]));
  const sinConectar = [];
  let totalPotencia = 0;
  for (const o of objetos) {
    if (esFuente(o)) continue;
    const p = potenciaDe(o);
    totalPotencia += p;
    const t = idTexto(o.tablero);
    if (t && fuentePorId.has(t)) {
      equipos.get(t).push(o);
      continue;
    }
    if (t) {
      const otro = porId.get(t);
      avisar('aviso', `${nombreDe(o)} está conectado a ${otro ? nombreDe(otro) : `"${t}"`}, que no es un tablero ni un generador de la escena. Elegí otro.`, [String(o.id)]);
    }
    if (p > 0) sinConectar.push(o);
  }

  // Potencia de cada fuente: sus equipos más lo que piden los tableros que alimenta.
  const potencia = new Map();
  const sumar = (id) => {
    if (potencia.has(id)) return potencia.get(id);
    let s = equipos.get(id).reduce((a, o) => a + potenciaDe(o), 0);
    for (const h of hijos.get(id)) s += sumar(h);
    potencia.set(id, s);
    return s;
  };

  // Orden de árbol: cada generador con sus tableros abajo; después los tableros sueltos.
  const raices = fuentesObj
    .filter((o) => !padre.has(String(o.id)))
    .sort((a, b) => (a.tipo === 'generador' ? 0 : 1) - (b.tipo === 'generador' ? 0 : 1));
  const fuentes = [];
  const visitar = (id, nivel, raiz, fasesPadre, tensionPadre) => {
    const o = fuentePorId.get(id);
    const propias = fasesPropias(o);
    const fases = propias ?? fasesPadre ?? 1;
    const tension = tensionDe(o, fases, propias === null || propias === fasesPadre ? tensionPadre : 0);
    const { valor: capacidad, tipica } = capacidadDe(o);
    const pot = sumar(id);
    const porcentaje = capacidad > 0 ? (pot / capacidad) * 100 : null;
    const corriente = corrienteDe(pot, fases, tension);
    const sinFuente = fuentePorId.get(raiz).tipo !== 'generador';
    let estado = 'ok';
    if (enCiclo.has(id) || (porcentaje !== null && porcentaje > 100)) estado = 'error';
    else if (porcentaje === null || porcentaje > MARGEN || sinFuente) estado = 'aviso';
    const f = {
      id,
      nombre: nombreDe(o),
      tipo: o.tipo,
      capacidad,
      capacidadTipica: tipica,
      potencia: pot,
      potenciaDirecta: equipos.get(id).reduce((a, e) => a + potenciaDe(e), 0),
      porcentaje,
      corriente,
      corrienteFp: corriente / FACTOR_POTENCIA,
      corrienteMax: corrienteDe(capacidad, fases, tension),
      fases,
      tension,
      fasesSupuestas: propias === null && fasesPadre === undefined,
      equipos: equipos.get(id).map((e) => String(e.id)),
      hijos: [...hijos.get(id)],
      padre: padre.get(id) ?? null,
      raiz,
      nivel,
      sinFuente,
      enCiclo: enCiclo.has(id),
      estado,
      ok: estado === 'ok',
      color: COLORES_FUENTE[fuentes.length % COLORES_FUENTE.length],
      pos: [...o.pos],
      elev: elevDe(o),
    };
    fuentes.push(f);
    if (porcentaje !== null && porcentaje > 100) {
      avisar('error', `${f.nombre} está al ${fm(porcentaje, 0)} % (${textoPotencia(pot)} de ${textoPotencia(capacidad)}): se pasa de lo que aguanta y se puede cortar. Pasá equipos a otro tablero o sumá potencia.`, [id]);
    } else if (porcentaje !== null && porcentaje > MARGEN) {
      avisar('aviso', `${f.nombre} está al ${fm(porcentaje, 0)} % (${textoPotencia(pot)} de ${textoPotencia(capacidad)}): queda poco margen. Conviene no pasar del ${MARGEN} %.`, [id]);
    } else if (porcentaje === null && pot > 0) {
      avisar('aviso', `${f.nombre}: cargá cuánta potencia aguanta (capacidad en W) para saber si alcanza.`, [id]);
    }
    for (const h of hijos.get(id)) visitar(h, nivel + 1, raiz, fases, tension);
  };
  for (const r of raices) visitar(String(r.id), 0, String(r.id), undefined, undefined);

  // Cables: de cada equipo a su fuente y de cada tablero a la fuente que lo alimenta.
  const colorDe = new Map(fuentes.map((f) => [f.id, f.color]));
  const cables = [];
  for (const f of fuentes) {
    const destino = fuentePorId.get(f.id);
    for (const e of equipos.get(f.id)) cables.push({ ...medirCable(e, destino, 'equipo'), color: f.color });
    if (f.padre) cables.push({ ...medirCable(destino, fuentePorId.get(f.padre), 'alimentacion'), color: colorDe.get(f.padre) });
  }
  for (const c of cables) {
    if (c.medido > LARGOS_CABLE.at(-1)) {
      avisar('aviso', `El cable de ${nombreDe(porId.get(c.desde))} a ${nombreDe(porId.get(c.hasta))} mide ${fm(c.medido, 0)} m: conviene acercar un tablero (en tendidos largos baja la tensión).`, [c.desde]);
    }
  }

  const potenciaSinConectar = sinConectar.reduce((s, o) => s + potenciaDe(o), 0);
  if (sinConectar.length) {
    const n = sinConectar.length;
    const ids = sinConectar.map((o) => String(o.id));
    if (!fuentesObj.length) {
      avisar('aviso', `Hay ${plural(n, 'equipo que consume', 'equipos que consumen')} ${textoPotencia(potenciaSinConectar)} y todavía no hay generador ni tablero. Agregá un generador (en Energía).`, ids);
    } else {
      avisar('aviso', `${n === 1 ? 'Falta conectar 1 equipo' : `Faltan conectar ${n} equipos`} (${textoPotencia(potenciaSinConectar)}). Elegí a qué tablero va cada uno.`, ids);
    }
  }

  problemas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'error' ? -1 : 1));
  return {
    fuentes,
    sinConectar: sinConectar.map((o) => String(o.id)),
    cables,
    totalCable: cables.reduce((s, c) => s + c.largo, 0),
    totalCableMedido: r2(cables.reduce((s, c) => s + c.medido, 0)),
    totalPotencia,
    potenciaConectada: totalPotencia - potenciaSinConectar,
    potenciaSinConectar,
    capacidadGeneradores: fuentes.filter((f) => f.tipo === 'generador').reduce((s, f) => s + f.capacidad, 0),
    avisos: problemas.map((p) => p.texto),
    problemas,
  };
}

/* ------------------------------------------------------------------ sugerencia de conexión */

// Para cada equipo de "ids" (por defecto, los que no están conectados), el tablero más cercano en línea
// recta que todavía tenga lugar (él y los que lo alimentan). Si ninguno tiene lugar, el más cercano.
// Prefiere tableros que reciben energía de un generador; si no hay tableros, usa los generadores.
// Devuelve { idEquipo: idTablero } sin tocar la escena. Se reparten primero los equipos que más consumen.
export function conectarMasCercano(escena, ids) {
  const objetos = (Array.isArray(escena?.objetos) ? escena.objetos : []).filter((o) => o && Array.isArray(o.pos));
  const lista = ids === undefined || ids === null ? analizarElectrico(escena).sinConectar : [...new Set([].concat(ids).map(String))];
  const elegir = new Set(lista);
  // Lo que ya consume cada fuente sin contar los equipos que se van a reubicar.
  const base = analizarElectrico({ ...escena, objetos: objetos.map((o) => (elegir.has(String(o.id)) ? { ...o, tablero: undefined } : o)) });
  if (!base.fuentes.length) return {};
  const tableros = base.fuentes.filter((f) => f.tipo === 'tablero');
  const alimentados = tableros.filter((f) => !f.sinFuente && !f.enCiclo);
  const candidatos = alimentados.length ? alimentados : tableros.length ? tableros : base.fuentes;
  const fuente = new Map(base.fuentes.map((f) => [f.id, f]));
  const carga = new Map(base.fuentes.map((f) => [f.id, f.potencia]));
  const cadena = (id) => {
    const c = [];
    while (id && fuente.has(id) && !c.includes(id)) {
      c.push(id);
      id = fuente.get(id).padre;
    }
    return c;
  };
  const tieneLugar = (id, p) => cadena(id).every((n) => !(fuente.get(n).capacidad > 0) || carga.get(n) + p <= fuente.get(n).capacidad + 1e-9);
  const porId = new Map(objetos.map((o) => [String(o.id), o]));
  const equipos = lista
    .map((id) => porId.get(id))
    .filter((o) => o && !esFuente(o) && potenciaDe(o) > 0)
    .sort((a, b) => potenciaDe(b) - potenciaDe(a));
  const res = {};
  for (const o of equipos) {
    const p = potenciaDe(o);
    const cerca = candidatos.map((f) => ({ f, d: Math.hypot(f.pos[0] - o.pos[0], f.pos[1] - o.pos[1]) })).sort((a, b) => a.d - b.d);
    const elegido = (cerca.find(({ f }) => tieneLugar(f.id, p)) || cerca[0]).f;
    res[String(o.id)] = elegido.id;
    for (const n of cadena(elegido.id)) carga.set(n, carga.get(n) + p);
  }
  return res;
}

/* ------------------------------------------------------------------ cables para el listado */

// Cables agrupados por tipo y largo: [{ tipo, largo, cantidad, texto }]. Primero los de equipos.
export function listaCables(analisis) {
  const grupos = new Map();
  for (const c of analisis?.cables || []) {
    for (const l of c.tramos?.length ? c.tramos : [c.largo]) {
      const clave = `${c.tipo}|${l}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, { tipo: c.tipo, largo: l, cantidad: 0, texto: c.tipo === 'alimentacion' ? `Cable de alimentación de ${l} m` : `Cable de ${l} m` });
      }
      grupos.get(clave).cantidad++;
    }
  }
  return [...grupos.values()].sort((a, b) => (a.tipo === b.tipo ? a.largo - b.largo : a.tipo === 'equipo' ? -1 : 1));
}

// Lo mismo con la forma de los "derivados" de computo.js, para sumarlo al listado de materiales.
export function derivadosElectricos(analisis) {
  const lista = listaCables(analisis);
  if (!lista.length) return [];
  return [
    ...lista.map((c) => ({ nombre: c.texto, detalle: c.tipo === 'alimentacion' ? 'de generador a tablero' : 'de tablero a equipo', cantidad: c.cantidad, unidad: 'u', dec: 0 })),
    { nombre: 'Cable en total', detalle: `por el piso, con ${SOBRA_PUNTA} m de sobra en cada punta`, cantidad: analisis.totalCable, unidad: 'm', dec: 0 },
  ];
}

/* ------------------------------------------------------------------ panel lateral */

function detalleCorriente(f) {
  const fase = f.fases === 3 ? ' por fase' : '';
  return `${fm(f.corriente, 1)} A${fase} (${fm(f.corrienteFp, 1)} A con factor de potencia ${fm(FACTOR_POTENCIA, 1)})`;
}

const textoFases = (f) => `${f.fases === 3 ? 'Trifásico' : 'Monofásico'} ${fm(f.tension, 0)} V${f.fasesSupuestas ? ' (supuesto: cargá las fases)' : ''}`;

export function htmlElectrico(escena, analisis) {
  const an = analisis || analizarElectrico(escena);
  const porId = new Map((escena?.objetos || []).map((o) => [String(o.id), o]));
  const nombre = (id) => (porId.get(id) ? nombreDe(porId.get(id)) : id);
  let h = '<section class="el-panel">';

  if (!an.fuentes.length && !an.totalPotencia) {
    return h + '<p class="el-vacio">Todavía no hay equipos que consuman energía. Agregá un generador, un tablero y los equipos desde la biblioteca (Energía).</p></section>';
  }

  h += '<div class="el-resumen">';
  h += `<div class="el-dato"><span>Consumo total</span><strong>${esc(textoPotencia(an.totalPotencia))}</strong></div>`;
  h += `<div class="el-dato"><span>Generadores</span><strong>${an.capacidadGeneradores ? esc(textoPotencia(an.capacidadGeneradores)) : 'Ninguno'}</strong></div>`;
  h += `<div class="el-dato"><span>Cable</span><strong>${esc(fm(an.totalCable, 0))} m</strong></div>`;
  h += '</div>';

  if (an.problemas.length) {
    h += '<ul class="el-avisos">';
    for (const p of an.problemas) h += `<li class="el-${p.nivel}"${p.ids.length ? ` data-ids="${esc(p.ids.join(' '))}"` : ''}>${esc(p.texto)}</li>`;
    h += '</ul>';
  }

  h += '<h4 class="el-titulo">Generadores y tableros</h4>';
  if (!an.fuentes.length) h += '<p class="el-vacio">No hay generadores ni tableros. Agregá uno desde la biblioteca (Energía).</p>';
  for (const f of an.fuentes) {
    const ancho = f.porcentaje === null ? 0 : Math.max(0, Math.min(100, f.porcentaje));
    h += `<article class="el-fuente el-${f.estado}" data-id="${esc(f.id)}" data-nivel="${Math.min(f.nivel, 3)}">`;
    h += `<header class="el-cab"><span class="el-color" style="background:${f.color}"></span><strong>${esc(f.nombre)}</strong>`;
    h += `<span class="el-pct">${esc(textoPorcentaje(f.porcentaje))}</span></header>`;
    h += `<div class="el-barra"><div class="el-relleno el-${f.estado}" style="width:${n2(ancho)}%"></div></div>`;
    const cap = f.capacidad > 0 ? `${textoPotencia(f.capacidad)}${f.capacidadTipica ? ' (típica, confirmala)' : ''}` : 'capacidad sin cargar';
    h += `<p class="el-detalle">${esc(textoPotencia(f.potencia))} de ${esc(cap)}</p>`;
    h += `<p class="el-detalle">${esc(detalleCorriente(f))}</p>`;
    const partes = [textoFases(f)];
    if (f.padre) partes.push(`toma de ${nombre(f.padre)}`);
    else if (f.tipo === 'tablero') partes.push(f.enCiclo ? 'alimentación en círculo' : 'sin generador');
    if (f.hijos.length) partes.push(`alimenta ${listaNombres(f.hijos.map(nombre))}`);
    h += `<p class="el-detalle">${esc(partes.join(' · '))}</p>`;
    if (f.equipos.length) {
      h += `<details class="el-detalle"><summary>${esc(plural(f.equipos.length, 'equipo enchufado', 'equipos enchufados'))} (${esc(textoPotencia(f.potenciaDirecta))})</summary><ul class="el-lista">`;
      for (const id of f.equipos) h += `<li data-id="${esc(id)}">${esc(nombre(id))}<span>${esc(textoPotencia(potenciaDe(porId.get(id))))}</span></li>`;
      h += '</ul></details>';
    }
    h += '</article>';
  }

  if (an.sinConectar.length) {
    h += `<h4 class="el-titulo">Sin conectar (${an.sinConectar.length})</h4><ul class="el-lista el-sin">`;
    for (const id of an.sinConectar) h += `<li class="el-aviso" data-id="${esc(id)}">${esc(nombre(id))}<span>${esc(textoPotencia(potenciaDe(porId.get(id))))}</span></li>`;
    h += '</ul>';
    if (an.fuentes.length) h += '<button type="button" class="el-boton" data-accion="conectar-cercano">Conectar cada uno al tablero más cercano</button>';
  }

  const cables = listaCables(an);
  if (cables.length) {
    h += '<h4 class="el-titulo">Cables</h4><ul class="el-lista el-cables">';
    for (const c of cables) h += `<li>${esc(c.texto)}<span>× ${c.cantidad}</span></li>`;
    h += '</ul>';
    h += `<p class="el-detalle">En total ${esc(fm(an.totalCable, 0))} m. Medido por el piso, sin diagonales, con ${SOBRA_PUNTA} m de sobra en cada punta y redondeado al largo comercial.</p>`;
  }
  h += '<p class="el-detalle el-nota">Es una estimación para planificar: el tendido final y las protecciones los define el electricista.</p>';
  return h + '</section>';
}

// Estilos sugeridos para el panel (usan las variables de estilos.css). El integrador puede pegarlos en
// estilos.css o agregarlos con un <style>.
export const CSS_ELECTRICO = `
.el-panel{display:flex;flex-direction:column;gap:8px;font-size:13px}
.el-resumen{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.el-dato{display:flex;flex-direction:column;gap:2px;padding:6px 8px;border:1px solid var(--linea);border-radius:var(--r-chico);background:var(--panel-2)}
.el-dato span{font-size:11px;color:var(--tinta-3)}
.el-dato strong{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.el-titulo{margin:6px 0 0;font-size:12px;font-weight:600;color:var(--tinta-2)}
.el-avisos{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.el-avisos li{padding:6px 8px;border-left:3px solid var(--calido);border-radius:var(--r-chico);background:var(--panel-2)}
.el-avisos li.el-error{border-left-color:var(--peligro)}
.el-avisos li[data-ids]{cursor:pointer}
.el-fuente{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid var(--linea);border-radius:var(--r);background:var(--panel-2);cursor:pointer}
.el-fuente[data-nivel="1"]{margin-left:12px}.el-fuente[data-nivel="2"]{margin-left:24px}.el-fuente[data-nivel="3"]{margin-left:36px}
.el-fuente.el-aviso{border-color:var(--calido)}.el-fuente.el-error{border-color:var(--peligro)}
.el-cab{display:flex;align-items:center;gap:6px}
.el-cab strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.el-color{flex:none;width:10px;height:10px;border-radius:3px}
.el-pct{font-weight:600;font-variant-numeric:tabular-nums}
.el-fuente.el-ok .el-pct{color:var(--exito)}.el-fuente.el-aviso .el-pct{color:var(--calido)}.el-fuente.el-error .el-pct{color:var(--peligro)}
.el-barra{height:6px;border-radius:3px;background:var(--panel-3);overflow:hidden}
.el-relleno{height:100%;border-radius:3px;background:var(--exito)}
.el-relleno.el-aviso{background:var(--calido)}.el-relleno.el-error{background:var(--peligro)}
.el-detalle{margin:0;font-size:12px;color:var(--tinta-2)}
.el-detalle summary{cursor:pointer}
.el-lista{list-style:none;margin:4px 0 0;padding:0}
.el-lista li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--linea)}
.el-lista li span{flex:none;color:var(--tinta-3);font-variant-numeric:tabular-nums}
.el-lista li[data-id]{cursor:pointer}
.el-sin li{color:var(--tinta)}.el-sin li::before{content:'';flex:none;width:6px;height:6px;margin:6px 0 0;border-radius:50%;background:var(--calido)}
.el-boton{align-self:flex-start;padding:6px 10px;border:1px solid var(--acento);border-radius:var(--r-chico);background:var(--acento-fondo);color:var(--acento-texto);font:inherit;cursor:pointer}
.el-vacio,.el-nota{color:var(--tinta-3)}
`;

/* ------------------------------------------------------------------ hoja del plano */

// Qué se dibuja en el plano eléctrico: la estructura, los generadores y tableros, y lo que consume.
export function filtroElectrico(analisis) {
  const conectados = new Set(analisis.fuentes.flatMap((f) => f.equipos));
  return (o) => catDe(o) === 'estructura' || esFuente(o) || potenciaDe(o) > 0 || conectados.has(String(o.id));
}

// Cables, marcas de los equipos y rótulos de cada fuente, encima de la planta.
export function dibujoElectrico(escena, an, { M, k }) {
  const porId = new Map(escena.objetos.map((o) => [String(o.id), o]));
  const ocupados = [];
  const libre = (x, y, w, h) => !ocupados.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
  let lineas = '';
  let puntas = '';
  let rotulos = '';
  let marcas = '';

  // Rótulo de cada generador o tablero arriba del símbolo: nombre y % de uso.
  for (const f of an.fuentes) {
    const o = porId.get(f.id);
    if (!o) continue;
    marcas += `<polygon points="${pts(esquinas(o).map(M))}" fill="none" stroke="${f.color}" stroke-width="0.45"/>`;
    const nombre = recortar(f.nombre, 1.9, 34);
    const pct = textoPorcentaje(f.porcentaje);
    const wN = anchoTexto(nombre, 1.9) + 2.4;
    const wP = anchoTexto(pct, 1.9) + 2.4;
    const c = M(f.pos);
    const x = c[0] - (wN + wP) / 2;
    const y = c[1] - (Math.max(o.dims[0], o.dims[1]) / 2) * k - 6;
    ocupados.push({ x, y, w: wN + wP, h: 4 });
    marcas += `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(wN + wP)}" height="4" rx="0.6" fill="#fff" stroke="${f.color}" stroke-width="0.3"/>`;
    marcas += `<rect x="${n2(x + wN)}" y="${n2(y)}" width="${n2(wP)}" height="4" rx="0.6" fill="${COLOR_ESTADO[f.estado]}"/>`;
    marcas += texto(x + 1.2, y + 2.05, nombre, { t: 1.9, peso: 700, color: TINTA, base: 'middle' });
    marcas += texto(x + wN + wP / 2, y + 2.05, pct, { t: 1.9, peso: 700, color: f.estado === 'aviso' ? '#1D1405' : '#fff', ancla: 'middle', base: 'middle' });
  }

  // Cables que salen del mismo lugar hacia la misma fuente (una torre de parlantes) van juntos.
  const grupos = new Map();
  for (const c of an.cables) {
    const clave = `${c.tipo}|${c.hasta}|${n2(c.puntos[0][0])},${n2(c.puntos[0][1])}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(c);
  }
  const ordenados = [...grupos.values()].sort((a, b) => (a[0].tipo === b[0].tipo ? 0 : a[0].tipo === 'alimentacion' ? -1 : 1));
  for (const grupo of ordenados) {
    const c = grupo[0];
    const p = c.puntos.map(M);
    const ancho = c.tipo === 'alimentacion' ? 0.6 : 0.28;
    lineas += `<polyline points="${pts(p)}" fill="none" stroke="${c.color}" stroke-width="${ancho}" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.9"/>`;
    if (c.tipo === 'equipo') puntas += `<circle cx="${n2(p[0][0])}" cy="${n2(p[0][1])}" r="0.6" fill="${c.color}"/>`;
    // Texto con el largo, sobre el tramo más largo y corrido si pisa otro rótulo.
    const largos = grupo.map((g) => g.largo).sort((a, b) => a - b);
    const s = largos.every((l) => l === largos[0]) ? (largos.length > 1 ? `${largos.length} × ${largos[0]} m` : `${largos[0]} m`) : `${largos.join(' + ')} m`;
    const t = 1.6;
    const w = anchoTexto(s, t) + 1.4;
    const h = t + 1;
    const tramos = [[p[0], p[1]], [p[1], p[2]]].sort((a, b) => Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) - Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]));
    const opciones = [];
    for (const [A, B] of tramos) for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) opciones.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]);
    opciones.push([p[0][0] + w / 2 + 1, p[0][1] - h]);
    const q = opciones.find(([x, y]) => libre(x - w / 2, y - h / 2, w, h)) || opciones[0];
    ocupados.push({ x: q[0] - w / 2, y: q[1] - h / 2, w, h });
    rotulos += `<rect x="${n2(q[0] - w / 2)}" y="${n2(q[1] - h / 2)}" width="${n2(w)}" height="${n2(h)}" rx="0.4" fill="#fff" fill-opacity="0.92" stroke="${c.color}" stroke-width="0.12"/>`;
    rotulos += texto(q[0], q[1] + 0.05, s, { t, peso: 600, color: c.color, ancla: 'middle', base: 'middle' });
  }

  // Equipos sin conectar: un aro cálido punteado.
  for (const id of an.sinConectar) {
    const o = porId.get(id);
    if (!o) continue;
    const c = M(o.pos);
    const r = Math.max(1.6, (Math.max(o.dims[0], o.dims[1]) / 2) * k + 0.8);
    marcas += `<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${n2(r)}" fill="none" stroke="${COLOR_ESTADO.aviso}" stroke-width="0.4" stroke-dasharray="1 0.6"/>`;
  }
  return lineas + puntas + rotulos + marcas;
}

// Reparte filas en una o varias columnas de la hoja. Cada fila: { h, dib(x, y, w), titulo }.
function maquetar(regiones, filas, nota) {
  let s = '';
  if (!regiones.length) return s;
  const reserva = 4;
  const cabe = (h, ri, yy) => yy + h <= regiones[ri].y1 - (ri === regiones.length - 1 ? reserva : 0);
  let r = 0;
  let y = regiones[0].y0;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    // Un título no queda solo al pie de una columna.
    const h = f.titulo && filas[i + 1] ? f.h + filas[i + 1].h : f.h;
    while (r < regiones.length && !cabe(h, r, y)) {
      r++;
      if (r < regiones.length) y = regiones[r].y0;
    }
    if (r >= regiones.length) {
      const u = regiones.at(-1);
      s += texto(u.x + 4, u.y1 - 1.2, nota, { t: 1.7, color: GRIS });
      break;
    }
    s += f.dib(regiones[r].x, y, regiones[r].w);
    y += f.h;
  }
  return s;
}

export function columnaElectrica(escena, an, { col, banda, derX, derW, limite }) {
  const porId = new Map(escena.objetos.map((o) => [String(o.id), o]));
  const regiones = [];
  if (banda) {
    const anchoIzq = col.w - derW;
    const n = Math.max(1, Math.floor(anchoIzq / 60));
    for (let i = 0; i < n; i++) regiones.push({ x: col.x + (anchoIzq / n) * i, w: anchoIzq / n, y0: col.y + 3, y1: col.y + col.h - 4 });
    regiones.push({ x: derX, w: derW, y0: col.y + 3, y1: limite });
  } else regiones.push({ x: col.x, w: col.w, y0: col.y + 3, y1: limite });

  const filas = [];
  const titulo = (s, t = 2.4) => filas.push({ h: t + 3.6, titulo: true, dib: (x, y) => texto(x + 4, y + t + 1.4, s, { t, peso: 700 }) });
  const dato = (a, b) =>
    filas.push({ h: 3.6, dib: (x, y, w) => texto(x + 4, y + 2.6, a, { t: 2, color: GRIS }) + texto(x + w - 4, y + 2.6, b, { t: 2, peso: 700, ancla: 'end' }) });
  const espacio = (h) => filas.push({ h, dib: () => '' });

  titulo('Energía', 3);
  dato('Consumo total', textoPotencia(an.totalPotencia));
  dato('Generadores', an.capacidadGeneradores ? textoPotencia(an.capacidadGeneradores) : 'ninguno');
  dato('Cable en total', `${fm(an.totalCable, 0)} m`);
  espacio(2);

  titulo('Generadores y tableros');
  if (!an.fuentes.length) filas.push({ h: 4, dib: (x, y) => texto(x + 4, y + 2.8, 'No hay generadores ni tableros.', { t: 1.9, color: GRIS }) });
  for (const f of an.fuentes) {
    filas.push({
      h: 13.8,
      dib: (x, y, w) => {
        const ind = Math.min(f.nivel, 3) * 3;
        const x0 = x + 4 + ind;
        const ancho = w - 8 - ind;
        const pct = textoPorcentaje(f.porcentaje);
        const relleno = f.porcentaje === null ? 0 : (Math.max(0, Math.min(100, f.porcentaje)) / 100) * ancho;
        const fase = f.fases === 3 ? ' por fase' : '';
        let s = `<rect x="${n2(x0)}" y="${n2(y + 0.7)}" width="2.4" height="2.4" rx="0.5" fill="${f.color}"/>`;
        s += texto(x0 + 3.4, y + 2.75, recortar(f.nombre, 2.1, ancho - anchoTexto(pct, 2.1) - 6), { t: 2.1, peso: 700 });
        s += texto(x0 + ancho, y + 2.75, pct, { t: 2.1, peso: 700, color: TINTA_ESTADO[f.estado], ancla: 'end' });
        s += `<rect x="${n2(x0)}" y="${n2(y + 4.2)}" width="${n2(ancho)}" height="1.5" rx="0.5" fill="#ececec"/>`;
        if (relleno > 0) s += `<rect x="${n2(x0)}" y="${n2(y + 4.2)}" width="${n2(relleno)}" height="1.5" rx="0.5" fill="${COLOR_ESTADO[f.estado]}"/>`;
        const cap = f.capacidad > 0 ? `${textoPotencia(f.capacidad)}${f.capacidadTipica ? ' (típica)' : ''}` : 'sin capacidad';
        s += texto(x0, y + 8.4, recortar(`${textoPotencia(f.potencia)} de ${cap} · ${fm(f.corriente, 1)} A${fase}`, 1.75, ancho), { t: 1.75, color: TINTA });
        const extra = [`${f.fases === 3 ? 'Trifásico' : 'Monofásico'} ${fm(f.tension, 0)} V`];
        if (f.padre) extra.push(`toma de ${nombreDe(porId.get(f.padre))}`);
        else if (f.tipo === 'tablero') extra.push(f.enCiclo ? 'alimentación en círculo' : 'sin generador');
        if (f.hijos.length) extra.push(`alimenta ${plural(f.hijos.length, 'tablero', 'tableros')}`);
        if (f.equipos.length || !f.hijos.length) extra.push(plural(f.equipos.length, 'equipo', 'equipos'));
        s += texto(x0, y + 11.2, recortar(extra.join(' · '), 1.6, ancho), { t: 1.6, color: GRIS });
        return s;
      },
    });
  }

  // Referencias antes que los cables: sin ellas el dibujo no se entiende (los cables también están en la app).
  espacio(1.5);
  titulo('Referencias');
  const ref = (muestra, s) => filas.push({ h: 3.6, dib: (x, y, w) => muestra(x + 4, y + 1.8) + texto(x + 13, y + 2.5, recortar(s, 1.8, w - 17), { t: 1.8 }) });
  ref((x, y) => linea([x, y], [x + 7, y], { w: 0.6, color: COLORES_FUENTE[0] }), 'Alimentación de un tablero');
  ref((x, y) => linea([x, y], [x + 7, y], { w: 0.28, color: COLORES_FUENTE[0] }) + `<circle cx="${n2(x)}" cy="${n2(y)}" r="0.6" fill="${COLORES_FUENTE[0]}"/>`, 'Cable de tablero a equipo');
  ref((x, y) => `<circle cx="${n2(x + 3.5)}" cy="${n2(y)}" r="1.4" fill="none" stroke="${COLOR_ESTADO.aviso}" stroke-width="0.4" stroke-dasharray="1 0.6"/>`, 'Equipo sin conectar');
  filas.push({ h: 5.8, nota: `Cables por el piso, con ${SOBRA_PUNTA} m de sobra en cada punta y redondeados al largo comercial.` });


  // Cables: dos largos por renglón para que entren en la columna.
  const cables = listaCables(an);
  for (const [tipo, nombre] of [['equipo', 'Cables a equipos'], ['alimentacion', 'Cables de alimentación']]) {
    const lista = cables.filter((c) => c.tipo === tipo);
    if (!lista.length) continue;
    espacio(1.5);
    titulo(nombre);
    for (let i = 0; i < lista.length; i += 2) {
      const par = lista.slice(i, i + 2);
      filas.push({
        h: 3.4,
        dib: (x, y, w) =>
          par
            .map((c, j) => {
              const mitad = (w - 8) / 2;
              const xi = x + 4 + j * mitad;
              return texto(xi, y + 2.5, `${c.largo} m`, { t: 1.9 }) + texto(xi + mitad - (j ? 0 : 4), y + 2.5, `× ${c.cantidad}`, { t: 1.9, peso: 700, ancla: 'end' });
            })
            .join(''),
      });
    }
  }

  if (an.problemas.length) {
    espacio(1.5);
    titulo('Avisos');
    for (const p of an.problemas) filas.push({ h: 0, aviso: p }); // se arma abajo, con el ancho de la columna
  }

  if (an.sinConectar.length) {
    espacio(1.5);
    titulo(`Sin conectar (${an.sinConectar.length})`);
    for (const id of an.sinConectar) {
      const o = porId.get(id);
      filas.push({ h: 3.2, dib: (x, y, w) => texto(x + 4, y + 2.3, recortar(nombreDe(o), 1.8, w - 20), { t: 1.8 }) + texto(x + w - 4, y + 2.3, textoPotencia(potenciaDe(o)), { t: 1.8, color: GRIS, ancla: 'end' }) });
    }
  }

  // Las filas de texto largo (avisos y notas) se arman con el ancho de la columna más angosta.
  const anchoMin = Math.min(...regiones.map((r) => r.w));
  for (const f of filas) {
    if (f.aviso) {
      const lineas = envolver(f.aviso.texto, 1.7, anchoMin - 12, 4);
      f.h = lineas.length * 2.5 + 1.2;
      f.dib = (x, y) =>
        `<circle cx="${n2(x + 5)}" cy="${n2(y + 1.55)}" r="0.75" fill="${COLOR_ESTADO[f.aviso.nivel]}"/>` +
        lineas.map((l, i) => texto(x + 7.5, y + 2.2 + i * 2.5, l, { t: 1.7, color: TINTA })).join('');
    } else if (f.nota) {
      const lineas = envolver(f.nota, 1.6, anchoMin - 8, 3);
      f.h = lineas.length * 2.4 + 1;
      f.dib = (x, y) => lineas.map((l, i) => texto(x + 4, y + 2.2 + i * 2.4, l, { t: 1.6, color: GRIS })).join('');
    }
  }
  return maquetar(regiones, filas, 'Sigue en el panel Energía de la app.');
}

// Hoja del plano eléctrico para generarHojas(): { paginas: 1, crear(numeroHoja, totalHojas) => [svg] }.
export function hojaElectrica(escena, comp, op) {
  const opciones = op || opcionesHoja(escena);
  return {
    paginas: 1,
    crear(numeroHoja, totalHojas) {
      const an = analizarElectrico(escena);
      return [
        hojaPlanta(escena, comp || computar(escena), opciones, totalHojas, {
          titulo: 'Plano eléctrico',
          numeroHoja,
          filtro: filtroElectrico(an),
          numeros: false,
          encima: (ctx) => dibujoElectrico(escena, an, ctx),
          columna: (ctx) => columnaElectrica(escena, an, ctx),
        }),
      ];
    },
  };
}
