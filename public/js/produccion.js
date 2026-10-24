// Producción: cronograma de armado y desarme, proveedores, staff, presupuesto y comparación de variantes.
// Acá está la lógica y el HTML de cada pestaña de la vista "Producción" (app.js la monta y le pasa los
// cambios) y las hojas del PDF por proveedor y de carga y descarga. Sin DOM ni three: se prueba con Node.
//
// Cómo se edita desde la interfaz:
//   - Cada control editable lleva data-prod="<colección>:<id>:<campo>" y app.js, en el evento "change",
//     llama a aplicarEdicion(escena, elemento). Colecciones: proveedores, tareas, extras, grupo (precio de
//     un ítem del listado, escribe en todos sus objetos), puestos (objetos de tipo puesto) y escena
//     (escena:proyecto:inicio, escena:presupuesto:moneda, escena:servicios:personasPorSeguridad…).
//   - Cada botón lleva data-prod-accion="..." y app.js llama a aplicarAccion(escena, accion, { seleccion }).
//   - Las pestañas llevan data-prod-pestana, la barra de tiempo data-prod-momento y la elección de la otra
//     escena para comparar data-prod-comparar.
// Fechas y horas: 'AAAA-MM-DDTHH:MM', hora local, sin zona horaria (igual que en el resto de la escena).

import { computar, incluido, nombreCategoria } from './computo.js';
import { CATEGORIAS, ROLES_STAFF, catDe, defDatos } from './tipos-datos.js';
import { fm, esc, numero, slugificar } from './formato.js';
import { esquinas, puntosMundo, esPoligono, superficieDe } from './geometria.js';
import { lineaLocal, largoDe, modulosVallado, USOS_CAMINO } from './predio.js';
import { hojaPlanta, opcionesHoja, texto, linea, pts, n2, recortar, envolver, anchoTexto, TINTA, GRIS, ACENTO } from './plano2d.js';
import { capacidadDe } from './seguridad.js';

export const PESTANAS = [
  ['cronograma', 'Cronograma'],
  ['proveedores', 'Proveedores'],
  ['staff', 'Staff'],
  ['presupuesto', 'Presupuesto'],
  ['comparar', 'Comparar'],
];

/* ================================================================== utilidades */

const txt = (v) => (v === undefined || v === null ? '' : String(v));
// Para comparar nombres escritos a mano: sin tildes, sin mayúsculas y sin espacios de más.
export const normalizar = (s) =>
  txt(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);
const objetosDe = (e) => lista(e?.objetos);
export const proveedoresDe = (e) => lista(e?.proveedores);
export const tareasDe = (e) => lista(e?.cronograma?.tareas);
export const extrasDe = (e) => lista(e?.presupuesto?.extras);
const idsDe = (t) => (Array.isArray(t?.ids) ? t.ids.map(String) : []);
const r2 = (v) => Math.round(v * 100) / 100;
const plural = (n, uno, varios = uno + 's') => `${fm(n, Number.isInteger(n) ? 0 : 1)} ${n === 1 ? uno : varios}`;
const buscar = (items, id) => items.find((x) => String(x.id) === String(id));

// El cómputo necesita áreas y objetos: con una escena escrita a mano que no los tenga, no se cae.
const calcular = (e) => computar(Array.isArray(e?.areas) && Array.isArray(e?.objetos) ? e : { ...e, areas: lista(e?.areas), objetos: objetosDe(e) });

function asegurarLista(padre, clave) {
  if (!Array.isArray(padre[clave])) padre[clave] = [];
  return padre[clave];
}
function asegurarObjeto(padre, clave) {
  const v = padre[clave];
  if (!v || typeof v !== 'object' || Array.isArray(v)) padre[clave] = {};
  return padre[clave];
}
const asegurarProveedores = (e) => asegurarLista(e, 'proveedores');
const asegurarTareas = (e) => asegurarLista(asegurarObjeto(e, 'cronograma'), 'tareas');
const asegurarExtras = (e) => asegurarLista(asegurarObjeto(e, 'presupuesto'), 'extras');

// Id corto y legible: p1, p2… t1, t2… (el siguiente al número más alto que haya).
function idNuevo(items, prefijo) {
  const usados = new Set(items.map((x) => String(x?.id)));
  const re = new RegExp(`^${prefijo}(\\d+)$`);
  let n = 1 + items.reduce((m, x) => {
    const r = re.exec(String(x?.id ?? ''));
    return r ? Math.max(m, Number(r[1])) : m;
  }, 0);
  while (usados.has(prefijo + n)) n++;
  return prefijo + n;
}

// Cambia un texto solo si es distinto. Vacío y "sin el campo" cuentan igual.
function ponerTexto(obj, campo, v) {
  if (txt(obj[campo]) === v) return false;
  obj[campo] = v;
  return true;
}

/* ================================================================== fechas y horas */

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const dos = (n) => String(n).padStart(2, '0');

// Minutos desde 1970 contando la hora "de reloj" (sin zona horaria): sirve para restar, ordenar y comparar.
export function aMinutos(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(txt(v).trim());
  if (!m) return null;
  const [a, me, d, h, mi] = m.slice(1).map(Number);
  if (me < 1 || me > 12 || d < 1 || h > 23 || mi > 59) return null;
  const t = Date.UTC(a, me - 1, d, h, mi);
  return new Date(t).getUTCDate() === d ? t / 60000 : null;
}

export function deMinutos(min) {
  const f = new Date(Math.round(min) * 60000);
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}T${dos(f.getUTCHours())}:${dos(f.getUTCMinutes())}`;
}

// Fecha y hora de la compu ("ahora") en el formato de la escena.
export const textoDeFecha = (d = new Date()) =>
  `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;

// Día suelto: '2026-12-12' o '12/12/26' (como está escrito proyecto.fecha). Devuelve 'AAAA-MM-DD' o null.
export function leerDia(v) {
  const s = txt(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let r = null;
  if (m) r = `${m[1]}-${dos(Number(m[2]))}-${dos(Number(m[3]))}`;
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(s))) {
    r = `${m[3].length === 2 ? 2000 + Number(m[3]) : m[3]}-${dos(Number(m[2]))}-${dos(Number(m[1]))}`;
  }
  return r && aMinutos(`${r}T00:00`) !== null ? r : null;
}

const RE_SOLO_HORA = /^(\d{1,2})(?:[:h](\d{2}))? ?(?:h|hs)?$/;
const soloHora = (v) => RE_SOLO_HORA.test(txt(v).trim().toLowerCase());

// Fecha y hora escrita a mano: '2026-12-12T14:00' (lo que da un campo de fecha), '12/12/2026 14:00',
// '12/12 14:30' o solo '14:30' (toma el día de "base"). También el valor de la barra de tiempo (minutos).
export function leerFecha(v, base = '') {
  const s = txt(v).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (/^\d{7,}$/.test(s)) return deMinutos(Number(s));
  let a;
  let me;
  let d;
  let h = 0;
  let mi = 0;
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ](\d{1,2})(?::(\d{2}))?(?::\d{2}(?:\.\d+)?)?)?$/.exec(s))) {
    [a, me, d] = [m[1], m[2], m[3]].map(Number);
    if (m[4] !== undefined) [h, mi] = [Number(m[4]), Number(m[5] || 0)];
  } else if ((m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?:,? (\d{1,2})(?:[:h](\d{2}))? ?(?:h|hs)?)?$/.exec(s))) {
    d = Number(m[1]);
    me = Number(m[2]);
    const bd = leerDia(base);
    a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : bd ? Number(bd.slice(0, 4)) : new Date().getFullYear();
    if (m[4] !== undefined) [h, mi] = [Number(m[4]), Number(m[5] || 0)];
  } else if ((m = RE_SOLO_HORA.exec(s))) {
    const bd = leerDia(base);
    if (!bd) return null;
    [a, me, d] = bd.split('-').map(Number);
    [h, mi] = [Number(m[1]), Number(m[2] || 0)];
  } else return null;
  const r = `${String(a).padStart(4, '0')}-${dos(me)}-${dos(d)}T${dos(h)}:${dos(mi)}`;
  return aMinutos(r) === null ? null : r;
}

// Momento de "ahora" o de la barra de tiempo: una fecha de la compu, minutos o texto.
function aMomento(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : aMinutos(textoDeFecha(v));
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return aMinutos(leerFecha(v));
}

const valorFecha = (v) => {
  const m = aMinutos(v);
  return m === null ? '' : deMinutos(m);
};

const reloj = (min) => new Date(min * 60000);
export const hora = (min) => {
  const f = reloj(min);
  return `${dos(f.getUTCHours())}:${dos(f.getUTCMinutes())}`;
};
export const dia = (min) => {
  const f = reloj(min);
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()}/${f.getUTCMonth() + 1}`;
};
const diaLargo = (min) => {
  const f = reloj(min);
  return `${DIAS_LARGOS[f.getUTCDay()]} ${f.getUTCDate()}/${f.getUTCMonth() + 1}`;
};
const fechaCorta = (min) => {
  const f = reloj(min);
  return `${dos(f.getUTCDate())}/${dos(f.getUTCMonth() + 1)}/${f.getUTCFullYear()}`;
};
export const fechaHora = (min) => (min === null || min === undefined ? '—' : `${dia(min)} ${hora(min)}`);
const mismoDia = (a, b) => Math.floor(a / 1440) === Math.floor(b / 1440);

// "vie 12/12 14:00 a 17:00" o "vie 12/12 22:00 a sáb 13/12 06:00".
export function textoRango(ini, fin) {
  if (ini === null || fin === null || ini === undefined || fin === undefined) return '—';
  return mismoDia(ini, fin) ? `${dia(ini)} ${hora(ini)} a ${hora(fin)}` : `${fechaHora(ini)} a ${fechaHora(fin)}`;
}
// "14:00 a 17:00", con "(+1)" si termina al otro día.
const horasDe = (ini, fin) => `${hora(ini)} a ${hora(fin)}${mismoDia(ini, fin) ? '' : ` (+${Math.floor(fin / 1440) - Math.floor(ini / 1440)})`}`;
const horaDelDia = (m) => `${dos(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${dos((((m % 60) + 60) % 60))}`;

export function textoDuracion(min) {
  if (!Number.isFinite(min) || min < 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
const valorDuracion = (min) => `${Math.floor(min / 60)}:${dos(Math.round(min % 60))}`;

// Duración escrita a mano: '2' (horas), '1,5', '1:30', '90 min', '1 h 30'. Devuelve minutos o null.
export function leerDuracion(v) {
  const s = txt(v).trim().toLowerCase().replace(',', '.');
  let m;
  let min = null;
  if ((m = /^(\d+):(\d{1,2})$/.exec(s))) min = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d+(?:\.\d+)?) ?(?:h|hs|horas?)?$/.exec(s))) min = Number(m[1]) * 60;
  else if ((m = /^(\d+) ?(?:h|hs|horas?) ?(\d{1,2}) ?(?:m|min|minutos?)?$/.exec(s))) min = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d+) ?(?:m|min|minutos?)$/.exec(s))) min = Number(m[1]);
  if (min === null) return null;
  min = Math.round(min);
  return min > 0 && min <= 7 * 1440 ? min : null;
}

/* ================================================================== plata */

export const monedaDe = (e) => (e?.presupuesto?.moneda === 'USD' ? 'USD' : 'ARS');

// $ 1.250.000 (sin decimales si es redondo) o US$ 1.250,50.
export function fmDinero(n, moneda = 'ARS') {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = r2(Number(n));
  const dec = Number.isInteger(v) ? 0 : 2;
  const s = Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${v < 0 ? '-' : ''}${moneda === 'USD' ? 'US$' : '$'} ${s}`;
}
// Para un campo de texto: 1.250.000 (se vuelve a leer igual con leerMonto).
const valorMonto = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 }));

// Plata escrita a mano: '1.250.000', '1250000', '$ 1.250,50', '150k', '150 mil', '1,5 M'. null si no se entiende.
export function leerMonto(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? r2(v) : null;
  let s = txt(v).trim().toLowerCase().replace(/\s+/g, '');
  s = s.replace(/^(-?)(us\$|u\$s|usd|ars|\$)/, '$1').replace(/\$/g, '');
  if (!s) return null;
  let mult = 1;
  const suf = /^(.*?)(millones|millón|millon|mil|k|m)$/.exec(s);
  if (suf) {
    s = suf[1];
    mult = suf[2] === 'k' || suf[2] === 'mil' ? 1000 : 1e6;
  }
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+(,\d+)?$/.test(s)) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s) * mult;
  return Number.isFinite(n) ? r2(n) : null;
}

/* ================================================================== CSV */

const celda = (v) => {
  const s = txt(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// Punto y coma, coma decimal y BOM: Excel en español lo abre directo.
const armarCsv = (filas) => '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
const numCsv = (n, dec = 2) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '' : String(Math.round(Number(n) * 10 ** dec) / 10 ** dec).replace('.', ','));

/* ================================================================== HTML: piezas comunes */

const atributos = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== '')
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join('');

function campo(prod, valor, { tipo = 'text', clase = '', ...extra } = {}) {
  return `<input type="${tipo}" class="pr-campo${clase ? ' ' + clase : ''}" data-prod="${esc(prod)}" value="${esc(valor)}"${atributos(extra)}>`;
}
function selector(prod, valor, opciones, { clase = '', ...extra } = {}) {
  const ops = opciones.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(valor) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<select class="pr-campo${clase ? ' ' + clase : ''}" data-prod="${esc(prod)}"${atributos(extra)}>${ops}</select>`;
}
const areaTexto = (prod, valor, extra = {}) => `<textarea class="pr-campo pr-campo-notas" data-prod="${esc(prod)}"${atributos(extra)}>${esc(valor)}</textarea>`;
const casilla = (prod, marcado, etiqueta) => `<input type="checkbox" class="pr-check" data-prod="${esc(prod)}"${marcado ? ' checked' : ''} aria-label="${esc(etiqueta)}">`;
function boton(accion, rotulo, { clase = '', titulo = '' } = {}) {
  const t = titulo ? ` title="${esc(titulo)}"` : '';
  return `<button type="button" class="pr-boton${clase ? ' ' + clase : ''}" data-prod-accion="${esc(accion)}"${t}>${esc(rotulo)}</button>`;
}
const kpis = (filas) => `<dl class="pr-kpis">${filas.map(([k, v, clase]) => `<div class="pr-kpi${clase ? ' ' + clase : ''}"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
function avisosHtml(avisos, max = 8) {
  if (!avisos.length) return '';
  const vistos = avisos.slice(0, max).map((a) => `<li class="pr-aviso pr-aviso-${a.nivel}">${esc(a.texto)}</li>`);
  if (avisos.length > max) vistos.push(`<li class="pr-aviso pr-aviso-info">Y ${plural(avisos.length - max, 'aviso')} más.</li>`);
  return `<ul class="pr-avisos">${vistos.join('')}</ul>`;
}
const cabeza = (titulo, sub, acciones = '') =>
  `<header class="pr-cabeza"><div class="pr-titulos"><h2>${esc(titulo)}</h2>${sub ? `<p class="pr-sub">${esc(sub)}</p>` : ''}</div>${acciones ? `<div class="pr-acciones">${acciones}</div>` : ''}</header>`;
const datalist = (id, valores) => `<datalist id="${id}">${[...new Set(valores.filter(Boolean))].map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
const nombreEvento = (e) => txt(e?.proyecto?.evento).trim() || txt(e?.nombre).trim() || 'Evento';

/* ================================================================== cronograma */

export const ETAPAS = {
  armado: { nombre: 'Armado', color: '#2447F5' },
  show: { nombre: 'Show', color: '#8A4FFF' },
  desarme: { nombre: 'Desarme', color: '#5B6170' },
};
const etapaDe = (t) => (ETAPAS[t?.etapa] ? t.etapa : 'armado');
const ORDEN_ETAPA = { armado: 0, show: 1, desarme: 2 };

// Estados de un objeto en el 3D "a las HH:MM".
export const ESTADOS = {
  pendiente: { nombre: 'Sin armar', uno: 'sin armar', varios: 'sin armar', color: '#9AA1A8' },
  armando: { nombre: 'Armándose', uno: 'armándose', varios: 'armándose', color: '#E8AA4C' },
  listo: { nombre: 'Listo', uno: 'listo', varios: 'listos', color: '#2FBF71' },
  desarmando: { nombre: 'Desarmándose', uno: 'desarmándose', varios: 'desarmándose', color: '#8A4FFF' },
  retirado: { nombre: 'Retirado', uno: 'retirado', varios: 'retirados', color: '#5B6170' },
};

function infoTarea(t) {
  const ini = aMinutos(t.inicio);
  const fin = aMinutos(t.fin);
  return { t, ini, fin, etapa: etapaDe(t), valida: ini !== null && fin !== null && fin >= ini };
}
const porHorario = (a, b) =>
  (a.ini ?? Infinity) - (b.ini ?? Infinity) || (a.fin ?? Infinity) - (b.fin ?? Infinity) || txt(a.t.nombre).localeCompare(txt(b.t.nombre), 'es');
const infosDe = (e) => tareasDe(e).map(infoTarea).sort(porHorario);

// Horario del show (puertas abiertas): proyecto.inicio y fin. Si falta, se supone de 22:00 a 06:00 del día
// del evento (supuesto: true). null si no hay ni fecha.
export function ventanaShow(escena) {
  const pr = escena?.proyecto || {};
  let ini = aMinutos(pr.inicio);
  let fin = aMinutos(pr.fin);
  let supuesto = false;
  if (ini === null) {
    const d = leerDia(pr.fecha) || leerDia(pr.fin);
    if (!d) return null;
    ini = aMinutos(`${d}T22:00`);
    supuesto = true;
  }
  if (fin === null) {
    fin = ini + 8 * 60;
    supuesto = true;
  } else if (fin <= ini) {
    fin += Math.ceil((ini - fin + 1) / 1440) * 1440;
    supuesto = true;
  }
  return { inicio: ini, fin, supuesto };
}

// Lo que no se arma (vehículos, caminos, zonas, carteles en el piso, personas, staff, lo del lugar).
const NO_SE_ARMA = new Set(['puesto', 'persona', 'etiqueta', 'zona', 'arbol', 'hilera', 'columna', 'escalera', 'camino', 'estacionamiento', 'auto', 'camion', 'ambulancia', 'texto', 'flecha', 'marcador', 'medicion', 'acceso']);
export const seArma = (o) => incluido(o) && !o.fijo && !NO_SE_ARMA.has(o.tipo);

// Estado de cada objeto a una hora: pendiente (antes de su armado), armando, listo, desarmando, retirado.
// Mira solo las tareas de armado y desarme que lo incluyen (ids). Lo que no está en ninguna tarea: listo.
export function estadoA(escena, momento) {
  const m = aMomento(momento);
  const rangos = new Map();
  for (const t of tareasDe(escena)) {
    const i = infoTarea(t);
    if (!i.valida || i.etapa === 'show') continue;
    for (const id of idsDe(t)) {
      const r = rangos.get(id) || {};
      if (i.etapa === 'armado') {
        r.armIni = Math.min(r.armIni ?? Infinity, i.ini);
        r.armFin = Math.max(r.armFin ?? -Infinity, i.fin);
      } else {
        r.desIni = Math.min(r.desIni ?? Infinity, i.ini);
        r.desFin = Math.max(r.desFin ?? -Infinity, i.fin);
      }
      rangos.set(id, r);
    }
  }
  const estados = new Map();
  for (const o of objetosDe(escena)) {
    const r = rangos.get(String(o.id));
    let e = 'listo';
    if (r && m !== null) {
      if (r.desIni !== undefined && m >= r.desIni) e = m >= r.desFin ? 'retirado' : 'desarmando';
      else if (r.armIni !== undefined && m < r.armIni) e = 'pendiente';
      else if (r.armIni !== undefined && m < r.armFin) e = 'armando';
    }
    estados.set(o.id, e);
  }
  return estados;
}

// Cuántos objetos hay en cada estado a esa hora (solo los que están en alguna tarea).
export function resumenEstado(escena, momento) {
  const enTareas = new Set(tareasDe(escena).filter((t) => etapaDe(t) !== 'show').flatMap(idsDe));
  const conteo = Object.fromEntries(Object.keys(ESTADOS).map((k) => [k, 0]));
  let n = 0;
  for (const [id, e] of estadoA(escena, momento)) {
    if (!enTareas.has(String(id))) continue;
    conteo[e]++;
    n++;
  }
  return { conteo, enTareas: n };
}

export function htmlResumenEstado(escena, momento) {
  const r = resumenEstado(escena, momento);
  if (!r.enTareas) return '<span class="pr-tenue">Sumá objetos a las tareas (con «Usar selección» o «Armar borrador») para ver el avance en el 3D.</span>';
  return Object.entries(ESTADOS)
    .filter(([k]) => r.conteo[k])
    .map(([k, e]) => `<span class="pr-estado pr-estado-${k}" style="--pr-color:${e.color}"><strong>${fm(r.conteo[k], 0)}</strong> ${esc(r.conteo[k] === 1 ? e.uno : e.varios)}</span>`)
    .join('');
}

// Avisos del cronograma: tareas sin horario, armado que se pisa con el show, proveedores que llegan tarde…
export function avisosCronograma(escena) {
  const infos = infosDe(escena);
  const v = ventanaShow(escena);
  const av = [];
  const nom = (i) => `«${txt(i.t.nombre).trim() || 'Sin nombre'}»`;
  if (!v) av.push({ nivel: 'atencion', texto: 'Falta el horario del evento: cargá cuándo abren y cuándo cierran las puertas.' });
  else if (v.supuesto) av.push({ nivel: 'info', texto: `El horario del show no está completo: tomé ${textoRango(v.inicio, v.fin)}. Cargalo arriba.` });
  for (const i of infos.filter((x) => !x.valida)) {
    av.push({ nivel: 'error', texto: i.ini !== null && i.fin !== null ? `${nom(i)} termina antes de empezar.` : `${nom(i)} no tiene horario completo y no aparece en la línea de tiempo.` });
  }
  if (v) {
    for (const i of infos.filter((x) => x.valida && x.t.hecha !== true)) {
      if (i.etapa === 'armado' && i.fin > v.inicio) av.push({ nivel: 'atencion', texto: `${nom(i)} termina ${textoDuracion(i.fin - v.inicio)} después de que abren las puertas.` });
      if (i.etapa === 'desarme' && i.ini < v.fin) av.push({ nivel: 'atencion', texto: `${nom(i)} arranca antes de que termine el show.` });
    }
  }
  for (const p of proveedoresDe(escena)) {
    const n = normalizar(p.nombre);
    if (!n) continue;
    const L = aMinutos(p.llegada);
    const antes = L === null ? [] : infos.filter((i) => i.valida && i.etapa === 'armado' && normalizar(i.t.proveedor) === n && i.ini < L && i.t.clave !== `llegada:${n}`);
    if (antes.length) av.push({ nivel: 'atencion', texto: `${txt(p.nombre).trim()} llega ${fechaHora(L)}, pero ${nom(antes[0])} arranca ${fechaHora(antes[0].ini)}.` });
    const R = aMinutos(p.retiro);
    const despues = R === null ? [] : infos.filter((i) => i.valida && i.etapa === 'desarme' && normalizar(i.t.proveedor) === n && i.fin > R && i.t.clave !== `retiro:${n}`);
    if (despues.length) av.push({ nivel: 'atencion', texto: `${txt(p.nombre).trim()} retira ${fechaHora(R)}, pero ${nom(despues[0])} termina ${fechaHora(despues[0].fin)}.` });
  }
  // Una misma persona a cargo de dos tareas a la vez.
  const porResp = new Map();
  for (const i of infos.filter((x) => x.valida && normalizar(x.t.responsable))) {
    const k = normalizar(i.t.responsable);
    if (!porResp.has(k)) porResp.set(k, []);
    porResp.get(k).push(i);
  }
  for (const grupo of porResp.values()) {
    for (let k = 1; k < grupo.length; k++) {
      const choca = grupo.slice(0, k).find((x) => x.fin > grupo[k].ini);
      if (choca) {
        av.push({ nivel: 'info', texto: `${txt(grupo[k].t.responsable).trim()} está a cargo de ${nom(choca)} y ${nom(grupo[k])} al mismo tiempo.` });
        break;
      }
    }
  }
  const armados = infos.filter((i) => i.etapa === 'armado');
  if (armados.some((i) => idsDe(i.t).length)) {
    const cubiertos = new Set(armados.flatMap((i) => idsDe(i.t)));
    const sueltos = objetosDe(escena).filter((o) => seArma(o) && !cubiertos.has(String(o.id)));
    if (sueltos.length) {
      av.push({ nivel: 'info', texto: `${plural(sueltos.length, 'objeto')} no ${sueltos.length === 1 ? 'está' : 'están'} en ninguna tarea de armado: en el 3D se ven como listos. «Armar borrador» los suma.` });
    }
  }
  return av;
}

/* ------------------------------------------------------------------ borrador automático */

// Cómo se arma cada categoría: fase A (estructura, energía, vallado) antes que B (sonido y luces);
// C (barra, servicios, mobiliario, deco) en paralelo, hasta una hora antes de abrir. Horas típicas.
const PLAN = {
  estructura: { fase: 'A', horas: 4, armado: 'Armado de estructuras', desarme: 'Desarme de estructuras' },
  predio: { fase: 'A', horas: 2, armado: 'Vallado y accesos', desarme: 'Retiro de vallado y accesos' },
  energia: { fase: 'A', horas: 2, armado: 'Generador, tableros y cableado', desarme: 'Desconexión y retiro de cables' },
  sonido: { fase: 'B', horas: 3, armado: 'Armado de sonido', desarme: 'Desarme de sonido' },
  luces: { fase: 'B', horas: 3, armado: 'Armado de luces y pantallas', desarme: 'Desarme de luces y pantallas' },
  barra: { fase: 'C', horas: 2, armado: 'Armado de barra', desarme: 'Desarme de barra' },
  servicios: { fase: 'C', horas: 1.5, armado: 'Baños, agua y servicios', desarme: 'Retiro de baños y servicios' },
  mobiliario: { fase: 'C', horas: 1.5, armado: 'Mobiliario', desarme: 'Retiro de mobiliario' },
  deco: { fase: 'C', horas: 2, armado: 'Decoración', desarme: 'Retiro de decoración' },
  zonas: { fase: 'C', horas: 1, armado: 'Señalética y carteles', desarme: 'Retiro de señalética' },
  otros: { fase: 'C', horas: 1, armado: 'Armado de otros elementos', desarme: 'Retiro de otros elementos' },
};
const ORDEN_PLAN = Object.keys(PLAN);
const redondear = (m, paso = 15) => Math.round(m / paso) * paso;
// Media hora más cada 10 unidades, hasta el doble de lo típico.
const duracionArmado = (cat, n) => {
  const base = PLAN[cat].horas * 60;
  return redondear(base + Math.min(base, Math.floor(n / 10) * 30), 30);
};

// Arma un borrador de tareas: llegada y retiro de cada proveedor, armado y desarme por rubro y proveedor
// (con sus objetos), prueba de sonido, briefing del staff, recorrida, show y limpieza. No duplica: si ya hay
// una tarea con la misma clave o el mismo nombre, le suma los objetos que le falten.
// Devuelve { nuevas: [tareas agregadas], actualizadas: cantidad, supuesto, sinFecha }.
export function generarTareas(escena) {
  const tareas = asegurarTareas(escena);
  const existentes = lista(tareas);
  let v = ventanaShow(escena);
  const sinFecha = !v;
  if (!v) {
    const hoy = aMinutos(`${textoDeFecha(new Date()).slice(0, 10)}T22:00`);
    v = { inicio: hoy, fin: hoy + 8 * 60, supuesto: true };
  }
  const S = v.inicio;
  const E = v.fin;
  const provLista = new Map();
  for (const p of proveedoresDe(escena)) {
    const n = normalizar(p.nombre);
    if (n && !provLista.has(n)) provLista.set(n, p);
  }
  const nombreProv = (s) => txt(provLista.get(normalizar(s))?.nombre).trim() || txt(s).trim();

  const cubiertos = { armado: new Set(), desarme: new Set(), show: new Set() };
  for (const t of existentes) for (const id of idsDe(t)) cubiertos[etapaDe(t)].add(id);

  const grupos = new Map();
  for (const o of objetosDe(escena)) {
    if (!seArma(o)) continue;
    const cat = PLAN[catDe(o)] ? catDe(o) : 'otros';
    const prov = nombreProv(o.proveedor);
    const k = `${cat}:${normalizar(prov)}`;
    if (!grupos.has(k)) grupos.set(k, { cat, proveedor: prov, ids: [] });
    grupos.get(k).ids.push(String(o.id));
  }
  const gs = [...grupos.values()].sort((a, b) => ORDEN_PLAN.indexOf(a.cat) - ORDEN_PLAN.indexOf(b.cat) || a.proveedor.localeCompare(b.proveedor, 'es'));
  const fase = (f) => gs.filter((g) => PLAN[g.cat].fase === f);
  for (const g of gs) {
    g.dur = duracionArmado(g.cat, g.ids.length);
    g.durDes = Math.max(60, redondear(g.dur / 2, 30));
  }

  // Armado: hacia atrás desde la apertura. Prueba de sonido de -2 h a -1 h; lo demás termina antes.
  const conPrueba = gs.some((g) => g.cat === 'sonido' || g.cat === 'luces');
  const finC = S - 60;
  const pruebaIni = finC - 60;
  const finB = conPrueba ? pruebaIni : finC;
  for (const g of fase('B')) [g.fin, g.ini] = [finB, finB - g.dur];
  const finA = fase('B').length ? Math.min(...fase('B').map((g) => g.ini)) : finB;
  for (const g of fase('A')) [g.fin, g.ini] = [finA, finA - g.dur];
  for (const g of fase('C')) [g.fin, g.ini] = [finC, finC - g.dur];
  // Si el proveedor llega más tarde, arranca una hora después de llegar (el aviso marca si no llega).
  for (const g of gs) {
    const L = aMinutos(provLista.get(normalizar(g.proveedor))?.llegada);
    if (L !== null && g.ini < L + 60) [g.ini, g.fin] = [L + 60, L + 60 + g.dur];
  }
  // Desarme: media hora después del cierre. Estructura y energía, cuando bajaron sonido y luces.
  const D0 = E + 30;
  for (const g of [...fase('B'), ...fase('C')]) [g.dIni, g.dFin] = [D0, D0 + g.durDes];
  const iniA = fase('B').length ? Math.max(...fase('B').map((g) => g.dFin)) : D0;
  for (const g of fase('A')) [g.dIni, g.dFin] = [iniA, iniA + g.durDes];

  const porClave = new Map(existentes.filter((t) => t.clave).map((t) => [String(t.clave), t]));
  const porNombre = new Map(existentes.map((t) => [`${etapaDe(t)}|${normalizar(t.nombre)}`, t]));
  const propuestas = [];
  let actualizadas = 0;
  const proponer = ({ clave, nombre, etapa, ini, fin, proveedor = '', ids = null }) => {
    const existe = porClave.get(clave) || porNombre.get(`${etapa}|${normalizar(nombre)}`);
    if (existe) {
      if (ids?.length) {
        const ya = new Set(idsDe(existe));
        const faltan = ids.filter((id) => !ya.has(id));
        if (faltan.length) {
          existe.ids = [...idsDe(existe), ...faltan];
          actualizadas++;
        }
      }
      return;
    }
    if (ids && !ids.length) return;
    const t = { nombre, etapa, inicio: deMinutos(ini), fin: deMinutos(fin), responsable: '', proveedor, ids: ids || [], hecha: false, clave };
    propuestas.push(t);
    porClave.set(clave, t);
    porNombre.set(`${etapa}|${normalizar(nombre)}`, t);
  };

  // Proveedores: los de la lista y los que aparecen en objetos.
  const provs = new Map([...provLista].map(([n, p]) => [n, { nombre: txt(p.nombre).trim(), p }]));
  for (const g of gs) {
    const n = normalizar(g.proveedor);
    if (n && !provs.has(n)) provs.set(n, { nombre: g.proveedor, p: null });
  }
  for (const [n, { nombre, p }] of provs) {
    const suyos = gs.filter((g) => normalizar(g.proveedor) === n);
    const L = aMinutos(p?.llegada);
    const ini = L ?? (suyos.length ? Math.min(...suyos.map((g) => g.ini)) - 60 : S - 240);
    proponer({ clave: `llegada:${n}`, nombre: `Llegada y descarga · ${nombre}`, etapa: 'armado', ini, fin: ini + 60, proveedor: nombre });
    const R = aMinutos(p?.retiro);
    const rIni = R ?? (suyos.length ? Math.max(...suyos.map((g) => g.dFin)) : E + 120);
    proponer({ clave: `retiro:${n}`, nombre: `Retiro · ${nombre}`, etapa: 'desarme', ini: rIni, fin: rIni + 60, proveedor: nombre });
  }
  for (const g of gs) {
    const n = normalizar(g.proveedor);
    const sufijo = g.proveedor ? ` · ${g.proveedor}` : '';
    proponer({ clave: `armado:${g.cat}:${n}`, nombre: PLAN[g.cat].armado + sufijo, etapa: 'armado', ini: g.ini, fin: g.fin, proveedor: g.proveedor, ids: g.ids.filter((id) => !cubiertos.armado.has(id)) });
    proponer({ clave: `desarme:${g.cat}:${n}`, nombre: PLAN[g.cat].desarme + sufijo, etapa: 'desarme', ini: g.dIni, fin: g.dFin, proveedor: g.proveedor, ids: g.ids.filter((id) => !cubiertos.desarme.has(id)) });
  }
  if (conPrueba) proponer({ clave: 'prueba', nombre: 'Prueba de sonido y luces', etapa: 'armado', ini: pruebaIni, fin: pruebaIni + 60 });
  if (objetosDe(escena).some((o) => o.tipo === 'puesto')) proponer({ clave: 'briefing', nombre: 'Llegada del staff y briefing', etapa: 'armado', ini: S - 90, fin: S - 60 });
  proponer({ clave: 'recorrida', nombre: 'Recorrida final antes de abrir', etapa: 'armado', ini: S - 30, fin: S });
  if (!existentes.some((t) => etapaDe(t) === 'show')) proponer({ clave: 'show', nombre: 'Show: puertas abiertas', etapa: 'show', ini: S, fin: E });
  if (gs.length) proponer({ clave: 'limpieza', nombre: 'Limpieza del predio', etapa: 'desarme', ini: E + 30, fin: E + 30 + 180 });

  propuestas.sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio) || ORDEN_ETAPA[a.etapa] - ORDEN_ETAPA[b.etapa]);
  const nuevas = [];
  for (const t of propuestas) {
    const x = { id: idNuevo(tareas, 't'), ...t };
    tareas.push(x);
    nuevas.push(x);
  }
  return { nuevas, actualizadas, supuesto: v.supuesto, sinFecha };
}

/* ------------------------------------------------------------------ CSV y orden del día */

export function csvCronograma(escena) {
  const porId = new Map(objetosDe(escena).map((o) => [String(o.id), o]));
  const filas = [['Día', 'Fecha', 'Empieza', 'Termina', 'Duración', 'Etapa', 'Tarea', 'Responsable', 'Proveedor', 'Objetos', 'Hecha']];
  for (const i of infosDe(escena)) {
    const objetos = idsDe(i.t)
      .map((id) => porId.get(id)?.nombre || id)
      .join(', ');
    filas.push([
      i.ini !== null ? DIAS_LARGOS[reloj(i.ini).getUTCDay()] : '',
      i.ini !== null ? fechaCorta(i.ini) : '',
      i.ini !== null ? hora(i.ini) : '',
      i.fin !== null ? (i.ini !== null && !mismoDia(i.ini, i.fin) ? `${fechaCorta(i.fin)} ${hora(i.fin)}` : hora(i.fin)) : '',
      i.valida ? textoDuracion(i.fin - i.ini) : '',
      ETAPAS[i.etapa].nombre,
      txt(i.t.nombre),
      txt(i.t.responsable),
      txt(i.t.proveedor),
      objetos,
      i.t.hecha === true ? 'Sí' : 'No',
    ]);
  }
  return armarCsv(filas);
}

// Texto plano con el orden del día, agrupado por día (para imprimir o mandar por WhatsApp).
export function ordenDelDia(escena) {
  const pr = escena?.proyecto || {};
  const v = ventanaShow(escena);
  const infos = infosDe(escena);
  const out = [`ORDEN DEL DÍA · ${nombreEvento(escena)}`];
  const datos = [txt(pr.lugar).trim(), txt(pr.responsable).trim() && `Responsable: ${txt(pr.responsable).trim()}`].filter(Boolean);
  if (datos.length) out.push(datos.join(' · '));
  if (v) out.push(`Puertas: ${textoRango(v.inicio, v.fin)}${v.supuesto ? ' (horario a confirmar)' : ''}`);
  let diaActual = null;
  for (const i of infos.filter((x) => x.valida)) {
    const d = Math.floor(i.ini / 1440);
    if (d !== diaActual) {
      out.push('', diaLargo(i.ini).toUpperCase());
      diaActual = d;
    }
    const prov = txt(i.t.proveedor).trim();
    const quien = [txt(i.t.responsable).trim() && `a cargo de ${txt(i.t.responsable).trim()}`, prov && !txt(i.t.nombre).includes(prov) && prov].filter(Boolean).join(' · ');
    const etapa = i.etapa === 'armado' ? '' : ` [${ETAPAS[i.etapa].nombre}]`;
    out.push(`  ${i.t.hecha === true ? '✓' : '·'} ${horasDe(i.ini, i.fin)}  ${txt(i.t.nombre).trim() || 'Sin nombre'}${etapa}${quien ? ` (${quien})` : ''}`);
  }
  const sin = infos.filter((x) => !x.valida);
  if (sin.length) {
    out.push('', 'SIN HORARIO');
    for (const i of sin) out.push(`  · ${txt(i.t.nombre).trim() || 'Sin nombre'}`);
  }
  if (!infos.length) out.push('', 'Todavía no hay tareas cargadas.');
  const provs = proveedoresDe(escena).filter((p) => txt(p.nombre).trim());
  if (provs.length) {
    out.push('', 'CONTACTOS');
    for (const p of provs) {
      const contacto = [p.contacto, p.telefono, p.email].map((x) => txt(x).trim()).filter(Boolean).join(' · ') || 'sin contacto';
      const L = aMinutos(p.llegada);
      const R = aMinutos(p.retiro);
      const extra = [L !== null && `llega ${fechaHora(L)}`, txt(p.acceso).trim() && `por ${txt(p.acceso).trim()}`, R !== null && `retira ${fechaHora(R)}`].filter(Boolean).join(', ');
      out.push(`  ${txt(p.nombre).trim()}${txt(p.rubro).trim() ? ` (${txt(p.rubro).trim()})` : ''}: ${contacto}${extra ? ` · ${extra}` : ''}`);
    }
  }
  return out.join('\n') + '\n';
}

/* ------------------------------------------------------------------ HTML del cronograma */

function htmlGantt(infos, v, ahora) {
  const validas = infos.filter((i) => i.valida);
  const marcas = validas.flatMap((i) => [i.ini, i.fin]);
  if (v) marcas.push(v.inicio, v.fin);
  if (!marcas.length) return '';
  const min = Math.floor(Math.min(...marcas) / 60) * 60;
  let max = Math.ceil(Math.max(...marcas) / 60) * 60;
  if (max - min < 240) max = min + 240;
  const horas = (max - min) / 60;
  const paso = [1, 2, 3, 4, 6, 12, 24].find((p) => horas / p <= 12) || 24;
  const pct = (m) => n2(Math.max(0, Math.min(100, ((m - min) / (max - min)) * 100)));

  const regla = [];
  const lineas = [];
  regla.push(`<span class="pr-gantt-dia" style="left:0%">${esc(dia(min))}</span>`);
  for (let t = Math.ceil(min / (paso * 60)) * paso * 60; t <= max; t += paso * 60) {
    const medianoche = t % 1440 === 0;
    if (t > min && medianoche) regla.push(`<span class="pr-gantt-dia" style="left:${pct(t)}%">${esc(dia(t))}</span>`);
    regla.push(`<span class="pr-gantt-tick" style="left:${pct(t)}%">${Math.floor((t % 1440) / 60)} h</span>`);
    lineas.push(`<div class="pr-gantt-linea${medianoche ? ' pr-gantt-linea-dia' : ''}" style="left:${pct(t)}%"></div>`);
  }
  if (v) {
    lineas.unshift(`<div class="pr-gantt-show" style="left:${pct(v.inicio)}%;width:${n2(pct(v.fin) - pct(v.inicio))}%" title="${esc(`Show: ${textoRango(v.inicio, v.fin)}`)}"><span>Show</span></div>`);
  }
  if (ahora !== null && ahora >= min && ahora <= max) {
    lineas.push(`<div class="pr-gantt-ahora" style="left:${pct(ahora)}%"><span>Ahora ${hora(ahora)}</span></div>`);
  }

  const filas = [];
  let fila = 2;
  for (const etapa of Object.keys(ETAPAS)) {
    const grupo = validas.filter((i) => i.etapa === etapa);
    if (!grupo.length) continue;
    const color = ETAPAS[etapa].color;
    filas.push(`<div class="pr-gantt-grupo pr-etapa-${etapa}" style="grid-row:${fila};grid-column:1 / -1;--pr-color:${color}">${esc(ETAPAS[etapa].nombre)} <span>${plural(grupo.length, 'tarea')}</span></div>`);
    fila++;
    for (const i of grupo) {
      const nombre = txt(i.t.nombre).trim() || 'Sin nombre';
      const tarde = v && ((etapa === 'armado' && i.fin > v.inicio) || (etapa === 'desarme' && i.ini < v.fin)) && i.t.hecha !== true;
      const clases = `pr-gantt-barra pr-etapa-${etapa}${i.t.hecha === true ? ' pr-hecha' : ''}${tarde ? ' pr-tarde' : ''}`;
      const detalle = [nombre, horasDe(i.ini, i.fin), txt(i.t.proveedor).trim(), txt(i.t.responsable).trim() && `a cargo de ${txt(i.t.responsable).trim()}`, idsDe(i.t).length && plural(idsDe(i.t).length, 'objeto')]
        .filter(Boolean)
        .join(' · ');
      const ancho = Math.max(0.5, pct(i.fin) - pct(i.ini));
      filas.push(
        `<div class="pr-gantt-nombre${i.t.hecha === true ? ' pr-hecha' : ''}" style="grid-row:${fila};grid-column:1" title="${esc(detalle)}"><span>${esc(nombre)}</span><small>${esc(horasDe(i.ini, i.fin))}</small></div>` +
          `<div class="pr-gantt-pista" style="grid-row:${fila};grid-column:2"><button type="button" class="${clases}" style="left:${pct(i.ini)}%;width:${n2(ancho)}%;--pr-color:${color}" data-prod-accion="ver-objetos:${esc(i.t.id)}" title="${esc(detalle)}"><span>${esc(nombre)}</span></button></div>`
      );
      fila++;
    }
  }
  const n = Math.max(1, fila - 2);
  return (
    `<div class="pr-gantt" style="grid-template-rows:auto repeat(${n}, auto)" aria-label="Línea de tiempo del armado y el desarme">` +
    `<div class="pr-gantt-esquina" style="grid-row:1;grid-column:1">Tarea</div>` +
    `<div class="pr-gantt-regla" style="grid-row:1;grid-column:2">${regla.join('')}</div>` +
    `<div class="pr-gantt-capa" style="grid-row:2 / span ${n};grid-column:2" aria-hidden="true">${lineas.join('')}</div>` +
    filas.join('') +
    `</div>`
  );
}

// Barra para ver en el 3D cómo está el predio a cada hora. El valor son minutos (ver estadoA).
function htmlMomento(escena, infos, v, ahora) {
  const marcas = infos.filter((i) => i.valida).flatMap((i) => [i.ini, i.fin]);
  if (v) marcas.push(v.inicio, v.fin);
  if (!marcas.length) return '';
  const min = Math.floor(Math.min(...marcas) / 15) * 15;
  const max = Math.max(min + 15, Math.ceil(Math.max(...marcas) / 15) * 15);
  const valor = ahora !== null && ahora >= min && ahora <= max ? Math.floor(ahora / 15) * 15 : v ? v.inicio : min;
  return (
    `<div class="pr-momento">` +
    `<label class="pr-momento-rotulo" for="pr-momento">Cómo está el predio: <strong data-prod-momento-texto>${esc(fechaHora(valor))}</strong></label>` +
    `<input type="range" id="pr-momento" class="pr-rango" data-prod-momento min="${min}" max="${max}" step="15" value="${valor}">` +
    `<div class="pr-estado-resumen" data-prod-momento-resumen>${htmlResumenEstado(escena, valor)}</div>` +
    `</div>`
  );
}

function filaTarea(escena, i, porId) {
  const t = i.t;
  const id = txt(t.id);
  const ids = idsDe(t);
  const nombres = ids.map((x) => porId.get(x)?.nombre || x);
  const dur = i.valida ? valorDuracion(i.fin - i.ini) : '';
  const objetos = ids.length
    ? `<span class="pr-chip" title="${esc(nombres.join(', '))}">${plural(ids.length, 'objeto')}</span>`
    : '<span class="pr-tenue">ninguno</span>';
  return (
    `<tr class="pr-fila-tarea pr-etapa-${i.etapa}${t.hecha === true ? ' pr-hecha' : ''}${i.valida ? '' : ' pr-con-error'}" data-id="${esc(id)}" data-ids="${esc(ids.join(','))}">` +
    `<td class="pr-col-check">${casilla(`tareas:${id}:hecha`, t.hecha === true, 'Hecha')}</td>` +
    `<td>${campo(`tareas:${id}:nombre`, t.nombre, { 'aria-label': 'Tarea', placeholder: 'Qué hay que hacer' })}</td>` +
    `<td>${selector(`tareas:${id}:etapa`, i.etapa, Object.entries(ETAPAS).map(([k, e]) => [k, e.nombre]), { 'aria-label': 'Etapa' })}</td>` +
    `<td>${campo(`tareas:${id}:inicio`, valorFecha(t.inicio), { tipo: 'datetime-local', clase: 'pr-fecha', 'aria-label': 'Empieza' })}</td>` +
    `<td>${campo(`tareas:${id}:fin`, valorFecha(t.fin), { tipo: 'datetime-local', clase: 'pr-fecha', 'aria-label': 'Termina' })}</td>` +
    `<td class="pr-num">${campo(`tareas:${id}:duracion`, dur, { clase: 'pr-corto', inputmode: 'decimal', 'aria-label': 'Duración', title: 'Horas: 2, 1,5 o 1:30. Cambia la hora de fin.' })}</td>` +
    `<td>${campo(`tareas:${id}:responsable`, t.responsable, { 'aria-label': 'Responsable', placeholder: 'Quién' })}</td>` +
    `<td>${campo(`tareas:${id}:proveedor`, t.proveedor, { list: 'pr-lista-proveedores', 'aria-label': 'Proveedor', placeholder: 'Proveedor' })}</td>` +
    `<td class="pr-objetos">${objetos}<span class="pr-botonera">${boton(`asignar-seleccion:${id}`, 'Usar selección', { clase: 'pr-boton-chico', titulo: 'Esta tarea pasa a tener los objetos elegidos en el 3D o la planta' })}${ids.length ? boton(`ver-objetos:${id}`, 'Ver', { clase: 'pr-boton-chico', titulo: 'Elegir sus objetos en el 3D' }) + boton(`quitar-objetos:${id}`, 'Quitar', { clase: 'pr-boton-chico', titulo: 'Sacar todos los objetos de esta tarea' }) : ''}</span></td>` +
    `<td class="pr-acciones-fila">${boton(`duplicar-tarea:${id}`, 'Duplicar', { clase: 'pr-boton-chico' })}${boton(`borrar:tareas:${id}`, 'Borrar', { clase: 'pr-boton-chico pr-boton-borrar', titulo: 'Borrar esta tarea' })}</td>` +
    `</tr>`
  );
}

export function htmlCronograma(escena, { ahora } = {}) {
  const ahoraMin = aMomento(ahora ?? new Date());
  const infos = infosDe(escena);
  const v = ventanaShow(escena);
  const pr = escena?.proyecto || {};
  const porId = new Map(objetosDe(escena).map((o) => [String(o.id), o]));
  const validas = infos.filter((i) => i.valida);
  const hechas = infos.filter((i) => i.t.hecha === true).length;
  const primera = validas.length ? Math.min(...validas.map((i) => i.ini)) : null;
  const ultima = validas.length ? Math.max(...validas.map((i) => i.fin)) : null;

  const acciones =
    boton('generar-tareas', 'Armar borrador', { clase: 'pr-boton-primario', titulo: 'Arma la llegada de cada proveedor, el armado por rubro, el show y el desarme con los objetos de la escena. No pisa lo que ya hay.' }) +
    boton('agregar-tarea', 'Agregar tarea') +
    boton('exportar:orden-del-dia', 'Orden del día', { titulo: 'Texto para imprimir o mandar por WhatsApp' }) +
    boton('exportar:cronograma-csv', 'Planilla', { titulo: 'Descargar para Excel' });
  let s = cabeza('Cronograma de armado y desarme', nombreEvento(escena), acciones);
  s += `<div class="pr-puertas"><label class="pr-etiqueta">Abren las puertas ${campo('escena:proyecto:inicio', valorFecha(pr.inicio), { tipo: 'datetime-local', clase: 'pr-fecha' })}</label><label class="pr-etiqueta">Cierran ${campo('escena:proyecto:fin', valorFecha(pr.fin), { tipo: 'datetime-local', clase: 'pr-fecha' })}</label></div>`;
  s += kpis([
    ['Tareas', infos.length ? `${hechas} de ${infos.length} hechas` : 'ninguna'],
    ['Arranca', primera !== null ? fechaHora(primera) : '—'],
    ['Puertas', v ? `${fechaHora(v.inicio)}${v.supuesto ? ' (supuesto)' : ''}` : 'sin horario'],
    ['Termina todo', ultima !== null ? fechaHora(ultima) : '—'],
  ]);
  s += avisosHtml(avisosCronograma(escena));
  if (!infos.length) {
    s += `<div class="pr-vacio"><p>Todavía no hay tareas.</p><p>Tocá <strong>Armar borrador</strong> y la app arma una primera versión con la llegada de cada proveedor, el armado por rubro, la prueba de sonido, el show y el desarme. Después ajustás los horarios.</p></div>`;
    return `<section class="pr-panel pr-panel-cronograma">${s}</section>`;
  }
  s += htmlMomento(escena, infos, v, ahoraMin);
  s += htmlGantt(infos, v, ahoraMin);
  let cuerpo = '';
  for (const etapa of Object.keys(ETAPAS)) {
    const grupo = infos.filter((i) => i.etapa === etapa);
    if (!grupo.length) continue;
    cuerpo += `<tr class="pr-fila-grupo pr-etapa-${etapa}" style="--pr-color:${ETAPAS[etapa].color}"><th colspan="10">${esc(ETAPAS[etapa].nombre)} <span>${plural(grupo.length, 'tarea')}</span></th></tr>`;
    cuerpo += grupo.map((i) => filaTarea(escena, i, porId)).join('');
  }
  s += `<div class="pr-tabla-envoltura"><table class="pr-tabla pr-tabla-tareas"><thead><tr><th class="pr-col-check" title="Hecha">✓</th><th>Tarea</th><th>Etapa</th><th>Empieza</th><th>Termina</th><th class="pr-num">Dura</th><th>Responsable</th><th>Proveedor</th><th>Objetos</th><th></th></tr></thead><tbody>${cuerpo}</tbody></table></div>`;
  s += datalist('pr-lista-proveedores', todosLosProveedores(escena).map((p) => p.nombre));
  return `<section class="pr-panel pr-panel-cronograma">${s}</section>`;
}

/* ================================================================== proveedores */

// Todos los proveedores: los de la lista (enLista) y los que están escritos en objetos, tareas o gastos sin
// estar en ella. Cada uno con sus objetos, tareas y gastos.
export function todosLosProveedores(escena) {
  const res = [];
  const porNombre = new Map();
  for (const p of proveedoresDe(escena)) {
    const r = { nombre: txt(p.nombre).trim(), datos: p, enLista: true, objetos: [], tareas: [], extras: [] };
    res.push(r);
    const n = normalizar(p.nombre);
    if (n && !porNombre.has(n)) porNombre.set(n, r);
  }
  const sumar = (nombre, cual, x) => {
    const n = normalizar(nombre);
    if (!n) return;
    let r = porNombre.get(n);
    if (!r) {
      r = { nombre: txt(nombre).trim(), datos: null, enLista: false, objetos: [], tareas: [], extras: [] };
      porNombre.set(n, r);
      res.push(r);
    }
    r[cual].push(x);
  };
  for (const o of objetosDe(escena)) sumar(o.proveedor, 'objetos', o);
  for (const t of tareasDe(escena)) sumar(t.proveedor, 'tareas', t);
  for (const x of extrasDe(escena)) sumar(x.proveedor, 'extras', x);
  return res;
}

// Unidades que suma un objeto en el listado: el vallado se cuenta en paños; lo demás, de a uno.
const unidadesDe = (o) => (o?.tipo === 'vallado' ? modulosVallado(o) : 1);

// Ítems del listado de materiales que trae un proveedor: código, nombre y cuántas unidades son suyas.
function itemsDeObjetos(comp, objetos) {
  const porId = new Map(objetos.map((o) => [o.id, o]));
  return comp.items
    .map((it) => ({ it, cantidad: it.ids.reduce((s, id) => s + (porId.has(id) ? unidadesDe(porId.get(id)) : 0), 0) }))
    .filter((x) => x.cantidad)
    .map(({ it, cantidad }) => ({ codigo: it.codigo, nombre: it.nombre, ref: it.ref, medida: it.medida, tipo: it.tipo, unidad: it.unidad || 'u', cantidad }));
}

// Número para wa.me: solo dígitos y con código de país. Un número argentino sin código ("11 5555-5555",
// "011 15 5555-5555") pasa a 549 + área + número.
export function numeroWhatsApp(tel) {
  const t = txt(tel).trim();
  if (!t) return '';
  let d = t.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (!t.startsWith('+') && !d.startsWith('54')) {
    if (d.startsWith('0')) d = d.slice(1);
    if (d.length === 12) {
      // Área de 2, 3 o 4 cifras + "15" + número: el 15 no va en WhatsApp.
      for (const a of [2, 3, 4]) {
        if (d.slice(a, a + 2) === '15') {
          d = d.slice(0, a) + d.slice(a + 2);
          break;
        }
      }
    }
    if (d.length === 10) d = '549' + d;
  }
  if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) d = '549' + d.slice(2);
  return d.length >= 8 && d.length <= 15 ? d : '';
}

export function enlaceWhatsApp(escena, p) {
  const num = numeroWhatsApp(p?.telefono);
  if (!num) return '';
  const L = aMinutos(p.llegada);
  const R = aMinutos(p.retiro);
  const partes = [`Hola${txt(p.contacto).trim() ? ` ${txt(p.contacto).trim().split(' ')[0]}` : ''}, te escribo por ${nombreEvento(escena)}.`];
  if (L !== null) partes.push(`Llegada: ${fechaHora(L)}${txt(p.acceso).trim() ? ` por ${txt(p.acceso).trim()}` : ''}.`);
  if (R !== null) partes.push(`Retiro: ${fechaHora(R)}.`);
  return `https://wa.me/${num}?text=${encodeURIComponent(partes.join(' '))}`;
}

// Nombres de accesos y portones del lugar, para elegir por dónde entra cada proveedor.
function nombresAccesos(escena) {
  const n = objetosDe(escena)
    .filter((o) => o.tipo === 'acceso' || o.tipo === 'control_acceso')
    .map((o) => txt(o.nombre).trim());
  for (const a of lista(escena?.areas)) for (const ab of lista(a.aberturas)) if (ab.tipo === 'porton' || ab.tipo === 'puerta') n.push(txt(ab.nombre).trim());
  return n;
}

const RUBROS = ['Sonido', 'Luces', 'Pantallas', 'Estructuras', 'Energía', 'Barra y bebidas', 'Comida', 'Baños químicos', 'Seguridad', 'Limpieza', 'Mobiliario', 'Decoración', 'Vallado', 'Transporte', 'Emergencias médicas'];

function htmlTrae(items, nObjetos) {
  if (!nObjetos) return '<span class="pr-tenue">Sin objetos asignados</span>';
  const codigos = items
    .map((i) => `<span class="pr-codigo" title="${esc(`${i.nombre}${i.ref ? ` ${i.ref}` : ''} · ${i.medida}`)}">${i.codigo}</span>${i.cantidad > 1 ? `<span class="pr-por">×${i.cantidad}${i.unidad !== 'u' ? ` ${esc(i.unidad)}` : ''}</span>` : ''}`)
    .join(' ');
  return `<strong>${plural(nObjetos, 'objeto')}</strong>${codigos ? `<span class="pr-codigos">${codigos}</span>` : ''}`;
}

export function htmlProveedores(escena) {
  const comp = calcular(escena);
  const todos = todosLosProveedores(escena);
  const enLista = todos.filter((p) => p.enLista);
  const fuera = todos.filter((p) => !p.enLista);
  const sinProveedor = objetosDe(escena).filter((o) => seArma(o) && !txt(o.proveedor).trim());
  const avisos = [];
  for (const r of enLista) {
    if (!r.objetos.length) continue;
    if (aMinutos(r.datos.llegada) === null) avisos.push({ nivel: 'atencion', texto: `${r.nombre || 'Un proveedor'} no tiene horario de llegada.` });
    if (!txt(r.datos.telefono).trim()) avisos.push({ nivel: 'info', texto: `${r.nombre || 'Un proveedor'} no tiene teléfono.` });
  }
  if (sinProveedor.length) avisos.push({ nivel: 'info', texto: `${plural(sinProveedor.length, 'objeto')} para armar no ${sinProveedor.length === 1 ? 'tiene' : 'tienen'} proveedor. Se asigna en el inspector o en Presupuesto.` });

  const acciones = boton('agregar-proveedor', 'Agregar proveedor', { clase: 'pr-boton-primario' });
  let s = cabeza('Proveedores', `${plural(enLista.length, 'proveedor', 'proveedores')} en la lista`, acciones);
  s += avisosHtml(avisos);
  if (enLista.length) {
    const filas = enLista
      .map((r) => {
        const p = r.datos;
        const id = txt(p.id);
        const pre = `proveedores:${id}:`;
        const wa = enlaceWhatsApp(escena, p);
        const items = itemsDeObjetos(comp, r.objetos);
        const ids = r.objetos.map((o) => o.id);
        return (
          `<tr data-id="${esc(id)}" data-ids="${esc(ids.join(','))}">` +
          `<td class="pr-apilado">${campo(pre + 'nombre', p.nombre, { clase: 'pr-fuerte', placeholder: 'Nombre', 'aria-label': 'Nombre del proveedor' })}${campo(pre + 'rubro', p.rubro, { list: 'pr-lista-rubros', placeholder: 'Rubro', 'aria-label': 'Rubro' })}</td>` +
          `<td class="pr-apilado">${campo(pre + 'contacto', p.contacto, { placeholder: 'Contacto', 'aria-label': 'Contacto' })}${campo(pre + 'telefono', p.telefono, { tipo: 'tel', placeholder: 'Teléfono', 'aria-label': 'Teléfono' })}${campo(pre + 'email', p.email, { tipo: 'email', placeholder: 'Email', 'aria-label': 'Email' })}</td>` +
          `<td class="pr-apilado">${campo(pre + 'llegada', valorFecha(p.llegada), { tipo: 'datetime-local', clase: 'pr-fecha', 'aria-label': 'Llega' })}${campo(pre + 'acceso', p.acceso, { list: 'pr-lista-accesos', placeholder: 'Por dónde entra', 'aria-label': 'Acceso' })}</td>` +
          `<td>${campo(pre + 'retiro', valorFecha(p.retiro), { tipo: 'datetime-local', clase: 'pr-fecha', 'aria-label': 'Retira' })}</td>` +
          `<td class="pr-trae">${htmlTrae(items, r.objetos.length)}</td>` +
          `<td>${areaTexto(pre + 'notas', p.notas, { rows: 2, placeholder: 'Notas', 'aria-label': 'Notas' })}</td>` +
          `<td class="pr-acciones-fila">${wa ? `<a class="pr-boton pr-boton-chico pr-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}${ids.length ? boton(`ver:${ids.join(',')}`, 'Ver', { clase: 'pr-boton-chico', titulo: 'Elegir sus objetos en el 3D' }) : ''}${boton(`borrar:proveedores:${id}`, 'Borrar', { clase: 'pr-boton-chico pr-boton-borrar', titulo: 'Sacarlo de la lista' })}</td>` +
          `</tr>`
        );
      })
      .join('');
    s += `<div class="pr-tabla-envoltura"><table class="pr-tabla pr-tabla-proveedores"><thead><tr><th>Proveedor</th><th>Contacto</th><th>Llega y entra por</th><th>Retira</th><th>Qué trae</th><th>Notas</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`;
  } else {
    s += `<div class="pr-vacio"><p>Todavía no hay proveedores en la lista.</p><p>Agregá cada uno con su contacto y horario. Para asignarle cosas, escribí su nombre en el campo «Proveedor» de cada objeto (o por ítem en Presupuesto).</p></div>`;
  }
  if (fuera.length) {
    s += `<section class="pr-seccion"><h3>Aparecen en la escena pero no están en la lista</h3><ul class="pr-lista">${fuera
      .map((r) => {
        const que = [r.objetos.length && plural(r.objetos.length, 'objeto'), r.tareas.length && plural(r.tareas.length, 'tarea'), r.extras.length && plural(r.extras.length, 'gasto')].filter(Boolean).join(', ');
        return `<li class="pr-lista-fila"><strong>${esc(r.nombre)}</strong> <span class="pr-tenue">${esc(que)}</span>${boton(`agregar-proveedor:${r.nombre}`, 'Agregar a la lista', { clase: 'pr-boton-chico' })}</li>`;
      })
      .join('')}</ul></section>`;
  }
  s += datalist('pr-lista-rubros', [...RUBROS, ...enLista.map((r) => txt(r.datos.rubro).trim())]);
  s += datalist('pr-lista-accesos', [...nombresAccesos(escena), ...enLista.map((r) => txt(r.datos.acceso).trim())]);
  return `<section class="pr-panel pr-panel-proveedores">${s}</section>`;
}

/* ================================================================== staff */

const rolDe = (o) => (ROLES_STAFF[o?.rol] ? o.rol : 'otro');
const personasDe = (o) => {
  const n = numero(o?.personas);
  return n !== null && n >= 0 ? Math.round(n) : 1;
};

// Turno escrito a mano ("22:00 a 06:00", "22 a 6", "14-18 h"). Devuelve minutos del día { ini, fin } (fin
// puede pasar de 1440 si termina al otro día) y el texto prolijo, o null.
export function leerTurno(v) {
  const s = txt(v).trim().toLowerCase();
  const m = /(\d{1,2})(?:[:h.](\d{2}))?\s*(?:h|hs)?\s*(?:a|-|–|al|hasta)\s*(\d{1,2})(?:[:h.](\d{2}))?/.exec(s);
  if (!m) return null;
  const [h1, m1, h2, m2] = [m[1], m[2] || 0, m[3], m[4] || 0].map(Number);
  if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) return null;
  const ini = (h1 * 60 + m1) % 1440;
  let fin = (h2 * 60 + m2) % 1440;
  if (fin <= ini) fin += 1440;
  return { ini, fin, texto: `${horaDelDia(ini)} a ${horaDelDia(fin)}` };
}

// Máximo de personas al mismo tiempo, recorriendo el día de a 15 minutos (desde el mediodía, para que la
// noche quede junta). Lo que no tiene turno cuenta todo el tiempo.
function picoDe(franjas) {
  if (!franjas.length) return { personas: 0, desde: null };
  const cubre = (tu, s) => (s >= tu.ini && s < tu.fin) || (s + 1440 >= tu.ini && s + 1440 < tu.fin);
  let mejor = -1;
  let desde = null;
  for (let s = 12 * 60; s < 36 * 60; s += 15) {
    const x = s % 1440;
    let n = 0;
    for (const f of franjas) if (!f.tu || cubre(f.tu, x)) n += f.n;
    if (n > mejor) [mejor, desde] = [n, x];
  }
  return { personas: mejor, desde: franjas.some((f) => f.tu) ? desde : null };
}

// Aforo: el mismo número que usa Seguridad (capacidadDe): proyecto.aforo o, si falta, lo que entra con el lugar
// lleno (superficie libre por la densidad de "lleno" de la escena).
export function aforoDe(escena) {
  const n = numero(escena?.proyecto?.aforo);
  if (n !== null && n > 0) return { personas: Math.round(n), estimado: false, texto: '' };
  let cap = null;
  try {
    cap = capacidadDe(escena);
  } catch {
    cap = null;
  }
  if (!cap || !(cap.llena > 0)) return { personas: null, estimado: true, texto: '' };
  const d = cap.densidad[1];
  return { personas: cap.llena, estimado: true, texto: `lugar lleno, como en Seguridad: ${fm(cap.libre, 0)} m² libres a ${fm(d, d % 1 ? 1 : 0)} personas por m²` };
}

// Staff por rol y por turno, máximo al mismo tiempo y seguridad recomendada para el aforo.
export function resumenStaff(escena) {
  const puestos = objetosDe(escena).filter((o) => o.tipo === 'puesto');
  const roles = new Map();
  const turnos = new Map();
  const franjas = [];
  for (const o of puestos) {
    const rol = rolDe(o);
    const n = personasDe(o);
    const tu = leerTurno(o.turno);
    const turno = tu ? tu.texto : txt(o.turno).trim() || 'Sin turno';
    if (!roles.has(rol)) roles.set(rol, { rol, nombre: ROLES_STAFF[rol].nombre, color: ROLES_STAFF[rol].color, personas: 0, puestos: 0, ids: [], turnos: new Map() });
    const r = roles.get(rol);
    r.personas += n;
    r.puestos++;
    r.ids.push(o.id);
    if (!r.turnos.has(turno)) r.turnos.set(turno, { turno, personas: 0, puestos: 0 });
    r.turnos.get(turno).personas += n;
    r.turnos.get(turno).puestos++;
    if (!turnos.has(turno)) turnos.set(turno, { turno, personas: 0, puestos: 0, ini: tu ? tu.ini : Infinity });
    turnos.get(turno).personas += n;
    turnos.get(turno).puestos++;
    franjas.push({ rol, n, tu });
  }
  const ordenTurno = (a, b) => (a.ini ?? Infinity) - (b.ini ?? Infinity) || a.turno.localeCompare(b.turno, 'es');
  const listaRoles = Object.keys(ROLES_STAFF)
    .filter((k) => roles.has(k))
    .map((k) => {
      const r = roles.get(k);
      const tl = [...r.turnos.values()].map((t) => ({ ...t, ini: leerTurno(t.turno)?.ini ?? Infinity })).sort(ordenTurno).map(({ ini, ...t }) => t);
      return { ...r, turnos: tl, pico: picoDe(franjas.filter((f) => f.rol === k)) };
    });
  const aforo = aforoDe(escena);
  const pps = numero(escena?.servicios?.personasPorSeguridad);
  const porSeguridad = pps !== null && pps > 0 ? pps : 100;
  const seg = listaRoles.find((r) => r.rol === 'seguridad');
  const alMismoTiempo = seg ? seg.pico.personas : 0;
  const recomendado = aforo.personas ? Math.ceil(aforo.personas / porSeguridad) : null;
  return {
    roles: listaRoles,
    total: listaRoles.reduce((s, r) => s + r.personas, 0),
    puestos: puestos.length,
    turnos: [...turnos.values()].sort(ordenTurno).map(({ ini, ...t }) => t),
    pico: picoDe(franjas),
    aforo,
    seguridad: {
      personas: seg ? seg.personas : 0,
      alMismoTiempo,
      recomendado,
      porSeguridad,
      faltan: recomendado === null ? null : Math.max(0, recomendado - alMismoTiempo),
    },
  };
}

export function htmlStaff(escena) {
  const r = resumenStaff(escena);
  const seg = r.seguridad;
  const afo = r.aforo;
  let s = cabeza('Staff', r.puestos ? `${plural(r.total, 'persona')} en ${plural(r.puestos, 'puesto')}` : 'Sin puestos cargados');
  s += kpis([
    ['Personas', fm(r.total, 0)],
    ['Puestos', fm(r.puestos, 0)],
    ['Al mismo tiempo', r.pico.personas ? `${fm(r.pico.personas, 0)}${r.pico.desde !== null ? ` (desde las ${horaDelDia(r.pico.desde)})` : ''}` : '—'],
    ['Aforo', afo.personas ? `${fm(afo.personas, 0)}${afo.estimado ? ' (estimado)' : ''}` : 'sin cargar'],
  ]);

  // Seguridad para el aforo.
  const ajustes = `<div class="pr-ajustes"><label class="pr-etiqueta">Aforo (personas) ${campo('escena:proyecto:aforo', numero(escena?.proyecto?.aforo) ?? '', { inputmode: 'numeric', clase: 'pr-corto', placeholder: afo.personas ? String(afo.personas) : '1500' })}</label><label class="pr-etiqueta">1 de seguridad cada ${campo('escena:servicios:personasPorSeguridad', seg.porSeguridad, { inputmode: 'numeric', clase: 'pr-corto' })} personas</label></div>`;
  let nota;
  if (!afo.personas) {
    nota = `<div class="pr-nota pr-nota-info"><p>Cargá el aforo para saber cuánta seguridad hace falta.</p>${ajustes}</div>`;
  } else {
    const ok = seg.faltan === 0;
    const base = `Para ${fm(afo.personas, 0)} personas${afo.estimado ? ` (${afo.texto})` : ''} se recomienda 1 de seguridad cada ${fm(seg.porSeguridad, 0)}: ${plural(seg.recomendado, 'persona')} al mismo tiempo.`;
    const hay = seg.personas ? `Hay ${fm(seg.alMismoTiempo, 0)} al mismo tiempo${seg.personas !== seg.alMismoTiempo ? ` (${fm(seg.personas, 0)} en total entre turnos)` : ''}.` : 'No hay puestos de seguridad cargados.';
    const veredicto = ok ? 'Alcanza.' : `Faltan ${fm(seg.faltan, 0)}.`;
    const guia = afo.estimado
      ? 'Sin aforo cargado, la cuenta usa lo que entra con el lugar lleno. Cargá la gente que esperás para que sea real. Es una guía: manda lo que pida el municipio o la habilitación.'
      : 'Es una guía: manda lo que pida el municipio o la habilitación.';
    nota = `<div class="pr-nota ${ok ? 'pr-nota-ok' : 'pr-nota-atencion'}"><p><strong>${esc(veredicto)}</strong> ${esc(base)} ${esc(hay)}</p><p class="pr-tenue">${esc(guia)}</p>${ajustes}</div>`;
  }
  s += nota;

  if (!r.puestos) {
    s += `<div class="pr-vacio"><p>Todavía no hay puestos de staff.</p><p>Agregalos desde la biblioteca (Staff → Puesto de staff), ubicalos en la planta y elegí el rol, cuántas personas y el turno.</p></div>`;
    return `<section class="pr-panel pr-panel-staff">${s}</section>`;
  }

  const filasRol = r.roles
    .map(
      (x) =>
        `<tr data-ids="${esc(x.ids.join(','))}"><td><span class="pr-punto" style="--pr-color:${x.color}"></span>${esc(x.nombre)}</td><td class="pr-num pr-fuerte">${fm(x.personas, 0)}</td><td class="pr-num">${fm(x.puestos, 0)}</td>` +
        `<td>${x.turnos.map((t) => `<span class="pr-turno">${esc(t.turno)}: ${plural(t.personas, 'persona')}</span>`).join(' ')}</td><td class="pr-num">${fm(x.pico.personas, 0)}</td></tr>`
    )
    .join('');
  s += `<div class="pr-tabla-envoltura"><table class="pr-tabla pr-tabla-roles"><thead><tr><th>Rol</th><th class="pr-num">Personas</th><th class="pr-num">Puestos</th><th>Turnos</th><th class="pr-num">Al mismo tiempo</th></tr></thead><tbody>${filasRol}</tbody><tfoot><tr><th>Total</th><th class="pr-num">${fm(r.total, 0)}</th><th class="pr-num">${fm(r.puestos, 0)}</th><th>${r.turnos.map((t) => `<span class="pr-turno">${esc(t.turno)}: ${fm(t.personas, 0)}</span>`).join(' ')}</th><th class="pr-num">${fm(r.pico.personas, 0)}</th></tr></tfoot></table></div>`;

  const puestos = objetosDe(escena)
    .filter((o) => o.tipo === 'puesto')
    .sort((a, b) => Object.keys(ROLES_STAFF).indexOf(rolDe(a)) - Object.keys(ROLES_STAFF).indexOf(rolDe(b)) || txt(a.nombre).localeCompare(txt(b.nombre), 'es'));
  const roles = Object.entries(ROLES_STAFF).map(([k, v]) => [k, v.nombre]);
  const filasPuesto = puestos
    .map((o) => {
      const pre = `puestos:${o.id}:`;
      const costo = numero(o.costo);
      return (
        `<tr data-id="${esc(o.id)}" data-ids="${esc(o.id)}">` +
        `<td>${campo(pre + 'nombre', o.nombre, { 'aria-label': 'Nombre del puesto' })}</td>` +
        `<td>${selector(pre + 'rol', rolDe(o), roles, { 'aria-label': 'Rol' })}</td>` +
        `<td class="pr-num">${campo(pre + 'personas', personasDe(o), { tipo: 'number', min: 0, step: 1, clase: 'pr-corto', 'aria-label': 'Personas' })}</td>` +
        `<td>${campo(pre + 'turno', txt(o.turno), { placeholder: '22:00 a 06:00', 'aria-label': 'Turno' })}</td>` +
        `<td class="pr-num">${campo(pre + 'costo', valorMonto(costo), { inputmode: 'decimal', clase: 'pr-monto', placeholder: 'Sin precio', 'aria-label': 'Costo por persona' })}</td>` +
        `<td class="pr-acciones-fila">${boton(`ver:${o.id}`, 'Ver', { clase: 'pr-boton-chico', titulo: 'Elegirlo en el 3D' })}</td>` +
        `</tr>`
      );
    })
    .join('');
  s += `<section class="pr-seccion"><h3>Puestos</h3><div class="pr-tabla-envoltura"><table class="pr-tabla pr-tabla-puestos"><thead><tr><th>Puesto</th><th>Rol</th><th class="pr-num">Personas</th><th>Turno</th><th class="pr-num">Costo por persona</th><th></th></tr></thead><tbody>${filasPuesto}</tbody></table></div></section>`;
  return `<section class="pr-panel pr-panel-staff">${s}</section>`;
}

/* ================================================================== presupuesto */

const precioDe = (o) => {
  if (o.propio) return 0;
  const c = numero(o.costo);
  return c !== null && c >= 0 ? c : null;
};

function lineaDe(objs, base) {
  const peso = (o) => (base.porPersona ? personasDe(o) : unidadesDe(o));
  const primero = objs[0];
  const conPrecio = objs.map(precioDe).filter((c) => c !== null);
  const unitario = primero ? precioDe(primero) ?? conPrecio[0] ?? null : null;
  const cantidad = objs.reduce((s, o) => s + peso(o), 0);
  const subtotal = unitario === null ? 0 : objs.reduce((s, o) => s + (precioDe(o) ?? unitario) * peso(o), 0);
  const propios = objs.filter((o) => o.propio).length;
  const pagos = objs.filter((o) => !o.propio);
  const costoTipo = objs.length && propios === objs.length ? 'propio' : ['alquiler', 'compra'].includes(pagos[0]?.costoTipo) ? pagos[0].costoTipo : '';
  const proveedor = txt(base.proveedor).trim() || txt(objs.find((o) => txt(o.proveedor).trim())?.proveedor).trim();
  return {
    codigo: base.codigo,
    clave: base.clave,
    nombre: base.nombre,
    ref: base.ref || '',
    medida: base.medida || '',
    cat: base.cat,
    categoria: nombreCategoria(base.cat),
    cantidad,
    unidad: base.unidad,
    unitario,
    subtotal: r2(subtotal),
    costoTipo,
    proveedor,
    sinPrecio: unitario === null,
    propios,
    mixto: new Set(objs.map((o) => precioDe(o) ?? unitario)).size > 1,
    ids: objs.map((o) => o.id),
  };
}

// Presupuesto: una línea por ítem del listado de materiales con el precio del primer objeto del grupo (los
// propios no se pagan; el vallado se paga por paño), una línea de staff por rol (precio por persona, código
// "staff-<rol>") y los gastos sueltos (extras).
export function presupuesto(escena) {
  const comp = calcular(escena);
  const moneda = monedaDe(escena);
  const porId = new Map(objetosDe(escena).map((o) => [o.id, o]));
  const lineas = [];
  for (const it of comp.items) {
    if (it.tipo === 'puesto') continue; // el staff va aparte, por rol
    const objs = it.ids.map((id) => porId.get(id)).filter(Boolean);
    lineas.push(lineaDe(objs, { codigo: it.codigo, clave: it.clave, nombre: it.nombre, ref: it.ref, medida: it.medida, cat: it.cat, unidad: it.unidad || 'u', proveedor: it.proveedor }));
  }
  // Staff: los puestos no van en el listado de materiales, pero sí se pagan (por persona).
  const puestos = objetosDe(escena).filter((o) => o.tipo === 'puesto' && o.computo !== false);
  for (const rol of Object.keys(ROLES_STAFF)) {
    const grupo = puestos.filter((o) => rolDe(o) === rol);
    if (grupo.length) lineas.push(lineaDe(grupo, { codigo: `staff-${rol}`, clave: `puesto-rol|${rol}`, nombre: `Staff: ${ROLES_STAFF[rol].nombre}`, cat: 'staff', unidad: 'personas', porPersona: true }));
  }
  const extras = extrasDe(escena).map((x) => {
    const monto = leerMonto(x.monto);
    return { id: txt(x.id), concepto: txt(x.concepto).trim(), categoria: txt(x.categoria).trim() || 'Otros gastos', proveedor: txt(x.proveedor).trim(), monto: monto ?? 0, sinPrecio: monto === null };
  });

  const nombresProv = new Map(proveedoresDe(escena).map((p) => [normalizar(p.nombre), txt(p.nombre).trim()]));
  const acumular = (mapa, nombre, monto) => {
    const k = normalizar(nombre);
    const x = mapa.get(k) || { nombre, total: 0, lineas: 0 };
    x.total = r2(x.total + monto);
    x.lineas++;
    mapa.set(k, x);
  };
  const cats = new Map();
  const provs = new Map();
  const tipos = { alquiler: 0, compra: 0, propio: 0, sinTipo: 0 };
  for (const l of lineas) {
    acumular(cats, l.categoria, l.subtotal);
    acumular(provs, l.proveedor ? nombresProv.get(normalizar(l.proveedor)) || l.proveedor : 'Sin proveedor', l.subtotal);
    tipos[l.costoTipo || 'sinTipo'] = r2(tipos[l.costoTipo || 'sinTipo'] + l.subtotal);
  }
  for (const x of extras) {
    acumular(cats, x.categoria, x.monto);
    acumular(provs, x.proveedor ? nombresProv.get(normalizar(x.proveedor)) || x.proveedor : 'Sin proveedor', x.monto);
  }
  const subtotalEquipos = r2(lineas.reduce((s, l) => s + l.subtotal, 0));
  const subtotalExtras = r2(extras.reduce((s, x) => s + x.monto, 0));
  const porProveedor = [...provs.values()].map((x) => ({ proveedor: x.nombre, total: x.total, lineas: x.lineas })).sort((a, b) => (a.proveedor === 'Sin proveedor') - (b.proveedor === 'Sin proveedor') || b.total - a.total);
  return {
    moneda,
    lineas,
    extras,
    porCategoria: [...cats.values()].map((x) => ({ categoria: x.nombre, total: x.total, lineas: x.lineas })),
    porProveedor,
    porTipo: tipos,
    subtotalEquipos,
    subtotalExtras,
    total: r2(subtotalEquipos + subtotalExtras),
    sinPrecio: lineas.filter((l) => l.sinPrecio).length + extras.filter((x) => x.sinPrecio).length,
  };
}

const TIPOS_COSTO = [
  ['', 'Sin definir'],
  ['alquiler', 'Alquiler'],
  ['compra', 'Compra'],
  ['propio', 'Propio'],
];

export function htmlPresupuesto(escena) {
  const P = presupuesto(escena);
  const $ = (n) => fmDinero(n, P.moneda);
  const provs = todosLosProveedores(escena).map((p) => p.nombre);
  const acciones =
    `<label class="pr-etiqueta">Moneda ${selector('escena:presupuesto:moneda', P.moneda, [['ARS', 'Pesos (ARS)'], ['USD', 'Dólares (USD)']])}</label>` +
    boton('exportar:presupuesto-csv', 'Planilla', { titulo: 'Descargar para Excel' });
  let s = cabeza('Presupuesto', nombreEvento(escena), acciones);
  s += kpis([
    ['Total', $(P.total), 'pr-kpi-total'],
    ['Alquiler', $(P.porTipo.alquiler)],
    ['Compra', $(P.porTipo.compra)],
    ['Sin precio', P.sinPrecio ? plural(P.sinPrecio, 'ítem') : 'ninguno'],
  ]);
  if (P.sinPrecio) s += avisosHtml([{ nivel: 'atencion', texto: `Hay ${plural(P.sinPrecio, 'ítem', 'ítems')} sin precio: el total todavía está incompleto.` }]);

  // Equipos y materiales, por categoría.
  if (P.lineas.length) {
    const porCat = new Map();
    for (const l of P.lineas) {
      if (!porCat.has(l.categoria)) porCat.set(l.categoria, []);
      porCat.get(l.categoria).push(l);
    }
    let cuerpo = '';
    for (const [cat, ls] of porCat) {
      cuerpo += `<tr class="pr-fila-grupo"><th colspan="7">${esc(cat)}</th><th class="pr-num">${esc($(ls.reduce((a, l) => a + l.subtotal, 0)))}</th></tr>`;
      for (const l of ls) {
        const pre = `grupo:${l.codigo}:`;
        const dato = { 'data-clave': l.clave };
        const precio =
          l.costoTipo === 'propio'
            ? `<span class="pr-tenue">propio</span>`
            : campo(pre + 'costo', valorMonto(l.unitario), { ...dato, inputmode: 'decimal', clase: 'pr-monto', placeholder: 'Sin precio', 'aria-label': `Precio unitario de ${l.nombre}` }) + (l.unidad === 'personas' ? '<small class="pr-tenue">por persona</small>' : l.unidad === 'paños' ? '<small class="pr-tenue">por paño</small>' : '') + (l.mixto ? '<small class="pr-nota-chica">hay precios distintos</small>' : '');
        cuerpo +=
          `<tr class="${l.sinPrecio ? 'pr-sin-precio' : ''}" data-ids="${esc(l.ids.join(','))}">` +
          `<td class="pr-cod">${typeof l.codigo === 'number' ? l.codigo : ''}</td>` +
          `<td><span class="pr-fuerte">${esc(l.nombre)}</span>${l.ref ? ` <span class="pr-tenue">${esc(l.ref)}</span>` : ''}</td>` +
          `<td class="pr-tenue">${esc(l.medida)}</td>` +
          `<td class="pr-num">${fm(l.cantidad, 0)}${l.unidad === 'u' ? '' : ` ${esc(l.unidad)}`}</td>` +
          `<td class="pr-num">${precio}</td>` +
          `<td>${selector(pre + 'costoTipo', l.costoTipo, TIPOS_COSTO, { ...dato, 'aria-label': 'Alquiler, compra o propio' })}</td>` +
          `<td>${campo(pre + 'proveedor', l.proveedor, { ...dato, list: 'pr-lista-proveedores', placeholder: 'Proveedor', 'aria-label': 'Proveedor' })}</td>` +
          `<td class="pr-num pr-fuerte">${l.sinPrecio ? '<span class="pr-tenue">—</span>' : esc($(l.subtotal))}</td>` +
          `</tr>`;
      }
    }
    s += `<div class="pr-tabla-envoltura"><table class="pr-tabla pr-tabla-presupuesto"><thead><tr><th>Cód.</th><th>Ítem</th><th>Medidas</th><th class="pr-num">Cant.</th><th class="pr-num">Precio unitario</th><th>Tipo</th><th>Proveedor</th><th class="pr-num">Subtotal</th></tr></thead><tbody>${cuerpo}</tbody><tfoot><tr><th colspan="7">Equipos y materiales</th><th class="pr-num">${esc($(P.subtotalEquipos))}</th></tr></tfoot></table></div>`;
  } else {
    s += `<div class="pr-vacio"><p>No hay materiales para presupuestar todavía.</p></div>`;
  }

  // Otros gastos.
  const filasExtra = P.extras
    .map((x) => {
      const pre = `extras:${x.id}:`;
      return (
        `<tr class="${x.sinPrecio ? 'pr-sin-precio' : ''}">` +
        `<td>${campo(pre + 'concepto', x.concepto, { placeholder: 'Flete, permisos, catering…', 'aria-label': 'Concepto' })}</td>` +
        `<td>${campo(pre + 'categoria', x.categoria, { list: 'pr-lista-categorias', 'aria-label': 'Categoría' })}</td>` +
        `<td>${campo(pre + 'proveedor', x.proveedor, { list: 'pr-lista-proveedores', placeholder: 'Proveedor', 'aria-label': 'Proveedor' })}</td>` +
        `<td class="pr-num">${campo(pre + 'monto', x.sinPrecio ? '' : valorMonto(x.monto), { inputmode: 'decimal', clase: 'pr-monto', placeholder: 'Sin precio', 'aria-label': 'Monto' })}</td>` +
        `<td class="pr-acciones-fila">${boton(`borrar:extras:${x.id}`, 'Borrar', { clase: 'pr-boton-chico pr-boton-borrar', titulo: 'Borrar este gasto' })}</td>` +
        `</tr>`
      );
    })
    .join('');
  s += `<section class="pr-seccion"><div class="pr-seccion-cabeza"><h3>Otros gastos</h3>${boton('agregar-extra', 'Agregar gasto')}</div>`;
  s += P.extras.length
    ? `<div class="pr-tabla-envoltura"><table class="pr-tabla pr-tabla-extras"><thead><tr><th>Concepto</th><th>Categoría</th><th>Proveedor</th><th class="pr-num">Monto</th><th></th></tr></thead><tbody>${filasExtra}</tbody><tfoot><tr><th colspan="3">Otros gastos</th><th class="pr-num">${esc($(P.subtotalExtras))}</th><th></th></tr></tfoot></table></div>`
    : `<p class="pr-tenue">Fletes, permisos, seguros, catering del staff: lo que no es un objeto del plano.</p>`;
  s += `</section>`;

  // Resúmenes.
  const resumen = (titulo, filas, col) =>
    filas.length
      ? `<div class="pr-resumen"><h3>${esc(titulo)}</h3><table class="pr-tabla pr-tabla-resumen"><tbody>${filas
          .map((f) => `<tr><td>${esc(f[col])}</td><td class="pr-num">${esc($(f.total))}</td><td class="pr-num pr-tenue">${P.total > 0 ? `${fm((f.total / P.total) * 100, 0)} %` : ''}</td></tr>`)
          .join('')}</tbody></table></div>`
      : '';
  s += `<div class="pr-columnas">${resumen('Por categoría', P.porCategoria, 'categoria')}${resumen('Por proveedor', P.porProveedor, 'proveedor')}</div>`;
  s += `<div class="pr-total"><span>Total${P.sinPrecio ? ' (incompleto)' : ''}</span><strong>${esc($(P.total))}</strong></div>`;
  s += datalist('pr-lista-proveedores', provs);
  s += datalist('pr-lista-categorias', [...CATEGORIAS.map(([, n]) => n), 'Logística', 'Personal', 'Permisos y seguros', 'Comunicación', 'Otros gastos', ...P.extras.map((x) => x.categoria)]);
  return `<section class="pr-panel pr-panel-presupuesto">${s}</section>`;
}

export function csvPresupuesto(escena) {
  const P = presupuesto(escena);
  const m = P.moneda;
  const filas = [['Código', 'Categoría', 'Ítem', 'Modelo / ref.', 'Medidas', 'Cantidad', 'Unidad', 'Tipo', `Precio unitario (${m})`, `Subtotal (${m})`, 'Proveedor', 'Nota']];
  const tipo = (t) => TIPOS_COSTO.find(([k]) => k === t)?.[1] || '';
  for (const l of P.lineas) {
    const nota = [l.sinPrecio && 'sin precio', l.mixto && 'precios distintos entre unidades', l.propios && l.costoTipo !== 'propio' && `${l.propios} propios`].filter(Boolean).join(', ');
    filas.push([typeof l.codigo === 'number' ? l.codigo : '', l.categoria, l.nombre, l.ref, l.medida, l.cantidad, l.unidad, l.costoTipo ? tipo(l.costoTipo) : '', numCsv(l.unitario), l.sinPrecio ? '' : numCsv(l.subtotal), l.proveedor, nota]);
  }
  filas.push(['', '', 'Equipos y materiales', '', '', '', '', '', '', numCsv(P.subtotalEquipos), '', '']);
  if (P.extras.length) {
    filas.push([]);
    filas.push(['', 'Categoría', 'Otros gastos', '', '', '', '', '', '', `Monto (${m})`, 'Proveedor', '']);
    for (const x of P.extras) filas.push(['', x.categoria, x.concepto, '', '', '', '', '', '', x.sinPrecio ? '' : numCsv(x.monto), x.proveedor, x.sinPrecio ? 'sin precio' : '']);
    filas.push(['', '', 'Otros gastos', '', '', '', '', '', '', numCsv(P.subtotalExtras), '', '']);
  }
  filas.push([]);
  filas.push(['', 'Por categoría', '', '', '', '', '', '', '', `Total (${m})`, '', '']);
  for (const c of P.porCategoria) filas.push(['', c.categoria, '', '', '', '', '', '', '', numCsv(c.total), '', '']);
  filas.push([]);
  filas.push(['', 'Por proveedor', '', '', '', '', '', '', '', `Total (${m})`, '', '']);
  for (const p of P.porProveedor) filas.push(['', p.proveedor, '', '', '', '', '', '', '', numCsv(p.total), '', '']);
  filas.push([]);
  filas.push(['', 'TOTAL', '', '', '', '', '', '', '', numCsv(P.total), '', P.sinPrecio ? `faltan ${P.sinPrecio} precios` : '']);
  return armarCsv(filas);
}

/* ================================================================== comparar variantes */

// Potencia total (W) de todos los objetos: la suya o la típica del tipo. Generadores y tableros no consumen.
export function potenciaTotal(escena) {
  return objetosDe(escena).reduce((s, o) => {
    if (o.tipo === 'generador' || o.tipo === 'tablero') return s;
    const n = numero(o.potencia);
    return s + Math.max(0, n !== null ? n : Number(defDatos(o).potencia) || 0);
  }, 0);
}

const textoMedidas = (o) => (Array.isArray(o.dims) ? o.dims.slice(0, 3).map((v) => fm(numero(v) ?? 0)).join(' × ') + ' m' : '');

function cambiosObjeto(x, y, monedaA, monedaB) {
  const c = [];
  const nombreTipo = (o) => defDatos(o).nombre || o.tipo;
  if (x.tipo !== y.tipo) c.push({ campo: 'tipo', texto: `tipo: ${nombreTipo(x)} → ${nombreTipo(y)}` });
  const px = Array.isArray(x.pos) ? x.pos.map((v) => numero(v) ?? 0) : [0, 0];
  const py = Array.isArray(y.pos) ? y.pos.map((v) => numero(v) ?? 0) : [0, 0];
  const d = Math.hypot(py[0] - px[0], py[1] - px[1]);
  if (d > 0.01) c.push({ campo: 'pos', texto: `se movió ${fm(d)} m` });
  const giro = (((((numero(y.rot) ?? 0) - (numero(x.rot) ?? 0)) % 360) + 540) % 360) - 180;
  if (Math.abs(giro) > 0.5) c.push({ campo: 'rot', texto: `giró ${fm(Math.abs(giro), 0)}°` });
  const dx = Array.isArray(x.dims) ? x.dims : [];
  const dy = Array.isArray(y.dims) ? y.dims : [];
  if ([0, 1, 2].some((i) => Math.abs((numero(dx[i]) ?? 0) - (numero(dy[i]) ?? 0)) > 0.005)) c.push({ campo: 'dims', texto: `medidas: ${textoMedidas(x)} → ${textoMedidas(y)}` });
  const ex = numero(x.elev) ?? 0;
  const ey = numero(y.elev) ?? 0;
  if (Math.abs(ex - ey) > 0.005) c.push({ campo: 'elev', texto: `altura de la base: ${fm(ex)} → ${fm(ey)} m` });
  for (const [k, rot] of [['nombre', 'nombre'], ['ref', 'modelo'], ['proveedor', 'proveedor'], ['rol', 'rol'], ['turno', 'turno']]) {
    const a = txt(x[k]).trim();
    const b = txt(y[k]).trim();
    if (a !== b) c.push({ campo: k, texto: `${rot}: ${a ? `«${a}»` : '(vacío)'} → ${b ? `«${b}»` : '(vacío)'}` });
  }
  if (personasDe(x) !== personasDe(y) && (x.tipo === 'puesto' || y.tipo === 'puesto')) c.push({ campo: 'personas', texto: `personas: ${personasDe(x)} → ${personasDe(y)}` });
  const cx = precioDe(x);
  const cy = precioDe(y);
  if (cx !== cy) c.push({ campo: 'costo', texto: `precio: ${cx === null ? 'sin precio' : fmDinero(cx, monedaA)} → ${cy === null ? 'sin precio' : fmDinero(cy, monedaB)}` });
  return c;
}

// Diferencias entre dos escenas (dos variantes del mismo lugar): objetos agregados, quitados y cambiados
// (por id), materiales, superficies, presupuesto, potencia, staff y aforo. "a" es la de referencia.
export function compararEscenas(a, b) {
  const oa = new Map(objetosDe(a).map((o) => [String(o.id), o]));
  const ob = new Map(objetosDe(b).map((o) => [String(o.id), o]));
  const corto = (o) => ({ id: o.id, nombre: txt(o.nombre).trim() || defDatos(o).nombre, tipo: o.tipo, categoria: nombreCategoria(catDe(o)) });
  const agregados = [...ob.values()].filter((o) => !oa.has(String(o.id))).map(corto);
  const quitados = [...oa.values()].filter((o) => !ob.has(String(o.id))).map(corto);
  const monedaA = monedaDe(a);
  const monedaB = monedaDe(b);
  const cambiados = [];
  for (const [id, x] of oa) {
    const y = ob.get(id);
    if (!y) continue;
    const cambios = cambiosObjeto(x, y, monedaA, monedaB);
    if (cambios.length) cambiados.push({ ...corto(y), cambios });
  }

  const ca = calcular(a);
  const cb = calcular(b);
  const ordenCat = new Map(CATEGORIAS.map(([c], i) => [c, i]));
  const filas = new Map();
  const fila = (k, base) => {
    if (!filas.has(k)) filas.set(k, { ...base, a: 0, b: 0 });
    return filas.get(k);
  };
  for (const it of ca.items) fila(it.clave, { nombre: it.nombre, ref: it.ref, medida: it.medida, cat: it.cat, unidad: 'u' }).a = it.cantidad;
  for (const it of cb.items) fila(it.clave, { nombre: it.nombre, ref: it.ref, medida: it.medida, cat: it.cat, unidad: 'u' }).b = it.cantidad;
  const items = [...filas.values()].sort((p, q) => (ordenCat.get(p.cat) ?? 99) - (ordenCat.get(q.cat) ?? 99) || p.nombre.localeCompare(q.nombre, 'es') || p.medida.localeCompare(q.medida, 'es'));
  const deriv = new Map();
  for (const d of ca.derivados) deriv.set(d.nombre, { nombre: d.nombre, ref: '', medida: '', cat: '', unidad: d.unidad, dec: d.dec, derivado: true, a: d.cantidad, b: 0 });
  for (const d of cb.derivados) {
    const f = deriv.get(d.nombre) || { nombre: d.nombre, ref: '', medida: '', cat: '', unidad: d.unidad, dec: d.dec, derivado: true, a: 0, b: 0 };
    f.b = d.cantidad;
    deriv.set(d.nombre, f);
  }
  const materiales = [...items, ...deriv.values()].map((f) => ({ ...f, categoria: f.derivado ? 'Para el armado' : nombreCategoria(f.cat), diferencia: r2(f.b - f.a) }));

  const sup = new Map();
  for (const [lado, c] of [['a', ca], ['b', cb]]) {
    for (const s of c.superficies) {
      const k = `${s.tipo}|${normalizar(s.nombre)}`;
      const f = sup.get(k) || { nombre: s.nombre, tipo: s.tipo, a: null, b: null };
      f[lado] = r2((f[lado] || 0) + s.m2);
      sup.set(k, f);
    }
  }
  const superficies = [...sup.values()].map((f) => ({ ...f, diferencia: r2((f.b ?? 0) - (f.a ?? 0)) }));

  const pa = presupuesto(a);
  const pb = presupuesto(b);
  const cats = new Map();
  for (const [lado, P] of [['a', pa], ['b', pb]]) {
    for (const c of P.porCategoria) {
      const k = normalizar(c.categoria);
      const f = cats.get(k) || { categoria: c.categoria, a: 0, b: 0 };
      f[lado] = c.total;
      cats.set(k, f);
    }
  }
  const zonasM2 = (c) => c.superficies.filter((s) => s.tipo === 'Zona').reduce((s, z) => s + z.m2, 0);
  const sa = resumenStaff(a);
  const sb = resumenStaff(b);
  const par = (x, y) => ({ a: x, b: y, diferencia: x === null || y === null ? null : r2(y - x) });
  return {
    objetos: { agregados, quitados, cambiados },
    materiales,
    superficies,
    presupuesto: {
      a: pa.total,
      b: pb.total,
      diferencia: r2(pb.total - pa.total),
      monedaA,
      monedaB,
      sinPrecioA: pa.sinPrecio,
      sinPrecioB: pb.sinPrecio,
      porCategoria: [...cats.values()].map((f) => ({ ...f, diferencia: r2(f.b - f.a) })),
    },
    potencia: par(potenciaTotal(a), potenciaTotal(b)),
    resumen: {
      objetos: par(oa.size, ob.size),
      unidades: par(ca.total, cb.total),
      items: par(ca.items.length, cb.items.length),
      zonas: par(r2(zonasM2(ca)), r2(zonasM2(cb))),
      staff: par(sa.total, sb.total),
      aforo: par(sa.aforo.personas, sb.aforo.personas),
    },
  };
}

const MENOS = '−';
function signo(n, fmt = (v) => fm(v, Number.isInteger(v) ? 0 : 2)) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (Math.abs(n) < 1e-9) return '=';
  return `${n > 0 ? '+' : MENOS}${fmt(Math.abs(n))}`;
}
const claseDif = (n) => (n === null || n === undefined || Math.abs(n) < 1e-9 ? 'pr-dif-igual' : n > 0 ? 'pr-dif-mas' : 'pr-dif-menos');

export function htmlComparacion(a, b, { nombreA, nombreB } = {}) {
  const A = txt(nombreA).trim() || txt(a?.nombre).trim() || 'Esta escena';
  const B = txt(nombreB).trim() || txt(b?.nombre).trim() || 'La otra';
  const C = compararEscenas(a, b);
  const mon = C.presupuesto.monedaA;
  const mismaMoneda = C.presupuesto.monedaA === C.presupuesto.monedaB;
  const entero = (v) => (v === null || v === undefined ? '—' : fm(v, 0));
  const cab = `<thead><tr><th></th><th class="pr-num">${esc(A)}</th><th class="pr-num">${esc(B)}</th><th class="pr-num">Diferencia</th></tr></thead>`;
  const filaRes = (concepto, p, fmt = entero, fmtDif = (v) => fm(v, Number.isInteger(v) ? 0 : 1)) =>
    `<tr class="${claseDif(p.diferencia)}"><td>${esc(concepto)}</td><td class="pr-num">${esc(fmt(p.a))}</td><td class="pr-num">${esc(fmt(p.b))}</td><td class="pr-num pr-fuerte">${esc(signo(p.diferencia, fmtDif))}</td></tr>`;
  const P = C.presupuesto;
  const R = C.resumen;
  let s = `<div class="pr-comparacion">`;
  s += `<table class="pr-tabla pr-tabla-comparar">${cab}<tbody>`;
  s += filaRes('Objetos', R.objetos);
  s += filaRes('Unidades de materiales', R.unidades);
  s += filaRes('Ítems del listado', R.items);
  s += mismaMoneda
    ? filaRes('Presupuesto', { a: P.a, b: P.b, diferencia: P.diferencia }, (v) => fmDinero(v, mon), (v) => fmDinero(v, mon))
    : `<tr><td>Presupuesto</td><td class="pr-num">${esc(fmDinero(P.a, P.monedaA))}</td><td class="pr-num">${esc(fmDinero(P.b, P.monedaB))}</td><td class="pr-num pr-tenue">monedas distintas</td></tr>`;
  if (P.sinPrecioA || P.sinPrecioB) s += filaRes('Ítems sin precio', { a: P.sinPrecioA, b: P.sinPrecioB, diferencia: P.sinPrecioB - P.sinPrecioA });
  s += filaRes('Potencia (kW)', { a: C.potencia.a / 1000, b: C.potencia.b / 1000, diferencia: C.potencia.diferencia / 1000 }, (v) => fm(v, 1), (v) => fm(v, 1));
  s += filaRes('Zonas (m²)', R.zonas, (v) => fm(v, 1), (v) => fm(v, 1));
  s += filaRes('Staff (personas)', R.staff);
  if (R.aforo.a !== null || R.aforo.b !== null) s += filaRes('Aforo', R.aforo);
  s += `</tbody></table>`;

  const distintos = C.materiales.filter((m) => m.diferencia !== 0);
  const iguales = C.materiales.length - distintos.length;
  const filaMat = (m) =>
    `<tr class="${claseDif(m.diferencia)}"><td>${esc(m.nombre)}${m.ref ? ` <span class="pr-tenue">${esc(m.ref)}</span>` : ''}</td><td class="pr-tenue">${esc(m.medida)}</td><td class="pr-num">${esc(fm(m.a, m.dec ?? 0))}</td><td class="pr-num">${esc(fm(m.b, m.dec ?? 0))}</td><td class="pr-num pr-fuerte">${esc(signo(m.diferencia, (v) => fm(v, m.dec ?? 0)))}${m.unidad !== 'u' ? ` ${esc(m.unidad)}` : ''}</td></tr>`;
  const cabMat = `<thead><tr><th>Ítem</th><th>Medidas</th><th class="pr-num">${esc(A)}</th><th class="pr-num">${esc(B)}</th><th class="pr-num">Diferencia</th></tr></thead>`;
  s += `<section class="pr-seccion"><h3>Materiales</h3>`;
  s += distintos.length ? `<table class="pr-tabla pr-tabla-comparar">${cabMat}<tbody>${distintos.map(filaMat).join('')}</tbody></table>` : `<p class="pr-tenue">Los dos listados de materiales son iguales.</p>`;
  if (iguales && distintos.length) s += `<details class="pr-detalles"><summary>Ver todos los materiales (${plural(iguales, 'ítem igual', 'ítems iguales')})</summary><table class="pr-tabla pr-tabla-comparar">${cabMat}<tbody>${C.materiales.map(filaMat).join('')}</tbody></table></details>`;
  s += `</section>`;

  const { agregados, quitados, cambiados } = C.objetos;
  s += `<section class="pr-seccion"><h3>Objetos</h3>`;
  if (!agregados.length && !quitados.length && !cambiados.length) s += `<p class="pr-tenue">Los objetos son los mismos y están en el mismo lugar.</p>`;
  const listaObj = (titulo, clase, xs, detalle) =>
    xs.length
      ? `<div class="pr-cambios ${clase}"><h4>${esc(titulo)} <span>${xs.length}</span></h4><ul class="pr-lista">${xs
          .map((o) => `<li class="pr-lista-fila" data-ids="${esc(o.id)}"><strong>${esc(o.nombre)}</strong> <span class="pr-tenue">${esc(o.categoria)}</span>${detalle ? detalle(o) : ''}</li>`)
          .join('')}</ul></div>`
      : '';
  s += listaObj(`Están en «${B}» y no en «${A}»`, 'pr-dif-mas', agregados);
  s += listaObj(`Están en «${A}» y no en «${B}»`, 'pr-dif-menos', quitados);
  s += listaObj('Cambiaron', 'pr-dif-cambio', cambiados, (o) => `<span class="pr-detalle-cambio">${esc(o.cambios.map((c) => c.texto).join(' · '))}</span>`);
  s += `</section>`;

  const supDif = C.superficies.filter((x) => Math.abs(x.diferencia) > 0.05 || x.a === null || x.b === null);
  if (supDif.length) {
    s += `<section class="pr-seccion"><h3>Superficies</h3><table class="pr-tabla pr-tabla-comparar"><thead><tr><th>Nombre</th><th>Tipo</th><th class="pr-num">${esc(A)}</th><th class="pr-num">${esc(B)}</th><th class="pr-num">Diferencia</th></tr></thead><tbody>${supDif
      .map((x) => `<tr class="${claseDif(x.diferencia)}"><td>${esc(x.nombre)}</td><td class="pr-tenue">${esc(x.tipo)}</td><td class="pr-num">${x.a === null ? '—' : `${fm(x.a, 1)} m²`}</td><td class="pr-num">${x.b === null ? '—' : `${fm(x.b, 1)} m²`}</td><td class="pr-num pr-fuerte">${esc(signo(x.diferencia, (v) => fm(v, 1)))}</td></tr>`)
      .join('')}</tbody></table></section>`;
  }
  const catDif = P.porCategoria.filter((c) => Math.abs(c.diferencia) > 0.005);
  if (catDif.length && mismaMoneda) {
    s += `<section class="pr-seccion"><h3>Presupuesto por categoría</h3><table class="pr-tabla pr-tabla-comparar">${cab}<tbody>${catDif
      .map((c) => `<tr class="${claseDif(c.diferencia)}"><td>${esc(c.categoria)}</td><td class="pr-num">${esc(fmDinero(c.a, mon))}</td><td class="pr-num">${esc(fmDinero(c.b, mon))}</td><td class="pr-num pr-fuerte">${esc(signo(c.diferencia, (v) => fmDinero(v, mon)))}</td></tr>`)
      .join('')}</tbody></table></section>`;
  }
  s += `</div>`;
  return s;
}

function htmlPestanaComparar(escena, ctx) {
  const opciones = (Array.isArray(ctx.listaEscenas) ? ctx.listaEscenas : [])
    .map((x) => (typeof x === 'string' ? { slug: x, nombre: x } : { slug: txt(x?.slug), nombre: txt(x?.nombre || x?.slug) }))
    .filter((x) => x.slug && x.slug !== ctx.slugActual);
  const elegida = txt(ctx.slugOtra);
  const sel = `<select class="pr-campo" data-prod-comparar aria-label="Escena para comparar"><option value="">Elegí una escena…</option>${opciones
    .map((x) => `<option value="${esc(x.slug)}"${x.slug === elegida ? ' selected' : ''}>${esc(x.nombre)}</option>`)
    .join('')}</select>`;
  const otra = ctx.otraEscena && typeof ctx.otraEscena === 'object' ? ctx.otraEscena : null;
  const nombreOtra = txt(ctx.nombreOtra).trim() || txt(otra?.nombre).trim();
  let s = cabeza('Comparar variantes', otra ? `«${txt(escena?.nombre).trim() || 'Esta escena'}» contra «${nombreOtra || 'la otra'}»` : 'Diferencias de objetos, materiales, costo y potencia entre dos escenas', `<label class="pr-etiqueta">Comparar con ${sel}</label>`);
  if (!opciones.length && !otra) s += `<div class="pr-vacio"><p>Para comparar hace falta otra escena. Duplicá esta («Duplicar escena») y probá otra distribución.</p></div>`;
  else if (!otra) s += `<div class="pr-vacio"><p>Elegí otra escena (por ejemplo, una variante de distribución del mismo lugar) para ver qué cambia.</p></div>`;
  else s += htmlComparacion(escena, otra, { nombreA: escena?.nombre, nombreB: nombreOtra });
  return `<section class="pr-panel pr-panel-comparar">${s}</section>`;
}

/* ================================================================== vista completa */

// HTML de la pestaña pedida, con la barra de pestañas arriba (contexto.pestanas === false la saca).
// contexto: { ahora, otraEscena, nombreOtra, slugOtra, listaEscenas, slugActual, pestanas }
export function htmlProduccion(escena, pestana = 'cronograma', contexto = {}) {
  const ctx = contexto || {};
  const p = PESTANAS.some(([k]) => k === pestana) ? pestana : 'cronograma';
  let cuerpo;
  try {
    if (p === 'cronograma') cuerpo = htmlCronograma(escena, { ahora: ctx.ahora });
    else if (p === 'proveedores') cuerpo = htmlProveedores(escena);
    else if (p === 'staff') cuerpo = htmlStaff(escena);
    else if (p === 'presupuesto') cuerpo = htmlPresupuesto(escena);
    else cuerpo = htmlPestanaComparar(escena, ctx);
  } catch (err) {
    cuerpo = `<div class="pr-vacio pr-error"><p>No se pudo armar esta pestaña: ${esc(err?.message || err)}</p></div>`;
  }
  if (ctx.pestanas === false) return `<div class="pr-produccion" data-pestana="${p}">${cuerpo}</div>`;
  let contadores = {};
  try {
    contadores = {
      cronograma: tareasDe(escena).length,
      proveedores: proveedoresDe(escena).length,
      staff: objetosDe(escena).filter((o) => o.tipo === 'puesto').reduce((s, o) => s + personasDe(o), 0),
    };
  } catch {
    contadores = {};
  }
  const tabs = PESTANAS.map(
    ([k, nombre]) =>
      `<button type="button" class="pr-pestana${k === p ? ' pr-activa' : ''}" role="tab" aria-selected="${k === p}" data-prod-pestana="${k}">${esc(nombre)}${contadores[k] ? ` <span class="pr-contador">${fm(contadores[k], 0)}</span>` : ''}</button>`
  ).join('');
  return `<div class="pr-produccion" data-pestana="${p}"><nav class="pr-pestanas" role="tablist" aria-label="Producción">${tabs}</nav>${cuerpo}</div>`;
}

/* ================================================================== edición */

const nombreEnLista = (e, v) => txt(proveedoresDe(e).find((p) => normalizar(p.nombre) === normalizar(v))?.nombre).trim() || v;

// Aplica el valor de un control con data-prod="<colección>:<id>:<campo>". Lee elemento.value (o .checked
// en una casilla). Devuelve true si cambió la escena; false si el valor no sirve o es el mismo.
export function aplicarEdicion(escena, elemento) {
  const clave = elemento?.dataset?.prod;
  if (!escena || typeof escena !== 'object' || typeof clave !== 'string') return false;
  const partes = clave.split(':');
  if (partes.length < 3) return false;
  const coleccion = partes[0];
  const campoN = partes[partes.length - 1];
  const id = partes.slice(1, -1).join(':');
  const valor = txt(elemento.value);
  const marcado = typeof elemento.checked === 'boolean' && (elemento.type === 'checkbox' || elemento.value === undefined) ? elemento.checked : ['true', '1', 'si', 'on'].includes(normalizar(valor));
  switch (coleccion) {
    case 'proveedores':
      return editarProveedor(escena, id, campoN, valor);
    case 'tareas':
      return editarTarea(escena, id, campoN, valor, marcado);
    case 'extras':
      return editarExtra(escena, id, campoN, valor);
    case 'grupo':
      return editarGrupo(escena, id, campoN, valor, elemento.dataset.clave);
    case 'puestos':
      return editarPuesto(escena, id, campoN, valor);
    case 'escena':
      return editarEscena(escena, id, campoN, valor);
    default:
      return false;
  }
}

const CAMPOS_PROVEEDOR = ['nombre', 'rubro', 'contacto', 'telefono', 'email', 'llegada', 'retiro', 'acceso', 'notas'];

function editarProveedor(e, id, campoN, valor) {
  const p = buscar(proveedoresDe(e), id);
  if (!p || !CAMPOS_PROVEEDOR.includes(campoN)) return false;
  const v = valor.trim().replace(/[ \t]+/g, ' ');
  if (campoN === 'nombre') return renombrarProveedor(e, p, v);
  if (campoN === 'llegada' || campoN === 'retiro') {
    if (!v) return ponerTexto(p, campoN, '');
    const base = p[campoN] || p.llegada || e.proyecto?.inicio || e.proyecto?.fecha;
    let f = leerFecha(v, base);
    if (!f) return false;
    // Retiro escrito solo con la hora y antes de la llegada: es al otro día.
    const L = aMinutos(p.llegada);
    if (campoN === 'retiro' && soloHora(v) && L !== null && aMinutos(f) <= L) f = deMinutos(aMinutos(f) + 1440);
    const cambio = ponerTexto(p, campoN, f);
    if (cambio) moverTareaDeProveedor(e, p, campoN, f);
    return cambio;
  }
  if (campoN === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
  if (campoN === 'telefono' && v && (v.replace(/\D/g, '').length < 6 || /[a-z]/i.test(v))) return false;
  return ponerTexto(p, campoN, campoN === 'notas' ? valor.trim() : v);
}

// Cambiar el nombre de un proveedor lo cambia también en sus objetos, tareas y gastos.
function renombrarProveedor(e, p, nuevo) {
  const viejo = txt(p.nombre).trim();
  if (!nuevo || nuevo === viejo) return false;
  const nn = normalizar(nuevo);
  if (proveedoresDe(e).some((q) => q !== p && normalizar(q.nombre) === nn)) return false;
  const nv = normalizar(viejo);
  p.nombre = nuevo;
  if (!nv) return true;
  for (const o of objetosDe(e)) if (normalizar(o.proveedor) === nv) o.proveedor = nuevo;
  for (const x of extrasDe(e)) if (normalizar(x.proveedor) === nv) x.proveedor = nuevo;
  for (const t of tareasDe(e)) {
    if (normalizar(t.proveedor) === nv) t.proveedor = nuevo;
    if (typeof t.clave === 'string' && t.clave.endsWith(':' + nv)) {
      t.clave = t.clave.slice(0, -nv.length) + nn;
      if (viejo && txt(t.nombre).includes(viejo)) t.nombre = txt(t.nombre).split(viejo).join(nuevo);
    }
  }
  return true;
}

// La tarea de llegada (o retiro) que armó el borrador sigue al horario del proveedor.
function moverTareaDeProveedor(e, p, campoN, f) {
  const clave = `${campoN}:${normalizar(p.nombre)}`;
  const t = tareasDe(e).find((x) => x.clave === clave && x.hecha !== true);
  if (!t) return;
  const ini = aMinutos(t.inicio);
  const fin = aMinutos(t.fin);
  const dur = ini !== null && fin !== null && fin >= ini ? fin - ini : 60;
  t.inicio = f;
  t.fin = deMinutos(aMinutos(f) + dur);
}

function editarTarea(e, id, campoN, valor, marcado) {
  const t = buscar(tareasDe(e), id);
  if (!t) return false;
  const v = valor.trim().replace(/[ \t]+/g, ' ');
  const ini = aMinutos(t.inicio);
  const fin = aMinutos(t.fin);
  const v0 = ventanaShow(e);
  const baseDia = t.inicio || t.fin || (v0 ? deMinutos(v0.inicio) : '');
  switch (campoN) {
    case 'nombre':
      return v ? ponerTexto(t, 'nombre', v) : false;
    case 'etapa':
      return ETAPAS[v] ? ponerTexto(t, 'etapa', v) : false;
    case 'responsable':
      return ponerTexto(t, 'responsable', v);
    case 'proveedor':
      return ponerTexto(t, 'proveedor', v ? nombreEnLista(e, v) : '');
    case 'hecha':
      if ((t.hecha === true) === marcado) return false;
      t.hecha = marcado;
      return true;
    case 'inicio': {
      const f = leerFecha(v, baseDia);
      if (!f) return false;
      // Mover el inicio corre la tarea entera (la duración queda igual).
      const dur = ini !== null && fin !== null && fin >= ini ? fin - ini : 60;
      const nuevoFin = deMinutos(aMinutos(f) + dur);
      if (t.inicio === f && t.fin === nuevoFin) return false;
      t.inicio = f;
      t.fin = nuevoFin;
      return true;
    }
    case 'fin': {
      // Solo la hora: la primera vez que llega esa hora después del inicio.
      let f = leerFecha(v, soloHora(v) && ini !== null ? t.inicio : t.fin || baseDia);
      if (!f) return false;
      if (ini !== null && soloHora(v) && aMinutos(f) < ini) f = deMinutos(aMinutos(f) + 1440);
      if (ini !== null && aMinutos(f) < ini) return false;
      return ponerTexto(t, 'fin', f);
    }
    case 'duracion': {
      const d = leerDuracion(v);
      if (d === null || ini === null) return false;
      return ponerTexto(t, 'fin', deMinutos(ini + d));
    }
    case 'ids': {
      const existentes = new Set(objetosDe(e).map((o) => String(o.id)));
      const ids = [...new Set(v.split(/[\s,;]+/).filter((x) => existentes.has(x)))];
      if (ids.join(',') === idsDe(t).join(',')) return false;
      t.ids = ids;
      return true;
    }
    default:
      return false;
  }
}

function editarExtra(e, id, campoN, valor) {
  const x = buscar(extrasDe(e), id);
  if (!x) return false;
  const v = valor.trim().replace(/[ \t]+/g, ' ');
  if (campoN === 'concepto') return v ? ponerTexto(x, 'concepto', v) : false;
  if (campoN === 'categoria') return ponerTexto(x, 'categoria', v);
  if (campoN === 'proveedor') return ponerTexto(x, 'proveedor', v ? nombreEnLista(e, v) : '');
  if (campoN === 'monto') {
    if (!v) {
      if (x.monto === undefined) return false;
      delete x.monto;
      return true;
    }
    const n = leerMonto(v);
    if (n === null || x.monto === n) return false;
    x.monto = n;
    return true;
  }
  return false;
}

// Objetos de una línea del presupuesto: por su clave (data-clave, lo más seguro) o por el código del listado.
function objetosDeGrupo(e, codigo, clave) {
  const k = txt(clave);
  const staff = k.startsWith('puesto-rol|') ? k.slice('puesto-rol|'.length) : !k && txt(codigo).startsWith('staff-') ? txt(codigo).slice('staff-'.length) : null;
  if (staff !== null) return objetosDe(e).filter((o) => o.tipo === 'puesto' && rolDe(o) === staff);
  const comp = calcular(e);
  const it = k ? comp.items.find((i) => i.clave === k) : comp.items.find((i) => String(i.codigo) === String(codigo));
  if (!it) return [];
  const ids = new Set(it.ids);
  return objetosDe(e).filter((o) => ids.has(o.id));
}

// Precio, tipo o proveedor de un ítem: se escribe en TODOS los objetos del grupo.
function editarGrupo(e, codigo, campoN, valor, clave) {
  const objs = objetosDeGrupo(e, codigo, clave);
  if (!objs.length) return false;
  const v = valor.trim();
  let cambio = false;
  // Pone (o borra, con undefined) un campo en un objeto y anota si cambió algo.
  const poner = (o, k, x) => {
    if (x === undefined ? o[k] === undefined : o[k] === x) return;
    if (x === undefined) delete o[k];
    else o[k] = x;
    cambio = true;
  };
  if (campoN === 'costo') {
    if (!v) {
      for (const o of objs) poner(o, 'costo', undefined);
      return cambio;
    }
    const n = leerMonto(v);
    if (n === null || n < 0) return false;
    for (const o of objs) {
      poner(o, 'costo', n);
      if (n > 0) poner(o, 'propio', undefined);
    }
    return cambio;
  }
  if (campoN === 'costoTipo') {
    if (!TIPOS_COSTO.some(([k]) => k === v)) return false;
    for (const o of objs) {
      if (v === 'propio') {
        poner(o, 'propio', true);
        continue;
      }
      poner(o, 'propio', undefined);
      poner(o, 'costoTipo', v || undefined);
    }
    return cambio;
  }
  if (campoN === 'proveedor') {
    const nombre = v ? nombreEnLista(e, v.replace(/\s+/g, ' ')) : '';
    for (const o of objs) poner(o, 'proveedor', nombre || undefined);
    return cambio;
  }
  return false;
}

function editarPuesto(e, id, campoN, valor) {
  const o = objetosDe(e).find((x) => x.tipo === 'puesto' && String(x.id) === String(id));
  if (!o) return false;
  const v = valor.trim().replace(/[ \t]+/g, ' ');
  if (campoN === 'nombre') return v ? ponerTexto(o, 'nombre', v) : false;
  if (campoN === 'rol') return ROLES_STAFF[v] ? ponerTexto(o, 'rol', v) : false;
  if (campoN === 'personas') {
    const n = numero(v);
    if (n === null || n < 0 || n > 9999) return false;
    const r = Math.round(n);
    if (o.personas === r) return false;
    o.personas = r;
    return true;
  }
  if (campoN === 'turno') {
    if (!v) {
      if (o.turno === undefined) return false;
      delete o.turno;
      return true;
    }
    return ponerTexto(o, 'turno', leerTurno(v)?.texto || v);
  }
  if (campoN === 'costo') {
    if (!v) {
      if (o.costo === undefined) return false;
      delete o.costo;
      return true;
    }
    const n = leerMonto(v);
    if (n === null || n < 0 || o.costo === n) return false;
    o.costo = n;
    return true;
  }
  return false;
}

// Datos generales: escena:proyecto:inicio|fin|aforo|evento|lugar|responsable, escena:servicios:
// personasPorSeguridad y escena:presupuesto:moneda.
function editarEscena(e, seccion, campoN, valor) {
  const v = valor.trim().replace(/[ \t]+/g, ' ');
  const borrar = (obj, k) => {
    if (!obj || obj[k] === undefined) return false;
    delete obj[k];
    return true;
  };
  if (seccion === 'proyecto') {
    const pr = e.proyecto && typeof e.proyecto === 'object' && !Array.isArray(e.proyecto) ? e.proyecto : null;
    if (campoN === 'inicio' || campoN === 'fin') {
      if (!v) return borrar(pr, campoN);
      const base = (pr && (pr[campoN] || pr.inicio || pr.fecha)) || '';
      let f = leerFecha(v, base);
      if (!f) return false;
      const ini = aMinutos(pr?.inicio);
      if (campoN === 'fin' && ini !== null && aMinutos(f) <= ini) {
        if (!soloHora(v)) return false;
        f = deMinutos(aMinutos(f) + 1440);
      }
      const cambio = ponerTexto(asegurarObjeto(e, 'proyecto'), campoN, f);
      if (cambio) moverShow(e);
      return cambio;
    }
    if (campoN === 'aforo') {
      if (!v) return borrar(pr, 'aforo');
      const n = numero(v.replace(/\./g, ''));
      if (n === null || n < 0) return false;
      const r = Math.round(n);
      const p = asegurarObjeto(e, 'proyecto');
      if (p.aforo === r) return false;
      p.aforo = r;
      return true;
    }
    if (['evento', 'lugar', 'responsable'].includes(campoN)) return ponerTexto(asegurarObjeto(e, 'proyecto'), campoN, v);
    return false;
  }
  if (seccion === 'servicios' && campoN === 'personasPorSeguridad') {
    if (!v) return borrar(e.servicios, campoN);
    const n = numero(v);
    if (n === null || n <= 0) return false;
    const s = asegurarObjeto(e, 'servicios');
    if (s[campoN] === n) return false;
    s[campoN] = n;
    return true;
  }
  if (seccion === 'presupuesto' && campoN === 'moneda') {
    if (v !== 'ARS' && v !== 'USD') return false;
    return ponerTexto(asegurarObjeto(e, 'presupuesto'), 'moneda', v);
  }
  return false;
}

// La tarea "Show" del borrador sigue al horario del evento.
function moverShow(e) {
  const v = ventanaShow(e);
  const t = tareasDe(e).find((x) => x.clave === 'show' && x.hecha !== true);
  if (!v || !t) return;
  t.inicio = deMinutos(v.inicio);
  t.fin = deMinutos(v.fin);
}

/* ================================================================== acciones */

// Botones con data-prod-accion. Devuelve { cambio, mensaje? } y, según el caso, foco (data-prod del campo
// nuevo, para enfocarlo), seleccionar (ids para elegir en el 3D) o descarga ({ nombre, texto, tipo }).
// extra.seleccion: ids elegidos en el 3D o la planta (para "asignar-seleccion").
export function aplicarAccion(escena, accion, extra = {}) {
  if (!escena || typeof escena !== 'object') return { cambio: false };
  const a = txt(accion).trim();
  const i = a.indexOf(':');
  const verbo = i < 0 ? a : a.slice(0, i);
  const resto = i < 0 ? '' : a.slice(i + 1);
  const nombreArchivo = slugificar(escena.nombre || 'escena');

  switch (verbo) {
    case 'agregar-proveedor': {
      const provs = asegurarProveedores(escena);
      let nombre = resto.trim();
      if (nombre && provs.some((p) => normalizar(p?.nombre) === normalizar(nombre))) return { cambio: false, mensaje: `${nombre} ya está en la lista.` };
      if (!nombre) {
        nombre = 'Proveedor nuevo';
        for (let n = 2; provs.some((p) => normalizar(p?.nombre) === normalizar(nombre)); n++) nombre = `Proveedor nuevo ${n}`;
      }
      const id = idNuevo(provs, 'p');
      provs.push({ id, nombre, rubro: '', contacto: '', telefono: '', email: '', llegada: '', retiro: '', acceso: '', notas: '' });
      return { cambio: true, mensaje: resto.trim() ? `Agregué a ${nombre} a la lista. Completá su contacto y horario.` : 'Agregué un proveedor. Completá el nombre y el contacto.', foco: `proveedores:${id}:${resto.trim() ? 'contacto' : 'nombre'}` };
    }
    case 'agregar-tarea': {
      const tareas = asegurarTareas(escena);
      const v = ventanaShow(escena);
      const fines = tareasDe(escena).map((t) => aMinutos(t.fin)).filter((m) => m !== null);
      let ini = fines.length ? Math.max(...fines) : v ? v.inicio - 240 : aMinutos(`${textoDeFecha(new Date()).slice(0, 10)}T12:00`);
      ini = redondear(ini, 15);
      const etapa = ETAPAS[resto] ? resto : v && ini >= v.fin ? 'desarme' : v && ini >= v.inicio ? 'show' : 'armado';
      const id = idNuevo(tareas, 't');
      tareas.push({ id, nombre: 'Tarea nueva', etapa, inicio: deMinutos(ini), fin: deMinutos(ini + 60), responsable: '', proveedor: '', ids: [], hecha: false });
      return { cambio: true, mensaje: 'Agregué una tarea. Poné qué hay que hacer y el horario.', foco: `tareas:${id}:nombre` };
    }
    case 'duplicar-tarea': {
      const tareas = asegurarTareas(escena);
      const t = buscar(tareasDe(escena), resto);
      if (!t) return { cambio: false };
      const { clave, ...copia } = t;
      const id = idNuevo(tareas, 't');
      tareas.push({ ...copia, id, nombre: `${txt(t.nombre)} (copia)`, ids: [...idsDe(t)], hecha: false });
      return { cambio: true, mensaje: 'Dupliqué la tarea.', foco: `tareas:${id}:nombre` };
    }
    case 'generar-tareas': {
      const r = generarTareas(escena);
      if (!r.nuevas.length && !r.actualizadas) return { cambio: false, mensaje: 'No hay nada nuevo para agregar: las tareas ya cubren todo lo de la escena.' };
      const partes = [];
      if (r.nuevas.length) partes.push(`Agregué ${plural(r.nuevas.length, 'tarea')}`);
      if (r.actualizadas) partes.push(`${r.nuevas.length ? 'sumé' : 'Sumé'} objetos nuevos a ${plural(r.actualizadas, 'tarea')}`);
      let mensaje = `${partes.join(' y ')}.`;
      if (r.sinFecha) mensaje += ' No hay fecha del evento: tomé hoy de 22:00 a 06:00. Cargá el horario y corré las tareas.';
      else if (r.supuesto) mensaje += ' El horario del show no estaba completo: tomé de 22:00 a 06:00.';
      mensaje += ' Los horarios son una estimación: ajustalos.';
      return { cambio: true, mensaje };
    }
    case 'borrar-borrador': {
      const tareas = asegurarTareas(escena);
      const antes = tareas.length;
      escena.cronograma.tareas = tareas.filter((t) => !(t && t.clave && t.hecha !== true));
      const n = antes - escena.cronograma.tareas.length;
      return n ? { cambio: true, mensaje: `Borré ${plural(n, 'tarea')} del borrador (las hechas y las cargadas a mano quedan).` } : { cambio: false, mensaje: 'No hay tareas del borrador para borrar.' };
    }
    case 'agregar-extra': {
      const extras = asegurarExtras(escena);
      const id = idNuevo(extras, 'e');
      extras.push({ id, concepto: 'Gasto nuevo', categoria: 'Otros gastos', monto: 0 });
      return { cambio: true, mensaje: 'Agregué un gasto. Completá el concepto y el monto.', foco: `extras:${id}:concepto` };
    }
    case 'borrar': {
      const j = resto.indexOf(':');
      const col = j < 0 ? resto : resto.slice(0, j);
      const id = j < 0 ? '' : resto.slice(j + 1);
      const fuente = col === 'proveedores' ? escena.proveedores : col === 'tareas' ? escena.cronograma?.tareas : col === 'extras' ? escena.presupuesto?.extras : null;
      if (!Array.isArray(fuente)) return { cambio: false };
      const k = fuente.findIndex((x) => x && typeof x === 'object' && String(x.id) === id);
      if (k < 0) return { cambio: false };
      const [x] = fuente.splice(k, 1);
      if (col === 'proveedores') {
        const n = objetosDe(escena).filter((o) => normalizar(o.proveedor) === normalizar(x.nombre)).length;
        return { cambio: true, mensaje: `Saqué a ${txt(x.nombre).trim() || 'ese proveedor'} de la lista.${n ? ` Sus ${plural(n, 'objeto')} siguen a su nombre.` : ''}` };
      }
      return { cambio: true, mensaje: col === 'tareas' ? `Borré «${txt(x.nombre).trim() || 'la tarea'}».` : 'Borré el gasto.' };
    }
    case 'asignar-seleccion': {
      const t = buscar(tareasDe(escena), resto);
      if (!t) return { cambio: false };
      const existentes = new Set(objetosDe(escena).map((o) => String(o.id)));
      const ids = [...new Set((Array.isArray(extra?.seleccion) ? extra.seleccion : []).map(String).filter((x) => existentes.has(x)))];
      if (!ids.length) return { cambio: false, mensaje: 'Elegí primero los objetos en el 3D o en la planta.' };
      if (ids.join(',') === idsDe(t).join(',')) return { cambio: false, mensaje: 'La tarea ya tiene esos objetos.' };
      t.ids = ids;
      return { cambio: true, mensaje: `«${txt(t.nombre).trim()}» ahora tiene ${plural(ids.length, 'objeto')}.` };
    }
    case 'quitar-objetos': {
      const t = buscar(tareasDe(escena), resto);
      if (!t || !idsDe(t).length) return { cambio: false };
      t.ids = [];
      return { cambio: true, mensaje: `Saqué los objetos de «${txt(t.nombre).trim()}».` };
    }
    case 'ver-objetos': {
      const t = buscar(tareasDe(escena), resto);
      const ids = t ? idsDe(t) : [];
      return { cambio: false, seleccionar: ids, mensaje: t && !ids.length ? 'Esta tarea no tiene objetos.' : undefined };
    }
    case 'ver': {
      const existentes = new Set(objetosDe(escena).map((o) => String(o.id)));
      return { cambio: false, seleccionar: resto.split(',').filter((x) => existentes.has(x)) };
    }
    case 'exportar': {
      if (resto === 'cronograma-csv') return { cambio: false, descarga: { nombre: `${nombreArchivo}-cronograma.csv`, texto: csvCronograma(escena), tipo: 'text/csv' } };
      if (resto === 'orden-del-dia') return { cambio: false, descarga: { nombre: `${nombreArchivo}-orden-del-dia.txt`, texto: ordenDelDia(escena), tipo: 'text/plain' } };
      if (resto === 'presupuesto-csv') return { cambio: false, descarga: { nombre: `${nombreArchivo}-presupuesto.csv`, texto: csvPresupuesto(escena), tipo: 'text/csv' } };
      return { cambio: false };
    }
    default:
      return { cambio: false };
  }
}

/* ================================================================== hojas del PDF */

const GRIS_CLARO = '#c4c7cc';

// Contorno gris de un objeto que no es protagonista de la hoja.
function siluetaGris(o, M) {
  if (o.tipo === 'camino' || o.tipo === 'vallado') {
    const l = puntosMundo({ ...o, puntos: lineaLocal(o) }).map(M);
    return `<polyline points="${pts(l)}" fill="none" stroke="${GRIS_CLARO}" stroke-width="0.25" stroke-linejoin="round"/>`;
  }
  const c = (esPoligono(o) ? puntosMundo(o) : esquinas(o)).map(M);
  return `<polygon points="${pts(c)}" fill="none" stroke="${GRIS_CLARO}" stroke-width="0.15"/>`;
}

// Recuadro azul alrededor de un objeto destacado (un círculo si en el papel es muy chico).
function resaltado(o, M, k) {
  if (Math.max(o.dims[0], o.dims[1]) * k < 2.2) {
    const c = M(o.pos);
    return `<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="1.6" fill="none" stroke="${ACENTO}" stroke-width="0.4"/>`;
  }
  const c = (esPoligono(o) ? puntosMundo(o) : esquinas(o)).map(M);
  return `<polygon points="${pts(c)}" fill="none" stroke="${ACENTO}" stroke-width="0.45" stroke-linejoin="round"/>`;
}

// Números del listado sobre los objetos destacados (corridos si caen encima de otro).
function numerosEnPlano(objs, comp, M, k) {
  const ocupados = [];
  const ubicar = (p, r) => {
    let q = [...p];
    for (let i = 0; i < 8 && ocupados.some(([x, y, rr]) => Math.hypot(x - q[0], y - q[1]) < r + rr + 0.4); i++) q = [q[0] + r * 2 + 0.6, q[1]];
    ocupados.push([q[0], q[1], r]);
    return q;
  };
  let s = '';
  for (const o of objs) {
    const codigo = comp.codigoDe.get(o.id);
    if (!codigo) continue;
    const c = M(o.pos);
    const chico = Math.max(o.dims[0], o.dims[1]) * k < 4;
    const r = chico ? 1.3 : 1.8;
    const pc = ubicar(chico ? [c[0] + r + 0.6, c[1] - r - 0.6] : c, r);
    s += `<circle cx="${n2(pc[0])}" cy="${n2(pc[1])}" r="${r}" fill="#fff" stroke="${ACENTO}" stroke-width="0.25"/>`;
    s += texto(pc[0], pc[1] + 0.05, String(codigo), { t: chico ? 1.5 : 1.9, peso: 700, color: ACENTO, ancla: 'middle', base: 'middle' });
  }
  return s;
}

// Regiones de texto de la columna: en hoja horizontal, la columna derecha; en vertical (banda), las
// columnas de la izquierda de la franja y después el bloque de la derecha (arriba del cuadro de datos).
function regionesColumna({ col, banda, derX, derW, limite }, anchoMinimo = 52) {
  if (!banda) return [{ x: col.x, w: col.w, y0: col.y + 3, y1: limite }];
  const izq = col.w - derW;
  const n = Math.max(1, Math.floor(izq / anchoMinimo));
  const r = [];
  for (let i = 0; i < n; i++) r.push({ x: col.x + (izq / n) * i, w: izq / n, y0: col.y + 3, y1: col.y + col.h - 4 });
  r.push({ x: derX, w: derW, y0: col.y + 3, y1: limite });
  return r;
}

// Reparte filas { h, dib(x, y, w), titulo } en las regiones. Si no entra todo, deja una nota al pie.
function maquetar(regiones, filas, nota) {
  let s = '';
  const reserva = 4;
  const cabe = (h, ri, yy) => yy + h <= regiones[ri].y1 - (ri === regiones.length - 1 ? reserva : 0);
  let r = 0;
  let y = regiones[0].y0;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const h = f.titulo && filas[i + 1] ? f.h + filas[i + 1].h : f.h;
    while (r < regiones.length && !cabe(h, r, y)) {
      r++;
      if (r < regiones.length) y = regiones[r].y0;
    }
    if (r >= regiones.length) {
      const u = regiones[regiones.length - 1];
      s += texto(u.x + 4, u.y1 - 1.2, recortar(nota, 1.7, u.w - 8), { t: 1.7, color: GRIS });
      break;
    }
    s += f.dib(regiones[r].x, y, regiones[r].w);
    y += f.h;
  }
  return s;
}

// Ayudas para armar filas de la columna.
const filaTitulo = (s, t = 2.6) => ({ h: t + 3.4, titulo: true, dib: (x, y, w) => texto(x + 4, y + t + 1.2, recortar(s, t, w - 8), { t, peso: 700 }) });
const filaDato = (k, v) => ({
  h: 3.7,
  dib: (x, y, w) => texto(x + 4, y + 2.7, k, { t: 1.9, color: GRIS }) + texto(x + 21, y + 2.7, recortar(v, 2.1, w - 25), { t: 2.1, peso: 600 }),
});
const filaEspacio = (h) => ({ h, dib: () => '' });
function filasNota(s, ancho, { t = 1.8, color = GRIS, max = 4 } = {}) {
  return envolver(s, t, ancho - 8, max).map((l) => ({ h: t + 0.9, dib: (x, y) => texto(x + 4, y + t, l, { t, color }) }));
}
const filaItem = (it) => ({
  h: 6.1,
  dib: (x, y, w) => {
    let s = `<circle cx="${n2(x + 6)}" cy="${n2(y + 1.9)}" r="1.5" fill="#fff" stroke="${ACENTO}" stroke-width="0.22"/>`;
    s += texto(x + 6, y + 1.95, String(it.codigo), { t: 1.6, peso: 700, color: ACENTO, ancla: 'middle', base: 'middle' });
    const nombre = it.ref ? `${it.nombre} ${it.ref}` : it.nombre;
    s += texto(x + 9.5, y + 2.7, recortar(nombre, 2, w - 24), { t: 2, peso: 600 });
    s += texto(x + w - 4, y + 2.7, `× ${it.cantidad}${it.unidad && it.unidad !== 'u' ? ` ${it.unidad}` : ''}`, { t: 2, peso: 700, ancla: 'end' });
    s += texto(x + 9.5, y + 5.3, recortar(it.medida, 1.7, w - 14), { t: 1.7, color: GRIS });
    return s;
  },
});

// Hojas por proveedor: la planta con solo lo suyo destacado (lo demás en gris claro), lo que trae con los
// códigos del listado, horario de llegada y retiro, acceso y contacto. Una hoja por proveedor con objetos.
// Para generarHojas(): { paginas, crear(numeroHoja, totalHojas) => [svg, ...] }.
export function hojasProveedores(escena, comp, op) {
  const c = comp || calcular(escena);
  const opciones = op || opcionesHoja(escena);
  const provs = todosLosProveedores(escena).filter((p) => p.objetos.length);
  return {
    paginas: provs.length,
    crear(numeroHoja, totalHojas) {
      return provs.map((p, i) => {
        const suyos = new Set(p.objetos.map((o) => o.id));
        const items = itemsDeObjetos(c, p.objetos);
        const tareas = tareasDe(escena)
          .filter((t) => normalizar(t.proveedor) === normalizar(p.nombre))
          .map(infoTarea)
          .filter((x) => x.valida)
          .sort(porHorario);
        const deFondo = (o) => !suyos.has(o.id) && (o.fijo || LUGAR.has(o.tipo) || CONTEXTO.has(o.tipo));
        return hojaPlanta(escena, c, opciones, totalHojas, {
          titulo: `Proveedor: ${p.nombre}`,
          numeroHoja: numeroHoja + i,
          numeros: false,
          filtro: (o) => suyos.has(o.id) || deFondo(o),
          encima: ({ M, k }) => {
            const otros = objetosDe(escena).filter((o) => !suyos.has(o.id) && !deFondo(o) && !SIN_SILUETA.has(o.tipo));
            const destacados = p.objetos.filter((o) => Array.isArray(o.dims) && Array.isArray(o.pos));
            return otros.map((o) => siluetaGris(o, M)).join('') + destacados.map((o) => resaltado(o, M, k)).join('') + numerosEnPlano(destacados, c, M, k);
          },
          columna: (ctx) => columnaProveedor(p, items, tareas, ctx),
        });
      });
    },
  };
}
// Lo que se deja dibujado como referencia en las hojas especiales (accesos, caminos, vallados).
const CONTEXTO = new Set(['acceso', 'camino', 'estacionamiento', 'vallado', 'control_acceso']);
// Lo del lugar, que se deja dibujado como fondo, y lo que no tiene sentido dibujar en gris (anotaciones).
const LUGAR = new Set(['arbol', 'hilera', 'columna', 'escalera', 'zona', 'etiqueta', 'persona']);
const SIN_SILUETA = new Set(['persona', 'etiqueta', 'texto', 'flecha', 'marcador', 'medicion']);

function columnaProveedor(p, items, tareas, ctx) {
  const d = p.datos || {};
  const regiones = regionesColumna(ctx);
  const ancho = Math.min(...regiones.map((r) => r.w));
  const filas = [];
  filas.push({ h: 4, dib: (x, y) => texto(x + 4, y + 2.8, 'Proveedor', { t: 1.9, color: GRIS }) });
  filas.push({ h: 6, dib: (x, y, w) => texto(x + 4, y + 4.4, recortar(p.nombre, 4, w - 8), { t: 4, peso: 700 }) });
  if (txt(d.rubro).trim()) filas.push({ h: 4, dib: (x, y, w) => texto(x + 4, y + 2.8, recortar(d.rubro, 2.1, w - 8), { t: 2.1, color: GRIS }) });
  filas.push(filaEspacio(1.5));
  const L = aMinutos(d.llegada);
  const R = aMinutos(d.retiro);
  const datos = [
    ['Contacto', txt(d.contacto).trim()],
    ['Teléfono', txt(d.telefono).trim()],
    ['Email', txt(d.email).trim()],
    ['Llega', L !== null ? fechaHora(L) : ''],
    ['Entra por', txt(d.acceso).trim()],
    ['Retira', R !== null ? fechaHora(R) : ''],
  ].filter(([, v]) => v);
  if (!p.enLista) datos.push(['Datos', 'falta cargarlo en la lista']);
  for (const [k, v] of datos) filas.push(filaDato(k, v));
  if (txt(d.notas).trim()) {
    filas.push(filaEspacio(1));
    filas.push(...filasNota(txt(d.notas).trim(), ancho, { max: 4 }));
  }
  filas.push(filaEspacio(2));
  const unidades = items.reduce((s, it) => s + it.cantidad, 0);
  filas.push({
    h: 6,
    titulo: true,
    dib: (x, y, w) => texto(x + 4, y + 4, 'Qué trae', { t: 2.8, peso: 700 }) + texto(x + w - 4, y + 4, plural(unidades, 'unidad', 'unidades'), { t: 2, color: GRIS, ancla: 'end' }),
  });
  for (const it of items) filas.push(filaItem(it));
  if (!items.length) filas.push(...filasNota('Sus objetos no van en el listado de materiales.', ancho));
  if (tareas.length) {
    filas.push(filaEspacio(2));
    filas.push(filaTitulo('Horarios'));
    for (const i of tareas) {
      filas.push({
        h: 3.4,
        dib: (x, y, w) => texto(x + 4, y + 2.5, `${dia(i.ini)} ${horasDe(i.ini, i.fin)}`, { t: 1.8, peso: 600 }) + texto(x + 33, y + 2.5, recortar(i.t.nombre, 1.8, w - 37), { t: 1.8 }),
      });
    }
  }
  filas.push(filaEspacio(2));
  filas.push(...filasNota('Los números son los del listado de materiales. En gris, lo que traen otros.', ancho, { t: 1.6, max: 2 }));
  return maquetar(regiones, filas, 'Sigue en la pestaña Proveedores de la app.');
}

// Hoja "Carga y descarga": caminos de proveedores y de emergencia, zonas de descarga, accesos y camiones
// destacados, y la tabla de llegadas de cada proveedor. Para generarHojas(): { paginas: 1, crear }.
export function hojaLogistica(escena, comp, op) {
  const c = comp || calcular(escena);
  const opciones = op || opcionesHoja(escena);
  const destacado = (o) =>
    ['acceso', 'control_acceso', 'camion', 'ambulancia', 'generador', 'estacionamiento'].includes(o.tipo) ||
    (o.tipo === 'camino' && (o.uso === 'proveedores' || o.uso === 'emergencia')) ||
    (o.tipo === 'zona' && o.uso === 'descarga');
  const deFondo = (o) => !destacado(o) && o.tipo !== 'zona' && o.tipo !== 'etiqueta' && (o.fijo || LUGAR.has(o.tipo));
  return {
    paginas: 1,
    crear(numeroHoja, totalHojas) {
      return [
        hojaPlanta(escena, c, opciones, totalHojas, {
          titulo: 'Carga y descarga',
          numeroHoja,
          numeros: false,
          filtro: (o) => destacado(o) || deFondo(o),
          encima: ({ M, k }) => {
            const objs = objetosDe(escena);
            let s = objs
              .filter((o) => !destacado(o) && !deFondo(o) && !SIN_SILUETA.has(o.tipo))
              .map((o) => siluetaGris(o, M))
              .join('');
            // Nombre de cada acceso y de cada camión.
            for (const o of objs.filter((x) => x.tipo === 'acceso' || x.tipo === 'control_acceso' || x.tipo === 'camion')) {
              const nombre = o.tipo === 'camion' ? [txt(o.nombre).trim() || 'Camión', txt(o.proveedor).trim()].filter(Boolean).join(' · ') : txt(o.nombre).trim();
              if (!nombre) continue;
              const cc = M(o.pos);
              const r = (Math.max(o.dims[0], o.dims[1]) * k) / 2;
              const t = 2;
              const etiqueta = recortar(nombre, t, 50);
              const w = anchoTexto(etiqueta, t) + 3;
              const y = cc[1] - r - 3.2;
              const fondo = o.tipo === 'camion' ? '#7a5200' : o.salida === false || o.tipo === 'control_acceso' ? TINTA : '#1d8a55';
              s += `<rect x="${n2(cc[0] - w / 2)}" y="${n2(y - 2)}" width="${n2(w)}" height="4" rx="0.6" fill="${fondo}"/>`;
              s += texto(cc[0], y + 0.1, etiqueta, { t, peso: 600, color: '#fff', ancla: 'middle', base: 'middle' });
            }
            return s;
          },
          columna: (ctx) => columnaLogistica(escena, ctx),
        }),
      ];
    },
  };
}

function columnaLogistica(escena, ctx) {
  const objs = objetosDe(escena);
  const regiones = regionesColumna(ctx, 75);
  const ancho = Math.min(...regiones.map((r) => r.w));
  const filas = [];
  filas.push(filaTitulo('Carga y descarga', 3.2));
  const caminos = (uso) => objs.filter((o) => o.tipo === 'camino' && o.uso === uso);
  const descarga = objs.filter((o) => o.tipo === 'zona' && o.uso === 'descarga');
  const accesos = objs.filter((o) => o.tipo === 'acceso' || o.tipo === 'control_acceso');
  const prov = caminos('proveedores');
  const emer = caminos('emergencia');
  const muestraCamino = (color) => (x, y) =>
    `<line x1="${n2(x)}" y1="${n2(y)}" x2="${n2(x + 7)}" y2="${n2(y)}" stroke="${color}" stroke-opacity="0.25" stroke-width="2.2" stroke-linecap="round"/>` +
    `<line x1="${n2(x)}" y1="${n2(y)}" x2="${n2(x + 7)}" y2="${n2(y)}" stroke="${color}" stroke-width="0.3" stroke-dasharray="2 1.2"/>`;
  const ref = (muestra, s) => ({ h: 3.8, dib: (x, y, w) => muestra(x + 4, y + 1.9) + texto(x + 13, y + 2.6, recortar(s, 1.9, w - 17), { t: 1.9 }) });
  filas.push(ref(muestraCamino(USOS_CAMINO.proveedores.color), `Camino de proveedores${prov.length ? ` (${fm(prov.reduce((s, o) => s + largoDe(o), 0), 0)} m)` : ''}`));
  filas.push(ref(muestraCamino(USOS_CAMINO.emergencia.color), `Camino de emergencia${emer.length ? ` (${fm(emer.reduce((s, o) => s + largoDe(o), 0), 0)} m)` : ''}`));
  filas.push(ref((x, y) => `<rect x="${n2(x)}" y="${n2(y - 1.4)}" width="7" height="2.8" fill="#6d5cff" fill-opacity="0.1" stroke="#6d5cff" stroke-width="0.3" stroke-dasharray="2 1"/>`, `Zona de descarga${descarga.length ? ` (${fm(descarga.reduce((s, o) => s + superficieDe(o), 0), 0)} m²)` : ''}`));
  filas.push(ref((x, y) => `<rect x="${n2(x)}" y="${n2(y - 1.4)}" width="7" height="2.8" rx="0.5" fill="#1d8a55"/>`, 'Acceso que sirve de salida'));
  filas.push(ref((x, y) => `<rect x="${n2(x)}" y="${n2(y - 1.4)}" width="7" height="2.8" rx="0.5" fill="${TINTA}"/>`, 'Acceso o control (no es salida)'));
  filas.push(ref((x, y) => `<rect x="${n2(x + 1)}" y="${n2(y - 1.4)}" width="5" height="2.8" fill="#f2f2f2" stroke="${TINTA}" stroke-width="0.22"/>`, 'Camión o vehículo'));
  if (!prov.length && !descarga.length) {
    filas.push(filaEspacio(1));
    filas.push(...filasNota('Todavía no hay camino de proveedores ni zona de descarga marcados en la escena.', ancho, { max: 3 }));
  }

  filas.push(filaEspacio(2.5));
  filas.push(filaTitulo('Llegadas'));
  const llegadas = todosLosProveedores(escena)
    .filter((p) => p.enLista || p.objetos.length)
    .map((p) => ({ p, L: aMinutos(p.datos?.llegada), R: aMinutos(p.datos?.retiro) }))
    .sort((a, b) => (a.L ?? Infinity) - (b.L ?? Infinity) || a.p.nombre.localeCompare(b.p.nombre, 'es'));
  if (!llegadas.length) filas.push(...filasNota('No hay proveedores cargados.', ancho));
  for (const { p, L, R } of llegadas) {
    const d = p.datos || {};
    const contacto = [txt(d.contacto).trim(), txt(d.telefono).trim()].filter(Boolean).join(' · ');
    const linea2 = [txt(d.acceso).trim() && `Entra por ${txt(d.acceso).trim()}`, R !== null && `retira ${fechaHora(R)}`].filter(Boolean).join(' · ') || (p.enLista ? 'Sin acceso ni retiro cargados' : 'No está en la lista de proveedores');
    filas.push({
      h: contacto ? 9.2 : 6.6,
      dib: (x, y, w) => {
        let s = texto(x + 4, y + 2.8, L !== null ? fechaHora(L) : 'sin horario', { t: 2, peso: 700, color: L !== null ? TINTA : GRIS });
        s += texto(x + 25, y + 2.8, recortar(p.nombre, 2.1, w - 29), { t: 2.1, peso: 700 });
        s += texto(x + 25, y + 5.4, recortar(linea2, 1.7, w - 29), { t: 1.7, color: GRIS });
        if (contacto) s += texto(x + 25, y + 7.9, recortar(contacto, 1.7, w - 29), { t: 1.7, color: GRIS });
        return s + linea([x + 4, y + (contacto ? 9 : 6.4)], [x + w - 4, y + (contacto ? 9 : 6.4)], { w: 0.08, color: '#dddddd' });
      },
    });
  }
  filas.push(filaEspacio(2));
  filas.push(
    ...filasNota(
      `Respetá el horario y el acceso de cada proveedor.${emer.length ? ' El camino de emergencia queda libre todo el tiempo: no se estaciona ni se descarga ahí.' : ''}${accesos.length ? '' : ' Faltan los accesos en la escena.'}`,
      ancho,
      { max: 4 }
    )
  );
  return maquetar(regiones, filas, 'Sigue en la pestaña Proveedores de la app.');
}
