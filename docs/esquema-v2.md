# House Mates Plano: esquema de datos y reglas para los módulos nuevos (v2)

Este documento es el contrato común entre los módulos nuevos. Complementa `CLAUDE.md` (leerlo primero: formato de
escena base, unidades, convenciones de giro y frente).

## Reglas para quien escribe un módulo nuevo

- **Solo crear archivos nuevos.** No editar ningún archivo existente (`app.js`, `plano2d.js`, `tipos.js`,
  `tipos-datos.js`, `formato.js`, `computo.js`, `geometria.js`, `predio.js`, `geo.js`, `iconos.js`, `index.html`,
  `estilos.css`, `server.mjs`). La integración la hace otra persona. Si hace falta algo de esos archivos que no está
  exportado, escribirlo en el módulo propio y dejarlo anotado en el informe final.
- ES modules sin dependencias externas. Nada que se cargue de internet (la app funciona sin conexión).
- **No importar `three`** (salvo que el encargo lo diga): los módulos tienen que poder probarse con Node.
  Se puede importar: `tipos-datos.js`, `geometria.js`, `predio.js`, `geo.js`, `formato.js` (fm, esc, r3, leerNumero,
  nuevoId, numero), `computo.js`, `plano2d.js`, `iconos.js` (rutaIcono). Todos funcionan en Node.
- Probar con Node (`node --input-type=module -e "..."` o un script de prueba) usando la escena real
  `escenas/open-air-12-12-25.json` y escenas de prueba propias. Los scripts y archivos de prueba van en una carpeta
  temporal (no dentro del proyecto). No abrir el navegador ni levantar servidores en el puerto 5178.
- Nombres de funciones, variables y comentarios en español rioplatense, cortos y claros. Textos de interfaz en
  voseo ("Elegí", "Tocá"), sin jerga.
- Marca House Mates: fondo #0A0A0A / #FAFAFA, acento azul #2447F5, violeta #8A4FFF, cálido #E8AA4C (medidas y
  advertencias suaves), rojo #FF3B30 solo para errores, verde #2FBF71 / #1D8A55 para salidas y lo que está bien.
  Tipografía de texto: General Sans (en SVG usar `font-family="General Sans, Helvetica, Arial, sans-serif"`).
- HTML generado: siempre escapar texto con `esc()` de `formato.js`. SVG en milímetros de papel cuando es una hoja.
- Al terminar: informe corto con los archivos creados, qué exporta cada uno (firma y qué devuelve), cómo se probó
  y qué falta o qué haría falta integrar.

## Coordenadas

- Metros. Planta: `x` a la derecha, `y` hacia abajo. Altura aparte (`elev`, `dims[2]`).
- Objeto: `pos` = centro en planta, `rot` en grados horarios vistos en planta, frente hacia +y local con `rot: 0`.
- `puntos` (zonas libres, estacionamientos, caminos, vallados) está en coordenadas del objeto, relativo a `pos`
  y girado con `rot`. `puntosMundo(o)` de `geometria.js` los pasa a la planta. `dims[0..1]` es el rectángulo que
  los contiene.
- `geometria.js`: `esquinas(o)`, `enRect`, `dentroDe(o, x, y)`, `puntosMundo`, `aLocal`, `esPoligono`, `esLinea`,
  `longitud(pts, cerrada)`, `superficieDe(o)`, `cajaDe(puntos)`, `areaFirmada`, `puntoEnPoligono`,
  `distanciaASegmento`, `superficieLibre`.
- `geo.js`: `tieneGeo(escena)`, `escenaAGeo(escena, [x, y]) → [lat, lng]`, `geoAEscena(escena, [lat, lng])`,
  `distanciaReal`, `leerCoordenadas(texto)`, `rumbo`, `enlaceGoogleMaps`, `enlaceComoLlegar`.

## Tipos de objeto (ver `tipos-datos.js`)

Cada tipo tiene `nombre`, `cat`, `dims`, `color` y, según el caso, `potencia` (W), `peso` (kg), `spl`,
`dispersion`, `capacidad`, `publico` (aparece en el mapa para el público), `forma` ('poligono' | 'linea'),
`piso` (plano, no ocupa lugar). `defDatos(o)` devuelve los datos del tipo; `catDe(o)` la categoría.

Tipos nuevos: `carpa`, `generador`, `tablero`, `foodtruck`, `agua`, `guardarropa`, `primeros_auxilios`,
`punto_encuentro`, `carga_celulares`, `boleteria`, `info`, `tacho`, `ambulancia`, `estacionamiento`, `camino`,
`vallado`, `acceso`, `control_acceso`, `auto`, `camion`, `puesto` (staff), `senal`, `texto`, `flecha`, `marcador`,
`medicion` (punto de medición de ruido).

## Campos nuevos de los objetos (todos opcionales)

| Campo | En | Qué es |
| --- | --- | --- |
| `puntos` | zona, estacionamiento, camino, vallado | Forma libre (ver Coordenadas). |
| `ancho` | camino | Ancho en m (por defecto 3). |
| `uso` | camino | `publico`, `proveedores`, `emergencia`, `staff` (ver `USOS_CAMINO` en `predio.js`). |
| `uso` | zona | `general`, `pista`, `barra`, `fumadores`, `backstage`, `vip`, `descarga`, `estacionamiento`, `staff`. |
| `vehiculo`, `cochera`, `calle`, `angulo`, `accesibles` | estacionamiento | Ver `predio.js` (`plazasEstacionamiento`). |
| `modulo` | vallado | Largo de cada paño (por defecto 2,5 m). `modulosVallado(o)`. |
| `salida` | acceso | `false` si NO sirve como salida de emergencia (por defecto sí sirve). Ancho de paso = `dims[0]`. |
| `potencia` | equipos | W. Si falta, se usa el del tipo (`defDatos(o).potencia`) o 0. |
| `peso` | equipos | kg. Si falta, el del tipo o 0. |
| `costo` | todos | Precio por unidad. `costoTipo`: `alquiler` o `compra`. `propio: true` = no se paga. |
| `proveedor` | todos | Nombre del proveedor (coincide con `escena.proveedores[].nombre`). |
| `tablero` | equipos | id del tablero (o generador) al que se conecta. |
| `capacidad` | tablero, generador | W que aguanta. Generador: `fases` (1 o 3), `tension` (220 o 380). |
| `alimenta` | tablero | id del generador o tablero del que toma energía. |
| `capacidad` | truss | kg que aguanta (carga distribuida). |
| `colgadoDe` | luces, pantallas, parlantes | id del truss del que cuelga (si falta, se deduce por posición y altura). |
| `spl`, `dispersion` | parlante, sub | dB a 1 m y grados de apertura horizontal (sub: 360). |
| `limite` | medicion | dB máximos permitidos en ese punto. |
| `rol`, `personas`, `turno` | puesto | Rol (`ROLES_STAFF` en `tipos-datos.js`), cantidad de personas, horario ("22:00 a 06:00"). |
| `texto`, `formato`, `flecha` | senal | Texto del cartel, tamaño de impresión ("A3", "90 × 60 cm"), flecha (`izquierda`, `derecha`, `adelante`, `atras`, `ninguna`). |
| `texto`, `tamano` | texto | Texto libre y alto de letra en metros de la escena. |
| `capa` | todos | id de una capa propia (`escena.capas`). |
| `grupo` | todos | id de grupo: los objetos con el mismo grupo se eligen y mueven juntos. |
| `estimado` | todos (y áreas) | `true` si la medida es estimada y falta confirmarla en el lugar. |
| `mapa` | todos | `true` o `false` fuerza que aparezca o no en el mapa para el público. |

## Campos nuevos de la escena

```json
{
  "geo": { "lat": -34.6, "lng": -58.4, "x": 0, "y": 0, "norte": 0 },
  "fondo": { "archivo": "fondo-2026-12-01.png", "pos": [50, 40], "ancho": 300, "proporcion": 0.62, "rot": 0,
             "opacidad": 0.85, "opacidadPlano": 0.55, "oculto": false, "enPlano": true, "fuente": "Google Maps" },
  "proyecto": { "evento": "", "fecha": "2026-12-12", "lugar": "", "responsable": "", "aforo": 1500,
                "inicio": "2026-12-12T22:00", "fin": "2026-12-13T07:00" },
  "seguridad": { "personasPorUnidad": 100, "anchoUnidad": 0.55, "distanciaMax": 40, "radioMatafuego": 20 },
  "servicios": { "personasPorBano": 100, "personasPorMetroBarra": 100, "personasPorAgua": 500, "m2PorMatafuego": 200 },
  "proveedores": [{ "id": "p1", "nombre": "Sonido Sur", "rubro": "Sonido", "contacto": "Juan", "telefono": "",
                    "email": "", "llegada": "2026-12-12T12:00", "retiro": "2026-12-13T09:00", "acceso": "Portón 2", "notas": "" }],
  "cronograma": { "tareas": [{ "id": "t1", "nombre": "Armado de sonido", "etapa": "armado", "inicio": "2026-12-12T14:00",
                               "fin": "2026-12-12T18:00", "responsable": "", "proveedor": "Sonido Sur", "ids": ["sub-izq"], "hecha": false }] },
  "presupuesto": { "moneda": "ARS", "extras": [{ "id": "e1", "concepto": "Flete", "categoria": "Logística", "monto": 150000 }] },
  "capas": [{ "id": "c1", "nombre": "Emergencia", "color": "#2fbf71" }],
  "revisiones": [{ "rev": "A", "fecha": "2026-11-20", "nota": "Primera versión" }],
  "vistas": [{ "id": "v1", "nombre": "Frente de la cabina", "ids": ["casita-cabina", "tarima-cabina"], "lado": "frente" }],
  "terreno": { "puntos": [[0, 0, 0], [50, 0, 1.2], [0, 40, -0.4]] },
  "fotosMapa": [{ "archivo": "IMG_2031.jpg", "pos": [12, 30], "mira": 45 }],
  "mapaPublico": { "formato": "historia", "titulo": "", "subtitulo": "", "ocultar": ["camino:proveedores"] }
}
```

- Fechas y horas en formato `AAAA-MM-DDTHH:MM` (hora local, sin zona horaria).
- `aforo`: cantidad de gente esperada (entradas). Si falta, usar la capacidad estimada.
- `seguridad.personasPorUnidad` y `anchoUnidad`: cuántas personas por cada unidad de ancho de salida y cuánto mide
  esa unidad (valores típicos de la normativa argentina, se pueden cambiar; aclarar siempre que no reemplaza la
  habilitación del municipio). Se editan en la pestaña Seguridad del panel.
- `geo.zonaHoraria`: horas respecto de UTC (por defecto −3, Argentina). La usan el sol y las sombras.
- `plan`: `{ "ambulancia": true|false, "carpa": true|false }`, lo que se decidió que va o no va (sin el campo, todavía
  no se definió).
- En una `zona`, `gente`: cuántas personas se dibujan en la vista para ver la escala (como mucho 4 por m² y 5.000).
- `servicios.personasPorSeguridad` (100 por defecto) y `servicios.personasPorMinutoCarril` (8 por defecto: cuántas
  personas pasa cada carril de control de acceso por minuto, para el tiempo de ingreso).
- Tipos nuevos: `beam`, `estrobo`, `barra_led`, `gazebo`; `carpa` ahora es de 12 × 15 × 4 m por defecto.
- `sonido.ganancia`: dB que se suman o restan a todos los equipos (los dB del fabricante son el máximo).
- `vistas[]`: `lado` es `frente`, `costado`, `fondo` u `otro-costado`; `referencia` = id del objeto que da la
  dirección (si falta, el primero); `escala` (denominador, por ejemplo 50) y `persona: false` (sin silueta de escala)
  son opcionales. Cada vista sale como una hoja del PDF del plano.
- `fotosMapa[]`: `archivo` es el nombre de la foto en `fotos/<slug>/`, `pos` dónde se sacó y `mira` hacia dónde
  (grados, 0 = hacia +y, 90 = hacia +x).
- `presupuesto.extras[].monto` y `costo` de los objetos: números. Si vienen como texto, se entiende "80.000" como
  ochenta mil (separador de miles), además de "80 mil", "1,5 M" y "$ 80.000".
- `hoja`: además de las opciones del plano, cada hoja extra se prende con su clave: `hojaSonido`, `hojaEmergencia`,
  `hojasVistas` (prendida por defecto), `hojaLogistica`, `hojasProveedores`, `hojaElectrica`, `hojaSombras`, `hojaTerreno`.

## Checklist del armado (celular)

- Se guarda aparte de la escena, en `escenas/.checklist/<slug>.json` (no va a git): `{ version, actualizado, estados }`,
  con `estados[id] = { estado: "llego" | "armado" | "problema", hora, quien, nota, foto }`.
- `GET /api/checklist/:slug` lo lee y `PATCH /api/checklist/:slug` con `{ id, estado?, quien?, nota?, foto? }` cambia uno.
  Cada cambio avisa por SSE (`{ tipo: "checklist", slug }`).
- Para usarlo desde el celular el servidor tiene que estar abierto para la red (`abrir-red.bat` o `--red`).
  `GET /api/red` devuelve `{ red, direcciones }` y la app arma el QR con la primera dirección.

## Plano (`plano2d.js`)

- Hojas en milímetros. `opcionesHoja(escena)`, `tamanoPapel(op)`, `escalaAuto(escena, op)`.
- `hojaPlanta(escena, comp, op, totalHojas, extra)` arma una planta a escala con el cuadro de datos. `extra`:
  `titulo`, `numeroHoja`, `filtro(o)`, `numeros: false`, `encima({ M, k, dib, escena })` (SVG encima de la planta),
  `columna({ col, banda, derX, derW, limite, k, escena })` (SVG que reemplaza las referencias).
  `M([x, y])` pasa metros de la escena a milímetros de papel; `k` = milímetros por metro.
- `generarHojas(escena, comp, op, extras)`: `extras` = `[{ paginas, crear(primeraHoja, totalHojas) => [svg] }]`.
- Ayudas exportadas: `texto(x, y, s, { t, peso, color, ancla, rot, base })`, `linea(a, b, { w, color, dash })`,
  `cota`, `pts`, `n2`, `recortar`, `envolver`, `simbolo(o, M, k, op)`, `marco(W, H)`, `cuadroDatos`, `barraEscala`,
  `svgHoja(W, H, partes)`, `definiciones()`, `flechaNorte`, `iconoEnPapel(nombre, centro, tam, color)`,
  `rotuloSuperficie(o)`, `TINTA`, `GRIS`, `ACENTO`, `FUENTE`.
- `computar(escena)` (`computo.js`) devuelve `{ items, total, derivados, superficies, codigoDe }`.
