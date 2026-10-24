// Exportar la escena a Google Earth y Google My Maps (KML 2.2): ambientes, zonas, estacionamientos, caminos,
// vallados y objetos sobre el terreno real. Necesita la ubicación de la escena (escena.geo, ver geo.js).
//
// Coordenadas en KML: "longitud,latitud,altura". Los polígonos van cerrados (el primer punto repetido al
// final) y con el anillo exterior en sentido antihorario, como pide la norma.

import { tieneGeo, escenaAGeo, rumbo } from './geo.js';
import { esquinas, puntosMundo, esPoligono, superficieDe, areaFirmada, cajaDe } from './geometria.js';
import { lineaLocal, contornoLocal, plazasEstacionamiento, USOS_CAMINO, largoDe, textoTiempo, modulosVallado } from './predio.js';
import { CATEGORIAS, defDatos, catDe, troncoDe, ROLES_STAFF } from './tipos-datos.js';
import { esc, fm } from './formato.js';
import { textoMedida } from './computo.js';

// Colores de la marca y de cada categoría (sobre la foto satelital conviene que sean vivos).
const COLOR = { claro: '#FAFAFA', azul: '#2447F5', violeta: '#8A4FFF', verde: '#2FBF71', gris: '#9AA1A8', piso: '#4B4F57' };
const COLOR_CAT = {
  estructura: '#FAFAFA',
  sonido: '#2447F5',
  luces: '#8A4FFF',
  energia: '#F2C94C',
  barra: '#FF8A3D',
  mobiliario: '#C9B79C',
  servicios: '#36C6FF',
  predio: '#9AA1A8',
  staff: '#B88CFF',
  deco: '#7FB069',
  naturaleza: '#4F8A3B',
  zonas: '#FAFAFA',
  otros: '#D6D2C9',
};
// Ícono blanco de Google Earth que toma el color del estilo. Lo carga Google Earth, no la app.
const ICONO = 'http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png';

// Tipos que van en carpetas propias (con su forma) y no como puntos de su categoría.
const CON_CARPETA = new Set(['zona', 'estacionamiento', 'camino', 'vallado', 'arbol', 'persona']);
// Objetos que no tienen sentido como superficie en el mapa (se dejan solo como punto).
const SIN_HUELLA = new Set(['texto', 'flecha', 'etiqueta', 'senal', 'marcador', 'medicion']);
const REDONDOS = new Set(['luz', 'par', 'beam', 'poste_v', 'farol', 'matafuego', 'mesa_alta', 'banqueta', 'cilindro', 'planta', 'arbol', 'puesto']);

/* ------------------------------------------------------------------ ayudas */

const hex6 = (c, def = '#FFFFFF') => {
  let h = String(c || '').trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((x) => x + x).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : hex6(def, '#FFFFFF');
};

// KML usa aabbggrr (alfa, azul, verde, rojo).
export function colorKML(color, alfa = 1) {
  const h = hex6(color);
  const a = Math.round(Math.max(0, Math.min(1, alfa)) * 255)
    .toString(16)
    .padStart(2, '0');
  return a + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
}

const lnglat = (escena, p) => {
  const [lat, lng] = escenaAGeo(escena, p);
  return [lng, lat];
};
const textoCoord = ([lng, lat]) => `${lng.toFixed(7)},${lat.toFixed(7)},0`;

// Anillo cerrado y antihorario (en longitud/latitud) a partir de puntos de la planta.
function anillo(escena, puntos) {
  const g = puntos.map((p) => lnglat(escena, p));
  const iguales = (a, b) => Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;
  while (g.length > 1 && iguales(g[0], g.at(-1))) g.pop();
  if (g.length < 3) return null;
  if (areaFirmada(g) < 0) g.reverse();
  g.push(g[0]);
  return g.map(textoCoord).join(' ');
}

const poligonoKML = (anilloTexto) =>
  `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${anilloTexto}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
const lineaKML = (escena, puntos) => `<LineString><tessellate>1</tessellate><coordinates>${puntos.map((p) => textoCoord(lnglat(escena, p))).join(' ')}</coordinates></LineString>`;
const puntoKML = (escena, p) => `<Point><coordinates>${textoCoord(lnglat(escena, p))}</coordinates></Point>`;

// Descripción en HTML simple (Google Earth y My Maps la muestran en el globo). El texto va escapado, así que
// nunca puede aparecer "]]>" adentro del CDATA.
function descripcion(filas) {
  const html = filas
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => (k ? `<b>${esc(k)}:</b> ${esc(v)}` : esc(v)))
    .join('<br>');
  return html ? `<description><![CDATA[${html}]]></description>` : '';
}

function marca({ nombre, desc = '', estilo, geometria, visible = true }) {
  return `<Placemark><name>${esc(nombre)}</name>${visible ? '' : '<visibility>0</visibility>'}${desc}<styleUrl>#${estilo}</styleUrl>${geometria}</Placemark>`;
}

function carpeta(nombre, marcas, { visible = true } = {}) {
  if (!marcas.length) return '';
  return `<Folder><name>${esc(nombre)}</name>${visible ? '' : '<visibility>0</visibility>'}\n${marcas.join('\n')}\n</Folder>`;
}

// Elipse (o círculo) girada como polígono de n lados, en la planta.
function elipse(c, rx, ry, rot = 0, n = 24) {
  const t = (rot * Math.PI) / 180;
  const co = Math.cos(t);
  const si = Math.sin(t);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    pts.push([c[0] + x * co - y * si, c[1] + x * si + y * co]);
  }
  return pts;
}

/* ------------------------------------------------------------------ exportar */

/**
 * KML de la escena para Google Earth o My Maps.
 * Opciones: nombre (del documento), huellas (true: los objetos de 1 m² o más llevan también su forma en el piso;
 * false: solo un punto, por si algún programa no acepta MultiGeometry).
 */
export function exportarKML(escena, { nombre, huellas = true } = {}) {
  if (!tieneGeo(escena)) {
    throw new Error('Para exportar a Google Earth primero ubicá la escena en el mapa (latitud y longitud de un punto del lugar).');
  }
  const areas = (escena.areas || []).filter((a) => Array.isArray(a.contorno) && a.contorno.length >= 3);
  const objetos = (escena.objetos || []).filter((o) => o && Array.isArray(o.pos) && Array.isArray(o.dims) && o.tipo !== 'persona');

  const estilos = new Map();
  const estilo = (id, xml) => {
    if (!estilos.has(id)) estilos.set(id, `<Style id="${id}">${xml}</Style>`);
    return id;
  };
  const linea = (color, ancho, alfa = 1) => `<LineStyle><color>${colorKML(color, alfa)}</color><width>${ancho}</width></LineStyle>`;
  const relleno = (color, alfa) => `<PolyStyle><color>${colorKML(color, alfa)}</color></PolyStyle>`;
  const icono = (color, escala = 0.9) => `<IconStyle><color>${colorKML(color)}</color><scale>${escala}</scale><Icon><href>${ICONO}</href></Icon></IconStyle>`;
  const rotulo = (escala = 0.8) => `<LabelStyle><scale>${escala}</scale></LabelStyle>`;

  const estiloSalida = () => estilo('salida', icono(COLOR.verde, 1.1) + `<LabelStyle><color>${colorKML(COLOR.verde)}</color><scale>0.9</scale></LabelStyle>` + linea(COLOR.verde, 2) + relleno(COLOR.verde, 0.45));
  const estiloCat = (cat) => estilo(`cat-${cat}`, icono(COLOR_CAT[cat] || COLOR.claro) + rotulo() + linea(COLOR_CAT[cat] || COLOR.claro, 1.5) + relleno(COLOR_CAT[cat] || COLOR.claro, 0.4));

  // Ambientes y sus salidas
  const enAmbientes = [];
  for (const a of areas) {
    const r = anillo(escena, a.contorno);
    if (!r) continue;
    const sup = Math.abs(areaFirmada(a.contorno));
    const alto = a.paredes && !Array.isArray(a.paredes.alto) ? Number(a.paredes.alto) || 0 : 0;
    enAmbientes.push(
      marca({
        nombre: a.nombre || a.id || 'Ambiente',
        desc: descripcion([
          ['Superficie', `${fm(sup, 1)} m²`],
          ['Techo', a.techo === false ? 'al aire libre' : 'techado'],
          ['Alto de paredes', alto ? `${fm(alto)} m` : ''],
          ['Nivel del piso', Number(a.nivel) ? `${fm(a.nivel)} m` : ''],
          ['', a.estimado ? 'Medidas estimadas: confirmar en el lugar' : ''],
        ]),
        estilo: estilo('ambiente', linea(COLOR.claro, 2) + relleno(COLOR.claro, 0.18)),
        geometria: poligonoKML(r),
      }),
    );
    const n = a.contorno.length;
    for (const ab of a.aberturas || []) {
      if (!ab.salida) continue;
      const p0 = a.contorno[ab.pared];
      const p1 = a.contorno[(ab.pared + 1) % n];
      if (!p0 || !p1) continue;
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
      const s = Math.min(L, (Number(ab.desde) || 0) + (Number(ab.ancho) || 0.9) / 2);
      const p = [p0[0] + ((p1[0] - p0[0]) * s) / L, p0[1] + ((p1[1] - p0[1]) * s) / L];
      enAmbientes.push(
        marca({
          nombre: ab.nombre || 'Salida',
          desc: descripcion([['Salida', `${ab.tipo || 'abertura'} de ${fm(Number(ab.ancho) || 0.9)} m de ancho`]]),
          estilo: estiloSalida(),
          geometria: puntoKML(escena, p),
        }),
      );
    }
  }

  const zonas = [];
  const estacionamientos = [];
  const caminos = [];
  const vallados = [];
  const arboles = [];
  const porCat = new Map(CATEGORIAS.map(([c]) => [c, []]));

  for (const o of objetos) {
    const def = defDatos(o);
    const nom = o.nombre || def.nombre;
    if (o.tipo === 'zona') {
      const color = o.color || def.color;
      const r = anillo(escena, esPoligono(o) ? puntosMundo(o) : esquinas(o));
      if (!r) continue;
      zonas.push(
        marca({
          nombre: nom,
          desc: descripcion([
            ['Superficie', `${fm(superficieDe(o), 1)} m²`],
            ['Uso', o.uso],
            ['Nota', o.nota],
          ]),
          estilo: estilo(`zona-${hex6(color)}`, linea(color, 2) + relleno(color, 0.35)),
          geometria: poligonoKML(r),
        }),
      );
    } else if (o.tipo === 'estacionamiento') {
      const r = anillo(escena, puntosMundo({ ...o, puntos: contornoLocal(o) }));
      if (!r) continue;
      const { cantidad, accesibles } = plazasEstacionamiento(o);
      estacionamientos.push(
        marca({
          nombre: nom,
          desc: descripcion([
            ['', `${cantidad} cocheras`],
            ['Accesibles', accesibles ? String(accesibles) : ''],
            ['Superficie', `${fm(superficieDe(o), 0)} m²`],
            ['Nota', o.nota],
          ]),
          estilo: estilo('estacionamiento', linea(COLOR.gris, 2) + relleno(COLOR.piso, 0.6)),
          geometria: poligonoKML(r),
        }),
      );
    } else if (o.tipo === 'camino') {
      const color = o.color || USOS_CAMINO[o.uso]?.color || COLOR.azul;
      const L = largoDe(o);
      caminos.push(
        marca({
          nombre: nom,
          desc: descripcion([
            ['Uso', USOS_CAMINO[o.uso]?.nombre || o.uso],
            ['Largo', `${fm(L, 0)} m · ${textoTiempo(L)}`],
            ['Ancho', `${fm(Number(o.ancho) || 3)} m`],
            ['Nota', o.nota],
          ]),
          estilo: estilo(`camino-${hex6(color)}`, linea(color, 5)),
          geometria: lineaKML(escena, puntosMundo({ ...o, puntos: lineaLocal(o) })),
        }),
      );
    } else if (o.tipo === 'vallado') {
      vallados.push(
        marca({
          nombre: nom,
          desc: descripcion([
            ['Largo', `${fm(largoDe(o), 1)} m`],
            ['Módulos', String(modulosVallado(o))],
            ['Proveedor', o.proveedor],
            ['Nota', o.nota],
          ]),
          estilo: estilo('vallado', linea('#D9DDE2', 3)),
          geometria: lineaKML(escena, puntosMundo({ ...o, puntos: lineaLocal(o) })),
        }),
      );
    } else if (o.tipo === 'arbol') {
      const copa = anillo(escena, elipse(o.pos, o.dims[0] / 2, o.dims[1] / 2, o.rot || 0));
      arboles.push(
        marca({
          nombre: nom,
          desc: descripcion([
            ['Copa', `${fm(o.dims[0], 1)} m`],
            ['Alto', `${fm(o.dims[2], 1)} m`],
            ['Tronco', `${fm(troncoDe(o))} m`],
            ['Nota', o.nota],
          ]),
          estilo: estilo('arbol', icono(COLOR_CAT.naturaleza, 0.6) + rotulo(0.6) + linea(COLOR_CAT.naturaleza, 1) + relleno(COLOR_CAT.naturaleza, 0.25)),
          geometria: huellas && copa ? `<MultiGeometry>${puntoKML(escena, o.pos)}${poligonoKML(copa)}</MultiGeometry>` : puntoKML(escena, o.pos),
          visible: false,
        }),
      );
    } else if (!CON_CARPETA.has(o.tipo)) {
      const cat = catDe(o);
      const esSalida = (o.tipo === 'acceso' && o.salida !== false) || o.tipo === 'punto_encuentro';
      let geometria = puntoKML(escena, o.pos);
      if (huellas && !SIN_HUELLA.has(o.tipo) && o.dims[0] * o.dims[1] >= 1) {
        const forma = REDONDOS.has(o.tipo) || (o.tipo === 'columna' && o.forma === 'redonda') ? elipse(o.pos, o.dims[0] / 2, o.dims[1] / 2, o.rot || 0) : esquinas(o);
        const r = anillo(escena, forma);
        if (r) geometria = `<MultiGeometry>${geometria}${poligonoKML(r)}</MultiGeometry>`;
      }
      const rol = o.tipo === 'puesto' ? ROLES_STAFF[o.rol]?.nombre || o.rol : '';
      porCat.get(cat).push(
        marca({
          nombre: o.tipo === 'texto' ? o.texto || nom : nom,
          desc: descripcion([
            ['Tipo', def.nombre],
            ['Medidas', textoMedida(o.dims, def.piso)],
            ['Altura de la base', Number(o.elev) > 0 ? `${fm(o.elev)} m` : ''],
            ['Modelo', o.ref],
            ['Proveedor', o.proveedor],
            ['Texto', o.tipo === 'senal' ? o.texto : ''],
            ['Rol', rol ? `${rol}${o.personas ? ` (${o.personas} personas)` : ''}` : ''],
            ['Turno', o.turno],
            ['Uso', o.tipo === 'acceso' ? (o.salida === false ? 'solo acceso, no es salida de emergencia' : 'acceso y salida de emergencia') : ''],
            ['Nota', o.nota],
            ['', o.estimado ? 'Medida estimada: confirmar en el lugar' : ''],
          ]),
          estilo: esSalida ? estiloSalida() : estiloCat(cat),
          geometria,
        }),
      );
    }
  }

  // Cámara inicial: arriba del lugar, con la planta orientada como en la app (arriba de la pantalla = fondo).
  const todos = [...areas.flatMap((a) => a.contorno), ...objetos.map((o) => o.pos)];
  const caja = todos.length ? cajaDe(todos) : { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const centro = lnglat(escena, [(caja.minX + caja.maxX) / 2, (caja.minY + caja.maxY) / 2]);
  const tam = Math.max(caja.maxX - caja.minX, caja.maxY - caja.minY, 20);
  const rumboArriba = rumbo(escena, [0, -1]);
  const camara = `<LookAt><longitude>${centro[0].toFixed(7)}</longitude><latitude>${centro[1].toFixed(7)}</latitude><altitude>0</altitude><heading>${rumboArriba.toFixed(1)}</heading><tilt>0</tilt><range>${Math.round(tam * 1.8 + 40)}</range></LookAt>`;

  const p = escena.proyecto || {};
  const titulo = nombre || p.evento || escena.nombre || 'House Mates';
  const carpetasCat = CATEGORIAS.map(([c, n]) => carpeta(c === 'zonas' ? 'Carteles y textos' : n, porCat.get(c)));
  const cuerpo = [
    carpeta('Ambientes', enAmbientes),
    carpeta('Zonas', zonas),
    carpeta('Estacionamientos', estacionamientos),
    carpeta('Caminos', caminos),
    carpeta('Vallados', vallados),
    ...carpetasCat,
    carpeta('Árboles', arboles, { visible: false }),
  ].filter(Boolean);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '<Document>',
    `<name>${esc(titulo)}</name>`,
    '<open>1</open>',
    descripcion([
      ['Lugar', p.lugar || (escena.nombre !== titulo ? escena.nombre : '')],
      ['Fecha', p.fecha],
      ['Responsable', p.responsable],
      ['', 'Exportado desde House Mates Plano. Las ubicaciones salen del plano: confirmalas en el lugar.'],
    ]),
    camara,
    ...estilos.values(),
    ...cuerpo,
    '</Document>',
    '</kml>',
    '',
  ].join('\n');
}
