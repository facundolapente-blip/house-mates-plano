// Descargas: PDF del plano (jsPDF + svg2pdf, se cargan recién cuando hacen falta), SVG, CSV y archivos.

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const descargarTexto = (texto, nombre, tipo = 'text/plain') => descargarBlob(new Blob([texto], { type: `${tipo};charset=utf-8` }), nombre);

function cargarScript(src) {
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => mal(new Error(`No se pudo cargar ${src}`));
    document.head.append(s);
  });
}

let librerias = null;
function cargarPDF() {
  librerias ??= (async () => {
    // Copias locales (public/vendor), para poder exportar sin internet.
    await cargarScript('vendor/jspdf/jspdf.umd.min.js');
    await cargarScript('vendor/svg2pdf/svg2pdf.umd.min.js');
    return { jsPDF: window.jspdf.jsPDF, svg2pdf: window.svg2pdf.svg2pdf };
  })().catch((e) => {
    librerias = null;
    throw e;
  });
  return librerias;
}

// Convierte las hojas SVG (en milímetros) a un PDF vectorial de varias páginas.
export async function pdfDeHojas(hojas, [W, H], nombre) {
  const { jsPDF, svg2pdf } = await cargarPDF();
  const orientacion = W > H ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: orientacion, compress: true });
  const caja = document.createElement('div');
  caja.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden';
  document.body.append(caja);
  try {
    for (let i = 0; i < hojas.length; i++) {
      if (i) doc.addPage([W, H], orientacion);
      caja.innerHTML = hojas[i];
      await svg2pdf(caja.firstElementChild, doc, { x: 0, y: 0, width: W, height: H });
    }
  } finally {
    caja.remove();
  }
  doc.setProperties({ title: nombre.replace(/\.pdf$/, ''), creator: 'House Mates Plano' });
  doc.save(nombre);
}
