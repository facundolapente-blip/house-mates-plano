# House Mates Plano

Herramienta de maquetación para el armado de los eventos House Mates: el lugar en 3D a escala real, planos para
imprimir, listado de materiales y análisis para planificar (salidas, sonido, energía, sol, terreno). Funciona en la
computadora, sin internet.

> **Estado: en desarrollo.** Esta es una versión de avance. Abajo está lo que ya anda y lo que falta.

## Qué ya hace

- **Lugar a escala:** ambientes con paredes, puertas y ventanas, o predios al aire libre.
- **Predio con Google Maps o Google Earth:** se pega una captura satelital, se marcan dos puntos con sus
  coordenadas y la imagen queda a escala real con el norte ubicado. Se pueden marcar puntos pegando coordenadas.
- **Herramientas de dibujo:** zonas de forma libre, estacionamientos que cuentan las cocheras solos, caminos con
  metros y minutos caminando, vallado por paños, accesos y salidas.
- **Biblioteca** de más de 50 objetos: sonido, luces, truss, barras, food trucks, baños, agua, primeros auxilios,
  generadores, tableros, staff, carteles. Además, **catálogo propio** de equipos y **bloques** reutilizables (por
  ejemplo, la cabina House Mates entera), grupos y capas.
- **Planos para imprimir** (A4 a A1) con cuadro de datos, revisiones, flecha del norte e imagen de fondo, más hojas
  extra: plano eléctrico, cobertura de sonido, sombras a una hora y curvas de nivel.
- **Listado de materiales** (con paños de vallado, carteles, cables y cocheras) y exportación a CSV, PDF, AutoCAD
  (DXF), Google Earth (KML) y un **visor de un solo archivo** para mandar por WhatsApp.
- **Análisis:** cobertura de sonido y ruido a los vecinos, potencia por tablero y metros de cable, peso colgado en
  cada truss, sol y sombra a cada hora, terreno con pendientes y dónde se junta el agua.
- **Seguridad de los datos:** versiones anteriores para volver atrás, historial con git y copia en la nube (OneDrive).

## En camino

Mapa para el público (historia, posteo y afiche con QR), seguridad y salidas de emergencia, vista de producción
(cronograma, presupuesto, proveedores, staff, comparar variantes), checklist de armado en el celular, vistas de frente
con alturas y fotos ubicadas en el mapa. El detalle está en [HOJA-DE-RUTA.md](HOJA-DE-RUTA.md).

## Cómo abrirlo

1. Instalar [Node.js](https://nodejs.org) (una sola vez).
2. Descargar este repositorio (botón verde **Code**, **Download ZIP**) y descomprimirlo.
3. Doble clic en `abrir.bat`. Se abre en el navegador.

Más detalle en [INSTRUCCIONES.md](INSTRUCCIONES.md). Para quien programa: [CLAUDE.md](CLAUDE.md) y
[docs/esquema-v2.md](docs/esquema-v2.md).
