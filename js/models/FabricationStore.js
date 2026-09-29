/**
 * MODELO: Fabricación y Consumo en Base de Datos
 * Conexión relacional con mod_hr_empleados (RRHH) y mod_biz_items (Inventario)
 */

export class FabricationStore {
  constructor() {
    this.hasBridge = typeof window.KoraDB !== "undefined";
    this.KEY_ORDERS = "kora_fab_ordenes_v3";
    this.KEY_ROUTES = "kora_fab_rutas_v3";
    this.initDatabase();
  }

  initDatabase() {
    if (this.hasBridge) {
      try {
        const ddl = `
          CREATE TABLE IF NOT EXISTS mod_fab_rutas (
            id TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            material_terminado_id TEXT NOT NULL,
            tipo_flujo TEXT NOT NULL,
            etapas_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS mod_fab_ordenes (
            id TEXT PRIMARY KEY,
            codigo TEXT NOT NULL,
            ruta_id TEXT NOT NULL,
            material_terminado_id TEXT NOT NULL,
            cantidad REAL NOT NULL,
            estado TEXT NOT NULL,
            tipo_flujo TEXT NOT NULL,
            etapa_actual INTEGER DEFAULT 0,
            costo_mano_obra REAL DEFAULT 0,
            trazabilidad_json TEXT NOT NULL,
            fecha_creacion INTEGER NOT NULL,
            fecha_finalizacion INTEGER,
            updated_at INTEGER NOT NULL
          );
        `;
        window.KoraDB.registerModule("org.koradevs.negocios.fabricacion", "Kora Fabricación", 1, ddl);
      } catch (e) {
        console.error("[FabricationStore] Error DDL:", e);
      }
    }

    if (!localStorage.getItem(this.KEY_ROUTES)) {
      const seedRoutes = [
        {
          id: "rut_empanadas",
          nombre: "Elaboración de Empanadas",
          material_terminado_id: "prod_empanada",
          tipo_flujo: "VENTA_DIRECTA_LOTE",
          etapas: [
            { secuencia: 1, nombre: "Armado y Relleno", tiempo_min: 15, insumo_id: "item_harina", insumo_nombre: "Harina de Maíz", cant_unitaria: 0.05 },
            { secuencia: 2, nombre: "Fritura y Escurrido", tiempo_min: 10, insumo_id: "item_aceite", insumo_nombre: "Aceite Vegetal", cant_unitaria: 0.02 },
            { secuencia: 3, nombre: "Empaque y Vitrina", tiempo_min: 5, insumo_id: null, insumo_nombre: "Bandejas", cant_unitaria: 0 }
          ]
        },
        {
          id: "rut_lavado",
          nombre: "Lavado y Detallado de Auto",
          material_terminado_id: "serv_lavado",
          tipo_flujo: "CONTRA_PEDIDO",
          etapas: [
            { secuencia: 1, nombre: "Recepción e Inspección", tiempo_min: 5, insumo_id: null, insumo_nombre: "Planilla", cant_unitaria: 0 },
            { secuencia: 2, nombre: "Enjabonado y Lavado", tiempo_min: 20, insumo_id: "item_champu", insumo_nombre: "Champú pH Neutro", cant_unitaria: 0.1 },
            { secuencia: 3, nombre: "Secado y Cera", tiempo_min: 15, insumo_id: "item_cera", insumo_nombre: "Cera Líquida", cant_unitaria: 0.05 },
            { secuencia: 4, nombre: "Entrega al Cliente", tiempo_min: 5, insumo_id: null, insumo_nombre: "Ambientador", cant_unitaria: 0 }
          ]
        }
      ];
      localStorage.setItem(this.KEY_ROUTES, JSON.stringify(seedRoutes));
    }
  }

  // --- CONSULTA A TABLAS EXTERNAS CON MANEJO DE ERROR ---

  getOperariosRRHH() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query(
          "SELECT id, nombre, rol, costo_minuto FROM mod_hr_empleados WHERE activo = 1 ORDER BY nombre ASC",
          "[]"
        ));
        if (Array.isArray(rows) && rows.length > 0) return rows;
      } catch (e) {
        console.warn("[FabricationStore] No se pudo leer mod_hr_empleados en SQLite:", e);
      }
    }
    // Fallback LocalStorage sincronizado con kora-rrhh
    const hr = JSON.parse(localStorage.getItem("kora_hr_empleados_v2") || "[]");
    return hr.filter(e => e.activo === 1);
  }

  getItemsInventario() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query("SELECT id, nombre, tipo, stock_actual FROM mod_biz_items ORDER BY nombre ASC", "[]"));
        if (Array.isArray(rows) && rows.length > 0) return rows;
      } catch (e) {
        console.warn("[FabricationStore] No se pudo leer mod_biz_items en SQLite:", e);
      }
    }
    return JSON.parse(localStorage.getItem("kora_inv_items_v4") || localStorage.getItem("kora_inv_items_v6") || "[]");
  }

  // --- RUTAS ---
  getRutas() {
    return JSON.parse(localStorage.getItem(this.KEY_ROUTES) || "[]");
  }

  guardarRuta(ruta) {
    const list = this.getRutas();
    list.push(ruta);
    localStorage.setItem(this.KEY_ROUTES, JSON.stringify(list));
  }

  // --- ÓRDENES ---
  getOrdenes(filtroEstado = null) {
    let list = JSON.parse(localStorage.getItem(this.KEY_ORDERS) || "[]");
    if (filtroEstado) list = list.filter(o => o.estado === filtroEstado);
    return list.sort((a, b) => b.fecha_creacion - a.fecha_creacion);
  }

  crearOrden({ codigo, rutaId, cantidad, tipoFlujo }) {
    const ruta = this.getRutas().find(r => r.id === rutaId);
    if (!ruta) throw new Error("La ruta operativa seleccionada no existe.");

    const nuevaOrden = {
      id: `ord_${Date.now()}`,
      codigo,
      ruta_id: ruta.id,
      ruta_nombre: ruta.nombre,
      material_terminado_id: ruta.material_terminado_id,
      tipo_flujo: tipoFlujo,
      cantidad: Number(cantidad) || 1,
      estado: "EN_PROCESO",
      etapa_actual: 0,
      costo_mano_obra: 0,
      trazabilidad: ruta.etapas.map((et, idx) => ({
        secuencia: idx,
        nombre: et.nombre,
        insumo_id: et.insumo_id,
        insumo_nombre: et.insumo_nombre,
        cant_unitaria: et.cant_unitaria,
        hora_inicio: idx === 0 ? Date.now() : null,
        hora_fin: null,
        empleado_id: null,
        empleado_nombre: null,
        duracion_segundos: 0,
        costo_mo: 0,
        completado: false
      })),
      fecha_creacion: Date.now(),
      fecha_finalizacion: null,
      updated_at: Date.now()
    };

    // Descontar insumos de la primera etapa
    this._consumirInsumo(nuevaOrden, 0);

    const ordenes = this.getOrdenes();
    ordenes.unshift(nuevaOrden);
    localStorage.setItem(this.KEY_ORDERS, JSON.stringify(ordenes));
    return nuevaOrden;
  }

  avanzarEtapa(ordenId, etapaIdx, empleadoId) {
    const ordenes = this.getOrdenes();
    const ord = ordenes.find(o => o.id === ordenId);
    if (!ord) throw new Error("No se encontró la orden especificada.");

    const operarios = this.getOperariosRRHH();
    const op = operarios.find(e => String(e.id) === String(empleadoId));
    if (!op) throw new Error("El operario seleccionado no está registrado o no se encuentra activo en RRHH.");

    const ahora = Date.now();
    const costoMin = Number(op.costo_minuto) || 100;

    const etapa = ord.trazabilidad[etapaIdx];
    if (etapa) {
      etapa.hora_fin = ahora;
      etapa.duracion_segundos = Math.max(1, Math.round((ahora - (etapa.hora_inicio || ahora)) / 1000));
      etapa.empleado_id = empleadoId;
      etapa.empleado_nombre = op.nombre;
      etapa.costo_mo = Math.round((etapa.duracion_segundos / 60) * costoMin);
      etapa.completado = true;
      ord.costo_mano_obra += etapa.costo_mo;
    }

    if (etapaIdx + 1 < ord.trazabilidad.length) {
      ord.etapa_actual = etapaIdx + 1;
      ord.trazabilidad[ord.etapa_actual].hora_inicio = ahora;
      this._consumirInsumo(ord, ord.etapa_actual);
    } else {
      ord.estado = "TERMINADA";
      ord.etapa_actual = ord.trazabilidad.length;
      ord.fecha_finalizacion = ahora;
      this._ingresarStockTerminado(ord.material_terminado_id, ord.cantidad, ord.codigo);
    }

    ord.updated_at = ahora;
    localStorage.setItem(this.KEY_ORDERS, JSON.stringify(ordenes));
    return ord;
  }

  _consumirInsumo(orden, etapaIdx) {
    const etapa = orden.trazabilidad[etapaIdx];
    if (!etapa || !etapa.insumo_id || etapa.cant_unitaria <= 0) return;

    const consumoTotal = Number(etapa.cant_unitaria) * Number(orden.cantidad);

    if (this.hasBridge) {
      try {
        const sql = `UPDATE mod_biz_items SET stock_actual = MAX(0, stock_actual - ?) WHERE id = ?;`;
        window.KoraDB.execute(sql, JSON.stringify([consumoTotal, etapa.insumo_id]));

        const sqlMov = `INSERT INTO mod_biz_movimientos (id, material_id, tipo_movimiento, cantidad, motivo, fecha) VALUES (?, ?, 'SALIDA', ?, ?, ?);`;
        window.KoraDB.execute(sqlMov, JSON.stringify([`mov_${Date.now()}`, etapa.insumo_id, consumoTotal, `Consumo Orden ${orden.codigo} - Etapa ${etapa.nombre}`, Date.now()]));
        return;
      } catch (e) {
        console.warn("[FabricationStore] Error descontando en SQLite:", e);
      }
    }

    // Fallback LocalStorage
    const items = JSON.parse(localStorage.getItem("kora_inv_items_v4") || "[]");
    const item = items.find(i => String(i.id) === String(etapa.insumo_id));
    if (item) {
      item.stock_actual = Math.max(0, Number(item.stock_actual) - consumoTotal);
      localStorage.setItem("kora_inv_items_v4", JSON.stringify(items));
    }
  }

  _ingresarStockTerminado(materialId, cantidad, codigoOrden) {
    if (this.hasBridge) {
      try {
        const sql = `UPDATE mod_biz_items SET stock_actual = stock_actual + ? WHERE id = ?;`;
        window.KoraDB.execute(sql, JSON.stringify([Number(cantidad), materialId]));

        const sqlMov = `INSERT INTO mod_biz_movimientos (id, material_id, tipo_movimiento, cantidad, motivo, fecha) VALUES (?, ?, 'ENTRADA', ?, ?, ?);`;
        window.KoraDB.execute(sqlMov, JSON.stringify([`mov_${Date.now()}`, materialId, Number(cantidad), `Fabricación Finalizada - Orden ${codigoOrden}`, Date.now()]));
        return;
      } catch (e) {
        console.warn("[FabricationStore] Error sumando stock en SQLite:", e);
      }
    }

    const items = JSON.parse(localStorage.getItem("kora_inv_items_v4") || "[]");
    const item = items.find(i => String(i.id) === String(materialId));
    if (item) {
      item.stock_actual = Number(item.stock_actual) + Number(cantidad);
      localStorage.setItem("kora_inv_items_v4", JSON.stringify(items));
    }
  }
}
