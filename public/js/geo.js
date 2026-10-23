// Ubicación real del lugar: pasar de coordenadas (latitud, longitud) a metros de la escena y al revés.
// Para un predio (hasta algunos kilómetros) alcanza con una proyección plana alrededor de un punto.
//
// escena.geo = { lat, lng, x, y, norte }: el punto (x, y) de la escena está en (lat, lng), y "norte" es hacia
// dónde queda el norte en la planta, en grados y en sentido horario desde arriba (0 = norte hacia arriba).

const R = 6371008.8;
const rad = (g) => (g * Math.PI) / 180;
const grados = (r) => (r * 180) / Math.PI;
const dentro = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Lo que copia Google Maps ("-34.60372, -58.38161"), Google Earth ("34°36'13.4"S 58°22'53.8"W"),
// decimales con coma ("-34,6037 -58,3816") o con hemisferio ("34.6037 S, 58.3816 W").
export function leerCoordenadas(texto) {
  const t = String(texto || '')
    .trim()
    .replace(/[()]/g, '')
    .replace(/[′’]/g, "'")
    .replace(/[″”]/g, '"');
  if (!t) return null;
  const signo = (v, h) => (/[SWO]/i.test(h || '') ? -Math.abs(v) : v);

  const dms = t.match(/(\d+)\s*°\s*(\d+)\s*'\s*([\d.,]+)?\s*"?\s*([NS])[\s,;]*(\d+)\s*°\s*(\d+)\s*'\s*([\d.,]+)?\s*"?\s*([EWO])/i);
  if (dms) {
    const a = (g, m, s) => Number(g) + Number(m) / 60 + Number(String(s || 0).replace(',', '.')) / 3600;
    const lat = signo(a(dms[1], dms[2], dms[3]), dms[4]);
    const lng = signo(a(dms[5], dms[6], dms[7]), dms[8]);
    return dentro(lat, lng) ? [lat, lng] : null;
  }

  const conPunto = t.match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EWO])?/i);
  const conComa = t.match(/^(-?\d+,\d+)\s*[;\s]\s*(-?\d+,\d+)$/);
  let lat;
  let lng;
  if (conComa) {
    lat = Number(conComa[1].replace(',', '.'));
    lng = Number(conComa[2].replace(',', '.'));
  } else if (conPunto) {
    lat = signo(Number(conPunto[1]), conPunto[2]);
    lng = signo(Number(conPunto[3]), conPunto[4]);
  } else return null;
  return dentro(lat, lng) ? [lat, lng] : null;
}

export const textoCoordenadas = ([lat, lng], dec = 6) => `${lat.toFixed(dec)}, ${lng.toFixed(dec)}`;

// Metros hacia el este y hacia el norte de b respecto de a.
export function metrosEntre(a, b) {
  const lat0 = rad(a[0]);
  return [R * Math.cos(lat0) * rad(b[1] - a[1]), R * rad(b[0] - a[0])];
}

// Distancia sobre la Tierra entre dos coordenadas (haversine), en metros.
export function distanciaReal(a, b) {
  const dφ = rad(b[0] - a[0]);
  const dλ = rad(b[1] - a[1]);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ejes = (norte) => {
  const t = rad(norte || 0);
  return { E: [Math.cos(t), Math.sin(t)], N: [Math.sin(t), -Math.cos(t)] };
};

export const tieneGeo = (escena) => {
  const g = escena?.geo;
  return Boolean(g && dentro(g.lat, g.lng));
};

export function escenaAGeo(escena, [x, y]) {
  const g = escena.geo;
  const { E, N } = ejes(g.norte);
  const dx = x - (g.x || 0);
  const dy = y - (g.y || 0);
  const este = dx * E[0] + dy * E[1];
  const norteM = dx * N[0] + dy * N[1];
  const lat = g.lat + grados(norteM / R);
  const lng = g.lng + grados(este / (R * Math.cos(rad(g.lat))));
  return [lat, lng];
}

export function geoAEscena(escena, [lat, lng]) {
  const g = escena.geo;
  const { E, N } = ejes(g.norte);
  const [este, norteM] = metrosEntre([g.lat, g.lng], [lat, lng]);
  return [(g.x || 0) + este * E[0] + norteM * N[0], (g.y || 0) + este * E[1] + norteM * N[1]];
}

// Con dos puntos marcados en la imagen (en metros de la escena, todavía sin escala real) y sus
// coordenadas, devuelve la escala a aplicar alrededor de A y la ubicación de la escena.
export function calibrarConCoordenadas(A, B, geoA, geoB) {
  const [e, n] = metrosEntre(geoA, geoB);
  const real = Math.hypot(e, n);
  const enImagen = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (real < 1 || enImagen < 1e-6) return null;
  const escala = real / enImagen;
  // Ángulo de AB en la planta y en un mapa con el norte arriba: la diferencia es hacia dónde queda el norte.
  const enPlanta = Math.atan2(B[1] - A[1], B[0] - A[0]);
  const enMapa = Math.atan2(-n, e);
  let norte = grados(enPlanta - enMapa);
  norte = ((norte % 360) + 360) % 360;
  return { escala, real, norte: Math.round(norte * 100) / 100, geo: { lat: geoA[0], lng: geoA[1], x: A[0], y: A[1], norte: Math.round(norte * 100) / 100 } };
}

// Rumbo de la brújula (0 = norte, 90 = este) de una dirección de la planta.
export function rumbo(escena, [dx, dy]) {
  const { E, N } = ejes(escena.geo?.norte);
  const este = dx * E[0] + dy * E[1];
  const norteM = dx * N[0] + dy * N[1];
  return (grados(Math.atan2(este, norteM)) + 360) % 360;
}

export const enlaceGoogleMaps = ([lat, lng]) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
export const enlaceComoLlegar = ([lat, lng]) => `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
