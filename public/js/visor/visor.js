// Visor para compartir (el .html que se manda por WhatsApp): modelo 3D de solo lectura, hojas del plano,
// listado de materiales y mapa, en pestañas. Lee los datos de window.HM_VISOR:
//   { escena, nombre, subtitulo, generado, hojas: [svg], materialesHTML, mapaSVG }
// En el archivo exportado las hojas, los materiales y el mapa ya vienen escritos en el HTML (para que se vean
// aunque no corra JavaScript) y HM_VISOR trae solo la escena y los textos. Si la página no trae la estructura,
// se arma acá con los datos.

import { crearVista3D } from './escena3d.js';
import { hacerZoomable } from './zoom.js';
import { CSS_VISOR, cuerpoVisor } from './plantilla.js';
import { defDatos, ROLES_STAFF } from '../tipos-datos.js';
import { fm, esc, normalizarEscena } from '../formato.js';
import { superficieDe } from '../geometria.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];

function leerDatos() {
  if (window.HM_VISOR) return window.HM_VISOR;
  const nodo = document.getElementById('hm-datos');
  return nodo ? JSON.parse(nodo.textContent) : null;
}

function armarPagina(datos) {
  if (!$('#hm-visor-css')) {
    const estilo = document.createElement('style');
    estilo.id = 'hm-visor-css';
    estilo.textContent = CSS_VISOR;
    document.head.append(estilo);
  }
  document.body.insertAdjacentHTML('afterbegin', cuerpoVisor(datos));
  if (datos.nombre) document.title = `${datos.nombre} · House Mates`;
}

/* ------------------------------------------------------------------ ficha del objeto tocado */

function medidasDe(o) {
  const def = defDatos(o);
  const [w, p, h] = o.dims;
  if (o.tipo === 'zona' || o.tipo === 'estacionamiento') return `${fm(superficieDe(o), 1)} m²`;
  if (def.forma === 'linea' && Array.isArray(o.puntos)) {
    let L = 0;
    for (let i = 1; i < o.puntos.length; i++) L += Math.hypot(o.puntos[i][0] - o.puntos[i - 1][0], o.puntos[i][1] - o.puntos[i - 1][1]);
    return `${fm(L, 1)} m de largo`;
  }
  if (def.piso || h < 0.01) return `${fm(w)} × ${fm(p)} m`;
  return `${fm(w)} × ${fm(p)} × ${fm(h)} m`;
}

function llenarFicha(ficha, o) {
  const def = defDatos(o);
  $('.ficha-nombre', ficha).textContent = o.nombre || def.nombre;
  const tipo = o.tipo === 'puesto' && ROLES_STAFF[o.rol] ? `${def.nombre} · ${ROLES_STAFF[o.rol].nombre}` : def.nombre;
  $('.ficha-tipo', ficha).textContent = tipo !== o.nombre ? tipo : '';
  const filas = [];
  const medida = medidasDe(o);
  const titulo = o.tipo === 'zona' || o.tipo === 'estacionamiento' ? 'Superficie' : def.piso || o.dims[2] < 0.01 ? 'Ancho × largo' : 'Ancho × prof. × alto';
  filas.push([titulo, `<span class="medida">${esc(medida)}</span>`]);
  if (o.elev) filas.push(['Base', `a ${fm(o.elev)} m del piso`]);
  if (o.tipo === 'puesto') {
    filas.push(['Personas', esc(String(Number(o.personas) || 1))]);
    if (o.turno) filas.push(['Turno', esc(o.turno)]);
  }
  if (o.ref) filas.push(['Modelo', esc(o.ref)]);
  if (o.proveedor) filas.push(['Proveedor', esc(o.proveedor)]);
  if (o.texto && o.texto !== o.nombre) filas.push(['Texto', esc(o.texto)]);
  $('.ficha-datos', ficha).innerHTML = filas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  const nota = $('.ficha-nota', ficha);
  nota.textContent = o.nota ? String(o.nota) : '';
  nota.hidden = !o.nota;
  ficha.hidden = false;
}

/* ------------------------------------------------------------------ arranque */

export function iniciarVisor(datos = leerDatos()) {
  if (!datos) throw new Error('No hay datos para el visor (window.HM_VISOR).');
  if (!$('#hm-visor')) armarPagina(datos);
  const raiz = $('#hm-visor');
  document.documentElement.classList.add('js');
  document.documentElement.classList.remove('sin-3d');

  const panel3d = $('#panel-3d', raiz);
  const ficha = $('.ficha', panel3d);
  const pista = $('.pista', panel3d);
  let vista3d = null;

  /* -------------------------------------------------------------- pestañas */

  const pestanas = $$('.pestanas [role="tab"]', raiz);
  const zooms = new Map();

  function mostrar(id, { recordar = true } = {}) {
    if (!pestanas.some((b) => b.dataset.panel === id)) id = pestanas[0]?.dataset.panel;
    for (const b of pestanas) {
      const si = b.dataset.panel === id;
      b.setAttribute('aria-selected', String(si));
      b.tabIndex = si ? 0 : -1;
      const panel = document.getElementById(b.getAttribute('aria-controls'));
      if (panel) panel.hidden = !si;
    }
    vista3d?.activar(id === '3d');
    const panel = document.getElementById(`panel-${id}`);
    if (panel?.classList.contains('panel-zoom') && !zooms.has(id)) {
      const area = $('.zoom-area', panel);
      const ctl = $('.zoom-ctl', panel);
      const z = hacerZoomable(area, { salida: $('.zoom-valor', ctl) });
      ctl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-zoom]');
        if (!b) return;
        if (b.dataset.zoom === '+') z.acercar();
        else if (b.dataset.zoom === '-') z.alejar();
        else z.ajustar();
      });
      zooms.set(id, z);
    }
    if (recordar) {
      try {
        history.replaceState(null, '', `#${id}`);
      } catch {}
    }
  }

  $('.pestanas', raiz)?.addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]');
    if (b) mostrar(b.dataset.panel);
  });
  $('.pestanas', raiz)?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = pestanas.indexOf(document.activeElement);
    if (i < 0) return;
    const sig = pestanas[(i + (e.key === 'ArrowRight' ? 1 : pestanas.length - 1)) % pestanas.length];
    sig.focus();
    mostrar(sig.dataset.panel);
  });

  /* -------------------------------------------------------------- 3D */

  const tactil = matchMedia('(pointer: coarse)').matches;
  try {
    // Por si la escena viene escrita a mano: se completa lo mínimo para dibujar (como hace la app).
    const escena = normalizarEscena(JSON.parse(JSON.stringify(datos.escena || {})));
    vista3d = crearVista3D($('.lienzo', panel3d), escena, {
      alElegir: (o) => {
        if (o) llenarFicha(ficha, o);
        else ficha.hidden = true;
        pista.classList.add('fuera');
      },
      alMover: () => pista.classList.add('fuera'),
    });
    panel3d.classList.add('listo');
    $('[data-vista="pie"]', panel3d).hidden = !vista3d.tieneRecorrido;
    pista.textContent = tactil
      ? 'Arrastrá para girar, pellizcá para acercar y tocá un objeto para ver qué es.'
      : 'Arrastrá para girar, usá la rueda para acercar y el botón derecho para moverte. Hacé clic en un objeto para ver qué es.';
    pista.hidden = false;
    setTimeout(() => pista.classList.add('fuera'), 9000);
  } catch (e) {
    console.error(e);
    panel3d.classList.add('error');
    $('.sin-3d-texto', panel3d).textContent =
      'Este dispositivo no pudo abrir el modelo 3D. El plano y los materiales se ven igual en las otras pestañas.';
  }

  $('.barra-3d', panel3d)?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !vista3d) return;
    if (b.dataset.vista) vista3d.vista(b.dataset.vista);
    if (b.dataset.ver) {
      const v = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(v));
      if (b.dataset.ver === 'nombres') vista3d.ponerNombres(v);
      else if (b.dataset.ver === 'medidas') vista3d.ponerMedidas(v);
      else if (b.dataset.ver === 'noche') vista3d.ponerNoche(v);
    }
  });
  $('.ficha-cerrar', ficha).addEventListener('click', () => vista3d?.elegir(null));
  $('.ficha-acercar', ficha).addEventListener('click', () => vista3d?.acercar());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') vista3d?.elegir(null);
  });

  /* -------------------------------------------------------------- pestaña inicial */

  const pedida = location.hash.slice(1);
  mostrar(vista3d ? pedida || '3d' : pedida && pedida !== '3d' ? pedida : pestanas[1]?.dataset.panel || '3d', { recordar: false });
  window.hmVisorListo = true;
  return { mostrar, vista3d };
}
