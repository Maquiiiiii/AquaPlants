import { useEffect, useState, type FormEvent } from 'react';
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

  return (
    <section id="gestion-crud">
      <h2>Gestión Operativa del Ecosistema AquaPlants / AquaBrain (CRUD Cloud Firestore)</h2>

      <nav aria-label="Navegación CRUD">
        <a href="#crud-instalaciones">Instalaciones ({instalaciones.length})</a> |{' '}
        <a href="#crud-cultivos">Cultivos ({cultivos.length})</a> |{' '}
        <a href="#crud-sensores">Sensores ({sensores.length})</a>
      </nav>

      {!isAdmin && (
        <p role="status">
          <strong>Modo solo lectura según rol</strong> ({profile?.rol ?? 'Sin perfil'}): las
          operaciones de creación, edición y eliminación están restringidas al rol Administrador.
        </p>
      )}

      {subscriptionError && <p role="alert">{subscriptionError}</p>}

      {/* ==================== 1. INSTALACIONES ==================== */}
      <section id="crud-instalaciones">
        <h3>Gestión de Instalaciones</h3>

        {instFeedback && (
          <p role={instFeedback.type === 'error' ? 'alert' : 'status'}>{instFeedback.text}</p>
        )}

        {isAdmin && (
          <form onSubmit={handleInstSubmit}>
            <fieldset>
              <legend>
                {editingInstId ? 'Editar Instalación Existente' : 'Nueva Instalación AquaPlants'}
              </legend>
              <p>
                <label htmlFor="inst-id-sistema">ID Sistema (único, ej. AQP-001):</label>
                <br />
                <input
                  id="inst-id-sistema"
                  type="text"
                  value={instIdSistema}
                  onChange={(e) => setInstIdSistema(e.target.value)}
                  placeholder="AQP-001"
                  required
                />
              </p>
              <p>
                <label htmlFor="inst-nombre">Nombre de la instalación:</label>
                <br />
                <input
                  id="inst-nombre"
                  type="text"
                  value={instNombre}
                  onChange={(e) => setInstNombre(e.target.value)}
                  placeholder="Invernadero Norte"
                  required
                />
              </p>
              <p>
                <label htmlFor="inst-ubicacion">Ubicación (se cifra con AES-GCM):</label>
                <br />
                <input
                  id="inst-ubicacion"
                  type="text"
                  value={instUbicacion}
                  onChange={(e) => setInstUbicacion(e.target.value)}
                  placeholder="Sector A - Módulo 3"
                  required
                />
              </p>
              <p>
                <label htmlFor="inst-estado">Estado de conexión:</label>
                <br />
                <select
                  id="inst-estado"
                  value={instEstado}
                  onChange={(e) => setInstEstado(e.target.value as EstadoConexion)}
                >
                  {ESTADOS_CONEXION.map((estado) => (
                    <option key={estado} value={estado}>
                      {estado}
                    </option>
                  ))}
                </select>
              </p>
              <p>
                <button type="submit" disabled={instBusy}>
                  {instBusy
                    ? 'Guardando...'
                    : editingInstId
                      ? 'Actualizar Instalación'
                      : 'Crear Instalación'}
                </button>{' '}
                {editingInstId && (
                  <button type="button" onClick={resetInstForm}>
                    Cancelar edición
                  </button>
                )}
              </p>
            </fieldset>
          </form>
        )}

        <table>
          <thead>
            <tr>
              <th>ID Sistema</th>
              <th>Nombre</th>
              <th>Ubicación (Descifrada)</th>
              <th>Evidencia Cifrada en BD (AES-GCM)</th>
              <th>Token Dispositivo (Cifrado)</th>
              <th>Estado Conexión</th>
              <th>Última Comunicación</th>
              {isAdmin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {instalaciones.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7}>No hay instalaciones registradas.</td>
              </tr>
            ) : (
              instalaciones.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code>{item.id_sistema}</code>
                  </td>
                  <td>{item.nombre}</td>
                  <td>{item.ubicacion_descifrada ?? ''}</td>
                  <td>
                    <code>{item.ubicacion_cifrada.slice(0, 28)}...</code>
                  </td>
                  <td>
                    <code>{item.token_dispositivo_cifrado.slice(0, 28)}...</code>
                  </td>
                  <td>{item.estado_conexion}</td>
                  <td>{item.ultima_comunicacion}</td>
                  {isAdmin && (
                    <td>
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
                      >
                        Editar
                      </button>{' '}
                      <button type="button" onClick={() => void handleInstDelete(item)}>
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ==================== 2. CULTIVOS ==================== */}
      <section id="crud-cultivos">
        <h3>Gestión de Cultivos</h3>

        {cultFeedback && (
          <p role={cultFeedback.type === 'error' ? 'alert' : 'status'}>{cultFeedback.text}</p>
        )}

        {isAdmin && (
          <form onSubmit={handleCultSubmit}>
            <fieldset>
              <legend>{editingCultId ? 'Editar Cultivo Existente' : 'Nuevo Cultivo'}</legend>
              <p>
                <label htmlFor="cult-id">ID Cultivo (único, ej. CUL-001):</label>
                <br />
                <input
                  id="cult-id"
                  type="text"
                  value={cultIdCultivo}
                  onChange={(e) => setCultIdCultivo(e.target.value)}
                  placeholder="CUL-001"
                  required
                />
              </p>
              <p>
                <label htmlFor="cult-sistema">Instalación (id_sistema):</label>
                <br />
                <select
                  id="cult-sistema"
                  value={cultIdSistema}
                  onChange={(e) => setCultIdSistema(e.target.value)}
                  required
                >
                  <option value="">-- Selecciona una instalación --</option>
                  {instalaciones.map((inst) => (
                    <option key={inst.id} value={inst.id_sistema}>
                      {inst.id_sistema} — {inst.nombre}
                    </option>
                  ))}
                </select>
              </p>
              <p>
                <label htmlFor="cult-planta">Nombre de planta:</label>
                <br />
                <input
                  id="cult-planta"
                  type="text"
                  value={cultNombrePlanta}
                  onChange={(e) => setCultNombrePlanta(e.target.value)}
                  placeholder="Lechuga Hidropónica"
                  required
                />
              </p>
              <p>
                <label htmlFor="cult-fecha">Fecha de siembra (YYYY-MM-DD):</label>
                <br />
                <input
                  id="cult-fecha"
                  type="date"
                  value={cultFechaSiembra}
                  onChange={(e) => setCultFechaSiembra(e.target.value)}
                  required
                />
              </p>
              <p>
                <label htmlFor="cult-estado">Estado del cultivo:</label>
                <br />
                <select
                  id="cult-estado"
                  value={cultEstado}
                  onChange={(e) => setCultEstado(e.target.value as EstadoCultivo)}
                >
                  {ESTADOS_CULTIVO.map((estado) => (
                    <option key={estado} value={estado}>
                      {estado}
                    </option>
                  ))}
                </select>
              </p>
              <p>
                <button type="submit" disabled={cultBusy}>
                  {cultBusy
                    ? 'Guardando...'
                    : editingCultId
                      ? 'Actualizar Cultivo'
                      : 'Crear Cultivo'}
                </button>{' '}
                {editingCultId && (
                  <button type="button" onClick={resetCultForm}>
                    Cancelar edición
                  </button>
                )}
              </p>
            </fieldset>
          </form>
        )}

        <table>
          <thead>
            <tr>
              <th>ID Cultivo</th>
              <th>ID Sistema</th>
              <th>Nombre de Planta</th>
              <th>Fecha de Siembra</th>
              <th>Estado</th>
              {isAdmin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {cultivos.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5}>No hay cultivos registrados.</td>
              </tr>
            ) : (
              cultivos.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code>{item.id_cultivo}</code>
                  </td>
                  <td>
                    <code>{item.id_sistema}</code>
                  </td>
                  <td>{item.nombre_planta}</td>
                  <td>{item.fecha_siembra}</td>
                  <td>{item.estado}</td>
                  {isAdmin && (
                    <td>
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
                      >
                        Editar
                      </button>{' '}
                      <button type="button" onClick={() => void handleCultDelete(item)}>
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ==================== 3. SENSORES ==================== */}
      <section id="crud-sensores">
        <h3>Gestión de Sensores</h3>

        {senFeedback && (
          <p role={senFeedback.type === 'error' ? 'alert' : 'status'}>{senFeedback.text}</p>
        )}

        {isAdmin && (
          <form onSubmit={handleSenSubmit}>
            <fieldset>
              <legend>{editingSenId ? 'Editar Sensor Existente' : 'Nuevo Sensor AquaBrain'}</legend>
              <p>
                <label htmlFor="sen-id">ID Sensor (único, ej. SEN-001):</label>
                <br />
                <input
                  id="sen-id"
                  type="text"
                  value={senIdSensor}
                  onChange={(e) => setSenIdSensor(e.target.value)}
                  placeholder="SEN-001"
                  required
                />
              </p>
              <p>
                <label htmlFor="sen-sistema">Instalación (id_sistema):</label>
                <br />
                <select
                  id="sen-sistema"
                  value={senIdSistema}
                  onChange={(e) => setSenIdSistema(e.target.value)}
                  required
                >
                  <option value="">-- Selecciona una instalación --</option>
                  {instalaciones.map((inst) => (
                    <option key={inst.id} value={inst.id_sistema}>
                      {inst.id_sistema} — {inst.nombre}
                    </option>
                  ))}
                </select>
              </p>
              <p>
                <label htmlFor="sen-dispositivo">ID Dispositivo (ej. AQUABRAIN-01):</label>
                <br />
                <input
                  id="sen-dispositivo"
                  type="text"
                  value={senIdDispositivo}
                  onChange={(e) => setSenIdDispositivo(e.target.value)}
                  placeholder="AQUABRAIN-01"
                  required
                />
              </p>
              <p>
                <label htmlFor="sen-tipo">Tipo de variable:</label>
                <br />
                <select
                  id="sen-tipo"
                  value={senTipoVariable}
                  onChange={(e) => {
                    const nextTipo = e.target.value as TipoVariable;
                    setSenTipoVariable(nextTipo);
                    setSenUnidad(UNIDAD_POR_VARIABLE[nextTipo]);
                  }}
                >
                  {TIPOS_VARIABLE.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </p>
              <p>
                <label htmlFor="sen-unidad">Unidad de medida:</label>
                <br />
                <input
                  id="sen-unidad"
                  type="text"
                  value={senUnidad}
                  onChange={(e) => setSenUnidad(e.target.value)}
                  placeholder="L/min"
                  required
                />
              </p>
              <p>
                <label htmlFor="sen-min">Umbral mínimo:</label>
                <br />
                <input
                  id="sen-min"
                  type="number"
                  step="any"
                  value={senUmbralMin}
                  onChange={(e) => setSenUmbralMin(e.target.value)}
                  required
                />
              </p>
              <p>
                <label htmlFor="sen-max">Umbral máximo:</label>
                <br />
                <input
                  id="sen-max"
                  type="number"
                  step="any"
                  value={senUmbralMax}
                  onChange={(e) => setSenUmbralMax(e.target.value)}
                  required
                />
              </p>
              <p>
                <label htmlFor="sen-estado">Estado del sensor:</label>
                <br />
                <select
                  id="sen-estado"
                  value={senEstado}
                  onChange={(e) => setSenEstado(e.target.value as EstadoSensor)}
                >
                  {ESTADOS_SENSOR.map((estado) => (
                    <option key={estado} value={estado}>
                      {estado}
                    </option>
                  ))}
                </select>
              </p>
              <p>
                <button type="submit" disabled={senBusy}>
                  {senBusy
                    ? 'Guardando...'
                    : editingSenId
                      ? 'Actualizar Sensor'
                      : 'Crear Sensor'}
                </button>{' '}
                {editingSenId && (
                  <button type="button" onClick={resetSenForm}>
                    Cancelar edición
                  </button>
                )}
              </p>
            </fieldset>
          </form>
        )}

        <table>
          <thead>
            <tr>
              <th>ID Sensor</th>
              <th>ID Sistema</th>
              <th>ID Dispositivo</th>
              <th>Tipo Variable</th>
              <th>Unidad</th>
              <th>Umbral Mín</th>
              <th>Umbral Máx</th>
              <th>Estado</th>
              {isAdmin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {sensores.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8}>No hay sensores registrados.</td>
              </tr>
            ) : (
              sensores.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code>{item.id_sensor}</code>
                  </td>
                  <td>
                    <code>{item.id_sistema}</code>
                  </td>
                  <td>
                    <code>{item.id_dispositivo}</code>
                  </td>
                  <td>{item.tipo_variable}</td>
                  <td>{item.unidad}</td>
                  <td>{item.umbral_min}</td>
                  <td>{item.umbral_max}</td>
                  <td>{item.estado}</td>
                  {isAdmin && (
                    <td>
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
                      >
                        Editar
                      </button>{' '}
                      <button type="button" onClick={() => void handleSenDelete(item)}>
                        Eliminar
                      </button>
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
