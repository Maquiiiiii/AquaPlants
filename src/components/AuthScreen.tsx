import { useEffect, useState, type FormEvent } from 'react';
import { Briefcase, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeLocalAuditEvents } from '../security/auditService';
import { USER_ROLES, type AuditLogEntry, type UserRole } from '../types/auth';

type AuthMode = 'login' | 'register';

export default function AuthScreen() {
  const {
    authError,
    isConfigured,
    configError,
    login,
    register,
    clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');

  // Estado Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Estado Registro
  const [regNombre, setRegNombre] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRol, setRegRol] = useState<UserRole>('Encargado de cultivo');
  const [regSubmitting, setRegSubmitting] = useState(false);

  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [localAuditLogs, setLocalAuditLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    return subscribeLocalAuditEvents(setLocalAuditLogs);
  }, []);

  function switchMode(nextMode: AuthMode) {
    if (nextMode === mode) return;
    clearAuthError();
    setUiMessage(null);
    setMode(nextMode);
  }

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

  return (
    <main className="auth-font relative min-h-screen overflow-hidden bg-[#00753A] px-4 py-8 text-[#F2F0EC] sm:px-8 sm:py-10">
      {/* Decoración botánica inferior de fondo */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full"
        viewBox="0 0 1280 200"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <g stroke="#52B882" strokeWidth="2" opacity="0.42">
          <path d="M0 170C200 130 380 185 560 160M720 175C900 140 1080 180 1280 155" />
          <path
            transform="translate(30 200) rotate(-18) scale(1.5)"
            d="M0 0C14-28 14-62 0-90-14-62-14-28 0 0Z"
          />
          <path
            transform="translate(95 200) rotate(14) scale(1.1)"
            d="M0 0C14-28 14-62 0-90-14-62-14-28 0 0Z"
          />
          <path
            transform="translate(1185 200) rotate(-12) scale(1.4)"
            d="M0 0C14-28 14-62 0-90-14-62-14-28 0 0Z"
          />
          <path
            transform="translate(1245 200) rotate(16) scale(1.0)"
            d="M0 0C14-28 14-62 0-90-14-62-14-28 0 0Z"
          />
        </g>
      </svg>

      <div className="relative z-10 mx-auto max-w-[1160px] space-y-6">
        {/* Cabecera superior con LogoAquaSVG */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 sm:gap-5">
            <img
              src="/LogoAquaSVG.svg"
              alt="AquaPlants"
              className="block h-auto w-[185px] sm:w-[230px]"
            />
            <span
              className="hidden h-7 w-px bg-[#F2F0EC]/45 sm:inline-block"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-[#F2F0EC]">
              Monitoreo de Cultivos Aeropónicos
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-[#0D3B24]/35 px-3.5 py-1.5 text-xs font-semibold text-[#F2F0EC] ring-1 ring-inset ring-[#F2F0EC]/25 lg:hidden">
            <span
              className={`h-2 w-2 rounded-full ${
                isConfigured ? 'aqua-dot-pulse bg-[#34D399]' : 'bg-[#E6A608]'
              }`}
            />
            {isConfigured ? 'Firebase Cloud Conectado' : 'Entorno Pendiente'}
          </div>
        </header>

        {!isConfigured && configError && (
          <section
            aria-live="polite"
            className="rounded-2xl border border-[#E6A608]/50 bg-[#0D3B24]/70 px-5 py-4 text-sm text-[#F2F0EC]"
          >
            <h2 className="font-bold text-[#E6A608]">Configuración de Entorno Pendiente</h2>
            <p role="alert" className="mt-1">
              {configError}
            </p>
            <p className="mt-1 text-xs text-[#F2F0EC]/80">
              Crea un archivo <code className="font-mono">.env</code> basado en{' '}
              <code className="font-mono">.env.example</code> para habilitar Firebase Authentication
              y Cloud Firestore.
            </p>
          </section>
        )}

        {/* Tarjeta principal centrada (Solo un formulario visible a la vez) */}
        <div className="flex flex-col overflow-hidden rounded-[24px] shadow-[0_24px_50px_rgba(0,50,25,0.28)] lg:min-h-[632px] lg:flex-row">
          {/* Panel izquierdo: Formulario único con transición */}
          <section
            aria-label={mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
            className="flex w-full flex-col justify-center gap-5 bg-[#FAF6EE] px-6 py-8 text-[#14261C] sm:px-12 sm:py-10 lg:w-[540px] lg:shrink-0"
          >
            <h1 className="text-[28px] font-extrabold tracking-[-0.01em] text-[#14261C] sm:text-[32px]">
              {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </h1>

            {/* Selector tipo pill de la referencia */}
            <div
              role="tablist"
              aria-label="Modo de acceso"
              className="flex gap-1 rounded-[15px] bg-[#EDE7D9] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => switchMode('login')}
                className={`auth-tab ${mode === 'login' ? 'auth-tab-active' : ''}`}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => switchMode('register')}
                className={`auth-tab ${mode === 'register' ? 'auth-tab-active' : ''}`}
              >
                Crear Cuenta
              </button>
            </div>

            {(authError || uiMessage) && (
              <div aria-live="polite">
                {authError && (
                  <p
                    role="alert"
                    className="rounded-[12px] border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
                  >
                    {authError}
                  </p>
                )}
                {uiMessage && (
                  <p className="rounded-[12px] border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
                    {uiMessage}
                  </p>
                )}
              </div>
            )}

            {mode === 'login' ? (
              <form
                key="login-form"
                onSubmit={handleLoginSubmit}
                className="auth-fade-slide flex flex-col gap-5"
              >
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-2 ml-0.5 block text-[13px] font-semibold text-[#14261C]"
                  >
                    Correo electrónico
                  </label>
                  <div className="auth-field">
                    <Mail className="auth-field-icon h-[18px] w-[18px]" strokeWidth={2} />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="operador@aquaplants.cl"
                      className="auth-input"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="mb-2 ml-0.5 block text-[13px] font-semibold text-[#14261C]"
                  >
                    Contraseña
                  </label>
                  <div className="auth-field">
                    <Lock className="auth-field-icon h-[18px] w-[18px]" strokeWidth={2} />
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      minLength={8}
                      required
                      autoComplete="current-password"
                      placeholder="Mínimo 8 caracteres"
                      className="auth-input"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loginSubmitting || !isConfigured}
                  className="auth-cta mt-1 w-full"
                >
                  {loginSubmitting ? 'Validando acceso...' : 'Ingresar a la Plataforma'}
                </button>

                <p className="pt-1 text-center text-sm text-[#45564C]">
                  ¿No tienes cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="font-bold text-[#00753A] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[#E6A608]"
                  >
                    Crear cuenta
                  </button>
                </p>
              </form>
            ) : (
              <form
                key="register-form"
                onSubmit={handleRegisterSubmit}
                className="auth-fade-slide flex flex-col gap-4"
              >
                <div>
                  <label
                    htmlFor="reg-nombre"
                    className="mb-1.5 ml-0.5 block text-[13px] font-semibold text-[#14261C]"
                  >
                    Nombre completo
                  </label>
                  <div className="auth-field">
                    <User className="auth-field-icon h-[18px] w-[18px]" strokeWidth={2} />
                    <input
                      id="reg-nombre"
                      name="nombre"
                      type="text"
                      value={regNombre}
                      onChange={(e) => setRegNombre(e.target.value)}
                      required
                      autoComplete="name"
                      placeholder="Nombre y apellido"
                      className="auth-input"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-email"
                    className="mb-1.5 ml-0.5 block text-[13px] font-semibold text-[#14261C]"
                  >
                    Correo electrónico
                  </label>
                  <div className="auth-field">
                    <Mail className="auth-field-icon h-[18px] w-[18px]" strokeWidth={2} />
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="usuario@aquaplants.cl"
                      className="auth-input"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-password"
                    className="mb-1.5 ml-0.5 block text-[13px] font-semibold text-[#14261C]"
                  >
                    Contraseña (mínimo 8 caracteres)
                  </label>
                  <div className="auth-field">
                    <Lock className="auth-field-icon h-[18px] w-[18px]" strokeWidth={2} />
                    <input
                      id="reg-password"
                      name="password"
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      minLength={8}
                      required
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                      className="auth-input"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-rol"
                    className="mb-1.5 ml-0.5 block text-[13px] font-semibold text-[#14261C]"
                  >
                    Rol RBAC
                  </label>
                  <div className="auth-field">
                    <Briefcase className="auth-field-icon h-[18px] w-[18px]" strokeWidth={2} />
                    <select
                      id="reg-rol"
                      name="rol"
                      value={regRol}
                      onChange={(e) => setRegRol(e.target.value as UserRole)}
                      className="auth-input"
                    >
                      {USER_ROLES.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {roleOption}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={regSubmitting || !isConfigured}
                  className="auth-cta mt-1 w-full"
                >
                  {regSubmitting ? 'Registrando cuenta...' : 'Crear Cuenta'}
                </button>

                <p className="pt-1 text-center text-sm text-[#45564C]">
                  ¿Ya tienes cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-bold text-[#00753A] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[#E6A608]"
                  >
                    Iniciar sesión
                  </button>
                </p>
              </form>
            )}
          </section>

          {/* Panel derecho: Ilustración aeropónica animada fiel a la referencia */}
          <aside className="relative hidden flex-1 overflow-hidden bg-[#DDF5E6] px-12 py-10 lg:block">
            <div className="inline-flex items-center gap-2.5 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-[#0D3B24]">
              <span
                className={`h-[9px] w-[9px] rounded-full ${
                  isConfigured ? 'aqua-dot-pulse bg-[#34D399]' : 'bg-[#E6A608]'
                }`}
              />
              {isConfigured ? 'Firebase Cloud Conectado' : 'Entorno Pendiente'}
            </div>

            <h2 className="mt-5 max-w-[440px] text-[34px] font-extrabold leading-[1.15] text-[#0D3B24]">
              Monitorea tus cultivos aeropónicos
            </h2>

            <p className="mt-3 flex max-w-[400px] items-start gap-2 text-sm leading-relaxed text-[#0D3B24]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0D3B24]" strokeWidth={2} />
              <span>
                Telemetría en tiempo real, protegida con cifrado AES-GCM y verificación de
                integridad SHA-256.
              </span>
            </p>

            <svg
              className="pointer-events-none absolute bottom-0 left-0 h-[440px] w-full"
              viewBox="0 0 620 470"
              preserveAspectRatio="xMidYMax slice"
              role="img"
              aria-label="Lechugas, albahaca y brotes creciendo sobre colinas verdes"
            >
              <defs>
                <g id="aq-lf">
                  <path d="M0 0C16-30 16-70 0-100-16-70-16-30 0 0Z" />
                  <path
                    d="M0-6V-84"
                    stroke="#fff"
                    strokeOpacity=".4"
                    strokeWidth="2"
                    fill="none"
                  />
                </g>
                <g id="aq-bl">
                  <path d="M0 0C34-14 46-52 0-84-46-52-34-14 0 0Z" />
                  <path
                    d="M0-4V-70"
                    stroke="#fff"
                    strokeOpacity=".35"
                    strokeWidth="2"
                    fill="none"
                  />
                </g>
                <g id="aq-ll">
                  <path d="M0 0C-40-20-62-70-44-112-36-128-24-122-18-134-10-148 8-148 14-134 22-122 36-128 44-112 62-70 40-20 0 0Z" />
                  <path
                    d="M0-6V-110"
                    stroke="#fff"
                    strokeOpacity=".4"
                    strokeWidth="2"
                    fill="none"
                  />
                </g>
                <path id="aq-dr" d="M0-14C7-4 10 2 10 6A10 10 0 0 1-10 6C-10 2-7-4 0-14Z" />
              </defs>

              <path
                className="aqua-arc"
                d="M60 330Q110 250 220 232"
                stroke="#5CC863"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="4 8"
                opacity=".8"
              />
              <path
                className="aqua-arc"
                d="M330 270Q380 190 470 175"
                stroke="#5CC863"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="4 8"
                opacity=".8"
              />
              <path
                className="aqua-arc"
                d="M575 290Q585 230 600 200"
                stroke="#5CC863"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="4 8"
                opacity=".8"
              />

              <g className="aqua-drop" style={{ animationDelay: '0s' }}>
                <use href="#aq-dr" transform="translate(210 70)" fill="#5CC863" />
              </g>
              <g className="aqua-drop" style={{ animationDelay: '1.1s' }}>
                <use href="#aq-dr" transform="translate(430 30)" fill="#7ED68C" />
              </g>
              <g className="aqua-drop" style={{ animationDelay: '2.2s' }}>
                <use href="#aq-dr" transform="translate(570 140)" fill="#5CC863" />
              </g>
              <g className="aqua-drop" style={{ animationDelay: '0.6s' }}>
                <use href="#aq-dr" transform="translate(90 230)" fill="#7ED68C" />
              </g>
              <g className="aqua-drop" style={{ animationDelay: '1.7s' }}>
                <use href="#aq-dr" transform="translate(330 150)" fill="#5CC863" />
              </g>

              <path
                d="M0 395C120 345 240 355 340 392S520 405 620 355V470H0Z"
                fill="#9BE0B0"
              />

              <g className="aqua-grow" style={{ animationDelay: '0s' }}>
                <g className="aqua-sway" style={{ animationDuration: '6s' }}>
                  <path
                    d="M520 442C514 380 528 320 520 250"
                    stroke="#3E9E4A"
                    strokeWidth="6"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <use
                    href="#aq-bl"
                    transform="translate(520 350) rotate(-62) scale(1.05)"
                    fill="#2E9E3E"
                  />
                  <use
                    href="#aq-bl"
                    transform="translate(520 350) rotate(58) scale(1.05)"
                    fill="#3FB04E"
                  />
                  <use
                    href="#aq-bl"
                    transform="translate(520 300) rotate(-52) scale(0.9)"
                    fill="#4CBB57"
                  />
                  <use
                    href="#aq-bl"
                    transform="translate(520 300) rotate(50) scale(0.85)"
                    fill="#2E9E3E"
                  />
                  <use
                    href="#aq-bl"
                    transform="translate(520 262) rotate(-30) scale(0.7)"
                    fill="#3FB04E"
                  />
                  <use
                    href="#aq-bl"
                    transform="translate(520 262) rotate(32) scale(0.7)"
                    fill="#4CBB57"
                  />
                  <use
                    href="#aq-bl"
                    transform="translate(520 250) rotate(0) scale(0.8)"
                    fill="#5CC863"
                  />
                </g>
              </g>

              <g className="aqua-grow" style={{ animationDelay: '0.12s' }}>
                <g className="aqua-sway" style={{ animationDelay: '1.9s' }}>
                  <use
                    href="#aq-ll"
                    transform="translate(390 440) rotate(-62) scale(1.19)"
                    fill="#6FC83A"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(390 440) rotate(62) scale(1.19)"
                    fill="#86D544"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(390 440) rotate(-36) scale(1.38)"
                    fill="#9CE04C"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(390 440) rotate(36) scale(1.38)"
                    fill="#B4EA5E"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(390 440) rotate(0) scale(1.5)"
                    fill="#C8F274"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(390 440) rotate(-14) scale(1.0)"
                    fill="#C8F274"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(390 440) rotate(16) scale(0.88)"
                    fill="#D4F78A"
                  />
                </g>
              </g>

              <g className="aqua-grow" style={{ animationDelay: '0.24s' }}>
                <g className="aqua-sway" style={{ animationDelay: '2.3s' }}>
                  <use
                    href="#aq-ll"
                    transform="translate(235 445) rotate(-62) scale(0.66)"
                    fill="#6FC83A"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(235 445) rotate(62) scale(0.66)"
                    fill="#86D544"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(235 445) rotate(-36) scale(0.77)"
                    fill="#9CE04C"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(235 445) rotate(36) scale(0.77)"
                    fill="#B4EA5E"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(235 445) rotate(0) scale(0.84)"
                    fill="#C8F274"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(235 445) rotate(-14) scale(0.56)"
                    fill="#C8F274"
                  />
                  <use
                    href="#aq-ll"
                    transform="translate(235 445) rotate(16) scale(0.49)"
                    fill="#D4F78A"
                  />
                </g>
              </g>

              <g className="aqua-grow" style={{ animationDelay: '0.32s' }}>
                <g
                  className="aqua-sway"
                  style={{ animationDelay: '2.7s', animationDuration: '4s' }}
                >
                  <path
                    d="M95 448V388"
                    stroke="#3E9E4A"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(95 388) rotate(-48) scale(0.5)"
                    fill="#4CBB57"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(95 388) rotate(46) scale(0.425)"
                    fill="#6FD06A"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(95 388) rotate(0) scale(0.3)"
                    fill="#8BE07C"
                  />
                  <path
                    d="M150 448V363"
                    stroke="#3E9E4A"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(150 363) rotate(-48) scale(0.6)"
                    fill="#4CBB57"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(150 363) rotate(46) scale(0.51)"
                    fill="#6FD06A"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(150 363) rotate(0) scale(0.36)"
                    fill="#8BE07C"
                  />
                </g>
              </g>

              <g className="aqua-grow" style={{ animationDelay: '0.4s' }}>
                <g
                  className="aqua-sway"
                  style={{ animationDelay: '2.1s', animationDuration: '4.5s' }}
                >
                  <path
                    d="M310 452V357"
                    stroke="#3E9E4A"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(310 357) rotate(-48) scale(0.62)"
                    fill="#4CBB57"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(310 357) rotate(46) scale(0.527)"
                    fill="#6FD06A"
                  />
                  <use
                    href="#aq-lf"
                    transform="translate(310 357) rotate(0) scale(0.372)"
                    fill="#8BE07C"
                  />
                </g>
              </g>

              <path
                d="M0 432C140 392 280 408 380 430S560 446 620 414V470H0Z"
                fill="#52BE78"
              />
              <path
                d="M0 458C180 430 400 446 620 442V470H0Z"
                fill="#2F9D66"
              />
            </svg>
          </aside>
        </div>

        {/* Tabla diagnóstica local de intentos fallidos (LOGIN_FALLIDO) */}
        {localAuditLogs.length > 0 && (
          <section
            aria-label="Eventos de auditoría locales"
            className="rounded-2xl border border-[#F2F0EC]/25 bg-[#0D3B24]/85 p-5 text-[#F2F0EC] shadow-lg"
          >
            <h2 className="text-sm font-bold text-[#F2F0EC]">
              Registro Local de Intentos Fallidos (Sesión Actual)
            </h2>
            <p className="mt-1 text-xs text-[#F2F0EC]/80">
              Por regla estricta de producción en Firestore (
              <code className="font-mono">request.auth != null</code>), los eventos sin sesión
              autenticada se registran de forma controlada localmente.
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl bg-[#FAF6EE] text-[#14261C]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#C5D0C8] bg-[#EDE7D9] font-semibold text-[#14261C]">
                    <th className="px-3 py-2">Timestamp (ISO 8601)</th>
                    <th className="px-3 py-2">Acción</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Detalle</th>
                    <th className="px-3 py-2">Hash Evento (SHA-256)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDE7D9]">
                  {localAuditLogs.map((entry) => (
                    <tr key={entry.id ?? `${entry.timestamp}-${entry.hash_evento}`}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums">
                        {entry.timestamp}
                      </td>
                      <td className="px-3 py-2 font-semibold text-red-700">{entry.accion}</td>
                      <td className="px-3 py-2">{entry.email}</td>
                      <td className="px-3 py-2">{entry.detalle}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{entry.hash_evento}</td>
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
