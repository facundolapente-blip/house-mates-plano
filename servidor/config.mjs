// Configuración opcional de House Mates Plano: config.json en la carpeta del programa.
// Si el archivo no está (o tiene un error), se usan los valores por defecto.
//
// {
//   "nube": "D:\\Drive\\House Mates Plano",   // carpeta donde se copian escenas, datos y fotos
//                                              // (también sirve "D:/Drive/House Mates Plano" o "%OneDrive%\\Copias").
//                                              // false = sin copia. Si falta: OneDrive\House Mates Plano (si hay OneDrive).
//   "historial": true,                         // false = sin historial con git
//   "apagadoMinutos": 3                        // abierto sin ventana: minutos sin pestañas abiertas antes de cerrarse.
//                                              // 0 = no se cierra solo.
// }

import fs from 'node:fs';
import path from 'node:path';

export const CARPETA_NUBE = 'House Mates Plano';
export const CONFIG_POR_DEFECTO = Object.freeze({ historial: true, apagadoMinutos: 3 });

// Carpeta de copia por defecto: <OneDrive>\House Mates Plano, o false si la compu no tiene OneDrive.
export function nubePorDefecto(entorno = process.env) {
  return entorno.OneDrive ? path.join(entorno.OneDrive, CARPETA_NUBE) : false;
}

// Devuelve la carpeta de la nube ya resuelta (ruta absoluta) o false si está apagada.
export function resolverNube(valor, raiz, entorno = process.env) {
  if (valor === undefined || valor === true) return nubePorDefecto(entorno);
  if (valor === false || valor === null) return false;
  if (typeof valor !== 'string') return nubePorDefecto(entorno);
  const texto = valor.trim();
  if (!texto) return false;
  // %OneDrive%, %USERPROFILE%, etc.
  const expandido = texto.replace(/%([^%]+)%/g, (todo, nombre) => entorno[nombre] ?? todo);
  return path.resolve(raiz, expandido);
}

function minutos(valor, porDefecto) {
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

// Lee config.json de `raiz`. Nunca tira error: si algo está mal, avisa por `log` y usa lo de por defecto.
// Devuelve { nube: string | false, historial: boolean, apagadoMinutos: number, archivo, existe, error }.
export function leerConfig(raiz, { log = console.log } = {}) {
  const archivo = path.join(raiz, 'config.json');
  let datos = {};
  let existe = false;
  let error = null;
  try {
    // Sin BOM: el Bloc de notas a veces lo agrega.
    const texto = fs.readFileSync(archivo, 'utf8').replace(/^\uFEFF/, '');
    existe = true;
    datos = JSON.parse(texto);
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('se esperaba un objeto { ... }');
  } catch (e) {
    datos = {};
    if (e.code !== 'ENOENT') {
      error = `config.json tiene un error (${e.message}). Se usan los valores por defecto. En las rutas usá \\\\ o /.`;
      try {
        log(error);
      } catch {}
    }
  }
  return {
    nube: resolverNube(datos.nube, raiz),
    historial: datos.historial !== false,
    apagadoMinutos: minutos(datos.apagadoMinutos, CONFIG_POR_DEFECTO.apagadoMinutos),
    archivo,
    existe,
    error,
  };
}
