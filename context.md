# Contexto Técnico del Proyecto — AquaPlants / AquaBrain

Documento de referencia arquitectónica, árbol de archivos (`archive tree`) y especificación consolidada de todos los módulos implementados en la **Plataforma Web de Monitoreo y Gestión de Cultivos Aeropónicos AquaPlants / AquaBrain**.

---

## 1. Identidad, Entorno y Enlaces de Despliegue

- **Nombre del Proyecto:** Plataforma Web de Monitoreo y Gestión de Cultivos Aeropónicos AquaPlants / AquaBrain
- **Firebase Project ID:** `aquaplants-24f92` (Display Name: `AquaPlants`, Project Number: `1028510616561`)
- **Firebase Web App:** `AquaPlants Web` (`appId`: `1:1028510616561:web:59c8095b5ee17b9dce5250`)
- **Base de Datos:** Cloud Firestore `(default)` — Edición `STANDARD`, `FIRESTORE_NATIVE`, ubicación `nam5`
- **URL Pública de Producción (Firebase Hosting):** https://aquaplants-24f92.web.app
- **Repositorio GitHub (privado, rama `main`):** https://github.com/Maquiiiiii/AquaPlants

---

## 2. Árbol de Archivos (`Archive Tree`)

### 2.1. Directorio de Trabajo (`Informe Proyecto/`)

```text
Informe Proyecto/
├── AquaPlants/                          # Aplicación Web React + Vite + TS + Firebase
├── Desafio_API2_AquaPlants_rev1.docx    # Especificación original del desafío
└── Rúbrica.md                           # Rúbrica de evaluación e informe
```

### 2.2. Proyecto `AquaPlants/` (excluyendo `node_modules/`, `dist/`, `.git/`, `.firebase/`)

```text
AquaPlants/
├── .env                                 # Secretos locales (ignorado por Git en .gitignore)
├── .env.example                         # Plantilla de variables VITE_* requeridas
├── .firebaserc                          # Proyecto Firebase por defecto (aquaplants-24f92)
├── .gitignore                           # Excluye .env, .env.*, node_modules, dist
├── .oxlintrc.json                       # Configuración del linter oxlint
├── context.md                           # Este documento de contexto y arquitectura
├── firebase.json                        # Configuración de Firestore rules y Hosting SPA (public: dist)
├── firestore.rules                      # Reglas de seguridad de producción en Cloud Firestore
├── index.html                           # Documento HTML raíz (lang="es")
├── package.json                         # Dependencias y scripts (dev, build, lint, preview)
├── package-lock.json                    # Lockfile de npm
├── README.md                            # Documentación de instalación, seguridad y despliegue
├── tsconfig.app.json                    # Configuración TypeScript estricto para src/
├── tsconfig.json                        # Referencias TypeScript del proyecto
├── tsconfig.node.json                   # Configuración TypeScript para Vite
├── vite.config.ts                       # Plugins react() y tailwindcss() (@tailwindcss/vite)
├── public/
│   ├── favicon.svg                      # Ícono público
│   ├── icons.svg                        # Sprite/ícono público plantilla Vite
│   └── LogoAquaSVG.svg                  # Logo vectorial oficial AquaPlants (blanco)
└── src/
    ├── App.tsx                          # Shell principal (AuthScreen, Sidebar 5 pestañas, Auditoría)
    ├── index.css                        # Tailwind CSS v4, Plus Jakarta Sans, animaciones auth y @media print
    ├── main.tsx                         # Punto de entrada React StrictMode + AuthProvider
    ├── vite-env.d.ts                    # Tipado estricto de import.meta.env.VITE_*
    ├── assets/
    │   ├── hero.png                     # Recurso estático base
    │   ├── react.svg                    # Recurso SVG base
    │   └── vite.svg                     # Recurso SVG base
    ├── components/
    │   ├── AuthScreen.tsx               # Pantalla de Login / Registro separada con animaciones y paleta #00753A
    │   ├── CrudManager.tsx              # Módulo 2: CRUD Instalaciones, Cultivos y Sensores + RBAC
    │   ├── DashboardMonitor.tsx         # Módulo 4 & 6: KPIs, Recharts, Alertas y Verificador SHA-256
    │   ├── IotSimulator.tsx             # Módulo 3: Simulador IoT, Offline AES-GCM y Prueba de Estrés
    │   └── ManagementReport.tsx         # Módulo 5: Informe de Gestión Operativa y exportación PDF
    ├── context/
    │   └── AuthContext.tsx              # Autenticación Firebase Auth, perfiles usuarios/{uid} y RBAC
    ├── firebase/
    │   └── config.ts                    # Inicialización Firebase App/Auth/Firestore desde VITE_*
    ├── security/
    │   ├── auditService.ts              # Servicio de bitácora inmutable (audit_logs + buffer local)
    │   └── cryptoService.ts             # Cifrado AES-GCM 256-bit (PBKDF2), SHA-256 y sanitizeInput
    ├── services/
    │   ├── crudService.ts               # CRUD Firestore con validaciones, cifrado y auditoría
    │   ├── iotService.ts                # Telemetría, firma SHA-256, alertas, cola offline y estrés
    │   └── seedService.ts               # Carga idempotente de datos de demostración (Administrador)
    └── types/
        ├── auth.ts                      # UserRole, UserProfile, AuditAction, AuditLogEntry
        └── domain.ts                    # Instalacion, Cultivo, Sensor, Medicion, Alerta, StressTestResult
```

---

## 3. Stack Tecnológico y Configuración (`package.json` y `tsconfig.app.json`)

- **Runtime / Bundler:** React `^19.3.1`, React DOM `^19.3.1`, Vite `^8.3.6`, TypeScript `~7.0.2`
- **Estilos e Iconos:** `tailwindcss` `^4.3.5`, `@tailwindcss/vite` `^4.3.5`, `lucide-react` `^1.78.0`
- **Gráficos:** `recharts` `^3.11.1`
- **Backend SDK:** `firebase` `^13.4.0` (Authentication + Cloud Firestore)
- **Linter:** `oxlint` `^1.90.0`
- **Opciones estrictas en `tsconfig.app.json`:** `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"erasableSyntaxOnly": true`, `"verbatimModuleSyntax": true`

### Variables de Entorno Requeridas (`.env.example`)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_CRYPTO_SECRET_KEY` (clave maestra de 32 caracteres para derivación PBKDF2)

---

## 4. Detalle Completo de los Módulos Implementados

### Módulos 0 y 1 — Gestión de Secretos, Capa Criptográfica, Auth, RBAC y Auditoría

- **Configuración Firebase (`src/firebase/config.ts`, `src/vite-env.d.ts`):**
  - Lee exclusivamente `import.meta.env.VITE_*`, detecta variables faltantes (`missingFirebaseEnvVars`, `isFirebaseConfigured`, `firebaseInitError`) y exporta `app`, `auth` y `db`.
- **Criptografía y Sanitización (`src/security/cryptoService.ts`):**
  - `encryptData(plainText)`: deriva `CryptoKey` AES-GCM 256-bit mediante PBKDF2 (`100,000` iteraciones, `SHA-256`, salt fijo de aplicación `AquaPlants-AquaBrain-PBKDF2-Salt-v1`), genera un IV aleatorio de 12 bytes por operación y devuelve `base64(iv):base64(ciphertext)`.
  - `decryptData(cipherPayload)`: valida estructura `iv:ciphertext`, longitud de IV (12 bytes) y Base64; ante clave inválida o datos manipulados captura la excepción y devuelve un mensaje controlado (`Error de descifrado: clave criptográfica inválida o payload corrupto.`).
  - `generateSHA256Hash(payload)`: calcula digest hexadecimal en minúsculas (64 caracteres) con `crypto.subtle.digest('SHA-256', ...)`.
  - `sanitizeInput(input)`: elimina iterativamente etiquetas HTML (`/<[^>]*>/g`), caracteres peligrosos (`<`, `>`, `"`, `'`, `/`) y espacios extremos (`trim()`).
- **Auditoría Inmutable (`src/security/auditService.ts`):**
  - `logAuditEvent(input)`: calcula `hash_evento` SHA-256 sobre `${uid}|${accion}|${detalle}|${timestamp}` y persiste en `audit_logs`. Por regla estricta (`request.auth != null`), los eventos sin sesión activa (como `LOGIN_FALLIDO`) se registran de forma controlada en un buffer local en memoria (`subscribeLocalAuditEvents`).
  - `subscribeAuditLogs(maxRecords, onData, onError)`: suscripción en tiempo real ordenada descendentemente por `timestamp`.
- **Autenticación y RBAC (`src/context/AuthContext.tsx`, `src/types/auth.ts`):**
  - Roles soportados (`USER_ROLES`): `"Administrador"`, `"Supervisor"`, `"Encargado de cultivo"`.
  - Valida formato de email y contraseña de mínimo 8 caracteres en `login` y `register`.
  - Al registrar, crea la credencial en Firebase Auth (evitando condiciones de carrera con `isRegisteringRef`) y guarda el perfil sanitizado en `usuarios/{uid}`.
  - Registra `REGISTRO_USUARIO`, `LOGIN_EXITOSO`, `LOGIN_FALLIDO` y `LOGOUT` (ejecutado antes de `signOut` para conservar el contexto autenticado).

---

### Módulo 2 — Operaciones CRUD Seguras en Cloud Firestore

- **Modelos (`src/types/domain.ts`):** `Instalacion`, `Cultivo`, `Sensor` y DTOs (`InstalacionInput`, `CultivoInput`, `SensorInput`).
- **Servicio CRUD (`src/services/crudService.ts`):**
  - Suscripciones en tiempo real: `subscribeInstalaciones` (descifra `ubicacion_cifrada` a `ubicacion_descifrada` en memoria conservando el ciphertext original y evitando desorden por concurrencia mediante contador `seq`), `subscribeCultivos` y `subscribeSensores`.
  - Cifrado en reposo: `createInstalacion` y `updateInstalacion` cifran `ubicacion` y generan/cifran `token_dispositivo_cifrado` (`AQB-<hex>`) con `encryptData`.
  - Validaciones previas a Firestore: sanitización `sanitizeInput`, campos obligatorios no vacíos, unicidad de códigos (`id_sistema`, `id_cultivo`, `id_sensor`), existencia de `id_sistema` en `instalaciones` para cultivos y sensores, formato `YYYY-MM-DD` en `fecha_siembra`, y verificación estricta `umbral_min < umbral_max` en sensores.
  - Auditoría automática: registra `CREAR_*`, `ACTUALIZAR_*` y `ELIMINAR_*` en `audit_logs`.
- **Interfaz (`src/components/CrudManager.tsx`):**
  - Bloques de gestión para Instalaciones, Cultivos y Sensores.
  - Control RBAC en UI: formularios de creación/edición (con `Cancelar edición`) y botones `Editar` / `Eliminar` (con `window.confirm`) visibles solo para `"Administrador"`; aviso de `"Modo solo lectura según rol"` para `"Supervisor"` y `"Encargado de cultivo"`.
  - Columna explícita `Evidencia Cifrada en BD (AES-GCM)` mostrando los primeros 28 caracteres de `ubicacion_cifrada` junto a `ubicacion_descifrada`.

---

### Módulo 3 — Simulador IoT AquaBrain, Integridad SHA-256, Alertas, Cola Offline y Prueba de Estrés

- **Modelos (`src/types/domain.ts`):** `Medicion`, `Alerta`, `StressTestResult`.
- **Servicio IoT (`src/services/iotService.ts`):**
  - `calcularHashIntegridad(idSistema, idDispositivo, idSensor, valor, timestamp)`: firma SHA-256 sobre `${id_sistema}|${id_dispositivo}|${id_sensor}|${valor}|${timestamp}`.
  - `procesarMedicion(input)`: valida sensor existente y valor numérico finito; evalúa umbrales (`Crítica` si el desvío relativo supera el 20%, `Advertencia` en caso contrario); crea documento en `alertas` si excede umbrales; guarda medición firmada en `mediciones`; y actualiza `ultima_comunicacion` y `estado_conexion: "En línea"` en `instalaciones`.
  - **Contingencia Offline (`localStorage`):** `encolarMedicionOffline` serializa la medición y la cifra con AES-GCM (`encryptData`) bajo la clave `aquaplants_offline_queue_v1`; `sincronizarColaOffline` descifra en orden FIFO, envía con `estado_conexion: "Sincronizado Offline"`, dispara alertas si aplica, limpia la cola y registra `SINCRONIZACION_OFFLINE` en `audit_logs`.
  - **Prueba de Estrés:** `ejecutarPruebaEstres` envía 50 mediciones consecutivas (45 dentro de rango y 5 fuera de umbral) midiendo con `performance.now()` tiempo total (ms), latencia promedio por registro, exitosas, fallidas y alertas generadas, auditando `PRUEBA_ESTRES_IOT`.
  - `resolverAlerta`: actualiza `estado: "Resuelta"` en `alertas` y registra `RESOLVER_ALERTA`.
- **Interfaz (`src/components/IotSimulator.tsx`):**
  - Selectores de Instalación y Sensor con vista de umbrales configurados.
  - Botones `Enviar Medición Normal`, `Forzar Medición Fuera de Umbral` y formulario de `Valor manual`.
  - Checkbox `Simular pérdida de conexión a Internet (Modo Offline Cifrado)`, contador de cola cifrada, vista previa de paquete cifrado y botón `Forzar Sincronización` (más sincronización automática al reconectar).
  - Panel `Ejecutar Prueba de Estrés (50 mediciones)` y tablas en tiempo real de las últimas 15 mediciones y 15 alertas.

---

### Módulo 4 — Dashboard Operativo con Verificación Criptográfica en Vivo

- **Componente (`src/components/DashboardMonitor.tsx`):**
  - Consume en tiempo real las 6 colecciones (`instalaciones`, `cultivos`, `sensores`, `mediciones`, `alertas`, `audit_logs`).
  - Tarjetas KPI ejecutivas: Total de Instalaciones (`En línea` vs `Desconectado`), Cultivos Activos, Sensores Activos, Alertas Activas y Eventos de Auditoría.
  - Panel de Gestión de Alertas Activas con botón `Marcar como Resuelta` habilitado para `"Administrador"` y `"Encargado de cultivo"`.
  - Histórico de Mediciones con filtros por Instalación, Variable y Sensor, recalculando en el navegador el hash SHA-256 de cada registro con `calcularHashIntegridad` y mostrando en la columna `Integridad Criptográfica (SHA-256)` el estado `[VÁLIDO - INTEGRIDAD VERIFICADA]` o `[ALERTA - POSIBLE ALTERACIÓN DE DATO]`.

---

### Módulo 5 — Informe de Gestión Operativa Integrado y Exportable

- **Componente (`src/components/ManagementReport.tsx`):**
  - Título: `Informe de Gestión Operativa AquaPlants / AquaBrain`.
  - Botones `Generar / Actualizar Corte de Informe` y `Imprimir / Exportar Informe a PDF` (`window.print()`), registrando `GENERAR_INFORME_GESTION` en `audit_logs`.
  - Cinco secciones calculadas dinámicamente desde Firestore:
    - **a) Encabezado de Emisión:** fecha/hora ISO 8601 y local, usuario emisor, rol y estado general de la plataforma.
    - **b) Resumen Operativo por Instalación:** `id_sistema`, nombre, ubicación descifrada, cantidad de cultivos y sensores asociados, estado de conexión y última comunicación.
    - **c) Estadísticas por Variable Monitoreada:** total, mínimo, máximo, promedio (2 decimales) y mediciones fuera de umbral para `caudal`, `nutrientes`, `consumo_hidrico` y `fotoperiodo`.
    - **d) Indicadores de Gestión de Alertas:** total histórico, activas, resueltas y tasa porcentual de resolución (`%`).
    - **e) Resumen de Seguridad y Auditoría:** total de eventos en `audit_logs`, porcentaje de mediciones verificadas criptográficamente sin alteraciones y desglose por acción crítica.

---

### Módulo 6 (Final) — Capa Visual Tailwind, Gráficos Recharts, Datos Semilla y Firebase Hosting

- **Capa Visual (`src/index.css`, `src/App.tsx`):**
  - Tailwind CSS v4 + `lucide-react`, paleta verde esmeralda (`#059669` / `#047857`), blanco (`#ffffff`), pizarra (`#0f172a` / `#f8fafc`) y estados semánticos ámbar/rojo.
  - Cabecera superior fija con identidad, estado de nube, perfil, badge de rol y cierre de sesión; barra lateral responsive (desplegable en móvil) con navegación entre las 5 vistas:
    1. `Dashboard Operativo`
    2. `Gestión CRUD`
    3. `Simulador IoT & Pruebas`
    4. `Informe de Gestión`
    5. `Auditoría y Criptografía`
  - Reglas `@media print` (`.no-print`, `.print-only-container`, `.print-break-inside-avoid`) para exportar el Informe de Gestión limpio a PDF.
- **Gráfico Interactivo (`src/components/DashboardMonitor.tsx`):**
  - `ResponsiveContainer` + `LineChart` de `recharts` (`timestamp` vs `valor` en orden cronológico) con `ReferenceLine` automáticas para `umbral_min` y `umbral_max` al filtrar por sensor o variable específica.
- **Datos Semilla (`src/services/seedService.ts`):**
  - Botón `Cargar Datos de Demostración AquaPlants` (exclusivo para `"Administrador"`), usando los servicios reales (AES-GCM + SHA-256 + `CARGAR_DATOS_SEMILLA` en `audit_logs`) para cargar `AQP-101` (Torre Vertical Santiago Centro), `AQP-102` (Invernadero Piloto), 4 cultivos, 6 sensores y 24 mediciones históricas (incluyendo 2 fuera de umbral que generan alertas activas).
- **Despliegue Hosting (`firebase.json`):**
  - Configurado `public: "dist"` con rewrite SPA hacia `/index.html`, desplegado en `https://aquaplants-24f92.web.app`.

---

## 5. Colecciones y Reglas de Seguridad (`firestore.rules`)

| Colección | Lectura (`read`) | Escritura (`create` / `update` / `delete`) | Controles Clave |
| --- | --- | --- | --- |
| `usuarios/{userId}` | Propio usuario o `Administrador` | `create`: propio `uid`; `update`: `Administrador` o propio sin cambiar `rol`/`uid`; `delete`: `Administrador` | Previene auto-escalamiento de privilegios |
| `audit_logs/{logId}` | Autenticado | `create`: autenticado (`uid == auth.uid`, `hash_evento` 64 chars); `update`/`delete`: `false` | Bitácora estrictamente inmutable |
| `instalaciones/{docId}` | Autenticado | `create`/`update`/`delete`: solo `Administrador` | Esquema estricto, strings acotados, `ubicacion_cifrada` y `token_dispositivo_cifrado` |
| `cultivos/{docId}` | Autenticado | `create`/`update`/`delete`: solo `Administrador` | Enum `estado` (`Activo`, `En cosecha`, `Inactivo`) |
| `sensores/{docId}` | Autenticado | `create`/`update`/`delete`: solo `Administrador` | Valida `tipo_variable`, `estado` y `umbral_min < umbral_max` |
| `mediciones/{docId}` | Autenticado | `create`: autenticado; `update`/`delete`: `false` | Exige `valor` numérico y `hash_integridad` hex de 64 chars (`^[a-f0-9]{64}$`); histórico inmutable |
| `alertas/{docId}` | Autenticado | `create`: autenticado; `update`: `Administrador` o `Encargado de cultivo`; `delete`: `false` | `update` restringido únicamente al campo `estado` |
| `configuraciones`, `umbrales_alerta`, `dispositivos` | Autenticado | Solo `Administrador` | Restricción administrativa |
| `/{document=**}` | `false` | `false` | Denegación por defecto |

---

## 6. Historial de Commits en `main`

- `ce31b16` — `feat(security): inicializa arquitectura base, cifrado AES-GCM, RBAC y auditoría inmutable`
- `009abef` — `chore(firebase): vincula proyecto aquaplants-24f92 y reglas de Firestore`
- `b86247e` — `feat(crud): implementa CRUD en nube con cifrado AES-GCM, validación y RBAC`
- `177b9c8` — `feat(iot): implementa simulador IoT, firma SHA-256, alertas y cola offline cifrada`
- `c72e14e` — `feat(dashboard-report): implementa dashboard con verificación SHA-256 e informe de gestión exportable`
- `4fb8ec4` — `feat(ui-deploy): aplica diseño profesional Tailwind, gráficos Recharts, seed data y despliegue en Firebase Hosting`


---

## 7. Actualizaciones Recientes de UI/UX y Flujo Operativo

- **Navegación y Estética Botánica (`src/App.tsx`, `src/index.css`):**
  - Se renombró la vista `Gestión CRUD` a `Gestión de Operaciones` para orientar el lenguaje al usuario agrícola.
  - Se añadieron `@keyframes` explícitos de entrada y salida (`modalBackdropIn`, `modalBackdropOut`, `modalCardIn`, `modalCardOut`) y utilidades `.animate-backdrop-in`, `.animate-backdrop-out`, `.animate-modal-in` y `.animate-modal-out` con soporte para `prefers-reduced-motion`.
- **Dashboard Operativo (`src/components/DashboardMonitor.tsx`):**
  - Se limpió la tabla de **Histórico de Mediciones** eliminando la columna `Integridad SHA-256` y el modal criptográfico (que permanece en su vista dedicada de Auditoría), dejando 5 columnas equilibradas mediante `<colgroup>` (`Fecha y hora`, `Instalación`, `Sensor / Variable`, `Valor` alineado a la izquierda y `Estado`).
  - Se incorporó formato editorial de fecha/hora (`24 Nov · 03:29:42 a. m.`), filtro rápido segmentado (`Todas` | `Fuera de rango`) y tipografía `font-sans font-medium tabular-nums` uniforme en códigos de instalación y sensor.
- **Gestión de Operaciones (`src/components/CrudManager.tsx`, `src/services/crudService.ts`, `firestore.rules`):**
  - Se implementó el flujo centrado en la **Instalación como espacio principal**: creación "Todo en Uno" con cultivos y sensores iniciales, modal contextual de detalle de instalación (`Desvincular`, `Crear nuevo aquí`, `Vincular disponible` con disclosure colapsable de elementos ocupados) y sub-modales apilados (`z-[60]`) renderizados mediante `createPortal(..., document.body)` con animación `useAnimatedModal`.
  - Se añadió validación estricta `1:1` de exclusividad (`validateCultivoExclusivity`, `validateSensorExclusivity`) y soporte para estado `"Sin asignar"` (`id_sistema: ""`) en `crudService.ts` y `firestore.rules`.

- **Simulador de Campo (`src/components/IotSimulator.tsx`, `src/services/iotService.ts`):**
  - Se rediseñó la vista con lenguaje 100 % agrícola ("Simulador de Campo", respaldo local sin conexión, prueba de carga operativa de 50 lecturas con 4 KPIs tonales) y monitor en vivo con `reabrirAlerta` para deshacer alertas resueltas.
- **Informe Ejecutivo y PDF (`src/components/ManagementReport.tsx`, `src/index.css`, `index.html`):**
  - Se convirtió en un Informe Ejecutivo Agrícola de 4 bloques con diagnóstico agronómico agrupado por sensor ("Atención Prioritaria en Cultivos"), exportación PDF sin scrollbars ni página extra en blanco (`@page { size: auto; margin: 0mm; }`) y cabecera editorial centrada.
- **Auditoría y Seguridad (`src/components/SecurityAudit.tsx`):**
  - Se extrajo la vista dedicada de Auditoría con 4 KPIs tonales, panel simétrico de verificación en vivo (`AES-GCM` y `SHA-256`) y bitácora inmutable paginada (10 registros/página) con filtros `CustomSelect`.
- **RBAC Integral, Validación Reactiva y Estabilidad de Sesión (`src/App.tsx`, `src/context/AuthContext.tsx`, `src/components/AuthScreen.tsx`):**
  - Navegación dinámica y guardia reactiva para `Administrador` (5 vistas), `Supervisor` (3 vistas, alertas en modo `"Atención por encargado"`) y `Encargado de cultivo` (2 vistas, `CrudManager` en modo solo lectura).
  - Validación reactiva en tiempo real de `Repetir contraseña` en `AuthScreen.tsx`.
  - Limpieza atómica de sesión, descarte de callbacks obsoletos (`authRequestRef`), reintento ante `permission-denied` en `fetchUserProfile` y guarda de carga hasta resolver `profile` en `App.tsx`, desplegado en `https://aquaplants-24f92.web.app`.
