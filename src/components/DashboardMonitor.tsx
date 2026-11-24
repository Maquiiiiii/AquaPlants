import { useEffect, useMemo, useState } from 'react';
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
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'error' | 'ok';
    text: string;
  } | null>(null);

  // Filtros interactivos de histórico
  const [filterSistema, setFilterSistema] = useState<string>('Todas');
  const [filterVariable, setFilterVariable] = useState<string>('Todas');

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

  const filteredMediciones = useMemo(() => {
    return mediciones.filter((m) => {
      const matchesSistema = filterSistema === 'Todas' || m.id_sistema === filterSistema;
      const matchesVariable =
        filterVariable === 'Todas' || m.tipo_variable === (filterVariable as TipoVariable);
      return matchesSistema && matchesVariable;
    });
  }, [mediciones, filterSistema, filterVariable]);

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

  return (
    <section id="dashboard-monitoreo">
      <h2>Dashboard de Monitoreo e Históricos con Verificación de Integridad (Módulo 4)</h2>

      <nav aria-label="Navegación Dashboard">
        <a href="#dash-resumen">Resumen Ejecutivo</a> |{' '}
        <a href="#dash-alertas-activas">
          Alertas Activas ({resumen.alertasActivas.length})
        </a>{' '}
        |{' '}
        <a href="#dash-historico-mediciones">
          Histórico Verificado ({filteredMediciones.length})
        </a>
      </nav>

      {streamError && <p role="alert">{streamError}</p>}
      {actionFeedback && (
        <p role={actionFeedback.type === 'error' ? 'alert' : 'status'}>
          {actionFeedback.text}
        </p>
      )}

      {/* ==================== RESUMEN EJECUTIVO ==================== */}
      <section id="dash-resumen">
        <h3>Resumen Ejecutivo en Tiempo Real</h3>
        <table>
          <thead>
            <tr>
              <th>Indicador Operativo</th>
              <th>Valor Actual</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Total de Instalaciones</th>
              <td>{resumen.totalInstalaciones}</td>
              <td>
                En línea: {resumen.enLinea} | Desconectado: {resumen.desconectadas}
              </td>
            </tr>
            <tr>
              <th>Total de Cultivos Activos</th>
              <td>{resumen.cultivosActivos}</td>
              <td>De {cultivos.length} cultivos registrados</td>
            </tr>
            <tr>
              <th>Total de Sensores Activos</th>
              <td>{resumen.sensoresActivos}</td>
              <td>De {sensores.length} sensores configurados</td>
            </tr>
            <tr>
              <th>Total de Alertas Activas</th>
              <td>{resumen.alertasActivas.length}</td>
              <td>Pendientes de atención (de {alertas.length} históricas)</td>
            </tr>
            <tr>
              <th>Total de Eventos de Auditoría</th>
              <td>{resumen.totalAuditLogs}</td>
              <td>Registros inmutables en audit_logs</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ==================== GESTIÓN DE ALERTAS ACTIVAS ==================== */}
      <section id="dash-alertas-activas">
        <h3>Panel de Gestión de Alertas Activas</h3>
        {!canResolveAlerts && (
          <p>
            Rol actual ({profile?.rol ?? 'Sin perfil'}): solo lectura sobre alertas activas.
          </p>
        )}
        <table>
          <thead>
            <tr>
              <th>Nivel</th>
              <th>Sistema</th>
              <th>Sensor</th>
              <th>Valor Registrado</th>
              <th>Umbral Superado</th>
              <th>Mensaje</th>
              <th>Fecha / Hora (ISO 8601)</th>
              {canResolveAlerts && <th>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {resumen.alertasActivas.length === 0 ? (
              <tr>
                <td colSpan={canResolveAlerts ? 8 : 7}>
                  No existen alertas activas pendientes de atención.
                </td>
              </tr>
            ) : (
              resumen.alertasActivas.map((alerta) => (
                <tr key={alerta.id}>
                  <td>
                    <strong>{alerta.nivel}</strong>
                  </td>
                  <td>
                    <code>{alerta.id_sistema}</code>
                  </td>
                  <td>
                    <code>{alerta.id_sensor}</code>
                  </td>
                  <td>{alerta.valor_registrado}</td>
                  <td>{alerta.umbral_superado}</td>
                  <td>{alerta.mensaje}</td>
                  <td>{alerta.timestamp}</td>
                  {canResolveAlerts && (
                    <td>
                      <button type="button" onClick={() => void handleResolveAlert(alerta)}>
                        Marcar como Resuelta
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ==================== HISTÓRICO CON VERIFICACIÓN SHA-256 ==================== */}
      <section id="dash-historico-mediciones">
        <h3>Histórico de Mediciones con Verificación Criptográfica en Vivo</h3>

        <form onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Filtros de Histórico</legend>
            <p>
              <label htmlFor="dash-filter-sistema">Filtrar por Instalación:</label>{' '}
              <select
                id="dash-filter-sistema"
                value={filterSistema}
                onChange={(e) => setFilterSistema(e.target.value)}
              >
                <option value="Todas">Todas</option>
                {instalaciones.map((inst) => (
                  <option key={inst.id} value={inst.id_sistema}>
                    {inst.id_sistema} — {inst.nombre}
                  </option>
                ))}
              </select>{' '}
              <label htmlFor="dash-filter-variable">Filtrar por Tipo de Variable:</label>{' '}
              <select
                id="dash-filter-variable"
                value={filterVariable}
                onChange={(e) => setFilterVariable(e.target.value)}
              >
                <option value="Todas">Todas</option>
                {TIPOS_VARIABLE.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </p>
          </fieldset>
        </form>

        <table>
          <thead>
            <tr>
              <th>Timestamp (ISO 8601)</th>
              <th>Sistema</th>
              <th>Dispositivo</th>
              <th>Sensor</th>
              <th>Variable</th>
              <th>Valor</th>
              <th>Conexión</th>
              <th>Hash Almacenado (SHA-256)</th>
              <th>Integridad Criptográfica (SHA-256)</th>
            </tr>
          </thead>
          <tbody>
            {filteredMediciones.length === 0 ? (
              <tr>
                <td colSpan={9}>No hay mediciones que coincidan con los filtros seleccionados.</td>
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
                  <tr key={m.id}>
                    <td>{m.timestamp}</td>
                    <td>
                      <code>{m.id_sistema}</code>
                    </td>
                    <td>
                      <code>{m.id_dispositivo}</code>
                    </td>
                    <td>
                      <code>{m.id_sensor}</code>
                    </td>
                    <td>{m.tipo_variable}</td>
                    <td>
                      {m.valor} {m.unidad}
                    </td>
                    <td>{m.estado_conexion}</td>
                    <td>
                      <code>{m.hash_integridad.slice(0, 20)}...</code>
                    </td>
                    <td>
                      <strong>{integrityLabel}</strong>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}
