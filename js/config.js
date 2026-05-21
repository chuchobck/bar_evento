// js/config.js
// ─── Reemplaza los valores con los de tu proyecto en Firebase Console ───────
// Firebase Console → Configuración del proyecto → Tus apps → SDK de Firebase

import { initializeApp }                        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }                               from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence }
                                                 from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCB82WoPFE8pCeNLhRyqD8AOwFHiIvsJFY",
  authDomain: "bar-evento.firebaseapp.com",
  projectId: "bar-evento",
  storageBucket: "bar-evento.firebasestorage.app",
  messagingSenderId: "183212658361",
  appId: "1:183212658361:web:5ea74371a58f382c435568"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);

// Caché offline — si cae la señal, las ventas se guardan localmente
// y se sincronizan solas cuando vuelve internet
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Offline: múltiples pestañas abiertas, solo una puede cachear.');
  } else if (err.code === 'unimplemented') {
    console.warn('Offline: este navegador no soporta persistencia.');
  }
});

// ─── Estructura esperada en Firestore ────────────────────────────────────────
//
// /config/productos  → { items: [ {id, nombre, tipo, stock_ini_vasos,
//                                  botellas_ini, vasos_por_botella, precios} ] }
//
// /usuarios/{uid}    → { nombre: string, bar: "bar1"|"bar2"|"admin", activo: bool }
//
// /estado/bar1       → { arrecho_vasos: 0, russkaya_vasos: 0,
//                         corona_unidades: 0, total_dinero: 0, ultima_venta: null }
// /estado/bar2       → (mismo esquema)
//
// /ventas/{autoId}   → { bar, producto, cantidad, combo, total,
//                         usuario_uid, usuario_nombre, ts }
//
// ─────────────────────────────────────────────────────────────────────────────
