// js/auth.js
// Login, logout y guard de sesión con redirect por rol

import { signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { auth, db } from './config.js';

// ─── LOGIN ───────────────────────────────────────────────────────────────────
// Llamar desde index.html al hacer submit del formulario
// Retorna el perfil del usuario o lanza error con mensaje legible

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid  = cred.user.uid;

  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (!snap.exists()) throw new Error('Usuario no configurado en el sistema.');

  const perfil = snap.data();
  if (!perfil.activo) throw new Error('Usuario desactivado. Contacta al organizador.');

  // Guardar sesión local (dura hasta que cierren el navegador)
  sessionStorage.setItem('uid',    uid);
  sessionStorage.setItem('nombre', perfil.nombre);
  sessionStorage.setItem('bar',    perfil.bar);

  // Redirigir según rol
  if (perfil.bar === 'admin') {
    window.location.href = 'admin.html';
  } else {
    window.location.href = 'bar.html';
  }

  return perfil;
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────

export async function logout() {
  await signOut(auth);
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ─── GUARD ───────────────────────────────────────────────────────────────────
// Llamar al inicio de bar.html y admin.html para proteger las páginas
// Si no hay sesión → vuelve al login
// Si el rol no coincide → vuelve al login
//
// Uso en bar.html:
//   const user = requireAuth('bar');   // acepta bar1 y bar2
//
// Uso en admin.html:
//   const user = requireAuth('admin');

export function requireAuth(rolRequerido = null) {
  const uid    = sessionStorage.getItem('uid');
  const bar    = sessionStorage.getItem('bar');
  const nombre = sessionStorage.getItem('nombre');

  if (!uid || !bar) {
    window.location.href = 'index.html';
    return null;
  }

  // Admin puede ver todo
  if (bar === 'admin') {
    if (rolRequerido === 'admin' || rolRequerido === 'bar' || !rolRequerido) {
      return { uid, bar, nombre };
    }
  }

  // Bartender: solo puede acceder a la pantalla del bar
  if (rolRequerido === 'bar' && (bar === 'bar1' || bar === 'bar2')) {
    return { uid, bar, nombre };
  }

  // Rol incorrecto → fuera
  window.location.href = 'index.html';
  return null;
}

// ─── SESIÓN PERSISTENTE ───────────────────────────────────────────────────────
// Firebase mantiene la sesión de Auth entre recargas.
// Si el usuario recarga la página, onAuthStateChanged dispara antes de que
// requireAuth corra. Para páginas sensibles, puedes usar esto como doble check:
//
// onAuthStateChanged(auth, (firebaseUser) => {
//   if (!firebaseUser) window.location.href = 'index.html';
// });
