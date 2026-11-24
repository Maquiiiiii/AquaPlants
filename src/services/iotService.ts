import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAuditEvent } from '../security/auditService';
import {
  decryptData,
  encryptData,
  generateSHA256Hash,
  sanitizeInput,
} from '../security/cryptoService';
import type { CrudActor } from './crudService';
import {
  ESTADOS_ALERTA,
  ESTADOS_MEDICION,
  ESTADOS_SENSOR,
  NIVELES_ALERTA,
  TIPOS_VARIABLE,
  type Alerta,
  type EstadoAlerta,
  type EstadoMedicion,
  type EstadoSensor,
  type Medicion,
  type NivelAlerta,
  type Sensor,
  type StressTestResult,
  type TipoVariable,
} from '../types/domain';

const OFFLINE_QUEUE_STORAGE_KEY = 'aquaplants_offline_queue_v1';
const STRESS_TEST_TOTAL = 50;

interface OfflineMedicionPayload {
  id_sistema: string;
  id_dispositivo: string;
  id_sensor: string;
  valor: number;
  timestamp: string;
}

export interface ProcesarMedicionInput {
  id_sensor: string;
  valor: number;
  timestamp?: string;
  estado_conexion?: EstadoMedicion;
}

export interface ProcesarMedicionResult {
  medicion: Medicion;
  alertaCreada: Alerta | null;
}

export interface SincronizacionOfflineResult {
  sincronizadas: number;
  fallidas: number;
  alertasGeneradas: number;
}

function requireFirestore() {
  if (!db) {
    throw new Error('Cloud Firestore no está configurado.');
  }
  return db;
}

function isValidEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export function generarValorNormalAleatorio(umbralMin: number, umbralMax: number): number {
  return Number((umbralMin + Math.random() * (umbralMax - umbralMin)).toFixed(2));
}

/**
 * Calcula el hash SHA-256 de integridad sobre:
 * `${id_sistema}|${id_dispositivo}|${id_sensor}|${valor}|${timestamp}`
 */
export async function calcularHashIntegridad(
  idSistema: string,
  idDispositivo: string,
  idSensor: string,
  valor: number,
  timestamp: string,
): Promise<string> {
  const payload = `${idSistema}|${idDispositivo}|${idSensor}|${valor}|${timestamp}`;
  return generateSHA256Hash(payload);
}

async function fetchSensorByCode(idSensor: string): Promise<Sensor> {
  const firestore = requireFirestore();
  const cleanSensorCode = sanitizeInput(idSensor);
  if (!cleanSensorCode) {
    throw new Error('Debes seleccionar un sensor válido.');
  }

  const q = query(collection(firestore, 'sensores'), where('id_sensor', '==', cleanSensorCode));
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error(`El sensor "${cleanSensorCode}" no existe en Firestore.`);
  }

  const docSnap = snap.docs[0];
  const data = docSnap.data();
  const tipo: TipoVariable = isValidEnum(data.tipo_variable, TIPOS_VARIABLE)
    ? data.tipo_variable
    : 'caudal';
  const estado: EstadoSensor = isValidEnum(data.estado, ESTADOS_SENSOR)
    ? data.estado
    : 'Activo';

  return {
    id: docSnap.id,
    id_sensor: String(data.id_sensor ?? ''),
    id_sistema: String(data.id_sistema ?? ''),
    id_dispositivo: String(data.id_dispositivo ?? ''),
    tipo_variable: tipo,
    unidad: String(data.unidad ?? ''),
    umbral_min: Number(data.umbral_min ?? 0),
    umbral_max: Number(data.umbral_max ?? 0),
    estado,
  };
}

function evaluarUmbralSensor(
  sensor: Sensor,
  valor: number,
): { umbralSuperado: string; nivel: NivelAlerta; mensaje: string } | null {
  const belowMin = valor < sensor.umbral_min;
  const aboveMax = valor > sensor.umbral_max;

  if (!belowMin && !aboveMax) {
    return null;
  }

  const threshold = belowMin ? sensor.umbral_min : sensor.umbral_max;
  const span = Math.max(Math.abs(sensor.umbral_max - sensor.umbral_min), 1);
  const base = Math.abs(threshold) > 0 ? Math.abs(threshold) : span;
  const desvioRelativo = Math.abs(valor - threshold) / base;
  const nivel: NivelAlerta = desvioRelativo > 0.2 ? 'Crítica' : 'Advertencia';

  const umbralSuperado = belowMin
    ? `Mínimo (${sensor.umbral_min})`
    : `Máximo (${sensor.umbral_max})`;

  const direccion = belowMin ? 'debajo del mínimo' : 'encima del máximo';
  const mensaje = `Sensor ${sensor.id_sensor} (${sensor.tipo_variable}) registró ${valor} ${sensor.unidad}, por ${direccion} (${threshold} ${sensor.unidad}).`;

  return {
    umbralSuperado,
    nivel,
    mensaje,
  };
}

async function actualizarEstadoInstalacion(idSistema: string, timestamp: string): Promise<void> {
  const firestore = requireFirestore();
  try {
    const q = query(collection(firestore, 'instalaciones'), where('id_sistema', '==', idSistema));
    const snap = await getDocs(q);
    if (snap.empty) {
      return;
    }
    await updateDoc(doc(firestore, 'instalaciones', snap.docs[0].id), {
      ultima_comunicacion: timestamp,
      estado_conexion: 'En línea',
    });
  } catch {
    // Roles distintos a Administrador pueden no tener permiso de actualización sobre instalaciones;
    // la telemetría y alertas siguen registrándose normalmente.
  }
}

/**
 * Procesa una medición IoT: valida sensor y número finito, evalúa umbrales y crea alerta si aplica,
 * firma con SHA-256, persiste en `mediciones` y actualiza última comunicación en `instalaciones`.
 */
export async function procesarMedicion(
  input: ProcesarMedicionInput,
): Promise<ProcesarMedicionResult> {
  const firestore = requireFirestore();

  if (typeof input.valor !== 'number' || !Number.isFinite(input.valor)) {
    throw new Error('El valor de la medición debe ser un número finito válido.');
  }

  const sensor = await fetchSensorByCode(input.id_sensor);
  const timestamp = input.timestamp ?? new Date().toISOString();
  const estadoConexion: EstadoMedicion = input.estado_conexion ?? 'En línea';
  const evaluacion = evaluarUmbralSensor(sensor, input.valor);
  const alertaActiva = evaluacion !== null;

  const hashIntegridad = await calcularHashIntegridad(
    sensor.id_sistema,
    sensor.id_dispositivo,
    sensor.id_sensor,
    input.valor,
    timestamp,
  );

  const medicionPayload = {
    id_sistema: sensor.id_sistema,
    id_dispositivo: sensor.id_dispositivo,
    id_sensor: sensor.id_sensor,
    tipo_variable: sensor.tipo_variable,
    valor: input.valor,
    unidad: sensor.unidad,
    timestamp,
    estado_conexion: estadoConexion,
    alerta: alertaActiva,
    hash_integridad: hashIntegridad,
  };

  const medicionRef = await addDoc(collection(firestore, 'mediciones'), medicionPayload);

  let alertaCreada: Alerta | null = null;
  if (evaluacion) {
    const alertaPayload = {
      id_sistema: sensor.id_sistema,
      id_sensor: sensor.id_sensor,
      tipo_variable: sensor.tipo_variable,
      valor_registrado: input.valor,
      umbral_superado: evaluacion.umbralSuperado,
      mensaje: evaluacion.mensaje,
      nivel: evaluacion.nivel,
      estado: 'Activa' as const,
      timestamp,
    };
    const alertaRef = await addDoc(collection(firestore, 'alertas'), alertaPayload);
    alertaCreada = {
      id: alertaRef.id,
      ...alertaPayload,
    };
  }

  await actualizarEstadoInstalacion(sensor.id_sistema, timestamp);

  return {
    medicion: {
      id: medicionRef.id,
      ...medicionPayload,
    },
    alertaCreada,
  };
}

// ============================================================================
// COLA OFFLINE CIFRADA EN LOCALSTORAGE (AES-GCM)
// ============================================================================

function readEncryptedQueueFromStorage(): string[] {
  try {
    const raw = globalThis.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}

function writeEncryptedQueueToStorage(items: string[]): void {
  if (items.length === 0) {
    globalThis.localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
    return;
  }
  globalThis.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(items));
}

export function obtenerCantidadColaOffline(): number {
  return readEncryptedQueueFromStorage().length;
}

export function obtenerColaOfflineCifrada(): string[] {
  return readEncryptedQueueFromStorage();
}

export async function encolarMedicionOffline(
  sensor: Sensor,
  valor: number,
): Promise<number> {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new Error('El valor de la medición offline debe ser un número finito válido.');
  }

  const payload: OfflineMedicionPayload = {
    id_sistema: sensor.id_sistema,
    id_dispositivo: sensor.id_dispositivo,
    id_sensor: sensor.id_sensor,
    valor,
    timestamp: new Date().toISOString(),
  };

  const encrypted = await encryptData(JSON.stringify(payload));
  const currentQueue = readEncryptedQueueFromStorage();
  const updatedQueue = [...currentQueue, encrypted];
  writeEncryptedQueueToStorage(updatedQueue);

  return updatedQueue.length;
}

export async function sincronizarColaOffline(
  actor: CrudActor,
): Promise<SincronizacionOfflineResult> {
  const queue = readEncryptedQueueFromStorage();
  if (queue.length === 0) {
    return { sincronizadas: 0, fallidas: 0, alertasGeneradas: 0 };
  }

  let sincronizadas = 0;
  let fallidas = 0;
  let alertasGeneradas = 0;
  const remainingFailed: string[] = [];

  for (const cipherPayload of queue) {
    try {
      const decryptedJson = await decryptData(cipherPayload);
      const parsed = JSON.parse(decryptedJson) as Partial<OfflineMedicionPayload>;

      if (
        typeof parsed.id_sensor !== 'string' ||
        typeof parsed.valor !== 'number' ||
        !Number.isFinite(parsed.valor) ||
        typeof parsed.timestamp !== 'string'
      ) {
        throw new Error('Payload offline descifrado inválido.');
      }

      const result = await procesarMedicion({
        id_sensor: parsed.id_sensor,
        valor: parsed.valor,
        timestamp: parsed.timestamp,
        estado_conexion: 'Sincronizado Offline',
      });

      sincronizadas += 1;
      if (result.alertaCreada) {
        alertasGeneradas += 1;
      }
    } catch {
      fallidas += 1;
      remainingFailed.push(cipherPayload);
    }
  }

  writeEncryptedQueueToStorage(remainingFailed);

  await logAuditEvent({
    uid: actor.uid,
    email: actor.email,
    rol: actor.rol,
    accion: 'SINCRONIZACION_OFFLINE',
    detalle: `Sincronización offline completada: ${sincronizadas} exitosas, ${fallidas} fallidas, ${alertasGeneradas} alertas generadas`,
  });

  return { sincronizadas, fallidas, alertasGeneradas };
}

// ============================================================================
// PRUEBA DE ESTRÉS (50 MEDICIONES CONSECUTIVAS)
// ============================================================================

export async function ejecutarPruebaEstres(
  sensor: Sensor,
  actor: CrudActor,
  onProgress?: (completadas: number, total: number) => void,
): Promise<StressTestResult> {
  const startMs = performance.now();
  let exitosas = 0;
  let fallidas = 0;
  let alertasGeneradas = 0;

  const range = Math.max(sensor.umbral_max - sensor.umbral_min, 1);

  for (let i = 0; i < STRESS_TEST_TOTAL; i += 1) {
    // Cada 10ª medición simula un pico fuera de rango para ejercitar el motor de alertas
    const isOutOfRange = (i + 1) % 10 === 0;
    const simulatedRaw = isOutOfRange
      ? sensor.umbral_max + Math.max(range * 0.3, 1)
      : sensor.umbral_min + ((i % 9) + 1) * (range / 10);
    const valor = Number(simulatedRaw.toFixed(2));

    try {
      const result = await procesarMedicion({
        id_sensor: sensor.id_sensor,
        valor,
        estado_conexion: 'En línea',
      });
      exitosas += 1;
      if (result.alertaCreada) {
        alertasGeneradas += 1;
      }
    } catch {
      fallidas += 1;
    }

    onProgress?.(i + 1, STRESS_TEST_TOTAL);
  }

  const tiempoTotalMs = Number((performance.now() - startMs).toFixed(2));
  const latenciaPromedioMs = Number((tiempoTotalMs / STRESS_TEST_TOTAL).toFixed(2));

  await logAuditEvent({
    uid: actor.uid,
    email: actor.email,
    rol: actor.rol,
    accion: 'PRUEBA_ESTRES_IOT',
    detalle: `Prueba estrés (${STRESS_TEST_TOTAL} mediciones) en ${sensor.id_sensor}: ${exitosas} OK, ${fallidas} fallidas, ${alertasGeneradas} alertas, ${tiempoTotalMs} ms`,
  });

  return {
    totalSolicitadas: STRESS_TEST_TOTAL,
    exitosas,
    fallidas,
    alertasGeneradas,
    tiempoTotalMs,
    latenciaPromedioMs,
    ejecutadaEn: new Date().toISOString(),
  };
}

// ============================================================================
// SUSCRIPCIONES EN TIEMPO REAL Y GESTIÓN DE ALERTAS
// ============================================================================

export function subscribeMediciones(
  maxRecords: number | null,
  onData: (items: Medicion[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!db) {
    onError('Firestore no está configurado.');
    return () => {};
  }

  const q =
    maxRecords !== null && maxRecords > 0
      ? query(collection(db, 'mediciones'), orderBy('timestamp', 'desc'), limit(maxRecords))
      : query(collection(db, 'mediciones'), orderBy('timestamp', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Medicion[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const tipo: TipoVariable = isValidEnum(data.tipo_variable, TIPOS_VARIABLE)
          ? data.tipo_variable
          : 'caudal';
        const estado: EstadoMedicion = isValidEnum(data.estado_conexion, ESTADOS_MEDICION)
          ? data.estado_conexion
          : 'En línea';

        return {
          id: docSnap.id,
          id_sistema: String(data.id_sistema ?? ''),
          id_dispositivo: String(data.id_dispositivo ?? ''),
          id_sensor: String(data.id_sensor ?? ''),
          tipo_variable: tipo,
          valor: Number(data.valor ?? 0),
          unidad: String(data.unidad ?? ''),
          timestamp: String(data.timestamp ?? ''),
          estado_conexion: estado,
          alerta: Boolean(data.alerta),
          hash_integridad: String(data.hash_integridad ?? ''),
        };
      });
      onData(items);
    },
    (error) => {
      onError(`Error leyendo mediciones en tiempo real: ${error.message}`);
    },
  );
}

export function subscribeAlertas(
  maxRecords: number | null,
  onData: (items: Alerta[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!db) {
    onError('Firestore no está configurado.');
    return () => {};
  }

  const q =
    maxRecords !== null && maxRecords > 0
      ? query(collection(db, 'alertas'), orderBy('timestamp', 'desc'), limit(maxRecords))
      : query(collection(db, 'alertas'), orderBy('timestamp', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Alerta[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const nivel: NivelAlerta = isValidEnum(data.nivel, NIVELES_ALERTA)
          ? data.nivel
          : 'Advertencia';
        const estado: EstadoAlerta = isValidEnum(data.estado, ESTADOS_ALERTA)
          ? data.estado
          : 'Activa';

        return {
          id: docSnap.id,
          id_sistema: String(data.id_sistema ?? ''),
          id_sensor: String(data.id_sensor ?? ''),
          tipo_variable: String(data.tipo_variable ?? ''),
          valor_registrado: Number(data.valor_registrado ?? 0),
          umbral_superado: String(data.umbral_superado ?? ''),
          mensaje: String(data.mensaje ?? ''),
          nivel,
          estado,
          timestamp: String(data.timestamp ?? ''),
        };
      });
      onData(items);
    },
    (error) => {
      onError(`Error leyendo alertas en tiempo real: ${error.message}`);
    },
  );
}

export async function resolverAlerta(
  alertaId: string,
  idSensor: string,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  await updateDoc(doc(firestore, 'alertas', alertaId), {
    estado: 'Resuelta',
  });

  await logAuditEvent({
    uid: actor.uid,
    email: actor.email,
    rol: actor.rol,
    accion: 'RESOLVER_ALERTA',
    detalle: `Alerta ${alertaId} (sensor ${sanitizeInput(idSensor)}) marcada como Resuelta`,
  });
}

export async function reabrirAlerta(
  alertaId: string,
  idSensor: string,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  await updateDoc(doc(firestore, 'alertas', alertaId), {
    estado: 'Activa',
  });

  await logAuditEvent({
    uid: actor.uid,
    email: actor.email,
    rol: actor.rol,
    accion: 'REABRIR_ALERTA',
    detalle: `Alerta ${alertaId} (sensor ${sanitizeInput(idSensor)}) reabierta como Activa`,
  });
}
