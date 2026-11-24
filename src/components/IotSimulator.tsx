import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Database,
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
  procesarMedicion,
  reabrirAlerta,
  resolverAlerta,
  sincronizarColaOffline,
  subscribeAlertas,
  subscribeMediciones,
} from '../services/iotService';
import { cargarDatosDemostracion, type SeedResult } from '../services/seedService';
import type { UserProfile } from '../types/auth';
import type {
  Alerta,
  Instalacion,
  Medicion,
  Sensor,
  StressTestResult,
} from '../types/domain';
import { formatVariableLabel } from '../utils/formatters';
import CustomSelect from './CustomSelect';

interface IotSimulatorProps {
  profile: UserProfile | null;
  userUid: string;
  userEmail: string;
}

interface PendingReadingItem {
  id: string;
  id_sensor: string;
  valor: number;
  unidad: string;
  timestamp: string;
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

function formatUnit(raw: string): string {
  if (raw === 'Lmin') return 'L/min';
  if (raw === 'horas') return 'h';
  return raw;
}

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

export default function IotSimulator({ profile, userUid, userEmail }: IotSimulatorProps) {
  const isAdmin = profile?.rol === 'Administrador';
  const canResolveAlerts =
    profile?.rol === 'Administrador' || profile?.rol === 'Encargado de cultivo';

  const actor: CrudActor = {
    uid: userUid,
    email: profile?.email ?? userEmail,
    rol: profile?.rol ?? 'Encargado de cultivo',
  };

  // Datos en tiempo real
  const [instalaciones, setInstalaciones] = useState<Instalacion[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [mediciones, setMediciones] = useState<Medicion[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Selectores de instalación y sensor
  const [selectedSistema, setSelectedSistema] = useState('');
  const [selectedSensorId, setSelectedSensorId] = useState('');
  const [manualValue, setManualValue] = useState('');

  // Estados de envío y feedback
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'warn' | 'error';
    text: string;
  } | null>(null);

  // Respaldo local (simulación de corte de internet)
  const [offlineMode, setOfflineMode] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => obtenerCantidadColaOffline());
  const [pendingPreview, setPendingPreview] = useState<PendingReadingItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Prueba de carga (50 lecturas)
  const [stressBusy, setStressBusy] = useState(false);
  const [stressResult, setStressResult] = useState<StressTestResult | null>(null);

  // Datos de demostración
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);

  useEffect(() => {
    const unsubInst = subscribeInstalaciones(setInstalaciones, setStreamError);
    const unsubSen = subscribeSensores(setSensores, setStreamError);
    const unsubMed = subscribeMediciones(null, setMediciones, setStreamError);
    const unsubAle = subscribeAlertas(null, setAlertas, setStreamError);

    return () => {
      unsubInst();
      unsubSen();
      unsubMed();
      unsubAle();
    };
  }, []);

  const activeSistema =
    selectedSistema && instalaciones.some((i) => i.id_sistema === selectedSistema)
      ? selectedSistema
      : (instalaciones[0]?.id_sistema ?? '');

  const sensoresDeInstalacion = sensores.filter((s) => s.id_sistema === activeSistema);

  const selectedSensor =
    sensoresDeInstalacion.find((s) => s.id_sensor === selectedSensorId) ??
    sensoresDeInstalacion[0] ??
    null;

  async function handleSeedDemo() {
    setSeedBusy(true);
    setFeedback(null);
    try {
      const result = await cargarDatosDemostracion(actor);
      setSeedResult(result);
      setFeedback({
        type: 'ok',
        text: `Datos de demostración cargados (${result.instalacionesCreadas} instalaciones, ${result.sensoresCreados} sensores y ${result.medicionesCreadas} lecturas).`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'No se pudieron cargar los datos de prueba.',
      });
    } finally {
      setSeedBusy(false);
    }
  }

  async function dispatchReading(valor: number, isOutOfRangeLabel = false) {
    if (!selectedSensor) {
      setFeedback({
        type: 'warn',
        text: 'Selecciona una instalación con al menos un sensor activo.',
      });
      return;
    }

    setSending(true);
    setFeedback(null);
    const nowIso = new Date().toISOString();

    try {
      if (offlineMode) {
        await encolarMedicionOffline(selectedSensor, valor);
        setPendingCount(obtenerCantidadColaOffline());
        setPendingPreview((prev) => [
          {
            id: `${Date.now()}-${prev.length}`,
            id_sensor: selectedSensor.id_sensor,
            valor,
            unidad: selectedSensor.unidad,
            timestamp: nowIso,
          },
          ...prev,
        ]);
        setFeedback({
          type: 'warn',
          text: `Lectura (${valor} ${formatUnit(selectedSensor.unidad)}) guardada en respaldo local sin conexión.`,
        });
      } else {
        const res = await procesarMedicion({
          id_sensor: selectedSensor.id_sensor,
          valor,
          timestamp: nowIso,
          estado_conexion: 'En línea',
        });
        setFeedback({
          type: res.alertaCreada || isOutOfRangeLabel ? 'warn' : 'ok',
          text: res.alertaCreada
            ? `Lectura registrada (${valor} ${formatUnit(selectedSensor.unidad)}). Se generó una alerta por valor fuera de rango.`
            : `Lectura normal registrada (${valor} ${formatUnit(selectedSensor.unidad)}).`,
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al registrar la lectura.',
      });
    } finally {
      setSending(false);
    }
  }

  function handleSendNormal() {
    if (!selectedSensor) return;
    const val = generarValorNormalAleatorio(selectedSensor.umbral_min, selectedSensor.umbral_max);
    void dispatchReading(val, false);
  }

  function handleSendOutOfRange() {
    if (!selectedSensor) return;
    const span = Math.max(1, selectedSensor.umbral_max - selectedSensor.umbral_min);
    const val = Number((selectedSensor.umbral_max + span * 0.35).toFixed(2));
    void dispatchReading(val, true);
  }

  function handleManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const num = Number(manualValue);
    if (!manualValue.trim() || Number.isNaN(num)) {
      setFeedback({ type: 'warn', text: 'Ingresa un valor numérico válido.' });
      return;
    }
    void dispatchReading(num);
    setManualValue('');
  }

  async function handleSyncQueue() {
    if (syncing) return;
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await sincronizarColaOffline(actor);
      setPendingCount(obtenerCantidadColaOffline());
      if (result.sincronizadas > 0) {
        setPendingPreview([]);
      }
      setFeedback({
        type: 'ok',
        text:
          result.sincronizadas > 0
            ? `Se sincronizaron ${result.sincronizadas} lecturas pendientes con la nube.`
            : 'No había lecturas pendientes por sincronizar.',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al sincronizar lecturas pendientes.',
      });
    } finally {
      setSyncing(false);
    }
  }

  function handleToggleOffline() {
    const next = !offlineMode;
    setOfflineMode(next);
    if (!next && obtenerCantidadColaOffline() > 0) {
      void handleSyncQueue();
    }
  }

  async function handleStressTest() {
    if (!selectedSensor) {
      setFeedback({
        type: 'warn',
        text: 'Selecciona una instalación con un sensor para ejecutar la prueba de carga.',
      });
      return;
    }
    setStressBusy(true);
    setFeedback(null);
    try {
      const result = await ejecutarPruebaEstres(selectedSensor, actor);
      setStressResult(result);
      setFeedback({
        type: 'ok',
        text: `Prueba de carga completada: ${result.exitosas} lecturas procesadas en ${result.tiempoTotalMs} ms.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error ejecutando la prueba de carga.',
      });
    } finally {
      setStressBusy(false);
    }
  }

  async function handleToggleAlerta(alerta: Alerta) {
    setResolvingAlertId(alerta.id);
    try {
      if (alerta.estado === 'Activa') {
        await resolverAlerta(alerta.id, alerta.id_sensor, actor);
      } else {
        await reabrirAlerta(alerta.id, alerta.id_sensor, actor);
      }
    } finally {
      setResolvingAlertId(null);
    }
  }

  const recentMediciones = mediciones.slice(0, 15);
  const recentAlertas = alertas.slice(0, 8);

  return (
    <section className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Simulador de Campo</h2>
          <p className="mt-1 text-sm text-slate-600">
            Envía lecturas de prueba, valida alertas tempranas y comprueba el respaldo ante cortes
            de red
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            disabled={seedBusy}
            onClick={() => void handleSeedDemo()}
            className="inline-flex items-center gap-2 self-start rounded-2xl border-0 bg-[#F4F6F5] px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C] disabled:opacity-50 sm:self-auto"
          >
            <Database className="h-4 w-4 text-[#00753A]" />
            {seedBusy ? 'Cargando datos...' : 'Cargar Datos de Demostración AquaPlants'}
          </button>
        )}
      </div>

      {streamError && (
        <p role="alert" className="rounded-2xl border-0 bg-[#FDF7F7] px-4 py-3 text-sm text-[#9E2A2B]">
          {streamError}
        </p>
      )}

      {seedResult && !feedback && (
        <p className="rounded-2xl border-0 bg-[#E2EFE6] px-4 py-3 text-xs font-medium text-[#1B432C]">
          Datos de demostración listos: {seedResult.instalacionesCreadas} instalaciones y{' '}
          {seedResult.sensoresCreados} sensores disponibles.
        </p>
      )}

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2.5 rounded-2xl border-0 px-4 py-3 text-sm font-medium ${
            feedback.type === 'error'
              ? 'bg-[#FDF7F7] text-[#9E2A2B]'
              : feedback.type === 'warn'
                ? 'bg-[#F3E5D8] text-[#5C3419]'
                : 'bg-[#E2EFE6] text-[#1B432C]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Bloques 1 y 2: Envío de lecturas + Contingencia y Prueba de carga */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* BLOQUE 1: PANEL DE ENVÍO DE LECTURAS (IZQUIERDA) */}
        <div className="space-y-5 rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)] lg:col-span-7">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#E2EFE6] text-[#1B432C]">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Envío de Lecturas</h3>
              <p className="text-xs text-slate-500">
                Selecciona una instalación y un sensor para simular mediciones en campo
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Instalación
              </label>
              <CustomSelect
                value={activeSistema}
                placeholder="Selecciona instalación"
                onChange={(val) => {
                  setSelectedSistema(val);
                  setSelectedSensorId('');
                }}
                options={instalaciones.map((inst) => ({
                  value: inst.id_sistema,
                  code: inst.id_sistema,
                  label: inst.nombre,
                }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Sensor</label>
              {sensoresDeInstalacion.length === 0 ? (
                <div className="rounded-2xl bg-[#F4F6F5] px-4 py-2.5 text-xs text-slate-500">
                  Esta instalación aún no tiene sensores asignados.
                </div>
              ) : (
                <CustomSelect
                  value={selectedSensor?.id_sensor ?? ''}
                  placeholder="Selecciona sensor"
                  onChange={setSelectedSensorId}
                  options={sensoresDeInstalacion.map((sen) => ({
                    value: sen.id_sensor,
                    code: sen.id_sensor,
                    label: formatVariableLabel(sen.tipo_variable),
                  }))}
                />
              )}
            </div>
          </div>

          {/* Barra resumen tonal del sensor seleccionado */}
          {selectedSensor && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F4F6F5] px-4 py-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Cpu className="h-4 w-4 text-[#00753A]" />
                <span className="font-semibold text-slate-900">
                  {formatVariableLabel(selectedSensor.tipo_variable)}
                </span>
                <span className="text-slate-400">·</span>
                <span>Unidad: {formatUnit(selectedSensor.unidad)}</span>
              </div>
              <span className="rounded-full bg-[#E2EFE6] px-3 py-1 font-medium text-[#1B432C] tabular-nums">
                Rango seguro: {selectedSensor.umbral_min} – {selectedSensor.umbral_max}{' '}
                {formatUnit(selectedSensor.unidad)}
              </span>
            </div>
          )}

          {/* Botones de acción rápida */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!selectedSensor || sending}
              onClick={handleSendNormal}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border-0 bg-[#00753A] px-4 py-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#00612F] disabled:opacity-40"
            >
              <Activity className="h-4 w-4" />
              Enviar lectura normal
            </button>
            <button
              type="button"
              disabled={!selectedSensor || sending}
              onClick={handleSendOutOfRange}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border-0 bg-[#FDF7F7] px-4 py-3 text-sm font-semibold text-[#9E2A2B] transition-colors hover:bg-[#F9E2E2] disabled:opacity-40"
            >
              <AlertTriangle className="h-4 w-4" />
              Simular lectura fuera de rango
            </button>
          </div>

          {/* Formulario compacto de valor manual */}
          <form onSubmit={handleManualSubmit} className="space-y-2 pt-1">
            <label htmlFor="manual-val" className="block text-xs font-semibold text-slate-700">
              Valor manual{' '}
              {selectedSensor ? `(${formatUnit(selectedSensor.unidad)})` : ''}
            </label>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <div className="relative flex-1">
                <input
                  id="manual-val"
                  type="number"
                  step="any"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder={
                    selectedSensor
                      ? `Ej. ${selectedSensor.umbral_min}`
                      : 'Ingresa un valor numérico'
                  }
                  className="w-full rounded-2xl border-0 bg-[#F4F6F5] px-4 py-2.5 pr-14 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-[#00753A]/20"
                />
                {selectedSensor && (
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-medium text-slate-400">
                    {formatUnit(selectedSensor.unidad)}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={!selectedSensor || sending}
                className="rounded-2xl border-0 bg-[#E2EFE6] px-5 py-2.5 text-sm font-semibold text-[#1B432C] transition-colors hover:bg-[#D2E6D8] disabled:opacity-40"
              >
                Registrar valor
              </button>
            </div>
          </form>
        </div>

        {/* BLOQUE 2: CONTINGENCIA Y PRUEBA DE CARGA (DERECHA) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Respaldo ante pérdida de conexión */}
          <div className="space-y-4 rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                    offlineMode
                      ? 'bg-[#F3E5D8] text-[#5C3419]'
                      : 'bg-[#F4F6F5] text-slate-600'
                  }`}
                >
                  <WifiOff className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Respaldo ante pérdida de conexión
                  </h3>
                  <p className="text-xs text-slate-500">
                    Simular corte de internet (respaldo local)
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={offlineMode}
                aria-label="Simular corte de internet (respaldo local)"
                onClick={handleToggleOffline}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors ${
                  offlineMode ? 'bg-[#E6A608]' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                    offlineMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {(offlineMode || pendingCount > 0) && (
              <div className="space-y-3 rounded-2xl bg-[#F3E5D8]/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#5C3419] tabular-nums">
                    {pendingCount}{' '}
                    {pendingCount === 1
                      ? 'lectura en espera de sincronización'
                      : 'lecturas en espera de sincronización'}
                  </span>
                  <button
                    type="button"
                    disabled={pendingCount === 0 || syncing}
                    onClick={() => void handleSyncQueue()}
                    className="inline-flex items-center gap-1.5 rounded-full border-0 bg-white px-3 py-1 text-xs font-semibold text-[#5C3419] shadow-2xs transition-colors hover:bg-[#F3E5D8] disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                  </button>
                </div>

                {pendingPreview.length > 0 && (
                  <div className="max-h-28 space-y-1.5 overflow-y-auto">
                    {pendingPreview.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-1.5 text-xs text-slate-700 tabular-nums"
                      >
                        <span className="font-medium text-slate-900">{item.id_sensor}</span>
                        <span>
                          {item.valor} {formatUnit(item.unidad)}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {formatEditorialDateTime(item.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Prueba de carga operativa (50 lecturas) */}
          <div className="space-y-4 rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#DCE7E1] text-[#1D3B2C]">
                <Gauge className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Prueba de carga operativa (50 lecturas)
                </h3>
                <p className="text-xs text-slate-500">
                  Evalúa la respuesta del sistema enviando 50 lecturas consecutivas, incluyendo 5
                  fuera de rango
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={!selectedSensor || stressBusy}
              onClick={() => void handleStressTest()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-0 bg-[#F4F6F5] px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C] disabled:opacity-40"
            >
              <Zap className="h-4 w-4 text-[#00753A]" />
              {stressBusy ? 'Ejecutando prueba...' : 'Ejecutar prueba (50 lecturas)'}
            </button>

            {stressResult && (
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="rounded-2xl bg-[#DCE7E1] p-3">
                  <p className="text-[11px] font-medium text-[#1D3B2C]/80">Lecturas procesadas</p>
                  <p className="mt-0.5 text-lg font-bold text-[#1D3B2C] tabular-nums">
                    {stressResult.exitosas}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#E2EFE6] p-3">
                  <p className="text-[11px] font-medium text-[#1B432C]/80">Tiempo total</p>
                  <p className="mt-0.5 text-lg font-bold text-[#1B432C] tabular-nums">
                    {stressResult.tiempoTotalMs} ms
                  </p>
                </div>
                <div className="rounded-2xl bg-[#D3DBC7]/70 p-3">
                  <p className="text-[11px] font-medium text-[#2F3E22]/80">Promedio por lectura</p>
                  <p className="mt-0.5 text-lg font-bold text-[#2F3E22] tabular-nums">
                    {stressResult.latenciaPromedioMs} ms
                  </p>
                </div>
                <div className="rounded-2xl bg-[#F3E5D8] p-3">
                  <p className="text-[11px] font-medium text-[#5C3419]/80">Alertas generadas</p>
                  <p className="mt-0.5 text-lg font-bold text-[#5C3419] tabular-nums">
                    {stressResult.alertasGeneradas}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BLOQUE 3: MONITOR RECIENTE EN VIVO (INFERIOR) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Últimas 15 lecturas recibidas */}
        <div className="rounded-3xl border-0 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)] lg:col-span-7">
          <div className="px-6 py-4">
            <h3 className="text-base font-semibold text-slate-900">
              Últimas 15 lecturas recibidas
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[38%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                  <th className="px-5 py-3">Fecha y hora</th>
                  <th className="px-5 py-3">Sensor</th>
                  <th className="px-5 py-3">Valor</th>
                  <th className="px-5 py-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentMediciones.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                      Aún no hay lecturas registradas.
                    </td>
                  </tr>
                ) : (
                  recentMediciones.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="truncate whitespace-nowrap px-5 py-3 text-xs text-slate-600 tabular-nums">
                        {formatEditorialDateTime(m.timestamp)}
                      </td>
                      <td className="truncate whitespace-nowrap px-5 py-3 font-sans font-medium text-slate-800 tabular-nums">
                        {m.id_sensor}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-900 tabular-nums">
                        {m.valor} {formatUnit(m.unidad)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 pr-4 text-right">
                        {m.estado_conexion === 'Sincronizado Offline' ? (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-[#F3E5D8] px-2.5 py-0.5 text-xs font-medium text-[#5C3419]">
                            Sincronizado sin conexión
                          </span>
                        ) : m.alerta ? (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-[#FDF7F7] px-2.5 py-0.5 text-xs font-medium text-[#9E2A2B]">
                            Fuera de rango
                          </span>
                        ) : (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-[#E2EFE6] px-2.5 py-0.5 text-xs font-medium text-[#1B432C]">
                            Dentro de rango
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Últimas alertas generadas */}
        <div className="rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)] lg:col-span-5">
          <h3 className="text-base font-semibold text-slate-900">Últimas alertas generadas</h3>

          {recentAlertas.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No hay alertas recientes.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {recentAlertas.map((alerta) => {
                const isActive = alerta.estado === 'Activa';
                return (
                  <div
                    key={alerta.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl p-3.5 ${
                      isActive ? 'bg-[#FDF7F7]' : 'bg-[#F4F6F5]/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900 tabular-nums">
                        {alerta.id_sensor} · {formatVariableLabel(alerta.tipo_variable)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-600 tabular-nums">
                        {alerta.mensaje
                          .replace(/\bconsumo_hidrico\b/gi, formatVariableLabel('consumo_hidrico'))
                          .replace(/\bcaudal\b/gi, formatVariableLabel('caudal'))
                          .replace(/\bnutrientes\b/gi, formatVariableLabel('nutrientes'))
                          .replace(/\bfotoperiodo\b/gi, formatVariableLabel('fotoperiodo'))}
                      </p>
                    </div>
                    {canResolveAlerts ? (
                      isActive ? (
                        <button
                          type="button"
                          disabled={resolvingAlertId === alerta.id}
                          onClick={() => void handleToggleAlerta(alerta)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border-0 bg-white px-3 py-1.5 text-xs font-semibold text-[#00753A] shadow-2xs transition-colors hover:bg-[#00753A] hover:text-white disabled:opacity-40"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Resolver
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={resolvingAlertId === alerta.id}
                          onClick={() => void handleToggleAlerta(alerta)}
                          title="Clic para reabrir alerta"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border-0 bg-[#E2EFE6] px-3 py-1.5 text-xs font-semibold text-[#1B432C] transition-colors hover:bg-[#F3E5D8] hover:text-[#5C3419] disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resuelta
                        </button>
                      )
                    ) : (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                        {alerta.estado}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
