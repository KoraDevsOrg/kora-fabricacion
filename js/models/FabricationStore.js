/**
 * Modelo de Fabricación
 * Persistencia en mod_fab_* y consumo directo de mod_hr_empleados (kora-rrhh)
 */
export class FabricationStore {
  constructor() {
    this.hasBridge = typeof window.KoraDB !== "undefined";
    this.KEY_ORDERS = "kora_fab_ordenes_v2";
    this.KEY_ROUTES = "kora_fab_rutas_v2";
    this.initDatabase();
  }

  initDatabase() {
    if (this.hasBridge) {
      try {
        const ddl = `
          CREATE TABLE IF NOT EXISTS mod_fab_rutas (
            id TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            tipo_flujo TEXT NOT NULL,
            etapas_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS mod_fab_ordenes (
            id TEXT PRIMARY KEY,
            codigo TEXT NOT NULL,
            ruta_id TEXT NOT NULL,
            cantidad REAL NOT NULL,
            estado TEXT NOT NULL,
            etapa_actual INTEGER DEFAULT 0,
            costo_materiales REAL DEFAULT 0,
            costo_mano_obra REAL DEFAULT 0,
            trazabilidad_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `;
        window.KoraDB.registerModule("org.koradevs.negocios.fabricacion", "Kora Fabricación", 1, ddl);
      } catch (e) {
        console.warn("[FabricationStore] Error DDL:", e);
      }
    }

    if (!localStorage.getItem(this.KEY_ROUTES)) {
      const seedRoutes = [
        {
          id: "rut_empanadas",
          nombre: "Elaboración de Empanadas",
          tipo_flujo: "VENTA_DIRECTA",
          etapas: [
            { nombre: "Armado y Relleno", tiempo_min: 10, insumo: "Masa y Carne" },
            { nombre: "Fritura y Escurrido", tiempo_min: 8, insumo: "Aceite y Gas" },
            { nombre: "Empaque y Vitrina", tiempo_min: 2, insumo: "Bandejas" }
          ]
        },
        {
          id: "rut_lavado",
          nombre: "Servicio Lavado de Autos",
          tipo_flujo: "CONTRA_PEDIDO",
          etapas: [
            { nombre: "Inspección y Enjabonado", tiempo_min: 15, insumo: "Champú pH Neutro" },
            { nombre: "Enjuague y Secado", tiempo_min: 10, insumo: "Cera Líquida" },
            { nombre: "Acabados y Entrega", tiempo_min: 5, insumo: "Silicona y Ambientador" }
          ]
        }
      ];
      localStorage.setItem(this.KEY_ROUTES, JSON.stringify(seedRoutes));
    }
  }

  /**
   * Lee la tabla de colaboradores directamente desde kora-rrhh
   */
  getOperariosRRHH() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query(
          "SELECT id, nombre, rol, costo_minuto FROM mod_hr_empleados WHERE activo = 1 ORDER BY nombre ASC",
          "[]"
        ));
        if (rows && rows.length > 0) return rows;
      } catch (e) {}
    }
    // Fallback de sincronización local
    const hr = JSON.parse(localStorage.getItem("kora_hr_empleados_v2") || "[]");
    return hr.filter(e => e.activo === 1);
  }

  getRutas() {
    return JSON.parse(localStorage.getItem(this.KEY_ROUTES) || "[]");
  }

  getOrdenes() {
    return JSON.parse(localStorage.getItem(this.KEY_ORDERS) || "[]").sort((a, b) => b.updated_at - a.updated_at);
  }

  crearOrden({ codigo, rutaId, cantidad }) {
    const ruta = this.getRutas().find(r => r.id === rutaId);
    if (!ruta) return null;

    const nuevaOrden = {
      id: `ord_${Date.now()}`,
      codigo,
      ruta_id: ruta.id,
      ruta_nombre: ruta.nombre,
      cantidad: Number(cantidad) || 1,
      estado: "EN_PROCESO",
      etapa_actual: 0,
      costo_mano_obra: 0,
      costo_materiales: 0,
      trazabilidad: ruta.etapas.map((et, idx) => ({
        secuencia: idx,
        nombre: et.nombre,
        insumo: et.insumo,
        empleado_id: null,
        empleado_nombre: null,
        minutos: 0,
        costo_mo: 0,
        completado: false
      })),
      updated_at: Date.now()
    };

    const ordenes = this.getOrdenes();
    ordenes.unshift(nuevaOrden);
    localStorage.setItem(this.KEY_ORDERS, JSON.stringify(ordenes));
    return nuevaOrden;
  }

  avanzarEtapa(ordenId, etapaIdx, empleadoId, minutos) {
    const ordenes = this.getOrdenes();
    const ord = ordenes.find(o => o.id === ordenId);
    if (!ord) return null;

    const op = this.getOperariosRRHH().find(e => String(e.id) === String(empleadoId));
    const costoMin = op ? Number(op.costo_minuto) : 100;
    const costoMO = Math.round(minutos * costoMin);

    const etapa = ord.trazabilidad[etapaIdx];
    if (etapa) {
      etapa.empleado_id = empleadoId;
      etapa.empleado_nombre = op ? op.nombre : "Colaborador";
      etapa.minutos = minutos;
      etapa.costo_mo = costoMO;
      etapa.completado = true;
    }

    ord.costo_mano_obra += costoMO;

    if (etapaIdx + 1 < ord.trazabilidad.length) {
      ord.etapa_actual = etapaIdx + 1;
    } else {
      ord.estado = "TERMINADA";
      ord.etapa_actual = ord.trazabilidad.length;
    }

    ord.updated_at = Date.now();
    localStorage.setItem(this.KEY_ORDERS, JSON.stringify(ordenes));
    return ord;
  }
}
