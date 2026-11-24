# Plataforma Web AquaPlants / AquaBrain

Base arquitectónica y de ciberseguridad para la plataforma de monitoreo y gestión de cultivos aeropónicos **AquaPlants / AquaBrain**, construida con React, Vite, TypeScript (modo estricto) y Firebase v10+ (Authentication y Cloud Firestore).

> **Nota de etapa:** Esta primera entrega implementa la infraestructura de secretos, criptografía en cliente (Web Crypto API), sanitización anti-XSS, autenticación con RBAC, auditoría inmutable y una interfaz HTML5 semántica pura de verificación (sin CSS).

## Requisitos Previos

- **Node.js** >= 20 LTS (verificado con v24.x)
- **npm** >= 10
- Una cuenta y proyecto activo en **Firebase Console** con:
  - **Authentication**: proveedor **Correo electrónico / Contraseña** habilitado.
  - **Cloud Firestore**: base de datos creada y reglas de seguridad (`firestore.rules`) desplegadas.

## Instalación Paso a Paso

1. Ingresa al directorio del proyecto:
   ```bash
   cd AquaPlants
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Crea tu archivo de variables de entorno a partir de la plantilla:
   ```bash
   cp .env.example .env
   ```
   *(En Windows PowerShell: `Copy-Item .env.example .env`)*

4. Configura las credenciales en `.env` (ver sección siguiente).

5. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

6. Para validar compilación estricta y empaquetado de producción:
   ```bash
   npm run build
   ```

## Configuración de Variables de Entorno

Edita el archivo `.env` en la raíz de `AquaPlants/` (este archivo está excluido del control de versiones en `.gitignore` y **nunca** debe subirse al repositorio):

| Variable | Descripción |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | API Key pública del proyecto Web en Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dominio Auth (`<project-id>.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | ID único del proyecto Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket de almacenamiento (`<project-id>.firebasestorage.app`) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ID del remitente de mensajería |
| `VITE_FIREBASE_APP_ID` | ID de la aplicación web en Firebase |
| `VITE_CRYPTO_SECRET_KEY` | Frase secreta para derivar la clave AES-GCM 256-bit mediante PBKDF2 (recomendado >= 32 caracteres aleatorios) |

## Despliegue de Reglas de Firestore (`firestore.rules`)

El archivo [`firestore.rules`](./firestore.rules) implementa:
- Denegación por defecto de todo acceso no autenticado.
- Perfiles en `usuarios/{uid}` con protección contra auto-escalamiento de privilegios (`rol` e `uid` inmutables por el propio usuario).
- Registro inmutable en `audit_logs`: solo lectura y creación para usuarios autenticados (`update` y `delete` prohibidos).
- Escritura de configuraciones críticas (`configuraciones`, `umbrales_alerta`, `instalaciones`, `dispositivos`) restringida exclusivamente al rol `"Administrador"`.

Para desplegarlas con Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

## Estructura Principal

- `src/firebase/config.ts`: Inicialización exclusiva desde `import.meta.env.VITE_*`.
- `src/security/cryptoService.ts`: Cifrado AES-GCM 256-bit (PBKDF2 100,000 iteraciones SHA-256), hashing SHA-256 y sanitización `sanitizeInput`.
- `src/security/auditService.ts`: Servicio de auditoría inmutable con integridad por `hash_evento` SHA-256 y manejo controlado de `LOGIN_FALLIDO`.
- `src/context/AuthContext.tsx`: Gestión de sesión, validaciones de credenciales y perfiles RBAC en Firestore (`usuarios`).
- `src/App.tsx`: Interfaz HTML5 semántica pura para verificación de Auth, RBAC, Auto-test Criptográfico y monitoreo en tiempo real de `audit_logs`.
