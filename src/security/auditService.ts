import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { generateSHA256Hash, sanitizeInput } from './cryptoService';
import type { AuditAction, AuditLogEntry, UserRole } from '../types/auth';

export interface LogAuditEventInput {
  uid: string;
  email: string;
  rol: UserRole | 'No autenticado';
  accion: AuditAction;
  detalle: string;
}

export interface LogAuditEventResult {
  persistedToFirestore: boolean;
  entry: AuditLogEntry;
  note?: string;
}

const AUDIT_COLLECTION = 'audit_logs';
const MAX_LOCAL_EVENTS = 25;

let localAuditEvents: AuditLogEntry[] = [];
const localListeners = new Set<(events: AuditLogEntry[]) => void>();

function notifyLocalListeners(): void {
  const snapshot = [...localAuditEvents];
  localListeners.forEach((listener) => listener(snapshot));
}

function recordLocalAuditEvent(entry: AuditLogEntry): void {
  localAuditEvents = [entry, ...localAuditEvents].slice(0, MAX_LOCAL_EVENTS);
  notifyLocalListeners();
}

export function getLocalAuditEvents(): AuditLogEntry[] {
  return [...localAuditEvents];
}

export function subscribeLocalAuditEvents(
  listener: (events: AuditLogEntry[]) => void,
): () => void {
  localListeners.add(listener);
  listener([...localAuditEvents]);
  return () => {
    localListeners.delete(listener);
  };
}

/**
 * Registra un evento de auditoría inmutable con hash SHA-256 sobre `uid|accion|detalle|timestamp`.
 * Aplica reglas estrictas de Firestore (`request.auth != null`): si no existe sesión autenticada
 * (ej. LOGIN_FALLIDO) o Firestore deniega escritura, registra de forma controlada en memoria local.
 */
export async function logAuditEvent(
  input: LogAuditEventInput,
): Promise<LogAuditEventResult> {
  const cleanUid = sanitizeInput(input.uid) || 'NO_AUTENTICADO';
  const cleanEmail = sanitizeInput(input.email) || 'desconocido';
  const cleanAccion = sanitizeInput(input.accion) || 'EVENTO_DESCONOCIDO';
  const cleanDetalle = sanitizeInput(input.detalle) || 'Sin detalle';
  const timestamp = new Date().toISOString();

  const hashPayload = `${cleanUid}|${cleanAccion}|${cleanDetalle}|${timestamp}`;
  const hashEvento = await generateSHA256Hash(hashPayload);

  const entry: AuditLogEntry = {
    uid: cleanUid,
    email: cleanEmail,
    rol: input.rol,
    accion: cleanAccion,
    detalle: cleanDetalle,
    timestamp,
    hash_evento: hashEvento,
  };

  if (!db || !auth?.currentUser || auth.currentUser.uid !== cleanUid) {
    recordLocalAuditEvent({
      ...entry,
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    return {
      persistedToFirestore: false,
      entry,
      note: 'Evento registrado localmente: Firestore requiere sesión autenticada (regla estricta).',
    };
  }

  try {
    const docRef = await addDoc(collection(db, AUDIT_COLLECTION), entry);
    return {
      persistedToFirestore: true,
      entry: {
        ...entry,
        id: docRef.id,
      },
    };
  } catch (error) {
    recordLocalAuditEvent({
      ...entry,
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    const message = error instanceof Error ? error.message : 'Error al persistir en Firestore';
    return {
      persistedToFirestore: false,
      entry,
      note: `Persistencia diferida a buffer local por restricción de Firestore: ${message}`,
    };
  }
}

/**
 * Suscripción en tiempo real a los últimos N registros de `audit_logs`.
 */
export function subscribeAuditLogs(
  maxRecords: number,
  onData: (logs: AuditLogEntry[]) => void,
  onError: (errorMessage: string) => void,
): Unsubscribe {
  if (!db) {
    onError('Firestore no está configurado.');
    return () => {};
  }

  const auditQuery = query(
    collection(db, AUDIT_COLLECTION),
    orderBy('timestamp', 'desc'),
    limit(maxRecords),
  );

  return onSnapshot(
    auditQuery,
    (snapshot) => {
      const logs: AuditLogEntry[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          uid: String(data.uid ?? ''),
          email: String(data.email ?? ''),
          rol: (data.rol as AuditLogEntry['rol']) ?? 'No autenticado',
          accion: String(data.accion ?? ''),
          detalle: String(data.detalle ?? ''),
          timestamp: String(data.timestamp ?? ''),
          hash_evento: String(data.hash_evento ?? ''),
        };
      });
      onData(logs);
    },
    (error) => {
      onError(`Error al leer audit_logs en tiempo real: ${error.message}`);
    },
  );
}
