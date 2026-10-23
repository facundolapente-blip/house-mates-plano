// Cierre del servidor.
// Abierto sin ventana (--oculto, desde abrir-oculto.vbs), el servidor se cierra solo cuando no queda ninguna pestaña
// de la app abierta: cada pestaña mantiene una conexión de avisos (SSE, /api/eventos), así que "sin clientes" quiere
// decir "sin pestañas". Nunca se cierra en los primeros minutos (gracia) ni antes de que se haya abierto la app;
// si nadie la abre, se cierra igual después de `esperaInicial` minutos para no quedar escondido para siempre.
// También está el pedido explícito POST /api/apagar (botón "Cerrar House Mates Plano").

const MINUTO = 60_000;
const MAX_TIMEOUT = 2 ** 31 - 1;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());

/**
 * @param {object} op
 * @param {Set|Map|(() => number)} [op.clientes] conexiones SSE abiertas (el Set de server.mjs). Sin esto se cuentan
 *        las llamadas a conexion() y desconexion().
 * @param {number} [op.minutos=3] minutos sin pestañas antes de cerrarse.
 * @param {number} [op.gracia=2] minutos desde el arranque en los que nunca se cierra.
 * @param {number} [op.esperaInicial=10] si nadie abre la app, minutos desde el arranque antes de cerrarse.
 * @param {boolean} [op.activo=true] false = no se cierra solo (por ejemplo, abierto con abrir.bat); apagar() sigue andando.
 * @param {(msg: string) => void} [op.log]
 * @param {() => any} [op.alApagar] tarea antes de salir (por ejemplo historial.detener()); se espera hasta `esperaMaxima` ms.
 * @param {(codigo: number) => void} [op.salir] por defecto process.exit.
 */
export function crearApagado({
  clientes,
  minutos = 3,
  gracia = 2,
  esperaInicial = 10,
  activo = true,
  log = console.log,
  alApagar,
  salir = (codigo) => process.exit(codigo),
  esperaMaxima = 10_000,
} = {}) {
  const inicio = Date.now();
  let propios = 0;
  let huboCliente = false;
  let ultimaSalida = inicio;
  let temporizador = null;
  let apagando = null;
  let detenido = !activo || !(minutos > 0);

  const avisar = (m) => {
    try {
      log(m);
    } catch {}
  };

  function cuantos() {
    if (typeof clientes === 'function') return Number(clientes()) || 0;
    if (clientes && typeof clientes.size === 'number') return clientes.size;
    return propios;
  }

  // Momento a partir del cual se puede cerrar si sigue sin pestañas.
  function plazo() {
    if (!huboCliente) return inicio + Math.max(gracia, esperaInicial) * MINUTO;
    return Math.max(inicio + gracia * MINUTO, ultimaSalida + minutos * MINUTO);
  }

  function revisar() {
    clearTimeout(temporizador);
    temporizador = null;
    if (detenido || apagando || cuantos() > 0) return;
    const resta = plazo() - Date.now();
    if (resta <= 0) {
      apagar(
        huboCliente
          ? `No hay pestañas de la app abiertas hace ${minutos} min`
          : `Nadie abrió la app en ${Math.max(gracia, esperaInicial)} min`,
      );
      return;
    }
    temporizador = setTimeout(revisar, Math.min(resta + 50, MAX_TIMEOUT));
    temporizador.unref?.();
  }

  // Cierra el servidor: corre alApagar (con tope de tiempo) y sale. Se puede llamar varias veces.
  function apagar(motivo = 'Pedido de cierre') {
    if (apagando) return apagando;
    detenido = true;
    clearTimeout(temporizador);
    temporizador = null;
    avisar(`${motivo}: se cierra House Mates Plano.`);
    apagando = (async () => {
      try {
        if (alApagar) await Promise.race([Promise.resolve().then(alApagar), esperar(esperaMaxima)]);
      } catch (e) {
        avisar(`Error al cerrar: ${e?.message || e}`);
      }
      salir(0);
    })();
    return apagando;
  }

  revisar();

  return {
    // Llamar cuando se abre una conexión de avisos (después de agregarla a `clientes`).
    conexion() {
      propios++;
      huboCliente = true;
      revisar();
    },
    // Llamar cuando se cierra una conexión de avisos. Revisa en el próximo ciclo, así da igual si se llama antes o
    // después de sacarla de `clientes`.
    desconexion() {
      propios = Math.max(0, propios - 1);
      ultimaSalida = Date.now();
      setImmediate(revisar);
    },
    // Apaga el cierre automático (el servidor sigue andando).
    detener() {
      detenido = true;
      clearTimeout(temporizador);
      temporizador = null;
    },
    apagar,
    estado() {
      return {
        automatico: !detenido,
        clientes: cuantos(),
        cierraEn: temporizador ? new Date(plazo()).toISOString() : null,
        cerrando: !!apagando,
      };
    },
  };
}

/**
 * POST /api/apagar: responde y cierra el servidor a los `demora` ms (le da tiempo a la respuesta de llegar).
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {(res, status: number, datos: any) => void} json el helper json() de server.mjs
 * @param {{ apagar?: (motivo: string) => any, demora?: number }} [op] apagar: por ejemplo apagado.apagar (corre
 *        alApagar antes de salir). Por defecto, process.exit(0).
 */
export function manejarApagar(req, res, json, { apagar = () => process.exit(0), demora = 300 } = {}) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Para cerrar House Mates Plano se usa POST' });
  json(res, 200, { ok: true, mensaje: 'House Mates Plano se está cerrando.' });
  setTimeout(() => {
    Promise.resolve()
      .then(() => apagar('Pedido de cierre desde la app'))
      .catch(() => process.exit(0));
  }, demora);
}
