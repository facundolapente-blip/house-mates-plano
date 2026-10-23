// Construye pisos, paredes, aberturas y techo de cada área del lugar.
// El contorno marca la cara INTERIOR de las paredes; el espesor crece hacia afuera.
// La pared i va del punto i al punto i+1 del contorno.

import * as THREE from 'three';
import { matBorde } from './tipos.js';
import { areaFirmada } from './geometria.js';
import { fm } from './formato.js';

const matVidrio = new THREE.MeshStandardMaterial({ color: '#a8c8dc', transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false });

function altoDePared(P, i) {
  if (!P || P.sin?.includes(i)) return 0;
  if (Array.isArray(P.alto)) return Number(P.alto[i]) || 0;
  return Number(P.alto) || 0;
}

function bordes(geo, padre) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), matBorde);
  l.raycast = () => {};
  padre.add(l);
}

export function construirArea(area) {
  const grupo = new THREE.Group();
  const res = { grupo, paredes: [], cotas: [], rotulos: [], techo: null };
  const pts = area.contorno;
  if (pts.length < 3) return res;
  const nivel = Number(area.nivel) || 0;

  // Piso: una losa fina, como base de maqueta.
  const forma = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
  const grosor = 0.08;
  const geoPiso = new THREE.ExtrudeGeometry(forma, { depth: grosor, bevelEnabled: false });
  geoPiso.rotateX(-Math.PI / 2);
  geoPiso.translate(0, nivel - grosor, 0);
  const piso = new THREE.Mesh(geoPiso, new THREE.MeshStandardMaterial({ color: area.piso || '#d3d7d8', roughness: 0.95 }));
  piso.userData.propio = true;
  piso.receiveShadow = true;
  grupo.add(piso);
  bordes(geoPiso, grupo);

  const P = area.paredes;
  const espesor = Number(P?.espesor ?? 0.2) || 0.2;
  const signo = Math.sign(areaFirmada(pts)) || 1;
  const n = pts.length;
  const lados = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    const ux = L ? dx / L : 0;
    const uy = L ? dy / L : 0;
    return { i, a, b, L, ux, uy, nx: signo * uy, ny: -signo * ux };
  });
  const giro = (A, B) => (A.ux * B.uy - A.uy * B.ux) * signo;
  const enPared = (lado, s, haciaAfuera, y) =>
    new THREE.Vector3(lado.a[0] + lado.ux * s + lado.nx * haciaAfuera, y, lado.a[1] + lado.uy * s + lado.ny * haciaAfuera);

  // Las cotas van por fuera de las paredes, como en un plano. Sin pared, solo si el área no tiene ninguna.
  const sinParedes = lados.every((l) => altoDePared(P, l.i) <= 0);
  let altoMax = 0;
  for (const lado of lados) {
    if (lado.L < 1e-6) continue;
    const alto = altoDePared(P, lado.i);
    if (alto > 0 || sinParedes) {
      res.cotas.push({ texto: `${fm(lado.L)} m`, pos: enPared(lado, lado.L / 2, (alto > 0 ? espesor : 0) + 0.45, nivel + 0.03) });
    }
    if (alto <= 0) continue;
    altoMax = Math.max(altoMax, alto);

    // En esquinas salientes la pared se estira para cerrar el ángulo; en las entrantes se recorta.
    const sig = lados[(lado.i + 1) % n];
    let extFin = 0;
    if (altoDePared(P, sig.i) > 0) {
      const gi = giro(lado, sig);
      if (gi > 1e-9) extFin = espesor;
      else if (gi < -1e-9) extFin = -espesor;
    }

    const aberturas = (area.aberturas || [])
      .filter((ab) => ab.pared === lado.i)
      .map((ab) => {
        const ventana = ab.tipo === 'ventana';
        const base = Number(ab.antepecho ?? (ventana ? 1 : 0));
        const ini = Math.min(lado.L, Math.max(0, Number(ab.desde) || 0));
        return {
          ...ab,
          ini,
          fin: Math.min(lado.L, ini + (Number(ab.ancho) || 0.9)),
          base,
          top: base + (Number(ab.alto) || (ventana ? 1.2 : 2.1)),
        };
      })
      .sort((p, q) => p.ini - q.ini);

    const piezas = [];
    let cursor = 0;
    for (const ab of aberturas) {
      if (ab.ini > cursor) piezas.push([cursor, ab.ini, 0, alto]);
      if (ab.base > 0) piezas.push([ab.ini, ab.fin, 0, Math.min(ab.base, alto)]);
      if (ab.top < alto) piezas.push([ab.ini, ab.fin, ab.top, alto]);
      cursor = Math.max(cursor, ab.fin);
    }
    if (lado.L + extFin > cursor) piezas.push([cursor, lado.L + extFin, 0, alto]);

    const matPared = new THREE.MeshStandardMaterial({ color: P.color || '#f1f0ec', roughness: 0.92 });
    const gp = new THREE.Group();
    const angulo = -Math.atan2(lado.uy, lado.ux);
    for (const [s0, s1, y0, y1] of piezas) {
      if (s1 - s0 < 1e-4 || y1 - y0 < 1e-4) continue;
      const geo = new THREE.BoxGeometry(s1 - s0, y1 - y0, espesor);
      const m = new THREE.Mesh(geo, matPared);
      m.position.copy(enPared(lado, (s0 + s1) / 2, espesor / 2, nivel + (y0 + y1) / 2));
      m.rotation.y = angulo;
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.pared = true;
      bordes(geo, m);
      gp.add(m);
    }
    for (const ab of aberturas) {
      if (ab.tipo !== 'ventana') continue;
      const arriba = Math.min(ab.top, alto);
      const vidrio = new THREE.Mesh(new THREE.BoxGeometry(ab.fin - ab.ini, Math.max(arriba - ab.base, 0.01), 0.02), matVidrio);
      vidrio.position.copy(enPared(lado, (ab.ini + ab.fin) / 2, espesor / 2, nivel + (ab.base + arriba) / 2));
      vidrio.rotation.y = angulo;
      gp.add(vidrio);
    }
    gp.userData = {
      normal: new THREE.Vector3(lado.nx, 0, lado.ny),
      centro: enPared(lado, lado.L / 2, 0, nivel + alto / 2),
      material: matPared,
      fantasma: false,
    };
    grupo.add(gp);
    res.paredes.push(gp);

    for (const ab of aberturas) {
      if (!ab.nombre && !ab.salida) continue;
      res.rotulos.push({
        texto: ab.nombre || 'Salida',
        detalle: `${fm(ab.fin - ab.ini)} m`,
        salida: Boolean(ab.salida),
        pos: enPared(lado, (ab.ini + ab.fin) / 2, -0.55, nivel + 0.05),
      });
    }
  }

  if (altoMax > 0 && area.techo !== false) {
    const geo = new THREE.ShapeGeometry(forma);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, nivel + altoMax, 0);
    const techo = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.95, side: THREE.DoubleSide }));
    techo.userData.propio = true;
    techo.visible = false;
    grupo.add(techo);
    res.techo = techo;
  }
  return res;
}
