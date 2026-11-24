import { logAuditEvent } from '../security/auditService';
import {
  createCultivo,
  createInstalacion,
  createSensor,
  type CrudActor,
} from './crudService';
import { procesarMedicion } from './iotService';
import type { CultivoInput, InstalacionInput, SensorInput } from '../types/domain';

export interface SeedResult {
  instalacionesCreadas: number;
  cultivosCreados: number;
  sensoresCreados: number;
  medicionesCreadas: number;
  alertasGeneradas: number;
}

const SEED_INSTALACIONES: InstalacionInput[] = [
  {
    id_sistema: 'AQP-101',
    nombre: 'Torre Vertical Santiago Centro',
    ubicacion: 'Alameda 1420 Piso 4 - Santiago Centro',
    estado_conexion: 'En línea',
  },
  {
    id_sistema: 'AQP-102',
    nombre: 'Invernadero Piloto',
    ubicacion: 'Campus Agronomía Parcela 7 - Maipú',
    estado_conexion: 'En línea',
  },
];

const SEED_CULTIVOS: CultivoInput[] = [
  {
    id_cultivo: 'CUL-101',
    id_sistema: 'AQP-101',
    nombre_planta: 'Lechuga Costina',
    fecha_siembra: '2026-10-15',
    estado: 'Activo',
  },
  {
    id_cultivo: 'CUL-102',
    id_sistema: 'AQP-101',
    nombre_planta: 'Albahaca Genovesa',
    fecha_siembra: '2026-10-28',
    estado: 'Activo',
  },
  {
    id_cultivo: 'CUL-103',
    id_sistema: 'AQP-102',
    nombre_planta: 'Espinaca Baby',
    fecha_siembra: '2026-11-02',
    estado: 'En cosecha',
  },
  {
    id_cultivo: 'CUL-104',
    id_sistema: 'AQP-102',
    nombre_planta: 'Rúcula',
    fecha_siembra: '2026-11-10',
    estado: 'Activo',
  },
];

const SEED_SENSORES: SensorInput[] = [
  {
    id_sensor: 'SEN-101',
    id_sistema: 'AQP-101',
    id_dispositivo: 'AQUABRAIN-101',
    tipo_variable: 'caudal',
    unidad: 'L/min',
    umbral_min: 2.0,
    umbral_max: 8.5,
    estado: 'Activo',
  },
  {
    id_sensor: 'SEN-102',
    id_sistema: 'AQP-101',
    id_dispositivo: 'AQUABRAIN-101',
    tipo_variable: 'nutrientes',
    unidad: 'ppm',
    umbral_min: 750,
    umbral_max: 1200,
    estado: 'Activo',
  },
  {
    id_sensor: 'SEN-103',
    id_sistema: 'AQP-101',
    id_dispositivo: 'AQUABRAIN-101',
    tipo_variable: 'fotoperiodo',
    unidad: 'horas',
    umbral_min: 12,
    umbral_max: 16,
    estado: 'Activo',
  },
  {
    id_sensor: 'SEN-104',
    id_sistema: 'AQP-102',
    id_dispositivo: 'AQUABRAIN-102',
    tipo_variable: 'caudal',
    unidad: 'L/min',
    umbral_min: 3.0,
    umbral_max: 10.0,
    estado: 'Activo',
  },
  {
    id_sensor: 'SEN-105',
    id_sistema: 'AQP-102',
    id_dispositivo: 'AQUABRAIN-102',
    tipo_variable: 'nutrientes',
    unidad: 'ppm',
    umbral_min: 800,
    umbral_max: 1350,
    estado: 'Activo',
  },
  {
    id_sensor: 'SEN-106',
    id_sistema: 'AQP-102',
    id_dispositivo: 'AQUABRAIN-102',
    tipo_variable: 'consumo_hidrico',
    unidad: 'L',
    umbral_min: 15,
    umbral_max: 45,
    estado: 'Activo',
  },
];

// 24 mediciones históricas distribuidas (22 normales + 2 fuera de umbral para alertas activas)
const SEED_MEDICIONES_PLAN: Array<{ id_sensor: string; valor: number }> = [
  { id_sensor: 'SEN-101', valor: 4.8 },
  { id_sensor: 'SEN-102', valor: 920 },
  { id_sensor: 'SEN-103', valor: 14.0 },
  { id_sensor: 'SEN-104', valor: 6.2 },
  { id_sensor: 'SEN-105', valor: 1050 },
  { id_sensor: 'SEN-106', valor: 26.5 },
  { id_sensor: 'SEN-101', valor: 5.1 },
  { id_sensor: 'SEN-102', valor: 960 },
  { id_sensor: 'SEN-103', valor: 14.2 },
  { id_sensor: 'SEN-104', valor: 6.4 },
  { id_sensor: 'SEN-105', valor: 1120 },
  { id_sensor: 'SEN-106', valor: 29.0 },
  { id_sensor: 'SEN-101', valor: 5.4 },
  { id_sensor: 'SEN-102', valor: 1015 },
  { id_sensor: 'SEN-103', valor: 14.5 },
  { id_sensor: 'SEN-104', valor: 5.9 },
  { id_sensor: 'SEN-105', valor: 1090 },
  { id_sensor: 'SEN-106', valor: 31.2 },
  { id_sensor: 'SEN-101', valor: 5.0 },
  { id_sensor: 'SEN-102', valor: 1560 }, // Fuera de umbral máximo (1200) -> Alerta Crítica
  { id_sensor: 'SEN-103', valor: 14.0 },
  { id_sensor: 'SEN-104', valor: 2.1 }, // Fuera de umbral mínimo (3.0) -> Alerta Crítica
  { id_sensor: 'SEN-105', valor: 1140 },
  { id_sensor: 'SEN-106', valor: 28.4 },
];

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('ya existe');
}

/**
 * Carga el set completo de datos de demostración usando los servicios reales
 * (cifrado AES-GCM, firmas SHA-256, evaluación de alertas y trazabilidad en audit_logs).
 */
export async function cargarDatosDemostracion(actor: CrudActor): Promise<SeedResult> {
  if (actor.rol !== 'Administrador') {
    throw new Error('Solo el rol "Administrador" puede cargar datos de demostración.');
  }

  let instalacionesCreadas = 0;
  let cultivosCreados = 0;
  let sensoresCreados = 0;
  let medicionesCreadas = 0;
  let alertasGeneradas = 0;

  for (const inst of SEED_INSTALACIONES) {
    try {
      await createInstalacion(inst, actor);
      instalacionesCreadas += 1;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  }

  for (const cult of SEED_CULTIVOS) {
    try {
      await createCultivo(cult, actor);
      cultivosCreados += 1;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  }

  for (const sen of SEED_SENSORES) {
    try {
      await createSensor(sen, actor);
      sensoresCreados += 1;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  }

  const baseEpoch = Date.now() - SEED_MEDICIONES_PLAN.length * 15 * 60 * 1000;
  for (let i = 0; i < SEED_MEDICIONES_PLAN.length; i += 1) {
    const item = SEED_MEDICIONES_PLAN[i];
    const timestamp = new Date(baseEpoch + i * 15 * 60 * 1000).toISOString();
    const res = await procesarMedicion({
      id_sensor: item.id_sensor,
      valor: item.valor,
      timestamp,
      estado_conexion: 'En línea',
    });
    medicionesCreadas += 1;
    if (res.alertaCreada) {
      alertasGeneradas += 1;
    }
  }

  await logAuditEvent({
    uid: actor.uid,
    email: actor.email,
    rol: actor.rol,
    accion: 'CARGAR_DATOS_SEMILLA',
    detalle: `Datos de demostración cargados: ${instalacionesCreadas} instalaciones, ${cultivosCreados} cultivos, ${sensoresCreados} sensores, ${medicionesCreadas} mediciones (${alertasGeneradas} alertas)`,
  });

  return {
    instalacionesCreadas,
    cultivosCreados,
    sensoresCreados,
    medicionesCreadas,
    alertasGeneradas,
  };
}
