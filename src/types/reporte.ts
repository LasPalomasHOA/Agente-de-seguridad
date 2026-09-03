import { Evidencia } from './evidencia';
import { Sancion } from './sancion';
import { HistorialReporte } from './historial';

export interface ReporteInfraccion {
  id: string;
  folio: string;
  vehiculoId: string;
  corbatinNumero: string;
  infraccionCodigo: string;
  lugar: string;
  fecha: string;
  hora: string;
  descripcion: string;
  observaciones?: string;
  evidencias: Evidencia[];
  agenteId: string;
  estado: 'borrador' | 'pendiente' | 'aprobado' | 'rechazado' | 'informacion_solicitada';
  historial: HistorialReporte[];
  comentariosSupervisor?: string;
  sancionAplicada?: Sancion;
}
