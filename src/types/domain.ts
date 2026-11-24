export const ESTADOS_CONEXION = ['En línea', 'Desconectado'] as const;
export type EstadoConexion = (typeof ESTADOS_CONEXION)[number];

export const ESTADOS_CULTIVO = ['Activo', 'En cosecha', 'Inactivo'] as const;
export type EstadoCultivo = (typeof ESTADOS_CULTIVO)[number];

export const TIPOS_VARIABLE = [
  'caudal',
  'nutrientes',
  'consumo_hidrico',
  'fotoperiodo',
] as const;
export type TipoVariable = (typeof TIPOS_VARIABLE)[number];

export const ESTADOS_SENSOR = ['Activo', 'Inactivo'] as const;
export type EstadoSensor = (typeof ESTADOS_SENSOR)[number];

export const UNIDAD_POR_VARIABLE: Record<TipoVariable, string> = {
  caudal: 'L/min',
  nutrientes: 'ppm',
  consumo_hidrico: 'L',
  fotoperiodo: 'horas',
};

export interface Instalacion {
  id: string;
  id_sistema: string;
  nombre: string;
  ubicacion_cifrada: string;
  ubicacion_descifrada?: string;
  token_dispositivo_cifrado: string;
  estado_conexion: EstadoConexion;
  ultima_comunicacion: string;
}

export interface InstalacionInput {
  id_sistema: string;
  nombre: string;
  ubicacion: string;
  estado_conexion: EstadoConexion;
}

export interface Cultivo {
  id: string;
  id_cultivo: string;
  id_sistema: string;
  nombre_planta: string;
  fecha_siembra: string;
  estado: EstadoCultivo;
}

export interface CultivoInput {
  id_cultivo: string;
  id_sistema: string;
  nombre_planta: string;
  fecha_siembra: string;
  estado: EstadoCultivo;
}

export interface Sensor {
  id: string;
  id_sensor: string;
  id_sistema: string;
  id_dispositivo: string;
  tipo_variable: TipoVariable;
  unidad: string;
  umbral_min: number;
  umbral_max: number;
  estado: EstadoSensor;
}

export interface SensorInput {
  id_sensor: string;
  id_sistema: string;
  id_dispositivo: string;
  tipo_variable: TipoVariable;
  unidad: string;
  umbral_min: number;
  umbral_max: number;
  estado: EstadoSensor;
}

export const ESTADOS_MEDICION = ['En línea', 'Sincronizado Offline'] as const;
export type EstadoMedicion = (typeof ESTADOS_MEDICION)[number];

export const NIVELES_ALERTA = ['Crítica', 'Advertencia'] as const;
export type NivelAlerta = (typeof NIVELES_ALERTA)[number];

export const ESTADOS_ALERTA = ['Activa', 'Resuelta'] as const;
export type EstadoAlerta = (typeof ESTADOS_ALERTA)[number];

export interface Medicion {
  id: string;
  id_sistema: string;
  id_dispositivo: string;
  id_sensor: string;
  tipo_variable: TipoVariable;
  valor: number;
  unidad: string;
  timestamp: string;
  estado_conexion: EstadoMedicion;
  alerta: boolean;
  hash_integridad: string;
}

export interface Alerta {
  id: string;
  id_sistema: string;
  id_sensor: string;
  tipo_variable: string;
  valor_registrado: number;
  umbral_superado: string;
  mensaje: string;
  nivel: NivelAlerta;
  estado: EstadoAlerta;
  timestamp: string;
}

export interface StressTestResult {
  totalSolicitadas: number;
  exitosas: number;
  fallidas: number;
  alertasGeneradas: number;
  tiempoTotalMs: number;
  latenciaPromedioMs: number;
  ejecutadaEn: string;
}

