import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  subscribeInstalaciones,
  subscribeSensores,
  type CrudActor,
} from '../services/crudService';
import {
  ejecutarPruebaEstres,
  encolarMedicionOffline,
  generarValorNormalAleatorio,
  obtenerCantidadColaOffline,
  obtenerColaOfflineCifrada,
  procesarMedicion,
  resolverAlerta,
  sincronizarColaOffline,
  subscribeAlertas,
  subscribeMediciones,
} from '../services/iotService';
import type { UserProfile } from '../types/auth';
import type {
  Alerta,
  Instalacion,
  Medicion,
  Sensor,
  StressTestResult,
} from '../types/domain';

interface IotSimulatorProps {
  profile: UserProfile | null;
  userUid: string;
  userEmail: string;
}

export default function IotSimulator({ profile, userUid, userEmail }: IotSimulatorProps) {
  const actor: CrudActor = {
    uid: userUid,
    email: profile?.email ?? userEmail,
    rol: profile?.rol ?? 'Encargado de cultivo',
  };
  const canResolveAlerts =
    profile?.rol === 'Administrador' || profile?.rol === 'Encargado de cultivo';

  // Catálogos y telemetría en tiempo real
  const [instalaciones, setInstalaciones] = useState<Instalacion[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [mediciones, setMediciones] = useState<Medicion[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Selección de dispositivo / sensor
  const [selectedSistemaId, setSelectedSistemaId] = useState('');
  const [selectedSensorId, setSelectedSensorId] = useState('');
  const [manualValue, setManualValue] = useState('');

  // Contingencia Offline
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() =>
    obtenerCantidadColaOffline(),
  );
  const [offlineQueuePreview, setOfflineQueuePreview] = useState<string[]>(() =>
    obtenerColaOfflineCifrada(),
  );

  // Estados de ejecución y feedback
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [stressRunning, setStressRunning] = useState(false);
  const [stressProgress, setStressProgress] = useState<string | null>(null);
  const [stressResult, setStressResult] = useState<StressTestResult | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    const unsubInst = subscribeInstalaciones(setInstalaciones, setStreamError);
    const unsubSen = subscribeSensores(setSensores, setStreamError);
    const unsubMed = subscribeMediciones(15, setMediciones, setStreamError);
    const unsubAle = subscribeAlertas(15, setAlertas, setStreamError);

    return () => {
      unsubInst();
      unsubSen();
      unsubMed();
      unsubAle();
    };
  }, []);

  const effectiveSistemaId =
    instalaciones.some((inst) => inst.id_sistema === selectedSistemaId)
      ? selectedSistemaId
      : (instalaciones[0]?.id_sistema ?? '');

  const systemSensors = sensores.filter((s) => s.id_sistema === effectiveSistemaId);

  const selectedSensor =
    systemSensors.find((s) => s.id_sensor === selectedSensorId) ?? systemSensors[0] ?? null;

  function refreshOfflineState() {
    setOfflineQueueCount(obtenerCantidadColaOffline());
    setOfflineQueuePreview(obtenerColaOfflineCifrada());
  }

  async function dispatchReading(valor: number) {
    if (!selectedSensor) {
      setFeedback({
        type: 'error',
        text: 'Debes crear o seleccionar una instalación con al menos un sensor configurado.',
      });
      return;
    }
    if (!Number.isFinite(valor)) {
      setFeedback({ type: 'error', text: 'Ingresa un valor numérico válido.' });
      return;
    }

    setFeedback(null);
    setSending(true);
    try {
      if (offlineMode) {
        const count = await encolarMedicionOffline(selectedSensor, valor);
        refreshOfflineState();
        setFeedback({
          type: 'ok',
          text: `Modo Offline activo: medición (${valor} ${selectedSensor.unidad}) cifrada con AES-GCM y encolada en localStorage (Total en cola: ${count}).`,
        });
        return;
      }

      const result = await procesarMedicion({
        id_sensor: selectedSensor.id_sensor,
        valor,
        estado_conexion: 'En línea',
      });

      if (result.alertaCreada) {
        setFeedback({
          type: 'ok',
          text: `Medición ${valor} ${selectedSensor.unidad} firmada (SHA-256: ${result.medicion.hash_integridad.slice(0, 16)}...) y ALERTA ${result.alertaCreada.nivel} generada.`,
        });
      } else {
        setFeedback({
          type: 'ok',
          text: `Medición normal ${valor} ${selectedSensor.unidad} firmada (SHA-256: ${result.medicion.hash_integridad.slice(0, 16)}...) y registrada en Firestore.`,
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al procesar medición IoT.',
      });
    } finally {
      setSending(false);
    }
  }

  function handleSendNormal() {
    if (!selectedSensor) {
      setFeedback({ type: 'error', text: 'No hay sensor seleccionado.' });
      return;
    }
    const randomValue = generarValorNormalAleatorio(
      selectedSensor.umbral_min,
      selectedSensor.umbral_max,
    );
    void dispatchReading(randomValue);
  }

  function handleSendCritical() {
    if (!selectedSensor) {
      setFeedback({ type: 'error', text: 'No hay sensor seleccionado.' });
      return;
    }
    const span = Math.max(selectedSensor.umbral_max - selectedSensor.umbral_min, 1);
    const base = Math.abs(selectedSensor.umbral_max) > 0 ? Math.abs(selectedSensor.umbral_max) : span;
    // Fuerza un desvío > 25% sobre el umbral máximo para disparar nivel "Crítica"
    const criticalValue = Number((selectedSensor.umbral_max + base * 0.35 + 1).toFixed(2));
    void dispatchReading(criticalValue);
  }

  function handleManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = manualValue.trim();
    if (trimmed.length === 0) {
      setFeedback({ type: 'error', text: 'Ingresa un valor numérico manual.' });
      return;
    }
    const parsed = Number(trimmed);
    void dispatchReading(parsed);
  }

  async function handleSyncOffline() {
    setFeedback(null);
    setSyncing(true);
    try {
      const res = await sincronizarColaOffline(actor);
      refreshOfflineState();
      setFeedback({
        type: 'ok',
        text: `Sincronización offline completada: ${res.sincronizadas} mediciones enviadas, ${res.fallidas} fallidas, ${res.alertasGeneradas} alertas generadas.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al sincronizar cola offline.',
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleOfflineToggle(e: ChangeEvent<HTMLInputElement>) {
    const nextOffline = e.target.checked;
    setOfflineMode(nextOffline);
    setFeedback(null);

    if (!nextOffline && obtenerCantidadColaOffline() > 0) {
      await handleSyncOffline();
    }
  }

  async function handleStressTest() {
    if (!selectedSensor) {
      setFeedback({ type: 'error', text: 'Selecciona un sensor válido para la prueba de estrés.' });
      return;
    }
    if (offlineMode) {
      setFeedback({
        type: 'error',
        text: 'Desactiva el Modo Offline antes de ejecutar la prueba de estrés en Firestore.',
      });
      return;
    }

    setFeedback(null);
    setStressRunning(true);
    setStressProgress('0 / 50');
    try {
      const summary = await ejecutarPruebaEstres(selectedSensor, actor, (done, total) => {
        setStressProgress(`${done} / ${total}`);
      });
      setStressResult(summary);
      setFeedback({
        type: 'ok',
        text: `Prueba de estrés finalizada: ${summary.exitosas}/${summary.totalSolicitadas} mediciones en ${summary.tiempoTotalMs} ms.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error durante la prueba de estrés.',
      });
    } finally {
      setStressRunning(false);
      setStressProgress(null);
    }
  }

  async function handleResolveAlert(alerta: Alerta) {
    setFeedback(null);
    try {
      await resolverAlerta(alerta.id, alerta.id_sensor, actor);
      setFeedback({
        type: 'ok',
        text: `Alerta del sensor ${alerta.id_sensor} marcada como Resuelta.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'No tienes permisos para resolver alertas.',
      });
    }
  }

  return (
    <section id="simulador-iot">
      <h2>Simulador IoT AquaBrain, Integridad SHA-256, Alertas y Contingencia Offline</h2>

      <nav aria-label="Navegación Módulo 3">
        <a href="#iot-controles">Simulador y Contingencia</a> |{' '}
        <a href="#iot-estres">Prueba de Estrés (50)</a> |{' '}
        <a href="#iot-mediciones">Mediciones ({mediciones.length})</a> |{' '}
        <a href="#iot-alertas">Alertas ({alertas.length})</a>
      </nav>

      {streamError && <p role="alert">{streamError}</p>}
      {feedback && (
        <p role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.text}</p>
      )}

      {/* ==================== CONTROLES DE SIMULACIÓN ==================== */}
      <section id="iot-controles">
        <h3>Selección de Instalación / Sensor y Envío de Telemetría</h3>

        <form onSubmit={handleManualSubmit}>
          <fieldset>
            <legend>Dispositivo IoT Simulado</legend>
            <p>
              <label htmlFor="iot-select-instalacion">Instalación (id_sistema):</label>
              <br />
              <select
                id="iot-select-instalacion"
                value={effectiveSistemaId}
                onChange={(e) => {
                  setSelectedSistemaId(e.target.value);
                  setSelectedSensorId('');
                }}
                disabled={instalaciones.length === 0}
              >
                {instalaciones.length === 0 ? (
                  <option value="">-- Sin instalaciones disponibles --</option>
                ) : (
                  instalaciones.map((inst) => (
                    <option key={inst.id} value={inst.id_sistema}>
                      {inst.id_sistema} — {inst.nombre} ({inst.estado_conexion})
                    </option>
                  ))
                )}
              </select>
            </p>

            <p>
              <label htmlFor="iot-select-sensor">Sensor asociado (id_sensor):</label>
              <br />
              <select
                id="iot-select-sensor"
                value={selectedSensor?.id_sensor ?? ''}
                onChange={(e) => setSelectedSensorId(e.target.value)}
                disabled={systemSensors.length === 0}
              >
                {systemSensors.length === 0 ? (
                  <option value="">-- Sin sensores en esta instalación --</option>
                ) : (
                  systemSensors.map((sen) => (
                    <option key={sen.id} value={sen.id_sensor}>
                      {sen.id_sensor} ({sen.tipo_variable}) — {sen.id_dispositivo}
                    </option>
                  ))
                )}
              </select>
            </p>

            {selectedSensor && (
              <p>
                <strong>Umbrales configurados:</strong> {selectedSensor.umbral_min} -{' '}
                {selectedSensor.umbral_max} {selectedSensor.unidad} |{' '}
                <strong>Dispositivo:</strong> <code>{selectedSensor.id_dispositivo}</code> |{' '}
                <strong>Variable:</strong> {selectedSensor.tipo_variable}
              </p>
            )}

            <p>
              <button
                type="button"
                onClick={handleSendNormal}
                disabled={!selectedSensor || sending || stressRunning}
              >
                Enviar Medición Normal
              </button>{' '}
              <button
                type="button"
                onClick={handleSendCritical}
                disabled={!selectedSensor || sending || stressRunning}
              >
                Forzar Medición Fuera de Umbral
              </button>
            </p>

            <p>
              <label htmlFor="iot-manual-value">Valor manual para pruebas de borde:</label>
              <br />
              <input
                id="iot-manual-value"
                type="number"
                step="any"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Ej: 15.5"
              />{' '}
              <button type="submit" disabled={!selectedSensor || sending || stressRunning}>
                Enviar Valor Manual
              </button>
            </p>
          </fieldset>

          <fieldset>
            <legend>Contingencia de Pérdida de Conectividad (Cola Offline Cifrada AES-GCM)</legend>
            <p>
              <label htmlFor="iot-offline-toggle">
                <input
                  id="iot-offline-toggle"
                  type="checkbox"
                  checked={offlineMode}
                  onChange={(e) => void handleOfflineToggle(e)}
                  disabled={syncing || stressRunning}
                />{' '}
                Simular pérdida de conexión a Internet (Modo Offline Cifrado)
              </label>
            </p>
            <p>
              <strong>Estado actual:</strong>{' '}
              {offlineMode ? 'OFFLINE (Encolando en localStorage con AES-GCM)' : 'EN LÍNEA'} |{' '}
              <strong>Mediciones cifradas en cola:</strong> {offlineQueueCount}{' '}
              <button
                type="button"
                onClick={() => void handleSyncOffline()}
                disabled={offlineQueueCount === 0 || syncing || offlineMode}
              >
                {syncing ? 'Sincronizando...' : 'Forzar Sincronización'}
              </button>
            </p>
            {offlineQueuePreview.length > 0 && (
              <p>
                <strong>Último paquete cifrado en localStorage:</strong>{' '}
                <code>{offlineQueuePreview[offlineQueuePreview.length - 1].slice(0, 48)}...</code>
              </p>
            )}
          </fieldset>
        </form>
      </section>

      {/* ==================== PRUEBA DE ESTRÉS ==================== */}
      <section id="iot-estres">
        <h3>Prueba de Estrés / Carga Masiva</h3>
        <p>
          <button
            type="button"
            onClick={() => void handleStressTest()}
            disabled={!selectedSensor || stressRunning || sending || offlineMode}
          >
            {stressRunning
              ? `Ejecutando Prueba de Estrés (${stressProgress ?? ''})...`
              : 'Ejecutar Prueba de Estrés (50 mediciones)'}
          </button>
        </p>

        {stressResult && (
          <table>
            <thead>
              <tr>
                <th>Ejecutada en</th>
                <th>Total Solicitadas</th>
                <th>Exitosas</th>
                <th>Fallidas</th>
                <th>Alertas Generadas</th>
                <th>Tiempo Total (ms)</th>
                <th>Latencia Promedio (ms/reg)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{stressResult.ejecutadaEn}</td>
                <td>{stressResult.totalSolicitadas}</td>
                <td>{stressResult.exitosas}</td>
                <td>{stressResult.fallidas}</td>
                <td>{stressResult.alertasGeneradas}</td>
                <td>{stressResult.tiempoTotalMs}</td>
                <td>{stressResult.latenciaPromedioMs}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* ==================== MEDICIONES EN TIEMPO REAL ==================== */}
      <section id="iot-mediciones">
        <h3>Últimas Mediciones Registradas (Tiempo Real — Máx. 15)</h3>
        <table>
          <thead>
            <tr>
              <th>Timestamp (ISO 8601)</th>
              <th>Sistema</th>
              <th>Dispositivo</th>
              <th>Sensor</th>
              <th>Variable</th>
              <th>Valor</th>
              <th>Estado Conexión</th>
              <th>Alerta</th>
              <th>Hash Integridad (SHA-256)</th>
            </tr>
          </thead>
          <tbody>
            {mediciones.length === 0 ? (
              <tr>
                <td colSpan={9}>No hay mediciones registradas todavía.</td>
              </tr>
            ) : (
              mediciones.map((m) => (
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
                  <td>{m.alerta ? 'SÍ' : 'No'}</td>
                  <td>
                    <code>{m.hash_integridad}</code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ==================== ALERTAS EN TIEMPO REAL ==================== */}
      <section id="iot-alertas">
        <h3>Alertas Automáticas Generadas (Tiempo Real — Máx. 15)</h3>
        <table>
          <thead>
            <tr>
              <th>Timestamp (ISO 8601)</th>
              <th>Sistema</th>
              <th>Sensor</th>
              <th>Nivel</th>
              <th>Umbral Superado</th>
              <th>Valor</th>
              <th>Mensaje</th>
              <th>Estado</th>
              {canResolveAlerts && <th>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {alertas.length === 0 ? (
              <tr>
                <td colSpan={canResolveAlerts ? 9 : 8}>No hay alertas registradas.</td>
              </tr>
            ) : (
              alertas.map((a) => (
                <tr key={a.id}>
                  <td>{a.timestamp}</td>
                  <td>
                    <code>{a.id_sistema}</code>
                  </td>
                  <td>
                    <code>{a.id_sensor}</code>
                  </td>
                  <td>
                    <strong>{a.nivel}</strong>
                  </td>
                  <td>{a.umbral_superado}</td>
                  <td>{a.valor_registrado}</td>
                  <td>{a.mensaje}</td>
                  <td>{a.estado}</td>
                  {canResolveAlerts && (
                    <td>
                      {a.estado === 'Activa' ? (
                        <button type="button" onClick={() => void handleResolveAlert(a)}>
                          Marcar Resuelta
                        </button>
                      ) : (
                        'Resuelta'
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}
