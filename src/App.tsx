import { useEffect, useState, type FormEvent } from 'react';
import {
  Cloud,
  Cpu,
  Database,
  FileText,
  KeyRound,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
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

type ActiveTab = 'dashboard' | 'crud' | 'iot' | 'report' | 'audit';

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard Operativo', icon: LayoutDashboard },
  { id: 'crud', label: 'Gestión CRUD', icon: Database },
  { id: 'iot', label: 'Simulador IoT & Pruebas', icon: Cpu },
  { id: 'report', label: 'Informe de Gestión', icon: FileText },
  { id: 'audit', label: 'Auditoría y Criptografía', icon: ShieldCheck },
];

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20';

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

  // Navegación del shell autenticado
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Estado formulario de Login / Registro
  const [authPanel, setAuthPanel] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);

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
    setMobileMenuOpen(false);
    await logout();
  }

  async function handleTestCorruptPayload() {
    const result = await decryptData('payload_invalido_base64:datos_corruptos');
    setCorruptDecryptTest(result);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white">
            <Leaf className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">AquaPlants / AquaBrain</h1>
          <p className="mt-1 text-sm text-slate-600">
            Verificando estado de sesión y perfil RBAC...
          </p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-4xl space-y-6">
          <header className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
                <Leaf className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  AquaPlants / AquaBrain
                </h1>
                <p className="text-sm text-slate-600">
                  Plataforma Web de Monitoreo y Gestión de Cultivos Aeropónicos
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 sm:self-center">
              <Cloud className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
              {isConfigured ? 'Firebase Cloud Conectado' : 'Entorno Pendiente'}
            </div>
          </header>

          {!isConfigured && configError && (
            <section
              aria-live="polite"
              className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"
            >
              <h2 className="font-semibold">Configuración de Entorno Pendiente</h2>
              <p role="alert" className="mt-1">
                {configError}
              </p>
              <p className="mt-1 text-xs">
                Crea un archivo <code className="font-mono">.env</code> basado en{' '}
                <code className="font-mono">.env.example</code> para habilitar Firebase
                Authentication y Cloud Firestore.
              </p>
            </section>
          )}

          {(authError || uiMessage) && (
            <section aria-live="polite">
              {authError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  Error: {authError}
                </p>
              )}
              {uiMessage && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  {uiMessage}
                </p>
              )}
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section
              id="login"
              className={`rounded-xl border bg-white p-6 shadow-xs ${
                authPanel === 'login' ? 'border-emerald-600' : 'border-slate-200'
              }`}
            >
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <fieldset className="space-y-4">
                  <legend className="text-base font-semibold text-slate-900">
                    Iniciar Sesión
                  </legend>
                  <div>
                    <label
                      htmlFor="login-email"
                      className="mb-1 block text-xs font-medium text-slate-700"
                    >
                      Correo electrónico
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      value={loginEmail}
                      onFocus={() => setAuthPanel('login')}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="operador@aquaplants.cl"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="login-password"
                      className="mb-1 block text-xs font-medium text-slate-700"
                    >
                      Contraseña (mínimo 8 caracteres)
                    </label>
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      value={loginPassword}
                      onFocus={() => setAuthPanel('login')}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      minLength={8}
                      required
                      autoComplete="current-password"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loginSubmitting || !isConfigured}
                    className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {loginSubmitting ? 'Validando...' : 'Ingresar a la Plataforma'}
                  </button>
                </fieldset>
              </form>
            </section>

            <section
              id="registro"
              className={`rounded-xl border bg-white p-6 shadow-xs ${
                authPanel === 'register' ? 'border-emerald-600' : 'border-slate-200'
              }`}
            >
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <fieldset className="space-y-4">
                  <legend className="text-base font-semibold text-slate-900">
                    Registro de Nuevo Usuario
                  </legend>
                  <div>
                    <label
                      htmlFor="reg-nombre"
                      className="mb-1 block text-xs font-medium text-slate-700"
                    >
                      Nombre completo
                    </label>
                    <input
                      id="reg-nombre"
                      name="nombre"
                      type="text"
                      value={regNombre}
                      onFocus={() => setAuthPanel('register')}
                      onChange={(e) => setRegNombre(e.target.value)}
                      required
                      autoComplete="name"
                      placeholder="Nombre Apellido"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-email"
                      className="mb-1 block text-xs font-medium text-slate-700"
                    >
                      Correo electrónico
                    </label>
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      value={regEmail}
                      onFocus={() => setAuthPanel('register')}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="usuario@aquaplants.cl"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-password"
                      className="mb-1 block text-xs font-medium text-slate-700"
                    >
                      Contraseña (mínimo 8 caracteres)
                    </label>
                    <input
                      id="reg-password"
                      name="password"
                      type="password"
                      value={regPassword}
                      onFocus={() => setAuthPanel('register')}
                      onChange={(e) => setRegPassword(e.target.value)}
                      minLength={8}
                      required
                      autoComplete="new-password"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-rol"
                      className="mb-1 block text-xs font-medium text-slate-700"
                    >
                      Rol RBAC (para evaluación)
                    </label>
                    <select
                      id="reg-rol"
                      name="rol"
                      value={regRol}
                      onChange={(e) => setRegRol(e.target.value as UserRole)}
                      className={INPUT_CLASS}
                    >
                      {USER_ROLES.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {roleOption}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={regSubmitting || !isConfigured}
                    className="w-full rounded-lg border border-emerald-700 bg-white px-4 py-2.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {regSubmitting ? 'Registrando...' : 'Crear Cuenta'}
                  </button>
                </fieldset>
              </form>
            </section>
          </div>

          {localAuditLogs.length > 0 && (
            <section
              aria-label="Eventos de auditoría locales"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <h2 className="text-sm font-semibold text-slate-900">
                Registro Local de Intentos Fallidos (Sesión Actual)
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Por regla estricta de producción en Firestore (
                <code className="font-mono">request.auth != null</code>), los eventos sin sesión
                autenticada se registran de forma controlada localmente.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-600">
                      <th className="px-3 py-2">Timestamp (ISO 8601)</th>
                      <th className="px-3 py-2">Acción</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Detalle</th>
                      <th className="px-3 py-2">Hash Evento (SHA-256)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {localAuditLogs.map((entry) => (
                      <tr key={entry.id ?? `${entry.timestamp}-${entry.hash_evento}`}>
                        <td className="px-3 py-2 font-mono text-slate-600 tabular-nums">
                          {entry.timestamp}
                        </td>
                        <td className="px-3 py-2 font-medium text-red-700">{entry.accion}</td>
                        <td className="px-3 py-2 text-slate-700">{entry.email}</td>
                        <td className="px-3 py-2 text-slate-600">{entry.detalle}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">
                          {entry.hash_evento}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ==================== CABECERA SUPERIOR ==================== */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Cerrar menú lateral' : 'Abrir menú lateral'}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Menu className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white">
                <Leaf className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-slate-900 sm:text-base">
                  AquaPlants / AquaBrain
                </h1>
                <p className="hidden text-xs text-slate-500 sm:block">
                  Monitoreo y Gestión de Cultivos Aeropónicos
                </p>
              </div>
            </div>

            <span className="hidden items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 md:inline-flex">
              <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />
              Nube Firestore Activa
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-900">
                {profile?.nombre ?? user.email ?? 'Usuario'}
              </p>
              <p className="text-xs text-slate-500">{profile?.email ?? user.email}</p>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800 ring-1 ring-inset ring-slate-200">
              <UserCheck className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
              {profile?.rol ??
                (profileLoading ? 'Cargando perfil...' : 'Sin perfil en Firestore')}
            </span>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* ==================== BARRA LATERAL RESPONSIVE ==================== */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="no-print fixed inset-0 z-20 bg-slate-900/30 lg:hidden"
            aria-hidden="true"
          />
        )}

        <aside
          className={`no-print fixed top-16 bottom-0 left-0 z-20 w-64 shrink-0 border-r border-slate-200 bg-white p-4 transition-transform duration-200 lg:static lg:translate-x-0 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav aria-label="Navegación de módulos" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                    strokeWidth={1.75}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-800">Sesión Segura</p>
            <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={user.uid}>
              UID: {user.uid}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Cifrado AES-GCM 256-bit y firmas SHA-256 activos
            </p>
          </div>
        </aside>

        {/* ==================== CONTENIDO PRINCIPAL ==================== */}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {(authError || uiMessage) && (
              <section aria-live="polite" className="no-print">
                {authError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    Error: {authError}
                  </p>
                )}
                {uiMessage && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    {uiMessage}
                  </p>
                )}
              </section>
            )}

            {activeTab === 'dashboard' && (
              <DashboardMonitor
                profile={profile}
                userUid={user.uid}
                userEmail={user.email ?? 'desconocido'}
              />
            )}

            {activeTab === 'crud' && (
              <CrudManager
                profile={profile}
                userUid={user.uid}
                userEmail={user.email ?? 'desconocido'}
              />
            )}

            {activeTab === 'iot' && (
              <IotSimulator
                profile={profile}
                userUid={user.uid}
                userEmail={user.email ?? 'desconocido'}
              />
            )}

            {activeTab === 'report' && (
              <ManagementReport
                profile={profile}
                userUid={user.uid}
                userEmail={user.email ?? 'desconocido'}
              />
            )}

            {activeTab === 'audit' && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                    Auditoría Inmutable y Auto-test Criptográfico
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Verificación en vivo de cifrado AES-GCM (PBKDF2 SHA-256), sanitización XSS y
                    bitácora de eventos
                  </p>
                </div>

                {/* Auto-test Criptográfico */}
                <section
                  id="autotest-criptografico"
                  className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <KeyRound className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
                    <h3 className="text-base font-semibold text-slate-900">
                      Auto-test Criptográfico (AES-GCM 256-bit + PBKDF2 + SHA-256 + XSS)
                    </h3>
                  </div>

                  <form
                    onSubmit={(e) => e.preventDefault()}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <fieldset className="space-y-3">
                      <legend className="text-sm font-medium text-slate-800">
                        Entrada de Prueba en Tiempo Real
                      </legend>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <label
                            htmlFor="crypto-test-input"
                            className="mb-1 block text-xs font-medium text-slate-700"
                          >
                            Escribe un texto (puedes incluir etiquetas HTML para probar
                            sanitización)
                          </label>
                          <input
                            id="crypto-test-input"
                            type="text"
                            value={cryptoInput}
                            onChange={(e) => setCryptoInput(e.target.value)}
                            placeholder="Ej: Sensor PH-01 = 6.2 <script>alert(1)</script>"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleTestCorruptPayload()}
                          className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Probar Descifrado de Payload Corrupto
                        </button>
                      </div>
                    </fieldset>
                  </form>

                  {cryptoError && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800"
                    >
                      {cryptoError}
                    </p>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                          <th className="px-3 py-2.5">Operación</th>
                          <th className="px-3 py-2.5">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr>
                          <th className="px-3 py-2.5 font-medium text-slate-700">
                            Entrada Sanitizada (anti-XSS)
                          </th>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-800">
                            {sanitizedPreview || '(vacío)'}
                          </td>
                        </tr>
                        <tr>
                          <th className="px-3 py-2.5 font-medium text-slate-700">
                            Cifrado AES-GCM (base64(iv):base64(ciphertext))
                          </th>
                          <td className="break-all px-3 py-2.5 font-mono text-xs text-emerald-800">
                            {encryptedOutput || '(escribe un texto arriba)'}
                          </td>
                        </tr>
                        <tr>
                          <th className="px-3 py-2.5 font-medium text-slate-700">
                            Descifrado AES-GCM
                          </th>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-800">
                            {decryptedOutput || '(escribe un texto arriba)'}
                          </td>
                        </tr>
                        <tr>
                          <th className="px-3 py-2.5 font-medium text-slate-700">
                            Digest SHA-256 (hex minúsculas)
                          </th>
                          <td className="break-all px-3 py-2.5 font-mono text-xs text-slate-600">
                            {sha256Output || '(escribe un texto arriba)'}
                          </td>
                        </tr>
                        {corruptDecryptTest && (
                          <tr>
                            <th className="px-3 py-2.5 font-medium text-slate-700">
                              Prueba controlada con payload corrupto
                            </th>
                            <td className="px-3 py-2.5 font-mono text-xs text-red-700">
                              {corruptDecryptTest}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Bitácora Audit Logs */}
                <section
                  id="auditoria-tiempo-real"
                  className="rounded-xl border border-slate-200 bg-white shadow-xs"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
                    <h3 className="text-base font-semibold text-slate-900">
                      Bitácora de Auditoría Inmutable (Últimos 15 Registros en Tiempo Real)
                    </h3>
                  </div>

                  {visibleAuditError && (
                    <p role="alert" className="px-5 py-3 text-sm text-red-700">
                      {visibleAuditError}
                    </p>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                          <th className="px-3 py-2.5">Timestamp (ISO 8601)</th>
                          <th className="px-3 py-2.5">Acción</th>
                          <th className="px-3 py-2.5">UID</th>
                          <th className="px-3 py-2.5">Correo</th>
                          <th className="px-3 py-2.5">Rol</th>
                          <th className="px-3 py-2.5">Detalle</th>
                          <th className="px-3 py-2.5">Hash Evento (SHA-256)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleAuditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                              No hay registros en audit_logs todavía.
                            </td>
                          </tr>
                        ) : (
                          visibleAuditLogs.map((entry) => (
                            <tr
                              key={entry.id ?? `${entry.timestamp}-${entry.hash_evento}`}
                              className="transition-colors hover:bg-slate-50/80"
                            >
                              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-600 tabular-nums">
                                {entry.timestamp}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-900">
                                {entry.accion}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                                {entry.uid}
                              </td>
                              <td className="px-3 py-2.5 text-slate-700">{entry.email}</td>
                              <td className="px-3 py-2.5">
                                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                  {entry.rol}
                                </span>
                              </td>
                              <td className="max-w-xs px-3 py-2.5 text-slate-600">
                                {entry.detalle}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                                {entry.hash_evento}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
