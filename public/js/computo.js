// Cómputo de materiales: cuántas unidades de cada cosa hay en la escena y lo que se deriva
// (módulos de tarima, tramos de truss, metros de barra, superficies).

import { CATEGORIAS, catDe, defDatos as defDe } from './tipos-datos.js';
import { fm } from './formato.js';
import { areaFirmada, superficieDe } from './geometria.js';
import { plazasEstacionamiento, modulosVallado, moduloVallado, largoDe, USOS_CAMINO } from './predio.js';

// Lo que es del lugar (árboles, columnas) o sirve solo para planificar no se computa como material.
const NO_COMPUTA = new Set(['persona', 'etiqueta', 'arbol', 'hilera', 'columna', 'escalera', 'zona', 'estacionamiento', 'camino', 'marcador', 'medicion', 'texto', 'flecha', 'auto', 'camion', 'puesto']);
const ORDEN_CAT = new Map(CATEGORIAS.map(([c], i) => [c, i]));

export const computaPorDefecto = (tipo) => !NO_COMPUTA.has(tipo);
export const incluido = (o) => o.computo ?? computaPorDefecto(o.tipo);

// Solo medidas positivas: un módulo o tramo en 0 (o escrito mal en el archivo) daría cantidades infinitas.
const positivos = (lista) => (Array.isArray(lista) ? lista.map((v) => parseFloat(String(v).replace(',', '.'))).filter((v) => v > 0) : []);

export function opcionesComputo(escena) {
  const c = escena.computo || {};
  const mod = positivos(c.modTarima);
  const tramosTruss = positivos(c.tramosTruss);
  return {
    modTarima: mod.length === 2 ? mod : [2, 1],
    tramosTruss: tramosTruss.length ? tramosTruss.sort((a, b) => b - a) : [3, 2, 1, 0.5],
  };
}

export const textoMedida = (dims, piso) =>
  piso ? `${fm(dims[0])} × ${fm(dims[1])} m` : `${fm(dims[0])} × ${fm(dims[1])} × ${fm(dims[2])} m`;

// Módulos rectangulares necesarios para cubrir una tarima (se prueba en los dos sentidos).
function modulos(w, p, [a, b]) {
  const c = (x, m) => Math.ceil(x / m - 1e-6);
  return Math.min(c(w, a) * c(p, b), c(w, b) * c(p, a));
}

// Tramos estándar de truss para cubrir un largo, de mayor a menor. El resto se redondea al tramo más chico.
function tramos(largo, medidas) {
  const out = new Map();
  let resto = largo;
  for (const m of medidas) {
    const n = Math.floor((resto + 1e-6) / m);
    if (n > 0) {
      out.set(m, (out.get(m) || 0) + n);
      resto -= n * m;
    }
  }
  if (resto > 0.01) {
    const chico = medidas[medidas.length - 1];
    out.set(chico, (out.get(chico) || 0) + Math.ceil(resto / chico - 1e-6));
  }
  return out;
}

export function computar(escena) {
  const op = opcionesComputo(escena);
  const grupos = new Map();
  for (const o of escena.objetos) {
    if (!incluido(o)) continue;
    const def = defDe(o);
    const ref = String(o.ref || '').trim();
    const dims = o.dims.map((v) => Math.round(v * 100) / 100);
    // El vallado se cuenta en paños; los carteles, por texto y tamaño de impresión.
    const vallado = o.tipo === 'vallado';
    const senal = o.tipo === 'senal';
    const clave = vallado ? `vallado|${moduloVallado(o)}|${dims[2]}|${ref}` : senal ? `senal|${o.texto || ''}|${o.formato || dims.join('x')}` : `${o.tipo}|${ref || dims.join('x')}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        clave,
        tipo: o.tipo,
        cat: catDe(o),
        nombre: senal && o.texto ? `Cartel "${o.texto}"` : def.nombre,
        ref,
        proveedor: '',
        medida: vallado ? `paños de ${fm(moduloVallado(o), 1)} m, ${fm(dims[2])} m de alto` : senal && o.formato ? String(o.formato) : textoMedida(dims, def.piso),
        cantidad: 0,
        unidad: vallado ? 'paños' : 'u',
        ids: [],
      });
    }
    const it = grupos.get(clave);
    it.cantidad += vallado ? modulosVallado(o) : 1;
    it.ids.push(o.id);
    if (!it.proveedor && o.proveedor) it.proveedor = String(o.proveedor);
  }
  const items = [...grupos.values()].sort(
    (a, b) =>
      (ORDEN_CAT.get(a.cat) ?? 99) - (ORDEN_CAT.get(b.cat) ?? 99) ||
      a.nombre.localeCompare(b.nombre, 'es') ||
      a.medida.localeCompare(b.medida, 'es')
  );
  items.forEach((it, i) => (it.codigo = i + 1));
  const codigoDe = new Map();
  for (const it of items) for (const id of it.ids) codigoDe.set(id, it.codigo);

  // Derivados para el armado.
  const derivados = [];
  const de = (tipo) => escena.objetos.filter((o) => o.tipo === tipo && incluido(o));

  const tarimas = de('tarima');
  if (tarimas.length) {
    const sup = tarimas.reduce((s, o) => s + o.dims[0] * o.dims[1], 0);
    const n = tarimas.reduce((s, o) => s + modulos(o.dims[0], o.dims[1], op.modTarima), 0);
    const altos = [...new Set(tarimas.map((o) => fm(o.dims[2])))].join(', ');
    derivados.push({ nombre: 'Superficie de tarima', detalle: `alturas: ${altos} m`, cantidad: sup, unidad: 'm²', dec: 2 });
    derivados.push({ nombre: `Módulos de tarima de ${fm(op.modTarima[0], 1)} × ${fm(op.modTarima[1], 1)} m`, detalle: 'redondeado hacia arriba por tarima', cantidad: n, unidad: 'u', dec: 0 });
  }

  const truss = de('truss');
  if (truss.length) {
    const total = new Map();
    let largo = 0;
    for (const o of truss) {
      const L = Math.max(...o.dims);
      largo += L;
      for (const [m, n] of tramos(L, op.tramosTruss)) total.set(m, (total.get(m) || 0) + n);
    }
    derivados.push({ nombre: 'Truss', detalle: `${truss.length} tramo${truss.length === 1 ? '' : 's'} dibujado${truss.length === 1 ? '' : 's'}`, cantidad: largo, unidad: 'm', dec: 2 });
    for (const m of op.tramosTruss) {
      if (total.get(m)) derivados.push({ nombre: `Tramos de truss de ${fm(m, m % 1 ? 1 : 0)} m`, detalle: '', cantidad: total.get(m), unidad: 'u', dec: 0 });
    }
  }

  const barras = de('barra');
  if (barras.length) {
    derivados.push({ nombre: 'Frente de barra', detalle: `${barras.length} barra${barras.length === 1 ? '' : 's'}`, cantidad: barras.reduce((s, o) => s + o.dims[0], 0), unidad: 'm', dec: 2 });
  }

  const telas = de('tela');
  if (telas.length) {
    derivados.push({ nombre: 'Tela', detalle: 'ancho × alto', cantidad: telas.reduce((s, o) => s + o.dims[0] * o.dims[2], 0), unidad: 'm²', dec: 2 });
  }

  const vallados = de('vallado');
  if (vallados.length) {
    derivados.push({ nombre: 'Vallado', detalle: `${vallados.length} tramo${vallados.length === 1 ? '' : 's'}`, cantidad: vallados.reduce((s, o) => s + largoDe(o), 0), unidad: 'm', dec: 1 });
  }

  // Lo que no es material pero sirve para el armado: cocheras y metros de caminos.
  for (const o of escena.objetos.filter((x) => x.tipo === 'estacionamiento')) {
    const p = plazasEstacionamiento(o);
    derivados.push({ nombre: `Cocheras: ${o.nombre}`, detalle: p.accesibles ? `${p.accesibles} accesibles` : `de ${fm(p.ancho, 1)} × ${fm(p.fondo, 1)} m`, cantidad: p.cantidad, unidad: 'u', dec: 0 });
  }
  const porUso = new Map();
  for (const o of escena.objetos.filter((x) => x.tipo === 'camino')) porUso.set(o.uso || 'publico', (porUso.get(o.uso || 'publico') || 0) + largoDe(o));
  for (const [uso, L] of porUso) derivados.push({ nombre: `Caminos: ${(USOS_CAMINO[uso]?.nombre || uso).toLowerCase()}`, detalle: 'largo total', cantidad: L, unidad: 'm', dec: 1 });

  const superficies = [
    ...escena.areas.filter((a) => a.contorno?.length >= 3).map((a) => ({ nombre: a.nombre || a.id, tipo: 'Área', m2: Math.abs(areaFirmada(a.contorno)) })),
    ...escena.objetos.filter((o) => o.tipo === 'zona').map((o) => ({ nombre: o.nombre, tipo: 'Zona', m2: superficieDe(o), id: o.id })),
    ...escena.objetos.filter((o) => o.tipo === 'estacionamiento').map((o) => ({ nombre: o.nombre, tipo: 'Estacionamiento', m2: superficieDe(o), id: o.id })),
  ];

  return { items, codigoDe, derivados, superficies, op, total: items.reduce((s, it) => s + it.cantidad, 0) };
}

const nombreCat = new Map(CATEGORIAS);
export const nombreCategoria = (c) => nombreCat.get(c) || 'Otros';

// CSV con punto y coma y coma decimal, que Excel en español abre directo.
export function csvComputo(escena, c) {
  const celda = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const filas = [['Código', 'Categoría', 'Ítem', 'Modelo / ref.', 'Medidas', 'Cantidad', 'Unidad', 'Proveedor']];
  for (const it of c.items) {
    filas.push([it.codigo, nombreCategoria(it.cat), it.nombre, it.ref, it.medida, it.cantidad, it.unidad, it.proveedor]);
  }
  if (c.derivados.length) {
    filas.push([]);
    filas.push(['', 'Para el armado', 'Ítem', 'Detalle', '', 'Cantidad', 'Unidad', '']);
    for (const d of c.derivados) filas.push(['', '', d.nombre, d.detalle, '', fm(d.cantidad, d.dec), d.unidad, '']);
  }
  if (c.superficies.length) {
    filas.push([]);
    filas.push(['', 'Superficies', 'Nombre', 'Tipo', '', 'm²', '', '']);
    for (const s of c.superficies) filas.push(['', '', s.nombre, s.tipo, '', fm(s.m2, 1), 'm²', '']);
  }
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}
