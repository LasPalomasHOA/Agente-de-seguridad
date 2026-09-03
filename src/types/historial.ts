export interface HistorialReporte {
  id: string;
  fecha: string;
  estado: 'borrador' | 'pendiente' | 'aprobado' | 'rechazado' | 'informacion_solicitada';
  detalles: string;
  usuarioNombre: string;
}
