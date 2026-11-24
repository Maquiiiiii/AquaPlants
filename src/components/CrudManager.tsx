import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Cpu,
  Link2,
  Lock,
  Pencil,
  Plus,
  Search,
  Sprout,
  Trash2,
  Unlink,
  Warehouse,
  X,
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
import { formatVariableLabel } from '../utils/formatters';
import CustomSelect from './CustomSelect';

interface CrudManagerProps {
  profile: UserProfile | null;
  userUid: string;
  userEmail: string;
}

type CrudTab = 'instalaciones' | 'cultivos' | 'sensores';

interface DeleteTarget {
  entity: CrudTab;
  id: string;
  code: string;
  label: string;
}

function useAnimatedModal(isOpen: boolean, exitDelayMs = 200) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }

    if (!shouldRender) return;
    setIsClosing(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, exitDelayMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender, exitDelayMs]);

  return { shouldRender, isClosing };
}

function inputClass(hasError = false): string {
  return `w-full rounded-2xl border-0 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all ${
    hasError
      ? 'bg-[#FDF2F2] ring-2 ring-red-500/30'
      : 'bg-[#F4F6F5] focus:bg-white focus:ring-2 focus:ring-[#00753A]/20'
  }`;
}

const LABEL_CLASS = 'mb-1.5 block text-xs font-semibold text-slate-700';

const CREATE_LABEL: Record<CrudTab, string> = {
  instalaciones: 'Nueva Instalación',
  cultivos: 'Nuevo Cultivo',
  sensores: 'Nuevo Sensor',
};

export default function CrudManager({ profile, userUid, userEmail }: CrudManagerProps) {
  const isAdmin = profile?.rol === 'Administrador';
  const actor: CrudActor = {
    uid: userUid,
    email: profile?.email ?? userEmail,
    rol: profile?.rol ?? 'Encargado de cultivo',
  };

  const [activeTab, setActiveTab] = useState<CrudTab>('instalaciones');
  const [searchQuery, setSearchQuery] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { shouldRender: isModalMounted, isClosing: isModalClosing } = useAnimatedModal(
    isAdmin && drawerOpen,
  );

  // Datos en tiempo real
  const [instalaciones, setInstalaciones] = useState<Instalacion[]>([]);
  const [cultivos, setCultivos] = useState<Cultivo[]>([]);
  const [sensores, setSensores] = useState<Sensor[]>([]);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  // Modales
  const [cryptoInspectInst, setCryptoInspectInst] = useState<Instalacion | null>(null);
  const [copiedField, setCopiedField] = useState<'ubicacion' | 'token' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Modal contextual de detalle de instalación ("Qué hay dentro")
  const [detailInstIdSistema, setDetailInstIdSistema] = useState<string | null>(null);
  const detailInst =
    instalaciones.find((inst) => inst.id_sistema === detailInstIdSistema) ?? null;
  const [cachedDetailInst, setCachedDetailInst] = useState<Instalacion | null>(null);
  const activeDetailInst = detailInst ?? cachedDetailInst;
  const { shouldRender: isDetailMounted, isClosing: isDetailClosing } = useAnimatedModal(
    Boolean(detailInst),
  );
  const [detailFeedback, setDetailFeedback] = useState<{
    type: 'error' | 'ok';
    text: string;
  } | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [linkCultId, setLinkCultId] = useState('');
  const [linkSenId, setLinkSenId] = useState('');
  const [showOccupiedCultivos, setShowOccupiedCultivos] = useState(false);
  const [showOccupiedSensores, setShowOccupiedSensores] = useState(false);

  // Sub-modal apilado (z-[60]) para crear/editar Cultivo o Sensor desde Instalación
  const [subModalMode, setSubModalMode] = useState<'create' | 'link'>('create');
  const [subModalLinkId, setSubModalLinkId] = useState('');
  const [subModal, setSubModal] = useState<{
    type: 'cultivo' | 'sensor';
    source: 'new-inst' | 'detail-inst';
    editIndex?: number;
  } | null>(null);
  const [cachedSubModal, setCachedSubModal] = useState<{
    type: 'cultivo' | 'sensor';
    source: 'new-inst' | 'detail-inst';
    editIndex?: number;
  } | null>(null);
  const activeSubModal = subModal ?? cachedSubModal;
  const { shouldRender: isSubModalMounted, isClosing: isSubModalClosing } = useAnimatedModal(
    Boolean(subModal),
  );

  useEffect(() => {
    if (detailInst) setCachedDetailInst(detailInst);
  }, [detailInst]);

  useEffect(() => {
    if (subModal) setCachedSubModal(subModal);
  }, [subModal]);

  // Estado formulario Instalaciones + Todo-en-Uno inicial
  const [editingInstId, setEditingInstId] = useState<string | null>(null);
  const [instIdSistema, setInstIdSistema] = useState('');
  const [instNombre, setInstNombre] = useState('');
  const [instUbicacion, setInstUbicacion] = useState('');
  const [instEstado, setInstEstado] = useState<EstadoConexion>('En línea');
  const [showInitialCultivos, setShowInitialCultivos] = useState(false);
  const [showInitialSensores, setShowInitialSensores] = useState(false);
  const [initialCultivos, setInitialCultivos] = useState<
    Array<{
      tempId: string;
      id_cultivo: string;
      nombre_planta: string;
      fecha_siembra: string;
      estado: EstadoCultivo;
    }>
  >([]);
  const [initialSensores, setInitialSensores] = useState<
    Array<{
      tempId: string;
      id_sensor: string;
      tipo_variable: TipoVariable;
      umbral_min: string;
      umbral_max: string;
      estado: EstadoSensor;
    }>
  >([]);
  const [instBusy, setInstBusy] = useState(false);
  const [instErrors, setInstErrors] = useState<Record<string, boolean>>({});
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
  const [cultErrors, setCultErrors] = useState<Record<string, boolean>>({});
  const [cultFeedback, setCultFeedback] = useState<{ type: 'error' | 'ok'; text: string } | null>(
    null,
  );

  // Estado formulario Sensores
  const [editingSenId, setEditingSenId] = useState<string | null>(null);
  const [senIdSensor, setSenIdSensor] = useState('');
  const [senIdSistema, setSenIdSistema] = useState('');
  const [senTipoVariable, setSenTipoVariable] = useState<TipoVariable>('caudal');
  const [senUmbralMin, setSenUmbralMin] = useState('10');
  const [senUmbralMax, setSenUmbralMax] = useState('50');
  const [senEstado, setSenEstado] = useState<EstadoSensor>('Activo');
  const [senBusy, setSenBusy] = useState(false);
  const [senErrors, setSenErrors] = useState<Record<string, boolean>>({});
  const [senFeedback, setSenFeedback] = useState<{ type: 'error' | 'ok'; text: string } | null>(
    null,
  );

  useEffect(() => {
    const unsubInst = subscribeInstalaciones(
      (items) => {
        setInstalaciones(items);
        setInitialLoading(false);
      },
      (err) => {
        setSubscriptionError(err);
        setInitialLoading(false);
      },
    );
    const unsubCult = subscribeCultivos(setCultivos, setSubscriptionError);
    const unsubSen = subscribeSensores(setSensores, setSubscriptionError);

    return () => {
      unsubInst();
      unsubCult();
      unsubSen();
    };
  }, []);

  // Cierre de drawer y modales con Escape
  useEffect(() => {
    if (!drawerOpen && !cryptoInspectInst && !deleteTarget && !detailInstIdSistema) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setCryptoInspectInst(null);
        setDetailInstIdSistema(null);
        if (!deleteBusy) setDeleteTarget(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen, cryptoInspectInst, deleteTarget, deleteBusy, detailInstIdSistema]);

  function getInstalacionNombre(idSistema: string): string {
    if (!idSistema) return 'Sin asignar';
    return instalaciones.find((i) => i.id_sistema === idSistema)?.nombre ?? idSistema;
  }

  function validateCultivoExclusivity(
    idCultivo: string,
    targetIdSistema: string,
    editingDocId?: string | null,
  ): string | null {
    const normalizedCode = idCultivo.trim().toUpperCase();
    const conflict = cultivos.find(
      (c) =>
        c.id !== editingDocId &&
        c.id_cultivo.trim().toUpperCase() === normalizedCode &&
        Boolean(c.id_sistema) &&
        c.id_sistema !== targetIdSistema,
    );
    if (conflict) {
      return `El cultivo ${conflict.id_cultivo} ya está vinculado a ${getInstalacionNombre(conflict.id_sistema)}. Desvincúlalo primero antes de asignarlo aquí.`;
    }
    return null;
  }

  function validateSensorExclusivity(
    idSensor: string,
    targetIdSistema: string,
    editingDocId?: string | null,
  ): string | null {
    const normalizedCode = idSensor.trim().toUpperCase();
    const conflict = sensores.find(
      (s) =>
        s.id !== editingDocId &&
        s.id_sensor.trim().toUpperCase() === normalizedCode &&
        Boolean(s.id_sistema) &&
        s.id_sistema !== targetIdSistema,
    );
    if (conflict) {
      return `El sensor ${conflict.id_sensor} ya está vinculado a ${getInstalacionNombre(conflict.id_sistema)}. Desvincúlalo primero antes de asignarlo aquí.`;
    }
    return null;
  }

  function openInstalacionDetail(idSistema: string) {
    setDetailInstIdSistema(idSistema);
    setDetailFeedback(null);
    setLinkCultId('');
    setLinkSenId('');
    setShowOccupiedCultivos(false);
    setShowOccupiedSensores(false);
  }

  function resetInstForm() {
    setEditingInstId(null);
    setInstIdSistema('');
    setInstNombre('');
    setInstUbicacion('');
    setInstEstado('En línea');
    setShowInitialCultivos(false);
    setShowInitialSensores(false);
    setInitialCultivos([]);
    setInitialSensores([]);
    setInstErrors({});
  }

  function resetCultForm() {
    setEditingCultId(null);
    setCultIdCultivo('');
    setCultIdSistema('');
    setCultNombrePlanta('');
    setCultFechaSiembra('');
    setCultEstado('Activo');
    setCultErrors({});
  }

  function resetSenForm() {
    setEditingSenId(null);
    setSenIdSensor('');
    setSenIdSistema('');
    setSenTipoVariable('caudal');
    setSenUmbralMin('10');
    setSenUmbralMax('50');
    setSenEstado('Activo');
    setSenErrors({});
  }

  function openCreateDrawer() {
    if (activeTab === 'instalaciones') resetInstForm();
    else if (activeTab === 'cultivos') resetCultForm();
    else resetSenForm();
    setDrawerOpen(true);
  }

  async function handleInstSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInstFeedback(null);
    const errs: Record<string, boolean> = {};
    if (!instIdSistema.trim()) errs.id_sistema = true;
    if (!instNombre.trim()) errs.nombre = true;
    if (!instUbicacion.trim()) errs.ubicacion = true;
    if (Object.keys(errs).length > 0) {
      setInstErrors(errs);
      setInstFeedback({ type: 'error', text: 'Completa todos los campos obligatorios.' });
      return;
    }

    if (!editingInstId) {
      for (const draft of initialCultivos) {
        if (!draft.id_cultivo.trim() || !draft.nombre_planta.trim()) {
          setInstFeedback({
            type: 'error',
            text: 'Completa el código y el nombre de cada cultivo inicial o elimina las filas vacías.',
          });
          return;
        }
        const conflictMsg = validateCultivoExclusivity(draft.id_cultivo, instIdSistema.trim());
        if (conflictMsg) {
          setInstFeedback({ type: 'error', text: conflictMsg });
          return;
        }
      }
      for (const draft of initialSensores) {
        const minV = Number(draft.umbral_min);
        const maxV = Number(draft.umbral_max);
        if (!draft.id_sensor.trim() || Number.isNaN(minV) || Number.isNaN(maxV) || minV >= maxV) {
          setInstFeedback({
            type: 'error',
            text: 'Verifica el código y que el umbral mínimo sea menor que el máximo en cada sensor inicial.',
          });
          return;
        }
        const conflictMsg = validateSensorExclusivity(draft.id_sensor, instIdSistema.trim());
        if (conflictMsg) {
          setInstFeedback({ type: 'error', text: conflictMsg });
          return;
        }
      }
    }

    setInstErrors({});
    setInstBusy(true);
    try {
      if (editingInstId) {
        await updateInstalacion(
          editingInstId,
          {
            id_sistema: instIdSistema,
            nombre: instNombre,
            ubicacion: instUbicacion,
            estado_conexion: instEstado,
          },
          actor,
        );
        setInstFeedback({ type: 'ok', text: `Instalación ${instIdSistema} actualizada.` });
      } else {
        const targetIdSistema = instIdSistema.trim();
        await createInstalacion(
          {
            id_sistema: targetIdSistema,
            nombre: instNombre,
            ubicacion: instUbicacion,
            estado_conexion: instEstado,
          },
          actor,
        );
        for (const draft of initialCultivos) {
          await createCultivo(
            {
              id_cultivo: draft.id_cultivo.trim(),
              id_sistema: targetIdSistema,
              nombre_planta: draft.nombre_planta.trim(),
              fecha_siembra: draft.fecha_siembra,
              estado: draft.estado,
            },
            actor,
          );
        }
        for (const draft of initialSensores) {
          await createSensor(
            {
              id_sensor: draft.id_sensor.trim(),
              id_sistema: targetIdSistema,
              id_dispositivo: draft.id_sensor.trim(),
              tipo_variable: draft.tipo_variable,
              unidad: UNIDAD_POR_VARIABLE[draft.tipo_variable],
              umbral_min: Number(draft.umbral_min),
              umbral_max: Number(draft.umbral_max),
              estado: draft.estado,
            },
            actor,
          );
        }
        const createdSummary =
          initialCultivos.length > 0 || initialSensores.length > 0
            ? `Instalación ${instNombre.trim()} creada con ${initialCultivos.length} ${
                initialCultivos.length === 1 ? 'cultivo' : 'cultivos'
              } y ${initialSensores.length} ${
                initialSensores.length === 1 ? 'sensor' : 'sensores'
              }.`
            : `Instalación ${targetIdSistema} registrada correctamente.`;
        setInstFeedback({
          type: 'ok',
          text: createdSummary,
        });
      }
      resetInstForm();
      setDrawerOpen(false);
    } catch (error) {
      setInstFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error guardando instalación.',
      });
    } finally {
      setInstBusy(false);
    }
  }

  async function handleCultSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCultFeedback(null);
    const errs: Record<string, boolean> = {};
    if (!cultIdCultivo.trim()) errs.id_cultivo = true;
    if (!cultNombrePlanta.trim()) errs.nombre_planta = true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cultFechaSiembra)) errs.fecha_siembra = true;
    if (Object.keys(errs).length > 0) {
      setCultErrors(errs);
      setCultFeedback({
        type: 'error',
        text: 'Revisa los campos obligatorios y el formato de fecha (AAAA-MM-DD).',
      });
      return;
    }

    if (cultIdSistema.trim()) {
      const conflictMsg = validateCultivoExclusivity(
        cultIdCultivo,
        cultIdSistema.trim(),
        editingCultId,
      );
      if (conflictMsg) {
        setCultFeedback({ type: 'error', text: conflictMsg });
        return;
      }
    }

    setCultErrors({});
    setCultBusy(true);
    try {
      if (editingCultId) {
        await updateCultivo(
          editingCultId,
          {
            id_cultivo: cultIdCultivo,
            id_sistema: cultIdSistema,
            nombre_planta: cultNombrePlanta,
            fecha_siembra: cultFechaSiembra,
            estado: cultEstado,
          },
          actor,
        );
        setCultFeedback({ type: 'ok', text: `Cultivo ${cultIdCultivo} actualizado.` });
      } else {
        await createCultivo(
          {
            id_cultivo: cultIdCultivo,
            id_sistema: cultIdSistema,
            nombre_planta: cultNombrePlanta,
            fecha_siembra: cultFechaSiembra,
            estado: cultEstado,
          },
          actor,
        );
        setCultFeedback({ type: 'ok', text: `Cultivo ${cultIdCultivo} registrado.` });
      }
      resetCultForm();
      setDrawerOpen(false);
    } catch (error) {
      setCultFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error guardando cultivo.',
      });
    } finally {
      setCultBusy(false);
    }
  }

  async function handleSenSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSenFeedback(null);
    const minVal = Number(senUmbralMin);
    const maxVal = Number(senUmbralMax);
    const errs: Record<string, boolean> = {};
    if (!senIdSensor.trim()) errs.id_sensor = true;
    if (Number.isNaN(minVal)) errs.umbral_min = true;
    if (Number.isNaN(maxVal) || minVal >= maxVal) errs.umbral_max = true;

    if (Object.keys(errs).length > 0) {
      setSenErrors(errs);
      setSenFeedback({
        type: 'error',
        text: 'Verifica los campos y asegúrate de que el umbral mínimo sea menor que el máximo.',
      });
      return;
    }

    if (senIdSistema.trim()) {
      const conflictMsg = validateSensorExclusivity(
        senIdSensor,
        senIdSistema.trim(),
        editingSenId,
      );
      if (conflictMsg) {
        setSenFeedback({ type: 'error', text: conflictMsg });
        return;
      }
    }

    setSenErrors({});
    setSenBusy(true);
    try {
      if (editingSenId) {
        await updateSensor(
          editingSenId,
          {
            id_sensor: senIdSensor,
            id_sistema: senIdSistema,
            id_dispositivo: senIdSensor,
            tipo_variable: senTipoVariable,
            unidad: UNIDAD_POR_VARIABLE[senTipoVariable],
            umbral_min: minVal,
            umbral_max: maxVal,
            estado: senEstado,
          },
          actor,
        );
        setSenFeedback({ type: 'ok', text: `Sensor ${senIdSensor} actualizado.` });
      } else {
        await createSensor(
          {
            id_sensor: senIdSensor,
            id_sistema: senIdSistema,
            id_dispositivo: senIdSensor,
            tipo_variable: senTipoVariable,
            unidad: UNIDAD_POR_VARIABLE[senTipoVariable],
            umbral_min: minVal,
            umbral_max: maxVal,
            estado: senEstado,
          },
          actor,
        );
        setSenFeedback({ type: 'ok', text: `Sensor ${senIdSensor} registrado.` });
      }
      resetSenForm();
      setDrawerOpen(false);
    } catch (error) {
      setSenFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error guardando sensor.',
      });
    } finally {
      setSenBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      if (deleteTarget.entity === 'instalaciones') {
        await deleteInstalacion(deleteTarget.id, deleteTarget.code, actor);
        setInstFeedback({
          type: 'ok',
          text: `Instalación ${deleteTarget.code} eliminada.`,
        });
      } else if (deleteTarget.entity === 'cultivos') {
        await deleteCultivo(deleteTarget.id, deleteTarget.code, actor);
        setCultFeedback({
          type: 'ok',
          text: `Cultivo ${deleteTarget.code} eliminado.`,
        });
      } else {
        await deleteSensor(deleteTarget.id, deleteTarget.code, actor);
        setSenFeedback({
          type: 'ok',
          text: `Sensor ${deleteTarget.code} eliminado.`,
        });
      }
      setDeleteTarget(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error eliminando registro.';
      if (deleteTarget.entity === 'instalaciones') setInstFeedback({ type: 'error', text: msg });
      else if (deleteTarget.entity === 'cultivos') setCultFeedback({ type: 'error', text: msg });
      else setSenFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleUnlinkCultivo(cult: Cultivo) {
    setDetailFeedback(null);
    setDetailBusy(true);
    try {
      await updateCultivo(
        cult.id,
        {
          id_cultivo: cult.id_cultivo,
          id_sistema: '',
          nombre_planta: cult.nombre_planta,
          fecha_siembra: cult.fecha_siembra,
          estado: cult.estado,
        },
        actor,
      );
      setDetailFeedback({
        type: 'ok',
        text: `Cultivo ${cult.id_cultivo} liberado. Ahora está disponible para otra instalación.`,
      });
    } catch (error) {
      setDetailFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error desvinculando cultivo.',
      });
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleUnlinkSensor(sen: Sensor) {
    setDetailFeedback(null);
    setDetailBusy(true);
    try {
      await updateSensor(
        sen.id,
        {
          id_sensor: sen.id_sensor,
          id_sistema: '',
          id_dispositivo: sen.id_dispositivo,
          tipo_variable: sen.tipo_variable,
          unidad: sen.unidad,
          umbral_min: sen.umbral_min,
          umbral_max: sen.umbral_max,
          estado: sen.estado,
        },
        actor,
      );
      setDetailFeedback({
        type: 'ok',
        text: `Sensor ${sen.id_sensor} liberado. Ahora está disponible para otra instalación.`,
      });
    } catch (error) {
      setDetailFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error desvinculando sensor.',
      });
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleLinkExistingCultivo() {
    if (!detailInst || !linkCultId) return;
    const cult = cultivos.find((c) => c.id === linkCultId);
    if (!cult) return;
    setDetailFeedback(null);

    if (cult.id_sistema && cult.id_sistema !== detailInst.id_sistema) {
      setDetailFeedback({
        type: 'error',
        text: `El cultivo ${cult.id_cultivo} ya está vinculado a ${getInstalacionNombre(cult.id_sistema)}. Desvincúlalo primero antes de asignarlo aquí.`,
      });
      return;
    }

    setDetailBusy(true);
    try {
      await updateCultivo(
        cult.id,
        {
          id_cultivo: cult.id_cultivo,
          id_sistema: detailInst.id_sistema,
          nombre_planta: cult.nombre_planta,
          fecha_siembra: cult.fecha_siembra,
          estado: cult.estado,
        },
        actor,
      );
      setLinkCultId('');
      setDetailFeedback({
        type: 'ok',
        text: `Cultivo ${cult.id_cultivo} vinculado a ${detailInst.nombre}.`,
      });
    } catch (error) {
      setDetailFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error vinculando cultivo.',
      });
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleLinkExistingSensor() {
    if (!detailInst || !linkSenId) return;
    const sen = sensores.find((s) => s.id === linkSenId);
    if (!sen) return;
    setDetailFeedback(null);

    if (sen.id_sistema && sen.id_sistema !== detailInst.id_sistema) {
      setDetailFeedback({
        type: 'error',
        text: `El sensor ${sen.id_sensor} ya está vinculado a ${getInstalacionNombre(sen.id_sistema)}. Desvincúlalo primero antes de asignarlo aquí.`,
      });
      return;
    }

    setDetailBusy(true);
    try {
      await updateSensor(
        sen.id,
        {
          id_sensor: sen.id_sensor,
          id_sistema: detailInst.id_sistema,
          id_dispositivo: sen.id_dispositivo,
          tipo_variable: sen.tipo_variable,
          unidad: sen.unidad,
          umbral_min: sen.umbral_min,
          umbral_max: sen.umbral_max,
          estado: sen.estado,
        },
        actor,
      );
      setLinkSenId('');
      setDetailFeedback({
        type: 'ok',
        text: `Sensor ${sen.id_sensor} vinculado a ${detailInst.nombre}.`,
      });
    } catch (error) {
      setDetailFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error vinculando sensor.',
      });
    } finally {
      setDetailBusy(false);
    }
  }

  function openSubModalCultivo(source: 'new-inst' | 'detail-inst', editIndex?: number) {
    setCultFeedback(null);
    setCultErrors({});
    setSubModalMode('create');
    setSubModalLinkId('');
    if (source === 'new-inst' && editIndex !== undefined) {
      const draft = initialCultivos[editIndex];
      setCultIdCultivo(draft.id_cultivo);
      setCultNombrePlanta(draft.nombre_planta);
      setCultFechaSiembra(draft.fecha_siembra);
      setCultEstado(draft.estado);
      setCultIdSistema(instIdSistema.trim());
    } else {
      setEditingCultId(null);
      setCultIdCultivo(`CUL-${String(cultivos.length + initialCultivos.length + 1).padStart(3, '0')}`);
      setCultNombrePlanta('');
      setCultFechaSiembra(new Date().toISOString().slice(0, 10));
      setCultEstado('Activo');
      setCultIdSistema(source === 'detail-inst' && detailInst ? detailInst.id_sistema : instIdSistema.trim());
    }
    setSubModal({ type: 'cultivo', source, editIndex });
  }

  function openSubModalSensor(source: 'new-inst' | 'detail-inst', editIndex?: number) {
    setSenFeedback(null);
    setSenErrors({});
    setSubModalMode('create');
    setSubModalLinkId('');
    if (source === 'new-inst' && editIndex !== undefined) {
      const draft = initialSensores[editIndex];
      setSenIdSensor(draft.id_sensor);
      setSenTipoVariable(draft.tipo_variable);
      setSenUmbralMin(draft.umbral_min);
      setSenUmbralMax(draft.umbral_max);
      setSenEstado(draft.estado);
      setSenIdSistema(instIdSistema.trim());
    } else {
      setEditingSenId(null);
      setSenIdSensor(`SEN-${String(sensores.length + initialSensores.length + 1).padStart(3, '0')}`);
      setSenTipoVariable('caudal');
      setSenUmbralMin('10');
      setSenUmbralMax('50');
      setSenEstado('Activo');
      setSenIdSistema(source === 'detail-inst' && detailInst ? detailInst.id_sistema : instIdSistema.trim());
    }
    setSubModal({ type: 'sensor', source, editIndex });
  }

  async function handleSubModalSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!subModal) return;

    if (subModalMode === 'link') {
      if (subModal.type === 'cultivo') {
        const cult = cultivos.find((c) => c.id === subModalLinkId);
        if (!cult) {
          setCultFeedback({ type: 'error', text: 'Selecciona un cultivo disponible.' });
          return;
        }
        if (subModal.source === 'new-inst') {
          setInitialCultivos((prev) => [
            ...prev,
            {
              tempId: `link-${cult.id}`,
              id_cultivo: cult.id_cultivo,
              nombre_planta: cult.nombre_planta,
              fecha_siembra: cult.fecha_siembra,
              estado: cult.estado,
            },
          ]);
          setShowInitialCultivos(true);
          setSubModal(null);
          return;
        }
        if (detailInst) {
          setCultBusy(true);
          try {
            await updateCultivo(
              cult.id,
              {
                id_cultivo: cult.id_cultivo,
                id_sistema: detailInst.id_sistema,
                nombre_planta: cult.nombre_planta,
                fecha_siembra: cult.fecha_siembra,
                estado: cult.estado,
              },
              actor,
            );
            setDetailFeedback({
              type: 'ok',
              text: `Cultivo ${cult.id_cultivo} vinculado a ${detailInst.nombre}.`,
            });
            setSubModal(null);
          } catch (error) {
            setCultFeedback({
              type: 'error',
              text: error instanceof Error ? error.message : 'Error vinculando cultivo.',
            });
          } finally {
            setCultBusy(false);
          }
        }
        return;
      }

      const sen = sensores.find((s) => s.id === subModalLinkId);
      if (!sen) {
        setSenFeedback({ type: 'error', text: 'Selecciona un sensor disponible.' });
        return;
      }
      if (subModal.source === 'new-inst') {
        setInitialSensores((prev) => [
          ...prev,
          {
            tempId: `link-${sen.id}`,
            id_sensor: sen.id_sensor,
            tipo_variable: sen.tipo_variable,
            umbral_min: String(sen.umbral_min),
            umbral_max: String(sen.umbral_max),
            estado: sen.estado,
          },
        ]);
        setShowInitialSensores(true);
        setSubModal(null);
        return;
      }
      if (detailInst) {
        setSenBusy(true);
        try {
          await updateSensor(
            sen.id,
            {
              id_sensor: sen.id_sensor,
              id_sistema: detailInst.id_sistema,
              id_dispositivo: sen.id_dispositivo,
              tipo_variable: sen.tipo_variable,
              unidad: sen.unidad,
              umbral_min: sen.umbral_min,
              umbral_max: sen.umbral_max,
              estado: sen.estado,
            },
            actor,
          );
          setDetailFeedback({
            type: 'ok',
            text: `Sensor ${sen.id_sensor} vinculado a ${detailInst.nombre}.`,
          });
          setSubModal(null);
        } catch (error) {
          setSenFeedback({
            type: 'error',
            text: error instanceof Error ? error.message : 'Error vinculando sensor.',
          });
        } finally {
          setSenBusy(false);
        }
      }
      return;
    }

    if (subModal.type === 'cultivo') {
      setCultFeedback(null);
      const errs: Record<string, boolean> = {};
      if (!cultIdCultivo.trim()) errs.id_cultivo = true;
      if (!cultNombrePlanta.trim()) errs.nombre_planta = true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cultFechaSiembra)) errs.fecha_siembra = true;
      if (Object.keys(errs).length > 0) {
        setCultErrors(errs);
        setCultFeedback({
          type: 'error',
          text: 'Revisa los campos obligatorios y la fecha de siembra.',
        });
        return;
      }

      const targetSistema =
        subModal.source === 'detail-inst' && detailInst
          ? detailInst.id_sistema
          : instIdSistema.trim();

      const conflictMsg = validateCultivoExclusivity(cultIdCultivo, targetSistema);
      if (conflictMsg) {
        setCultFeedback({ type: 'error', text: conflictMsg });
        return;
      }

      if (subModal.source === 'new-inst') {
        const draftItem = {
          tempId:
            subModal.editIndex !== undefined
              ? initialCultivos[subModal.editIndex].tempId
              : `${Date.now()}-${initialCultivos.length}`,
          id_cultivo: cultIdCultivo.trim(),
          nombre_planta: cultNombrePlanta.trim(),
          fecha_siembra: cultFechaSiembra,
          estado: cultEstado,
        };
        setInitialCultivos((prev) =>
          subModal.editIndex !== undefined
            ? prev.map((item, idx) => (idx === subModal.editIndex ? draftItem : item))
            : [...prev, draftItem],
        );
        setShowInitialCultivos(true);
        setSubModal(null);
        return;
      }

      if (detailInst) {
        setCultBusy(true);
        try {
          await createCultivo(
            {
              id_cultivo: cultIdCultivo.trim(),
              id_sistema: detailInst.id_sistema,
              nombre_planta: cultNombrePlanta.trim(),
              fecha_siembra: cultFechaSiembra,
              estado: cultEstado,
            },
            actor,
          );
          setDetailFeedback({
            type: 'ok',
            text: `Cultivo ${cultNombrePlanta.trim()} agregado a ${detailInst.nombre}.`,
          });
          setSubModal(null);
        } catch (error) {
          setCultFeedback({
            type: 'error',
            text: error instanceof Error ? error.message : 'Error creando cultivo.',
          });
        } finally {
          setCultBusy(false);
        }
      }
      return;
    }

    // Sensor
    setSenFeedback(null);
    const minVal = Number(senUmbralMin);
    const maxVal = Number(senUmbralMax);
    const errs: Record<string, boolean> = {};
    if (!senIdSensor.trim()) errs.id_sensor = true;
    if (Number.isNaN(minVal)) errs.umbral_min = true;
    if (Number.isNaN(maxVal) || minVal >= maxVal) errs.umbral_max = true;

    if (Object.keys(errs).length > 0) {
      setSenErrors(errs);
      setSenFeedback({
        type: 'error',
        text: 'Verifica los campos y asegúrate de que el umbral mínimo sea menor que el máximo.',
      });
      return;
    }

    const targetSistema =
      subModal.source === 'detail-inst' && detailInst
        ? detailInst.id_sistema
        : instIdSistema.trim();

    const conflictMsg = validateSensorExclusivity(senIdSensor, targetSistema);
    if (conflictMsg) {
      setSenFeedback({ type: 'error', text: conflictMsg });
      return;
    }

    if (subModal.source === 'new-inst') {
      const draftItem = {
        tempId:
          subModal.editIndex !== undefined
            ? initialSensores[subModal.editIndex].tempId
            : `${Date.now()}-${initialSensores.length}`,
        id_sensor: senIdSensor.trim(),
        tipo_variable: senTipoVariable,
        umbral_min: senUmbralMin,
        umbral_max: senUmbralMax,
        estado: senEstado,
      };
      setInitialSensores((prev) =>
        subModal.editIndex !== undefined
          ? prev.map((item, idx) => (idx === subModal.editIndex ? draftItem : item))
          : [...prev, draftItem],
      );
      setShowInitialSensores(true);
      setSubModal(null);
      return;
    }

    if (detailInst) {
      setSenBusy(true);
      try {
        await createSensor(
          {
            id_sensor: senIdSensor.trim(),
            id_sistema: detailInst.id_sistema,
            id_dispositivo: senIdSensor.trim(),
            tipo_variable: senTipoVariable,
            unidad: UNIDAD_POR_VARIABLE[senTipoVariable],
            umbral_min: minVal,
            umbral_max: maxVal,
            estado: senEstado,
          },
          actor,
        );
        setDetailFeedback({
          type: 'ok',
          text: `Sensor ${senIdSensor.trim()} vinculado correctamente.`,
        });
        setSubModal(null);
      } catch (error) {
        setSenFeedback({
          type: 'error',
          text: error instanceof Error ? error.message : 'Error creando sensor.',
        });
      } finally {
        setSenBusy(false);
      }
    }
  }

  async function handleCopyField(field: 'ubicacion' | 'token', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch {
      setCopiedField(null);
    }
  }

  function renderCultivoFormFields(lockedInstalacionLabel?: string) {
    return (
      <>
        <div>
          <label htmlFor="cult-id" className={LABEL_CLASS}>
            Código cultivo
          </label>
          <input
            id="cult-id"
            type="text"
            value={cultIdCultivo}
            onChange={(e) => {
              setCultIdCultivo(e.target.value);
              setCultErrors((p) => ({ ...p, id_cultivo: false }));
            }}
            placeholder="CUL-001"
            className={inputClass(cultErrors.id_cultivo)}
          />
        </div>

        <div>
          <label htmlFor="cult-sistema" className={LABEL_CLASS}>
            Instalación
          </label>
          {lockedInstalacionLabel ? (
            <div className="inline-flex w-full items-center gap-2 rounded-2xl bg-[#E2EFE6] px-4 py-2.5 text-sm font-medium text-[#1B432C]">
              <Warehouse className="h-4 w-4 shrink-0" />
              <span className="truncate">{lockedInstalacionLabel}</span>
            </div>
          ) : (
            <CustomSelect
              id="cult-sistema"
              value={cultIdSistema}
              placeholder="Sin asignar (disponible)"
              hasError={cultErrors.id_sistema}
              onChange={(val) => {
                setCultIdSistema(val);
                setCultErrors((p) => ({ ...p, id_sistema: false }));
              }}
              options={[
                { value: '', label: 'Sin asignar (disponible)' },
                ...instalaciones.map((inst) => ({
                  value: inst.id_sistema,
                  code: inst.id_sistema,
                  label: inst.nombre,
                })),
              ]}
            />
          )}
        </div>

        <div>
          <label htmlFor="cult-planta" className={LABEL_CLASS}>
            Planta
          </label>
          <input
            id="cult-planta"
            type="text"
            value={cultNombrePlanta}
            onChange={(e) => {
              setCultNombrePlanta(e.target.value);
              setCultErrors((p) => ({ ...p, nombre_planta: false }));
            }}
            placeholder="Ej. Lechuga Hidropónica"
            className={inputClass(cultErrors.nombre_planta)}
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
            onChange={(e) => {
              setCultFechaSiembra(e.target.value);
              setCultErrors((p) => ({ ...p, fecha_siembra: false }));
            }}
            className={inputClass(cultErrors.fecha_siembra)}
          />
        </div>

        <div>
          <label htmlFor="cult-estado" className={LABEL_CLASS}>
            Estado
          </label>
          <CustomSelect
            id="cult-estado"
            value={cultEstado}
            onChange={(val) => setCultEstado(val as EstadoCultivo)}
            options={ESTADOS_CULTIVO.map((est) => ({
              value: est,
              label: est,
            }))}
          />
        </div>
      </>
    );
  }

  function renderSensorFormFields(lockedInstalacionLabel?: string) {
    return (
      <>
        <div>
          <label htmlFor="sen-id" className={LABEL_CLASS}>
            Código sensor
          </label>
          <input
            id="sen-id"
            type="text"
            value={senIdSensor}
            onChange={(e) => {
              setSenIdSensor(e.target.value);
              setSenErrors((p) => ({ ...p, id_sensor: false }));
            }}
            placeholder="SEN-001"
            className={inputClass(senErrors.id_sensor)}
          />
        </div>

        <div>
          <label htmlFor="sen-sistema" className={LABEL_CLASS}>
            Instalación
          </label>
          {lockedInstalacionLabel ? (
            <div className="inline-flex w-full items-center gap-2 rounded-2xl bg-[#E2EFE6] px-4 py-2.5 text-sm font-medium text-[#1B432C]">
              <Warehouse className="h-4 w-4 shrink-0" />
              <span className="truncate">{lockedInstalacionLabel}</span>
            </div>
          ) : (
            <CustomSelect
              id="sen-sistema"
              value={senIdSistema}
              placeholder="Sin asignar (disponible)"
              hasError={senErrors.id_sistema}
              onChange={(val) => {
                setSenIdSistema(val);
                setSenErrors((p) => ({ ...p, id_sistema: false }));
              }}
              options={[
                { value: '', label: 'Sin asignar (disponible)' },
                ...instalaciones.map((inst) => ({
                  value: inst.id_sistema,
                  code: inst.id_sistema,
                  label: inst.nombre,
                })),
              ]}
            />
          )}
        </div>

        <div>
          <label htmlFor="sen-var" className={LABEL_CLASS}>
            Tipo de variable
          </label>
          <CustomSelect
            id="sen-var"
            value={senTipoVariable}
            onChange={(val) => setSenTipoVariable(val as TipoVariable)}
            options={TIPOS_VARIABLE.map((tv) => ({
              value: tv,
              label: formatVariableLabel(tv),
            }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sen-min" className={LABEL_CLASS}>
              Umbral mínimo ({UNIDAD_POR_VARIABLE[senTipoVariable] === 'Lmin' ? 'L/min' : UNIDAD_POR_VARIABLE[senTipoVariable]})
            </label>
            <input
              id="sen-min"
              type="number"
              step="any"
              value={senUmbralMin}
              onChange={(e) => {
                setSenUmbralMin(e.target.value);
                setSenErrors((p) => ({ ...p, umbral_min: false }));
              }}
              className={inputClass(senErrors.umbral_min)}
            />
          </div>
          <div>
            <label htmlFor="sen-max" className={LABEL_CLASS}>
              Umbral máximo ({UNIDAD_POR_VARIABLE[senTipoVariable] === 'Lmin' ? 'L/min' : UNIDAD_POR_VARIABLE[senTipoVariable]})
            </label>
            <input
              id="sen-max"
              type="number"
              step="any"
              value={senUmbralMax}
              onChange={(e) => {
                setSenUmbralMax(e.target.value);
                setSenErrors((p) => ({ ...p, umbral_max: false }));
              }}
              className={inputClass(senErrors.umbral_max)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="sen-estado" className={LABEL_CLASS}>
            Estado
          </label>
          <CustomSelect
            id="sen-estado"
            value={senEstado}
            onChange={(val) => setSenEstado(val as EstadoSensor)}
            options={ESTADOS_SENSOR.map((est) => ({
              value: est,
              label: est,
            }))}
          />
        </div>
      </>
    );
  }

  const activeFeedback =
    activeTab === 'instalaciones'
      ? instFeedback
      : activeTab === 'cultivos'
        ? cultFeedback
        : senFeedback;

  const isEditingCurrent =
    (activeTab === 'instalaciones' && Boolean(editingInstId)) ||
    (activeTab === 'cultivos' && Boolean(editingCultId)) ||
    (activeTab === 'sensores' && Boolean(editingSenId));

  const drawerTitle =
    activeTab === 'instalaciones'
      ? editingInstId
        ? 'Editar Instalación'
        : 'Nueva Instalación'
      : activeTab === 'cultivos'
        ? editingCultId
          ? 'Editar Cultivo'
          : 'Nuevo Cultivo'
        : editingSenId
          ? 'Editar Sensor'
          : 'Nuevo Sensor';

  return (
    <section className="space-y-6">
      {/* Cabecera + Botón único de creación (Admin) o Badge RBAC (Lectura) */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Gestión de Operaciones
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Administra tus invernaderos, especies sembradas y sensores activos en campo
          </p>
        </div>

        {isAdmin ? (
          <button
            type="button"
            onClick={openCreateDrawer}
            className="inline-flex items-center gap-2 self-start rounded-xl bg-[#00753A] px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-[#00612F] sm:self-auto"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {CREATE_LABEL[activeTab]}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border-0 bg-[#F4F6F5] px-3.5 py-1.5 text-xs font-medium text-slate-600 sm:self-auto">
            <Lock className="h-3.5 w-3.5 text-slate-500" />
            Consulta operativa · Solo lectura
          </span>
        )}
      </div>

      {/* Barra de pestañas segmentada + Buscador rápido */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Entidades del ecosistema"
          className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1"
        >
        {(
          [
            {
              id: 'instalaciones',
              label: 'Instalaciones',
              count: instalaciones.length,
              icon: Warehouse,
            },
            { id: 'cultivos', label: 'Cultivos', count: cultivos.length, icon: Sprout },
            { id: 'sensores', label: 'Sensores', count: sensores.length, icon: Cpu },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveTab(tab.id);
                setDrawerOpen(false);
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all ${
                active
                  ? 'bg-white font-semibold text-slate-900 shadow-xs'
                  : 'font-medium text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-[#00753A]' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                  active ? 'bg-[#00753A]/10 text-[#00753A]' : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
        </div>

        <div className="flex w-full items-center gap-2 rounded-2xl border-0 bg-[#F4F6F5] px-3.5 py-2 transition-all focus-within:bg-white focus-within:shadow-xs sm:w-72">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, código o ubicación..."
            aria-label="Buscar registros"
            className="w-full border-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
              className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {subscriptionError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {subscriptionError}
        </p>
      )}

      {activeFeedback && !drawerOpen && (
        <p
          role={activeFeedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            activeFeedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {activeFeedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00753A]" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          )}
          {activeFeedback.text}
        </p>
      )}

      {/* ==================== TAB 1: INSTALACIONES ==================== */}
      {activeTab === 'instalaciones' && (
        <div className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
          {initialLoading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : instalaciones.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">
                No hay instalaciones registradas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Ubicación</th>
                    <th className="px-4 py-3">Resumen</th>
                    <th className="px-4 py-3">Estado</th>
                    {isAdmin && <th className="px-4 py-3 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {instalaciones
                    .filter((inst) => {
                      const q = searchQuery
                        .trim()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                      if (!q) return true;
                      const hay = `${inst.id_sistema} ${inst.nombre} ${inst.ubicacion_descifrada ?? ''}`
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                      return hay.includes(q);
                    })
                    .map((inst) => {
                    const cultivosCount = cultivos.filter(
                      (c) => c.id_sistema === inst.id_sistema,
                    ).length;
                    const sensoresCount = sensores.filter(
                      (s) => s.id_sistema === inst.id_sistema,
                    ).length;
                    return (
                    <tr
                      key={inst.id}
                      onClick={() => openInstalacionDetail(inst.id_sistema)}
                      className="cursor-pointer transition-colors hover:bg-[#F4F6F5]/70"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-sans font-medium text-slate-800 tabular-nums">
                        {inst.id_sistema}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{inst.nombre}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {inst.ubicacion_descifrada ?? 'Cargando...'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openInstalacionDetail(inst.id_sistema);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F6F5] px-3 py-1 font-medium text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C]"
                        >
                          <span>
                            {cultivosCount > 0 || !isAdmin
                              ? `${cultivosCount} ${cultivosCount === 1 ? 'cultivo' : 'cultivos'}`
                              : '+ Añadir cultivo'}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span>
                            {sensoresCount > 0 || !isAdmin
                              ? `${sensoresCount} ${sensoresCount === 1 ? 'sensor' : 'sensores'}`
                              : '+ Añadir sensor'}
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            inst.estado_conexion === 'En línea'
                              ? 'bg-[#E2EFE6] text-[#1B432C]'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {inst.estado_conexion}
                        </span>
                      </td>
                      {isAdmin && (
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="whitespace-nowrap px-4 py-3 text-right"
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingInstId(inst.id);
                                setInstIdSistema(inst.id_sistema);
                                setInstNombre(inst.nombre);
                                setInstUbicacion(inst.ubicacion_descifrada ?? '');
                                setInstEstado(inst.estado_conexion);
                                setInstErrors({});
                                setInstFeedback(null);
                                setDrawerOpen(true);
                              }}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border-0 bg-[#F4F6F5] px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C]"
                              aria-label={`Editar ${inst.id_sistema}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  entity: 'instalaciones',
                                  id: inst.id,
                                  code: inst.id_sistema,
                                  label: inst.nombre,
                                })
                              }
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border-0 bg-[#FDF2F2] px-3 py-1.5 text-xs font-medium text-[#9E2A2B] transition-colors hover:bg-[#F9E2E2]"
                              aria-label={`Eliminar ${inst.id_sistema}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: CULTIVOS ==================== */}
      {activeTab === 'cultivos' && (
        <div className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
          {initialLoading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : cultivos.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No hay cultivos registrados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Instalación</th>
                    <th className="px-4 py-3">Planta</th>
                    <th className="px-4 py-3">Fecha Siembra</th>
                    <th className="px-4 py-3">Estado</th>
                    {isAdmin && <th className="px-4 py-3 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cultivos
                    .filter((cult) => {
                      const q = searchQuery
                        .trim()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                      if (!q) return true;
                      const hay = `${cult.id_cultivo} ${cult.nombre_planta} ${cult.id_sistema} ${getInstalacionNombre(cult.id_sistema)}`
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                      return hay.includes(q);
                    })
                    .map((cult) => (
                    <tr key={cult.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-sans font-medium text-slate-800 tabular-nums">
                        {cult.id_cultivo}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {cult.id_sistema ? (
                          <span className="font-sans font-medium text-slate-800 tabular-nums">
                            {cult.id_sistema}
                            <span className="font-normal text-slate-500">
                              {' '}
                              · {getInstalacionNombre(cult.id_sistema)}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{cult.nombre_planta}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 tabular-nums">
                        {cult.fecha_siembra}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            cult.estado === 'Activo'
                              ? 'bg-[#E2EFE6] text-[#1B432C]'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {cult.estado}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCultId(cult.id);
                                setCultIdCultivo(cult.id_cultivo);
                                setCultIdSistema(cult.id_sistema);
                                setCultNombrePlanta(cult.nombre_planta);
                                setCultFechaSiembra(cult.fecha_siembra);
                                setCultEstado(cult.estado);
                                setCultErrors({});
                                setCultFeedback(null);
                                setDrawerOpen(true);
                              }}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border-0 bg-[#F4F6F5] px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C]"
                              aria-label={`Editar ${cult.id_cultivo}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  entity: 'cultivos',
                                  id: cult.id,
                                  code: cult.id_cultivo,
                                  label: cult.nombre_planta,
                                })
                              }
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border-0 bg-[#FDF2F2] px-3 py-1.5 text-xs font-medium text-[#9E2A2B] transition-colors hover:bg-[#F9E2E2]"
                              aria-label={`Eliminar ${cult.id_cultivo}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: SENSORES ==================== */}
      {activeTab === 'sensores' && (
        <div className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
          {initialLoading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : sensores.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No hay sensores registrados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Instalación</th>
                    <th className="px-4 py-3">Variable</th>
                    <th className="px-4 py-3">Rango Umbral</th>
                    <th className="px-4 py-3">Estado</th>
                    {isAdmin && <th className="px-4 py-3 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sensores
                    .filter((sen) => {
                      const q = searchQuery
                        .trim()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                      if (!q) return true;
                      const hay = `${sen.id_sensor} ${formatVariableLabel(sen.tipo_variable)} ${sen.id_sistema} ${getInstalacionNombre(sen.id_sistema)}`
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                      return hay.includes(q);
                    })
                    .map((sen) => (
                    <tr key={sen.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-sans font-medium text-slate-800 tabular-nums">
                        {sen.id_sensor}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {sen.id_sistema ? (
                          <span className="font-sans font-medium text-slate-800 tabular-nums">
                            {sen.id_sistema}
                            <span className="font-normal text-slate-500">
                              {' '}
                              · {getInstalacionNombre(sen.id_sistema)}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatVariableLabel(sen.tipo_variable)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 tabular-nums">
                        {sen.umbral_min} – {sen.umbral_max}{' '}
                        {sen.unidad === 'Lmin' ? 'L/min' : sen.unidad}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            sen.estado === 'Activo'
                              ? 'bg-[#E2EFE6] text-[#1B432C]'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {sen.estado}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSenId(sen.id);
                                setSenIdSensor(sen.id_sensor);
                                setSenIdSistema(sen.id_sistema);
                                setSenTipoVariable(sen.tipo_variable);
                                setSenUmbralMin(String(sen.umbral_min));
                                setSenUmbralMax(String(sen.umbral_max));
                                setSenEstado(sen.estado);
                                setSenErrors({});
                                setSenFeedback(null);
                                setDrawerOpen(true);
                              }}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border-0 bg-[#F4F6F5] px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C]"
                              aria-label={`Editar ${sen.id_sensor}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  entity: 'sensores',
                                  id: sen.id,
                                  code: sen.id_sensor,
                                  label: `${formatVariableLabel(sen.tipo_variable)} (${sen.id_sistema})`,
                                })
                              }
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border-0 bg-[#FDF2F2] px-3 py-1.5 text-xs font-medium text-[#9E2A2B] transition-colors hover:bg-[#F9E2E2]"
                              aria-label={`Eliminar ${sen.id_sensor}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== MODAL FLOTANTE BOTÁNICO (CREAR / EDITAR) ==================== */}
      {isAdmin && isModalMounted && (
        <div
          onClick={() => setDrawerOpen(false)}
          className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[2px] ${
            isModalClosing ? 'animate-backdrop-out pointer-events-none' : 'animate-backdrop-in'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crud-drawer-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-3xl border-0 bg-white shadow-2xl ${
              showInitialCultivos || showInitialSensores
                ? 'max-h-[90vh] overflow-y-auto'
                : 'overflow-visible'
            } ${
              isModalClosing ? 'animate-modal-out pointer-events-none' : 'animate-modal-in'
            }`}
          >
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E2EFE6] text-[#1B432C]">
                  {activeTab === 'instalaciones' && <Warehouse className="h-5 w-5" />}
                  {activeTab === 'cultivos' && <Sprout className="h-5 w-5" />}
                  {activeTab === 'sensores' && <Cpu className="h-5 w-5" />}
                </div>
                <div>
                  <h3 id="crud-drawer-title" className="text-lg font-bold text-slate-900">
                    {drawerTitle}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeTab === 'instalaciones' &&
                      'Configura los datos generales y estado de tu invernadero'}
                    {activeTab === 'cultivos' &&
                      'Asocia una especie sembrada y su fecha de inicio'}
                    {activeTab === 'sensores' &&
                      'Define la variable a medir y sus umbrales operativos'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar panel"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4F6F5] text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pb-2">
            {activeFeedback && activeFeedback.type === 'error' && (
              <p
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
              >
                {activeFeedback.text}
              </p>
            )}

            {activeTab === 'instalaciones' && (
              <form id="crud-drawer-form" onSubmit={handleInstSubmit} className="space-y-4">
                <div>
                  <label htmlFor="inst-id-sistema" className={LABEL_CLASS}>
                    Código de instalación
                  </label>
                  <input
                    id="inst-id-sistema"
                    type="text"
                    value={instIdSistema}
                    onChange={(e) => {
                      setInstIdSistema(e.target.value);
                      setInstErrors((p) => ({ ...p, id_sistema: false }));
                    }}
                    placeholder="AQP-001"
                    className={inputClass(instErrors.id_sistema)}
                  />
                </div>

                <div>
                  <label htmlFor="inst-nombre" className={LABEL_CLASS}>
                    Nombre
                  </label>
                  <input
                    id="inst-nombre"
                    type="text"
                    value={instNombre}
                    onChange={(e) => {
                      setInstNombre(e.target.value);
                      setInstErrors((p) => ({ ...p, nombre: false }));
                    }}
                    placeholder="Ej. Invernadero Norte"
                    className={inputClass(instErrors.nombre)}
                  />
                </div>

                <div>
                  <label htmlFor="inst-ubicacion" className={LABEL_CLASS}>
                    Ubicación
                  </label>
                  <input
                    id="inst-ubicacion"
                    type="text"
                    value={instUbicacion}
                    onChange={(e) => {
                      setInstUbicacion(e.target.value);
                      setInstErrors((p) => ({ ...p, ubicacion: false }));
                    }}
                    placeholder="Ej. Sector Norte · Módulo 1"
                    className={inputClass(instErrors.ubicacion)}
                  />
                </div>

                <div>
                  <label htmlFor="inst-estado" className={LABEL_CLASS}>
                    Estado de conexión
                  </label>
                  <CustomSelect
                    id="inst-estado"
                    value={instEstado}
                    onChange={(val) => setInstEstado(val as EstadoConexion)}
                    options={ESTADOS_CONEXION.map((est) => ({
                      value: est,
                      label: est,
                    }))}
                  />
                </div>

                {!editingInstId && (
                  <div className="space-y-3 pt-2">
                    {/* Cultivos iniciales */}
                    <div className="rounded-2xl bg-[#F4F6F5]/70 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setShowInitialCultivos((v) => !v)}
                          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800"
                        >
                          <Sprout className="h-4 w-4 text-[#00753A]" />
                          <span>Cultivos iniciales ({initialCultivos.length})</span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                              showInitialCultivos ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => openSubModalCultivo('new-inst')}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#00753A] shadow-2xs transition-colors hover:bg-[#E2EFE6]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Añadir cultivo
                        </button>
                      </div>

                      {showInitialCultivos && (
                        <div className="mt-3 space-y-2">
                          {initialCultivos.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              Opcional: agrega cultivos completos antes de guardar el invernadero.
                            </p>
                          ) : (
                            initialCultivos.map((draft, idx) => (
                              <div
                                key={draft.tempId}
                                className="flex items-center justify-between gap-3 rounded-2xl bg-[#F4F6F5] p-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-900">
                                    <span className="text-[#1B432C] tabular-nums">
                                      {draft.id_cultivo}
                                    </span>{' '}
                                    · {draft.nombre_planta}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                                    Siembra: {draft.fecha_siembra} · {draft.estado}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openSubModalCultivo('new-inst', idx)}
                                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C]"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setInitialCultivos((prev) =>
                                        prev.filter((_, i) => i !== idx),
                                      )
                                    }
                                    aria-label="Quitar cultivo inicial"
                                    className="rounded-full px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-[#FDF2F2] hover:text-[#9E2A2B]"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sensores iniciales */}
                    <div className="rounded-2xl bg-[#F4F6F5]/70 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setShowInitialSensores((v) => !v)}
                          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800"
                        >
                          <Cpu className="h-4 w-4 text-[#00753A]" />
                          <span>Sensores iniciales ({initialSensores.length})</span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                              showInitialSensores ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => openSubModalSensor('new-inst')}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#00753A] shadow-2xs transition-colors hover:bg-[#E2EFE6]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Añadir sensor
                        </button>
                      </div>

                      {showInitialSensores && (
                        <div className="mt-3 space-y-2">
                          {initialSensores.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              Opcional: configura sensores con sus umbrales desde el inicio.
                            </p>
                          ) : (
                            initialSensores.map((draft, idx) => (
                              <div
                                key={draft.tempId}
                                className="flex items-center justify-between gap-3 rounded-2xl bg-[#F4F6F5] p-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-900">
                                    <span className="text-[#1B432C] tabular-nums">
                                      {draft.id_sensor}
                                    </span>{' '}
                                    · {formatVariableLabel(draft.tipo_variable)}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                                    Rango: {draft.umbral_min} – {draft.umbral_max}{' '}
                                    {UNIDAD_POR_VARIABLE[draft.tipo_variable] === 'Lmin'
                                      ? 'L/min'
                                      : UNIDAD_POR_VARIABLE[draft.tipo_variable]}{' '}
                                    · {draft.estado}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openSubModalSensor('new-inst', idx)}
                                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-[#E2EFE6] hover:text-[#1B432C]"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setInitialSensores((prev) =>
                                        prev.filter((_, i) => i !== idx),
                                      )
                                    }
                                    aria-label="Quitar sensor inicial"
                                    className="rounded-full px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-[#FDF2F2] hover:text-[#9E2A2B]"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </form>
            )}

            {activeTab === 'cultivos' && (
              <form id="crud-drawer-form" onSubmit={handleCultSubmit} className="space-y-4">
                {renderCultivoFormFields()}
              </form>
            )}

            {activeTab === 'sensores' && (
              <form id="crud-drawer-form" onSubmit={handleSenSubmit} className="space-y-4">
                <div>
                  <label htmlFor="sen-id" className={LABEL_CLASS}>
                    Código sensor
                  </label>
                  <input
                    id="sen-id"
                    type="text"
                    value={senIdSensor}
                    onChange={(e) => {
                      setSenIdSensor(e.target.value);
                      setSenErrors((p) => ({ ...p, id_sensor: false }));
                    }}
                    placeholder="SEN-001"
                    className={inputClass(senErrors.id_sensor)}
                  />
                </div>

                <div>
                  <label htmlFor="sen-sistema" className={LABEL_CLASS}>
                    Instalación
                  </label>
                  <CustomSelect
                    id="sen-sistema"
                    value={senIdSistema}
                    placeholder="Sin asignar (disponible)"
                    hasError={senErrors.id_sistema}
                    onChange={(val) => {
                      setSenIdSistema(val);
                      setSenErrors((p) => ({ ...p, id_sistema: false }));
                    }}
                    options={[
                      { value: '', label: 'Sin asignar (disponible)' },
                      ...instalaciones.map((inst) => ({
                        value: inst.id_sistema,
                        code: inst.id_sistema,
                        label: inst.nombre,
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label htmlFor="sen-var" className={LABEL_CLASS}>
                    Variable
                  </label>
                  <CustomSelect
                    id="sen-var"
                    value={senTipoVariable}
                    onChange={(val) => setSenTipoVariable(val as TipoVariable)}
                    options={TIPOS_VARIABLE.map((v) => ({
                      value: v,
                      label: `${formatVariableLabel(v)} (${UNIDAD_POR_VARIABLE[v]})`,
                    }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="sen-min" className={LABEL_CLASS}>
                      Umbral Mínimo
                    </label>
                    <input
                      id="sen-min"
                      type="number"
                      step="any"
                      value={senUmbralMin}
                      onChange={(e) => {
                        setSenUmbralMin(e.target.value);
                        setSenErrors((p) => ({ ...p, umbral_min: false }));
                      }}
                      className={inputClass(senErrors.umbral_min)}
                    />
                  </div>

                  <div>
                    <label htmlFor="sen-max" className={LABEL_CLASS}>
                      Umbral Máximo
                    </label>
                    <input
                      id="sen-max"
                      type="number"
                      step="any"
                      value={senUmbralMax}
                      onChange={(e) => {
                        setSenUmbralMax(e.target.value);
                        setSenErrors((p) => ({ ...p, umbral_max: false }));
                      }}
                      className={inputClass(senErrors.umbral_max)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="sen-estado" className={LABEL_CLASS}>
                    Estado
                  </label>
                  <CustomSelect
                    id="sen-estado"
                    value={senEstado}
                    onChange={(val) => setSenEstado(val as EstadoSensor)}
                    options={ESTADOS_SENSOR.map((est) => ({
                      value: est,
                      label: est,
                    }))}
                  />
                </div>
              </form>
            )}
          </div>

            <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-6">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-2xl border-0 bg-[#F4F6F5] px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200/70"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="crud-drawer-form"
                disabled={instBusy || cultBusy || senBusy}
                className={`rounded-2xl px-5 py-2.5 text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 ${
                  isEditingCurrent
                    ? 'bg-[#E6A608] text-slate-950 hover:bg-[#d49606]'
                    : 'bg-[#00753A] text-white hover:bg-[#00612F]'
                }`}
              >
                {instBusy || cultBusy || senBusy
                  ? 'Guardando...'
                  : isEditingCurrent
                    ? 'Actualizar registro'
                    : activeTab === 'instalaciones'
                      ? 'Guardar instalación'
                      : 'Guardar registro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE INSPECCIÓN CRIPTOGRÁFICA AES-GCM */}
      {cryptoInspectInst && (
        <div
          onClick={() => setCryptoInspectInst(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="aes-modal-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Lock className="h-5 w-5 text-[#00753A]" />
                <h3 id="aes-modal-title" className="text-base font-bold text-slate-900">
                  Inspección Criptográfica AES-GCM
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCryptoInspectInst(null)}
                aria-label="Cerrar inspección criptográfica"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-slate-500">Instalación</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900">
                  {cryptoInspectInst.id_sistema} — {cryptoInspectInst.nombre}
                </p>
              </div>

              <div>
                <p className="mb-1 font-semibold text-slate-700">
                  Ubicación descifrada (en memoria)
                </p>
                <p className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-slate-900">
                  {cryptoInspectInst.ubicacion_descifrada ?? 'No disponible'}
                </p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-semibold text-slate-700">
                    Payload cifrado (`ubicacion_cifrada`)
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyField('ubicacion', cryptoInspectInst.ubicacion_cifrada)
                    }
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[#00753A] hover:bg-emerald-50"
                  >
                    {copiedField === 'ubicacion' ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copiar
                      </>
                    )}
                  </button>
                </div>
                <p className="break-all rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-700">
                  {cryptoInspectInst.ubicacion_cifrada}
                </p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-semibold text-slate-700">
                    Token cifrado (`token_dispositivo_cifrado`)
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyField('token', cryptoInspectInst.token_dispositivo_cifrado)
                    }
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[#00753A] hover:bg-emerald-50"
                  >
                    {copiedField === 'token' ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copiar
                      </>
                    )}
                  </button>
                </div>
                <p className="break-all rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-700">
                  {cryptoInspectInst.token_dispositivo_cifrado}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN ACCESIBLE */}
      {deleteTarget && (
        <div
          onClick={() => {
            if (!deleteBusy) setDeleteTarget(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="delete-modal-title" className="text-base font-bold text-slate-900">
                  Confirmar eliminación
                </h3>
                <p className="mt-1.5 text-sm text-slate-600">
                  ¿Estás seguro de eliminar{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {deleteTarget.code}
                  </span>{' '}
                  ({deleteTarget.label})? Esta acción se registrará en la bitácora inmutable.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void handleConfirmDelete()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? 'Eliminando...' : 'Eliminar registro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL CONTEXTUAL DE DETALLE DE INSTALACIÓN ==================== */}
      {isDetailMounted && activeDetailInst && (() => {
        const detailTargetInst = activeDetailInst;
        const assignedCultivos = cultivos.filter((c) => c.id_sistema === detailTargetInst.id_sistema);
        const freeCultivos = cultivos.filter((c) => !c.id_sistema);
        const occupiedCultivos = cultivos.filter(
          (c) => Boolean(c.id_sistema) && c.id_sistema !== detailTargetInst.id_sistema,
        );

        const assignedSensores = sensores.filter((s) => s.id_sistema === detailTargetInst.id_sistema);
        const freeSensores = sensores.filter((s) => !s.id_sistema);
        const occupiedSensores = sensores.filter(
          (s) => Boolean(s.id_sistema) && s.id_sistema !== detailTargetInst.id_sistema,
        );

        return (
          <div
            onClick={() => setDetailInstIdSistema(null)}
            className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[2px] ${
              isDetailClosing ? 'animate-backdrop-out pointer-events-none' : 'animate-backdrop-in'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-modal-title"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border-0 bg-white shadow-2xl ${
                isDetailClosing ? 'animate-modal-out pointer-events-none' : 'animate-modal-in'
              }`}
            >
              {/* Cabecera */}
              <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E2EFE6] text-[#1B432C]">
                    <Warehouse className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id="detail-modal-title" className="text-lg font-bold text-slate-900">
                        {detailTargetInst.nombre}
                      </h3>
                      <span className="rounded-full bg-[#F4F6F5] px-2.5 py-0.5 text-xs font-medium text-slate-700 tabular-nums">
                        {detailTargetInst.id_sistema}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {detailTargetInst.ubicacion_descifrada ?? 'Sin ubicación'} · Gestiona los cultivos y
                      sensores asignados a este espacio
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailInstIdSistema(null)}
                  aria-label="Cerrar detalle de instalación"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4F6F5] text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 px-6 pb-6">
                {detailFeedback && (
                  <p
                    role={detailFeedback.type === 'error' ? 'alert' : 'status'}
                    className={`rounded-2xl border-0 px-4 py-3 text-xs font-medium ${
                      detailFeedback.type === 'error'
                        ? 'bg-[#FDF7F7] text-[#9E2A2B]'
                        : 'bg-[#E2EFE6] text-[#1B432C]'
                    }`}
                  >
                    {detailFeedback.text}
                  </p>
                )}

                {/* SECCIÓN 1: CULTIVOS ASIGNADOS */}
                <div className="rounded-2xl bg-[#F4F6F5]/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sprout className="h-4 w-4 text-[#00753A]" />
                      <h4 className="text-sm font-semibold text-slate-900">
                        Cultivos asignados ({assignedCultivos.length})
                      </h4>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => openSubModalCultivo('detail-inst')}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#00753A] shadow-2xs transition-colors hover:bg-[#E2EFE6]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Crear nuevo aquí
                      </button>
                    )}
                  </div>

                  {assignedCultivos.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">
                      No hay cultivos asignados a esta instalación todavía.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {assignedCultivos.map((cult) => (
                        <div
                          key={cult.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">
                              <span className="font-sans font-medium text-slate-800 tabular-nums">
                                {cult.id_cultivo}
                              </span>{' '}
                              · {cult.nombre_planta}
                            </p>
                            <p className="text-xs text-slate-500 tabular-nums">
                              Siembra: {cult.fecha_siembra} · {cult.estado}
                            </p>
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              disabled={detailBusy}
                              onClick={() => void handleUnlinkCultivo(cult)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-[#FDF2F2] hover:text-[#9E2A2B] disabled:opacity-50"
                            >
                              <Unlink className="h-3 w-3" />
                              Desvincular
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="mt-3 space-y-2 border-t border-slate-200/60 pt-3">
                      <p className="text-xs font-medium text-slate-600">
                        Vincular cultivo existente disponible
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex-1">
                          <CustomSelect
                            value={linkCultId}
                            placeholder={
                              freeCultivos.length > 0
                                ? 'Selecciona un cultivo libre'
                                : 'No hay cultivos libres disponibles'
                            }
                            onChange={setLinkCultId}
                            options={freeCultivos.map((c) => ({
                              value: c.id,
                              code: c.id_cultivo,
                              label: c.nombre_planta,
                            }))}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!linkCultId || detailBusy}
                          onClick={() => void handleLinkExistingCultivo()}
                          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#00753A] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#00612F] disabled:opacity-40"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Vincular
                        </button>
                      </div>
                      {occupiedCultivos.length > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowOccupiedCultivos((v) => !v)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-800"
                          >
                            <span>
                              {occupiedCultivos.length}{' '}
                              {occupiedCultivos.length === 1
                                ? 'cultivo asignado a otra instalación'
                                : 'cultivos asignados a otras instalaciones'}
                            </span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                showOccupiedCultivos ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          {showOccupiedCultivos && (
                            <div className="custom-scrollbar mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-2xl bg-[#F4F6F5] p-2.5">
                              {occupiedCultivos.map((c) => (
                                <span
                                  key={c.id}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600 shadow-[0_1px_4px_rgba(15,23,42,0.03)]"
                                >
                                  <span className="font-semibold text-[#1B432C] tabular-nums">
                                    {c.id_cultivo}
                                  </span>
                                  <span>·</span>
                                  <span>{getInstalacionNombre(c.id_sistema)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* SECCIÓN 2: SENSORES ASIGNADOS */}
                <div className="rounded-2xl bg-[#F4F6F5]/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-[#00753A]" />
                      <h4 className="text-sm font-semibold text-slate-900">
                        Sensores asignados ({assignedSensores.length})
                      </h4>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => openSubModalSensor('detail-inst')}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#00753A] shadow-2xs transition-colors hover:bg-[#E2EFE6]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Crear nuevo aquí
                      </button>
                    )}
                  </div>

                  {assignedSensores.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">
                      No hay sensores asignados a esta instalación todavía.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {assignedSensores.map((sen) => (
                        <div
                          key={sen.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">
                              <span className="font-sans font-medium text-slate-800 tabular-nums">
                                {sen.id_sensor}
                              </span>{' '}
                              · {formatVariableLabel(sen.tipo_variable)}
                            </p>
                            <p className="text-xs text-slate-500 tabular-nums">
                              Rango: {sen.umbral_min} – {sen.umbral_max}{' '}
                              {sen.unidad === 'Lmin' ? 'L/min' : sen.unidad} · {sen.estado}
                            </p>
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              disabled={detailBusy}
                              onClick={() => void handleUnlinkSensor(sen)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-[#FDF2F2] hover:text-[#9E2A2B] disabled:opacity-50"
                            >
                              <Unlink className="h-3 w-3" />
                              Desvincular
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="mt-3 space-y-2 border-t border-slate-200/60 pt-3">
                      <p className="text-xs font-medium text-slate-600">
                        Vincular sensor existente disponible
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex-1">
                          <CustomSelect
                            value={linkSenId}
                            placeholder={
                              freeSensores.length > 0
                                ? 'Selecciona un sensor libre'
                                : 'No hay sensores libres disponibles'
                            }
                            onChange={setLinkSenId}
                            options={freeSensores.map((s) => ({
                              value: s.id,
                              code: s.id_sensor,
                              label: formatVariableLabel(s.tipo_variable),
                            }))}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!linkSenId || detailBusy}
                          onClick={() => void handleLinkExistingSensor()}
                          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#00753A] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#00612F] disabled:opacity-40"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Vincular
                        </button>
                      </div>
                      {occupiedSensores.length > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowOccupiedSensores((v) => !v)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-800"
                          >
                            <span>
                              {occupiedSensores.length}{' '}
                              {occupiedSensores.length === 1
                                ? 'sensor asignado a otra instalación'
                                : 'sensores asignados a otras instalaciones'}
                            </span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                showOccupiedSensores ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          {showOccupiedSensores && (
                            <div className="custom-scrollbar mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-2xl bg-[#F4F6F5] p-2.5">
                              {occupiedSensores.map((s) => (
                                <span
                                  key={s.id}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600 shadow-[0_1px_4px_rgba(15,23,42,0.03)]"
                                >
                                  <span className="font-semibold text-[#1B432C] tabular-nums">
                                    {s.id_sensor}
                                  </span>
                                  <span>·</span>
                                  <span>{getInstalacionNombre(s.id_sistema)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================== SUB-MODAL APILADO (z-[60] EN PORTAL) CULTIVO / SENSOR ==================== */}
      {isAdmin &&
        isSubModalMounted &&
        activeSubModal &&
        createPortal(
          <div
            onClick={() => setSubModal(null)}
            className={`fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px] ${
              isSubModalClosing ? 'animate-backdrop-out pointer-events-none' : 'animate-backdrop-in'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sub-modal-title"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-lg overflow-visible rounded-3xl border-0 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] ${
                isSubModalClosing ? 'animate-modal-out pointer-events-none' : 'animate-modal-in'
              }`}
            >
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E2EFE6] text-[#1B432C]">
                  {activeSubModal.type === 'cultivo' ? (
                    <Sprout className="h-5 w-5" />
                  ) : (
                    <Cpu className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 id="sub-modal-title" className="text-lg font-bold text-slate-900">
                    {activeSubModal.type === 'cultivo'
                      ? activeSubModal.editIndex !== undefined
                        ? 'Editar cultivo inicial'
                        : 'Añadir cultivo'
                      : activeSubModal.editIndex !== undefined
                        ? 'Editar sensor inicial'
                        : 'Añadir sensor'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeSubModal.type === 'cultivo'
                      ? 'Completa los datos de la especie sembrada y su fecha de inicio'
                      : 'Define la variable a medir y sus umbrales operativos'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubModal(null)}
                aria-label="Cerrar sub-modal"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4F6F5] text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pb-2">
              {((activeSubModal.type === 'cultivo' && cultFeedback?.type === 'error') ||
                (activeSubModal.type === 'sensor' && senFeedback?.type === 'error')) && (
                <p
                  role="alert"
                  className="mb-4 rounded-2xl border-0 bg-[#FDF7F7] px-4 py-3 text-xs font-medium text-[#9E2A2B]"
                >
                  {activeSubModal.type === 'cultivo' ? cultFeedback?.text : senFeedback?.text}
                </p>
              )}

              <form id="crud-submodal-form" onSubmit={handleSubModalSubmit} className="space-y-4">
                {activeSubModal.editIndex === undefined && (
                  <div className="inline-flex rounded-xl bg-[#F4F6F5] p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setSubModalMode('create')}
                      className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                        subModalMode === 'create'
                          ? 'bg-white font-semibold text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Crear nuevo
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubModalMode('link')}
                      className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                        subModalMode === 'link'
                          ? 'bg-white font-semibold text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Vincular disponible
                    </button>
                  </div>
                )}

                {subModalMode === 'link' && activeSubModal.editIndex === undefined ? (
                  (() => {
                    const freeList =
                      activeSubModal.type === 'cultivo'
                        ? cultivos
                            .filter((c) => !c.id_sistema)
                            .map((c) => ({
                              value: c.id,
                              code: c.id_cultivo,
                              label: c.nombre_planta,
                            }))
                        : sensores
                            .filter((s) => !s.id_sistema)
                            .map((s) => ({
                              value: s.id,
                              code: s.id_sensor,
                              label: formatVariableLabel(s.tipo_variable),
                            }));
                    return (
                      <div className="space-y-2">
                        <label className={LABEL_CLASS}>
                          {activeSubModal.type === 'cultivo'
                            ? 'Cultivo disponible sin instalación'
                            : 'Sensor disponible sin instalación'}
                        </label>
                        <CustomSelect
                          value={subModalLinkId}
                          placeholder={
                            freeList.length > 0
                              ? activeSubModal.type === 'cultivo'
                                ? 'Selecciona un cultivo libre'
                                : 'Selecciona un sensor libre'
                              : activeSubModal.type === 'cultivo'
                                ? 'No hay cultivos libres disponibles'
                                : 'No hay sensores libres disponibles'
                          }
                          onChange={setSubModalLinkId}
                          options={freeList}
                        />
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const lockedLabel =
                      activeSubModal.source === 'detail-inst' && detailInst
                        ? `${detailInst.id_sistema} · ${detailInst.nombre}`
                        : `${instIdSistema.trim() || 'Nueva instalación'}${
                            instNombre.trim() ? ` · ${instNombre.trim()}` : ''
                          }`;
                    return activeSubModal.type === 'cultivo'
                      ? renderCultivoFormFields(lockedLabel)
                      : renderSensorFormFields(lockedLabel);
                  })()
                )}
              </form>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-6">
              <button
                type="button"
                onClick={() => setSubModal(null)}
                className="rounded-2xl border-0 bg-[#F4F6F5] px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200/70"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="crud-submodal-form"
                disabled={cultBusy || senBusy}
                className="rounded-2xl bg-[#00753A] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#00612F] disabled:opacity-50"
              >
                {cultBusy || senBusy
                  ? 'Guardando...'
                  : activeSubModal.editIndex !== undefined
                    ? activeSubModal.type === 'cultivo'
                      ? 'Actualizar cultivo'
                      : 'Actualizar sensor'
                    : activeSubModal.type === 'cultivo'
                      ? 'Añadir cultivo'
                      : 'Añadir sensor'}
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </section>
  );
}
