import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ArrowRight,
  Clover,
  Flower2,
  Leaf,
  Loader2,
  Sprout,
  TreePine,
  Trees,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeLocalAuditEvents } from '../security/auditService';
import { USER_ROLES, type AuditLogEntry, type UserRole } from '../types/auth';

type AuthView = 'login' | 'register';

interface BotanicalItem {
  id: number;
  xPct: number;
  yPct: number;
  size: number;
  baseRotate: number;
  iconIndex: number;
}

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
  const baseRotate = Math.round(((randA - 0.5) * 56) + ((i % 2 === 0 ? 1 : -1) * 8));

  return {
    id: i,
    xPct,
    yPct,
    size,
    baseRotate,
    iconIndex: i % BOTANICAL_ICONS.length,
  };
});

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
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Estado Registro
  const [regNombre, setRegNombre] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRol, setRegRol] = useState<UserRole>('Encargado de cultivo');
  const [regSubmitting, setRegSubmitting] = useState(false);

  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [localAuditLogs, setLocalAuditLogs] = useState<AuditLogEntry[]>([]);

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

  useEffect(() => {
    return subscribeLocalAuditEvents(setLocalAuditLogs);
  }, []);

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

  const switchView = (nextView: AuthView) => {
    if (nextView === view) return;
    clearAuthError();
    setUiMessage(null);
    setView(nextView);
  };

  const handleLoginSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearAuthError();
    setUiMessage(null);
    setLoginSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearAuthError();
    setUiMessage(null);
    setRegSubmitting(true);
    try {
      await register(regNombre, regEmail, regPassword, regRol);
      setUiMessage('Cuenta creada correctamente. Sesión iniciada.');
      setRegNombre('');
      setRegEmail('');
      setRegPassword('');
    } finally {
      setRegSubmitting(false);
    }
  };

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
        className="order-2 relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-white px-8 py-8 lg:px-16"
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

        <div className="relative z-10 w-full max-w-md rounded-2xl bg-white/80 p-6 sm:p-8">
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

              <form onSubmit={handleLoginSubmit} className="space-y-5">
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
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="operador@aquaplants.cl"
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400/80 transition-all duration-200 focus:border-[#00753A] focus:outline-none focus:ring-4 focus:ring-[#00753A]/10"
                  />
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400/80 transition-all duration-200 focus:border-[#00753A] focus:outline-none focus:ring-4 focus:ring-[#00753A]/10"
                  />
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

              <form onSubmit={handleRegisterSubmit} className="space-y-5">
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
                  <input
                    id="reg-nombre"
                    name="nombre"
                    type="text"
                    value={regNombre}
                    onChange={(e) => setRegNombre(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Nombre y apellido"
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400/80 transition-all duration-200 focus:border-[#00753A] focus:outline-none focus:ring-4 focus:ring-[#00753A]/10"
                  />
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
                  <input
                    id="reg-email"
                    name="email"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="usuario@aquaplants.cl"
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400/80 transition-all duration-200 focus:border-[#00753A] focus:outline-none focus:ring-4 focus:ring-[#00753A]/10"
                  />
                </div>

                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '135ms' }}
                >
                  <label
                    htmlFor="reg-password"
                    className="mb-2 block text-xs font-semibold text-slate-700"
                  >
                    Contraseña
                  </label>
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400/80 transition-all duration-200 focus:border-[#00753A] focus:outline-none focus:ring-4 focus:ring-[#00753A]/10"
                  />
                </div>

                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '180ms' }}
                >
                  <label
                    htmlFor="reg-rol"
                    className="mb-2 block text-xs font-semibold text-slate-700"
                  >
                    Perfil de usuario
                  </label>
                  <select
                    id="reg-rol"
                    name="rol"
                    value={regRol}
                    onChange={(e) => setRegRol(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 transition-all duration-200 focus:border-[#00753A] focus:outline-none focus:ring-4 focus:ring-[#00753A]/10"
                  >
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  className="auth-stagger-rise"
                  style={{ animationDelay: '215ms' }}
                >
                  <button
                    type="submit"
                    disabled={regSubmitting || !isConfigured}
                    className="group relative mt-7 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-[#F7C224] via-[#EEAD0E] to-[#E29C06] py-3.5 text-sm font-semibold text-slate-950 shadow-[0_8px_20px_-4px_rgba(230,166,8,0.42),inset_0_1px_0_rgba(255,255,255,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_12px_24px_-4px_rgba(230,166,8,0.52),inset_0_1px_0_rgba(255,255,255,0.6)] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
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
                className="auth-stagger-rise mt-7 text-center text-sm text-slate-600"
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

          {localAuditLogs.length > 0 && (
            <section
              aria-label="Eventos de auditoría locales"
              className="mt-6 rounded-lg border border-slate-200 bg-slate-50/95 px-3.5 py-2.5 text-xs text-slate-700"
            >
              <p className="font-semibold text-slate-900">
                Intentos fallidos recientes ({localAuditLogs.length})
              </p>
              <ul className="mt-1 space-y-1">
                {localAuditLogs.slice(0, 3).map((entry) => (
                  <li
                    key={entry.id ?? `${entry.timestamp}-${entry.hash_evento}`}
                    className="truncate text-[11px] text-slate-500"
                  >
                    {entry.accion} · {entry.email}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
