const totalSolicitudes = document.querySelector("#total-solicitudes");
const totalServidores = document.querySelector("#total-servidores");
const servidoresActivos = document.querySelector("#servidores-activos");
const cuerpoServidores = document.querySelector("#cuerpo-servidores");
const listaEstadisticas = document.querySelector("#lista-estadisticas");
const resultado = document.querySelector("#resultado");
const mensajes = document.querySelector("#mensajes");
const aviso = document.querySelector("#aviso");
const bannerInactivos = document.querySelector("#banner-inactivos");
const estadoApi = document.querySelector("#estado-api");
const btnActualizar = document.querySelector("#btn-actualizar");
const btnSolicitar = document.querySelector("#btn-solicitar");

function horaActual() {
  return new Date().toLocaleTimeString("es-CO", { hour12: false });
}

function informar(texto, tipo) {
  if (tipo === "error" || tipo === "warn") {
    aviso.textContent = texto;
    aviso.className = `aviso ${tipo}`;
  }

  const item = document.createElement("p");
  item.className = `mensaje mensaje-${tipo}`;
  item.textContent = `${horaActual()}  ${texto}`;
  mensajes.prepend(item);
}

function marcarServidoresActivos(servidores) {
  const ningunoActivo = Array.isArray(servidores)
    && !servidores.some((servidor) => servidor.estado === "Activo");
  bannerInactivos.classList.toggle("oculto", !ningunoActivo);
}

function marcarApi(conectada) {
  estadoApi.textContent = conectada ? "En línea" : "Sin conexión";
  estadoApi.className = conectada ? "estado-api ok" : "estado-api error";
}

function mensajeVacio(texto) {
  const parrafo = document.createElement("p");
  parrafo.className = "vacio";
  parrafo.textContent = texto;
  return parrafo;
}

async function consultar(ruta) {
  let response;
  try {
    response = await fetch(ruta);
  } catch {
    const error = new Error("Sin conexión con el balanceador.");
    error.conexion = true;
    throw error;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    let detalle = `La petición falló (código ${response.status}).`;
    if (data && typeof data.detail === "string") {
      detalle = data.detail;
    }
    const error = new Error(detalle);
    error.status = response.status;
    throw error;
  }

  if (data === null) {
    throw new Error("La API respondió, pero el contenido no es JSON.");
  }
  return data;
}

function describirError(ruta, error) {
  if (error.conexion) {
    return "Sin conexión con el balanceador.";
  }
  if (ruta === "/estadisticas") {
    return "No se pudieron consultar las estadísticas.";
  }
  if (ruta === "/servidores") {
    return "No se pudo consultar el listado.";
  }
  if (ruta === "/solicitar") {
    if (error.status === 503) {
      return error.message;
    }
    return "No se pudo procesar la solicitud.";
  }
  return "No se pudo completar la operación.";
}

function renderResumen(info, servidores, stats) {
  const total = stats?.total_solicitudes ?? info?.total_solicitudes;
  const configurados = info?.servidores_configurados ?? (Array.isArray(servidores) ? servidores.length : undefined);
  const activos = Array.isArray(servidores)
    ? servidores.filter((servidor) => servidor.estado === "Activo").length
    : undefined;

  totalSolicitudes.textContent = total === undefined ? "—" : String(total);
  totalServidores.textContent = configurados === undefined ? "—" : String(configurados);
  servidoresActivos.textContent = activos === undefined ? "—" : String(activos);
}

function renderServidores(servidores) {
  cuerpoServidores.replaceChildren();
  if (!Array.isArray(servidores)) {
    cuerpoServidores.append(filaMensaje("No se pudo cargar el listado."));
    return;
  }
  if (servidores.length === 0) {
    cuerpoServidores.append(filaMensaje("Sin servidores"));
    return;
  }

  for (const servidor of servidores) {
    const activo = servidor.estado === "Activo";
    const fila = document.createElement("tr");
    fila.className = activo ? "fila-activo" : "fila-inactivo";

    const nombre = document.createElement("td");
    nombre.textContent = servidor.nombre ?? "Sin nombre";

    const puerto = document.createElement("td");
    puerto.className = "puerto";
    puerto.textContent = servidor.puerto ?? "—";

    const estado = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = activo ? "badge badge-activo" : "badge badge-inactivo";
    badge.textContent = servidor.estado ?? "Desconocido";
    estado.append(badge);

    fila.append(nombre, puerto, estado);
    cuerpoServidores.append(fila);
  }
}

function filaMensaje(texto) {
  const fila = document.createElement("tr");
  const celda = document.createElement("td");
  celda.colSpan = 3;
  celda.className = "vacio";
  celda.textContent = texto;
  fila.append(celda);
  return fila;
}

function renderEstadisticas(servidores, stats) {
  listaEstadisticas.replaceChildren();
  if (!stats) {
    listaEstadisticas.append(mensajeVacio("No se pudieron consultar las estadísticas."));
    return;
  }

  const conteo = stats.solicitudes_por_servidor || {};
  const claves = Object.keys(conteo);
  const filas = [];
  const configurados = Array.isArray(servidores) ? servidores : [];
  const nombresConfigurados = new Set(configurados.map((servidor) => servidor.nombre));
  const mismosNombres = claves.some((nombre) => nombresConfigurados.has(nombre));

  if (claves.length === 0) {
    for (const servidor of configurados) {
      filas.push({ nombre: servidor.nombre ?? "Sin nombre", cantidad: 0 });
    }
  } else {
    for (const nombre of claves) {
      filas.push({ nombre, cantidad: Number(conteo[nombre] || 0) });
    }
    if (mismosNombres) {
      for (const servidor of configurados) {
        if (!claves.includes(servidor.nombre)) {
          filas.push({ nombre: servidor.nombre ?? "Sin nombre", cantidad: 0 });
        }
      }
    }
  }

  if (filas.length === 0) {
    listaEstadisticas.append(mensajeVacio("Sin datos"));
    return;
  }

  const maximo = Math.max(...filas.map((fila) => fila.cantidad), 1);
  for (const fila of filas) {
    const bloque = document.createElement("div");
    bloque.className = "barra-fila";

    const nombre = document.createElement("span");
    nombre.textContent = fila.nombre;

    const via = document.createElement("div");
    via.className = "barra-via";
    const relleno = document.createElement("div");
    relleno.className = "barra-relleno";
    relleno.style.width = `${Math.round((fila.cantidad / maximo) * 100)}%`;
    via.append(relleno);

    const cantidad = document.createElement("span");
    cantidad.className = "barra-cantidad";
    cantidad.textContent = String(fila.cantidad);

    bloque.append(nombre, via, cantidad);
    listaEstadisticas.append(bloque);
  }
}

function renderResultado(data) {
  resultado.className = "resultado ok";
  resultado.replaceChildren();

  const titulo = document.createElement("h3");
  titulo.textContent = data.servidor ?? "Servidor";

  const detalle = document.createElement("p");
  detalle.className = "resultado-detalle";
  detalle.textContent = `Puerto ${data.puerto ?? "—"} · ${data.mensaje ?? "Solicitud procesada"}`;

  const total = document.createElement("p");
  total.className = "resultado-total";
  total.textContent = `${data.total_solicitudes ?? "—"} solicitudes`;

  resultado.append(titulo, detalle, total);
}

function renderErrorSolicitud(texto) {
  resultado.className = "resultado error";
  resultado.replaceChildren();
  const titulo = document.createElement("h3");
  titulo.textContent = "No procesada";
  const parrafo = document.createElement("p");
  parrafo.textContent = texto;
  resultado.append(titulo, parrafo);
}

async function actualizarPanel() {
  btnActualizar.disabled = true;
  const tareas = await Promise.allSettled([
    consultar("/servidores"),
    consultar("/estadisticas"),
    consultar("/info"),
  ]);

  const servidores = tareas[0].status === "fulfilled" ? tareas[0].value : null;
  const stats = tareas[1].status === "fulfilled" ? tareas[1].value : null;
  const info = tareas[2].status === "fulfilled" ? tareas[2].value : null;
  const huboConexion = tareas.some((tarea) => tarea.status === "fulfilled");

  marcarApi(huboConexion);
  marcarServidoresActivos(servidores);
  renderResumen(info, servidores, stats);
  renderServidores(servidores);
  renderEstadisticas(servidores, stats);

  const fallos = [
    ["/servidores", tareas[0]],
    ["/estadisticas", tareas[1]],
    ["/info", tareas[2]],
  ].filter(([, tarea]) => tarea.status === "rejected");

  if (!huboConexion) {
    informar("Sin conexión con el balanceador.", "error");
  } else {
    for (const [ruta, tarea] of fallos) {
      informar(describirError(ruta, tarea.reason), "error");
    }
  }

  btnActualizar.disabled = false;
  return { servidores, stats, info };
}

async function enviarSolicitud() {
  btnSolicitar.disabled = true;
  btnSolicitar.textContent = "Enviando…";
  try {
    const data = await consultar("/solicitar");
    renderResultado(data);
    informar(`${data.servidor ?? "Servidor"} · puerto ${data.puerto ?? "—"}`, "ok");
    await actualizarPanel();
  } catch (error) {
    const texto = describirError("/solicitar", error);
    renderErrorSolicitud(texto);
    informar(texto, error.status === 503 ? "warn" : "error");
    if (error.conexion) {
      marcarApi(false);
    }
  } finally {
    btnSolicitar.disabled = false;
    btnSolicitar.textContent = "Enviar solicitud";
  }
}

btnActualizar.addEventListener("click", () => {
  actualizarPanel();
});

btnSolicitar.addEventListener("click", () => {
  enviarSolicitud();
});

actualizarPanel();
