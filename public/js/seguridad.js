// Seguridad del evento: cuánta gente entra contra el ancho de las salidas, cuánto hay que caminar hasta la
// salida más cercana, los servicios mínimos (baños, barra, agua, matafuegos, primeros auxilios, punto de
// encuentro) y la hoja del plano de emergencia.
//
// Todo es una guía para planificar con lo que está dibujado: no reemplaza la habilitación del municipio ni
// el plan de evacuación firmado por un profesional. No usa el motor 3D, así que se puede probar con Node.
//
// Qué cuenta como salida:
// - Una abertura de un ambiente con "salida: true" (puerta, portón o hueco a nivel del piso; ancho = "ancho").
// - Un objeto "acceso" sin "salida: false" (ancho de paso = dims[0]).
// - Un lado sin pared de un ambiente cerrado que no da a otro ambiente cerrado (un galpón abierto de un lado).

import { defDatos, troncoDe } from './tipos-datos.js';
import { esquinas, cajaDe, areaFirmada, puntoEnPoligono, distanciaASegmento, superficieLibre, puntosMundo, esPoligono, dentroDe, superficieDe } from './geometria.js';
import { lineaLocal } from './predio.js';
import { fm, esc } from './formato.js';
import { hojaPlanta, opcionesHoja, geometriaArea, texto, linea, n2, iconoEnPapel, recortar, envolver, TINTA, GRIS } from './plano2d.js';
import { computar } from './computo.js';

/* ------------------------------------------------------------------ opciones */

export const AVISO_LEGAL =
  'Guía para planificar, calculada con lo que está dibujado. No reemplaza la habilitación del municipio ni el plan de evacuación aprobado por un profesional.';

export const COLORES_SEGURIDAD = { ok: '#2FBF71', okOscuro: '#1D8A55', aviso: '#E8AA4C', error: '#FF3B30' };
const VERDE = COLORES_SEGURIDAD.ok;
const VERDE_OSCURO = COLORES_SEGURIDAD.okOscuro;
const CALIDO = COLORES_SEGURIDAD.aviso;
const ROJO = COLORES_SEGURIDAD.error;
const ROJO_SANITARIO = '#c62828';

// Valores típicos de la normativa argentina (se cambian en escena.seguridad y escena.servicios).
// salidasMinimas, primerosAuxiliosDesde y banosFijos son extras de este módulo.
const DEF_SEGURIDAD = { personasPorUnidad: 100, anchoUnidad: 0.55, distanciaMax: 40, radioMatafuego: 20, salidasMinimas: 2 };
const DEF_SERVICIOS = { personasPorBano: 100, personasPorMetroBarra: 100, personasPorAgua: 500, m2PorMatafuego: 200, primerosAuxiliosDesde: 1000, banosFijos: 0 };
const METROS_FOODTRUCK = 3;
// Un "acceso" cuenta como salida de un ambiente cerrado si su centro está a menos de esto del contorno.
const RADIO_ACCESO = 1.5;
// Bolsones sin camino a una salida más chicos que esto (m²) se toman como detalles del dibujo.
const BOLSON_MINIMO = 2;

function leer(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim()) return parseFloat(v.replace(',', '.'));
  return NaN;
}
const positivo = (v, def) => {
  const n = leer(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};
const noNegativo = (v, def) => {
  const n = leer(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

export function opcionesSeguridad(escena) {
  const s = escena?.seguridad && typeof escena.seguridad === 'object' ? escena.seguridad : {};
  const op = {};
  for (const [k, def] of Object.entries(DEF_SEGURIDAD)) op[k] = positivo(s[k], def);
  op.salidasMinimas = Math.max(1, Math.round(op.salidasMinimas));
  return op;
}

export function opcionesServicios(escena) {
  const s = escena?.servicios && typeof escena.servicios === 'object' ? escena.servicios : {};
  const op = {};
  for (const [k, def] of Object.entries(DEF_SERVICIOS)) op[k] = k === 'banosFijos' ? Math.round(noNegativo(s[k], def)) : positivo(s[k], def);
  return op;
}

// Personas por m² libre: [cómodo, lleno].
export function densidadDe(escena) {
  const d = escena?.densidad;
  return [positivo(d?.[0], 2), positivo(d?.[1], 3)];
}

// Gente esperada (escena.proyecto.aforo) o null si no está cargada.
export function aforoDe(escena) {
  const n = leer(escena?.proyecto?.aforo);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
}

/* ------------------------------------------------------------------ texto */

const ent = (v) => fm(Math.round(Number(v) || 0), 0);
// Metros con un decimal, o con dos si hace falta (2,75 m).
function metros(v) {
  v = Number(v) || 0;
  return fm(v, Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 ? 1 : 2);
}
const pl = (n, uno, varios) => (Math.round(Number(n) || 0) === 1 ? uno : varios);
const gente = (n) => `${ent(n)} ${pl(n, 'persona', 'personas')}`;

/* ------------------------------------------------------------------ geometría del lugar */

const finito = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

function areasDe(escena) {
  return (Array.isArray(escena?.areas) ? escena.areas : []).filter(
    (a) => a && Array.isArray(a.contorno) && a.contorno.length >= 3 && a.contorno.every(finito) && Math.abs(areaFirmada(a.contorno)) > 1e-6
  );
}

function objetosDe(escena) {
  return (Array.isArray(escena?.objetos) ? escena.objetos : []).filter(
    (o) => o && finito(o.pos) && Array.isArray(o.dims) && Number.isFinite(o.dims[0]) && Number.isFinite(o.dims[1])
  );
}

const altoDe = (o) => (Number.isFinite(o.dims[2]) ? o.dims[2] : defDatos(o).dims?.[2] ?? 1);
const elevDe = (o) => Number(o.elev) || 0;
const rad = (g) => ((Number(g) || 0) * Math.PI) / 180;
const espesorDe = (area) => Number(area.paredes?.espesor ?? 0.2) || 0.2;

// Igual que en plano2d.js (geometriaArea), que no lo exporta.
function altoDePared(P, i) {
  if (!P || (Array.isArray(P.sin) && P.sin.includes(i))) return 0;
  if (Array.isArray(P.alto)) return Number(P.alto[i]) || 0;
  return Number(P.alto) || 0;
}

// Lados del contorno con su dirección (u) y la normal hacia afuera (n), por donde crece el espesor.
function ladosDe(area) {
  const c = area.contorno;
  const n = c.length;
  const espesor = espesorDe(area);
  const signo = Math.sign(areaFirmada(c)) || 1;
  return c.map((a, i) => {
    const b = c[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = L ? (b[0] - a[0]) / L : 0;
    const uy = L ? (b[1] - a[1]) / L : 0;
    return { i, a, b, L, ux, uy, nx: signo * uy, ny: -signo * ux, alto: altoDePared(area.paredes, i), espesor };
  });
}

const en = (l, s, t) => [l.a[0] + l.ux * s + l.nx * t, l.a[1] + l.uy * s + l.ny * t];
const esCerrada = (area) => ladosDe(area).some((l) => l.alto > 0 && l.L > 1e-6);

function distanciaAContorno(p, c) {
  let d = Infinity;
  for (let i = 0; i < c.length; i++) d = Math.min(d, distanciaASegmento(p, c[i], c[(i + 1) % c.length]));
  return d;
}

// Aberturas de un lado, recortadas al largo del lado como en geometriaArea. "pasa": se puede pasar a pie
// (puertas, portones y huecos a nivel del piso; las ventanas con antepecho no).
function aberturasDe(area, l) {
  return (Array.isArray(area.aberturas) ? area.aberturas : [])
    .filter((ab) => ab && Number(ab.pared) === l.i)
    .map((ab) => {
      const ventana = ab.tipo === 'ventana';
      const ini = Math.min(l.L, Math.max(0, Number(ab.desde) || 0));
      const fin = Math.min(l.L, ini + (Number(ab.ancho) || 0.9));
      const base = Number(ab.antepecho ?? (ventana ? 1 : 0)) || 0;
      return { ab, ventana, ini, fin, pasa: base <= 0 };
    });
}

function nombreAbertura(ab, area) {
  if (ab.nombre) return String(ab.nombre);
  const tipo = ab.tipo === 'porton' ? 'Portón' : ab.tipo === 'hueco' ? 'Abertura' : ab.tipo === 'ventana' ? 'Ventana' : 'Puerta';
  return `${tipo} de ${area.nombre || area.id}`;
}

// El lugar entero: los ambientes; si no hay, las zonas; si tampoco, el rectángulo de lo dibujado.
function sitioDe(escena) {
  const areas = areasDe(escena);
  if (areas.length) {
    return { poligonos: areas.map((a) => a.contorno), superficie: areas.reduce((s, a) => s + Math.abs(areaFirmada(a.contorno)), 0), base: 'areas' };
  }
  const objetos = objetosDe(escena);
  const zonas = objetos.filter((o) => o.tipo === 'zona');
  if (zonas.length) {
    return { poligonos: zonas.map((z) => (esPoligono(z) ? puntosMundo(z) : esquinas(z))), superficie: zonas.reduce((s, z) => s + superficieDe(z), 0), base: 'zonas' };
  }
  const resto = objetos.filter((o) => o.tipo !== 'persona');
  if (!resto.length) return { poligonos: [], superficie: 0, base: 'vacio' };
  const c = cajaDe(resto.flatMap(esquinas));
  const rect = [[c.minX, c.minY], [c.maxX, c.minY], [c.maxX, c.maxY], [c.minX, c.maxY]];
  return { poligonos: [rect], superficie: (c.maxX - c.minX) * (c.maxY - c.minY), base: 'objetos' };
}

// Tramos [x0, x1] de una fila horizontal que caen dentro de alguno de los polígonos (misma regla que
// puntoEnPoligono), ya unidos y ordenados.
function tramosFila(poligonos, y) {
  const tramos = [];
  for (const p of poligonos) {
    const xs = [];
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i];
      const [xj, yj] = p[j];
      if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) tramos.push([xs[k], xs[k + 1]]);
  }
  tramos.sort((a, b) => a[0] - b[0]);
  const unidos = [];
  for (const t of tramos) {
    const u = unidos[unidos.length - 1];
    if (u && t[0] <= u[1]) u[1] = Math.max(u[1], t[1]);
    else unidos.push([...t]);
  }
  return unidos;
}

/* ------------------------------------------------------------------ sectores y salidas */

// Cada ambiente cerrado es un sector. Lo que está al aire libre (o todo, si no hay ambientes) es un sector más.
function sectoresDe(escena) {
  const areas = areasDe(escena);
  const cerradas = areas.filter(esCerrada);
  const abiertas = areas.filter((a) => !esCerrada(a));
  const sectores = cerradas.map((a) => ({ id: String(a.id), nombre: a.nombre || String(a.id), cerrado: true, areas: [a], poligonos: [a.contorno], excluir: [] }));
  if (abiertas.length || !areas.length) {
    const poligonos = abiertas.length ? abiertas.map((a) => a.contorno) : sitioDe(escena).poligonos;
    sectores.push({
      id: 'aire-libre',
      nombre: abiertas.length === 1 ? abiertas[0].nombre || 'Al aire libre' : abiertas.length ? 'Al aire libre' : 'Predio',
      cerrado: false,
      areas: abiertas,
      poligonos,
      // Un ambiente cerrado dentro del predio no se cuenta dos veces.
      excluir: cerradas.map((a) => a.contorno),
    });
  }
  return sectores;
}

// Todas las salidas con su geometría. Cada salida es una franja: arranca en "o", sigue "u" a lo largo
// ("largo" = ancho de paso) y "n" de costado entre t0 y t1 (n apunta hacia afuera en las paredes).
function relevarSalidas(escena) {
  const sectores = sectoresDe(escena);
  const porId = new Map(sectores.map((s) => [s.id, s]));
  const areas = areasDe(escena);
  const cerradas = areas.filter(esCerrada);
  const salidas = [];
  const avisos = [];

  for (const a of cerradas) {
    const nombreA = a.nombre || String(a.id);
    const otras = cerradas.filter((b) => b !== a);
    for (const l of ladosDe(a)) {
      if (l.L < 1e-6) continue;
      const medio = en(l, l.L / 2, 0);
      // Un lado pegado a otro ambiente cerrado es interior: lo que pasa por ahí no sale afuera.
      const interior = otras.some((b) => distanciaAContorno(medio, b.contorno) <= l.espesor + espesorDe(b) + 0.3);
      if (l.alto <= 0 && !interior) {
        if (l.L >= 0.3) {
          salidas.push({ id: `${a.id}:lado${l.i}`, nombre: `Lado abierto de ${nombreA}`, tipo: 'lado', ancho: l.L, o: l.a, u: [l.ux, l.uy], n: [l.nx, l.ny], largo: l.L, t0: 0, t1: 0, pos: medio, sectores: [String(a.id)] });
        }
        continue;
      }
      aberturasDe(a, l).forEach((x, k) => {
        const nombre = nombreAbertura(x.ab, a);
        if (!x.ab.salida) {
          if (x.pasa && !x.ventana && l.alto > 0 && !interior) avisos.push(`«${nombre}» da afuera y no está marcada como salida. Si sirve para evacuar, marcala como salida.`);
          return;
        }
        if (!x.pasa) {
          avisos.push(`«${nombre}» está marcada como salida pero tiene antepecho: no se cuenta.`);
          return;
        }
        const ancho = x.fin - x.ini;
        if (ancho < 0.05) return;
        const e = l.alto > 0 ? l.espesor : 0;
        salidas.push({
          id: `${a.id}:${l.i}:${k}`,
          nombre,
          tipo: x.ab.tipo || 'puerta',
          ancho,
          o: en(l, x.ini, 0),
          u: [l.ux, l.uy],
          n: [l.nx, l.ny],
          largo: ancho,
          t0: 0,
          t1: e,
          pos: en(l, (x.ini + x.fin) / 2, e / 2),
          sectores: [String(a.id)],
        });
      });
    }
  }

  for (const o of objetosDe(escena)) {
    if (o.tipo !== 'acceso' || o.salida === false) continue;
    const t = rad(o.rot);
    const u = [Math.cos(t), Math.sin(t)];
    const n = [-Math.sin(t), Math.cos(t)];
    const [w, p] = o.dims;
    const ids = [];
    for (const s of sectores) {
      if (s.cerrado) {
        if (distanciaAContorno(o.pos, s.areas[0].contorno) <= RADIO_ACCESO) ids.push(s.id);
      } else if (!areas.length || s.poligonos.some((q) => puntoEnPoligono(o.pos[0], o.pos[1], q) || distanciaAContorno(o.pos, q) <= RADIO_ACCESO)) {
        ids.push(s.id);
      }
    }
    const nombre = o.nombre || 'Acceso';
    if (!ids.length) avisos.push(`El acceso «${nombre}» no queda junto a ningún ambiente: no se cuenta como salida.`);
    salidas.push({ id: String(o.id), nombre, tipo: 'acceso', ancho: w, o: [o.pos[0] - (u[0] * w) / 2, o.pos[1] - (u[1] * w) / 2], u, n, largo: w, t0: -p / 2, t1: p / 2, pos: [...o.pos], sectores: ids });
  }

  for (const s of sectores) s.salidas = [];
  for (const x of salidas) for (const id of x.sectores) porId.get(id)?.salidas.push(x);
  return { sectores, salidas, avisos };
}

// Lo que ocupa lugar en el piso para la capacidad: el mismo criterio que la app (los árboles, solo el tronco),
// salvo los vallados, que son una línea finita y no el rectángulo que los contiene.
function obstaculosCapacidad(escena) {
  return objetosDe(escena)
    .filter((o) => !defDatos(o).piso && o.tipo !== 'persona' && o.tipo !== 'vallado' && elevDe(o) < 1 && altoDe(o) > 0.05)
    .map((o) => (o.tipo === 'arbol' ? { ...o, dims: [troncoDe(o), troncoDe(o), altoDe(o)] } : o));
}

// Reparte un total entero según pesos (resto mayor), para que la suma dé justo el total.
function repartir(total, pesos) {
  if (!pesos.length) return [];
  const suma = pesos.reduce((a, b) => a + b, 0);
  const base = suma > 0 ? pesos.map((p) => (total * p) / suma) : pesos.map((_, i) => (i === 0 ? total : 0));
  const enteros = base.map(Math.floor);
  const resto = total - enteros.reduce((a, b) => a + b, 0);
  const orden = base.map((v, i) => [v - enteros[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < resto; k++) enteros[orden[k % orden.length][1]]++;
  return enteros;
}

const salidaPublica = (x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, ancho: x.ancho, pos: x.pos });

// Capacidad de cada sector contra el ancho y la cantidad de salidas.
export function analizarSalidas(escena) {
  const sg = opcionesSeguridad(escena);
  const [comodo, lleno] = densidadDe(escena);
  const aforo = aforoDe(escena);
  const { sectores, salidas, avisos } = relevarSalidas(escena);
  const obs = obstaculosCapacidad(escena);

  for (const s of sectores) {
    if (!s.poligonos.length) {
      s.superficie = 0;
      s.libre = 0;
      continue;
    }
    const caja = cajaDe(s.poligonos.flat());
    const dentro = (x, y) => s.poligonos.some((p) => puntoEnPoligono(x, y, p)) && !s.excluir.some((p) => puntoEnPoligono(x, y, p));
    const r = superficieLibre(dentro, caja, obs);
    s.superficie = s.cerrado ? Math.abs(areaFirmada(s.poligonos[0])) : r.total;
    s.libre = r.libre;
  }
  const libre = sectores.reduce((a, s) => a + s.libre, 0);
  const superficie = sectores.reduce((a, s) => a + s.superficie, 0);
  const personas = aforo !== null ? repartir(aforo, sectores.map((s) => s.libre)) : sectores.map((s) => Math.floor(s.libre * lleno + 1e-9));

  const res = sectores.map((s, i) => {
    const p = personas[i] || 0;
    const unidades = Math.max(2, Math.ceil(p / sg.personasPorUnidad - 1e-9));
    const anchoNecesario = unidades * sg.anchoUnidad;
    const anchoDisponible = s.salidas.reduce((a, x) => a + x.ancho, 0);
    let separacion = 0;
    for (let a = 0; a < s.salidas.length; a++) {
      for (let b = a + 1; b < s.salidas.length; b++) separacion = Math.max(separacion, Math.hypot(s.salidas[a].pos[0] - s.salidas[b].pos[0], s.salidas[a].pos[1] - s.salidas[b].pos[1]));
    }
    const faltaAncho = Math.max(0, anchoNecesario - anchoDisponible);
    const faltanSalidas = Math.max(0, sg.salidasMinimas - s.salidas.length);
    return {
      id: s.id,
      nombre: s.nombre,
      cerrado: s.cerrado,
      superficie: s.superficie,
      libre: s.libre,
      personas: p,
      unidadesNecesarias: unidades,
      anchoNecesario,
      anchoDisponible,
      unidadesDisponibles: s.salidas.reduce((a, x) => a + Math.floor(x.ancho / sg.anchoUnidad + 1e-6), 0),
      salidas: s.salidas.map(salidaPublica),
      separacion,
      faltaAncho: faltaAncho > 1e-6 ? faltaAncho : 0,
      faltanSalidas,
      ok: faltaAncho <= 1e-6 && faltanSalidas === 0,
    };
  });

  // Avisos en palabras simples, de lo más grave a lo más leve.
  const lista = [];
  for (const s of res) {
    if (!s.salidas.length) {
      lista.push(
        s.cerrado
          ? `«${s.nombre}» no tiene salidas propias: la gente tendría que salir por otro ambiente. Marcá como salida una puerta que dé afuera o sumá un acceso.`
          : `«${s.nombre}» no tiene salidas: sumá al menos ${sg.salidasMinimas} accesos o portones en el borde del predio.`
      );
      continue;
    }
    if (s.faltaAncho) {
      lista.push(`«${s.nombre}»: para ${gente(s.personas)} hacen falta ${metros(s.anchoNecesario)} m de salida (${s.unidadesNecesarias} unidades de ${metros(sg.anchoUnidad)} m) y hay ${metros(s.anchoDisponible)} m.`);
    }
    if (s.faltanSalidas) {
      lista.push(`«${s.nombre}» tiene ${s.salidas.length} ${pl(s.salidas.length, 'salida', 'salidas')}: hacen falta al menos ${sg.salidasMinimas}, en lugares distintos.`);
    } else if (s.salidas.length >= 2) {
      const sector = sectores.find((x) => x.id === s.id);
      const c = cajaDe(sector.poligonos.flat());
      const diagonal = Number.isFinite(c.minX) ? Math.hypot(c.maxX - c.minX, c.maxY - c.minY) : 0;
      if (diagonal > 0 && s.separacion < Math.min(diagonal / 3, 20)) {
        lista.push(`Las salidas de «${s.nombre}» quedan muy juntas (a ${metros(s.separacion)} m): si se tapa una, se complica la otra. Conviene que estén en lados distintos.`);
      }
    }
  }
  const minimo = 2 * sg.anchoUnidad;
  for (const x of salidas) {
    if (x.sectores.length && x.ancho + 1e-6 < minimo) lista.push(`La salida «${x.nombre}» mide ${metros(x.ancho)} m: lo mínimo es ${metros(minimo)} m (dos unidades de paso).`);
  }
  lista.push(...avisos);
  // Sumados por sector, para que coincidan con la tabla de salidas.
  const llena = sectores.reduce((a, s) => a + Math.floor(s.libre * lleno + 1e-9), 0);
  const comoda = sectores.reduce((a, s) => a + Math.floor(s.libre * comodo + 1e-9), 0);
  if (aforo === null) {
    lista.push(`No hay aforo cargado: se calculó con el lugar lleno (${fm(lleno, lleno % 1 ? 1 : 0)} personas por m² libre). Cargá cuánta gente esperás para que los números sean reales.`);
  } else if (aforo > llena && libre > 0) {
    lista.push(`El aforo (${ent(aforo)}) pasa lo que entra con el lugar lleno (${ent(llena)} personas en ${ent(libre)} m² libres).`);
  }
  const sitio = sitioDe(escena);
  if (sitio.base === 'zonas') lista.push('La escena no tiene ambientes: la superficie se tomó de las zonas.');
  else if (sitio.base === 'objetos') lista.push('La escena no tiene ambientes ni zonas: la superficie se tomó del rectángulo de lo dibujado.');

  const contadas = salidas.filter((x) => x.sectores.length);
  return {
    sectores: res,
    total: {
      personas: aforo !== null ? aforo : res.reduce((a, s) => a + s.personas, 0),
      anchoNecesario: res.reduce((a, s) => a + s.anchoNecesario, 0),
      anchoDisponible: contadas.reduce((a, x) => a + x.ancho, 0),
      salidas: contadas.length,
      ok: res.length > 0 && res.every((s) => s.ok),
    },
    avisos: lista,
    capacidad: { superficie, libre, comoda, llena, aforo, personas: aforo !== null ? aforo : llena, densidad: [comodo, lleno] },
    // Todas las salidas con su geometría (para dibujarlas).
    todas: salidas,
    opciones: sg,
    nota: AVISO_LEGAL,
  };
}

/* ------------------------------------------------------------------ mapa de distancias */

// Recorre las celdas cuyo centro cae en la franja que arranca en o, va por u de s0 a s1 y por n de t0 a t1.
function recorrerFranja(g, o, u, n, s0, s1, t0, t1, fn) {
  const esq = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(([s, t]) => [o[0] + u[0] * s + n[0] * t, o[1] + u[1] * s + n[1] * t]);
  const c = cajaDe(esq);
  const c0 = Math.max(0, Math.ceil((c.minX - g.ox) / g.paso - 0.5 - 1e-9));
  const c1 = Math.min(g.columnas - 1, Math.floor((c.maxX - g.ox) / g.paso - 0.5 + 1e-9));
  const f0 = Math.max(0, Math.ceil((c.minY - g.oy) / g.paso - 0.5 - 1e-9));
  const f1 = Math.min(g.filas - 1, Math.floor((c.maxY - g.oy) / g.paso - 0.5 + 1e-9));
  const e = 1e-7;
  for (let f = f0; f <= f1; f++) {
    const dy = g.oy + (f + 0.5) * g.paso - o[1];
    for (let k = c0; k <= c1; k++) {
      const dx = g.ox + (k + 0.5) * g.paso - o[0];
      const s = dx * u[0] + dy * u[1];
      const t = dx * n[0] + dy * n[1];
      if (s >= s0 - e && s <= s1 + e && t >= t0 - e && t <= t1 + e) fn(f * g.columnas + k);
    }
  }
}

// Vecinos para el recorrido: los 8 de alrededor y los 8 "de caballo" (más precisión en diagonales raras).
// Para pasar en diagonal tienen que estar libres las celdas que se cruzan (así no se cuela entre dos
// obstáculos que se tocan en una esquina).
const VECINOS = [
  [1, 0, 1, null],
  [-1, 0, 1, null],
  [0, 1, 1, null],
  [0, -1, 1, null],
  [1, 1, Math.SQRT2, [[1, 0], [0, 1]]],
  [1, -1, Math.SQRT2, [[1, 0], [0, -1]]],
  [-1, 1, Math.SQRT2, [[-1, 0], [0, 1]]],
  [-1, -1, Math.SQRT2, [[-1, 0], [0, -1]]],
  [1, 2, Math.sqrt(5), [[0, 1], [1, 1]]],
  [-1, 2, Math.sqrt(5), [[0, 1], [-1, 1]]],
  [1, -2, Math.sqrt(5), [[0, -1], [1, -1]]],
  [-1, -2, Math.sqrt(5), [[0, -1], [-1, -1]]],
  [2, 1, Math.sqrt(5), [[1, 0], [1, 1]]],
  [2, -1, Math.sqrt(5), [[1, 0], [1, -1]]],
  [-2, 1, Math.sqrt(5), [[-1, 0], [-1, 1]]],
  [-2, -1, Math.sqrt(5), [[-1, 0], [-1, -1]]],
];

// Distancia caminando (m) desde cada celda de una grilla hasta la salida más cercana (Dijkstra).
// Celda (c, f): centro en origen + (c + 0,5; f + 0,5) × paso; índice f × columnas + c. La fila 0 es la de
// menor y (arriba en la planta). Infinity = obstáculo o sin camino hasta una salida.
// Además de lo pedido devuelve: dentro (1 = celda dentro del lugar), bloqueado (1 = obstáculo),
// salidas [{ id, nombre, ancho, pos, celdas, tapada }] y distanciaMax.
export function mapaDistancias(escena, { paso = 0.5, maxCeldas = 250000 } = {}) {
  const sg = opcionesSeguridad(escena);
  const areas = areasDe(escena);
  const objetos = objetosDe(escena);
  const sitio = sitioDe(escena);
  const { salidas } = relevarSalidas(escena);

  // Límites: lo dibujado y 5 m de margen.
  const puntos = [];
  for (const a of areas) puntos.push(...a.contorno);
  for (const p of sitio.poligonos) puntos.push(...p);
  for (const o of objetos) {
    if (o.tipo === 'persona') continue;
    puntos.push(...esquinas(o));
    if (o.tipo === 'vallado') puntos.push(...puntosMundo({ ...o, puntos: lineaLocal(o) }));
  }
  const caja = puntos.length ? cajaDe(puntos.filter(finito)) : { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  if (!Number.isFinite(caja.minX)) Object.assign(caja, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
  const ox = caja.minX - 5;
  const oy = caja.minY - 5;
  const W = caja.maxX - caja.minX + 10;
  const H = caja.maxY - caja.minY + 10;
  const tope = Math.max(100, Math.floor(positivo(maxCeldas, 250000)));
  paso = Math.max(positivo(paso, 0.5), Math.sqrt((W * H) / tope));
  let columnas = Math.max(1, Math.ceil(W / paso));
  let filas = Math.max(1, Math.ceil(H / paso));
  while (columnas * filas > tope) {
    paso *= 1.01;
    columnas = Math.max(1, Math.ceil(W / paso));
    filas = Math.max(1, Math.ceil(H / paso));
  }
  const N = columnas * filas;
  const g = { ox, oy, paso, columnas, filas };
  const bloqueado = new Uint8Array(N);
  const tapar = (i) => (bloqueado[i] = 1);
  const destapar = (i) => (bloqueado[i] = 0);
  const h = (paso / 2) * 1.02;

  // 1. Paredes: los muros de geometriaArea, engordados media celda para que no queden huecos entre celdas.
  for (const a of areas) {
    for (const q of geometriaArea(a).muros) {
      const L = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
      if (L < 1e-6) continue;
      const u = [(q[1][0] - q[0][0]) / L, (q[1][1] - q[0][1]) / L];
      const e = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
      const n = e > 1e-9 ? [(q[3][0] - q[0][0]) / e, (q[3][1] - q[0][1]) / e] : [-u[1], u[0]];
      recorrerFranja(g, q[0], u, n, -h, L + h, -h, e + h, tapar);
    }
  }
  // 2. Puertas, portones y huecos: se vuelven a abrir (al menos una celda, aunque la puerta sea angosta).
  for (const a of areas) {
    for (const l of ladosDe(a)) {
      if (l.alto <= 0 || l.L < 1e-6) continue;
      for (const x of aberturasDe(a, l)) {
        if (!x.pasa || x.fin - x.ini < 0.05) continue;
        const medio = (x.ini + x.fin) / 2;
        recorrerFranja(g, l.a, [l.ux, l.uy], [l.nx, l.ny], Math.min(x.ini, medio - h), Math.max(x.fin, medio + h), -h, l.espesor + h, destapar);
      }
    }
  }
  // 3. Vallados: la línea con 30 cm de grosor.
  for (const o of objetos) {
    if (o.tipo !== 'vallado' || elevDe(o) >= 1.2) continue;
    const linea = puntosMundo({ ...o, puntos: lineaLocal(o) });
    const r = Math.max(0.15, h);
    for (let i = 1; i < linea.length; i++) {
      const A = linea[i - 1];
      const B = linea[i];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const u = L > 1e-9 ? [(B[0] - A[0]) / L, (B[1] - A[1]) / L] : [1, 0];
      recorrerFranja(g, A, u, [-u[1], u[0]], -r, L + r, -r, r, tapar);
    }
  }
  // 4. Accesos que sirven de salida: cortan la pared o el vallado donde estén.
  for (const x of salidas) {
    if (x.tipo !== 'acceso') continue;
    const m = Math.max((x.t1 - x.t0) / 2, h) + 0.6;
    recorrerFranja(g, x.o, x.u, x.n, 0, x.largo, -m, m, destapar);
  }
  // 5. Objetos apoyados en el piso (de los árboles, solo el tronco). Lo muy finito ocupa al menos una celda.
  for (const o of objetos) {
    const def = defDatos(o);
    if (def.piso || ['persona', 'acceso', 'control_acceso', 'vallado'].includes(o.tipo)) continue;
    if (elevDe(o) >= 1.2 || altoDe(o) <= 0.3) continue;
    if (esPoligono(o)) {
      const c = cajaDe(puntosMundo(o));
      const cx = (c.minX + c.maxX) / 2;
      const cy = (c.minY + c.maxY) / 2;
      recorrerFranja(g, [cx, cy], [1, 0], [0, 1], c.minX - cx, c.maxX - cx, c.minY - cy, c.maxY - cy, (i) => {
        const k = i % columnas;
        const f = (i - k) / columnas;
        if (dentroDe(o, ox + (k + 0.5) * paso, oy + (f + 0.5) * paso)) bloqueado[i] = 1;
      });
      continue;
    }
    const t = rad(o.rot);
    const u = [Math.cos(t), Math.sin(t)];
    const n = [-Math.sin(t), Math.cos(t)];
    const w = o.tipo === 'arbol' ? troncoDe(o) : o.dims[0];
    const p = o.tipo === 'arbol' ? troncoDe(o) : o.dims[1];
    const hx = Math.max(w / 2, h);
    const hy = Math.max(p / 2, h);
    recorrerFranja(g, o.pos, u, n, -hx, hx, -hy, hy, tapar);
  }

  // 6. Semillas: las celdas de cada salida (si un objeto las tapa, no cuentan).
  const dist = new Float64Array(N).fill(Infinity);
  const heap = new Int32Array(N);
  const enHeap = new Int32Array(N).fill(-1);
  let tam = 0;
  const subir = (i) => {
    let k = enHeap[i];
    if (k < 0) {
      k = tam++;
      enHeap[i] = k;
    }
    const d = dist[i];
    while (k > 0) {
      const padre = (k - 1) >> 1;
      const pi = heap[padre];
      if (dist[pi] <= d) break;
      heap[k] = pi;
      enHeap[pi] = k;
      k = padre;
    }
    heap[k] = i;
    enHeap[i] = k;
  };
  const sacar = () => {
    const tope0 = heap[0];
    enHeap[tope0] = -2;
    tam--;
    if (tam > 0) {
      const ultimo = heap[tam];
      const d = dist[ultimo];
      let k = 0;
      for (;;) {
        let hijo = 2 * k + 1;
        if (hijo >= tam) break;
        if (hijo + 1 < tam && dist[heap[hijo + 1]] < dist[heap[hijo]]) hijo++;
        if (dist[heap[hijo]] >= d) break;
        heap[k] = heap[hijo];
        enHeap[heap[k]] = k;
        k = hijo;
      }
      heap[k] = ultimo;
      enHeap[ultimo] = k;
    }
    return tope0;
  };
  const infoSalidas = salidas.map((x) => {
    let celdas = 0;
    const sembrar = (i) => {
      if (bloqueado[i]) return;
      celdas++;
      if (dist[i] > 0) {
        dist[i] = 0;
        subir(i);
      }
    };
    if (x.tipo === 'acceso') {
      const m = Math.max((x.t1 - x.t0) / 2, h);
      recorrerFranja(g, x.o, x.u, x.n, 0, x.largo, -m, m, sembrar);
    } else if (x.tipo === 'lado') {
      recorrerFranja(g, x.o, x.u, x.n, 0, x.largo, -h, h, sembrar);
    } else {
      const medio = x.largo / 2;
      recorrerFranja(g, x.o, x.u, x.n, Math.min(0, medio - h), Math.max(x.largo, medio + h), x.t0 - h, x.t1 + h, sembrar);
    }
    return { id: x.id, nombre: x.nombre, ancho: x.ancho, pos: x.pos, celdas, tapada: celdas === 0, cuenta: x.sectores.length > 0 };
  });

  // 7. Dijkstra.
  const DX = VECINOS.map((v) => v[0]);
  const DY = VECINOS.map((v) => v[1]);
  const OFF = VECINOS.map((v) => v[1] * columnas + v[0]);
  const COSTO = VECINOS.map((v) => v[2] * paso);
  const CRUZA = VECINOS.map((v) => (v[3] ? 1 : 0));
  const C1 = VECINOS.map((v) => (v[3] ? v[3][0][1] * columnas + v[3][0][0] : 0));
  const C2 = VECINOS.map((v) => (v[3] ? v[3][1][1] * columnas + v[3][1][0] : 0));
  const NV = VECINOS.length;
  while (tam > 0) {
    const i = sacar();
    const di = dist[i];
    const x = i % columnas;
    const y = (i - x) / columnas;
    for (let k = 0; k < NV; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= columnas || ny >= filas) continue;
      const j = i + OFF[k];
      if (bloqueado[j]) continue;
      if (CRUZA[k] && (bloqueado[i + C1[k]] || bloqueado[i + C2[k]])) continue;
      const nd = di + COSTO[k];
      if (nd < dist[j]) {
        dist[j] = nd;
        subir(j);
      }
    }
  }

  // 8. Qué celdas están dentro del lugar (para pintar solo ahí).
  const dentro = new Uint8Array(N);
  if (sitio.poligonos.length) {
    for (let f = 0; f < filas; f++) {
      const y = oy + (f + 0.5) * paso;
      for (const [x0, x1] of tramosFila(sitio.poligonos, y)) {
        const c0 = Math.max(0, Math.ceil((x0 - ox) / paso - 0.5));
        const c1 = Math.min(columnas - 1, Math.floor((x1 - ox) / paso - 0.5));
        for (let c = c0; c <= c1; c++) dentro[f * columnas + c] = 1;
      }
    }
  }

  const valores = new Float32Array(N);
  let maximo = 0;
  let maximoTodo = 0;
  for (let i = 0; i < N; i++) {
    const v = dist[i];
    valores[i] = v;
    if (Number.isFinite(v)) {
      if (v > maximoTodo) maximoTodo = v;
      if (dentro[i] && v > maximo) maximo = v;
    }
  }
  if (!maximo) maximo = maximoTodo;

  return { origen: [ox, oy], paso, columnas, filas, valores, maximo, dentro, bloqueado, salidas: infoSalidas, distanciaMax: sg.distanciaMax };
}

// Distancia a la salida más cercana en un punto de la planta (Infinity si no hay camino o cae afuera de la grilla).
export function distanciaEn(mapa, [x, y]) {
  if (!mapa) return Infinity;
  const c = Math.floor((x - mapa.origen[0]) / mapa.paso);
  const f = Math.floor((y - mapa.origen[1]) / mapa.paso);
  if (c < 0 || f < 0 || c >= mapa.columnas || f >= mapa.filas) return Infinity;
  return mapa.valores[f * mapa.columnas + c];
}

// Celdas libres dentro del lugar que no tienen camino a ninguna salida, en bolsones de al menos minM2
// (los más chicos suelen ser huecos entre objetos pegados).
function sinSalidaGrandes(mapa, minM2 = BOLSON_MINIMO) {
  const { columnas: C, filas: F, valores, dentro, bloqueado, paso } = mapa;
  const N = C * F;
  const marca = new Uint8Array(N);
  const visto = new Uint8Array(N);
  const pila = new Int32Array(N);
  const minCeldas = Math.max(1, Math.ceil(minM2 / (paso * paso)));
  const sirve = (j) => !visto[j] && dentro[j] && !bloqueado[j] && !Number.isFinite(valores[j]);
  for (let i = 0; i < N; i++) {
    if (!sirve(i)) continue;
    const celdas = [];
    let top = 0;
    pila[top++] = i;
    visto[i] = 1;
    while (top) {
      const j = pila[--top];
      celdas.push(j);
      const x = j % C;
      if (x > 0 && sirve(j - 1)) (visto[j - 1] = 1), (pila[top++] = j - 1);
      if (x < C - 1 && sirve(j + 1)) (visto[j + 1] = 1), (pila[top++] = j + 1);
      if (j >= C && sirve(j - C)) (visto[j - C] = 1), (pila[top++] = j - C);
      if (j + C < N && sirve(j + C)) (visto[j + C] = 1), (pila[top++] = j + C);
    }
    if (celdas.length >= minCeldas) for (const j of celdas) marca[j] = 1;
  }
  return marca;
}

// Resumen del mapa para el panel: punto más lejos y m² que quedan lejos o sin camino a una salida.
export function resumenDistancias(mapa, distanciaMax = mapa?.distanciaMax ?? DEF_SEGURIDAD.distanciaMax) {
  const lim = positivo(distanciaMax, DEF_SEGURIDAD.distanciaMax);
  if (!mapa) return { maximo: 0, limite: lim, lejos: 0, sinSalida: 0, cerca: 0, haySalidas: false, ok: false };
  const { valores, dentro, bloqueado, paso } = mapa;
  const sinSalida = sinSalidaGrandes(mapa);
  let lejos = 0;
  let cerca = 0;
  let sin = 0;
  let maximo = 0;
  for (let i = 0; i < valores.length; i++) {
    if (!dentro[i] || bloqueado[i]) continue;
    const v = valores[i];
    if (!Number.isFinite(v)) {
      if (sinSalida[i]) sin++;
      continue;
    }
    if (v > maximo) maximo = v;
    if (v > lim) lejos++;
    else cerca++;
  }
  const a = paso * paso;
  const haySalidas = (mapa.salidas || []).some((s) => !s.tapada);
  return { maximo, limite: lim, lejos: lejos * a, sinSalida: sin * a, cerca: cerca * a, haySalidas, ok: haySalidas && lejos * a < 1 && sin * a < 1 };
}

const RGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Colores del mapa para una textura (canvas): verde lejos del límite, cálido arriba del 75 %, rojo pasado el
// límite. Transparente en obstáculos, celdas sin camino y fuera del lugar. Con { sinSalida: true } las celdas
// sin camino dentro del lugar se pintan en rojo a rayas. Para la textura: la fila 0 es la de menor y.
export function colorearDistancias(mapa, distanciaMax = mapa?.distanciaMax ?? DEF_SEGURIDAD.distanciaMax, { alfa = 0.45, sinSalida = false } = {}) {
  const { columnas, filas, valores, dentro, bloqueado } = mapa;
  const N = columnas * filas;
  const rgba = new Uint8ClampedArray(N * 4);
  const lim = positivo(distanciaMax, DEF_SEGURIDAD.distanciaMax);
  const A = Math.round(Math.max(0, Math.min(1, alfa)) * 255);
  const verde = RGB(VERDE);
  const calido = RGB(CALIDO);
  const rojo = RGB(ROJO);
  const bolsones = sinSalida ? sinSalidaGrandes(mapa) : null;
  for (let i = 0; i < N; i++) {
    if ((dentro && !dentro[i]) || (bloqueado && bloqueado[i])) continue;
    const v = valores[i];
    let c;
    if (!Number.isFinite(v)) {
      if (!bolsones || !bolsones[i]) continue;
      const x = i % columnas;
      const y = (i - x) / columnas;
      if ((x + y) % 4 > 1) continue;
      c = rojo;
    } else {
      const t = v / lim;
      c = t > 1 ? rojo : t > 0.75 ? calido : verde;
    }
    const k = i * 4;
    rgba[k] = c[0];
    rgba[k + 1] = c[1];
    rgba[k + 2] = c[2];
    rgba[k + 3] = A;
  }
  return { columnas, filas, rgba, origen: mapa.origen, paso: mapa.paso, ancho: columnas * mapa.paso, alto: filas * mapa.paso };
}

/* ------------------------------------------------------------------ servicios */

// Matafuegos: m² del lugar que quedan a más de "radio" (en línea recta) de todos.
function superficieSinMatafuego(sitio, matafuegos, radio) {
  if (!sitio.poligonos.length) return 0;
  const c = cajaDe(sitio.poligonos.flat());
  const sup = (c.maxX - c.minX) * (c.maxY - c.minY);
  if (!(sup > 0)) return 0;
  const paso = Math.max(0.25, Math.sqrt(sup / 120000));
  const R2 = radio * radio;
  let fuera = 0;
  for (let y = c.minY + paso / 2; y < c.maxY; y += paso) {
    const cerca = matafuegos.filter((m) => Math.abs(m[1] - y) <= radio).map((m) => [m[0], Math.sqrt(Math.max(0, R2 - (m[1] - y) ** 2))]);
    for (const [x0, x1] of tramosFila(sitio.poligonos, y)) {
      for (let x = c.minX + paso / 2 + Math.max(0, Math.ceil((x0 - c.minX - paso / 2) / paso)) * paso; x <= x1; x += paso) {
        if (x < x0) continue;
        if (!cerca.some(([mx, r]) => Math.abs(mx - x) <= r)) fuera++;
      }
    }
  }
  return fuera * paso * paso;
}

function nivelDe(tiene, necesita, critico) {
  if (tiene + 1e-9 >= necesita) return 'ok';
  if (critico) return 'error';
  return tiene >= necesita * 0.5 ? 'aviso' : 'error';
}

// Servicios mínimos según la gente (aforo o el lugar lleno). Cada ítem:
// { clave, nombre, tiene, necesita, unidad, ok, nivel ('ok' | 'aviso' | 'error'), dato, detalle }.
export function analizarServicios(escena, salidas) {
  salidas = salidas || analizarSalidas(escena);
  const sv = opcionesServicios(escena);
  const sg = salidas.opciones || opcionesSeguridad(escena);
  const objs = objetosDe(escena);
  const de = (tipo) => objs.filter((o) => o.tipo === tipo);
  const personas = Math.max(0, Math.round(Number(salidas.total?.personas) || 0));
  const res = [];
  const conteo = (tiene, necesita) => (necesita > 0 ? `${ent(tiene)} de ${ent(necesita)}` : ent(tiene));

  // Salidas
  {
    const t = salidas.total;
    const malos = salidas.sectores.filter((s) => !s.ok);
    let detalle = `Alcanzan para ${gente(personas)}.`;
    if (malos.length) {
      const s = malos[0];
      const donde = salidas.sectores.length > 1 ? ` en «${s.nombre}»` : '';
      if (!s.salidas.length) detalle = `«${s.nombre}» no tiene salidas marcadas.`;
      else if (s.faltaAncho) detalle = `Faltan ${metros(s.faltaAncho)} m de ancho de salida para ${gente(s.personas)}${donde}.`;
      else detalle = `${s.faltanSalidas === 1 ? 'Falta una salida más' : `Faltan ${s.faltanSalidas} salidas más`}${donde}: hacen falta al menos ${sg.salidasMinimas}.`;
      if (malos.length > 1) detalle += ` También hay que revisar ${malos.length - 1} ${pl(malos.length - 1, 'sector más', 'sectores más')}.`;
    }
    res.push({ clave: 'salidas', nombre: 'Salidas', tiene: t.anchoDisponible, necesita: t.anchoNecesario, unidad: 'm', ok: t.ok, nivel: t.ok ? 'ok' : 'error', dato: `${metros(t.anchoDisponible)} de ${metros(t.anchoNecesario)} m`, detalle });
  }

  // Matafuegos: uno cada m2PorMatafuego y todo el lugar a menos de radioMatafuego de alguno.
  {
    const sitio = sitioDe(escena);
    const lista = de('matafuego');
    const necesita = sitio.superficie > 0 ? Math.max(1, Math.ceil(sitio.superficie / sv.m2PorMatafuego - 1e-9)) : 0;
    const sinCubrir = superficieSinMatafuego(sitio, lista.map((o) => o.pos), sg.radioMatafuego);
    const tolerancia = Math.max(1, sitio.superficie * 0.005);
    const cubre = sinCubrir <= tolerancia;
    const alcanza = lista.length >= necesita;
    let detalle;
    if (!alcanza) detalle = `${necesita - lista.length === 1 ? 'Falta 1 matafuego' : `Faltan ${ent(necesita - lista.length)} matafuegos`}: va uno cada ${ent(sv.m2PorMatafuego)} m² (${ent(sitio.superficie)} m² en total).`;
    else if (!cubre) detalle = `Quedan ${ent(sinCubrir)} m² a más de ${ent(sg.radioMatafuego)} m de un matafuego: repartilos mejor.`;
    else detalle = necesita ? `Cubren todo el lugar a menos de ${ent(sg.radioMatafuego)} m.` : 'Todavía no hay superficie dibujada.';
    if (!alcanza && sinCubrir > tolerancia && lista.length) detalle += ` Además quedan ${ent(sinCubrir)} m² lejos de uno.`;
    res.push({ clave: 'matafuegos', nombre: 'Matafuegos', tiene: lista.length, necesita, unidad: 'u', ok: alcanza && cubre, nivel: !alcanza ? 'error' : cubre ? 'ok' : 'aviso', dato: conteo(lista.length, necesita), detalle, sinCubrir });
  }

  // Baños
  {
    const quimicos = de('bano_quimico').length;
    const tiene = quimicos + sv.banosFijos;
    const necesita = Math.ceil(personas / sv.personasPorBano - 1e-9);
    const falta = Math.max(0, necesita - tiene);
    const detalle = falta
      ? `${falta === 1 ? 'Falta 1 baño' : `Faltan ${ent(falta)} baños`} para ${gente(personas)} (uno cada ${ent(sv.personasPorBano)}).`
      : necesita
        ? `Alcanzan para ${gente(personas)}.`
        : 'Sin gente cargada todavía.';
    res.push({ clave: 'banos', nombre: 'Baños', tiene, necesita, unidad: 'u', ok: !falta, nivel: nivelDe(tiene, necesita, false), dato: conteo(tiene, necesita), detalle });
  }

  // Barra: metros de frente de barra (los food trucks cuentan 3 m cada uno).
  {
    const trucks = de('foodtruck').length;
    const tiene = de('barra').reduce((a, o) => a + o.dims[0], 0) + trucks * METROS_FOODTRUCK;
    const necesita = Math.ceil((personas / sv.personasPorMetroBarra) * 10 - 1e-9) / 10;
    const falta = Math.max(0, necesita - tiene);
    let detalle = falta > 1e-6 ? `Faltan ${metros(falta)} m de barra para ${gente(personas)} (1 m cada ${ent(sv.personasPorMetroBarra)}).` : `Alcanza para ${gente(personas)}.`;
    if (trucks) detalle += ` Los food trucks cuentan ${ent(METROS_FOODTRUCK)} m cada uno.`;
    res.push({ clave: 'barra', nombre: 'Barra', tiene, necesita, unidad: 'm', ok: falta <= 1e-6, nivel: nivelDe(tiene, necesita, false), dato: `${metros(tiene)} de ${metros(necesita)} m`, detalle });
  }

  // Agua
  {
    const tiene = de('agua').length;
    const necesita = Math.ceil(personas / sv.personasPorAgua - 1e-9);
    const falta = Math.max(0, necesita - tiene);
    const detalle = falta ? `${falta === 1 ? 'Falta 1 punto de agua' : `Faltan ${ent(falta)} puntos de agua`} para ${gente(personas)} (uno cada ${ent(sv.personasPorAgua)}).` : necesita ? `Alcanza para ${gente(personas)}.` : 'Sin gente cargada todavía.';
    res.push({ clave: 'agua', nombre: 'Agua', tiene, necesita, unidad: 'u', ok: !falta, nivel: nivelDe(tiene, necesita, false), dato: conteo(tiene, necesita), detalle });
  }

  // Primeros auxilios: obligatorio con más de primerosAuxiliosDesde personas.
  {
    const tiene = de('primeros_auxilios').length;
    const necesita = personas > sv.primerosAuxiliosDesde ? 1 : 0;
    const ok = tiene >= necesita;
    const detalle = !ok
      ? `Con más de ${ent(sv.primerosAuxiliosDesde)} personas hace falta un puesto de primeros auxilios.`
      : tiene
        ? `Hay ${tiene === 1 ? 'un puesto' : `${ent(tiene)} puestos`}.`
        : `No es obligatorio con ${gente(personas)}; igual conviene tener un botiquín a mano.`;
    res.push({ clave: 'primeros_auxilios', nombre: 'Primeros auxilios', tiene, necesita, unidad: 'u', ok, nivel: ok ? 'ok' : 'error', dato: conteo(tiene, necesita), detalle });
  }

  // Punto de encuentro
  {
    const tiene = de('punto_encuentro').length;
    const ok = tiene >= 1;
    res.push({ clave: 'punto_encuentro', nombre: 'Punto de encuentro', tiene, necesita: 1, unidad: 'u', ok, nivel: ok ? 'ok' : 'aviso', dato: conteo(tiene, 1), detalle: ok ? 'Marcado en el plano.' : 'Marcá un punto de encuentro afuera, lejos de las salidas.' });
  }

  return res;
}

// Ítem de distancia a la salida (con el mapa ya calculado), con la misma forma que los servicios.
function itemDistancia(resumen) {
  const r = resumen;
  let detalle;
  let nivel;
  if (!r.haySalidas) {
    detalle = 'No hay salidas libres desde donde medir.';
    nivel = 'error';
  } else if (r.ok) {
    detalle = `Desde cualquier punto se llega a una salida en menos de ${ent(r.limite)} m.`;
    nivel = 'ok';
  } else {
    const partes = [];
    if (r.lejos >= 1) partes.push(`${ent(r.lejos)} m² quedan a más de ${ent(r.limite)} m de una salida`);
    if (r.sinSalida >= 1) partes.push(`${ent(r.sinSalida)} m² no tienen camino hasta una salida`);
    detalle = `${partes.join(' y ')}.`;
    nivel = r.sinSalida >= 1 ? 'error' : 'aviso';
  }
  return { clave: 'distancia', nombre: 'Distancia a una salida', tiene: r.maximo, necesita: r.limite, unidad: 'm', ok: r.ok, nivel, dato: r.haySalidas ? `${ent(r.maximo)} m como máximo (límite ${ent(r.limite)} m)` : 'Sin salidas', detalle };
}

/* ------------------------------------------------------------------ panel (HTML) */

// HTML para el panel lateral: tarjetas compactas con un punto de estado, los números y una línea en palabras.
// Clases: seg-tarjeta, seg-ok / seg-aviso / seg-error, seg-titulo, seg-punto (el punto de estado), seg-dato,
// seg-detalle y seg-legal (la aclaración del final). Con { mapa } suma la tarjeta de distancia a la salida.
export function htmlSeguridad(escena, { salidas, servicios, mapa } = {}) {
  salidas = salidas || analizarSalidas(escena);
  servicios = servicios || analizarServicios(escena, salidas);
  const tarjeta = (nivel, titulo, dato, detalles = []) =>
    `<div class="seg-tarjeta seg-${nivel}">` +
    `<div class="seg-titulo"><span class="seg-punto" aria-hidden="true"></span>${esc(titulo)}</div>` +
    (dato ? `<div class="seg-dato">${esc(dato)}</div>` : '') +
    detalles.filter(Boolean).map((d) => `<div class="seg-detalle">${esc(d)}</div>`).join('') +
    `</div>`;
  const partes = [];
  const sitio = sitioDe(escena);
  if (sitio.base === 'vacio') {
    return `<div class="seg-tarjeta seg-aviso"><div class="seg-titulo"><span class="seg-punto" aria-hidden="true"></span>Seguridad</div><div class="seg-detalle">Dibujá el lugar para calcular salidas y servicios.</div></div>`;
  }

  // Capacidad
  const cap = salidas.capacidad;
  {
    let nivel = 'ok';
    let dato;
    let detalle;
    if (cap.aforo !== null) {
      dato = `${gente(cap.aforo)} (aforo)`;
      if (cap.libre > 0 && cap.aforo > cap.llena) {
        nivel = 'error';
        detalle = `Pasa lo que entra con el lugar lleno: ${gente(cap.llena)} en ${ent(cap.libre)} m² libres.`;
      } else if (cap.libre > 0 && cap.aforo > cap.comoda) {
        nivel = 'aviso';
        detalle = `Va a estar apretado: cómodas entran ${gente(cap.comoda)} en ${ent(cap.libre)} m² libres.`;
      } else detalle = `Entra cómodo: hay ${ent(cap.libre)} m² libres.`;
    } else {
      nivel = 'aviso';
      dato = `${ent(cap.comoda)} a ${gente(cap.llena)}`;
      detalle = `Sin aforo cargado: las cuentas usan el lugar lleno (${ent(cap.libre)} m² libres).`;
    }
    partes.push(tarjeta(nivel, 'Capacidad', dato, [detalle]));
  }

  // Salidas (con una línea por sector si hay varios)
  const itSal = servicios.find((s) => s.clave === 'salidas');
  if (itSal) {
    const lineas = [itSal.detalle];
    if (salidas.sectores.length > 1) {
      for (const s of salidas.sectores) {
        lineas.push(`${s.nombre}: ${gente(s.personas)}, ${metros(s.anchoDisponible)} de ${metros(s.anchoNecesario)} m en ${s.salidas.length} ${pl(s.salidas.length, 'salida', 'salidas')}${s.ok ? '' : ' (falta)'}.`);
      }
    } else if (salidas.sectores[0]) {
      const s = salidas.sectores[0];
      lineas.push(`${s.salidas.length} ${pl(s.salidas.length, 'salida', 'salidas')}; hacen falta ${s.unidadesNecesarias} unidades de ${metros(salidas.opciones.anchoUnidad)} m.`);
    }
    partes.push(tarjeta(itSal.nivel, itSal.nombre, itSal.dato, lineas));
  }

  if (mapa) {
    const it = itemDistancia(resumenDistancias(mapa, salidas.opciones.distanciaMax));
    partes.push(tarjeta(it.nivel, it.nombre, it.dato, [it.detalle]));
  }

  for (const it of servicios) {
    if (it.clave === 'salidas') continue;
    partes.push(tarjeta(it.nivel, it.nombre, it.dato, [it.detalle]));
  }

  // Avisos que no están en las tarjetas (puertas sin marcar, salidas angostas, aforo, etc.)
  const yaDichos = new Set(servicios.map((s) => s.detalle));
  const avisos = salidas.avisos.filter((a) => !yaDichos.has(a));
  if (avisos.length) partes.push(tarjeta('aviso', 'Para revisar', '', avisos.slice(0, 8)));

  partes.push(`<div class="seg-detalle seg-legal">${esc(AVISO_LEGAL)}</div>`);
  return partes.join('');
}

// Estilos sugeridos para el panel (con las variables de estilos.css). El integrador decide si los usa.
export const CSS_SEGURIDAD = `
.seg-tarjeta { background: var(--panel-2); border: 1px solid var(--linea); border-radius: var(--r); padding: 10px 12px; margin: 0 0 8px; }
.seg-titulo { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--tinta-2); }
.seg-punto { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--tinta-3); }
.seg-ok .seg-punto { background: var(--exito); }
.seg-aviso .seg-punto { background: var(--calido); }
.seg-error .seg-punto { background: var(--peligro); }
.seg-error { border-color: color-mix(in srgb, var(--peligro) 40%, var(--linea)); }
.seg-dato { margin: 4px 0 2px 16px; font-size: 15px; font-weight: 600; color: var(--tinta); font-variant-numeric: tabular-nums; }
.seg-detalle { margin: 2px 0 0 16px; font-size: 12px; line-height: 1.4; color: var(--tinta-2); }
.seg-legal { margin: 10px 0 0; font-size: 11px; color: var(--tinta-3); }
`;

/* ------------------------------------------------------------------ hoja del plano de emergencia */

// Qué se dibuja en el plano de emergencia: estructura, salidas y servicios de emergencia, y de referencia
// los baños, las barras y la cabina. Sin luces, decoración, muebles ni sonido.
const EN_EMERGENCIA = new Set([
  'columna', 'escalera', 'tarima', 'casita', 'carpa', 'cabina_dj', 'barra', 'foodtruck', 'bano_quimico', 'matafuego',
  'primeros_auxilios', 'punto_encuentro', 'ambulancia', 'acceso', 'control_acceso', 'vallado', 'generador', 'tablero',
  'zona', 'senal', 'hilera', 'texto',
]);
export function filtroEmergencia(o) {
  if (o.tipo === 'camino') return o.uso === 'emergencia';
  return EN_EMERGENCIA.has(o.tipo);
}

// Ancho de un texto en negrita (Helvetica Bold, en milésimas de la altura de letra). anchoTexto de plano2d.js
// es un promedio para minúsculas y se queda corto con los rótulos en mayúsculas.
const ANCHOS_NEGRITA = {
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, Ñ: 722,
  O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, Á: 722, É: 667, Í: 278, Ó: 778, Ú: 722,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611,
  q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500, ' ': 278, ',': 278, '.': 278, '(': 333, ')': 333, '-': 333,
};
const anchoNegrita = (s, t) => [...String(s)].reduce((a, ch) => a + (ANCHOS_NEGRITA[ch] ?? (/\d/.test(ch) ? 556 : 650)), 0) * (t / 1000);

function pastilla(cx, cy, s, { fondo = VERDE_OSCURO, color = '#fff', t = 1.9 } = {}) {
  const w = anchoNegrita(s, t) + 2.6;
  const h = t + 1.7;
  return (
    `<rect x="${n2(cx - w / 2)}" y="${n2(cy - h / 2)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(h / 2)}" fill="${fondo}"/>` +
    texto(cx, cy + 0.05, s, { t, peso: 700, color, ancla: 'middle', base: 'middle' })
  );
}

// Ubica rótulos sin que se pisen entre sí ni se salgan del dibujo: prueba cada lugar candidato y, si choca,
// lo corre hacia abajo o hacia arriba.
function rotulador(dib) {
  const ocupados = [];
  const cabe = (r) => r.x0 >= dib.x + 0.5 && r.x1 <= dib.x + dib.w - 0.5 && r.y0 >= dib.y + 0.5 && r.y1 <= dib.y + dib.h - 0.5;
  const choca = (r) => ocupados.some((o) => r.x0 < o.x1 + 0.4 && r.x1 > o.x0 - 0.4 && r.y0 < o.y1 + 0.4 && r.y1 > o.y0 - 0.4);
  const medida = (s, t = 1.9) => [anchoNegrita(s, t) + 2.6, t + 1.7];
  const poner = (candidatos, s, op = {}) => {
    const [w, h] = medida(s, op.t);
    const rect = ([cx, cy]) => ({ x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 });
    let elegido = null;
    for (const k of [0, 1, -1, 2, -2, 3, -3]) {
      for (const c of candidatos) {
        const p = [c[0], c[1] + k * (h + 0.6)];
        const r = rect(p);
        if (cabe(r) && !choca(r)) {
          elegido = p;
          break;
        }
      }
      if (elegido) break;
    }
    if (!elegido) {
      const [cx, cy] = candidatos[0];
      elegido = [Math.min(dib.x + dib.w - w / 2 - 0.5, Math.max(dib.x + w / 2 + 0.5, cx)), Math.min(dib.y + dib.h - h / 2 - 0.5, Math.max(dib.y + h / 2 + 0.5, cy))];
    }
    ocupados.push(rect(elegido));
    return pastilla(elegido[0], elegido[1], s, op);
  };
  // Lugar que ya ocupa otra cosa (por ejemplo, los rótulos de las puertas que dibuja la planta).
  const ocupar = ([cx, cy], w, h) => ocupados.push({ x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 });
  return { poner, medida, ocupar };
}

function flechaPapel(puntos, color = VERDE_OSCURO, grosor = 0.35) {
  if (puntos.length < 2) return '';
  const P = puntos[puntos.length - 1];
  let Q = puntos[puntos.length - 2];
  for (let i = puntos.length - 2; i >= 0; i--) {
    Q = puntos[i];
    if (Math.hypot(P[0] - Q[0], P[1] - Q[1]) >= 1.2) break;
  }
  const L = Math.hypot(P[0] - Q[0], P[1] - Q[1]) || 1;
  const d = [(P[0] - Q[0]) / L, (P[1] - Q[1]) / L];
  const q = [-d[1], d[0]];
  const punta = [P[0] + d[0] * 0.5, P[1] + d[1] * 0.5];
  const base = [P[0] - d[0] * 1.3, P[1] - d[1] * 1.3];
  const cuerpo = puntos.slice(0, -1).concat([base]);
  return (
    `<polyline points="${cuerpo.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polygon points="${[punta, [base[0] + q[0] * 0.9, base[1] + q[1] * 0.9], [base[0] - q[0] * 0.9, base[1] - q[1] * 0.9]].map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ')}" fill="${color}"/>`
  );
}

// Zonas a más de la distancia máxima (o sin camino) en rojo suave: rectángulos unidos por filas y columnas.
function sombraLejos(mapa, lim, M) {
  const { columnas: C, filas: F, valores, dentro, bloqueado, paso, origen } = mapa;
  const bolsones = sinSalidaGrandes(mapa);
  const marca = (i) => dentro[i] && !bloqueado[i] && (Number.isFinite(valores[i]) ? valores[i] > lim : bolsones[i]);
  const rects = [];
  let abiertos = new Map();
  for (let f = 0; f < F; f++) {
    const nuevos = new Map();
    let c = 0;
    while (c < C) {
      if (!marca(f * C + c)) {
        c++;
        continue;
      }
      let c1 = c;
      while (c1 + 1 < C && marca(f * C + c1 + 1)) c1++;
      const clave = c * (C + 1) + c1;
      nuevos.set(clave, abiertos.has(clave) ? abiertos.get(clave) : { c0: c, c1, f0: f });
      c = c1 + 1;
    }
    for (const [clave, r] of abiertos) if (!nuevos.has(clave)) rects.push({ ...r, f1: f - 1 });
    abiertos = nuevos;
  }
  for (const r of abiertos.values()) rects.push({ ...r, f1: F - 1 });
  if (!rects.length) return '';
  const d = rects
    .map((r) => {
      const A = M([origen[0] + r.c0 * paso, origen[1] + r.f0 * paso]);
      const B = M([origen[0] + (r.c1 + 1) * paso, origen[1] + (r.f1 + 1) * paso]);
      return `M${n2(A[0])} ${n2(A[1])}H${n2(B[0])}V${n2(B[1])}H${n2(A[0])}Z`;
    })
    .join('');
  return `<path d="${d}" fill="${ROJO}" fill-opacity="0.16" stroke="none"/>`;
}

// Flechas cortas que siguen la bajada del mapa de distancias: muestran hacia qué salida conviene ir.
function flechasEvacuacion(mapa, caja, M, k) {
  const { columnas: C, filas: F, paso, origen, valores, dentro, bloqueado } = mapa;
  const ancho = caja.maxX - caja.minX;
  const alto = caja.maxY - caja.minY;
  if (!(ancho > 0 && alto > 0)) return '';
  const sep = Math.min(25, Math.max(4, Math.max(ancho, alto) / 8));
  const largoMax = Math.min(sep * 0.7, 14 / k);
  const centro = (i) => {
    const c = i % C;
    const f = (i - c) / C;
    return [origen[0] + (c + 0.5) * paso, origen[1] + (f + 0.5) * paso];
  };
  const V8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let s = '';
  let cuantas = 0;
  for (let y = caja.minY + sep / 2; y < caja.maxY && cuantas < 80; y += sep) {
    for (let x = caja.minX + sep / 2; x < caja.maxX && cuantas < 80; x += sep) {
      const c0 = Math.floor((x - origen[0]) / paso);
      const f0 = Math.floor((y - origen[1]) / paso);
      if (c0 < 0 || f0 < 0 || c0 >= C || f0 >= F) continue;
      const i0 = f0 * C + c0;
      const v0 = valores[i0];
      if (!dentro[i0] || bloqueado[i0] || !Number.isFinite(v0) || v0 < Math.max(2.5, sep * 0.45)) continue;
      const largo = Math.min(largoMax, v0 - 1);
      const camino = [i0];
      let i = i0;
      let hecho = 0;
      while (hecho < largo) {
        const c = i % C;
        const f = (i - c) / C;
        let mejor = -1;
        let vm = valores[i];
        let paso1 = 0;
        for (const [dx, dy] of V8) {
          const nc = c + dx;
          const nf = f + dy;
          if (nc < 0 || nf < 0 || nc >= C || nf >= F) continue;
          const j = nf * C + nc;
          if (bloqueado[j]) continue;
          if (dx && dy && (bloqueado[f * C + nc] || bloqueado[nf * C + c])) continue;
          if (valores[j] < vm - 1e-6) {
            vm = valores[j];
            mejor = j;
            paso1 = dx && dy ? Math.SQRT2 * paso : paso;
          }
        }
        if (mejor < 0) break;
        hecho += paso1;
        i = mejor;
        camino.push(i);
      }
      if (camino.length < 3) continue;
      // Puntos cada ~1 mm de papel, suavizados.
      let papel = camino.map((j) => M(centro(j)));
      const filtrados = [papel[0]];
      for (const p of papel.slice(1, -1)) if (Math.hypot(p[0] - filtrados.at(-1)[0], p[1] - filtrados.at(-1)[1]) >= 1) filtrados.push(p);
      filtrados.push(papel.at(-1));
      papel = filtrados;
      for (let r = 0; r < 2; r++) papel = papel.map((p, j) => (j === 0 || j === papel.length - 1 ? p : [(papel[j - 1][0] + 2 * p[0] + papel[j + 1][0]) / 4, (papel[j - 1][1] + 2 * p[1] + papel[j + 1][1]) / 4]));
      const total = papel.reduce((a, p, j) => (j ? a + Math.hypot(p[0] - papel[j - 1][0], p[1] - papel[j - 1][1]) : 0), 0);
      if (total < 3) continue;
      s += flechaPapel(papel);
      cuantas++;
    }
  }
  return s;
}

function encimaEmergencia({ M, k, dib }, d) {
  const { escena, salidas, mapa, sg } = d;
  const partes = [];
  const sitio = sitioDe(escena);
  const caja = sitio.poligonos.length ? cajaDe(sitio.poligonos.flat()) : null;
  const centroSitio = caja ? [(caja.minX + caja.maxX) / 2, (caja.minY + caja.maxY) / 2] : [0, 0];
  const objs = objetosDe(escena);

  // Lejos de una salida (solo si hay alguna salida libre: si no, todo sería rojo y la columna ya lo dice).
  if (mapa.salidas.some((s) => !s.tapada)) partes.push(sombraLejos(mapa, sg.distanciaMax, M));

  // Alcance de cada matafuego (solo el borde: muchos círculos rellenos tiñen todo el plano).
  for (const o of objs.filter((x) => x.tipo === 'matafuego')) {
    const c = M(o.pos);
    partes.push(`<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${n2(sg.radioMatafuego * k)}" fill="none" stroke="${ROJO}" stroke-opacity="0.55" stroke-width="0.25" stroke-dasharray="1.6 1"/>`);
  }

  if (caja) partes.push(flechasEvacuacion(mapa, caja, M, k));

  // Salidas en verde con su ancho de paso (en rojo si un objeto las tapa).
  const tapadas = new Set(mapa.salidas.filter((s) => s.tapada).map((s) => s.id));
  const rotulos = [];
  const rot = rotulador(dib);
  // Los nombres de puertas y salidas que ya pone la planta (mismo lugar y tamaño que en hojaPlanta).
  for (const a of areasDe(escena)) {
    for (const r of geometriaArea(a).rotulos) rot.ocupar(M(r.pos), anchoNegrita(r.texto, 2), 2.8);
  }
  for (const x of salidas.todas) {
    const tapada = tapadas.has(x.id);
    const color = tapada ? ROJO : VERDE;
    const tm = (x.t0 + x.t1) / 2;
    const A = [x.o[0] + x.n[0] * tm, x.o[1] + x.n[1] * tm];
    const B = [A[0] + x.u[0] * x.largo, A[1] + x.u[1] * x.largo];
    if (x.tipo === 'acceso') {
      const esq = [[0, x.t0], [x.largo, x.t0], [x.largo, x.t1], [0, x.t1]].map(([s, t]) => M([x.o[0] + x.u[0] * s + x.n[0] * t, x.o[1] + x.u[1] * s + x.n[1] * t]));
      partes.push(`<polygon points="${esq.map(([a, b]) => `${n2(a)},${n2(b)}`).join(' ')}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="0.6"/>`);
    } else {
      const g = Math.max(1, (x.t1 - x.t0) * k + 0.6);
      partes.push(linea(M(A), M(B), { w: n2(g), color }));
    }
    // Rótulo del lado de afuera; si se sale del dibujo, del lado de adentro.
    let nn = x.n;
    if (x.tipo === 'acceso' && (x.pos[0] - centroSitio[0]) * nn[0] + (x.pos[1] - centroSitio[1]) * nn[1] < 0) nn = [-nn[0], -nn[1]];
    const s = tapada ? 'SALIDA TAPADA' : `SALIDA ${metros(x.ancho)} m`;
    const [w, h] = rot.medida(s);
    // Separación desde el eje de la salida: medio espesor, un respiro y lo que ocupa el rótulo en esa dirección.
    const off = ((x.t1 - x.t0) / 2) * k + 1.2 + Math.abs(nn[0]) * (w / 2) + Math.abs(nn[1]) * (h / 2);
    const P = M(x.pos);
    rotulos.push(rot.poner([[P[0] + nn[0] * off, P[1] + nn[1] * off], [P[0] - nn[0] * off, P[1] - nn[1] * off]], s, { fondo: tapada ? ROJO : VERDE_OSCURO }));
  }

  // Punto de encuentro, primeros auxilios, ambulancia y tableros.
  for (const o of objs) {
    const c = M(o.pos);
    const debajo = (t) => [c[0], c[1] + (Math.max(o.dims[0], o.dims[1]) * k) / 2 + t + 1.6];
    if (o.tipo === 'punto_encuentro') {
      partes.push(`<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="2.8" fill="${VERDE}" stroke="#fff" stroke-width="0.35"/>` + iconoEnPapel('punto_encuentro', c, 3.8, '#fff', 1.8));
      rotulos.push(rot.poner([[c[0], c[1] + 5], [c[0], c[1] - 5]], 'PUNTO DE ENCUENTRO', { t: 1.7 }));
    } else if (o.tipo === 'primeros_auxilios' || o.tipo === 'ambulancia') {
      rotulos.push(rot.poner([debajo(1.7)], o.tipo === 'ambulancia' ? 'AMBULANCIA' : 'PRIMEROS AUXILIOS', { fondo: ROJO_SANITARIO, t: 1.7 }));
    } else if (o.tipo === 'tablero' || o.tipo === 'generador') {
      rotulos.push(rot.poner([debajo(1.5)], o.tipo === 'tablero' ? 'TABLERO (CORTE DE LUZ)' : 'GENERADOR', { fondo: TINTA, t: 1.5 }));
    }
  }
  return partes.join('') + rotulos.join('');
}

// Bloques de la columna: cada uno con su alto (mm) y cómo se dibuja en (x, y) con ancho w.
const bloque = (alto, dibujar, conSiguiente = false) => ({ alto, dibujar, conSiguiente });

// Reparte los bloques en las ranuras, en orden. Si no entran todos, deja una nota al pie de la última.
function maquetar(bloques, ranurasOriginales) {
  if (!ranurasOriginales.length) return { s: '', cortado: bloques.length > 0 };
  const ranuras = ranurasOriginales.map((r) => ({ ...r }));
  const ultima = ranuras[ranuras.length - 1];
  ultima.h -= 4;
  let r = 0;
  let y = ranuras[0].y;
  let s = '';
  let cortado = false;
  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i];
    const necesita = b.alto + (b.conSiguiente && bloques[i + 1] ? bloques[i + 1].alto : 0);
    while (r < ranuras.length && y + necesita > ranuras[r].y + ranuras[r].h + 1e-6) {
      r++;
      if (r < ranuras.length) y = ranuras[r].y;
    }
    if (r >= ranuras.length) {
      cortado = true;
      break;
    }
    s += b.dibujar(ranuras[r].x, y, ranuras[r].w);
    y += b.alto;
  }
  if (cortado) s += texto(ultima.x + 4, ultima.y + ultima.h + 3, 'Sigue en el panel de seguridad de la app.', { t: 1.7, color: GRIS });
  return { s, cortado };
}

const colorNivel = (nivel) => (nivel === 'ok' ? VERDE : nivel === 'aviso' ? CALIDO : ROJO);

function columnaEmergencia({ col, banda, derX, derW, limite }, d) {
  const pad = 4;

  // Dónde va cada cosa: en la hoja horizontal, la columna; en la vertical, varias columnas en la franja de
  // abajo y lo que sobra arriba de la escala, a la derecha.
  const ranuras = [];
  let legal;
  if (!banda) {
    const lineas = envolver(AVISO_LEGAL, 1.7, col.w - 2 * pad, 5);
    const hLegal = lineas.length * 2.5 + 2;
    ranuras.push({ x: col.x, y: col.y + 3, w: col.w, h: limite - col.y - 3 - hLegal - 2 });
    legal = { x: col.x + pad, y: limite - hLegal + 2.5, lineas };
  } else {
    const izqW = derX - col.x;
    const n = Math.max(1, Math.floor(izqW / 50));
    const cw = izqW / n;
    for (let i = 0; i < n; i++) ranuras.push({ x: col.x + i * cw, y: col.y + 3, w: cw, h: col.h - 6 });
    const lineas = envolver(AVISO_LEGAL, 1.6, derW - 2 * pad, 5);
    const hLegal = lineas.length * 2.3 + 2;
    const hDer = limite - col.y - 3 - hLegal - 1;
    if (hDer > 9) ranuras.push({ x: derX, y: col.y + 3, w: derW, h: hDer });
    legal = { x: derX + pad, y: limite - hLegal + 2.3, lineas, t: 1.6 };
  }

  // Primero con todo el detalle; si no entra, una versión compacta (sin el detalle de lo que está bien).
  let res = maquetar(bloquesColumna(d, { banda, anchoRanura: banda ? ranuras[0].w : col.w, compacto: false }), ranuras);
  if (res.cortado) res = maquetar(bloquesColumna(d, { banda, anchoRanura: banda ? ranuras[0].w : col.w, compacto: true }), ranuras);
  let s = res.s;
  // Separadores entre las columnas de la franja.
  if (banda) for (let i = 1; i < ranuras.length - (ranuras.at(-1).x === derX ? 1 : 0); i++) s += linea([ranuras[i].x, col.y + 3], [ranuras[i].x, col.y + col.h - 3], { w: 0.12, color: '#d0d0d0' });
  legal.lineas.forEach((l, j) => (s += texto(legal.x, legal.y + j * (legal.t ? 2.3 : 2.5), l, { t: legal.t || 1.7, color: GRIS })));
  return s;
}

function bloquesColumna(d, { anchoRanura, compacto }) {
  const { escena, salidas, servicios, sg, resumen } = d;
  const pad = 4;
  const objs = objetosDe(escena);
  const hay = (tipo) => objs.some((o) => o.tipo === tipo);
  const bloques = [];
  const titulo = (s) => bloque(compacto ? 5.4 : 6.2, (x, y) => texto(x + pad, y + (compacto ? 4 : 4.6), s, { t: 2.6, peso: 700 }), true);

  // Encabezado
  const cap = salidas.capacidad;
  const resumenGente = cap.aforo !== null ? `Aforo: ${gente(cap.aforo)}` : `Lugar lleno: ${gente(cap.llena)} (sin aforo cargado)`;
  bloques.push(
    bloque(10.5, (x, y, w) => texto(x + pad, y + 5, 'Emergencia y evacuación', { t: 3, peso: 700 }) + texto(x + pad, y + 8.9, recortar(resumenGente, 1.9, w - 2 * pad), { t: 1.9, color: GRIS }))
  );

  // Referencias
  bloques.push(titulo('Referencias'));
  const item = (simbolo, s) =>
    bloque(compacto ? 3.8 : 4.4, (x, y, w) => {
      const sx = x + pad;
      const yc = y + 2.2;
      return simbolo(sx, yc) + texto(sx + 9, yc + 0.7, recortar(s, 1.9, w - 2 * pad - 9), { t: 1.9 });
    });
  bloques.push(item((sx, yc) => linea([sx, yc], [sx + 6.5, yc], { w: 1.3, color: VERDE }), 'Salida y su ancho de paso'));
  bloques.push(
    item(
      (sx, yc) => `<circle cx="${n2(sx + 3.2)}" cy="${n2(yc)}" r="2" fill="none" stroke="${ROJO}" stroke-opacity="0.7" stroke-width="0.25" stroke-dasharray="1 0.6"/><circle cx="${n2(sx + 3.2)}" cy="${n2(yc)}" r="0.7" fill="#d22" stroke="#900" stroke-width="0.15"/>`,
      `Matafuego y su alcance (${ent(sg.radioMatafuego)} m)`
    )
  );
  bloques.push(item((sx, yc) => `<rect x="${n2(sx)}" y="${n2(yc - 1.6)}" width="6.5" height="3.2" fill="${ROJO}" fill-opacity="0.18"/>`, `A más de ${ent(sg.distanciaMax)} m de una salida`));
  bloques.push(item((sx, yc) => flechaPapel([[sx, yc + 1], [sx + 3, yc], [sx + 6.5, yc]]), 'Hacia la salida más cercana'));
  bloques.push(item((sx, yc) => `<circle cx="${n2(sx + 3.2)}" cy="${n2(yc)}" r="1.7" fill="${VERDE}"/>`, 'Punto de encuentro'));
  if (hay('primeros_auxilios') || hay('ambulancia')) bloques.push(item((sx, yc) => iconoEnPapel('primeros_auxilios', [sx + 3.2, yc], 3.6, ROJO_SANITARIO, 1.7), 'Primeros auxilios y ambulancia'));
  if (objs.some((o) => o.tipo === 'camino' && o.uso === 'emergencia')) {
    bloques.push(item((sx, yc) => linea([sx, yc], [sx + 6.5, yc], { w: 0.35, color: VERDE, dash: '1.4 0.8' }), 'Camino de emergencia'));
  }

  // Salidas por sector
  const fr = [0.31, 0.17, 0.18, 0.16, 0.18];
  const colsX = (x, w) => {
    const util = w - 2 * pad;
    let acc = x + pad;
    return fr.map((f) => (acc += f * util));
  };
  bloques.push(
    bloque(
      10.4,
      (x, y, w) => {
        const fin = colsX(x, w);
        let s = texto(x + pad, y + 4.6, 'Salidas', { t: 2.6, peso: 700 });
        const enc = ['Sector', 'Personas', 'Necesita', 'Hay', 'Estado'];
        enc.forEach((e, i) => (s += texto(i === 0 ? x + pad : fin[i], y + 8.4, e, { t: 1.6, color: GRIS, ancla: i === 0 ? 'start' : 'end' })));
        return s + linea([x + pad, y + 9.4], [x + w - pad, y + 9.4], { w: 0.15, color: GRIS });
      },
      true
    )
  );
  for (const s of salidas.sectores) {
    bloques.push(
      bloque(compacto ? 4.4 : 6.6, (x, y, w) => {
        const fin = colsX(x, w);
        const util = w - 2 * pad;
        let out = texto(x + pad, y + 3, recortar(s.nombre, 1.9, fr[0] * util - 1), { t: 1.9, peso: 600 });
        out += texto(fin[1], y + 3, ent(s.personas), { t: 1.9, ancla: 'end' });
        out += texto(fin[2], y + 3, `${metros(s.anchoNecesario)} m`, { t: 1.9, ancla: 'end' });
        out += texto(fin[3], y + 3, `${metros(s.anchoDisponible)} m`, { t: 1.9, ancla: 'end' });
        out += texto(fin[4], y + 3, s.ok ? 'OK' : 'Falta', { t: 1.9, peso: 700, ancla: 'end', color: s.ok ? VERDE_OSCURO : ROJO });
        if (compacto) return out;
        const sub = `${s.salidas.length} ${pl(s.salidas.length, 'salida', 'salidas')}${s.faltanSalidas ? ` (faltan ${s.faltanSalidas})` : ''} · ${s.unidadesNecesarias} unidades de ${metros(sg.anchoUnidad)} m`;
        out += texto(x + pad, y + 5.6, recortar(sub, 1.5, util), { t: 1.5, color: GRIS });
        return out;
      })
    );
  }
  if (salidas.sectores.length > 1) {
    const t = salidas.total;
    bloques.push(
      bloque(5, (x, y, w) => {
        const fin = colsX(x, w);
        let out = linea([x + pad, y + 0.6], [x + w - pad, y + 0.6], { w: 0.15, color: GRIS });
        out += texto(x + pad, y + 3.6, 'Total', { t: 1.9, peso: 700 });
        out += texto(fin[1], y + 3.6, ent(t.personas), { t: 1.9, peso: 700, ancla: 'end' });
        out += texto(fin[2], y + 3.6, `${metros(t.anchoNecesario)} m`, { t: 1.9, peso: 700, ancla: 'end' });
        out += texto(fin[3], y + 3.6, `${metros(t.anchoDisponible)} m`, { t: 1.9, peso: 700, ancla: 'end' });
        out += texto(fin[4], y + 3.6, t.ok ? 'OK' : 'Falta', { t: 1.9, peso: 700, ancla: 'end', color: t.ok ? VERDE_OSCURO : ROJO });
        return out;
      })
    );
  }

  // Servicios (y la distancia a la salida)
  bloques.push(titulo('Control'));
  const items = [itemDistancia(resumen), ...servicios.filter((s) => s.clave !== 'salidas')];
  for (const it of items) {
    // En la versión compacta, lo que está bien va sin detalle y lo demás en una sola línea.
    const maxLineas = compacto ? (it.nivel === 'ok' ? 0 : 1) : 2;
    const lineas = maxLineas ? envolver(it.detalle, 1.6, anchoRanura - 2 * pad - 3, maxLineas) : [];
    bloques.push(
      bloque(4 + lineas.length * 2.3 + (compacto ? 0.3 : 0.8), (x, y, w) => {
        const util = w - 2 * pad;
        let out = `<circle cx="${n2(x + pad + 0.9)}" cy="${n2(y + 2.3)}" r="0.9" fill="${colorNivel(it.nivel)}"/>`;
        const dato = it.clave === 'distancia' ? (resumen.haySalidas ? `${ent(resumen.maximo)} de ${ent(resumen.limite)} m` : '—') : it.dato;
        out += texto(x + pad + 3, y + 3, recortar(it.nombre, 1.9, util * 0.58), { t: 1.9, peso: 600 });
        out += texto(x + w - pad, y + 3, recortar(dato, 1.9, util * 0.4), { t: 1.9, ancla: 'end' });
        if (maxLineas) envolver(it.detalle, 1.6, util - 3, maxLineas).forEach((l, j) => (out += texto(x + pad + 3, y + 5.5 + j * 2.3, l, { t: 1.6, color: GRIS })));
        return out;
      })
    );
  }

  // Lo más importante para revisar (sin repetir lo de la lista de control).
  const yaDichos = new Set(servicios.map((s) => s.detalle));
  const avisos = salidas.avisos.filter((a) => !yaDichos.has(a)).slice(0, compacto ? 2 : 4);
  if (avisos.length) {
    bloques.push(titulo('Para revisar'));
    const maxLineas = compacto ? 2 : 3;
    for (const a of avisos) {
      const lineas = envolver(a, 1.6, anchoRanura - 2 * pad - 3, maxLineas);
      bloques.push(
        bloque(lineas.length * 2.3 + 1.2, (x, y, w) => {
          let out = texto(x + pad, y + 2, '•', { t: 1.7, color: CALIDO, peso: 700 });
          envolver(a, 1.6, w - 2 * pad - 3, maxLineas).forEach((l, j) => (out += texto(x + pad + 3, y + 2 + j * 2.3, l, { t: 1.6 })));
          return out;
        })
      );
    }
  }
  return bloques;
}

// Hoja "Plano de emergencia" para generarHojas(escena, comp, op, [hojaEmergencia(escena, comp, op)]).
export function hojaEmergencia(escena, comp, op) {
  return {
    paginas: 1,
    crear(numeroHoja, totalHojas) {
      const c = comp || computar(escena);
      const o = op || opcionesHoja(escena);
      const salidas = analizarSalidas(escena);
      const servicios = analizarServicios(escena, salidas);
      const mapa = mapaDistancias(escena);
      const sg = salidas.opciones;
      const datos = { escena, salidas, servicios, mapa, sg, resumen: resumenDistancias(mapa, sg.distanciaMax) };
      return [
        hojaPlanta(escena, c, o, totalHojas, {
          titulo: 'Plano de emergencia',
          numeroHoja,
          numeros: false,
          filtro: filtroEmergencia,
          encima: (a) => encimaEmergencia(a, datos),
          columna: (a) => columnaEmergencia(a, datos),
        }),
      ];
    },
  };
}
