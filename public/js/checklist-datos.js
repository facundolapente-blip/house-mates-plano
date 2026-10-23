// Checklist del armado: qué llegó, qué está armado y qué tiene un problema.
// Arma la lista desde los materiales de la escena y calcula el avance. Sin DOM: lo usan el celular
// (checklist.js), la compu (marcas sobre el 3D) y las pruebas con Node.
//
// Estados guardados (GET /api/checklist/:slug): { [id]: { estado, hora, quien, nota, foto } }.
// El id es el de un objeto ("sub-izq") o el de un renglón con varios iguales ("grupo:sub|0.7x0.8x0.65|").
// Un objeto puede tener marca propia y además la de su renglón agrupado: vale la más nueva (por `hora`).
// Así se puede marcar "llegaron los 4 subs" de una vez y después "armado" uno por uno.

import { incluido, textoMedida, nombreCategoria } from './computo.js';
import { CATEGORIAS, catDe, defDatos } from './tipos-datos.js';

export const ESTADOS = ['pendiente', 'llego', 'armado', 'problema'];
export const NOMBRES_ESTADO = { pendiente: 'Pendiente', llego: 'Llegó', armado: 'Armado', problema: 'Problema' };
export const COLORES_ESTADO = { pendiente: '#6e6e78', llego: '#2447f5', armado: '#2fbf71', problema: '#ff3b30' };

// Filtros de la lista: cada uno muestra los renglones que tienen al menos una unidad en ese estado.
export const FILTROS = [
  ['todo', 'Todo'],
  ['pendiente', 'Falta'],
  ['llego', 'Llegó'],
  ['armado', 'Armado'],
  ['problema', 'Problemas'],
];

// Al tocar un renglón: Pendiente → Llegó → Armado → Pendiente. Un problema resuelto pasa a "Llegó".
export function siguienteEstado(estado) {
  return { pendiente: 'llego', llego: 'armado', armado: 'pendiente', problema: 'llego' }[estado] || 'llego';
}

const ORDEN_CAT = new Map(CATEGORIAS.map(([c], i) => [c, i]));

// Texto apto para una clave: sin tildes, en minúsculas, solo letras, números, puntos y guiones.
function limpiar(s, max = 40) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

// Medidas redondeadas al centímetro (las que falten o no se puedan leer, las típicas del tipo).
function medidas(o) {
  const base = defDatos(o).dims;
  return [0, 1, 2].map((i) => {
    const v = Array.isArray(o.dims) ? o.dims[i] : undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : base[i];
  });
}

// Clave del renglón que junta los objetos iguales: mismo tipo, medida, modelo (ref) y proveedor.
// Formato: "grupo:<tipo>|<medida>|<ref>" y, si tiene proveedor, "|<proveedor>" al final.
export function claveGrupo(o) {
  const partes = [limpiar(o.tipo, 30) || 'caja', medidas(o).join('x'), limpiar(o.ref)];
  const prov = limpiar(o.proveedor);
  if (prov) partes.push(prov);
  return 'grupo:' + partes.join('|');
}

// "2026-12-12T12:00" → "12/12 12:00". Lo que no tenga ese formato queda como está.
function fechaCorta(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(texto || ''));
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : String(texto || '');
}

function armarItem(grupo, objetos, porProveedor) {
  const o = objetos[0];
  const def = defDatos(o);
  const ref = String(o.ref || '').trim();
  const proveedor = String(o.proveedor || '').trim();
  const medida = textoMedida(medidas(o), def.piso);
  const nombres = [...new Set(objetos.map((x) => String(x.nombre || def.nombre)))];
  const cantidad = objetos.length;
  return {
    // Un objeto solo conserva su id; varios iguales juntos usan la clave del grupo.
    id: cantidad > 1 ? grupo : String(o.id),
    grupo,
    nombre: nombres.length === 1 ? nombres[0] : def.nombre,
    detalle: [ref, medida, !porProveedor && proveedor].filter(Boolean).join(' · '),
    cantidad,
    ids: objetos.map((x) => String(x.id)),
    nombres: objetos.map((x) => String(x.nombre || def.nombre)),
    tipo: String(o.tipo || 'caja'),
    cat: catDe(o),
    ref,
    proveedor,
    medida,
  };
}

const ordenItems = (a, b) =>
  (ORDEN_CAT.get(a.cat) ?? 99) - (ORDEN_CAT.get(b.cat) ?? 99) ||
  a.nombre.localeCompare(b.nombre, 'es') ||
  a.medida.localeCompare(b.medida, 'es');

// Secciones de la lista: [{ clave, titulo, detalle, telefono, items: [{ id, nombre, detalle, cantidad, ids, ... }] }].
// agrupar: 'categoria' (Sonido, Luces...) o 'proveedor'. juntar: false = un renglón por objeto.
export function itemsChecklist(escena, { agrupar = 'categoria', juntar = true } = {}) {
  const porProveedor = agrupar === 'proveedor';
  const objetos = (Array.isArray(escena?.objetos) ? escena.objetos : []).filter(
    (o) => o && typeof o === 'object' && o.id !== undefined && o.id !== null && o.id !== '' && incluido(o)
  );
  const renglones = new Map();
  for (const o of objetos) {
    const grupo = claveGrupo(o);
    const clave = juntar ? grupo : `obj:${o.id}`;
    if (!renglones.has(clave)) renglones.set(clave, { grupo, objetos: [] });
    renglones.get(clave).objetos.push(o);
  }
  const items = [...renglones.values()].map((r) => armarItem(r.grupo, r.objetos, porProveedor)).sort(ordenItems);

  const secciones = new Map();
  for (const it of items) {
    const clave = porProveedor ? `prov:${limpiar(it.proveedor, 60)}` : `cat:${it.cat}`;
    if (!secciones.has(clave)) {
      secciones.set(clave, {
        clave,
        titulo: porProveedor ? it.proveedor || 'Sin proveedor' : nombreCategoria(it.cat),
        detalle: '',
        telefono: '',
        orden: porProveedor ? '' : ORDEN_CAT.get(it.cat) ?? 99,
        items: [],
      });
    }
    secciones.get(clave).items.push(it);
  }
  const lista = [...secciones.values()];
  if (porProveedor) {
    const datos = Array.isArray(escena?.proveedores) ? escena.proveedores.filter((p) => p && typeof p === 'object') : [];
    for (const s of lista) {
      const p = datos.find((x) => limpiar(x.nombre, 60) && `prov:${limpiar(x.nombre, 60)}` === s.clave);
      if (!p) continue;
      s.detalle = [p.rubro, p.llegada && `llega ${fechaCorta(p.llegada)}`, p.acceso, p.contacto].filter(Boolean).map(String).join(' · ');
      s.telefono = String(p.telefono || '').trim();
    }
    // Por nombre, y lo que no tiene proveedor al final.
    lista.sort((a, b) => (a.clave === 'prov:') - (b.clave === 'prov:') || a.titulo.localeCompare(b.titulo, 'es'));
  } else {
    lista.sort((a, b) => a.orden - b.orden);
  }
  return lista.map(({ orden, ...s }) => s);
}

// Acepta secciones (como las devuelve itemsChecklist) o una lista de items.
const planos = (items) => (Array.isArray(items) ? items.flatMap((x) => (Array.isArray(x?.items) ? x.items : [x])) : []).filter((x) => x && Array.isArray(x.ids));

const propio = (estados, clave) =>
  estados && clave !== undefined && Object.prototype.hasOwnProperty.call(estados, clave) ? estados[clave] : null;
const conEstado = (e) => (e && typeof e === 'object' && ESTADOS.includes(e.estado) ? e : null);
const marcaDe = (e) => {
  const t = Date.parse(e?.hora);
  return Number.isFinite(t) ? t : 0;
};

// Lo último que se marcó para un objeto: su marca propia o la de su renglón agrupado (gana la más nueva;
// si son de la misma hora, la propia).
export function estadoEfectivo(id, grupo, estados) {
  const a = conEstado(propio(estados, String(id)));
  const b = grupo ? conEstado(propio(estados, grupo)) : null;
  if (a && b) return marcaDe(b) > marcaDe(a) ? b : a;
  return a || b || null;
}

// Estado de un objeto para la compu (marcas sobre el 3D): { estado, hora, quien, nota, foto }, con estado
// 'pendiente' si nadie lo marcó. null si el objeto no está en el checklist (no es material).
export function estadoDeObjeto(id, items, estados) {
  const it = planos(items).find((i) => i.ids.includes(String(id)));
  if (!it) return null;
  const e = estadoEfectivo(id, it.grupo, estados);
  return e ? { ...e } : { estado: 'pendiente' };
}

// Mapa id de objeto → estado efectivo, para pintar muchos objetos de una vez.
export function estadosPorObjeto(items, estados) {
  const mapa = new Map();
  for (const it of planos(items)) {
    for (const id of it.ids) {
      const e = estadoEfectivo(id, it.grupo, estados);
      mapa.set(id, e ? { ...e } : { estado: 'pendiente' });
    }
  }
  return mapa;
}

// Estado de un renglón: { estado, mixto, cuenta: { pendiente, llego, armado, problema }, hora, quien, nota, foto, fotos }.
// Si las unidades están en estados distintos (mixto), manda el problema y si no, lo más atrasado.
export function estadoDeItem(item, estados) {
  const cuenta = { pendiente: 0, llego: 0, armado: 0, problema: 0 };
  let ultimo = null;
  for (const id of item.ids) {
    const e = estadoEfectivo(id, item.grupo, estados);
    cuenta[e ? e.estado : 'pendiente']++;
    if (e && (!ultimo || marcaDe(e) > marcaDe(ultimo))) ultimo = e;
  }
  const presentes = ESTADOS.filter((k) => cuenta[k]);
  const mixto = presentes.length > 1;
  const estado = !mixto ? presentes[0] || 'pendiente' : cuenta.problema ? 'problema' : cuenta.pendiente ? 'pendiente' : 'llego';
  // Nota y foto: primero las del renglón; si no tiene, la de alguna unidad.
  const delItem = propio(estados, item.id);
  const entradas = [...new Set([item.id, item.grupo, ...item.ids])].map((k) => propio(estados, k)).filter((e) => e && typeof e === 'object');
  const nota = (delItem && delItem.nota) || entradas.find((e) => e.nota)?.nota || '';
  const foto = (delItem && delItem.foto) || entradas.find((e) => e.foto)?.foto || '';
  return {
    estado,
    mixto,
    cuenta,
    hora: ultimo?.hora || '',
    quien: ultimo?.quien || '',
    nota: String(nota),
    foto: String(foto),
    fotos: [...new Set(entradas.map((e) => e.foto).filter(Boolean).map(String))],
  };
}

// Avance general, contando unidades (4 subs = 4): { total, pendiente, llego, armado, problema, porcentaje }.
// llego = llegó y todavía no está armado. porcentaje: armado cuenta entero y "llegó" la mitad (0 a 100, sin
// redondear para arriba: 100 solo cuando está todo armado).
export function progreso(items, estados) {
  const r = { total: 0, pendiente: 0, llego: 0, armado: 0, problema: 0, porcentaje: 0 };
  for (const it of planos(items)) {
    for (const id of it.ids) {
      const e = estadoEfectivo(id, it.grupo, estados);
      r.total++;
      r[e ? e.estado : 'pendiente']++;
    }
  }
  r.porcentaje = r.total ? Math.floor((100 * (r.armado + r.llego / 2)) / r.total) : 0;
  return r;
}

// ¿El renglón entra en el filtro elegido? (recibe lo que devuelve estadoDeItem)
export const coincideFiltro = (est, filtro) => !filtro || filtro === 'todo' || (est.cuenta[filtro] || 0) > 0;
