export const USER_ROLES = [
  'Administrador',
  'Supervisor',
  'Encargado de cultivo',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  uid: string;
  nombre: string;
  email: string;
  rol: UserRole;
  fecha_creacion: string;
}

export type AuditAction =
  | 'LOGIN_EXITOSO'
  | 'LOGIN_FALLIDO'
  | 'REGISTRO_USUARIO'
  | 'LOGOUT'
  | string;

export interface AuditLogEntry {
  id?: string;
  uid: string;
  email: string;
  rol: UserRole | 'No autenticado';
  accion: AuditAction;
  detalle: string;
  timestamp: string;
  hash_evento: string;
}
