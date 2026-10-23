// Visor para mandar por WhatsApp o por mail: arma un único .html que se abre en cualquier teléfono o
// computadora sin instalar nada y sin internet, con el modelo 3D (solo para ver), las hojas del plano, el
// listado de materiales y el mapa.
//
// Cómo funciona: al exportar (en el navegador, desde la app) se leen los módulos que usa el visor
// (js/visor/visor.js y todo lo que importa, Three.js incluido), se cambian sus import por nombres sueltos
// ("three", "three/addons/...", "hm/js/...") y cada uno va como data: URL en un <script type="importmap">.
// Las hojas, los materiales y el mapa quedan escritos en el HTML (se ven aunque el teléfono no corra
// JavaScript) y la escena va como JSON en <script type="application/json" id="hm-datos">.

import { esc, slugificar, fm } from './formato.js';
import { computar, nombreCategoria } from './computo.js';
import { CSS_VISOR, FAVICON, cuerpoVisor } from './visor/plantilla.js';

const RAIZ = new URL('../', import.meta.url); // carpeta public/
const ENTRADA = 'js/visor/visor.js';
const NUCLEO = 'vendor/three/build/three.module.min.js';
const ADDONS = 'vendor/three/examples/jsm/';
const PESOS_FUENTE = [400, 500, 600, 700];

/* ------------------------------------------------------------------ lectura de archivos */

async function leerDeServidor(ruta) {
  const r = await fetch(new URL(ruta, RAIZ));
  if (!r.ok) throw new Error(`No se pudo leer ${ruta} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

function aBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const utf8 = new TextEncoder();
const deUtf8 = new TextDecoder('utf-8');

/* ------------------------------------------------------------------ módulos */

// Ruta (desde public/) del módulo al que apunta un import.
function resolver(espec, desde) {
  if (espec === 'three') return NUCLEO;
  if (espec.startsWith('three/addons/')) return ADDONS + espec.slice('three/addons/'.length);
  if (espec.startsWith('./') || espec.startsWith('../') || espec.startsWith('/')) {
    return new URL(espec, `http://visor/${desde}`).pathname.slice(1);
  }
  throw new Error(`No sé de dónde sacar el módulo "${espec}" (importado en ${desde}).`);
}

// Nombre suelto con el que el módulo queda en el mapa de importación.
function nombreModulo(ruta) {
  if (ruta === NUCLEO) return 'three';
  if (ruta.startsWith(ADDONS)) return 'three/addons/' + ruta.slice(ADDONS.length);
  return 'hm/' + ruta;
}

// import ... from '...', import '...', export ... from '...' e import('...') con texto fijo.
const RE_IMPORT = /(\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*(?:\*\s*(?:as\s+[\w$]+\s*)?|\{[^}]*\}\s*)from\s*)(['"])([^'"\r\n]+)\2/g;
const RE_DINAMICO = /(\bimport\s*\(\s*)(['"])([^'"\r\n]+)\2(?=\s*\))/g;

function reescribir(texto, desde, deps) {
  const cambiar = (espec) => {
    const ruta = resolver(espec, desde);
    deps.add(ruta);
    return nombreModulo(ruta);
  };
  return texto
    .replace(RE_IMPORT, (m, antes, q, espec) => `${antes}${q}${cambiar(espec)}${q}`)
    .replace(RE_DINAMICO, (m, antes, q, espec) => `${antes}${q}${cambiar(espec)}${q}`)
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '');
}

// Junta el visor y todo lo que importa (recorriendo los import). Devuelve [nombre, código][] .
async function juntarModulos(leer) {
  const listos = new Map();
  const pendientes = [ENTRADA];
  while (pendientes.length) {
    const ruta = pendientes.shift();
    if (listos.has(ruta)) continue;
    const texto = deUtf8.decode(await leer(ruta));
    const deps = new Set();
    // El núcleo de Three.js no importa nada (y es grande): no hace falta revisarlo.
    const codigo = ruta === NUCLEO ? texto : reescribir(texto, ruta, deps);
    listos.set(ruta, codigo);
    for (const d of deps) if (!listos.has(d)) pendientes.push(d);
  }
  return [...listos].map(([ruta, codigo]) => [nombreModulo(ruta), codigo]);
}

/* ------------------------------------------------------------------ imágenes y fuente */

// Las imágenes de las hojas (por ejemplo, la foto aérea de fondo) se pasan a data: para que el archivo no
// dependa del servidor. Si una pesa mucho se achica a JPEG. Si no se puede leer, se saca.
async function imagenComoDato(href) {
  const base = globalThis.document?.baseURI || RAIZ;
  const r = await fetch(new URL(href, base));
  if (!r.ok) throw new Error(`No se pudo leer la imagen ${href}`);
  let blob = await r.blob();
  if (blob.size > 450_000 && typeof createImageBitmap === 'function' && globalThis.document) {
    try {
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.max(1, Math.round(bmp.width * k));
      lienzo.height = Math.max(1, Math.round(bmp.height * k));
      lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
      const jpg = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.82));
      if (jpg && jpg.size < blob.size) blob = jpg;
    } catch {}
  }
  return `data:${blob.type || 'image/png'};base64,${aBase64(new Uint8Array(await blob.arrayBuffer()))}`;
}

async function incrustarImagenes(svg, cache) {
  if (!svg || !svg.includes('<image')) return svg;
  const etiquetas = [...new Set(svg.match(/<image\b[^>]*>/g) || [])];
  for (const tag of etiquetas) {
    const href = /\s(?:xlink:)?href="([^"]+)"/.exec(tag)?.[1];
    if (!href || href.startsWith('data:') || href.startsWith('#')) continue;
    if (!cache.has(href)) cache.set(href, await imagenComoDato(href.replace(/&amp;/g, '&')).catch(() => null));
    const dato = cache.get(href);
    const nuevo = dato ? tag.replace(/(\s(?:xlink:)?href=")[^"]*"/g, (m, a) => `${a}${dato}"`) : '';
    svg = svg.split(tag).join(nuevo);
    if (!dato) svg = svg.replace(/<\/image>/g, '');
  }
  return svg;
}

async function cssFuente(leer) {
  const partes = [];
  for (const peso of PESOS_FUENTE) {
    try {
      const b64 = aBase64(await leer(`vendor/fuentes/general-sans-${peso}.woff2`));
      partes.push(
        `@font-face{font-family:'General Sans';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${peso};font-style:normal;font-display:swap}`
      );
    } catch {}
  }
  return partes.join('\n');
}

/* ------------------------------------------------------------------ datos */

// Lo que viaja en el archivo: solo lo que hace falta para dibujar. Se sacan precios, contactos de los
// proveedores, presupuesto, cronograma, fotos y fondo (el archivo lo puede ver cualquiera).
export function escenaParaVisor(escena) {
  const e = JSON.parse(JSON.stringify(escena || {}));
  const proyecto = e.proyecto ? { evento: e.proyecto.evento, fecha: e.proyecto.fecha, lugar: e.proyecto.lugar } : undefined;
  const objetos = (e.objetos || []).map((o) => {
    delete o.costo;
    delete o.costoTipo;
    delete o.propio;
    return o;
  });
  return {
    nombre: e.nombre,
    proyecto,
    densidad: e.densidad,
    recorrido: e.recorrido,
    areas: e.areas || [],
    objetos,
    cotas: e.cotas || [],
  };
}

const dos = (n) => String(n).padStart(2, '0');
const textoFecha = (d) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} a las ${dos(d.getHours())}:${dos(d.getMinutes())}`;

function subtituloDe(escena, nombre) {
  const p = escena.proyecto || {};
  const partes = [p.fecha, p.lugar].filter(Boolean).map(String);
  if (nombre !== escena.nombre && escena.nombre) partes.unshift(escena.nombre);
  return partes.join(' · ');
}

/* ------------------------------------------------------------------ listado de materiales */

// Listado de materiales en HTML para la pestaña "Materiales" (tablas simples, se ven bien en el teléfono).
export function materialesHTML(escena, comp = computar(escena)) {
  const filas = [];
  let cat = null;
  for (const it of comp.items) {
    if (it.cat !== cat) {
      cat = it.cat;
      filas.push(`<tr class="cat"><td colspan="5">${esc(nombreCategoria(cat))}</td></tr>`);
    }
    const detalle = [it.ref, it.proveedor].filter(Boolean).map(esc).join(' · ');
    filas.push(
      `<tr><td class="cod">${it.codigo}</td><td>${esc(it.nombre)}${detalle ? `<br><span class="tenue">${detalle}</span>` : ''}</td>` +
        `<td>${esc(it.medida)}</td><td class="num"><strong>${it.cantidad}</strong></td><td class="tenue">${esc(it.unidad)}</td></tr>`
    );
  }
  let html = `<ul class="resumen"><li><strong>${comp.total}</strong> unidades</li><li><strong>${comp.items.length}</strong> ítems distintos</li></ul>`;
  html += comp.items.length
    ? `<h2>Listado</h2><div class="tabla"><table><thead><tr><th>N.º</th><th>Ítem</th><th>Medidas</th><th class="num">Cant.</th><th></th></tr></thead><tbody>${filas.join('')}</tbody></table></div>`
    : '<p>Todavía no hay materiales cargados.</p>';
  if (comp.derivados.length) {
    html += `<h2>Para el armado</h2><div class="tabla"><table><thead><tr><th>Ítem</th><th>Detalle</th><th class="num">Cant.</th><th></th></tr></thead><tbody>${comp.derivados
      .map((d) => `<tr><td>${esc(d.nombre)}</td><td class="tenue">${esc(d.detalle)}</td><td class="num"><strong>${fm(d.cantidad, d.dec)}</strong></td><td class="tenue">${esc(d.unidad)}</td></tr>`)
      .join('')}</tbody></table></div>`;
  }
  if (comp.superficies.length) {
    html += `<h2>Superficies</h2><div class="tabla"><table><thead><tr><th>Nombre</th><th>Tipo</th><th class="num">m²</th></tr></thead><tbody>${comp.superficies
      .map((s) => `<tr><td>${esc(s.nombre)}</td><td class="tenue">${esc(s.tipo)}</td><td class="num">${fm(s.m2, 1)}</td></tr>`)
      .join('')}</tbody></table></div>`;
  }
  html += '<p class="tenue">El número de cada ítem es el que aparece en el plano.</p>';
  return html;
}

/* ------------------------------------------------------------------ el archivo */

// escena: la escena tal como está en la app. nombre: título que se ve arriba (por defecto, el evento o el
// nombre de la escena). hojas: los SVG de generarHojas(...).hojas. materialesHTML: HTML del listado (ver
// materialesHTML()). mapaSVG: el mapa para el público en SVG (opcional). incluirFuente: General Sans adentro
// del archivo (unos 120 KB). leer(ruta desde public/) → Uint8Array: para usarlo fuera del navegador.
// Devuelve el texto del HTML completo.
export async function crearVisorHTML({
  escena,
  nombre,
  hojas = [],
  materialesHTML: listado = '',
  mapaSVG = '',
  incluirFuente = true,
  leer = leerDeServidor,
  generado = new Date(),
} = {}) {
  if (!escena) throw new Error('Falta la escena.');
  const titulo = String(nombre || escena.proyecto?.evento || escena.nombre || 'House Mates');
  const subtitulo = subtituloDe(escena, titulo);
  const fecha = generado instanceof Date ? textoFecha(generado) : String(generado || '');

  const cache = new Map();
  const hojasListas = [];
  for (const h of hojas || []) hojasListas.push(await incrustarImagenes(String(h), cache));
  const mapa = mapaSVG ? await incrustarImagenes(String(mapaSVG), cache) : '';

  const [modulos, fuente] = await Promise.all([juntarModulos(leer), incluirFuente ? cssFuente(leer) : '']);
  const mapaImport = { imports: Object.fromEntries(modulos.map(([n, codigo]) => [n, `data:text/javascript;base64,${aBase64(utf8.encode(codigo))}`])) };

  const datos = { nombre: titulo, subtitulo, generado: fecha, escena: escenaParaVisor(escena) };
  // Dentro de <script> no puede aparecer "</script": se escapa el "<" (sigue siendo JSON válido).
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

  const cuerpo = cuerpoVisor({ nombre: titulo, subtitulo, generado: fecha, hojas: hojasListas, materialesHTML: listado, mapaSVG: mapa });

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0A0A0A">
<meta name="generator" content="House Mates Plano">
<meta name="description" content="${esc(`Plano y modelo 3D de ${titulo}`)}">
<title>${esc(titulo)} · House Mates</title>
<link rel="icon" href="${FAVICON}">
<style>
${fuente}
${CSS_VISOR}
</style>
<script>
(function () {
  var h = document.documentElement;
  h.className += ' js';
  // Si el visor no arranca (navegador viejo sin mapas de importación, o un error al cargar), la página queda
  // como documento para leer: el plano y los materiales se ven igual.
  function sin3d() { if (!window.hmVisorListo && h.className.indexOf('sin-3d') < 0) h.className += ' sin-3d'; }
  var puede = window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap');
  if (!puede) sin3d();
  window.addEventListener('error', sin3d);
  window.addEventListener('unhandledrejection', sin3d);
  setTimeout(sin3d, 15000);
})();
</script>
</head>
<body>
<script type="application/json" id="hm-datos">${json(datos)}</script>
<script>try { window.HM_VISOR = JSON.parse(document.getElementById('hm-datos').textContent); } catch (e) {}</script>
${cuerpo}
<script type="importmap">${json(mapaImport)}</script>
<script type="module">
import { iniciarVisor } from 'hm/${ENTRADA}';
try {
  iniciarVisor(window.HM_VISOR);
} catch (e) {
  console.error(e);
  document.documentElement.className += ' sin-3d';
}
</script>
</body>
</html>
`;
}

// Nombre del archivo: house-mates-<escena>-visor.html. slug: el de la escena en la app (si se pasa, se usa).
export function nombreArchivoVisor(escena, slug) {
  let base = slugificar(slug || escena?.nombre || 'escena');
  if (!base.startsWith('house-mates')) base = `house-mates-${base}`;
  return `${base}-visor.html`;
}
