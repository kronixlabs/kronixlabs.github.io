// ============================================================
// LEVITO MES v10 — FASE 2: CONFIGURACIÓN DE BASE DE DATOS
// Ejecutar UNA SOLA VEZ desde el editor de Apps Script
// Función principal: setupDatabase()
// ============================================================

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("Iniciando configuración de base de datos LEVITO MES...");
  prepararEstructuraExacta_(ss);

  crearHoja_Operarios(ss);
  crearHoja_Productos(ss);
  crearHoja_Formula(ss);
  crearHoja_LotesActivos(ss);
  crearHoja_Bitacora(ss);
  crearHoja_TiemposPromedio(ss);
  crearHoja_ConfigHorno(ss);
  crearHoja_MateriasDecorado(ss);
  crearHoja_Consecutivo(ss);
  crearHoja_Despacho(ss);
  crearHoja_Entrega(ss);
  crearHoja_InventarioProducto(ss);
  crearHoja_MovInventario(ss);
  crearHoja_InventarioLote(ss);
  crearHoja_Clientes(ss);
  crearHoja_Alertas(ss);
  crearHoja_LotesReciclables(ss);
  eliminarHojaTemporal_(ss);

  Logger.log("✅ Base de datos configurada correctamente.");
  SpreadsheetApp.getUi().alert("✅ Base de datos LEVITO MES configurada.\n\nSe crearon 17 hojas con datos de ejemplo.");
}

// ============================================================
// HELPERS
// ============================================================

function getOrCreateSheet(ss, nombre) {
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    Logger.log("Creada hoja: " + nombre);
  } else {
    sh.clearContents();
    Logger.log("Limpiada hoja existente: " + nombre);
  }
  return sh;
}

function formatHeader(sh, numCols) {
  const header = sh.getRange(1, 1, 1, numCols);
  header.setBackground("#1a1a2e");
  header.setFontColor("#38bdf8");
  header.setFontWeight("bold");
  header.setFontSize(10);
  sh.setFrozenRows(1);
}

// Deja solo las hojas DB del sistema y elimina pestañas antiguas/no usadas.
function prepararEstructuraExacta_(ss) {
  const hojasObjetivo = new Set([
    "DB_OPERARIOS",
    "DB_PRODUCTOS",
    "DB_FORMULA",
    "DB_LOTES_ACTIVOS",
    "DB_BITACORA",
    "DB_TIEMPOS_PROMEDIO",
    "DB_CONFIG_HORNO",
    "DB_MATERIAS_DECORADO",
    "DB_CONSECUTIVO",
    "DB_DESPACHO",
    "DB_ENTREGA",
    "DB_INVENTARIO_PRODUCTO",
    "DB_MOV_INVENTARIO",
    "DB_INVENTARIO_LOTE",
    "DB_CLIENTES",
    "DB_ALERTAS",
    "DB_LOTES_RECICLABLES",
    "DB_BITACORA_DETALLE"
  ]);

  const hojas = ss.getSheets();
  if (!hojas.length) return;

  // Si hay solo 1 hoja y no es objetivo, mantenerla temporalmente
  // hasta crear las DB y evitar error de "no se puede eliminar última hoja".
  let hojaTemporal = null;
  if (hojas.length === 1 && !hojasObjetivo.has(hojas[0].getName())) {
    hojaTemporal = hojas[0];
    hojaTemporal.setName("TMP_SETUP_LEVITO");
  }

  ss.getSheets().forEach(sh => {
    const nombre = sh.getName();
    if (!hojasObjetivo.has(nombre) && nombre !== "TMP_SETUP_LEVITO") {
      ss.deleteSheet(sh);
      Logger.log("Eliminada hoja legacy: " + nombre);
    }
  });
}

function eliminarHojaTemporal_(ss) {
  const tmp = ss.getSheetByName("TMP_SETUP_LEVITO");
  if (tmp && ss.getSheets().length > 1) {
    ss.deleteSheet(tmp);
    Logger.log("Eliminada hoja temporal de setup.");
  }
}

// ============================================================
// DB_OPERARIOS
// Columnas: id | nombre | pin | rol | activo
// ============================================================
function crearHoja_Operarios(ss) {
  const sh = getOrCreateSheet(ss, "DB_OPERARIOS");
  const headers = ["id", "nombre", "pin", "rol", "activo"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  // Datos de ejemplo
  const datos = [
    ["OP001", "Juan Pérez",    "1234", "Operario",   true],
    ["OP002", "María López",   "5678", "Operario",   true],
    ["OP003", "Carlos Ruiz",   "9012", "Supervisor", true],
    ["OP004", "Ana Gómez",     "3456", "Operario",   true],
    ["OP005", "Pedro Díaz",    "7890", "Operario",   true],
  ];
  datos.forEach(r => sh.appendRow(r));

  sh.setColumnWidth(1, 80);
  sh.setColumnWidth(2, 150);
  sh.setColumnWidth(3, 80);
  sh.setColumnWidth(4, 100);
  sh.setColumnWidth(5, 70);
  Logger.log("DB_OPERARIOS: " + datos.length + " operarios cargados.");
}

// ============================================================
// DB_PRODUCTOS
// Columnas: codigo | nombre | empaque | peso_neto | unidades_caja | activo
// ============================================================
function crearHoja_Productos(ss) {
  const sh = getOrCreateSheet(ss, "DB_PRODUCTOS");
  const headers = ["codigo", "nombre", "empaque", "peso_neto", "unidades_caja", "activo"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);
  sh.getRange("A:A").setNumberFormat("@");

  const datos = [
    ["0903-1", "BRIOCHE MINI",      "Bolsa 8x18 x 10 unidades", "350g",  10, true],
    ["0903-2", "BRIOCHE GRANDE",    "Bolsa 10x20 x 6 unidades",  "480g",  6,  true],
    ["0904-1", "PAN DE LECHE",      "Bolsa 8x18 x 8 unidades",   "280g",  8,  true],
    ["0905-1", "CROISSANT SIMPLE",  "Bolsa 8x18 x 6 unidades",   "240g",  6,  true],
    ["0906-1", "CROISSANT RELLENO", "Bolsa 10x18 x 4 unidades",  "320g",  4,  true],
    ["PAN-HB-1", "PAN HAMBURGUESA BRIOCHE", "Bolsa x 6 unidades", "420g", 6, true],
  ];
  datos.forEach(r => sh.appendRow(r));

  sh.setColumnWidth(1, 90);
  sh.setColumnWidth(2, 160);
  sh.setColumnWidth(3, 200);
  sh.setColumnWidth(4, 90);
  sh.setColumnWidth(5, 110);
  Logger.log("DB_PRODUCTOS: " + datos.length + " productos cargados.");
}

// ============================================================
// DB_FORMULA
// Columnas: producto_id | ingrediente | cantidad_base_g | unidad
// cantidad_base_g = gramos por UNIDAD producida
// ============================================================
function crearHoja_Formula(ss) {
  const sh = getOrCreateSheet(ss, "DB_FORMULA");
  const headers = ["producto_id", "ingrediente", "cantidad_base_g", "unidad", "porcentaje_panadero"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);
  sh.getRange("A:A").setNumberFormat("@");

  // BRIOCHE MINI (0903-1) — valores por unidad (10 unidades = 1 bolsa)
  const formula_0903_1 = [
    ["0903-1", "Harina de Trigo",   28.5,  "g"],
    ["0903-1", "Azúcar",            4.2,   "g"],
    ["0903-1", "Sal",               0.5,   "g"],
    ["0903-1", "Levadura Fresca",   1.1,   "g"],
    ["0903-1", "Mantequilla",       5.8,   "g"],
    ["0903-1", "Huevo",             6.3,   "g"],
    ["0903-1", "Leche",             8.5,   "g"],
    ["0903-1", "Esencia de Vainilla",0.2,  "g"],
  ];

  // BRIOCHE GRANDE (0903-2)
  const formula_0903_2 = [
    ["0903-2", "Harina de Trigo",   42.0,  "g"],
    ["0903-2", "Azúcar",            6.5,   "g"],
    ["0903-2", "Sal",               0.8,   "g"],
    ["0903-2", "Levadura Fresca",   1.6,   "g"],
    ["0903-2", "Mantequilla",       8.5,   "g"],
    ["0903-2", "Huevo",             9.2,   "g"],
    ["0903-2", "Leche",            12.0,   "g"],
    ["0903-2", "Esencia de Vainilla",0.3,  "g"],
  ];

  // PAN DE LECHE (0904-1)
  const formula_0904_1 = [
    ["0904-1", "Harina de Trigo",   25.0,  "g"],
    ["0904-1", "Azúcar",            3.5,   "g"],
    ["0904-1", "Sal",               0.4,   "g"],
    ["0904-1", "Levadura Fresca",   0.9,   "g"],
    ["0904-1", "Mantequilla",       3.2,   "g"],
    ["0904-1", "Leche en Polvo",    2.8,   "g"],
    ["0904-1", "Agua",              9.0,   "g"],
  ];

  // PAN HAMBURGUESA BRIOCHE (PAN-HB-1) — fórmula base por lote con % panadero
  const formula_pan_hamburguesa = [
    ["PAN-HB-1", "Harina",               17.52, "g", 100],
    ["PAN-HB-1", "Agua",                  9.29, "g", 53],
    ["PAN-HB-1", "Azúcar",                1.40, "g", 8],
    ["PAN-HB-1", "Grasa",                 1.05, "g", 6],
    ["PAN-HB-1", "Huevo",                 0.35, "g", 2],
    ["PAN-HB-1", "Leche en polvo",        0.35, "g", 2],
    ["PAN-HB-1", "Levadura",              0.35, "g", 2],
    ["PAN-HB-1", "Sal",                   0.35, "g", 2],
    ["PAN-HB-1", "Esencia mantequilla",   0.18, "g", 1],
    ["PAN-HB-1", "Propionato calcio",     0.09, "g", 0.5],
    ["PAN-HB-1", "Dimodan",               0.05, "g", 0.3],
    ["PAN-HB-1", "Ácido acético",         0.01, "g", 0.07],
    ["PAN-HB-1", "9740",                  0.003, "g", 0.02],
    ["PAN-HB-1", "7200",                  0.003, "g", 0.02],
    ["PAN-HB-1", "Color amarillo",        0.003, "g", 0.02],
  ];

  [...formula_0903_1, ...formula_0903_2, ...formula_0904_1, ...formula_pan_hamburguesa].forEach(r => sh.appendRow(r));

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 160);
  sh.setColumnWidth(3, 140);
  sh.setColumnWidth(4, 70);
  sh.setColumnWidth(5, 140);
  Logger.log("DB_FORMULA: fórmulas cargadas.");
}

// ============================================================
// DB_LOTES_ACTIVOS
// Lotes en producción actualmente (se inserta/elimina en tiempo real)
// Columnas: slot | id_lote | producto_id | producto_nombre |
//           etapa_actual | operario | hora_inicio | hora_etapa |
//           datos_json | etapas_saltadas
// ============================================================
function crearHoja_LotesActivos(ss) {
  const sh = getOrCreateSheet(ss, "DB_LOTES_ACTIVOS");
  const headers = [
    "slot", "id_lote", "producto_id", "producto_nombre",
    "etapa_actual", "operario", "hora_inicio", "hora_etapa",
    "datos_json", "etapas_saltadas"
  ];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  sh.setColumnWidth(1, 60);
  sh.setColumnWidth(2, 100);
  sh.setColumnWidth(3, 90);
  sh.setColumnWidth(4, 160);
  sh.setColumnWidth(5, 110);
  sh.setColumnWidth(6, 130);
  sh.setColumnWidth(7, 160);
  sh.setColumnWidth(8, 160);
  sh.setColumnWidth(9, 300);
  sh.setColumnWidth(10, 120);
  Logger.log("DB_LOTES_ACTIVOS: lista para registros.");
}

// ============================================================
// DB_BITACORA
// Registro histórico completo de todas las etapas completadas
// Columnas: id_registro | id_lote | slot | etapa | pin | operario |
//           timestamp_registro | datos_json
// ============================================================
function crearHoja_Bitacora(ss) {
  const sh = getOrCreateSheet(ss, "DB_BITACORA");
  const headers = [
    "id_registro", "id_lote", "slot", "etapa",
    "pin", "operario", "timestamp_registro", "datos_json"
  ];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 100);
  sh.setColumnWidth(3, 60);
  sh.setColumnWidth(4, 110);
  sh.setColumnWidth(5, 70);
  sh.setColumnWidth(6, 130);
  sh.setColumnWidth(7, 160);
  sh.setColumnWidth(8, 400);
  Logger.log("DB_BITACORA: lista para registros.");
}

// ============================================================
// DB_TIEMPOS_PROMEDIO
// Tiempo máximo esperado (minutos) por producto y etapa
// El sistema genera alerta si se supera este tiempo
// Columnas: producto_id | etapa | minutos_promedio | activo
// ============================================================
function crearHoja_TiemposPromedio(ss) {
  const sh = getOrCreateSheet(ss, "DB_TIEMPOS_PROMEDIO");
  const headers = ["producto_id", "etapa", "minutos_promedio", "activo"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  // Tiempos para BRIOCHE MINI (0903-1) en minutos
  const tiempos = [
    // producto_id    etapa          min   activo
    ["0903-1", "Mojado",     30,   true],
    ["0903-1", "Porcionado", 20,   true],
    ["0903-1", "Levado",     90,   true],
    ["0903-1", "Decorado",   15,   true],
    ["0903-1", "Horneado",   25,   true],
    ["0903-1", "Enfriado",   40,   true],
    ["0903-1", "Empaque",    20,   true],

    ["0903-2", "Mojado",     35,   true],
    ["0903-2", "Porcionado", 25,   true],
    ["0903-2", "Levado",     100,  true],
    ["0903-2", "Decorado",   15,   true],
    ["0903-2", "Horneado",   30,   true],
    ["0903-2", "Enfriado",   45,   true],
    ["0903-2", "Empaque",    20,   true],

    ["0904-1", "Mojado",     25,   true],
    ["0904-1", "Porcionado", 15,   true],
    ["0904-1", "Levado",     75,   true],
    ["0904-1", "Decorado",   10,   true],
    ["0904-1", "Horneado",   20,   true],
    ["0904-1", "Enfriado",   35,   true],
    ["0904-1", "Empaque",    15,   true],
  ];
  tiempos.forEach(r => sh.appendRow(r));

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 140);
  sh.setColumnWidth(4, 70);
  Logger.log("DB_TIEMPOS_PROMEDIO: " + tiempos.length + " registros cargados.");
}

// ============================================================
// DB_CONFIG_HORNO
// Temperatura de referencia del horno por producto
// Columnas: producto_id | temp_horno_c | tiempo_min | activo
// ============================================================
function crearHoja_ConfigHorno(ss) {
  const sh = getOrCreateSheet(ss, "DB_CONFIG_HORNO");
  const headers = ["producto_id", "temp_horno_c", "tiempo_min", "activo"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  const datos = [
    ["0903-1", 230, 22, true],   // BRIOCHE MINI
    ["0903-2", 225, 28, true],   // BRIOCHE GRANDE
    ["0904-1", 210, 18, true],   // PAN DE LECHE
    ["0905-1", 200, 20, true],   // CROISSANT SIMPLE
    ["0906-1", 200, 22, true],   // CROISSANT RELLENO
  ];
  datos.forEach(r => sh.appendRow(r));

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 100);
  sh.setColumnWidth(4, 70);
  Logger.log("DB_CONFIG_HORNO: temperaturas cargadas.");
}

// ============================================================
// DB_MATERIAS_DECORADO
// Lista de materias primas utilizadas en la etapa de Decorado
// Columnas: nombre | activo
// ============================================================
function crearHoja_MateriasDecorado(ss) {
  const sh = getOrCreateSheet(ss, "DB_MATERIAS_DECORADO");
  const headers = ["nombre", "activo"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  const datos = [
    ["Mezcla Brillo",      true],
    ["Ajonjolí",           true],
    ["Chía",               true],
    ["Huevo (baño)",       true],
    ["Azúcar Glas",        true],
    ["Sal en Escamas",     true],
    ["Orégano",            true],
    ["Queso Parmesano",    true],
  ];
  datos.forEach(r => sh.appendRow(r));

  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 70);
  Logger.log("DB_MATERIAS_DECORADO: " + datos.length + " materias cargadas.");
}

// ============================================================
// DB_CONSECUTIVO
// Contador para generación automática de números de lote
// Formato lote: L:XXXXXX (6 dígitos, ej: L:005226)
// Columnas: ultimo_numero | fecha_actualizacion
// ============================================================
function crearHoja_Consecutivo(ss) {
  const sh = getOrCreateSheet(ss, "DB_CONSECUTIVO");
  const headers = ["ultimo_numero", "fecha_actualizacion"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  // Iniciar en 5225 → próximo lote será L:005226
  sh.appendRow([5225, new Date()]);

  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 160);
  Logger.log("DB_CONSECUTIVO: iniciado en L:005226.");
}

// ============================================================
// DB_DESPACHO
// Registro de salida de producto terminado desde planta
// Columnas: id_registro | fecha | producto | id_lote | cantidad |
//           pin | operario | timestamp_registro
// ============================================================
function crearHoja_Despacho(ss) {
  const sh = getOrCreateSheet(ss, "DB_DESPACHO");
  const headers = [
    "id_registro", "fecha", "producto", "id_lote", "cantidad",
    "pin", "operario", "timestamp_registro"
  ];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 180);
  sh.setColumnWidth(4, 110);
  sh.setColumnWidth(5, 90);
  sh.setColumnWidth(6, 70);
  sh.setColumnWidth(7, 130);
  sh.setColumnWidth(8, 170);
  Logger.log("DB_DESPACHO: lista para registros.");
}

// ============================================================
// DB_ENTREGA
// Registro de entrega al cliente final
// Columnas: id_registro | fecha | producto | id_lote | cliente |
//           cantidad | pin | operario | timestamp_registro
// ============================================================
function crearHoja_Entrega(ss) {
  const sh = getOrCreateSheet(ss, "DB_ENTREGA");
  const headers = [
    "id_registro", "fecha", "producto", "id_lote", "cliente",
    "cantidad", "pin", "operario", "timestamp_registro"
  ];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);

  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 180);
  sh.setColumnWidth(4, 110);
  sh.setColumnWidth(5, 180);
  sh.setColumnWidth(6, 90);
  sh.setColumnWidth(7, 70);
  sh.setColumnWidth(8, 130);
  sh.setColumnWidth(9, 170);
  Logger.log("DB_ENTREGA: lista para registros.");
}

// ============================================================
// DB_INVENTARIO_PRODUCTO
// Inventario consolidado por producto
// stock_actual = inventario_inicial + producido_acum - entregado_acum
// ============================================================
function crearHoja_InventarioProducto(ss) {
  const sh = getOrCreateSheet(ss, "DB_INVENTARIO_PRODUCTO");
  const headers = [
    "producto_id", "producto_nombre", "inventario_inicial",
    "producido_acum", "entregado_acum", "stock_actual",
    "ultima_actualizacion", "activo"
  ];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);
  sh.getRange("A:A").setNumberFormat("@");

  const productosSh = ss.getSheetByName("DB_PRODUCTOS");
  if (productosSh && productosSh.getLastRow() > 1) {
    const rows = productosSh.getRange(2, 1, productosSh.getLastRow() - 1, 6).getValues();
    rows
      .filter(r => r[0] !== "" && r[5] === true)
      .forEach(r => {
        sh.appendRow([
          String(r[0]),
          r[1],
          0,
          0,
          0,
          0,
          new Date().toISOString(),
          true
        ]);
      });
  }

  sh.setColumnWidth(1, 120);
  sh.setColumnWidth(2, 220);
  sh.setColumnWidth(3, 130);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 120);
  sh.setColumnWidth(6, 110);
  sh.setColumnWidth(7, 180);
  sh.setColumnWidth(8, 70);
  Logger.log("DB_INVENTARIO_PRODUCTO: inicializado.");
}

// ============================================================
// DB_MOV_INVENTARIO
// Historial de movimientos de inventario
// ============================================================
function crearHoja_MovInventario(ss) {
  const sh = getOrCreateSheet(ss, "DB_MOV_INVENTARIO");
  const headers = [
    "id_mov", "timestamp", "tipo_mov", "producto_id", "producto_nombre",
    "cantidad", "id_lote", "ref_modulo", "operario", "stock_resultante", "obs"
  ];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);
  sh.getRange("D:D").setNumberFormat("@");

  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(3, 110);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 220);
  sh.setColumnWidth(6, 90);
  sh.setColumnWidth(7, 120);
  sh.setColumnWidth(8, 130);
  sh.setColumnWidth(9, 130);
  sh.setColumnWidth(10, 110);
  sh.setColumnWidth(11, 220);
  Logger.log("DB_MOV_INVENTARIO: inicializado.");
}

// ============================================================
// DB_INVENTARIO_LOTE
// Stock por lote para control FEFO y despacho/entrega
// ============================================================
function crearHoja_InventarioLote(ss) {
  const sh = getOrCreateSheet(ss, "DB_INVENTARIO_LOTE");
  const headers = [
    "id_registro", "producto_id", "producto_nombre", "id_lote",
    "fecha_produccion", "cantidad_inicial", "cantidad_salida", "stock_lote", "ultima_actualizacion", "activo"
  ];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);
  sh.getRange("B:B").setNumberFormat("@");
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 220);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 170);
  sh.setColumnWidth(6, 120);
  sh.setColumnWidth(7, 120);
  sh.setColumnWidth(8, 100);
  sh.setColumnWidth(9, 170);
  sh.setColumnWidth(10, 70);
  Logger.log("DB_INVENTARIO_LOTE: inicializado.");
}

// ============================================================
// DB_CLIENTES
// ============================================================
function crearHoja_Clientes(ss) {
  const sh = getOrCreateSheet(ss, "DB_CLIENTES");
  const headers = ["cliente", "activo"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);
  const datos = [
    ["Cliente A", true],
    ["Cliente B", true],
    ["Cliente C", true]
  ];
  datos.forEach(r => sh.appendRow(r));
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 70);
  Logger.log("DB_CLIENTES: inicializado.");
}

// ============================================================
// DB_ALERTAS
// ============================================================
function crearHoja_Alertas(ss) {
  const sh = getOrCreateSheet(ss, "DB_ALERTAS");
  const headers = ["id_alerta", "timestamp", "modulo", "tipo", "mensaje", "payload_json", "atendida"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 170);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 320);
  sh.setColumnWidth(6, 360);
  sh.setColumnWidth(7, 80);
  Logger.log("DB_ALERTAS: inicializado.");
}

// ============================================================
// DB_LOTES_RECICLABLES
// Lotes liberados manualmente para reuso prioritario
// ============================================================
function crearHoja_LotesReciclables(ss) {
  const sh = getOrCreateSheet(ss, "DB_LOTES_RECICLABLES");
  const headers = ["id_registro", "id_lote", "producto_id", "motivo", "fecha_liberacion", "estado", "fecha_reuso"];
  sh.appendRow(headers);
  formatHeader(sh, headers.length);
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 260);
  sh.setColumnWidth(5, 170);
  sh.setColumnWidth(6, 90);
  sh.setColumnWidth(7, 170);
  Logger.log("DB_LOTES_RECICLABLES: inicializado.");
}

// ============================================================
// FUNCIÓN AUXILIAR: Mostrar resumen de hojas creadas
// ============================================================
function verificarBaseDeDatos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = [
    "DB_OPERARIOS", "DB_PRODUCTOS", "DB_FORMULA",
    "DB_LOTES_ACTIVOS", "DB_BITACORA", "DB_TIEMPOS_PROMEDIO",
    "DB_CONFIG_HORNO", "DB_MATERIAS_DECORADO", "DB_CONSECUTIVO",
    "DB_DESPACHO", "DB_ENTREGA",
    "DB_INVENTARIO_PRODUCTO", "DB_MOV_INVENTARIO",
    "DB_INVENTARIO_LOTE", "DB_CLIENTES", "DB_ALERTAS", "DB_LOTES_RECICLABLES"
  ];

  let reporte = "VERIFICACIÓN DE BASE DE DATOS LEVITO MES\n";
  reporte += "==========================================\n\n";

  hojas.forEach(nombre => {
    const sh = ss.getSheetByName(nombre);
    if (sh) {
      const filas = Math.max(0, sh.getLastRow() - 1);
      reporte += `✅ ${nombre}: ${filas} registro(s)\n`;
    } else {
      reporte += `❌ ${nombre}: NO EXISTE\n`;
    }
  });

  Logger.log(reporte);
  SpreadsheetApp.getUi().alert(reporte);
}
