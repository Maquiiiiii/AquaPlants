import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Printer,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { logAuditEvent, subscribeAuditLogs } from '../security/auditService';
import {
  subscribeCultivos,
  subscribeInstalaciones,
  subscribeSensores,
} from '../services/crudService';
import {
  calcularHashIntegridad,
  subscribeAlertas,
  subscribeMediciones,
} from '../services/iotService';
import type { AuditLogEntry, UserProfile } from '../types/auth';
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

interface ManagementReportProps {
  profile: UserProfile | null;
  userUid: string;
  userEmail: string;
}

interface VariableStats {
  variable: TipoVariable;
  unidad: string;
  total: number;
  min: string;
  max: string;
  promedio: string;
  fueraUmbral: number;
}

const ACTION_LABELS: Record<string, string> = {
  REGISTRO_USUARIO: 'Registro de usuario',
  LOGIN_EXITOSO: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  CREAR_INSTALACION: 'Creación de instalación',
  ACTUALIZAR_INSTALACION: 'Actualización de instalación',
  ELIMINAR_INSTALACION: 'Eliminación de instalación',
  CREAR_CULTIVO: 'Registro de cultivo',
  ACTUALIZAR_CULTIVO: 'Actualización de cultivo',
  ELIMINAR_CULTIVO: 'Eliminación de cultivo',
  CREAR_SENSOR: 'Alta de sensor',
  ACTUALIZAR_SENSOR: 'Actualización de sensor',
  ELIMINAR_SENSOR: 'Baja de sensor',
  SINCRONIZACION_OFFLINE: 'Sincronización sin conexión',
  PRUEBA_ESTRES_IOT: 'Prueba de carga operativa',
  RESOLVER_ALERTA: 'Resolución de alerta',
  REABRIR_ALERTA: 'Reapertura de alerta',
  CARGAR_DATOS_SEMILLA: 'Carga de datos iniciales',
  GENERAR_INFORME_GESTION: 'Emisión de informe',
};

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

function formatUnit(raw: string): string {
  if (raw === 'Lmin') return 'L/min';
  if (raw === 'horas') return 'h';
  return raw;
}

function formatEditorialDateTime(timestamp: string | Date): string {
  const parsedDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) return String(timestamp);
  const day = String(parsedDate.getDate()).padStart(2, '0');
  const month = MONTH_NAMES_ES[parsedDate.getMonth()];
  const time = parsedDate.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} ${month} · ${time}`;
}

function getAgronomicRecommendation(alerta: Alerta): string {
  const varKey = alerta.tipo_variable.trim().toLowerCase();
  const isBelowMin = alerta.umbral_superado.toLowerCase().includes('mín');

  if (varKey === 'caudal') {
    return isBelowMin
      ? 'Riego insuficiente: revisar bomba, filtros o boquillas obstruidas para evitar estrés hídrico en las plantas.'
      : 'Caudal excesivo: verificar válvula reguladora o posibles fugas en línea.';
  }
  if (varKey === 'consumo_hidrico') {
    return 'Variación en consumo de agua: revisar nivel del estanque y demanda hídrica de los cultivos.';
  }
  if (varKey === 'nutrientes') {
    return 'Concentración de nutrientes fuera de rango: calibrar solución nutritiva (ppm) para proteger el desarrollo radicular.';
  }
  if (varKey === 'fotoperiodo') {
    return 'Ciclo de iluminación alterado: revisar temporizadores de luz para mantener el fotoperíodo óptimo.';
  }
  return 'Revisar el estado operativo del sensor y las condiciones del invernadero.';
}

export default function ManagementReport({
  profile,
  userUid,
  userEmail,
}: ManagementReportProps) {
  const [instalaciones, setInstalaciones] = useState<Instalacion[]>([]);
  const [cultivos, setCultivos] = useState<Cultivo[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [mediciones, setMediciones] = useState<Medicion[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [verifiedCount, setVerifiedCount] = useState<number>(0);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<Date>(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubInst = subscribeInstalaciones(setInstalaciones, setStreamError);
    const unsubCult = subscribeCultivos(setCultivos, setStreamError);
    const unsubSen = subscribeSensores(setSensores, setStreamError);
    const unsubMed = subscribeMediciones(null, setMediciones, setStreamError);
    const unsubAle = subscribeAlertas(null, setAlertas, setStreamError);
    const unsubLog = subscribeAuditLogs(null, setAuditLogs, setStreamError);

    return () => {
      unsubInst();
      unsubCult();
      unsubSen();
      unsubMed();
      unsubAle();
      unsubLog();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function verifyAll() {
      const checks = await Promise.all(
        mediciones.map(async (m) => {
          const hash = await calcularHashIntegridad(
            m.id_sistema,
            m.id_dispositivo,
            m.id_sensor,
            m.valor,
            m.timestamp,
          );
          return hash === m.hash_integridad;
        }),
      );
      if (!cancelled) {
        setVerifiedCount(checks.filter(Boolean).length);
      }
    }
    void verifyAll();
    return () => {
      cancelled = true;
    };
  }, [mediciones]);

  const variableStats = useMemo<VariableStats[]>(() => {
    return TIPOS_VARIABLE.map((tv) => {
      const items = mediciones.filter((m) => m.tipo_variable === tv);
      if (items.length === 0) {
        return {
          variable: tv,
          unidad: formatUnit(UNIDAD_POR_VARIABLE[tv]),
          total: 0,
          min: '—',
          max: '—',
          promedio: '—',
          fueraUmbral: 0,
        };
      }
      const values = items.map((m) => m.valor);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
      const fueraUmbral = items.filter((m) => m.alerta).length;

      return {
        variable: tv,
        unidad: formatUnit(UNIDAD_POR_VARIABLE[tv]),
        total: items.length,
        min: min.toFixed(2),
        max: max.toFixed(2),
        promedio: avg.toFixed(2),
        fueraUmbral,
      };
    });
  }, [mediciones]);

  const alertSummary = useMemo(() => {
    const total = alertas.length;
    const activas = alertas.filter((a) => a.estado === 'Activa').length;
    const resueltas = alertas.filter((a) => a.estado === 'Resuelta').length;
    const tasaResolucion = total > 0 ? Math.round((resueltas / total) * 100) : 100;
    return { total, activas, resueltas, tasaResolucion };
  }, [alertas]);

  const integrityRate = useMemo(() => {
    if (mediciones.length === 0) return 100;
    return Math.round((verifiedCount / mediciones.length) * 100);
  }, [mediciones.length, verifiedCount]);

  const actionBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of auditLogs) {
      counts[log.accion] = (counts[log.accion] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([accion, count]) => ({
        accion,
        label: ACTION_LABELS[accion] ?? formatVariableLabel(accion),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [auditLogs]);

  async function handleRefreshCut() {
    setRefreshing(true);
    setReportGeneratedAt(new Date());
    try {
      await logAuditEvent({
        uid: userUid,
        email: profile?.email ?? userEmail,
        rol: profile?.rol ?? 'Encargado de cultivo',
        accion: 'GENERAR_INFORME_GESTION',
        detalle: `Corte ejecutivo actualizado (${instalaciones.length} instalaciones, ${mediciones.length} lecturas)`,
      });
    } finally {
      setRefreshing(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const operationStable = alertSummary.activas === 0;

  return (
    <section className="print-only-container space-y-6 print:mb-0 print:px-[14mm] print:py-[12mm]">
      {/* Encabezado editorial exclusivo para impresión / PDF */}
      <div className="mb-6 hidden flex-col items-center text-center print:flex">
        <p className="text-lg font-bold tracking-tight text-[#1B432C]">AquaPlants · AquaBrain</p>
        <p className="mt-0.5 text-xs font-medium tracking-wide text-slate-500">
          Monitoreo y Gestión Agrícola
        </p>
      </div>

      {/* Encabezado ejecutivo y acciones */}
      <div className="print-break-inside-avoid flex flex-col justify-between gap-4 rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)] sm:flex-row sm:items-center">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#E2EFE6] text-[#1B432C]">
              <FileText className="h-4 w-4" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Informe de Gestión Operativa
            </h2>
            <span
              className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                operationStable
                  ? 'bg-[#E2EFE6] text-[#1B432C]'
                  : 'bg-[#F3E5D8] text-[#5C3419]'
              }`}
            >
              {operationStable ? 'Operación estable' : 'Requiere atención'}
            </span>
          </div>
          <p className="text-xs text-slate-500 tabular-nums">
            Emitido el {formatEditorialDateTime(reportGeneratedAt)} · Responsable:{' '}
            <span className="font-medium text-slate-700">{profile?.email ?? userEmail}</span> ·{' '}
            <span className="rounded-full bg-[#F4F6F5] px-2 py-0.5 font-medium text-slate-600">
              {profile?.rol ?? 'Encargado de cultivo'}
            </span>
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefreshCut()}
            className="inline-flex items-center gap-2 rounded-full border-0 bg-[#E2EFE6] px-4 py-2 text-xs font-semibold text-[#1B432C] transition-colors hover:bg-[#D2E6D8] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar corte
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-full border-0 bg-[#00753A] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#00612F]"
          >
            <Printer className="h-3.5 w-3.5" />
            Exportar / Imprimir PDF
          </button>
        </div>
      </div>

      {streamError && (
        <p role="alert" className="rounded-2xl border-0 bg-[#FDF7F7] px-4 py-3 text-sm text-[#9E2A2B]">
          {streamError}
        </p>
      )}

      {/* 1. Resumen Operativo por Instalación */}
      <div className="print-break-inside-avoid rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
        <h3 className="text-base font-semibold text-slate-900">
          1. Resumen Operativo por Instalación
        </h3>
        <div className="print-table-wrapper mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Instalación</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3 text-right">Cultivos</th>
                <th className="px-4 py-3 text-right">Sensores</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Última lectura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instalaciones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                    No hay instalaciones registradas.
                  </td>
                </tr>
              ) : (
                instalaciones.map((inst) => {
                  const cultCount = cultivos.filter((c) => c.id_sistema === inst.id_sistema).length;
                  const senCount = sensores.filter((s) => s.id_sistema === inst.id_sistema).length;
                  const lastMed = mediciones.find((m) => m.id_sistema === inst.id_sistema);
                  return (
                    <tr key={inst.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-sans font-medium text-slate-800 tabular-nums">
                        {inst.id_sistema}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{inst.nombre}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {inst.ubicacion_descifrada ?? 'Sin ubicación'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                        {cultCount}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                        {senCount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            inst.estado_conexion === 'En línea'
                              ? 'bg-[#E2EFE6] text-[#1B432C]'
                              : 'bg-[#F3E5D8] text-[#5C3419]'
                          }`}
                        >
                          {inst.estado_conexion}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-600 tabular-nums">
                        {lastMed ? formatEditorialDateTime(lastMed.timestamp) : 'Sin lecturas'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Estadísticas por Variable Monitoreada */}
      <div className="print-break-inside-avoid rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
        <h3 className="text-base font-semibold text-slate-900">
          2. Estadísticas por Variable Monitoreada
        </h3>
        <div className="print-table-wrapper mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                <th className="px-4 py-3">Variable</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3 text-right">Lecturas</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-right">Máximo</th>
                <th className="px-4 py-3 text-right">Promedio</th>
                <th className="px-4 py-3 text-right">Fuera de rango</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {variableStats.map((row) => (
                <tr key={row.variable} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {formatVariableLabel(row.variable)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.unidad}</td>
                  <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{row.total}</td>
                  <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{row.min}</td>
                  <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{row.max}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                    {row.promedio}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.fueraUmbral > 0 ? (
                      <span className="inline-flex rounded-full bg-[#F3E5D8] px-2.5 py-0.5 text-xs font-semibold text-[#5C3419]">
                        {row.fueraUmbral}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Indicadores de Gestión de Alertas */}
      <div className="print-break-inside-avoid rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
        <h3 className="text-base font-semibold text-slate-900">
          3. Indicadores de Gestión de Alertas
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-[#F4F6F5] p-4">
            <p className="text-xs font-medium text-slate-500">Total histórico</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {alertSummary.total}
            </p>
          </div>
          <div className="rounded-2xl bg-[#FDF7F7] p-4">
            <p className="text-xs font-medium text-[#9E2A2B]/80">Alertas activas</p>
            <p className="mt-1 text-2xl font-bold text-[#9E2A2B] tabular-nums">
              {alertSummary.activas}
            </p>
          </div>
          <div className="rounded-2xl bg-[#E2EFE6] p-4">
            <p className="text-xs font-medium text-[#1B432C]/80">Alertas resueltas</p>
            <p className="mt-1 text-2xl font-bold text-[#1B432C] tabular-nums">
              {alertSummary.resueltas}
            </p>
          </div>
          <div className="rounded-2xl bg-[#DCE7E1] p-4">
            <p className="text-xs font-medium text-[#1D3B2C]/80">Tasa de resolución</p>
            <p className="mt-1 text-2xl font-bold text-[#1D3B2C] tabular-nums">
              {alertSummary.tasaResolucion}%
            </p>
          </div>
        </div>

        {/* Atención Prioritaria en Cultivos */}
        {(() => {
          const activeAlerts = alertas.filter((a) => a.estado === 'Activa');
          if (activeAlerts.length === 0) {
            return (
              <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-[#E2EFE6]/60 px-4 py-3 text-xs font-medium text-[#1B432C]">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00753A]" />
                <span>
                  Todos los cultivos operan dentro de sus rangos hídricos, nutricionales y
                  lumínicos óptimos.
                </span>
              </div>
            );
          }

          const grouped = new Map<string, { latest: Alerta; count: number; values: number[] }>();
          for (const alerta of activeAlerts) {
            const key = `${alerta.id_sistema}::${alerta.id_sensor}`;
            const existing = grouped.get(key);
            if (!existing) {
              grouped.set(key, {
                latest: alerta,
                count: 1,
                values: [alerta.valor_registrado],
              });
            } else {
              existing.count += 1;
              existing.values.push(alerta.valor_registrado);
              if (alerta.timestamp > existing.latest.timestamp) {
                existing.latest = alerta;
              }
            }
          }
          const groupedAlerts = Array.from(grouped.values());

          return (
            <div className="mt-5 space-y-3">
              <h4 className="text-xs font-semibold tracking-wider text-[#9E2A2B] uppercase">
                Atención Prioritaria en Cultivos ({groupedAlerts.length})
              </h4>
              <div className="space-y-2.5">
                {groupedAlerts.map(({ latest, count, values }) => {
                  const inst = instalaciones.find((i) => i.id_sistema === latest.id_sistema);
                  const instName = inst?.nombre ?? latest.id_sistema;
                  const sensorObj = sensores.find((s) => s.id_sensor === latest.id_sensor);
                  const rawUnit =
                    sensorObj?.unidad ??
                    UNIDAD_POR_VARIABLE[latest.tipo_variable as TipoVariable] ??
                    '';
                  const unit = formatUnit(rawUnit);
                  const exposedCrops = cultivos
                    .filter((c) => c.id_sistema === latest.id_sistema && c.estado === 'Activo')
                    .map((c) => c.nombre_planta);
                  const distinctValues = new Set(values.map((v) => v.toFixed(1)));
                  const hasMultipleValues = distinctValues.size > 1;
                  const minVal = Math.min(...values);
                  const maxVal = Math.max(...values);

                  return (
                    <div key={`${latest.id_sistema}-${latest.id_sensor}`} className="rounded-2xl bg-[#FDF7F7] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-slate-900 tabular-nums">
                            {latest.id_sistema} · {instName} — Sensor {latest.id_sensor}
                          </p>
                          {count > 1 && (
                            <span className="rounded-full bg-[#F3E5D8] px-2 py-0.5 text-[11px] font-medium text-[#5C3419] tabular-nums">
                              {count} incidencias activas
                            </span>
                          )}
                        </div>
                        <span className="ml-auto inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#9E2A2B] tabular-nums">
                          {hasMultipleValues
                            ? `Última: ${latest.valor_registrado.toFixed(1)}`
                            : `${formatVariableLabel(latest.tipo_variable)}: ${latest.valor_registrado.toFixed(1)}`}
                          {unit ? ` ${unit}` : ''}
                        </span>
                      </div>
                      {hasMultipleValues && (
                        <p className="mt-1 text-[11px] font-medium text-[#9E2A2B] tabular-nums">
                          Rango detectado: {minVal.toFixed(1)} – {maxVal.toFixed(1)}
                          {unit ? ` ${unit}` : ''}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Cultivos expuestos:</span>{' '}
                        {exposedCrops.length > 0
                          ? exposedCrops.join(', ')
                          : 'Sin cultivos asignados'}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[#5C3419]">
                        {getAgronomicRecommendation(latest)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 4. Control y Trazabilidad Operativa */}
      <div className="print-break-inside-avoid rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)] print:mb-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#00753A]" />
          <h3 className="text-base font-semibold text-slate-900">
            4. Control y Trazabilidad Operativa
          </h3>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-[#F4F6F5] p-4">
            <p className="text-xs font-medium text-slate-500">Eventos registrados en bitácora</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {auditLogs.length}
            </p>
          </div>
          <div className="rounded-2xl bg-[#E2EFE6] p-4">
            <p className="text-xs font-medium text-[#1B432C]/80">Lecturas íntegras verificadas</p>
            <p className="mt-1 text-2xl font-bold text-[#1B432C] tabular-nums">
              {integrityRate}%
            </p>
          </div>
          <div className="rounded-2xl bg-[#DCE7E1] p-4">
            <p className="text-xs font-medium text-[#1D3B2C]/80">Movimientos operativos</p>
            <p className="mt-1 text-2xl font-bold text-[#1D3B2C] tabular-nums">
              {actionBreakdown.length}
            </p>
          </div>
        </div>

        {actionBreakdown.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {actionBreakdown.map((item) => (
              <div
                key={item.accion}
                className="flex items-center justify-between rounded-2xl bg-[#F4F6F5] px-4 py-2.5 text-xs"
              >
                <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#00753A]" />
                  {item.label}
                </span>
                <span className="font-semibold text-slate-900 tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
