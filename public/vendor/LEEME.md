# Librerías guardadas en la carpeta

Copias locales para que House Mates Plano funcione sin internet (por ejemplo, en un lugar sin señal). Se bajaron el
2026-10-23 de los mismos servidores que la app usaba antes. No editarlas: para actualizar una versión, bajar el archivo
nuevo y cambiar la ruta en `public/index.html` o `public/js/exportar.js`.

| Carpeta | Qué es | Versión | De dónde | Licencia |
| --- | --- | --- | --- | --- |
| `three/build/` | Motor 3D (núcleo, minificado) | 0.169.0 | cdn.jsdelivr.net/npm/three@0.169.0 | MIT (`three/LICENSE`) |
| `three/examples/jsm/` | Add-ons que usa la app y los archivos de los que dependen | 0.169.0 | ídem | MIT |
| `jspdf/` | Generación del PDF | 2.5.1 | cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1 | MIT (`jspdf/LICENSE`) |
| `svg2pdf/` | Pasa las hojas SVG al PDF | 2.2.3 | cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3 | MIT (`svg2pdf/LICENSE`) |
| `fuentes/` | General Sans 400, 500, 600 y 700 (woff2) | — | api.fontshare.com | ITF Free Font License (Fontshare): uso libre, personal y comercial |

Si la app suma otro add-on de Three.js (`import ... from 'three/addons/...'`), hay que copiarlo también a
`three/examples/jsm/` con los archivos que importe; si no, la app no arranca.
