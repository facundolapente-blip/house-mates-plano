# House Mates Plano

El lugar de cada fiesta en 3D y a escala real, con todo lo que va adentro (sonido, luces, barra, baños, zonas,
estacionamiento), para planificar el armado antes de llegar: planos para imprimir, listado de materiales, seguridad,
cronograma, proveedores, presupuesto y el mapa para el público.

## Abrirlo

1. Hace falta tener [Node.js](https://nodejs.org) instalado (una sola vez).
2. Doble clic en **Modelación House Mates** en el escritorio. Se abre en el navegador, sin ventana negra.
3. Para cerrarlo: botón **⋯** al lado del nombre de la escena → **Cerrar House Mates Plano**. Si cerrás todas las
   pestañas de la app, se cierra solo a los pocos minutos.

No necesita internet: todo lo que usa está dentro de la carpeta, así que funciona en un lugar sin señal.
Si algo no arranca, `abrir.bat` hace lo mismo pero con una ventana que muestra los mensajes.

**Con los celulares del equipo** (checklist del armado, misma red wifi): cerralo y abrilo con **abrir-red.bat**. En el
panel del proyecto aparece un QR para escanear. Sin esto, solo se puede abrir desde esta computadora.

**Versiones anteriores**: cada vez que una escena cambia, la versión anterior queda guardada sola (una cada 5 minutos
como mucho, las últimas 40). Para volver a una: **⋯** → **Versiones anteriores…**. Cada versión dice qué cambiaría
(por ejemplo, "vuelven 2 objetos, 3 cambian de lugar"). Al volver, lo que tenías también queda guardado y Ctrl+Z lo deshace.

**Historial y copia en la nube**: si la compu tiene git, cada cambio queda en un historial local; y si tiene OneDrive,
las escenas, los datos y las fotos se copian a `OneDrive\House Mates Plano`. Se ve en el panel del proyecto, en
"Historial y copia en la nube". Para cambiar la carpeta o apagarlo, un archivo `config.json` en esta carpeta:
`{ "nube": "D:\\Drive\\House Mates Plano", "historial": true }` (`"nube": false` la apaga).

## Qué mandarle a Claude para armar un lugar

**Un predio grande (con estacionamiento, accesos, caminos)**

- Una captura de **Google Maps** o **Google Earth** en vista satelital de todo el predio. En la app: **Fondo y escala**
  → pegar la imagen → marcar dos puntos lejanos y pegar sus coordenadas (clic derecho sobre el punto en Google Maps →
  tocar los números). Queda a escala real y con el norte. Así no hace falta medir distancias de 50 o 100 metros a mano.
- Fotos de cada sector: accesos, estacionamiento, dónde va la pista, el escenario, la barra, los baños.
- Qué entrada usa el público, cuál los proveedores y cuál es la de emergencia.

**Un lugar cerrado**

- Una foto desde cada esquina mirando hacia el centro y una de cada pared de frente, con puertas, ventanas y columnas.
- Detalles que importen: escaleras, desniveles, tablero eléctrico, enchufes, salidas.
- Si podés, que aparezca una cinta métrica abierta o algo de medida conocida.

**Medidas** (en metros o centímetros, como te quede cómodo)

- Largo y ancho de cada ambiente, de pared a pared por dentro, y la altura del techo.
- Si el ambiente no es rectangular: las diagonales también.
- Puertas, portones y ventanas: en qué pared, a cuánto de la esquina, ancho y alto.
- Columnas: tamaño y distancia a dos paredes.
- Qué esquina tomamos como punto de partida (por ejemplo: "la del fondo a la izquierda, mirando desde la entrada").

**Objetos**

- Qué es, sus medidas (ancho × profundidad × alto) y dónde va: distancia a dos paredes y para qué lado mira.
- Si algo va encima de otra cosa (parlante sobre sub, cabina sobre tarima), decilo.

Ejemplo: "Barra de 4 m de largo, 70 cm de profundidad y 1,10 de alto, contra la pared izquierda a 1 m del
fondo, mirando hacia el salón."

Claude crea la escena en `escenas/` y la ves aparecer en el navegador. Si después le pedís cambios, se actualiza sola.

## Usarlo

**Las cinco vistas** (arriba en el centro, teclas 1 a 5):

- **3D**: el modelo para recorrer y acomodar. El botón con la persona caminando te deja recorrerlo adentro (W A S D, Esc suelta el mouse).
- **Planta**: vista desde arriba. Es la más cómoda para ubicar cosas con precisión y para elegir varias con un recuadro.
- **Plano**: las hojas para imprimir o mandar, en PDF o SVG. A la derecha elegís el papel (A4 a A1), la escala, qué se ve
  y las **hojas extra**: emergencia (salidas y matafuegos), vistas de frente con alturas, carga y descarga, una hoja por
  proveedor, plano eléctrico, cobertura de sonido, sombras y curvas de nivel.
- **Materiales**: cuántas unidades de cada cosa hay que llevar, por categoría, más tarimas, truss, vallado, cables y cocheras.
  Se baja como planilla (CSV) para Excel o Sheets.
- **Producción**: el cronograma de armado y desarme (con "Armar borrador", que arma una primera versión sola), los
  proveedores con su horario, acceso y WhatsApp, el staff, el presupuesto y la comparación entre dos variantes.

**Herramientas** (barra flotante a la izquierda de la vista): seleccionar (V), mano (H o espacio), medir (M), cota fija
(C), zona (Z) y las de dibujo libre (zonas de cualquier forma, caminos, vallado).

**Biblioteca** (pestaña de la izquierda): arrastrá un objeto hasta la vista o hacé clic para ponerlo en el centro (si
ahí ya hay algo, se corre a un lugar libre al lado). Arriba están los **armados listos**: barra bajo 2 gazebos, fila de
6 baños químicos, entrada con seguridad, truss con 4 beams y 2 estrobos, y barras LED. También están tus equipos y tus
bloques (por ejemplo, la cabina House Mates entera). Luces: cabezal móvil, **beam**, **estrobo LED (tipo Stormy)**,
**barra LED**, tacho PAR; estructuras: **carpa** (12 × 15 m, 4 m de alto) y **gazebo** (3 × 3 m).

**Buscar y hacer (Ctrl+K o la lupa de arriba)**: escribí "baño", "pista", "beam", "pdf" o "noche" y Enter. Sirve para
agregar cualquier cosa, ir a un objeto de la escena, cambiar de vista, exportar o abrir otra escena.

**Bloquear**: el candado del panel (o la tecla B) deja algo fijo para que no se mueva ni se borre sin querer. Se ve un
candado en la lista. Con varios elegidos, el botón "Bloquear" los traba a todos.

**Gente en la pista**: elegí una zona (la pista, por ejemplo) y tocá "Cómoda" o "Llena": aparece esa cantidad de gente
en la vista para ver la escala real. También se puede escribir el número en "Gente en la vista".

**Panel de la derecha**

- Con un objeto elegido: posición y medidas exactas, modelo, proveedor, costo, consumo y notas. Con varios: alinear,
  distribuir, repetir en filas y columnas. El botón **Vista de frente** arma una hoja con todas las alturas. Con dos
  elegidos dice cuánto los separa y "Dejar la cota en el plano" la imprime.
- Sin nada elegido, tres pestañas:
  - **Proyecto**: datos del evento; **lo básico de la fiesta** (baños, luces, barra, carpa, ambulancia, generador,
    límite del predio, seguridad y entrada de la gente: qué está y qué falta, con un botón para agregarlo y "Va / No va"
    para la carpa y la ambulancia); **revisión del plano** (cosas que se pisan, salidas tapadas, el generador cerca del
    público, lugares sin matafuego, la ambulancia lejos de un acceso, cuánto tarda en entrar la gente; con "Ver" y, para
    los matafuegos, un botón que lo agrega); capacidad; fondo y escala; ubicación; checklist del armado (con el QR) e historial.
  - **Seguridad**: cuánta gente entra, ancho de salidas, distancia a la salida más cercana (se puede ver pintado en el
    piso), matafuegos, baños, barra, agua y primeros auxilios. Las reglas se pueden ajustar a lo que pida el municipio.
  - **Técnica**: sonido (cobertura y ruido a los vecinos), energía por tablero, peso colgado en cada truss, sol y sombra
    a cada hora, y terreno.

**Mapa para el público**: **Exportar** → **Mapa para el público**. Elegís historia de Instagram, posteo, cuadrado o
afiche A3, colores y título, y lo bajás como imagen. Muestra barra, baños, salidas y estacionamiento, sin datos técnicos.

**Visor para WhatsApp**: **Exportar** → **Visor para WhatsApp**. Un solo archivo que se abre en cualquier celular, sin
internet ni instalar nada: el 3D, el mapa y el listado (sin costos ni contactos).

**Fotos del lugar**: el botón de fotos arriba a la derecha. Cada foto se puede **ubicar en el mapa** (dónde se sacó y
hacia dónde mira); después un clic en el pin de la cámara la abre.

**Capas**: el ojo oculta una categoría y el candado impide elegirla sin querer en la vista (por ejemplo, los árboles).

Todo se guarda solo. Ctrl+Z deshace. Con ⋯ al lado del nombre de la escena podés duplicarla para probar otra distribución.

### Atajos

| Tecla | Hace |
| --- | --- |
| V, H, M, C, Z | Seleccionar, mano, medir, cota, zona |
| 1 2 3 4 5 | 3D, planta, plano, materiales, producción |
| Shift + clic | Sumar o sacar de la selección |
| R / Shift+R | Girar 15° / 90° |
| Flechas | Mover un paso (con Shift, diez) |
| Alt al arrastrar | Mover sin ajustar a la grilla |
| Ctrl+C / Ctrl+V | Copiar y pegar, también entre escenas |
| Ctrl+D | Duplicar |
| Ctrl+A | Seleccionar todo lo que no está fijo |
| Supr | Eliminar |
| Ctrl+Z / Ctrl+Y | Deshacer / rehacer |
| F | Encuadrar todo o la selección |
| N | Modo noche |
| B | Bloquear o destrabar lo elegido |
| Ctrl+K | Buscar y hacer |
| ? | Ver todos los atajos |

## Dónde queda cada cosa

- `escenas/`: un archivo `.json` por lugar (o por variante).
- `fotos/<escena>/`: las fotos de cada lugar.
- `datos/`: tu catálogo de equipos y los bloques.
- `CLAUDE.md` y `docs/esquema-v2.md`: el formato de las escenas, para que Claude sepa cómo armarlas.
