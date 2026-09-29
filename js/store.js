/**
 * MODELO DE DATOS: Fabricación, Rutas, Trazabilidad y Gestión Humana
 * KoraDevsOrg - Licencia MIT
 */

export class FabricationStore {
  constructor() {
    this.hasBridge = typeof window.KoraDB !== "undefined";
    this.KEY_HR = "kora_hr_empleados_v1";
    this.KEY_RUTAS = "kora_fab_rutas_v1";
    this.KEY_ORDENES = "kora_fab_ordenes_v1";
    this.KEY_ITEMS = "kora_inv_items_v6";
    this.KEY_BOM = "kora_inv_bom_v6";
    this.KEY_MOVS = "kora_inv_movs_v6";
    this.initDatabase();
  }

  initDatabase() {
    if (this.hasBridge) {
      try {
        const ddl = `
          CREATE TABLE IF NOT EXISTS mod_hr_empleados (
            id TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            rol TEXT NOT NULL,
            costo_minuto REAL NOT NULL,
            activo INTEGER DEFAULT 1,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS mod_fab_rutas (
            id TEXT PRIMARY KEY,
            material_terminado_id TEXT NOT NULL,
            nombre TEXT NOT NULL,
            tipo_proceso TEXT NOT NULL,
            etapas_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS mod_fab_ordenes (
            id TEXT PRIMARY KEY,
            codigo_seguimiento TEXT NOT NULL,
            ruta_id TEXT NOT NULL,
            material_terminado_id TEXT NOT NULL,
            cantidad_a_producir REAL NOT NULL,
            estado TEXT NOT NULL,
            tipo_flujo TEXT NOT NULL,
            etapa_actual_secuencia INTEGER DEFAULT 1,
            costo_mano_obra_acumulado REAL DEFAULT 0,
            trazabilidad_json TEXT NOT NULL,
            fecha_creacion INTEGER NOT NULL,
            fecha_finalizacion INTEGER,
            updated_at INTEGER NOT NULL
          );
        `;
        window.KoraDB.registerModule("org.koradevs.negocios.fabricacion", "Kora Fabricación", 1, ddl);
      } catch (e) {
        console.warn("[FabricationStore] Error registrando módulo SQLite:", e);
      }
    }

    // Datos semilla para Gestión Humana
    if (!localStorage.getItem(this.KEY_HR)) {
      const seedHR = [
        { id: "emp_1", nombre: "Carlos Dueño / Administrador", rol: "ADMIN", costo_minuto: 150, activo: 1, updated_at: Date.now() },
        { id: "emp_2", nombre: "María Cocinera / Operaria", rol: "COCINERA", costo_minuto: 100, activo: 1, updated_at: Date.now() }
      ];
      localStorage.setItem(this.KEY_HR, JSON.stringify(seedHR));
    }

    // Datos semilla para Rutas Operativas
    if (!localStorage.getItem(this.KEY_RUTAS)) {
      const seedRutas = [
        {
          id: "ruta_empanadas",
          material_terminado_id: "prod_empanada",
          nombre: "Ruta Preparación Empanada Frita",
          tipo_proceso: "VENTA_DIRECTA_LOTE",
          etapas: [
            {
              secuencia: 1,
              nombre_etapa: "Armado y Relleno",
              tiempo_estimado_min: 20,
              materiales_a_descontar: [
                { material_id: "item_harina", cantidad_unitaria: 0.04 },
                { material_id: "item_carne", cantidad_unitaria: 0.025 }
              ]
            },
            {
              secuencia: 2,
              nombre_etapa: "Fritura en Paila",
              tiempo_estimado_min: 15,
              materiales_a_descontar: []
            },
            {
              secuencia: 3,
              nombre_etapa: "Escurrido y Embalaje",
              tiempo_estimado_min: 10,
              materiales_a_descontar: []
            }
          ],
          updated_at: Date.now()
        },
        {
          id: "ruta_lavado",
          material_terminado_id: "prod_lavado_auto",
          nombre: "Ruta Lavado Completo de Vehículo",
          tipo_proceso: "CONTRA_PEDIDO",
          etapas: [
            {
              secuencia: 1,
              nombre_etapa: "Recepción e Inspección",
              tiempo_estimado_min: 5,
              materiales_a_descontar: []
            },
            {
              secuencia: 2,
              nombre_etapa: "Enjabonado y Desengrase",
              tiempo_estimado_min: 15,
              materiales_a_descontar: []
            },
            {
              secuencia: 3,
              nombre_etapa: "Enjuague y Secado Microfibra",
              tiempo_estimado_min: 15,
              materiales_a_descontar: []
            }
          ],
          updated_at: Date.now()
        }
      ];
      localStorage.setItem(this.KEY_RUTAS, JSON.stringify(seedRutas));
    }

    if (!localStorage.getItem(this.KEY_ORDENES)) {
      localStorage.setItem(this.KEY_ORDENES, JSON.stringify([]));
    }
  }

  // --- CONSULTAS AL INVENTARIO ---
  getItems() {
    if (this.hasBridge) {
      try {
        const res = window.KoraDB.query("SELECT * FROM mod_biz_items ORDER BY nombre ASC", "[]");
        return JSON.parse(res);
      } catch (e) {}
    }
    return JSON.parse(localStorage.getItem(this.KEY_ITEMS) || "[]");
  }

  getItemById(id) {
    return this.getItems().find(i => String(i.id) === String(id)) || null;
  }

  // --- GESTIÓN HUMANA (HR) ---
  getEmpleados() {
    if (this.hasBridge) {
      try {
        return JSON.parse(window.KoraDB.query("SELECT * FROM mod_hr_empleados WHERE activo = 1 ORDER BY nombre ASC", "[]"));
      } catch (e) {}
    }
    return JSON.parse(localStorage.getItem(this.KEY_HR) || "[]").filter(e => e.activo === 1);
  }

  saveEmpleado(emp) {
    const list = JSON.parse(localStorage.getItem(this.KEY_HR) || "[]");
    const record = { ...emp, id: emp.id || `emp_${Date.now()}`, activo: 1, updated_at: Date.now() };
    const idx = list.findIndex(e => String(e.id) === String(record.id));
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    localStorage.setItem(this.KEY_HR, JSON.stringify(list));

    if (this.hasBridge) {
      try {
        const sql = `INSERT OR REPLACE INTO mod_hr_empleados (id, nombre, rol, costo_minuto, activo, updated_at) VALUES (?, ?, ?, ?, ?, ?);`;
        window.KoraDB.execute(sql, JSON.stringify([record.id, record.nombre, record.rol, record.costo_minuto, record.activo, record.updated_at]));
      } catch (e) {}
    }
    return record;
  }

  // --- RUTAS DE FABRICACIÓN ---
  getRutas() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query("SELECT * FROM mod_fab_rutas ORDER BY nombre ASC", "[]"));
        return rows.map(r => ({
          ...r,
          etapas: typeof r.etapas_json === "string" ? JSON.parse(r.etapas_json) : (r.etapas || [])
        }));
      } catch (e) {}
    }
    return JSON.parse(localStorage.getItem(this.KEY_RUTAS) || "[]");
  }

  getRutaById(id) {
    return this.getRutas().find(r => String(r.id) === String(id)) || null;
  }

  saveRuta(ruta, etapas) {
    const list = this.getRutas();
    const record = { ...ruta, id: ruta.id || `ruta_${Date.now()}`, etapas, updated_at: Date.now() };
    const idx = list.findIndex(r => String(r.id) === String(record.id));
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    localStorage.setItem(this.KEY_RUTAS, JSON.stringify(list));

    if (this.hasBridge) {
      try {
        const sql = `INSERT OR REPLACE INTO mod_fab_rutas (id, material_terminado_id, nombre, tipo_proceso, etapas_json, updated_at) VALUES (?, ?, ?, ?, ?, ?);`;
        window.KoraDB.execute(sql, JSON.stringify([record.id, record.material_terminado_id, record.nombre, record.tipo_proceso, JSON.stringify(etapas), record.updated_at]));
      } catch (e) {}
    }
    return record;
  }

  // --- ÓRDENES DE PRODUCCIÓN ---
  getOrdenes(estado = null) {
    let list = [];
    if (this.hasBridge) {
      try {
        const sql = estado ? "SELECT * FROM mod_fab_ordenes WHERE estado = ? ORDER BY fecha_creacion DESC" : "SELECT * FROM mod_fab_ordenes ORDER BY fecha_creacion DESC";
        const rows = JSON.parse(window.KoraDB.query(sql, estado ? JSON.stringify([estado]) : "[]"));
        list = rows.map(o => ({
          ...o,
          trazabilidad: typeof o.trazabilidad_json === "string" ? JSON.parse(o.trazabilidad_json) : (o.trazabilidad || [])
        }));
      } catch (e) {}
    }
    if (list.length === 0) {
      list = JSON.parse(localStorage.getItem(this.KEY_ORDENES) || "[]");
      if (estado) list = list.filter(o => o.estado === estado);
      list.sort((a, b) => b.fecha_creacion - a.fecha_creacion);
    }
    return list;
  }

  getOrdenById(id) {
    return this.getOrdenes().find(o => String(o.id) === String(id)) || null;
  }

  createOrden(rutaId, cantidad, codigoSeguimiento, tipoFlujo) {
    const ruta = this.getRutaById(rutaId);
    if (!ruta) throw new Error("Ruta no encontrada");

    const orden = {
      id: `ord_${Date.now()}`,
      codigo_seguimiento: codigoSeguimiento || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      ruta_id: ruta.id,
      material_terminado_id: ruta.material_terminado_id,
      cantidad_a_producir: Number(cantidad) || 1,
      estado: "EN_PROCESO",
      tipo_flujo: tipoFlujo || ruta.tipo_proceso,
      etapa_actual_secuencia: 1,
      costo_mano_obra_acumulado: 0,
      trazabilidad: [
        {
          secuencia: 1,
          etapa_nombre: ruta.etapas[0]?.nombre_etapa || "Inicio",
          hora_inicio: Date.now(),
          hora_fin: null,
          duracion_segundos: 0,
          costo_mano_obra: 0,
          materiales_descontados: false,
          empleado_id: null
        }
      ],
      fecha_creacion: Date.now(),
      fecha_finalizacion: null,
      updated_at: Date.now()
    };

    // Descontar inmediatamente materiales si la etapa 1 tiene configurado consumo
    this._procesarDescuentoMaterialesEtapa(orden, 1);

    const list = this.getOrdenes();
    list.unshift(orden);
    localStorage.setItem(this.KEY_ORDENES, JSON.stringify(list));

    if (this.hasBridge) {
      try {
        const sql = `INSERT INTO mod_fab_ordenes (id, codigo_seguimiento, ruta_id, material_terminado_id, cantidad_a_producir, estado, tipo_flujo, etapa_actual_secuencia, costo_mano_obra_acumulado, trazabilidad_json, fecha_creacion, fecha_finalizacion, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
        window.KoraDB.execute(sql, JSON.stringify([
          orden.id, orden.codigo_seguimiento, orden.ruta_id, orden.material_terminado_id,
          orden.cantidad_a_producir, orden.estado, orden.tipo_flujo, orden.etapa_actual_secuencia,
          orden.costo_mano_obra_acumulado, JSON.stringify(orden.trazabilidad), orden.fecha_creacion,
          orden.fecha_finalizacion, orden.updated_at
        ]));
      } catch (e) {}
    }
    return orden;
  }

  avanzarEtapaOrden(ordenId, empleadoId = null) {
    const orden = this.getOrdenById(ordenId);
    if (!orden || orden.estado !== "EN_PROCESO") return null;

    const ruta = this.getRutaById(orden.ruta_id);
    if (!ruta) return null;

    const trazaActual = orden.trazabilidad.find(t => t.secuencia === orden.etapa_actual_secuencia);
    const ahora = Date.now();

    // 1. Cerrar etapa actual
    if (trazaActual) {
      trazaActual.hora_fin = ahora;
      trazaActual.duracion_segundos = Math.max(1, Math.round((ahora - trazaActual.hora_inicio) / 1000));
      trazaActual.empleado_id = empleadoId;

      // Calcular costo de mano de obra
      let costoMinuto = 100;
      if (empleadoId) {
        const emp = this.getEmpleados().find(e => String(e.id) === String(empleadoId));
        if (emp) costoMinuto = Number(emp.costo_minuto);
      }
      trazaActual.costo_mano_obra = (trazaActual.duracion_segundos / 60) * costoMinuto;
      orden.costo_mano_obra_acumulado += trazaActual.costo_mano_obra;
    }

    // 2. Comprobar si completó todas las etapas
    if (orden.etapa_actual_secuencia >= ruta.etapas.length) {
      orden.estado = "TERMINADA";
      orden.fecha_finalizacion = ahora;
      orden.updated_at = ahora;

      // INGRESO AL INVENTARIO: Aumentar stock del producto terminado
      this._aumentarStockProductoTerminado(orden.material_terminado_id, orden.cantidad_a_producir, orden.codigo_seguimiento);
    } else {
      // 3. Abrir la siguiente etapa
      orden.etapa_actual_secuencia += 1;
      const sigEtapa = ruta.etapas.find(e => e.secuencia === orden.etapa_actual_secuencia);
      orden.trazabilidad.push({
        secuencia: orden.etapa_actual_secuencia,
        etapa_nombre: sigEtapa?.nombre_etapa || `Etapa ${orden.etapa_actual_secuencia}`,
        hora_inicio: ahora,
        hora_fin: null,
        duracion_segundos: 0,
        costo_mano_obra: 0,
        materiales_descontados: false,
        empleado_id: null
      });

      // Descontar materias primas de la nueva etapa si aplica
      this._procesarDescuentoMaterialesEtapa(orden, orden.etapa_actual_secuencia);
    }

    orden.updated_at = ahora;

    // Persistir orden actualizada
    const list = this.getOrdenes();
    const idx = list.findIndex(o => String(o.id) === String(orden.id));
    if (idx >= 0) list[idx] = orden;
    localStorage.setItem(this.KEY_ORDENES, JSON.stringify(list));

    if (this.hasBridge) {
      try {
        const sql = `UPDATE mod_fab_ordenes SET estado = ?, etapa_actual_secuencia = ?, costo_mano_obra_acumulado = ?, trazabilidad_json = ?, fecha_finalizacion = ?, updated_at = ? WHERE id = ?;`;
        window.KoraDB.execute(sql, JSON.stringify([
          orden.estado, orden.etapa_actual_secuencia, orden.costo_mano_obra_acumulado,
          JSON.stringify(orden.trazabilidad), orden.fecha_finalizacion, orden.updated_at, orden.id
        ]));
      } catch (e) {}
    }
    return orden;
  }

  // --- MÉTODOS DE INTEGRACIÓN CON EL INVENTARIO FÍSICO ---
  _procesarDescuentoMaterialesEtapa(orden, secuenciaEtapa) {
    const ruta = this.getRutaById(orden.ruta_id);
    if (!ruta) return;

    const etapa = ruta.etapas.find(e => e.secuencia === secuenciaEtapa);
    if (!etapa || !etapa.materiales_a_descontar || etapa.materiales_a_descontar.length === 0) return;

    const items = JSON.parse(localStorage.getItem(this.KEY_ITEMS) || "[]");
    const movs = JSON.parse(localStorage.getItem(this.KEY_MOVS) || "[]");

    etapa.materiales_a_descontar.forEach(m => {
      const cantTotal = Number(m.cantidad_unitaria) * Number(orden.cantidad_a_producir);
      const itm = items.find(i => String(i.id) === String(m.material_id));
      if (itm) {
        itm.stock_actual = Math.max(0, Number(itm.stock_actual) - cantTotal);

        // Registro de salida en el Kardex
        movs.push({
          id: `mov_fab_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          material_id: itm.id,
          tipo_movimiento: "SALIDA",
          cantidad: cantTotal,
          motivo: `Consumo en orden ${orden.codigo_seguimiento} - Etapa: ${etapa.nombre_etapa}`,
          fecha: Date.now()
        });

        if (this.hasBridge) {
          try {
            window.KoraDB.execute("UPDATE mod_biz_items SET stock_actual = ? WHERE id = ?;", JSON.stringify([itm.stock_actual, itm.id]));
            window.KoraDB.execute("INSERT INTO mod_biz_movimientos (id, material_id, tipo_movimiento, cantidad, motivo, fecha) VALUES (?, ?, ?, ?, ?, ?);", JSON.stringify([
              `mov_fab_${Date.now()}`, itm.id, "SALIDA", cantTotal,
              `Consumo en orden ${orden.codigo_seguimiento} - Etapa: ${etapa.nombre_etapa}`, Date.now()
            ]));
          } catch (e) {}
        }
      }
    });

    localStorage.setItem(this.KEY_ITEMS, JSON.stringify(items));
    localStorage.setItem(this.KEY_MOVS, JSON.stringify(movs));
  }

  _aumentarStockProductoTerminado(materialId, cantidad, codigoOrden) {
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
        motivo: `Entrada producción finalizada - Orden ${codigoOrden}`,
        fecha: Date.now()
      });

      localStorage.setItem(this.KEY_ITEMS, JSON.stringify(items));
      localStorage.setItem(this.KEY_MOVS, JSON.stringify(movs));

      if (this.hasBridge) {
        try {
          window.KoraDB.execute("UPDATE mod_biz_items SET stock_actual = ? WHERE id = ?;", JSON.stringify([itm.stock_actual, itm.id]));
          window.KoraDB.execute("INSERT INTO mod_biz_movimientos (id, material_id, tipo_movimiento, cantidad, motivo, fecha) VALUES (?, ?, ?, ?, ?, ?);", JSON.stringify([
            `mov_in_${Date.now()}`, itm.id, "ENTRADA", Number(cantidad),
            `Entrada producción finalizada - Orden ${codigoOrden}`, Date.now()
          ]));
        } catch (e) {}
      }
    }
  }
}
