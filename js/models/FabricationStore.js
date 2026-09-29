/**
 * MODELO: Fabricación y Trazabilidad Operativa
 * Interactúa con mod_fab_*, mod_hr_empleados (RRHH) y mod_biz_items (Inventario)
 */

export class FabricationStore {
  constructor() {
    this.hasBridge = typeof window.KoraDB !== "undefined";
    this.KEY_ORDERS = "kora_fab_ordenes_v2";
    this.KEY_ROUTES = "kora_fab_rutas_v2";
    this.KEY_ITEMS = "kora_inv_items_v6";
    this.KEY_MOVS = "kora_inv_movs_v6";
    this.KEY_HR = "kora_hr_empleados_v2";
    this.initDatabase();
  }

  initDatabase() {
    if (this.hasBridge) {
      try {
        const ddl = `
          CREATE TABLE IF NOT EXISTS mod_fab_rutas (
            id TEXT PRIMARY KEY,
            material_terminado_id TEXT NOT NULL,
            nombre TEXT NOT NULL,
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
        console.warn("[FabricationStore] Error DDL:", e);
      }
    }

    // Semillas para pruebas
    if (!localStorage.getItem(this.KEY_ROUTES)) {
      const seedRoutes = [
        {
          id: "rut_empanadas",
          material_terminado_id: "prod_empanada",
          nombre: "Elaboración de Empanadas",
          tipo_flujo: "VENTA_DIRECTA_LOTE",
          etapas: [
            {
              secuencia: 1,
              nombre: "Armado y Relleno",
              tiempo_estimado: 15,
              insumo_id: "item_harina",
              insumo_nombre: "Harina de Maíz",
              cant_unitaria: 0.05
            },
            {
              secuencia: 2,
              nombre: "Fritura y Escurrido",
              tiempo_estimado: 10,
              insumo_id: "item_aceite",
              insumo_nombre: "Aceite Vegetal",
              cant_unitaria: 0.02
            },
            {
              secuencia: 3,
              nombre: "Empaque y Vitrina",
              tiempo_estimado: 5,
              insumo_id: null,
              insumo_nombre: "Bandejas",
              cant_unitaria: 0
            }
          ]
        },
        {
          id: "rut_lavado",
          material_terminado_id: "serv_lavado",
          nombre: "Servicio Lavado y Detallado de Auto",
          tipo_flujo: "CONTRA_PEDIDO",
          etapas: [
            { secuencia: 1, nombre: "Recepción e Inspección", tiempo_estimado: 5, insumo_id: null, insumo_nombre: "Planilla", cant_unitaria: 0 },
            { secuencia: 2, nombre: "Enjabonado y Desengrase", tiempo_estimado: 20, insumo_id: "item_champu", insumo_nombre: "Champú pH Neutro", cant_unitaria: 0.1 },
            { secuencia: 3, nombre: "Enjuague y Secado", tiempo_estimado: 15, insumo_id: "item_cera", insumo_nombre: "Cera Líquida", cant_unitaria: 0.05 },
            { secuencia: 4, nombre: "Entrega al Cliente", tiempo_estimado: 5, insumo_id: null, insumo_nombre: "Ambientador", cant_unitaria: 0 }
          ]
        }
      ];
      localStorage.setItem(this.KEY_ROUTES, JSON.stringify(seedRoutes));
    }
  }

  // --- LECTURA CRUZADA CON GESTIÓN HUMANA (kora-rrhh) ---
  getOperariosRRHH() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query(
          "SELECT id, nombre, rol_oficio, costo_minuto FROM mod_hr_empleados WHERE activo = 1 ORDER BY nombre ASC",
          "[]"
        ));
        if (rows && rows.length > 0) return rows;
      } catch (e) {}
    }
    const hr = JSON.parse(localStorage.getItem(this.KEY_HR) || "[]");
    return hr.filter(e => e.activo === 1);
  }

  // --- LECTURA CRUZADA CON INVENTARIO (kora-inventario) ---
  getItemsInventario() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query("SELECT * FROM mod_biz_items ORDER BY nombre ASC", "[]"));
        if (rows && rows.length > 0) return rows;
      } catch (e) {}
    }
    return JSON.parse(localStorage.getItem(this.KEY_ITEMS) || "[]");
  }

  getRutas() {
    return JSON.parse(localStorage.getItem(this.KEY_ROUTES) || "[]");
  }

  guardarRuta(ruta) {
    const list = this.getRutas();
    list.push(ruta);
    localStorage.setItem(this.KEY_ROUTES, JSON.stringify(list));
  }

  getOrdenes(filtroEstado = null) {
    let list = JSON.parse(localStorage.getItem(this.KEY_ORDERS) || "[]");
    if (filtroEstado) list = list.filter(o => o.estado === filtroEstado);
    return list.sort((a, b) => b.fecha_creacion - a.fecha_creacion);
  }

  crearOrden({ codigo, rutaId, cantidad, tipoFlujo }) {
    const ruta = this.getRutas().find(r => r.id === rutaId);
    if (!ruta) return null;

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

    // Descontar inmediatamente insumos de la Etapa 1 si los tiene asociados
    this._descontarInsumosEtapa(nuevaOrden, 0);

    const ordenes = this.getOrdenes();
    ordenes.unshift(nuevaOrden);
    localStorage.setItem(this.KEY_ORDERS, JSON.stringify(ordenes));
    return nuevaOrden;
  }

  avanzarEtapa(ordenId, etapaIdx, empleadoId) {
    const ordenes = this.getOrdenes();
    const ord = ordenes.find(o => o.id === ordenId);
    if (!ord) return null;

    const op = this.getOperariosRRHH().find(e => String(e.id) === String(empleadoId));
    const costoMin = op ? Number(op.costo_minuto) : 90;
    const ahora = Date.now();

    const etapa = ord.trazabilidad[etapaIdx];
    if (etapa) {
      etapa.hora_fin = ahora;
      etapa.duracion_segundos = Math.max(1, Math.round((ahora - etapa.hora_inicio) / 1000));
      etapa.empleado_id = empleadoId;
      etapa.empleado_nombre = op ? op.nombre : "Colaborador";
      etapa.costo_mo = Math.round((etapa.duracion_segundos / 60) * costoMin);
      etapa.completado = true;
      ord.costo_mano_obra += etapa.costo_mo;
    }

    if (etapaIdx + 1 < ord.trazabilidad.length) {
      ord.etapa_actual = etapaIdx + 1;
      ord.trazabilidad[ord.etapa_actual].hora_inicio = ahora;
      // Descontar insumos de la siguiente etapa
      this._descontarInsumosEtapa(ord, ord.etapa_actual);
    } else {
      ord.estado = "TERMINADA";
      ord.etapa_actual = ord.trazabilidad.length;
      ord.fecha_finalizacion = ahora;

      // Incrementar stock del producto terminado en kora-inventario
      this._aumentarStockTerminado(ord.material_terminado_id, ord.cantidad, ord.codigo);
    }

    ord.updated_at = ahora;
    localStorage.setItem(this.KEY_ORDERS, JSON.stringify(ordenes));
    return ord;
  }

  _descontarInsumosEtapa(orden, etapaIdx) {
    const etapa = orden.trazabilidad[etapaIdx];
    if (!etapa || !etapa.insumo_id || etapa.cant_unitaria <= 0) return;

    const totalConsumo = Number(etapa.cant_unitaria) * Number(orden.cantidad);
    const items = JSON.parse(localStorage.getItem(this.KEY_ITEMS) || "[]");
    const movs = JSON.parse(localStorage.getItem(this.KEY_MOVS) || "[]");

    const itm = items.find(i => String(i.id) === String(etapa.insumo_id));
    if (itm) {
      itm.stock_actual = Math.max(0, Number(itm.stock_actual) - totalConsumo);
      movs.push({
        id: `mov_fab_${Date.now()}`,
        material_id: itm.id,
        tipo_movimiento: "SALIDA",
        cantidad: totalConsumo,
        motivo: `Consumo en Orden ${orden.codigo} - Etapa: ${etapa.nombre}`,
        fecha: Date.now()
      });
      localStorage.setItem(this.KEY_ITEMS, JSON.stringify(items));
      localStorage.setItem(this.KEY_MOVS, JSON.stringify(movs));
    }
  }

  _aumentarStockTerminado(materialId, cantidad, codigoOrden) {
    const items = JSON.parse(localStorage.getItem(this.KEY_ITEMS) || "[]");
    const movs = JSON.parse(localStorage.getItem(this.KEY_MOVS) || "[]");

    const itm = items.find(i => String(i.id) === String(materialId));
    if (itm) {
      itm.stock_actual = Number(itm.stock_actual) + Number(cantidad);
      movs.push({
        id: `mov_in_${Date.now()}`,
        material_id: itm.id,
        tipo_movimiento: "ENTRADA",
        cantidad: Number(cantidad),
        motivo: `Producción finalizada - Orden ${codigoOrden}`,
        fecha: Date.now()
      });
      localStorage.setItem(this.KEY_ITEMS, JSON.stringify(items));
      localStorage.setItem(this.KEY_MOVS, JSON.stringify(movs));
    }
  }
}
