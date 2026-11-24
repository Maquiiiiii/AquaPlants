import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAuditEvent } from '../security/auditService';
import { decryptData, encryptData, sanitizeInput } from '../security/cryptoService';
import type { UserRole } from '../types/auth';
import {
  ESTADOS_CONEXION,
  ESTADOS_CULTIVO,
  ESTADOS_SENSOR,
  TIPOS_VARIABLE,
  type Cultivo,
  type CultivoInput,
  type EstadoConexion,
  type EstadoCultivo,
  type EstadoSensor,
  type Instalacion,
  type InstalacionInput,
  type Sensor,
  type SensorInput,
  type TipoVariable,
} from '../types/domain';

export interface CrudActor {
  uid: string;
  email: string;
  rol: UserRole;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function requireFirestore() {
  if (!db) {
    throw new Error('Cloud Firestore no está configurado.');
  }
  return db;
}

function requireText(rawValue: string, fieldLabel: string): string {
  const clean = sanitizeInput(rawValue);
  if (clean.length === 0) {
    throw new Error(`El campo "${fieldLabel}" es obligatorio y no puede quedar vacío.`);
  }
  return clean;
}

function isValidEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function generateDeviceToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `AQB-${hex}`;
}

async function assertUniqueCode(
  collectionName: 'instalaciones' | 'cultivos' | 'sensores',
  fieldName: 'id_sistema' | 'id_cultivo' | 'id_sensor',
  codeValue: string,
  excludeDocId?: string,
): Promise<void> {
  const firestore = requireFirestore();
  const q = query(collection(firestore, collectionName), where(fieldName, '==', codeValue));
  const snapshot = await getDocs(q);
  const hasDuplicate = snapshot.docs.some((docSnap) => docSnap.id !== excludeDocId);
  if (hasDuplicate) {
    throw new Error(`El código "${codeValue}" ya existe en ${collectionName}.`);
  }
}

async function assertSystemExists(idSistema: string): Promise<void> {
  const firestore = requireFirestore();
  const q = query(
    collection(firestore, 'instalaciones'),
    where('id_sistema', '==', idSistema),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    throw new Error(
      `La instalación con id_sistema "${idSistema}" no existe en Firestore.`,
    );
  }
}

function mapFirestoreWriteError(error: unknown): Error {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (code === 'permission-denied') {
      return new Error(
        'Permiso denegado por Firestore Rules: solo el rol "Administrador" puede escribir.',
      );
    }
  }
  return error instanceof Error ? error : new Error('Error inesperado en operación CRUD.');
}

// ============================================================================
// INSTALACIONES
// ============================================================================

export function subscribeInstalaciones(
  onData: (items: Instalacion[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!db) {
    onError('Firestore no está configurado.');
    return () => {};
  }

  let seq = 0;
  const q = query(collection(db, 'instalaciones'), orderBy('id_sistema', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const currentSeq = ++seq;
      void (async () => {
        try {
          const items = await Promise.all(
            snapshot.docs.map(async (docSnap): Promise<Instalacion> => {
              const data = docSnap.data();
              const ubicacionCifrada = String(data.ubicacion_cifrada ?? '');
              const ubicacionDescifrada = ubicacionCifrada
                ? await decryptData(ubicacionCifrada)
                : '';

              const estado: EstadoConexion = isValidEnum(
                data.estado_conexion,
                ESTADOS_CONEXION,
              )
                ? data.estado_conexion
                : 'Desconectado';

              return {
                id: docSnap.id,
                id_sistema: String(data.id_sistema ?? ''),
                nombre: String(data.nombre ?? ''),
                ubicacion_cifrada: ubicacionCifrada,
                ubicacion_descifrada: ubicacionDescifrada,
                token_dispositivo_cifrado: String(data.token_dispositivo_cifrado ?? ''),
                estado_conexion: estado,
                ultima_comunicacion: String(data.ultima_comunicacion ?? ''),
              };
            }),
          );

          if (currentSeq === seq) {
            onData(items);
          }
        } catch (error) {
          onError(
            error instanceof Error
              ? error.message
              : 'Error al descifrar instalaciones.',
          );
        }
      })();
    },
    (error) => {
      onError(`Error leyendo instalaciones: ${error.message}`);
    },
  );
}

export async function createInstalacion(
  input: InstalacionInput,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const idSistema = requireText(input.id_sistema, 'ID Sistema');
  const nombre = requireText(input.nombre, 'Nombre');
  const ubicacion = requireText(input.ubicacion, 'Ubicación');

  if (!isValidEnum(input.estado_conexion, ESTADOS_CONEXION)) {
    throw new Error('Estado de conexión inválido.');
  }

  await assertUniqueCode('instalaciones', 'id_sistema', idSistema);

  const ubicacionCifrada = await encryptData(ubicacion);
  const rawToken = generateDeviceToken();
  const tokenCifrado = await encryptData(rawToken);
  const ultimaComunicacion = new Date().toISOString();

  try {
    await addDoc(collection(firestore, 'instalaciones'), {
      id_sistema: idSistema,
      nombre,
      ubicacion_cifrada: ubicacionCifrada,
      token_dispositivo_cifrado: tokenCifrado,
      estado_conexion: input.estado_conexion,
      ultima_comunicacion: ultimaComunicacion,
    });

    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'CREAR_INSTALACION',
      detalle: `Instalación ${idSistema} (${nombre}) creada con ubicación y token cifrados AES-GCM`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}

export async function updateInstalacion(
  docId: string,
  input: InstalacionInput,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const idSistema = requireText(input.id_sistema, 'ID Sistema');
  const nombre = requireText(input.nombre, 'Nombre');
  const ubicacion = requireText(input.ubicacion, 'Ubicación');

  if (!isValidEnum(input.estado_conexion, ESTADOS_CONEXION)) {
    throw new Error('Estado de conexión inválido.');
  }

  await assertUniqueCode('instalaciones', 'id_sistema', idSistema, docId);

  const docRef = doc(firestore, 'instalaciones', docId);
  const existingSnap = await getDoc(docRef);
  if (!existingSnap.exists()) {
    throw new Error('La instalación que intentas actualizar no existe.');
  }

  const existingToken = String(existingSnap.data().token_dispositivo_cifrado ?? '');
  const tokenCifrado = existingToken || (await encryptData(generateDeviceToken()));
  const ubicacionCifrada = await encryptData(ubicacion);
  const ultimaComunicacion = new Date().toISOString();

  try {
    await updateDoc(docRef, {
      id_sistema: idSistema,
      nombre,
      ubicacion_cifrada: ubicacionCifrada,
      token_dispositivo_cifrado: tokenCifrado,
      estado_conexion: input.estado_conexion,
      ultima_comunicacion: ultimaComunicacion,
    });

    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'ACTUALIZAR_INSTALACION',
      detalle: `Instalación ${idSistema} (${nombre}) actualizada`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}

export async function deleteInstalacion(
  docId: string,
  idSistema: string,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const cleanId = sanitizeInput(idSistema) || docId;

  try {
    await deleteDoc(doc(firestore, 'instalaciones', docId));
    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'ELIMINAR_INSTALACION',
      detalle: `Instalación ${cleanId} eliminada`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}

// ============================================================================
// CULTIVOS
// ============================================================================

export function subscribeCultivos(
  onData: (items: Cultivo[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!db) {
    onError('Firestore no está configurado.');
    return () => {};
  }

  const q = query(collection(db, 'cultivos'), orderBy('id_cultivo', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Cultivo[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const estado: EstadoCultivo = isValidEnum(data.estado, ESTADOS_CULTIVO)
          ? data.estado
          : 'Inactivo';
        return {
          id: docSnap.id,
          id_cultivo: String(data.id_cultivo ?? ''),
          id_sistema: String(data.id_sistema ?? ''),
          nombre_planta: String(data.nombre_planta ?? ''),
          fecha_siembra: String(data.fecha_siembra ?? ''),
          estado,
        };
      });
      onData(items);
    },
    (error) => {
      onError(`Error leyendo cultivos: ${error.message}`);
    },
  );
}

export async function createCultivo(
  input: CultivoInput,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const idCultivo = requireText(input.id_cultivo, 'ID Cultivo');
  const idSistema = requireText(input.id_sistema, 'ID Sistema');
  const nombrePlanta = requireText(input.nombre_planta, 'Nombre de Planta');
  const fechaSiembra = requireText(input.fecha_siembra, 'Fecha de Siembra');

  if (!DATE_REGEX.test(fechaSiembra)) {
    throw new Error('La fecha de siembra debe tener formato YYYY-MM-DD.');
  }
  if (!isValidEnum(input.estado, ESTADOS_CULTIVO)) {
    throw new Error('Estado de cultivo inválido.');
  }

  await assertUniqueCode('cultivos', 'id_cultivo', idCultivo);
  await assertSystemExists(idSistema);

  try {
    await addDoc(collection(firestore, 'cultivos'), {
      id_cultivo: idCultivo,
      id_sistema: idSistema,
      nombre_planta: nombrePlanta,
      fecha_siembra: fechaSiembra,
      estado: input.estado,
    });

    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'CREAR_CULTIVO',
      detalle: `Cultivo ${idCultivo} (${nombrePlanta}) asociado a ${idSistema}`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}

export async function updateCultivo(
  docId: string,
  input: CultivoInput,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const idCultivo = requireText(input.id_cultivo, 'ID Cultivo');
  const idSistema = requireText(input.id_sistema, 'ID Sistema');
  const nombrePlanta = requireText(input.nombre_planta, 'Nombre de Planta');
  const fechaSiembra = requireText(input.fecha_siembra, 'Fecha de Siembra');

  if (!DATE_REGEX.test(fechaSiembra)) {
    throw new Error('La fecha de siembra debe tener formato YYYY-MM-DD.');
  }
  if (!isValidEnum(input.estado, ESTADOS_CULTIVO)) {
    throw new Error('Estado de cultivo inválido.');
  }

  await assertUniqueCode('cultivos', 'id_cultivo', idCultivo, docId);
  await assertSystemExists(idSistema);

  try {
    await updateDoc(doc(firestore, 'cultivos', docId), {
      id_cultivo: idCultivo,
      id_sistema: idSistema,
      nombre_planta: nombrePlanta,
      fecha_siembra: fechaSiembra,
      estado: input.estado,
    });

    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'ACTUALIZAR_CULTIVO',
      detalle: `Cultivo ${idCultivo} (${nombrePlanta}) actualizado`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}

export async function deleteCultivo(
  docId: string,
  idCultivo: string,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const cleanId = sanitizeInput(idCultivo) || docId;

  try {
    await deleteDoc(doc(firestore, 'cultivos', docId));
    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'ELIMINAR_CULTIVO',
      detalle: `Cultivo ${cleanId} eliminado`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}

// ============================================================================
// SENSORES
// ============================================================================

export function subscribeSensores(
  onData: (items: Sensor[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!db) {
    onError('Firestore no está configurado.');
    return () => {};
  }

  const q = query(collection(db, 'sensores'), orderBy('id_sensor', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Sensor[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const tipo: TipoVariable = isValidEnum(data.tipo_variable, TIPOS_VARIABLE)
          ? data.tipo_variable
          : 'caudal';
        const estado: EstadoSensor = isValidEnum(data.estado, ESTADOS_SENSOR)
          ? data.estado
          : 'Inactivo';
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
      });
      onData(items);
    },
    (error) => {
      onError(`Error leyendo sensores: ${error.message}`);
    },
  );
}

function validateSensorThresholds(umbralMin: number, umbralMax: number): void {
  if (!Number.isFinite(umbralMin) || !Number.isFinite(umbralMax)) {
    throw new Error('Los valores de umbral mínimo y máximo deben ser números válidos.');
  }
  if (umbralMin >= umbralMax) {
    throw new Error('El umbral mínimo debe ser estrictamente menor que el umbral máximo.');
  }
}

export async function createSensor(
  input: SensorInput,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const idSensor = requireText(input.id_sensor, 'ID Sensor');
  const idSistema = requireText(input.id_sistema, 'ID Sistema');
  const idDispositivo = requireText(input.id_dispositivo, 'ID Dispositivo');
  const unidad = requireText(input.unidad, 'Unidad');

  if (!isValidEnum(input.tipo_variable, TIPOS_VARIABLE)) {
    throw new Error('Tipo de variable de sensor inválido.');
  }
  if (!isValidEnum(input.estado, ESTADOS_SENSOR)) {
    throw new Error('Estado de sensor inválido.');
  }
  validateSensorThresholds(input.umbral_min, input.umbral_max);

  await assertUniqueCode('sensores', 'id_sensor', idSensor);
  await assertSystemExists(idSistema);

  try {
    await addDoc(collection(firestore, 'sensores'), {
      id_sensor: idSensor,
      id_sistema: idSistema,
      id_dispositivo: idDispositivo,
      tipo_variable: input.tipo_variable,
      unidad,
      umbral_min: input.umbral_min,
      umbral_max: input.umbral_max,
      estado: input.estado,
    });

    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'CREAR_SENSOR',
      detalle: `Sensor ${idSensor} (${input.tipo_variable}) asociado a ${idSistema}`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}

export async function updateSensor(
  docId: string,
  input: SensorInput,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const idSensor = requireText(input.id_sensor, 'ID Sensor');
  const idSistema = requireText(input.id_sistema, 'ID Sistema');
  const idDispositivo = requireText(input.id_dispositivo, 'ID Dispositivo');
  const unidad = requireText(input.unidad, 'Unidad');

  if (!isValidEnum(input.tipo_variable, TIPOS_VARIABLE)) {
    throw new Error('Tipo de variable de sensor inválido.');
  }
  if (!isValidEnum(input.estado, ESTADOS_SENSOR)) {
    throw new Error('Estado de sensor inválido.');
  }
  validateSensorThresholds(input.umbral_min, input.umbral_max);

  await assertUniqueCode('sensores', 'id_sensor', idSensor, docId);
  await assertSystemExists(idSistema);

  try {
    await updateDoc(doc(firestore, 'sensores', docId), {
      id_sensor: idSensor,
      id_sistema: idSistema,
      id_dispositivo: idDispositivo,
      tipo_variable: input.tipo_variable,
      unidad,
      umbral_min: input.umbral_min,
      umbral_max: input.umbral_max,
      estado: input.estado,
    });

    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'ACTUALIZAR_SENSOR',
      detalle: `Sensor ${idSensor} (${input.tipo_variable}) actualizado`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}

export async function deleteSensor(
  docId: string,
  idSensor: string,
  actor: CrudActor,
): Promise<void> {
  const firestore = requireFirestore();
  const cleanId = sanitizeInput(idSensor) || docId;

  try {
    await deleteDoc(doc(firestore, 'sensores', docId));
    await logAuditEvent({
      uid: actor.uid,
      email: actor.email,
      rol: actor.rol,
      accion: 'ELIMINAR_SENSOR',
      detalle: `Sensor ${cleanId} eliminado`,
    });
  } catch (error) {
    throw mapFirestoreWriteError(error);
  }
}
