// js/admin.js
// Panel del contador: escucha en tiempo real ambos bares, calcula botellas restantes

import {
  doc, collection,
  onSnapshot, query, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './config.js';
import { requireAuth, logout } from './auth.js';

// ─── ESTADO ──────────────────────────────────────────────────────────────────

let CONFIG = null;   // productos desde /config/productos
let BAR1   = {};     // estado actual de bar1
let BAR2   = {};     // estado actual de bar2

// ─── INIT ─────────────────────────────────────────────────────────────────────

export async function initAdmin() {
  const user = requireAuth('admin');
  if (!user) return;

  startClock();

  // Cargar config (con caché offline)
  const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const snap = await getDoc(doc(db, 'config', 'productos'));
  CONFIG = snap.exists() ? snap.data().items : [];

  // Escuchar ambos bares y el historial en paralelo
  listenEstado('bar1');
  listenEstado('bar2');
  listenHistorial();
}

// ─── ESTADO EN TIEMPO REAL ────────────────────────────────────────────────────

function listenEstado(barId) {
  onSnapshot(doc(db, 'estado', barId), (snap) => {
    if (!snap.exists()) return;
    if (barId === 'bar1') BAR1 = snap.data();
    else                  BAR2 = snap.data();
    renderTodo();
  });
}

// ─── HISTORIAL ────────────────────────────────────────────────────────────────
// Solo carga las últimas 40 ventas, paginado — mínimo tráfico

function listenHistorial() {
  const q = query(
    collection(db, 'ventas'),
    orderBy('ts', 'desc'),
    limit(40),
  );

  onSnapshot(q, (snap) => {
    const ventas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHistorial(ventas);
  });
}

// ─── RENDER COMPLETO ─────────────────────────────────────────────────────────

function renderTodo() {
  // Totales globales
  const totalDinero = (BAR1.total_dinero || 0) + (BAR2.total_dinero || 0);
  const totalUnidades = sumarTodas('_vasos') + sumarTodas('_unidades');
  const transacciones = document.getElementById('m-sales');
  // Transacciones se actualiza desde el historial

  setEl('m-tot', '$' + totalDinero.toLocaleString());
  setEl('m-cups', totalUnidades.toLocaleString());

  // Por bar
  renderBar('b1', BAR1, 'blu');
  renderBar('b2', BAR2, 'grn');

  // Stock restante + botellas
  renderStock();

  // Alerta si algún stock llega al 15%
  const alertEl = document.getElementById('alert');
  if (alertEl) {
    const hayAlerta = CONFIG.some(p => {
      const vendidos = vendidosTotales(p);
      const restantes = p.stock_ini_vasos - vendidos;
      return p.stock_ini_vasos > 0 && restantes / p.stock_ini_vasos <= 0.15;
    });
    alertEl.classList.toggle('show', hayAlerta);
  }
}

function sumarTodas(sufijo) {
  let total = 0;
  CONFIG.forEach(p => {
    const campo = p.id + sufijo;
    total += (BAR1[campo] || 0) + (BAR2[campo] || 0);
  });
  return total;
}

function vendidosTotales(prod) {
  const sfx = prod.tipo === 'corona' ? '_unidades' : '_vasos';
  return (BAR1[prod.id + sfx] || 0) + (BAR2[prod.id + sfx] || 0);
}

// ─── RENDER POR BAR ──────────────────────────────────────────────────────────

function renderBar(prefix, estado, colorClass) {
  setEl(prefix + '-tot', '$' + (estado.total_dinero || 0).toLocaleString());

  CONFIG.forEach(p => {
    const sfx    = p.tipo === 'corona' ? '_unidades' : '_vasos';
    const val    = estado[p.id + sfx] || 0;
    const unidad = p.tipo === 'corona' ? 'unid.' : 'vasos';
    const elId   = prefix + '-' + p.id;
    setEl(elId, val + ' ' + unidad);

    const barEl = document.getElementById(elId + 'b');
    if (barEl) {
      const max = Math.max(
        estado.arrecho_vasos || 0,
        estado.russkaya_vasos || 0,
        estado.corona_unidades || 0,
        1,
      );
      barEl.style.width = (val / max * 100) + '%';
    }
  });
}

// ─── STOCK RESTANTE + BOTELLAS ───────────────────────────────────────────────

function renderStock() {
  CONFIG.forEach(p => {
    const vendidos  = vendidosTotales(p);
    const restantes = Math.max(0, p.stock_ini_vasos - vendidos);
    const pct       = p.stock_ini_vasos > 0
      ? Math.round(restantes / p.stock_ini_vasos * 100)
      : 0;

    // Vasos / unidades restantes
    setEl('st-' + p.id, restantes === 0 ? '—' : restantes.toLocaleString());

    // Botellas restantes (solo para cócteles)
    const botEl = document.getElementById('st-' + p.id + '-bot');
    if (botEl) {
      if (p.tipo === 'corona') {
        botEl.textContent = '';
      } else {
        const botRest    = Math.ceil(restantes / p.vasos_por_botella);
        const botInicial = p.botellas_ini;
        const botVend    = botInicial - botRest;
        botEl.textContent =
          botRest + ' bot. restantes · ' + botVend + ' usadas';
      }
    }

    // Barra de progreso con color dinámico
    const fillEl = document.getElementById('st-' + p.id + '-bar');
    if (fillEl) {
      fillEl.style.width = pct + '%';
      fillEl.style.background =
        pct <= 15 ? 'var(--red)' :
        pct <= 40 ? 'var(--amb)' :
        'var(--grn)';
    }

    // Porcentaje texto
    setEl('st-' + p.id + '-pct',
      p.stock_ini_vasos === 0
        ? 'pendiente confirmación'
        : pct + '% disponible');
  });
}

// ─── HISTORIAL ────────────────────────────────────────────────────────────────

function renderHistorial(ventas) {
  const list = document.getElementById('hlist');
  const countEl = document.getElementById('hcount');
  if (!list) return;

  // Actualizar métrica de transacciones
  setEl('m-sales', ventas.length.toString());
  if (countEl) countEl.textContent = ventas.length + ' registros';

  // Ticket promedio
  if (ventas.length > 0) {
    const totalDinero = (BAR1.total_dinero || 0) + (BAR2.total_dinero || 0);
    setEl('m-avg', '$' + (totalDinero / ventas.length).toFixed(2));
  }

  if (ventas.length === 0) {
    list.innerHTML = '<div class="empty">Esperando primeras ventas...</div>';
    return;
  }

  list.innerHTML = ventas.map(v => {
    const ts = v.ts?.toDate?.();
    const hora = ts
      ? ts.getHours().toString().padStart(2, '0') + ':' + ts.getMinutes().toString().padStart(2, '0')
      : '--:--';
    return `
      <div class="hrow">
        <span class="htime">${hora}</span>
        <span class="hbadge b${v.bar === 'bar1' ? '1' : '2'}">${v.bar === 'bar1' ? 'Bar 1' : 'Bar 2'}</span>
        <span class="huser">${v.usuario_nombre || ''}</span>
        <span class="hprod">${v.producto_nombre || v.producto}</span>
        <span class="hqty">×${v.cantidad}</span>
        <span class="htotal">$${v.total}</span>
      </div>`;
  }).join('');
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function startClock() {
  const tick = () => {
    const n = new Date();
    setEl('clk',
      n.getHours().toString().padStart(2, '0') + ':' +
      n.getMinutes().toString().padStart(2, '0'));
  };
  tick();
  setInterval(tick, 10000);
}

export { logout };
