// Checklist del armado en el celular: el equipo marca qué material llegó, qué está armado y qué tiene un
// problema. Se abre con http://<ip-de-la-compu>:5178/checklist.html#<slug> (el servidor con --red).
// Cada toque se ve al instante y se manda en orden. Si se corta el wifi, los cambios quedan en cola (también
// en localStorage, por si se recarga la página) y se reintentan solos.

import { normalizarEscena, esc } from './formato.js';
import { icono, tieneIcono } from './iconos.js';
import {
  itemsChecklist,
  estadoDeItem,
  estadoEfectivo,
  progreso,
  siguienteEstado,
  coincideFiltro,
  NOMBRES_ESTADO,
  FILTROS,
} from './checklist-datos.js';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CLAVE_PREF = 'housemates-plano:checklist';
const CLAVE_COLA = 'housemates-plano:checklist-cola:';
const FOTO_MAX = 1600;
const FOTO_CALIDAD = 0.82;
const $ = (id) => document.getElementById(id);

function leerGuardado(clave, defecto) {
  try {
    const v = JSON.parse(localStorage.getItem(clave) || 'null');
    return v ?? defecto;
  } catch {
    return defecto;
  }
}
function guardar(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {}
}

const pref = { quien: '', agrupar: 'categoria', filtro: 'todo', tema: 'oscuro', ayudaVista: false };
Object.assign(pref, leerGuardado(CLAVE_PREF, {}));
const guardarPref = () => guardar(CLAVE_PREF, pref);

const est = {
  slug: '',
  escena: null,
  error: '',
  errorChecklist: '',
  servidor: {}, // estados confirmados por el servidor
  version: -1,
  desfase: 0, // ms: reloj del servidor − reloj del celular (para las horas de lo que todavía no se guardó)
  cola: [], // cambios sin confirmar: { id, campos: { estado?, nota?, foto? }, hora, quien }
  enviando: false,
  sinConexion: false,
  intentos: 0,
  reintento: 0,
  fotos: [], // fotos sin subir: { slug, id, blob, nombre, tipo, url }
  subiendo: false,
  fotosLocales: new Map(), // id → URL local de la foto mientras sube
  fotoPara: null,
  secciones: [],
  hoja: null, // id del ítem abierto en la hoja de opciones
  notaOriginal: '',
  quienPreguntado: false,
  despuesDeQuien: null,
  suprimirClic: false,
  sseCaido: false,
};

// ------------------------------------------------------------------ red

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opciones });
  let datos = null;
  try {
    datos = await r.json();
  } catch {}
  return { r, datos };
}

function ajustarReloj(ahora) {
  const t = Date.parse(ahora);
  if (Number.isFinite(t)) est.desfase = t - Date.now();
}

function conexionOk() {
  if (!est.sinConexion && !est.intentos) return;
  est.sinConexion = false;
  est.intentos = 0;
  clearTimeout(est.reintento);
  render();
  actualizarBanner();
}

// Reintenta solo, cada vez más espaciado (1,5 s, 3 s, 6 s... hasta 30 s).
function marcarSinConexion() {
  const antes = est.sinConexion;
  est.sinConexion = true;
  est.intentos++;
  clearTimeout(est.reintento);
  est.reintento = setTimeout(reintentar, Math.min(30000, 1500 * 2 ** Math.min(est.intentos - 1, 5)));
  if (!antes) render();
  actualizarBanner();
}

async function reintentar({ escena = false } = {}) {
  clearTimeout(est.reintento);
  if (!est.slug) return;
  if (escena || !est.escena) await cargarEscena();
  await cargarEstados();
  render();
  subirFotos();
  enviarCola();
}

async function cargarEscena() {
  const slug = est.slug;
  try {
    const { r, datos } = await pedir(`/api/escenas/${slug}`);
    if (slug !== est.slug) return;
    conexionOk();
    if (!r.ok) {
      est.error = datos?.error || 'No se pudo abrir la escena.';
      return;
    }
    if (!datos || typeof datos !== 'object') {
      // Archivo con error de formato: se sigue mostrando la última versión buena.
      est.error = 'El archivo de la escena tiene un error de formato. Hay que arreglarlo en la compu.';
      return;
    }
    est.escena = normalizarEscena(datos);
    est.error = '';
  } catch {
    if (slug === est.slug) marcarSinConexion();
  }
}

async function cargarEstados() {
  const slug = est.slug;
  try {
    const { r, datos } = await pedir(`/api/checklist/${slug}`);
    if (slug !== est.slug) return;
    if (r.status >= 500) return marcarSinConexion();
    conexionOk();
    if (!r.ok) {
      est.errorChecklist =
        r.status === 404 && /ruta/i.test(datos?.error || '')
          ? 'El servidor de la compu todavía no tiene el checklist. Actualizá House Mates Plano.'
          : datos?.error || 'No se pudo leer el checklist.';
      return;
    }
    est.errorChecklist = '';
    ajustarReloj(datos.ahora);
    // Una respuesta más vieja que lo que ya se sabe (llegó tarde) no pisa nada.
    if (Number.isInteger(datos.version) && datos.version < est.version) return;
    est.servidor = datos.estados && typeof datos.estados === 'object' ? datos.estados : {};
    est.version = Number.isInteger(datos.version) ? datos.version : est.version;
  } catch {
    if (slug === est.slug) marcarSinConexion();
  }
}

// ------------------------------------------------------------------ cola de cambios

function guardarCola(slug = est.slug, cola = est.cola) {
  if (slug) guardar(CLAVE_COLA + slug, cola.length ? cola.map(({ enviando, ...op }) => op) : null);
}

function leerCola(slug) {
  const lista = leerGuardado(CLAVE_COLA + slug, []);
  return Array.isArray(lista)
    ? lista.filter((op) => op && typeof op.id === 'string' && op.campos && typeof op.campos === 'object').map((op) => ({ ...op }))
    : [];
}

function encolar(id, campos) {
  const hora = new Date(Date.now() + est.desfase).toISOString();
  const ultima = est.cola[est.cola.length - 1];
  // Toques seguidos sobre el mismo ítem que todavía no salieron se juntan en un solo pedido.
  if (ultima && !ultima.enviando && ultima.id === id) {
    Object.assign(ultima.campos, campos);
    if (campos.estado !== undefined) {
      ultima.hora = hora;
      ultima.quien = pref.quien;
    }
  } else {
    est.cola.push({ id, campos: { ...campos }, hora, quien: pref.quien });
  }
  guardarCola();
  render();
  enviarCola();
}

// Lo que dice el servidor más lo que todavía no confirmó (así la pantalla no "salta" mientras se guarda).
function vista() {
  const v = Object.assign({}, est.servidor);
  for (const op of est.cola) {
    const e = { ...(v[op.id] || {}) };
    if (op.campos.estado !== undefined) {
      e.estado = op.campos.estado;
      e.hora = op.hora;
      e.quien = op.quien;
    }
    if (op.campos.nota !== undefined) e.nota = op.campos.nota;
    if (op.campos.foto !== undefined) e.foto = op.campos.foto;
    v[op.id] = e;
  }
  return v;
}

async function enviarCola() {
  if (est.enviando || !est.slug || !est.cola.length) return;
  est.enviando = true;
  const slug = est.slug;
  // Si se cambia de escena en el medio, esta vuelta sigue con su propia cola (la de la escena anterior).
  const cola = est.cola;
  try {
    while (cola.length && est.slug === slug) {
      const op = cola[0];
      op.enviando = true;
      const cuerpo = { id: op.id, ...op.campos };
      if (op.campos.estado !== undefined && op.quien) cuerpo.quien = op.quien;
      let r;
      let datos;
      try {
        ({ r, datos } = await pedir(`/api/checklist/${slug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        }));
      } catch {
        op.enviando = false;
        marcarSinConexion();
        return;
      }
      if (r.status >= 500 || r.status === 408 || r.status === 429) {
        op.enviando = false;
        marcarSinConexion();
        return;
      }
      cola.shift();
      guardarCola(slug, cola);
      if (est.slug !== slug) return;
      conexionOk();
      if (!r.ok) {
        // El servidor no lo aceptó (dato inválido, escena borrada): se descarta y se avisa.
        mostrarAviso(datos?.error || 'No se pudo guardar el cambio.', 'error');
        render();
        continue;
      }
      ajustarReloj(datos.ahora);
      if (datos.item) est.servidor[op.id] = datos.item;
      else delete est.servidor[op.id];
      // Si la versión saltó más de uno, alguien más cambió algo en el medio: se vuelve a leer todo.
      if (Number.isInteger(datos.version)) {
        if (est.version >= 0 && datos.version > est.version + 1) programar('estados');
        est.version = Math.max(est.version, datos.version);
      }
      render();
    }
  } finally {
    est.enviando = false;
  }
}

// ------------------------------------------------------------------ fotos

// Achica la foto a 1600 px como mucho y la pasa a JPEG (las del celular pesan 3 a 8 MB).
async function achicar(archivo) {
  let fuente;
  let ancho;
  let alto;
  try {
    fuente = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    ancho = fuente.width;
    alto = fuente.height;
  } catch {
    fuente = await new Promise((ok, mal) => {
      const img = new Image();
      const url = URL.createObjectURL(archivo);
      img.onload = () => {
        URL.revokeObjectURL(url);
        ok(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        mal(new Error('No se pudo leer la foto'));
      };
      img.src = url;
    });
    ancho = fuente.naturalWidth;
    alto = fuente.naturalHeight;
  }
  if (!ancho || !alto) throw new Error('Foto vacía');
  const k = Math.min(1, FOTO_MAX / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(ancho * k));
  lienzo.height = Math.max(1, Math.round(alto * k));
  lienzo.getContext('2d').drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
  fuente.close?.();
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo achicar la foto'))), 'image/jpeg', FOTO_CALIDAD));
}

const idArchivo = (id) => String(id).replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
const urlFoto = (nombre) => `/fotos/${est.slug}/${encodeURIComponent(nombre)}`;

function pedirFoto(id) {
  est.fotoPara = id;
  const entrada = $('entrada-foto');
  entrada.value = '';
  entrada.click();
}

async function alElegirFoto() {
  const archivo = $('entrada-foto').files?.[0];
  const id = est.fotoPara;
  est.fotoPara = null;
  if (!archivo || !id || !est.slug) return;
  mostrarAviso('Preparando la foto…', 'info', { ms: 8000 });
  let blob;
  let ext = 'jpg';
  try {
    blob = await achicar(archivo);
  } catch {
    const tipos = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    if (!tipos[archivo.type]) {
      mostrarAviso('No se pudo leer la foto. Probá sacarla de nuevo.', 'error');
      return;
    }
    blob = archivo;
    ext = tipos[archivo.type];
  }
  const url = URL.createObjectURL(blob);
  const previa = est.fotosLocales.get(id);
  if (previa) setTimeout(() => URL.revokeObjectURL(previa), 2000);
  est.fotosLocales.set(id, url);
  est.fotos.push({ slug: est.slug, id, blob, url, tipo: blob.type || 'image/jpeg', nombre: `checklist-${idArchivo(id)}-${Date.now()}.${ext}` });
  render();
  subirFotos();
}

async function subirFotos() {
  if (est.subiendo || !est.fotos.length) return;
  est.subiendo = true;
  try {
    while (est.fotos.length) {
      const f = est.fotos[0];
      let r;
      let datos;
      try {
        ({ r, datos } = await pedir(`/api/fotos/${f.slug}?nombre=${encodeURIComponent(f.nombre)}`, {
          method: 'POST',
          headers: { 'Content-Type': f.tipo },
          body: f.blob,
        }));
      } catch {
        marcarSinConexion();
        return;
      }
      if (r.status >= 500) {
        marcarSinConexion();
        return;
      }
      est.fotos.shift();
      conexionOk();
      if (!r.ok || !datos?.nombre) {
        if (est.fotosLocales.get(f.id) === f.url) est.fotosLocales.delete(f.id);
        mostrarAviso(datos?.error || 'No se pudo subir la foto.', 'error');
        render();
        continue;
      }
      if (f.slug === est.slug) {
        if (est.fotosLocales.get(f.id) === f.url) est.fotosLocales.delete(f.id);
        encolar(f.id, { foto: datos.nombre });
        mostrarAviso('Foto guardada', 'ok');
      }
      setTimeout(() => URL.revokeObjectURL(f.url), 5000);
    }
  } finally {
    est.subiendo = false;
  }
}

// ------------------------------------------------------------------ acciones

const todosLosItems = () => est.secciones.flatMap((s) => s.items);
const buscarItem = (id) => todosLosItems().find((it) => it.id === id) || null;
const nombreConCantidad = (it) => `${it.nombre}${it.cantidad > 1 ? ` ×${it.cantidad}` : ''}`;

function conQuien(accion) {
  if (pref.quien) accion();
  else abrirQuien(accion);
}

function ciclar(id) {
  const it = buscarItem(id);
  if (!it) return;
  const estados = vista();
  const e = estadoDeItem(it, estados);
  const nuevo = siguienteEstado(e.estado);
  // Para deshacer: si las unidades estaban mezcladas, se vuelve cada una a lo que tenía.
  const antes = e.mixto
    ? it.ids.map((oid) => [oid, estadoEfectivo(oid, it.grupo, estados)?.estado || 'pendiente'])
    : [[it.id, e.estado]];
  encolar(it.id, { estado: nuevo });
  navigator.vibrate?.(8);
  mostrarAviso(`${NOMBRES_ESTADO[nuevo]}: ${nombreConCantidad(it)}`, nuevo === 'armado' ? 'ok' : 'info', {
    accion: 'Deshacer',
    alHacer: () => antes.forEach(([k, v]) => encolar(k, { estado: v })),
    ms: 5000,
  });
}

function ciclarUnidad(it, oid) {
  const actual = estadoEfectivo(oid, it.grupo, vista())?.estado || 'pendiente';
  encolar(oid, { estado: siguienteEstado(actual) });
  navigator.vibrate?.(8);
}

// ------------------------------------------------------------------ dibujo

const ICONO_ESTADO = { pendiente: '', llego: icono('descargar'), armado: icono('check'), problema: icono('advertencia') };
const ICONO_MAS = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5h.01M12 12h.01M12 19h.01" stroke-width="3.4"/></svg>';

function horaCorta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString() ? hh : `${d.getDate()}/${d.getMonth() + 1} ${hh}`;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function textoCuenta(c) {
  return [
    c.armado && plural(c.armado, 'armado', 'armados'),
    c.llego && plural(c.llego, 'llegó', 'llegaron'),
    c.problema && plural(c.problema, 'con problema', 'con problema'),
    c.pendiente && plural(c.pendiente, 'falta', 'faltan'),
  ]
    .filter(Boolean)
    .join(' · ');
}

function textoMeta(e) {
  if (e.mixto) return esc(textoCuenta(e.cuenta));
  const partes = [e.estado === 'pendiente' && !e.hora ? 'Falta' : NOMBRES_ESTADO[e.estado]];
  if (e.hora && e.quien) partes.push(e.quien);
  if (e.hora) partes.push(horaCorta(e.hora));
  return esc(partes.join(' · '));
}

function pendienteDeGuardar(it) {
  if (!est.cola.length) return false;
  const ids = new Set([it.id, it.grupo, ...it.ids]);
  return est.cola.some((op) => ids.has(op.id));
}

// Modelo, medida (como un pedazo de cinta, igual que en la compu) y proveedor.
function htmlDetalle(it, conProveedor) {
  return [
    it.ref && `<span>${esc(it.ref)}</span>`,
    `<span class="medida">${esc(it.medida)}</span>`,
    conProveedor && it.proveedor && `<span>${esc(it.proveedor)}</span>`,
  ]
    .filter(Boolean)
    .join('');
}

function htmlFila(it, e) {
  const guardando = pendienteDeGuardar(it);
  const local = est.fotosLocales.get(it.id);
  const foto = local || (e.foto ? urlFoto(e.foto) : '');
  const sig = NOMBRES_ESTADO[siguienteEstado(e.estado)];
  const etiqueta = `${nombreConCantidad(it)}: ${e.mixto ? textoCuenta(e.cuenta) : NOMBRES_ESTADO[e.estado]}. Tocá para marcar ${sig}.`;
  return `<li class="fila" data-estado="${e.estado}"${e.mixto ? ' data-mixto' : ''}>
  <button type="button" class="fila-tocar" data-accion="ciclar" data-id="${esc(it.id)}" aria-label="${esc(etiqueta)}">
    <span class="indicador" aria-hidden="true">${ICONO_ESTADO[e.estado]}</span>
    <span class="fila-texto">
      <span class="fila-nombre">${tieneIcono(it.tipo) ? icono(it.tipo, 'ico-tipo') : ''}<span>${esc(it.nombre)}</span>${it.cantidad > 1 ? `<span class="cantidad">×${it.cantidad}</span>` : ''}</span>
      <span class="fila-det">${htmlDetalle(it, pref.agrupar !== 'proveedor')}</span>
      <span class="fila-meta">${textoMeta(e)}${guardando ? `<span class="guardando">${est.sinConexion ? 'sin guardar' : 'guardando…'}</span>` : ''}</span>
      ${e.nota ? `<span class="fila-nota">${esc(e.nota)}</span>` : ''}
    </span>
  </button>
  <button type="button" class="fila-foto${foto ? ' con-foto' : ''}" data-accion="${foto ? 'mas' : 'foto'}" data-id="${esc(it.id)}" aria-label="${foto ? 'Ver la foto' : 'Sacar una foto'}">${
    foto ? `<img src="${esc(foto)}" alt="" loading="lazy" decoding="async">` : icono('foto')
  }</button>
  <button type="button" class="fila-mas" data-accion="mas" data-id="${esc(it.id)}" aria-label="Más: problema, nota y foto de ${esc(it.nombre)}">${ICONO_MAS}</button>
</li>`;
}

const VACIO_FILTRO = {
  pendiente: 'Ya llegó todo.',
  llego: 'No hay nada esperando para armar.',
  armado: 'Todavía no hay nada armado.',
  problema: 'Sin problemas por ahora.',
};

function fechaLinda(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f || '');
}

function htmlResumen(prog) {
  const e = est.escena;
  const p = e.proyecto && typeof e.proyecto === 'object' ? e.proyecto : {};
  const titulo = p.evento || e.nombre;
  const meta = [p.evento ? e.nombre : '', fechaLinda(p.fecha), p.lugar].filter(Boolean).map(String).join(' · ');
  const ancho = (n) => (prog.total ? `${((100 * n) / prog.total).toFixed(2)}%` : '0%');
  const leyenda = [
    ['armado', prog.armado, 'armado', 'armados'],
    ['llego', prog.llego, 'llegó', 'llegaron'],
    ['problema', prog.problema, 'con problema', 'con problema'],
    ['pendiente', prog.pendiente, 'falta', 'faltan'],
  ]
    .filter(([, n]) => n)
    .map(([k, n, uno, varios]) => `<span class="l l-${k}"><b>${n}</b> ${n === 1 ? uno : varios}</span>`)
    .join('');
  return `<h1 class="evento">${esc(titulo)}</h1>
${meta ? `<p class="evento-meta">${esc(meta)}</p>` : ''}
${est.error ? `<p class="nota-error">${esc(est.error)}</p>` : ''}
${est.errorChecklist ? `<p class="nota-error">${esc(est.errorChecklist)}</p>` : ''}
<div class="avance">
  <div class="avance-num"><strong>${prog.porcentaje}</strong><span>%</span></div>
  <div class="avance-der">
    <div class="barra" role="progressbar" aria-label="Avance del armado" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prog.porcentaje}">
      <i class="seg-armado" style="width:${ancho(prog.armado)}"></i><i class="seg-llego" style="width:${ancho(prog.llego)}"></i><i class="seg-problema" style="width:${ancho(prog.problema)}"></i>
    </div>
    <p class="leyenda">${leyenda || 'Nada para chequear'}<span class="l-total">de ${prog.total}</span></p>
  </div>
</div>`;
}

function poner(el, html) {
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
}

function render() {
  if (!est.slug) return;
  const cont = $('contenido');
  if (!est.escena) {
    $('barra-fija').hidden = true;
    $('agrupar').hidden = true;
    poner($('resumen'), '');
    poner(
      cont,
      est.error
        ? `<div class="vacio"><h2>No se pudo abrir el evento</h2><p>${esc(est.error)}</p><a class="boton" href="#">Elegir otro evento</a></div>`
        : '<p class="cargando">Cargando…</p>'
    );
    return;
  }
  const estados = vista();
  est.secciones = itemsChecklist(est.escena, { agrupar: pref.agrupar });
  const prog = progreso(est.secciones, estados);
  document.title = `${est.escena.proyecto?.evento || est.escena.nombre} · Checklist`;
  poner($('resumen'), htmlResumen(prog));

  const fija = $('barra-fija');
  fija.hidden = !prog.total;
  $('agrupar').hidden = !prog.total;
  fija.style.setProperty('--armado', prog.total ? `${(100 * prog.armado) / prog.total}%` : '0%');
  fija.style.setProperty('--llego', prog.total ? `${(100 * prog.llego) / prog.total}%` : '0%');
  fija.style.setProperty('--problema', prog.total ? `${(100 * prog.problema) / prog.total}%` : '0%');
  const cuentas = { todo: prog.total, pendiente: prog.pendiente, llego: prog.llego, armado: prog.armado, problema: prog.problema };
  poner(
    $('chips'),
    FILTROS.map(
      ([k, nombre]) =>
        `<button type="button" class="chip chip-${k}" role="radio" aria-checked="${pref.filtro === k}" data-filtro="${k}">${nombre}<b>${cuentas[k]}</b></button>`
    ).join('')
  );
  poner(
    $('agrupar'),
    [
      ['categoria', 'Por categoría'],
      ['proveedor', 'Por proveedor'],
    ]
      .map(([k, nombre]) => `<button type="button" role="radio" aria-checked="${pref.agrupar === k}" data-agrupar="${k}">${nombre}</button>`)
      .join('')
  );

  let html = '';
  if (!prog.total) {
    html = `<div class="vacio"><h2>No hay materiales para chequear</h2><p>Esta escena todavía no tiene cosas de la fiesta (sonido, luces, barra…). Cuando las agreguen en la compu aparecen acá solas.</p><a class="boton" href="#">Elegir otro evento</a></div>`;
  } else {
    if (!pref.ayudaVista) {
      html += `<div class="ayuda"><p><b>Tocá un renglón</b> para marcarlo: Pendiente → Llegó → Armado. <b>Mantené apretado</b> (o tocá ⋮) para avisar un problema, dejar una nota o ver la foto.</p><button type="button" data-accion="cerrar-ayuda">Entendido</button></div>`;
    }
    let alguno = false;
    for (const s of est.secciones) {
      const filas = s.items.map((it) => ({ it, e: estadoDeItem(it, estados) }));
      const visibles = filas.filter((f) => coincideFiltro(f.e, pref.filtro));
      if (!visibles.length) continue;
      alguno = true;
      const unidades = filas.reduce((n, f) => n + f.it.cantidad, 0);
      const armados = filas.reduce((n, f) => n + f.e.cuenta.armado, 0);
      const tel = s.telefono.replace(/[^\d+]/g, '');
      html += `<section class="seccion">
  <div class="seccion-cab"><h2>${esc(s.titulo)}</h2><span class="seccion-cuenta${armados === unidades ? ' completa' : ''}">${armados}/${unidades} armado${unidades === 1 ? '' : 's'}</span></div>
  ${s.detalle || tel ? `<p class="seccion-det">${esc(s.detalle)}${tel ? ` <a class="llamar" href="tel:${esc(tel)}">Llamar</a>` : ''}</p>` : ''}
  <ul class="lista">${visibles.map((f) => htmlFila(f.it, f.e)).join('')}</ul>
</section>`;
    }
    if (!alguno) html += `<div class="vacio"><h2>${esc(VACIO_FILTRO[pref.filtro] || 'Nada para mostrar.')}</h2><button type="button" data-accion="ver-todo">Ver todo</button></div>`;
  }
  poner(cont, html);
  if (est.hoja) actualizarHoja();
  actualizarBanner();
}

function actualizarBanner() {
  const pendientes = est.cola.length;
  const fotos = est.fotos.length;
  const ver = est.sinConexion;
  $('sin-conexion').hidden = !ver;
  document.body.classList.toggle('sin-red', ver);
  if (!ver) return;
  const partes = ['Sin conexión con la compu.'];
  if (pendientes) partes.push(`${plural(pendientes, 'cambio', 'cambios')} sin guardar: se mandan solos cuando vuelva.`);
  if (fotos) partes.push(`${plural(fotos, 'foto', 'fotos')} sin subir.`);
  if (!pendientes && !fotos) partes.push('Revisá que el celular esté en el mismo wifi.');
  $('sin-conexion-texto').textContent = partes.join(' ');
}

function mostrarAviso(texto, tipo = 'info', { accion = '', alHacer = null, ms = 3200 } = {}) {
  const el = $('aviso');
  el.className = `aviso aviso-${tipo}`;
  el.innerHTML = `<span>${esc(texto)}</span>${accion ? `<button type="button">${esc(accion)}</button>` : ''}`;
  el.hidden = false;
  if (accion) {
    el.querySelector('button').onclick = () => {
      el.hidden = true;
      alHacer?.();
    };
  }
  clearTimeout(mostrarAviso.t);
  mostrarAviso.t = setTimeout(() => (el.hidden = true), ms);
}

// ------------------------------------------------------------------ hoja de opciones (problema, nota, foto)

function abrirHoja(id) {
  const it = buscarItem(id);
  if (!it) return;
  est.hoja = id;
  const d = $('hoja');
  d.innerHTML = `<div class="hoja-cuerpo">
  <div class="hoja-cab">
    <div class="hoja-tit">
      <h2 id="hoja-titulo">${tieneIcono(it.tipo) ? icono(it.tipo, 'ico-tipo') : ''}<span>${esc(it.nombre)}</span>${it.cantidad > 1 ? `<span class="cantidad">×${it.cantidad}</span>` : ''}</h2>
      <p class="hoja-det">${htmlDetalle(it, true)}</p>
    </div>
    <button type="button" class="boton-icono" data-hoja="cerrar" aria-label="Cerrar">${icono('cerrar')}</button>
  </div>
  <p class="hoja-meta" id="hoja-meta"></p>
  <div class="hoja-estados" role="group" aria-label="Estado">
    ${['pendiente', 'llego', 'armado', 'problema']
      .map(
        (k) =>
          `<button type="button" class="estado-btn" data-hoja="estado" data-estado="${k}" aria-pressed="false"><span class="indicador" aria-hidden="true">${ICONO_ESTADO[k]}</span>${NOMBRES_ESTADO[k]}</button>`
      )
      .join('')}
  </div>
  <label class="hoja-label" for="hoja-nota">Nota <span>qué pasó, qué falta, dónde quedó</span></label>
  <textarea id="hoja-nota" maxlength="500" rows="3" placeholder="Ej.: llegó con un cable menos"></textarea>
  <div class="hoja-fila-derecha"><button type="button" data-hoja="guardar-nota">Guardar nota</button></div>
  <div class="hoja-foto" id="hoja-foto"></div>
  <div class="hoja-unidades" id="hoja-unidades"></div>
</div>`;
  const e = estadoDeItem(it, vista());
  est.notaOriginal = e.nota;
  $('hoja-nota').value = e.nota;
  if (!d.open) d.showModal();
  actualizarHoja();
  d.querySelector('.hoja-cuerpo').scrollTop = 0;
}

function actualizarHoja() {
  const d = $('hoja');
  if (!est.hoja || !d.open) return;
  const it = buscarItem(est.hoja);
  if (!it) {
    est.hoja = null;
    d.close();
    mostrarAviso('Ese ítem ya no está en la escena.', 'error');
    return;
  }
  const estados = vista();
  const e = estadoDeItem(it, estados);
  d.querySelectorAll('[data-hoja="estado"]').forEach((b) => b.setAttribute('aria-pressed', String(!e.mixto && b.dataset.estado === e.estado)));
  poner($('hoja-meta'), e.hora || e.mixto ? `${e.mixto ? 'Unidades: ' : ''}${textoMeta(e)}` : 'Nadie lo marcó todavía.');
  const ta = $('hoja-nota');
  if (document.activeElement !== ta && ta.value === est.notaOriginal && e.nota !== est.notaOriginal) {
    ta.value = e.nota;
    est.notaOriginal = e.nota;
  }
  const local = est.fotosLocales.get(it.id);
  const foto = local || (e.foto ? urlFoto(e.foto) : '');
  const propia = estados[it.id]?.foto;
  poner(
    $('hoja-foto'),
    foto
      ? `<a class="foto-grande" href="${esc(foto)}" target="_blank" rel="noopener"><img src="${esc(foto)}" alt="Foto de ${esc(it.nombre)}"></a>
<div class="hoja-fila-derecha">${local ? '<span class="subiendo">Subiendo…</span>' : ''}${propia && !local ? '<button type="button" data-hoja="quitar-foto">Quitar foto</button>' : ''}<button type="button" data-hoja="foto">${icono('foto')} Sacar otra</button></div>`
      : `<button type="button" class="ancho" data-hoja="foto">${icono('foto')} Sacar una foto</button>`
  );
  if (it.cantidad > 1) {
    const veces = new Map();
    for (const n of it.nombres) veces.set(n, (veces.get(n) || 0) + 1);
    const numero = new Map();
    const filas = it.ids.map((oid, i) => {
      const nombre = it.nombres[i];
      const n = (numero.get(nombre) || 0) + 1;
      numero.set(nombre, n);
      const es = estadoEfectivo(oid, it.grupo, estados)?.estado || 'pendiente';
      return `<li><button type="button" class="unidad" data-hoja="unidad" data-id="${esc(oid)}" data-estado="${es}"><span>${esc(nombre)}${veces.get(nombre) > 1 ? ` ${n}` : ''}</span><span class="pastilla">${NOMBRES_ESTADO[es]}</span></button></li>`;
    });
    poner($('hoja-unidades'), `<h3>Una por una <span>tocá para cambiar solo esa</span></h3><ul>${filas.join('')}</ul>`);
  } else {
    poner($('hoja-unidades'), '');
  }
}

function guardarNota(it, avisar) {
  const ta = $('hoja-nota');
  if (!ta || !it) return;
  const nota = ta.value.trim();
  if (nota === (est.notaOriginal || '').trim()) return;
  est.notaOriginal = nota;
  encolar(it.id, { nota });
  if (avisar) mostrarAviso(nota ? 'Nota guardada' : 'Nota borrada', 'ok');
}

function marcarDesdeHoja(it, estado) {
  const nota = $('hoja-nota').value.trim();
  const campos = { estado };
  if (nota !== (est.notaOriginal || '').trim()) {
    campos.nota = nota;
    est.notaOriginal = nota;
  }
  encolar(it.id, campos);
  navigator.vibrate?.(8);
  if (estado === 'problema' && !nota) {
    $('hoja-nota').focus();
    mostrarAviso('Marcado con problema. Si podés, contá qué pasó en la nota.', 'error', { ms: 4000 });
  }
}

function cerrarHoja() {
  const d = $('hoja');
  if (d.open) d.close();
}

function configurarHoja() {
  const d = $('hoja');
  let desdeFondo = false;
  d.addEventListener('pointerdown', (ev) => (desdeFondo = ev.target === d));
  d.addEventListener('click', (ev) => {
    if (ev.target === d) {
      if (desdeFondo) cerrarHoja();
      return;
    }
    const b = ev.target.closest('[data-hoja]');
    const it = est.hoja && buscarItem(est.hoja);
    if (!b || !it) return;
    const accion = b.dataset.hoja;
    if (accion === 'cerrar') cerrarHoja();
    else if (accion === 'estado') conQuien(() => marcarDesdeHoja(it, b.dataset.estado));
    else if (accion === 'guardar-nota') guardarNota(it, true);
    else if (accion === 'foto') pedirFoto(it.id);
    else if (accion === 'quitar-foto') {
      if (confirm('¿Quitar la foto de este ítem? El archivo queda guardado en la compu.')) encolar(it.id, { foto: '' });
    } else if (accion === 'unidad') conQuien(() => ciclarUnidad(it, b.dataset.id));
  });
  d.addEventListener('close', () => {
    const it = est.hoja && buscarItem(est.hoja);
    if (it) guardarNota(it, true);
    est.hoja = null;
    // Con la hoja abierta la lista no recibe toques: lo próximo que se toque ya es a propósito.
    est.suprimirClic = false;
  });
}

// ------------------------------------------------------------------ quién marca

function actualizarQuien() {
  const b = $('btn-quien');
  b.hidden = !est.slug;
  b.innerHTML = `${icono('persona')}<span>${esc(pref.quien || 'Tu nombre')}</span>`;
  b.setAttribute('aria-label', pref.quien ? `Marcás como ${pref.quien}. Tocá para cambiar el nombre` : 'Poné tu nombre');
}

function abrirQuien(despues = null) {
  est.despuesDeQuien = despues;
  const d = $('dlg-quien');
  $('campo-quien').value = pref.quien || '';
  if (!d.open) d.showModal();
  setTimeout(() => $('campo-quien').focus(), 60);
}

function configurarQuien() {
  $('btn-quien').addEventListener('click', () => abrirQuien());
  $('form-quien').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const campo = $('campo-quien');
    const nombre = campo.value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!nombre) {
      campo.focus();
      return;
    }
    pref.quien = nombre;
    guardarPref();
    actualizarQuien();
    const despues = est.despuesDeQuien;
    est.despuesDeQuien = null;
    $('dlg-quien').close();
    despues?.();
  });
  $('dlg-quien').addEventListener('close', () => (est.despuesDeQuien = null));
}

// ------------------------------------------------------------------ elegir escena

async function mostrarSelector() {
  est.slug = '';
  est.escena = null;
  est.hoja = null;
  est.cola = []; // lo pendiente de la escena anterior queda guardado en el celular y sale al volver a abrirla
  actualizarBanner();
  $('barra-fija').hidden = true;
  $('agrupar').hidden = true;
  actualizarQuien();
  document.title = 'Checklist · House Mates Plano';
  poner($('resumen'), '<h1 class="evento">Elegí el evento</h1><p class="evento-meta">Las escenas guardadas en la compu.</p>');
  const cont = $('contenido');
  try {
    const { r, datos } = await pedir('/api/escenas');
    if (est.slug) return;
    conexionOk();
    if (!r.ok || !Array.isArray(datos)) throw new Error(datos?.error || 'sin lista');
    poner(
      cont,
      datos.length
        ? `<ul class="escenas">${datos
            .map(
              (e) =>
                `<li><a class="escena" href="#${esc(e.slug)}"><span class="escena-nombre">${esc(e.nombre)}</span><span class="escena-fecha">${Number.isFinite(e.modificado) ? `Cambiada ${esc(horaCorta(e.modificado))}` : ''}</span></a></li>`
            )
            .join('')}</ul>`
        : '<div class="vacio"><h2>No hay escenas guardadas</h2><p>Creá una en la compu y aparece acá.</p></div>'
    );
  } catch {
    if (est.slug) return;
    poner(cont, '<div class="vacio"><h2>No se pudo conectar con la compu</h2><p>Revisá que el celular esté en el mismo wifi y que House Mates Plano esté abierto con la opción de red.</p><button type="button" data-accion="recargar-lista">Reintentar</button></div>');
  }
}

async function abrirDesdeHash() {
  let slug = '';
  try {
    slug = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();
  } catch {}
  if (!slug) return mostrarSelector();
  if (slug === est.slug) return;
  est.slug = slug;
  est.escena = null;
  est.error = SLUG.test(slug) ? '' : 'El nombre de la escena en la dirección no es válido.';
  est.errorChecklist = '';
  est.servidor = {};
  est.version = -1;
  est.cola = leerCola(slug);
  est.hoja = null;
  est.secciones = [];
  if (est.cola.length) mostrarAviso(`Hay ${plural(est.cola.length, 'cambio', 'cambios')} de antes sin guardar. Se mandan ahora.`);
  actualizarQuien();
  render();
  if (est.error) return;
  await Promise.all([cargarEscena(), cargarEstados()]);
  if (slug !== est.slug) return;
  render();
  enviarCola();
  if (!pref.quien && !est.quienPreguntado && est.escena) {
    est.quienPreguntado = true;
    abrirQuien();
  }
}

// ------------------------------------------------------------------ avisos en vivo (SSE)

const programados = new Map();
function programar(que) {
  clearTimeout(programados.get(que));
  programados.set(
    que,
    setTimeout(async () => {
      programados.delete(que);
      if (!est.slug) return;
      if (que === 'escena') await cargarEscena();
      else await cargarEstados();
      render();
    }, 250)
  );
}

function conectarEventos() {
  if (!('EventSource' in window)) return;
  const fuente = new EventSource('/api/eventos');
  fuente.onopen = () => {
    // Al volver la conexión puede haberse perdido algún aviso: se relee todo y se manda lo pendiente.
    if (est.sseCaido) {
      est.sseCaido = false;
      reintentar({ escena: true });
    }
  };
  fuente.onerror = () => (est.sseCaido = true);
  fuente.onmessage = (ev) => {
    let d;
    try {
      d = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!est.slug) {
      if (d.tipo === 'lista') mostrarSelector();
      return;
    }
    if (d.slug !== est.slug) return;
    if (d.tipo === 'checklist' && !(Number.isInteger(d.version) && d.version <= est.version)) programar('estados');
    if (d.tipo === 'escena') programar('escena');
    if (d.tipo === 'error') mostrarAviso('El archivo de la escena tiene un error de formato. Se sigue mostrando la última versión buena.', 'error', { ms: 6000 });
  };
}

// ------------------------------------------------------------------ toques largos

function configurarToques() {
  const cont = $('contenido');
  let presion = null;
  const soltar = () => {
    if (!presion) return;
    clearTimeout(presion.t);
    presion.boton.classList.remove('apretando');
    presion = null;
  };
  cont.addEventListener('pointerdown', (ev) => {
    est.suprimirClic = false;
    const b = ev.target.closest('.fila-tocar');
    if (!b || ev.button > 0) return;
    soltar();
    b.classList.add('apretando');
    const id = b.dataset.id;
    presion = {
      boton: b,
      x: ev.clientX,
      y: ev.clientY,
      t: setTimeout(() => {
        soltar();
        est.suprimirClic = true;
        navigator.vibrate?.(20);
        abrirHoja(id);
      }, 520),
    };
  });
  cont.addEventListener('pointermove', (ev) => {
    if (presion && Math.hypot(ev.clientX - presion.x, ev.clientY - presion.y) > 10) soltar();
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) cont.addEventListener(t, soltar);
  window.addEventListener('scroll', soltar, { passive: true });
  cont.addEventListener('contextmenu', (ev) => {
    if (ev.target.closest('.fila-tocar')) ev.preventDefault();
  });
  cont.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    if (est.suprimirClic) {
      est.suprimirClic = false;
      return;
    }
    const { accion, id } = b.dataset;
    if (accion === 'ciclar') conQuien(() => ciclar(id));
    else if (accion === 'foto') pedirFoto(id);
    else if (accion === 'mas') abrirHoja(id);
    else if (accion === 'cerrar-ayuda') {
      pref.ayudaVista = true;
      guardarPref();
      render();
    } else if (accion === 'ver-todo') {
      pref.filtro = 'todo';
      guardarPref();
      render();
    } else if (accion === 'recargar-lista') mostrarSelector();
  });
}

// ------------------------------------------------------------------ tema

function aplicarTema() {
  const claro = pref.tema === 'claro';
  document.documentElement.dataset.tema = claro ? 'claro' : 'oscuro';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', claro ? '#ffffff' : '#0a0a0a');
  const b = $('btn-tema');
  b.innerHTML = icono(claro ? 'luna' : 'sol');
  b.setAttribute('aria-label', claro ? 'Volver al modo oscuro' : 'Modo sol: más contraste al aire libre');
  b.title = claro ? 'Modo oscuro' : 'Modo sol';
}

// ------------------------------------------------------------------ arranque

function iniciar() {
  aplicarTema();
  configurarToques();
  configurarHoja();
  configurarQuien();
  $('chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-filtro]');
    if (!b) return;
    pref.filtro = b.dataset.filtro;
    guardarPref();
    render();
  });
  $('agrupar').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-agrupar]');
    if (!b) return;
    pref.agrupar = b.dataset.agrupar;
    guardarPref();
    render();
  });
  $('btn-tema').addEventListener('click', () => {
    pref.tema = pref.tema === 'claro' ? 'oscuro' : 'claro';
    guardarPref();
    aplicarTema();
  });
  $('btn-reintentar').addEventListener('click', () => reintentar({ escena: true }));
  $('entrada-foto').addEventListener('change', alElegirFoto);
  window.addEventListener('hashchange', abrirDesdeHash);
  window.addEventListener('online', () => reintentar());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && est.slug) reintentar({ escena: true });
  });
  if (!FILTROS.some(([k]) => k === pref.filtro)) pref.filtro = 'todo';
  if (pref.agrupar !== 'proveedor') pref.agrupar = 'categoria';
  conectarEventos();
  abrirDesdeHash();
}

iniciar();
