# Bar Evento — Sistema de contabilidad

Sistema web para contabilidad de ventas en evento de bar con 2 barras.  
Stack: HTML + CSS + JS vanilla · Firebase Auth + Firestore · Vercel

---

## Estructura del repositorio

```
bar-evento/
├── index.html          ← Login (usuario y contraseña)
├── bar.html            ← POS para bartenders (Bar 1 y Bar 2)
├── admin.html          ← Panel del contador con botellas restantes
├── js/
│   ├── config.js       ← Inicialización Firebase + persistencia offline
│   ├── auth.js         ← Login, logout, guard de sesión
│   ├── bar.js          ← Lógica POS: stock, precios, combos, Firebase writes
│   └── admin.js        ← Listeners tiempo real, cálculo botellas, historial
├── firestore.rules     ← Reglas de seguridad Firestore
├── .gitignore
└── README.md
```

---

## Setup paso a paso

### 1. Crear proyecto en Firebase Console
1. Ir a https://console.firebase.google.com
2. Crear proyecto → nombre: `bar-evento`
3. Desactivar Google Analytics (no necesario)

### 2. Habilitar autenticación
1. Authentication → Get started
2. Sign-in method → Email/Password → Habilitar → Guardar

### 3. Crear base de datos Firestore
1. Firestore Database → Create database
2. Seleccionar modo **production** (las reglas del archivo controlan el acceso)
3. Elegir región: `us-central1` o la más cercana

### 4. Pegar las reglas de seguridad
1. Firestore → Rules
2. Reemplazar con el contenido de `firestore.rules`
3. Publicar

### 5. Crear los documentos iniciales en Firestore

**Colección: `config` / Documento: `productos`**
```json
{
  "items": [
    {
      "id": "arrecho",
      "nombre": "Cóctel Arrecho",
      "tipo": "coctel",
      "stock_ini_vasos": 1428,
      "botellas_ini": 84,
      "vasos_por_botella": 17,
      "precios": [{"qty": 1, "precio": 6}, {"qty": 2, "precio": 10}]
    },
    {
      "id": "russkaya",
      "nombre": "Cóctel Russkaya",
      "tipo": "coctel",
      "stock_ini_vasos": 0,
      "botellas_ini": 0,
      "vasos_por_botella": 17,
      "precios": [{"qty": 1, "precio": 6}, {"qty": 2, "precio": 10}]
    },
    {
      "id": "corona",
      "nombre": "Corona 355ml",
      "tipo": "corona",
      "stock_ini_vasos": 1500,
      "botellas_ini": 1500,
      "vasos_por_botella": 1,
      "precios": [{"qty": 1, "precio": 6}, {"qty": 3, "precio": 15}]
    }
  ]
}
```

**Colección: `estado` / Documentos: `bar1` y `bar2`** (crear ambos con los mismos campos)
```json
{
  "arrecho_vasos": 0,
  "russkaya_vasos": 0,
  "corona_unidades": 0,
  "total_dinero": 0,
  "ultima_venta": null
}
```

### 6. Crear usuarios

Para cada persona que va a usar el sistema:

**Paso A — En Firebase Authentication:**
1. Authentication → Users → Add user
2. Ingresar email y contraseña
3. Copiar el UID generado

**Paso B — En Firestore, colección `usuarios`, documento `{UID}`:**
```json
{
  "nombre": "Carlos",
  "bar": "bar1",
  "activo": true
}
```

Valores válidos para `bar`: `"bar1"`, `"bar2"`, `"admin"`

> Varios usuarios pueden tener el mismo `bar`. Carlos y María con `bar: "bar1"` trabajan en el mismo bar y sus ventas se registran individualmente pero suman al mismo contador.

### 7. Conectar Firebase al proyecto

1. Firebase Console → Configuración del proyecto (⚙) → Tus apps → Web → Agregar app
2. Copiar el objeto `firebaseConfig`
3. Pegarlo en `js/config.js` reemplazando los valores `TU_*`

### 8. Deploy en Vercel

1. Subir el repositorio a GitHub
2. Ir a https://vercel.com → Import project → seleccionar el repo
3. Framework: **Other** (es HTML estático)
4. Deploy → Vercel genera una URL pública automáticamente

Cada push a `main` redeploya automáticamente.

---

## Lógica de precios y combos

| Producto   | Cantidad | Precio |
|------------|----------|--------|
| Cóctel     | 1        | $6.00  |
| Cóctel     | 2        | $10.00 |
| Cóctel     | 3        | $16.00 (2+1) |
| Corona     | 1        | $6.00  |
| Corona     | 3        | $15.00 |
| Corona     | 4        | $21.00 (3+1) |

## Cálculo de botellas restantes (admin)

```
vasos_restantes = stock_inicial - (bar1.vendidos + bar2.vendidos)
botellas_restantes = Math.ceil(vasos_restantes / 17)
```

## Datos móviles consumidos

- Login inicial: ~3 KB
- Por venta registrada: ~300 bytes
- Noche completa por dispositivo: ~150 KB
- Equivalente: menos que 1 foto de WhatsApp

---

## Roles

| Rol     | Accede a        | Puede hacer              |
|---------|-----------------|--------------------------|
| `bar1`  | `bar.html`      | Registrar ventas Bar 1   |
| `bar2`  | `bar.html`      | Registrar ventas Bar 2   |
| `admin` | `admin.html`    | Ver todo, sin ventas     |
