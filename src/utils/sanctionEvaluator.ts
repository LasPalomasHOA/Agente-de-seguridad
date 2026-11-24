import { BitacoraAccesoRow, CorbatinRow, ReglaReincidenciaRow, SancionDbRow, VehiculoRow } from '../types/database';
import { getLocalDateStr, parseSqlUtcDate } from '../services/apiService';
import { formatHora } from './dateFormat';

export interface SanctionEvaluation {
  isBlocked: boolean;
  isWarning: boolean;
  level: number;
  levelTitle: string;
  levelBadge: string;
  levelName: string;
  motivo: string;
  timeRemainingText: string;
  fechaFinText: string;
  requiresAdmin: boolean;
  badgeBg: string;
}

const defaultHorasByNivel = (nivel: number): number => {
  if (nivel === 1) return 0;
  if (nivel === 2) return 24;
  if (nivel === 3) return 168;
  return -1;
};

const formatLocalDateTime = (ms: number): string => {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} • ${hh}:${min} hrs`;
};

const formatLocalDate = (ms: number): string => {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

export function isAccesoFromToday(ultimoAcceso: BitacoraAccesoRow | null): boolean {
  if (!ultimoAcceso) return false;
  const todayStr = getLocalDateStr(new Date());
  const candidates = [
    ultimoAcceso.hora_salida,
    ultimoAcceso.hora_entrada,
    ultimoAcceso.updated_at,
    ultimoAcceso.created_at,
  ];
  const refTs = candidates.find(
    (c) => typeof c === 'string' && (c.includes('T') || (c.includes('-') && c.includes(':')))
  );
  if (refTs) {
    return getLocalDateStr(new Date(parseSqlUtcDate(refTs))) === todayStr;
  }
  return Boolean(ultimoAcceso.fecha && ultimoAcceso.fecha.startsWith(todayStr));
}

export function computeStayDuration(ultimoAcceso: BitacoraAccesoRow | null): string {
  if (!ultimoAcceso?.hora_entrada) return '';

  let entryMs: number | null = null;
  const rawEntry = ultimoAcceso.hora_entrada.trim();
  if (rawEntry.includes('T') || (rawEntry.includes('-') && rawEntry.includes(':'))) {
    entryMs = parseSqlUtcDate(rawEntry);
  } else if (ultimoAcceso.created_at) {
    entryMs = parseSqlUtcDate(ultimoAcceso.created_at);
  } else if (ultimoAcceso.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ultimoAcceso.fecha)) {
    entryMs = parseSqlUtcDate(`${ultimoAcceso.fecha}T${rawEntry}`);
  }

  if (entryMs && !isNaN(entryMs)) {
    const diffMs = Date.now() - entryMs;
    if (diffMs > 0) {
      const totalMinutes = Math.floor(diffMs / (60 * 1000));
      if (totalMinutes < 1) return 'Menos de 1 min';
      const days = Math.floor(totalMinutes / (24 * 60));
      const remHours = Math.floor((totalMinutes % (24 * 60)) / 60);
      const mins = totalMinutes % 60;
      if (days > 0) return `${days}d ${remHours}h ${mins}m`;
      if (remHours > 0) return `${remHours}h ${mins}m`;
      return `${mins} min`;
    }
  }

  const timeVal = formatHora(ultimoAcceso.hora_entrada, ultimoAcceso.created_at);
  if (!timeVal) return '';

  try {
    const parts = timeVal.split(':');
    if (parts.length >= 2) {
      const entryHour = parseInt(parts[0], 10);
      const entryMin = parseInt(parts[1], 10);
      const now = new Date();
      let totalMinutes = now.getHours() * 60 + now.getMinutes() - (entryHour * 60 + entryMin);
      if (totalMinutes < 0) totalMinutes += 24 * 60;
      if (totalMinutes < 1) return 'Menos de 1 min';
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
    }
  } catch { }
  return '';
}

export function evaluarSancionVehiculo(params: {
  selectedVehicle: VehiculoRow | null;
  selectedCorbatin: CorbatinRow | null;
  sancionesActivas: SancionDbRow[];
  reglasReincidencia: ReglaReincidenciaRow[];
  ahoraMs: number;
}): SanctionEvaluation | null {
  const { selectedVehicle, selectedCorbatin, sancionesActivas, reglasReincidencia, ahoraMs } = params;
  const estatusVehiculo = (selectedVehicle?.estatus_acceso || '').toLowerCase();
  const estatusCorbatin = (selectedCorbatin?.estatus || '').toLowerCase();

  const normalizarInicioSancionMs = (rawInicio?: string | null): number => {
    const ms = parseSqlUtcDate(rawInicio);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return ms;
    if (ms > ahoraMs && d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7, 0, 0, 0).getTime();
    }
    return ms;
  };

  const calcularFinMs = (s: SancionDbRow, inicioMs: number, nivelS: number): number | null => {
    const dbFinMs = s.fecha_fin ? parseSqlUtcDate(s.fecha_fin) : null;
    const reglaS = (reglasReincidencia || []).find((r) => r.numero_falta === nivelS);
    if (reglaS && Number(reglaS.horas_suspension) === -1) return null;
    if (dbFinMs && !isNaN(dbFinMs)) return dbFinMs;
    if (reglaS && reglaS.horas_suspension !== undefined && reglaS.horas_suspension !== null) {
      const h = Number(reglaS.horas_suspension);
      if (h > 0) return inicioMs + h * 60 * 60 * 1000;
      if (h === 0) return null;
    }
    const defHoras = defaultHorasByNivel(nivelS);
    return defHoras > 0 ? inicioMs + defHoras * 60 * 60 * 1000 : null;
  };

  const sancionesEnVigor = (sancionesActivas || []).filter((s) => {
    const nivelS = Number(s.numero_reincidencia) || Number(s.id_regla) || 1;
    const inicioMs = normalizarInicioSancionMs(s.fecha_inicio || (s as any).created_at);
    const finMs = calcularFinMs(s, inicioMs, nivelS);
    return finMs !== null ? ahoraMs < finMs : true;
  });

  const hasActiveBlockingSanction = sancionesEnVigor.some((s) => {
    const nivelS = Number(s.numero_reincidencia) || Number(s.id_regla) || 1;
    const inicioMs = normalizarInicioSancionMs(s.fecha_inicio || (s as any).created_at);
    const finMs = calcularFinMs(s, inicioMs, nivelS);
    const reglaS = (reglasReincidencia || []).find((r) => r.numero_falta === nivelS);
    const h = reglaS?.horas_suspension ?? defaultHorasByNivel(nivelS);
    const isPerm = h === -1 || nivelS >= 4 || (Boolean(reglaS?.requiere_administrador) && !reglaS?.permite_acceso);
    return (
      isPerm ||
      Boolean(finMs && ahoraMs < finMs) ||
      (reglaS !== undefined && !reglaS.permite_acceso)
    );
  });

  const effectiveEstatusVehiculo =
    estatusVehiculo === 'suspendido' && (sancionesActivas || []).length > 0 && !hasActiveBlockingSanction
      ? 'permitido'
      : estatusVehiculo;

  if (
    estatusCorbatin === 'cancelado' ||
    estatusCorbatin === 'suspendido' ||
    estatusVehiculo === 'denegado' ||
    estatusVehiculo === 'restringido' ||
    estatusVehiculo === 'bloqueado'
  ) {
    return {
      isBlocked: true,
      isWarning: false,
      level: 4,
      levelTitle: 'ACCESO RESTRINGIDO PERMANENTE',
      levelBadge: 'LISTA NEGRA',
      levelName: 'Nivel 4 - Lista Negra Permanente',
      motivo: selectedCorbatin?.motivo_cancelacion || 'Acceso restringido permanentemente por administración HOA.',
      timeRemainingText: 'Permanente',
      fechaFinText: 'Permanente (Requiere Administrador)',
      requiresAdmin: true,
      badgeBg: '#991B1B',
    };
  }

  if (sancionesEnVigor.length === 0) {
    if (effectiveEstatusVehiculo === 'suspendido') {
      return {
        isBlocked: true,
        isWarning: false,
        level: 2,
        levelTitle: 'SUSPENSIÓN VEHICULAR ACTIVA',
        levelBadge: 'SUSPENDIDO',
        levelName: 'Unidad con Estatus Suspendido en Sistema HOA',
        motivo: 'El vehículo se encuentra registrado con estatus SUSPENDIDO en la base de datos.',
        timeRemainingText: 'Suspendido',
        fechaFinText: 'Sujeto a liberación HOA',
        requiresAdmin: false,
        badgeBg: '#DC2626',
      };
    }
    return null;
  }

  const sancion = [...sancionesEnVigor].sort(
    (a, b) =>
      (Number(b.numero_reincidencia) || Number(b.id_regla) || 1) -
        (Number(a.numero_reincidencia) || Number(a.id_regla) || 1) ||
      Number(b.id_sancion || 0) - Number(a.id_sancion || 0)
  )[0];
  const nivel = Math.max(Number(sancion.numero_reincidencia) || 1, Number(sancion.id_regla) || 1);
  const fechaInicioMs = normalizarInicioSancionMs(sancion.fecha_inicio || (sancion as any).created_at);
  const reglaConfig = (reglasReincidencia || []).find((r) => r.numero_falta === nivel);
  const fechaFinMs = calcularFinMs(sancion, fechaInicioMs, nivel);

  let horasSuspension = reglaConfig?.horas_suspension;
  if (
    horasSuspension === undefined ||
    horasSuspension === null ||
    (horasSuspension === 0 && fechaFinMs && fechaFinMs > fechaInicioMs)
  ) {
    if (fechaFinMs && fechaFinMs > fechaInicioMs) {
      horasSuspension = Math.max(1, Math.round((fechaFinMs - fechaInicioMs) / (1000 * 60 * 60)));
    } else {
      horasSuspension = defaultHorasByNivel(nivel);
    }
  }

  const tieneSuspensionTemporalActiva = Boolean(fechaFinMs && ahoraMs < fechaFinMs);
  const permiteAcceso =
    effectiveEstatusVehiculo === 'suspendido' || tieneSuspensionTemporalActiva
      ? false
      : reglaConfig !== undefined
        ? Boolean(reglaConfig.permite_acceso)
        : horasSuspension === 0 && !sancion.fecha_fin;
  const requiresAdmin = Boolean(
    horasSuspension === -1 ||
      nivel >= 4 ||
      (reglaConfig?.requiere_administrador && !reglaConfig?.permite_acceso)
  );

  if (ahoraMs < fechaInicioMs && effectiveEstatusVehiculo !== 'suspendido') {
    const inicioLabel = formatLocalDate(fechaInicioMs);
    const inicioHoraLabel = formatLocalDateTime(fechaInicioMs);
    return {
      isBlocked: false,
      isWarning: true,
      level: nivel,
      levelTitle: `${nivel}ª Falta Programada (Inicia ${inicioHoraLabel})`,
      levelBadge: `INICIA ${inicioLabel}`,
      levelName: `${nivel}ª Falta - Entra en vigor el ${inicioHoraLabel}`,
      motivo: sancion.motivo || reglaConfig?.mensaje_alerta || `Sanción programada para iniciar el ${inicioHoraLabel}.`,
      timeRemainingText: `Inicia ${inicioHoraLabel}`,
      fechaFinText: fechaFinMs
        ? `Hasta ${formatLocalDateTime(fechaFinMs)}`
        : 'Acceso Permitido Hasta Inicio',
      requiresAdmin: false,
      badgeBg: '#D97706',
    };
  }

  if (horasSuspension === -1 || (requiresAdmin && !fechaFinMs)) {
    return {
      isBlocked: true,
      isWarning: false,
      level: Math.max(nivel, 4),
      levelTitle: 'ACCESO RESTRINGIDO PERMANENTE',
      levelBadge: 'LISTA NEGRA',
      levelName: `Nivel ${nivel} - Bloqueo Permanente`,
      motivo: sancion.motivo || reglaConfig?.mensaje_alerta || 'Acceso vehicular restringido permanentemente por reincidencia.',
      timeRemainingText: 'Permanente',
      fechaFinText: 'Indefinido (Requiere Comité HOA)',
      requiresAdmin: true,
      badgeBg: '#991B1B',
    };
  }

  if (fechaFinMs && ahoraMs < fechaFinMs) {
    const refStartMs = Math.min(ahoraMs, fechaInicioMs);
    const diffMs = Math.max(0, fechaFinMs - ahoraMs);
    const totalHoursAll = Math.floor(diffMs / (1000 * 60 * 60));
    const totalMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const timeRemainingText =
      totalHoursAll > 0
        ? `${totalHoursAll}h ${totalMinutes}m restantes`
        : `${Math.max(1, totalMinutes)}m restantes`;

    const duracionTotalHoras = Math.max(1, Math.round((fechaFinMs - refStartMs) / (1000 * 60 * 60)));
    const isExactDays = duracionTotalHoras >= 24 && duracionTotalHoras % 24 === 0;
    const titleText = isExactDays
      ? `SUSPENSIÓN TEMPORAL (${duracionTotalHoras / 24} ${duracionTotalHoras / 24 === 1 ? 'DÍA' : 'DÍAS'})`
      : `SUSPENSIÓN TEMPORAL (${duracionTotalHoras} HORAS)`;
    const badgeText = isExactDays
      ? `SUSPENSIÓN ${duracionTotalHoras / 24}D`
      : `SUSPENSIÓN ${duracionTotalHoras}H`;

    const fechaFinText = formatLocalDateTime(fechaFinMs);

    return {
      isBlocked: true,
      isWarning: false,
      level: nivel,
      levelTitle: titleText,
      levelBadge: badgeText,
      levelName: `${nivel}ª Falta - Suspensión Temporal (${duracionTotalHoras}h)`,
      motivo: sancion.motivo || reglaConfig?.mensaje_alerta || `Falta nivel ${nivel}: suspensión vehicular reglamentaria por ${duracionTotalHoras} horas.`,
      timeRemainingText,
      fechaFinText,
      requiresAdmin,
      badgeBg: nivel >= 3 ? '#DC2626' : nivel === 2 ? '#EA580C' : '#D97706',
    };
  }

  if (permiteAcceso && (horasSuspension === 0 || !horasSuspension) && effectiveEstatusVehiculo !== 'suspendido') {
    return {
      isBlocked: false,
      isWarning: true,
      level: nivel,
      levelTitle: `${nivel}ª Falta: Llamado de Atención`,
      levelBadge: `${nivel}ª FALTA`,
      levelName: `${nivel}ª Falta - Llamado de Atención`,
      motivo: sancion.motivo || reglaConfig?.mensaje_alerta || 'Llamado de atención formal registrado en el sistema. Acceso permitido.',
      timeRemainingText: 'Informativo',
      fechaFinText: 'Acceso Permitido',
      requiresAdmin: false,
      badgeBg: '#F59E0B',
    };
  }

  return {
    isBlocked: true,
    isWarning: false,
    level: nivel,
    levelTitle: 'SUSPENSIÓN VEHICULAR ACTIVA',
    levelBadge: 'SUSPENDIDO',
    levelName: `${nivel}ª Falta - Acceso Vehicular Suspendido`,
    motivo: sancion.motivo || reglaConfig?.mensaje_alerta || 'Acceso vehicular suspendido por normativa HOA.',
    timeRemainingText: 'Suspendido',
    fechaFinText: 'Acceso Restringido',
    requiresAdmin,
    badgeBg: '#DC2626',
  };
}
