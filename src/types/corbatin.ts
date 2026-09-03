export interface Corbatin {
  id: string;
  numero: string;
  estado: 'habilitado' | 'suspendido' | 'restringido' | 'vencido';
  fechaVencimiento: string;
  motivoSuspension?: string;
  fechaInicioSuspension?: string;
  fechaFinSuspension?: string;
  motivoRestriccion?: string;
  reincidenciasCount?: number;
}
