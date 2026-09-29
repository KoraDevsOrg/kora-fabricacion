/**
 * CONTROLADOR: Kora Fabricación
 * Sigue el patrón MVC y el sistema de navegación unificado de la suite
 */

import { KoraBizNav } from "https://cdn.jsdelivr.net/gh/KoraDevsOrg/kora-web-sdk@main/kora-biz-nav.js";
import { FabricationStore } from "./models/FabricationStore.js";

class FabricationApp {
  constructor() {
    this.store = new FabricationStore();
    this.content = document.getElementById("appContent");
    this.filtroEstado = "EN_PROCESO";

    // 1. Inicializar menú compartido desde el SDK
    KoraBizNav.init("fabricacion");

    // 2. Cargar vista inicial
    this.showHomeView();
  }

  // Helper para clonar templates
  loadTemplate(id) {
    this.content.innerHTML = "";
    const tmpl = document.getElementById(id);
    const clone = tmpl.content.cloneNode(true);
    this.content.appendChild(clone);
  }

  // --- VISTA 1: HUB TÁCTIL PRINCIPAL ---
  showHomeView() {
    this.loadTemplate("tmpl-home-view");

    document.getElementById("btnActionActiveOrders").onclick = () => this.showOrdersView();
    document.getElementById("btnActionNewOrder").onclick = () => this.showNewOrderView();
    document.getElementById("btnActionRoutes").onclick = () => this.showRoutesView();
  }

  // --- VISTA 2: ÓRDENES EN PROCESO ---
  showOrdersView() {
    this.loadTemplate("tmpl-orders-view");

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
    const container = document.getElementById("ordersListContainer");
    const ordenes = this.store.getOrdenes().filter(o => o.estado === this.filtroEstado);
    const operarios = this.store.getOperariosRRHH();

    if (ordenes.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:24px 16px; color:var(--text-sub);">
          <p style="font-size:0.9rem;">No hay órdenes registradas en estado: <strong>${this.filtroEstado}</strong></p>
        </div>
      `;
      return;
    }

    container.innerHTML = ordenes.map(ord => {
      const isDone = ord.estado === "TERMINADA";
      const etapaActual = ord.trazabilidad[ord.etapa_actual] || null;

      return `
        <div class="card">
          <div class="card-header-bar">
            <div>
              <strong style="color:#fff; font-size:1.1rem;">${ord.codigo}</strong>
              <div style="font-size:0.8rem; color:var(--text-sub);">${ord.ruta_nombre} • Lote: ${ord.cantidad} uds</div>
            </div>
            <span class="badge ${isDone ? 'badge-done' : 'badge-proc'}">${ord.estado}</span>
          </div>

          <div style="margin:12px 0;">
            ${ord.trazabilidad.map((t, idx) => `
              <div class="step-box ${t.completado ? 'completed' : ''}">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                  <strong>Paso ${idx + 1}:${t.nombre}</strong>
                  <span>${t.completado ? `✓ ${t.minutos}m ($${t.costo_mo})` : 'Pendiente'}</span>
                </div>
                <small style="color:var(--text-sub);">Insumo: ${t.insumo}${t.empleado_nombre ? `• Op: <strong>${t.empleado_nombre}</strong>` : ''}</small>
              </div>
            `).join('')}
          </div>

          ${!isDone && etapaActual ? `
            <div style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); border-radius:8px; padding:12px; margin-top:10px;">
              <div style="font-size:0.8rem; font-weight:700; color:var(--accent-gold); margin-bottom:8px;">
                ▶ Etapa a Completar: ${etapaActual.nombre}
              </div>
              <div style="display:grid; grid-template-columns: 2fr 1fr; gap:8px; margin-bottom:8px;">
                <select id="op_${ord.id}" class="input-field" style="margin:0;">
                  <option value="">-- Operario (RRHH) --</option>
                  ${operarios.map(op => `<option value="${op.id}">${op.nombre} ($${Math.round(op.costo_minuto)}/m)</option>`).join('')}
                </select>
                <input type="number" id="t_${ord.id}" class="input-field" style="margin:0;" placeholder="Min" value="5" min="1">
              </div>
              <button class="btn-primary" data-action="advance" data-ord="${ord.id}" data-idx="${ord.etapa_actual}">
                ✓ Notificar Avance & Liquidar MO
              </button>
            </div>
          ` : `
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:8px; margin-top:8px;">
              <span style="font-size:0.85rem; color:var(--text-sub);">Costo Mano de Obra Acumulado:</span>
              <strong style="color:var(--accent-gold); font-size:1.05rem;">$${ord.costo_mano_obra.toLocaleString()}</strong>
            </div>
          `}
        </div>
      `;
    }).join('');

    container.querySelectorAll("[data-action='advance']").forEach(btn => {
      btn.onclick = () => {
        const ordId = btn.dataset.ord;
        const idx = parseInt(btn.dataset.idx, 10);
        const opId = document.getElementById(`op_${ordId}`).value;
        const mins = parseFloat(document.getElementById(`t_${ordId}`).value) || 1;

        if (!opId) {
          alert("Selecciona el operario responsable registrado en el módulo de RRHH.");
          return;
        }

        this.store.avanzarEtapa(ordId, idx, opId, mins);
        this.renderOrdersCards();
      };
    });
  }

  // --- VISTA 3: CREAR NUEVA ORDEN ---
  showNewOrderView() {
    this.loadTemplate("tmpl-new-order-view");

    document.getElementById("btnBackHomeNewOrder").onclick = () => this.showHomeView();
    document.getElementById("btnCancelNewOrder").onclick = () => this.showHomeView();

    const rutas = this.store.getRutas();
    const selRuta = document.getElementById("ordRutaId");
    selRuta.innerHTML = rutas.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('');

    document.getElementById("newOrderForm").onsubmit = (e) => {
      e.preventDefault();
      this.store.crearOrden({
        codigo: document.getElementById("ordCodigo").value.trim(),
        rutaId: selRuta.value,
        cantidad: document.getElementById("ordCantidad").value,
        tipoFlujo: document.getElementById("ordTipoFlujo").value
      });
      this.showOrdersView();
    };
  }

  // --- VISTA 4: LISTA DE RUTAS ---
  showRoutesView() {
    this.loadTemplate("tmpl-routes-view");

    document.getElementById("btnBackHomeRoutes").onclick = () => this.showHomeView();
    document.getElementById("btnGoNewRoute").onclick = () => this.showNewRouteFormView();

    const rutas = this.store.getRutas();
    const container = document.getElementById("routesListContainer");

    container.innerHTML = rutas.map(r => `
      <div class="card">
        <strong style="color:#fff; font-size:1rem;">${r.nombre}</strong>
        <div style="font-size:0.75rem; color:var(--accent-gold); margin-bottom:8px;">${r.tipo_flujo}</div>
        <div>
          ${r.etapas.map((et, i) => `
            <div style="font-size:0.8rem; color:var(--text-sub); padding:4px 0; border-bottom:1px dashed var(--border);">
              ${i + 1}. <strong>${et.nombre}</strong> (~${et.tiempo_estimado} min) • <em>${et.insumo}</em>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // --- VISTA 5: CREAR RUTA ---
  showNewRouteFormView() {
    this.loadTemplate("tmpl-new-route-form-view");

    document.getElementById("btnBackToRoutes").onclick = () => this.showRoutesView();
    document.getElementById("btnCancelRoute").onclick = () => this.showRoutesView();

    const stepsContainer = document.getElementById("routeStepsContainer");
    const addStepRow = () => {
      const row = document.createElement("div");
      row.className = "form-grid";
      row.style.marginBottom = "8px";
      row.innerHTML = `
        <input type="text" class="input-field step-nombre" placeholder="Nombre Etapa (ej: Mezcla)" required>
        <input type="text" class="input-field step-insumo" placeholder="Insumos (ej: Harina)" required>
      `;
      stepsContainer.appendChild(row);
    };

    addStepRow();
    document.getElementById("btnAddStepRow").onclick = () => addStepRow();

    document.getElementById("newRouteForm").onsubmit = (e) => {
      e.preventDefault();
      const nombres = Array.from(document.querySelectorAll(".step-nombre")).map(i => i.value.trim());
      const insumos = Array.from(document.querySelectorAll(".step-insumo")).map(i => i.value.trim());

      const etapas = nombres.map((n, i) => ({
        nombre: n,
        insumo: insumos[i] || "Sin insumo",
        tiempo_estimado: 10
      }));

      this.store.guardarRuta({
        id: `rut_${Date.now()}`,
        nombre: document.getElementById("routeNombre").value.trim(),
        tipo_flujo: document.getElementById("routeTipoFlujo").value,
        etapas,
        updated_at: Date.now()
      });

      this.showRoutesView();
    };
  }
}

window.addEventListener("DOMContentLoaded", () => new FabricationApp());
