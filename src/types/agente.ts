export interface Agente {
  id: string;
  nombre: string;
  numEmpleado: string;
  turno: string;
  zona: string;
  estadoServicio: 'activo' | 'inactivo';
  avatarUrl?: string;
}
