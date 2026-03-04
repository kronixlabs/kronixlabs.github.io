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
  ENTREGA:          "DB_ENTREGA"
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
        return jsonOk(getProductos());

      case "GET_FORMULA":
        return jsonOk(getFormula(e.parameter.producto_id));

      case "GET_PROXIMO_LOTE":
        return jsonOk(getProximoLote());

      case "GET_MATERIAS_DECORADO":
        return jsonOk(getMateriasDecorado());

      case "GET_TEMP_HORNO":
        return jsonOk(getTempHorno(e.parameter.producto_id));

      case "GET_DESPACHOS":
        return jsonOk(getDespachos(parseInt(e.parameter.limit || "100", 10)));

      case "GET_ENTREGAS":
        return jsonOk(getEntregas(parseInt(e.parameter.limit || "100", 10)));

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
      const producto_id   = r[2];
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
      codigo:        r[0],
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

  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();

  return datos
    .filter(r => r[0] === producto_id)
    .map(r => ({
      ingrediente:    r[1],
      cantidad_base:  parseFloat(r[2]),
      unidad:         r[3]
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
  const fila  = datos.find(r => r[0] === producto_id && r[3] === true);

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
  const cantidad = Number(data.cantidad);

  if (!fecha || !producto || !id_lote || !Number.isFinite(cantidad) || cantidad <= 0) {
    return { status: "error", message: "Datos inválidos para despacho." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.DESPACHO);
  if (!sh) return { status: "error", message: "No existe la hoja DB_DESPACHO." };

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

  return { status: "ok", message: "Entrega registrada correctamente." };
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
  const fila  = datos.find(r => r[0] === codigo);

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
      map[r[0] + "_" + r[1]] = parseFloat(r[2]);
    }
  });

  return map;
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
