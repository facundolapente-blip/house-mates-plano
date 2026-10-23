# House Mates Plano

Software de maquetación para el armado de los eventos House Mates: modelo 3D a escala del lugar,
planos imprimibles y cómputo de materiales. El flujo con Claude: el usuario manda fotos y medidas →
Claude escribe o edita `escenas/<slug>.json` → la app abierta en el navegador se actualiza sola.

## Correr

- `node server.mjs` (o `abrir.bat` en Windows, que además abre el navegador). Puerto 5178 (`--puerto=xxxx` o `PUERTO=xxxx`
  lo cambia). Escucha solo en esta computadora (127.0.0.1); con `--red` (o `RED=1`) se abre a la red local para verlo
  desde el celular, y muestra las direcciones. Rechaza pedidos con otro Host u Origin.
- Respaldos automáticos: antes de pisar una escena guarda la versión anterior en `escenas/.respaldos/<slug>/` con la
  hora local en el nombre (como mucho uno cada 5 minutos, quedan los últimos 40; si lo actual es igual al último, no
  duplica). En la app: menú ⋯ de la escena → "Versiones anteriores…" lista cada una con qué cambiaría y permite volver
  (antes guarda lo actual como versión; Ctrl+Z lo deshace) o "Guardar versión ahora". API: `GET /api/respaldos/:slug`
  (lista), `GET /api/respaldos/:slug/:archivo`, `POST /api/respaldos/:slug` (copia en el momento) y
  `PUT /api/escenas/:slug?respaldar` (guarda forzando la copia previa). Antes de una edición grande de Claude sobre una
  escena, conviene una copia a mano en esa carpeta o el POST.
- La app corrige al abrir lo que venga mal escrito en un archivo (números como texto, `"3,5"`, medidas negativas o en
  cero, colores inválidos, ids repetidos) para que nada termine en NaN. Igual conviene escribir números de verdad.
- Sin dependencias de npm y sin internet: las librerías están copiadas en `public/vendor/` (ver `vendor/LEEME.md`):
  Three.js 0.169.0 (importmap en `public/index.html`, solo el núcleo y los add-ons que se usan con sus dependencias),
  General Sans en woff2 y, solo al exportar PDF, jsPDF 2.5.1 + svg2pdf.js 2.2.3. Si se importa un add-on nuevo de
  `three/addons/`, hay que copiarlo a `public/vendor/three/examples/jsm/` junto con lo que importe; si no, la app no arranca.
  No agregar nada que se cargue de internet.
- Para verificar cambios: `.claude/launch.json` tiene la configuración `plano` para la vista previa.

## Interfaz

- Identidad de House Mates: base #0A0A0A / #FAFAFA, General Sans, acento azul #2447F5, violeta #8A4FFF,
  cálido #E8AA4C solo para medidas (cinta métrica). Rojo #FF3B30 solo para errores. Tema oscuro por defecto y claro opcional.
- Vistas: 3D (con "Caminar"), Planta, Plano (hojas para imprimir) y Materiales (listado). Atajos 1 a 4.
- Herramientas (barra flotante a la izquierda): seleccionar (V), mano (H o espacio), medir (M), cota fija (C), zona (Z).
- Selección múltiple: Shift+clic, recuadro en planta (en 3D con Shift), Ctrl+A. Con varios: alinear, distribuir,
  repetir en filas y columnas, copiar y pegar (también entre escenas), mover en grupo.
- Render 3D: EffectComposer con GTAOPass (sombras de contacto; lo transparente no participa), OutlinePass para la selección
  y RoomEnvironment como luz ambiente. En planta se dibuja sin postproceso.

## Archivos

- `server.mjs`: sirve `public/`, guarda escenas (`GET/PUT /api/escenas/:slug`), lista y recibe fotos (`/api/fotos/:slug`) y avisa por SSE (`/api/eventos`) cuando un `escenas/*.json` cambia en disco.
- `public/js/app.js`: estado, motor 3D, herramientas, selección, inspector, vistas, guardado e historial.
- `public/js/tipos.js`: biblioteca de objetos (`TIPOS`) y cómo se dibuja cada uno en 3D.
- `public/js/lugar.js`: pisos, paredes, aberturas y techo de cada área en 3D.
- `public/js/plano2d.js`: hojas SVG en milímetros (planta a escala con símbolos, numeración, cotas, leyenda y cuadro de datos; hojas de materiales).
- `public/js/computo.js`: cómputo de materiales (ítems por tipo y medida o por modelo, módulos de tarima, tramos de truss, superficies) y CSV.
- `public/js/exportar.js`: descargas y PDF (carga jsPDF y svg2pdf recién al exportar).
- `public/js/iconos.js`: íconos de línea de la interfaz y de cada tipo de objeto.
- `public/js/formato.js`: formateo del JSON (un objeto por renglón, hasta 170 caracteres) y normalización.
- `public/js/geometria.js`: geometría en planta (rectángulos girados, distancias, superficie libre).
- `escenas/*.json`: una escena por lugar o por variante de distribución.
- `fotos/<slug>/`: fotos de referencia de cada escena (las sube el usuario desde la app o las copia a mano).

## Formato de escena

Unidades: metros. Coordenadas en planta: `x` crece hacia la derecha, `y` crece hacia abajo en la planta
(hacia el frente/la entrada). La altura es aparte (`elev`, `alto`). Origen `0,0` = la esquina que se elija;
dejarlo escrito en `notas` (por ejemplo "esquina del fondo a la izquierda, mirando desde la entrada").

```json
{
  "nombre": "Galpón Villa Crespo",
  "notas": "Origen 0,0: ... Medido el 2026-10-20.",
  "densidad": [2, 3],
  "recorrido": { "desde": [8, 9.5], "mira": [8, 2] },
  "areas": [
    {
      "id": "salon",
      "nombre": "Salón",
      "contorno": [[0, 0], [12, 0], [12, 8], [0, 8]],
      "nivel": 0,
      "piso": "#cfd3d4",
      "techo": true,
      "paredes": { "alto": 3.2, "espesor": 0.2, "color": "#f1f0ec", "sin": [] },
      "aberturas": [
        { "pared": 2, "tipo": "porton", "desde": 4.5, "ancho": 3, "alto": 3, "nombre": "Entrada" },
        { "pared": 0, "tipo": "ventana", "desde": 1, "ancho": 2, "alto": 1.2, "antepecho": 1 },
        { "pared": 3, "tipo": "puerta", "desde": 1.5, "ancho": 1.2, "alto": 2.1, "salida": true, "nombre": "Salida de emergencia" }
      ]
    }
  ],
  "objetos": [
    { "id": "barra", "tipo": "barra", "nombre": "Barra", "pos": [1.95, 4], "rot": 270, "dims": [5, 0.7, 1.1] }
  ]
}
```

### Áreas

- `contorno`: polígono de la cara **interior** de las paredes, en orden (horario o antihorario, da igual).
  El espesor crece hacia afuera.
- La pared `i` va del punto `i` al punto `i+1` (la última cierra con el punto 0).
- `paredes.alto`: número, o lista con un alto por pared (0 = sin pared). `sin`: lista de paredes que no existen.
  `paredes: null` = área sin paredes (por ejemplo un patio abierto).
- `aberturas[].desde`: distancia en metros desde el punto `i` de esa pared hasta el borde de la abertura,
  medida a lo largo de la pared. `tipo`: `puerta`, `porton`, `ventana` o `hueco`. Ventanas: `antepecho` (altura
  desde el piso; por defecto 1). `salida: true` la marca en verde. Con `nombre` aparece un rótulo.
- `nivel`: altura del piso del área (para desniveles). `techo: false` para áreas al aire libre.
- Un patio pegado a otro ambiente: usar `sin` para no duplicar la pared compartida.

### Objetos

- `pos`: centro del objeto en planta `[x, y]`. `dims`: `[ancho, profundidad, alto]`.
- `elev`: altura de la base sobre el piso (sin `elev` = apoyado en 0). Es absoluta: un parlante sobre un sub
  de 0,65 m lleva `elev: 0.65`; la cabina sobre una tarima de 0,6 m lleva `elev: 0.6`.
- `rot`: grados, sentido horario visto en planta. Con `rot: 0` el **frente** mira hacia +y (hacia abajo en la
  planta, o sea hacia la entrada si el origen está en el fondo). `rot: 90` → frente hacia −x; `rot: 270` → frente hacia +x.
  Un objeto contra la pared del fondo mirando al público va con `rot: 0`.
- Opcionales: `color`, `luz` (color del haz o de la pantalla), `apunta: [x, y]` (adónde apunta una luz),
  `apertura` (grados del haz), `fijo: true` (no se puede mover ni borrar desde la app: usarlo para lo estructural
  del lugar), `nota`, `forma: "redonda"` (columnas), `cat` (para cambiar la categoría).
- `id`: siempre escribirlo, legible y estable (`"sub-izq"`, `"columna-2"`). La app conserva la selección por id
  cuando el archivo cambia.
- Tipos disponibles (ver `TIPOS` en `public/js/tipos.js` para medidas típicas): `columna`, `tarima`, `casita`
  (estructura a dos aguas; `alero` = fracción del alto donde terminan los postes verticales y arranca el techo,
  como una casa; sin `alero` es un triángulo hasta el piso y `tirante` ubica la viga horizontal; `techo: false` la
  deja abierta, `luz` le pone LED al frente), `escalera`,
  `cabina_dj`, `parlante`, `sub`, `luz` (cabezal móvil colgado), `par` (con `apunta: [x, y, altura]` ilumina un árbol
  desde abajo), `truss` (se orienta solo según el lado más largo; vertical si el alto es mayor), `pantalla` (también
  sirve para un neón), `poste_v` (poste de luz en V), `farol`, `barra`, `heladera`, `mesa`, `mesa_alta`, `silla`,
  `banqueta`, `sillon`, `bano_quimico`, `matafuego`, `planta`, `tela`, `arbol` (`dims` = copa y alto total;
  `tronco` = diámetro, que es lo único que cuenta como obstáculo; `forma: "redondo"` para copas bajas), `hilera`
  (viñedo, cerco vivo), `zona` (rectángulo en el piso con m² y capacidad, alto 0), `etiqueta` (cartel), `persona`
  (escala humana), `caja`, `cilindro` (genéricos para lo que no tenga tipo).
- En modo noche, los `luz` y `par` proyectan haces (hasta 12 con luz real) y los `poste_v` y `farol` iluminan
  alrededor (hasta 10; el resto solo brilla).

### Proyecto, cotas, plano y cómputo

- `proyecto`: `{ "evento", "fecha", "lugar", "responsable" }`. Salen en el cuadro de datos del plano.
- `cotas`: cotas fijas `{ "id", "a": [x, y], "b": [x, y], "desplazo": m }`. Se ven en el 3D y en el plano; `desplazo`
  corre la línea hacia un costado en el plano impreso.
- `hoja`: opciones del plano: `papel` (A4, A3, A2, A1), `orientacion` (horizontal o vertical), `escala` ("auto" o el
  denominador, por ejemplo 200), y `grilla`, `cotas`, `numeros`, `nombres`, `arboles`, `personas`, `materiales` (true/false).
- `computo`: `modTarima: [2, 1]` (módulo de tarima en m) y `tramosTruss: [3, 2, 1, 0.5]`.
- En los objetos: `ref` (modelo, por ejemplo "Pioneer CDJ-3000"), `proveedor`, y `computo: false/true` para sacar o
  forzar un objeto en el listado. Por defecto no computan árboles, hileras, columnas, escaleras, zonas, carteles ni personas.
  El listado agrupa por tipo y medida, o por tipo y `ref` si está cargado; el número de cada ítem es el que aparece en el plano.

## Cómo modelar desde fotos y medidas

1. Leer siempre el archivo antes de editarlo: el usuario mueve cosas en el navegador y la app guarda en el mismo archivo.
2. Usar las medidas que dio el usuario. Si falta una, preguntarla. Si hay que estimar (proporciones en la foto,
   referencias como puertas de ~2,05 m de alto, baldosas, ladrillos), hacerlo explícito en `nota` (`"estimado"`)
   y avisarlo en la respuesta.
3. Para ambientes que no son rectángulos, pedir las diagonales para cerrar bien el polígono.
4. Columnas, escaleras, desniveles y todo lo que es del lugar → `fijo: true`. Lo de la fiesta (sonido, barra, luces)
   sin `fijo`, para que se pueda acomodar desde la app.
5. Sumar al menos una `persona` para dar escala, y marcar salidas con `salida: true`.
6. Escenas nuevas: `escenas/<slug>.json` con slug en minúsculas y guiones. Variantes de distribución del mismo
   lugar: duplicar el archivo (o usar "Duplicar escena" en la app).
7. Verificar en la vista previa: planta (las cotas amarillas de cada pared tienen que coincidir con lo medido) y 3D.
   La app no tiene que mostrar avisos de error del archivo.
