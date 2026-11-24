import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clover,
  Eye,
  EyeOff,
  Flower2,
  Leaf,
  Loader2,
  ShieldCheck,
  Sprout,
  TreePine,
  Trees,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USER_ROLES, type UserRole } from '../types/auth';

type AuthView = 'login' | 'register';

type FieldKey =
  | 'loginEmail'
  | 'loginPassword'
  | 'regNombre'
  | 'regEmail'
  | 'regPassword'
  | 'regConfirmPassword';

type FieldErrors = Partial<Record<FieldKey, string>>;

interface BotanicalItem {
  id: number;
  xPct: number;
  yPct: number;
  size: number;
  baseRotate: number;
  iconIndex: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BOTANICAL_ICONS = [
  Sprout,
  Leaf,
  Flower2,
  Trees,
  Clover,
  TreePine,
] as const;

// 20 iconos en grilla 5x4 con desplazamiento orgánico determinista
const BOTANICAL_ITEMS: BotanicalItem[] = Array.from({ length: 20 }, (_, i) => {
  const col = i % 5;
  const row = Math.floor(i / 5);
  const hashA = Math.sin((i + 1) * 12.9898) * 43758.5453;
  const randA = hashA - Math.floor(hashA);
  const hashB = Math.sin((i + 1) * 78.233) * 19341.1234;
  const randB = hashB - Math.floor(hashB);

  const cellW = 100 / 5;
  const cellH = 100 / 4;
  const xPct = col * cellW + 5 + randA * (cellW - 10);
  const yPct = row * cellH + 6 + randB * (cellH - 12);
  const size = Math.round(20 + ((i * 7) % 19)); // 20px - 38px
  const baseRotate = Math.round((randA - 0.5) * 56 + (i % 2 === 0 ? 1 : -1) * 8);

  return {
    id: i,
    xPct,
    yPct,
    size,
    baseRotate,
    iconIndex: i % BOTANICAL_ICONS.length,
  };
});

const ROLE_ICON_MAP: Record<UserRole, typeof Sprout> = {
  'Encargado de cultivo': Sprout,
  Supervisor: ClipboardCheck,
  Administrador: ShieldCheck,
};

function getPasswordStrength(password: string): {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (password.length === 0) return { level: 0, label: '' };
  if (password.length < 8) return { level: 1, label: 'Muy débil' };

  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (hasUpper && hasNumber && hasSpecial) {
    return { level: 4, label: 'Muy segura' };
  }
  if (hasUpper && hasNumber) {
    return { level: 3, label: 'Segura' };
  }
  return { level: 2, label: 'Aceptable' };
}

function validateName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Ingresa tu nombre completo';
  if (trimmed.length < 3) return 'Mínimo 3 caracteres';
  if (trimmed.length > 80) return 'Máximo 80 caracteres';
  if (/[<>]/.test(trimmed)) return 'Caracteres no permitidos (< o >)';
  return undefined;
}

function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Ingresa tu correo electrónico';
  if (trimmed.length > 120) return 'Máximo 120 caracteres';
  if (!EMAIL_REGEX.test(trimmed)) return 'Ingresa un correo válido';
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (!value) return 'Ingresa tu contraseña';
  if (value.length < 8) return 'Mínimo 8 caracteres';
  return undefined;
}

function validateConfirmPassword(
  password: string,
  confirmPassword: string
): string | undefined {
  if (!confirmPassword) return 'Confirma tu contraseña';
  if (password !== confirmPassword) return 'Las contraseñas no coinciden';
  return undefined;
}

export default function AuthScreen() {
  const {
    authError,
    isConfigured,
    configError,
    login,
    register,
    clearAuthError,
  } = useAuth();

  const [view, setView] = useState<AuthView>('login');

  // Estado Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Estado Registro
  const [regNombre, setRegNombre] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regRol, setRegRol] = useState<UserRole>('Encargado de cultivo');
  const [regSubmitting, setRegSubmitting] = useState(false);

  // Dropdown custom de rol
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement | null>(null);

  // Errores por campo y disparo de animación shake
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [shakeTrigger, setShakeTrigger] = useState(0);

  const [uiMessage, setUiMessage] = useState<string | null>(null);

  // Referencias para física de repulsión a 60 FPS sin re-renders
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const physicsRef = useRef(
    BOTANICAL_ITEMS.map((item) => ({
      x: 0,
      y: 0,
      rot: item.baseRotate,
    }))
  );

  // Cierre del dropdown custom al hacer clic fuera o presionar Escape
  useEffect(() => {
    if (!roleDropdownOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        roleDropdownRef.current &&
        !roleDropdownRef.current.contains(event.target as Node)
      ) {
        setRoleDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRoleDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [roleDropdownOpen]);

  // Marcar campos en rojo con temblor ante error de Firebase Authentication
  useEffect(() => {
    if (!authError) return;
    if (view === 'login') {
      setFieldErrors((prev) => ({
        ...prev,
        loginEmail: prev.loginEmail ?? 'Verifica tus credenciales',
        loginPassword: prev.loginPassword ?? 'Verifica tus credenciales',
      }));
      setShakeTrigger((c) => c + 1);
    } else {
      setFieldErrors((prev) => ({
        ...prev,
        regEmail: prev.regEmail ?? 'Revisa el correo ingresado',
      }));
      setShakeTrigger((c) => c + 1);
    }
  }, [authError, view]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      BOTANICAL_ITEMS.forEach((item, idx) => {
        const el = iconRefs.current[idx];
        if (el) {
          el.style.transform = `translate3d(0px, 0px, 0) rotate(${item.baseRotate}deg)`;
        }
      });
      return;
    }

    const INFLUENCE_RADIUS = 148;
    const MAX_DISPLACEMENT = 36;
    const LERP_FACTOR = 0.1;
    let rafId = 0;

    const tick = () => {
      const container = rightPanelRef.current;
      if (container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        const pointer = pointerRef.current;

        for (let i = 0; i < BOTANICAL_ITEMS.length; i++) {
          const item = BOTANICAL_ITEMS[i];
          const state = physicsRef.current[i];
          const el = iconRefs.current[i];
          if (!el) continue;

          let targetX = 0;
          let targetY = 0;
          let targetRot = item.baseRotate;

          if (pointer.active && width > 0 && height > 0) {
            const originX = (item.xPct / 100) * width;
            const originY = (item.yPct / 100) * height;
            const dx = originX - pointer.x;
            const dy = originY - pointer.y;
            const dist = Math.hypot(dx, dy);

            if (dist < INFLUENCE_RADIUS) {
              const force = (INFLUENCE_RADIUS - dist) / INFLUENCE_RADIUS;
              const easedForce = force * force;
              const normX = dist > 0.001 ? dx / dist : 1;
              const normY = dist > 0.001 ? dy / dist : 0;

              targetX = normX * MAX_DISPLACEMENT * easedForce;
              targetY = normY * MAX_DISPLACEMENT * easedForce;
              targetRot = item.baseRotate + normX * 16 * easedForce;
            }
          }

          state.x += (targetX - state.x) * LERP_FACTOR;
          state.y += (targetY - state.y) * LERP_FACTOR;
          state.rot += (targetRot - state.rot) * LERP_FACTOR;

          if (Math.abs(state.x) < 0.01) state.x = 0;
          if (Math.abs(state.y) < 0.01) state.y = 0;

          el.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) rotate(${state.rot.toFixed(2)}deg)`;
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  const handlePanelMouseMove = (e: ReactMouseEvent<HTMLElement>) => {
    const container = rightPanelRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    pointerRef.current.x = e.clientX - rect.left;
    pointerRef.current.y = e.clientY - rect.top;
    pointerRef.current.active = true;
  };

  const handlePanelMouseLeave = () => {
    pointerRef.current.active = false;
  };

  const clearFieldError = (key: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const switchView = (nextView: AuthView) => {
    if (nextView === view) return;
    clearAuthError();
    setUiMessage(null);
    setFieldErrors({});
    setRoleDropdownOpen(false);
    setView(nextView);
  };

  const handleLoginSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearAuthError();
    setUiMessage(null);

    const emailErr = validateEmail(loginEmail);
    const passwordErr = validatePassword(loginPassword);

    if (emailErr || passwordErr) {
      setFieldErrors({
        ...(emailErr ? { loginEmail: emailErr } : {}),
        ...(passwordErr ? { loginPassword: passwordErr } : {}),
      });
      setShakeTrigger((c) => c + 1);
      return;
    }

    setFieldErrors({});
    setLoginSubmitting(true);
    try {
      await login(loginEmail.trim(), loginPassword);
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearAuthError();
    setUiMessage(null);

    const nombreErr = validateName(regNombre);
    const emailErr = validateEmail(regEmail);
    const passwordErr = validatePassword(regPassword);
    const confirmErr = validateConfirmPassword(regPassword, regConfirmPassword);

    if (nombreErr || emailErr || passwordErr || confirmErr) {
      setFieldErrors({
        ...(nombreErr ? { regNombre: nombreErr } : {}),
        ...(emailErr ? { regEmail: emailErr } : {}),
        ...(passwordErr ? { regPassword: passwordErr } : {}),
        ...(confirmErr ? { regConfirmPassword: confirmErr } : {}),
      });
      setShakeTrigger((c) => c + 1);
      return;
    }

    setFieldErrors({});
    setRegSubmitting(true);
    try {
      await register(regNombre.trim(), regEmail.trim(), regPassword, regRol);
      setUiMessage('Cuenta creada correctamente. Sesión iniciada.');
      setRegNombre('');
      setRegEmail('');
      setRegPassword('');
      setRegConfirmPassword('');
    } finally {
      setRegSubmitting(false);
    }
  };

  const getInputClassName = (hasError: boolean, extraPadding = '') =>
    `w-full rounded-xl border bg-white px-4 py-3.5 text-sm text-slate-900 transition-all duration-200 focus:outline-none ${extraPadding} ${
      hasError
        ? 'border-red-500 ring-4 ring-red-500/15 placeholder:text-red-300'
        : 'border-slate-200 placeholder:text-slate-400/80 focus:border-[#00753A] focus:ring-4 focus:ring-[#00753A]/10'
    }`;

  const passwordStrength = getPasswordStrength(regPassword);
  const SelectedRoleIcon = ROLE_ICON_MAP[regRol];

  return (
    <main className="m-0 grid h-screen w-screen grid-cols-1 overflow-hidden rounded-none bg-white p-0 text-slate-900 lg:grid-cols-2">
      {/* Mitad izquierda (50%): Fotografía de personas con plantas e identidad #00753A */}
      <aside className="order-1 relative hidden h-full w-full flex-col justify-between overflow-hidden bg-[#00753A] p-10 text-[#F2F0EC] lg:flex lg:p-14">
        <img
          src="/imagenes/background.jpg"
          alt="Equipo AquaPlants junto a cultivos aeropónicos"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#00753A]/95 via-[#00753A]/35 to-[#00753A]/25"
        />

        <div className="relative z-10">
          <img
            src="/LogoAquaSVG.svg"
            alt="AquaPlants"
            className="h-9 w-auto"
          />
        </div>

        <div className="relative z-10 max-w-lg space-y-2.5">
          <h2 className="text-3xl font-bold leading-tight text-[#F2F0EC] xl:text-4xl">
            Cultiva el futuro con AquaPlants
          </h2>
          <p className="text-base leading-relaxed text-[#F2F0EC]/90">
            Monitoreo inteligente y gestión eficiente para tus cultivos aeropónicos.
          </p>
        </div>
      </aside>

      {/* Mitad derecha (50%): Fondo interactivo botánico + Formulario */}
      <section
        ref={rightPanelRef}
        onMouseMove={handlePanelMouseMove}
        onMouseLeave={handlePanelMouseLeave}
        aria-label={view === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
        className="order-2 relative flex h-full w-full flex-col items-center justify-center overflow-y-auto overflow-x-hidden bg-white px-8 py-8 lg:px-16"
      >
        {/* Capa de iconos botánicos con repulsión fluida */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          {BOTANICAL_ITEMS.map((item, idx) => {
            const IconComponent = BOTANICAL_ICONS[item.iconIndex];
            return (
              <div
                key={item.id}
                ref={(el) => {
                  iconRefs.current[idx] = el;
                }}
                style={{
                  left: `${item.xPct}%`,
                  top: `${item.yPct}%`,
                  transform: `translate3d(0px, 0px, 0) rotate(${item.baseRotate}deg)`,
                  willChange: 'transform',
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-slate-200/80"
              >
                <IconComponent size={item.size} strokeWidth={1.6} />
              </div>
            );
          })}
        </div>

        <div
          className={`relative z-10 w-full rounded-2xl bg-white/80 p-6 sm:p-8 ${
            view === 'register' ? 'max-w-[450px]' : 'max-w-md'
          }`}
        >
          {!isConfigured && configError && (
            <section
              aria-live="polite"
              className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900"
            >
              <p className="font-semibold">Configuración de entorno pendiente</p>
              <p role="alert" className="mt-0.5">
                {configError}
              </p>
            </section>
          )}

          {(authError || uiMessage) && (
            <div aria-live="polite" className="mb-4">
              {authError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
                >
                  {authError}
                </p>
              )}
              {uiMessage && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
                  {uiMessage}
                </p>
              )}
            </div>
          )}

          {view === 'login' ? (
            <div key="login-view">
              <header
                className="auth-stagger-rise mb-8"
                style={{ animationDelay: '0ms' }}
              >
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
                  Iniciar Sesión
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  ¡Qué bueno verte de vuelta en AquaPlants!
                </p>
              </header>

              <form noValidate onSubmit={handleLoginSubmit} className="space-y-5">
                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '45ms' }}
                >
                  <label
                    htmlFor="login-email"
                    className="mb-2 block text-xs font-semibold text-slate-700"
                  >
                    Correo electrónico
                  </label>
                  <div
                    key={`login-email-${fieldErrors.loginEmail ? shakeTrigger : 0}`}
                    className={fieldErrors.loginEmail ? 'animate-input-shake' : ''}
                  >
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => {
                        setLoginEmail(e.target.value);
                        clearFieldError('loginEmail');
                      }}
                      onBlur={() => {
                        if (loginEmail.trim().length > 0) {
                          const err = validateEmail(loginEmail);
                          if (err) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              loginEmail: err,
                            }));
                          }
                        }
                      }}
                      autoComplete="email"
                      placeholder="operador@aquaplants.cl"
                      className={getInputClassName(Boolean(fieldErrors.loginEmail))}
                    />
                  </div>
                  {fieldErrors.loginEmail && (
                    <p className="mt-1.5 text-xs text-red-600">
                      {fieldErrors.loginEmail}
                    </p>
                  )}
                </div>

                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '90ms' }}
                >
                  <label
                    htmlFor="login-password"
                    className="mb-2 block text-xs font-semibold text-slate-700"
                  >
                    Contraseña
                  </label>
                  <div
                    key={`login-pass-${fieldErrors.loginPassword ? shakeTrigger : 0}`}
                    className={`relative ${
                      fieldErrors.loginPassword ? 'animate-input-shake' : ''
                    }`}
                  >
                    <input
                      id="login-password"
                      name="password"
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        clearFieldError('loginPassword');
                      }}
                      onBlur={() => {
                        if (loginPassword.length > 0) {
                          const err = validatePassword(loginPassword);
                          if (err) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              loginPassword: err,
                            }));
                          }
                        }
                      }}
                      autoComplete="current-password"
                      placeholder="Mínimo 8 caracteres"
                      className={getInputClassName(
                        Boolean(fieldErrors.loginPassword),
                        'pr-10'
                      )}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={
                        showLoginPassword
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition-colors hover:text-slate-600"
                    >
                      {showLoginPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.loginPassword && (
                    <p className="mt-1.5 text-xs text-red-600">
                      {fieldErrors.loginPassword}
                    </p>
                  )}
                </div>

                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '140ms' }}
                >
                  <button
                    type="submit"
                    disabled={loginSubmitting || !isConfigured}
                    className="group relative mt-7 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-[#F7C224] via-[#EEAD0E] to-[#E29C06] py-3.5 text-sm font-semibold leading-none text-slate-950 shadow-[0_8px_20px_-4px_rgba(230,166,8,0.42),inset_0_1px_0_rgba(255,255,255,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_12px_24px_-4px_rgba(230,166,8,0.52),inset_0_1px_0_rgba(255,255,255,0.6)] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                    />
                    <span className="relative z-10">
                      {loginSubmitting ? 'Validando acceso...' : 'Iniciar Sesión'}
                    </span>
                    {loginSubmitting ? (
                      <Loader2 className="relative z-10 h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <ArrowRight className="relative z-10 h-4 w-4 shrink-0 translate-y-[0.5px] transition-transform duration-200 group-hover:translate-x-1" />
                    )}
                  </button>
                </div>
              </form>

              <p
                className="auth-stagger-rise mt-7 text-center text-sm text-slate-600"
                style={{ animationDelay: '140ms' }}
              >
                ¿Nuevo en AquaPlants?{' '}
                <button
                  type="button"
                  onClick={() => switchView('register')}
                  className="font-semibold text-[#00753A] hover:underline"
                >
                  Crear cuenta
                </button>
              </p>
            </div>
          ) : (
            <div key="register-view">
              <header
                className="auth-stagger-rise mb-8"
                style={{ animationDelay: '0ms' }}
              >
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
                  Crear Cuenta
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  ¡Únete al ecosistema de cultivos aeropónicos!
                </p>
              </header>

              <form noValidate onSubmit={handleRegisterSubmit} className="space-y-5">
                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '45ms' }}
                >
                  <label
                    htmlFor="reg-nombre"
                    className="mb-2 block text-xs font-semibold text-slate-700"
                  >
                    Nombre completo
                  </label>
                  <div
                    key={`reg-nombre-${fieldErrors.regNombre ? shakeTrigger : 0}`}
                    className={fieldErrors.regNombre ? 'animate-input-shake' : ''}
                  >
                    <input
                      id="reg-nombre"
                      name="nombre"
                      type="text"
                      value={regNombre}
                      onChange={(e) => {
                        setRegNombre(e.target.value);
                        clearFieldError('regNombre');
                      }}
                      onBlur={() => {
                        if (regNombre.trim().length > 0) {
                          const err = validateName(regNombre);
                          if (err) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              regNombre: err,
                            }));
                          }
                        }
                      }}
                      autoComplete="name"
                      placeholder="Nombre y apellido"
                      className={getInputClassName(Boolean(fieldErrors.regNombre))}
                    />
                  </div>
                  {fieldErrors.regNombre && (
                    <p className="mt-1.5 text-xs text-red-600">
                      {fieldErrors.regNombre}
                    </p>
                  )}
                </div>

                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '90ms' }}
                >
                  <label
                    htmlFor="reg-email"
                    className="mb-2 block text-xs font-semibold text-slate-700"
                  >
                    Correo electrónico
                  </label>
                  <div
                    key={`reg-email-${fieldErrors.regEmail ? shakeTrigger : 0}`}
                    className={fieldErrors.regEmail ? 'animate-input-shake' : ''}
                  >
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => {
                        setRegEmail(e.target.value);
                        clearFieldError('regEmail');
                      }}
                      onBlur={() => {
                        if (regEmail.trim().length > 0) {
                          const err = validateEmail(regEmail);
                          if (err) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              regEmail: err,
                            }));
                          }
                        }
                      }}
                      autoComplete="email"
                      placeholder="usuario@aquaplants.cl"
                      className={getInputClassName(Boolean(fieldErrors.regEmail))}
                    />
                  </div>
                  {fieldErrors.regEmail && (
                    <p className="mt-1.5 text-xs text-red-600">
                      {fieldErrors.regEmail}
                    </p>
                  )}
                </div>

                {/* Fila de 2 columnas: Contraseña + Confirmar contraseña + Medidor por líneas */}
                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '135ms' }}
                >
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="reg-password"
                        className="mb-2 block text-xs font-semibold text-slate-700"
                      >
                        Contraseña
                      </label>
                      <div
                        key={`reg-pass-${fieldErrors.regPassword ? shakeTrigger : 0}`}
                        className={`relative ${
                          fieldErrors.regPassword ? 'animate-input-shake' : ''
                        }`}
                      >
                        <input
                          id="reg-password"
                          name="password"
                          type={showRegPassword ? 'text' : 'password'}
                          value={regPassword}
                          onChange={(e) => {
                            const nextPass = e.target.value;
                            setRegPassword(nextPass);
                            clearFieldError('regPassword');
                            if (!regConfirmPassword || nextPass === regConfirmPassword) {
                              clearFieldError('regConfirmPassword');
                            } else if (fieldErrors.regConfirmPassword) {
                              setFieldErrors((prev) => ({
                                ...prev,
                                regConfirmPassword: 'Las contraseñas no coinciden',
                              }));
                            }
                          }}
                          onBlur={() => {
                            if (regPassword.length > 0) {
                              const err = validatePassword(regPassword);
                              if (err) {
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  regPassword: err,
                                }));
                              }
                            }
                          }}
                          autoComplete="new-password"
                          placeholder="Mín. 8 caracteres"
                          className={getInputClassName(
                            Boolean(fieldErrors.regPassword),
                            'pl-3.5 pr-9'
                          )}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={
                            showRegPassword
                              ? 'Ocultar contraseña'
                              : 'Mostrar contraseña'
                          }
                          onClick={() => setShowRegPassword((prev) => !prev)}
                          className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition-colors hover:text-slate-600"
                        >
                          {showRegPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {fieldErrors.regPassword && (
                        <p className="mt-1.5 text-xs text-red-600">
                          {fieldErrors.regPassword}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="reg-confirm-password"
                        className="mb-2 block text-xs font-semibold text-slate-700"
                      >
                        Repetir contraseña
                      </label>
                      <div
                        key={`reg-confirm-${fieldErrors.regConfirmPassword ? shakeTrigger : 0}`}
                        className={`relative ${
                          fieldErrors.regConfirmPassword
                            ? 'animate-input-shake'
                            : ''
                        }`}
                      >
                        <input
                          id="reg-confirm-password"
                          name="confirmPassword"
                          type={showRegConfirmPassword ? 'text' : 'password'}
                          value={regConfirmPassword}
                          onChange={(e) => {
                            const nextConfirm = e.target.value;
                            setRegConfirmPassword(nextConfirm);
                            if (!nextConfirm || regPassword === nextConfirm) {
                              clearFieldError('regConfirmPassword');
                            } else {
                              setFieldErrors((prev) => ({
                                ...prev,
                                regConfirmPassword: 'Las contraseñas no coinciden',
                              }));
                            }
                          }}
                          onBlur={() => {
                            if (regConfirmPassword.length > 0) {
                              const err = validateConfirmPassword(
                                regPassword,
                                regConfirmPassword
                              );
                              if (err) {
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  regConfirmPassword: err,
                                }));
                              }
                            }
                          }}
                          autoComplete="new-password"
                          placeholder="Repite contraseña"
                          className={getInputClassName(
                            Boolean(fieldErrors.regConfirmPassword),
                            'pl-3.5 pr-9'
                          )}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={
                            showRegConfirmPassword
                              ? 'Ocultar confirmación'
                              : 'Mostrar confirmación'
                          }
                          onClick={() =>
                            setShowRegConfirmPassword((prev) => !prev)
                          }
                          className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition-colors hover:text-slate-600"
                        >
                          {showRegConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {fieldErrors.regConfirmPassword && (
                        <p className="mt-1.5 text-xs text-red-600">
                          {fieldErrors.regConfirmPassword}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Medidor de seguridad por 4 líneas */}
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="grid flex-1 grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((step) => {
                        let barColor = 'bg-slate-200';
                        if (passwordStrength.level >= step) {
                          if (passwordStrength.level === 1) barColor = 'bg-red-500';
                          else if (passwordStrength.level === 2)
                            barColor = 'bg-amber-400';
                          else if (passwordStrength.level === 3)
                            barColor = 'bg-emerald-500';
                          else barColor = 'bg-[#00753A]';
                        }
                        return (
                          <span
                            key={step}
                            className={`h-1.5 rounded-full transition-colors duration-300 ${barColor}`}
                          />
                        );
                      })}
                    </div>
                    {passwordStrength.label && (
                      <span className="shrink-0 text-[11px] font-medium text-slate-500">
                        {passwordStrength.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Dropdown custom accesible para Perfil de usuario */}
                <div
                  ref={roleDropdownRef}
                  className="auth-stagger-rise relative z-50"
                  style={{ animationDelay: '180ms' }}
                >
                  <label
                    id="reg-rol-label"
                    className="mb-2 block text-xs font-semibold text-slate-700"
                  >
                    Perfil de usuario
                  </label>
                  <button
                    type="button"
                    role="combobox"
                    aria-labelledby="reg-rol-label"
                    aria-expanded={roleDropdownOpen}
                    aria-haspopup="listbox"
                    onClick={() => setRoleDropdownOpen((prev) => !prev)}
                    className={`flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3.5 text-left text-sm text-slate-900 transition-all duration-200 focus:outline-none ${
                      roleDropdownOpen
                        ? 'border-[#00753A] ring-4 ring-[#00753A]/12'
                        : 'border-slate-200 hover:border-slate-300 focus:border-[#00753A] focus:ring-4 focus:ring-[#00753A]/12'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <SelectedRoleIcon className="h-4 w-4 text-[#00753A]" />
                      <span>{regRol}</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                        roleDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {roleDropdownOpen && (
                    <ul
                      role="listbox"
                      aria-labelledby="reg-rol-label"
                      className="auth-stagger-rise absolute bottom-full left-0 right-0 z-50 mb-2 origin-bottom rounded-2xl border border-slate-100 bg-white p-1.5 shadow-[0_14px_34px_-8px_rgba(15,23,42,0.14)]"
                    >
                      {USER_ROLES.map((role) => {
                        const RoleIcon = ROLE_ICON_MAP[role];
                        const isSelected = role === regRol;
                        return (
                          <li key={role} role="option" aria-selected={isSelected}>
                            <button
                              type="button"
                              onClick={() => {
                                setRegRol(role);
                                setRoleDropdownOpen(false);
                              }}
                              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                                isSelected
                                  ? 'bg-[#00753A]/10 font-medium text-[#00753A]'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <RoleIcon className="h-4 w-4 shrink-0" />
                              <span>{role}</span>
                              {isSelected && (
                                <Check className="ml-auto h-4 w-4 text-[#00753A]" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div
                  className="auth-stagger-rise relative z-10"
                  style={{ animationDelay: '215ms' }}
                >
                  <button
                    type="submit"
                    disabled={regSubmitting || !isConfigured}
                    className="group relative mt-7 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-[#F7C224] via-[#EEAD0E] to-[#E29C06] py-3.5 text-sm font-semibold leading-none text-slate-950 shadow-[0_8px_20px_-4px_rgba(230,166,8,0.42),inset_0_1px_0_rgba(255,255,255,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_12px_24px_-4px_rgba(230,166,8,0.52),inset_0_1px_0_rgba(255,255,255,0.6)] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                    />
                    <span className="relative z-10">
                      {regSubmitting ? 'Registrando cuenta...' : 'Crear Cuenta'}
                    </span>
                    {regSubmitting && (
                      <Loader2 className="relative z-10 h-4 w-4 shrink-0 animate-spin" />
                    )}
                  </button>
                </div>
              </form>

              <p
                className="auth-stagger-rise relative z-10 mt-7 text-center text-sm text-slate-600"
                style={{ animationDelay: '215ms' }}
              >
                ¿Ya tienes una cuenta?{' '}
                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="font-semibold text-[#00753A] hover:underline"
                >
                  Iniciar sesión
                </button>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
