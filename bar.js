// js/bar.js
// Lógica completa del POS: carga productos, escucha stock, registra ventas en Firebase
// Soporta múltiples usuarios por bar (increment() evita conflictos concurrentes)

import {
  doc, getDoc, addDoc, updateDoc,
  collection, onSnapshot,
  increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './config.js';
import { requireAuth, logout } from './auth.js';

// ─── ESTADO LOCAL ─────────────────────────────────────────────────────────────

let USER     = null;   // { uid, bar, nombre }
let PRODS    = [];     // array de productos desde /config/productos
let SIDX     = -1;     // índice del producto seleccionado
let QTY      = 1;      // cantidad actual
let registrando = false; // lock para evitar doble registro

// ─── INIT ─────────────────────────────────────────────────────────────────────

export async function initBar() {
  // 1. Verificar sesión
  USER = requireAuth('bar');
  if (!USER) return;

  // Mostrar nombre del bar y usuario en header
  document.getElementById('bar-badge').textContent =
    USER.bar === 'bar1' ? 'BAR 1' : 'BAR 2';
  document.getElementById('user-name').textContent = USER.nombre;

  // 2. Cargar productos desde /config/productos (se cachea automáticamente)
  const snap = await getDoc(doc(db, 'config', 'productos'));
  if (!snap.exists()) { alert('Error: configuración no encontrada.'); return; }
  PRODS = snap.data().items;

  renderProducts();

  // 3. Escuchar stock en tiempo real del bar de este usuario
  listenStock();

  // 4. Clock
  startClock();
}

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

function renderProducts() {
  const container = document.getElementById('product-list');
  container.innerHTML = '';

  PRODS.forEach((p, i) => {
    const sinStock = p.stock_ini_vasos === 0;
    const btn = document.createElement('button');
    btn.className = 'pb' + (sinStock ? ' disabled' : '');
    btn.id = 'pb' + i;
    btn.disabled = sinStock;
    btn.onclick = () => selectProduct(i);

    const precioTexto = p.precios
      .map(pr => `$${pr.precio}×${pr.qty}`)
      .join(' / ');

    btn.innerHTML = `
      <div class="pk">${i + 1}</div>
      <div class="pi">
        <div class="pname">${p.nombre}</div>
        <div class="pdesc">${sinStock ? 'Sin stock confirmado' : '12 oz · ' + p.tipo}</div>
      </div>
      <div class="ppr">${precioTexto}</div>
    `;
    container.appendChild(btn);
  });
}

// ─── STOCK EN TIEMPO REAL ─────────────────────────────────────────────────────
// Solo escucha el documento de su bar — muy poco tráfico (~100 bytes por cambio)

function listenStock() {
  const estadoRef = doc(db, 'estado', USER.bar);

  onSnapshot(estadoRef, (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();

    // Actualizar chips de stock restante
    // Stock restante = inicial − vendidos en ESTE bar
    // Nota: el admin ve ambos bares sumados; el bartender solo ve su bar
    PRODS.forEach((p, i) => {
      const vendidos = d[p.id + (p.tipo === 'corona' ? '_unidades' : '_vasos')] || 0;
      const restantes = Math.max(0, p.stock_ini_vasos - vendidos);
      const el = document.getElementById('sn-' + p.id);
      const chip = document.getElementById('chip-' + p.id);
      if (!el) return;

      if (restantes === 0 && p.tipo !== 'corona') {
        el.textContent = '—';
        el.className = 'sn pend';
      } else {
        el.textContent = restantes.toLocaleString();
        el.className = 'sn' + (restantes <= 50 ? ' warn' : restantes === 0 ? ' low' : '');
        if (chip) chip.className = 'sc' + (restantes <= 50 ? ' warn' : '');
      }
    });
  });
}

// ─── SELECCIÓN DE PRODUCTO ───────────────────────────────────────────────────

export function selectProduct(i) {
  if (PRODS[i].stock_ini_vasos === 0) return;
  SIDX = i;
  document.querySelectorAll('.pb').forEach((b, j) => {
    if (!PRODS[j] || PRODS[j].stock_ini_vasos === 0) return;
    b.classList.toggle('active', j === i);
  });
  updateVentaUI();
}

// ─── CANTIDAD ─────────────────────────────────────────────────────────────────

export function changeQty(delta) {
  QTY = Math.max(1, Math.min(30, QTY + delta));
  updateVentaUI();
}

// ─── CÁLCULO DE PRECIO ────────────────────────────────────────────────────────

function calcPrice(prod, qty) {
  // Busca el mejor precio según cantidad
  // Ejemplo: 2 cócteles → usa precio de qty:2 ($10) una vez → $10
  // Ejemplo: 3 cócteles → 1 combo×$10 + 1 suelto×$6 = $16
  const precios = [...prod.precios].sort((a, b) => b.qty - a.qty);
  let remaining = qty;
  let total = 0;
  for (const p of precios) {
    const combos = Math.floor(remaining / p.qty);
    total += combos * p.precio;
    remaining -= combos * p.qty;
  }
  return total;
}

function isCombo(prod, qty) {
  return prod.precios.some(p => p.qty > 1 && qty % p.qty === 0);
}

// ─── ACTUALIZAR UI DE VENTA ───────────────────────────────────────────────────

export function updateVentaUI() {
  document.getElementById('qv').textContent = QTY;
  const regBtn = document.getElementById('rbtn');

  if (SIDX >= 0) {
    const p = PRODS[SIDX];
    const pr = calcPrice(p, QTY);
    document.getElementById('pval').textContent = '$' + pr.toFixed(2);
    const cb = document.getElementById('cb');
    if (cb) cb.style.display = isCombo(p, QTY) ? 'inline' : 'none';
    regBtn.disabled = false;
  } else {
    document.getElementById('pval').textContent = '—';
    regBtn.disabled = true;
  }

  calcVuelto();
}

// ─── VUELTO ───────────────────────────────────────────────────────────────────

export function calcVuelto() {
  const rec = parseFloat(document.getElementById('rec')?.value);
  const row = document.getElementById('vr');
  const val = document.getElementById('vv');
  if (!row || !val) return;

  if (!isNaN(rec) && SIDX >= 0) {
    const pr = calcPrice(PRODS[SIDX], QTY);
    const vuelto = rec - pr;
    row.classList.add('show');
    val.textContent = '$' + Math.abs(vuelto).toFixed(2) + (vuelto < 0 ? ' (falta)' : '');
    val.className = 'vuelto ' + (vuelto >= 0 ? 'ok' : 'bad');
  } else {
    row.classList.remove('show');
  }
}

// ─── REGISTRAR VENTA ──────────────────────────────────────────────────────────
// 2 escrituras atómicas:
//   1. addDoc → /ventas/{autoId}  (historial individual con nombre del vendedor)
//   2. updateDoc con increment() → /estado/{bar}  (contadores del bar, sin conflicto concurrente)

export async function registerSale() {
  if (SIDX < 0 || registrando) return;
  registrando = true;

  const prod = PRODS[SIDX];
  const total = calcPrice(prod, QTY);
  const combo = isCombo(prod, QTY);

  const campoStock = prod.id + (prod.tipo === 'corona' ? '_unidades' : '_vasos');

  try {
    // Escritura 1: historial detallado
    await addDoc(collection(db, 'ventas'), {
      bar:            USER.bar,
      producto:       prod.id,
      producto_nombre: prod.nombre,
      cantidad:       QTY,
      combo:          combo,
      total:          total,
      usuario_uid:    USER.uid,
      usuario_nombre: USER.nombre,
      ts:             serverTimestamp(),
    });

    // Escritura 2: contadores del bar (increment es atómico → seguro con múltiples usuarios)
    await updateDoc(doc(db, 'estado', USER.bar), {
      [campoStock]:  increment(QTY),
      total_dinero:  increment(total),
      ultima_venta:  serverTimestamp(),
    });

    showToast('✓ ' + QTY + '× ' + prod.nombre + ' — $' + total.toFixed(2), 'ok');
    resetVenta();

  } catch (err) {
    console.error('Error al registrar:', err);
    showToast('Error al guardar. Intenta de nuevo.', 'err');
  } finally {
    registrando = false;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function resetVenta() {
  QTY = 1;
  const recEl = document.getElementById('rec');
  if (recEl) recEl.value = '';
  const vrEl = document.getElementById('vr');
  if (vrEl) vrEl.classList.remove('show');
  updateVentaUI();
}

let toastTimer;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function startClock() {
  const tick = () => {
    const n = new Date();
    const el = document.getElementById('clk');
    if (el) el.textContent =
      n.getHours().toString().padStart(2, '0') + ':' +
      n.getMinutes().toString().padStart(2, '0');
  };
  tick();
  setInterval(tick, 10000);
}

// Atajos de teclado
document.addEventListener('keydown', e => {
  if (document.activeElement.tagName === 'INPUT') return;
  const num = parseInt(e.key);
  if (num >= 1 && num <= PRODS.length) selectProduct(num - 1);
  if (e.key === '+' || e.key === '=') changeQty(1);
  if (e.key === '-') changeQty(-1);
  if (e.key === 'Enter') registerSale();
});

export { logout };
