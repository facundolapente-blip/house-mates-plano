# House Mates Plano

Herramienta de maquetación para el armado de los eventos House Mates: el lugar en 3D a escala real, planos para
imprimir, listado de materiales y análisis para planificar (salidas, sonido, energía, sol, terreno). Funciona en la
computadora, sin internet.

> **Estado: en desarrollo.** Ya están todas las funciones de la hoja de ruta; ahora toca usarlo en eventos reales y pulir.

**Probala online: [house-mates-plano.vercel.app](https://house-mates-plano.vercel.app)**. Es una versión de muestra:
se puede recorrer y probar todo, pero los cambios no se guardan (la herramienta completa se usa en la compu).

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
- **Seguridad:** cuánta gente entra, ancho de salidas, distancia caminando a la salida más cercana (pintada en el
  piso), matafuegos, baños, barra, agua y primeros auxilios, más un plano de emergencia para imprimir.
- **Producción:** cronograma de armado y desarme con línea de tiempo (y un borrador que se arma solo), proveedores
  con horario, acceso y WhatsApp, staff, presupuesto y comparación entre dos variantes de distribución.
- **Mapa para el público:** historia de Instagram, posteo o afiche A3 con la identidad de House Mates y QR de cómo llegar.
- **Checklist del armado en el celular:** el equipo marca lo que llegó y lo que está armado escaneando un QR.
- **Vistas de frente** con todas las alturas (la cabina, por ejemplo) y **fotos ubicadas en el mapa**.
- **Seguridad de los datos:** versiones anteriores para volver atrás, historial con git y copia en la nube (OneDrive).

El detalle de cada función está en [HOJA-DE-RUTA.md](HOJA-DE-RUTA.md).

## Cómo abrirlo

1. Instalar [Node.js](https://nodejs.org) (una sola vez).
2. Descargar este repositorio (botón verde **Code**, **Download ZIP**) y descomprimirlo.
3. Doble clic en `abrir-oculto.vbs` (o `abrir.bat`). Se abre en el navegador.

Más detalle en [INSTRUCCIONES.md](INSTRUCCIONES.md). Para quien programa: [CLAUDE.md](CLAUDE.md) y
[docs/esquema-v2.md](docs/esquema-v2.md).
