import { ReporteInfraccion } from '../types/reporte';
import { SupabaseService } from '../services/supabaseService';

export interface ReportStatusMeta {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

export function getReportStatusMeta(estado: ReporteInfraccion['estado'], isOfflinePending?: boolean): ReportStatusMeta {
  if (isOfflinePending) {
    return {
      label: 'Sin Conexión • Pendiente de Sincronizar',
      shortLabel: 'Pendiente Sync',
      color: '#D97706',
      bgColor: '#FEF3C7',
      borderColor: '#FDE68A',
      icon: 'cloud-offline',
    };
  }
  switch (estado) {
    case 'aprobado':
      return {
        label: 'Aprobado y Sancionado por HOA',
        shortLabel: 'Aprobado',
        color: '#059669',
        bgColor: '#D1FAE5',
        borderColor: '#A7F3D0',
        icon: 'checkmark-circle',
      };
    case 'rechazado':
      return {
        label: 'Rechazado / Aclarado',
        shortLabel: 'Rechazado',
        color: '#DC2626',
        bgColor: '#FEE2E2',
        borderColor: '#FECACA',
        icon: 'close-circle',
      };
    case 'borrador':
      return {
        label: 'Borrador Guardado en Dispositivo',
        shortLabel: 'Borrador',
        color: '#64748B',
        bgColor: '#F1F5F9',
        borderColor: '#E2E8F0',
        icon: 'document-outline',
      };
    case 'informacion_solicitada':
      return {
        label: 'Información Adicional Solicitada',
        shortLabel: 'Info Solicitada',
        color: '#D97706',
        bgColor: '#FEF3C7',
        borderColor: '#FDE68A',
        icon: 'alert-circle',
      };
    case 'pendiente':
    default:
      return {
        label: 'Pendiente de Revisión HOA',
        shortLabel: 'En Revisión',
        color: '#D97706',
        bgColor: '#FEF3C7',
        borderColor: '#FDE68A',
        icon: 'time',
      };
  }
}

export function formatCorbatinDisplay(corbatinNumero?: string | null): string {
  const digits = String(corbatinNumero || '').replace(/\D/g, '');
  const cleanNum = digits.startsWith('2026') && digits.length > 4 ? digits.slice(4) : digits;
  return cleanNum ? `C-${cleanNum}` : corbatinNumero || 'S/C';
}

export async function loadReportEvidenciaPhotos(report: ReporteInfraccion): Promise<ReporteInfraccion> {
  if (!report.evidencias || report.evidencias.length === 0) return report;
  const loadedEvs = await Promise.all(
    report.evidencias.map(async (ev) => {
      if (!ev.fotoUrl && ev.id) {
        const numericId = parseInt(ev.id.replace(/\D/g, ''), 10);
        if (!isNaN(numericId) && numericId > 0) {
          const url = await SupabaseService.getEvidenciaFoto(numericId);
          return { ...ev, fotoUrl: url || '' };
        }
      }
      return ev;
    })
  );
  return { ...report, evidencias: loadedEvs };
}

export function filterOfficerReports(reportes: ReporteInfraccion[] | undefined, agenteId?: string): ReporteInfraccion[] {
  const list = reportes || [];
  if (!agenteId) return list;
  const officerNumId = agenteId.replace(/\D/g, '');
  return list.filter((r) => {
    const rAgentId = String(r.agenteId || '');
    return rAgentId === agenteId || rAgentId.replace(/\D/g, '') === officerNumId;
  });
}

export function getOfficerReportCounts(misReportes: ReporteInfraccion[]) {
  const pendientes = misReportes.filter((r) => r.estado === 'pendiente' || r.estado === 'informacion_solicitada').length;
  const aprobados = misReportes.filter((r) => r.estado === 'aprobado').length;
  const borradores = misReportes.filter((r) => r.estado === 'borrador').length;
  return { pendientes, aprobados, borradores, total: misReportes.length };
}
