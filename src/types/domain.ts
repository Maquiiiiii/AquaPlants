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
