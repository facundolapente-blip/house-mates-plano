// Cálculos del predio que no dependen del motor 3D: cocheras de un estacionamiento, largo y tiempo de
// los caminos, módulos de vallado. Todo en coordenadas del objeto (ver puntosMundo en geometria.js).

import { cajaDe, puntoEnPoligono, longitud } from './geometria.js';

export const VEHICULOS = {
  auto: { nombre: 'Autos', cochera: [2.5, 5], calle: 6 },
  moto: { nombre: 'Motos', cochera: [1, 2.2], calle: 3 },
  combi: { nombre: 'Combis y vans', cochera: [3, 6.5], calle: 7 },
};

export const USOS_CAMINO = {
  publico: { nombre: 'Público', color: '#2447f5' },
  proveedores: { nombre: 'Proveedores y carga', color: '#e8aa4c' },
  emergencia: { nombre: 'Emergencia', color: '#2fbf71' },
  staff: { nombre: 'Staff', color: '#8a4fff' },
};

// Velocidad de una persona caminando tranquila, en metros por minuto (unos 4,3 km/h).
export const PASO_MIN = 72;

const rotar = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export function contornoLocal(o) {
  if (Array.isArray(o.puntos) && o.puntos.length >= 3) return o.puntos;
  const [w, p] = o.dims;
  return [
    [-w / 2, -p / 2],
    [w / 2, -p / 2],
    [w / 2, p / 2],
    [-w / 2, p / 2],
  ];
}

export function medidasCochera(o) {
  const v = VEHICULOS[o.vehiculo] || VEHICULOS.auto;
  const c = Array.isArray(o.cochera) && o.cochera.length === 2 && o.cochera.every((n) => n > 0.3) ? o.cochera : v.cochera;
  const calle = Number(o.calle) > 0 ? Number(o.calle) : v.calle;
  return { ancho: c[0], fondo: c[1], calle };
}

// Cocheras que entran enteras en el contorno: filas enfrentadas de a dos con una calle en el medio
// (cochera, calle, cochera, y la fila siguiente pegada espalda con espalda). "angulo" gira las filas.
export function plazasEstacionamiento(o) {
  const { ancho, fondo, calle } = medidasCochera(o);
  const ang = ((Number(o.angulo) || 0) * Math.PI) / 180;
  const P = contornoLocal(o).map((p) => rotar(p, -ang));
  const b = cajaDe(P);
  const periodo = fondo * 2 + calle;
  const plazas = [];
  const calles = [];
  // Más de 20.000 cocheras no es un estacionamiento razonable: se corta para no trabar la app.
  for (let y = b.minY; y + fondo <= b.maxY + 1e-6 && plazas.length < 20000; y += periodo) {
    const filas = [y, y + fondo + calle];
    if (filas[1] + fondo <= b.maxY + 1e-6) calles.push([y + fondo, y + fondo + calle]);
    for (const y0 of filas) {
      if (y0 + fondo > b.maxY + 1e-6) continue;
      for (let x = b.minX; x + ancho <= b.maxX + 1e-6; x += ancho) {
        const esq = [
          [x, y0],
          [x + ancho, y0],
          [x + ancho, y0 + fondo],
          [x, y0 + fondo],
        ];
        // Se prueba con las esquinas un milímetro hacia adentro: una cochera justo sobre el borde entra.
        const adentro = [
          [x + 0.001, y0 + 0.001],
          [x + ancho - 0.001, y0 + 0.001],
          [x + ancho - 0.001, y0 + fondo - 0.001],
          [x + 0.001, y0 + fondo - 0.001],
        ];
        if (adentro.every(([px, py]) => puntoEnPoligono(px, py, P))) plazas.push(esq.map((p) => rotar(p, ang)));
      }
    }
  }
  const accesibles = Math.min(plazas.length, Math.max(0, Math.round(Number(o.accesibles) || 0)));
  return { plazas, cantidad: plazas.length, accesibles, ancho, fondo, calle, calles: calles.length };
}

export function lineaLocal(o) {
  if (Array.isArray(o.puntos) && o.puntos.length >= 2) return o.puntos;
  return [
    [-o.dims[0] / 2, 0],
    [o.dims[0] / 2, 0],
  ];
}

export const largoDe = (o) => longitud(lineaLocal(o));

export function textoTiempo(metros) {
  const min = metros / PASO_MIN;
  if (min < 1) return 'menos de 1 min';
  return `${Math.round(min)} min caminando`;
}

export const moduloVallado = (o) => (Number(o.modulo) > 0.3 ? Number(o.modulo) : 2.5);
export const modulosVallado = (o) => Math.max(1, Math.ceil(largoDe(o) / moduloVallado(o) - 1e-6));
