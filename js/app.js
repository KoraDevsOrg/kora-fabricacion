/**
 * CONTROLADOR: Kora Fabricación
 * Gestiona vistas mediante plantillas <template>, cronómetros y navegación SDK
 */

import { KoraBizNav } from "https://cdn.jsdelivr.net/gh/KoraDevsOrg/kora-web-sdk@main/kora-biz-nav.js?v=3.2.0";
import { FabricationStore } from "./models/FabricationStore.js?v=3.2.0";

class FabricationApp {
  constructor() {
    this.store = new FabricationStore();
    this.container = document.getElementById("appContent");
    this.filtroEstado = "EN_PROCESO";
    this.timerInterval = null;

    KoraBizNav.init("fabricacion");
    this.showHomeView();
  }

  showModal(title, msg, isError = false) {
    const overlay = document.getElementById("appModalOverlay");
    const tEl = document.getElementById("modalTitle");
    const mEl = document.getElementById("modalMsg");
    const iEl = document.getElementById("modalIcon");
    const btn = document.getElementById("btnModalClose");

    tEl.textContent = title;
    mEl.textContent = msg;
    iEl.textContent = isError ? "⚠️" : "✓";
    tEl.style.color = isError ? "#f87171" : "#38bdf8";

    overlay.style.display = "flex";
    btn.onclick = () => { overlay.style.display = "none"; };
  }

  loadTemplate(id) {
    clearInterval(this.timerInterval);
    this.container.innerHTML = "";
    const tmpl = document.getElementById(id);
    if (!tmpl) {
      console.error(`[FabricationApp] No se encontró el template: ${id}`);
      this.showModal("Error de Carga", `No existe la vista requerida: ${id}`, true);
      return;
    }
    this.container.appendChild(tmpl.content.cloneNode(true));
  }

  // --- 1. HUB PRINCIPAL ---
  showHomeView() {
    this.loadTemplate("tmpl-home-view");
    document.getElementById("headerTitle").textContent = "Kora Fabricación";

    document.getElementById("btnActionActiveOrders").onclick = () => this.showOrdersView();
    document.getElementById("btnActionNewOrder").onclick = () => this.showNewOrderView();
    document.getElementById("btnActionRoutes").onclick = () => this.showRoutesView();
  }

  // --- 2. LISTA DE ÓRDENES ---
  showOrdersView() {
    this.loadTemplate("tmpl-orders-view");
    document.getElementById("headerTitle").textContent = "Órdenes de Trabajo";

    document.getElementById("btnBackHomeOrders").onclick = () => this.showHomeView();

    const btnActive = document.getElementById("btnFilterActive");
    const btnDone = document.getElementById("btnFilterDone");

    btnActive.onclick = () => {
      this.filtroEstado = "EN_PROCESO";
      btnActive.classList.add("active");
      btnDone.classList.remove("active");
      this.renderOrdersCards();
    };

    btnDone.onclick = () => {
      this.filtroEstado = "TERMINADA";
      btnDone.classList.add("active");
      btnActive.classList.remove("active");
      this.renderOrdersCards();
    };

    this.renderOrdersCards();
  }

  renderOrdersCards() {
    const container = document.getElementById("ordersCardsContainer");
    const ordenes = this.store.getOrdenes(this.filtroEstado);
    const operarios = this.store.getOperariosRRHH();

    if (ordenes.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:32px 16px; color:var(--text-sub);">
          No hay órdenes registradas en estado: <strong>${this.filtroEstado}</strong>.
        </div>
      `;
      return;
    }

    container.innerHTML = ordenes.map(ord => {
      const isDone = ord.estado === "TERMINADA";
      const etapaActual = ord.trazabilidad[ord.etapa_actual] || null;

      return `
        <div class="card" data-ord-id="${ord.id}">
          <div class="card-header-bar">
            <div>
              <strong style="color:#fff; font-size:1.1rem;">${ord.codigo}</strong>
              <div style="font-size:0.8rem; color:var(--text-sub); margin-top:2px;">
                ${ord.ruta_nombre} • Cantidad: <strong>${ord.cantidad}</strong> uds
              </div>
            </div>
            <span class="badge ${isDone ? 'badge-done' : 'badge-proc'}">${ord.estado}</span>
          </div>

          <div style="margin:12px 0;">
            ${ord.trazabilidad.map((t, idx) => `
              <div class="step-box ${t.completado ? 'completed' : ''}">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                  <strong>Paso ${idx + 1}:${t.nombre}</strong>
                  <span>${t.completado ? `✓ ${Math.round(t.duracion_segundos / 60)}m ($${t.costo_mo})` : 'Pendiente'}</span>
                </div>
                <small style="color:var(--text-sub);">
                  ${t.insumo_nombre ? `Insumo: ${t.insumo_nombre}` : 'Sin insumo'} 
                  ${t.empleado_nombre ? `• Op: <strong>${t.empleado_nombre}</strong>` : ''}
                </small>
              </div>
            `).join('')}
          </div>

          ${!isDone && etapaActual ? `
            <div style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); border-radius:8px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.8rem; font-weight:700; color:var(--accent-gold);">
                  ▶ En curso: ${etapaActual.nombre}
                </span>
                <span class="timer-tag live-timer" data-start="${etapaActual.hora_inicio || Date.now()}">00:00</span>
              </div>
              
              <div style="margin-bottom:8px;">
                <select class="input-field select-op">
                  <option value="">-- Asignar Operario (RRHH) --</option>
                  ${operarios.length > 0 
                    ? operarios.map(op => `<option value="${op.id}">${op.nombre} ($${Math.round(op.costo_minuto)}/min)</option>`).join('')
                    : `<option value="" disabled>⚠️ Sin operarios activos en mod_hr_empleados</option>`
                  }
                </select>
              </div>

              <button class="btn-primary btn-advance-step" data-id="${ord.id}" data-idx="${ord.etapa_actual}">
                ✓ Notificar Avance & Liquidar Etapa
              </button>
            </div>
          ` : `
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:10px; margin-top:10px;">
              <span style="font-size:0.85rem; color:var(--text-sub);">Costo Mano de Obra:</span>
              <strong style="color:var(--accent-gold); font-size:1.05rem;">$${ord.costo_mano_obra.toLocaleString()}</strong>
            </div>
          `}
        </div>
      `;
    }).join("");

    container.querySelectorAll(".btn-advance-step").forEach(btn => {
      btn.onclick = () => {
        const ordId = btn.dataset.id;
        const idx = parseInt(btn.dataset.idx, 10);
        const card = btn.closest(".card");
        const opId = card.querySelector(".select-op").value;

        if (!opId) {
          this.showModal("Operario Requerido", "Debes seleccionar un colaborador registrado en el módulo de Gestión Humana (RRHH) para liquidar la mano de obra.", true);
          return;
        }

        try {
          this.store.avanzarEtapa(ordId, idx, opId);
          this.renderOrdersCards();
        } catch (err) {
          this.showModal("Error al Avanzar", err.message, true);
        }
      };
    });

    this.startLiveTimers();
  }

  startLiveTimers() {
    clearInterval(this.timerInterval);
    const update = () => {
      document.querySelectorAll(".live-timer").forEach(el => {
        const start = Number(el.dataset.start);
        if (start) {
          const diff = Math.floor((Date.now() - start) / 1000);
          const mins = String(Math.floor(diff / 60)).padStart(2, "0");
          const secs = String(diff % 60).padStart(2, "0");
          el.textContent = `${mins}:${secs}`;
        }
      });
    };
    update();
    this.timerInterval = setInterval(update, 1000);
  }

  // --- 3. NUEVA ORDEN ---
  showNewOrderView() {
    const rutas = this.store.getRutas();
    if (rutas.length === 0) {
      this.showModal("Sin Rutas", "Debes crear al menos una Ruta Operativa antes de lanzar órdenes.", true);
      this.showRoutesView();
      return;
    }

    this.loadTemplate("tmpl-new-order-view");
    document.getElementById("headerTitle").textContent = "Nueva Orden";

    document.getElementById("btnBackHomeNewOrder").onclick = () => this.showHomeView();
    document.getElementById("btnCancelNewOrder").onclick = () => this.showHomeView();

    const selRuta = document.getElementById("ordRutaId");
    selRuta.innerHTML = rutas.map(r => `<option value="${r.id}">${r.nombre} (${r.tipo_flujo})</option>`).join("");

    document.getElementById("newOrderForm").onsubmit = (e) => {
      e.preventDefault();
      try {
        this.store.crearOrden({
          codigo: document.getElementById("ordCodigo").value.trim(),
          rutaId: selRuta.value,
          cantidad: document.getElementById("ordCantidad").value,
          tipoFlujo: document.getElementById("ordTipoFlujo").value
        });
        this.showOrdersView();
      } catch (err) {
        this.showModal("Error al Crear Orden", err.message, true);
      }
    };
  }

  // --- 4. LISTA DE RUTAS ---
  showRoutesView() {
    this.loadTemplate("tmpl-routes-view");
    document.getElementById("headerTitle").textContent = "Rutas de Fabricación";

    document.getElementById("btnBackHomeRoutes").onclick = () => this.showHomeView();
    document.getElementById("btnGoNewRoute").onclick = () => this.showNewRouteFormView();

    const rutas = this.store.getRutas();
    const container = document.getElementById("routesListContainer");

    container.innerHTML = rutas.map(r => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:#fff; font-size:1rem;">${r.nombre}</strong>
          <span class="badge badge-proc">${r.tipo_flujo}</span>
        </div>
        <div>
          ${r.etapas.map((et, i) => `
            <div style="font-size:0.8rem; color:var(--text-sub); padding:4px 0; border-bottom:1px dashed var(--border);">
              ${i + 1}. <strong>${et.nombre}</strong> (~${et.tiempo_min} min)${et.insumo_nombre ? `• Insumo: <em>${et.insumo_nombre}</em>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join("");
  }

  // --- 5. CREAR RUTA (Carga template con ID correspondiente) ---
  showNewRouteFormView() {
    this.loadTemplate("tmpl-new-route-form-view");
    document.getElementById("headerTitle").textContent = "Nueva Ruta";

    document.getElementById("btnBackToRoutes").onclick = () => this.showRoutesView();
    document.getElementById("btnCancelRoute").onclick = () => this.showRoutesView();

    const items = this.store.getItemsInventario();
    const selMat = document.getElementById("routeMaterialId");
    selMat.innerHTML = items.length > 0
      ? items.map(i => `<option value="${i.id}">${i.nombre} (${i.tipo})</option>`).join("")
      : `<option value="prod_default">Producto de Fabricación General</option>`;

    const stepsContainer = document.getElementById("routeStepsContainer");
    let stepCount = 0;

    const addStepRow = () => {
      stepCount++;
      const row = document.createElement("div");
      row.className = "card";
      row.style.background = "rgba(0,0,0,0.2)";
      row.style.padding = "10px";
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <strong style="color:var(--accent-gold); font-size:0.85rem;">Etapa #${stepCount}</strong>
          ${stepCount > 1 ? '<button type="button" class="btn-icon btn-del-step" style="color:var(--danger); font-size:1rem;">✕</button>' : ''}
        </div>
        <div class="form-grid">
          <input type="text" class="input-field step-name" placeholder="Nombre etapa (ej: Horneado)" required>
          <input type="number" class="input-field step-time" placeholder="Minutos est." value="10">
        </div>
        <div style="margin-top:6px;">
          <input type="text" class="input-field step-insumo" placeholder="Insumo a descontar (ej: Harina de Maíz)">
        </div>
      `;

      const delBtn = row.querySelector(".btn-del-step");
      if (delBtn) delBtn.onclick = () => row.remove();
      stepsContainer.appendChild(row);
    };

    addStepRow();
    document.getElementById("btnAddStepRow").onclick = () => addStepRow();

    document.getElementById("newRouteForm").onsubmit = (e) => {
      e.preventDefault();
      const rows = stepsContainer.querySelectorAll(".card");
      const etapas = [];

      rows.forEach((r, idx) => {
        const nombre = r.querySelector(".step-name").value.trim();
        const tiempo = parseInt(r.querySelector(".step-time").value, 10) || 5;
        const insumo = r.querySelector(".step-insumo").value.trim();

        if (nombre) {
          etapas.push({
            secuencia: idx + 1,
            nombre,
            tiempo_min: tiempo,
            insumo_id: insumo ? `itm_${nombre.toLowerCase()}` : null,
            insumo_nombre: insumo || null,
            cant_unitaria: insumo ? 0.05 : 0
          });
        }
      });

      this.store.guardarRuta({
        id: `rut_${Date.now()}`,
        nombre: document.getElementById("routeNombre").value.trim(),
        material_terminado_id: selMat.value,
        tipo_flujo: document.getElementById("routeTipoFlujo").value,
        etapas,
        updated_at: Date.now()
      });

      this.showRoutesView();
    };
  }
}

window.addEventListener("DOMContentLoaded", () => new FabricationApp());
