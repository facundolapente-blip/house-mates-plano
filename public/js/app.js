import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TIPOS, CATEGORIAS, crearObjeto3D, matBorde, catDe, defDe, troncoDe } from './tipos.js';
import { construirArea } from './lugar.js';
import { formatearJSON, normalizarEscena, nuevoId, slugificar, r3, fm, leerNumero, esc, escenaVacia, numero } from './formato.js';
import { mapaSonido, colorearSonido, htmlSonido, hojaSonido, BANDAS, ESTILOS_SONIDO } from './sonido.js';
import { analizarElectrico, htmlElectrico, hojaElectrica, conectarMasCercano, derivadosElectricos, CSS_ELECTRICO, esFuente } from './electrico.js';
import { analizarCargas, htmlCargas, CSS_CARGAS, COLGABLES } from './cargas.js';
import { direccionSol, posicionLuz3D, colorSol, sombras, sombrasSVG, htmlSol, horasDeSol, diaDelEvento, conHora, horaTexto, zonaDe } from './sol.js';
import { mallaTerreno, curvasDeNivel, curvasSVG, htmlTerreno, textoDesnivel, alturaEn, equidistanciaPara } from './terreno.js';
import { exportarKML } from './kml.js';
import { exportarDXF, leerDXF } from './dxf.js';
import { crearVisorHTML, nombreArchivoVisor, materialesHTML } from './compartir.js';
import {
  esquinas,
  cajaDe,
  puntoEnPoligono,
  enRect,
  distanciasLados,
  superficieLibre,
  areaFirmada,
  puntosMundo,
  aLocal,
  esPoligono,
  esLinea,
  recentrar,
  dentroDe,
  superficieDe,
  longitud,
} from './geometria.js';
import { icono } from './iconos.js';
import { computar, csvComputo, nombreCategoria, computaPorDefecto, incluido, opcionesComputo } from './computo.js';
import { generarHojas, opcionesHoja, PAPELES, ESCALAS, escalaAuto, rotuloSuperficie, hojaPlanta } from './plano2d.js';
import { plazasEstacionamiento, USOS_CAMINO, VEHICULOS, largoDe, textoTiempo, modulosVallado, moduloVallado, lineaLocal, medidasCochera } from './predio.js';
import { leerCoordenadas, textoCoordenadas, tieneGeo, escenaAGeo, geoAEscena, calibrarConCoordenadas, enlaceGoogleMaps, distanciaReal } from './geo.js';
import { ROLES_STAFF, TIPOS_DATOS } from './tipos-datos.js';
import { descargarBlob, descargarTexto, pdfDeHojas } from './exportar.js';

window.planoListo = true;

const $ = (s, raiz = document) => raiz.querySelector(s);
const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];
const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ALTURA_OJOS = 1.65;

/* ================================================================== estado */

const CLAVE_PREF = 'housemates-plano:pref';
const CLAVE_PORTAPAPELES = 'housemates-plano:portapapeles';
const pref = (() => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PREF)) || {};
  } catch {
    return {};
  }
})();

const estado = {
  slug: null,
  escena: null,
  textoGuardado: '',
  ultimo: '',
  sel: new Set(),
  selCota: null,
  vista: '3d',
  caminando: false,
  herramienta: 'seleccionar',
  noche: false,
  paso: pref.paso || 0.1,
  tema: pref.tema === 'claro' ? 'claro' : 'oscuro',
  ver: { nombres: false, cotas: true, grilla: true, transparentar: true, copas: true, ao: true, fondo: true, ...(pref.ver || {}) },
  ocultas: new Set(pref.ocultas || []),
  bloqueadas: new Set(pref.bloqueadas || []),
  deshacer: [],
  rehacer: [],
  capacidad: { areas: [], zonas: [] },
  zoomHoja: null,
  hojas: null,
  // Pestaña del panel derecho sin nada elegido: proyecto, seguridad o técnica.
  pestanaDetalle: 'proyecto',
  // Capa de análisis sobre la vista: null, 'distancias', 'sonido', 'electrico', 'sombras' o 'terreno'.
  analisis: null,
  // Sol: día ('AAAA-MM-DD') y minuto del día elegidos, y si la luz del 3D va donde está el sol de verdad.
  sol: { dia: null, minuto: 17 * 60, real: false },
};
let listaEscenas = [];

function guardarPref() {
  try {
    localStorage.setItem(
      CLAVE_PREF,
      JSON.stringify({
        ver: estado.ver,
        paso: estado.paso,
        tema: estado.tema,
        ocultas: [...estado.ocultas],
        bloqueadas: [...estado.bloqueadas],
        slug: estado.slug,
      })
    );
  } catch {}
}

// Acceso desde la consola del navegador, para revisar el estado si algo no anda.
window.plano = { estado };

const objPorId = (id) => estado.escena?.objetos.find((o) => o.id === id) || null;
const selObjs = () => [...estado.sel].map(objPorId).filter(Boolean);
const selUnico = () => (estado.sel.size === 1 ? objPorId([...estado.sel][0]) : null);
const cotaPorId = (id) => estado.escena?.cotas.find((c) => c.id === id) || null;
const instantanea = () => JSON.stringify(estado.escena);
const ajustar = (v) => r3(Math.round(v / estado.paso) * estado.paso);
const enVista3D = () => estado.vista === '3d' || estado.vista === 'planta';

/* ================================================================== motor 3D */

const visor = $('#visor');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
visor.prepend(renderer.domElement);

const capaEtiquetas = new CSS2DRenderer();
capaEtiquetas.domElement.className = 'capa-etiquetas';
renderer.domElement.after(capaEtiquetas.domElement);

const mundo = new THREE.Scene();
const FONDOS = { oscuro: new THREE.Color('#17181b'), claro: new THREE.Color('#e3e5e8'), noche: new THREE.Color('#05060a') };
mundo.background = FONDOS[estado.tema].clone();

// Luz ambiente suave de estudio: les da volumen a los objetos sin depender solo del sol.
const pmrem = new THREE.PMREMGenerator(renderer);
mundo.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
mundo.environmentIntensity = 0.35;

const camP = new THREE.PerspectiveCamera(42, 1, 0.05, 800);
const camO = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
camO.up.set(0, 0, -1);
const camR = new THREE.PerspectiveCamera(70, 1, 0.03, 300);
let mitadOrto = 10;

const ctrlP = new OrbitControls(camP, renderer.domElement);
ctrlP.enableDamping = true;
ctrlP.dampingFactor = 0.12;
ctrlP.maxPolarAngle = Math.PI / 2 - 0.02;
ctrlP.minDistance = 0.5;
ctrlP.maxDistance = 300;
ctrlP.zoomToCursor = true;

const ctrlO = new OrbitControls(camO, renderer.domElement);
ctrlO.enableRotate = false;
ctrlO.screenSpacePanning = true;
ctrlO.zoomToCursor = true;
ctrlO.enableDamping = true;
ctrlO.dampingFactor = 0.15;
ctrlO.minZoom = 0.1;
ctrlO.maxZoom = 60;
ctrlO.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
ctrlO.enabled = false;

const ctrlR = new PointerLockControls(camR, renderer.domElement);
Object.assign(window.plano, { camP, camO, camR, ctrlP, ctrlO, mundo });

let panTemporal = false;
function botonesRaton() {
  const mano = estado.herramienta === 'mano' || panTemporal;
  ctrlP.mouseButtons = { LEFT: mano ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  ctrlO.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
}
botonesRaton();

const hemi = new THREE.HemisphereLight('#ffffff', '#b9b4aa', 1.05);
const sol = new THREE.DirectionalLight('#ffffff', 2.3);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.bias = -0.0005;
sol.shadow.normalBias = 0.03;
mundo.add(hemi, sol, sol.target);

// Postproceso: oclusión ambiental (sombras de contacto) y contorno de lo seleccionado.
const composer = new EffectComposer(renderer);
const pasoRender = new RenderPass(mundo, camP);
const pasoAO = new GTAOPass(mundo, camP, 512, 512);
pasoAO.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
pasoAO.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
pasoAO.blendIntensity = 0.85;
// Lo transparente (copas, zonas, haces) no genera sombras de contacto.
pasoAO.overrideVisibility = function () {
  const cache = this._visibilityCache;
  this.scene.traverse((o) => {
    cache.set(o, o.visible);
    if (o.isPoints || o.isLine || (o.isMesh && o.material?.transparent)) o.visible = false;
  });
};
const pasoContorno = new OutlinePass(new THREE.Vector2(512, 512), mundo, camP);
pasoContorno.edgeStrength = 4;
pasoContorno.edgeThickness = 1;
pasoContorno.edgeGlow = 0;
pasoContorno.visibleEdgeColor.set('#3d63ff');
pasoContorno.hiddenEdgeColor.set('#1c2a7a');
composer.addPass(pasoRender);
composer.addPass(pasoAO);
composer.addPass(pasoContorno);
composer.addPass(new OutputPass());

const lugarG = new THREE.Group();
const objetosG = new THREE.Group();
const lucesG = new THREE.Group();
const cotasG = new THREE.Group();
const cotasUsuarioG = new THREE.Group();
const grillaG = new THREE.Group();
const seleccionG = new THREE.Group();
const guiaG = new THREE.Group();
const fondoG = new THREE.Group();
const analisisG = new THREE.Group();
const cadG = new THREE.Group();
mundo.add(fondoG, cadG, analisisG, lugarG, objetosG, lucesG, cotasG, cotasUsuarioG, grillaG, seleccionG, guiaG);

const mapa3d = new Map();
let paredes = [];
let techos = [];
let haces = [];

const COLOR_SEL = '#3d63ff';
const COLOR_MEDIDA = '#e8aa4c';
const matSel = new THREE.LineBasicMaterial({ color: COLOR_SEL, depthTest: false, transparent: true });
const matCota = new THREE.LineBasicMaterial({ color: COLOR_MEDIDA, depthTest: false, transparent: true });
const matFrente = new THREE.MeshBasicMaterial({ color: COLOR_SEL, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
const matMedida = new THREE.LineBasicMaterial({ color: COLOR_MEDIDA, depthTest: false, transparent: true });
const matPunto = new THREE.MeshBasicMaterial({ color: COLOR_MEDIDA, depthTest: false, transparent: true });
const matCotaUsuario = new THREE.LineBasicMaterial({ color: '#5b7bff', depthTest: false, transparent: true });
const matCotaElegida = new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true });
const matVertice = new THREE.PointsMaterial({ color: '#ffffff', size: 9, sizeAttenuation: false, depthTest: false, transparent: true });
const matMedio = new THREE.PointsMaterial({ color: '#3d63ff', size: 7, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.9 });
const matZonaGuia = new THREE.MeshBasicMaterial({ color: '#8a4fff', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const geoPunto = new THREE.SphereGeometry(0.05, 12, 8);
geoPunto.userData.compartida = true;
const geoFlecha = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.13, 0, 0), new THREE.Vector3(0.13, 0, 0), new THREE.Vector3(0, 0, 0.2)]);
geoFlecha.userData.compartida = true;

// Haz de luz: cono con punta en el origen que se desvanece hacia la base.
const geoHaz = (() => {
  const g = new THREE.ConeGeometry(1, 1, 40, 1, true);
  g.translate(0, -0.5, 0);
  const pos = g.attributes.position;
  const col = [];
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + pos.getY(i) * 0.92;
    col.push(k, k, k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.userData.compartida = true;
  return g;
})();

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const PLANO_PISO = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const reloj = new THREE.Clock();

function etiqueta(html, clase, centro = [0.5, 0.5]) {
  const div = document.createElement('div');
  div.className = clase;
  div.innerHTML = html;
  const o = new CSS2DObject(div);
  o.center.set(centro[0], centro[1]);
  return o;
}

function liberar(raiz) {
  raiz.traverse((n) => {
    if (n.geometry && !n.geometry.userData.compartida) n.geometry.dispose();
    if (n.material && (n.userData.propio || n.userData.pared)) n.material.dispose();
    if (n.isCSS2DObject) n.element.remove();
  });
}

function vaciar(g) {
  for (const hijo of [...g.children]) {
    g.remove(hijo);
    liberar(hijo);
  }
}

const camActiva = () => (estado.vista === 'planta' ? camO : estado.caminando ? camR : camP);

function limites() {
  const puntos = [];
  for (const a of estado.escena?.areas || []) puntos.push(...a.contorno);
  if (!puntos.length) for (const o of estado.escena?.objetos || []) puntos.push(...esquinas(o));
  // Sin nada dibujado todavía, se encuadra la imagen de fondo (un predio nuevo).
  const f = estado.escena?.fondo;
  if (!puntos.length && f && !f.oculto) {
    const w = f.ancho / 2;
    const h = (f.ancho * (f.proporcion || 0.75)) / 2;
    puntos.push([f.pos[0] - w, f.pos[1] - h], [f.pos[0] + w, f.pos[1] + h]);
  }
  if (!puntos.length) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return cajaDe(puntos);
}

/* ================================================================== construcción */

function construirTodo() {
  vaciar(lugarG);
  vaciar(objetosG);
  vaciar(cotasG);
  mapa3d.clear();
  paredes = [];
  techos = [];
  for (const area of estado.escena.areas) {
    const r = construirArea(area);
    lugarG.add(r.grupo);
    paredes.push(...r.paredes);
    if (r.techo) techos.push(r.techo);
    for (const c of r.cotas) {
      const et = etiqueta(c.texto, 'cinta etq-cota');
      et.position.copy(c.pos);
      cotasG.add(et);
    }
    for (const ro of r.rotulos) {
      const et = etiqueta(`${esc(ro.texto)} <small>${ro.detalle}</small>`, `etq etq-abertura${ro.salida ? ' etq-salida' : ''}`);
      et.position.copy(ro.pos);
      r.grupo.add(et);
    }
  }
  for (const o of estado.escena.objetos) agregarObjeto3D(o);
  construirFondo();
  construirCAD();
  construirGrilla();
  ajustarSol();
  construirLuces();
  dibujarCotas();
  aplicarVisibilidad();
  actualizarSeleccion3D();
  for (const t of techos) t.visible = estado.caminando;
}

function agregarObjeto3D(o) {
  const g = crearObjeto3D(o, { noche: estado.noche });
  const def = defDe(o);
  let et;
  if (o.tipo === 'zona' || o.tipo === 'estacionamiento' || o.tipo === 'camino') {
    // El rótulo va donde lo pone el plano (en un camino, a mitad del recorrido) con el dato útil:
    // m², cocheras o metros y minutos caminando.
    const r = rotuloSuperficie(o);
    et = etiqueta(`${esc(o.nombre)}<small>${esc(r.detalle)}</small>`, 'etq etq-zona etq-nombre');
    const [lx, ly] = aLocal(o, r.pos);
    et.position.set(lx, 0.05, ly);
    et.element.style.setProperty('--zona', o.tipo === 'estacionamiento' ? '#9aa1a8' : r.color);
  } else if (o.tipo === 'texto') {
    et = etiqueta(esc(o.texto || o.nombre), 'etq etq-texto etq-nombre');
    et.element.style.setProperty('--tam', `${Math.max(11, Math.min(40, (Number(o.tamano) || 0.6) * 22))}px`);
    if (o.color) et.element.style.color = o.color;
    et.position.set(0, 0.05, 0);
  } else if (o.tipo === 'senal') {
    et = etiqueta(esc(o.texto || o.nombre), 'etq etq-cartel etq-nombre', [0.5, 1]);
    et.position.set(0, o.dims[2] + 0.12, 0);
  } else if (o.tipo === 'puesto') {
    et = etiqueta(`${esc(o.nombre)}<small>${o.personas || 1} ${ROLES_STAFF[o.rol]?.nombre.toLowerCase() || 'persona'}${o.turno ? ` · ${esc(o.turno)}` : ''}</small>`, 'etq etq-nombre', [0.5, 1]);
    et.position.set(0, 1.9, 0);
  } else if (o.tipo === 'etiqueta') {
    et = etiqueta(esc(o.nombre), 'etq etq-cartel etq-nombre', [0.5, 1]);
    et.position.set(0, 0.3, 0);
  } else {
    et = etiqueta(esc(o.nombre), 'etq etq-nombre', [0.5, 1]);
    et.position.set(0, o.dims[2] + 0.12, 0);
  }
  if (estado.sel.has(o.id)) et.element.classList.add('sel');
  g.add(et);
  g.traverse((n) => {
    if (n.userData.copa) n.visible = estado.ver.copas;
  });
  g.userData.etq = et.element;
  g.visible = !estado.ocultas.has(catDe(o));
  objetosG.add(g);
  mapa3d.set(o.id, g);
  return g;
}

function reconstruirObjeto(o) {
  const viejo = mapa3d.get(o.id);
  if (viejo) {
    objetosG.remove(viejo);
    liberar(viejo);
  }
  agregarObjeto3D(o);
  if (estado.noche) construirLuces();
}

function quitarObjeto3D(id) {
  const g = mapa3d.get(id);
  if (!g) return;
  objetosG.remove(g);
  liberar(g);
  mapa3d.delete(id);
}

function moverObjeto3D(o) {
  const g = mapa3d.get(o.id);
  if (!g) return;
  g.position.set(o.pos[0], o.elev || 0, o.pos[1]);
  g.rotation.y = -THREE.MathUtils.degToRad(o.rot || 0);
}

function construirGrilla() {
  vaciar(grillaG);
  const b = limites();
  const cx = Math.round((b.minX + b.maxX) / 2);
  const cz = Math.round((b.minY + b.maxY) / 2);
  const tam = Math.ceil(Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2) * 2 + 16;
  const claro = estado.tema === 'claro' && !estado.noche;
  const cFina = claro ? '#9aa1a8' : '#4a4d55';
  const cGruesa = claro ? '#6d747b' : '#5e626c';
  const fina = new THREE.GridHelper(tam, tam, cFina, cFina);
  fina.material.transparent = true;
  fina.material.opacity = estado.noche ? 0.06 : claro ? 0.25 : 0.3;
  fina.material.depthWrite = false;
  fina.userData.propio = true;
  fina.position.set(cx, 0.004, cz);
  grillaG.add(fina);
  const tam5 = Math.ceil(tam / 10) * 10;
  const gruesa = new THREE.GridHelper(tam5, tam5 / 5, cGruesa, cGruesa);
  gruesa.material.transparent = true;
  gruesa.material.opacity = estado.noche ? 0.1 : 0.45;
  gruesa.material.depthWrite = false;
  gruesa.userData.propio = true;
  gruesa.position.set(Math.round(cx / 5) * 5, 0.005, Math.round(cz / 5) * 5);
  grillaG.add(gruesa);

  const ejes = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(1, 0.02, 0), new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.02, 1)]),
    new THREE.LineBasicMaterial({ color: '#e8aa4c', depthTest: false, transparent: true })
  );
  ejes.userData.propio = true;
  ejes.renderOrder = 5;
  grillaG.add(ejes);
  const origen = etiqueta('0,0', 'etq etq-origen', [1.1, 1.1]);
  origen.position.set(0, 0.02, 0);
  grillaG.add(origen);
  grillaG.visible = estado.ver.grilla;
}

function ajustarSol() {
  const b = limites();
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const tam = Math.max(b.maxX - b.minX, b.maxY - b.minY, 6);
  sol.position.set(cx - tam * 0.35, tam * 1.1, cz + tam * 0.55);
  sol.target.position.set(cx, 0, cz);
  if (!estado.noche) {
    sol.color.set('#ffffff');
    sol.intensity = 2.3;
  }
  const d = estado.sol.real && tieneGeo(estado.escena) && !estado.noche ? direccionSol(estado.escena, fechaSol()) : null;
  if (d) {
    const c = colorSol(d.elevacion);
    if (d.deDia) sol.position.set(...posicionLuz3D(d, [cx, cz], tam * 1.5));
    sol.color.set(c.color);
    sol.intensity = 2.3 * c.intensidad;
  }
  const s = sol.shadow.camera;
  // Con el sol bajo las sombras son largas: la cámara de sombras se agranda.
  const m = tam * (estado.sol.real ? 1.6 : 0.9);
  Object.assign(s, { left: -m, right: m, top: m, bottom: -m, near: 0.5, far: tam * 5 });
  s.updateProjectionMatrix();
}

function construirLuces() {
  vaciar(lucesG);
  haces = [];
  if (!estado.noche) return;
  let focos = 0;
  let lamparas = 0;
  for (const o of estado.escena.objetos) {
    const def = TIPOS[o.tipo];
    if (!def?.emite) continue;
    const g = mapa3d.get(o.id);
    if (!g || !g.visible) continue;
    g.updateMatrixWorld(true);
    const color = new THREE.Color(o.luz || def.luz);
    if (def.emite === 'punto') {
      // Lamparitas: luz alrededor, sin haz. Pasado el límite solo brillan (por rendimiento).
      if (lamparas < 10) {
        const lampara = new THREE.PointLight(color, 5, 9, 2);
        lampara.position.copy(g.localToWorld(new THREE.Vector3(0, o.dims[2] * (def.alturaLuz ?? 0.5), 0.15)));
        lucesG.add(lampara);
        lamparas++;
      }
      continue;
    }
    const cabeza = g.localToWorld(new THREE.Vector3(0, o.dims[2] * 0.4, 0));
    // "apunta": [x, y] en el piso, o [x, y, altura] (por ejemplo, para iluminar un árbol desde abajo).
    const objetivo = Array.isArray(o.apunta)
      ? new THREE.Vector3(o.apunta[0], o.apunta[2] ?? 0, o.apunta[1])
      : g.localToWorld(new THREE.Vector3(0, -(o.elev || 0), Math.max(1.5, (o.elev || 0) * 0.7)));
    const apertura = THREE.MathUtils.degToRad(o.apertura || 11);
    const haz = new THREE.Mesh(
      geoHaz,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexColors: true })
    );
    haz.userData.propio = true;
    haz.raycast = () => {};
    lucesG.add(haz);
    let foco = null;
    if (focos < 12) {
      foco = new THREE.SpotLight(color, 40, 0, apertura * 1.5, 0.6, 1.6);
      foco.position.copy(cabeza);
      lucesG.add(foco, foco.target);
      focos++;
    }
    haces.push({ haz, foco, cabeza, objetivo, apertura, fase: haces.length * 1.7 });
  }
  posicionarHaces(reloj.elapsedTime);
}

const _dir = new THREE.Vector3();
const _obj = new THREE.Vector3();
const ABAJO = new THREE.Vector3(0, -1, 0);
function posicionarHaces(t) {
  for (const h of haces) {
    _obj.copy(h.objetivo);
    if (!reducirMovimiento) {
      _obj.x += Math.sin(t * 0.5 + h.fase) * 1.1;
      _obj.z += Math.cos(t * 0.37 + h.fase * 1.3) * 0.8;
    }
    _dir.subVectors(_obj, h.cabeza);
    const largo = _dir.length();
    _dir.normalize();
    h.haz.position.copy(h.cabeza);
    h.haz.quaternion.setFromUnitVectors(ABAJO, _dir);
    const radio = Math.tan(h.apertura) * largo;
    h.haz.scale.set(radio, largo, radio);
    if (h.foco) h.foco.target.position.copy(_obj);
  }
}

function aplicarVisibilidad() {
  for (const o of estado.escena?.objetos || []) {
    const g = mapa3d.get(o.id);
    if (!g) continue;
    g.visible = !estado.ocultas.has(catDe(o)) && !capaOculta(o);
    if (o.tipo === 'arbol') {
      g.traverse((n) => {
        if (n.userData.copa) n.visible = estado.ver.copas;
      });
    }
  }
  visor.classList.toggle('nombres-3d', estado.ver.nombres);
  visor.classList.toggle('sin-cotas', !estado.ver.cotas);
  grillaG.visible = estado.ver.grilla;
  cotasUsuarioG.visible = estado.ver.cotas;
}

/* ================================================================== selección en 3D */

// Lo que un objeto ocupa en el piso. De un árbol cuenta el tronco, no la copa.
function huella(o) {
  if (o.tipo !== 'arbol') return o;
  const t = troncoDe(o);
  return { ...o, dims: [t, t, o.dims[2]] };
}

function segmentosObstaculo(o) {
  const segs = [];
  for (const a of estado.escena.areas) {
    const c = a.contorno;
    for (let i = 0; i < c.length; i++) segs.push([c[i], c[(i + 1) % c.length]]);
  }
  const plano = defDe(o).piso;
  const y0 = o.elev || 0;
  const y1 = y0 + o.dims[2];
  for (const x of estado.escena.objetos) {
    if (x === o || estado.sel.has(x.id) || defDe(x).piso || x.tipo === 'persona') continue;
    const a0 = x.elev || 0;
    const a1 = a0 + x.dims[2];
    if (plano ? a0 > 0.05 : a1 <= y0 + 0.01 || a0 >= y1 - 0.01) continue;
    // Un vallado cuenta por su línea, no por el rectángulo que la contiene.
    if (esLinea(x)) {
      const l = puntosMundo(x);
      for (let i = 1; i < l.length; i++) segs.push([l[i - 1], l[i]]);
      continue;
    }
    const e = esquinas(huella(x));
    for (let i = 0; i < 4; i++) segs.push([e[i], e[(i + 1) % 4]]);
  }
  return segs;
}

function cajaSeleccion(o, g) {
  const [w, p, h] = o.dims;
  const plano = defDe(o).piso;
  const alto = plano ? 0.02 : Math.max(h, 0.02);
  const soporte = new THREE.Group();
  soporte.position.set(o.pos[0], o.elev || 0, o.pos[1]);
  soporte.rotation.y = g.rotation.y;
  const caja = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.03, alto + 0.03, p + 0.03)), matSel);
  caja.position.y = alto / 2;
  caja.renderOrder = 10;
  soporte.add(caja);
  return soporte;
}

// Contorno de una forma libre elegida (zona, estacionamiento, camino, vallado).
function contornoSeleccion(o) {
  const mundo = puntosMundo(o);
  const y = (o.elev || 0) + 0.05;
  const lista = (esPoligono(o) ? [...mundo, mundo[0]] : mundo).map(([x, z]) => new THREE.Vector3(x, y, z));
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(lista), matSel);
  l.renderOrder = 10;
  return l;
}

function actualizarSeleccion3D() {
  vaciar(seleccionG);
  for (const g of mapa3d.values()) g.userData.etq?.classList.remove('sel');
  const objs = selObjs();
  pasoContorno.selectedObjects = objs.map((o) => mapa3d.get(o.id)).filter(Boolean);
  for (const o of objs) {
    const g = mapa3d.get(o.id);
    if (!g) continue;
    g.userData.etq?.classList.add('sel');
    seleccionG.add(Array.isArray(o.puntos) ? contornoSeleccion(o) : cajaSeleccion(o, g));
  }
  dibujarCotas();
  if (objs.length !== 1) return;
  const o = objs[0];
  const g = mapa3d.get(o.id);
  if (!g) return;
  const [w, p, h] = o.dims;
  const elev = o.elev || 0;
  const plano = defDe(o).piso;

  // Forma libre: sus puntos para arrastrar (blancos) y el medio de cada lado para agregar uno (azules).
  if (Array.isArray(o.puntos)) {
    const mundo = puntosMundo(o);
    const y = elev + 0.05;
    if (!o.fijo) {
      const v = new THREE.Points(new THREE.BufferGeometry().setFromPoints(mundo.map(([x, z]) => new THREE.Vector3(x, y, z))), matVertice);
      v.renderOrder = 12;
      seleccionG.add(v);
      const cerrada = esPoligono(o);
      const medios = [];
      for (let i = 0; i < (cerrada ? mundo.length : mundo.length - 1); i++) {
        const a = mundo[i];
        const b = mundo[(i + 1) % mundo.length];
        medios.push(new THREE.Vector3((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2));
      }
      const m = new THREE.Points(new THREE.BufferGeometry().setFromPoints(medios), matMedio);
      m.renderOrder = 12;
      seleccionG.add(m);
    }
    return;
  }

  const soporte = new THREE.Group();
  soporte.position.set(o.pos[0], elev, o.pos[1]);
  soporte.rotation.y = g.rotation.y;
  seleccionG.add(soporte);
  if (!plano) {
    const flecha = new THREE.Mesh(geoFlecha, matFrente);
    flecha.position.set(0, 0.02, p / 2 + 0.06);
    flecha.renderOrder = 10;
    soporte.add(flecha);
    const medidas = etiqueta(`${fm(w)} × ${fm(p)} × ${fm(h)} m`, 'cinta', [0.5, 0]);
    medidas.position.set(0, h + 0.12, 0);
    soporte.add(medidas);
  } else {
    const medidas = etiqueta(`${fm(w)} × ${fm(p)} m`, 'cinta', [0.5, 0]);
    medidas.position.set(0, 0.05, p / 2);
    soporte.add(medidas);
  }
  const y = elev + 0.03;
  for (const d of distanciasLados(o, segmentosObstaculo(o))) {
    if (d.dist < 0.01) continue;
    const a = new THREE.Vector3(d.desde[0], y, d.desde[1]);
    const b = new THREE.Vector3(d.hasta[0], y, d.hasta[1]);
    const px = -d.dir[1] * 0.1;
    const pz = d.dir[0] * 0.1;
    const lineas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([a, b, new THREE.Vector3(b.x - px, y, b.z - pz), new THREE.Vector3(b.x + px, y, b.z + pz)]), matCota);
    lineas.renderOrder = 10;
    seleccionG.add(lineas);
    const et = etiqueta(`${fm(d.dist)} m`, 'cinta cinta-chica');
    et.position.copy(a).lerp(b, 0.5);
    seleccionG.add(et);
  }
}

/* ================================================================== cotas fijas */

function dibujarCotas() {
  vaciar(cotasUsuarioG);
  for (const c of estado.escena?.cotas || []) {
    const y = 0.04;
    const a = new THREE.Vector3(c.a[0], y, c.a[1]);
    const b = new THREE.Vector3(c.b[0], y, c.b[1]);
    const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    if (L < 0.01) continue;
    const ux = (c.b[0] - c.a[0]) / L;
    const uz = (c.b[1] - c.a[1]) / L;
    const t = 0.13;
    const marca = (p) => [new THREE.Vector3(p.x - (ux - uz) * t, y, p.z - (uz + ux) * t), new THREE.Vector3(p.x + (ux - uz) * t, y, p.z + (uz + ux) * t)];
    const elegida = estado.selCota === c.id;
    const lineas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([a, b, ...marca(a), ...marca(b)]), elegida ? matCotaElegida : matCotaUsuario);
    lineas.renderOrder = 9;
    cotasUsuarioG.add(lineas);
    const et = etiqueta(`${fm(L)} m`, `cota-usuario${elegida ? ' sel' : ''}`);
    et.element.dataset.cota = c.id;
    et.position.copy(a).lerp(b, 0.5);
    cotasUsuarioG.add(et);
  }
}

/* ================================================================== puntero y herramientas */

const medida = { a: null, b: null, cursor: null };
let zonaGuia = null;

function esVisible(n) {
  for (; n; n = n.parent) if (!n.visible) return false;
  return true;
}

function rayoDesde(e, cam = camActiva()) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
}

function puntoPiso(e) {
  rayoDesde(e);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(PLANO_PISO, p) ? p : null;
}

// Imán: vértices de los ambientes y esquinas o centros de objetos cercanos; si no hay, la grilla.
// "excluir" deja afuera un objeto (el que se está editando, para que no se pegue a sí mismo).
function imantar(x, z, e, excluir = null) {
  if (e?.altKey) return [r3(x), r3(z)];
  const radio = estado.vista === 'planta' ? (12 * 2 * mitadOrto) / (camO.zoom * Math.max(visor.clientHeight, 1)) : 0.25;
  let mejor = null;
  let dmin = radio;
  const probar = (px, pz) => {
    const d = Math.hypot(px - x, pz - z);
    if (d < dmin) {
      dmin = d;
      mejor = [px, pz];
    }
  };
  for (const a of estado.escena?.areas || []) for (const [px, pz] of a.contorno) probar(px, pz);
  for (const o of estado.escena?.objetos || []) {
    if (estado.ocultas.has(catDe(o)) || o.tipo === 'persona' || o.id === excluir) continue;
    // Las formas libres se imantan a sus puntos, no al rectángulo que las contiene.
    for (const [px, pz] of Array.isArray(o.puntos) ? puntosMundo(o) : esquinas(huella(o))) probar(px, pz);
    if (!esLinea(o)) probar(o.pos[0], o.pos[1]);
  }
  return mejor ? [r3(mejor[0]), r3(mejor[1])] : [ajustar(x), ajustar(z)];
}

function puntoMedida(e) {
  rayoDesde(e);
  const hit = raycaster
    .intersectObjects([lugarG, objetosG], true)
    .find((h) => h.object.isMesh && esVisible(h.object) && !(h.object.material.transparent && h.object.material.opacity < 0.6));
  let p = hit?.point.clone();
  if (!p) {
    p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(PLANO_PISO, p)) return null;
  }
  [p.x, p.z] = imantar(p.x, p.z, e);
  if (e.shiftKey && medida.a && !medida.b) {
    if (Math.abs(p.x - medida.a.x) > Math.abs(p.z - medida.a.z)) p.z = medida.a.z;
    else p.x = medida.a.x;
    p.y = medida.a.y;
  }
  return p;
}

function dibujarGuia() {
  vaciar(guiaG);
  const { a } = medida;
  const b = medida.b || medida.cursor;
  if (trazo) return dibujarTrazo();
  if (zonaGuia) {
    const { x0, z0, x1, z1 } = zonaGuia;
    const w = Math.abs(x1 - x0);
    const p = Math.abs(z1 - z0);
    if (w > 0.01 && p > 0.01) {
      const plano = new THREE.Mesh(new THREE.PlaneGeometry(w, p), matZonaGuia);
      plano.rotation.x = -Math.PI / 2;
      plano.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
      guiaG.add(plano);
      const et = etiqueta(`${fm(w)} × ${fm(p)} m <small>${fm(w * p, 1)} m²</small>`, 'cinta');
      et.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
      guiaG.add(et);
    }
    return;
  }
  if (!a) return;
  for (const q of b ? [a, b] : [a]) {
    const m = new THREE.Mesh(geoPunto, matPunto);
    m.position.copy(q);
    m.renderOrder = 11;
    guiaG.add(m);
  }
  if (!b) return;
  const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), matMedida);
  linea.renderOrder = 11;
  guiaG.add(linea);
  const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
  let texto = `${fm(estado.herramienta === 'cota' ? horizontal : a.distanceTo(b))} m`;
  if (estado.herramienta === 'medir' && Math.abs(b.y - a.y) > 0.05 && horizontal > 0.05) texto += ` <small>en planta ${fm(horizontal)}</small>`;
  const et = etiqueta(texto, 'cinta');
  et.position.copy(a).lerp(b, 0.5);
  guiaG.add(et);
}

/* ------------------------------------------------------------------ trazos: zonas libres y caminos */

// Zona punto por punto o camino: cada clic suma un punto; doble clic, Enter o un clic sobre el primer
// punto termina; Retroceso borra el último; Esc cancela.
let trazo = null;

function dibujarTrazo() {
  const pts = trazo.cursor ? [...trazo.puntos, trazo.cursor] : trazo.puntos;
  const y = 0.04;
  const v = pts.map(([x, z]) => new THREE.Vector3(x, y, z));
  const color = trazo.tipo === 'camino' ? USOS_CAMINO.publico.color : '#8a4fff';
  if (v.length >= 2) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(trazo.tipo === 'zona' && v.length >= 3 ? [...v, v[0]] : v), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
    l.userData.propio = true;
    l.renderOrder = 11;
    guiaG.add(l);
  }
  if (trazo.tipo === 'zona' && pts.length >= 3) {
    const forma = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2).translate(0, 0.03, 0),
      matZonaGuia
    );
    guiaG.add(forma);
  }
  for (const p of v) {
    const m = new THREE.Mesh(geoPunto, matPunto);
    m.position.copy(p);
    m.renderOrder = 12;
    guiaG.add(m);
  }
  if (pts.length >= 2) {
    const ultimo = pts.at(-1);
    const texto =
      trazo.tipo === 'zona'
        ? `${fm(Math.abs(areaFirmada(pts)), 1)} m² <small>${pts.length} puntos</small>`
        : `${fm(longitud(pts), 1)} m <small>${textoTiempo(longitud(pts))}</small>`;
    const et = etiqueta(texto, 'cinta', [0.5, 1.4]);
    et.position.set(ultimo[0], y, ultimo[1]);
    guiaG.add(et);
  }
}

function puntoDeTrazo(e) {
  const p = puntoPiso(e);
  return p ? imantar(p.x, p.z, e) : null;
}

function sumarPuntoTrazo(e, tipo) {
  const p = puntoDeTrazo(e);
  if (!p) return;
  if (!trazo) trazo = { tipo, puntos: [] };
  const prim = trazo.puntos[0];
  // Clic sobre el primer punto: cierra la zona.
  if (trazo.tipo === 'zona' && prim && trazo.puntos.length >= 3 && distanciaEnPantalla(e, prim) < 12) return terminarTrazo();
  const ultimo = trazo.puntos.at(-1);
  if (!ultimo || Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]) > 0.02) trazo.puntos.push(p);
  trazo.cursor = null;
  dibujarGuia();
}

function terminarTrazo() {
  if (!trazo) return;
  const { tipo } = trazo;
  const pts = trazo.puntos.filter((p, i, l) => !i || Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) > 0.05);
  trazo = null;
  dibujarGuia();
  if (tipo === 'zona' && pts.length >= 3) crearForma('zona', pts);
  else if (tipo === 'camino' && pts.length >= 2) crearForma('camino', pts);
  else aviso(tipo === 'zona' ? 'Para una zona hacen falta tres puntos o más.' : 'Para un camino hacen falta dos puntos o más.', 'error');
}

// Crea una zona libre o un camino a partir de puntos de la planta.
function crearForma(tipo, puntosPlanta) {
  const def = TIPOS[tipo];
  const o = { id: nuevoId(), tipo, nombre: nombreUnico(tipo === 'zona' ? 'Zona' : 'Camino'), pos: [0, 0], rot: 0, dims: [1, 1, 0], puntos: puntosPlanta.map(([x, y]) => [r3(x), r3(y)]) };
  if (tipo === 'zona') o.color = def.color;
  if (tipo === 'camino') {
    o.ancho = 3;
    o.uso = 'publico';
  }
  recentrar(o);
  antesDeCambiar();
  estado.escena.objetos.push(o);
  agregarObjeto3D(o);
  marcarCambio({ lista: true });
  ponerHerramienta('seleccionar');
  ponerSeleccion([o.id]);
  aviso(tipo === 'zona' ? 'Zona creada. Poné el nombre y el uso en el panel de la derecha; arrastrá sus puntos para ajustarla.' : 'Camino creado. Elegí su uso y su ancho en el panel de la derecha.');
}

// Distancia en píxeles entre el mouse y un punto de la planta.
function distanciaEnPantalla(e, [x, z], y = 0) {
  const r = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector3(x, y, z).project(camActiva());
  return Math.hypot(((v.x + 1) / 2) * r.width + r.left - e.clientX, ((1 - v.y) / 2) * r.height + r.top - e.clientY);
}

/* ------------------------------------------------------------------ edición de puntos de formas libres */

let editVertice = null;

// ¿El mouse está sobre un punto (o sobre el medio de un lado) del objeto elegido?
function verticeBajo(e) {
  const o = selUnico();
  if (!o || !Array.isArray(o.puntos) || o.fijo || estado.herramienta !== 'seleccionar') return null;
  const mundo = puntosMundo(o);
  for (let i = 0; i < mundo.length; i++) if (distanciaEnPantalla(e, mundo[i]) < 10) return { o, i, medio: false };
  const cerrada = esPoligono(o);
  const n = cerrada ? mundo.length : mundo.length - 1;
  for (let i = 0; i < n; i++) {
    const a = mundo[i];
    const b = mundo[(i + 1) % mundo.length];
    if (distanciaEnPantalla(e, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) < 9) return { o, i, medio: true };
  }
  return null;
}

function moverVertice(e) {
  const p = puntoPiso(e);
  if (!p) return;
  const [x, z] = imantar(p.x, p.z, e, editVertice.o.id);
  const { o } = editVertice;
  if (!editVertice.movio) {
    antesDeCambiar();
    editVertice.movio = true;
    // Arrastrar el medio de un lado agrega un punto nuevo ahí.
    if (editVertice.medio) {
      o.puntos.splice(editVertice.i + 1, 0, [0, 0]);
      editVertice.i += 1;
      editVertice.medio = false;
    }
  }
  const [lx, ly] = aLocal(o, [x, z]);
  o.puntos[editVertice.i] = [r3(lx), r3(ly)];
  reconstruirObjeto(o);
  actualizarSeleccion3D();
  $('#cursor').textContent = `x ${fm(x)}   y ${fm(z)} m`;
}

function soltarVertice() {
  const { o, movio } = editVertice;
  editVertice = null;
  visor.classList.remove('arrastrando');
  if (!movio) return;
  recentrar(o);
  reconstruirObjeto(o);
  actualizarSeleccion3D();
  marcarCambio({ detalle: true });
}

// Clic derecho sobre un punto: lo borra (si quedan suficientes).
visor.addEventListener('contextmenu', (e) => {
  const v = verticeBajo(e);
  if (!v || v.medio) return;
  e.preventDefault();
  const minimo = esLinea(v.o) ? 2 : 3;
  if (v.o.puntos.length <= minimo) return aviso(`Tiene que quedar con ${minimo} puntos como mínimo.`, 'error');
  antesDeCambiar();
  v.o.puntos.splice(v.i, 1);
  recentrar(v.o);
  reconstruirObjeto(v.o);
  actualizarSeleccion3D();
  marcarCambio({ detalle: true });
});

const AYUDAS = {
  medir: 'Clic en dos puntos para medir. Se pega a esquinas y vértices; Shift alinea con un eje, Alt mide libre. Esc termina.',
  cota: 'Clic en dos puntos para dejar una cota fija en el plano. Shift alinea con un eje, Alt mide libre. Esc termina.',
  zona: 'Arrastrá para una zona rectangular, o hacé clic punto por punto para una forma libre (doble clic o Enter para cerrar). Retroceso borra el último punto.',
  camino: 'Clic punto por punto para trazar un camino. Doble clic o Enter para terminar, Retroceso borra el último punto, Esc cancela.',
  mano: 'Arrastrá para mover la vista. También funciona con la barra espaciadora apretada.',
  calibrar: 'Escala del fondo: hacé clic en dos puntos de la imagen que estén lejos entre sí (por ejemplo, dos esquinas del predio).',
  alinear: 'Mover el fondo: hacé clic en un punto de la imagen y después en el lugar de la escena donde tiene que quedar.',
  ubicar: 'Ubicación: hacé clic en el punto de la escena que corresponde a las coordenadas que pegaste.',
  alinearCad: 'Mover el plano: hacé clic en un punto del plano de AutoCAD y después en el lugar de la escena donde tiene que quedar.',
  nivel: 'Puntos de altura: hacé clic donde mediste y escribí su altura. Esc termina.',
};

function ponerHerramienta(h) {
  if (estado.caminando && h !== 'seleccionar') return;
  estado.herramienta = h;
  medida.a = medida.b = medida.cursor = null;
  zonaGuia = null;
  trazo = null;
  calibracion = null;
  dibujarGuia();
  $$('[data-herramienta]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.herramienta === h)));
  const ayuda = $('#ayuda-herramienta');
  ayuda.textContent = AYUDAS[h] || '';
  ayuda.hidden = !AYUDAS[h];
  visor.dataset.herramienta = h;
  botonesRaton();
}

let arrastre = null;
let caja = null;
let presion = null;

function objetoBajo(e) {
  rayoDesde(e);
  for (const h of raycaster.intersectObjects(objetosG.children, true)) {
    let n = h.object;
    while (n && !n.userData.id) n = n.parent;
    if (!n || !esVisible(n)) continue;
    const o = objPorId(n.userData.id);
    if (o && estado.bloqueadas.has(catDe(o))) continue;
    return { id: n.userData.id, punto: h.point };
  }
  return null;
}

visor.addEventListener(
  'pointerdown',
  (e) => {
    if (e.target !== renderer.domElement) return;
    if (estado.caminando) {
      if (e.button === 0 && !ctrlR.isLocked) ctrlR.lock();
      return;
    }
    presion = { x: e.clientX, y: e.clientY, boton: e.button };
    if (e.button !== 0 || panTemporal || estado.herramienta === 'mano') return;

    if (estado.herramienta === 'medir' || estado.herramienta === 'cota') {
      e.stopPropagation();
      const p = puntoMedida(e);
      if (!p) return;
      if (!medida.a || medida.b) {
        medida.a = p;
        medida.b = null;
      } else {
        medida.b = p;
        if (estado.herramienta === 'cota') {
          crearCota([medida.a.x, medida.a.z], [p.x, p.z]);
          medida.a = medida.b = null;
        }
      }
      medida.cursor = null;
      dibujarGuia();
      return;
    }

    if (estado.herramienta === 'zona') {
      e.stopPropagation();
      // Con una zona libre empezada, cada clic suma un punto.
      if (trazo) return sumarPuntoTrazo(e, 'zona');
      const p = puntoPiso(e);
      if (!p) return;
      const [x, z] = imantar(p.x, p.z, e);
      zonaGuia = { x0: x, z0: z, x1: x, z1: z };
      visor.setPointerCapture(e.pointerId);
      return;
    }

    if (estado.herramienta === 'camino') {
      e.stopPropagation();
      return sumarPuntoTrazo(e, 'camino');
    }

    if (estado.herramienta === 'nivel') {
      e.stopPropagation();
      const p = puntoPiso(e);
      if (p) agregarPuntoNivel(imantar(p.x, p.z, e));
      return;
    }
    if (estado.herramienta === 'calibrar' || estado.herramienta === 'alinear' || estado.herramienta === 'ubicar' || estado.herramienta === 'alinearCad') {
      e.stopPropagation();
      const p = puntoPiso(e);
      if (p) clicCalibracion(imantar(p.x, p.z, { altKey: true }), e);
      return;
    }

    // Puntos de una forma libre elegida: se arrastran (o, desde el medio de un lado, se agrega uno).
    const vertice = verticeBajo(e);
    if (vertice) {
      e.stopPropagation();
      editVertice = { ...vertice, movio: false };
      visor.setPointerCapture(e.pointerId);
      visor.classList.add('arrastrando');
      return;
    }

    const hit = objetoBajo(e);
    if (!hit) {
      // En planta (o con Shift en 3D), arrastrar sobre el vacío dibuja un recuadro de selección.
      if (estado.vista === 'planta' || e.shiftKey) {
        e.stopPropagation();
        const r = visor.getBoundingClientRect();
        caja = { x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top, sumar: e.shiftKey || e.ctrlKey || e.metaKey };
        visor.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      for (const id of idsDelGrupo(hit.id)) alternarSeleccion(id);
      return;
    }
    if (!estado.sel.has(hit.id)) ponerSeleccion(idsDelGrupo(hit.id));
    const o = objPorId(hit.id);
    if (!o || o.fijo) return;
    const moviles = selObjs().filter((x) => !x.fijo);
    e.stopPropagation();
    arrastre = {
      ancla: o,
      base: new Map(moviles.map((x) => [x.id, [...x.pos]])),
      plano: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.punto.y),
      dx: o.pos[0] - hit.punto.x,
      dz: o.pos[1] - hit.punto.z,
      movio: false,
    };
    visor.setPointerCapture(e.pointerId);
    visor.classList.add('arrastrando');
  },
  true
);

const _p = new THREE.Vector3();
visor.addEventListener('pointermove', (e) => {
  if (editVertice) return moverVertice(e);
  if (trazo && e.target === renderer.domElement) {
    trazo.cursor = puntoDeTrazo(e);
    dibujarGuia();
  }
  if (arrastre) {
    rayoDesde(e);
    if (!raycaster.ray.intersectPlane(arrastre.plano, _p)) return;
    const { ancla, base } = arrastre;
    let x = _p.x + arrastre.dx;
    let y = _p.z + arrastre.dz;
    if (!e.altKey) {
      x = ajustar(x);
      y = ajustar(y);
    }
    const [bx, by] = base.get(ancla.id);
    const ddx = r3(x - bx);
    const ddy = r3(y - by);
    if (r3(bx + ddx) === ancla.pos[0] && r3(by + ddy) === ancla.pos[1]) return;
    if (!arrastre.movio) {
      antesDeCambiar();
      arrastre.movio = true;
    }
    for (const [id, [ox, oy]] of base) {
      const o = objPorId(id);
      o.pos = [r3(ox + ddx), r3(oy + ddy)];
      moverObjeto3D(o);
    }
    if (estado.noche) construirLuces();
    actualizarSeleccion3D();
    refrescarCampos();
    $('#cursor').textContent = `Δx ${fm(ddx)}   Δy ${fm(ddy)} m`;
    return;
  }
  if (caja) {
    const r = visor.getBoundingClientRect();
    caja.x1 = e.clientX - r.left;
    caja.y1 = e.clientY - r.top;
    const m = $('#marquesina');
    m.hidden = false;
    Object.assign(m.style, {
      left: `${Math.min(caja.x0, caja.x1)}px`,
      top: `${Math.min(caja.y0, caja.y1)}px`,
      width: `${Math.abs(caja.x1 - caja.x0)}px`,
      height: `${Math.abs(caja.y1 - caja.y0)}px`,
    });
    return;
  }
  if (zonaGuia) {
    const p = puntoPiso(e);
    if (!p) return;
    [zonaGuia.x1, zonaGuia.z1] = imantar(p.x, p.z, e);
    dibujarGuia();
    return;
  }
  if (estado.caminando || e.target !== renderer.domElement) return;
  const p = puntoPiso(e);
  if (p) {
    // Con la escena ubicada, también las coordenadas reales (para comparar con Google Maps).
    const geo = tieneGeo(estado.escena) ? `   ${textoCoordenadas(escenaAGeo(estado.escena, [p.x, p.z]), 5)}` : '';
    $('#cursor').textContent = `x ${fm(p.x)}   y ${fm(p.z)} m${geo}`;
  }
  if ((estado.herramienta === 'medir' || estado.herramienta === 'cota') && medida.a && !medida.b) {
    medida.cursor = puntoMedida(e);
    dibujarGuia();
  }
  if (estado.herramienta === 'seleccionar' && e.buttons === 0) marcarHover(objetoBajo(e)?.id || null);
});

let hoverId = null;
function marcarHover(id) {
  if (id === hoverId) return;
  mapa3d.get(hoverId)?.userData.etq?.classList.remove('hover');
  hoverId = id;
  mapa3d.get(id)?.userData.etq?.classList.add('hover');
  visor.classList.toggle('sobre-objeto', Boolean(id));
}

visor.addEventListener('pointerup', (e) => {
  const soltar = () => {
    try {
      visor.releasePointerCapture(e.pointerId);
    } catch {}
  };
  if (editVertice) {
    soltarVertice();
    soltar();
    presion = null;
    return;
  }
  if (arrastre) {
    if (arrastre.movio) marcarCambio();
    arrastre = null;
    visor.classList.remove('arrastrando');
    soltar();
    presion = null;
    return;
  }
  if (caja) {
    const { x0, y0, x1, y1, sumar } = caja;
    caja = null;
    $('#marquesina').hidden = true;
    soltar();
    if (Math.abs(x1 - x0) < 4 && Math.abs(y1 - y0) < 4) {
      if (!sumar) limpiarSeleccion();
      return;
    }
    seleccionarEnRecuadro(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), sumar);
    return;
  }
  if (zonaGuia) {
    const { x0, z0, x1, z1 } = zonaGuia;
    zonaGuia = null;
    dibujarGuia();
    soltar();
    const w = Math.abs(x1 - x0);
    const p = Math.abs(z1 - z0);
    if (w >= 0.3 && p >= 0.3) crearZona((x0 + x1) / 2, (z0 + z1) / 2, w, p);
    // Un clic sin arrastrar empieza una zona de forma libre, punto por punto.
    else if (w < 0.3 && p < 0.3) {
      trazo = { tipo: 'zona', puntos: [[x0, z0]] };
      dibujarGuia();
    }
    return;
  }
  if (presion && e.button === 0 && estado.herramienta === 'seleccionar' && !estado.caminando && e.target === renderer.domElement) {
    if (Math.hypot(e.clientX - presion.x, e.clientY - presion.y) < 4 && !objetoBajo(e) && !e.shiftKey) limpiarSeleccion();
  }
  presion = null;
});

// Si el sistema corta el gesto (cambio de ventana, alerta, toque cancelado), se cierra lo que estaba en curso
// para que el objeto no quede pegado al mouse.
visor.addEventListener('pointercancel', () => {
  if (arrastre?.movio) marcarCambio();
  arrastre = null;
  caja = null;
  zonaGuia = null;
  presion = null;
  visor.classList.remove('arrastrando');
  $('#marquesina').hidden = true;
  dibujarGuia();
});

visor.addEventListener('pointerleave', () => {
  if (arrastre) return;
  $('#cursor').textContent = 'x —   y —';
  marcarHover(null);
});

visor.addEventListener('dblclick', (e) => {
  if (trazo) return terminarTrazo();
  if (estado.caminando || estado.herramienta !== 'seleccionar' || e.target !== renderer.domElement) return;
  const hit = objetoBajo(e);
  if (hit) centrarEn(objPorId(hit.id));
});

// Las cotas fijas se eligen haciendo clic en su rótulo.
visor.addEventListener('click', (e) => {
  const et = e.target.closest?.('[data-cota]');
  if (et) seleccionarCota(et.dataset.cota);
});

function seleccionarEnRecuadro(x0, y0, x1, y1, sumar) {
  const cam = camActiva();
  const w = visor.clientWidth;
  const h = visor.clientHeight;
  const v = new THREE.Vector3();
  const ids = [];
  for (const o of estado.escena.objetos) {
    if (o.fijo || estado.ocultas.has(catDe(o)) || estado.bloqueadas.has(catDe(o))) continue;
    v.set(o.pos[0], (o.elev || 0) + o.dims[2] / 2, o.pos[1]).project(cam);
    const sx = ((v.x + 1) / 2) * w;
    const sy = ((1 - v.y) / 2) * h;
    if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && v.z < 1) ids.push(o.id);
  }
  ponerSeleccion(sumar ? [...new Set([...estado.sel, ...ids])] : ids);
  if (ids.length) aviso(`${ids.length} objeto${ids.length === 1 ? '' : 's'} en el recuadro.`);
}

// Soltar un objeto de la biblioteca sobre la vista.
visor.addEventListener('dragover', (e) => {
  const t = e.dataTransfer?.types || [];
  if (!t.includes('text/x-tipo') && !t.includes('text/x-catalogo') && !t.includes('text/x-bloque')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
visor.addEventListener('drop', (e) => {
  const tipo = e.dataTransfer?.getData('text/x-tipo');
  const equipo = e.dataTransfer?.getData('text/x-catalogo');
  const bloque = e.dataTransfer?.getData('text/x-bloque');
  if (!tipo && !equipo && !bloque) return;
  e.preventDefault();
  e.stopPropagation();
  const p = puntoPiso(e);
  const punto = p ? [p.x, p.z] : null;
  if (equipo) agregarDesdeCatalogo(equipo, punto);
  else if (bloque) insertarBloque(bloque, punto);
  else agregar(tipo, punto);
});

/* ================================================================== cámaras y vistas */

function ajustarOrto() {
  const a = (visor.clientWidth || 1) / (visor.clientHeight || 1);
  Object.assign(camO, { left: -mitadOrto * a, right: mitadOrto * a, top: mitadOrto, bottom: -mitadOrto });
  camO.updateProjectionMatrix();
}

let encuadrePendiente = false;
function redimensionar() {
  const w = visor.clientWidth;
  const h = visor.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  capaEtiquetas.setSize(w, h);
  camP.aspect = camR.aspect = w / h;
  camP.updateProjectionMatrix();
  camR.updateProjectionMatrix();
  ajustarOrto();
  if (encuadrePendiente) encuadrar();
}
new ResizeObserver(redimensionar).observe(visor);

function encuadrar() {
  // Si la ventana todavía no tiene tamaño (pestaña oculta), se encuadra cuando lo tenga.
  encuadrePendiente = !visor.clientWidth || !visor.clientHeight;
  if (encuadrePendiente) return;
  const b = limites();
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const ancho = Math.max(b.maxX - b.minX, 2);
  const prof = Math.max(b.maxY - b.minY, 2);
  const tam = Math.max(ancho, prof);
  const a = visor.clientWidth / visor.clientHeight;
  const k = Math.max(1, 1.3 / a);
  ctrlP.target.set(cx, 0, cz);
  camP.position.set(cx + tam * 0.12 * k, tam * 0.78 * k, cz + tam * 0.95 * k);
  ctrlP.update();
  mitadOrto = Math.max(prof / 2, ancho / 2 / a) * 1.15;
  camO.zoom = 1;
  ctrlO.target.set(cx, 0, cz);
  camO.position.set(cx, 100, cz);
  ajustarOrto();
  ctrlO.update();
}

function camaraPredefinida(cual) {
  if (estado.vista !== '3d' || estado.caminando) ponerVista('3d');
  const b = limites();
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const tam = Math.max(b.maxX - b.minX, b.maxY - b.minY, 4);
  ctrlP.target.set(cx, 0, cz);
  if (cual === 'superior') camP.position.set(cx, tam * 1.35, cz + 0.001);
  else if (cual === 'frente') camP.position.set(cx, tam * 0.18, cz + tam * 1.15);
  else camP.position.set(cx + tam * 0.75, tam * 0.65, cz + tam * 0.75);
  ctrlP.update();
}

function centrarEn(objs) {
  objs = (Array.isArray(objs) ? objs : [objs]).filter(Boolean);
  if (!objs.length) return;
  const b = cajaDe(objs.flatMap((o) => esquinas(o)));
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const tam = Math.max(b.maxX - b.minX, b.maxY - b.minY, ...objs.map((o) => o.dims[2]), 1);
  if (estado.vista === 'planta') {
    ctrlO.target.set(cx, 0, cz);
    camO.position.set(cx, 100, cz);
    camO.zoom = Math.min(ctrlO.maxZoom, Math.max(0.5, mitadOrto / (tam * 1.6)));
    camO.updateProjectionMatrix();
  } else if (estado.vista === '3d' && !estado.caminando) {
    const y = Math.max(...objs.map((o) => (o.elev || 0) + o.dims[2] / 2));
    const destino = new THREE.Vector3(cx, y, cz);
    const dir = camP.position.clone().sub(ctrlP.target).normalize();
    ctrlP.target.copy(destino);
    camP.position.copy(destino).addScaledVector(dir, tam * 2.4 + 2);
  }
}

function nivelEn(x, z) {
  for (const a of estado.escena?.areas || []) if (puntoEnPoligono(x, z, a.contorno)) return Number(a.nivel) || 0;
  return 0;
}

function ponerVista(v) {
  if (estado.caminando) ponerCaminar(false);
  const antes = estado.vista;
  if (v === antes) return;
  if (v === 'planta' && antes === '3d') {
    ctrlO.target.set(ctrlP.target.x, 0, ctrlP.target.z);
    camO.position.set(ctrlP.target.x, 100, ctrlP.target.z);
  } else if (v === '3d' && antes === 'planta') {
    const desplazo = camP.position.clone().sub(ctrlP.target);
    ctrlP.target.set(ctrlO.target.x, 0, ctrlO.target.z);
    camP.position.copy(ctrlP.target).add(desplazo);
  }
  estado.vista = v;
  const es3D = enVista3D();
  ctrlP.enabled = v === '3d';
  ctrlO.enabled = v === 'planta';
  $$('[data-vista]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === v)));
  $('#visor').hidden = !es3D;
  $('#hoja').hidden = es3D;
  document.body.dataset.vista = v;
  visor.classList.toggle('vista-3d', v === '3d');
  $('#btn-caminar').disabled = v !== '3d';
  if (!es3D) {
    ponerHerramienta('seleccionar');
    renderHoja();
    $('#hoja-contenido').scrollTo(0, 0);
  } else requestAnimationFrame(redimensionar);
  renderDetalle();
}

function ponerCaminar(activo) {
  if (activo && estado.vista !== '3d') ponerVista('3d');
  estado.caminando = activo;
  $('#btn-caminar').setAttribute('aria-pressed', String(activo));
  if (activo) {
    ponerHerramienta('seleccionar');
    const r = estado.escena?.recorrido;
    const b = estado.escena?.areas[0]?.contorno.length ? cajaDe(estado.escena.areas[0].contorno) : limites();
    const desde = r?.desde || [(b.minX + b.maxX) / 2, b.maxY - Math.min(1.5, (b.maxY - b.minY) / 3)];
    const mira = r?.mira || [desde[0], b.minY];
    camR.position.set(desde[0], ALTURA_OJOS + nivelEn(desde[0], desde[1]), desde[1]);
    camR.lookAt(mira[0], camR.position.y, mira[1]);
    limpiarSeleccion();
  } else ctrlR.unlock();
  ctrlP.enabled = !activo && estado.vista === '3d';
  for (const t of techos) t.visible = activo;
  $('#ayuda-recorrido').hidden = !activo;
  visor.classList.toggle('vista-recorrido', activo);
}

ctrlR.addEventListener('lock', () => ($('#ayuda-recorrido').hidden = true));
ctrlR.addEventListener('unlock', () => ($('#ayuda-recorrido').hidden = !estado.caminando));

const teclas = new Set();
function caminar(dt) {
  if (!ctrlR.isLocked) return;
  const v = (teclas.has('ShiftLeft') || teclas.has('ShiftRight') ? 4.2 : 1.6) * dt;
  if (teclas.has('KeyW') || teclas.has('ArrowUp')) ctrlR.moveForward(v);
  if (teclas.has('KeyS') || teclas.has('ArrowDown')) ctrlR.moveForward(-v);
  if (teclas.has('KeyA') || teclas.has('ArrowLeft')) ctrlR.moveRight(-v);
  if (teclas.has('KeyD') || teclas.has('ArrowRight')) ctrlR.moveRight(v);
  camR.position.y = ALTURA_OJOS + nivelEn(camR.position.x, camR.position.z);
}

const _v = new THREE.Vector3();
function actualizarParedes(cam) {
  const transparentar = estado.vista === '3d' && !estado.caminando && estado.ver.transparentar;
  for (const p of paredes) {
    const fantasma = transparentar && _v.copy(cam.position).sub(p.userData.centro).dot(p.userData.normal) > 0;
    if (p.userData.fantasma === fantasma) continue;
    p.userData.fantasma = fantasma;
    const m = p.userData.material;
    m.transparent = fantasma;
    m.opacity = fantasma ? 0.12 : 1;
    m.depthWrite = !fantasma;
    m.needsUpdate = true;
  }
}

function animar() {
  requestAnimationFrame(animar);
  const dt = Math.min(reloj.getDelta(), 0.1);
  if (!enVista3D() || !visor.clientWidth) return;
  if (estado.vista === 'planta') ctrlO.update();
  else if (estado.caminando) caminar(dt);
  else ctrlP.update();
  const cam = camActiva();
  actualizarParedes(cam);
  if (haces.length) posicionarHaces(reloj.elapsedTime);
  if (estado.vista === '3d') {
    pasoRender.camera = pasoAO.camera = pasoContorno.renderCamera = cam;
    pasoAO.enabled = estado.ver.ao && !estado.noche;
    composer.render(dt);
  } else renderer.render(mundo, cam);
  capaEtiquetas.render(mundo, cam);
}

function aplicarFondo() {
  mundo.background.copy(estado.noche ? FONDOS.noche : FONDOS[estado.tema]);
}

function ponerNoche(activo) {
  estado.noche = activo;
  $('#btn-noche').setAttribute('aria-pressed', String(activo));
  aplicarFondo();
  mundo.fog = activo ? new THREE.FogExp2('#05060a', 0.014) : null;
  hemi.color.set(activo ? '#7480ff' : '#ffffff');
  hemi.groundColor.set(activo ? '#120f1c' : '#b9b4aa');
  hemi.intensity = activo ? 0.5 : 1.05;
  mundo.environmentIntensity = activo ? 0.05 : 0.35;
  sol.intensity = activo ? 0 : 2.3;
  sol.castShadow = !activo;
  matBorde.opacity = activo ? 0.14 : 0.32;
  if (estado.escena) construirTodo();
}

function ponerTema(tema) {
  estado.tema = tema;
  document.documentElement.dataset.tema = tema;
  aplicarFondo();
  if (estado.escena) construirGrilla();
  guardarPref();
}

/* ================================================================== cambios, historial y guardado */

function antesDeCambiar() {
  estado.deshacer.push(estado.ultimo);
  if (estado.deshacer.length > 200) estado.deshacer.shift();
  estado.rehacer.length = 0;
}

let temporizadorHoja = null;
function marcarCambio({ lista = false, detalle = false } = {}) {
  estado.ultimo = instantanea();
  programarGuardado();
  programarCapacidad();
  programarAnalisis();
  if (lista) renderLista();
  if (detalle) renderDetalle();
  actualizarHistorialUI();
  if (!enVista3D()) {
    clearTimeout(temporizadorHoja);
    temporizadorHoja = setTimeout(renderHoja, 250);
  }
}

function restaurar(texto) {
  estado.escena = normalizarEscena(JSON.parse(texto));
  estado.ultimo = texto;
  for (const id of [...estado.sel]) if (!objPorId(id)) estado.sel.delete(id);
  if (estado.selCota && !cotaPorId(estado.selCota)) estado.selCota = null;
  construirTodo();
  renderLista();
  renderDetalle();
  programarGuardado();
  programarCapacidad();
  actualizarHistorialUI();
  if (!enVista3D()) renderHoja();
}

function deshacer() {
  if (!estado.deshacer.length) return;
  estado.rehacer.push(estado.ultimo);
  restaurar(estado.deshacer.pop());
}

function rehacer() {
  if (!estado.rehacer.length) return;
  estado.deshacer.push(estado.ultimo);
  restaurar(estado.rehacer.pop());
}

function actualizarHistorialUI() {
  $('#btn-deshacer').disabled = !estado.deshacer.length;
  $('#btn-rehacer').disabled = !estado.rehacer.length;
}

let temporizadorGuardado = null;
function programarGuardado() {
  ponerGuardado('pendiente');
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(guardar, 500);
}

const textoEscena = () => formatearJSON(estado.escena) + '\n';

// Devuelve true si quedó guardado. Con respaldar, el servidor copia antes lo que había aunque la última copia
// sea reciente (se usa al volver a una versión anterior).
async function guardar({ respaldar = false } = {}) {
  temporizadorGuardado = null;
  if (!estado.escena) return false;
  const texto = textoEscena();
  if (texto === estado.textoGuardado) {
    ponerGuardado('ok');
    return true;
  }
  ponerGuardado('guardando');
  try {
    const r = await fetch(`/api/escenas/${estado.slug}${respaldar ? '?respaldar' : ''}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: texto });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
    estado.textoGuardado = texto;
    ponerGuardado('ok');
    return true;
  } catch (err) {
    ponerGuardado('error', `${err.message}. Se reintenta con el próximo cambio.`);
    return false;
  }
}

// Guarda en el momento lo que esté pendiente.
async function guardarPendiente() {
  if (!temporizadorGuardado) return true;
  clearTimeout(temporizadorGuardado);
  return guardar();
}

function ponerGuardado(clave, detalle = '') {
  const el = $('#guardado');
  el.dataset.estado = clave;
  el.textContent = { pendiente: 'Sin guardar', guardando: 'Guardando…', ok: 'Guardado', error: 'No se pudo guardar' }[clave];
  el.title = detalle;
}

// Al cambiar de pestaña o minimizar se guarda en el momento lo que esté pendiente. Al cerrar, el último
// intento va con keepalive, que el navegador solo acepta hasta 64 KB (escenas de unos 400 objetos).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || !temporizadorGuardado) return;
  clearTimeout(temporizadorGuardado);
  guardar();
});
window.addEventListener('pagehide', () => {
  if (!temporizadorGuardado || !estado.escena) return;
  const texto = textoEscena();
  if (texto.length > 60000) return;
  fetch(`/api/escenas/${estado.slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: texto, keepalive: true });
});

/* ================================================================== selección */

function trasCambioSeleccion() {
  actualizarSeleccion3D();
  renderDetalle();
  for (const b of $$('#lista [data-id]')) {
    const sel = estado.sel.has(b.dataset.id);
    b.toggleAttribute('aria-current', sel);
    if (sel && estado.sel.size === 1) b.scrollIntoView({ block: 'nearest' });
  }
  for (const b of $$('#lista [data-cota-item]')) b.toggleAttribute('aria-current', b.dataset.cotaItem === estado.selCota);
  const n = estado.sel.size;
  $('#info-sel').textContent = n ? `${n} seleccionado${n === 1 ? '' : 's'}` : estado.selCota ? 'Cota seleccionada' : '';
}

function ponerSeleccion(ids) {
  estado.sel = new Set(ids.filter((id) => objPorId(id)));
  estado.selCota = null;
  trasCambioSeleccion();
}

function alternarSeleccion(id) {
  if (estado.sel.has(id)) estado.sel.delete(id);
  else estado.sel.add(id);
  estado.selCota = null;
  trasCambioSeleccion();
}

function limpiarSeleccion() {
  if (!estado.sel.size && !estado.selCota) return;
  estado.sel.clear();
  estado.selCota = null;
  trasCambioSeleccion();
}

function seleccionarCota(id) {
  estado.sel.clear();
  estado.selCota = id;
  trasCambioSeleccion();
}

/* ================================================================== acciones sobre objetos */

function nombreUnico(base) {
  const usados = new Set(estado.escena.objetos.map((o) => o.nombre));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function centroDeVista() {
  if (estado.vista === 'planta') return [ctrlO.target.x, ctrlO.target.z];
  if (estado.caminando) return [camR.position.x, camR.position.z];
  return [ctrlP.target.x, ctrlP.target.z];
}

function agregar(tipo, punto = null) {
  const def = TIPOS[tipo];
  if (!estado.escena || !def) return;
  const [x, y] = punto || centroDeVista();
  const o = { id: nuevoId(), tipo, nombre: nombreUnico(def.nombre), pos: [ajustar(x), ajustar(y)], rot: 0, dims: [...def.dims] };
  if (def.elev) o.elev = def.elev;
  // Caminos y vallados arrancan como una línea recta que después se edita punto por punto.
  if (def.forma === 'linea') o.puntos = [[-def.dims[0] / 2, 0], [def.dims[0] / 2, 0]];
  if (tipo === 'camino') Object.assign(o, { ancho: 3, uso: 'publico' });
  if (tipo === 'puesto') Object.assign(o, { rol: 'seguridad', personas: 1 });
  if (tipo === 'texto') o.texto = 'Texto';
  if (tipo === 'senal') o.texto = 'Salida';
  antesDeCambiar();
  estado.escena.objetos.push(o);
  agregarObjeto3D(o);
  if (estado.noche && def.emite) construirLuces();
  marcarCambio({ lista: true });
  ponerSeleccion([o.id]);
  if (innerWidth < 1000) cerrarPaneles();
}

function crearZona(x, y, w, p) {
  const def = TIPOS.zona;
  const o = { id: nuevoId(), tipo: 'zona', nombre: nombreUnico('Zona'), pos: [r3(x), r3(y)], rot: 0, dims: [r3(w), r3(p), 0], color: def.color };
  antesDeCambiar();
  estado.escena.objetos.push(o);
  agregarObjeto3D(o);
  marcarCambio({ lista: true });
  ponerHerramienta('seleccionar');
  ponerSeleccion([o.id]);
  aviso('Zona creada. Poné el nombre en el panel de la derecha.');
}

function crearCota(a, b) {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) return;
  antesDeCambiar();
  const c = { id: nuevoId(), a: [r3(a[0]), r3(a[1])], b: [r3(b[0]), r3(b[1])] };
  estado.escena.cotas.push(c);
  marcarCambio({ lista: true });
  seleccionarCota(c.id);
}

function eliminarSeleccion() {
  if (estado.selCota) {
    antesDeCambiar();
    estado.escena.cotas = estado.escena.cotas.filter((c) => c.id !== estado.selCota);
    estado.selCota = null;
    marcarCambio({ lista: true });
    trasCambioSeleccion();
    return;
  }
  const objs = selObjs();
  if (!objs.length) return;
  const borrables = objs.filter((o) => !o.fijo);
  if (!borrables.length) return aviso('Está marcado como fijo. Destrabalo con el candado para poder borrarlo.', 'error');
  antesDeCambiar();
  const ids = new Set(borrables.map((o) => o.id));
  estado.escena.objetos = estado.escena.objetos.filter((o) => !ids.has(o.id));
  for (const id of ids) quitarObjeto3D(id);
  if (estado.noche) construirLuces();
  estado.sel = new Set(objs.filter((o) => o.fijo).map((o) => o.id));
  marcarCambio({ lista: true });
  trasCambioSeleccion();
  const nombre = borrables.length === 1 ? borrables[0].nombre : `${borrables.length} objetos`;
  aviso(`Se eliminó ${nombre}. Ctrl+Z lo trae de vuelta.${borrables.length < objs.length ? ' Los fijos quedaron.' : ''}`);
}

function copiaDe(o, dx, dy) {
  const c = structuredClone(o);
  c.id = nuevoId();
  c.nombre = nombreUnico(o.nombre.replace(/\s\d+$/, ''));
  delete c.fijo;
  c.pos = [r3(o.pos[0] + dx), r3(o.pos[1] + dy)];
  return c;
}

function insertar(copias) {
  antesDeCambiar();
  for (const c of copias) {
    estado.escena.objetos.push(c);
    agregarObjeto3D(c);
  }
  if (estado.noche) construirLuces();
  marcarCambio({ lista: true });
  ponerSeleccion(copias.map((c) => c.id));
}

function duplicar() {
  const objs = selObjs();
  if (!objs.length) return;
  if (objs.length === 1) {
    // La copia queda al lado, sobre el eje del ancho del original.
    const o = objs[0];
    const t = ((o.rot || 0) * Math.PI) / 180;
    const paso = o.dims[0] + 0.1;
    return insertar([copiaDe(o, Math.cos(t) * paso, Math.sin(t) * paso)]);
  }
  const b = cajaDe(objs.flatMap((o) => esquinas(o)));
  const dx = r3(b.maxX - b.minX + 0.5);
  insertar(objs.map((o) => copiaDe(o, dx, 0)));
}

function girar(grados) {
  const objs = selObjs().filter((o) => !o.fijo);
  if (!objs.length) return selObjs().length ? aviso('Está marcado como fijo. Destrabalo con el candado para poder girarlo.', 'error') : null;
  antesDeCambiar();
  // Varios objetos giran juntos alrededor del centro del grupo, para no desarmar lo que ya está armado
  // (un parlante sobre su sub, una fila de mesas).
  const b = objs.length > 1 ? cajaDe(objs.flatMap((o) => esquinas(o))) : null;
  const cx = b ? (b.minX + b.maxX) / 2 : 0;
  const cy = b ? (b.minY + b.maxY) / 2 : 0;
  const t = (grados * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  for (const o of objs) {
    o.rot = r3((((o.rot || 0) + grados) % 360 + 360) % 360);
    if (b) {
      const dx = o.pos[0] - cx;
      const dy = o.pos[1] - cy;
      o.pos = [r3(cx + dx * c - dy * s), r3(cy + dx * s + dy * c)];
    }
    moverObjeto3D(o);
  }
  if (estado.noche) construirLuces();
  actualizarSeleccion3D();
  refrescarCampos();
  marcarCambio();
}

function desplazar(dx, dy) {
  const objs = selObjs().filter((o) => !o.fijo);
  if (!objs.length) return;
  antesDeCambiar();
  for (const o of objs) {
    o.pos = [r3(o.pos[0] + dx), r3(o.pos[1] + dy)];
    moverObjeto3D(o);
  }
  if (estado.noche) construirLuces();
  actualizarSeleccion3D();
  refrescarCampos();
  marcarCambio();
}

function alinear(modo) {
  const objs = selObjs().filter((o) => !o.fijo);
  if (objs.length < 2) return;
  const cajas = objs.map((o) => ({ o, c: cajaDe(esquinas(o)) }));
  const total = cajaDe(objs.flatMap((o) => esquinas(o)));
  antesDeCambiar();
  for (const { o, c } of cajas) {
    let dx = 0;
    let dy = 0;
    if (modo === 'izq') dx = total.minX - c.minX;
    if (modo === 'der') dx = total.maxX - c.maxX;
    if (modo === 'centroH') dx = (total.minX + total.maxX) / 2 - (c.minX + c.maxX) / 2;
    if (modo === 'arriba') dy = total.minY - c.minY;
    if (modo === 'abajo') dy = total.maxY - c.maxY;
    if (modo === 'centroV') dy = (total.minY + total.maxY) / 2 - (c.minY + c.maxY) / 2;
    o.pos = [r3(o.pos[0] + dx), r3(o.pos[1] + dy)];
    moverObjeto3D(o);
  }
  if (estado.noche) construirLuces();
  actualizarSeleccion3D();
  marcarCambio();
}

function distribuir(eje) {
  const objs = selObjs().filter((o) => !o.fijo);
  if (objs.length < 3) return aviso('Para distribuir hacen falta tres objetos o más.', 'error');
  const i = eje === 'h' ? 0 : 1;
  const orden = [...objs].sort((a, b) => a.pos[i] - b.pos[i]);
  const ini = orden[0].pos[i];
  const paso = (orden[orden.length - 1].pos[i] - ini) / (orden.length - 1);
  antesDeCambiar();
  orden.forEach((o, k) => {
    o.pos[i] = r3(ini + paso * k);
    moverObjeto3D(o);
  });
  if (estado.noche) construirLuces();
  actualizarSeleccion3D();
  marcarCambio();
}

// Más copias de una vez traba el navegador varios segundos.
const MAX_COPIAS = 2000;

function repetir({ columnas, sepX, filas, sepY }) {
  const objs = selObjs();
  if (!objs.length) return;
  const uno = objs.length === 1 ? objs[0] : null;
  const t = uno ? ((uno.rot || 0) * Math.PI) / 180 : 0;
  // Con un objeto se repite sobre sus propios ejes (a lo ancho y hacia atrás); con varios, sobre X e Y.
  const ex = [Math.cos(t), Math.sin(t)];
  const ey = [-Math.sin(t), Math.cos(t)];
  const total = (filas * columnas - 1) * objs.length;
  if (total > MAX_COPIAS) {
    aviso(`Serían ${total} copias. El máximo de una vez es ${MAX_COPIAS}: bajá filas o columnas.`, 'error');
    return;
  }
  const copias = [];
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      if (!f && !c) continue;
      const dx = ex[0] * sepX * c + ey[0] * sepY * f;
      const dy = ex[1] * sepX * c + ey[1] * sepY * f;
      for (const o of objs) copias.push(copiaDe(o, dx, dy));
    }
  }
  if (!copias.length) return;
  insertar(copias);
  estado.sel = new Set([...objs.map((o) => o.id), ...copias.map((c) => c.id)]);
  trasCambioSeleccion();
  aviso(`${copias.length} copia${copias.length === 1 ? '' : 's'} nueva${copias.length === 1 ? '' : 's'}.`);
}

let portapapeles = null;
let pegadas = 0;
function copiar() {
  const objs = selObjs();
  if (!objs.length) return;
  portapapeles = structuredClone(objs);
  pegadas = 0;
  try {
    localStorage.setItem(CLAVE_PORTAPAPELES, JSON.stringify(portapapeles));
  } catch {}
  aviso(`${objs.length === 1 ? objs[0].nombre : `${objs.length} objetos`} copiado${objs.length === 1 ? '' : 's'}.`);
}

function pegar() {
  let lista = portapapeles;
  if (!lista) {
    try {
      lista = JSON.parse(localStorage.getItem(CLAVE_PORTAPAPELES));
    } catch {}
  }
  if (!Array.isArray(lista) || !estado.escena) return;
  // Lo copiado puede venir de otra pestaña o de una versión anterior: se valida como un archivo.
  lista = normalizarEscena({ objetos: structuredClone(lista) }).objetos;
  if (!lista.length) return;
  // En la misma escena, cada pegado se corre un metro más que el anterior para que no queden encimados.
  const mismo = lista.every((o) => objPorId(o.id));
  if (mismo) {
    pegadas++;
    return insertar(lista.map((o) => copiaDe(o, pegadas, pegadas)));
  }
  const b = cajaDe(lista.flatMap((o) => esquinas(o)));
  const [cx, cy] = centroDeVista();
  insertar(lista.map((o) => copiaDe(o, ajustar(cx - (b.minX + b.maxX) / 2), ajustar(cy - (b.minY + b.maxY) / 2))));
}

function seleccionarTodo() {
  ponerSeleccion(estado.escena.objetos.filter((o) => !o.fijo && !estado.ocultas.has(catDe(o)) && !estado.bloqueadas.has(catDe(o))).map((o) => o.id));
}

/* ================================================================== capacidad */

let temporizadorCapacidad = null;
function programarCapacidad() {
  clearTimeout(temporizadorCapacidad);
  temporizadorCapacidad = setTimeout(calcularCapacidad, 250);
}

function calcularCapacidad() {
  const e = estado.escena;
  if (!e) return;
  // Los vallados no se cuentan acá: su rectángulo no es lo que ocupan (son una línea).
  const obstaculos = e.objetos.filter((o) => !defDe(o).piso && !esLinea(o) && o.tipo !== 'persona' && (o.elev || 0) < 1 && o.dims[2] > 0.05).map(huella);
  const areas = e.areas
    .filter((a) => a.contorno.length >= 3)
    .map((a) => ({ id: a.id, nombre: a.nombre || a.id, total: Math.abs(areaFirmada(a.contorno)), libre: superficieLibre((x, y) => puntoEnPoligono(x, y, a.contorno), cajaDe(a.contorno), obstaculos).libre }));
  const zonas = e.objetos
    .filter((o) => o.tipo === 'zona')
    .map((z) => ({ id: z.id, nombre: z.nombre, total: superficieDe(z), libre: superficieLibre((x, y) => dentroDe(z, x, y), cajaDe(Array.isArray(z.puntos) ? puntosMundo(z) : esquinas(z)), obstaculos).libre }));
  estado.capacidad = { areas, zonas };
  const cont = $('#capacidad');
  if (cont) cont.innerHTML = htmlCapacidad();
  const zonaSel = $('#dato-zona');
  if (zonaSel) zonaSel.innerHTML = htmlDatoZona(selUnico());
}

const densidad = () => {
  const d = estado.escena?.densidad;
  const pos = (v, def) => (Number(v) > 0 ? Number(v) : def);
  return [pos(d?.[0], 2), pos(d?.[1], 3)];
};
const personas = (libre) => {
  const [a, b] = densidad();
  return `${Math.floor(libre * a)} a ${Math.floor(libre * b)}`;
};

function htmlCapacidad() {
  const { areas, zonas } = estado.capacidad;
  if (!areas.length && !zonas.length) return '<p class="vacio-panel">Todavía no hay ambientes cargados.</p>';
  const fila = (x) => `
    <div class="cap-fila">
      <div class="cap-nombre">${esc(x.nombre)}</div>
      <div class="cap-personas">${personas(x.libre)} <span>personas</span></div>
      <div class="cap-sup">${fm(x.total, 1)} m² en total, ${fm(x.libre, 1)} m² libres</div>
    </div>`;
  return zonas.map(fila).join('') + areas.map(fila).join('');
}

function htmlDatoZona(o) {
  if (!o || o.tipo !== 'zona') return '';
  const z = estado.capacidad.zonas.find((x) => x.id === o.id);
  return z ? `Entran ${personas(z.libre)} personas (${fm(z.libre, 1)} m² libres).` : '';
}

/* ================================================================== panel izquierdo: capas y biblioteca */

let filtroCapas = '';
let filtroBiblioteca = '';

function renderLista() {
  const cont = $('#lista');
  const e = estado.escena;
  if (!e) {
    cont.innerHTML = '';
    return;
  }
  const filtro = filtroCapas.trim().toLowerCase();
  const capasHtml = htmlCapasPropias();
  const objs = e.objetos.filter((o) => !filtro || o.nombre.toLowerCase().includes(filtro) || (TIPOS[o.tipo]?.nombre || '').toLowerCase().includes(filtro));
  const porCat = new Map();
  for (const o of objs) {
    const c = catDe(o);
    if (!porCat.has(c)) porCat.set(c, []);
    porCat.get(c).push(o);
  }
  let html = '';
  if (!e.objetos.length) html += `<p class="vacio-panel">Todavía no hay objetos. Arrastralos desde <button class="enlace" data-ir="biblioteca">la biblioteca</button>.</p>`;
  else if (!objs.length) html += `<p class="vacio-panel">Nada coincide con “${esc(filtroCapas)}”.</p>`;
  html += CATEGORIAS.filter(([c]) => porCat.has(c))
    .map(([c, nombre]) => {
      const oculta = estado.ocultas.has(c);
      const bloqueada = estado.bloqueadas.has(c);
      return `<section class="grupo-cat${oculta ? ' oculta' : ''}">
        <header>
          <span class="cat-nombre">${nombre}</span>
          <span class="cuenta">${porCat.get(c).length}</span>
          <button class="mini" data-bloquear="${c}" aria-pressed="${bloqueada}" title="${bloqueada ? 'Desbloquear' : 'Bloquear'}: no se pueden elegir en la vista">${icono(bloqueada ? 'candado' : 'abierto')}</button>
          <button class="mini" data-ojo="${c}" aria-pressed="${!oculta}" title="${oculta ? 'Mostrar' : 'Ocultar'} en la vista">${icono(oculta ? 'ojoNo' : 'ojo')}</button>
        </header>
        <ul>${porCat
          .get(c)
          .map(
            (o) =>
              `<li><button class="item" data-id="${esc(o.id)}"${estado.sel.has(o.id) ? ' aria-current="true"' : ''}>${icono(o.tipo)}<span class="item-nombre">${esc(o.nombre)}</span>${o.estimado ? `<span class="marca-estimado" title="Medida estimada">≈</span>` : ''}${o.grupo ? icono('grupo', 'fijo') : ''}${capaDe(o) ? `<span class="punto-capa" style="background:${esc(capaDe(o).color)}" title="Capa ${esc(capaDe(o).nombre)}"></span>` : ''}${o.fijo ? icono('candado', 'fijo') : ''}</button></li>`
          )
          .join('')}</ul>
      </section>`;
    })
    .join('');
  if (e.cotas.length) {
    html += `<section class="grupo-cat"><header><span class="cat-nombre">Cotas</span><span class="cuenta">${e.cotas.length}</span></header><ul>${e.cotas
      .map((c) => {
        const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
        return `<li><button class="item" data-cota-item="${esc(c.id)}"${estado.selCota === c.id ? ' aria-current="true"' : ''}>${icono('cota')}<span class="item-nombre">${fm(L)} m</span></button></li>`;
      })
      .join('')}</ul></section>`;
  }
  if (e.areas.length) {
    html += `<section class="grupo-cat"><header><span class="cat-nombre">Ambientes</span><span class="cuenta">${e.areas.length}</span></header><ul>${e.areas
      .map((a) => `<li><div class="item item-fijo">${icono('planta')}<span class="item-nombre">${esc(a.nombre || a.id)}</span><span class="item-dato">${fm(Math.abs(areaFirmada(a.contorno)), 0)} m²</span></div></li>`)
      .join('')}</ul></section>`;
  }
  cont.innerHTML = capasHtml + html;
}

function renderBiblioteca() {
  const filtro = filtroBiblioteca.trim().toLowerCase();
  const html = CATEGORIAS.map(([c, nombre]) => {
    const tipos = Object.entries(TIPOS).filter(([t, d]) => d.cat === c && (!filtro || d.nombre.toLowerCase().includes(filtro) || t.includes(filtro)));
    if (!tipos.length) return '';
    return `<section class="grupo-agregar"><h3>${nombre}</h3><div class="rejilla">${tipos
      .map(
        ([t, d]) =>
          `<button class="tarjeta-tipo" data-tipo="${t}" draggable="true" title="Clic para agregar al centro, o arrastrá hasta la vista">${icono(t)}<span>${d.nombre}</span><small>${
            d.piso ? `${fm(d.dims[0], 1)} × ${fm(d.dims[1], 1)} m` : `${fm(d.dims[0])} × ${fm(d.dims[1])} × ${fm(d.dims[2])}`
          }</small></button>`
      )
      .join('')}</div></section>`;
  }).join('');
  const coincide = (t) => !filtro || String(t || '').toLowerCase().includes(filtro);
  const equipos = catalogo.filter((c) => coincide(c.nombre) || coincide(c.ref) || coincide(TIPOS[c.tipo]?.nombre));
  const misBloques = bloques.filter((b) => coincide(b.nombre));
  const propios =
    (equipos.length
      ? `<section class="grupo-agregar"><h3>Mis equipos</h3><div class="rejilla">${equipos
          .map(
            (c) =>
              `<div class="tarjeta-propia"><button class="tarjeta-tipo" data-catalogo="${esc(c.id)}" draggable="true" title="${esc([c.ref, c.proveedor].filter(Boolean).join(' · ') || 'Clic para agregar')}">${icono(c.tipo)}<span>${esc(c.nombre)}</span><small>${c.potencia ? `${c.potencia} W` : ''}${c.costo ? ` · $ ${fm(c.costo, 0)}` : ''}</small></button><button class="mini borrar-propio" data-borrar-catalogo="${esc(c.id)}" title="Sacar del catálogo">${icono('cerrar')}</button></div>`
          )
          .join('')}</div></section>`
      : '') +
    (misBloques.length
      ? `<section class="grupo-agregar"><h3>Mis bloques</h3><div class="rejilla">${misBloques
          .map(
            (b) =>
              `<div class="tarjeta-propia"><button class="tarjeta-tipo" data-bloque="${esc(b.id)}" draggable="true" title="Clic para agregar al centro, o arrastrá hasta la vista">${icono('grupo')}<span>${esc(b.nombre)}</span><small>${b.objetos.length} objetos${b.ancho ? ` · ${fm(b.ancho, 1)} × ${fm(b.fondo, 1)} m` : ''}</small></button><button class="mini borrar-propio" data-borrar-bloque="${esc(b.id)}" title="Borrar el bloque">${icono('cerrar')}</button></div>`
          )
          .join('')}</div></section>`
      : '');
  $('#catalogo').innerHTML = propios + html || `<p class="vacio-panel">No hay objetos que coincidan con “${esc(filtroBiblioteca)}”.</p>`;
}

function mostrarPestana(cual) {
  for (const b of $$('[data-pestana]')) b.setAttribute('aria-selected', String(b.dataset.pestana === cual));
  $('#capas').hidden = cual !== 'capas';
  $('#biblioteca').hidden = cual !== 'biblioteca';
}

/* ================================================================== inspector */

const hex = (c) => '#' + new THREE.Color(c).getHexString();

function campoNum(atrib, clave, texto, valor, unidad = 'm', dec = 2) {
  const v = valor === null ? '' : fm(valor, dec);
  return `<label class="campo"><span>${texto}</span><span class="entrada" data-unidad="${unidad}"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" ${atrib}="${clave}" data-dec="${dec}" value="${v}"${valor === null ? ' placeholder="varios"' : ''}></span></label>`;
}
const campoObj = (clave, texto, valor, unidad, dec) => campoNum('data-campo', clave, texto, valor, unidad, dec);

function seccion(titulo, cuerpo, { abierta = true } = {}) {
  return `<details class="seccion"${abierta ? ' open' : ''}><summary>${titulo}</summary><div class="seccion-cuerpo">${cuerpo}</div></details>`;
}

const USOS_ZONA = {
  general: 'General',
  pista: 'Pista',
  barra: 'Barra',
  fumadores: 'Fumadores',
  backstage: 'Backstage',
  vip: 'VIP',
  descarga: 'Carga y descarga',
  staff: 'Staff',
};

const opcionesSelect = (lista, valor) => Object.entries(lista).map(([k, t]) => `<option value="${esc(k)}"${k === valor ? ' selected' : ''}>${esc(t)}</option>`).join('');
const selectObj = (clave, texto, lista, valor) => `<label class="campo"><span>${texto}</span><select data-campo="${clave}">${opcionesSelect(lista, valor)}</select></label>`;
const textoObj = (clave, texto, valor, ph = '') => `<label class="campo"><span>${texto}</span><input type="text" data-campo="${clave}" value="${esc(valor || '')}" placeholder="${esc(ph)}"></label>`;
const checkObj = (clave, texto, marcado) => `<label class="check"><input type="checkbox" data-campo="${clave}"${marcado ? ' checked' : ''}> ${texto}</label>`;

// Dato que acompaña a las formas del predio (se actualiza mientras se editan los campos).
function datoForma(o) {
  if (o.tipo === 'estacionamiento') {
    const p = plazasEstacionamiento(o);
    return `Entran <strong>${p.cantidad}</strong> ${o.vehiculo === 'moto' ? 'motos' : o.vehiculo === 'combi' ? 'combis' : 'autos'}${p.accesibles ? ` (${p.accesibles} accesibles)` : ''} en ${fm(superficieDe(o), 0)} m².`;
  }
  if (o.tipo === 'camino') return `${fm(largoDe(o), 1)} m de largo: ${textoTiempo(largoDe(o))}.`;
  if (o.tipo === 'vallado') return `${modulosVallado(o)} paños de ${fm(moduloVallado(o), 1)} m (${fm(largoDe(o), 1)} m en total).`;
  if (o.tipo === 'zona') return `${fm(superficieDe(o), 1)} m².`;
  if (o.tipo === 'acceso') return `Paso libre de ${fm(o.dims[0], 2)} m.`;
  return '';
}

function htmlPropiedades(o) {
  const def = defDe(o);
  const plano = def.piso;
  const [w, , h] = o.dims;
  const especificos = [];
  // Datos y ayudas a lo ancho del panel (los campos van en dos columnas).
  const notasForma = [];
  const forma = def.forma;
  if (forma) {
    notasForma.push(`<p class="dato" id="dato-forma">${datoForma(o)}</p>`);
    if (Array.isArray(o.puntos)) {
      notasForma.push(`<p class="ayuda">Forma de ${o.puntos.length} puntos. En la vista, arrastrá los puntos blancos; los azules (en el medio de cada lado) agregan uno; clic derecho sobre un punto lo borra.</p>`);
    } else if (forma === 'poligono') {
      notasForma.push(`<div class="fila-botones"><button data-accion="a-poligono">${icono('poligono')} Editar su forma punto por punto</button></div>`);
    }
  } else if (o.tipo === 'acceso') notasForma.push(`<p class="dato" id="dato-forma">${datoForma(o)}</p>`);
  if (o.tipo === 'zona') especificos.push(selectObj('uso', 'Uso', USOS_ZONA, o.uso || 'general'));
  if (o.tipo === 'estacionamiento') {
    const c = medidasCochera(o);
    especificos.push(selectObj('vehiculo', 'Para', Object.fromEntries(Object.entries(VEHICULOS).map(([k, v]) => [k, v.nombre])), o.vehiculo || 'auto'));
    especificos.push(campoObj('cocheraAncho', 'Ancho de cochera', c.ancho), campoObj('cocheraFondo', 'Largo de cochera', c.fondo), campoObj('calle', 'Ancho de calle', c.calle));
    especificos.push(campoObj('angulo', 'Giro de las filas', o.angulo || 0, '°', 0), campoObj('accesibles', 'Accesibles', o.accesibles || 0, 'u', 0));
  }
  if (o.tipo === 'camino') {
    especificos.push(selectObj('uso', 'Uso', Object.fromEntries(Object.entries(USOS_CAMINO).map(([k, v]) => [k, v.nombre])), o.uso || 'publico'));
    especificos.push(campoObj('ancho', 'Ancho', Number(o.ancho) || 3));
  }
  if (o.tipo === 'vallado') especificos.push(campoObj('modulo', 'Largo de cada paño', moduloVallado(o)));
  if (o.tipo === 'acceso') especificos.push(checkObj('salida', 'Sirve como salida de emergencia', o.salida !== false));
  if (o.tipo === 'puesto') {
    especificos.push(selectObj('rol', 'Rol', Object.fromEntries(Object.entries(ROLES_STAFF).map(([k, v]) => [k, v.nombre])), o.rol || 'seguridad'));
    especificos.push(campoObj('personas', 'Personas', o.personas || 1, 'pers.', 0), textoObj('turno', 'Turno', o.turno, '22:00 a 06:00'));
  }
  if (o.tipo === 'senal') {
    especificos.push(textoObj('texto', 'Texto del cartel', o.texto, 'Salida, Baños, Barra…'), textoObj('formato', 'Tamaño de impresión', o.formato, 'A3, 90 × 60 cm'));
    especificos.push(selectObj('flecha', 'Flecha', { ninguna: 'Sin flecha', adelante: 'Adelante', izquierda: 'Izquierda', derecha: 'Derecha', atras: 'Atrás' }, o.flecha || 'ninguna'));
  }
  if (o.tipo === 'texto') especificos.push(textoObj('texto', 'Texto', o.texto, 'Lo que querés que diga'), campoObj('tamano', 'Alto de letra', Number(o.tamano) || 0.6));
  // Energía: a qué tablero va cada equipo, qué alimenta a cada tablero, y fases del generador.
  const fuentes = estado.escena.objetos.filter((x) => esFuente(x) && x.id !== o.id);
  const listaFuentes = Object.fromEntries(fuentes.map((x) => [x.id, x.nombre]));
  if (o.tipo === 'generador' || o.tipo === 'tablero') especificos.push(campoObj('capacidad', 'Potencia que aguanta', Number(o.capacidad) || def.capacidad || 0, 'W', 0));
  if (o.tipo === 'generador') {
    especificos.push(selectObj('fases', 'Fases', { 1: 'Monofásico', 3: 'Trifásico' }, String(o.fases || 1)), selectObj('tension', 'Tensión', { 220: '220 V', 380: '380 V' }, String(o.tension || (Number(o.fases) === 3 ? 380 : 220))));
  }
  if (o.tipo === 'tablero') especificos.push(selectObj('alimenta', 'Toma energía de', { '': 'Sin conectar', ...listaFuentes }, o.alimenta || ''));
  if (!esFuente(o) && (Number(o.potencia) > 0 || def.potencia > 0)) especificos.push(selectObj('tablero', 'Se conecta a', { '': 'Sin conectar', ...listaFuentes }, o.tablero || ''));
  if (COLGABLES.has(o.tipo) && (o.elev || 0) > 0.5) {
    const trusses = Object.fromEntries(estado.escena.objetos.filter((x) => x.tipo === 'truss' && x.id !== o.id).map((x) => [x.id, x.nombre]));
    especificos.push(selectObj('colgadoDe', 'Cuelga de', { '': 'Automático (por posición)', false: 'No cuelga de nada', ...trusses }, o.colgadoDe === false ? 'false' : o.colgadoDe || ''));
  }
  if (o.tipo === 'truss') especificos.push(campoObj('capacidad', 'Carga que aguanta', Number(o.capacidad) || null, 'kg', 0).replace('placeholder="varios"', 'placeholder="Sin cargar"'));
  if (o.tipo === 'parlante' || o.tipo === 'sub') {
    especificos.push(campoObj('spl', 'Presión máxima', Number(o.spl) || def.spl, 'dB', 0), campoObj('dispersion', 'Apertura', Number(o.dispersion) || def.dispersion, '°', 0));
    especificos.push(campoObj('ganancia', 'Ajuste propio', Number(o.ganancia) || 0, 'dB', 0));
    if (o.tipo === 'sub') especificos.push(checkObj('cardioide', 'Cardioide (tira poco hacia atrás)', o.cardioide === true));
  }
  if (o.tipo === 'medicion') especificos.push(campoObj('limite', 'Límite permitido', Number(o.limite) || 65, 'dB', 0));
  if (o.tipo === 'arbol') especificos.push(campoObj('tronco', 'Diámetro del tronco', troncoDe(o)));
  if (o.tipo === 'casita') {
    especificos.push(campoObj('postes', 'Alto de los postes', (Number(o.alero) || 0) * h));
    especificos.push(`<label class="check"><input type="checkbox" data-campo="techo"${o.techo !== false ? ' checked' : ''}> Con techo</label>`);
  }
  if (def.emite === true) especificos.push(campoObj('apertura', 'Apertura del haz', o.apertura || 11, '°', 0));
  if (o.tipo === 'columna') {
    especificos.push(`<label class="campo"><span>Forma</span><select data-campo="forma"><option value="">Cuadrada</option><option value="redonda"${o.forma === 'redonda' ? ' selected' : ''}>Redonda</option></select></label>`);
  }
  return `
    <div class="det-cabeza">
      <span class="det-icono">${icono(o.tipo)}</span>
      <input class="titulo-campo" data-campo="nombre" value="${esc(o.nombre)}" aria-label="Nombre del objeto">
      <button class="mini${o.fijo ? ' activo' : ''}" data-accion="fijar" aria-pressed="${Boolean(o.fijo)}" title="${o.fijo ? 'Fijo: no se mueve ni se borra' : 'Fijar en su lugar'}">${icono(o.fijo ? 'candado' : 'abierto')}</button>
    </div>
    <label class="campo"><span>Tipo</span><select data-campo="tipo">${
      TIPOS[o.tipo] ? '' : `<option value="${esc(o.tipo)}" selected>${esc(o.tipo)} (no está en la biblioteca)</option>`
    }${Object.entries(TIPOS)
      .map(([t, d]) => `<option value="${t}"${t === o.tipo ? ' selected' : ''}>${d.nombre}</option>`)
      .join('')}</select></label>
    ${seccion(
      'Posición',
      `<div class="campos">
        ${campoObj('x', 'X', o.pos[0])}
        ${campoObj('y', 'Y', o.pos[1])}
        ${plano ? '' : campoObj('elev', 'Altura de la base', o.elev || 0)}
        ${campoObj('rot', 'Giro', o.rot || 0, '°', 0)}
      </div>
      <div class="fila-botones compacta">
        <button data-girar="-90" title="Girar −90°">${icono('girarIzq')} −90°</button>
        <button data-girar="90" title="Girar +90°">${icono('girarDer')} +90°</button>
      </div>`
    )}
    ${seccion(
      'Medidas',
      `<div class="campos tres">
        ${campoObj('w', 'Ancho', w)}
        ${campoObj('p', 'Fondo', o.dims[1])}
        ${plano ? '' : campoObj('h', 'Alto', h)}
      </div>
      <p class="dato" id="dato-ocupa">${o.tipo === 'zona' || forma ? '' : `Ocupa ${fm(o.dims[0] * o.dims[1])} m² de piso.`}</p>
      ${o.tipo === 'zona' ? `<p class="dato" id="dato-zona">${htmlDatoZona(o)}</p>` : ''}
      ${notasForma.join('')}
      ${especificos.length ? `<div class="campos">${especificos.join('')}</div>` : ''}
      ${estado.escena.terreno?.puntos?.length >= 3 && !(o.elev > 0.05) ? `<p class="dato">${esc(textoDesnivel(o, estado.escena.terreno))}</p>` : ''}
      ${checkObj('estimado', 'Medida estimada (falta confirmarla en el lugar)', o.estimado === true)}`
    )}
    ${seccion(
      'Cómputo y ficha técnica',
      `<label class="check"><input type="checkbox" data-campo="computo"${incluido(o) ? ' checked' : ''}> Contar en el listado de materiales</label>
      <label class="campo"><span>Modelo o referencia</span><input type="text" data-campo="ref" value="${esc(o.ref || '')}" placeholder="Ej.: Pioneer CDJ-3000, módulo 2 × 1 m"></label>
      <label class="campo"><span>Proveedor</span><input type="text" data-campo="proveedor" value="${esc(o.proveedor || '')}" placeholder="Quién lo trae" list="lista-proveedores"></label>
      <div class="campos">
        ${campoObj('potencia', 'Consumo', o.potencia ?? null, 'W', 0).replace('placeholder="varios"', `placeholder="${def.potencia ? `${def.potencia} típico` : '0'}"`)}
        ${campoObj('peso', o.tipo === 'truss' ? 'Peso por metro' : 'Peso', o.peso ?? null, o.tipo === 'truss' ? 'kg/m' : 'kg', 1).replace('placeholder="varios"', `placeholder="${def.peso ? `${def.peso} típico` : '—'}"`)}
        ${campoObj('costo', 'Costo por unidad', o.costo ?? null, '$', 0).replace('placeholder="varios"', 'placeholder="Sin precio"')}
        ${selectObj('costoTipo', 'Es', { alquiler: 'Alquiler', compra: 'Compra' }, o.costoTipo || 'alquiler')}
      </div>
      ${checkObj('propio', 'Es nuestro (no se paga)', o.propio === true)}
      ${selectObj('mapa', 'En el mapa para el público', { '': def.publico ? 'Sí (automático)' : 'No (automático)', si: 'Mostrar', no: 'No mostrar' }, o.mapa === true ? 'si' : o.mapa === false ? 'no' : '')}
      ${selectObj('capa', 'Capa', { '': 'Sin capa', ...Object.fromEntries((estado.escena.capas || []).map((c) => [c.id, c.nombre])), __nueva: 'Nueva capa…' }, o.capa || '')}
      <div class="fila-botones"><button data-accion="a-catalogo" title="Para usarlo en cualquier escena desde la biblioteca">${icono('mas')} Guardar en mi catálogo</button></div>
      ${o.grupo ? `<p class="dato">${icono('grupo')} Es parte de un grupo de ${idsDelGrupo(o.id).length} objetos. <button class="enlace" data-accion="desagrupar">Separar</button></p>` : ''}`
    )}
    ${seccion(
      'Aspecto',
      `<div class="campos">
        <label class="campo"><span>Color</span><input type="color" data-campo="color" value="${hex(o.color || def.color)}"></label>
        ${def.luz ? `<label class="campo"><span>${def.emite === 'punto' ? 'Color de la luz' : def.emite ? 'Color del haz' : 'Color de imagen'}</span><input type="color" data-campo="luz" value="${hex(o.luz || def.luz)}"></label>` : ''}
      </div>`
    )}
    ${seccion('Notas', `<textarea data-campo="nota" rows="3" placeholder="Ej.: lo trae el proveedor de sonido">${esc(o.nota || '')}</textarea>`, { abierta: Boolean(o.nota) })}
    <div class="acciones-det">
      <button data-accion="duplicar" title="Ctrl+D">${icono('duplicar')} Duplicar</button>
      <button data-accion="repetir" title="Repetir en filas y columnas">${icono('repetir')} Repetir</button>
      <button data-accion="centrar" title="F">${icono('centrar')} Ver</button>
      <button data-accion="eliminar" class="peligro" title="Eliminar (Supr)" aria-label="Eliminar">${icono('basura')}</button>
    </div>`;
}

function valorComun(objs, f) {
  const v = f(objs[0]);
  return objs.every((o) => f(o) === v) ? v : null;
}

function htmlMulti(objs) {
  const tipos = [...new Set(objs.map((o) => o.tipo))];
  return `
    <div class="det-cabeza">
      <span class="det-icono">${icono('repetir')}</span>
      <div class="titulo-fijo">${objs.length} objetos</div>
    </div>
    <p class="dato">${tipos.length === 1 ? TIPOS[tipos[0]]?.nombre || tipos[0] : `${tipos.length} tipos distintos`}${objs.some((o) => o.fijo) ? '. Los fijos no se mueven.' : '.'}</p>
    <div class="fila-botones">
      ${new Set(objs.map((o) => o.grupo)).size === 1 && objs[0].grupo ? `<button data-accion="desagrupar" title="Ctrl+Shift+G">${icono('grupo')} Separar grupo</button>` : `<button data-accion="agrupar" title="Ctrl+G">${icono('grupo')} Agrupar</button>`}
      <button data-accion="a-bloque" title="Para soltarlo entero en cualquier escena">${icono('mas')} Guardar como bloque</button>
    </div>
    <label class="campo"><span>Capa</span><select data-multi="capa">${opcionesSelect({ '': valorComun(objs, (o) => o.capa || '') === null ? 'Varias' : 'Sin capa', ...Object.fromEntries((estado.escena.capas || []).map((c) => [c.id, c.nombre])), __nueva: 'Nueva capa…' }, valorComun(objs, (o) => o.capa || '') || '')}</select></label>
    ${seccion(
      'Alinear y distribuir',
      `<div class="fila-iconos">
        <button class="mini" data-alinear="izq" title="Alinear a la izquierda">${icono('alinIzq')}</button>
        <button class="mini" data-alinear="centroH" title="Centrar en horizontal">${icono('alinCentroH')}</button>
        <button class="mini" data-alinear="der" title="Alinear a la derecha">${icono('alinDer')}</button>
        <span class="sep"></span>
        <button class="mini" data-alinear="arriba" title="Alinear arriba">${icono('alinArriba')}</button>
        <button class="mini" data-alinear="centroV" title="Centrar en vertical">${icono('alinCentroV')}</button>
        <button class="mini" data-alinear="abajo" title="Alinear abajo">${icono('alinAbajo')}</button>
        <span class="sep"></span>
        <button class="mini" data-distribuir="h" title="Repartir parejo a lo ancho">${icono('distH')}</button>
        <button class="mini" data-distribuir="v" title="Repartir parejo a lo largo">${icono('distV')}</button>
      </div>`
    )}
    ${seccion(
      'Cambiar a todos',
      `<div class="campos">
        ${campoNum('data-multi', 'elev', 'Altura de la base', valorComun(objs, (o) => o.elev || 0))}
        ${campoNum('data-multi', 'rot', 'Giro', valorComun(objs, (o) => o.rot || 0), '°', 0)}
        <label class="campo"><span>Color</span><input type="color" data-multi="color" value="${hex(objs[0].color || defDe(objs[0]).color)}"></label>
        <label class="campo"><span>Proveedor</span><input type="text" data-multi="proveedor" value="${esc(valorComun(objs, (o) => o.proveedor || '') ?? '')}" placeholder="varios"></label>
      </div>
      <div class="fila-botones compacta">
        <button data-girar="-90">${icono('girarIzq')} −90°</button>
        <button data-girar="90">${icono('girarDer')} +90°</button>
      </div>`
    )}
    <div class="acciones-det">
      <button data-accion="duplicar">${icono('duplicar')} Duplicar</button>
      <button data-accion="repetir">${icono('repetir')} Repetir</button>
      <button data-accion="centrar">${icono('centrar')} Ver</button>
      <button data-accion="eliminar" class="peligro" aria-label="Eliminar">${icono('basura')}</button>
    </div>
    <ul class="lista-sel">${objs.map((o) => `<li><button class="item" data-id="${esc(o.id)}">${icono(o.tipo)}<span class="item-nombre">${esc(o.nombre)}</span></button></li>`).join('')}</ul>`;
}

function htmlCota(c) {
  const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
  return `
    <div class="det-cabeza">
      <span class="det-icono">${icono('cota')}</span>
      <div class="titulo-fijo">Cota de ${fm(L)} m</div>
    </div>
    ${seccion(
      'Puntos',
      `<div class="campos">
        ${campoNum('data-cota', 'ax', 'Desde X', c.a[0])}
        ${campoNum('data-cota', 'ay', 'Desde Y', c.a[1])}
        ${campoNum('data-cota', 'bx', 'Hasta X', c.b[0])}
        ${campoNum('data-cota', 'by', 'Hasta Y', c.b[1])}
      </div>
      ${campoNum('data-cota', 'desplazo', 'Separación en el plano', c.desplazo || 0)}
      <p class="dato">La separación corre la línea de cota hacia un costado en el plano impreso.</p>`
    )}
    <div class="acciones-det"><button data-accion="eliminar" class="peligro">${icono('basura')} Borrar cota</button></div>`;
}

function htmlProyecto() {
  const e = estado.escena;
  const pr = e.proyecto || {};
  const [d1, d2] = densidad();
  const c = computarTodo(e);
  const campoTexto = (clave, texto, valor, ph = '') => `<label class="campo"><span>${texto}</span><input type="text" data-escena="${clave}" value="${esc(valor || '')}" placeholder="${ph}"></label>`;
  const cabeza = `
    <div class="det-cabeza">
      <span class="det-icono">${icono('hoja')}</span>
      <input class="titulo-campo" data-escena="nombre" value="${esc(e.nombre)}" aria-label="Nombre de la escena">
    </div>
    <div class="pestanas pestanas-panel" role="tablist">
      ${[
        ['proyecto', 'Proyecto'],
        ['seguridad', 'Seguridad'],
        ['tecnica', 'Técnica'],
      ]
        .map(([k, t]) => `<button role="tab" data-pestana-detalle="${k}" aria-selected="${estado.pestanaDetalle === k}">${t}</button>`)
        .join('')}
    </div>`;
  if (estado.pestanaDetalle === 'seguridad') return cabeza + htmlPestanaSeguridad();
  if (estado.pestanaDetalle === 'tecnica') return cabeza + htmlPestanaTecnica();
  const pendientes = medidasPendientes();
  return `${cabeza}
    ${seccion(
      'Datos del proyecto',
      `${campoTexto('proyecto.evento', 'Evento', pr.evento, 'Ej.: Open Air 12.12.25')}
      <div class="campos">
        ${campoTexto('proyecto.fecha', 'Fecha', pr.fecha, 'dd/mm/aa')}
        ${campoTexto('proyecto.responsable', 'Responsable', pr.responsable, 'Quién arma')}
      </div>
      ${campoTexto('proyecto.lugar', 'Lugar', pr.lugar, 'Dirección o nombre del lugar')}
      ${campoNum('data-escena', 'proyecto.aforo', 'Gente esperada (aforo)', pr.aforo ?? null, 'pers.', 0).replace('placeholder="varios"', 'placeholder="Sin cargar"')}
      <label class="campo"><span>Notas</span><textarea data-escena="notas" rows="3" placeholder="Qué falta medir, contacto del lugar…">${esc(e.notas || '')}</textarea></label>`
    )}
    ${htmlFondo()}
    ${htmlUbicacion()}
    ${seccion(
      `Medidas por confirmar${pendientes.length ? ` <span class="burbuja-seccion">${pendientes.length}</span>` : ''}`,
      pendientes.length
        ? `<p class="ayuda">Lo que todavía es estimado. Llevá esta lista a la próxima visita al lugar.</p><ul class="lista-sel">${pendientes
            .map((p) => `<li>${p.id ? `<button class="item" data-id="${esc(p.id)}">${icono(p.tipo)}<span class="item-nombre">${esc(p.nombre)}</span><span class="item-dato">${esc(p.dato)}</span></button>` : `<div class="item item-fijo">${icono('planta')}<span class="item-nombre">${esc(p.nombre)}</span><span class="item-dato">${esc(p.dato)}</span></div>`}</li>`)
            .join('')}</ul>`
        : '<p class="ayuda">No hay medidas marcadas como estimadas. En cada objeto podés tildar "Medida estimada" para que aparezca acá.</p>',
      { abierta: pendientes.length > 0 }
    )}
    ${seccion(
      'Capacidad estimada',
      `<div id="capacidad" class="capacidad">${htmlCapacidad()}</div>
      <div class="campos">
        ${campoNum('data-escena', 'd1', 'Cómodo', d1, 'p/m²')}
        ${campoNum('data-escena', 'd2', 'Lleno', d2, 'p/m²')}
      </div>
      <p class="ayuda">Cuenta el piso libre de objetos apoyados. Sirve para planificar; no reemplaza la habilitación del lugar.</p>`
    )}
    ${seccion('Historial y copia en la nube', `<div id="estado-historial"><p class="ayuda">Consultando…</p></div><div class="fila-botones"><button data-accion="versiones-abrir">${icono('reloj')} Versiones anteriores</button><button data-accion="historial-ahora">Guardar en el historial ahora</button></div>`, { abierta: false })}
    ${seccion(
      'Resumen',
      `<dl class="resumen">
        <dt>Objetos</dt><dd>${e.objetos.length}</dd>
        <dt>Ítems de materiales</dt><dd>${c.items.length}</dd>
        <dt>Unidades a llevar</dt><dd>${c.total}</dd>
        <dt>Cotas</dt><dd>${e.cotas.length}</dd>
      </dl>
      <button class="boton-ancho" data-ir-vista="materiales">${icono('lista')} Ver listado de materiales</button>`
    )}`;
}

// Medidas que faltan confirmar en el lugar: objetos y ambientes marcados como estimados, o con una nota
// que dice "estimado".
function medidasPendientes() {
  const e = estado.escena;
  const dice = (t) => /estimad/i.test(String(t || ''));
  const lista = e.objetos.filter((o) => o.estimado || dice(o.nota)).map((o) => ({ id: o.id, tipo: o.tipo, nombre: o.nombre, dato: `${fm(o.dims[0])} × ${fm(o.dims[1])}${o.dims[2] ? ` × ${fm(o.dims[2])}` : ''} m` }));
  for (const a of e.areas) if (a.estimado || dice(a.nota)) lista.push({ nombre: a.nombre || a.id, dato: `${fm(Math.abs(areaFirmada(a.contorno)), 0)} m²` });
  return lista;
}

// Revisiones del plano: cada una con su letra (A, B, C…), fecha y qué cambió. La última sale en el cuadro.
function htmlRevisiones() {
  const revs = estado.escena.revisiones || [];
  const lista = revs.length
    ? `<ol class="revisiones">${[...revs]
        .reverse()
        .map((r) => `<li><strong>${esc(r.rev)}</strong> <span class="tenue">${esc(r.fecha || '')}</span><br>${esc(r.nota || '')}</li>`)
        .join('')}</ol>`
    : '<p class="ayuda">Sin revisiones. Cuando mandes el plano al equipo, marcá una revisión: así todos saben si tienen el último.</p>';
  return `${lista}<div class="fila-botones"><button data-accion="nueva-revision">${icono('mas')} Nueva revisión</button></div>`;
}

const siguienteRevision = (revs) => {
  const ultima = revs.at(-1)?.rev || '';
  if (!ultima) return 'A';
  if (/^[A-Y]$/.test(ultima)) return String.fromCharCode(ultima.charCodeAt(0) + 1);
  return `${ultima}+`;
};

function htmlHojaOpciones() {
  const op = opcionesHoja(estado.escena);
  const auto = escalaAuto(estado.escena, op);
  const check = (clave, texto) => `<label class="check"><input type="checkbox" data-hoja="${clave}"${op[clave] ? ' checked' : ''}> ${texto}</label>`;
  return `
    <div class="det-cabeza"><span class="det-icono">${icono('hoja')}</span><div class="titulo-fijo">Plano para imprimir</div></div>
    ${seccion(
      'Hoja',
      `<div class="campos">
        <label class="campo"><span>Papel</span><select data-hoja="papel">${Object.keys(PAPELES).map((p) => `<option${p === op.papel ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
        <label class="campo"><span>Orientación</span><select data-hoja="orientacion"><option value="horizontal">Horizontal</option><option value="vertical"${op.orientacion === 'vertical' ? ' selected' : ''}>Vertical</option></select></label>
      </div>
      <label class="campo"><span>Escala</span><select data-hoja="escala"><option value="auto">Automática (1:${auto})</option>${ESCALAS.map((n) => `<option value="${n}"${String(op.escala) === String(n) ? ' selected' : ''}>1:${n}</option>`).join('')}</select></label>`
    )}
    ${seccion(
      'Qué se ve',
      `${check('grilla', 'Grilla')}
      ${check('cotas', 'Cotas de paredes y cotas fijas')}
      ${check('numeros', 'Números de referencia')}
      ${check('nombres', 'Nombre de cada objeto')}
      ${check('arboles', 'Árboles')}
      ${check('personas', 'Personas')}
      ${estado.escena.fondo ? check('fondo', 'Imagen de fondo') : ''}
      ${tieneGeo(estado.escena) ? check('norte', 'Flecha del norte') : ''}
      ${check('materiales', 'Hojas con el listado de materiales')}`
    )}
    ${seccion(
      'Hojas extra',
      generadoresHojas.length
        ? generadoresHojas.map((g) => `<label class="check"><input type="checkbox" data-hoja="${g.clave}"${estado.escena.hoja?.[g.clave] ?? g.porDefecto ? ' checked' : ''}> ${esc(g.nombre)}</label>`).join('') + '<p class="ayuda">Van entre la planta y el listado de materiales, en el mismo papel.</p>'
        : '<p class="ayuda">Todavía no hay hojas extra disponibles.</p>',
      { abierta: false }
    )}
    ${
      estado.escena.capas?.length
        ? seccion(
            'Capas en el plano',
            estado.escena.capas.map((c) => `<label class="check"><input type="checkbox" data-hoja-capa="${esc(c.id)}"${(estado.escena.hoja?.capasFuera || []).includes(c.id) ? '' : ' checked'}> <span class="punto-capa" style="background:${esc(c.color)}"></span> ${esc(c.nombre)}</label>`).join(''),
            { abierta: false }
          )
        : ''
    }
    ${seccion('Revisiones', htmlRevisiones(), { abierta: false })}
    <p class="ayuda">El evento, la fecha, el lugar y el responsable salen de los datos del proyecto: en la vista 3D, hacé clic en el vacío para verlos.</p>
    <div class="acciones-det apiladas">
      <button class="primario" data-exportar="pdf">${icono('pdf')} Descargar PDF</button>
      <button data-exportar="svg">${icono('descargar')} Descargar SVG</button>
    </div>`;
}

function htmlComputoOpciones() {
  const op = opcionesComputo(estado.escena);
  return `
    <div class="det-cabeza"><span class="det-icono">${icono('lista')}</span><div class="titulo-fijo">Listado de materiales</div></div>
    ${seccion(
      'Cómo se calcula',
      `<div class="campos">
        ${campoNum('data-computo', 'modA', 'Módulo de tarima: largo', op.modTarima[0])}
        ${campoNum('data-computo', 'modB', 'Módulo de tarima: ancho', op.modTarima[1])}
      </div>
      <label class="campo"><span>Tramos de truss disponibles</span><input type="text" data-computo="tramos" value="${op.tramosTruss.map((v) => fm(v, v % 1 ? 1 : 0)).join('; ')}" placeholder="3; 2; 1; 0,5"></label>
      <p class="ayuda">Se agrupa por tipo y medida, o por modelo si cargaste uno en el objeto. Para que algo no cuente, destildá “Contar en el listado” en ese objeto.</p>`
    )}
    <div class="acciones-det apiladas">
      <button class="primario" data-exportar="csv">${icono('tabla')} Descargar planilla (CSV)</button>
      <button data-exportar="pdf">${icono('pdf')} Plano y listado en PDF</button>
    </div>`;
}

function renderDetalle() {
  const der = $('#panel-der');
  if (!estado.escena) {
    der.innerHTML = '';
    return;
  }
  if (estado.vista === 'plano') der.innerHTML = htmlHojaOpciones();
  else if (estado.vista === 'materiales') der.innerHTML = htmlComputoOpciones();
  else if (estado.selCota && cotaPorId(estado.selCota)) der.innerHTML = htmlCota(cotaPorId(estado.selCota));
  else if (estado.sel.size === 1) der.innerHTML = htmlPropiedades(selUnico());
  else if (estado.sel.size > 1) der.innerHTML = htmlMulti(selObjs());
  else der.innerHTML = htmlProyecto();
  if ($('#estado-historial')) cargarEstadoHistorial();
}

function refrescarCampos() {
  const o = selUnico();
  if (!o) return;
  const valores = { x: o.pos[0], y: o.pos[1], elev: o.elev || 0, rot: o.rot || 0, w: o.dims[0], p: o.dims[1], h: o.dims[2], postes: (Number(o.alero) || 0) * o.dims[2] };
  for (const input of $$('#panel-der input[data-campo][inputmode=decimal]')) {
    const v = valores[input.dataset.campo];
    if (v !== undefined && input !== document.activeElement) input.value = fm(v, Number(input.dataset.dec ?? 2));
  }
  const ocupa = $('#dato-ocupa');
  if (ocupa && o.tipo !== 'zona' && !defDe(o).forma) ocupa.textContent = `Ocupa ${fm(o.dims[0] * o.dims[1])} m² de piso.`;
  const forma = $('#dato-forma');
  if (forma) forma.innerHTML = datoForma(o);
}

// Campos numéricos de los tipos nuevos: [mínimo, entero, qué hay que redibujar].
const CAMPOS_NUMERO = {
  ancho: [0.3, false, 'obj'],
  calle: [1, false, 'obj'],
  angulo: [-360, false, 'obj'],
  accesibles: [0, true, 'obj'],
  modulo: [0.3, false, 'obj'],
  tamano: [0.1, false, 'obj'],
  personas: [1, true, 'obj'],
  potencia: [0, true, 'nada'],
  peso: [0, false, 'nada'],
  costo: [0, false, 'nada'],
  capacidad: [0, true, 'nada'],
  spl: [60, false, 'nada'],
  dispersion: [10, false, 'nada'],
  ganancia: [-60, false, 'nada'],
  limite: [20, false, 'nada'],
};

function aplicarCampo(o, campo, el) {
  const n = () => leerNumero(el.value);
  if (CAMPOS_NUMERO[campo]) {
    const [minimo, entero, redibujo] = CAMPOS_NUMERO[campo];
    if (!el.value.trim()) {
      delete o[campo];
      return redibujo;
    }
    const v = n();
    if (v === null || v < minimo) return false;
    o[campo] = entero ? Math.round(v) : r3(v);
    return redibujo;
  }
  switch (campo) {
    case 'nombre':
      o.nombre = el.value;
      return 'lista';
    case 'tipo':
      o.tipo = el.value;
      delete o.color;
      // Una forma libre que pasa a ser otro tipo de superficie (zona ↔ estacionamiento) conserva sus puntos.
      if (Array.isArray(o.puntos) && !TIPOS[o.tipo]?.forma) delete o.puntos;
      if (TIPOS[o.tipo]?.forma === 'linea' && !Array.isArray(o.puntos)) o.puntos = [[-o.dims[0] / 2, 0], [o.dims[0] / 2, 0]];
      if (Array.isArray(o.puntos)) recentrar(o);
      return 'todo';
    case 'cocheraAncho':
    case 'cocheraFondo': {
      const v = n();
      if (v === null || v < 0.5) return false;
      const c = medidasCochera(o);
      o.cochera = campo === 'cocheraAncho' ? [r3(v), c.fondo] : [c.ancho, r3(v)];
      return 'obj';
    }
    case 'vehiculo':
      o.vehiculo = el.value;
      delete o.cochera;
      delete o.calle;
      return 'todo';
    case 'tablero':
    case 'alimenta':
      if (el.value) o[campo] = el.value;
      else delete o[campo];
      programarAnalisis();
      return 'nada';
    case 'colgadoDe':
      if (el.value === 'false') o.colgadoDe = false;
      else if (el.value) o.colgadoDe = el.value;
      else delete o.colgadoDe;
      return 'nada';
    case 'fases':
    case 'tension':
      o[campo] = Number(el.value);
      if (campo === 'fases') o.tension = o.fases === 3 ? 380 : 220;
      return 'todo';
    case 'uso':
    case 'rol':
    case 'flecha':
    case 'costoTipo':
      if (el.value) o[campo] = el.value;
      else delete o[campo];
      return campo === 'costoTipo' ? 'nada' : 'obj';
    case 'texto':
    case 'turno':
    case 'formato':
      if (el.value.trim()) o[campo] = el.value;
      else delete o[campo];
      return 'obj';
    case 'capa':
      if (el.value === '__nueva') {
        pedirTexto({ titulo: 'Nueva capa', etiqueta: 'Nombre de la capa', ayuda: 'Por ejemplo: Emergencia, Armado del sábado, Sonido.' }).then((nombre) => {
          const c = nombre && nuevaCapa(nombre);
          if (!c) return renderDetalle();
          antesDeCambiar();
          o.capa = c.id;
          marcarCambio({ lista: true, detalle: true });
        });
        return false;
      }
      if (el.value) o.capa = el.value;
      else delete o.capa;
      aplicarVisibilidad();
      return 'lista';
    case 'mapa':
      if (el.value === 'si') o.mapa = true;
      else if (el.value === 'no') o.mapa = false;
      else delete o.mapa;
      return 'nada';
    case 'salida':
      if (el.checked) delete o.salida;
      else o.salida = false;
      return 'obj';
    case 'cardioide':
      if (el.checked) o.cardioide = true;
      else delete o.cardioide;
      return 'nada';
    case 'propio':
    case 'estimado':
      if (el.checked) o[campo] = true;
      else delete o[campo];
      return campo === 'estimado' ? 'lista' : 'nada';
    case 'x':
    case 'y': {
      const v = n();
      if (v === null) return false;
      o.pos[campo === 'x' ? 0 : 1] = r3(v);
      return 'mover';
    }
    case 'elev': {
      const v = n();
      if (v === null) return false;
      o.elev = r3(v);
      return 'mover';
    }
    case 'rot': {
      const v = n();
      if (v === null) return false;
      o.rot = r3(((v % 360) + 360) % 360);
      return 'mover';
    }
    case 'w':
    case 'p':
    case 'h': {
      const v = n();
      if (v === null || v < 0) return false;
      const i = 'wph'.indexOf(campo);
      // En una forma libre, cambiar el ancho o el fondo estira sus puntos en ese sentido.
      if (Array.isArray(o.puntos) && i < 2) {
        const f = Math.max(v, 0.05) / Math.max(o.dims[i], 1e-6);
        o.puntos = o.puntos.map((p) => (i === 0 ? [r3(p[0] * f), p[1]] : [p[0], r3(p[1] * f)]));
        recentrar(o);
        return 'obj';
      }
      o.dims[i] = r3(campo === 'h' ? v : Math.max(v, 0.01));
      return 'obj';
    }
    case 'tronco':
    case 'apertura': {
      const v = n();
      if (v === null || v <= 0) return false;
      o[campo] = r3(v);
      return 'obj';
    }
    case 'postes': {
      const v = n();
      if (v === null || v < 0 || !o.dims[2]) return false;
      o.alero = Math.round(Math.min(v / o.dims[2], 0.9) * 10000) / 10000;
      if (!o.alero) delete o.alero;
      return 'obj';
    }
    case 'techo':
      if (el.checked) delete o.techo;
      else o.techo = false;
      return 'obj';
    case 'forma':
      if (el.value) o.forma = el.value;
      else delete o.forma;
      return 'obj';
    case 'color':
      o.color = el.value;
      return 'obj';
    case 'luz':
      o.luz = el.value;
      return 'obj';
    case 'computo':
      if (el.checked === computaPorDefecto(o.tipo)) delete o.computo;
      else o.computo = el.checked;
      return 'nada';
    case 'ref':
    case 'proveedor':
    case 'nota':
      if (el.value.trim()) o[campo] = el.value;
      else delete o[campo];
      return 'nada';
  }
  return false;
}

function aplicarMulti(objs, campo, el) {
  if (campo === 'capa') {
    if (el.value === '__nueva') {
      pedirTexto({ titulo: 'Nueva capa', etiqueta: 'Nombre de la capa' }).then((nombre) => {
        const c = nombre && nuevaCapa(nombre);
        if (!c) return renderDetalle();
        antesDeCambiar();
        for (const o of objs) o.capa = c.id;
        marcarCambio({ lista: true, detalle: true });
      });
      return false;
    }
    for (const o of objs) {
      if (el.value) o.capa = el.value;
      else delete o.capa;
    }
    aplicarVisibilidad();
    renderLista();
    return 'nada';
  }
  if (campo === 'color') {
    for (const o of objs) o.color = el.value;
    return 'color';
  }
  if (campo === 'proveedor') {
    for (const o of objs) {
      if (el.value.trim()) o.proveedor = el.value;
      else delete o.proveedor;
    }
    return 'nada';
  }
  const v = leerNumero(el.value);
  if (v === null) return false;
  for (const o of objs.filter((x) => !x.fijo)) {
    if (campo === 'elev') o.elev = r3(v);
    if (campo === 'rot') o.rot = r3(((v % 360) + 360) % 360);
  }
  return 'mover';
}

// Cambios del fondo desde el panel. Si la ubicación salió del fondo (se calibró con coordenadas), se
// mueve con él: cambiar el ancho la escala alrededor del centro de la imagen y girarla gira el norte.
function aplicarCampoFondo(e, k, el) {
  const f = e.fondo;
  const g = e.geo?.desdeFondo ? e.geo : null;
  if (k === 'ancho' || k === 'rot') {
    const v = leerNumero(el.value);
    if (v === null || (k === 'ancho' && v <= 1)) return false;
    if (k === 'ancho') {
      const s = v / f.ancho;
      if (g) e.geo = { ...g, x: r3(f.pos[0] + (g.x - f.pos[0]) * s), y: r3(f.pos[1] + (g.y - f.pos[1]) * s) };
      f.ancho = r3(v);
    } else {
      const d = v - (f.rot || 0);
      if (g) {
        const t = (d * Math.PI) / 180;
        const dx = g.x - f.pos[0];
        const dy = g.y - f.pos[1];
        e.geo = { ...g, x: r3(f.pos[0] + dx * Math.cos(t) - dy * Math.sin(t)), y: r3(f.pos[1] + dx * Math.sin(t) + dy * Math.cos(t)), norte: r3((((g.norte || 0) + d) % 360 + 360) % 360) };
      }
      f.rot = r3(v);
    }
  } else if (k === 'opacidad') f.opacidad = Math.min(1, Math.max(0.1, Number(el.value) / 100));
  else if (k === 'enPlano') f.enPlano = el.checked;
  else if (k === 'oculto') f.oculto = el.checked;
  else return false;
  construirFondo();
  return true;
}

function aplicarCampoEscena(el) {
  const e = estado.escena;
  const clave = el.dataset.escena;
  if (clave === 'proyecto.aforo') {
    e.proyecto = e.proyecto || {};
    const v = leerNumero(String(el.value).replace(/\./g, ''));
    if (el.value.trim() && (v === null || v <= 0)) return false;
    if (v) e.proyecto.aforo = Math.round(v);
    else delete e.proyecto.aforo;
    return true;
  }
  if (clave.startsWith('proyecto.')) {
    e.proyecto = e.proyecto || {};
    const k = clave.slice(9);
    if (el.value.trim()) e.proyecto[k] = el.value;
    else delete e.proyecto[k];
    return true;
  }
  if (clave.startsWith('fondo.') && e.fondo) return aplicarCampoFondo(e, clave.slice(6), el);
  if (clave.startsWith('cad.') && e.fondoCAD) {
    const k = clave.slice(4);
    const f = e.fondoCAD;
    if (k === 'unidad') {
      cambiarUnidadCAD(el.value);
      return false;
    }
    if (k === 'enPlano') f.enPlano = el.checked;
    else {
      const v = leerNumero(el.value);
      if (v === null) return false;
      if (k === 'x') f.pos = [r3(v), f.pos[1]];
      else if (k === 'y') f.pos = [f.pos[0], r3(v)];
      else if (k === 'rot') f.rot = r3(v);
    }
    construirCAD();
    return true;
  }
  if (clave === 'sonido.ganancia') {
    const v = leerNumero(el.value);
    if (v === null) return false;
    e.sonido = { ...(e.sonido || {}), ganancia: Math.round(v) };
    const valor = $('#vol-valor');
    if (valor) valor.textContent = `${v > 0 ? '+' : ''}${fm(v, 0)} dB`;
    const datos = $('#datos-sonido');
    if (datos) datos.innerHTML = htmlSonido(escenaSonido());
    return true;
  }
  if (clave === 'geo.norte' && e.geo) {
    const v = leerNumero(el.value);
    if (v === null) return false;
    e.geo = { ...e.geo, norte: r3(((v % 360) + 360) % 360) };
    return true;
  }
  switch (clave) {
    case 'nombre': {
      e.nombre = el.value;
      const op = $(`#sel-escena option[value="${estado.slug}"]`);
      if (op) op.textContent = el.value || estado.slug;
      document.title = `${el.value} | House Mates Plano`;
      return true;
    }
    case 'notas':
      if (el.value) e.notas = el.value;
      else delete e.notas;
      return true;
    case 'd1':
    case 'd2': {
      const v = leerNumero(el.value);
      if (v === null || v <= 0) return false;
      const d = densidad();
      d[clave === 'd1' ? 0 : 1] = r3(v);
      e.densidad = d;
      programarCapacidad();
      return true;
    }
  }
  return false;
}

function aplicarHoja(el) {
  const e = estado.escena;
  e.hoja = { ...(e.hoja || {}) };
  const k = el.dataset.hoja;
  e.hoja[k] = el.type === 'checkbox' ? el.checked : k === 'escala' && el.value !== 'auto' ? Number(el.value) : el.value;
  return true;
}

function aplicarComputo(el) {
  const e = estado.escena;
  const op = opcionesComputo(e);
  e.computo = { ...(e.computo || {}) };
  const k = el.dataset.computo;
  if (k === 'tramos') {
    const lista = el.value.split(/[;\s]+/).map(leerNumero).filter((v) => v && v > 0);
    if (!lista.length) return false;
    e.computo.tramosTruss = lista;
    return true;
  }
  const v = leerNumero(el.value);
  if (!v || v <= 0) return false;
  const mod = [...op.modTarima];
  mod[k === 'modA' ? 0 : 1] = r3(v);
  e.computo.modTarima = mod;
  return true;
}

function aplicarCota(c, el) {
  const v = leerNumero(el.value);
  if (v === null) return false;
  const k = el.dataset.cota;
  if (k === 'desplazo') c.desplazo = r3(v);
  else (k[0] === 'a' ? c.a : c.b)[k[1] === 'x' ? 0 : 1] = r3(v);
  return true;
}

/* ================================================================== vistas de hoja: plano y materiales */

function renderHoja() {
  if (!estado.escena) return;
  if (estado.vista === 'plano') renderPlano();
  else if (estado.vista === 'materiales') renderMateriales();
}

// Todas las hojas del plano. fondoHref: en pantalla, la dirección de la imagen de fondo; en los archivos
// (PDF, SVG, visor), la imagen misma como data: para que viaje adentro.
function hojasDelPlano(fondoHref = urlFondo()) {
  const e = estado.escena;
  const comp = computarTodo(e);
  // Las capas destildadas en "Capas en el plano" no salen en la planta principal.
  const fuera = new Set(e.hoja?.capasFuera || []);
  const op = { ...opcionesHoja(e), fondoHref, ...(fuera.size ? { filtro: (o) => !fuera.has(o.capa) } : {}) };
  return generarHojas(e, comp, op, hojasExtra(comp, op));
}

// Hojas especiales (emergencia, eléctrico, sonido, logística, proveedores, vistas de frente) según lo que
// esté tildado en las opciones del plano. Las arman sus módulos.
const generadoresHojas = [
  { clave: 'hojaSonido', nombre: 'Cobertura de sonido', crear: (e, comp, op) => hojaSonido(escenaSonido(e), comp, op) },
  { clave: 'hojaElectrica', nombre: 'Plano eléctrico', crear: (e, comp, op) => hojaElectrica(e, comp, op) },
  {
    clave: 'hojaSombras',
    nombre: 'Sombras a la hora elegida (pestaña Técnica)',
    crear: (e, comp, op) =>
      tieneGeo(e) ? { paginas: 1, crear: (n, total) => [hojaPlanta(e, comp, op, total, { titulo: `Sombras: ${diaSol()} a las ${horaTexto(estado.sol.minuto)}`, numeroHoja: n, encima: ({ M }) => sombrasSVG(e, fechaSol(), M) })] } : null,
  },
  {
    clave: 'hojaTerreno',
    nombre: 'Terreno y curvas de nivel',
    crear: (e, comp, op) =>
      e.terreno?.puntos?.length >= 3 ? { paginas: 1, crear: (n, total) => [hojaPlanta(e, comp, op, total, { titulo: 'Terreno y curvas de nivel', numeroHoja: n, encima: ({ M, k }) => curvasSVG(e.terreno, M, k, 0.25) })] } : null,
  },
];
function hojasExtra(comp, op) {
  const extras = [];
  for (const g of generadoresHojas) {
    if (!(estado.escena.hoja?.[g.clave] ?? g.porDefecto)) continue;
    try {
      const h = g.crear(estado.escena, comp, op);
      if (h && (h.paginas ?? 1) > 0) extras.push(h);
    } catch (err) {
      console.error(err);
      aviso(`No se pudo armar la hoja "${g.nombre}": ${err.message}`, 'error');
    }
  }
  return extras;
}

async function fondoComoDatos() {
  const f = estado.escena?.fondo;
  if (!f || f.oculto || f.enPlano === false) return null;
  try {
    const img = await cargarImagen(urlFondo());
    const max = 2400;
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

function renderPlano() {
  const r = hojasDelPlano();
  estado.hojas = r;
  const cont = $('#hoja-contenido');
  cont.className = 'hoja-contenido hojas';
  cont.innerHTML = r.hojas.map((svg, i) => `<div class="pagina" data-pagina="${i + 1}">${svg}</div>`).join('');
  $('#hoja-barra').hidden = false;
  $('#hoja-info').textContent = `${r.hojas.length} hoja${r.hojas.length === 1 ? '' : 's'} ${opcionesHoja(estado.escena).papel}, escala 1:${r.escala}`;
  aplicarZoomHoja();
}

// "Ajustar": la hoja entera a la vista (en una hoja vertical manda el alto, no el ancho).
function ajusteHoja() {
  const cont = $('#hoja-contenido');
  const [W, H] = estado.hojas?.tamano || [420, 297];
  return Math.max(0.5, Math.min((cont.clientWidth - 64) / W, (cont.clientHeight - 48) / H));
}

function aplicarZoomHoja() {
  if (!estado.hojas) return;
  const cont = $('#hoja-contenido');
  const [W] = estado.hojas.tamano;
  const z = estado.zoomHoja ?? ajusteHoja();
  for (const p of $$('.pagina > svg', cont)) {
    p.style.width = `${W * z}px`;
    p.style.height = 'auto';
  }
  $('#hoja-zoom').textContent = `${Math.round((z / 3.7795) * 100)}%`;
}

function renderMateriales() {
  const e = estado.escena;
  const c = computarTodo(e);
  const cont = $('#hoja-contenido');
  cont.className = 'hoja-contenido tabla-materiales';
  $('#hoja-barra').hidden = true;
  const porCat = new Map();
  for (const it of c.items) {
    if (!porCat.has(it.cat)) porCat.set(it.cat, []);
    porCat.get(it.cat).push(it);
  }
  const filas = [...porCat]
    .map(
      ([cat, items]) =>
        `<tr class="fila-cat"><th colspan="7">${nombreCategoria(cat)} <span>${items.reduce((s, i) => s + i.cantidad, 0)} u</span></th></tr>` +
        items
          .map(
            (it) => `<tr data-ids="${it.ids.join(',')}" title="Clic para verlo en el modelo">
              <td class="cod">${it.codigo}</td>
              <td class="item-col">${icono(it.tipo)}<span>${esc(it.nombre)}</span></td>
              <td>${esc(it.ref) || '<span class="tenue">sin modelo</span>'}</td>
              <td class="num">${esc(it.medida)}</td>
              <td class="num fuerte">${it.cantidad}</td>
              <td>${it.unidad}</td>
              <td>${esc(it.proveedor) || '<span class="tenue">sin asignar</span>'}</td>
            </tr>`
          )
          .join('')
    )
    .join('');
  const derivados = c.derivados.length
    ? `<h2>Para el armado</h2><table class="tabla"><thead><tr><th>Ítem</th><th>Detalle</th><th class="num">Cantidad</th><th>Unidad</th></tr></thead><tbody>${c.derivados
        .map((d) => `<tr><td>${esc(d.nombre)}</td><td class="tenue">${esc(d.detalle)}</td><td class="num fuerte">${fm(d.cantidad, d.dec)}</td><td>${d.unidad}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  const sup = c.superficies.length
    ? `<h2>Superficies</h2><table class="tabla"><thead><tr><th>Nombre</th><th>Tipo</th><th class="num">m²</th><th class="num">Personas (cómodo a lleno)</th></tr></thead><tbody>${c.superficies
        .map((s) => {
          const cap = s.tipo === 'Zona' ? estado.capacidad.zonas.find((z) => z.id === s.id) : estado.capacidad.areas.find((a) => a.nombre === s.nombre);
          return `<tr><td>${esc(s.nombre)}</td><td class="tenue">${s.tipo}</td><td class="num fuerte">${fm(s.m2, 1)}</td><td class="num">${cap ? personas(cap.libre) : '—'}</td></tr>`;
        })
        .join('')}</tbody></table>`
    : '';
  cont.innerHTML = `
    <div class="materiales">
      <header class="materiales-cabeza">
        <div>
          <h1>Listado de materiales</h1>
          <p>${esc(e.proyecto?.evento || e.nombre)}</p>
        </div>
        <dl class="kpis">
          <div><dt>Unidades</dt><dd>${c.total}</dd></div>
          <div><dt>Ítems</dt><dd>${c.items.length}</dd></div>
          <div><dt>Categorías</dt><dd>${porCat.size}</dd></div>
        </dl>
      </header>
      ${c.items.length ? `<table class="tabla tabla-items"><thead><tr><th>Cód.</th><th>Ítem</th><th>Modelo / ref.</th><th class="num">Medidas</th><th class="num">Cant.</th><th>Unidad</th><th>Proveedor</th></tr></thead><tbody>${filas}</tbody></table>` : '<p class="vacio-panel">No hay nada para computar todavía. Agregá objetos desde la biblioteca.</p>'}
      ${derivados}
      ${sup}
    </div>`;
}

/* ================================================================== escenas */

async function cargarLista() {
  const r = await fetch('/api/escenas', { cache: 'no-store' });
  listaEscenas = await r.json();
  const sel = $('#sel-escena');
  sel.innerHTML = listaEscenas.map((x) => `<option value="${esc(x.slug)}">${esc(x.nombre)}</option>`).join('');
  if (estado.slug) sel.value = estado.slug;
}

async function abrirEscena(slug) {
  if (temporizadorGuardado) {
    clearTimeout(temporizadorGuardado);
    await guardar();
  }
  // Si no se puede abrir, el selector vuelve a mostrar la escena que sigue abierta.
  const fallo = (texto) => {
    if (estado.slug) $('#sel-escena').value = estado.slug;
    aviso(texto, 'error', 9000);
  };
  const r = await fetch(`/api/escenas/${encodeURIComponent(slug)}`, { cache: 'no-store' }).catch(() => null);
  if (!r?.ok) return fallo(`No se pudo abrir la escena ${slug}.`);
  const texto = await r.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (err) {
    return fallo(`El archivo escenas/${slug}.json tiene un error de formato: ${err.message}`);
  }
  estado.slug = slug;
  estado.escena = normalizarEscena(datos);
  estado.textoGuardado = texto;
  estado.ultimo = instantanea();
  estado.deshacer = [];
  estado.rehacer = [];
  estado.sel = new Set();
  estado.selCota = null;
  ponerHerramienta('seleccionar');
  $('#sel-escena').value = slug;
  history.replaceState(null, '', `#${slug}`);
  document.title = `${estado.escena.nombre} | House Mates Plano`;
  guardarPref();
  $('#vacio').hidden = true;
  construirTodo();
  encuadrar();
  renderLista();
  calcularCapacidad();
  actualizarHistorialUI();
  ponerGuardado('ok');
  cargarFotos();
  trasCambioSeleccion();
  if (!enVista3D()) renderHoja();
}

async function recargarDesdeArchivo() {
  const r = await fetch(`/api/escenas/${estado.slug}`, { cache: 'no-store' });
  if (!r.ok) return;
  const texto = await r.text();
  if (texto === estado.textoGuardado) return;
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return;
  }
  // Si había un cambio propio sin guardar, gana el archivo, pero el cambio queda en el historial.
  const pisado = Boolean(temporizadorGuardado);
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = null;
  // Se recuerda en qué campo estaba escribiendo el usuario para devolverle el foco al redibujar el panel.
  const activo = document.activeElement;
  const claveFoco = ['campo', 'escena', 'hoja', 'computo', 'cota', 'multi'].find((k) => activo?.closest?.('#panel-der') && activo.dataset?.[k] !== undefined);
  const valorFoco = claveFoco ? activo.dataset[claveFoco] : null;
  antesDeCambiar();
  estado.escena = normalizarEscena(datos);
  estado.textoGuardado = texto;
  estado.ultimo = instantanea();
  for (const id of [...estado.sel]) if (!objPorId(id)) estado.sel.delete(id);
  if (estado.selCota && !cotaPorId(estado.selCota)) estado.selCota = null;
  const op = $(`#sel-escena option[value="${estado.slug}"]`);
  if (op) op.textContent = estado.escena.nombre;
  construirTodo();
  renderLista();
  renderDetalle();
  calcularCapacidad();
  actualizarHistorialUI();
  ponerGuardado('ok');
  if (!enVista3D()) renderHoja();
  if (claveFoco) {
    const campo = $(`#panel-der [data-${claveFoco}="${CSS.escape(valorFoco)}"]`);
    if (campo) {
      campo.focus();
      if (typeof campo.select === 'function' && campo.type === 'text') campo.select();
    }
  }
  if (pisado) aviso('El archivo cambió mientras editabas y se cargó esa versión. Ctrl+Z vuelve a la tuya.', 'error', 8000);
  else aviso('La escena se actualizó desde el archivo.');
}

let modoDialogo = 'nueva';
function dialogoEscena(modo) {
  const dlg = $('#dlg-escena');
  const duplica = modo === 'duplicar';
  modoDialogo = modo;
  $('#dlg-escena-titulo').textContent = duplica ? 'Duplicar escena' : 'Nueva escena';
  $('#dlg-escena-ayuda').textContent = duplica
    ? 'Se copia todo lo de esta escena. Sirve para probar otra distribución sin tocar la original.'
    : 'Arranca con un ambiente de 10 × 8 m y paredes de 3 m. Las medidas reales se cargan después.';
  $('#dlg-escena-crear').textContent = duplica ? 'Duplicar' : 'Crear escena';
  const input = $('#dlg-escena-nombre');
  input.value = duplica ? `${estado.escena?.nombre || 'Escena'} (variante)` : '';
  dlg.showModal();
  input.select();
}

async function crearEscena(nombre, duplica) {
  const base = duplica && estado.escena ? JSON.parse(instantanea()) : escenaVacia(nombre);
  base.nombre = nombre;
  const usados = new Set(listaEscenas.map((x) => x.slug));
  const raiz = slugificar(nombre);
  let slug = raiz;
  for (let n = 2; usados.has(slug); n++) slug = `${raiz}-${n}`;
  const r = await fetch(`/api/escenas/${slug}?crear=1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: formatearJSON(base) + '\n' });
  if (!r.ok) return aviso((await r.json().catch(() => ({}))).error || 'No se pudo crear la escena.', 'error');
  await cargarLista();
  await abrirEscena(slug);
  aviso(`Escena “${nombre}” creada. El archivo es escenas/${slug}.json.`);
}

function dialogoRepetir() {
  const objs = selObjs();
  if (!objs.length) return;
  const uno = objs.length === 1 ? objs[0] : null;
  const b = cajaDe(objs.flatMap((o) => esquinas(o)));
  const sepX = uno ? uno.dims[0] + 0.1 : b.maxX - b.minX + 0.5;
  const sepY = uno ? uno.dims[1] + 0.5 : b.maxY - b.minY + 0.5;
  $('#rep-columnas').value = '4';
  $('#rep-sepx').value = fm(sepX);
  $('#rep-filas').value = '1';
  $('#rep-sepy').value = fm(sepY);
  $('#rep-ayuda').textContent = uno
    ? `Las columnas siguen el ancho de “${uno.nombre}” y las filas van hacia atrás, según cómo esté girado.`
    : 'Las columnas van sobre X y las filas sobre Y. Se repite todo el grupo junto.';
  $('#dlg-repetir').showModal();
}

/* ================================================================== análisis: seguridad, sonido, energía, sol y terreno */

// Listado de materiales más lo que sale de los análisis (por ahora, los cables del plano eléctrico).
function computarTodo(e = estado.escena) {
  const c = computar(e);
  if (e.objetos.some(esFuente)) {
    try {
      c.derivados.push(...derivadosElectricos(analizarElectrico(e)));
    } catch (err) {
      console.error(err);
    }
  }
  return c;
}

// Los dB de cada parlante son su máximo; nadie trabaja así. Si no se cargó un volumen general, se asumen
// 20 dB menos, que da niveles de pista realistas (unos 100 dB).
const VOLUMEN_POR_DEFECTO = -20;
const volumenSonido = () => numero(estado.escena?.sonido?.ganancia) ?? VOLUMEN_POR_DEFECTO;
const escenaSonido = (e = estado.escena) => ({ ...e, sonido: { ...(e.sonido || {}), ganancia: numero(e.sonido?.ganancia) ?? VOLUMEN_POR_DEFECTO } });

let estilosInyectados = new Set();
function inyectarEstilos(clave, css) {
  if (!css || estilosInyectados.has(clave)) return;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.append(s);
  estilosInyectados.add(clave);
}

function botonCapaAnalisis(clave, texto) {
  const activa = estado.analisis === clave;
  return `<button class="${activa ? 'activo-analisis' : ''}" data-analisis="${clave}" aria-pressed="${activa}">${icono(activa ? 'ojo' : 'ojoNo')} ${activa ? 'Ocultar de la vista' : texto}</button>`;
}

function htmlPestanaTecnica() {
  inyectarEstilos('sonido', ESTILOS_SONIDO);
  inyectarEstilos('electrico', CSS_ELECTRICO);
  inyectarEstilos('cargas', CSS_CARGAS);
  const e = estado.escena;
  const hayEnergia = e.objetos.some((o) => esFuente(o) || Number(o.potencia) > 0 || TIPOS[o.tipo]?.potencia > 0);
  const hayTruss = e.objetos.some((o) => o.tipo === 'truss');
  const vol = volumenSonido();
  const haySonido = estado.escena.objetos.some((o) => o.tipo === 'parlante' || o.tipo === 'sub');
  return `
    ${seccion(
      'Sonido',
      haySonido
        ? `<div class="fila-botones">${botonCapaAnalisis('sonido', 'Ver la cobertura en la vista')}</div>
          <label class="campo"><span>Volumen de trabajo: <strong id="vol-valor">${vol > 0 ? '+' : ''}${fm(vol, 0)} dB</strong></span><input type="range" min="-40" max="0" step="1" data-escena="sonido.ganancia" value="${vol}"></label>
          <p class="ayuda">Cuánto por debajo del máximo de los equipos se trabaja. Lo habitual en una fiesta es entre −25 y −15 dB.</p>
          <div id="datos-sonido">${htmlSonido(escenaSonido())}</div>`
        : '<p class="ayuda">Agregá parlantes y subwoofers para ver hasta dónde llega el sonido y cuánto llega a los vecinos (con un "Punto de medición de ruido").</p>'
    )}
    ${seccion(
      'Energía',
      hayEnergia
        ? `<div class="fila-botones">${botonCapaAnalisis('electrico', 'Ver los cables en la vista')}</div>${htmlElectrico(e, analizarElectrico(e))}`
        : '<p class="ayuda">Agregá un generador y tableros (en la biblioteca, en Energía) y conectá cada equipo a su tablero para ver la potencia, la corriente y los metros de cable.</p>',
      { abierta: false }
    )}
    ${seccion('Cargas en estructuras', hayTruss ? htmlCargas(e, analizarCargas(e)) : '<p class="ayuda">Cuando haya truss con luces o pantallas colgadas, acá se ve cuánto peso carga cada uno contra lo que aguanta.</p>', { abierta: false })}
    ${htmlSeccionSol()}
    ${htmlSeccionTerreno()}`;
}

function htmlPestanaSeguridad() {
  return seccion('Seguridad', '<p class="ayuda">Salidas, distancias de evacuación y servicios.</p>');
}

// Capas de análisis sobre la vista (una a la vez).
function construirAnalisis() {
  analisisG.traverse((n) => n.material?.map?.dispose?.());
  vaciar(analisisG);
  const ley = $('#leyenda-analisis');
  ley.hidden = true;
  const tipo = estado.analisis;
  if (!tipo || !estado.escena) return;
  try {
    if (tipo === 'sombras') {
      const r = sombras(estado.escena, fechaSol());
      const mat = new THREE.MeshBasicMaterial({ color: '#05060a', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
      for (const p of r?.poligonos || []) {
        if (!p.puntos || p.puntos.length < 3) continue;
        const geo = new THREE.ShapeGeometry(new THREE.Shape(p.puntos.map(([x, y]) => new THREE.Vector2(x, -y))));
        geo.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geo, mat);
        m.position.y = 0.02;
        m.raycast = () => {};
        m.renderOrder = 3;
        analisisG.add(m);
      }
      mat.userData = {};
      analisisG.userData.matSombra = mat;
      mostrarLeyenda(`Sombras: ${horaTexto(estado.sol.minuto)}`, [['#3a3b40', r?.deNoche ? 'Es de noche a esa hora' : 'Sombra en el piso']]);
    } else if (tipo === 'terreno') {
      const t = estado.escena.terreno;
      const m = mallaTerreno(t);
      const geo = new THREE.BufferGeometry();
      // La malla se apoya plana sobre el piso con colores por altura (más claro, más alto).
      const pos = new Float32Array(m.posiciones.length);
      const col = new Float32Array(m.posiciones.length);
      const rango = Math.max(m.maximo - m.minimo, 0.01);
      const bajo = new THREE.Color('#2447f5');
      const medio = new THREE.Color('#2fbf71');
      const alto = new THREE.Color('#e8aa4c');
      const c = new THREE.Color();
      for (let i = 0; i < m.posiciones.length; i += 3) {
        pos[i] = m.posiciones[i];
        pos[i + 1] = 0.018;
        pos[i + 2] = m.posiciones[i + 2];
        const f = (m.posiciones[i + 1] - m.minimo) / rango;
        if (f < 0.5) c.copy(bajo).lerp(medio, f * 2);
        else c.copy(medio).lerp(alto, (f - 0.5) * 2);
        col[i] = c.r;
        col[i + 1] = c.g;
        col[i + 2] = c.b;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      const malla = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }));
      malla.userData.propio = true;
      malla.raycast = () => {};
      malla.renderOrder = 3;
      analisisG.add(malla);
      const lineas = [];
      for (const curva of curvasDeNivel(t, 0.25)) {
        for (const l of curva.lineas) for (let i = 1; i < l.length; i++) lineas.push(new THREE.Vector3(l[i - 1][0], 0.03, l[i - 1][1]), new THREE.Vector3(l[i][0], 0.03, l[i][1]));
      }
      const curvas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lineas), new THREE.LineBasicMaterial({ color: '#fafafa', transparent: true, opacity: 0.55, depthTest: false }));
      curvas.userData.propio = true;
      curvas.renderOrder = 4;
      analisisG.add(curvas);
      dibujarPuntosNivel();
      mostrarLeyenda('Terreno (curvas cada 25 cm)', [
        ['#2447f5', `Más bajo: ${fm(m.minimo, 2)} m`],
        ['#2fbf71', 'Intermedio'],
        ['#e8aa4c', `Más alto: ${fm(m.maximo, 2)} m`],
      ]);
    } else if (tipo === 'electrico') {
      const an = analizarElectrico(estado.escena);
      for (const c of an.cables) {
        const pts = (c.puntos3d || []).map(([x, y, h]) => new THREE.Vector3(x, Math.max(h, 0) + 0.03, y));
        if (pts.length < 2) continue;
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c.color || '#e8aa4c', depthTest: false, transparent: true, linewidth: c.tipo === 'alimentacion' ? 3 : 1 }));
        l.userData.propio = true;
        l.renderOrder = 9;
        analisisG.add(l);
      }
      mostrarLeyenda('Cables', an.fuentes.slice(0, 8).map((f) => [f.color || '#2447f5', `${f.nombre}: ${Math.round(f.porcentaje || 0)} %`]));
    } else if (tipo === 'sonido') {
      const mapa = mapaSonido(escenaSonido());
      planoDeTextura(mapa.caja, colorearSonido(mapa, { alfa: 0.55 }));
      mostrarLeyenda('Sonido a 1,6 m de altura', BANDAS.map((b) => [b.color, b.nombre]));
    }
  } catch (err) {
    console.error(err);
    aviso(`No se pudo calcular el análisis: ${err.message}`, 'error');
  }
}

let temporizadorAnalisis = null;
function programarAnalisis() {
  if (!estado.analisis) return;
  clearTimeout(temporizadorAnalisis);
  temporizadorAnalisis = setTimeout(construirAnalisis, 300);
}

// Una imagen de colores (rgba por celda) apoyada en el piso sobre el rectángulo "caja" de la planta.
function planoDeTextura(caja, { columnas, filas, rgba }) {
  const c = document.createElement('canvas');
  c.width = columnas;
  c.height = filas;
  c.getContext('2d').putImageData(new ImageData(rgba, columnas, filas), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const w = caja.maxX - caja.minX;
  const h = caja.maxY - caja.minY;
  const geo = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  m.userData.propio = true;
  m.raycast = () => {};
  m.rotation.x = -Math.PI / 2;
  m.position.set(caja.minX + w / 2, 0.025, caja.minY + h / 2);
  m.renderOrder = 3;
  analisisG.add(m);
}

function mostrarLeyenda(titulo, filas) {
  const ley = $('#leyenda-analisis');
  ley.innerHTML = `<strong>${esc(titulo)}</strong>${filas.map(([color, texto]) => `<span><i style="background:${esc(color)}"></i>${esc(texto)}</span>`).join('')}`;
  ley.hidden = false;
}

function ponerAnalisis(clave) {
  estado.analisis = estado.analisis === clave ? null : clave;
  if (estado.analisis && !enVista3D()) ponerVista('planta');
  construirAnalisis();
  renderDetalle();
}

/* ------------------------------------------------------------------ sol y sombra */

function diaSol() {
  if (!estado.sol.dia) estado.sol.dia = diaDelEvento(estado.escena);
  return estado.sol.dia;
}
const fechaSol = () => conHora(diaSol(), estado.sol.minuto);

function htmlSeccionSol() {
  const e = estado.escena;
  if (!tieneGeo(e)) {
    return seccion('Sol y sombra', '<p class="ayuda">Para saber dónde va a haber sombra a cada hora, primero ubicá la escena en el mapa (pestaña Proyecto, "Fondo y escala" o "Ubicación").</p>', { abierta: false });
  }
  const dia = diaSol();
  const h = horasDeSol(dia, e.geo.lat, e.geo.lng, zonaDe(e));
  const desde = Math.max(0, Math.floor(h.minutos?.amanece ?? 300));
  const hasta = Math.min(1439, Math.ceil(h.minutos?.anochece ?? 1260));
  estado.sol.minuto = Math.min(hasta, Math.max(desde, estado.sol.minuto));
  return seccion(
    'Sol y sombra',
    `<div class="fila-botones">${botonCapaAnalisis('sombras', 'Ver las sombras en la vista')}</div>
    <div class="campos">
      <label class="campo"><span>Día</span><input type="date" data-sol="dia" value="${esc(dia)}"></label>
      <label class="campo"><span>Hora: <strong id="sol-hora">${horaTexto(estado.sol.minuto)}</strong></span><input type="range" data-sol="minuto" min="${desde}" max="${hasta}" step="10" value="${estado.sol.minuto}"></label>
    </div>
    <label class="check"><input type="checkbox" data-sol="real"${estado.sol.real ? ' checked' : ''}> Luz del 3D según el sol de ese momento</label>
    <div id="datos-sol">${htmlSol(e, fechaSol())}</div>`,
    { abierta: false }
  );
}

function cambioSol() {
  const hora = $('#sol-hora');
  if (hora) hora.textContent = horaTexto(estado.sol.minuto);
  const datos = $('#datos-sol');
  if (datos) datos.innerHTML = htmlSol(estado.escena, fechaSol());
  ajustarSol();
  if (estado.analisis === 'sombras') construirAnalisis();
}

/* ------------------------------------------------------------------ terreno */

function htmlSeccionTerreno() {
  const e = estado.escena;
  const n = e.terreno?.puntos?.length || 0;
  return seccion(
    'Terreno',
    `<p class="ayuda">Cargá la altura de algunos puntos del terreno (con un nivel o una manguera) y la app arma las curvas de nivel, la pendiente, dónde se junta el agua y cuánto hay que nivelar bajo cada tarima.</p>
    <div class="fila-botones">
      <button data-accion="nivel-agregar">${icono('terreno')} Agregar puntos de altura</button>
      ${n >= 3 ? botonCapaAnalisis('terreno', 'Ver las curvas en la vista') : ''}
    </div>
    ${n ? `<p class="dato">${n} punto${n === 1 ? '' : 's'} de altura cargado${n === 1 ? '' : 's'}. <button class="enlace" data-accion="nivel-borrar">Borrar todos</button></p>` : ''}
    ${n >= 3 ? htmlTerreno(e) : ''}`,
    { abierta: n > 0 }
  );
}

async function agregarPuntoNivel(p) {
  const v = await pedirTexto({ titulo: 'Altura de este punto', etiqueta: 'Altura respecto del punto de referencia (m)', ayuda: 'Positivo si está más alto, negativo si está más bajo. Ejemplo: 0,35 o -0,2.', valor: '0' });
  if (v === null) return;
  const z = leerNumero(v);
  if (z === null) return aviso('Escribí un número, por ejemplo 0,35.', 'error');
  antesDeCambiar();
  const e = estado.escena;
  e.terreno = { ...(e.terreno || {}), puntos: [...(e.terreno?.puntos || []), [r3(p[0]), r3(p[1]), r3(z)]] };
  marcarCambio({ detalle: true });
  dibujarPuntosNivel();
  if ((e.terreno.puntos.length || 0) >= 3 && estado.analisis === 'terreno') construirAnalisis();
}

// Los puntos de altura se ven mientras se cargan (y con la capa del terreno).
function dibujarPuntosNivel() {
  vaciar(guiaG);
  if (estado.herramienta !== 'nivel' && estado.analisis !== 'terreno') return;
  for (const [x, y, z] of estado.escena?.terreno?.puntos || []) {
    const m = new THREE.Mesh(geoPunto, matPunto);
    m.position.set(x, 0.05, y);
    m.scale.setScalar(1.6);
    m.renderOrder = 12;
    guiaG.add(m);
    const et = etiqueta(`${z > 0 ? '+' : ''}${fm(z, 2)}`, 'cinta cinta-chica', [0.5, 1.4]);
    et.position.copy(m.position);
    guiaG.add(et);
  }
}

/* ------------------------------------------------------------------ plano de AutoCAD de fondo */

let lineasCAD = { slug: null, lineas: null };

async function cargarLineasCAD() {
  const e = estado.escena;
  if (!e?.fondoCAD) {
    lineasCAD = { slug: estado.slug, lineas: null };
    return;
  }
  if (lineasCAD.slug === estado.slug && lineasCAD.lineas) return;
  try {
    const r = await fetch(`/api/cad/${estado.slug}`, { cache: 'no-store' });
    if (!r.ok) throw new Error();
    lineasCAD = { slug: estado.slug, lineas: (await r.json()).lineas };
  } catch {
    lineasCAD = { slug: estado.slug, lineas: null };
  }
}

const transformarCAD = (f) => {
  const t = ((f.rot || 0) * Math.PI) / 180;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  return ([x, y]) => [f.pos[0] + x * c - y * sn, f.pos[1] + x * sn + y * c];
};

async function construirCAD() {
  vaciar(cadG);
  const f = estado.escena?.fondoCAD;
  if (!f || f.oculto || !estado.ver.fondo) return;
  await cargarLineasCAD();
  if (!lineasCAD.lineas || estado.escena?.fondoCAD !== f) return;
  vaciar(cadG);
  const T = transformarCAD(f);
  const pts = [];
  for (const l of lineasCAD.lineas) {
    for (let i = 1; i < l.length; i++) {
      const a = T(l[i - 1]);
      const b = T(l[i]);
      pts.push(new THREE.Vector3(a[0], 0.006, a[1]), new THREE.Vector3(b[0], 0.006, b[1]));
    }
  }
  const lineas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: estado.tema === 'claro' ? '#5a5f68' : '#aeb4bb', transparent: true, opacity: 0.85 }));
  lineas.userData.propio = true;
  lineas.raycast = () => {};
  cadG.add(lineas);
}

async function importarDXF(archivo) {
  if (!archivo || !estado.escena) return;
  aviso('Leyendo el plano…');
  try {
    const texto = await archivo.text();
    const r = leerDXF(texto);
    if (!r.lineas.length) throw new Error('el archivo no tiene líneas para dibujar');
    const res = await fetch(`/api/cad/${estado.slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineas: r.lineas, caja: r.caja, unidad: r.unidadDetectada, nombre: archivo.name }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
    antesDeCambiar();
    estado.escena.fondoCAD = { nombre: archivo.name, pos: [0, 0], rot: 0, unidad: r.unidadDetectada, ancho: r3(r.caja.ancho), alto: r3(r.caja.alto), enPlano: true };
    lineasCAD = { slug: estado.slug, lineas: r.lineas };
    construirCAD();
    marcarCambio({ detalle: true });
    if (!estado.escena.objetos.length && !estado.escena.areas.length) encuadrar();
    aviso(`Plano cargado: ${fm(r.caja.ancho, 1)} × ${fm(r.caja.alto, 1)} m, en ${r.unidadDetectada === 'm' ? 'metros' : r.unidadDetectada === 'cm' ? 'centímetros' : r.unidadDetectada === 'mm' ? 'milímetros' : r.unidadDetectada}. ${r.avisos.slice(0, 2).join(' ')}`, 'ok', 9000);
  } catch (err) {
    aviso(`No se pudo leer el plano: ${err.message}.`, 'error', 9000);
  }
}

// Cambiar la unidad del plano (por si el archivo decía mal en qué estaba dibujado): reescala las líneas.
async function cambiarUnidadCAD(nueva) {
  const f = estado.escena.fondoCAD;
  const metros = { mm: 0.001, cm: 0.01, m: 1, pulgadas: 0.0254, pies: 0.3048 };
  const factor = (metros[nueva] || 1) / (metros[f.unidad] || 1);
  await cargarLineasCAD();
  if (!lineasCAD.lineas || factor === 1) return;
  lineasCAD.lineas = lineasCAD.lineas.map((l) => l.map(([x, y]) => [r3(x * factor), r3(y * factor)]));
  await fetch(`/api/cad/${estado.slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineas: lineasCAD.lineas, unidad: nueva }) });
  antesDeCambiar();
  Object.assign(f, { unidad: nueva, ancho: r3(f.ancho * factor), alto: r3(f.alto * factor) });
  construirCAD();
  marcarCambio({ detalle: true });
}

function htmlFondoCAD() {
  const f = estado.escena.fondoCAD;
  if (!f) {
    return `<div class="fila-botones"><button data-accion="cad-elegir">${icono('archivo')} Usar un plano de AutoCAD (DXF)</button></div><p class="ayuda">Si el lugar tiene un plano del arquitecto, sus líneas quedan de fondo a escala real.</p>`;
  }
  return `<p class="dato ok">${icono('check')} Plano de AutoCAD: ${esc(f.nombre || 'DXF')}, ${fm(f.ancho, 1)} × ${fm(f.alto, 1)} m.</p>
    <div class="campos">
      ${campoNum('data-escena', 'cad.x', 'X', f.pos[0])}
      ${campoNum('data-escena', 'cad.y', 'Y', f.pos[1])}
      ${campoNum('data-escena', 'cad.rot', 'Giro', f.rot || 0, '°', 1)}
      <label class="campo"><span>Dibujado en</span><select data-escena="cad.unidad">${opcionesSelect({ mm: 'Milímetros', cm: 'Centímetros', m: 'Metros', pulgadas: 'Pulgadas', pies: 'Pies' }, f.unidad)}</select></label>
    </div>
    <label class="check"><input type="checkbox" data-escena="cad.enPlano"${f.enPlano !== false ? ' checked' : ''}> Mostrarlo en el plano impreso</label>
    <div class="fila-botones"><button data-accion="cad-mover">${icono('mano')} Mover</button><button class="peligro" data-accion="cad-quitar">${icono('basura')} Quitar</button></div>`;
}

/* ------------------------------------------------------------------ cerrar, historial y nube */

async function cerrarApp() {
  if (!confirm('¿Cerrar House Mates Plano? Lo que hiciste ya está guardado.')) return;
  await guardarPendiente();
  try {
    await fetch('/api/apagar', { method: 'POST' });
  } catch {}
  document.documentElement.classList.add('cerrado');
}

// Estado del historial (git) y de la copia en la nube, para el panel del proyecto.
async function cargarEstadoHistorial() {
  const cont = $('#estado-historial');
  if (!cont) return;
  try {
    const r = await fetch('/api/historial', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    const h = await r.json();
    const fecha = (f) => (f ? new Date(f).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');
    const git = h.git?.activo
      ? h.git.ultimoCommit
        ? `Último guardado en el historial: ${fecha(h.git.ultimoCommit.fecha)}.`
        : 'El historial se está armando.'
      : h.git?.disponible === false
        ? 'Historial con git: no está instalado git en esta computadora.'
        : 'Historial con git: apagado.';
    const nube = h.nube?.activa
      ? `Copia en la nube: ${esc(h.nube.carpeta)}${h.nube.ultimaCopia ? `, última ${fecha(h.nube.ultimaCopia.fecha)}` : ''}.`
      : 'Copia en la nube: apagada (no se encontró OneDrive o está desactivada en config.json).';
    cont.innerHTML = `<p class="dato">${esc(git)}</p><p class="dato">${nube}</p>${h.git?.error || h.nube?.error ? `<p class="dato aviso">${icono('advertencia')} ${esc(h.git?.error || h.nube?.error)}</p>` : ''}`;
  } catch {
    cont.innerHTML = '<p class="ayuda">Para ver el historial, cerrá la ventanita negra (si está) y abrí la herramienta de nuevo desde el escritorio.</p>';
  }
}

/* ================================================================== diálogo de texto */

// Pide un texto con un diálogo propio (nombre de un bloque, de una capa, nota de una revisión).
function pedirTexto({ titulo, etiqueta, valor = '', ayuda = '' }) {
  const dlg = $('#dlg-texto');
  $('#dlg-texto-titulo').textContent = titulo;
  $('#dlg-texto-etiqueta').textContent = etiqueta;
  $('#dlg-texto-ayuda').textContent = ayuda;
  const input = $('#dlg-texto-valor');
  input.value = valor;
  dlg.returnValue = '';
  dlg.showModal();
  input.select();
  return new Promise((ok) => {
    dlg.addEventListener('close', () => ok(dlg.returnValue === 'ok' && input.value.trim() ? input.value.trim() : null), { once: true });
  });
}

/* ================================================================== catálogo propio, bloques, grupos y capas */

// Catálogo propio: equipos con su ficha (modelo, medidas, consumo, peso, costo, proveedor) para reusar en
// cualquier escena. Bloques: conjuntos armados (la cabina House Mates entera) que se sueltan de una vez.
// Los dos se guardan en datos/ (no son de una escena).
let catalogo = [];
let bloques = [];
const CAMPOS_FICHA = ['tipo', 'dims', 'ref', 'potencia', 'peso', 'costo', 'costoTipo', 'propio', 'proveedor', 'color', 'luz', 'elev', 'alero', 'tirante', 'techo', 'forma', 'apertura', 'spl', 'dispersion', 'capacidad', 'tronco'];

async function cargarDatosGenerales() {
  for (const nombre of ['catalogo', 'bloques']) {
    try {
      const r = await fetch(`/api/datos/${nombre}`, { cache: 'no-store' });
      if (!r.ok) continue;
      const lista = await r.json();
      if (!Array.isArray(lista)) continue;
      if (nombre === 'catalogo') catalogo = lista.filter((c) => c && TIPOS[c.tipo]);
      else bloques = lista.filter((b) => b && Array.isArray(b.objetos));
    } catch {}
  }
  renderBiblioteca();
}

async function guardarDatosGenerales(nombre) {
  try {
    const r = await fetch(`/api/datos/${nombre}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nombre === 'catalogo' ? catalogo : bloques, null, 1) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
  } catch (err) {
    aviso(`No se pudo guardar ${nombre === 'catalogo' ? 'el catálogo' : 'los bloques'}: ${err.message}. Si la herramienta se abrió antes de esta actualización, cerrala y abrila de nuevo.`, 'error', 9000);
  }
}

function guardarEnCatalogo(o) {
  const entrada = { id: nuevoId(), nombre: o.ref ? `${TIPOS[o.tipo]?.nombre || o.tipo} ${o.ref}` : o.nombre };
  for (const k of CAMPOS_FICHA) if (o[k] !== undefined) entrada[k] = structuredClone(o[k]);
  const i = catalogo.findIndex((c) => c.tipo === o.tipo && ((o.ref && c.ref === o.ref) || c.nombre === entrada.nombre));
  if (i >= 0) {
    entrada.id = catalogo[i].id;
    catalogo[i] = entrada;
  } else catalogo.push(entrada);
  guardarDatosGenerales('catalogo');
  renderBiblioteca();
  aviso(`"${entrada.nombre}" ${i >= 0 ? 'se actualizó en' : 'quedó en'} tu catálogo. Está en la biblioteca, en "Mis equipos".`);
}

function nuevoDesdeFicha(ficha, [x, y], extra = {}) {
  const def = TIPOS[ficha.tipo];
  const o = { ...structuredClone(ficha), ...extra, id: nuevoId(), pos: [ajustar(x), ajustar(y)], rot: ficha.rot || 0 };
  if (!o.dims) o.dims = [...def.dims];
  if (def.elev && o.elev === undefined) o.elev = def.elev;
  return normalizarEscena({ objetos: [o] }).objetos[0];
}

function agregarDesdeCatalogo(id, punto = null) {
  const c = catalogo.find((x) => x.id === id);
  if (!c || !estado.escena) return;
  const o = nuevoDesdeFicha(c, punto || centroDeVista(), { nombre: nombreUnico(c.nombre) });
  insertar([o]);
}

function guardarComoBloque(nombre) {
  const objs = selObjs();
  if (!objs.length || !nombre) return;
  const b = cajaDe(objs.flatMap((o) => esquinas(o)));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const objetos = objs.map((o) => {
    const c = structuredClone(o);
    c.pos = [r3(o.pos[0] - cx), r3(o.pos[1] - cy)];
    delete c.fijo;
    delete c.grupo;
    return c;
  });
  bloques.push({ id: nuevoId(), nombre, objetos, ancho: r3(b.maxX - b.minX), fondo: r3(b.maxY - b.minY) });
  guardarDatosGenerales('bloques');
  renderBiblioteca();
  aviso(`Bloque "${nombre}" guardado con ${objetos.length} objetos. Está en la biblioteca, en "Mis bloques".`);
}

function insertarBloque(id, punto = null) {
  const bl = bloques.find((x) => x.id === id);
  if (!bl || !estado.escena) return;
  const [x, y] = punto || centroDeVista();
  const grupo = nuevoId();
  const usados = new Set(estado.escena.objetos.map((o) => o.nombre));
  const copias = normalizarEscena({ objetos: structuredClone(bl.objetos) }).objetos.map((o) => {
    let nombre = o.nombre;
    for (let n = 2; usados.has(nombre); n++) nombre = `${o.nombre.replace(/\s\d+$/, '')} ${n}`;
    usados.add(nombre);
    return { ...o, id: nuevoId(), nombre, grupo, pos: [r3(o.pos[0] + ajustar(x)), r3(o.pos[1] + ajustar(y))] };
  });
  insertar(copias);
  aviso(`"${bl.nombre}" agregado: ${copias.length} objetos agrupados. Se mueven juntos; para separarlos, Ctrl+Shift+G.`);
}

// Grupos: los objetos con el mismo "grupo" se eligen juntos con un clic en la vista.
function idsDelGrupo(id) {
  const o = objPorId(id);
  if (!o?.grupo) return [id];
  return estado.escena.objetos.filter((x) => x.grupo === o.grupo).map((x) => x.id);
}

function agrupar() {
  const objs = selObjs();
  if (objs.length < 2) return aviso('Elegí dos objetos o más para agruparlos.', 'error');
  antesDeCambiar();
  const g = nuevoId();
  for (const o of objs) o.grupo = g;
  marcarCambio({ lista: true, detalle: true });
  aviso(`${objs.length} objetos agrupados. Un clic en cualquiera elige el grupo entero.`);
}

function desagrupar() {
  const objs = selObjs().filter((o) => o.grupo);
  if (!objs.length) return;
  antesDeCambiar();
  for (const o of objs) delete o.grupo;
  marcarCambio({ lista: true, detalle: true });
  aviso('Grupo separado.');
}

// Capas propias: además de las categorías, capas por disciplina o etapa ("Emergencia", "Armado") que se
// pueden ocultar en la vista y sacar del plano impreso.
const capaDe = (o) => (o.capa ? estado.escena?.capas?.find((c) => c.id === o.capa) || null : null);
const capaOculta = (o) => Boolean(capaDe(o)?.oculta);

function nuevaCapa(nombre) {
  const e = estado.escena;
  if (!nombre?.trim()) return null;
  const colores = ['#2447f5', '#8a4fff', '#e8aa4c', '#2fbf71', '#d23a3a', '#36c6ff', '#ff3ea5'];
  const c = { id: nuevoId(), nombre: nombre.trim(), color: colores[(e.capas?.length || 0) % colores.length] };
  e.capas = [...(e.capas || []), c];
  return c;
}

function htmlCapasPropias() {
  const e = estado.escena;
  const capas = e.capas || [];
  const filas = capas
    .map((c) => {
      const n = e.objetos.filter((o) => o.capa === c.id).length;
      return `<li class="capa-propia">
        <span class="punto-capa" style="background:${esc(c.color || '#2447f5')}"></span>
        <span class="item-nombre">${esc(c.nombre)}</span><span class="cuenta">${n}</span>
        <button class="mini" data-capa-ojo="${esc(c.id)}" title="${c.oculta ? 'Mostrar' : 'Ocultar'}">${icono(c.oculta ? 'ojoNo' : 'ojo')}</button>
        <button class="mini" data-capa-borrar="${esc(c.id)}" title="Borrar la capa (los objetos quedan)">${icono('cerrar')}</button>
      </li>`;
    })
    .join('');
  return `<section class="grupo-cat capas-propias"><header><span class="cat-nombre">Capas</span><span class="cuenta">${capas.length}</span>
    <button class="mini" data-capa-nueva title="Nueva capa">${icono('mas')}</button></header>
    ${capas.length ? `<ul>${filas}</ul>` : '<p class="vacio-panel chico" title="Por ejemplo: Emergencia, Armado del sábado. Cada objeto elige su capa en el panel de la derecha.">Sin capas propias. Tocá + para crear una.</p>'}</section>`;
}

/* ================================================================== fondo aéreo y ubicación real */

// Imagen aérea (captura de Google Maps o Google Earth) apoyada en el piso a escala real. Se calibra con
// dos puntos: con sus coordenadas (escala y norte a la vez) o con la distancia entre ellos.
let calibracion = null;
const texturas = new Map();

const urlFondo = () => (estado.escena?.fondo ? `/fotos/${estado.slug}/${encodeURIComponent(estado.escena.fondo.archivo)}` : null);

function cargarTexturaFondo(url) {
  if (!texturas.has(url)) {
    texturas.set(
      url,
      new THREE.TextureLoader().loadAsync(url).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        return t;
      })
    );
  }
  return texturas.get(url);
}

function construirFondo() {
  vaciar(fondoG);
  const f = estado.escena?.fondo;
  if (!f || f.oculto || !estado.ver.fondo) return;
  const geo = new THREE.PlaneGeometry(f.ancho, f.ancho * (f.proporcion || 0.75));
  geo.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: f.opacidad ?? 0.9, depthWrite: false, toneMapped: false, color: '#ffffff' });
  const malla = new THREE.Mesh(geo, material);
  malla.userData.propio = true;
  malla.raycast = () => {};
  malla.renderOrder = 1;
  malla.position.set(f.pos[0], 0.003, f.pos[1]);
  malla.rotation.y = -THREE.MathUtils.degToRad(f.rot || 0);
  fondoG.add(malla);
  const url = urlFondo();
  cargarTexturaFondo(url)
    .then((t) => {
      material.map = t;
      material.needsUpdate = true;
      // Si la proporción guardada no coincide con la imagen, se corrige (por ejemplo, si la cambiaron a mano).
      const prop = t.image.height / t.image.width;
      if (Math.abs(prop - (f.proporcion || 0)) > 0.005 && estado.escena?.fondo === f) {
        f.proporcion = r3(prop);
        construirFondo();
        marcarCambio();
      }
    })
    .catch(() => aviso(`No se encontró la imagen de fondo (fotos/${estado.slug}/${f.archivo}).`, 'error'));
}

function cargarImagen(url) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

const marcaArchivo = () => {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}-${dos(d.getMinutes())}-${dos(d.getSeconds())}`;
};

// Guarda la imagen en fotos/<escena>/ y la pone de fondo, del tamaño aproximado del lugar, para calibrarla.
async function ponerImagenFondo(blob) {
  if (!estado.escena || !blob?.type?.startsWith('image/')) return;
  const ext = blob.type === 'image/jpeg' ? '.jpg' : blob.type === 'image/webp' ? '.webp' : '.png';
  aviso('Guardando la imagen…');
  try {
    const local = URL.createObjectURL(blob);
    const img = await cargarImagen(local);
    URL.revokeObjectURL(local);
    const r = await fetch(`/api/fotos/${estado.slug}?nombre=${encodeURIComponent(`fondo-${marcaArchivo()}${ext}`)}`, { method: 'POST', body: blob });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
    const { nombre } = await r.json();
    const b = limites();
    const hayContenido = estado.escena.areas.length || estado.escena.objetos.length;
    const anterior = estado.escena.fondo;
    antesDeCambiar();
    estado.escena.fondo = {
      archivo: nombre,
      pos: anterior?.pos || (hayContenido ? [r3((b.minX + b.maxX) / 2), r3((b.minY + b.maxY) / 2)] : [0, 0]),
      ancho: anterior?.ancho || (hayContenido ? r3(Math.max(100, (b.maxX - b.minX) * 2)) : 200),
      proporcion: r3(img.naturalHeight / img.naturalWidth),
      rot: anterior?.rot || 0,
      opacidad: 0.9,
      opacidadPlano: 0.55,
      oculto: false,
      enPlano: true,
      fuente: 'Captura',
    };
    construirFondo();
    if (!hayContenido) encuadrar();
    marcarCambio({ detalle: true });
    cargarFotos();
    aviso('Imagen de fondo lista. Ahora calibrá la escala: marcá dos puntos lejanos de la imagen.', 'ok', 8000);
    iniciarCalibracion('calibrar');
  } catch (err) {
    aviso(`No se pudo poner la imagen de fondo: ${err.message}.`, 'error', 8000);
  }
}

function iniciarCalibracion(modo, extra = {}) {
  if ((modo === 'calibrar' || modo === 'alinear') && !estado.escena?.fondo) return aviso('Primero pegá o elegí una imagen de fondo.', 'error');
  if (modo === 'alinearCad' && !estado.escena?.fondoCAD) return;
  if (estado.vista !== 'planta') ponerVista('planta');
  ponerHerramienta(modo);
  calibracion = { modo, a: null, ...extra };
  dibujarCalibracion();
}

function dibujarCalibracion() {
  vaciar(guiaG);
  if (!calibracion?.a) return;
  const m = new THREE.Mesh(geoPunto, matPunto);
  m.position.set(calibracion.a[0], 0.05, calibracion.a[1]);
  m.scale.setScalar(2);
  m.renderOrder = 12;
  guiaG.add(m);
  const et = etiqueta(calibracion.modo === 'alinear' ? 'Punto de la imagen' : 'Punto A', 'cinta', [0.5, 1.6]);
  et.position.copy(m.position);
  guiaG.add(et);
}

function clicCalibracion(p) {
  const c = calibracion;
  if (!c) return;
  if (c.modo === 'ubicar') return ubicarEn(p);
  if (!c.a) {
    c.a = p;
    dibujarCalibracion();
    aviso(c.modo === 'alinear' ? 'Ahora hacé clic donde tiene que quedar ese punto.' : 'Ahora marcá el segundo punto, lo más lejos posible del primero.');
    return;
  }
  const A = c.a;
  const B = p;
  if (c.modo === 'alinear') {
    moverFondo(B[0] - A[0], B[1] - A[1]);
    ponerHerramienta('seleccionar');
    return;
  }
  if (c.modo === 'alinearCad') {
    const f = estado.escena.fondoCAD;
    antesDeCambiar();
    f.pos = [r3(f.pos[0] + B[0] - A[0]), r3(f.pos[1] + B[1] - A[1])];
    construirCAD();
    marcarCambio({ detalle: true });
    ponerHerramienta('seleccionar');
    return aviso('Plano movido.');
  }
  if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 0.5) return aviso('Los dos puntos están muy cerca. Elegí puntos lejanos entre sí.', 'error');
  c.b = B;
  abrirDialogoCalibrar();
}

function moverFondo(dx, dy) {
  const e = estado.escena;
  antesDeCambiar();
  e.fondo.pos = [r3(e.fondo.pos[0] + dx), r3(e.fondo.pos[1] + dy)];
  if (e.geo?.desdeFondo) e.geo = { ...e.geo, x: r3(e.geo.x + dx), y: r3(e.geo.y + dy) };
  construirFondo();
  marcarCambio({ detalle: true });
  aviso('Fondo movido.');
}

function abrirDialogoCalibrar() {
  const dlg = $('#dlg-calibrar');
  const c = calibracion;
  $('#cal-distancia-imagen').textContent = `${fm(Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]), 1)} m`;
  for (const id of ['#cal-a', '#cal-b', '#cal-distancia']) $(id).value = '';
  for (const id of ['#cal-a-ok', '#cal-b-ok']) $(id).textContent = '';
  mostrarModoCalibrar('coordenadas');
  dlg.showModal();
  $('#cal-a').focus();
}

function mostrarModoCalibrar(modo) {
  for (const b of $$('#dlg-calibrar [data-cal-modo]')) b.setAttribute('aria-selected', String(b.dataset.calModo === modo));
  $('#cal-coordenadas').hidden = modo !== 'coordenadas';
  $('#cal-medida').hidden = modo !== 'distancia';
  $('#dlg-calibrar').dataset.modo = modo;
}

function aplicarCalibracion() {
  const c = calibracion;
  const e = estado.escena;
  const f = e.fondo;
  if (!c?.b || !f) return false;
  const A = c.a;
  const B = c.b;
  let escala;
  let geo = null;
  let mensaje;
  if ($('#dlg-calibrar').dataset.modo === 'coordenadas') {
    const ga = leerCoordenadas($('#cal-a').value);
    const gb = leerCoordenadas($('#cal-b').value);
    if (!ga || !gb) {
      aviso('Pegá las coordenadas de los dos puntos (por ejemplo: -34.60372, -58.38161).', 'error');
      return false;
    }
    const r = calibrarConCoordenadas(A, B, ga, gb);
    if (!r) {
      aviso('Las coordenadas están demasiado cerca entre sí. Elegí puntos más lejanos.', 'error');
      return false;
    }
    escala = r.escala;
    geo = { ...r.geo, desdeFondo: true };
    mensaje = `Escala lista: entre los dos puntos hay ${fm(r.real, 1)} m. El norte quedó ubicado.`;
  } else {
    const d = leerNumero($('#cal-distancia').value);
    if (!d || d <= 0) {
      aviso('Escribí la distancia real entre los dos puntos, en metros.', 'error');
      return false;
    }
    escala = d / Math.hypot(B[0] - A[0], B[1] - A[1]);
    mensaje = `Escala lista: entre los dos puntos hay ${fm(d, 1)} m.`;
  }
  antesDeCambiar();
  f.pos = [r3(A[0] + (f.pos[0] - A[0]) * escala), r3(A[1] + (f.pos[1] - A[1]) * escala)];
  f.ancho = r3(f.ancho * escala);
  f.calibrado = geo ? 'coordenadas' : 'distancia';
  if (geo) e.geo = geo;
  else if (e.geo?.desdeFondo) e.geo = { ...e.geo, x: r3(A[0] + (e.geo.x - A[0]) * escala), y: r3(A[1] + (e.geo.y - A[1]) * escala) };
  construirFondo();
  construirGrilla();
  marcarCambio({ detalle: true });
  ponerHerramienta('seleccionar');
  encuadrar();
  aviso(`${mensaje} La imagen mide ${fm(f.ancho, 0)} m de ancho. Probá medir algo conocido con la herramienta Medir (M) para confirmar.`, 'ok', 9000);
  return true;
}

// Ubicación sin imagen: un punto de la escena con sus coordenadas.
function ubicarEn(p) {
  const coords = calibracion?.coords;
  if (!coords) return;
  antesDeCambiar();
  estado.escena.geo = { lat: coords[0], lng: coords[1], x: r3(p[0]), y: r3(p[1]), norte: estado.escena.geo?.norte || 0 };
  marcarCambio({ detalle: true });
  ponerHerramienta('seleccionar');
  aviso('Escena ubicada. Ajustá hacia dónde está el norte si no es hacia arriba.');
}

// Un marcador en la escena a partir de coordenadas copiadas de Google Maps.
function marcarCoordenadas(texto) {
  const e = estado.escena;
  const c = leerCoordenadas(texto);
  if (!c) return aviso('No reconozco esas coordenadas. Copialas de Google Maps (clic derecho sobre el lugar).', 'error');
  if (!tieneGeo(e)) return aviso('Primero ubicá la escena en el mapa (calibrando el fondo con coordenadas, por ejemplo).', 'error');
  const [x, y] = geoAEscena(e, c);
  const o = { id: nuevoId(), tipo: 'marcador', nombre: nombreUnico('Punto de Google Maps'), pos: [r3(x), r3(y)], rot: 0, dims: [...TIPOS.marcador.dims], nota: textoCoordenadas(c) };
  antesDeCambiar();
  e.objetos.push(o);
  agregarObjeto3D(o);
  marcarCambio({ lista: true });
  ponerSeleccion([o.id]);
  centrarEn(o);
  aviso(`Marcador ubicado a ${fm(Math.hypot(x - e.geo.x, y - e.geo.y), 0)} m del punto de referencia.`);
}

function htmlFondo() {
  const e = estado.escena;
  const f = e.fondo;
  if (!f) {
    return seccion(
      'Fondo y escala',
      `<p class="dato">Usá una captura de <strong>Google Maps</strong> o <strong>Google Earth</strong> en vista satélite como base: la app la pone a escala real y no hace falta medir las distancias largas en el lugar.</p>
      <ol class="pasos">
        <li>En Google Maps, poné la vista satélite y encuadrá el predio entero.</li>
        <li>Sacá una captura (Windows + Shift + S) y pegala acá con <kbd>Ctrl</kbd> + <kbd>V</kbd>, o elegila desde un archivo.</li>
        <li>Marcá dos puntos lejanos de la imagen y pegá sus coordenadas: en Google Maps, clic derecho sobre cada lugar y tocá los números para copiarlos.</li>
      </ol>
      <div class="fila-botones"><button class="primario" data-accion="fondo-elegir">${icono('imagen')} Elegir imagen</button></div>
      ${htmlFondoCAD()}`,
      { abierta: !e.objetos.length || !e.areas.length }
    );
  }
  const estadoCal =
    f.calibrado === 'coordenadas'
      ? `<p class="dato ok">${icono('check')} A escala con coordenadas: ${fm(f.ancho, 0)} m de ancho.</p>`
      : f.calibrado === 'distancia'
        ? `<p class="dato ok">${icono('check')} A escala con una distancia: ${fm(f.ancho, 0)} m de ancho.</p>`
        : `<p class="dato aviso">${icono('advertencia')} Todavía no está a escala. Calibrala antes de dibujar encima.</p>`;
  return seccion(
    'Fondo y escala',
    `${estadoCal}
    <div class="fila-botones">
      <button class="${f.calibrado ? '' : 'primario'}" data-accion="fondo-calibrar">${icono('escala')} Calibrar escala</button>
      <button data-accion="fondo-mover">${icono('mano')} Mover</button>
    </div>
    <div class="campos">
      ${campoNum('data-escena', 'fondo.ancho', 'Ancho de la imagen', f.ancho, 'm', 1)}
      ${campoNum('data-escena', 'fondo.rot', 'Giro', f.rot || 0, '°', 1)}
    </div>
    <label class="campo"><span>Opacidad en la vista</span><input type="range" min="10" max="100" step="5" data-escena="fondo.opacidad" value="${Math.round((f.opacidad ?? 0.9) * 100)}"></label>
    <label class="check"><input type="checkbox" data-escena="fondo.enPlano"${f.enPlano !== false ? ' checked' : ''}> Mostrarla en el plano impreso</label>
    <label class="check"><input type="checkbox" data-escena="fondo.oculto"${f.oculto ? ' checked' : ''}> Ocultarla</label>
    <div class="fila-botones"><button data-accion="fondo-elegir">${icono('imagen')} Cambiar imagen</button><button class="peligro" data-accion="fondo-quitar">${icono('basura')} Quitar</button></div>
    <p class="ayuda">Imagen: ${esc(f.archivo)}. Las imágenes de Google Maps y Google Earth son de Google y sus proveedores: usalas para planificar, no las publiques.</p>
    ${htmlFondoCAD()}`,
    { abierta: !f.calibrado }
  );
}

function htmlUbicacion() {
  const e = estado.escena;
  const g = e.geo;
  if (!tieneGeo(e)) {
    return seccion(
      'Ubicación en el mapa',
      `<p class="dato">Con la escena ubicada se pueden marcar puntos pegando coordenadas, ver la flecha del norte en el plano, el sol a cada hora, el QR para llegar y exportar a Google Earth.</p>
      <p class="ayuda">Lo más fácil: calibrar el fondo con coordenadas. Si no tenés imagen, pegá las coordenadas de un punto y marcalo en la escena.</p>
      <label class="campo"><span>Coordenadas de un punto</span><input type="text" id="geo-coords" placeholder="-34.60372, -58.38161" autocomplete="off" spellcheck="false"></label>
      <div class="fila-botones"><button data-accion="geo-ubicar">${icono('coordenadas')} Marcar ese punto en la escena</button></div>`,
      { abierta: false }
    );
  }
  const centro = escenaAGeo(e, [g.x, g.y]);
  return seccion(
    'Ubicación en el mapa',
    `<p class="dato ok">${icono('coordenadas')} ${textoCoordenadas(centro, 5)}${g.desdeFondo ? ' (desde el fondo)' : ''}</p>
    ${campoNum('data-escena', 'geo.norte', 'Norte (giro respecto de arriba)', g.norte || 0, '°', 1)}
    <div class="fila-botones">
      <a class="boton" href="${enlaceGoogleMaps(centro)}" target="_blank" rel="noopener">${icono('enlace')} Abrir en Google Maps</a>
    </div>
    <label class="campo"><span>Marcar un punto por coordenadas</span><input type="text" id="geo-marcar" placeholder="Pegá coordenadas de Google Maps" autocomplete="off" spellcheck="false"></label>
    <div class="fila-botones"><button data-accion="geo-marcar">${icono('marcador')} Marcar</button><button class="peligro" data-accion="geo-quitar">Quitar ubicación</button></div>`,
    { abierta: false }
  );
}

/* ================================================================== versiones anteriores */

function textoFecha(ms) {
  const d = new Date(ms);
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dias = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
  if (dias === 0) return `Hoy ${hora}`;
  if (dias === 1) return `Ayer ${hora}`;
  return `${d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })} ${hora}`;
}

function hace(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

// JSON con las claves ordenadas, para comparar sin que importe el orden en que quedaron escritas.
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

// Qué pasaría con la escena abierta si se vuelve a esa versión.
function textoDiferencias(vieja, actual) {
  const porId = (lista) => new Map(lista.map((o) => [o.id, canonico(o)]));
  const a = porId(actual.objetos);
  const v = porId(vieja.objetos);
  let vuelven = 0;
  let cambian = 0;
  for (const [id, t] of v) {
    if (!a.has(id)) vuelven++;
    else if (a.get(id) !== t) cambian++;
  }
  let salen = 0;
  for (const id of a.keys()) if (!v.has(id)) salen++;
  const resto = (e) => canonico({ ...e, objetos: null, areas: null });
  const partes = [];
  if (vuelven) partes.push(`vuelven ${vuelven} objeto${vuelven === 1 ? '' : 's'}`);
  if (salen) partes.push(`se ${salen === 1 ? 'va' : 'van'} ${salen}`);
  if (cambian) partes.push(`${cambian} cambia${cambian === 1 ? '' : 'n'} de lugar o medida`);
  if (canonico(vieja.areas) !== canonico(actual.areas)) partes.push('cambia el lugar (ambientes o paredes)');
  if (resto(vieja) !== resto(actual)) partes.push('cambian cotas, hoja o datos del proyecto');
  const n = vieja.objetos.length;
  const base = `${n} objeto${n === 1 ? '' : 's'}`;
  if (!partes.length) return { igual: true, html: `${base}. <span class="igual">Igual a como está ahora.</span>` };
  return { igual: false, html: `${base}. Si volvés: ${partes.join(', ')}.` };
}

async function abrirVersiones() {
  if (!estado.escena) return;
  const dlg = $('#dlg-versiones');
  if (!dlg.open) dlg.showModal();
  await cargarVersiones();
}

let cargaVersiones = 0;
async function cargarVersiones() {
  const turno = ++cargaVersiones;
  const slug = estado.slug;
  const cont = $('#versiones-lista');
  cont.innerHTML = '<li class="versiones-vacio">Buscando versiones…</li>';
  let lista;
  try {
    const r = await fetch(`/api/respaldos/${slug}`, { cache: 'no-store' });
    if (!r.ok) throw new Error();
    lista = await r.json();
  } catch {
    cont.innerHTML =
      '<li class="versiones-vacio">No se pudieron leer las versiones. Si la herramienta se abrió antes de esta actualización, cerrá la ventanita negra y abrila de nuevo.</li>';
    return;
  }
  if (turno !== cargaVersiones) return;
  if (!lista.length) {
    cont.innerHTML = '<li class="versiones-vacio">Todavía no hay versiones de esta escena. Se guardan solas a medida que la cambiás, o con “Guardar versión ahora”.</li>';
    return;
  }
  cont.innerHTML = lista
    .map(
      (v) => `<li class="version" data-archivo="${esc(v.archivo)}">
        <div class="version-fecha">${textoFecha(v.fecha)}<small>${hace(v.fecha)}</small></div>
        <div class="version-detalle">Leyendo…</div>
        <button type="button" class="boton" data-volver="${esc(v.archivo)}" data-fecha="${v.fecha}" disabled>Volver a esta</button>
      </li>`
    )
    .join('');
  // Se lee cada versión para mostrar qué cambiaría; son archivos chicos y locales.
  for (const v of lista) {
    if (turno !== cargaVersiones || estado.slug !== slug) return;
    const fila = cont.querySelector(`[data-archivo="${CSS.escape(v.archivo)}"]`);
    const detalle = fila.querySelector('.version-detalle');
    try {
      const r = await fetch(`/api/respaldos/${slug}/${encodeURIComponent(v.archivo)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const dif = textoDiferencias(normalizarEscena(await r.json()), estado.escena);
      detalle.innerHTML = dif.html;
      fila.querySelector('button').disabled = dif.igual;
    } catch {
      detalle.textContent = 'El archivo tiene un error y no se puede usar.';
    }
  }
}

async function volverAVersion(boton) {
  const { volver: archivo, fecha } = boton.dataset;
  const slug = estado.slug;
  boton.disabled = true;
  try {
    const r = await fetch(`/api/respaldos/${slug}/${encodeURIComponent(archivo)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('no se encontró el archivo');
    const texto = await r.text();
    JSON.parse(texto);
    // Primero se guarda lo pendiente, así la versión que se deja queda completa en el respaldo.
    await guardarPendiente();
    antesDeCambiar();
    restaurar(texto);
    clearTimeout(temporizadorGuardado);
    if (!(await guardar({ respaldar: true }))) throw new Error('no se pudo guardar');
    $('#dlg-versiones').close();
    aviso(`Volviste a la versión de ${textoFecha(Number(fecha)).toLowerCase()}. Lo que había quedó guardado como versión, y Ctrl+Z lo trae de vuelta.`, 'ok', 7000);
  } catch (err) {
    boton.disabled = false;
    aviso(`No se pudo volver a esa versión: ${err.message}.`, 'error');
  }
}

async function guardarVersionAhora(boton) {
  boton.disabled = true;
  try {
    if (!(await guardarPendiente())) throw new Error('no se pudo guardar la escena');
    const r = await fetch(`/api/respaldos/${estado.slug}`, { method: 'POST' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
    const { nueva } = await r.json();
    aviso(nueva ? 'Versión guardada.' : 'La escena ya estaba guardada así: es la versión más nueva de la lista.');
    await cargarVersiones();
  } catch (err) {
    aviso(`No se pudo guardar la versión: ${err.message}.`, 'error');
  } finally {
    boton.disabled = false;
  }
}

/* ================================================================== fotos */

let fotos = [];

async function cargarFotos() {
  if (!estado.slug) return;
  try {
    fotos = await (await fetch(`/api/fotos/${estado.slug}`, { cache: 'no-store' })).json();
  } catch {
    fotos = [];
  }
  $('#cuenta-fotos').textContent = fotos.length ? String(fotos.length) : '';
  $('#fotos-carpeta').textContent = `fotos/${estado.slug}`;
  $('#fotos-rejilla').innerHTML = fotos.length
    ? fotos.map((f) => `<button class="miniatura" data-foto="${esc(f.url)}" title="${esc(f.nombre)}"><img src="${esc(f.url)}" alt="${esc(f.nombre)}" loading="lazy"></button>`).join('')
    : '<p class="vacio-panel">Todavía no hay fotos de este lugar.</p>';
}

async function subirFotos(archivos) {
  if (!estado.slug) return;
  let ok = 0;
  for (const f of archivos) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
      aviso(`${f.name}: solo se aceptan JPG, PNG, WebP o GIF. Si es HEIC (iPhone), exportala como JPG.`, 'error', 6000);
      continue;
    }
    const r = await fetch(`/api/fotos/${estado.slug}?nombre=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
    if (r.ok) ok++;
    else aviso(`${f.name}: ${(await r.json().catch(() => ({}))).error || 'no se pudo guardar'}`, 'error');
  }
  if (ok) aviso(ok === 1 ? 'Foto guardada.' : `${ok} fotos guardadas.`);
  cargarFotos();
}

function abrirFotos(abrir = true) {
  $('#fotos').hidden = !abrir;
  $('#btn-fotos').setAttribute('aria-pressed', String(abrir));
}

/* ================================================================== exportar */

const nombreArchivo = () => estado.slug || 'escena';

const exportar = {
  async pdf() {
    aviso('Armando el PDF…');
    const r = hojasDelPlano(await fondoComoDatos());
    try {
      await pdfDeHojas(r.hojas, r.tamano, `${nombreArchivo()}-plano.pdf`);
      aviso('PDF descargado.');
    } catch (err) {
      aviso(`No se pudo armar el PDF: ${err.message}. Probá “Descargar SVG”.`, 'error', 8000);
    }
  },
  async svg() {
    const r = hojasDelPlano(await fondoComoDatos());
    descargarTexto(r.hojas[0], `${nombreArchivo()}-plano.svg`, 'image/svg+xml');
  },
  csv() {
    descargarTexto(csvComputo(estado.escena, computarTodo(estado.escena)), `${nombreArchivo()}-materiales.csv`, 'text/csv');
  },
  png() {
    if (!enVista3D()) ponerVista('3d');
    if (estado.vista === '3d') composer.render();
    else renderer.render(mundo, camActiva());
    renderer.domElement.toBlob((b) => b && descargarBlob(b, `${nombreArchivo()}.png`));
  },
  glb() {
    new GLTFExporter().parse(
      [lugarG, objetosG],
      (res) => descargarBlob(new Blob([res], { type: 'model/gltf-binary' }), `${nombreArchivo()}.glb`),
      (err) => aviso(`No se pudo exportar el modelo: ${err.message}`, 'error'),
      { binary: true, onlyVisible: true }
    );
  },
  json() {
    descargarTexto(textoEscena(), `${nombreArchivo()}.json`, 'application/json');
  },
  async visor() {
    aviso('Armando el visor…');
    try {
      const r = hojasDelPlano(await fondoComoDatos());
      const comp = computarTodo(estado.escena);
      const mapaSVG = typeof svgMapaPublico === 'function' ? await svgMapaPublico() : '';
      const html = await crearVisorHTML({ escena: estado.escena, hojas: r.hojas, materialesHTML: materialesHTML(estado.escena, comp), mapaSVG });
      descargarTexto(html, nombreArchivoVisor(estado.escena, estado.slug), 'text/html');
      aviso(`Visor listo (${fm(html.length / 1048576, 1)} MB). Mandalo por WhatsApp o mail: se abre en cualquier celular, sin instalar nada. No lleva costos ni contactos.`, 'ok', 9000);
    } catch (err) {
      console.error(err);
      aviso(`No se pudo armar el visor: ${err.message}`, 'error', 9000);
    }
  },
  kml() {
    if (!tieneGeo(estado.escena)) return aviso('Para Google Earth primero ubicá la escena en el mapa (pestaña Proyecto: "Fondo y escala" o "Ubicación").', 'error', 8000);
    try {
      descargarTexto(exportarKML(estado.escena, { nombre: estado.escena.proyecto?.evento || estado.escena.nombre }), `${nombreArchivo()}.kml`, 'application/vnd.google-earth.kml+xml');
      aviso('Abrilo en Google Earth: Proyectos, Abrir, Importar archivo KML. También sirve en Google My Maps.', 'ok', 8000);
    } catch (err) {
      aviso(err.message, 'error', 8000);
    }
  },
  dxf() {
    descargarTexto(exportarDXF(estado.escena, { incluirArboles: opcionesHoja(estado.escena).arboles }), `${nombreArchivo()}.dxf`, 'application/dxf');
    aviso('Plano en DXF descargado, en metros. Se abre con AutoCAD, LibreCAD o DraftSight.');
  },
};

/* ================================================================== avisos y paneles */

function aviso(texto, tipo = 'ok', ms = 3600) {
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.textContent = texto;
  $('#avisos').append(el);
  setTimeout(() => el.remove(), ms);
}

function cerrarPaneles() {
  for (const id of ['panel-izq', 'panel-der']) $(`#${id}`).classList.remove('abierto');
  $('#btn-panel-izq').setAttribute('aria-expanded', 'false');
  $('#btn-panel-der').setAttribute('aria-expanded', 'false');
}

function alternarPanel(id, boton) {
  const panel = $(`#${id}`);
  const abrir = !panel.classList.contains('abierto');
  cerrarPaneles();
  panel.classList.toggle('abierto', abrir);
  boton.setAttribute('aria-expanded', String(abrir));
}

/* ================================================================== eventos de la interfaz */

function pintarIconos() {
  for (const el of $$('[data-icono]')) el.insertAdjacentHTML('afterbegin', icono(el.dataset.icono));
}

function conectarInterfaz() {
  pintarIconos();
  $$('[data-vista]').forEach((b) => b.addEventListener('click', () => ponerVista(b.dataset.vista)));
  $$('[data-herramienta]').forEach((b) => b.addEventListener('click', () => ponerHerramienta(b.dataset.herramienta)));
  $$('[data-camara]').forEach((b) => b.addEventListener('click', () => camaraPredefinida(b.dataset.camara)));
  $('#btn-encuadrar').addEventListener('click', () => (estado.sel.size ? centrarEn(selObjs()) : encuadrar()));
  $('#btn-caminar').addEventListener('click', () => ponerCaminar(!estado.caminando));
  $('#btn-noche').addEventListener('click', () => ponerNoche(!estado.noche));
  $('#btn-fotos').addEventListener('click', () => abrirFotos($('#fotos').hidden));
  $('#btn-cerrar-fotos').addEventListener('click', () => abrirFotos(false));
  $('#btn-tema').addEventListener('click', () => ponerTema(estado.tema === 'oscuro' ? 'claro' : 'oscuro'));
  $('#btn-ayuda').addEventListener('click', () => $('#dlg-ayuda').showModal());
  $('#btn-deshacer').addEventListener('click', deshacer);
  $('#btn-rehacer').addEventListener('click', rehacer);
  $('#btn-panel-izq').addEventListener('click', (e) => alternarPanel('panel-izq', e.currentTarget));
  $('#btn-panel-der').addEventListener('click', (e) => alternarPanel('panel-der', e.currentTarget));
  $('#sel-escena').addEventListener('change', (e) => abrirEscena(e.target.value));
  $('#btn-vacio-crear').addEventListener('click', () => dialogoEscena('nueva'));
  $('#dlg-escena-cancelar').addEventListener('click', () => $('#dlg-escena').close());
  $('#dlg-escena form').addEventListener('submit', (e) => {
    const nombre = $('#dlg-escena-nombre').value.trim();
    if (!nombre) return e.preventDefault();
    crearEscena(nombre, modoDialogo === 'duplicar');
  });
  $('#dlg-repetir-cancelar').addEventListener('click', () => $('#dlg-repetir').close());
  $('#dlg-repetir form').addEventListener('submit', () => {
    const entero = (id) => Math.max(1, Math.min(200, Math.round(leerNumero($(id).value) || 1)));
    repetir({ columnas: entero('#rep-columnas'), sepX: leerNumero($('#rep-sepx').value) || 1, filas: entero('#rep-filas'), sepY: leerNumero($('#rep-sepy').value) || 1 });
  });
  $('#dlg-ayuda-cerrar').addEventListener('click', () => $('#dlg-ayuda').close());
  $('#dlg-versiones-cerrar').addEventListener('click', () => $('#dlg-versiones').close());

  // Fondo aéreo: elegir archivo, pegar con Ctrl+V y diálogo de calibración.
  $('#cad-archivo').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importarDXF(f);
  });
  $('#fondo-archivo').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) ponerImagenFondo(f);
  });
  window.addEventListener('paste', (e) => {
    if (e.target.closest?.('input, textarea') || !estado.escena) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    ponerImagenFondo(item.getAsFile());
  });
  $('#dlg-calibrar').addEventListener('click', (e) => {
    const m = e.target.closest('[data-cal-modo]');
    if (m) mostrarModoCalibrar(m.dataset.calModo);
  });
  for (const [id, ok] of [
    ['#cal-a', '#cal-a-ok'],
    ['#cal-b', '#cal-b-ok'],
  ]) {
    $(id).addEventListener('input', () => {
      const c = leerCoordenadas($(id).value);
      $(ok).textContent = c ? `✓ ${textoCoordenadas(c, 5)}` : $(id).value.trim() ? 'No reconozco esas coordenadas' : '';
      $(ok).dataset.estado = c ? 'ok' : 'error';
      const a = leerCoordenadas($('#cal-a').value);
      const b = leerCoordenadas($('#cal-b').value);
      $('#cal-real').textContent = a && b ? `Distancia real entre los dos: ${fm(distanciaReal(a, b), 1)} m` : '';
    });
  }
  $('#dlg-calibrar-cancelar').addEventListener('click', () => {
    $('#dlg-calibrar').close();
    ponerHerramienta('seleccionar');
  });
  $('#dlg-calibrar form').addEventListener('submit', (e) => {
    if (!aplicarCalibracion()) e.preventDefault();
  });
  $('#versiones-guardar').addEventListener('click', (e) => guardarVersionAhora(e.currentTarget));
  $('#versiones-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-volver]');
    if (b && !b.disabled) volverAVersion(b);
  });

  // Zoom de la hoja
  $('#hoja-ajustar').addEventListener('click', () => {
    estado.zoomHoja = null;
    aplicarZoomHoja();
  });
  const zoomRel = (f) => {
    const actual = estado.zoomHoja ?? ajusteHoja();
    estado.zoomHoja = Math.min(12, Math.max(0.5, actual * f));
    aplicarZoomHoja();
  };
  $('#hoja-mas').addEventListener('click', () => zoomRel(1.25));
  $('#hoja-menos').addEventListener('click', () => zoomRel(0.8));
  new ResizeObserver(() => estado.vista === 'plano' && aplicarZoomHoja()).observe($('#hoja-contenido'));
  $('#hoja-contenido').addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-ids]');
    if (!fila) return;
    ponerVista('3d');
    ponerSeleccion(fila.dataset.ids.split(','));
    centrarEn(selObjs());
  });

  document.addEventListener('click', (e) => {
    for (const d of $$('details.menu[open]')) if (!d.contains(e.target)) d.open = false;
    const accion = e.target.closest('.menu-lista [data-accion]');
    if (accion) {
      accion.closest('details').open = false;
      const a = accion.dataset.accion;
      if (a === 'versiones') abrirVersiones();
      else if (a === 'duplicar-escena') dialogoEscena('duplicar');
      else if (a === 'nueva-escena') dialogoEscena('nueva');
      else if (a === 'cerrar-app') cerrarApp();
      else if (a === 'datos') {
        ponerVista('3d');
        limpiarSeleccion();
        renderDetalle();
      }
    }
    const exp = e.target.closest('[data-exportar]');
    if (exp && estado.escena) {
      exp.closest('details')?.removeAttribute('open');
      exportar[exp.dataset.exportar]?.();
    }
    const irVista = e.target.closest('[data-ir-vista]');
    if (irVista) ponerVista(irVista.dataset.irVista);
  });

  // Pie: preferencias de vista
  const paso = $('#sel-paso');
  paso.value = String(estado.paso);
  paso.addEventListener('change', () => {
    estado.paso = Number(paso.value);
    guardarPref();
  });
  for (const clave of ['nombres', 'cotas', 'grilla', 'transparentar', 'copas', 'ao', 'fondo']) {
    const c = $(`#ver-${clave}`);
    if (!c) continue;
    c.checked = estado.ver[clave];
    c.addEventListener('change', () => {
      estado.ver[clave] = c.checked;
      aplicarVisibilidad();
      if (clave === 'fondo') construirFondo();
      guardarPref();
    });
  }

  // Panel izquierdo
  const izq = $('#panel-izq');
  $('#buscar-capas').addEventListener('input', (e) => {
    filtroCapas = e.target.value;
    renderLista();
  });
  $('#buscar-biblioteca').addEventListener('input', (e) => {
    filtroBiblioteca = e.target.value;
    renderBiblioteca();
  });
  izq.addEventListener('click', (e) => {
    const pest = e.target.closest('[data-pestana], [data-ir]');
    if (pest) return mostrarPestana(pest.dataset.pestana || pest.dataset.ir);
    const ojo = e.target.closest('[data-ojo]');
    if (ojo) {
      const c = ojo.dataset.ojo;
      if (estado.ocultas.has(c)) estado.ocultas.delete(c);
      else estado.ocultas.add(c);
      aplicarVisibilidad();
      construirLuces();
      renderLista();
      guardarPref();
      return;
    }
    const candado = e.target.closest('[data-bloquear]');
    if (candado) {
      const c = candado.dataset.bloquear;
      if (estado.bloqueadas.has(c)) estado.bloqueadas.delete(c);
      else estado.bloqueadas.add(c);
      renderLista();
      guardarPref();
      return;
    }
    const cotaItem = e.target.closest('[data-cota-item]');
    if (cotaItem) return seleccionarCota(cotaItem.dataset.cotaItem);
    const item = e.target.closest('[data-id]');
    if (item) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) alternarSeleccion(item.dataset.id);
      else ponerSeleccion([item.dataset.id]);
      return;
    }
    const borrarEquipo = e.target.closest('[data-borrar-catalogo]');
    if (borrarEquipo) {
      const c = catalogo.find((x) => x.id === borrarEquipo.dataset.borrarCatalogo);
      if (c && confirm(`¿Sacar "${c.nombre}" de tu catálogo? Lo que ya está en las escenas no cambia.`)) {
        catalogo = catalogo.filter((x) => x !== c);
        guardarDatosGenerales('catalogo');
        renderBiblioteca();
      }
      return;
    }
    const borrarBloque = e.target.closest('[data-borrar-bloque]');
    if (borrarBloque) {
      const b = bloques.find((x) => x.id === borrarBloque.dataset.borrarBloque);
      if (b && confirm(`¿Borrar el bloque "${b.nombre}"? Lo que ya está en las escenas no cambia.`)) {
        bloques = bloques.filter((x) => x !== b);
        guardarDatosGenerales('bloques');
        renderBiblioteca();
      }
      return;
    }
    const equipo = e.target.closest('[data-catalogo]');
    if (equipo) return agregarDesdeCatalogo(equipo.dataset.catalogo);
    const bloque = e.target.closest('[data-bloque]');
    if (bloque) return insertarBloque(bloque.dataset.bloque);
    const capaOjo = e.target.closest('[data-capa-ojo]');
    if (capaOjo) {
      const c = estado.escena.capas?.find((x) => x.id === capaOjo.dataset.capaOjo);
      if (!c) return;
      antesDeCambiar();
      if (c.oculta) delete c.oculta;
      else c.oculta = true;
      aplicarVisibilidad();
      construirLuces();
      return marcarCambio({ lista: true });
    }
    const capaBorrar = e.target.closest('[data-capa-borrar]');
    if (capaBorrar) {
      const id = capaBorrar.dataset.capaBorrar;
      antesDeCambiar();
      estado.escena.capas = (estado.escena.capas || []).filter((x) => x.id !== id);
      for (const o of estado.escena.objetos) if (o.capa === id) delete o.capa;
      aplicarVisibilidad();
      return marcarCambio({ lista: true, detalle: true });
    }
    if (e.target.closest('[data-capa-nueva]')) {
      pedirTexto({ titulo: 'Nueva capa', etiqueta: 'Nombre de la capa', ayuda: 'Lo que tengas elegido pasa a esa capa. Después podés cambiar la capa de cada objeto en el panel de la derecha.' }).then((nombre) => {
        if (!nombre) return;
        antesDeCambiar();
        const c = nuevaCapa(nombre);
        if (c) for (const o of selObjs()) o.capa = c.id;
        aplicarVisibilidad();
        marcarCambio({ lista: true, detalle: true });
      });
      return;
    }
    const tipo = e.target.closest('[data-tipo]');
    if (tipo) agregar(tipo.dataset.tipo);
  });
  izq.addEventListener('dblclick', (e) => {
    const item = e.target.closest('[data-id]');
    if (item) centrarEn(objPorId(item.dataset.id));
  });
  izq.addEventListener('dragstart', (e) => {
    const tipo = e.target.closest?.('[data-tipo], [data-catalogo], [data-bloque]');
    if (!tipo) return;
    if (tipo.dataset.tipo) e.dataTransfer.setData('text/x-tipo', tipo.dataset.tipo);
    if (tipo.dataset.catalogo) e.dataTransfer.setData('text/x-catalogo', tipo.dataset.catalogo);
    if (tipo.dataset.bloque) e.dataTransfer.setData('text/x-bloque', tipo.dataset.bloque);
    e.dataTransfer.effectAllowed = 'copy';
  });

  // Inspector
  const der = $('#panel-der');
  let editando = false;
  der.addEventListener('focusout', (e) => {
    editando = false;
    if (e.target.matches('input[inputmode=decimal]')) {
      refrescarCampos();
      if (estado.sel.size > 1 || estado.selCota) renderDetalle();
    }
  });
  const empezarEdicion = (antes) => {
    if (editando) return;
    estado.deshacer.push(antes);
    if (estado.deshacer.length > 200) estado.deshacer.shift();
    estado.rehacer.length = 0;
    editando = true;
  };
  der.addEventListener('input', (e) => {
    const t = e.target;
    const antes = estado.ultimo;
    if (t.dataset.escena) {
      if (!aplicarCampoEscena(t)) return;
      empezarEdicion(antes);
      return marcarCambio();
    }
    if (t.dataset.hoja) {
      if (!aplicarHoja(t)) return;
      empezarEdicion(antes);
      marcarCambio();
      return renderPlano();
    }
    // Sol: día, hora y luz real (no cambian la escena).
    if (t.dataset.sol) {
      const k = t.dataset.sol;
      if (k === 'dia' && t.value) estado.sol.dia = t.value;
      else if (k === 'minuto') estado.sol.minuto = Number(t.value);
      else if (k === 'real') estado.sol.real = t.checked;
      return cambioSol();
    }
    if (t.dataset.hojaCapa) {
      const e = estado.escena;
      e.hoja = { ...(e.hoja || {}) };
      const fuera = new Set(e.hoja.capasFuera || []);
      if (t.checked) fuera.delete(t.dataset.hojaCapa);
      else fuera.add(t.dataset.hojaCapa);
      if (fuera.size) e.hoja.capasFuera = [...fuera];
      else delete e.hoja.capasFuera;
      empezarEdicion(antes);
      marcarCambio();
      return renderPlano();
    }
    if (t.dataset.computo) {
      if (!aplicarComputo(t)) return;
      empezarEdicion(antes);
      marcarCambio();
      return renderMateriales();
    }
    if (t.dataset.cota) {
      const c = cotaPorId(estado.selCota);
      if (!c || !aplicarCota(c, t)) return;
      empezarEdicion(antes);
      dibujarCotas();
      return marcarCambio({ lista: true });
    }
    if (t.dataset.multi) {
      const objs = selObjs();
      const r = aplicarMulti(objs, t.dataset.multi, t);
      if (!r) return;
      empezarEdicion(antes);
      if (r === 'color') objs.forEach(reconstruirObjeto);
      else if (r === 'mover') objs.forEach(moverObjeto3D);
      if (r !== 'nada') {
        if (estado.noche) construirLuces();
        actualizarSeleccion3D();
      }
      return marcarCambio();
    }
    const o = selUnico();
    if (!o || !t.dataset.campo) return;
    const resultado = aplicarCampo(o, t.dataset.campo, t);
    if (!resultado) return;
    empezarEdicion(antes);
    if (resultado === 'mover') {
      moverObjeto3D(o);
      if (estado.noche) construirLuces();
    } else if (resultado !== 'nada') reconstruirObjeto(o);
    actualizarSeleccion3D();
    refrescarCampos();
    if (resultado === 'todo') {
      renderDetalle();
      renderLista();
    }
    marcarCambio({ lista: resultado === 'lista' });
  });
  der.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && t.matches('input')) return t.blur();
    if (!t.matches('input[inputmode=decimal]') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const dec = Number(t.dataset.dec ?? 2);
    const paso = dec === 0 ? (e.shiftKey ? 15 : 1) : e.shiftKey ? 0.1 : 0.01;
    const v = (leerNumero(t.value) ?? 0) + (e.key === 'ArrowUp' ? paso : -paso);
    t.value = fm(v, dec);
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  der.addEventListener('click', (e) => {
    const pest = e.target.closest('[data-pestana-detalle]');
    if (pest) {
      estado.pestanaDetalle = pest.dataset.pestanaDetalle;
      return renderDetalle();
    }
    const capaAnalisis = e.target.closest('[data-analisis]');
    if (capaAnalisis) return ponerAnalisis(capaAnalisis.dataset.analisis);
    const varios = e.target.closest('[data-ids]');
    if (varios && !e.target.closest('[data-accion]')) {
      ponerSeleccion(varios.dataset.ids.split(',').filter(Boolean));
      return centrarEn(selObjs());
    }
    if (e.target.closest('[data-accion="conectar-cercano"]')) {
      const cambios = conectarMasCercano(estado.escena);
      const ids = Object.keys(cambios);
      if (!ids.length) return aviso('No hay equipos sin conectar (o no hay tableros).');
      antesDeCambiar();
      for (const id of ids) {
        const o = objPorId(id);
        if (o) o.tablero = cambios[id];
      }
      marcarCambio({ detalle: true });
      construirAnalisis();
      return aviso(`${ids.length} equipo${ids.length === 1 ? '' : 's'} conectado${ids.length === 1 ? '' : 's'} al tablero más cercano con lugar.`);
    }
    const b = e.target.closest('[data-accion], [data-girar], [data-alinear], [data-distribuir], [data-id]');
    if (!b) return;
    if (b.dataset.girar) return girar(Number(b.dataset.girar));
    if (b.dataset.alinear) return alinear(b.dataset.alinear);
    if (b.dataset.distribuir) return distribuir(b.dataset.distribuir);
    if (b.dataset.id && !b.dataset.accion) return ponerSeleccion([b.dataset.id]);
    const a = b.dataset.accion;
    if (a === 'fondo-elegir') $('#fondo-archivo').click();
    else if (a === 'fondo-calibrar') iniciarCalibracion('calibrar');
    else if (a === 'fondo-mover') iniciarCalibracion('alinear');
    else if (a === 'fondo-quitar') {
      antesDeCambiar();
      delete estado.escena.fondo;
      if (estado.escena.geo?.desdeFondo) delete estado.escena.geo.desdeFondo;
      construirFondo();
      marcarCambio({ detalle: true });
      aviso('Fondo quitado. La imagen sigue en la carpeta de fotos. Ctrl+Z lo trae de vuelta.');
    } else if (a === 'geo-ubicar') {
      const c = leerCoordenadas($('#geo-coords')?.value);
      if (!c) return aviso('Pegá coordenadas válidas, por ejemplo: -34.60372, -58.38161.', 'error');
      iniciarCalibracion('ubicar', { coords: c });
    } else if (a === 'geo-marcar') marcarCoordenadas($('#geo-marcar')?.value);
    else if (a === 'geo-quitar') {
      antesDeCambiar();
      delete estado.escena.geo;
      marcarCambio({ detalle: true });
    } else if (a === 'a-poligono') {
      const o = selUnico();
      if (!o) return;
      antesDeCambiar();
      const [w, p] = o.dims;
      o.puntos = [
        [-w / 2, -p / 2],
        [w / 2, -p / 2],
        [w / 2, p / 2],
        [-w / 2, p / 2],
      ].map(([x, y]) => [r3(x), r3(y)]);
      reconstruirObjeto(o);
      actualizarSeleccion3D();
      marcarCambio({ detalle: true });
      if (estado.vista !== 'planta') ponerVista('planta');
      aviso('Arrastrá los puntos para darle forma. Los azules, en el medio de cada lado, agregan un punto.');
    } else if (a === 'a-catalogo') {
      const o = selUnico();
      if (o) guardarEnCatalogo(o);
    } else if (a === 'a-bloque') {
      pedirTexto({ titulo: 'Guardar como bloque', etiqueta: 'Nombre del bloque', ayuda: 'Queda en la biblioteca, en "Mis bloques", para soltarlo entero en cualquier escena.', valor: 'Cabina House Mates' }).then((nombre) => nombre && guardarComoBloque(nombre));
    } else if (a === 'versiones-abrir') abrirVersiones();
    else if (a === 'historial-ahora') {
      guardarPendiente()
        .then(() => fetch('/api/historial', { method: 'POST' }))
        .then(() => {
          aviso('Guardado en el historial.');
          cargarEstadoHistorial();
        })
        .catch(() => aviso('No se pudo guardar en el historial.', 'error'));
    } else if (a === 'cad-elegir') $('#cad-archivo').click();
    else if (a === 'cad-mover') iniciarCalibracion('alinearCad');
    else if (a === 'cad-quitar') {
      antesDeCambiar();
      delete estado.escena.fondoCAD;
      construirCAD();
      marcarCambio({ detalle: true });
    } else if (a === 'nivel-agregar') {
      if (estado.vista !== 'planta') ponerVista('planta');
      ponerHerramienta('nivel');
      dibujarPuntosNivel();
    } else if (a === 'nivel-borrar') {
      antesDeCambiar();
      delete estado.escena.terreno;
      if (estado.analisis === 'terreno') estado.analisis = null;
      construirAnalisis();
      dibujarPuntosNivel();
      marcarCambio({ detalle: true });
    } else if (a === 'nueva-revision') {
      const revs = estado.escena.revisiones || [];
      const rev = siguienteRevision(revs);
      pedirTexto({ titulo: `Revisión ${rev}`, etiqueta: 'Qué cambió', ayuda: 'Una línea alcanza: "Se movió la barra", "Se agregaron dos baños".', valor: revs.length ? '' : 'Primera versión' }).then((nota) => {
        if (!nota) return;
        antesDeCambiar();
        const d = new Date();
        const dos = (n) => String(n).padStart(2, '0');
        estado.escena.revisiones = [...revs, { rev, fecha: `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`, nota }];
        marcarCambio({ detalle: true });
        renderPlano();
        aviso(`Revisión ${rev} marcada. Sale en el cuadro de datos del plano.`);
      });
    } else if (a === 'agrupar') agrupar();
    else if (a === 'desagrupar') desagrupar();
    else if (a === 'duplicar') duplicar();
    else if (a === 'repetir') dialogoRepetir();
    else if (a === 'eliminar') eliminarSeleccion();
    else if (a === 'centrar') centrarEn(selObjs());
    else if (a === 'fijar') {
      const o = selUnico();
      if (!o) return;
      antesDeCambiar();
      if (o.fijo) delete o.fijo;
      else o.fijo = true;
      marcarCambio({ lista: true, detalle: true });
    }
  });

  // Fotos
  $('#fotos-rejilla').addEventListener('click', (e) => {
    const b = e.target.closest('[data-foto]');
    if (!b) return;
    const dlg = $('#dlg-foto');
    $('img', dlg).src = b.dataset.foto;
    $('img', dlg).alt = b.title;
    dlg.showModal();
  });
  $('#dlg-foto').addEventListener('click', (e) => e.currentTarget.close());
  $('#fotos-archivo').addEventListener('change', (e) => {
    subirFotos([...e.target.files]);
    e.target.value = '';
  });
  window.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    document.body.classList.add('soltando');
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) document.body.classList.remove('soltando');
  });
  window.addEventListener('drop', (e) => {
    document.body.classList.remove('soltando');
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    abrirFotos(true);
    subirFotos([...e.dataTransfer.files]);
  });

  // Teclado
  window.addEventListener('keydown', (e) => {
    teclas.add(e.code);
    if (e.target.closest?.('input, textarea, select, dialog')) {
      if (e.key === 'Escape' && !e.target.closest('dialog')) e.target.blur();
      return;
    }
    if (estado.caminando && ctrlR.isLocked) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    // Mientras se dibuja una zona libre o un camino.
    if (trazo && !ctrl) {
      if (k === 'enter') {
        e.preventDefault();
        return terminarTrazo();
      }
      if (k === 'escape') {
        trazo = null;
        return dibujarGuia();
      }
      if (k === 'backspace' || k === 'delete') {
        e.preventDefault();
        trazo.puntos.pop();
        if (!trazo.puntos.length) trazo = null;
        return dibujarGuia();
      }
    }
    if (calibracion && k === 'escape') return ponerHerramienta('seleccionar');
    if (e.code === 'Space' && enVista3D()) {
      e.preventDefault();
      if (!panTemporal) {
        panTemporal = true;
        visor.classList.add('paneando');
        botonesRaton();
      }
      return;
    }
    if (ctrl) {
      const atajos = { z: () => (e.shiftKey ? rehacer() : deshacer()), y: rehacer, d: duplicar, c: copiar, v: pegar, a: seleccionarTodo, g: () => (e.shiftKey ? desagrupar() : agrupar()) };
      if (atajos[k] && (enVista3D() || k === 'z' || k === 'y')) {
        e.preventDefault();
        atajos[k]();
      }
      return;
    }
    if (e.altKey) return;
    const paso = estado.paso * (e.shiftKey ? 10 : 1);
    const acciones = {
      delete: eliminarSeleccion,
      backspace: eliminarSeleccion,
      r: () => girar(e.shiftKey ? 90 : 15),
      v: () => ponerHerramienta('seleccionar'),
      h: () => ponerHerramienta('mano'),
      m: () => ponerHerramienta('medir'),
      c: () => ponerHerramienta('cota'),
      z: () => ponerHerramienta('zona'),
      l: () => ponerHerramienta('camino'),
      n: () => ponerNoche(!estado.noche),
      f: () => (estado.sel.size ? centrarEn(selObjs()) : encuadrar()),
      1: () => ponerVista('3d'),
      2: () => ponerVista('planta'),
      3: () => ponerVista('plano'),
      4: () => ponerVista('materiales'),
      '?': () => $('#dlg-ayuda').showModal(),
      escape: () => {
        if (estado.caminando) return ponerCaminar(false);
        if (medida.a || zonaGuia) {
          medida.a = medida.b = medida.cursor = null;
          zonaGuia = null;
          return dibujarGuia();
        }
        if (estado.herramienta !== 'seleccionar') return ponerHerramienta('seleccionar');
        limpiarSeleccion();
      },
      arrowup: () => desplazar(0, -paso),
      arrowdown: () => desplazar(0, paso),
      arrowleft: () => desplazar(-paso, 0),
      arrowright: () => desplazar(paso, 0),
    };
    const accion = acciones[k];
    if (!accion) return;
    if (!enVista3D() && !['1', '2', '3', '4', '?', 'n'].includes(k)) return;
    if (k.startsWith('arrow')) e.preventDefault();
    accion();
  });
  window.addEventListener('keyup', (e) => {
    teclas.delete(e.code);
    if (e.code === 'Space' && panTemporal) {
      panTemporal = false;
      visor.classList.remove('paneando');
      botonesRaton();
    }
  });
  window.addEventListener('blur', () => {
    teclas.clear();
    panTemporal = false;
    visor.classList.remove('paneando');
    botonesRaton();
  });

  // La dirección #slug abre esa escena (también con atrás y adelante del navegador).
  window.addEventListener('hashchange', () => {
    const slug = slugDeDireccion();
    if (slug && slug !== estado.slug && listaEscenas.some((x) => x.slug === slug)) abrirEscena(slug);
  });

  // Cambios en disco (por ejemplo, cuando Claude edita la escena)
  const eventos = new EventSource('/api/eventos');
  eventos.onmessage = async (ev) => {
    const d = JSON.parse(ev.data);
    if (d.tipo === 'lista' || d.nueva) await cargarLista();
    if (d.tipo === 'datos') cargarDatosGenerales();
    if (d.tipo === 'cerrado') document.documentElement.classList.add('cerrado');
    if (d.tipo === 'escena' && d.slug === estado.slug) await recargarDesdeArchivo();
    if (d.tipo === 'error' && d.slug === estado.slug) aviso(`El archivo escenas/${d.slug}.json tiene un error de formato y no se cargó: ${d.mensaje}`, 'error', 9000);
  };
}

/* ================================================================== inicio */

function slugDeDireccion() {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return '';
  }
}

async function iniciar() {
  document.documentElement.dataset.tema = estado.tema;
  renderBiblioteca();
  conectarInterfaz();
  cargarDatosGenerales();
  ponerHerramienta('seleccionar');
  redimensionar();
  animar();
  try {
    await cargarLista();
  } catch {
    document.documentElement.classList.add('sin-servidor');
    return;
  }
  const deseado = slugDeDireccion() || pref.slug;
  const slug = listaEscenas.find((x) => x.slug === deseado)?.slug || listaEscenas[0]?.slug;
  if (slug) await abrirEscena(slug);
  else {
    $('#vacio').hidden = false;
    renderLista();
  }
}

// Acceso desde la consola para revisar o probar sin el mouse.
Object.assign(window.plano, { ponerImagenFondo, iniciarCalibracion, clicCalibracion, aplicarCalibracion, crearForma, marcarCoordenadas, hojasDelPlano });

iniciar();
