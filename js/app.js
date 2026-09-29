import { FabricationStore } from "./store.js";

class FabricationController {
  constructor() {
    this.store = new FabricationStore();
    this.mainEl = document.getElementById("appContent");
    this.filterOrdersState = "EN_PROCESO"; // 'EN_PROCESO' o 'TERMINADA'
    this.timerInterval = null;

    this.initDrawer();
    this.renderHome();
  }

  initDrawer() {
    const drawer = document.getElementById("sideDrawer");
    const backdrop = document.getElementById("drawerBackdrop");
    const btnOpen = document.getElementById("btnOpenDrawer");
    const btnClose = document.getElementById("btnCloseDrawer");

    const toggle = (open) => {
      if (drawer) drawer.classList.toggle("open", open);
      if (backdrop) backdrop.classList.toggle("active", open);
    };

    if (btnOpen) btnOpen.onclick = () => toggle(true);
    if (btnClose) btnClose.onclick = () => toggle(false);
    if (backdrop) backdrop.onclick = () => toggle(false);

    document.querySelectorAll(".drawer-item").forEach(btn => {
      btn.onclick = () => {
        toggle(false);
        const action = btn.dataset.action;
        if (action === "home") this.renderHome();
        else this.showExternalModuleNotice(btn.textContent.trim());
      };
    });

    const btnAdmin = document.getElementById("btnOpenKoraAdmin");
    if (btnAdmin) {
      btnAdmin.onclick = () => {
        toggle(false);
        window.location.href = "intent://org.koradevs.admindb/#Intent;scheme=package;end";
      };
    }
  }

  showExternalModuleNotice(modName) {
    clearInterval(this.timerInterval);
    this.mainEl.innerHTML = `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <span style="font-size: 2.5rem;">🔗</span>
        <h2 style="color: var(--accent-gold); margin: 12px 0; font-size: 1.25rem;">${modName}</h2>
        <p style="color: var(--text-sub); font-size: 0.85rem; line-height: 1.5; margin-bottom: 20px;">
          Este módulo está desacoplado para mantener el ecosistema ligero. Puedes abrirlo o instalarlo desde <strong>Kora Admin DB</strong> para compartir la misma base de datos.
        </p>
        <button id="btnReturnHomeNotice" class="btn-primary" style="width: 100%;">Volver a Fabricación</button>
      </div>
    `;
    const btn = document.getElementById("btnReturnHomeNotice");
    if (btn) btn.onclick = () => this.renderHome();
  }

  mountTemplate(tmplId) {
    clearInterval(this.timerInterval);
    this.mainEl.innerHTML = "";
    const tmpl = document.getElementById(tmplId);
    if (tmpl) this.mainEl.appendChild(tmpl.content.cloneNode(true));
  }

  // --- 1. PANTALLA PRINCIPAL: HUB ---
  renderHome() {
    this.mountTemplate("tmpl-home-view");
    document.getElementById("headerTitle").textContent = "Kora Fabricación";

    const btnOrders = document.getElementById("btnActionActiveOrders");
    const btnNewOrder = document.getElementById("btnActionNewOrder");
    const btnRoutes = document.getElementById("btnActionRoutes");
    const btnHR = document.getElementById("btnActionHR");

    if (btnOrders) btnOrders.onclick = () => this.renderActiveOrders();
    if (btnNewOrder) btnNewOrder.onclick = () => this.renderNewOrderForm();
    if (btnRoutes) btnRoutes.onclick = () => this.renderRoutesList();
    if (btnHR) btnHR.onclick = () => this.renderHR();
  }

  // --- 2. TABLERO DE ÓRDENES EN PROCESO ---
  renderActiveOrders() {
    this.mountTemplate("tmpl-active-orders-view");
    document.getElementById("headerTitle").textContent = "Órdenes Activas";

    const btnBack = document.getElementById("btnBackHomeOrders");
    if (btnBack) btnBack.onclick = () => this.renderHome();

    const btnActive = document.getElementById("btnFilterActive");
    const btnFinished = document.getElementById("btnFilterFinished");

    btnActive.onclick = () => {
      this.filterOrdersState = "EN_PROCESO";
      btnActive.classList.add("active");
      btnFinished.classList.remove("active");
      this.renderOrdersCards();
    };

    btnFinished.onclick = () => {
      this.filterOrdersState = "TERMINADA";
      btnFinished.classList.add("active");
      btnActive.classList.remove("active");
      this.renderOrdersCards();
    };

    this.renderOrdersCards();
  }

  renderOrdersCards() {
    const container = document.getElementById("ordersCardsContainer");
    const ordenes = this.store.getOrdenes(this.filterOrdersState);
    const rutas = this.store.getRutas();
    const items = this.store.getItems();
    const empleados = this.store.getEmpleados();

    if (ordenes.length === 0) {
      container.innerHTML = `<div class="card" style="text-align:center; color:var(--text-sub); padding:30px;">No hay órdenes en estado: <strong>${this.filterOrdersState}</strong>.</div>`;
      return;
    }

    container.innerHTML = ordenes.map(ord => {
      const ruta = rutas.find(r => String(r.id) === String(ord.ruta_id)) || { nombre: "Ruta", etapas: [] };
      const producto = items.find(i => String(i.id) === String(ord.material_terminado_id)) || { nombre: "Producto", unidad_medida: "ud" };
      const isFinished = ord.estado === "TERMINADA";

      // Timeline de etapas
      const timelineHtml = ruta.etapas.map(etp => {
        let cls = "stage-pill";
        if (etp.secuencia < ord.etapa_actual_secuencia || isFinished) cls += " done";
        else if (etp.secuencia === ord.etapa_actual_secuencia) cls += " current";
        return `<span class="${cls}">${etp.secuencia}. ${etp.nombre_etapa}</span>`;
      }).join("");

      // Etapa actual
      const trazaActual = ord.trazabilidad.find(t => t.secuencia === ord.etapa_actual_secuencia);
      const etapaActualNombre = trazaActual ? trazaActual.etapa_nombre : "Finalizado";

      return `
        <div class="order-card ${isFinished ? 'finished' : ''}" data-id="${ord.id}">
          <div class="order-header">
            <div>
              <span class="order-code">${ord.codigo_seguimiento}</span>
              <div style="font-size:0.85rem; color:#fff; font-weight:700; margin-top:2px;">
                ${ord.cantidad_a_producir} ${producto.unidad_medida} de ${producto.nombre}
              </div>
            </div>
            <span class="badge ${isFinished ? 'badge-done' : 'badge-active'}">${ord.estado}</span>
          </div>

          <div class="stage-timeline">${timelineHtml}</div>

          ${!isFinished ? `
            <div class="timer-box">
              <div>
                <small style="color:var(--text-sub); display:block;">Etapa en curso:</small>
                <strong style="color:var(--accent-gold); font-size:0.95rem;">${etapaActualNombre}</strong>
              </div>
              <div class="timer-val" data-start="${trazaActual ? trazaActual.hora_inicio : Date.now()}">00:00</div>
            </div>

            <div style="margin-top:12px; display:flex; gap:8px;">
              <select class="input-field select-operario" style="flex:1; padding:8px;">
                <option value="">Operario / Colaborador...</option>
                ${empleados.map(e => `<option value="${e.id}">${e.nombre} ($${e.costo_minuto}/min)</option>`).join("")}
              </select>
              <button class="btn-primary btn-sm btn-advance-stage" data-id="${ord.id}" style="white-space:nowrap;">
                ✓ Completar y Avanzar
              </button>
            </div>
          ` : `
            <div style="font-size:0.8rem; color:var(--text-sub); margin-top:8px;">
              Finalizado el: ${new Date(ord.fecha_finalizacion).toLocaleString()}<br>               Costo Mano de Obra: <strong style="color:var(--accent-green);">$${Math.round(ord.costo_mano_obra_acumulado).toLocaleString()}</strong>
            </div>
          `}
        </div>
      `;
    }).join("");

    // Conectar botones de avance
    container.querySelectorAll(".btn-advance-stage").forEach(btn => {
      btn.onclick = () => {
        const ordId = btn.dataset.id;
        const card = btn.closest(".order-card");
        const empSelect = card.querySelector(".select-operario");
        const empId = empSelect ? empSelect.value : null;

        this.store.avanzarEtapaOrden(ordId, empId);
        this.renderOrdersCards();
      };
    });

    // Iniciar cronómetro dinámico en pantalla
    this.startLiveTimers();
  }

  startLiveTimers() {
    clearInterval(this.timerInterval);
    const updateTimers = () => {
      document.querySelectorAll(".timer-val").forEach(el => {
        const start = Number(el.dataset.start);
        if (start) {
          const diff = Math.floor((Date.now() - start) / 1000);
          const mins = String(Math.floor(diff / 60)).padStart(2, "0");
          const secs = String(diff % 60).padStart(2, "0");
          el.textContent = `${mins}:${secs}`;
        }
      });
    };
    updateTimers();
    this.timerInterval = setInterval(updateTimers, 1000);
  }

  // --- 3. FORMULARIO: CREAR NUEVA ORDEN ---
  renderNewOrderForm() {
    const rutas = this.store.getRutas();
    if (rutas.length === 0) {
      alert("Atención: Primero debes crear una Ruta de Trabajo antes de abrir órdenes.");
      this.renderRoutesList();
      return;
    }

    this.mountTemplate("tmpl-new-order-view");
    document.getElementById("headerTitle").textContent = "Nueva Orden";

    const selRuta = document.getElementById("ordRutaId");
    selRuta.innerHTML = rutas.map(r => `<option value="${r.id}">${r.nombre} (${r.tipo_proceso})</option>`).join("");

    const btnBack = document.getElementById("btnBackHomeNewOrder");
    const btnCancel = document.getElementById("btnCancelNewOrder");
    if (btnBack) btnBack.onclick = () => this.renderHome();
    if (btnCancel) btnCancel.onclick = () => this.renderHome();

    const form = document.getElementById("newOrderForm");
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const codigo = document.getElementById("ordCodigo").value.trim();
        const rutaId = selRuta.value;
        const cantidad = parseFloat(document.getElementById("ordCantidad").value) || 1;
        const tipoFlujo = document.getElementById("ordTipoFlujo").value;

        this.store.createOrden(rutaId, cantidad, codigo, tipoFlujo);
        this.filterOrdersState = "EN_PROCESO";
        this.renderActiveOrders();
      };
    }
  }

  // --- 4. LISTADO Y CREACIÓN DE RUTAS ---
  renderRoutesList() {
    this.mountTemplate("tmpl-routes-view");
    document.getElementById("headerTitle").textContent = "Rutas de Fabricación";

    const btnBack = document.getElementById("btnBackHomeRoutes");
    if (btnBack) btnBack.onclick = () => this.renderHome();

    const btnNew = document.getElementById("btnGoNewRoute");
    if (btnNew) btnNew.onclick = () => this.renderNewRouteForm();

    const container = document.getElementById("routesListContainer");
    const rutas = this.store.getRutas();
    const items = this.store.getItems();

    if (rutas.length === 0) {
      container.innerHTML = `<div class="card" style="text-align:center; color:var(--text-sub); padding:30px;">No hay rutas configuradas.</div>`;
      return;
    }

    container.innerHTML = rutas.map(r => {
      const prod = items.find(i => String(i.id) === String(r.material_terminado_id)) || { nombre: "Producto" };
      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
            <h3 style="color:var(--accent-gold); font-size:1.05rem;">${r.nombre}</h3>
            <span class="badge badge-raw">${r.tipo_proceso}</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-sub); margin-bottom:10px;">
            Produce: <strong>${prod.nombre}</strong> • ${r.etapas.length} Etapas configuradas
          </p>
          <div style="font-size:0.8rem; background:var(--surface-accent); padding:10px; border-radius:8px;">
            ${r.etapas.map(e => `<div>${e.secuencia}. <strong>${e.nombre_etapa}</strong> (~${e.tiempo_estimado_min} min)</div>`).join("")}
          </div>
        </div>
      `;
    }).join("");
  }

  renderNewRouteForm() {
    const items = this.store.getItems();
    const finishedItems = items.filter(i => i.tipo === "PRODUCTO_TERMINADO");
    const rawItems = items.filter(i => i.tipo === "MATERIA_PRIMA");

    this.mountTemplate("tmpl-new-route-form-view");
    document.getElementById("headerTitle").textContent = "Nueva Ruta";

    const selMat = document.getElementById("routeMaterialId");
    selMat.innerHTML = (finishedItems.length > 0 ? finishedItems : items).map(i => `<option value="${i.id}">${i.nombre}</option>`).join("");

    const stepsContainer = document.getElementById("routeStepsContainer");
    let stepCount = 0;

    const addStepRow = () => {
      stepCount++;
      const row = document.createElement("div");
      row.className = "card";
      row.style.background = "var(--surface-accent)";
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:var(--accent-gold); font-size:0.85rem;">Etapa #${stepCount}</strong>
          ${stepCount > 1 ? '<button type="button" class="btn-icon btn-del-step" style="font-size:1rem; color:#fca5a5;">✕</button>' : ''}
        </div>
        <div class="form-grid">
          <input type="text" class="input-field inp-step-name" placeholder="Nombre etapa (ej. Fritura)" required>
          <input type="number" class="input-field inp-step-time" placeholder="Tiempo est. (min)" value="15">
        </div>
        <div style="margin-top:8px;">
          <small style="color:var(--text-sub); display:block; margin-bottom:4px;">Insumo que descuenta por unidad (Opcional):</small>
          <div style="display:flex; gap:6px;">
            <select class="input-field inp-step-mat" style="flex:2;">
              <option value="">Ninguno (Solo mano de obra)...</option>
              ${rawItems.map(m => `<option value="${m.id}">${m.nombre} (${m.unidad_medida})</option>`).join("")}
            </select>
            <input type="number" step="any" class="input-field inp-step-qty" style="flex:1;" placeholder="Cant/Ud">
          </div>
        </div>
      `;

      const delBtn = row.querySelector(".btn-del-step");
      if (delBtn) delBtn.onclick = () => row.remove();
      stepsContainer.appendChild(row);
    };

    document.getElementById("btnAddStepRow").onclick = addStepRow;
    addStepRow(); // Primera etapa obligatoria

    const btnBack = document.getElementById("btnBackToRoutes");
    const btnCancel = document.getElementById("btnCancelRoute");
    if (btnBack) btnBack.onclick = () => this.renderRoutesList();
    if (btnCancel) btnCancel.onclick = () => this.renderRoutesList();

    const form = document.getElementById("newRouteForm");
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const rows = stepsContainer.querySelectorAll(".card");
        const etapas = [];

        rows.forEach((r, idx) => {
          const name = r.querySelector(".inp-step-name").value.trim();
          const time = parseInt(r.querySelector(".inp-step-time").value, 10) || 0;
          const matId = r.querySelector(".inp-step-mat").value;
          const matQty = parseFloat(r.querySelector(".inp-step-qty").value) || 0;

          const materiales = [];
          if (matId && matQty > 0) {
            materiales.push({ material_id: matId, cantidad_unitaria: matQty });
          }

          if (name) {
            etapas.push({
              secuencia: idx + 1,
              nombre_etapa: name,
              tiempo_estimado_min: time,
              materiales_a_descontar: materiales
            });
          }
        });

        if (etapas.length === 0) {
          alert("Debes agregar al menos una etapa.");
          return;
        }

        this.store.saveRuta({
          nombre: document.getElementById("routeNombre").value.trim(),
          material_terminado_id: selMat.value,
          tipo_proceso: document.getElementById("routeTipoProceso").value
        }, etapas);

        this.renderRoutesList();
      };
    }
  }

  // --- 5. GESTIÓN HUMANA (HR) ---
  renderHR() {
    this.mountTemplate("tmpl-hr-view");
    document.getElementById("headerTitle").textContent = "Gestión Humana";

    const btnBack = document.getElementById("btnBackHomeHR");
    if (btnBack) btnBack.onclick = () => this.renderHome();

    const tbody = document.getElementById("hrTbody");
    const empleados = this.store.getEmpleados();

    tbody.innerHTML = empleados.map(e => `
      <tr>
        <td><strong>${e.nombre}</strong></td>
        <td><span class="badge badge-finished">${e.rol}</span></td>
        <td><strong>$ ${Math.round(e.costo_minuto).toLocaleString()}</strong> / min</td>
      </tr>
    `).join("");

    const form = document.getElementById("hrForm");
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        this.store.saveEmpleado({
          nombre: document.getElementById("hrNombre").value.trim(),
          rol: document.getElementById("hrRol").value.trim(),
          costo_minuto: parseFloat(document.getElementById("hrCostoMinuto").value) || 100
        });
        this.renderHR();
      };
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new FabricationController();
});
