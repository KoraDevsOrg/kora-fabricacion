/**
 * MODELO: Fabricación y Rutas de Proceso
 * Relacionado con mod_hr_empleados (RRHH) y mod_biz_items (Inventario)
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
          tipo_flujo: "VENTA_DIRECTA_LOTE",
          etapas: [
            { nombre: "Armado y Relleno", tiempo_estimado: 15, insumo: "Masa y Carne" },
            { nombre: "Fritura y Escurrido", tiempo_estimado: 10, insumo: "Aceite y Gas" },
            { nombre: "Empaque y Vitrina", tiempo_estimado: 5, insumo: "Bandejas / Servilletas" }
          ]
        },
        {
          id: "rut_lavado",
          nombre: "Lavado y Detallado de Auto",
          tipo_flujo: "CONTRA_PEDIDO",
          etapas: [
            { nombre: "Recepción e Inspección", tiempo_estimado: 5, insumo: "Planilla Chequeo" },
            { nombre: "Enjabonado y Lavado", tiempo_estimado: 20, insumo: "Champú y Desengrasante" },
            { nombre: "Secado y Cera", tiempo_estimado: 15, insumo: "Cera Líquida" },
            { nombre: "Entrega al Cliente", tiempo_estimado: 5, insumo: "Ambientador" }
          ]
        }
      ];
      localStorage.setItem(this.KEY_ROUTES, JSON.stringify(seedRoutes));
    }
  }

  // --- LECTURA CRUZADA DE OPERARIOS DE RRHH ---
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
    // Fallback de localStorage (kora-rrhh)
    const hr = JSON.parse(localStorage.getItem("kora_hr_empleados_v2") || "[]");
    return hr.filter(e => e.activo === 1);
  }

  getRutas() {
    return JSON.parse(localStorage.getItem(this.KEY_ROUTES) || "[]");
  }

  guardarRuta(ruta) {
    const rutas = this.getRutas();
    rutas.push(ruta);
    localStorage.setItem(this.KEY_ROUTES, JSON.stringify(rutas));
  }

  getOrdenes() {
    return JSON.parse(localStorage.getItem(this.KEY_ORDERS) || "[]").sort((a, b) => b.updated_at - a.updated_at);
  }

  crearOrden({ codigo, rutaId, cantidad, tipoFlujo }) {
    const ruta = this.getRutas().find(r => r.id === rutaId);
    if (!ruta) return null;

    const nuevaOrden = {
      id: `ord_${Date.now()}`,
      codigo,
      ruta_id: ruta.id,
      ruta_nombre: ruta.nombre,
      tipo_flujo: tipoFlujo,
      cantidad: Number(cantidad) || 1,
      estado: "EN_PROCESO",
      etapa_actual: 0,
      costo_mano_obra: 0,
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

    const operario = this.getOperariosRRHH().find(e => String(e.id) === String(empleadoId));
    const costoMin = operario ? Number(operario.costo_minuto) : 90;
    const costoMO = Math.round(minutos * costoMin);

    const etapa = ord.trazabilidad[etapaIdx];
    if (etapa) {
      etapa.empleado_id = empleadoId;
      etapa.empleado_nombre = operario ? operario.nombre : "Operario General";
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
