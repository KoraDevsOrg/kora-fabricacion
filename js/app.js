/**
 * Controlador de Fabricación
 * Consume el SDK KoraBizNav alojado en kora-web-sdk
 */
import { KoraBizNav } from "https://cdn.jsdelivr.net/gh/KoraDevsOrg/kora-web-sdk@main/kora-biz-nav.js";
import { FabricationStore } from "./models/FabricationStore.js";

class FabricationApp {
  constructor() {
    this.store = new FabricationStore();
    this.container = document.getElementById("appMain");
    this.activeTab = "ordenes";

    // 1. Inicializa el menú común de la suite marcando este módulo
    KoraBizNav.init("fabricacion");

    // 2. Control de pestañas
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeTab = btn.dataset.tab;
        this.render();
      };
    });

    this.render();
  }

  render() {
    if (this.activeTab === "ordenes") this.renderOrdenes();
    if (this.activeTab === "nueva") this.renderNueva();
    if (this.activeTab === "rutas") this.renderRutas();
  }

  renderOrdenes() {
    const ordenes = this.store.getOrdenes();
    const operarios = this.store.getOperariosRRHH();

    if (ordenes.length === 0) {
      this.container.innerHTML = `
        <div class="card" style="text-align:center; padding:32px 16px; color:#94a3b8;">
          <span style="font-size:2.5rem;">⚙️</span>
          <h2 style="color:#fff; margin:10px 0;">Sin órdenes activas</h2>
          <p style="font-size:0.85rem;">Crea una orden para registrar tiempos y liquidar mano de obra.</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = ordenes.map(ord => {
      const isDone = ord.estado === "TERMINADA";
      const etapaActual = ord.trazabilidad[ord.etapa_actual] || null;

      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong style="color:#fff; font-size:1.1rem;">${ord.codigo}</strong>
              <div style="font-size:0.8rem; color:#94a3b8;">${ord.ruta_nombre} • Cant: ${ord.cantidad}</div>
            </div>
            <span class="badge ${isDone ? 'badge-done' : 'badge-proc'}">${ord.estado}</span>
          </div>

          <div style="margin:12px 0;">
            ${ord.trazabilidad.map((t, idx) => `
              <div class="step-item ${t.completado ? 'done' : ''}">
                <div style="display:flex; justify-content:space-between;">
                  <span><strong>${idx + 1}. ${t.nombre}</strong> (${t.insumo})</span>
                  <span>${t.completado ? `✓ ${t.minutos}m ($${t.costo_mo})` : 'Pendiente'}</span>
                </div>
                ${t.empleado_nombre ? `<small style="color:#f59e0b;">Operario: ${t.empleado_nombre}</small>` : ''}
              </div>
            `).join('')}
          </div>

          ${!isDone && etapaActual ? `
            <div style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.2); border-radius:8px; padding:12px;">
              <div style="font-size:0.8rem; font-weight:700; color:#f59e0b; margin-bottom:8px;">
                ▶ Etapa Actual: ${etapaActual.nombre}
              </div>
              <div style="display:grid; grid-template-columns: 2fr 1fr; gap:8px; margin-bottom:8px;">
                <select id="op_${ord.id}" class="input-ctrl">
                  <option value="">-- Operario (mod_hr_empleados) --</option>
                  ${operarios.map(op => `<option value="${op.id}">${op.nombre} ($${Math.round(op.costo_minuto)}/min)</option>`).join('')}
                </select>
                <input type="number" id="t_${ord.id}" class="input-ctrl" placeholder="Min" value="5" min="1">
              </div>
              <button class="btn-primary" data-action="advance" data-ord="${ord.id}" data-idx="${ord.etapa_actual}">
                ✓ Completar Etapa & Liquidar MO
              </button>
            </div>
          ` : `
            <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:1px solid #334155; font-size:0.85rem;">
              <span style="color:#94a3b8;">Costo Mano de Obra:</span>
              <strong style="color:#f59e0b;">$${ord.costo_mano_obra.toLocaleString()}</strong>
            </div>
          `}
        </div>
      `;
    }).join('');

    document.querySelectorAll("[data-action='advance']").forEach(btn => {
      btn.onclick = () => {
        const ordId = btn.dataset.ord;
        const idx = parseInt(btn.dataset.idx, 10);
        const opId = document.getElementById(`op_${ordId}`).value;
        const mins = parseFloat(document.getElementById(`t_${ordId}`).value) || 1;

        if (!opId) {
          alert("Debes seleccionar un operario registrado en RRHH.");
          return;
        }

        this.store.avanzarEtapa(ordId, idx, opId, mins);
        this.render();
      };
    });
  }

  renderNueva() {
    const rutas = this.store.getRutas();
    this.container.innerHTML = `
      <div class="card">
        <h2 style="font-size:1.1rem; color:#fff; margin-bottom:12px;">Crear Orden de Fabricación</h2>
        <form id="fNewOrd">
          <div style="margin-bottom:10px;">
            <label style="font-size:0.8rem; color:#94a3b8;">Identificador / Código:</label>
            <input type="text" id="nCode" class="input-ctrl" placeholder="Ej: ORD-042 o PLACA-XYZ" required>
          </div>
          <div style="margin-bottom:10px;">
            <label style="font-size:0.8rem; color:#94a3b8;">Ruta de Producción:</label>
            <select id="nRoute" class="input-ctrl" required>
              ${rutas.map(r => `<option value="${r.id}">${r.nombre} (${r.tipo_flujo})</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:0.8rem; color:#94a3b8;">Cantidad:</label>
            <input type="number" id="nQty" class="input-ctrl" value="1" min="1" required>
          </div>
          <button type="submit" class="btn-primary">Lanzar Orden</button>
        </form>
      </div>
    `;

    document.getElementById("fNewOrd").onsubmit = (e) => {
      e.preventDefault();
      this.store.crearOrden({
        codigo: document.getElementById("nCode").value.trim(),
        rutaId: document.getElementById("nRoute").value,
        cantidad: document.getElementById("nQty").value
      });
      this.activeTab = "ordenes";
      document.querySelectorAll(".tab-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
      this.render();
    };
  }

  renderRutas() {
    const rutas = this.store.getRutas();
    this.container.innerHTML = rutas.map(r => `
      <div class="card">
        <strong style="color:#fff;">${r.nombre}</strong>
        <div style="font-size:0.75rem; color:#f59e0b; margin-bottom:8px;">${r.tipo_flujo}</div>
        ${r.etapas.map((et, i) => `
          <div style="font-size:0.8rem; color:#94a3b8; padding:4px 0; border-bottom:1px dashed #334155;">
            ${i + 1}. <strong>${et.nombre}</strong> (~${et.tiempo_min} min) • <em>${et.insumo}</em>
          </div>
        `).join('')}
      </div>
    `).join('');
  }
}

window.addEventListener("DOMContentLoaded", () => new FabricationApp());
