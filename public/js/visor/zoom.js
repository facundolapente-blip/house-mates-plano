// Zoom para las hojas del plano y el mapa: con dos dedos, con + y −, o con Ctrl + rueda (o el gesto del
// panel táctil) en la computadora. Un dedo mueve la hoja con el desplazamiento normal del navegador.
// Mientras se pellizca se escala con una transformación (rápido); al soltar se acomoda el ancho real para
// que las líneas del SVG queden nítidas.

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

// area: el contenedor que desplaza (overflow: auto). Adentro, el primer hijo es el contenido, cuyo ancho se
// maneja con la variable --ancho. salida: elemento donde se muestra el porcentaje (opcional).
export function hacerZoomable(area, { min = 0.4, max = 8, salida = null } = {}) {
  const contenido = area.firstElementChild;
  let zoom = 1;
  let base = 0;

  const anchoBase = () => {
    const estilo = getComputedStyle(area);
    const relleno = parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight);
    return Math.max(120, Math.min(area.clientWidth - relleno, 1400));
  };

  function mostrar() {
    if (salida) salida.textContent = `${Math.round(zoom * 100)}%`;
  }

  // Cambia el zoom dejando quieto el punto de la hoja que está en (fx, fy) del área visible.
  function poner(z, fx = area.clientWidth / 2, fy = area.clientHeight / 2) {
    z = limitar(z, min, max);
    base = anchoBase();
    const w0 = contenido.offsetWidth || 1;
    const h0 = contenido.offsetHeight || 1;
    const rx = (area.scrollLeft + fx - contenido.offsetLeft) / w0;
    const ry = (area.scrollTop + fy - contenido.offsetTop) / h0;
    zoom = z;
    contenido.style.setProperty('--ancho', `${Math.round(base * zoom)}px`);
    area.scrollLeft = contenido.offsetLeft + rx * contenido.offsetWidth - fx;
    area.scrollTop = contenido.offsetTop + ry * contenido.offsetHeight - fy;
    mostrar();
  }

  /* --------------------------------------------------------------- pellizco */

  let pinza = null;
  const distancia = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const centro = (t) => {
    const r = area.getBoundingClientRect();
    return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
  };

  area.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 2) return;
      const c = centro(e.touches);
      const x0 = area.scrollLeft + c.x - contenido.offsetLeft;
      const y0 = area.scrollTop + c.y - contenido.offsetTop;
      pinza = { d: distancia(e.touches), c, x0, y0, k: 1 };
      contenido.style.transformOrigin = `${x0}px ${y0}px`;
      contenido.style.willChange = 'transform';
    },
    { passive: true }
  );

  area.addEventListener(
    'touchmove',
    (e) => {
      if (!pinza || e.touches.length !== 2) return;
      e.preventDefault();
      const c = centro(e.touches);
      pinza.k = limitar(zoom * (distancia(e.touches) / pinza.d), min, max) / zoom;
      pinza.c1 = c;
      contenido.style.transform = `translate(${c.x - pinza.c.x}px, ${c.y - pinza.c.y}px) scale(${pinza.k})`;
    },
    { passive: false }
  );

  const terminar = () => {
    if (!pinza) return;
    const { k, c, c1 = c, x0, y0 } = pinza;
    pinza = null;
    contenido.style.transform = '';
    contenido.style.willChange = '';
    // Punto de la hoja que quedó bajo los dedos: se fija con el ancho nuevo.
    const w0 = contenido.offsetWidth || 1;
    const h0 = contenido.offsetHeight || 1;
    zoom = limitar(zoom * k, min, max);
    base = anchoBase();
    contenido.style.setProperty('--ancho', `${Math.round(base * zoom)}px`);
    area.scrollLeft = contenido.offsetLeft + (x0 / w0) * contenido.offsetWidth - c1.x;
    area.scrollTop = contenido.offsetTop + (y0 / h0) * contenido.offsetHeight - c1.y;
    mostrar();
  };
  area.addEventListener('touchend', (e) => e.touches.length < 2 && terminar());
  area.addEventListener('touchcancel', terminar);
  // Safari en iPhone tiene su propio gesto de zoom de la página: acá lo maneja la hoja.
  area.addEventListener('gesturestart', (e) => e.preventDefault());

  /* --------------------------------------------------------------- computadora */

  area.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = area.getBoundingClientRect();
      poner(zoom * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false }
  );

  // Si cambia el tamaño de la ventana, la hoja sigue ocupando lo mismo en proporción.
  new ResizeObserver(() => {
    if (!area.clientWidth) return;
    const nueva = anchoBase();
    if (Math.abs(nueva - base) > 1) poner(zoom);
  }).observe(area);

  poner(1, 0, 0);

  return {
    get zoom() {
      return zoom;
    },
    acercar: () => poner(zoom * 1.4),
    alejar: () => poner(zoom / 1.4),
    ajustar: () => {
      poner(1, 0, 0);
      area.scrollLeft = 0;
    },
    poner,
  };
}
