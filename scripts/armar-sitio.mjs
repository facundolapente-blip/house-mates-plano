// Arma la versión de muestra para publicar en internet (Vercel): la app de public/ más las escenas como
// archivos fijos y un índice. Sin el servidor de la compu, la app entra sola en modo muestra (se puede mirar
// y probar todo, pero los cambios no se guardan).
// Uso: node scripts/armar-sitio.mjs   → deja todo en _site/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, '_site');

// Copia de carpetas a mano: fs.cpSync se cae en Windows con rutas con acentos ("Modelación").
function copiar(origen, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    const a = path.join(origen, e.name);
    const b = path.join(destino, e.name);
    if (e.isDirectory()) copiar(a, b);
    else if (e.isFile()) fs.copyFileSync(a, b);
  }
}

fs.rmSync(SALIDA, { recursive: true, force: true });
copiar(path.join(RAIZ, 'public'), SALIDA);
// La página del checklist necesita el servidor: en la muestra no va.
for (const f of ['checklist.html', 'checklist.css', 'js/checklist.js']) fs.rmSync(path.join(SALIDA, f), { force: true });

const destino = path.join(SALIDA, 'escenas');
fs.mkdirSync(destino, { recursive: true });
const indice = [];
for (const f of fs.readdirSync(path.join(RAIZ, 'escenas')).filter((x) => x.endsWith('.json'))) {
  const texto = fs.readFileSync(path.join(RAIZ, 'escenas', f), 'utf8');
  let nombre = f.slice(0, -5);
  try {
    nombre = JSON.parse(texto).nombre || nombre;
  } catch {
    continue;
  }
  fs.writeFileSync(path.join(destino, f), texto);
  indice.push({ slug: f.slice(0, -5), nombre });
}
// La escena de ejemplo va al final: se abre primero la del evento.
indice.sort((a, b) => (a.slug === 'ejemplo') - (b.slug === 'ejemplo') || a.nombre.localeCompare(b.nombre, 'es'));
fs.writeFileSync(path.join(destino, 'indice.json'), JSON.stringify(indice, null, 1));

const fotos = path.join(RAIZ, 'fotos');
if (fs.existsSync(fotos)) copiar(fotos, path.join(SALIDA, 'fotos'));

console.log(`Sitio armado en _site/ con ${indice.length} escena${indice.length === 1 ? '' : 's'}: ${indice.map((e) => e.slug).join(', ')}`);
