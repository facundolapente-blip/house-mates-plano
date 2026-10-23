# Housemates Plano

Plano 3D a escala de los lugares de las fiestas: el espacio con sus medidas reales y todo lo que va adentro
(sonido, luces, barra, baños, zonas), para planificar la distribución antes de llegar al lugar.

## Abrirlo

1. Hace falta tener [Node.js](https://nodejs.org) instalado (una sola vez).
2. Doble clic en **Modelación House Mates** en el escritorio (o en `abrir.bat` dentro de esta carpeta).
   Se abre `http://localhost:5178` en el navegador.
3. Queda una ventanita negra minimizada en la barra de tareas mientras lo usás. Para cerrarlo, cerrá esa ventana.

No necesita internet: todo lo que usa está dentro de la carpeta, así que funciona en un lugar sin señal.

**Versiones anteriores**: cada vez que una escena cambia, la versión anterior queda guardada sola (una cada 5 minutos
como mucho, las últimas 40). Para volver a una: botón **⋯** al lado del nombre de la escena → **Versiones anteriores…**.
Cada versión dice qué cambiaría (por ejemplo, "vuelven 2 objetos, 3 cambian de lugar"). Al volver, lo que tenías también
queda guardado y Ctrl+Z lo deshace. Antes de un cambio grande podés tocar **Guardar versión ahora**.

**Verlo desde el celular** (misma red wifi): abrí una terminal en esta carpeta y corré `node server.mjs --red`. Muestra
la dirección para escribir en el celular. Sin `--red` solo se puede abrir desde esta computadora.

## Qué mandarle a Claude para armar un lugar

**Fotos**

- Una desde cada esquina mirando hacia el centro.
- Una de cada pared de frente, con sus puertas, ventanas y columnas.
- Detalles que importen: escaleras, desniveles, tablero eléctrico, enchufes, salidas.
- Si podés, que aparezca una cinta métrica abierta o algo de medida conocida.

**Medidas** (en metros o centímetros, como te quede cómodo)

- Largo y ancho de cada ambiente, de pared a pared por dentro.
- Altura del techo (y altura bajo vigas si hay).
- Si el ambiente no es rectangular: las diagonales también.
- Puertas, portones y ventanas: en qué pared, a cuánto de la esquina, ancho y alto. En ventanas, a qué altura empiezan.
- Columnas: tamaño y distancia a dos paredes.
- Qué esquina tomamos como punto de partida (por ejemplo: "la del fondo a la izquierda, mirando desde la entrada").

**Objetos**

- Qué es, sus medidas (ancho × profundidad × alto) y dónde va: distancia a dos paredes y para qué lado mira.
- Si algo va encima de otra cosa (parlante sobre sub, cabina sobre tarima), decilo.

Ejemplo: "Barra de 4 m de largo, 70 cm de profundidad y 1,10 de alto, contra la pared izquierda a 1 m del
fondo, mirando hacia el salón."

Claude crea la escena en `escenas/` y la ves aparecer en el navegador. Si después le pedís cambios, el plano se
actualiza solo.

## Usarlo

**Las cuatro vistas** (arriba en el centro):

- **3D**: el modelo para recorrer y acomodar. El botón con la persona caminando te deja recorrerlo adentro (W A S D, Esc suelta el mouse).
- **Planta**: vista desde arriba. Es la más cómoda para ubicar cosas con precisión y para elegir varias con un recuadro.
- **Plano**: la hoja para imprimir o mandar. A la derecha elegís el papel (A4 a A1), la escala y qué se ve, y la bajás en PDF o SVG.
  Trae el cuadro con los datos del evento, la leyenda numerada y, en las hojas siguientes, el listado de materiales.
- **Materiales**: cuántas unidades de cada cosa hay que llevar, agrupadas por categoría, más los módulos de tarima, los tramos de
  truss, los metros de barra y las superficies. Se baja como planilla (CSV) para Excel o Sheets.

**Herramientas** (barra flotante a la izquierda de la vista):

- **Seleccionar (V)**: clic para elegir, arrastrar para mover. Shift+clic suma o saca de la selección. En planta, arrastrar
  en el vacío dibuja un recuadro de selección (en 3D, con Shift).
- **Mano (H o barra espaciadora)**: mueve la vista.
- **Medir (M)**: dos clics; se pega a esquinas y vértices.
- **Cota (C)**: como medir, pero la cota queda guardada y sale en el plano impreso.
- **Zona (Z)**: arrastrá sobre el piso para marcar pista, barra, fumadores o backstage, con sus m² y capacidad.

**Biblioteca** (pestaña de la izquierda): arrastrá un objeto hasta la vista o hacé clic para ponerlo en el centro.

**Panel de la derecha**: con un objeto elegido, posición y medidas exactas, el modelo o referencia y el proveedor (para el
listado), color y notas. Con varios elegidos: alinear, distribuir parejo, repetir en filas y columnas y cambiar a todos juntos.
Sin nada elegido: los datos del proyecto (evento, fecha, lugar, responsable) y la capacidad estimada.

**Capas**: el ojo oculta una categoría y el candado impide elegirla sin querer en la vista (por ejemplo, los árboles).

Todo se guarda solo. Ctrl+Z deshace. Con ⋯ al lado del nombre de la escena podés duplicarla para probar otra distribución.

### Atajos

| Tecla | Hace |
| --- | --- |
| V, H, M, C, Z | Seleccionar, mano, medir, cota, zona |
| 1 2 3 4 | 3D, planta, plano, materiales |
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
| ? | Ver todos los atajos |

## Dónde queda cada cosa

- `escenas/`: un archivo `.json` por lugar (o por variante).
- `fotos/<escena>/`: las fotos de cada lugar.
- `CLAUDE.md`: el formato de las escenas, para que Claude sepa cómo armarlas.
