import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gauge,
  RefreshCw,
  Send,
  WifiOff,
  Zap,
} from 'lucide-react';
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

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20';

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

  const effectiveSistemaId = instalaciones.some((inst) => inst.id_sistema === selectedSistemaId)
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
    const base =
      Math.abs(selectedSensor.umbral_max) > 0 ? Math.abs(selectedSensor.umbral_max) : span;
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
      setFeedback({
        type: 'error',
        text: 'Selecciona un sensor válido para la prueba de estrés.',
      });
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
    <section id="simulador-iot" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Simulador IoT AquaBrain, Integridad SHA-256 y Contingencia Offline
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Emisión de telemetría firmada, disparo automático de alertas, cola cifrada AES-GCM y
            pruebas de carga
          </p>
        </div>

        <nav aria-label="Navegación Módulo 3" className="flex flex-wrap gap-2">
          <a
            href="#iot-controles"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Simulador y Offline
          </a>
          <a
            href="#iot-estres"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Prueba de Estrés
          </a>
          <a
            href="#iot-mediciones"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Mediciones ({mediciones.length})
          </a>
          <a
            href="#iot-alertas"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Alertas ({alertas.length})
          </a>
        </nav>
      </div>

      {streamError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {streamError}
        </div>
      )}

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" strokeWidth={1.75} />
          ) : (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
              strokeWidth={1.75}
            />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* ==================== CONTROLES DE SIMULACIÓN + OFFLINE ==================== */}
      <section id="iot-controles" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleManualSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
        >
          <fieldset className="space-y-4">
            <legend className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Cpu className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
              Dispositivo IoT Simulado
            </legend>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="iot-select-instalacion"
                  className="mb-1 block text-xs font-medium text-slate-700"
                >
                  Instalación (id_sistema)
                </label>
                <select
                  id="iot-select-instalacion"
                  value={effectiveSistemaId}
                  onChange={(e) => {
                    setSelectedSistemaId(e.target.value);
                    setSelectedSensorId('');
                  }}
                  disabled={instalaciones.length === 0}
                  className={INPUT_CLASS}
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
              </div>

              <div>
                <label
                  htmlFor="iot-select-sensor"
                  className="mb-1 block text-xs font-medium text-slate-700"
                >
                  Sensor asociado (id_sensor)
                </label>
                <select
                  id="iot-select-sensor"
                  value={selectedSensor?.id_sensor ?? ''}
                  onChange={(e) => setSelectedSensorId(e.target.value)}
                  disabled={systemSensors.length === 0}
                  className={INPUT_CLASS}
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
              </div>
            </div>

            {selectedSensor && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 tabular-nums">
                <span className="font-semibold text-slate-900">Umbrales configurados:</span>{' '}
                {selectedSensor.umbral_min} - {selectedSensor.umbral_max} {selectedSensor.unidad}{' '}
                <span className="mx-1.5 text-slate-300">|</span>
                <span className="font-semibold text-slate-900">Dispositivo:</span>{' '}
                <code className="font-mono">{selectedSensor.id_dispositivo}</code>{' '}
                <span className="mx-1.5 text-slate-300">|</span>
                <span className="font-semibold text-slate-900">Variable:</span>{' '}
                {selectedSensor.tipo_variable}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSendNormal}
                disabled={!selectedSensor || sending || stressRunning}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                <Send className="h-4 w-4" strokeWidth={1.75} />
                Enviar Medición Normal
              </button>
              <button
                type="button"
                onClick={handleSendCritical}
                disabled={!selectedSensor || sending || stressRunning}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
                Forzar Medición Fuera de Umbral
              </button>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <label
                htmlFor="iot-manual-value"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                Valor manual para pruebas de borde
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="iot-manual-value"
                  type="number"
                  step="any"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder="Ej: 15.5"
                  className={INPUT_CLASS}
                />
                <button
                  type="submit"
                  disabled={!selectedSensor || sending || stressRunning}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  Enviar Valor Manual
                </button>
              </div>
            </div>
          </fieldset>
        </form>

        {/* Contingencia Offline + Estrés */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <fieldset className="space-y-4">
              <legend className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <WifiOff className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
                Contingencia de Pérdida de Conectividad (Cola Offline Cifrada AES-GCM)
              </legend>

              <label
                htmlFor="iot-offline-toggle"
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800"
              >
                <input
                  id="iot-offline-toggle"
                  type="checkbox"
                  checked={offlineMode}
                  onChange={(e) => void handleOfflineToggle(e)}
                  disabled={syncing || stressRunning}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                Simular pérdida de conexión a Internet (Modo Offline Cifrado)
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-slate-700">
                    <span className="font-medium text-slate-900">Estado actual:</span>{' '}
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                        offlineMode
                          ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
                          : 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                      }`}
                    >
                      {offlineMode
                        ? 'OFFLINE (Encolando en localStorage con AES-GCM)'
                        : 'EN LÍNEA'}
                    </span>
                  </p>
                  <p className="text-slate-700 tabular-nums">
                    <span className="font-medium text-slate-900">Mediciones cifradas en cola:</span>{' '}
                    {offlineQueueCount}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSyncOffline()}
                  disabled={offlineQueueCount === 0 || syncing || offlineMode}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
                  {syncing ? 'Sincronizando...' : 'Forzar Sincronización'}
                </button>
              </div>

              {offlineQueuePreview.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  <span className="font-semibold">Último paquete cifrado en localStorage:</span>{' '}
                  <code className="break-all font-mono">
                    {offlineQueuePreview[offlineQueuePreview.length - 1].slice(0, 48)}...
                  </code>
                </div>
              )}
            </fieldset>
          </div>

          <section
            id="iot-estres"
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Gauge className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
                  Prueba de Estrés / Carga Masiva
                </h3>
                <p className="text-xs text-slate-500">
                  Envía 50 mediciones consecutivas midiendo latencia y disparo de alertas
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleStressTest()}
                disabled={!selectedSensor || stressRunning || sending || offlineMode}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <Zap className="h-4 w-4" strokeWidth={1.75} />
                {stressRunning
                  ? `Ejecutando Prueba de Estrés (${stressProgress ?? ''})...`
                  : 'Ejecutar Prueba de Estrés (50 mediciones)'}
              </button>
            </div>

            {stressResult && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-600">
                      <th className="px-3 py-2">Ejecutada en</th>
                      <th className="px-3 py-2 text-right">Solicitadas</th>
                      <th className="px-3 py-2 text-right">Exitosas</th>
                      <th className="px-3 py-2 text-right">Fallidas</th>
                      <th className="px-3 py-2 text-right">Alertas</th>
                      <th className="px-3 py-2 text-right">Tiempo Total (ms)</th>
                      <th className="px-3 py-2 text-right">Latencia (ms/reg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 font-mono text-slate-600">
                        {stressResult.ejecutadaEn}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {stressResult.totalSolicitadas}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-700">
                        {stressResult.exitosas}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-red-700">
                        {stressResult.fallidas}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-amber-700">
                        {stressResult.alertasGeneradas}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {stressResult.tiempoTotalMs}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {stressResult.latenciaPromedioMs}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>

      {/* ==================== MEDICIONES EN TIEMPO REAL ==================== */}
      <section
        id="iot-mediciones"
        className="rounded-xl border border-slate-200 bg-white shadow-xs"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <Activity className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
          <h3 className="text-base font-semibold text-slate-900">
            Últimas Mediciones Registradas (Tiempo Real — Máx. 15)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2.5">Timestamp (ISO 8601)</th>
                <th className="px-3 py-2.5">Sistema</th>
                <th className="px-3 py-2.5">Dispositivo</th>
                <th className="px-3 py-2.5">Sensor</th>
                <th className="px-3 py-2.5">Variable</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5">Estado Conexión</th>
                <th className="px-3 py-2.5">Alerta</th>
                <th className="px-3 py-2.5">Hash Integridad (SHA-256)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mediciones.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                    No hay mediciones registradas todavía.
                  </td>
                </tr>
              ) : (
                mediciones.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-600 tabular-nums">
                      {m.timestamp}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700">
                      {m.id_sistema}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                      {m.id_dispositivo}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-900">
                      {m.id_sensor}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{m.tipo_variable}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-slate-900 tabular-nums">
                      {m.valor} {m.unidad}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          m.estado_conexion === 'En línea'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {m.estado_conexion}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          m.alerta
                            ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {m.alerta ? 'SÍ' : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                      {m.hash_integridad}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== ALERTAS EN TIEMPO REAL ==================== */}
      <section
        id="iot-alertas"
        className="rounded-xl border border-slate-200 bg-white shadow-xs"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <AlertTriangle className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
          <h3 className="text-base font-semibold text-slate-900">
            Alertas Automáticas Generadas (Tiempo Real — Máx. 15)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2.5">Timestamp (ISO 8601)</th>
                <th className="px-3 py-2.5">Sistema</th>
                <th className="px-3 py-2.5">Sensor</th>
                <th className="px-3 py-2.5">Nivel</th>
                <th className="px-3 py-2.5">Umbral Superado</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5">Mensaje</th>
                <th className="px-3 py-2.5">Estado</th>
                {canResolveAlerts && <th className="px-3 py-2.5 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alertas.length === 0 ? (
                <tr>
                  <td
                    colSpan={canResolveAlerts ? 9 : 8}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    No hay alertas registradas.
                  </td>
                </tr>
              ) : (
                alertas.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-600 tabular-nums">
                      {a.timestamp}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700">
                      {a.id_sistema}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700">
                      {a.id_sensor}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          a.nivel === 'Crítica'
                            ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
                        }`}
                      >
                        {a.nivel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{a.umbral_superado}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-900 tabular-nums">
                      {a.valor_registrado}
                    </td>
                    <td className="max-w-xs px-3 py-2.5 text-slate-600">{a.mensaje}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          a.estado === 'Activa'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {a.estado}
                      </span>
                    </td>
                    {canResolveAlerts && (
                      <td className="px-3 py-2.5 text-right">
                        {a.estado === 'Activa' ? (
                          <button
                            type="button"
                            onClick={() => void handleResolveAlert(a)}
                            className="rounded-md border border-emerald-700 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-50"
                          >
                            Marcar Resuelta
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">Resuelta</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
