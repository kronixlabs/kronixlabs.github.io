// ============================================================
// LEVITO MES v10 — FASE 3: BACKEND / API
// Google Apps Script — Web App
// Desplegar como: Ejecutar como "Yo", Acceso "Cualquier usuario"
// ============================================================

// ============================================================
// CONSTANTES GLOBALES
// ============================================================

const SHEETS = {
  OPERARIOS:        "DB_OPERARIOS",
  PRODUCTOS:        "DB_PRODUCTOS",
  FORMULA:          "DB_FORMULA",
  LOTES_ACTIVOS:    "DB_LOTES_ACTIVOS",
  BITACORA:         "DB_BITACORA",
  TIEMPOS:          "DB_TIEMPOS_PROMEDIO",
  CONFIG_HORNO:     "DB_CONFIG_HORNO",
  MATERIAS_DECORADO:"DB_MATERIAS_DECORADO",
  CONSECUTIVO:      "DB_CONSECUTIVO",
  DESPACHO:         "DB_DESPACHO",
  ENTREGA:          "DB_ENTREGA",
  BITACORA_DETALLE: "DB_BITACORA_DETALLE",
  INVENTARIO:       "DB_INVENTARIO_PRODUCTO",
  MOV_INVENTARIO:   "DB_MOV_INVENTARIO",
  INVENTARIO_LOTE:  "DB_INVENTARIO_LOTE",
  CLIENTES:         "DB_CLIENTES",
  ALERTAS:          "DB_ALERTAS"
};

const ETAPAS = [
  "Mojado", "Porcionado", "Levado", "Decorado",
  "Horneado", "Enfriado", "Empaque", "Finalizado"
];

// ============================================================
// CORS — Necesario para que el frontend pueda consumir la API
// ============================================================

function setCORSHeaders(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonOk(data) {
  return setCORSHeaders(
    ContentService.createTextOutput(JSON.stringify(data))
  );
}

function jsonError(message) {
  return setCORSHeaders(
    ContentService.createTextOutput(JSON.stringify({ status: "error", message: message }))
  );
}

// ============================================================
// PUNTO DE ENTRADA — GET
// ============================================================

function doGet(e) {
  try {
    const action = e.parameter.action;

    switch (action) {
      case "GET_ALL_ACTIVOS":
        return jsonOk(getAllActivos());

      case "GET_PRODUCTOS":
        return jsonOk(getProductosCached_());

      case "GET_FORMULA":
        return jsonOk(getFormula(e.parameter.producto_id));

      case "GET_PROXIMO_LOTE":
        return jsonOk(getProximoLote());

      case "GET_MATERIAS_DECORADO":
        return jsonOk(getMateriasDecoradoCached_());

      case "GET_TEMP_HORNO":
        return jsonOk(getTempHorno(e.parameter.producto_id));

      case "GET_DESPACHOS":
        return jsonOk(getDespachos(parseInt(e.parameter.limit || "100", 10)));

      case "GET_ENTREGAS":
        return jsonOk(getEntregas(parseInt(e.parameter.limit || "100", 10)));

      case "GET_LOTE_ESTADO":
        return jsonOk(getLoteEstado(e.parameter.id_lote));

      case "GET_INVENTARIO":
        return jsonOk(getInventario());

      case "GET_TRAZABILIDAD":
        return jsonOk(getTrazabilidadFinalizados(parseInt(e.parameter.limit || "100", 10)));

      case "GET_CLIENTES":
        return jsonOk(getClientesCached_());

      case "GET_LOTES_STOCK":
        return jsonOk(getLotesConStock(e.parameter.producto_id));

      case "GET_BOOTSTRAP":
        return jsonOk(getBootstrapData());

      case "GET_SEGUIMIENTO_PRODUCCION":
        return jsonOk(getSeguimientoProduccion(parseInt(e.parameter.limit || "200", 10)));

      case "GET_LOTES_FINALIZADOS":
        return jsonOk(getLotesFinalizados(parseInt(e.parameter.limit || "500", 10), e.parameter.producto_id));

      case "GET_AUDITORIA_LOTE":
        return jsonOk(getAuditoriaLote(e.parameter.id_lote));

      case "GET_INVENTARIO_LOTE":
        return jsonOk(getInventarioLote(parseInt(e.parameter.limit || "1000", 10)));

      case "PING":
        return jsonOk({ status: "ok", timestamp: new Date().toISOString() });

      default:
        return jsonError("Acción GET no reconocida: " + action);
    }
  } catch (err) {
    Logger.log("ERROR doGet: " + err.message);
    return jsonError("Error interno: " + err.message);
  }
}

// ============================================================
// PUNTO DE ENTRADA — POST
// ============================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // Validar PIN en todas las acciones excepto PING
    let operario = null;
    if (action !== "PING") {
      operario = validarPin(data.pin);
      if (!operario) {
        return jsonError("PIN inválido. Acceso denegado.");
      }
    }

    switch (action) {
      case "INICIAR_LOTE":
        return jsonOk(iniciarLote(data, operario));

      case "AVANZAR_ETAPA":
        return jsonOk(avanzarEtapa(data, operario));

      case "SALTAR_ETAPA":
        return jsonOk(saltarEtapa(data, operario));

      case "REGISTRAR_DESPACHO":
        return jsonOk(registrarDespacho(data, operario));

      case "REGISTRAR_ENTREGA":
        return jsonOk(registrarEntrega(data, operario));

      case "PRE_GUARDAR_MOJADO":
        return jsonOk(preGuardarMojado(data, operario));

      case "PRE_GUARDAR_ETAPA":
        return jsonOk(preGuardarEtapa(data, operario));

      case "PASAR_ETAPA_DESDE_MODAL":
        return jsonOk(pasarEtapaDesdeModal(data, operario));

      default:
        return jsonError("Acción POST no reconocida: " + action);
    }
  } catch (err) {
    Logger.log("ERROR doPost: " + err.message);
    return jsonError("Error interno: " + err.message);
  }
}

// ============================================================
// GET — LOTES ACTIVOS CON ALERTAS
// Devuelve todos los lotes activos con estado de alerta
// ============================================================

function getAllActivos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.LOTES_ACTIVOS);

  if (!sh || sh.getLastRow() < 2) return [];

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  const tiemposMap = getTiemposPromedioMap();
  const now = new Date();

  return datos
    .filter(r => r[0] !== "" && r[4] !== "Finalizado")
    .map(r => {
      const slot          = parseInt(r[0]);
      const id_lote       = r[1];
      const producto_id   = normalizeProductId_(r[2]);
      const producto      = r[3];
      const etapa_actual  = r[4];
      const operario      = r[5];
      const hora_inicio   = r[6];
      const hora_etapa    = r[7];

      // Calcular tiempo en etapa actual
      let alerta = null;
      let mensaje_alerta = "";
      let tiempo_etapa = "—";

      if (hora_etapa) {
        const inicio = new Date(hora_etapa);
        const elapsed_min = Math.round((now - inicio) / 60000);

        // Formato legible
        if (elapsed_min >= 60) {
          const h = Math.floor(elapsed_min / 60);
          const m = elapsed_min % 60;
          tiempo_etapa = h + "h " + m + "min";
        } else {
          tiempo_etapa = elapsed_min + " min";
        }

        // Comparar con tiempo promedio (alerta)
        const clave = producto_id + "_" + etapa_actual;
        const promedio = tiemposMap[clave] || 0;

        if (promedio > 0) {
          if (elapsed_min > promedio * 1.5) {
            alerta = "danger";
            mensaje_alerta = "⚠️ Retraso de " + (elapsed_min - promedio) + " min en " + etapa_actual +
                             " (límite: " + promedio + " min)";
          } else if (elapsed_min > promedio * 1.2) {
            alerta = "warning";
            mensaje_alerta = "⏱️ Próximo al límite en " + etapa_actual +
                             " (" + elapsed_min + " / " + promedio + " min)";
          }
        }
      }

      // Calcular hora de inicio formateada
      const hora_inicio_str = hora_inicio
        ? Utilities.formatDate(new Date(hora_inicio), Session.getScriptTimeZone(), "dd/MM HH:mm")
        : "—";

      return {
        slot:           slot,
        id_lote:        id_lote,
        producto_id:    producto_id,
        producto:       producto,
        etapa_actual:   etapa_actual,
        operario:       operario,
        hora_inicio:    hora_inicio_str,
        tiempo_etapa:   tiempo_etapa,
        alerta:         alerta,
        mensaje_alerta: mensaje_alerta
      };
    });
}

// ============================================================
// GET — PRODUCTOS
// ============================================================

function getProductos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.PRODUCTOS);

  if (!sh || sh.getLastRow() < 2) return [];

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();

  return datos
    .filter(r => r[0] !== "" && r[5] === true)
    .map(r => ({
      codigo:        normalizeProductId_(r[0]),
      nombre:        r[1],
      empaque:       r[2],
      peso_neto:     r[3],
      unidades_caja: r[4]
    }));
}

// ============================================================
// GET — FÓRMULA POR PRODUCTO
// Devuelve ingredientes con cantidad ajustada a unidades
// ============================================================

function getFormula(producto_id) {
  if (!producto_id) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.FORMULA);

  if (!sh || sh.getLastRow() < 2) return [];

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();

  return datos
    .filter(r => normalizeProductId_(r[0]) === normalizeProductId_(producto_id))
    .map(r => ({
      ingrediente:    r[1],
      cantidad_base:  parseFloat(r[2]),
      unidad:         r[3],
      porcentaje_panadero: r[4] !== "" && r[4] !== null ? parseFloat(r[4]) : null
    }));
}

// ============================================================
// GET — PRÓXIMO NÚMERO DE LOTE (solo consulta, no incrementa)
// ============================================================

function getProximoLote() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.CONSECUTIVO);

  const ultimo = sh.getRange(2, 1).getValue() || 5225;
  const proximo = parseInt(ultimo) + 1;

  return {
    lote:   "L:" + String(proximo).padStart(6, "0"),
    numero: proximo
  };
}

// ============================================================
// GET — MATERIAS PRIMAS DE DECORADO
// ============================================================

function getMateriasDecorado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.MATERIAS_DECORADO);

  if (!sh || sh.getLastRow() < 2) return [];

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();

  return datos
    .filter(r => r[0] !== "" && r[1] === true)
    .map(r => ({ nombre: r[0] }));
}

// ============================================================
// GET — TEMPERATURA Y TIEMPO DE HORNO POR PRODUCTO
// ============================================================

function getTempHorno(producto_id) {
  if (!producto_id) return {};

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.CONFIG_HORNO);

  if (!sh || sh.getLastRow() < 2) return {};

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  const fila  = datos.find(r => normalizeProductId_(r[0]) === normalizeProductId_(producto_id) && r[3] === true);

  if (!fila) return {};

  return {
    temp_horno: fila[1],
    tiempo_min: fila[2]
  };
}

// ============================================================
// GET — DESPACHOS
// ============================================================

function getDespachos(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.DESPACHO);
  if (!sh || sh.getLastRow() < 2) return [];

  const maxRows = Math.max(1, Math.min(limit || 100, 500));
  const totalRows = sh.getLastRow() - 1;
  const rowsToRead = Math.min(maxRows, totalRows);
  const startRow = sh.getLastRow() - rowsToRead + 1;
  const datos = sh.getRange(startRow, 1, rowsToRead, 8).getValues();

  return datos.reverse().map(r => ({
    id_registro: r[0],
    fecha: r[1],
    producto: r[2],
    id_lote: r[3],
    cantidad: r[4],
    pin: r[5],
    operario: r[6],
    timestamp_registro: r[7]
  }));
}

// ============================================================
// GET — ENTREGAS
// ============================================================

function getEntregas(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.ENTREGA);
  if (!sh || sh.getLastRow() < 2) return [];

  const maxRows = Math.max(1, Math.min(limit || 100, 500));
  const totalRows = sh.getLastRow() - 1;
  const rowsToRead = Math.min(maxRows, totalRows);
  const startRow = sh.getLastRow() - rowsToRead + 1;
  const datos = sh.getRange(startRow, 1, rowsToRead, 9).getValues();

  return datos.reverse().map(r => ({
    id_registro: r[0],
    fecha: r[1],
    producto: r[2],
    id_lote: r[3],
    cliente: r[4],
    cantidad: r[5],
    pin: r[6],
    operario: r[7],
    timestamp_registro: r[8]
  }));
}

// ============================================================
// GET — INVENTARIO CONSOLIDADO
// ============================================================

function getInventario() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.INVENTARIO);
  if (!sh || sh.getLastRow() < 2) return [];

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  return datos
    .filter(r => r[0] !== "" && r[7] === true)
    .map(r => ({
      producto_id: r[0],
      producto_nombre: r[1],
      inventario_inicial: Number(r[2] || 0),
      producido_acum: Number(r[3] || 0),
      entregado_acum: Number(r[4] || 0),
      stock_actual: Number(r[5] || 0),
      ultima_actualizacion: r[6]
    }));
}

function getClientes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.CLIENTES);
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  return data.filter(r => r[0] !== "" && r[1] === true).map(r => ({ cliente: r[0] }));
}

function getLotesConStock(producto_id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.INVENTARIO_LOTE);
  if (!sh || sh.getLastRow() < 2) return [];
  const pid = normalizeProductId_(producto_id);
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  return data
    .filter(r => normalizeProductId_(r[1]) === pid && Number(r[7] || 0) > 0 && r[9] === true)
    .sort((a, b) => new Date(a[4]) - new Date(b[4]))
    .map(r => ({
      id_lote: r[3],
      fecha_produccion: r[4],
      stock_lote: Number(r[7] || 0)
    }));
}

function getBootstrapData() {
  return {
    productos: getProductosCached_(),
    materias_decorado: getMateriasDecoradoCached_(),
    clientes: getClientesCached_()
  };
}

function getProductosCached_() {
  return getCachedJson_("CAT_PRODUCTOS_V1", 180, function() {
    return getProductos();
  });
}

function getMateriasDecoradoCached_() {
  return getCachedJson_("CAT_MATERIAS_DECORADO_V1", 180, function() {
    return getMateriasDecorado();
  });
}

function getClientesCached_() {
  return getCachedJson_("CAT_CLIENTES_V1", 180, function() {
    return getClientes();
  });
}

function getCachedJson_(key, ttlSeconds, buildFn) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {
      // continue to rebuild
    }
  }
  const value = buildFn();
  cache.put(key, JSON.stringify(value), ttlSeconds);
  return value;
}

function getInventarioLote(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.INVENTARIO_LOTE);
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  return data
    .filter(r => r[9] === true)
    .sort((a, b) => new Date(a[4]) - new Date(b[4]))
    .slice(0, Math.max(1, Math.min(limit || 1000, 3000)))
    .map(r => ({
      producto_id: r[1],
      producto_nombre: r[2],
      id_lote: r[3],
      fecha_produccion: r[4],
      cantidad_inicial: Number(r[5] || 0),
      cantidad_salida: Number(r[6] || 0),
      stock_lote: Number(r[7] || 0),
      ultima_actualizacion: r[8]
    }));
}

// ============================================================
// GET — TRAZABILIDAD (solo lotes finalizados)
// ============================================================

function getTrazabilidadFinalizados(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.BITACORA);
  if (!sh || sh.getLastRow() < 2) return [];

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  const map = {};

  datos.forEach(r => {
    const id_lote = r[1];
    const slot = r[2];
    const etapa = String(r[3] || "");
    const operario = r[5];
    const ts = r[6];
    if (!id_lote) return;

    if (!map[id_lote]) {
      map[id_lote] = {
        id_lote: id_lote,
        slot: slot,
        hora_inicio: ts,
        hora_fin: ts,
        operario_ultimo: operario,
        etapas: []
      };
    }

    const item = map[id_lote];
    if (new Date(ts) < new Date(item.hora_inicio)) item.hora_inicio = ts;
    if (new Date(ts) > new Date(item.hora_fin)) {
      item.hora_fin = ts;
      item.operario_ultimo = operario;
    }
    if (item.etapas.indexOf(etapa) === -1) item.etapas.push(etapa);
  });

  const finalizados = Object.values(map)
    .filter(x => x.etapas.indexOf("Finalizado") !== -1)
    .sort((a, b) => new Date(b.hora_fin) - new Date(a.hora_fin))
    .slice(0, Math.max(1, Math.min(limit || 100, 500)))
    .map(x => ({
      id_lote: x.id_lote,
      slot: x.slot,
      hora_inicio: x.hora_inicio,
      hora_fin: x.hora_fin,
      operario_ultimo: x.operario_ultimo,
      etapas: x.etapas.join(" > ")
    }));

  return finalizados;
}

// ============================================================
// GET — ESTADO DETALLADO DE LOTE (MODO MODAL MULTI-DISPOSITIVO)
// ============================================================

function getLoteEstado(id_lote) {
  if (!id_lote) return { status: "error", message: "id_lote requerido." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shLotes = ss.getSheetByName(SHEETS.LOTES_ACTIVOS);
  if (!shLotes || shLotes.getLastRow() < 2) {
    return { status: "error", message: "No hay lotes activos." };
  }

  const { fila } = buscarLote(shLotes, id_lote);
  if (!fila) return { status: "error", message: "Lote no encontrado." };

  const detalle = getUltimoDetalleByLote_(ss, id_lote, fila[4]) || {};

  return {
    status: "ok",
    lote: {
      slot: fila[0],
      id_lote: fila[1],
      producto_id: fila[2],
      producto: fila[3],
      etapa_actual: fila[4],
      operario: fila[5],
      hora_inicio: fila[6],
      hora_etapa: fila[7]
    },
    detalle: detalle
  };
}

// ============================================================
// POST — INICIAR LOTE (Etapa: Mojado)
// ============================================================

function iniciarLote(data, operario) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Generar número de lote y actualizar consecutivo
  const shCons  = ss.getSheetByName(SHEETS.CONSECUTIVO);
  const ultimo  = parseInt(shCons.getRange(2, 1).getValue()) || 5225;
  const nuevoNum = ultimo + 1;
  const id_lote  = "L:" + String(nuevoNum).padStart(6, "0");

  shCons.getRange(2, 1).setValue(nuevoNum);
  shCons.getRange(2, 2).setValue(new Date());

  // 2. Obtener info del producto
  const producto = getProductoPorId(ss, data.producto_id);
  const nombre_producto = producto ? producto.nombre : data.producto_id;

  // 3. Verificar que el slot esté libre
  const shLotes = ss.getSheetByName(SHEETS.LOTES_ACTIVOS);
  const filas   = shLotes.getLastRow() > 1
    ? shLotes.getRange(2, 1, shLotes.getLastRow() - 1, 2).getValues()
    : [];

  const slotOcupado = filas.find(r => parseInt(r[0]) === parseInt(data.slot));
  if (slotOcupado) {
    return { status: "error", message: "El slot " + data.slot + " ya tiene un lote activo: " + slotOcupado[1] };
  }

  // 4. Registrar lote en DB_LOTES_ACTIVOS
  const now = new Date().toISOString();

  const datosJson = JSON.stringify({
    cantidad:        data.cantidad,
    temp_amb:        data.temp_amb,
    hum_amb:         data.hum_amb,
    materias_primas: data.materias_primas || [],
    obs:             data.obs || ""
  });

  shLotes.appendRow([
    data.slot,        // col 1: slot
    id_lote,          // col 2: id_lote
    data.producto_id, // col 3: producto_id
    nombre_producto,  // col 4: producto_nombre
    "Mojado",         // col 5: etapa_actual
    operario.nombre,  // col 6: operario
    now,              // col 7: hora_inicio
    now,              // col 8: hora_etapa (inicio de Mojado)
    datosJson,        // col 9: datos_json
    ""                // col 10: etapas_saltadas
  ]);

  // 5. Registrar en Bitácora
  registrarBitacora(ss, id_lote, data.slot, "Mojado", data.pin, operario.nombre, now, datosJson);

  Logger.log("LOTE INICIADO: " + id_lote + " | Producto: " + nombre_producto + " | Slot: " + data.slot);

  return {
    status:  "ok",
    id_lote: id_lote,
    message: "Lote " + id_lote + " iniciado correctamente en Slot " + data.slot
  };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// POST — AVANZAR ETAPA
// Se llama cuando se completan los datos de una etapa y
// el lote pasa a la siguiente
// ============================================================

function avanzarEtapa(data, operario) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const shLotes = ss.getSheetByName(SHEETS.LOTES_ACTIVOS);

  // Buscar la fila del lote
  const { fila, rowIdx } = buscarLote(shLotes, data.id_lote);
  if (!fila) {
    return { status: "error", message: "Lote " + data.id_lote + " no encontrado en lotes activos." };
  }

  const etapa_registrada = data.etapa;  // Etapa que se está completando
  const next_idx         = ETAPAS.indexOf(etapa_registrada) + 1;
  const etapa_siguiente  = ETAPAS[next_idx] || "Finalizado";

  const now      = new Date().toISOString();
  const datosStr = JSON.stringify(buildDatosEtapa(data));

  // Registrar en Bitácora
  registrarBitacora(ss, data.id_lote, data.slot, etapa_registrada, data.pin, operario.nombre, now, datosStr);

  if (etapa_siguiente === "Finalizado") {
    const cantidadProducida = getCantidadProducidaFinal_(data, fila);
    actualizarInventarioProduccion_(
      ss,
      normalizeProductId_(fila[2]),
      fila[3],
      cantidadProducida,
      data.id_lote,
      operario.nombre
    );

    // --- FINALIZAR LOTE ---
    // Registrar evento Finalizado
    registrarBitacora(ss, data.id_lote, data.slot, "Finalizado", data.pin, operario.nombre, now, "{}");
    // Eliminar de lotes activos
    shLotes.deleteRow(rowIdx);
    Logger.log("LOTE FINALIZADO: " + data.id_lote);
    return {
      status:  "ok",
      message: "✅ Lote " + data.id_lote + " finalizado exitosamente.",
      finalizado: true
    };
  } else {
    // --- AVANZAR A SIGUIENTE ETAPA ---
    shLotes.getRange(rowIdx, 5).setValue(etapa_siguiente);  // etapa_actual
    shLotes.getRange(rowIdx, 6).setValue(operario.nombre);  // operario actualizado
    shLotes.getRange(rowIdx, 8).setValue(now);              // hora_etapa (inicio nueva etapa)

    Logger.log("ETAPA AVANZADA: " + data.id_lote + " | " + etapa_registrada + " → " + etapa_siguiente);

    return {
      status:          "ok",
      etapa_anterior:  etapa_registrada,
      etapa_siguiente: etapa_siguiente,
      message:         etapa_registrada + " registrado. Siguiente: " + etapa_siguiente
    };
  }
}

// ============================================================
// POST — SALTAR ETAPA (solo aplica para Decorado)
// ============================================================

function saltarEtapa(data, operario) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const shLotes = ss.getSheetByName(SHEETS.LOTES_ACTIVOS);

  const { fila, rowIdx } = buscarLote(shLotes, data.id_lote);
  if (!fila) {
    return { status: "error", message: "Lote " + data.id_lote + " no encontrado." };
  }

  const etapa_saltada   = data.etapa;
  const next_idx        = ETAPAS.indexOf(etapa_saltada) + 1;
  const etapa_siguiente = ETAPAS[next_idx] || "Finalizado";
  const now             = new Date().toISOString();

  // Registrar en bitácora como SALTADO
  registrarBitacora(
    ss, data.id_lote, data.slot,
    etapa_saltada + " (OMITIDA)",
    data.pin, operario.nombre, now,
    JSON.stringify({ saltado: true, motivo: data.motivo || "No aplica para este lote" })
  );

  // Actualizar etapa actual en lotes activos
  shLotes.getRange(rowIdx, 5).setValue(etapa_siguiente);  // etapa_actual
  shLotes.getRange(rowIdx, 8).setValue(now);              // hora_etapa

  // Marcar en etapas_saltadas (col 10)
  const saltadas = fila[9] ? fila[9] + "," + etapa_saltada : etapa_saltada;
  shLotes.getRange(rowIdx, 10).setValue(saltadas);

  Logger.log("ETAPA SALTADA: " + data.id_lote + " | " + etapa_saltada + " → " + etapa_siguiente);

  return {
    status:          "ok",
    etapa_omitida:   etapa_saltada,
    etapa_siguiente: etapa_siguiente,
    message:         etapa_saltada + " omitida. Continuando con: " + etapa_siguiente
  };
}

// ============================================================
// POST — REGISTRAR DESPACHO
// ============================================================

function registrarDespacho(data, operario) {
  const fecha = String(data.fecha || "").trim();
  const producto = String(data.producto || "").trim();
  const id_lote = String(data.id_lote || "").trim();
  const producto_id = String(data.producto_id || "").trim();
  const cantidad = Number(data.cantidad);

  if (!fecha || !producto || !id_lote || !Number.isFinite(cantidad) || cantidad <= 0) {
    return { status: "error", message: "Datos inválidos para despacho." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.DESPACHO);
  if (!sh) return { status: "error", message: "No existe la hoja DB_DESPACHO." };

  const stockResult = actualizarInventarioSalida_(
    ss,
    normalizeProductId_(producto_id || producto),
    producto,
    id_lote,
    cantidad,
    operario.nombre,
    "DESPACHO"
  );
  if (stockResult.status === "error") return stockResult;

  const now = new Date().toISOString();
  sh.appendRow([
    Utilities.getUuid(),
    fecha,
    producto,
    id_lote,
    cantidad,
    data.pin,
    operario.nombre,
    now
  ]);

  return { status: "ok", message: "Despacho registrado correctamente." };
}

// ============================================================
// POST — REGISTRAR ENTREGA
// ============================================================

function registrarEntrega(data, operario) {
  const fecha = String(data.fecha || "").trim();
  const producto = String(data.producto || "").trim();
  const id_lote = String(data.id_lote || "").trim();
  const cliente = String(data.cliente || "").trim();
  const cantidad = Number(data.cantidad);

  if (!fecha || !producto || !id_lote || !cliente || !Number.isFinite(cantidad) || cantidad <= 0) {
    return { status: "error", message: "Datos inválidos para entrega." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.ENTREGA);
  if (!sh) return { status: "error", message: "No existe la hoja DB_ENTREGA." };

  const stockResult = actualizarInventarioSalida_(
    ss,
    normalizeProductId_(data.producto_id || producto),
    producto,
    id_lote,
    cantidad,
    operario.nombre,
    "ENTREGA"
  );
  if (stockResult.status === "error") return stockResult;

  const now = new Date().toISOString();
  sh.appendRow([
    Utilities.getUuid(),
    fecha,
    producto,
    id_lote,
    cliente,
    cantidad,
    data.pin,
    operario.nombre,
    now
  ]);

  return {
    status: "ok",
    message: "Entrega registrada correctamente.",
    stock_actual: stockResult.stock_actual
  };
}

// ============================================================
// POST — PRE-GUARDAR MOJADO (sin avanzar etapa)
// Guarda JSON detalle en columna I y total_gramos_masa en J
// ============================================================

function preGuardarMojado(data, operario) {
  if (!data.id_lote || !data.pin) {
    return { status: "error", message: "id_lote y PIN requeridos." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shLotes = ss.getSheetByName(SHEETS.LOTES_ACTIVOS);
  const { fila } = buscarLote(shLotes, data.id_lote);
  if (!fila) return { status: "error", message: "Lote no encontrado." };

  if (fila[4] !== "Mojado") {
    return { status: "error", message: "Pre-guardado solo permitido en Mojado." };
  }

  const detalle = buildDetallePayload_(data);
  const total = Number(data.total_gramos_masa || 0);
  saveBitacoraDetalle_(ss, {
    id_lote: data.id_lote,
    slot: data.slot || fila[0],
    etapa: "Mojado",
    producto_id: data.producto_id || fila[2],
    pin: data.pin,
    operario: operario.nombre,
    detalle: detalle,
    total_gramos_masa: total
  });

  return { status: "ok", message: "Datos pre-guardados.", total_gramos_masa: total };
}

function preGuardarEtapa(data, operario) {
  if (!data.id_lote || !data.pin) return { status: "error", message: "id_lote y PIN requeridos." };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shLotes = ss.getSheetByName(SHEETS.LOTES_ACTIVOS);
  const { fila } = buscarLote(shLotes, data.id_lote);
  if (!fila) return { status: "error", message: "Lote no encontrado." };

  const etapa = String(data.etapa || fila[4] || "");
  const detalle = Object.assign(buildDetallePayload_(data), buildDatosEtapa(data));
  const total = Number(data.total_gramos_masa || 0);
  saveBitacoraDetalle_(ss, {
    id_lote: data.id_lote,
    slot: data.slot || fila[0],
    etapa: etapa,
    producto_id: data.producto_id || fila[2],
    pin: data.pin,
    operario: operario.nombre,
    detalle: detalle,
    total_gramos_masa: total
  });
  return { status: "ok", message: "Pre-guardado de " + etapa + " realizado." };
}

// ============================================================
// POST — PASAR ETAPA DESDE MODAL
// Si etapa actual es Mojado, primero persiste detalle y total
// ============================================================

function pasarEtapaDesdeModal(data, operario) {
  if (!data.id_lote || !data.etapa || !data.slot) {
    return { status: "error", message: "Datos incompletos para avanzar etapa." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shLotes = ss.getSheetByName(SHEETS.LOTES_ACTIVOS);
  const { fila } = buscarLote(shLotes, data.id_lote);
  if (!fila) return { status: "error", message: "Lote no encontrado." };

  if (data.etapa === "Mojado") {
    const detalle = buildDetallePayload_(data);
    const total = Number(data.total_gramos_masa || 0);
    saveBitacoraDetalle_(ss, {
      id_lote: data.id_lote,
      slot: data.slot || fila[0],
      etapa: "Mojado",
      producto_id: data.producto_id || fila[2],
      pin: data.pin,
      operario: operario.nombre,
      detalle: detalle,
      total_gramos_masa: total
    });
  }

  return avanzarEtapa(data, operario);
}

// ============================================================
// HELPERS INTERNOS
// ============================================================

/**
 * Valida el PIN contra DB_OPERARIOS
 * Retorna { id, nombre, rol } o null si no existe
 */
function validarPin(pin) {
  if (!pin) return null;

  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const sh   = ss.getSheetByName(SHEETS.OPERARIOS);

  if (!sh || sh.getLastRow() < 2) return null;

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  const fila  = datos.find(r => String(r[2]).trim() === String(pin).trim() && r[4] === true);

  if (!fila) return null;

  return { id: fila[0], nombre: fila[1], rol: fila[3] };
}

/**
 * Busca un lote por id_lote en DB_LOTES_ACTIVOS
 * Retorna { fila: [], rowIdx: number } o { fila: null, rowIdx: -1 }
 */
function buscarLote(shLotes, id_lote) {
  if (shLotes.getLastRow() < 2) return { fila: null, rowIdx: -1 };

  const datos = shLotes.getRange(2, 1, shLotes.getLastRow() - 1, 10).getValues();

  for (let i = 0; i < datos.length; i++) {
    if (datos[i][1] === id_lote) {
      return { fila: datos[i], rowIdx: i + 2 }; // +2 porque fila 1 es header
    }
  }
  return { fila: null, rowIdx: -1 };
}

/**
 * Obtiene info de un producto por su código
 */
function getProductoPorId(ss, codigo) {
  const sh = ss.getSheetByName(SHEETS.PRODUCTOS);
  if (!sh || sh.getLastRow() < 2) return null;

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  const fila  = datos.find(r => normalizeProductId_(r[0]) === normalizeProductId_(codigo));

  if (!fila) return null;

  return {
    codigo:        fila[0],
    nombre:        fila[1],
    empaque:       fila[2],
    peso_neto:     fila[3],
    unidades_caja: fila[4]
  };
}

/**
 * Construye el mapa de tiempos promedio para cálculo de alertas
 * Clave: "producto_id_etapa" → minutos
 */
function getTiemposPromedioMap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.TIEMPOS);

  if (!sh || sh.getLastRow() < 2) return {};

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  const map   = {};

  datos.forEach(r => {
    if (r[0] && r[1] && r[3] === true) {
      map[normalizeProductId_(r[0]) + "_" + r[1]] = parseFloat(r[2]);
    }
  });

  return map;
}

function ensureBitacoraDetalleSheet_(ss) {
  let sh = ss.getSheetByName(SHEETS.BITACORA_DETALLE);
  if (!sh) {
    sh = ss.insertSheet(SHEETS.BITACORA_DETALLE);
    sh.appendRow([
      "id_detalle", "id_lote", "slot", "etapa", "producto_id",
      "timestamp_registro", "pin", "operario", "detalle_json", "total_gramos_masa"
    ]);
  }
  return sh;
}

function saveBitacoraDetalle_(ss, payload) {
  const sh = ensureBitacoraDetalleSheet_(ss);
  sh.appendRow([
    Utilities.getUuid(),
    payload.id_lote,
    payload.slot,
    payload.etapa,
    payload.producto_id,
    new Date().toISOString(),
    payload.pin,
    payload.operario,
    JSON.stringify(payload.detalle || {}),  // Columna I
    Number(payload.total_gramos_masa || 0) // Columna J
  ]);
}

function getUltimoDetalleByLote_(ss, id_lote, etapa) {
  const sh = ss.getSheetByName(SHEETS.BITACORA_DETALLE);
  if (!sh || sh.getLastRow() < 2) return null;

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  for (let i = datos.length - 1; i >= 0; i--) {
    const row = datos[i];
    if (row[1] === id_lote && (!etapa || row[3] === etapa)) {
      let detalle = {};
      try {
        detalle = row[8] ? JSON.parse(row[8]) : {};
      } catch (e) {
        detalle = {};
      }
      detalle.total_gramos_masa = Number(row[9] || 0);
      return detalle;
    }
  }
  return null;
}

function buildDetallePayload_(data) {
  return {
    cantidad: Number(data.cantidad || 0),
    rows: Array.isArray(data.rows) ? data.rows : []
  };
}

function getCantidadProducidaFinal_(data, filaLote) {
  if (Number(data.unid_finales || 0) > 0) return Number(data.unid_finales);
  if (Number(data.cantidad || 0) > 0) return Number(data.cantidad);

  try {
    const base = filaLote && filaLote[8] ? JSON.parse(filaLote[8]) : {};
    if (Number(base.unid_finales || 0) > 0) return Number(base.unid_finales);
    if (Number(base.cantidad || 0) > 0) return Number(base.cantidad);
  } catch (e) {
    // no-op
  }
  return 0;
}

function ensureInventarioRow_(ss, producto_id, producto_nombre) {
  const sh = ss.getSheetByName(SHEETS.INVENTARIO);
  if (!sh) throw new Error("No existe DB_INVENTARIO_PRODUCTO.");

  const pid = normalizeProductId_(producto_id);
  const last = sh.getLastRow();
  if (last < 2) {
    sh.appendRow([pid, producto_nombre || pid, 0, 0, 0, 0, new Date().toISOString(), true]);
    return { rowIdx: 2, stock_actual: 0 };
  }

  const rows = sh.getRange(2, 1, last - 1, 8).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (normalizeProductId_(rows[i][0]) === pid) {
      return { rowIdx: i + 2, stock_actual: Number(rows[i][5] || 0) };
    }
  }

  // Fallback: si no coincide por ID, intentar por nombre de producto.
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || "").trim().toUpperCase() === String(producto_nombre || "").trim().toUpperCase()) {
      return { rowIdx: i + 2, stock_actual: Number(rows[i][5] || 0) };
    }
  }

  sh.appendRow([pid, producto_nombre || pid, 0, 0, 0, 0, new Date().toISOString(), true]);
  return { rowIdx: sh.getLastRow(), stock_actual: 0 };
}

function registrarMovInventario_(ss, data) {
  const sh = ss.getSheetByName(SHEETS.MOV_INVENTARIO);
  if (!sh) return;
  sh.appendRow([
    Utilities.getUuid(),
    new Date().toISOString(),
    data.tipo_mov,
    data.producto_id,
    data.producto_nombre || data.producto_id,
    Number(data.cantidad || 0),
    data.id_lote || "",
    data.ref_modulo || "",
    data.operario || "",
    Number(data.stock_resultante || 0),
    data.obs || ""
  ]);
}

function registrarAlerta_(ss, modulo, tipo, mensaje, payload) {
  const sh = ss.getSheetByName(SHEETS.ALERTAS);
  if (!sh) return;
  sh.appendRow([
    Utilities.getUuid(),
    new Date().toISOString(),
    modulo,
    tipo,
    mensaje,
    JSON.stringify(payload || {}),
    false
  ]);
}

function ensureInventarioLoteRow_(ss, producto_id, producto_nombre, id_lote) {
  const sh = ss.getSheetByName(SHEETS.INVENTARIO_LOTE);
  if (!sh) throw new Error("No existe DB_INVENTARIO_LOTE.");
  const pid = normalizeProductId_(producto_id);
  const data = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues() : [];
  for (let i = 0; i < data.length; i++) {
    if (normalizeProductId_(data[i][1]) === pid && String(data[i][3]) === String(id_lote)) {
      return i + 2;
    }
  }
  sh.appendRow([
    Utilities.getUuid(),
    pid,
    producto_nombre || pid,
    id_lote,
    new Date().toISOString(),
    0, 0, 0,
    new Date().toISOString(),
    true
  ]);
  return sh.getLastRow();
}

function actualizarInventarioProduccion_(ss, producto_id, producto_nombre, cantidad, id_lote, operario) {
  const qty = Number(cantidad || 0);
  if (qty <= 0) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = ss.getSheetByName(SHEETS.INVENTARIO);
    const pos = ensureInventarioRow_(ss, producto_id, producto_nombre);
    const row = sh.getRange(pos.rowIdx, 1, 1, 8).getValues()[0];

    const inventarioInicial = Number(row[2] || 0);
    const producidoAcum = Number(row[3] || 0) + qty;
    const entregadoAcum = Number(row[4] || 0);
    const stockActual = inventarioInicial + producidoAcum - entregadoAcum;

    sh.getRange(pos.rowIdx, 3, 1, 5).setValues([[
      inventarioInicial,
      producidoAcum,
      entregadoAcum,
      stockActual,
      new Date().toISOString()
    ]]);

    registrarMovInventario_(ss, {
      tipo_mov: "PRODUCCION",
      producto_id: normalizeProductId_(producto_id),
      producto_nombre: producto_nombre,
      cantidad: qty,
      id_lote: id_lote,
      ref_modulo: "PRODUCCION",
      operario: operario,
      stock_resultante: stockActual,
      obs: "Ingreso por finalizacion de lote"
    });

    const shLote = ss.getSheetByName(SHEETS.INVENTARIO_LOTE);
    const rowL = ensureInventarioLoteRow_(ss, producto_id, producto_nombre, id_lote);
    const currL = shLote.getRange(rowL, 1, 1, 10).getValues()[0];
    const iniL = Number(currL[5] || 0) + qty;
    const salL = Number(currL[6] || 0);
    const stkL = iniL - salL;
    shLote.getRange(rowL, 5, 1, 5).setValues([[
      currL[4] || new Date().toISOString(),
      iniL,
      salL,
      stkL,
      new Date().toISOString()
    ]]);
  } finally {
    lock.releaseLock();
  }
}

function actualizarInventarioSalida_(ss, producto_id, producto_nombre, id_lote, cantidad, operario, modulo) {
  const qty = Number(cantidad || 0);
  if (qty <= 0) return { status: "error", message: "Cantidad inválida." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const shInv = ss.getSheetByName(SHEETS.INVENTARIO);
    const shLot = ss.getSheetByName(SHEETS.INVENTARIO_LOTE);
    const pos = ensureInventarioRow_(ss, producto_id, producto_nombre);
    const row = shInv.getRange(pos.rowIdx, 1, 1, 8).getValues()[0];
    const stockActual = Number(row[5] || 0);
    if (qty > stockActual) {
      registrarAlerta_(ss, modulo, "STOCK_INSUFICIENTE", "Intento de salida sin existencia", { producto_id, id_lote, qty, stockActual });
      return { status: "error", message: "Stock insuficiente. Disponible: " + stockActual + ", solicitado: " + qty };
    }

    const rowL = ensureInventarioLoteRow_(ss, producto_id, producto_nombre, id_lote);
    const lot = shLot.getRange(rowL, 1, 1, 10).getValues()[0];
    const lotStock = Number(lot[7] || 0);
    if (qty > lotStock) {
      const desfase = qty - lotStock;
      registrarAlerta_(ss, modulo, "DESFASE_LOTE", "Salida mayor al stock del lote", { producto_id, id_lote, qty, lotStock, desfase });
      return { status: "error", message: "Desfase en lote. Disponible en lote: " + lotStock + ", solicitado: " + qty + ", desfase: +" + desfase };
    }

    const inventarioInicial = Number(row[2] || 0);
    const producidoAcum = Number(row[3] || 0);
    const entregadoAcum = Number(row[4] || 0) + qty;
    const nuevoStock = inventarioInicial + producidoAcum - entregadoAcum;
    shInv.getRange(pos.rowIdx, 3, 1, 5).setValues([[inventarioInicial, producidoAcum, entregadoAcum, nuevoStock, new Date().toISOString()]]);

    const iniL = Number(lot[5] || 0);
    const salL = Number(lot[6] || 0) + qty;
    const stkL = iniL - salL;
    shLot.getRange(rowL, 6, 1, 4).setValues([[iniL, salL, stkL, new Date().toISOString()]]);

    registrarMovInventario_(ss, {
      tipo_mov: modulo,
      producto_id: normalizeProductId_(producto_id),
      producto_nombre: producto_nombre,
      cantidad: qty,
      id_lote: id_lote,
      ref_modulo: modulo,
      operario: operario,
      stock_resultante: nuevoStock,
      obs: "Salida por " + modulo
    });

    return { status: "ok", stock_actual: nuevoStock, stock_lote: stkL };
  } finally {
    lock.releaseLock();
  }
}

function actualizarInventarioEntrega_(ss, producto_id, producto_nombre, cantidad, id_lote, operario) {
  const qty = Number(cantidad || 0);
  if (qty <= 0) return { status: "error", message: "Cantidad de entrega invalida." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = ss.getSheetByName(SHEETS.INVENTARIO);
    const pos = ensureInventarioRow_(ss, producto_id, producto_nombre);
    const row = sh.getRange(pos.rowIdx, 1, 1, 8).getValues()[0];

    const inventarioInicial = Number(row[2] || 0);
    const producidoAcum = Number(row[3] || 0);
    const entregadoAcum = Number(row[4] || 0);
    const stockActual = Number(row[5] || 0);

    if (qty > stockActual) {
      return {
        status: "error",
        message: "Stock insuficiente. Disponible: " + stockActual + ", solicitado: " + qty
      };
    }

    const nuevoEntregado = entregadoAcum + qty;
    const nuevoStock = inventarioInicial + producidoAcum - nuevoEntregado;

    sh.getRange(pos.rowIdx, 3, 1, 5).setValues([[
      inventarioInicial,
      producidoAcum,
      nuevoEntregado,
      nuevoStock,
      new Date().toISOString()
    ]]);

    registrarMovInventario_(ss, {
      tipo_mov: "ENTREGA",
      producto_id: normalizeProductId_(producto_id),
      producto_nombre: producto_nombre,
      cantidad: qty,
      id_lote: id_lote,
      ref_modulo: "ENTREGA",
      operario: operario,
      stock_resultante: nuevoStock,
      obs: "Salida por entrega"
    });

    return { status: "ok", stock_actual: nuevoStock };
  } finally {
    lock.releaseLock();
  }
}

function normalizeProductId_(value) {
  if (value === null || value === undefined) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    const year = Utilities.formatDate(value, "UTC", "yyyy");
    const month = String(value.getUTCMonth() + 1);
    return year + "-" + month;
  }
  const str = String(value).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    return isoMatch[1] + "-" + String(parseInt(isoMatch[2], 10));
  }
  return str;
}

/**
 * Escribe un registro en DB_BITACORA
 */
function registrarBitacora(ss, id_lote, slot, etapa, pin, operario, timestamp, datos_json) {
  const sh = ss.getSheetByName(SHEETS.BITACORA);

  sh.appendRow([
    Utilities.getUuid(),  // id_registro único
    id_lote,
    slot,
    etapa,
    pin,
    operario,
    timestamp,
    datos_json
  ]);
}

/**
 * Extrae del payload de POST solo los campos de datos de la etapa
 * para guardar en la bitácora (excluye acción, PIN, etc.)
 */
function buildDatosEtapa(data) {
  const CAMPOS_DATOS = [
    // Generales
    "cantidad", "temp_amb", "hum_amb", "obs",
    // Porcionado
    "peso_unidad", "num_porciones", "num_latas", "unid_por_lata",
    // Levado
    "camara", "temp_camara", "hum_camara",
    // Decorado
    "materias_decorado",
    // Horneado
    "unid_horno", "temp_horno", "tiempo_horno", "temp_interna",
    // Empaque
    "unid_finales", "unid_nc", "lote_empaque",
    // Mojado
    "materias_primas"
  ];

  const result = {};
  CAMPOS_DATOS.forEach(campo => {
    if (data[campo] !== undefined && data[campo] !== "") {
      result[campo] = data[campo];
    }
  });

  return result;
}

function getMapProductoPorLote_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.MOV_INVENTARIO);
  if (!sh || sh.getLastRow() < 2) return {};
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  const map = {};
  data.forEach(r => {
    const tipo = String(r[2] || "");
    const lote = String(r[6] || "");
    if (!lote) return;
    if (tipo === "PRODUCCION" || !map[lote]) {
      map[lote] = { producto_id: r[3], producto_nombre: r[4] };
    }
  });
  return map;
}

function getLotesFinalizados(limit, producto_id) {
  const rows = getTrazabilidadFinalizados(limit);
  const pid = normalizeProductId_(producto_id || "");
  return rows.filter(r => !pid || normalizeProductId_(r.producto_id) === pid);
}

function getSeguimientoProduccion(limit) {
  const activos = getAllActivos().map(r => ({
    id_lote: r.id_lote,
    producto_id: r.producto_id,
    producto_nombre: r.producto,
    estado: "EN_PROCESO",
    etapa_actual: r.etapa_actual,
    hora_inicio: r.hora_inicio,
    hora_ref: r.hora_etapa || "",
    semaforo: buildSemaforo_(r.etapa_actual, false)
  }));

  const finalizados = getTrazabilidadFinalizados(limit)
    .slice(0, Math.max(1, Math.min(limit || 200, 500)))
    .map(r => ({
      id_lote: r.id_lote,
      producto_id: r.producto_id,
      producto_nombre: r.producto_nombre,
      estado: "FINALIZADO",
      etapa_actual: "Finalizado",
      hora_inicio: r.hora_inicio,
      hora_ref: r.hora_fin,
      semaforo: buildSemaforo_("Finalizado", true)
    }));

  return [...activos, ...finalizados]
    .sort((a, b) => new Date(b.hora_ref || b.hora_inicio) - new Date(a.hora_ref || a.hora_inicio));
}

function buildSemaforo_(etapaActual, finalizado) {
  if (finalizado) return "VERDE";
  return "ROJO:" + String(etapaActual || "N/A");
}

function getAuditoriaLote(id_lote) {
  if (!id_lote) return { status: "error", message: "id_lote requerido." };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shB = ss.getSheetByName(SHEETS.BITACORA);
  const shD = ss.getSheetByName(SHEETS.BITACORA_DETALLE);

  const bit = shB && shB.getLastRow() > 1
    ? shB.getRange(2, 1, shB.getLastRow() - 1, 8).getValues().filter(r => r[1] === id_lote)
    : [];
  const det = shD && shD.getLastRow() > 1
    ? shD.getRange(2, 1, shD.getLastRow() - 1, 10).getValues().filter(r => r[1] === id_lote)
    : [];

  const prodMap = getMapProductoPorLote_();
  const prod = prodMap[id_lote] || {};
  return {
    status: "ok",
    id_lote: id_lote,
    producto_id: prod.producto_id || "",
    producto_nombre: prod.producto_nombre || "",
    bitacora: bit.map(r => ({
      etapa: r[3],
      pin: r[4],
      operario: r[5],
      timestamp: r[6],
      datos_json: r[7]
    })),
    detalle: det.map(r => ({
      etapa: r[3],
      timestamp: r[5],
      operario: r[7],
      detalle_json: r[8],
      total_gramos_masa: r[9]
    }))
  };
}

// Version optimizada para tablero visual de seguimiento con horas por etapa.
function getSeguimientoProduccion(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shBit = ss.getSheetByName(SHEETS.BITACORA);
  const bit = shBit && shBit.getLastRow() > 1
    ? shBit.getRange(2, 1, shBit.getLastRow() - 1, 8).getValues()
    : [];

  const byLote = {};
  bit.forEach(r => {
    const id = String(r[1] || "");
    if (!id) return;
    if (!byLote[id]) byLote[id] = [];
    byLote[id].push({
      etapa: String(r[3] || ""),
      ts: new Date(r[6]),
      operario: String(r[5] || "")
    });
  });
  Object.keys(byLote).forEach(k => byLote[k].sort((a, b) => a.ts - b.ts));

  const activos = getAllActivos();
  const activosMap = {};
  activos.forEach(a => { activosMap[a.id_lote] = a; });

  const stageOrder = ["Mojado","Porcionado","Levado","Decorado","Horneado","Enfriado","Empaque","Finalizado"];

  const items = [];

  // Activos
  activos.forEach(a => {
    const events = byLote[a.id_lote] || [];
    const starts = {};
    starts["Mojado"] = a.hora_inicio || "";

    events.forEach(ev => {
      const idx = stageOrder.indexOf(ev.etapa);
      if (idx >= 0 && idx < stageOrder.length - 1) {
        const next = stageOrder[idx + 1];
        if (!starts[next]) starts[next] = ev.ts.toISOString();
      }
    });

    // Hora real de inicio de etapa actual tomada de lotes activos si existe.
    if (a.hora_etapa) starts[a.etapa_actual] = a.hora_etapa;

    const timeline = stageOrder.map(s => ({
      etapa: s,
      inicio: starts[s] || "",
      estado: s === a.etapa_actual ? "actual" : (stageOrder.indexOf(s) < stageOrder.indexOf(a.etapa_actual) ? "completada" : "pendiente")
    }));

    items.push({
      id_lote: a.id_lote,
      producto_id: a.producto_id,
      producto_nombre: a.producto,
      estado: "EN_PROCESO",
      etapa_actual: a.etapa_actual,
      hora_inicio: a.hora_inicio || "",
      hora_ref: a.hora_etapa || a.hora_inicio || "",
      timeline: timeline
    });
  });

  // Finalizados
  const fin = getTrazabilidadFinalizados(limit);
  fin.forEach(f => {
    const events = byLote[f.id_lote] || [];
    const starts = {};
    events.forEach(ev => {
      if (!starts[ev.etapa]) starts[ev.etapa] = ev.ts.toISOString();
    });
    const timeline = stageOrder.map(s => ({
      etapa: s,
      inicio: starts[s] || "",
      estado: "completada"
    }));
    items.push({
      id_lote: f.id_lote,
      producto_id: f.producto_id || "",
      producto_nombre: f.producto_nombre || "",
      estado: "FINALIZADO",
      etapa_actual: "Finalizado",
      hora_inicio: f.hora_inicio,
      hora_ref: f.hora_fin,
      timeline: timeline
    });
  });

  return items
    .sort((a, b) => new Date(b.hora_ref || b.hora_inicio) - new Date(a.hora_ref || a.hora_inicio))
    .slice(0, Math.max(1, Math.min(limit || 200, 500)));
}

// Sobrescribe trazabilidad con detalle de tiempos y operarios por etapa.
function getTrazabilidadFinalizados(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.BITACORA);
  if (!sh || sh.getLastRow() < 2) return [];

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  const map = {};
  datos.forEach(r => {
    const id = r[1];
    if (!id) return;
    const ts = new Date(r[6]);
    if (!map[id]) map[id] = { id_lote:id, slot:r[2], hora_inicio:ts, hora_fin:ts, etapas:[], operarios:{} };
    if (ts < map[id].hora_inicio) map[id].hora_inicio = ts;
    if (ts > map[id].hora_fin) map[id].hora_fin = ts;
    const etapa = String(r[3]||"");
    const operario = String(r[5]||"");
    if (map[id].etapas.indexOf(etapa) === -1) map[id].etapas.push(etapa);
    if (etapa) map[id].operarios[etapa] = operario;
  });

  const items = Object.values(map)
    .filter(x => x.etapas.indexOf("Finalizado") !== -1)
    .sort((a,b) => b.hora_fin - a.hora_fin)
    .slice(0, Math.max(1, Math.min(limit || 100, 500)));

  const prodMap = getMapProductoPorLote_();
  return items.map(x => {
    const eventos = datos
      .filter(r => r[1] === x.id_lote)
      .map(r => ({ etapa: String(r[3] || ""), ts: new Date(r[6]) }))
      .filter(e => !Number.isNaN(e.ts.getTime()))
      .sort((a,b) => a.ts - b.ts);

    let total = 0;
    const parts = [];
    for (let i = 0; i < eventos.length - 1; i++) {
      const min = Math.max(0, Math.round((eventos[i + 1].ts - eventos[i].ts) / 60000));
      total += min;
      parts.push(eventos[i].etapa + ": " + min + "m");
    }
    const opStr = Object.keys(x.operarios).map(k => k + ": " + x.operarios[k]).join(" | ");

    const prod = prodMap[x.id_lote] || {};
    return {
      id_lote: x.id_lote,
      producto_id: prod.producto_id || "",
      producto_nombre: prod.producto_nombre || "",
      slot: x.slot,
      hora_inicio: x.hora_inicio.toISOString(),
      hora_fin: x.hora_fin.toISOString(),
      operario_ultimo: x.operarios["Finalizado"] || "",
      etapas: x.etapas.join(" > "),
      duracion_total_min: total,
      duracion_por_etapa: parts.join(" | "),
      operarios_por_etapa: opStr
    };
  });
}

// ============================================================
// UTILIDAD: Probar el sistema desde el editor de Apps Script
// ============================================================

function testGetAllActivos() {
  const result = getAllActivos();
  Logger.log(JSON.stringify(result, null, 2));
}

function testGetProductos() {
  const result = getProductos();
  Logger.log(JSON.stringify(result, null, 2));
}

function testGetFormula() {
  const result = getFormula("0903-1");
  Logger.log(JSON.stringify(result, null, 2));
}

function testValidarPin() {
  const result = validarPin("1234");
  Logger.log(JSON.stringify(result));
}

function testGetTempHorno() {
  const result = getTempHorno("0903-1");
  Logger.log(JSON.stringify(result));
}

function testProximoLote() {
  const result = getProximoLote();
  Logger.log(JSON.stringify(result));
}
