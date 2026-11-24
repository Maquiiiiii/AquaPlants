import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Lock,
  Pencil,
  Plus,
  Sprout,
  Trash2,
  Warehouse,
} from 'lucide-react';
import {
  createCultivo,
  createInstalacion,
  createSensor,
  deleteCultivo,
  deleteInstalacion,
  deleteSensor,
  subscribeCultivos,
  subscribeInstalaciones,
  subscribeSensores,
  updateCultivo,
  updateInstalacion,
  updateSensor,
  type CrudActor,
} from '../services/crudService';
import type { UserProfile } from '../types/auth';
import {
  ESTADOS_CONEXION,
  ESTADOS_CULTIVO,
  ESTADOS_SENSOR,
  TIPOS_VARIABLE,
  UNIDAD_POR_VARIABLE,
  type Cultivo,
  type EstadoConexion,
  type EstadoCultivo,
  type EstadoSensor,
  type Instalacion,
  type Sensor,
  type TipoVariable,
} from '../types/domain';

interface CrudManagerProps {
  profile: UserProfile | null;
  userUid: string;
  userEmail: string;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20';

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-slate-700';

export default function CrudManager({ profile, userUid, userEmail }: CrudManagerProps) {
  const isAdmin = profile?.rol === 'Administrador';
  const actor: CrudActor = {
    uid: userUid,
    email: profile?.email ?? userEmail,
    rol: profile?.rol ?? 'Encargado de cultivo',
  };

  // Datos en tiempo real
  const [instalaciones, setInstalaciones] = useState<Instalacion[]>([]);
  const [cultivos, setCultivos] = useState<Cultivo[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  // Estado formulario Instalaciones
  const [editingInstId, setEditingInstId] = useState<string | null>(null);
  const [instIdSistema, setInstIdSistema] = useState('');
  const [instNombre, setInstNombre] = useState('');
  const [instUbicacion, setInstUbicacion] = useState('');
  const [instEstado, setInstEstado] = useState<EstadoConexion>('En línea');
  const [instBusy, setInstBusy] = useState(false);
  const [instFeedback, setInstFeedback] = useState<{ type: 'error' | 'ok'; text: string } | null>(
    null,
  );

  // Estado formulario Cultivos
  const [editingCultId, setEditingCultId] = useState<string | null>(null);
  const [cultIdCultivo, setCultIdCultivo] = useState('');
  const [cultIdSistema, setCultIdSistema] = useState('');
  const [cultNombrePlanta, setCultNombrePlanta] = useState('');
  const [cultFechaSiembra, setCultFechaSiembra] = useState('');
  const [cultEstado, setCultEstado] = useState<EstadoCultivo>('Activo');
  const [cultBusy, setCultBusy] = useState(false);
  const [cultFeedback, setCultFeedback] = useState<{ type: 'error' | 'ok'; text: string } | null>(
    null,
  );

  // Estado formulario Sensores
  const [editingSenId, setEditingSenId] = useState<string | null>(null);
  const [senIdSensor, setSenIdSensor] = useState('');
  const [senIdSistema, setSenIdSistema] = useState('');
  const [senIdDispositivo, setSenIdDispositivo] = useState('');
  const [senTipoVariable, setSenTipoVariable] = useState<TipoVariable>('caudal');
  const [senUnidad, setSenUnidad] = useState(UNIDAD_POR_VARIABLE.caudal);
  const [senUmbralMin, setSenUmbralMin] = useState('1');
  const [senUmbralMax, setSenUmbralMax] = useState('10');
  const [senEstado, setSenEstado] = useState<EstadoSensor>('Activo');
  const [senBusy, setSenBusy] = useState(false);
  const [senFeedback, setSenFeedback] = useState<{ type: 'error' | 'ok'; text: string } | null>(
    null,
  );

  useEffect(() => {
    const unsubInst = subscribeInstalaciones(
      (items) => {
        setInstalaciones(items);
        setSubscriptionError(null);
      },
      (msg) => setSubscriptionError(msg),
    );
    const unsubCult = subscribeCultivos(
      (items) => {
        setCultivos(items);
        setSubscriptionError(null);
      },
      (msg) => setSubscriptionError(msg),
    );
    const unsubSen = subscribeSensores(
      (items) => {
        setSensores(items);
        setSubscriptionError(null);
      },
      (msg) => setSubscriptionError(msg),
    );

    return () => {
      unsubInst();
      unsubCult();
      unsubSen();
    };
  }, []);

  function resetInstForm() {
    setEditingInstId(null);
    setInstIdSistema('');
    setInstNombre('');
    setInstUbicacion('');
    setInstEstado('En línea');
  }

  function resetCultForm() {
    setEditingCultId(null);
    setCultIdCultivo('');
    setCultIdSistema('');
    setCultNombrePlanta('');
    setCultFechaSiembra('');
    setCultEstado('Activo');
  }

  function resetSenForm() {
    setEditingSenId(null);
    setSenIdSensor('');
    setSenIdSistema('');
    setSenIdDispositivo('');
    setSenTipoVariable('caudal');
    setSenUnidad(UNIDAD_POR_VARIABLE.caudal);
    setSenUmbralMin('1');
    setSenUmbralMax('10');
    setSenEstado('Activo');
  }

  async function handleInstSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInstFeedback(null);
    setInstBusy(true);
    try {
      const payload = {
        id_sistema: instIdSistema,
        nombre: instNombre,
        ubicacion: instUbicacion,
        estado_conexion: instEstado,
      };
      if (editingInstId) {
        await updateInstalacion(editingInstId, payload, actor);
        setInstFeedback({ type: 'ok', text: 'Instalación actualizada correctamente.' });
      } else {
        await createInstalacion(payload, actor);
        setInstFeedback({
          type: 'ok',
          text: 'Instalación creada con ubicación y token cifrados AES-GCM.',
        });
      }
      resetInstForm();
    } catch (error) {
      setInstFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al guardar instalación.',
      });
    } finally {
      setInstBusy(false);
    }
  }

  async function handleInstDelete(item: Instalacion) {
    if (!window.confirm(`¿Eliminar la instalación "${item.id_sistema} - ${item.nombre}"?`)) {
      return;
    }
    setInstFeedback(null);
    try {
      await deleteInstalacion(item.id, item.id_sistema, actor);
      if (editingInstId === item.id) {
        resetInstForm();
      }
      setInstFeedback({ type: 'ok', text: `Instalación ${item.id_sistema} eliminada.` });
    } catch (error) {
      setInstFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al eliminar instalación.',
      });
    }
  }

  async function handleCultSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCultFeedback(null);
    setCultBusy(true);
    try {
      const payload = {
        id_cultivo: cultIdCultivo,
        id_sistema: cultIdSistema,
        nombre_planta: cultNombrePlanta,
        fecha_siembra: cultFechaSiembra,
        estado: cultEstado,
      };
      if (editingCultId) {
        await updateCultivo(editingCultId, payload, actor);
        setCultFeedback({ type: 'ok', text: 'Cultivo actualizado correctamente.' });
      } else {
        await createCultivo(payload, actor);
        setCultFeedback({ type: 'ok', text: 'Cultivo registrado correctamente.' });
      }
      resetCultForm();
    } catch (error) {
      setCultFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al guardar cultivo.',
      });
    } finally {
      setCultBusy(false);
    }
  }

  async function handleCultDelete(item: Cultivo) {
    if (!window.confirm(`¿Eliminar el cultivo "${item.id_cultivo} - ${item.nombre_planta}"?`)) {
      return;
    }
    setCultFeedback(null);
    try {
      await deleteCultivo(item.id, item.id_cultivo, actor);
      if (editingCultId === item.id) {
        resetCultForm();
      }
      setCultFeedback({ type: 'ok', text: `Cultivo ${item.id_cultivo} eliminado.` });
    } catch (error) {
      setCultFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al eliminar cultivo.',
      });
    }
  }

  async function handleSenSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSenFeedback(null);
    setSenBusy(true);
    try {
      const parsedMin = Number(senUmbralMin);
      const parsedMax = Number(senUmbralMax);
      const payload = {
        id_sensor: senIdSensor,
        id_sistema: senIdSistema,
        id_dispositivo: senIdDispositivo,
        tipo_variable: senTipoVariable,
        unidad: senUnidad,
        umbral_min: parsedMin,
        umbral_max: parsedMax,
        estado: senEstado,
      };
      if (editingSenId) {
        await updateSensor(editingSenId, payload, actor);
        setSenFeedback({ type: 'ok', text: 'Sensor actualizado correctamente.' });
      } else {
        await createSensor(payload, actor);
        setSenFeedback({ type: 'ok', text: 'Sensor registrado correctamente.' });
      }
      resetSenForm();
    } catch (error) {
      setSenFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al guardar sensor.',
      });
    } finally {
      setSenBusy(false);
    }
  }

  async function handleSenDelete(item: Sensor) {
    if (!window.confirm(`¿Eliminar el sensor "${item.id_sensor} (${item.tipo_variable})"?`)) {
      return;
    }
    setSenFeedback(null);
    try {
      await deleteSensor(item.id, item.id_sensor, actor);
      if (editingSenId === item.id) {
        resetSenForm();
      }
      setSenFeedback({ type: 'ok', text: `Sensor ${item.id_sensor} eliminado.` });
    } catch (error) {
      setSenFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al eliminar sensor.',
      });
    }
  }

  function renderFeedback(fb: { type: 'error' | 'ok'; text: string } | null) {
    if (!fb) return null;
    return (
      <div
        role={fb.type === 'error' ? 'alert' : 'status'}
        className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${
          fb.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        {fb.type === 'error' ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" strokeWidth={1.75} />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
        )}
        <span>{fb.text}</span>
      </div>
    );
  }

  return (
    <section id="gestion-crud" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Gestión Operativa del Ecosistema (CRUD Cloud Firestore)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Administración de instalaciones cifradas AES-GCM, cultivos asociados y sensores con
            umbrales
          </p>
        </div>

        <nav aria-label="Navegación CRUD" className="flex flex-wrap gap-2">
          <a
            href="#crud-instalaciones"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Instalaciones ({instalaciones.length})
          </a>
          <a
            href="#crud-cultivos"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cultivos ({cultivos.length})
          </a>
          <a
            href="#crud-sensores"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Sensores ({sensores.length})
          </a>
        </nav>
      </div>

      {!isAdmin && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <Lock className="h-4 w-4 shrink-0 text-amber-700" strokeWidth={1.75} />
          <span>
            <strong>Modo solo lectura según rol</strong> ({profile?.rol ?? 'Sin perfil'}): las
            operaciones de creación, edición y eliminación están restringidas al rol Administrador.
          </span>
        </div>
      )}

      {subscriptionError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {subscriptionError}
        </div>
      )}

      {/* ==================== 1. INSTALACIONES ==================== */}
      <section
        id="crud-instalaciones"
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Warehouse className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
          <h3 className="text-base font-semibold text-slate-900">Gestión de Instalaciones</h3>
        </div>

        {renderFeedback(instFeedback)}

        {isAdmin && (
          <form onSubmit={handleInstSubmit} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-slate-800">
                {editingInstId ? 'Editar Instalación Existente' : 'Nueva Instalación AquaPlants'}
              </legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="inst-id-sistema" className={LABEL_CLASS}>
                    ID Sistema (único, ej. AQP-001)
                  </label>
                  <input
                    id="inst-id-sistema"
                    type="text"
                    value={instIdSistema}
                    onChange={(e) => setInstIdSistema(e.target.value)}
                    placeholder="AQP-001"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="inst-nombre" className={LABEL_CLASS}>
                    Nombre de la instalación
                  </label>
                  <input
                    id="inst-nombre"
                    type="text"
                    value={instNombre}
                    onChange={(e) => setInstNombre(e.target.value)}
                    placeholder="Invernadero Norte"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="inst-ubicacion" className={LABEL_CLASS}>
                    Ubicación (se cifra con AES-GCM)
                  </label>
                  <input
                    id="inst-ubicacion"
                    type="text"
                    value={instUbicacion}
                    onChange={(e) => setInstUbicacion(e.target.value)}
                    placeholder="Sector A - Módulo 3"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="inst-estado" className={LABEL_CLASS}>
                    Estado de conexión
                  </label>
                  <select
                    id="inst-estado"
                    value={instEstado}
                    onChange={(e) => setInstEstado(e.target.value as EstadoConexion)}
                    className={INPUT_CLASS}
                  >
                    {ESTADOS_CONEXION.map((estado) => (
                      <option key={estado} value={estado}>
                        {estado}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={instBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  {instBusy
                    ? 'Guardando...'
                    : editingInstId
                      ? 'Actualizar Instalación'
                      : 'Crear Instalación'}
                </button>
                {editingInstId && (
                  <button
                    type="button"
                    onClick={resetInstForm}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2.5">ID Sistema</th>
                <th className="px-3 py-2.5">Nombre</th>
                <th className="px-3 py-2.5">Ubicación (Descifrada)</th>
                <th className="px-3 py-2.5">Evidencia Cifrada en BD (AES-GCM)</th>
                <th className="px-3 py-2.5">Token Dispositivo (Cifrado)</th>
                <th className="px-3 py-2.5">Estado Conexión</th>
                <th className="px-3 py-2.5">Última Comunicación</th>
                {isAdmin && <th className="px-3 py-2.5 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instalaciones.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-3 py-6 text-center text-slate-500">
                    No hay instalaciones registradas.
                  </td>
                </tr>
              ) : (
                instalaciones.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-900">
                      {item.id_sistema}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{item.nombre}</td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {item.ubicacion_descifrada ?? ''}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                      {item.ubicacion_cifrada.slice(0, 28)}...
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                      {item.token_dispositivo_cifrado.slice(0, 28)}...
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          item.estado_conexion === 'En línea'
                            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                            : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200'
                        }`}
                      >
                        {item.estado_conexion}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                      {item.ultima_comunicacion}
                    </td>
                    {isAdmin && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingInstId(item.id);
                              setInstIdSistema(item.id_sistema);
                              setInstNombre(item.nombre);
                              setInstUbicacion(item.ubicacion_descifrada ?? '');
                              setInstEstado(item.estado_conexion);
                              setInstFeedback(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleInstDelete(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== 2. CULTIVOS ==================== */}
      <section
        id="crud-cultivos"
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Sprout className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
          <h3 className="text-base font-semibold text-slate-900">Gestión de Cultivos</h3>
        </div>

        {renderFeedback(cultFeedback)}

        {isAdmin && (
          <form onSubmit={handleCultSubmit} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-slate-800">
                {editingCultId ? 'Editar Cultivo Existente' : 'Nuevo Cultivo'}
              </legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label htmlFor="cult-id" className={LABEL_CLASS}>
                    ID Cultivo (ej. CUL-001)
                  </label>
                  <input
                    id="cult-id"
                    type="text"
                    value={cultIdCultivo}
                    onChange={(e) => setCultIdCultivo(e.target.value)}
                    placeholder="CUL-001"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="cult-sistema" className={LABEL_CLASS}>
                    Instalación (id_sistema)
                  </label>
                  <select
                    id="cult-sistema"
                    value={cultIdSistema}
                    onChange={(e) => setCultIdSistema(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  >
                    <option value="">-- Selecciona instalación --</option>
                    {instalaciones.map((inst) => (
                      <option key={inst.id} value={inst.id_sistema}>
                        {inst.id_sistema} — {inst.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cult-planta" className={LABEL_CLASS}>
                    Nombre de planta
                  </label>
                  <input
                    id="cult-planta"
                    type="text"
                    value={cultNombrePlanta}
                    onChange={(e) => setCultNombrePlanta(e.target.value)}
                    placeholder="Lechuga Hidropónica"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="cult-fecha" className={LABEL_CLASS}>
                    Fecha de siembra
                  </label>
                  <input
                    id="cult-fecha"
                    type="date"
                    value={cultFechaSiembra}
                    onChange={(e) => setCultFechaSiembra(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="cult-estado" className={LABEL_CLASS}>
                    Estado del cultivo
                  </label>
                  <select
                    id="cult-estado"
                    value={cultEstado}
                    onChange={(e) => setCultEstado(e.target.value as EstadoCultivo)}
                    className={INPUT_CLASS}
                  >
                    {ESTADOS_CULTIVO.map((estado) => (
                      <option key={estado} value={estado}>
                        {estado}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={cultBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  {cultBusy
                    ? 'Guardando...'
                    : editingCultId
                      ? 'Actualizar Cultivo'
                      : 'Crear Cultivo'}
                </button>
                {editingCultId && (
                  <button
                    type="button"
                    onClick={resetCultForm}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2.5">ID Cultivo</th>
                <th className="px-3 py-2.5">ID Sistema</th>
                <th className="px-3 py-2.5">Nombre de Planta</th>
                <th className="px-3 py-2.5">Fecha de Siembra</th>
                <th className="px-3 py-2.5">Estado</th>
                {isAdmin && <th className="px-3 py-2.5 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cultivos.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-3 py-6 text-center text-slate-500">
                    No hay cultivos registrados.
                  </td>
                </tr>
              ) : (
                cultivos.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-900">
                      {item.id_cultivo}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700">
                      {item.id_sistema}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{item.nombre_planta}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600 tabular-nums">
                      {item.fecha_siembra}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          item.estado === 'Activo'
                            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                            : item.estado === 'En cosecha'
                              ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.estado}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCultId(item.id);
                              setCultIdCultivo(item.id_cultivo);
                              setCultIdSistema(item.id_sistema);
                              setCultNombrePlanta(item.nombre_planta);
                              setCultFechaSiembra(item.fecha_siembra);
                              setCultEstado(item.estado);
                              setCultFeedback(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCultDelete(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== 3. SENSORES ==================== */}
      <section
        id="crud-sensores"
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Cpu className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
          <h3 className="text-base font-semibold text-slate-900">Gestión de Sensores</h3>
        </div>

        {renderFeedback(senFeedback)}

        {isAdmin && (
          <form onSubmit={handleSenSubmit} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-slate-800">
                {editingSenId ? 'Editar Sensor Existente' : 'Nuevo Sensor AquaBrain'}
              </legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="sen-id" className={LABEL_CLASS}>
                    ID Sensor (ej. SEN-001)
                  </label>
                  <input
                    id="sen-id"
                    type="text"
                    value={senIdSensor}
                    onChange={(e) => setSenIdSensor(e.target.value)}
                    placeholder="SEN-001"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="sen-sistema" className={LABEL_CLASS}>
                    Instalación (id_sistema)
                  </label>
                  <select
                    id="sen-sistema"
                    value={senIdSistema}
                    onChange={(e) => setSenIdSistema(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  >
                    <option value="">-- Selecciona instalación --</option>
                    {instalaciones.map((inst) => (
                      <option key={inst.id} value={inst.id_sistema}>
                        {inst.id_sistema} — {inst.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sen-dispositivo" className={LABEL_CLASS}>
                    ID Dispositivo (ej. AQUABRAIN-01)
                  </label>
                  <input
                    id="sen-dispositivo"
                    type="text"
                    value={senIdDispositivo}
                    onChange={(e) => setSenIdDispositivo(e.target.value)}
                    placeholder="AQUABRAIN-01"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="sen-tipo" className={LABEL_CLASS}>
                    Tipo de variable
                  </label>
                  <select
                    id="sen-tipo"
                    value={senTipoVariable}
                    onChange={(e) => {
                      const nextTipo = e.target.value as TipoVariable;
                      setSenTipoVariable(nextTipo);
                      setSenUnidad(UNIDAD_POR_VARIABLE[nextTipo]);
                    }}
                    className={INPUT_CLASS}
                  >
                    {TIPOS_VARIABLE.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sen-unidad" className={LABEL_CLASS}>
                    Unidad de medida
                  </label>
                  <input
                    id="sen-unidad"
                    type="text"
                    value={senUnidad}
                    onChange={(e) => setSenUnidad(e.target.value)}
                    placeholder="L/min"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="sen-min" className={LABEL_CLASS}>
                    Umbral mínimo
                  </label>
                  <input
                    id="sen-min"
                    type="number"
                    step="any"
                    value={senUmbralMin}
                    onChange={(e) => setSenUmbralMin(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="sen-max" className={LABEL_CLASS}>
                    Umbral máximo
                  </label>
                  <input
                    id="sen-max"
                    type="number"
                    step="any"
                    value={senUmbralMax}
                    onChange={(e) => setSenUmbralMax(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="sen-estado" className={LABEL_CLASS}>
                    Estado del sensor
                  </label>
                  <select
                    id="sen-estado"
                    value={senEstado}
                    onChange={(e) => setSenEstado(e.target.value as EstadoSensor)}
                    className={INPUT_CLASS}
                  >
                    {ESTADOS_SENSOR.map((estado) => (
                      <option key={estado} value={estado}>
                        {estado}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={senBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  {senBusy
                    ? 'Guardando...'
                    : editingSenId
                      ? 'Actualizar Sensor'
                      : 'Crear Sensor'}
                </button>
                {editingSenId && (
                  <button
                    type="button"
                    onClick={resetSenForm}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-3 py-2.5">ID Sensor</th>
                <th className="px-3 py-2.5">ID Sistema</th>
                <th className="px-3 py-2.5">ID Dispositivo</th>
                <th className="px-3 py-2.5">Variable</th>
                <th className="px-3 py-2.5">Unidad</th>
                <th className="px-3 py-2.5 text-right">Umbral Mín</th>
                <th className="px-3 py-2.5 text-right">Umbral Máx</th>
                <th className="px-3 py-2.5">Estado</th>
                {isAdmin && <th className="px-3 py-2.5 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sensores.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-3 py-6 text-center text-slate-500">
                    No hay sensores registrados.
                  </td>
                </tr>
              ) : (
                sensores.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-900">
                      {item.id_sensor}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700">
                      {item.id_sistema}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                      {item.id_dispositivo}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{item.tipo_variable}</td>
                    <td className="px-3 py-2.5 text-slate-600">{item.unidad}</td>
                    <td className="px-3 py-2.5 text-right text-slate-800 tabular-nums">
                      {item.umbral_min}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-800 tabular-nums">
                      {item.umbral_max}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          item.estado === 'Activo'
                            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.estado}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSenId(item.id);
                              setSenIdSensor(item.id_sensor);
                              setSenIdSistema(item.id_sistema);
                              setSenIdDispositivo(item.id_dispositivo);
                              setSenTipoVariable(item.tipo_variable);
                              setSenUnidad(item.unidad);
                              setSenUmbralMin(String(item.umbral_min));
                              setSenUmbralMax(String(item.umbral_max));
                              setSenEstado(item.estado);
                              setSenFeedback(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSenDelete(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Eliminar
                          </button>
                        </div>
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
