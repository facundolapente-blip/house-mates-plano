// Dibujo 3D de cada tipo de objeto a partir de sus medidas reales. Los datos de cada tipo (nombre,
// categoría, medidas típicas) están en tipos-datos.js.
// dims = [ancho (x local), profundidad (frente hacia +y local), alto], en metros.
// El frente de cada objeto mira hacia +y local (hacia abajo en la planta con giro 0).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CATEGORIAS, TIPOS_DATOS, catDe, troncoDe, ROLES_STAFF } from './tipos-datos.js';
import { contornoLocal, lineaLocal, plazasEstacionamiento, USOS_CAMINO } from './predio.js';

export { CATEGORIAS, catDe, troncoDe };

const materiales = new Map();
export function mat(color, extra = {}) {
  const clave = color + JSON.stringify(extra);
  if (!materiales.has(clave)) {
    materiales.set(clave, new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...extra }));
  }
  return materiales.get(clave);
}

export const matBorde = new THREE.LineBasicMaterial({ color: '#3a4146', transparent: true, opacity: 0.32 });

const tono = (c, f) =>
  '#' + new THREE.Color(c).lerp(new THREE.Color(f > 0 ? '#ffffff' : '#000000'), Math.abs(f)).getHexString();

// Caja con la base apoyada en y.
function bloque(g, m, w, h, p, x = 0, y = 0, z = 0) {
  const malla = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(p, 0.001)), m);
  malla.position.set(x, y + h / 2, z);
  g.add(malla);
  return malla;
}

// Cilindro vertical con la base apoyada en y.
function tubo(g, m, r, h, x = 0, y = 0, z = 0, seg = 28, rArriba = r) {
  const malla = new THREE.Mesh(new THREE.CylinderGeometry(rArriba, r, Math.max(h, 0.001), seg), m);
  malla.position.set(x, y + h / 2, z);
  g.add(malla);
  return malla;
}

// Disco que mira hacia +z, centrado en (x, y, z).
function disco(g, m, r, grosor, x, y, z, seg = 28) {
  const malla = new THREE.Mesh(new THREE.CylinderGeometry(r, r, grosor, seg), m);
  malla.rotation.x = Math.PI / 2;
  malla.position.set(x, y, z);
  malla.userData.sinBordes = true;
  g.add(malla);
  return malla;
}

const negro = () => mat('#0c0c0d', { roughness: 0.45 });

function caja(g, [w, p, h], c) {
  bloque(g, mat(c), w, h, p);
}

function cilindro(g, [w, p, h], c) {
  tubo(g, mat(c), w / 2, h).scale.z = p / Math.max(w, 0.001);
}

function columna(g, d, c, o) {
  if (o.forma === 'redonda') cilindro(g, d, c);
  else caja(g, d, c);
}

function tarima(g, [w, p, h], c) {
  bloque(g, mat(c), w, Math.max(h - 0.03, 0.01), p);
  bloque(g, mat(tono(c, 0.18)), w, Math.min(0.03, h), p, 0, Math.max(h - 0.03, 0));
}

function escalera(g, [w, p, h], c) {
  const n = Math.max(2, Math.round(h / 0.175));
  const sh = h / n;
  const sd = p / n;
  for (let i = 0; i < n; i++) bloque(g, mat(c), w, sh * (i + 1), sd, 0, 0, p / 2 - sd * (i + 0.5));
}

function cabinaDJ(g, [w, p, h], c) {
  const tapa = Math.min(0.04, h * 0.1);
  bloque(g, mat(c), Math.max(w - 0.04, 0.01), h - tapa, Math.max(p - 0.04, 0.01));
  bloque(g, mat(tono(c, 0.22)), w, tapa, p, 0, h - tapa);
  const anchos = w >= 1.15 ? [0.32, 0.3, 0.32] : w >= 0.5 ? [0.32] : [];
  const total = anchos.reduce((a, b) => a + b, 0) + Math.max(anchos.length - 1, 0) * 0.05;
  let x = -total / 2;
  for (const a of anchos) {
    bloque(g, negro(), a, 0.1, Math.min(0.42, p * 0.8), x + a / 2, h, -p * 0.08);
    x += a + 0.05;
  }
}

function parlante(g, [w, p, h], c) {
  bloque(g, mat(c, { roughness: 0.6 }), w, h, p);
  const r = Math.min(w, h) * 0.32;
  disco(g, negro(), r, 0.02, 0, h * 0.36, p / 2 + 0.006, 32);
  disco(g, negro(), r * 0.4, 0.02, 0, h * 0.8, p / 2 + 0.006, 24);
}

function sub(g, [w, p, h], c) {
  bloque(g, mat(c, { roughness: 0.6 }), w, h, p);
  disco(g, negro(), Math.min(w, h) * 0.38, 0.02, 0, h / 2, p / 2 + 0.006, 32);
}

// Cabezal móvil colgado: base arriba, cabeza abajo. La luz sale de la cabeza.
function cabezal(g, [w, p, h], c) {
  bloque(g, mat(c), w, h * 0.2, p, 0, h * 0.8);
  for (const s of [-1, 1]) bloque(g, mat(c), 0.03, h * 0.42, 0.07, s * w * 0.4, h * 0.38);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, p) * 0.34, 20, 14), mat(c, { roughness: 0.4 }));
  cabeza.position.y = h * 0.4;
  cabeza.userData.sinBordes = true;
  g.add(cabeza);
}

// Beam: cabezal móvil con una lente chica y muy brillante abajo (el haz es finito).
function beam(g, [w, p, h], c, o, ctx) {
  cabezal(g, [w, p, h], c);
  const r = Math.min(w, p) * 0.34;
  const lente = new THREE.Mesh(new THREE.CircleGeometry(r * 0.42, 20), mat('#ffffff', { emissive: o.luz || TIPOS.beam.luz, emissiveIntensity: ctx.noche ? 3 : 0.7 }));
  lente.rotation.x = Math.PI / 2;
  lente.position.y = h * 0.4 - r - 0.003;
  lente.userData.sinBordes = true;
  g.add(lente);
}

// Estrobo LED (tipo Clay Paky Stormy): caja chata con el panel de LED al frente, sobre una horquilla.
function estrobo(g, [w, p, h], c, o, ctx) {
  const base = h * 0.18;
  bloque(g, mat(c), w, h - base, p, 0, base);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.88, (h - base) * 0.8),
    mat('#eef1ff', { emissive: o.luz || TIPOS.estrobo.luz, emissiveIntensity: ctx.noche ? 1.4 : 0.3, roughness: 0.3 })
  );
  panel.position.set(0, base + (h - base) / 2, p / 2 + 0.003);
  panel.userData.sinBordes = true;
  g.add(panel);
  const metal = mat('#2b2d31');
  for (const s of [-1, 1]) bloque(g, metal, 0.022, h * 0.6, 0.05, s * (w / 2 + 0.013), 0);
  bloque(g, metal, w + 0.05, 0.022, 0.05, 0, 0);
}

// Barra LED: perfil largo y finito con los LED arriba (baña de luz una pared, un árbol o la estructura).
function barraLed(g, [w, p, h], c, o, ctx) {
  bloque(g, mat(c), w, h * 0.85, p);
  const tira = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, p * 0.6), mat('#111111', { emissive: o.luz || TIPOS.barra_led.luz, emissiveIntensity: ctx.noche ? 3 : 0.8 }));
  tira.rotation.x = -Math.PI / 2;
  tira.position.y = h * 0.85 + 0.002;
  tira.userData.sinBordes = true;
  g.add(tira);
}

function par(g, [w, p, h], c) {
  tubo(g, mat(c, { roughness: 0.45 }), w / 2, h * 0.75, 0, h * 0.12, 0, 20).scale.z = p / Math.max(w, 0.001);
  bloque(g, mat(c), w * 0.9, 0.02, 0.03, 0, h * 0.95);
}

function truss(g, [w, p, h], c) {
  const vertical = h > Math.max(w, p);
  const enZ = !vertical && p > w;
  const L = vertical ? h : Math.max(w, p);
  const sy = vertical ? w : h;
  const sz = vertical ? p : enZ ? w : p;
  const r = 0.024;
  const rr = 0.011;
  const ay = Math.max(sy / 2 - r, 0.02);
  const az = Math.max(sz / 2 - r, 0.02);
  const geos = [];
  for (const y of [-ay, ay]) {
    for (const z of [-az, az]) {
      const ge = new THREE.CylinderGeometry(r, r, L, 10);
      ge.rotateZ(Math.PI / 2);
      ge.translate(0, y, z);
      geos.push(ge);
    }
  }
  const n = Math.max(1, Math.round(L / 0.5));
  const dx = L / n;
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + dx * i;
    for (const z of [-az, az]) {
      const ge = new THREE.CylinderGeometry(rr, rr, ay * 2, 6);
      ge.translate(x, 0, z);
      geos.push(ge);
    }
    for (const y of [-ay, ay]) {
      const ge = new THREE.CylinderGeometry(rr, rr, az * 2, 6);
      ge.rotateX(Math.PI / 2);
      ge.translate(x, y, 0);
      geos.push(ge);
    }
    if (i < n) {
      for (const z of [-az, az]) {
        const ge = new THREE.CylinderGeometry(rr, rr, Math.hypot(dx, ay * 2), 6);
        ge.rotateZ(-Math.atan2(dx, ay * 2) * (i % 2 ? -1 : 1));
        ge.translate(x + dx / 2, 0, z);
        geos.push(ge);
      }
    }
  }
  const geo = mergeGeometries(geos);
  geos.forEach((ge) => ge.dispose());
  if (vertical) geo.rotateZ(Math.PI / 2);
  else if (enZ) geo.rotateY(Math.PI / 2);
  geo.translate(0, h / 2, 0);
  const malla = new THREE.Mesh(geo, mat(c, { metalness: 0.55, roughness: 0.38 }));
  malla.userData.sinBordes = true;
  g.add(malla);
}

function pantalla(g, [w, p, h], c, o, ctx) {
  bloque(g, mat(c), w, h, p);
  const luz = o.luz || TIPOS.pantalla.luz;
  const imagen = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.95, h * 0.9),
    mat('#050506', { emissive: luz, emissiveIntensity: ctx.noche ? 2.4 : 0.55, roughness: 0.25 })
  );
  imagen.position.set(0, h / 2, p / 2 + 0.003);
  imagen.userData.sinBordes = true;
  g.add(imagen);
}

function barra(g, [w, p, h], c) {
  const tapa = Math.min(0.05, h * 0.1);
  const fondo = Math.max(p - 0.12, 0.1);
  bloque(g, mat(c), w, h - tapa, fondo, 0, 0, -(p - fondo) / 2);
  bloque(g, mat(tono(c, 0.45)), w + 0.04, tapa, p, 0, h - tapa);
}

function heladera(g, [w, p, h], c) {
  bloque(g, mat(c, { roughness: 0.5 }), w, h, p);
  bloque(g, mat(tono(c, -0.35)), w * 0.96, 0.012, 0.01, 0, h * 0.68, p / 2 + 0.003);
  bloque(g, mat('#9aa1a6', { metalness: 0.5, roughness: 0.4 }), 0.03, Math.min(0.32, h * 0.2), 0.03, w * 0.38, h * 0.42, p / 2 + 0.02);
}

function mesa(g, [w, p, h], c) {
  const tapa = Math.min(0.04, h * 0.1);
  bloque(g, mat(c), w, tapa, p, 0, h - tapa);
  const pata = 0.05;
  const ix = Math.max(w / 2 - 0.06, 0);
  const iz = Math.max(p / 2 - 0.06, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bloque(g, mat(tono(c, -0.3)), pata, h - tapa, pata, sx * ix, 0, sz * iz);
}

function mesaAlta(g, [w, p, h], c) {
  tubo(g, mat(c), w / 2, 0.035, 0, h - 0.035, 0, 32).scale.z = p / Math.max(w, 0.001);
  tubo(g, mat(tono(c, -0.4)), 0.035, h - 0.035, 0, 0, 0, 12);
  tubo(g, mat(tono(c, -0.4)), Math.min(w * 0.32, 0.25), 0.02, 0, 0, 0, 24);
}

function silla(g, [w, p, h], c) {
  const asiento = Math.min(0.45, h * 0.53);
  bloque(g, mat(c), w, 0.04, p, 0, asiento - 0.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bloque(g, mat(tono(c, -0.3)), 0.03, asiento - 0.04, 0.03, sx * (w / 2 - 0.03), 0, sz * (p / 2 - 0.03));
  bloque(g, mat(c), w, Math.max(h - asiento, 0.01), 0.04, 0, asiento, -p / 2 + 0.02);
}

function banqueta(g, [w, p, h], c) {
  tubo(g, mat(c), w / 2, 0.05, 0, h - 0.05, 0, 24).scale.z = p / Math.max(w, 0.001);
  tubo(g, mat(tono(c, -0.4)), 0.03, h - 0.05, 0, 0, 0, 10);
  tubo(g, mat(tono(c, -0.4)), w * 0.35, 0.02, 0, 0, 0, 20);
}

function sillon(g, [w, p, h], c) {
  const asiento = h * 0.52;
  const brazo = Math.min(0.16, w * 0.12);
  bloque(g, mat(c), w - brazo * 2, asiento, p * 0.78, 0, 0, p * 0.11);
  bloque(g, mat(tono(c, -0.12)), w, h, p * 0.24, 0, 0, -p / 2 + p * 0.12);
  for (const s of [-1, 1]) bloque(g, mat(tono(c, -0.06)), brazo, h * 0.72, p, s * (w / 2 - brazo / 2));
}

function banoQuimico(g, [w, p, h], c) {
  const techo = Math.min(0.08, h * 0.05);
  bloque(g, mat(c), w, h - techo, p);
  bloque(g, mat(tono(c, 0.7)), w + 0.06, techo, p + 0.06, 0, h - techo);
  bloque(g, mat(tono(c, -0.18)), w * 0.68, h - techo - 0.25, 0.012, 0, 0.1, p / 2 + 0.006);
}

function matafuego(g, [w, p, h], c) {
  tubo(g, mat(c, { roughness: 0.35 }), w / 2, h * 0.84, 0, 0, 0, 18).scale.z = p / Math.max(w, 0.001);
  tubo(g, negro(), w * 0.18, h * 0.16, 0, h * 0.84, 0, 10);
}

function planta(g, [w, p, h], c) {
  const maceta = h * 0.28;
  tubo(g, mat('#98694a'), w * 0.26, maceta, 0, 0, 0, 16, w * 0.32);
  const follaje = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat(c, { flatShading: true, roughness: 0.9 }));
  follaje.scale.set(w / 2, (h - maceta) / 2, p / 2);
  follaje.position.y = maceta + (h - maceta) / 2;
  follaje.userData.sinBordes = true;
  g.add(follaje);
}

function tela(g, [w, p, h], c) {
  bloque(g, mat(c, { roughness: 1 }), w, h, Math.max(p, 0.01));
}

function persona(g, [w, p, h], c) {
  const cabeza = Math.min(0.115, h * 0.066);
  const r = Math.min(w, p) * 0.45;
  const cuerpo = h - cabeza * 2 - 0.02;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(cuerpo - r * 2, 0.01), 6, 14), mat(c));
  torso.position.y = cuerpo / 2;
  torso.scale.x = w / 2 / r;
  torso.userData.sinBordes = true;
  g.add(torso);
  const craneo = new THREE.Mesh(new THREE.SphereGeometry(cabeza, 16, 12), mat(c));
  craneo.position.y = h - cabeza;
  craneo.userData.sinBordes = true;
  g.add(craneo);
}

// Estructura a dos aguas (forma de casita): pórticos adelante y atrás, cumbrera, viga horizontal y techo.
// "alero": si es mayor que 0, la estructura tiene postes verticales hasta esa altura (fracción del alto)
// y el techo arranca ahí, como el dibujo de una casa; si no, es un triángulo que baja hasta el piso.
// "tirante": altura de la viga horizontal en el triángulo (fracción del alto, por defecto 0,48).
// Con "luz", tira de LED en el borde del frente. "techo": false la deja abierta.
function casita(g, [w, p, h], c, o, ctx) {
  const viga = Math.min(0.18, w * 0.05);
  const alero = Math.min(Math.max(Number(o.alero) || 0, 0), 0.9) * h;
  const tirante = alero > 0 ? alero : Math.min(Math.max(Number(o.tirante) || 0.48, 0.1), 0.9) * h;
  const m = mat(c, { roughness: 0.6 });
  const sube = h - alero;
  const L = Math.hypot(w / 2, sube);
  const ang = Math.asin(w / 2 / L);
  const cy = alero + sube / 2;
  const led = o.luz ? mat('#111111', { emissive: o.luz, emissiveIntensity: ctx.noche ? 3 : 0.8 }) : null;
  const tira = (geo, x, y, z, rz = 0) => {
    const t = new THREE.Mesh(geo, led);
    t.position.set(x, y, z);
    t.rotation.z = rz;
    t.userData.sinBordes = true;
    g.add(t);
  };
  for (const z of [-p / 2 + viga / 2, p / 2 - viga / 2]) {
    const frente = z > 0;
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(viga, L, viga), m);
      b.position.set((s * w) / 4, cy, z);
      b.rotation.z = s * ang;
      g.add(b);
      if (led && frente) tira(new THREE.BoxGeometry(0.035, L, 0.035), (s * w) / 4, cy, z + viga / 2 + 0.02, s * ang);
      if (alero > 0) {
        bloque(g, m, viga, alero, viga, s * (w / 2 - viga / 2), 0, z);
        if (led && frente) tira(new THREE.BoxGeometry(0.035, alero, 0.035), s * (w / 2 - viga / 2), alero / 2, z + viga / 2 + 0.02);
      }
    }
    const ancho = alero > 0 ? w : w * (1 - tirante / h);
    bloque(g, m, ancho, viga, viga, 0, tirante - viga, z);
  }
  bloque(g, m, viga, viga, p, 0, h - viga, 0);
  for (const s of [-1, 1]) {
    bloque(g, m, viga, viga, p, s * (w / 2 - viga / 2), 0, 0);
    if (alero > 0) bloque(g, m, viga, viga, p, s * (w / 2 - viga / 2), alero - viga, 0);
  }
  if (o.techo !== false) {
    const d = viga / 2 + 0.02;
    for (const s of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, L, p), mat(tono(c, 0.1), { roughness: 0.9 }));
      panel.position.set((s * w) / 4 + s * Math.cos(ang) * d, cy + Math.sin(ang) * d, 0);
      panel.rotation.z = s * ang;
      g.add(panel);
    }
  }
}

// Dos postes de madera en V con una lamparita en el medio.
function posteV(g, [w, p, h], c, o, ctx) {
  const grosor = Math.min(0.09, w * 0.1);
  const a = Math.max(w / 2 - grosor, 0.05);
  const L = Math.hypot(a, h);
  const ang = Math.asin(a / L);
  for (const s of [-1, 1]) {
    const poste = new THREE.Mesh(new THREE.BoxGeometry(grosor, L, Math.max(p * 0.6, grosor)), mat(c));
    poste.position.set((s * a) / 2, h / 2, 0);
    poste.rotation.z = -s * ang;
    g.add(poste);
  }
  const yLuz = h * (TIPOS.poste_v.alturaLuz || 0.5);
  bloque(g, mat(tono(c, -0.2)), a * 2 * (yLuz / h) + grosor, 0.04, 0.05, 0, yLuz - 0.12);
  const lampara = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 14, 10),
    mat('#fff1e0', { emissive: o.luz || TIPOS.poste_v.luz, emissiveIntensity: ctx.noche ? 4 : 1 })
  );
  lampara.position.set(0, yLuz, 0.04);
  lampara.userData.sinBordes = true;
  g.add(lampara);
}

function farol(g, [w, p, h], c, o, ctx) {
  bloque(g, mat(c), w, h * 0.12, p, 0, h * 0.88);
  bloque(g, mat(c), w, h * 0.08, p, 0, 0);
  const vidrio = bloque(g, mat('#fff1e0', { emissive: o.luz || TIPOS.farol.luz, emissiveIntensity: ctx.noche ? 4 : 0.8 }), w * 0.8, h * 0.8, p * 0.8, 0, h * 0.08);
  vidrio.userData.sinBordes = true;
}

// Árbol: tronco y copa de baja resolución. La copa no se puede seleccionar (no tapa los clics)
// y se puede ocultar desde el pie de la app.
function arbol(g, [w, p, h], c, o) {
  const tronco = troncoDe(o);
  const copaAlto = o.forma === 'redondo' ? h * 0.6 : h * 0.42;
  const fuste = h - copaAlto * 0.8;
  const t = tubo(g, mat('#6b5340', { roughness: 1 }), tronco / 2, fuste, 0, 0, 0, 10, tronco * 0.32);
  t.userData.sinBordes = true;
  // Semitransparente para que el bosque no tape la pista en la vista 3D.
  const copa = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    mat(c, { flatShading: true, roughness: 0.95, transparent: true, opacity: 0.55, depthWrite: false })
  );
  copa.scale.set(w / 2, copaAlto / 2, p / 2);
  copa.position.y = h - copaAlto / 2;
  copa.userData.sinBordes = true;
  copa.userData.copa = true;
  copa.raycast = () => {};
  g.add(copa);
}

function hilera(g, [w, p, h], c) {
  bloque(g, mat(c, { flatShading: true, roughness: 1 }), w, h, p);
}

// Superficie plana con la forma del contorno (en coordenadas del objeto), apoyada en y.
function superficie(puntos, y = 0) {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(puntos.map(([x, z]) => new THREE.Vector2(x, -z))));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

function lineaCerrada(g, puntos, y, color) {
  const borde = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(puntos.map(([x, z]) => new THREE.Vector3(x, y, z))), new THREE.LineBasicMaterial({ color }));
  borde.userData.propio = true;
  borde.raycast = () => {};
  g.add(borde);
  return borde;
}

function zona(g, [w, p], c, o, ctx) {
  const contorno = contornoLocal({ ...o, dims: [Math.max(w, 0.01), Math.max(p, 0.01)] });
  const plano = new THREE.Mesh(
    superficie(contorno, 0.012),
    new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: ctx.noche ? 0.2 : 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: ctx.noche ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
  );
  plano.userData.propio = true;
  plano.renderOrder = 2;
  g.add(plano);
  lineaCerrada(g, contorno, 0.014, c);
  const n = Math.round(Number(o.gente) || 0);
  if (n > 0) genteEnZona(g, contorno, n, String(o.id));
}

// Gente simulada en una zona (o.gente): figuras simples repartidas parejo, para ver la escala real del lugar
// lleno. Van en dos InstancedMesh (cuerpos y cabezas): mil personas cuestan dos dibujos. Siempre en los mismos
// lugares para la misma zona (el azar sale del id).
const geoCuerpoGente = new THREE.CapsuleGeometry(0.17, 1.1, 3, 8).translate(0, 0.72, 0);
const geoCabezaGente = new THREE.SphereGeometry(0.105, 10, 8).translate(0, 1.6, 0);
const ROPA = ['#26282e', '#3b3f48', '#1c1d21', '#4a3f3a', '#5a5f6a', '#6b4f5e', '#2f4a5c', '#d8d4cc', '#7a6a9a', '#3c5a8a'];
const PIEL = ['#e3b896', '#c68b62', '#8d5a3b', '#f0cfb0', '#a86f4c'];
const MAX_GENTE = 5000;

function azar(texto) {
  let s = 2166136261;
  for (const ch of texto) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dentroDeContorno(x, z, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dentro = !dentro;
  }
  return dentro;
}

function genteEnZona(g, contorno, pedida, semilla) {
  let area = 0;
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) area += (contorno[j][0] + contorno[i][0]) * (contorno[j][1] - contorno[i][1]);
  area = Math.abs(area / 2);
  if (area < 0.5) return;
  // Más de 4 personas por m² no entran paradas.
  const n = Math.min(pedida, Math.floor(area * 4), MAX_GENTE);
  const xs = contorno.map((q) => q[0]);
  const zs = contorno.map((q) => q[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const rnd = azar(semilla);
  // Grilla pareja con un poco de desorden; si por los bordes no alcanzan los lugares, se achica.
  let lugares = [];
  for (let paso = Math.sqrt(area / n), intento = 0; intento < 6 && lugares.length < n; intento++, paso *= 0.9) {
    lugares = [];
    for (let z = z0 + paso / 2; z < z1; z += paso) {
      for (let x = x0 + paso / 2; x < x1; x += paso) {
        const px = x + (rnd() - 0.5) * paso * 0.7;
        const pz = z + (rnd() - 0.5) * paso * 0.7;
        if (dentroDeContorno(px, pz, contorno)) lugares.push([px, pz]);
      }
    }
  }
  for (let i = lugares.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [lugares[i], lugares[j]] = [lugares[j], lugares[i]];
  }
  lugares = lugares.slice(0, n);
  if (!lugares.length) return;
  const cuerpos = new THREE.InstancedMesh(geoCuerpoGente, mat('#ffffff', { roughness: 0.9 }), lugares.length);
  const cabezas = new THREE.InstancedMesh(geoCabezaGente, mat('#ffffff', { roughness: 0.7 }), lugares.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eje = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  lugares.forEach(([x, z], i) => {
    const alto = 0.92 + rnd() * 0.16;
    q.setFromAxisAngle(eje, rnd() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, alto, 1));
    cuerpos.setMatrixAt(i, m);
    cabezas.setMatrixAt(i, m);
    cuerpos.setColorAt(i, color.set(ROPA[Math.floor(rnd() * ROPA.length)]));
    cabezas.setColorAt(i, color.set(PIEL[Math.floor(rnd() * PIEL.length)]));
  });
  for (const malla of [cuerpos, cabezas]) {
    malla.computeBoundingSphere();
    malla.raycast = () => {};
    malla.userData.sinBordes = true;
    malla.userData.gente = true;
    g.add(malla);
  }
}

// Estacionamiento: el piso, las cocheras marcadas en blanco y las accesibles en azul.
function estacionamiento(g, [w, p], c, o) {
  const contorno = contornoLocal({ ...o, dims: [Math.max(w, 0.01), Math.max(p, 0.01)] });
  const piso = new THREE.Mesh(superficie(contorno, 0.008), mat(c, { roughness: 1, side: THREE.DoubleSide }));
  piso.receiveShadow = true;
  g.add(piso);
  lineaCerrada(g, contorno, 0.02, '#e9e9e9');
  const { plazas, accesibles } = plazasEstacionamiento(o);
  const pts = [];
  for (const q of plazas) {
    for (let i = 0; i < 4; i++) {
      const a = q[i];
      const b = q[(i + 1) % 4];
      pts.push(new THREE.Vector3(a[0], 0.02, a[1]), new THREE.Vector3(b[0], 0.02, b[1]));
    }
  }
  if (pts.length) {
    const lineas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#f2f2f2', transparent: true, opacity: 0.85 }));
    lineas.userData.propio = true;
    lineas.raycast = () => {};
    g.add(lineas);
  }
  for (const q of plazas.slice(0, accesibles)) {
    const m = new THREE.Mesh(superficie(q, 0.015), mat('#2f72bd', { roughness: 1, side: THREE.DoubleSide }));
    m.userData.sinBordes = true;
    g.add(m);
  }
}

// Camino: una franja del ancho indicado siguiendo los puntos, con una línea del color de su uso.
function camino(g, d, c, o) {
  const pts = lineaLocal(o);
  const ancho = Math.max(Number(o.ancho) || 3, 0.3);
  const color = o.color || USOS_CAMINO[o.uso]?.color || c;
  const piso = mat(tono(color, 0.62), { roughness: 1 });
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-3) continue;
    const tramo = new THREE.Mesh(new THREE.PlaneGeometry(L, ancho), piso);
    tramo.rotation.set(-Math.PI / 2, 0, 0);
    tramo.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -Math.atan2(bz - az, bx - ax));
    tramo.position.set((ax + bx) / 2, 0.01, (az + bz) / 2);
    tramo.receiveShadow = true;
    tramo.userData.sinBordes = true;
    g.add(tramo);
  }
  for (const [x, z] of pts.slice(1, -1)) {
    const union = new THREE.Mesh(new THREE.CircleGeometry(ancho / 2, 24), piso);
    union.rotation.x = -Math.PI / 2;
    union.position.set(x, 0.0105, z);
    union.userData.sinBordes = true;
    g.add(union);
  }
  const eje = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.02, z))),
    new THREE.LineDashedMaterial({ color, dashSize: 0.8, gapSize: 0.5 })
  );
  eje.computeLineDistances();
  eje.userData.propio = true;
  eje.raycast = () => {};
  g.add(eje);
}

// Vallado: paños de reja entre postes, siguiendo los puntos.
function vallado(g, [, , h], c, o) {
  const pts = lineaLocal(o);
  const alto = h || 1.1;
  const reja = mat(c, { transparent: true, opacity: 0.55, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const poste = mat(tono(c, -0.25), { metalness: 0.4, roughness: 0.5 });
  const modulo = Number(o.modulo) > 0.3 ? Number(o.modulo) : 2.5;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-3) continue;
    const ang = -Math.atan2(bz - az, bx - ax);
    const panio = new THREE.Mesh(new THREE.BoxGeometry(L, alto * 0.86, 0.025), reja);
    panio.position.set((ax + bx) / 2, alto * 0.5, (az + bz) / 2);
    panio.rotation.y = ang;
    panio.userData.sinBordes = true;
    g.add(panio);
    const n = Math.max(1, Math.round(L / modulo));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      bloque(g, poste, 0.05, alto, 0.05, ax + (bx - ax) * t, 0, az + (bz - az) * t);
    }
  }
}

// Acceso o portón: dos parantes y un travesaño. Si sirve como salida de emergencia, en verde.
function acceso(g, [w, p, h], c, o) {
  const color = o.salida === false ? c : '#1d8a55';
  const m = mat(color, { roughness: 0.6 });
  const lado = Math.min(0.25, w * 0.08);
  for (const s of [-1, 1]) bloque(g, m, lado, h, Math.max(p, 0.1), s * (w / 2 - lado / 2));
  bloque(g, m, w, Math.min(0.35, h * 0.12), Math.max(p, 0.1), 0, h - Math.min(0.35, h * 0.12));
  const umbral = new THREE.Mesh(new THREE.PlaneGeometry(w, Math.max(p, 0.6)), mat(tono(color, 0.55), { roughness: 1 }));
  umbral.rotation.x = -Math.PI / 2;
  umbral.position.y = 0.012;
  umbral.userData.sinBordes = true;
  g.add(umbral);
}

function vehiculo(g, [w, p, h], c, o) {
  const m = mat(c, { roughness: 0.4, metalness: 0.3 });
  if (o.tipo === 'camion' || o.tipo === 'ambulancia') {
    const cabina = Math.min(p * 0.28, 2);
    bloque(g, m, w * 0.96, h * 0.72, cabina, 0, 0.35, p / 2 - cabina / 2);
    bloque(g, mat(o.tipo === 'ambulancia' ? '#f4f4f4' : tono(c, 0.25), { roughness: 0.6 }), w, h - 0.3, p - cabina - 0.1, 0, 0.3, -cabina / 2 - 0.05);
    if (o.tipo === 'ambulancia') bloque(g, mat('#d23a3a'), w + 0.02, 0.18, p - cabina - 0.12, 0, h * 0.55, -cabina / 2 - 0.05);
  } else {
    bloque(g, m, w, h * 0.5, p, 0, 0.2);
    bloque(g, mat(tono(c, -0.35), { roughness: 0.2, metalness: 0.4 }), w * 0.86, h * 0.36, p * 0.5, 0, 0.2 + h * 0.5, -p * 0.04);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rueda = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16), negro());
      rueda.rotation.z = Math.PI / 2;
      rueda.position.set(sx * (w / 2 - 0.1), 0.32, sz * (p / 2 - Math.min(0.8, p * 0.18)));
      rueda.userData.sinBordes = true;
      g.add(rueda);
    }
  }
}

// Carpa grande de eventos (más de 6 m de lado): parantes cada 5 m en los lados largos y techo a dos aguas a lo
// largo, con la cumbrera arriba de todo. Abierta a los costados.
function carpaGrande(g, [w, p, h], c) {
  const enZ = p >= w;
  const L = enZ ? p : w;
  const A = enZ ? w : p;
  const pared = Math.max(Math.min(h * 0.7, h - 0.6), h * 0.4);
  const metal = mat('#9aa1a8', { metalness: 0.5 });
  const n = Math.max(1, Math.round(L / 5));
  for (let i = 0; i <= n; i++) {
    const u = -L / 2 + 0.05 + ((L - 0.1) / n) * i;
    for (const s of [-1, 1]) {
      const lado = s * (A / 2 - 0.05);
      tubo(g, metal, 0.05, pared, enZ ? lado : u, 0, enZ ? u : lado, 8);
    }
  }
  // Techo: el perfil del frente (triángulo sobre el alero) estirado a lo largo.
  const perfil = new THREE.Shape([new THREE.Vector2(-A / 2, 0), new THREE.Vector2(A / 2, 0), new THREE.Vector2(0, h - pared)]);
  const geo = new THREE.ExtrudeGeometry(perfil, { depth: L, bevelEnabled: false });
  geo.translate(0, pared, -L / 2);
  if (!enZ) geo.rotateY(Math.PI / 2);
  const techo = new THREE.Mesh(geo, mat(c, { roughness: 0.9 }));
  g.add(techo);
}

// Gazebo (o carpa chica): cuatro parantes y techo a cuatro aguas. Si es grande, carpa a dos aguas.
function carpa(g, [w, p, h], c) {
  if (Math.max(w, p) > 6) return carpaGrande(g, [w, p, h], c);
  const pared = h * 0.72;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tubo(g, mat('#9aa1a8', { metalness: 0.5 }), 0.035, pared, sx * (w / 2 - 0.04), 0, sz * (p / 2 - 0.04), 8);
  const techo = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, p) / 2, h - pared, 4, 1), mat(c, { roughness: 0.9 }));
  techo.rotation.y = Math.PI / 4;
  techo.scale.set(w / Math.hypot(w, p) * Math.SQRT2, 1, p / Math.hypot(w, p) * Math.SQRT2);
  techo.position.y = pared + (h - pared) / 2;
  g.add(techo);
}

// Puesto genérico: mostrador y fondo (guardarropa, boletería, carga de celulares, food truck).
function puestoAtencion(g, [w, p, h], c, o) {
  if (o.tipo === 'foodtruck') {
    vehiculo(g, [w, p, h], c, { ...o, tipo: 'camion' });
    bloque(g, mat('#141414'), 0.02, h * 0.3, p * 0.45, w / 2 + 0.01, h * 0.45, -p * 0.08);
    return;
  }
  bloque(g, mat(c), w, h, Math.max(p * 0.25, 0.1), 0, 0, -p / 2 + Math.max(p * 0.25, 0.1) / 2);
  bloque(g, mat(tono(c, 0.25)), w, Math.min(1.05, h * 0.5), Math.max(p * 0.35, 0.1), 0, 0, p / 2 - Math.max(p * 0.35, 0.1) / 2);
  bloque(g, mat(tono(c, -0.2)), w, 0.08, p, 0, h - 0.08);
}

// Señal vertical de servicio: un parante y un cartel del color del servicio con su símbolo.
function totem(g, [w, p, h], c, o) {
  tubo(g, mat('#2b2d31'), 0.04, h * 0.7, 0, 0, 0, 8);
  bloque(g, mat(c, { roughness: 0.5 }), w, Math.min(w, h * 0.35), Math.max(p, 0.04), 0, h - Math.min(w, h * 0.35));
  if (o.tipo === 'primeros_auxilios' || o.tipo === 'agua') return;
}

function primerosAuxilios(g, [w, p, h], c) {
  carpa(g, [w, p, h], c);
  for (const [a, b] of [
    [0.9, 0.3],
    [0.3, 0.9],
  ]) {
    const cruz = new THREE.Mesh(new THREE.PlaneGeometry(a, b), mat('#d23a3a', { side: THREE.DoubleSide }));
    cruz.position.set(0, h * 0.45, p / 2 + 0.02);
    cruz.userData.sinBordes = true;
    g.add(cruz);
  }
}

function puntoAgua(g, [w, p, h], c) {
  bloque(g, mat('#e9edf1'), w, h * 0.75, p);
  tubo(g, mat(c, { transparent: true, opacity: 0.8, roughness: 0.2 }), Math.min(w, p) * 0.35, h * 0.25, 0, h * 0.75, 0, 18);
}

function controlAcceso(g, [w, p, h], c) {
  const n = Math.max(2, Math.round(w / 0.9));
  for (let i = 0; i <= n; i++) bloque(g, mat(c, { metalness: 0.5, roughness: 0.4 }), 0.12, h, p, -w / 2 + (w / n) * i);
}

function generador(g, [w, p, h], c) {
  bloque(g, mat(c, { roughness: 0.6 }), w, h * 0.92, p, 0, h * 0.08);
  bloque(g, negro(), w * 0.98, h * 0.08, p * 0.9);
  for (let i = 0; i < 6; i++) bloque(g, mat(tono(c, -0.35)), w * 0.4, 0.03, 0.01, -w * 0.22, h * 0.3 + i * h * 0.08, p / 2 + 0.005);
  tubo(g, negro(), 0.05, 0.3, w * 0.35, h, -p * 0.2, 10);
}

function tablero(g, [w, p, h], c) {
  bloque(g, mat(c, { metalness: 0.4, roughness: 0.5 }), w, h, p);
  bloque(g, mat('#e8aa4c'), w * 0.3, w * 0.3, 0.01, 0, h * 0.75, p / 2 + 0.005);
}

function tacho(g, [w, p, h], c) {
  tubo(g, mat(c), w / 2, h, 0, 0, 0, 18).scale.z = p / Math.max(w, 0.001);
}

// Marcador de un punto (por ejemplo, ubicado con coordenadas de Google Maps).
function marcador(g, [w, , h], c) {
  const r = Math.max(w * 0.35, 0.15);
  tubo(g, mat(c), 0.03, h - r * 2, 0, 0, 0, 8);
  const bola = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(c, { emissive: c, emissiveIntensity: 0.3 }));
  bola.position.y = h - r;
  bola.userData.sinBordes = true;
  g.add(bola);
}

function etiqueta(g, [w, p], c) {
  const malla = new THREE.Mesh(new THREE.CircleGeometry(Math.max(Math.min(w, p) / 2, 0.05), 24), mat(c));
  malla.rotation.x = -Math.PI / 2;
  malla.position.y = 0.012;
  g.add(malla);
}

// Objetos que no ocupan lugar y se dibujan solo con un rótulo (textos): una superficie invisible para poder
// elegirlos con el mouse.
function invisible(g, [w, p]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, 0.2), Math.max(p, 0.2)), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.userData.propio = true;
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  g.add(m);
}

// Flecha pintada en el piso, apuntando hacia el frente (+y local).
function flecha(g, [w, p], c) {
  const cabeza = Math.min(p * 0.4, w * 1.4);
  const cuerpo = w * 0.42;
  const forma = new THREE.Shape([
    new THREE.Vector2(-cuerpo / 2, p / 2),
    new THREE.Vector2(cuerpo / 2, p / 2),
    new THREE.Vector2(cuerpo / 2, -(p / 2 - cabeza)),
    new THREE.Vector2(w / 2, -(p / 2 - cabeza)),
    new THREE.Vector2(0, -p / 2),
    new THREE.Vector2(-w / 2, -(p / 2 - cabeza)),
    new THREE.Vector2(-cuerpo / 2, -(p / 2 - cabeza)),
  ]);
  const geo = new THREE.ShapeGeometry(forma);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(c, { side: THREE.DoubleSide }));
  m.position.y = 0.015;
  g.add(m);
}

// Señal o cartel en un parante.
function senal(g, [w, p, h], c) {
  const panel = Math.min(w * 0.75, h * 0.45);
  tubo(g, mat('#3a3d42', { metalness: 0.4 }), 0.03, h - panel, 0, 0, 0, 8);
  bloque(g, mat(c), w, panel, Math.max(p, 0.02), 0, h - panel);
}

// Puesto de staff: un círculo en el piso del color del rol y una persona estilizada.
function puestoStaff(g, [w, p], c, o) {
  const color = o.color || ROLES_STAFF[o.rol]?.color || c;
  const disco = new THREE.Mesh(new THREE.CircleGeometry(Math.max(Math.min(w, p) / 2, 0.3), 32), mat(color, { transparent: true, opacity: 0.45, depthWrite: false }));
  disco.rotation.x = -Math.PI / 2;
  disco.position.y = 0.014;
  disco.userData.sinBordes = true;
  g.add(disco);
  persona(g, [0.45, 0.28, 1.7], color);
}

function medicion(g, [w, , h], c) {
  for (const a of [0, 2.1, 4.2]) {
    const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h * 0.75, 6), mat('#2b2d31'));
    pata.position.set(Math.cos(a) * 0.12, h * 0.36, Math.sin(a) * 0.12);
    pata.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
    pata.userData.sinBordes = true;
    g.add(pata);
  }
  bloque(g, mat(c), Math.max(w * 0.4, 0.12), h * 0.25, 0.08, 0, h * 0.75);
}

// Cómo se dibuja cada tipo. Los datos (nombre, medidas típicas, categoría) están en tipos-datos.js.
const CREAR = {
  columna, tarima, casita, carpa, gazebo: carpa, escalera,
  cabina_dj: cabinaDJ, parlante, sub, luz: cabezal, beam, estrobo, barra_led: barraLed, par, truss, pantalla, poste_v: posteV, farol,
  generador, tablero,
  barra, heladera, foodtruck: puestoAtencion,
  mesa, mesa_alta: mesaAlta, silla, banqueta, sillon,
  bano_quimico: banoQuimico, matafuego, agua: puntoAgua, guardarropa: puestoAtencion, primeros_auxilios: primerosAuxilios,
  punto_encuentro: totem, carga_celulares: puestoAtencion, boleteria: puestoAtencion, info: totem, tacho, ambulancia: vehiculo,
  estacionamiento, camino, vallado, acceso, control_acceso: controlAcceso, auto: vehiculo, camion: vehiculo,
  puesto: puestoStaff,
  planta, tela, arbol, hilera,
  zona, etiqueta, senal, texto: invisible, flecha, marcador, medicion,
  persona, caja, cilindro,
};

export const TIPOS = Object.fromEntries(Object.entries(TIPOS_DATOS).map(([t, d]) => [t, { ...d, crear: CREAR[t] || caja }]));

export const defDe = (o) => TIPOS[o.tipo] || TIPOS.caja;

function agregarBordes(raiz) {
  const mallas = [];
  raiz.traverse((n) => {
    if (n.isMesh && !n.userData.sinBordes) mallas.push(n);
  });
  for (const m of mallas) {
    const linea = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), matBorde);
    linea.raycast = () => {};
    m.add(linea);
  }
}

// Devuelve un grupo ubicado y girado según el objeto de la escena.
export function crearObjeto3D(o, ctx = {}) {
  const def = defDe(o);
  const g = new THREE.Group();
  const cuerpo = new THREE.Group();
  g.add(cuerpo);
  const d = [0, 1, 2].map((i) => Math.max(Number(o.dims?.[i]) || 0, 0));
  def.crear(cuerpo, d, o.color || def.color, o, ctx);
  cuerpo.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = !def.sinSombra;
      n.receiveShadow = !def.piso;
    }
  });
  if (!def.sinBordes) agregarBordes(cuerpo);
  g.position.set(o.pos[0], o.elev || 0, o.pos[1]);
  g.rotation.y = -THREE.MathUtils.degToRad(o.rot || 0);
  g.userData.id = o.id;
  return g;
}
