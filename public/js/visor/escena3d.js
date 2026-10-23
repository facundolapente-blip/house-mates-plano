// Visor para compartir: el modelo 3D de solo lectura. Usa los mismos dibujos que la app (tipos.js y lugar.js)
// con una luz simple (cielo + sol, sin postproceso) para que ande liviano en el teléfono. Se toca un objeto
// para ver qué es; se gira con un dedo y se acerca pellizcando.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { crearObjeto3D, TIPOS } from '../tipos.js';
import { construirArea } from '../lugar.js';
import { esquinas, cajaDe, superficieDe, puntoEnPoligono } from '../geometria.js';
import { fm, esc } from '../formato.js';
import { ROLES_STAFF } from '../tipos-datos.js';

const FONDO = '#141416';
const FONDO_NOCHE = '#05060a';
const ALTURA_OJOS = 1.65;
const COLOR_SEL = '#3d63ff';

const reducirMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function etiqueta(html, clase, centro = [0.5, 0.5]) {
  const div = document.createElement('div');
  div.className = clase;
  div.innerHTML = html;
  const o = new CSS2DObject(div);
  o.center.set(centro[0], centro[1]);
  return o;
}

// Saca un grupo de la escena y libera lo que no comparten otros objetos (los materiales de tipos.js se
// reutilizan, así que no se tocan; los de las paredes y pisos sí son propios).
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

// Haz de luz para el modo noche: cono con la punta en el origen que se desvanece hacia la base.
function geometriaHaz() {
  const g = new THREE.ConeGeometry(1, 1, 32, 1, true);
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
}

// contenedor: el elemento donde va el lienzo (tiene que tener tamaño propio, por ejemplo position:absolute).
// alElegir(objeto | null): se llama cuando se toca un objeto o el vacío.
// Si el dispositivo no puede abrir WebGL, tira un error (el que llama muestra un aviso).
export function crearVista3D(contenedor, escena, { alElegir = () => {}, alMover = () => {} } = {}) {
  const tactil = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tactil ? 2 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  contenedor.append(renderer.domElement);

  const capa = new CSS2DRenderer();
  capa.domElement.className = 'capa-etq';
  contenedor.append(capa.domElement);

  const mundo = new THREE.Scene();
  mundo.background = new THREE.Color(FONDO);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.05, 3000);
  const ctrl = new OrbitControls(cam, renderer.domElement);
  ctrl.enableDamping = true;
  ctrl.dampingFactor = 0.12;
  ctrl.maxPolarAngle = Math.PI / 2 - 0.02;
  ctrl.minDistance = 0.4;
  ctrl.zoomToCursor = true;
  ctrl.rotateSpeed = tactil ? 0.8 : 1;

  // Luz simple: cielo (hemisferio), sol con sombras y un relleno suave del otro lado.
  const cielo = new THREE.HemisphereLight('#ffffff', '#8d887e', 1.55);
  const sol = new THREE.DirectionalLight('#ffffff', 2.2);
  sol.castShadow = true;
  sol.shadow.mapSize.set(tactil ? 1024 : 2048, tactil ? 1024 : 2048);
  sol.shadow.bias = -0.0005;
  sol.shadow.normalBias = 0.03;
  const relleno = new THREE.DirectionalLight('#dfe6ff', 0.55);
  mundo.add(cielo, sol, sol.target, relleno, relleno.target);

  const lugarG = new THREE.Group();
  const objetosG = new THREE.Group();
  const medidasG = new THREE.Group();
  const lucesG = new THREE.Group();
  const grillaG = new THREE.Group();
  mundo.add(lugarG, objetosG, medidasG, lucesG, grillaG);

  const mapa = new Map();
  const porId = new Map(escena.objetos.map((o) => [o.id, o]));
  const matSel = new THREE.LineBasicMaterial({ color: COLOR_SEL, depthTest: false, transparent: true });
  const matCota = new THREE.LineBasicMaterial({ color: '#e8aa4c', depthTest: false, transparent: true });
  const geoHaz = geometriaHaz();
  let noche = false;
  let verNombres = false;
  let elegido = null;
  let cajaSel = null;
  let sucio = true;
  let activo = false;
  let anim = null;
  let encuadrePendiente = true;
  let ancho = 0;
  let alto = 0;

  /* ---------------------------------------------------------------- límites y luz */

  function limites() {
    const puntos = [];
    for (const a of escena.areas || []) puntos.push(...(a.contorno || []));
    for (const o of escena.objetos) puntos.push(...esquinas(o));
    if (!puntos.length) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    return cajaDe(puntos);
  }

  // Para encuadrar alcanza con el lugar; si no hay áreas, con los objetos.
  function limitesVista() {
    const puntos = [];
    for (const a of escena.areas || []) puntos.push(...(a.contorno || []));
    if (!puntos.length) for (const o of escena.objetos) puntos.push(...esquinas(o));
    if (!puntos.length) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    return cajaDe(puntos);
  }

  function ajustarSol() {
    const b = limites();
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minY + b.maxY) / 2;
    const tam = Math.max(b.maxX - b.minX, b.maxY - b.minY, 6);
    sol.position.set(cx - tam * 0.35, tam * 1.1, cz + tam * 0.55);
    sol.target.position.set(cx, 0, cz);
    relleno.position.set(cx + tam * 0.6, tam * 0.5, cz - tam * 0.6);
    relleno.target.position.set(cx, 0, cz);
    const s = sol.shadow.camera;
    const m = tam * 0.9;
    Object.assign(s, { left: -m, right: m, top: m, bottom: -m, near: 0.5, far: tam * 4 });
    s.updateProjectionMatrix();
    ctrl.maxDistance = tam * 5 + 50;
    cam.far = Math.max(500, tam * 12);
    cam.updateProjectionMatrix();
  }

  function construirGrilla() {
    vaciar(grillaG);
    const b = limites();
    const cx = Math.round((b.minX + b.maxX) / 2);
    const cz = Math.round((b.minY + b.maxY) / 2);
    const tam = Math.ceil(Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2) * 2 + 16;
    const tam5 = Math.ceil(tam / 10) * 10;
    const gruesa = new THREE.GridHelper(tam5, tam5 / 5, '#3a3d45', '#3a3d45');
    gruesa.material.transparent = true;
    gruesa.material.opacity = noche ? 0.12 : 0.5;
    gruesa.material.depthWrite = false;
    gruesa.userData.propio = true;
    gruesa.position.set(Math.round(cx / 5) * 5, -0.01, Math.round(cz / 5) * 5);
    grillaG.add(gruesa);
  }

  /* ---------------------------------------------------------------- construcción */

  function etiquetaDe(o) {
    const def = TIPOS[o.tipo] || TIPOS.caja;
    let et;
    if (o.tipo === 'zona' || o.tipo === 'estacionamiento') {
      et = etiqueta(`${esc(o.nombre)}<small>${fm(superficieDe(o), 1)} m²</small>`, 'etq etq-zona');
      et.position.set(0, 0.05, 0);
      et.element.style.setProperty('--zona', o.tipo === 'estacionamiento' ? '#9aa1a8' : o.color || def.color);
    } else if (o.tipo === 'texto') {
      et = etiqueta(esc(o.texto || o.nombre), 'etq etq-texto');
      et.element.style.setProperty('--tam', `${Math.max(11, Math.min(40, (Number(o.tamano) || 0.6) * 22))}px`);
      if (o.color) et.element.style.color = o.color;
      et.position.set(0, 0.05, 0);
    } else if (o.tipo === 'senal' || o.tipo === 'etiqueta') {
      et = etiqueta(esc(o.texto || o.nombre), 'etq etq-cartel', [0.5, 1]);
      et.position.set(0, o.tipo === 'senal' ? o.dims[2] + 0.12 : 0.3, 0);
    } else if (o.tipo === 'puesto') {
      const rol = ROLES_STAFF[o.rol]?.nombre.toLowerCase() || 'persona';
      et = etiqueta(`${esc(o.nombre)}<small>${Number(o.personas) || 1} ${esc(rol)}${o.turno ? ` · ${esc(o.turno)}` : ''}</small>`, 'etq etq-nombre', [0.5, 1]);
      et.position.set(0, 1.9, 0);
    } else {
      et = etiqueta(esc(o.nombre), 'etq etq-nombre', [0.5, 1]);
      et.position.set(0, (o.tipo === 'arbol' ? Math.min(o.dims[2], 4) : o.dims[2]) + 0.12, 0);
    }
    return et;
  }

  function agregarObjeto(o) {
    const g = crearObjeto3D(o, { noche });
    const et = etiquetaDe(o);
    g.add(et);
    g.userData.etq = et.element;
    // Los nombres se ocultan con visible = false (no solo con CSS): así el renderizador de etiquetas no
    // las acomoda en cada cuadro, que con cientos de sillas pesa en el teléfono.
    g.userData.soloNombre = et.element.classList.contains('etq-nombre') ? et : null;
    if (g.userData.soloNombre) et.visible = verNombres || o.id === elegido;
    objetosG.add(g);
    mapa.set(o.id, g);
  }

  function construirObjetos() {
    vaciar(objetosG);
    mapa.clear();
    cajaSel = null;
    for (const o of escena.objetos) {
      try {
        agregarObjeto(o);
      } catch (e) {
        console.warn('No se pudo dibujar', o.id, e);
      }
    }
    if (elegido) marcar(elegido);
  }

  function construirLugar() {
    vaciar(lugarG);
    vaciar(medidasG);
    for (const area of escena.areas || []) {
      if (!area.contorno || area.contorno.length < 3) continue;
      const r = construirArea(area);
      lugarG.add(r.grupo);
      for (const c of r.cotas) {
        const et = etiqueta(c.texto, 'cinta');
        et.position.copy(c.pos);
        medidasG.add(et);
      }
      for (const ro of r.rotulos) {
        const et = etiqueta(`${esc(ro.texto)} <small>${esc(ro.detalle)}</small>`, `etq etq-abertura${ro.salida ? ' etq-salida' : ''}`);
        et.position.copy(ro.pos);
        r.grupo.add(et);
      }
    }
    // Cotas fijas de la escena: una línea a ras del piso y la medida en el medio.
    for (const c of escena.cotas || []) {
      const a = new THREE.Vector3(c.a[0], 0.06, c.a[1]);
      const b = new THREE.Vector3(c.b[0], 0.06, c.b[1]);
      const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), matCota);
      linea.renderOrder = 6;
      linea.raycast = () => {};
      medidasG.add(linea);
      const et = etiqueta(`${fm(a.distanceTo(b))} m`, 'cinta');
      et.position.copy(a).add(b).multiplyScalar(0.5);
      medidasG.add(et);
    }
  }

  // Modo noche: haces de los cabezales y tachos, y luz alrededor de faroles y postes. Pocas luces reales
  // (el resto solo brilla) para que el teléfono no se trabe.
  function construirLuces() {
    vaciar(lucesG);
    if (!noche) return;
    const maxFocos = tactil ? 6 : 12;
    const maxLamparas = tactil ? 6 : 10;
    let focos = 0;
    let lamparas = 0;
    for (const o of escena.objetos) {
      const def = TIPOS[o.tipo];
      if (!def?.emite) continue;
      const g = mapa.get(o.id);
      if (!g) continue;
      g.updateMatrixWorld(true);
      const color = new THREE.Color(o.luz || def.luz);
      if (def.emite === 'punto') {
        if (lamparas++ < maxLamparas) {
          const l = new THREE.PointLight(color, 5, 9, 2);
          l.position.copy(g.localToWorld(new THREE.Vector3(0, o.dims[2] * (def.alturaLuz ?? 0.5), 0.15)));
          lucesG.add(l);
        }
        continue;
      }
      const cabeza = g.localToWorld(new THREE.Vector3(0, o.dims[2] * 0.4, 0));
      const objetivo = Array.isArray(o.apunta)
        ? new THREE.Vector3(o.apunta[0], o.apunta[2] ?? 0, o.apunta[1])
        : g.localToWorld(new THREE.Vector3(0, -(o.elev || 0), Math.max(1.5, (o.elev || 0) * 0.7)));
      const apertura = THREE.MathUtils.degToRad(o.apertura || 11);
      const dir = objetivo.clone().sub(cabeza);
      const largo = dir.length();
      if (largo < 0.05) continue;
      const haz = new THREE.Mesh(
        geoHaz,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexColors: true })
      );
      haz.userData.propio = true;
      haz.raycast = () => {};
      haz.position.copy(cabeza);
      haz.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      const radio = Math.tan(apertura) * largo;
      haz.scale.set(radio, largo, radio);
      lucesG.add(haz);
      if (focos++ < maxFocos) {
        const foco = new THREE.SpotLight(color, 40, 0, apertura * 1.5, 0.6, 1.6);
        foco.position.copy(cabeza);
        foco.target.position.copy(objetivo);
        lucesG.add(foco, foco.target);
      }
    }
  }

  function construirTodo() {
    construirLugar();
    construirObjetos();
    construirGrilla();
    ajustarSol();
    construirLuces();
    sucio = true;
  }

  /* ---------------------------------------------------------------- selección */

  function marcar(id) {
    const o = porId.get(id);
    const g = mapa.get(id);
    if (!o || !g) return;
    const [w, p, h] = o.dims;
    let geo;
    if (h < 0.02) {
      const y = 0.03;
      geo = new THREE.BufferGeometry().setFromPoints(
        [[-w / 2, -p / 2], [w / 2, -p / 2], [w / 2, p / 2], [-w / 2, p / 2], [-w / 2, -p / 2]].map(([x, z]) => new THREE.Vector3(x, y, z))
      );
      cajaSel = new THREE.Line(geo, matSel);
    } else {
      const caja = new THREE.BoxGeometry(w + 0.06, h + 0.06, p + 0.06);
      geo = new THREE.EdgesGeometry(caja);
      caja.dispose();
      cajaSel = new THREE.LineSegments(geo, matSel);
      cajaSel.position.y = h / 2;
    }
    cajaSel.renderOrder = 10;
    cajaSel.raycast = () => {};
    g.add(cajaSel);
    g.userData.etq?.classList.add('sel');
    if (g.userData.soloNombre) g.userData.soloNombre.visible = true;
  }

  function desmarcar() {
    const g = elegido && mapa.get(elegido);
    if (g) g.userData.etq?.classList.remove('sel');
    if (g?.userData.soloNombre) g.userData.soloNombre.visible = verNombres;
    if (cajaSel) {
      cajaSel.parent?.remove(cajaSel);
      cajaSel.geometry.dispose();
      cajaSel = null;
    }
  }

  function elegir(id) {
    if (id === elegido) return;
    desmarcar();
    elegido = id && porId.has(id) ? id : null;
    if (elegido) marcar(elegido);
    sucio = true;
    alElegir(elegido ? porId.get(elegido) : null);
  }

  const ray = new THREE.Raycaster();
  ray.params.Line.threshold = 0.05;
  ray.params.Points.threshold = 0.05;
  const ndc = new THREE.Vector2();
  const visible = (n) => {
    for (; n; n = n.parent) if (!n.visible) return false;
    return true;
  };

  function tocar(x, y) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const golpes = ray.intersectObjects([objetosG, lugarG], true);
    for (const h of golpes) {
      if (!visible(h.object)) continue;
      // Lo primero que se toca: si es un objeto, se elige; si es una pared o el piso, no hay nada.
      let n = h.object;
      while (n && n.parent !== objetosG) n = n.parent;
      if (n?.userData.id) return elegir(n.userData.id);
      break;
    }
    elegir(null);
  }

  // Un toque corto sin arrastrar elige; arrastrar gira la vista.
  const punteros = new Set();
  let toque = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    punteros.add(e.pointerId);
    toque = punteros.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    anim = null;
    alMover();
  });
  const soltar = (e) => {
    punteros.delete(e.pointerId);
    if (!toque || e.type !== 'pointerup') return (toque = null);
    const lejos = Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > (tactil ? 10 : 5);
    const lento = performance.now() - toque.t > 650;
    toque = null;
    if (!lejos && !lento) tocar(e.clientX, e.clientY);
  };
  renderer.domElement.addEventListener('pointerup', soltar);
  renderer.domElement.addEventListener('pointercancel', soltar);
  renderer.domElement.addEventListener('wheel', () => alMover(), { passive: true });
  ctrl.addEventListener('change', () => (sucio = true));
  ctrl.addEventListener('start', () => (anim = null));

  /* ---------------------------------------------------------------- cámara */

  function irA(pos, objetivo, inmediato = false) {
    if (inmediato || reducirMovimiento() || !activo) {
      anim = null;
      cam.position.copy(pos);
      ctrl.target.copy(objetivo);
      ctrl.update();
      sucio = true;
      return;
    }
    anim = { p0: cam.position.clone(), t0: ctrl.target.clone(), p1: pos.clone(), t1: objetivo.clone(), ini: performance.now(), dur: 650 };
  }

  const tieneRecorrido = Array.isArray(escena.recorrido?.desde);

  function nivelEn(x, z) {
    for (const a of escena.areas || []) if ((a.contorno || []).length >= 3 && puntoEnPoligono(x, z, a.contorno)) return Number(a.nivel) || 0;
    return 0;
  }

  // Distancia a la que hay que poner la cámara (mirando en la dirección -d hacia c) para que entren todos
  // los puntos, con el ancho y el alto reales de la pantalla (en un teléfono parado la imagen es angosta).
  function distanciaParaVer(d, c, puntos) {
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const th = tv * cam.aspect;
    const der = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    const arr = new THREE.Vector3().crossVectors(d, der).normalize();
    const q = new THREE.Vector3();
    let D = 1;
    for (const p of puntos) {
      q.subVectors(p, c);
      const z = q.dot(d);
      D = Math.max(D, z + Math.abs(q.dot(der)) / th, z + Math.abs(q.dot(arr)) / tv);
    }
    return D * 1.08;
  }

  const DIRECCIONES = { diagonal: [0.13, 0.72, 0.92], arriba: [0, 1, 0.001], frente: [0, 0.2, 1] };

  function vista(cual = 'diagonal', inmediato = false) {
    if (!ancho || !alto) {
      encuadrePendiente = cual;
      return;
    }
    const b = limitesVista();
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minY + b.maxY) / 2;
    if (cual === 'pie' && tieneRecorrido) {
      const [dx, dz] = escena.recorrido.desde;
      const [mx, mz] = escena.recorrido.mira || [cx, cz];
      const pos = new THREE.Vector3(dx, nivelEn(dx, dz) + ALTURA_OJOS, dz);
      return irA(pos, new THREE.Vector3(mx, nivelEn(mx, mz) + 1.4, mz), inmediato);
    }
    const d = new THREE.Vector3(...(DIRECCIONES[cual] || DIRECCIONES.diagonal)).normalize();
    const objetivo = new THREE.Vector3(cx, cual === 'frente' ? 1 : 0, cz);
    // Lo que tiene que entrar: el contorno del lugar, del piso hasta unos 3 m de alto.
    const puntos = [];
    for (const x of [b.minX, b.maxX]) for (const z of [b.minY, b.maxY]) for (const y of [0, 3]) puntos.push(new THREE.Vector3(x, y, z));
    irA(objetivo.clone().addScaledVector(d, distanciaParaVer(d, objetivo, puntos)), objetivo, inmediato);
  }

  function acercar(id = elegido) {
    const o = porId.get(id);
    if (!o) return;
    const esq = esquinas(o);
    const b = cajaDe(esq);
    const base = o.elev || 0;
    const objetivo = new THREE.Vector3((b.minX + b.maxX) / 2, base + o.dims[2] / 2, (b.minY + b.maxY) / 2);
    const dir = cam.position.clone().sub(ctrl.target).normalize();
    if (dir.y < 0.25) dir.y = 0.25;
    dir.normalize();
    // Que el objeto entre en la pantalla con aire alrededor para ver dónde está.
    const puntos = esq.flatMap(([x, z]) => [new THREE.Vector3(x, base, z), new THREE.Vector3(x, base + o.dims[2], z)]);
    irA(objetivo.clone().addScaledVector(dir, distanciaParaVer(dir, objetivo, puntos) * 1.8 + 1.5), objetivo);
  }

  /* ---------------------------------------------------------------- dibujo */

  function medir() {
    const w = contenedor.clientWidth;
    const h = contenedor.clientHeight;
    if (!w || !h) return;
    if (w !== ancho || h !== alto) {
      ancho = w;
      alto = h;
      renderer.setSize(w, h);
      capa.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      sucio = true;
    }
    if (encuadrePendiente) {
      const cual = typeof encuadrePendiente === 'string' ? encuadrePendiente : 'diagonal';
      encuadrePendiente = false;
      vista(cual, true);
    }
  }
  const observador = new ResizeObserver(medir);
  observador.observe(contenedor);

  const suave = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  function cuadro() {
    if (anim) {
      const t = Math.min(1, (performance.now() - anim.ini) / anim.dur);
      const k = suave(t);
      cam.position.lerpVectors(anim.p0, anim.p1, k);
      ctrl.target.lerpVectors(anim.t0, anim.t1, k);
      sucio = true;
      if (t >= 1) anim = null;
    }
    const cambio = ctrl.update();
    if (cambio || sucio) {
      renderer.render(mundo, cam);
      capa.render(mundo, cam);
      sucio = false;
    }
  }

  // Solo se dibuja mientras la pestaña 3D está a la vista (ahorra batería).
  function activar(v) {
    activo = Boolean(v);
    if (activo) {
      medir();
      sucio = true;
    }
    renderer.setAnimationLoop(activo ? cuadro : null);
  }

  construirTodo();
  medir();

  return {
    renderer,
    tieneRecorrido,
    activar,
    vista,
    acercar,
    elegir,
    get elegido() {
      return elegido ? porId.get(elegido) : null;
    },
    // Las etiquetas se muestran u ocultan con clases en el contenedor (ver .nombres y .medidas en el CSS).
    ponerNombres(v) {
      verNombres = Boolean(v);
      for (const [id, g] of mapa) if (g.userData.soloNombre) g.userData.soloNombre.visible = verNombres || id === elegido;
      contenedor.classList.toggle('nombres', verNombres);
      sucio = true;
    },
    ponerMedidas(v) {
      contenedor.classList.toggle('medidas', Boolean(v));
      sucio = true;
    },
    ponerNoche(v) {
      noche = Boolean(v);
      mundo.background.set(noche ? FONDO_NOCHE : FONDO);
      cielo.intensity = noche ? 0.12 : 1.55;
      sol.intensity = noche ? 0.12 : 2.2;
      relleno.intensity = noche ? 0.04 : 0.55;
      construirObjetos();
      construirGrilla();
      construirLuces();
      sucio = true;
    },
    destruir() {
      activar(false);
      observador.disconnect();
      vaciar(mundo);
      ctrl.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      capa.domElement.remove();
    },
  };
}
