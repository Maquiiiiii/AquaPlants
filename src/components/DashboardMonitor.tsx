import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FilterX,
  Loader2,
  Sprout,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  subscribeCultivos,
  subscribeInstalaciones,
  subscribeSensores,
  type CrudActor,
} from '../services/crudService';
import {
  resolverAlerta,
  subscribeAlertas,
  subscribeMediciones,
} from '../services/iotService';
import type { UserProfile } from '../types/auth';
import {
  TIPOS_VARIABLE,
  UNIDAD_POR_VARIABLE,
  type Alerta,
  type Cultivo,
  type Instalacion,
  type Medicion,
  type Sensor,
  type TipoVariable,
} from '../types/domain';
import { formatVariableLabel } from '../utils/formatters';
import CustomSelect from './CustomSelect';

interface DashboardMonitorProps {
  profile: UserProfile | null;
  userUid: string;
  userEmail: string;
}

interface ChartPoint {
  hora: string;
  timestamp: string;
  valor: number;
  id_sensor: string;
  unidad: string;
  alerta: boolean;
}

const MONTH_NAMES_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

function formatEditorialDateTime(timestamp: string): string {
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) return timestamp;
  const day = String(parsedDate.getDate()).padStart(2, '0');
  const month = MONTH_NAMES_ES[parsedDate.getMonth()];
  const time = parsedDate.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${day} ${month} · ${time}`;
}

const VARIABLE_LABELS: Record<TipoVariable, string> = {
  caudal: 'Caudal',
  nutrientes: 'Nutrientes',
  consumo_hidrico: 'Consumo Hídrico',
  fotoperiodo: 'Fotoperiodo',
};

const PAGE_SIZE = 12;

function formatUnit(unidad: string): string {
  return unidad.replace(/Lmin/gi, 'L/min').replace(/\bhoras?\b/gi, 'h');
}

function formatAlertTimestamp(isoString: string): {
  relative: string;
  exact: string;
} {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return { relative: isoString, exact: isoString };
  }

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  let relative: string;
  if (diffMin < 1) {
    relative = 'Hace menos de 1 min';
  } else if (diffMin < 60) {
    relative = `Hace ${diffMin} min`;
  } else if (diffHours < 24 && !isYesterday) {
    relative = `Hace ${diffHours} h`;
  } else if (isYesterday) {
    relative = 'Ayer';
  } else {
    relative = `Hace ${diffDays} días`;
  }

  const timePart = date.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const exact = isSameDay
    ? `Hoy, ${timePart}`
    : `${date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} · ${timePart}`;

  return { relative, exact };
}

function parseAlertDiagnosis(
  alerta: Alerta,
  sensores: Sensor[],
): { unit: string; limitLabel: string; diagnosis: string } {
  const sensor = sensores.find((s) => s.id_sensor === alerta.id_sensor);
  const rawUnit =
    sensor?.unidad ??
    UNIDAD_POR_VARIABLE[alerta.tipo_variable as TipoVariable] ??
    '';
  const unit = formatUnit(rawUnit);

  const match = alerta.umbral_superado.match(/(-?\d+(?:[.,]\d+)?)/);
  const limitNum = match ? Number(match[1].replace(',', '.')) : NaN;
  const lower = alerta.umbral_superado.toLowerCase();
  const isMin = lower.includes('mín') || lower.includes('min');
  const isMax = lower.includes('máx') || lower.includes('max');

  if (!Number.isNaN(limitNum) && (isMin || isMax)) {
    const unitSuffix = unit ? ` ${unit}` : '';
    if (isMin) {
      const diff = Math.abs(Number((limitNum - alerta.valor_registrado).toFixed(2)));
      return {
        unit,
        limitLabel: `Mín. permitido: ${limitNum}${unitSuffix}`,
        diagnosis: `Por debajo del límite inferior (-${diff}${unitSuffix})`,
      };
    }
    const diff = Math.abs(Number((alerta.valor_registrado - limitNum).toFixed(2)));
    return {
      unit,
      limitLabel: `Máx. permitido: ${limitNum}${unitSuffix}`,
      diagnosis: `Por encima del límite superior (+${diff}${unitSuffix})`,
    };
  }

  return {
    unit,
    limitLabel: formatUnit(alerta.umbral_superado),
    diagnosis: formatVariableLabel(alerta.mensaje),
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartPoint }>;
  thresholds: { umbralMin: number; umbralMax: number; unidad: string } | null;
}

function TelemetryTooltip({ active, payload, thresholds }: CustomTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const inRange = thresholds
    ? point.valor >= thresholds.umbralMin && point.valor <= thresholds.umbralMax
    : !point.alerta;

  return (
    <div className="rounded-2xl bg-white/95 px-4 py-3 shadow-lg backdrop-blur-xs">
      <p className="text-xs font-medium text-slate-500 tabular-nums">
        {point.hora} · {point.id_sensor}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
        {point.valor}{' '}
        <span className="text-xs font-semibold text-slate-500">
          {formatUnit(point.unidad)}
        </span>
      </p>
      <span
        className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
          inRange ? 'bg-[#E2EFE6] text-[#1B432C]' : 'bg-[#F3E5D8] text-[#5C3419]'
        }`}
      >
        {inRange ? 'Dentro de rango' : 'Fuera de rango'}
      </span>
    </div>
  );
}

export default function DashboardMonitor({
  profile,
  userUid,
  userEmail,
}: DashboardMonitorProps) {
  const actor: CrudActor = {
    uid: userUid,
    email: profile?.email ?? userEmail,
    rol: profile?.rol ?? 'Encargado de cultivo',
  };
  const canResolveAlerts =
    profile?.rol === 'Administrador' || profile?.rol === 'Encargado de cultivo';

  // Colecciones en tiempo real
  const [instalaciones, setInstalaciones] = useState<Instalacion[]>([]);
  const [cultivos, setCultivos] = useState<Cultivo[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [mediciones, setMediciones] = useState<Medicion[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'error' | 'ok';
    text: string;
  } | null>(null);

  // Filtros interactivos de histórico y gráfico
  const [filterSistema, setFilterSistema] = useState<string>('Todas');
  const [filterVariable, setFilterVariable] = useState<string>('Todas');
  const [filterSensor, setFilterSensor] = useState<string>('Todos');
  const [chartVariableTab, setChartVariableTab] = useState<TipoVariable>('caudal');
  const [measurementsScope, setMeasurementsScope] = useState<'all' | 'out_of_range'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [confirmResolveAll, setConfirmResolveAll] = useState(false);
  const [isResolvingAll, setIsResolvingAll] = useState(false);

  // Refs para navegación rápida desde las tarjetas KPI
  const telemetryRef = useRef<HTMLDivElement | null>(null);
  const alertsRef = useRef<HTMLElement | null>(null);
  const measurementsRef = useRef<HTMLElement | null>(null);
  const resolveAllRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubInst = subscribeInstalaciones(
      (items) => {
        setInstalaciones(items);
        setInitialLoading(false);
      },
      (err) => {
        setStreamError(err);
        setInitialLoading(false);
      },
    );
    const unsubCult = subscribeCultivos(setCultivos, setStreamError);
    const unsubSen = subscribeSensores(setSensores, setStreamError);
    const unsubMed = subscribeMediciones(null, setMediciones, setStreamError);
    const unsubAle = subscribeAlertas(null, setAlertas, setStreamError);

    return () => {
      unsubInst();
      unsubCult();
      unsubSen();
      unsubMed();
      unsubAle();
    };
  }, []);

  // Cierre inteligente del popover "Resolver todas" (clic fuera, Escape o 6000ms)
  useEffect(() => {
    if (!confirmResolveAll) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        resolveAllRef.current &&
        !resolveAllRef.current.contains(event.target as Node)
      ) {
        setConfirmResolveAll(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmResolveAll(false);
      }
    };

    const timer = window.setTimeout(() => {
      setConfirmResolveAll(false);
    }, 6000);

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmResolveAll]);

  const resumen = useMemo(() => {
    const enLinea = instalaciones.filter((i) => i.estado_conexion === 'En línea').length;
    const cultivosActivos = cultivos.filter((c) => c.estado === 'Activo').length;
    const sensoresActivos = sensores.filter((s) => s.estado === 'Activo').length;
    const alertasActivas = alertas.filter((a) => a.estado === 'Activa');

    return {
      totalInstalaciones: instalaciones.length,
      enLinea,
      cultivosActivos,
      sensoresActivos,
      alertasActivas,
    };
  }, [instalaciones, cultivos, sensores, alertas]);

  const availableSensorsForFilter = useMemo(() => {
    return sensores.filter((s) => {
      const matchSys = filterSistema === 'Todas' || s.id_sistema === filterSistema;
      const matchVar =
        filterVariable === 'Todas' || s.tipo_variable === (filterVariable as TipoVariable);
      return matchSys && matchVar;
    });
  }, [sensores, filterSistema, filterVariable]);

  const effectiveSensorFilter = availableSensorsForFilter.some(
    (s) => s.id_sensor === filterSensor,
  )
    ? filterSensor
    : 'Todos';

  const hasActiveFilters =
    filterSistema !== 'Todas' ||
    filterVariable !== 'Todas' ||
    effectiveSensorFilter !== 'Todos';

  const filteredMediciones = useMemo(() => {
    return mediciones.filter((m) => {
      const matchesSistema = filterSistema === 'Todas' || m.id_sistema === filterSistema;
      const matchesVariable =
        filterVariable === 'Todas' || m.tipo_variable === (filterVariable as TipoVariable);
      const matchesSensor =
        effectiveSensorFilter === 'Todos' || m.id_sensor === effectiveSensorFilter;
      return matchesSistema && matchesVariable && matchesSensor;
    });
  }, [mediciones, filterSistema, filterVariable, effectiveSensorFilter]);

  // Variable activa para el gráfico (garantiza una sola unidad en el eje Y y preselecciona la primera disponible)
  const availableChartVariables = useMemo(() => {
    const present = new Set(filteredMediciones.map((m) => m.tipo_variable));
    return TIPOS_VARIABLE.filter((v) => present.has(v));
  }, [filteredMediciones]);

  const effectiveChartVariable: TipoVariable =
    filterVariable !== 'Todas'
      ? (filterVariable as TipoVariable)
      : availableChartVariables.includes(chartVariableTab)
        ? chartVariableTab
        : (availableChartVariables[0] ?? chartVariableTab);

  const chartMediciones = useMemo(() => {
    return filteredMediciones.filter((m) => m.tipo_variable === effectiveChartVariable);
  }, [filteredMediciones, effectiveChartVariable]);

  // Determina umbrales de referencia para el gráfico según sensor o variable activa
  const referenceThresholds = useMemo(() => {
    if (effectiveSensorFilter !== 'Todos') {
      const exactSensor = sensores.find(
        (s) =>
          s.id_sensor === effectiveSensorFilter && s.tipo_variable === effectiveChartVariable,
      );
      if (exactSensor) {
        return {
          umbralMin: exactSensor.umbral_min,
          umbralMax: exactSensor.umbral_max,
          unidad: exactSensor.unidad,
        };
      }
    }

    const matchingSensor = sensores.find(
      (s) =>
        s.tipo_variable === effectiveChartVariable &&
        (filterSistema === 'Todas' || s.id_sistema === filterSistema),
    );
    if (matchingSensor) {
      return {
        umbralMin: matchingSensor.umbral_min,
        umbralMax: matchingSensor.umbral_max,
        unidad: matchingSensor.unidad,
      };
    }

    return null;
  }, [effectiveSensorFilter, effectiveChartVariable, filterSistema, sensores]);

  // Orden cronológico ascendente para el LineChart
  const chartData = useMemo<ChartPoint[]>(() => {
    return [...chartMediciones]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((m) => {
        const date = new Date(m.timestamp);
        const hora = Number.isNaN(date.getTime())
          ? m.timestamp.slice(11, 19)
          : date.toLocaleTimeString('es-CL', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            });
        return {
          hora,
          timestamp: m.timestamp,
          valor: m.valor,
          id_sensor: m.id_sensor,
          unidad: m.unidad,
          alerta: m.alerta,
        };
      });
  }, [chartMediciones]);

  const scopedMediciones = useMemo(() => {
    if (measurementsScope === 'all') return filteredMediciones;
    return filteredMediciones.filter((m) => {
      const sensor = sensores.find((s) => s.id_sensor === m.id_sensor);
      if (sensor) {
        return m.valor < sensor.umbral_min || m.valor > sensor.umbral_max;
      }
      return m.alerta;
    });
  }, [filteredMediciones, measurementsScope, sensores]);

  const totalPages = Math.max(1, Math.ceil(scopedMediciones.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedMediciones = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return scopedMediciones.slice(start, start + PAGE_SIZE);
  }, [scopedMediciones, safePage]);

  async function handleResolveAlert(alerta: Alerta) {
    setActionFeedback(null);
    if (!canResolveAlerts) {
      setActionFeedback({
        type: 'error',
        text: 'Tu perfil no tiene permisos para resolver alertas.',
      });
      return;
    }

    try {
      await resolverAlerta(alerta.id, alerta.id_sensor, actor);
      setActionFeedback({
        type: 'ok',
        text: `Alerta ${alerta.id_sensor} (${alerta.id_sistema}) marcada como Resuelta.`,
      });
    } catch (error) {
      setActionFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error resolviendo alerta.',
      });
    }
  }

  async function handleResolveAllAlerts() {
    setActionFeedback(null);
    if (!canResolveAlerts || resumen.alertasActivas.length === 0) return;

    setIsResolvingAll(true);
    try {
      await Promise.all(
        resumen.alertasActivas.map((a) => resolverAlerta(a.id, a.id_sensor, actor)),
      );
      setActionFeedback({
        type: 'ok',
        text: `${resumen.alertasActivas.length} alertas marcadas como Resueltas.`,
      });
      setConfirmResolveAll(false);
    } catch (error) {
      setActionFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error resolviendo alertas.',
      });
    } finally {
      setIsResolvingAll(false);
    }
  }

  function handleClearFilters() {
    setFilterSistema('Todas');
    setFilterVariable('Todas');
    setFilterSensor('Todos');
    setCurrentPage(1);
  }

  return (
    <section className="space-y-6">
      {/* Encabezado de vista */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Dashboard Operativo en Tiempo Real
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Supervisión en tiempo real del estado hídrico, nutrientes y alertas de tus cultivos
        </p>
      </div>

      {streamError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Error de sincronización en tiempo real: {streamError}
        </p>
      )}

      {actionFeedback && (
        <p
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            actionFeedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {actionFeedback.text}
        </p>
      )}

      {/* 1. GRILLA DE 4 KPIs EN SUPERFICIES TONALES PASTEL */}
      {initialLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6 xl:grid-cols-4">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="h-36 animate-pulse rounded-3xl bg-slate-200/70 p-5"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6 xl:grid-cols-4">
          {/* KPI 1: Instalaciones Activas */}
          <button
            type="button"
            onClick={() => telemetryRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full cursor-pointer rounded-3xl bg-[#DCE7E1] p-5 text-left text-[#1D3B2C] transition-transform duration-200 ease-out hover:-translate-y-1 active:translate-y-0"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="rounded-full bg-[#C4D6CC] px-3 py-1 text-xs font-semibold tracking-tight text-[#1D3B2C]">
                En línea
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C4D6CC] text-[#1D3B2C]">
                <Building2 className="h-4 w-4" strokeWidth={2} />
              </span>
            </div>
            <p className="text-base font-semibold tracking-tight">Instalaciones Activas</p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
              {resumen.enLinea}{' '}
              <span className="text-base font-semibold text-[#1D3B2C]/75">
                / {resumen.totalInstalaciones}
              </span>
            </p>
          </button>

          {/* KPI 2: Cultivos Activos */}
          <button
            type="button"
            onClick={() => measurementsRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full cursor-pointer rounded-3xl bg-[#E2EFE6] p-5 text-left text-[#1B432C] transition-transform duration-200 ease-out hover:-translate-y-1 active:translate-y-0"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="rounded-full bg-[#C9E0D1] px-3 py-1 text-xs font-semibold tracking-tight text-[#1B432C]">
                En producción
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C9E0D1] text-[#1B432C]">
                <Sprout className="h-4 w-4" strokeWidth={2} />
              </span>
            </div>
            <p className="text-base font-semibold tracking-tight">Cultivos Activos</p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
              {resumen.cultivosActivos}{' '}
              <span className="text-sm font-medium text-[#1B432C]/75">
                {resumen.cultivosActivos === 1 ? 'cultivo' : 'cultivos'}
              </span>
            </p>
          </button>

          {/* KPI 3: Sensores Monitoreados */}
          <button
            type="button"
            onClick={() => telemetryRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full cursor-pointer rounded-3xl bg-[#E7ECE0] p-5 text-left text-[#2F3E22] transition-transform duration-200 ease-out hover:-translate-y-1 active:translate-y-0"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="rounded-full bg-[#D3DBC7] px-3 py-1 text-xs font-semibold tracking-tight text-[#2F3E22]">
                Operativos
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D3DBC7] text-[#2F3E22]">
                <Cpu className="h-4 w-4" strokeWidth={2} />
              </span>
            </div>
            <p className="text-base font-semibold tracking-tight">Sensores Monitoreados</p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
              {resumen.sensoresActivos}{' '}
              <span className="text-sm font-medium text-[#2F3E22]/75">
                {resumen.sensoresActivos === 1 ? 'sensor' : 'sensores'}
              </span>
            </p>
          </button>

          {/* KPI 4: Alertas Activas */}
          <button
            type="button"
            onClick={() => alertsRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className={`w-full cursor-pointer rounded-3xl p-5 text-left transition-transform duration-200 ease-out hover:-translate-y-1 active:translate-y-0 ${
              resumen.alertasActivas.length > 0
                ? 'bg-[#F3E5D8] text-[#5C3419]'
                : 'bg-[#DFF0EA] text-[#164234]'
            }`}
          >
            <div className="mb-6 flex items-center justify-between">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold tracking-tight ${
                  resumen.alertasActivas.length > 0
                    ? 'bg-[#E6CEB8] text-[#5C3419]'
                    : 'bg-[#C5E2D8] text-[#164234]'
                }`}
              >
                {resumen.alertasActivas.length > 0 ? 'Atención' : 'Sin alertas'}
              </span>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  resumen.alertasActivas.length > 0
                    ? 'bg-[#E6CEB8] text-[#5C3419]'
                    : 'bg-[#C5E2D8] text-[#164234]'
                }`}
              >
                {resumen.alertasActivas.length > 0 ? (
                  <BellRing className="h-4 w-4" strokeWidth={2} />
                ) : (
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                )}
              </span>
            </div>
            <p className="text-base font-semibold tracking-tight">Alertas Activas</p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
              {resumen.alertasActivas.length}{' '}
              <span
                className={`text-sm font-medium ${
                  resumen.alertasActivas.length > 0
                    ? 'text-[#5C3419]/75'
                    : 'text-[#164234]/75'
                }`}
              >
                {resumen.alertasActivas.length === 1 ? 'pendiente' : 'pendientes'}
              </span>
            </p>
          </button>
        </div>
      )}

      {/* 2. BARRA DE FILTROS RÁPIDOS PERSISTENTE (STICKY FILTER BAR) */}
      <div
        ref={telemetryRef}
        className="sticky top-3 z-20 rounded-3xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(15,23,42,0.03)] backdrop-blur-md"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="dash-filter-sistema"
                className="mb-1.5 block text-[11px] font-semibold tracking-wider text-slate-500 uppercase"
              >
                Instalación
              </label>
              <CustomSelect
                id="dash-filter-sistema"
                value={filterSistema}
                onChange={(val) => {
                  setFilterSistema(val);
                  setCurrentPage(1);
                }}
                options={[
                  { value: 'Todas', label: 'Todas las instalaciones' },
                  ...instalaciones.map((inst) => ({
                    value: inst.id_sistema,
                    code: inst.id_sistema,
                    label: inst.nombre,
                  })),
                ]}
              />
            </div>

            <div>
              <label
                htmlFor="dash-filter-variable"
                className="mb-1.5 block text-[11px] font-semibold tracking-wider text-slate-500 uppercase"
              >
                Variable monitoreada
              </label>
              <CustomSelect
                id="dash-filter-variable"
                value={filterVariable}
                onChange={(val) => {
                  setFilterVariable(val);
                  setCurrentPage(1);
                }}
                options={[
                  { value: 'Todas', label: 'Todas las variables' },
                  ...TIPOS_VARIABLE.map((v) => ({
                    value: v,
                    label: formatVariableLabel(v),
                  })),
                ]}
              />
            </div>

            <div>
              <label
                htmlFor="dash-filter-sensor"
                className="mb-1.5 block text-[11px] font-semibold tracking-wider text-slate-500 uppercase"
              >
                Sensor
              </label>
              <CustomSelect
                id="dash-filter-sensor"
                value={effectiveSensorFilter}
                onChange={(val) => {
                  setFilterSensor(val);
                  setCurrentPage(1);
                }}
                options={[
                  { value: 'Todos', label: 'Todos los sensores' },
                  ...availableSensorsForFilter.map((sen) => ({
                    value: sen.id_sensor,
                    code: sen.id_sensor,
                    label: formatVariableLabel(sen.tipo_variable),
                  })),
                ]}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 self-end rounded-xl bg-[#F4F6F5] px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[#ECF0EE] lg:self-end"
            >
              <FilterX className="h-3.5 w-3.5" strokeWidth={1.75} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* 3. GRÁFICO DE LÍNEAS EN RECHARTS CON IDENTIDAD AQUAPLANTS (UNA SOLA UNIDAD POR EJE Y) */}
      <section className="rounded-3xl bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#00753A]" strokeWidth={1.75} />
            <h3 className="text-base font-semibold text-slate-900">
              Tendencia de Telemetría IoT
            </h3>
            {referenceThresholds && (
              <span className="rounded-full bg-[#DCE7E1]/70 px-2.5 py-0.5 text-xs font-medium text-[#1D3B2C]">
                {formatUnit(referenceThresholds.unidad)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              role="tablist"
              aria-label="Variable del gráfico"
              className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1"
            >
              {TIPOS_VARIABLE.map((v) => {
                const active = effectiveChartVariable === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setChartVariableTab(v);
                      setFilterVariable(v);
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? 'bg-[#00753A] font-semibold text-white shadow-xs'
                        : 'font-medium text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {VARIABLE_LABELS[v]}
                  </button>
                );
              })}
            </div>

            {referenceThresholds && (
              <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                <span className="rounded-full bg-[#DCE7E1]/70 px-2.5 py-0.5 font-medium text-[#1D3B2C]">
                  Mín: {referenceThresholds.umbralMin} {formatUnit(referenceThresholds.unidad)}
                </span>
                <span className="rounded-full bg-[#DCE7E1]/70 px-2.5 py-0.5 font-medium text-[#1D3B2C]">
                  Máx: {referenceThresholds.umbralMax} {formatUnit(referenceThresholds.unidad)}
                </span>
              </div>
            )}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              No hay mediciones de {VARIABLE_LABELS[effectiveChartVariable]} para los filtros seleccionados.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Genera nueva telemetría desde la pestaña Simulador IoT o selecciona otra variable.
            </p>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                key={effectiveChartVariable}
                data={chartData}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="aquaplantsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00753A" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#00753A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="hora"
                  minTickGap={42}
                  dy={8}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dx={-6}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                {referenceThresholds && (
                  <ReferenceArea
                    y1={referenceThresholds.umbralMin}
                    y2={referenceThresholds.umbralMax}
                    fill="#DCE7E1"
                    fillOpacity={0.42}
                    strokeOpacity={0}
                  />
                )}
                <Tooltip
                  content={<TelemetryTooltip thresholds={referenceThresholds} />}
                />
                <Area
                  type="monotone"
                  dataKey="valor"
                  stroke="#00753A"
                  strokeWidth={2.5}
                  fill="url(#aquaplantsAreaGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#00753A', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 4. PANEL DE ALERTAS ACTIVAS CON ACCIÓN DIRECTA Y ROL RBAC */}
      <section
        ref={alertsRef}
        className="rounded-3xl bg-[#FDF7F7] p-6 shadow-[0_2px_12px_rgba(185,28,28,0.03)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#B9382C]" strokeWidth={1.75} />
            <h3 className="text-base font-semibold text-slate-900">
              Alertas Activas ({resumen.alertasActivas.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {resumen.alertasActivas.length > 1 && canResolveAlerts && (
              <div ref={resolveAllRef} className="relative inline-block">
                {confirmResolveAll && (
                  <div
                    role="dialog"
                    aria-label="Confirmar resolución masiva de alertas"
                    className="auth-stagger-rise absolute right-0 bottom-full z-30 mb-2.5 w-64 origin-bottom-right rounded-2xl bg-white p-3.5 shadow-xl transition-all duration-200 ease-out"
                  >
                    <p className="mb-2.5 text-xs leading-snug font-semibold text-slate-800">
                      ¿Seguro de resolver las {resumen.alertasActivas.length} alertas?
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={isResolvingAll}
                        onClick={() => setConfirmResolveAll(false)}
                        className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={isResolvingAll}
                        onClick={() => void handleResolveAllAlerts()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#00753A] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#00612F] disabled:opacity-60"
                      >
                        {isResolvingAll && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {isResolvingAll ? 'Resolviendo...' : 'Sí, resolver'}
                      </button>
                    </div>
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 bg-white"
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={isResolvingAll}
                  aria-expanded={confirmResolveAll}
                  onClick={() => setConfirmResolveAll((prev) => !prev)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    confirmResolveAll
                      ? 'bg-[#F5DCDC] text-[#8A1F1F]'
                      : 'text-[#9E2A2B] hover:bg-[#F9EAEA]'
                  }`}
                >
                  Resolver todas
                </button>
              </div>
            )}
            {!canResolveAlerts && (
              <span className="rounded-full bg-[#F9EAEA] px-2.5 py-1 text-xs font-medium text-[#9E2A2B]">
                Solo lectura ({profile?.rol ?? 'Supervisor'})
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#F5E2E2] text-xs font-semibold tracking-wider text-[#8C3B36]/80 uppercase">
                <th className="px-3 py-2.5">Severidad</th>
                <th className="px-3 py-2.5">Instalación</th>
                <th className="px-3 py-2.5">Sensor / Variable</th>
                <th className="px-3 py-2.5">Valor / Umbral</th>
                <th className="px-3 py-2.5">Diagnóstico</th>
                <th className="px-3 py-2.5">Fecha / Hora</th>
                <th className="px-3 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5E2E2]">
              {resumen.alertasActivas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#00753A]">
                      <CheckCircle2 className="h-4 w-4" />
                      No hay alertas activas pendientes de atención.
                    </span>
                  </td>
                </tr>
              ) : (
                resumen.alertasActivas.map((alerta) => {
                  const ts = formatAlertTimestamp(alerta.timestamp);
                  const diag = parseAlertDiagnosis(alerta, sensores);

                  return (
                    <tr
                      key={alerta.id}
                      className="transition-colors hover:bg-[#FAF0F0]/80"
                    >
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            alerta.nivel === 'Crítica'
                              ? 'bg-[#FAD5CE] text-[#5C1D16]'
                              : 'bg-[#F3E5D8] text-[#5C3419]'
                          }`}
                        >
                          {alerta.nivel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-sans font-medium text-slate-800 tabular-nums">
                        {alerta.id_sistema}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-slate-700">
                        <span className="font-sans font-medium text-slate-800 tabular-nums">
                          {alerta.id_sensor}
                        </span>{' '}
                        · {formatVariableLabel(alerta.tipo_variable)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <p className="font-bold text-slate-900 tabular-nums">
                          {alerta.valor_registrado} {diag.unit}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          {diag.limitLabel}
                        </p>
                      </td>
                      <td className="max-w-xs px-3 py-3.5 text-xs font-medium text-slate-700">
                        {diag.diagnosis}
                      </td>
                      <td
                        title={alerta.timestamp}
                        className="whitespace-nowrap px-3 py-3.5"
                      >
                        <p className="text-sm font-semibold text-slate-800">{ts.relative}</p>
                        <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          {ts.exact}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right">
                        {canResolveAlerts ? (
                          <button
                            type="button"
                            onClick={() => void handleResolveAlert(alerta)}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#00753A] shadow-2xs transition-colors duration-200 hover:bg-[#00753A] hover:text-white"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Resolver
                          </button>
                        ) : (
                          <span className="inline-flex rounded-full bg-[#F4F6F5] px-3 py-1 text-xs font-medium text-slate-500">
                            Atención por encargado
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. TABLA DE HISTÓRICO DE MEDICIONES */}
      <section
        ref={measurementsRef}
        className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)]"
      >
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#00753A]" strokeWidth={1.75} />
            <h3 className="text-base font-semibold text-slate-900">
              Histórico de Mediciones ({scopedMediciones.length})
            </h3>
          </div>

          <div
            role="tablist"
            aria-label="Filtrar mediciones por rango"
            className="inline-flex self-start rounded-xl bg-[#F4F6F5] p-1 text-xs sm:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={measurementsScope === 'all'}
              onClick={() => {
                setMeasurementsScope('all');
                setCurrentPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                measurementsScope === 'all'
                  ? 'bg-white font-semibold text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={measurementsScope === 'out_of_range'}
              onClick={() => {
                setMeasurementsScope('out_of_range');
                setCurrentPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                measurementsScope === 'out_of_range'
                  ? 'bg-white font-semibold text-[#5C3419] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fuera de rango
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[24%]" />
              <col className="w-[24%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                <th className="px-5 py-3">Fecha y hora</th>
                <th className="px-5 py-3">Instalación</th>
                <th className="px-5 py-3">Sensor / Variable</th>
                <th className="px-5 py-3 text-left">Valor</th>
                <th className="px-5 py-3 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedMediciones.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                    No hay mediciones registradas para los filtros actuales.
                  </td>
                </tr>
              ) : (
                paginatedMediciones.map((m) => {
                  const readableDate = formatEditorialDateTime(m.timestamp);

                  const sensor = sensores.find((s) => s.id_sensor === m.id_sensor);
                  const instalacion = instalaciones.find((inst) => inst.id_sistema === m.id_sistema);
                  const isAboveMax = sensor ? m.valor > sensor.umbral_max : m.alerta;
                  const isBelowMin = sensor ? m.valor < sensor.umbral_min : false;
                  const isOutOfRange = isAboveMax || isBelowMin;
                  const unitLabel = formatUnit(m.unidad);

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td
                        title={m.timestamp}
                        className="truncate whitespace-nowrap px-5 py-3 text-xs text-slate-600 tabular-nums"
                      >
                        {readableDate}
                      </td>
                      <td
                        title={
                          instalacion?.nombre
                            ? `${m.id_sistema} · ${instalacion.nombre}`
                            : m.id_sistema
                        }
                        className="truncate whitespace-nowrap px-5 py-3 font-sans font-medium text-slate-800 tabular-nums"
                      >
                        {m.id_sistema}
                        {instalacion?.nombre && (
                          <span className="font-normal text-slate-600">
                            {' '}
                            · {instalacion.nombre}
                          </span>
                        )}
                      </td>
                      <td className="truncate whitespace-nowrap px-5 py-3 text-slate-700">
                        <span className="font-sans font-medium text-slate-800 tabular-nums">
                          {m.id_sensor}
                        </span>{' '}
                        · {formatVariableLabel(m.tipo_variable)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-left tabular-nums">
                        {isOutOfRange ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F3E5D8] px-2.5 py-0.5 text-xs font-semibold text-[#5C3419]">
                            <span>{isBelowMin ? '↓' : '↑'}</span>
                            <span>
                              {m.valor} {unitLabel}
                            </span>
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-900">
                            {m.valor} {unitLabel}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            m.estado_conexion === 'En línea'
                              ? 'bg-[#E2EFE6] text-[#1B432C]'
                              : 'bg-[#F3E5D8] text-[#5C3419]'
                          }`}
                        >
                          {m.estado_conexion}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación de 12 filas por página */}
        {scopedMediciones.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-6 py-3.5 text-xs text-slate-600 sm:flex-row">
            <p className="tabular-nums">
              Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, scopedMediciones.length)} de{' '}
              {scopedMediciones.length} mediciones
            </p>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-xl border-0 bg-[#F4F6F5] px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-[#E6EAE8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <span className="px-1 font-medium tabular-nums">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-xl border-0 bg-[#F4F6F5] px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-[#E6EAE8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
