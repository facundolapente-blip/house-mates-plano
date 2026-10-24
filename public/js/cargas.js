// Cargas en estructuras: cuánto peso cuelga de cada truss y si aguanta.
//
// Un truss horizontal (el alto es su medida más chica) puede tener "capacidad": los kg que aguanta repartidos a
// lo largo, como en las tablas del fabricante (sin contar su propio peso). De él cuelgan luces, PAR, pantallas,
// parlantes, subs, telas y otros truss (secundarios):
//   - con "colgadoDe": id del truss (o de otra estructura), o false para decir que no cuelga de nada;
//   - si no, se deduce: la parte de arriba del objeto queda hasta 0,8 m debajo del truss (o el objeto está a la
//     altura del truss o encima) y su centro cae sobre el truss (con 0,4 m de margen a cada lado).
// Peso: el del objeto o el típico de su tipo. El truss pesa por metro ("peso" en kg/m; el del tipo, 6 kg/m).
//
// No usa el motor 3D ni el navegador: se puede probar con Node.

import { defDatos } from './tipos-datos.js';
import { aLocal, enRect } from './geometria.js';
import { fm, esc, numero } from './formato.js';

export const COLGABLES = new Set(['luz', 'par', 'beam', 'estrobo', 'barra_led', 'pantalla', 'parlante', 'sub', 'truss', 'tela']);
export const PESO_TRUSS_METRO = 6; // kg/m si el tipo no dice otra cosa
export const BANDA = 0.8; // m debajo del truss donde se busca lo que cuelga
export const MARGEN_PLANTA = 0.4; // m de margen alrededor del truss en planta
export const MARGEN = 80; // % de uso a partir del cual se avisa

/* ------------------------------------------------------------------ datos de cada objeto */

const elevDe = (o) => Number(o.elev) || 0;
const altoDe = (o) => Number(o.dims?.[2]) || 0;
// Id escrito en un campo ("tablero", "alimenta", "colgadoDe"). formato.js los pasa a texto, así que false
// llega como "false": vale lo mismo que vacío.
const idTexto = (v) => {
  const s = v === undefined || v === null || v === false ? '' : String(v).trim();
  return s === 'false' || s === 'null' || s === 'undefined' ? '' : s;
};
const nombreDe = (o) => String(o.nombre || defDatos(o).nombre || o.id);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const listaNombres = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`);

export const esTruss = (o) => o?.tipo === 'truss';
export const trussHorizontal = (o) => esTruss(o) && o.dims[2] <= Math.min(o.dims[0], o.dims[1]) + 1e-9;
export const largoTruss = (o) => Math.max(...o.dims);

// "colgadoDe: false" (o "ninguno") dice que el objeto no cuelga de nada, aunque la altura coincida.
const noCuelga = (o) => o.colgadoDe === false || ['false', 'ninguno'].includes(String(o.colgadoDe ?? '').trim().toLowerCase());

export function pesoPorMetro(o) {
  const n = numero(o.peso);
  if (n !== null && n >= 0) return n;
  const t = Number(defDatos(o).peso);
  return t > 0 ? t : PESO_TRUSS_METRO;
}

// Peso de un objeto (kg). Un truss: largo × kg por metro.
export function pesoDe(o) {
  if (esTruss(o)) return largoTruss(o) * pesoPorMetro(o);
  const n = numero(o.peso);
  if (n !== null) return Math.max(0, n);
  return Math.max(0, Number(defDatos(o).peso) || 0);
}

// Lo que aguanta una estructura (kg repartidos), o null si no está cargado. No se supone ningún valor típico.
export function capacidadCarga(o) {
  const n = numero(o.capacidad);
  return n !== null && n > 0 ? n : null;
}

export function textoPeso(kg) {
  const v = Math.round((Number(kg) || 0) * 10) / 10;
  return `${fm(v, v % 1 ? 1 : 0)} kg`;
}

export const textoPorcentaje = (p) => (p === null || p === undefined || !Number.isFinite(p) ? 'sin dato' : `${fm(p, 0)} %`);

// ¿Está apoyado sobre otro objeto (un parlante sobre un sub, una luz sobre una tarima)? Entonces no cuelga.
function apoyado(it, objetos) {
  const e = elevDe(it);
  return objetos.some(
    (o) =>
      o !== it &&
      !esTruss(o) &&
      o.tipo !== 'arbol' &&
      !defDatos(o).piso &&
      altoDe(o) > 0 &&
      Math.abs(elevDe(o) + altoDe(o) - e) <= 0.05 &&
      enRect(o, it.pos[0], it.pos[1])
  );
}

// Qué tan bien encaja "it" colgado del truss "t": null si no cuelga; si cuelga, menos es más cerca.
function encaje(it, t) {
  const [lx, ly] = aLocal(t, it.pos);
  if (Math.abs(lx) > t.dims[0] / 2 + MARGEN_PLANTA || Math.abs(ly) > t.dims[1] / 2 + MARGEN_PLANTA) return null;
  const abajo = elevDe(t);
  const arriba = abajo + altoDe(t);
  const e = elevDe(it);
  const tope = e + altoDe(it);
  const plano = 0.01 * Math.hypot(lx, ly);
  if (esTruss(it)) {
    // Truss secundario: entero debajo del principal.
    if (tope > abajo + 0.05 || tope < abajo - BANDA) return null;
    return abajo - tope + plano;
  }
  const colgado = tope >= abajo - BANDA && tope <= arriba + 0.05;
  const encima = e >= abajo - BANDA && e <= arriba + BANDA;
  if (!colgado && !encima) return null;
  return Math.min(Math.abs(tope - abajo), Math.abs(e - arriba)) + plano;
}

/* ------------------------------------------------------------------ análisis */

export function analizarCargas(escena) {
  const objetos = (Array.isArray(escena?.objetos) ? escena.objetos : []).filter((o) => o && Array.isArray(o.pos) && Array.isArray(o.dims));
  const porId = new Map(objetos.map((o) => [String(o.id), o]));
  const horizontales = objetos.filter(trussHorizontal);
  const problemas = [];
  const avisar = (nivel, t, ids = []) => problemas.push({ nivel, texto: t, ids });

  // De qué cuelga cada objeto.
  const colgadoDe = new Map(); // id del objeto → id de la estructura
  const deducido = new Set();
  const destinos = new Set();
  for (const it of objetos) {
    const id = String(it.id);
    if (noCuelga(it)) continue;
    const c = idTexto(it.colgadoDe);
    if (c) {
      if (c === id) avisar('aviso', `${nombreDe(it)} dice que cuelga de sí mismo. Elegí de qué estructura cuelga.`, [id]);
      else if (porId.has(c)) {
        colgadoDe.set(id, c);
        destinos.add(c);
        continue;
      } else avisar('aviso', `${nombreDe(it)} cuelga de "${c}", que no está en la escena. Elegí otra estructura.`, [id]);
    }
    if (!COLGABLES.has(it.tipo)) continue;
    if (esTruss(it) && !trussHorizontal(it)) continue;
    if (elevDe(it) <= 0.05 && it.tipo !== 'tela') continue;
    if (apoyado(it, objetos)) continue;
    let mejor = null;
    let puntaje = Infinity;
    for (const t of horizontales) {
      if (t === it) continue;
      const p = encaje(it, t);
      if (p !== null && p < puntaje) {
        puntaje = p;
        mejor = t;
      }
    }
    if (mejor) {
      colgadoDe.set(id, String(mejor.id));
      deducido.add(id);
    } else if ((it.tipo === 'luz' || it.tipo === 'beam' || it.tipo === 'estrobo') && elevDe(it) >= 1.5) {
      avisar('aviso', `${nombreDe(it)} está a ${fm(elevDe(it))} m y no encontré de qué truss cuelga. Si va en otra estructura, elegila en "Colgado de".`, [id]);
    }
  }

  // Estructuras: los truss horizontales, los verticales que tienen capacidad o algo colgado, y cualquier
  // objeto elegido en "colgadoDe".
  const esEstructura = (o) => trussHorizontal(o) || destinos.has(String(o.id)) || (esTruss(o) && capacidadCarga(o) !== null);
  const estructurasObj = objetos.filter(esEstructura);
  const esEstr = new Set(estructurasObj.map((o) => String(o.id)));

  // Ciclos con "colgadoDe" entre estructuras (A cuelga de B y B de A): se avisa y se cortan.
  const marca = new Map();
  for (const s of estructurasObj) {
    const camino = [];
    let n = String(s.id);
    while (n && esEstr.has(n) && !marca.has(n)) {
      marca.set(n, 1);
      camino.push(n);
      n = colgadoDe.get(n);
    }
    if (n && marca.get(n) === 1) {
      const ciclo = camino.slice(camino.indexOf(n));
      avisar('error', `${listaNombres(ciclo.map((c) => nombreDe(porId.get(c))))} cuelgan uno del otro en círculo. Revisá de qué cuelga cada uno.`, ciclo);
      for (const c of ciclo) colgadoDe.delete(c);
    }
    camino.forEach((c) => marca.set(c, 2));
  }

  const directos = new Map(estructurasObj.map((o) => [String(o.id), []]));
  for (const [item, s] of colgadoDe) if (directos.has(s)) directos.get(s).push(item);

  // Peso que cuelga de cada estructura: lo directo más las estructuras que cuelgan de ella con su carga.
  const totales = new Map();
  // Peso propio: el truss por metro; otra estructura (una pantalla de la que cuelga algo), su peso.
  const propio = (o) => pesoDe(o);
  const colgado = (id) => directos.get(id).reduce((s, c) => s + (esEstr.has(c) ? total(c) : pesoDe(porId.get(c))), 0);
  const total = (id) => {
    if (!totales.has(id)) totales.set(id, propio(porId.get(id)) + colgado(id));
    return totales.get(id);
  };

  const estructuras = [];
  const visitar = (id, nivel) => {
    const o = porId.get(id);
    const pesoPropio = propio(o);
    const pesoColgado = colgado(id);
    const capacidad = capacidadCarga(o);
    const porcentaje = capacidad ? (pesoColgado / capacidad) * 100 : null;
    let estado = 'ok';
    if (porcentaje !== null && porcentaje > 100) estado = 'error';
    else if ((porcentaje !== null && porcentaje > MARGEN) || (capacidad === null && directos.get(id).length)) estado = 'aviso';
    const lista = directos.get(id);
    const e = {
      id,
      nombre: nombreDe(o),
      tipo: o.tipo,
      vertical: esTruss(o) && !trussHorizontal(o),
      largo: esTruss(o) ? largoTruss(o) : Math.max(o.dims[0], o.dims[1]),
      pesoMetro: esTruss(o) ? pesoPorMetro(o) : null,
      pesoPropio,
      pesoColgado,
      total: pesoPropio + pesoColgado,
      capacidad,
      porcentaje,
      porcentajeTotal: capacidad ? ((pesoPropio + pesoColgado) / capacidad) * 100 : null,
      colgados: [...lista],
      secundarias: lista.filter((c) => esEstr.has(c)),
      deducidos: lista.filter((c) => deducido.has(c)),
      padre: colgadoDe.get(id) && esEstr.has(colgadoDe.get(id)) ? colgadoDe.get(id) : null,
      nivel,
      estado,
      ok: estado === 'ok',
      pos: [...o.pos],
      elev: elevDe(o),
    };
    estructuras.push(e);
    if (estado === 'error') {
      avisar('error', `${e.nombre}: le cuelgan ${textoPeso(pesoColgado)} y aguanta ${textoPeso(capacidad)} (${fm(porcentaje, 0)} %). Sacá peso o usá un truss que aguante más.`, [id]);
    } else if (porcentaje !== null && porcentaje > MARGEN) {
      avisar('aviso', `${e.nombre} está al ${fm(porcentaje, 0)} % de lo que aguanta (${textoPeso(pesoColgado)} de ${textoPeso(capacidad)}): queda poco margen.`, [id]);
    } else if (capacidad === null && lista.length) {
      avisar('aviso', pesoColgado > 0 ? `${e.nombre}: le cuelgan ${textoPeso(pesoColgado)}. Cargá cuánto aguanta (capacidad en kg) para saber si alcanza.` : `${e.nombre}: cargá cuánto aguanta (capacidad en kg) y el peso de lo que le cuelga.`, [id]);
    }
    for (const c of lista) {
      const item = porId.get(c);
      if (esEstr.has(c)) continue;
      const p = pesoDe(item);
      if (p <= 0) avisar('aviso', `${nombreDe(item)} cuelga de ${e.nombre} pero no tiene peso cargado.`, [c]);
      else if (capacidad && p > capacidad / 2) {
        avisar('aviso', `${nombreDe(item)} pesa ${textoPeso(p)}, más de la mitad de lo que aguanta ${e.nombre}. La capacidad es para peso repartido: con el peso en un punto aguanta menos.`, [c]);
      }
    }
    for (const c of lista) if (esEstr.has(c)) visitar(c, nivel + 1);
  };
  for (const s of estructurasObj) {
    const p = colgadoDe.get(String(s.id));
    if (!p || !esEstr.has(p)) visitar(String(s.id), 0);
  }
  // Las verticales sin capacidad ni carga no dicen nada: se sacan del listado.
  const visibles = estructuras.filter((e) => !(e.vertical && e.capacidad === null && !e.colgados.length));

  problemas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'error' ? -1 : 1));
  const raices = visibles.filter((e) => !e.padre);
  return {
    estructuras: visibles,
    asignaciones: Object.fromEntries(colgadoDe),
    deducidos: [...deducido],
    // Todo lo que cuelga menos los truss (su peso va en totalPeso).
    totalColgado: [...colgadoDe.keys()].filter((id) => !esTruss(porId.get(id))).reduce((s, id) => s + pesoDe(porId.get(id)), 0),
    totalPeso: raices.reduce((s, e) => s + e.total, 0),
    avisos: problemas.map((p) => p.texto),
    problemas,
  };
}

/* ------------------------------------------------------------------ panel lateral */

export function htmlCargas(escena, analisis) {
  const an = analisis || analizarCargas(escena);
  const porId = new Map((escena?.objetos || []).map((o) => [String(o.id), o]));
  const nombre = (id) => (porId.get(id) ? nombreDe(porId.get(id)) : id);
  let h = '<section class="ca-panel">';
  if (!an.estructuras.length) {
    h += '<p class="ca-vacio">No hay truss en la escena. Cuando agregues uno, acá vas a ver cuánto peso le cuelga y si aguanta.</p>';
    if (an.problemas.length) {
      h += '<ul class="ca-avisos">';
      for (const p of an.problemas) h += `<li class="ca-${p.nivel}" data-ids="${esc(p.ids.join(' '))}">${esc(p.texto)}</li>`;
      h += '</ul>';
    }
    return h + '</section>';
  }

  h += '<div class="ca-resumen">';
  h += `<div class="ca-dato"><span>Colgado</span><strong>${esc(textoPeso(an.totalColgado))}</strong></div>`;
  h += `<div class="ca-dato"><span>Con las estructuras</span><strong>${esc(textoPeso(an.totalPeso))}</strong></div>`;
  h += '</div>';

  if (an.problemas.length) {
    h += '<ul class="ca-avisos">';
    for (const p of an.problemas) h += `<li class="ca-${p.nivel}" data-ids="${esc(p.ids.join(' '))}">${esc(p.texto)}</li>`;
    h += '</ul>';
  }

  for (const e of an.estructuras) {
    const ancho = e.porcentaje === null ? 0 : Math.max(0, Math.min(100, e.porcentaje));
    h += `<article class="ca-estructura ca-${e.estado}" data-id="${esc(e.id)}" data-nivel="${Math.min(e.nivel, 3)}">`;
    h += `<header class="ca-cab"><strong>${esc(e.nombre)}</strong><span class="ca-pct">${esc(textoPorcentaje(e.porcentaje))}</span></header>`;
    h += `<div class="ca-barra"><div class="ca-relleno ca-${e.estado}" style="width:${Math.round(ancho * 100) / 100}%"></div></div>`;
    if (e.capacidad) h += `<p class="ca-detalle">Cuelgan ${esc(textoPeso(e.pesoColgado))} de ${esc(textoPeso(e.capacidad))} que aguanta.</p>`;
    else if (e.colgados.length) h += `<p class="ca-detalle">Cuelgan ${esc(textoPeso(e.pesoColgado))}. Cargá cuánto aguanta (kg) para saber si alcanza.</p>`;
    else h += '<p class="ca-detalle">No le cuelga nada.</p>';
    const partes = [];
    if (e.pesoMetro !== null) partes.push(`${e.vertical ? 'Torre' : 'Truss'} de ${fm(e.largo, e.largo % 1 ? 1 : 0)} m: pesa ${textoPeso(e.pesoPropio)}`);
    if (e.padre) partes.push(`cuelga de ${nombre(e.padre)}`);
    if (e.pesoPropio > 0 || e.padre) partes.push(`en total ${textoPeso(e.total)}`);
    if (partes.length) h += `<p class="ca-detalle">${esc(partes.join(' · '))}</p>`;
    if (e.colgados.length) {
      h += `<details class="ca-detalle"><summary>${esc(plural(e.colgados.length, 'cosa colgada', 'cosas colgadas'))}</summary><ul class="ca-lista">`;
      for (const id of e.colgados) {
        const o = porId.get(id);
        const sec = an.estructuras.find((x) => x.id === id);
        const kg = sec ? sec.total : o ? pesoDe(o) : 0;
        const marca = e.deducidos.includes(id) ? ' <small>por la altura</small>' : '';
        h += `<li data-id="${esc(id)}">${esc(nombre(id))}${marca}<span>${esc(textoPeso(kg))}</span></li>`;
      }
      h += '</ul></details>';
    }
    h += '</article>';
  }
  h += '<p class="ca-detalle ca-nota">La capacidad es el peso repartido que aguanta cada tramo según el fabricante, sin contar su propio peso. Con el peso en un solo punto aguanta menos. Es una estimación para planificar: la confirma quien hace el rigging.</p>';
  return h + '</section>';
}

// Estilos sugeridos para el panel (usan las variables de estilos.css).
export const CSS_CARGAS = `
.ca-panel{display:flex;flex-direction:column;gap:8px;font-size:13px}
.ca-resumen{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.ca-dato{display:flex;flex-direction:column;gap:2px;padding:6px 8px;border:1px solid var(--linea);border-radius:var(--r-chico);background:var(--panel-2)}
.ca-dato span{font-size:11px;color:var(--tinta-3)}
.ca-dato strong{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.ca-avisos{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.ca-avisos li{padding:6px 8px;border-left:3px solid var(--calido);border-radius:var(--r-chico);background:var(--panel-2);cursor:pointer}
.ca-avisos li.ca-error{border-left-color:var(--peligro)}
.ca-estructura{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid var(--linea);border-radius:var(--r);background:var(--panel-2);cursor:pointer}
.ca-estructura[data-nivel="1"]{margin-left:12px}.ca-estructura[data-nivel="2"]{margin-left:24px}.ca-estructura[data-nivel="3"]{margin-left:36px}
.ca-estructura.ca-aviso{border-color:var(--calido)}.ca-estructura.ca-error{border-color:var(--peligro)}
.ca-cab{display:flex;align-items:center;gap:6px}
.ca-cab strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.ca-pct{font-weight:600;font-variant-numeric:tabular-nums}
.ca-estructura.ca-ok .ca-pct{color:var(--exito)}.ca-estructura.ca-aviso .ca-pct{color:var(--calido)}.ca-estructura.ca-error .ca-pct{color:var(--peligro)}
.ca-barra{height:6px;border-radius:3px;background:var(--panel-3);overflow:hidden}
.ca-relleno{height:100%;border-radius:3px;background:var(--exito)}
.ca-relleno.ca-aviso{background:var(--calido)}.ca-relleno.ca-error{background:var(--peligro)}
.ca-detalle{margin:0;font-size:12px;color:var(--tinta-2)}
.ca-detalle summary{cursor:pointer}
.ca-lista{list-style:none;margin:4px 0 0;padding:0}
.ca-lista li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--linea);cursor:pointer}
.ca-lista li small{margin-left:4px;color:var(--tinta-3)}
.ca-lista li span{flex:none;margin-left:auto;color:var(--tinta-3);font-variant-numeric:tabular-nums}
.ca-vacio,.ca-nota{color:var(--tinta-3)}
`;
