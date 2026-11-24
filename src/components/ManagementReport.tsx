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
  type Alerta,
  type Cultivo,
  type Instalacion,
  type Medicion,
  type Sensor,
  type TipoVariable,
} from '../types/domain';

interface ManagementReportProps {
  profile: UserProfile | null;
  userUid: string;
  userEmail: string;
}

interface VariableStats {
  variable: TipoVariable;
  total: number;
  min: string;
  max: string;
  promedio: string;
  fueraUmbral: number;
}

const CRITICAL_ACTIONS = [
  'REGISTRO_USUARIO',
  'LOGIN_EXITOSO',
  'LOGOUT',
  'CREAR_INSTALACION',
  'ACTUALIZAR_INSTALACION',
  'ELIMINAR_INSTALACION',
  'CREAR_CULTIVO',
  'ACTUALIZAR_CULTIVO',
  'ELIMINAR_CULTIVO',
  'CREAR_SENSOR',
  'ACTUALIZAR_SENSOR',
  'ELIMINAR_SENSOR',
  'SINCRONIZACION_OFFLINE',
  'PRUEBA_ESTRES_IOT',
  'RESOLVER_ALERTA',
  'CARGAR_DATOS_SEMILLA',
  'GENERAR_INFORME_GESTION',
] as const;

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

  const [emittedAt, setEmittedAt] = useState<string>(() => new Date().toISOString());
  const [integrityCounts, setIntegrityCounts] = useState<{ valid: number; total: number }>({
    valid: 0,
    total: 0,
  });
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [emitting, setEmitting] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    async function computeIntegrityPercentage() {
      if (mediciones.length === 0) {
        if (!cancelled) {
          setIntegrityCounts({ valid: 0, total: 0 });
        }
        return;
      }

      const checks = await Promise.all(
        mediciones.map(async (m) => {
          const recomputed = await calcularHashIntegridad(
            m.id_sistema,
            m.id_dispositivo,
            m.id_sensor,
            m.valor,
            m.timestamp,
          );
          return recomputed === m.hash_integridad;
        }),
      );

      if (!cancelled) {
        const valid = checks.filter(Boolean).length;
        setIntegrityCounts({ valid, total: checks.length });
      }
    }

    void computeIntegrityPercentage();

    return () => {
      cancelled = true;
    };
  }, [mediciones]);

  const issuerName = profile?.nombre ?? userEmail;
  const issuerEmail = profile?.email ?? userEmail;
  const issuerRole = profile?.rol ?? 'Encargado de cultivo';

  const platformStatus = useMemo(() => {
    const activeAlerts = alertas.filter((a) => a.estado === 'Activa');
    const criticalActive = activeAlerts.filter((a) => a.nivel === 'Crítica').length;
    const disconnected = instalaciones.filter((i) => i.estado_conexion === 'Desconectado').length;

    if (criticalActive > 0) {
      return `CRÍTICO (${criticalActive} alerta(s) crítica(s) activa(s))`;
    }
    if (activeAlerts.length > 0 || disconnected > 0) {
      return `ATENCIÓN REQUERIDA (${activeAlerts.length} alerta(s) activa(s), ${disconnected} instalación(es) desconectada(s))`;
    }
    return 'OPERACIÓN NORMAL (Sin alertas activas)';
  }, [alertas, instalaciones]);

  const installSummary = useMemo(() => {
    return instalaciones.map((inst) => ({
      ...inst,
      cantidadCultivos: cultivos.filter((c) => c.id_sistema === inst.id_sistema).length,
      cantidadSensores: sensores.filter((s) => s.id_sistema === inst.id_sistema).length,
    }));
  }, [instalaciones, cultivos, sensores]);

  const variableStats = useMemo<VariableStats[]>(() => {
    return TIPOS_VARIABLE.map((variable) => {
      const items = mediciones.filter((m) => m.tipo_variable === variable);
      if (items.length === 0) {
        return {
          variable,
          total: 0,
          min: 'N/A',
          max: 'N/A',
          promedio: 'N/A',
          fueraUmbral: 0,
        };
      }

      let minVal = items[0].valor;
      let maxVal = items[0].valor;
      let sum = 0;
      let outOfRange = 0;

      for (const item of items) {
        if (item.valor < minVal) minVal = item.valor;
        if (item.valor > maxVal) maxVal = item.valor;
        sum += item.valor;
        if (item.alerta) outOfRange += 1;
      }

      const avg = (sum / items.length).toFixed(2);
      return {
        variable,
        total: items.length,
        min: String(Number(minVal.toFixed(2))),
        max: String(Number(maxVal.toFixed(2))),
        promedio: avg,
        fueraUmbral: outOfRange,
      };
    });
  }, [mediciones]);

  const alertIndicators = useMemo(() => {
    const total = alertas.length;
    const activas = alertas.filter((a) => a.estado === 'Activa').length;
    const resueltas = alertas.filter((a) => a.estado === 'Resuelta').length;
    const tasaResolucion = total > 0 ? ((resueltas / total) * 100).toFixed(2) : '0.00';

    return { total, activas, resueltas, tasaResolucion };
  }, [alertas]);

  const securityBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const action of CRITICAL_ACTIONS) {
      counts[action] = 0;
    }
    for (const entry of auditLogs) {
      counts[entry.accion] = (counts[entry.accion] ?? 0) + 1;
    }

    const integrityPct =
      integrityCounts.total > 0
        ? ((integrityCounts.valid / integrityCounts.total) * 100).toFixed(2)
        : '100.00';

    return {
      totalEvents: auditLogs.length,
      counts: Object.entries(counts).filter(([, count]) => count > 0),
      integrityPct,
    };
  }, [auditLogs, integrityCounts]);

  async function recordReportAudit(detailMessage: string) {
    setEmitting(true);
    setReportFeedback(null);
    const nowIso = new Date().toISOString();
    setEmittedAt(nowIso);
    try {
      await logAuditEvent({
        uid: userUid,
        email: issuerEmail,
        rol: issuerRole,
        accion: 'GENERAR_INFORME_GESTION',
        detalle: `${detailMessage} (corte ${nowIso})`,
      });
      setReportFeedback(`Informe de gestión actualizado (${nowIso}) y registrado en audit_logs.`);
    } catch (error) {
      setReportFeedback(
        error instanceof Error ? error.message : 'Error registrando auditoría del informe.',
      );
    } finally {
      setEmitting(false);
    }
  }

  async function handleGenerateCut() {
    await recordReportAudit('Emisión/actualización de corte de Informe de Gestión Operativa');
  }

  async function handlePrintPdf() {
    await recordReportAudit('Exportación/impresión PDF de Informe de Gestión Operativa');
    globalThis.print();
  }

  return (
    <section id="informe-gestion" className="print-only-container space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
            <FileText className="h-5 w-5 text-emerald-600" strokeWidth={1.75} />
            Informe de Gestión Operativa AquaPlants / AquaBrain
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Documento corporativo consolidado desde Cloud Firestore con respaldo de integridad
          </p>
        </div>

        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGenerateCut()}
            disabled={emitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
            {emitting ? 'Emitiendo...' : 'Generar / Actualizar Corte de Informe'}
          </button>
          <button
            type="button"
            onClick={() => void handlePrintPdf()}
            disabled={emitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            <Printer className="h-4 w-4" strokeWidth={1.75} />
            Imprimir / Exportar Informe a PDF
          </button>
        </div>
      </div>

      {streamError && (
        <div
          role="alert"
          className="no-print rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {streamError}
        </div>
      )}

      {reportFeedback && (
        <div
          role="status"
          className="no-print flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
          <span>{reportFeedback}</span>
        </div>
      )}

      {/* ==================== a) ENCABEZADO DE EMISIÓN ==================== */}
      <section
        aria-label="Encabezado de emisión del informe"
        className="print-break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <h3 className="mb-3 border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">
          a) Encabezado de Emisión
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2">Campo de Emisión</th>
                <th className="px-3 py-2">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">
                  Fecha y Hora Exacta de Generación (ISO 8601)
                </th>
                <td className="px-3 py-2 font-mono text-xs text-slate-800 tabular-nums">
                  {emittedAt}
                </td>
              </tr>
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Fecha y Hora Local</th>
                <td className="px-3 py-2 text-slate-800 tabular-nums">
                  {new Date(emittedAt).toLocaleString('es-CL')}
                </td>
              </tr>
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Usuario Emisor</th>
                <td className="px-3 py-2 text-slate-800">
                  {issuerName} ({issuerEmail})
                </td>
              </tr>
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Rol del Emisor</th>
                <td className="px-3 py-2 text-slate-800">{issuerRole}</td>
              </tr>
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">
                  Estado General de la Plataforma
                </th>
                <td className="px-3 py-2 font-semibold text-slate-900">{platformStatus}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== b) RESUMEN POR INSTALACIÓN ==================== */}
      <section
        aria-label="Resumen operativo por instalación"
        className="print-break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <h3 className="mb-3 border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">
          b) Resumen Operativo por Instalación
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2">ID Sistema</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Ubicación (Descifrada)</th>
                <th className="px-3 py-2 text-right">Cultivos</th>
                <th className="px-3 py-2 text-right">Sensores</th>
                <th className="px-3 py-2">Estado Conexión</th>
                <th className="px-3 py-2">Última Comunicación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {installSummary.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                    No existen instalaciones registradas.
                  </td>
                </tr>
              ) : (
                installSummary.map((inst) => (
                  <tr key={inst.id}>
                    <td className="px-3 py-2 font-mono text-xs font-medium text-slate-900">
                      {inst.id_sistema}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{inst.nombre}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {inst.ubicacion_descifrada ?? ''}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {inst.cantidadCultivos}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {inst.cantidadSensores}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{inst.estado_conexion}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500 tabular-nums">
                      {inst.ultima_comunicacion}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== c) ESTADÍSTICAS POR VARIABLE ==================== */}
      <section
        aria-label="Estadísticas por variable monitoreada"
        className="print-break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <h3 className="mb-3 border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">
          c) Estadísticas por Variable Monitoreada
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2">Variable Monitoreada</th>
                <th className="px-3 py-2 text-right">Total Mediciones</th>
                <th className="px-3 py-2 text-right">Valor Mínimo</th>
                <th className="px-3 py-2 text-right">Valor Máximo</th>
                <th className="px-3 py-2 text-right">Valor Promedio</th>
                <th className="px-3 py-2 text-right">Fuera de Umbral</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {variableStats.map((stat) => (
                <tr key={stat.variable}>
                  <td className="px-3 py-2 font-mono text-xs font-medium text-slate-900">
                    {stat.variable}
                  </td>
                  <td className="px-3 py-2 text-right">{stat.total}</td>
                  <td className="px-3 py-2 text-right">{stat.min}</td>
                  <td className="px-3 py-2 text-right">{stat.max}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                    {stat.promedio}
                  </td>
                  <td className="px-3 py-2 text-right">{stat.fueraUmbral}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== d) INDICADORES DE ALERTAS ==================== */}
      <section
        aria-label="Indicadores de gestión de alertas"
        className="print-break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <h3 className="mb-3 border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">
          d) Indicadores de Gestión de Alertas
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2 text-right">Total Histórico de Alertas</th>
                <th className="px-3 py-2 text-right">Alertas Activas</th>
                <th className="px-3 py-2 text-right">Alertas Resueltas</th>
                <th className="px-3 py-2 text-right">Tasa Porcentual de Resolución (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2.5 text-right font-medium">{alertIndicators.total}</td>
                <td className="px-3 py-2.5 text-right font-medium text-amber-700">
                  {alertIndicators.activas}
                </td>
                <td className="px-3 py-2.5 text-right font-medium text-emerald-700">
                  {alertIndicators.resueltas}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                  {alertIndicators.tasaResolucion}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== e) SEGURIDAD Y AUDITORÍA ==================== */}
      <section
        aria-label="Resumen de seguridad y auditoría"
        className="print-break-inside-avoid space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
          e) Resumen de Seguridad y Auditoría
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2">Métrica de Seguridad</th>
                <th className="px-3 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">
                  Total de Eventos en audit_logs
                </th>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {securityBreakdown.totalEvents}
                </td>
              </tr>
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">
                  Mediciones Verificadas Criptográficamente sin Alteraciones
                </th>
                <td className="px-3 py-2 font-semibold text-emerald-800">
                  {securityBreakdown.integrityPct}% ({integrityCounts.valid} /{' '}
                  {integrityCounts.total})
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">
            Desglose de Operaciones Críticas en audit_logs
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="px-3 py-2">Acción Auditada</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {securityBreakdown.counts.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-center text-slate-500">
                      Sin eventos registrados todavía.
                    </td>
                  </tr>
                ) : (
                  securityBreakdown.counts.map(([action, count]) => (
                    <tr key={action}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{action}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">{count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}
