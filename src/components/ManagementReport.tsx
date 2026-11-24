import { useEffect, useMemo, useState } from 'react';
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
    <section id="informe-gestion">
      <h2>Informe de Gestión Operativa AquaPlants / AquaBrain</h2>

      <p>
        <button type="button" onClick={() => void handleGenerateCut()} disabled={emitting}>
          {emitting ? 'Emitiendo...' : 'Generar / Actualizar Corte de Informe'}
        </button>{' '}
        <button type="button" onClick={() => void handlePrintPdf()} disabled={emitting}>
          Imprimir / Exportar Informe a PDF
        </button>
      </p>

      {streamError && <p role="alert">{streamError}</p>}
      {reportFeedback && <p role="status">{reportFeedback}</p>}

      {/* ==================== a) ENCABEZADO DE EMISIÓN ==================== */}
      <section aria-label="Encabezado de emisión del informe">
        <h3>a) Encabezado de Emisión</h3>
        <table>
          <thead>
            <tr>
              <th>Campo de Emisión</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Fecha y Hora Exacta de Generación (ISO 8601)</th>
              <td>{emittedAt}</td>
            </tr>
            <tr>
              <th>Fecha y Hora Local</th>
              <td>{new Date(emittedAt).toLocaleString('es-CL')}</td>
            </tr>
            <tr>
              <th>Usuario Emisor</th>
              <td>
                {issuerName} ({issuerEmail})
              </td>
            </tr>
            <tr>
              <th>Rol del Emisor</th>
              <td>{issuerRole}</td>
            </tr>
            <tr>
              <th>Estado General de la Plataforma</th>
              <td>
                <strong>{platformStatus}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ==================== b) RESUMEN POR INSTALACIÓN ==================== */}
      <section aria-label="Resumen operativo por instalación">
        <h3>b) Resumen Operativo por Instalación</h3>
        <table>
          <thead>
            <tr>
              <th>ID Sistema</th>
              <th>Nombre</th>
              <th>Ubicación (Descifrada)</th>
              <th>Cultivos Asociados</th>
              <th>Sensores Instalados</th>
              <th>Estado de Conexión</th>
              <th>Última Comunicación</th>
            </tr>
          </thead>
          <tbody>
            {installSummary.length === 0 ? (
              <tr>
                <td colSpan={7}>No existen instalaciones registradas.</td>
              </tr>
            ) : (
              installSummary.map((inst) => (
                <tr key={inst.id}>
                  <td>
                    <code>{inst.id_sistema}</code>
                  </td>
                  <td>{inst.nombre}</td>
                  <td>{inst.ubicacion_descifrada ?? ''}</td>
                  <td>{inst.cantidadCultivos}</td>
                  <td>{inst.cantidadSensores}</td>
                  <td>{inst.estado_conexion}</td>
                  <td>{inst.ultima_comunicacion}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ==================== c) ESTADÍSTICAS POR VARIABLE ==================== */}
      <section aria-label="Estadísticas por variable monitoreada">
        <h3>c) Estadísticas por Variable Monitoreada</h3>
        <table>
          <thead>
            <tr>
              <th>Variable Monitoreada</th>
              <th>Total Mediciones</th>
              <th>Valor Mínimo</th>
              <th>Valor Máximo</th>
              <th>Valor Promedio</th>
              <th>Mediciones Fuera de Umbral</th>
            </tr>
          </thead>
          <tbody>
            {variableStats.map((stat) => (
              <tr key={stat.variable}>
                <td>
                  <code>{stat.variable}</code>
                </td>
                <td>{stat.total}</td>
                <td>{stat.min}</td>
                <td>{stat.max}</td>
                <td>{stat.promedio}</td>
                <td>{stat.fueraUmbral}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ==================== d) INDICADORES DE ALERTAS ==================== */}
      <section aria-label="Indicadores de gestión de alertas">
        <h3>d) Indicadores de Gestión de Alertas</h3>
        <table>
          <thead>
            <tr>
              <th>Total Histórico de Alertas</th>
              <th>Alertas Activas</th>
              <th>Alertas Resueltas</th>
              <th>Tasa Porcentual de Resolución (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{alertIndicators.total}</td>
              <td>{alertIndicators.activas}</td>
              <td>{alertIndicators.resueltas}</td>
              <td>{alertIndicators.tasaResolucion}%</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ==================== e) SEGURIDAD Y AUDITORÍA ==================== */}
      <section aria-label="Resumen de seguridad y auditoría">
        <h3>e) Resumen de Seguridad y Auditoría</h3>
        <table>
          <thead>
            <tr>
              <th>Métrica de Seguridad</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Total de Eventos en audit_logs</th>
              <td>{securityBreakdown.totalEvents}</td>
            </tr>
            <tr>
              <th>Mediciones Verificadas Criptográficamente sin Alteraciones</th>
              <td>
                <strong>
                  {securityBreakdown.integrityPct}% ({integrityCounts.valid} /{' '}
                  {integrityCounts.total})
                </strong>
              </td>
            </tr>
          </tbody>
        </table>

        <h4>Desglose de Operaciones Críticas en audit_logs</h4>
        <table>
          <thead>
            <tr>
              <th>Acción Auditada</th>
              <th>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {securityBreakdown.counts.length === 0 ? (
              <tr>
                <td colSpan={2}>Sin eventos registrados todavía.</td>
              </tr>
            ) : (
              securityBreakdown.counts.map(([action, count]) => (
                <tr key={action}>
                  <td>
                    <code>{action}</code>
                  </td>
                  <td>{count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}
