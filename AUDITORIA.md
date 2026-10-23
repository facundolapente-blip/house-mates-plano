# Auditoría de House Mates Plano

23 de octubre de 2026. Revisión completa del servidor y de la app: lectura del código, pruebas en el navegador con
archivos rotos a propósito, 500 objetos, todas las vistas y tamaños de hoja, y la versión de celular.

**Resultado:** 8 cambios de seguridad y datos en el servidor y 27 bugs corregidos en la app. Los dos más graves:
cualquiera en la misma red wifi podía modificar las escenas, y un número escrito como texto en el archivo dejaba el plano
imprimible en blanco.

## Para que los cambios apliquen

La ventanita negra que está abierta ahora usa el servidor viejo. Cerrala y volvé a abrir **Modelación House Mates**
desde el escritorio. Los cambios de la app se ven con solo recargar la página, pero los de seguridad y los respaldos
necesitan reiniciar.

## Seguridad y datos (servidor)

| Antes | Ahora |
| --- | --- |
| Escuchaba en toda la red: cualquiera en el mismo wifi podía leer y pisar escenas o subir fotos. | Solo desde esta computadora. Para el celular, `node server.mjs --red`. |
| Una página web cualquiera abierta en el navegador podía escribir escenas. | Se rechaza todo pedido que no venga de la propia app (Host y Origin). |
| Un guardado malo pisaba la escena sin vuelta atrás. | Respaldo automático en `escenas/.respaldos/` (uno cada 5 min, los últimos 40, con fecha y hora). |
| Dos guardados al mismo tiempo usaban el mismo archivo temporal. | Cada guardado usa uno propio. |
| Una dirección mal formada tiraba error 500. | Responde 400. |
| Aceptaba cualquier JSON (una lista, un número) como escena. | Solo objetos. |
| La conexión de avisos en vivo se podía cortar si no pasaba nada. | Latido cada 25 s. |
| El puerto solo se cambiaba con una variable de entorno. | También `--puerto=5179`. |

## Bugs corregidos (app)

**Archivos escritos a mano** (los edita Claude o el usuario, así que era lo más probable):

1. Un número entre comillas (`"3"`, `"4,5"`) o un valor vacío dejaba el plano imprimible entero en blanco y el objeto
   desaparecía del 3D. Ahora se convierte al abrir.
2. Medidas negativas daban superficie de tarima y módulos negativos en materiales; en cero, ítems de "0 × 0 × 0".
3. Escala del plano negativa o inválida dibujaba el plano espejado.
4. Una puerta o ventana más allá del largo de la pared estiraba la pared.
5. Nombres o ids numéricos rompían la búsqueda en capas y "Duplicar".
6. Ids con comillas rompían la lista de capas.
7. Colores inválidos pasaban directo al SVG del plano.
8. Módulo de tarima o tramo de truss en 0 daba cantidades infinitas.
9. Densidad negativa daba personas negativas en capacidad.
10. Punto de partida de "Caminar" escrito como texto dejaba la cámara perdida.
11. Un tipo de objeto que no está en la biblioteca aparecía como "Columna" en el panel.

**Plano para imprimir:**

12. Con zoom, la parte derecha de la hoja quedaba cortada y no se podía recorrer.
13. En hoja vertical las referencias ocupaban el costado: el open air salía a 1:750 con media hoja vacía. Ahora van en
    una franja abajo y sale a 1:400 en A4.
14. La barra de escala podía pisar el texto "Medidas en metros".
15. "Ajustar" solo ajustaba al ancho: una hoja vertical no se veía entera.

**Edición:**

16. Girar varios objetos juntos giraba cada uno sobre su centro y desarmaba los grupos. Ahora giran alrededor del
    centro del grupo.
17. Pegar varias veces en la misma escena dejaba todas las copias en el mismo lugar.
18. "Repetir" aceptaba hasta 40.000 copias y trababa el navegador. Tope de 2.000, con aviso.
19. Un arrastre cortado (cambio de ventana a mitad del movimiento) podía dejar el objeto pegado al mouse.
20. Agregar un tipo inexistente (arrastrando algo de afuera) daba error.

**Guardado y recarga:**

21. Si el archivo cambiaba mientras escribías en el panel, se perdía el foco del campo. Si además había un cambio sin
    guardar, se pisaba sin aviso. Ahora se mantiene el foco y avisa que Ctrl+Z vuelve a tu versión.
22. Al cerrar la pestaña, en escenas grandes (más de unos 400 objetos) el último cambio se podía perder. Ahora también
    guarda al cambiar de pestaña o minimizar.
23. Si una escena no abría por un error de formato, el selector quedaba mostrando esa escena aunque siguiera abierta
    la anterior.
24. Cambiar la dirección (`#escena`) o usar atrás y adelante del navegador no cambiaba de escena.

**Rendimiento y celular:**

25. En lugares muy grandes (campos de 100 m o más) la capacidad recalculaba millones de puntos en cada cambio. Ahora
    la grilla se adapta (tope de 250.000 puntos).
26. La grilla del 3D no liberaba memoria al reconstruirse.
27. En el celular no se podía usar el modo noche, las fotos ni Exportar. Ahora están en la barra de arriba.

## Cómo se probó

- Una escena con 20 casos rotos a propósito (texto en vez de números, medidas negativas y en cero, ids repetidos y con
  comillas, tipos inexistentes, áreas de 2 puntos, aberturas fuera de la pared, colores con código, cotas de largo cero):
  abre sin errores, el 3D no tiene posiciones inválidas y el plano no tiene ningún NaN.
- 500 sillas con "Repetir": se crean en menos de medio segundo; deshacer, rehacer, plano y materiales siguen rápidos.
- Archivo roto mientras la escena está abierta: avisa y conserva la última versión buena.
- Plano en A3 y A4 horizontales, A4 y A1 verticales: ningún texto encimado ni fuera de la hoja.
- Exportar imagen: sale con contenido (se verificó en memoria, sin descargar).
- Seguridad del servidor con pedidos de otro Host, otro Origin, rutas con `..` y direcciones mal formadas.
- Celular de 375 px de ancho.

No probado: la descarga real del PDF a disco, Safari y Firefox, y un celular de verdad.

## Oportunidades de mejora

**Prioridad alta**

1. ~~**Que funcione sin internet.**~~ Hecho el 23/10: Three.js, jsPDF, svg2pdf y General Sans están en
   `public/vendor` (1,5 MB). Probado: la app y el PDF no hacen ningún pedido a internet.
2. ~~**Restaurar un respaldo desde la app.**~~ Hecho el 23/10: menú ⋯ → "Versiones anteriores…", con lo que cambiaría
   cada una, "Volver a esta" (guarda antes lo actual) y "Guardar versión ahora". Igual conviene poner la carpeta en git.
3. **Datos técnicos por equipo:** consumo (W), peso, costo y proveedor. Con eso salen la potencia por tablero, la carga
   sobre el truss y un presupuesto.
4. **Plano eléctrico:** tableros, alargues y metros de cable entre cada equipo y su toma.

**Prioridad media**

5. Exportar la imagen en alta (2×) y con nombres y medidas; hoy sale al tamaño de la pantalla y sin rótulos.
6. En el PDF: hojas de detalle por sector (cabina, barra) y una vista de frente con alturas.
7. Checklist de armado y desarme a partir del listado de materiales, con responsable y horario.
8. Evacuación: distancia máxima a una salida y ancho de salidas contra la capacidad.
9. Etapas en la misma escena (armado, show, desarme) en vez de duplicar archivos.

**Prioridad baja**

10. Ctrl+A en las vistas Plano y Materiales selecciona el texto de la página.
11. `app.js` tiene 2.900 líneas: conviene separarlo en módulos antes de que siga creciendo.
12. Pruebas automáticas de la normalización, el cómputo y el plano.
13. La carpeta `posteos` (13 MB de diseños de DJ Senc) quedó dentro del proyecto y no es parte de la herramienta.
