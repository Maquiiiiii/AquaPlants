import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Cpu,
  FileText,
  Folder,
  Layers,
  LayoutGrid,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import BranchedMenu, { type BranchedMenuItem } from './components/BranchedMenu';
import CrudManager from './components/CrudManager';
import DashboardMonitor from './components/DashboardMonitor';
import IotSimulator from './components/IotSimulator';
import LiquidSplashScreen from './components/LiquidSplashScreen';
import ManagementReport from './components/ManagementReport';
import SecurityAudit from './components/SecurityAudit';
import { useAuth } from './context/AuthContext';
import { subscribeAlertas } from './services/iotService';

type ActiveTab = 'dashboard' | 'crud' | 'iot' | 'report' | 'audit';
type MenuValue = ActiveTab | 'sec-operacion' | 'sec-analisis';

interface TabMeta {
  id: ActiveTab;
  label: string;
  group: string;
  icon: typeof LayoutGrid;
}

const TAB_META: Record<ActiveTab, TabMeta> = {
  dashboard: { id: 'dashboard', label: 'Dashboard', group: 'Vista General', icon: LayoutGrid },
  crud: { id: 'crud', label: 'Gestión de Operaciones', group: 'Operación', icon: Layers },
  iot: { id: 'iot', label: 'Simulador de Campo', group: 'Operación', icon: Cpu },
  report: {
    id: 'report',
    label: 'Informe de Gestión',
    group: 'Análisis y Control',
    icon: FileText,
  },
  audit: { id: 'audit', label: 'Auditoría', group: 'Análisis y Control', icon: ShieldCheck },
};

function getUserInitials(nameOrEmail: string): string {
  const clean = nameOrEmail.trim();
  if (!clean) return 'AQ';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export default function App() {
  const {
    user,
    profile,
    loading,
    profileLoading,
    authError,
    logout,
    clearAuthError,
  } = useAuth();

  // Navegación del shell autenticado
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);

  async function handleLogout() {
    clearAuthError();
    setMobileMenuOpen(false);
    await logout();
  }

  useEffect(() => {
    const unsub = subscribeAlertas(
      null,
      (alertas) => setActiveAlertsCount(alertas.filter((a) => a.estado === 'Activa').length),
      () => {},
    );
    return () => unsub();
  }, []);

  const userRole = profile?.rol;
  const isAdmin = userRole === 'Administrador';
  const isSupervisor = userRole === 'Supervisor';
  const canViewReport = isAdmin || isSupervisor;

  const allowedTabs = useMemo<MenuValue[]>(() => {
    if (isAdmin) return ['dashboard', 'crud', 'iot', 'report', 'audit'];
    if (isSupervisor) return ['dashboard', 'crud', 'report'];
    return ['dashboard', 'crud'];
  }, [isAdmin, isSupervisor]);

  useEffect(() => {
    setActiveTab('dashboard');
  }, [user?.uid]);

  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [allowedTabs, activeTab]);

  const menuItems = useMemo<BranchedMenuItem[]>(
    () => {
      const items: BranchedMenuItem[] = [
        {
          value: 'sec-general',
          label: 'General',
          icon: Folder,
          defaultOpen: true,
          children: [
            {
              value: 'dashboard',
              label: 'Dashboard Operativo',
              icon: LayoutGrid,
              badge: activeAlertsCount,
            },
          ],
        },
        {
          value: 'sec-operacion',
          label: 'Operación',
          icon: Folder,
          defaultOpen: true,
          children: [
            { value: 'crud', label: 'Gestión de Operaciones', icon: Layers },
            ...(isAdmin
              ? [{ value: 'iot' as const, label: 'Simulador de Campo', icon: Cpu }]
              : []),
          ],
        },
      ];

      if (canViewReport) {
        items.push({
          value: 'sec-analisis',
          label: 'Análisis y Control',
          icon: BarChart3,
          defaultOpen: true,
          dividerBefore: true,
          children: [
            { value: 'report', label: 'Informe de Gestión', icon: FileText },
            ...(isAdmin
              ? [{ value: 'audit' as const, label: 'Auditoría', icon: ShieldCheck }]
              : []),
          ],
        });
      }

      return items;
    },
    [activeAlertsCount, isAdmin, canViewReport],
  );

  const displayName = profile?.nombre ?? user?.email ?? 'Usuario';
  const displayRole =
    profile?.rol ??
    (profileLoading ? 'Cargando perfil...' : 'Sin perfil en Firestore');
  const userInitials = getUserInitials(displayName);
  const activeItem = TAB_META[activeTab];
  const ActiveIcon = activeItem.icon;

  const handleSelectMenu = (val: MenuValue) => {
    if (val === 'sec-operacion' || val === 'sec-analisis') return;
    setActiveTab(val);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <LiquidSplashScreen isLoading={loading} />
      {!loading &&
        (!user ? (
          <AuthScreen />
        ) : !profile ? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F8FAF9]">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#E2EFE6] border-t-[#00753A]" />
            <p className="text-sm font-medium text-[#1B432C]">Preparando entorno operativo...</p>
          </div>
        ) : (
          <div
            key={user.uid}
            className="flex h-screen overflow-hidden bg-[#0E1F17] p-2.5 pl-0 text-[#F2F0EC] print:h-auto print:overflow-visible print:bg-white print:p-0"
          >
      {/* Botón flotante para abrir drawer en móvil */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        aria-label="Abrir menú lateral"
        className="no-print fixed top-5 left-5 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition-colors hover:bg-slate-50 lg:hidden"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </button>

      {/* Backdrop móvil */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="no-print fixed inset-0 z-30 bg-[#07110C]/65 backdrop-blur-[1px] lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* ==================== SIDEBAR CON BRANCHED MENU BOTÁNICO ==================== */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col justify-between bg-[#0E1F17] px-4 py-5 text-[#F2F0EC] transition-transform duration-200 lg:static lg:h-full lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Cabecera con LogoAquaSVG.svg nítido */}
          <div className="mb-6 flex items-center justify-between px-2 pt-1">
            <img
              src="/LogoAquaSVG.svg"
              alt="AquaPlants"
              className="h-8 w-auto object-contain"
            />

            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Cerrar menú móvil"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-[#9BB5A7] transition-colors hover:bg-white/10 hover:text-[#F2F0EC] lg:hidden"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          {/* Navegación con ramas botánicas y hojas animadas */}
          <div className="flex-1 overflow-y-auto pr-0.5">
            <BranchedMenu
              items={menuItems as BranchedMenuItem<MenuValue>[]}
              activeValue={activeTab}
              onSelect={handleSelectMenu}
              drawDuration={400}
              trunk={20}
              indent={48}
            />
          </div>
        </div>

        {/* Tarjeta compacta de usuario en el pie */}
        <div className="mt-4 flex items-center justify-between gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E6A608] text-xs font-bold text-[#09150F]">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#F2F0EC]">{displayName}</p>
              <p className="truncate text-xs text-[#9BB5A7]">{displayRole}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="shrink-0 rounded-lg p-1.5 text-[#9BB5A7] transition-colors hover:bg-white/10 hover:text-[#F2F0EC]"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* ==================== LIENZO PRINCIPAL ENMARCADO (FULL INSET FRAME) ==================== */}
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#F9FAFB] text-slate-900 shadow-sm print:block print:h-auto print:min-h-0 print:overflow-visible print:rounded-none print:border-none print:bg-white print:p-0 print:m-0 print:shadow-none">
        <div className="custom-scrollbar h-full flex-1 overflow-y-auto print:block print:h-auto print:min-h-0 print:overflow-visible print:p-0 print:m-0">
          {/* Breadcrumb minimalista */}
        <div className="no-print flex items-center gap-2 px-4 pt-16 pb-3 text-xs text-slate-500 sm:px-6 lg:px-8 lg:pt-5">
          <span>AquaPlants</span>
          <span aria-hidden="true" className="text-slate-300">
            /
          </span>
          <span>{activeItem.group}</span>
          <span aria-hidden="true" className="text-slate-300">
            /
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
            <ActiveIcon className="h-3.5 w-3.5 text-[#00753A]" strokeWidth={1.75} />
            {activeItem.label}
          </span>
        </div>

        <div className="px-4 pb-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {authError && (
              <section aria-live="polite" className="no-print">
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  Error: {authError}
                </p>
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

            {activeTab === 'iot' && isAdmin && (
              <IotSimulator
                profile={profile}
                userUid={user.uid}
                userEmail={user.email ?? 'desconocido'}
              />
            )}

            {activeTab === 'report' && canViewReport && (
              <ManagementReport
                profile={profile}
                userUid={user.uid}
                userEmail={user.email ?? 'desconocido'}
              />
            )}

            {activeTab === 'audit' && isAdmin && <SecurityAudit profile={profile} />}
          </div>
        </div>
        </div>
      </main>
    </div>
        ))}
    </>
  );
}
