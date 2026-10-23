// Visor para compartir: estilos y estructura de la página. Lo usan compartir.js (al exportar, para dejar el
// plano, los materiales y el mapa escritos en el HTML y que se vean aunque el teléfono no corra JavaScript)
// y visor.js (si la página no trae la estructura, la arma con los datos). No usa el motor 3D.

import { esc } from '../formato.js';

// Marca de House Mates (la misma casita del ícono de la app).
export const LOGO_SVG =
  '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0A0A0A"/>' +
  '<path d="M7 25V14.5l9-7 9 7V25" fill="none" stroke="#2447F5" stroke-width="3"/></svg>';

export const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230A0A0A'/%3E%3Cpath d='M7 25V14.5l9-7 9 7V25' fill='none' stroke='%232447F5' stroke-width='3'/%3E%3C/svg%3E";

// Íconos de línea (grilla de 24) de las pestañas.
const ICONOS = {
  '3d': 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  plano: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5',
  materiales: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  mapa: 'M9 4L3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zM9 4v13.5M15 6.5V20',
};

export const icono = (nombre) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[nombre]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Deja un SVG listo para ir adentro del HTML: sin prólogo XML, con los id propios (para que dos hojas que
// usan el mismo id no se pisen) y sin ancho ni alto fijos (lo maneja el CSS). Devuelve también la proporción.
export function prepararSVG(svg, prefijo) {
  let s = String(svg || '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim();
  const ids = new Set();
  s.replace(/\sid="([^"]+)"/g, (_, id) => ids.add(id));
  if (ids.size) {
    s = s
      .replace(/(\sid=")([^"]+)"/g, (m, a, id) => `${a}${prefijo}${id}"`)
      .replace(/url\((['"]?)#([^)'"]+)\1\)/g, (m, q, id) => (ids.has(id) ? `url(#${prefijo}${id})` : m))
      .replace(/((?:xlink:)?href=")#([^"]+)"/g, (m, a, id) => (ids.has(id) ? `${a}#${prefijo}${id}"` : m));
  }
  const tag = /<svg\b[^>]*>/i.exec(s);
  let ancho = 297;
  let alto = 210;
  if (tag) {
    const vb = /\sviewBox="([^"]+)"/.exec(tag[0]);
    const n = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : [];
    if (n.length === 4 && n[2] > 0 && n[3] > 0) {
      ancho = n[2];
      alto = n[3];
    } else {
      const w = parseFloat(/\swidth="([^"]+)"/.exec(tag[0])?.[1]);
      const h = parseFloat(/\sheight="([^"]+)"/.exec(tag[0])?.[1]);
      if (w > 0 && h > 0) {
        ancho = w;
        alto = h;
        s = s.replace(tag[0], tag[0].replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`));
      }
    }
    const t2 = /<svg\b[^>]*>/i.exec(s)[0];
    s = s.replace(t2, t2.replace(/\s(width|height)="[^"]*"/g, ''));
  }
  return { svg: s, ancho, alto };
}

const figura = (svg, prefijo, clase, etiqueta) => {
  const p = prepararSVG(svg, prefijo);
  return `<figure class="${clase}" style="aspect-ratio:${+p.ancho.toFixed(3)} / ${+p.alto.toFixed(3)}" aria-label="${esc(etiqueta)}">${p.svg}</figure>`;
};

// Estructura de la página. Las pestañas que no tienen contenido no aparecen.
export function cuerpoVisor({ nombre = 'House Mates', subtitulo = '', generado = '', hojas = [], materialesHTML = '', mapaSVG = '' } = {}) {
  const pestanas = [['3d', '3D']];
  if (hojas.length) pestanas.push(['plano', 'Plano']);
  if (materialesHTML) pestanas.push(['materiales', 'Materiales']);
  if (mapaSVG) pestanas.push(['mapa', 'Mapa']);
  const botones = pestanas
    .map(
      ([id, texto], i) =>
        `<button type="button" role="tab" id="tab-${id}" data-panel="${id}" aria-controls="panel-${id}" aria-selected="${i === 0}">${icono(id)}<span>${texto}</span></button>`
    )
    .join('');
  const zoom = `<div class="zoom-ctl" role="group" aria-label="Zoom">
      <button type="button" data-zoom="-" aria-label="Alejar">−</button>
      <output class="zoom-valor">100%</output>
      <button type="button" data-zoom="+" aria-label="Acercar">+</button>
      <button type="button" data-zoom="1" class="zoom-ajustar">Ajustar</button>
    </div>`;
  const total = hojas.length;
  const hojasHTML = hojas.map((s, i) => figura(s, `h${i + 1}-`, 'hoja', `Hoja ${i + 1} de ${total}`)).join('\n');
  return `<div id="hm-visor" class="visor">
  <header class="cabeza">
    ${LOGO_SVG}
    <div class="titulos">
      <h1>${esc(nombre)}</h1>
      <p>${subtitulo ? `${esc(subtitulo)} · ` : ''}<span class="solo-lectura">Solo para ver</span></p>
    </div>
  </header>
  <nav class="pestanas" role="tablist" aria-label="Secciones">${botones}</nav>
  <main class="paneles">
    <section id="panel-3d" class="panel panel-3d" role="tabpanel" aria-labelledby="tab-3d">
      <h2 class="titulo-estatico">Modelo 3D</h2>
      <div class="lienzo"></div>
      <div class="barra-3d" role="toolbar" aria-label="Vista 3D">
        <button type="button" class="chip" data-vista="diagonal">Diagonal</button>
        <button type="button" class="chip" data-vista="arriba">Arriba</button>
        <button type="button" class="chip" data-vista="frente">Frente</button>
        <button type="button" class="chip" data-vista="pie" hidden>A pie</button>
        <span class="sep"></span>
        <button type="button" class="chip" data-ver="nombres" aria-pressed="false">Nombres</button>
        <button type="button" class="chip" data-ver="medidas" aria-pressed="false">Medidas</button>
        <button type="button" class="chip" data-ver="noche" aria-pressed="false">Noche</button>
      </div>
      <p class="pista" hidden></p>
      <div class="ficha" hidden aria-live="polite">
        <div class="ficha-cabeza">
          <div><strong class="ficha-nombre"></strong><span class="ficha-tipo"></span></div>
          <button type="button" class="ficha-cerrar" aria-label="Cerrar">×</button>
        </div>
        <dl class="ficha-datos"></dl>
        <p class="ficha-nota" hidden></p>
        <button type="button" class="chip ficha-acercar">Acercar</button>
      </div>
      <div class="mensaje-3d" role="status">
        <p class="cargando">Cargando el modelo 3D…</p>
        <p class="sin-3d-texto">El modelo 3D no se pudo abrir acá. Abrí este archivo con Chrome, Safari o Edge actualizados
          (si el teléfono lo muestra como vista previa, tocá “Abrir con” y elegí el navegador). El plano y los materiales
          están más abajo.</p>
      </div>
    </section>
    ${
      total
        ? `<section id="panel-plano" class="panel panel-zoom" role="tabpanel" aria-labelledby="tab-plano" hidden>
      <h2 class="titulo-estatico">Plano</h2>
      <div class="zoom-area"><div class="zoom-contenido hojas">${hojasHTML}</div></div>
      ${zoom}
    </section>`
        : ''
    }
    ${
      materialesHTML
        ? `<section id="panel-materiales" class="panel panel-materiales" role="tabpanel" aria-labelledby="tab-materiales" hidden>
      <h2 class="titulo-estatico">Materiales</h2>
      <div class="materiales">${materialesHTML}</div>
    </section>`
        : ''
    }
    ${
      mapaSVG
        ? `<section id="panel-mapa" class="panel panel-zoom" role="tabpanel" aria-labelledby="tab-mapa" hidden>
      <h2 class="titulo-estatico">Mapa</h2>
      <div class="zoom-area"><div class="zoom-contenido mapa">${figura(mapaSVG, 'm-', 'hoja hoja-mapa', 'Mapa')}</div></div>
      ${zoom}
    </section>`
        : ''
    }
  </main>
  <footer class="pie">Hecho con House Mates Plano${generado ? ` el ${esc(generado)}` : ''}. Solo para ver: los cambios se hacen en la app.</footer>
</div>`;
}

// Estilos. Sin JavaScript (o si el 3D no arranca: clase "sin-3d") la página es un documento que se lee de
// arriba a abajo; con JavaScript es una app con pestañas.
export const CSS_VISOR = `
:root {
  --fondo: #0a0a0a; --panel: #111113; --panel-2: #17171a; --panel-3: #1f1f23; --linea: #26262b; --linea-2: #36363d;
  --tinta: #fafafa; --tinta-2: #a1a1aa; --tinta-3: #6e6e78; --acento: #2447f5; --acento-texto: #6f8bff;
  --violeta: #8a4fff; --calido: #e8aa4c; --calido-tinta: #1d1405; --exito: #2fbf71; --peligro: #ff3b30;
  --fuente: 'General Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --alto-nav: 58px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--fondo); }
body { font-family: var(--fuente); font-size: 14px; line-height: 1.45; color: var(--tinta); -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
button:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--acento-texto); outline-offset: 2px; }
[hidden] { display: none !important; }

/* Cabeza */
.cabeza { grid-area: cabeza; display: flex; align-items: center; gap: 10px; min-width: 0;
  padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top)); background: var(--fondo); border-bottom: 1px solid var(--linea); }
.logo { width: 30px; height: 30px; flex: none; border-radius: 7px; box-shadow: 0 0 0 1px var(--linea-2); }
.titulos { min-width: 0; }
.titulos h1 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.titulos p { margin: 1px 0 0; font-size: 12px; color: var(--tinta-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.solo-lectura { color: var(--tinta-3); }

/* Pestañas: abajo en el teléfono, arriba a la derecha en la computadora */
.pestanas { grid-area: nav; display: none; }
.pestanas button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; flex: 1;
  min-width: 0; border: 0; background: none; color: var(--tinta-3); font-size: 11.5px; font-weight: 500; padding: 6px 4px; }
.pestanas button[aria-selected='true'] { color: var(--tinta); }
.pestanas button[aria-selected='true'] .ico { color: var(--acento-texto); }
.ico { width: 22px; height: 22px; }

.paneles { grid-area: main; position: relative; min-height: 0; }
.pie { padding: 18px 16px 28px; color: var(--tinta-3); font-size: 12px; text-align: center; }

/* ---------- con JavaScript: app con pestañas ---------- */
html.js:not(.sin-3d), html.js:not(.sin-3d) body { height: 100%; overflow: hidden; overscroll-behavior: none; }
html.js:not(.sin-3d) .visor { display: grid; height: 100vh; height: 100dvh;
  grid-template-rows: auto minmax(0, 1fr) auto; grid-template-areas: 'cabeza' 'main' 'nav'; }
html.js:not(.sin-3d) .pestanas { display: flex; border-top: 1px solid var(--linea); background: var(--panel);
  padding-bottom: env(safe-area-inset-bottom); min-height: var(--alto-nav); }
html.js:not(.sin-3d) .pie, html.js:not(.sin-3d) .titulo-estatico { display: none; }
html.js:not(.sin-3d) .panel { position: absolute; inset: 0; }
@media (min-width: 820px) {
  html.js:not(.sin-3d) .visor { grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'cabeza nav' 'main main'; }
  html.js:not(.sin-3d) .pestanas { min-height: 0; border: 0; border-bottom: 1px solid var(--linea); background: var(--fondo);
    padding: 0 16px; align-items: center; gap: 4px; }
  html.js:not(.sin-3d) .pestanas button { flex-direction: row; gap: 7px; flex: none; height: 36px; padding: 0 14px;
    border-radius: 8px; font-size: 13px; }
  html.js:not(.sin-3d) .pestanas button[aria-selected='true'] { background: var(--panel-3); }
  .ico { width: 18px; height: 18px; }
}

/* ---------- sin JavaScript o sin 3D: documento para leer de corrido ---------- */
html:not(.js) .panel, html.sin-3d .panel { display: block !important; padding: 8px 12px 20px; }
html:not(.js) .barra-3d, html:not(.js) .ficha, html:not(.js) .pista, html:not(.js) .lienzo, html:not(.js) .zoom-ctl,
html.sin-3d .barra-3d, html.sin-3d .ficha, html.sin-3d .pista, html.sin-3d .lienzo, html.sin-3d .zoom-ctl { display: none !important; }
.titulo-estatico { margin: 14px 4px 10px; font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--tinta-2); }
html:not(.js) .mensaje-3d, html.sin-3d .mensaje-3d { position: static; display: block; padding: 14px 16px; border: 1px solid var(--linea-2);
  border-radius: 10px; background: var(--panel); color: var(--tinta-2); }
html:not(.js) .cargando, html.sin-3d .cargando { display: none; }
html.js:not(.sin-3d) .sin-3d-texto { display: none; }
html:not(.js) .hojas, html.sin-3d .hojas, html:not(.js) .mapa, html.sin-3d .mapa { display: grid; gap: 14px; }

/* ---------- 3D ---------- */
.panel-3d { background: #141416; overflow: hidden; }
.lienzo { position: absolute; inset: 0; z-index: 0; isolation: isolate; }
.barra-3d, .pista, .ficha { z-index: 1; }
.lienzo canvas { display: block; touch-action: none; outline: none; }
.capa-etq { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.mensaje-3d { position: absolute; inset: 0; display: grid; place-content: center; padding: 24px; text-align: center; color: var(--tinta-2); }
.mensaje-3d p { margin: 0; max-width: 420px; }
.panel-3d.listo .mensaje-3d { display: none; }
.panel-3d.error .cargando { display: none; }
.panel-3d.error .sin-3d-texto { display: block !important; }
.panel-3d.error .barra-3d { display: none; }

.barra-3d { position: absolute; top: 10px; left: 0; right: 0; display: flex; align-items: center; gap: 6px; padding: 0 12px;
  overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch;
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent); }
.barra-3d::-webkit-scrollbar { display: none; }
.barra-3d .sep { flex: none; width: 1px; height: 20px; margin: 0 4px; background: var(--linea-2); }
.barra-3d::after { content: ''; flex: none; width: 16px; height: 1px; }
.chip { flex: none; height: 34px; padding: 0 13px; border: 1px solid var(--linea-2); border-radius: 999px;
  background: rgba(17, 17, 19, 0.86); color: var(--tinta); font-size: 13px; font-weight: 500; white-space: nowrap;
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.chip:active { transform: scale(0.97); }
.chip[aria-pressed='true'] { background: var(--acento); border-color: transparent; color: #fff; }
@media (hover: hover) { .chip:hover { border-color: #55555f; } }

.pista { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: max-content; max-width: calc(100% - 32px);
  margin: 0; padding: 7px 12px; border-radius: 8px; background: rgba(17, 17, 19, 0.86); color: var(--tinta-2); font-size: 12.5px;
  text-align: center; pointer-events: none; transition: opacity 0.4s; }
.pista.fuera { opacity: 0; }

.ficha { position: absolute; left: 10px; right: 10px; bottom: 10px; max-width: 400px; padding: 12px 14px 14px;
  border: 1px solid var(--linea-2); border-radius: 12px; background: rgba(17, 17, 19, 0.94); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
.ficha-cabeza { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.ficha-nombre { display: block; font-size: 15px; font-weight: 600; line-height: 1.25; }
.ficha-tipo { display: block; margin-top: 1px; color: var(--tinta-2); font-size: 12.5px; }
.ficha-cerrar { flex: none; width: 32px; height: 32px; margin: -6px -8px 0 0; border: 0; border-radius: 8px; background: none;
  color: var(--tinta-2); font-size: 22px; line-height: 1; }
.ficha-datos { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 10px 0 0; font-size: 13px; }
.ficha-datos dt { color: var(--tinta-3); }
.ficha-datos dd { margin: 0; }
.ficha-datos .medida { display: inline-block; padding: 0 6px; border-radius: 3px; background: var(--calido); color: var(--calido-tinta); font-weight: 600; }
.ficha-nota { margin: 8px 0 0; color: var(--tinta-2); font-size: 12.5px; }
.ficha-acercar { margin-top: 10px; height: 32px; }

/* Etiquetas sobre el 3D */
.etq { padding: 2px 7px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 5px; background: rgba(17, 17, 19, 0.88);
  color: #fafafa; font-family: var(--fuente); font-size: 11px; font-weight: 500; white-space: nowrap; }
.etq small { margin-left: 4px; font-weight: 400; opacity: 0.75; }
.etq.sel { border-color: transparent; background: var(--acento); color: #fff; font-size: 12px; }
.lienzo:not(.nombres) .etq-nombre:not(.sel) { visibility: hidden; }
.etq-zona { display: grid; justify-items: center; border: 0; background: transparent; color: color-mix(in srgb, var(--zona, #8a4fff) 55%, #fff);
  font-size: 12.5px; font-weight: 600; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7); }
.etq-zona small { margin: 0; font-size: 11px; font-weight: 500; }
.etq-zona.sel { padding: 3px 8px; text-shadow: none; color: #fff; }
.etq-cartel { border-color: transparent; background: #fafafa; color: #0a0a0a; font-size: 12px; font-weight: 600; }
.etq-texto { border: 0; background: transparent; padding: 0; font-size: var(--tam, 14px); font-weight: 600; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7); }
.etq-abertura { font-weight: 600; }
.etq-salida { border-color: transparent; background: #1d8a55; }
.cinta { padding: 3px 6px 7px; border-radius: 2px; font-family: var(--fuente); font-size: 11.5px; font-weight: 600; line-height: 1; white-space: nowrap;
  color: var(--calido-tinta); background-color: var(--calido);
  background-image: repeating-linear-gradient(90deg, rgba(29, 20, 5, 0.8) 0 1px, transparent 1px 20px), repeating-linear-gradient(90deg, rgba(29, 20, 5, 0.5) 0 1px, transparent 1px 4px);
  background-size: 100% 5px, 100% 3px; background-repeat: no-repeat; background-position: 0 100%, 0 100%; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); }
.lienzo:not(.medidas) .cinta { visibility: hidden; }

/* ---------- Plano y mapa (zoom con dos dedos, +/− o Ctrl + rueda) ---------- */
.panel-zoom { background: #1a1a1d; }
html.js:not(.sin-3d) .zoom-area { position: absolute; inset: 0; overflow: auto; touch-action: pan-x pan-y; -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain; padding: 14px 12px 84px; }
html.js:not(.sin-3d) .zoom-contenido { display: grid; gap: 14px; width: var(--ancho, 100%); margin: 0 auto; transform-origin: 0 0; }
.hoja { position: relative; margin: 0; width: 100%; background: #fff; border-radius: 2px; box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45); overflow: hidden; }
.hoja > svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
@supports not (aspect-ratio: 1 / 1) { .hoja { height: auto; } .hoja > svg { position: static; height: auto; } }
.zoom-ctl { position: absolute; right: 12px; bottom: 14px; display: flex; align-items: center; gap: 2px; padding: 3px;
  border: 1px solid var(--linea-2); border-radius: 999px; background: rgba(17, 17, 19, 0.92); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.zoom-ctl button { min-width: 36px; height: 34px; border: 0; border-radius: 999px; background: none; font-size: 18px; font-weight: 500; }
.zoom-ctl .zoom-ajustar { padding: 0 12px; font-size: 13px; }
.zoom-ctl button:active { background: var(--panel-3); }
.zoom-valor { min-width: 46px; text-align: center; font-size: 12.5px; color: var(--tinta-2); }

/* ---------- Materiales ---------- */
html.js:not(.sin-3d) .panel-materiales { overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.materiales { max-width: 920px; margin: 0 auto; padding: 16px 14px 32px; }
.materiales h2, .materiales h3 { margin: 22px 0 8px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--tinta-2); }
.materiales h2:first-child, .materiales h3:first-child { margin-top: 4px; }
.materiales p { color: var(--tinta-2); }
.materiales .tabla { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--linea); border-radius: 10px; }
.materiales table { width: 100%; border-collapse: collapse; font-size: 13px; }
.materiales th, .materiales td { padding: 8px 10px; border-bottom: 1px solid var(--linea); text-align: left; vertical-align: top; }
.materiales thead th { position: sticky; top: 0; background: var(--panel-2); color: var(--tinta-2); font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.materiales tbody tr:last-child td { border-bottom: 0; }
.materiales .num { text-align: right; white-space: nowrap; }
.materiales .cod { width: 1%; color: var(--tinta-3); white-space: nowrap; }
.materiales .cat td { padding-top: 12px; background: var(--panel); color: var(--acento-texto); font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; }
.materiales .tenue { color: var(--tinta-3); }
.materiales .resumen { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 4px; padding: 0; list-style: none; }
.materiales .resumen li { padding: 6px 10px; border: 1px solid var(--linea); border-radius: 8px; background: var(--panel); font-size: 12.5px; color: var(--tinta-2); }
.materiales .resumen strong { color: var(--tinta); font-weight: 600; }

@media print {
  html, body { height: auto !important; overflow: visible !important; background: #fff; }
  .visor { display: block !important; height: auto !important; }
  .cabeza, .pestanas, #panel-3d, .zoom-ctl, .pie, .titulo-estatico, #panel-materiales { display: none !important; }
  .panel { position: static !important; display: block !important; padding: 0 !important; background: #fff !important; }
  .zoom-area { position: static !important; overflow: visible !important; padding: 0 !important; }
  .zoom-contenido { width: 100% !important; transform: none !important; display: block !important; }
  .hoja { box-shadow: none; break-after: page; page-break-after: always; border-radius: 0; }
}
`;
