import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileKey2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import {
  subscribeAuditLogs,
  subscribeLocalAuditEvents,
} from '../security/auditService';
import { subscribeInstalaciones } from '../services/crudService';
import { calcularHashIntegridad, subscribeMediciones } from '../services/iotService';
import type { AuditLogEntry, UserProfile } from '../types/auth';
import type { Instalacion, Medicion } from '../types/domain';
import { formatVariableLabel } from '../utils/formatters';
import CustomSelect from './CustomSelect';

interface SecurityAuditProps {
  profile: UserProfile | null;
}

const ACTION_LABELS: Record<string, string> = {
  REGISTRO_USUARIO: 'Registro de usuario',
  LOGIN_EXITOSO: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Intento de acceso fallido',
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

function formatEditorialDateTime(timestamp: string): string {
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) return timestamp;
  const day = String(parsedDate.getDate()).padStart(2, '0');
  const month = MONTH_NAMES_ES[parsedDate.getMonth()];
  const time = parsedDate.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} ${month} · ${time}`;
}

function formatAuditDetail(detalle: string): string {
  return detalle
    .replace(/\bconsumo_hidrico\b/gi, formatVariableLabel('consumo_hidrico'))
    .replace(/\bfotoperiodo\b/gi, formatVariableLabel('fotoperiodo'))
    .replace(/\bcaudal\b/gi, formatVariableLabel('caudal'))
    .replace(/\bnutrientes\b/gi, formatVariableLabel('nutrientes'));
}

const PAGE_SIZE = 10;

function getActionBadgeClass(accion: string): string {
  if (accion.includes('FALLID') || accion.includes('ELIMINAR')) {
    return 'bg-[#FDF7F7] text-[#9E2A2B]';
  }
  if (
    accion.includes('LOGIN') ||
    accion.includes('LOGOUT') ||
    accion.includes('INFORME') ||
    accion.includes('REABRIR')
  ) {
    return 'bg-[#F3E5D8] text-[#5C3419]';
  }
  return 'bg-[#E2EFE6] text-[#1B432C]';
}

export default function SecurityAudit({ profile }: SecurityAuditProps) {
  const [cloudLogs, setCloudLogs] = useState<AuditLogEntry[]>([]);
  const [localLogs, setLocalLogs] = useState<AuditLogEntry[]>([]);
  const [instalaciones, setInstalaciones] = useState<Instalacion[]>([]);
  const [mediciones, setMediciones] = useState<Medicion[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [integrityMap, setIntegrityMap] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    const unsubLog = subscribeAuditLogs(null, setCloudLogs, setStreamError);
    const unsubLocal = subscribeLocalAuditEvents(setLocalLogs);
    const unsubInst = subscribeInstalaciones(setInstalaciones, setStreamError);
    const unsubMed = subscribeMediciones(null, setMediciones, setStreamError);

    return () => {
      unsubLog();
      unsubLocal();
      unsubInst();
      unsubMed();
    };
  }, []);

  const { auditLogs, localOnlyIds } = useMemo(() => {
    const cloudIds = new Set(cloudLogs.map((l) => l.id));
    const cloudHashes = new Set(cloudLogs.map((l) => l.hash_evento));
    const merged: AuditLogEntry[] = [...cloudLogs];
    const localIds = new Set<string>();

    for (const local of localLogs) {
      const localKey = local.id ?? local.hash_evento;
      if ((!local.id || !cloudIds.has(local.id)) && !cloudHashes.has(local.hash_evento)) {
        merged.push(local);
        localIds.add(localKey);
      }
    }

    merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return { auditLogs: merged, localOnlyIds: localIds };
  }, [cloudLogs, localLogs]);

  useEffect(() => {
    let cancelled = false;
    async function verifyRecent() {
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
        setIntegrityMap(Object.fromEntries(results));
      }
    }
    void verifyRecent();
    return () => {
      cancelled = true;
    };
  }, [mediciones]);

  const verifiedCount = useMemo(
    () => mediciones.filter((m) => integrityMap[m.id] !== false).length,
    [mediciones, integrityMap],
  );
  const integrityPct =
    mediciones.length > 0 ? Math.round((verifiedCount / mediciones.length) * 100) : 100;
  const allIntact = verifiedCount === mediciones.length;

  const encryptedCount = useMemo(
    () =>
      instalaciones.filter(
        (i) => Boolean(i.ubicacion_cifrada) && Boolean(i.token_dispositivo_cifrado),
      ).length,
    [instalaciones],
  );

  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    for (const log of auditLogs) {
      set.add(log.accion);
    }
    return Array.from(set).sort();
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return auditLogs.filter((log) => {
      if (actionFilter !== 'ALL' && log.accion !== actionFilter) return false;
      if (!q) return true;
      const hay = `${log.email} ${log.rol} ${log.accion} ${log.detalle}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [auditLogs, actionFilter, searchQuery]);

  async function handleCopyHash(id: string, hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <section className="space-y-6">
      {/* Encabezado */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Auditoría y Seguridad Criptográfica
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Evidencia en vivo de cifrado AES-GCM 256-bit, firmas SHA-256 y bitácora inmutable de
          eventos
        </p>
      </div>

      {streamError && (
        <p role="alert" className="rounded-2xl border-0 bg-[#FDF7F7] px-4 py-3 text-sm text-[#9E2A2B]">
          {streamError}
        </p>
      )}

      {/* BLOQUE 1: 4 TARJETAS KPI TONALES */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-[#DCE7E1] p-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[#C4D6CC] px-3 py-1 text-xs font-semibold text-[#1D3B2C]">
              Bitácora inmutable
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C4D6CC] text-[#1D3B2C]">
              <FileKey2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-4 text-2xl font-bold text-[#1D3B2C] tabular-nums">{auditLogs.length}</p>
          <p className="mt-1 text-xs font-medium text-[#1D3B2C]/80">Eventos auditados</p>
        </div>

        <div className={`rounded-3xl p-5 ${allIntact ? 'bg-[#E2EFE6]' : 'bg-[#FDF7F7]'}`}>
          <div className="flex items-center justify-between">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                allIntact ? 'bg-[#C9E0D1] text-[#1B432C]' : 'bg-[#FAD5CE] text-[#5C1D16]'
              }`}
            >
              SHA-256 en vivo
            </span>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                allIntact ? 'bg-[#C9E0D1] text-[#1B432C]' : 'bg-[#FAD5CE] text-[#5C1D16]'
              }`}
            >
              {allIntact ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
            </span>
          </div>
          <p
            className={`mt-4 text-2xl font-bold tabular-nums ${
              allIntact ? 'text-[#1B432C]' : 'text-[#9E2A2B]'
            }`}
          >
            {integrityPct}% · {verifiedCount}/{mediciones.length}
          </p>
          <p
            className={`mt-1 text-xs font-medium ${
              allIntact ? 'text-[#1B432C]/80' : 'text-[#9E2A2B]/80'
            }`}
          >
            Integridad de mediciones
          </p>
        </div>

        <div className="rounded-3xl bg-[#D3DBC7]/70 p-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[#C0CCA9] px-3 py-1 text-xs font-semibold text-[#2F3E22]">
              PBKDF2 + AES-GCM
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C0CCA9] text-[#2F3E22]">
              <Lock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-4 text-2xl font-bold text-[#2F3E22] tabular-nums">
            {encryptedCount}/{instalaciones.length}
          </p>
          <p className="mt-1 text-xs font-medium text-[#2F3E22]/80">Cifrado en reposo 256-bit</p>
        </div>

        <div className="rounded-3xl bg-[#F3E5D8] p-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[#E6CEB8] px-3 py-1 text-xs font-semibold text-[#5C3419]">
              RBAC Activo
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E6CEB8] text-[#5C3419]">
              <UserCheck className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-4 truncate text-base font-bold text-[#5C3419]">
            {profile?.rol ?? 'Sin rol'}
          </p>
          <p className="mt-1 truncate text-xs font-medium text-[#5C3419]/80">
            {profile?.email ?? 'Sesión verificada'}
          </p>
        </div>
      </div>

      {/* BLOQUE 2: VERIFICACIÓN CRIPTOGRÁFICA EN VIVO (2 COLUMNAS) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Izquierda: Evidencia AES-GCM */}
        <div className="space-y-4 rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#E2EFE6] text-[#1B432C]">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Evidencia de Cifrado en Reposo (AES-GCM)
              </h3>
              <p className="text-xs text-slate-500">
                Datos sensibles cifrados en Firestore y descifrados en memoria
              </p>
            </div>
          </div>

          {instalaciones.length === 0 ? (
            <p className="text-sm text-slate-500">No hay instalaciones registradas.</p>
          ) : (
            <div className="custom-scrollbar max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {instalaciones.map((inst) => (
                <div key={inst.id} className="space-y-2 rounded-2xl bg-[#F4F6F5] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 tabular-nums">
                      {inst.id_sistema} · {inst.nombre}
                    </p>
                    <span className="rounded-full bg-[#E2EFE6] px-2.5 py-0.5 text-[11px] font-semibold text-[#1B432C]">
                      Descifrado en memoria
                    </span>
                  </div>
                  <p className="text-xs text-slate-700">
                    <span className="font-medium text-slate-500">Ubicación legible:</span>{' '}
                    {inst.ubicacion_descifrada ?? 'No disponible'}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 tabular-nums">
                    <span className="font-medium text-slate-600">Ubicación cifrada:</span>{' '}
                    {inst.ubicacion_cifrada}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 tabular-nums">
                    <span className="font-medium text-slate-600">Token cifrado:</span>{' '}
                    {inst.token_dispositivo_cifrado}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Derecha: Verificador de Firmas SHA-256 */}
        <div className="space-y-4 rounded-3xl border-0 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#DCE7E1] text-[#1D3B2C]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Verificador de Firmas de Telemetría (SHA-256)
              </h3>
              <p className="text-xs text-slate-500">
                Recálculo en tiempo real de huellas de 64 caracteres hexadecimales
              </p>
            </div>
          </div>

          {mediciones.length === 0 ? (
            <p className="text-sm text-slate-500">No hay lecturas registradas.</p>
          ) : (
            <div className="custom-scrollbar max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
              {mediciones.map((m) => {
                const isValid = integrityMap[m.id] !== false;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-[#F4F6F5] px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 tabular-nums">
                        {m.id_sensor} · {m.valor} {m.unidad === 'Lmin' ? 'L/min' : m.unidad}
                      </p>
                      <p
                        title={m.hash_integridad}
                        className="mt-0.5 truncate text-xs text-slate-500 tabular-nums"
                      >
                        {m.hash_integridad}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          isValid
                            ? 'bg-[#E2EFE6] text-[#1B432C]'
                            : 'bg-[#FDF7F7] text-[#9E2A2B]'
                        }`}
                      >
                        {isValid ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Íntegra · SHA-256 válido
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="h-3 w-3" />
                            Alteración detectada
                          </>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopyHash(m.id, m.hash_integridad)}
                        aria-label="Copiar firma SHA-256"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 transition-colors hover:text-[#00753A]"
                      >
                        {copiedId === m.id ? (
                          <Check className="h-3.5 w-3.5 text-[#00753A]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* BLOQUE 3: BITÁCORA INMUTABLE DE AUDITORÍA (audit_logs) */}
      <div className="rounded-3xl border-0 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col justify-between gap-3 px-6 py-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Bitácora Inmutable de Auditoría ({filteredLogs.length})
            </h3>
            <p className="text-xs text-slate-500">
              Registro cronológico protegido contra modificaciones o eliminaciones
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="w-full sm:w-64">
              <CustomSelect
                value={actionFilter}
                onChange={(val) => {
                  setActionFilter(val);
                  setCurrentPage(1);
                }}
                options={[
                  { value: 'ALL', label: 'Todas las acciones' },
                  ...uniqueActions.map((acc) => ({
                    value: acc,
                    label: `${ACTION_LABELS[acc] ?? acc} · ${acc}`,
                  })),
                ]}
              />
            </div>

            <div className="flex w-full items-center gap-2 rounded-2xl border-0 bg-[#F4F6F5] px-3.5 py-2 transition-all focus-within:bg-white focus-within:shadow-xs sm:w-64">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar usuario o detalle..."
                aria-label="Buscar en bitácora"
                className="w-full border-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[28%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                <th className="px-5 py-3">Fecha y hora</th>
                <th className="px-5 py-3">Acción</th>
                <th className="px-5 py-3">Usuario / Rol</th>
                <th className="px-5 py-3">Detalle</th>
                <th className="px-5 py-3 text-right">Firma SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                    No hay eventos registrados para los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredLogs
                  .slice(
                    (Math.min(currentPage, Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))) -
                      1) *
                      PAGE_SIZE,
                    Math.min(currentPage, Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))) *
                      PAGE_SIZE,
                  )
                  .map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td
                      title={log.timestamp}
                      className="truncate whitespace-nowrap px-5 py-3 text-xs text-slate-600 tabular-nums"
                    >
                      {formatEditorialDateTime(log.timestamp)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getActionBadgeClass(
                            log.accion,
                          )}`}
                        >
                          {ACTION_LABELS[log.accion] ?? log.accion}
                        </span>
                        {localOnlyIds.has(log.id ?? log.hash_evento) && (
                          <span className="inline-flex rounded-full bg-[#F3E5D8] px-2 py-0.5 text-[10px] font-semibold text-[#5C3419]">
                            Buffer local
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="truncate px-5 py-3 text-xs text-slate-700">
                      <span className="font-medium text-slate-900">{log.email}</span>
                      <span className="block text-[11px] text-slate-500">{log.rol}</span>
                    </td>
                    <td
                      className="truncate px-5 py-3 text-xs text-slate-600"
                      title={formatAuditDetail(log.detalle)}
                    >
                      {formatAuditDetail(log.detalle)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        title={log.hash_evento}
                        className="inline-block max-w-[7.5rem] truncate text-xs text-slate-500 tabular-nums"
                      >
                        {log.hash_evento}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredLogs.length > 0 && (() => {
          const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
          const safePage = Math.min(currentPage, totalPages);
          return (
            <div className="flex flex-col items-center justify-between gap-3 px-6 py-3.5 text-xs text-slate-600 sm:flex-row">
              <p className="tabular-nums">
                Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filteredLogs.length)} de {filteredLogs.length}{' '}
                eventos
              </p>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-full border-0 bg-[#F4F6F5] px-3.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>
                <span className="px-1 font-medium tabular-nums">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-full border-0 bg-[#F4F6F5] px-3.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
