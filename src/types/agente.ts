export interface Agente {
  id: string;
  nombre: string;
  correo?: string;
  rol?: string;
  numEmpleado: string;
  turno: string;
  zona: string;
  estadoServicio: 'activo' | 'inactivo';
  avatarUrl?: string;
}
