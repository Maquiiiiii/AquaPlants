import { useEffect, useState, type FormEvent } from 'react';
import CrudManager from './components/CrudManager';
import DashboardMonitor from './components/DashboardMonitor';
import IotSimulator from './components/IotSimulator';
import ManagementReport from './components/ManagementReport';
import { useAuth } from './context/AuthContext';
import {
  subscribeAuditLogs,
  subscribeLocalAuditEvents,
} from './security/auditService';
import {
  decryptData,
  encryptData,
  generateSHA256Hash,
  isCryptoConfigured,
  sanitizeInput,
} from './security/cryptoService';
import { USER_ROLES, type AuditLogEntry, type UserRole } from './types/auth';

export default function App() {
  const {
    user,
    profile,
    loading,
    profileLoading,
    authError,
    isConfigured,
    configError,
    login,
    register,
    logout,
    clearAuthError,
  } = useAuth();

  // Estado formulario de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Estado formulario de Registro
  const [regNombre, setRegNombre] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRol, setRegRol] = useState<UserRole>('Encargado de cultivo');
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [uiMessage, setUiMessage] = useState<string | null>(null);

  // Estado Auto-test Criptográfico
  const [cryptoInput, setCryptoInput] = useState('');
  const [sanitizedPreview, setSanitizedPreview] = useState('');
  const [encryptedOutput, setEncryptedOutput] = useState('');
  const [decryptedOutput, setDecryptedOutput] = useState('');
  const [sha256Output, setSha256Output] = useState('');
  const [corruptDecryptTest, setCorruptDecryptTest] = useState('');
  const [cryptoError, setCryptoError] = useState<string | null>(null);

  // Estado Audit Logs en tiempo real (Firestore + eventos locales de LOGIN_FALLIDO)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [localAuditLogs, setLocalAuditLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    return subscribeLocalAuditEvents(setLocalAuditLogs);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribe = subscribeAuditLogs(
      15,
      (logs) => {
        setAuditLogs(logs);
        setAuditError(null);
      },
      (errMsg) => {
        setAuditError(errMsg);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const visibleAuditLogs = user ? auditLogs : [];
  const visibleAuditError = user ? auditError : null;

  useEffect(() => {
    let cancelled = false;

    async function runCryptoAutoTest() {
      const sanitized = sanitizeInput(cryptoInput);
      setSanitizedPreview(sanitized);

      if (cryptoInput.length === 0) {
        setEncryptedOutput('');
        setDecryptedOutput('');
        setSha256Output('');
        setCryptoError(null);
        return;
      }

      try {
        const hash = await generateSHA256Hash(cryptoInput);
        if (!cancelled) {
          setSha256Output(hash);
        }

        if (!isCryptoConfigured()) {
          if (!cancelled) {
            setEncryptedOutput('');
            setDecryptedOutput('');
            setCryptoError(
              'VITE_CRYPTO_SECRET_KEY no está configurada; no se puede ejecutar AES-GCM.',
            );
          }
          return;
        }

        const cipher = await encryptData(cryptoInput);
        const plain = await decryptData(cipher);

        if (!cancelled) {
          setEncryptedOutput(cipher);
          setDecryptedOutput(plain);
          setCryptoError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setCryptoError(
            error instanceof Error ? error.message : 'Error ejecutando auto-test criptográfico.',
          );
        }
      }
    }

    void runCryptoAutoTest();
    return () => {
      cancelled = true;
    };
  }, [cryptoInput]);

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearAuthError();
    setUiMessage(null);
    setLoginSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
      setLoginPassword('');
      setUiMessage('Sesión iniciada correctamente.');
    } catch {
      // El error queda expuesto en authError desde AuthContext
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearAuthError();
    setUiMessage(null);
    setRegSubmitting(true);
    try {
      await register(regNombre, regEmail, regPassword, regRol);
      setRegPassword('');
      setUiMessage('Usuario registrado y perfil RBAC almacenado en Firestore.');
    } catch {
      // El error queda expuesto en authError desde AuthContext
    } finally {
      setRegSubmitting(false);
    }
  }

  async function handleLogout() {
    clearAuthError();
    setUiMessage(null);
    await logout();
  }

  async function handleTestCorruptPayload() {
    const result = await decryptData('payload_invalido_base64:datos_corruptos');
    setCorruptDecryptTest(result);
  }

  if (loading) {
    return (
      <main>
        <section>
          <h1>AquaPlants / AquaBrain</h1>
          <p>Verificando estado de sesión y perfil RBAC...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main>
        <header>
          <h1>Plataforma Web AquaPlants / AquaBrain</h1>
          <p>Monitoreo y Gestión de Cultivos Aeropónicos — Verificación de Seguridad Base</p>
          <nav aria-label="Navegación de acceso">
            <a href="#login">Iniciar Sesión</a> | <a href="#registro">Registrar Usuario</a>
          </nav>
        </header>

        {!isConfigured && configError && (
          <section aria-live="polite">
            <h2>Configuración de Entorno Pendiente</h2>
            <p role="alert">{configError}</p>
            <p>
              Crea un archivo <code>.env</code> basado en <code>.env.example</code> para habilitar
              Firebase Authentication y Cloud Firestore.
            </p>
          </section>
        )}

        {(authError || uiMessage) && (
          <section aria-live="polite">
            {authError && <p role="alert">Error: {authError}</p>}
            {uiMessage && <p>{uiMessage}</p>}
          </section>
        )}

        <section id="login">
          <form onSubmit={handleLoginSubmit}>
            <fieldset>
              <legend>Iniciar Sesión</legend>
              <p>
                <label htmlFor="login-email">Correo electrónico:</label>
                <br />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </p>
              <p>
                <label htmlFor="login-password">Contraseña (mínimo 8 caracteres):</label>
                <br />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="current-password"
                />
              </p>
              <p>
                <button type="submit" disabled={loginSubmitting || !isConfigured}>
                  {loginSubmitting ? 'Validando...' : 'Ingresar'}
                </button>
              </p>
            </fieldset>
          </form>
        </section>

        <section id="registro">
          <form onSubmit={handleRegisterSubmit}>
            <fieldset>
              <legend>Registro de Nuevo Usuario</legend>
              <p>
                <label htmlFor="reg-nombre">Nombre completo:</label>
                <br />
                <input
                  id="reg-nombre"
                  name="nombre"
                  type="text"
                  value={regNombre}
                  onChange={(e) => setRegNombre(e.target.value)}
                  required
                  autoComplete="name"
                />
              </p>
              <p>
                <label htmlFor="reg-email">Correo electrónico:</label>
                <br />
                <input
                  id="reg-email"
                  name="email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </p>
              <p>
                <label htmlFor="reg-password">Contraseña (mínimo 8 caracteres):</label>
                <br />
                <input
                  id="reg-password"
                  name="password"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </p>
              <p>
                <label htmlFor="reg-rol">Rol RBAC (para evaluación):</label>
                <br />
                <select
                  id="reg-rol"
                  name="rol"
                  value={regRol}
                  onChange={(e) => setRegRol(e.target.value as UserRole)}
                >
                  {USER_ROLES.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {roleOption}
                    </option>
                  ))}
                </select>
              </p>
              <p>
                <button type="submit" disabled={regSubmitting || !isConfigured}>
                  {regSubmitting ? 'Registrando...' : 'Crear Cuenta'}
                </button>
              </p>
            </fieldset>
          </form>
        </section>

        {localAuditLogs.length > 0 && (
          <section aria-label="Eventos de auditoría locales">
            <h2>Registro Local de Intentos Fallidos (Sesión Actual)</h2>
            <p>
              Por regla estricta de producción en Firestore (<code>request.auth != null</code>),
              los eventos sin sesión autenticada se registran de forma controlada localmente.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Timestamp (ISO 8601)</th>
                  <th>Acción</th>
                  <th>Email</th>
                  <th>Detalle</th>
                  <th>Hash Evento (SHA-256)</th>
                </tr>
              </thead>
              <tbody>
                {localAuditLogs.map((entry) => (
                  <tr key={entry.id ?? `${entry.timestamp}-${entry.hash_evento}`}>
                    <td>{entry.timestamp}</td>
                    <td>{entry.accion}</td>
                    <td>{entry.email}</td>
                    <td>{entry.detalle}</td>
                    <td>
                      <code>{entry.hash_evento}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>Plataforma Web AquaPlants / AquaBrain</h1>
        <p>
          <strong>Usuario:</strong> {profile?.nombre ?? user.email ?? 'Sin nombre'} |{' '}
          <strong>Correo:</strong> {profile?.email ?? user.email ?? 'Sin correo'} |{' '}
          <strong>UID:</strong> <code>{user.uid}</code> |{' '}
          <strong>Rol Activo:</strong>{' '}
          {profile?.rol ?? (profileLoading ? 'Cargando perfil...' : 'Sin perfil en Firestore')}
        </p>
        <nav aria-label="Navegación de sesión">
          <a href="#dashboard-monitoreo">Dashboard y Verificación</a> |{' '}
          <a href="#informe-gestion">Informe de Gestión</a> |{' '}
          <a href="#gestion-crud">Gestión CRUD</a> |{' '}
          <a href="#simulador-iot">Simulador IoT</a> |{' '}
          <a href="#autotest-criptografico">Auto-test Criptográfico</a> |{' '}
          <a href="#auditoria-tiempo-real">Auditoría (Últimos 15)</a> |{' '}
          <button type="button" onClick={() => void handleLogout()}>
            Cerrar Sesión
          </button>
        </nav>
      </header>

      {(authError || uiMessage) && (
        <section aria-live="polite">
          {authError && <p role="alert">Error: {authError}</p>}
          {uiMessage && <p>{uiMessage}</p>}
        </section>
      )}

      <DashboardMonitor
        profile={profile}
        userUid={user.uid}
        userEmail={user.email ?? 'desconocido'}
      />

      <ManagementReport
        profile={profile}
        userUid={user.uid}
        userEmail={user.email ?? 'desconocido'}
      />

      <CrudManager
        profile={profile}
        userUid={user.uid}
        userEmail={user.email ?? 'desconocido'}
      />

      <IotSimulator
        profile={profile}
        userUid={user.uid}
        userEmail={user.email ?? 'desconocido'}
      />

      <section id="autotest-criptografico">
        <h2>Auto-test Criptográfico (AES-GCM 256-bit + PBKDF2 + SHA-256 + XSS)</h2>
        <form onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Entrada de Prueba en Tiempo Real</legend>
            <p>
              <label htmlFor="crypto-test-input">
                Escribe un texto (puedes incluir etiquetas HTML para probar sanitización):
              </label>
              <br />
              <input
                id="crypto-test-input"
                type="text"
                value={cryptoInput}
                onChange={(e) => setCryptoInput(e.target.value)}
                placeholder="Ej: Sensor PH-01 = 6.2 <script>alert(1)</script>"
              />
            </p>
            <p>
              <button type="button" onClick={() => void handleTestCorruptPayload()}>
                Probar Descifrado de Payload Corrupto
              </button>
            </p>
          </fieldset>
        </form>

        {cryptoError && <p role="alert">{cryptoError}</p>}

        <table>
          <thead>
            <tr>
              <th>Operación</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Entrada Sanitizada (anti-XSS)</th>
              <td>
                <code>{sanitizedPreview || '(vacío)'}</code>
              </td>
            </tr>
            <tr>
              <th>Cifrado AES-GCM (base64(iv):base64(ciphertext))</th>
              <td>
                <code>{encryptedOutput || '(escribe un texto arriba)'}</code>
              </td>
            </tr>
            <tr>
              <th>Descifrado AES-GCM</th>
              <td>
                <code>{decryptedOutput || '(escribe un texto arriba)'}</code>
              </td>
            </tr>
            <tr>
              <th>Digest SHA-256 (hex minúsculas)</th>
              <td>
                <code>{sha256Output || '(escribe un texto arriba)'}</code>
              </td>
            </tr>
            {corruptDecryptTest && (
              <tr>
                <th>Prueba controlada con payload corrupto</th>
                <td>
                  <code>{corruptDecryptTest}</code>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section id="auditoria-tiempo-real">
        <h2>Bitácora de Auditoría Inmutable (Últimos 15 Registros en Tiempo Real)</h2>
        {visibleAuditError && <p role="alert">{visibleAuditError}</p>}
        <table>
          <thead>
            <tr>
              <th>Timestamp (ISO 8601)</th>
              <th>Acción</th>
              <th>UID</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Detalle</th>
              <th>Hash Evento (SHA-256)</th>
            </tr>
          </thead>
          <tbody>
            {visibleAuditLogs.length === 0 ? (
              <tr>
                <td colSpan={7}>No hay registros en audit_logs todavía.</td>
              </tr>
            ) : (
              visibleAuditLogs.map((entry) => (
                <tr key={entry.id ?? `${entry.timestamp}-${entry.hash_evento}`}>
                  <td>{entry.timestamp}</td>
                  <td>{entry.accion}</td>
                  <td>
                    <code>{entry.uid}</code>
                  </td>
                  <td>{entry.email}</td>
                  <td>{entry.rol}</td>
                  <td>{entry.detalle}</td>
                  <td>
                    <code>{entry.hash_evento}</code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
