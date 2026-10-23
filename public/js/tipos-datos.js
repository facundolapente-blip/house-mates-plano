// Datos de cada tipo de objeto, sin el dibujo 3D (eso está en tipos.js). Lo usan el plano, el cómputo,
// los mapas y los análisis, que así funcionan sin el motor 3D (y se pueden probar con Node).
//
// dims = [ancho (x local), profundidad (frente hacia +y local), alto], en metros.
// elev: altura de la base al agregarlo. luz: color del haz o de la imagen. piso: objeto plano (no ocupa
// lugar). emite: true proyecta un haz en modo noche; 'punto' ilumina alrededor (alturaLuz: fracción del alto).
// forma: 'poligono' se dibuja punto por punto (zona libre, estacionamiento); 'linea', con una línea de puntos
// (camino, vallado). potencia (W) y peso (kg) son valores típicos para el eléctrico y las cargas.
// publico: aparece en el mapa para el público.

export const CATEGORIAS = [
  ['estructura', 'Estructura'],
  ['sonido', 'Sonido'],
  ['luces', 'Luces y pantallas'],
  ['energia', 'Energía'],
  ['barra', 'Barra y comida'],
  ['mobiliario', 'Mobiliario'],
  ['servicios', 'Servicios y seguridad'],
  ['predio', 'Predio y accesos'],
  ['staff', 'Staff'],
  ['deco', 'Decoración'],
  ['naturaleza', 'Naturaleza'],
  ['zonas', 'Zonas, carteles y textos'],
  ['otros', 'Otros'],
];
const CATS = new Set(CATEGORIAS.map(([c]) => c));

export const TIPOS_DATOS = {
  columna: { nombre: 'Columna', cat: 'estructura', dims: [0.4, 0.4, 3], color: '#e6e4df' },
  tarima: { nombre: 'Tarima', cat: 'estructura', dims: [4, 2.4, 0.6], color: '#3b3d43', peso: 0 },
  casita: { nombre: 'Estructura a dos aguas', cat: 'estructura', dims: [5, 4, 4.5], color: '#1d1e21', publico: true },
  carpa: { nombre: 'Carpa o gazebo', cat: 'estructura', dims: [3, 3, 2.6], color: '#ececec' },
  escalera: { nombre: 'Escalera', cat: 'estructura', dims: [1.2, 3, 1.5], color: '#d7d4cd' },
  cabina_dj: { nombre: 'Cabina DJ', cat: 'sonido', dims: [1.8, 0.8, 1.05], color: '#2a2c31', potencia: 800, publico: true },
  parlante: { nombre: 'Parlante', cat: 'sonido', dims: [0.55, 0.5, 1], color: '#1e1f22', potencia: 1000, peso: 30, spl: 132, dispersion: 90 },
  sub: { nombre: 'Subwoofer', cat: 'sonido', dims: [0.7, 0.8, 0.65], color: '#1e1f22', potencia: 1500, peso: 55, spl: 135, dispersion: 360 },
  luz: { nombre: 'Cabezal móvil', cat: 'luces', dims: [0.35, 0.35, 0.45], color: '#232529', elev: 3.5, luz: '#ff3ea5', emite: true, potencia: 300, peso: 18 },
  par: { nombre: 'Tacho PAR', cat: 'luces', dims: [0.25, 0.25, 0.3], color: '#232529', elev: 3, luz: '#36c6ff', emite: true, potencia: 120, peso: 3 },
  truss: { nombre: 'Truss', cat: 'luces', dims: [4, 0.3, 0.3], color: '#b9bec4', elev: 3.4, peso: 6 },
  pantalla: { nombre: 'Pantalla o neón', cat: 'luces', dims: [2, 0.08, 1.2], color: '#141518', elev: 1.2, luz: '#4a6cf7', potencia: 400, peso: 25 },
  poste_v: { nombre: 'Poste de luz en V', cat: 'luces', dims: [0.9, 0.12, 1.8], color: '#8a5a35', luz: '#ff4a1c', emite: 'punto', alturaLuz: 0.5, potencia: 40 },
  farol: { nombre: 'Farol', cat: 'luces', dims: [0.2, 0.2, 0.3], color: '#2a2a2a', elev: 2.5, luz: '#ff6a2a', emite: 'punto', alturaLuz: 0.5, potencia: 20 },
  generador: { nombre: 'Generador', cat: 'energia', dims: [2.4, 1.1, 1.7], color: '#2b5d3a', capacidad: 40000, publico: false },
  tablero: { nombre: 'Tablero eléctrico', cat: 'energia', dims: [0.6, 0.3, 1], color: '#a9adb3', capacidad: 10000 },
  barra: { nombre: 'Barra', cat: 'barra', dims: [3, 0.6, 1.1], color: '#7b5d46', potencia: 0, publico: true },
  heladera: { nombre: 'Heladera', cat: 'barra', dims: [0.7, 0.7, 1.85], color: '#e3e6e8', potencia: 400 },
  foodtruck: { nombre: 'Food truck', cat: 'barra', dims: [2.3, 6, 3], color: '#c94f3d', potencia: 3000, publico: true },
  mesa: { nombre: 'Mesa', cat: 'mobiliario', dims: [1.2, 0.8, 0.75], color: '#b5a184' },
  mesa_alta: { nombre: 'Mesa alta', cat: 'mobiliario', dims: [0.7, 0.7, 1.05], color: '#b5a184' },
  silla: { nombre: 'Silla', cat: 'mobiliario', dims: [0.45, 0.48, 0.85], color: '#8d8478' },
  banqueta: { nombre: 'Banqueta', cat: 'mobiliario', dims: [0.4, 0.4, 0.75], color: '#8d8478' },
  sillon: { nombre: 'Sillón', cat: 'mobiliario', dims: [2, 0.85, 0.8], color: '#6d7884' },
  bano_quimico: { nombre: 'Baño químico', cat: 'servicios', dims: [1.15, 1.15, 2.3], color: '#2f72bd', publico: true },
  matafuego: { nombre: 'Matafuego', cat: 'servicios', dims: [0.18, 0.18, 0.6], color: '#cf2e2e' },
  agua: { nombre: 'Punto de agua', cat: 'servicios', dims: [0.8, 0.5, 1.2], color: '#3d8fd6', publico: true },
  guardarropa: { nombre: 'Guardarropa', cat: 'servicios', dims: [4, 1.5, 2], color: '#5b5f66', potencia: 200, publico: true },
  primeros_auxilios: { nombre: 'Primeros auxilios', cat: 'servicios', dims: [3, 3, 2.6], color: '#f2f2f2', potencia: 300, publico: true },
  punto_encuentro: { nombre: 'Punto de encuentro', cat: 'servicios', dims: [0.8, 0.1, 2.4], color: '#2fbf71', publico: true },
  carga_celulares: { nombre: 'Carga de celulares', cat: 'servicios', dims: [1, 0.6, 1.5], color: '#2447f5', potencia: 500, publico: true },
  boleteria: { nombre: 'Boletería', cat: 'servicios', dims: [2, 1.5, 2.4], color: '#3a3d44', potencia: 300, publico: true },
  info: { nombre: 'Información', cat: 'servicios', dims: [1, 0.3, 2.2], color: '#2447f5', publico: true },
  tacho: { nombre: 'Tacho de basura', cat: 'servicios', dims: [0.6, 0.6, 1], color: '#2f6b3a' },
  ambulancia: { nombre: 'Ambulancia', cat: 'servicios', dims: [2.2, 5.6, 2.7], color: '#f4f4f4' },
  estacionamiento: { nombre: 'Estacionamiento', cat: 'predio', dims: [30, 20, 0], color: '#4b4f57', piso: true, sinBordes: true, sinSombra: true, forma: 'poligono', publico: true },
  camino: { nombre: 'Camino', cat: 'predio', dims: [20, 3, 0], color: '#2447f5', piso: true, sinBordes: true, sinSombra: true, forma: 'linea' },
  vallado: { nombre: 'Vallado', cat: 'predio', dims: [10, 0.6, 1.1], color: '#9aa1a8', sinBordes: true, forma: 'linea' },
  acceso: { nombre: 'Acceso o portón', cat: 'predio', dims: [4, 0.4, 3], color: '#3d3f45', publico: true },
  control_acceso: { nombre: 'Control de acceso', cat: 'predio', dims: [3, 0.8, 1.1], color: '#9aa1a8', publico: true },
  auto: { nombre: 'Auto', cat: 'predio', dims: [1.8, 4.5, 1.5], color: '#8c96a3' },
  camion: { nombre: 'Camión', cat: 'predio', dims: [2.5, 8, 3.6], color: '#d0d4d9' },
  puesto: { nombre: 'Puesto de staff', cat: 'staff', dims: [1, 1, 0], color: '#8a4fff', piso: true, sinSombra: true },
  planta: { nombre: 'Planta', cat: 'deco', dims: [0.6, 0.6, 1.4], color: '#5e7f4d' },
  tela: { nombre: 'Tela o telón', cat: 'deco', dims: [3, 0.03, 3], color: '#2c2b33' },
  arbol: { nombre: 'Árbol', cat: 'naturaleza', dims: [6, 6, 15], color: '#4b6a3b', sinBordes: true },
  hilera: { nombre: 'Hilera de plantas', cat: 'naturaleza', dims: [20, 0.8, 1.6], color: '#5a7442' },
  zona: { nombre: 'Zona', cat: 'zonas', dims: [4, 3, 0], color: '#6d5cff', piso: true, sinBordes: true, sinSombra: true, forma: 'poligono', publico: true },
  etiqueta: { nombre: 'Cartel en el piso', cat: 'zonas', dims: [0.3, 0.3, 0], color: '#1d2226', piso: true, sinBordes: true, sinSombra: true, publico: true },
  senal: { nombre: 'Señal o cartel', cat: 'zonas', dims: [0.6, 0.05, 2], color: '#111111' },
  texto: { nombre: 'Texto', cat: 'zonas', dims: [4, 0.8, 0], color: '#1a1a1a', piso: true, sinBordes: true, sinSombra: true },
  flecha: { nombre: 'Flecha', cat: 'zonas', dims: [0.8, 3, 0], color: '#2447f5', piso: true, sinBordes: true, sinSombra: true },
  marcador: { nombre: 'Marcador', cat: 'zonas', dims: [0.5, 0.5, 2], color: '#2447f5', sinBordes: true },
  medicion: { nombre: 'Punto de medición de ruido', cat: 'zonas', dims: [0.5, 0.5, 1.5], color: '#e8aa4c', sinBordes: true },
  persona: { nombre: 'Persona', cat: 'otros', dims: [0.5, 0.3, 1.75], color: '#8e98a2' },
  caja: { nombre: 'Caja', cat: 'otros', dims: [1, 1, 1], color: '#d6d2c9' },
  cilindro: { nombre: 'Cilindro', cat: 'otros', dims: [0.6, 0.6, 1], color: '#d6d2c9' },
};

export const defDatos = (o) => TIPOS_DATOS[o.tipo] || TIPOS_DATOS.caja;

export function catDe(o) {
  const c = o.cat || TIPOS_DATOS[o.tipo]?.cat;
  return CATS.has(c) ? c : 'otros';
}

export const troncoDe = (o) => Number(o.tronco) || Math.min(0.5, (o.dims?.[0] || 1) * 0.12);

// Roles del staff (tipo "puesto").
export const ROLES_STAFF = {
  seguridad: { nombre: 'Seguridad', color: '#1d2226' },
  puerta: { nombre: 'Puerta y control', color: '#2447f5' },
  barra: { nombre: 'Barra', color: '#7b5d46' },
  limpieza: { nombre: 'Limpieza', color: '#2f6b3a' },
  primeros_auxilios: { nombre: 'Primeros auxilios', color: '#d23a3a' },
  produccion: { nombre: 'Producción', color: '#8a4fff' },
  tecnica: { nombre: 'Técnica', color: '#e8aa4c' },
  otro: { nombre: 'Otro', color: '#6b6b6b' },
};
