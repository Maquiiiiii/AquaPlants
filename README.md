# Plataforma Web AquaPlants / AquaBrain

Plataforma web full-stack serverless para el monitoreo, gestión operativa, telemetría IoT simulada, trazabilidad criptográfica e informes de gestión de cultivos aeropónicos **AquaPlants / AquaBrain**.

- **URL de Producción (Firebase Hosting):** https://aquaplants-24f92.web.app
- **Repositorio:** https://github.com/Maquiiiiii/AquaPlants

## Stack Tecnológico

- **Frontend:** React 19 + Vite 8 + TypeScript (modo estricto `"strict": true`)
- **Estilos e Iconografía:** Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react` y estilos `@media print` dedicados para exportación PDF
- **Visualización:** `recharts` (`ResponsiveContainer`, `AreaChart`, `ReferenceArea`)
- **Backend / Nube:** Firebase v13+ (Firebase Authentication, Cloud Firestore, Firebase Hosting)

## Arquitectura Funcional (Módulos Implementados)

1. **Módulo 0–1 (Seguridad Base, Auth, RBAC y Auditoría):**
   - Gestión de credenciales exclusiva mediante variables `VITE_*` (`.env` excluido del repositorio).
   - Capa criptográfica en cliente con Web Crypto API (`src/security/cryptoService.ts`): cifrado simétrico **AES-GCM 256-bit** con clave derivada vía **PBKDF2** (100,000 iteraciones, SHA-256) e IV aleatorio de 12 bytes por operación (`base64(iv):base64(ciphertext)`), digest **SHA-256** y sanitización anti-XSS (`sanitizeInput`).
   - Autenticación con Firebase Auth (correo/contraseña >= 8 caracteres) y control de acceso por roles (**RBAC**) en `usuarios/{uid}` (`Administrador`, `Supervisor`, `Encargado de cultivo`).
   - Bitácora inmutable `audit_logs` con firma `hash_evento` SHA-256.
2. **Módulo 2 (CRUD en Cloud Firestore):**
   - Gestión en tiempo real de `instalaciones`, `cultivos` y `sensores` (`src/services/crudService.ts` y `src/components/CrudManager.tsx`).
   - Ubicación y token de dispositivo de cada instalación cifrados en reposo con AES-GCM y descifrados en memoria al consultar.
   - Validación estricta de unicidad, integridad referencial (`id_sistema`) y umbrales (`umbral_min < umbral_max`).
3. **Módulo 3 (Simulador IoT, Integridad SHA-256, Alertas y Contingencia Offline):**
   - Procesamiento de telemetría (`src/services/iotService.ts`, `src/components/IotSimulator.tsx`) con firma `hash_integridad` SHA-256 (`id_sistema|id_dispositivo|id_sensor|valor|timestamp`).
   - Motor automático de alertas (`Crítica` si el desvío supera el 20%, `Advertencia` en caso contrario).
   - Cola offline cifrada en `localStorage` (AES-GCM) con sincronización automática al reconectar y prueba de estrés de 50 mediciones consecutivas.
4. **Módulo 4 (Dashboard Operativo e Integridad en Vivo):**
   - Tarjetas KPI en tiempo real, gráfico histórico interactivo con `Recharts` (líneas de referencia para `umbral_min` y `umbral_max`), gestión de alertas activas y recálculo SHA-256 en vivo sobre cada medición leída de Firestore.
5. **Módulo 5 (Informe de Gestión Exportable):**
   - Generación de corte operativo (`src/components/ManagementReport.tsx`) con resumen por instalación, estadísticas por variable, tasa de resolución de alertas, desglose de auditoría, registro `GENERAR_INFORME_GESTION` e impresión limpia a PDF (`@media print` ocultando navegación y botones `.no-print`).
6. **Módulo 6 (Capa Visual, Seed Data y Hosting):**
   - Interfaz responsive con barra superior y navegación lateral por pestañas, servicio de carga de datos semilla (`src/services/seedService.ts`) exclusivo para `Administrador`, y despliegue SPA en Firebase Hosting (`firebase.json`).

## Medidas de Seguridad Implementadas

- **Reglas de Producción (`firestore.rules`):**
  - Denegación total por defecto a usuarios no autenticados.
  - Protección contra auto-escalamiento de privilegios en `usuarios/{uid}`.
  - Inmutabilidad en `audit_logs` y `mediciones` (`allow update, delete: if false;`).
  - Escritura y eliminación en `instalaciones`, `cultivos`, `sensores`, `configuraciones` y `umbrales_alerta` restringida al rol `"Administrador"`.
  - Resolución de `alertas` restringida a `"Administrador"` y `"Encargado de cultivo"` modificando únicamente `estado`.
- **Protección de Secretos:** Todas las llaves se consumen desde `import.meta.env.VITE_*` y `.env` está protegido en `.gitignore`.

## Requisitos Previos e Instalación Local

- **Node.js** >= 20 LTS y **npm** >= 10
- **Firebase CLI** (`npm install -g firebase-tools`)

```bash
cd AquaPlants
npm install
cp .env.example .env
```

Completa `.env` con las credenciales de tu proyecto Firebase y una frase secreta aleatoria de al menos 32 caracteres para `VITE_CRYPTO_SECRET_KEY`:

| Variable | Descripción |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | API Key pública de la Web App en Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dominio de autenticación (`<project-id>.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | ID del proyecto Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket de almacenamiento |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ID del remitente de mensajería |
| `VITE_FIREBASE_APP_ID` | ID de la aplicación web |
| `VITE_CRYPTO_SECRET_KEY` | Clave secreta para derivación PBKDF2 / AES-GCM 256-bit |

### Comandos Principales

```bash
# Servidor de desarrollo local
npm run dev

# Verificación estricta de TypeScript y build de producción
npm run build

# Linter de código
npm run lint

# Despliegue de reglas de Firestore y aplicación web en Firebase Hosting
firebase deploy --only firestore:rules,hosting --project aquaplants-24f92
```
