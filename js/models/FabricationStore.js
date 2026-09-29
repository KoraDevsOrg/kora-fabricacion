/**
 * MODELO: Fabricación, Rutas Relacionales y Descuento en Inventario
 * KoraDevsOrg - Licencia MIT
 */

export class FabricationStore {
  constructor() {
    this.hasBridge = typeof window.KoraDB !== "undefined";
    this.KEY_ORDERS = "kora_fab_ordenes_v4";
    this.KEY_ROUTES = "kora_fab_rutas_v4";
    this.KEY_ETAPAS = "kora_fab_ruta_etapas_v4";
    this.KEY_ETAPA_MATS = "kora_fab_etapa_materiales_v4";
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
            tipo_proceso TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS mod_fab_ruta_etapas (
            id TEXT PRIMARY KEY,
            ruta_id TEXT NOT NULL,
            secuencia INTEGER NOT NULL,
            nombre_etapa TEXT NOT NULL,
            tiempo_estimado_minutos INTEGER DEFAULT 0,
            FOREIGN KEY (ruta_id) REFERENCES mod_fab_rutas(id)
          );

          CREATE TABLE IF NOT EXISTS mod_fab_etapa_materiales (
            id TEXT PRIMARY KEY,
            etapa_id TEXT NOT NULL,
            materia_prima_id TEXT NOT NULL,
            cantidad_unitaria REAL NOT NULL,
            FOREIGN KEY (etapa_id) REFERENCES mod_fab_ruta_etapas(id)
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

    // Semillas si no existen rutas
    if (!localStorage.getItem(this.KEY_ROUTES)) {
      const rutaId = "rut_empanadas";
      const etapa1Id = "et_armado";
      const etapa2Id = "et_fritura";

      localStorage.setItem(this.KEY_ROUTES, JSON.stringify([
        { id: rutaId, nombre: "Elaboración de Empanadas", material_terminado_id: "prod_empanada", tipo_proceso: "VENTA_DIRECTA_LOTE", updated_at: Date.now() }
      ]));

      localStorage.setItem(this.KEY_ETAPAS, JSON.stringify([
        { id: etapa1Id, ruta_id: rutaId, secuencia: 1, nombre_etapa: "Armado y Relleno", tiempo_estimado_minutos: 15 },
        { id: etapa2Id, ruta_id: rutaId, secuencia: 2, nombre_etapa: "Fritura y Escurrido", tiempo_estimado_minutos: 10 }
      ]));

      localStorage.setItem(this.KEY_ETAPA_MATS, JSON.stringify([
        { id: "mat_1", etapa_id: etapa1Id, materia_prima_id: "item_harina", cantidad_unitaria: 0.05 },
        { id: "mat_2", etapa_id: etapa1Id, materia_prima_id: "item_carne", cantidad_unitaria: 0.03 }
      ]));
    }
  }

  // --- LECTURA CRUZADA DE INVENTARIO Y RRHH ---
  getMateriasPrimasInventario() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query(
          "SELECT id, nombre, unidad_medida, stock_actual FROM mod_biz_items WHERE tipo = 'MATERIA_PRIMA' ORDER BY nombre ASC",
          "[]"
        ));
        if (Array.isArray(rows) && rows.length > 0) return rows;
      } catch (e) {}
    }
    const items = JSON.parse(localStorage.getItem("kora_inv_items_v4") || localStorage.getItem("kora_inv_items_v5") || "[]");
    return items.filter(i => i.tipo === "MATERIA_PRIMA");
  }

  getProductosTerminadosInventario() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query(
          "SELECT id, nombre, unidad_medida, stock_actual FROM mod_biz_items WHERE tipo = 'PRODUCTO_TERMINADO' ORDER BY nombre ASC",
          "[]"
        ));
        if (Array.isArray(rows) && rows.length > 0) return rows;
      } catch (e) {}
    }
    const items = JSON.parse(localStorage.getItem("kora_inv_items_v4") || localStorage.getItem("kora_inv_items_v5") || "[]");
    return items.filter(i => i.tipo === "PRODUCTO_TERMINADO");
  }

  getOperariosRRHH() {
    if (this.hasBridge) {
      try {
        const rows = JSON.parse(window.KoraDB.query(
          "SELECT id, nombre, rol, costo_minuto FROM mod_hr_empleados WHERE activo = 1 ORDER BY nombre ASC",
          "[]"
        ));
        if (Array.isArray(rows) && rows.length > 0) return rows;
      } catch (e) {}
    }
    const hr = JSON.parse(localStorage.getItem("kora_hr_empleados_v2") || "[]");
    return hr.filter(e => e.activo === 1);
  }

  // --- GESTIÓN DE RUTAS RELACIONALES ---
  getRutasCompletas() {
    const rutas = JSON.parse(localStorage.getItem(this.KEY_ROUTES) || "[]");
    const etapas = JSON.parse(localStorage.getItem(this.KEY_ETAPAS) || "[]");
    const materiales = JSON.parse(localStorage.getItem(this.KEY_ETAPA_MATS) || "[]");
    const rawItems = this.getMateriasPrimasInventario();

    return rutas.map(r => {
      const etapasRuta = etapas
        .filter(e => e.ruta_id === r.id)
        .sort((a, b) => a.secuencia - b.secuencia)
        .map(e => {
          const mats = materiales
            .filter(m => m.etapa_id === e.id)
            .map(m => {
              const itemInfo = rawItems.find(i => String(i.id) === String(m.materia_prima_id));
              return {
                id: m.id,
                materia_prima_id: m.materia_prima_id,
                cantidad_unitaria: m.cantidad_unitaria,
                nombre_material: itemInfo ? itemInfo.nombre : "Insumo Eliminado",
                unidad_medida: itemInfo ? itemInfo.unidad_medida : "ud"
              };
            });
          return { ...e, materiales: mats };
        });

      return { ...r, etapas: etapasRuta };
    });
  }

  guardarRutaRelacional({ nombre, materialTerminadoId, tipoProceso, etapasArray }) {
    const rutas = JSON.parse(localStorage.getItem(this.KEY_ROUTES) || "[]");
    const etapasStore = JSON.parse(localStorage.getItem(this.KEY_ETAPAS) || "[]");
    const matsStore = JSON.parse(localStorage.getItem(this.KEY_ETAPA_MATS) || "[]");

    const rutaId = `rut_${Date.now()}`;
    const nuevaRuta = {
      id: rutaId,
      material_terminado_id: materialTerminadoId,
      nombre,
      tipo_proceso: tipoProceso,
      updated_at: Date.now()
    };
    rutas.push(nuevaRuta);

    etapasArray.forEach((et, idx) => {
      const etapaId = `et_${Date.now()}_${idx}`;
      etapasStore.push({
        id: etapaId,
        ruta_id: rutaId,
        secuencia: idx + 1,
        nombre_etapa: et.nombre,
        tiempo_estimado_minutos: et.tiempoEstimado || 5
      });

      if (et.materialId && et.cantidadUnitaria > 0) {
        matsStore.push({
          id: `mat_${Date.now()}_${idx}`,
          etapa_id: etapaId,
          materia_prima_id: et.materialId,
          cantidad_unitaria: Number(et.cantidadUnitaria)
        });
      }
    });

    localStorage.setItem(this.KEY_ROUTES, JSON.stringify(rutas));
    localStorage.setItem(this.KEY_ETAPAS, JSON.stringify(etapasStore));
    localStorage.setItem(this.KEY_ETAPA_MATS, JSON.stringify(matsStore));

    if (this.hasBridge) {
      try {
        window.KoraDB.execute(
          "INSERT INTO mod_fab_rutas (id, material_terminado_id, nombre, tipo_proceso, updated_at) VALUES (?, ?, ?, ?, ?);",
          JSON.stringify([nuevaRuta.id, nuevaRuta.material_terminado_id, nuevaRuta.nombre, nuevaRuta.tipo_proceso, nuevaRuta.updated_at])
        );
      } catch (e) {}
    }

    return nuevaRuta;
  }

  // --- GESTIÓN DE ÓRDENES Y DESCUENTO DE STOCK ---
  getOrdenes(filtroEstado = null) {
    let list = JSON.parse(localStorage.getItem(this.KEY_ORDERS) || "[]");
    if (filtroEstado) list = list.filter(o => o.estado === filtroEstado);
    return list.sort((a, b) => b.fecha_creacion - a.fecha_creacion);
  }

  crearOrden({ codigo, rutaId, cantidad, tipoFlujo }) {
    const ruta = this.getRutasCompletas().find(r => r.id === rutaId);
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
        nombre: et.nombre_etapa,
        materiales: et.materiales,
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

    // Descontar inmediatamente insumos de la etapa 1 si los tiene
    this._ejecutarDescuentoStock(nuevaOrden, 0);

    const ordenes = this.getOrdenes();
    ordenes.unshift(nuevaOrden);
    localStorage.setItem(this.KEY_ORDERS, JSON.stringify(ordenes));
    return nuevaOrden;
  }

  avanzarEtapa(ordenId, etapaIdx, empleadoId) {
    const ordenes = this.getOrdenes();
    const ord = ordenes.find(o => o.id === ordenId);
    if (!ord) throw new Error("No se encontró la orden especificada.");

    const operario = this.getOperariosRRHH().find(e => String(e.id) === String(empleadoId));
    if (!operario) throw new Error("El operario seleccionado no está registrado o no se encuentra activo en RRHH.");

    const ahora = Date.now();
    const costoMin = Number(operario.costo_minuto) || 100;

    const etapa = ord.trazabilidad[etapaIdx];
    if (etapa) {
      etapa.hora_fin = ahora;
      etapa.duracion_segundos = Math.max(1, Math.round((ahora - (etapa.hora_inicio || ahora)) / 1000));
      etapa.empleado_id = empleadoId;
      etapa.empleado_nombre = operario.nombre;
      etapa.costo_mo = Math.round((etapa.duracion_segundos / 60) * costoMin);
      etapa.completado = true;
      ord.costo_mano_obra += etapa.costo_mo;
    }

    if (etapaIdx + 1 < ord.trazabilidad.length) {
      ord.etapa_actual = etapaIdx + 1;
      ord.trazabilidad[ord.etapa_actual].hora_inicio = ahora;
      this._ejecutarDescuentoStock(ord, ord.etapa_actual);
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

  _ejecutarDescuentoStock(orden, etapaIdx) {
    const etapa = orden.trazabilidad[etapaIdx];
    if (!etapa || !etapa.materiales || etapa.materiales.length === 0) return;

    const items = JSON.parse(localStorage.getItem("kora_inv_items_v4") || localStorage.getItem("kora_inv_items_v5") || "[]");
    const movs = JSON.parse(localStorage.getItem("kora_inv_movs_v4") || localStorage.getItem("kora_inv_movs_v5") || "[]");

    etapa.materiales.forEach(mat => {
      const consumoTotal = Number(mat.cantidad_unitaria) * Number(orden.cantidad);
      const itm = items.find(i => String(i.id) === String(mat.materia_prima_id));

      if (itm) {
        itm.stock_actual = Math.max(0, Number(itm.stock_actual) - consumoTotal);
        movs.push({
          id: `mov_fab_${Date.now()}_${mat.materia_prima_id}`,
          material_id: itm.id,
          tipo_movimiento: "SALIDA",
          cantidad: consumoTotal,
          motivo: `Consumo en Orden ${orden.codigo} - Etapa: ${etapa.nombre}`,
          fecha: Date.now()
        });
      }

      if (this.hasBridge) {
        try {
          window.KoraDB.execute(
            "UPDATE mod_biz_items SET stock_actual = MAX(0, stock_actual - ?) WHERE id = ?;",
            JSON.stringify([consumoTotal, mat.materia_prima_id])
          );
          window.KoraDB.execute(
            "INSERT INTO mod_biz_movimientos (id, material_id, tipo_movimiento, cantidad, motivo, fecha) VALUES (?, ?, 'SALIDA', ?, ?, ?);",
            JSON.stringify([`mov_${Date.now()}`, mat.materia_prima_id, consumoTotal, `Consumo Orden ${orden.codigo} - Etapa ${etapa.nombre}`, Date.now()])
          );
        } catch (e) {}
      }
    });

    localStorage.setItem("kora_inv_items_v4", JSON.stringify(items));
    localStorage.setItem("kora_inv_items_v5", JSON.stringify(items));
    localStorage.setItem("kora_inv_movs_v4", JSON.stringify(movs));
    localStorage.setItem("kora_inv_movs_v5", JSON.stringify(movs));
  }

  _ingresarStockTerminado(materialId, cantidad, codigoOrden) {
    const items = JSON.parse(localStorage.getItem("kora_inv_items_v4") || localStorage.getItem("kora_inv_items_v5") || "[]");
    const movs = JSON.parse(localStorage.getItem("kora_inv_movs_v4") || localStorage.getItem("kora_inv_movs_v5") || "[]");

    const itm = items.find(i => String(i.id) === String(materialId));
    if (itm) {
      itm.stock_actual = Number(itm.stock_actual) + Number(cantidad);
      movs.push({
        id: `mov_prod_${Date.now()}`,
        material_id: itm.id,
        tipo_movimiento: "ENTRADA",
        cantidad: Number(cantidad),
        motivo: `Producción finalizada - Orden ${codigoOrden}`,
        fecha: Date.now()
      });

      localStorage.setItem("kora_inv_items_v4", JSON.stringify(items));
      localStorage.setItem("kora_inv_items_v5", JSON.stringify(items));
      localStorage.setItem("kora_inv_movs_v4", JSON.stringify(movs));
      localStorage.setItem("kora_inv_movs_v5", JSON.stringify(movs));
    }

    if (this.hasBridge) {
      try {
        window.KoraDB.execute(
          "UPDATE mod_biz_items SET stock_actual = stock_actual + ? WHERE id = ?;",
          JSON.stringify([Number(cantidad), materialId])
        );
        window.KoraDB.execute(
          "INSERT INTO mod_biz_movimientos (id, material_id, tipo_movimiento, cantidad, motivo, fecha) VALUES (?, ?, 'ENTRADA', ?, ?, ?);",
          JSON.stringify([`mov_${Date.now()}`, materialId, Number(cantidad), `Fabricación Finalizada - Orden ${codigoOrden}`, Date.now()])
        );
      } catch (e) {}
    }
  }
}
