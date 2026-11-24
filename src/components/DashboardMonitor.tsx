import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  FileCheck2,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { subscribeAuditLogs } from '../security/auditService';
import {
  subscribeCultivos,
  subscribeInstalaciones,
  subscribeSensores,
  type CrudActor,
} from '../services/crudService';
import {
  calcularHashIntegridad,
  resolverAlerta,
  subscribeAlertas,
  subscribeMediciones,
} from '../services/iotService';
import { cargarDatosDemostracion, type SeedResult } from '../services/seedService';
import type { AuditLogEntry, UserProfile } from '../types/auth';
import {
  TIPOS_VARIABLE,
  type Alerta,
  type Cultivo,
  type Instalacion,
  type Medicion,
  type Sensor,
  type TipoVariable,
} from '../types/domain';

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

export default function DashboardMonitor({
  profile,
  userUid,
  userEmail,
}: DashboardMonitorProps) {
  const isAdmin = profile?.rol === 'Administrador';
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
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'error' | 'ok';
    text: string;
  } | null>(null);

  // Estado carga de datos semilla
  const [seeding, setSeeding] = useState(false);

  // Filtros interactivos de histórico y gráfico
  const [filterSistema, setFilterSistema] = useState<string>('Todas');
  const [filterVariable, setFilterVariable] = useState<string>('Todas');
  const [filterSensor, setFilterSensor] = useState<string>('Todos');

  // Mapa de verificación criptográfica SHA-256 por medición
  const [integrityStatusMap, setIntegrityStatusMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubInst = subscribeInstalaciones(setInstalaciones, setStreamError);
    const unsubCult = subscribeCultivos(setCultivos, setStreamError);
    const unsubSen = subscribeSensores(setSensores, setStreamError);
    const unsubMed = subscribeMediciones(null, setMediciones, setStreamError);
    const unsubAle = subscribeAlertas(null, setAlertas, setStreamError);
    const unsubAud = subscribeAuditLogs(null, setAuditLogs, setStreamError);

    return () => {
      unsubInst();
      unsubCult();
      unsubSen();
      unsubMed();
      unsubAle();
      unsubAud();
    };
  }, []);

  // Recalcula SHA-256 en el navegador para cada medición leída desde Firestore
  useEffect(() => {
    let cancelled = false;

    async function verifyAllMeasurements() {
      const results = await Promise.all(
        mediciones.map(async (m): Promise<[string, boolean]> => {
          const recomputed = await calcularHashIntegridad(
            m.id_sistema,
            m.id_dispositivo,
            m.id_sensor,
            m.valor,
            m.timestamp,
          );
          return [m.id, recomputed === m.hash_integridad];
        }),
      );

      if (!cancelled) {
        setIntegrityStatusMap(Object.fromEntries(results));
      }
    }

    void verifyAllMeasurements();

    return () => {
      cancelled = true;
    };
  }, [mediciones]);

  const resumen = useMemo(() => {
    const enLinea = instalaciones.filter((i) => i.estado_conexion === 'En línea').length;
    const desconectadas = instalaciones.filter((i) => i.estado_conexion === 'Desconectado').length;
    const cultivosActivos = cultivos.filter((c) => c.estado === 'Activo').length;
    const sensoresActivos = sensores.filter((s) => s.estado === 'Activo').length;
    const alertasActivas = alertas.filter((a) => a.estado === 'Activa');

    return {
      totalInstalaciones: instalaciones.length,
      enLinea,
      desconectadas,
      cultivosActivos,
      sensoresActivos,
      alertasActivas,
      totalAuditLogs: auditLogs.length,
    };
  }, [instalaciones, cultivos, sensores, alertas, auditLogs]);

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

  // Determina umbrales de referencia para el gráfico cuando se filtra por sensor o variable específica
  const referenceThresholds = useMemo(() => {
    if (effectiveSensorFilter !== 'Todos') {
      const exactSensor = sensores.find((s) => s.id_sensor === effectiveSensorFilter);
      if (exactSensor) {
        return {
          umbralMin: exactSensor.umbral_min,
          umbralMax: exactSensor.umbral_max,
          unidad: exactSensor.unidad,
        };
      }
    }

    if (filterVariable !== 'Todas') {
      const matchingSensors = availableSensorsForFilter;
      if (matchingSensors.length > 0) {
        return {
          umbralMin: matchingSensors[0].umbral_min,
          umbralMax: matchingSensors[0].umbral_max,
          unidad: matchingSensors[0].unidad,
        };
      }
    }

    return null;
  }, [effectiveSensorFilter, filterVariable, sensores, availableSensorsForFilter]);

  // Orden cronológico ascendente para el LineChart
  const chartData = useMemo<ChartPoint[]>(() => {
    return [...filteredMediciones]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((m) => {
        const date = new Date(m.timestamp);
        const hora = Number.isNaN(date.getTime())
          ? m.timestamp.slice(11, 16)
          : date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        return {
          hora,
          timestamp: m.timestamp,
          valor: m.valor,
          id_sensor: m.id_sensor,
          unidad: m.unidad,
          alerta: m.alerta,
        };
      });
  }, [filteredMediciones]);

  async function handleResolveAlert(alerta: Alerta) {
    setActionFeedback(null);
    try {
      await resolverAlerta(alerta.id, alerta.id_sensor, actor);
      setActionFeedback({
        type: 'ok',
        text: `Alerta ${alerta.id} (sensor ${alerta.id_sensor}) resuelta y auditada en audit_logs.`,
      });
    } catch (error) {
      setActionFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al resolver alerta.',
      });
    }
  }

  async function handleSeedDemoData() {
    setActionFeedback(null);
    setSeeding(true);
    try {
      const res: SeedResult = await cargarDatosDemostracion(actor);
      setActionFeedback({
        type: 'ok',
        text: `Datos semilla cargados: ${res.instalacionesCreadas} instalaciones nuevas, ${res.cultivosCreados} cultivos nuevos, ${res.sensoresCreados} sensores nuevos y ${res.medicionesCreadas} mediciones (${res.alertasGeneradas} alertas).`,
      });
    } catch (error) {
      setActionFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al cargar datos de demostración.',
      });
    } finally {
      setSeeding(false);
    }
  }

  return (
    <section id="dashboard-monitoreo" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Dashboard Operativo y Verificación de Integridad
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Monitoreo en tiempo real de instalaciones, alertas activas y validación SHA-256 de
            telemetría
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => void handleSeedDemoData()}
            disabled={seeding}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Database className="h-4 w-4" strokeWidth={1.75} />
            {seeding
              ? 'Cargando datos semilla...'
              : 'Cargar Datos de Demostración AquaPlants'}
          </button>
        )}
      </div>

      {streamError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" strokeWidth={1.75} />
          <span>{streamError}</span>
        </div>
      )}

      {actionFeedback && (
        <div
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${
            actionFeedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {actionFeedback.type === 'error' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" strokeWidth={1.75} />
          ) : (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
              strokeWidth={1.75}
            />
          )}
          <span>{actionFeedback.text}</span>
        </div>
      )}

      {/* ==================== KPIs EJECUTIVOS ==================== */}
      <section id="dash-resumen" aria-label="Resumen Ejecutivo en Tiempo Real">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Instalaciones</span>
              <Wifi className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {resumen.totalInstalaciones}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-slate-600 tabular-nums">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Wifi className="h-3.5 w-3.5" strokeWidth={1.75} />
                {resumen.enLinea} en línea
              </span>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <WifiOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                {resumen.desconectadas} desc.
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Cultivos Activos</span>
              <Sprout className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {resumen.cultivosActivos}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              De {cultivos.length} cultivos registrados
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Sensores Activos</span>
              <Cpu className="h-4 w-4 text-slate-600" strokeWidth={1.75} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {resumen.sensoresActivos}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              De {sensores.length} sensores configurados
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Alertas Activas</span>
              <AlertTriangle
                className={`h-4 w-4 ${
                  resumen.alertasActivas.length > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
                strokeWidth={1.75}
              />
            </div>
            <p
              className={`mt-2 text-2xl font-semibold tabular-nums ${
                resumen.alertasActivas.length > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {resumen.alertasActivas.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              Pendientes de {alertas.length} históricas
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Eventos de Auditoría</span>
              <FileCheck2 className="h-4 w-4 text-slate-600" strokeWidth={1.75} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">
              {resumen.totalAuditLogs}
            </p>
            <p className="mt-1 text-xs text-slate-500">Trazabilidad inmutable SHA-256</p>
          </div>
        </div>
      </section>

      {/* ==================== GRÁFICO HISTÓRICO INTERACTIVO ==================== */}
      <section
        aria-label="Evolución Histórica de Telemetría"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Activity className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
              Evolución Temporal de Mediciones
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {referenceThresholds
                ? `Líneas de referencia activas: Mín ${referenceThresholds.umbralMin} ${referenceThresholds.unidad} / Máx ${referenceThresholds.umbralMax} ${referenceThresholds.unidad}`
                : 'Filtra por un sensor o variable específica para visualizar las líneas de umbral mínimo y máximo'}
            </p>
          </div>

          <form
            onSubmit={(e) => e.preventDefault()}
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <div>
              <label
                htmlFor="dash-filter-sistema"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                Instalación
              </label>
              <select
                id="dash-filter-sistema"
                value={filterSistema}
                onChange={(e) => {
                  setFilterSistema(e.target.value);
                  setFilterSensor('Todos');
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              >
                <option value="Todas">Todas las instalaciones</option>
                {instalaciones.map((inst) => (
                  <option key={inst.id} value={inst.id_sistema}>
                    {inst.id_sistema} — {inst.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="dash-filter-variable"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                Variable
              </label>
              <select
                id="dash-filter-variable"
                value={filterVariable}
                onChange={(e) => {
                  setFilterVariable(e.target.value);
                  setFilterSensor('Todos');
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              >
                <option value="Todas">Todas las variables</option>
                {TIPOS_VARIABLE.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="dash-filter-sensor"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                Sensor
              </label>
              <select
                id="dash-filter-sensor"
                value={effectiveSensorFilter}
                onChange={(e) => setFilterSensor(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              >
                <option value="Todos">Todos los sensores</option>
                {availableSensorsForFilter.map((sen) => (
                  <option key={sen.id} value={sen.id_sensor}>
                    {sen.id_sensor} ({sen.tipo_variable})
                  </option>
                ))}
              </select>
            </div>
          </form>
        </div>

        <div className="mt-4 h-72 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              No hay mediciones disponibles para los filtros seleccionados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 20, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="hora"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                    color: '#0f172a',
                  }}
                  formatter={(value) => [`${String(value ?? '')}`, 'Valor registrado']}
                  labelFormatter={(label, payload) => {
                    const first = payload?.[0]?.payload as ChartPoint | undefined;
                    return first
                      ? `${first.id_sensor} · ${new Date(first.timestamp).toLocaleString('es-CL')}`
                      : String(label);
                  }}
                />
                {referenceThresholds && (
                  <ReferenceLine
                    y={referenceThresholds.umbralMax}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                    label={{
                      value: `Máx ${referenceThresholds.umbralMax}`,
                      position: 'insideTopRight',
                      fill: '#dc2626',
                      fontSize: 11,
                    }}
                  />
                )}
                {referenceThresholds && (
                  <ReferenceLine
                    y={referenceThresholds.umbralMin}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                    label={{
                      value: `Mín ${referenceThresholds.umbralMin}`,
                      position: 'insideBottomRight',
                      fill: '#d97706',
                      fontSize: 11,
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#059669', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#047857' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ==================== GESTIÓN DE ALERTAS ACTIVAS ==================== */}
      <section
        id="dash-alertas-activas"
        className="rounded-xl border border-slate-200 bg-white shadow-xs"
      >
        <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Panel de Gestión de Alertas Activas ({resumen.alertasActivas.length})
            </h3>
            <p className="text-xs text-slate-500">
              Alertas pendientes generadas por mediciones fuera de umbral
            </p>
          </div>
          {!canResolveAlerts && (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              Rol {profile?.rol ?? 'Sin perfil'}: solo lectura
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-4 py-3">Nivel</th>
                <th className="px-4 py-3">Sistema</th>
                <th className="px-4 py-3">Sensor</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Umbral Superado</th>
                <th className="px-4 py-3">Mensaje</th>
                <th className="px-4 py-3">Fecha / Hora</th>
                {canResolveAlerts && <th className="px-4 py-3 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resumen.alertasActivas.length === 0 ? (
                <tr>
                  <td
                    colSpan={canResolveAlerts ? 8 : 7}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No existen alertas activas pendientes de atención.
                  </td>
                </tr>
              ) : (
                resumen.alertasActivas.map((alerta) => (
                  <tr key={alerta.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          alerta.nivel === 'Crítica'
                            ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
                        }`}
                      >
                        {alerta.nivel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {alerta.id_sistema}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {alerta.id_sensor}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 tabular-nums">
                      {alerta.valor_registrado}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{alerta.umbral_superado}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">{alerta.mensaje}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                      {alerta.timestamp}
                    </td>
                    {canResolveAlerts && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleResolveAlert(alerta)}
                          className="rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        >
                          Marcar como Resuelta
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== HISTÓRICO CON VERIFICACIÓN SHA-256 ==================== */}
      <section
        id="dash-historico-mediciones"
        className="rounded-xl border border-slate-200 bg-white shadow-xs"
      >
        <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
              Histórico de Mediciones con Verificación Criptográfica en Vivo
            </h3>
            <p className="text-xs text-slate-500">
              Cada fila recalcula SHA-256 en el navegador contra el digest persistido en Firestore (
              {filteredMediciones.length} registros)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-4 py-3">Timestamp (ISO 8601)</th>
                <th className="px-4 py-3">Sistema</th>
                <th className="px-4 py-3">Dispositivo</th>
                <th className="px-4 py-3">Sensor</th>
                <th className="px-4 py-3">Variable</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Conexión</th>
                <th className="px-4 py-3">Hash Almacenado (SHA-256)</th>
                <th className="px-4 py-3">Integridad Criptográfica (SHA-256)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMediciones.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    No hay mediciones que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredMediciones.map((m) => {
                  const isVerified = integrityStatusMap[m.id];
                  const integrityLabel =
                    isVerified === undefined
                      ? 'Verificando...'
                      : isVerified
                        ? '[VÁLIDO - INTEGRIDAD VERIFICADA]'
                        : '[ALERTA - POSIBLE ALTERACIÓN DE DATO]';

                  return (
                    <tr key={m.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-600 tabular-nums">
                        {m.timestamp}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                        {m.id_sistema}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {m.id_dispositivo}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-900">
                        {m.id_sensor}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{m.tipo_variable}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-900 tabular-nums">
                        {m.valor} {m.unidad}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                            m.estado_conexion === 'En línea'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {m.estado_conexion}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                        {m.hash_integridad.slice(0, 20)}...
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                            isVerified === undefined
                              ? 'bg-slate-100 text-slate-600'
                              : isVerified
                                ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                                : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
                          }`}
                        >
                          {integrityLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
