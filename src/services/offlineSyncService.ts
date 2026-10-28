import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { ReporteInfraccion } from '../types/reporte';

export const PENDING_REPORTS_KEY = 'hoa_offline_pending_reports';
export const CACHED_REPORTS_KEY = 'hoa_offline_cached_reports';

export interface PendingReportPayload {
  tempId: string;
  tempFolio: string;
  createdAt: string;
  params: {
    idVehiculo: number;
    idCorbatin?: number | null;
    idInfraccion: number;
    idUsuario: number;
    ubicacionTexto?: string;
    descripcionHechos: string;
    evidencias: Array<{ fotoUrl: string; descripcion?: string; fechaHora?: string }>;
  };
  reporteCompleto: ReporteInfraccion;
}

export interface SyncResult {
  syncedCount: number;
  remainingCount: number;
  success: boolean;
  errors: string[];
}

// ─── Control de Concurrencia y Mutex Anti-Loop ───
let isSyncInProgress = false;
type SyncListener = (pendingCount: number) => void;
const listeners = new Set<SyncListener>();

export const notifyPendingListeners = async () => {
  const pending = await getPendingReports();
  listeners.forEach((listener) => {
    try {
      listener(pending.length);
    } catch { }
  });
};

export const subscribeToPendingCount = (callback: SyncListener) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

// ─── Estado reactivo de red en tiempo real ───
type NetworkStateListener = (isConnected: boolean) => void;
const networkStateListeners = new Set<NetworkStateListener>();
let lastKnownOnlineState: boolean = true;

const notifyNetworkListeners = (connected: boolean) => {
  lastKnownOnlineState = connected;
  networkStateListeners.forEach((listener) => {
    try {
      listener(connected);
    } catch { }
  });
};

export const subscribeToNetworkState = (callback: NetworkStateListener) => {
  networkStateListeners.add(callback);
  callback(lastKnownOnlineState);
  return () => {
    networkStateListeners.delete(callback);
  };
};

/**
 * Comprobación ultrarrápida de conectividad a internet sin egress
 */
export async function isNetworkConnected(): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      const online = Boolean(navigator.onLine);
      lastKnownOnlineState = online;
      return online;
    }
    const netState = await Network.getNetworkStateAsync();
    const online = Boolean(netState.isConnected && (netState.isInternetReachable ?? true));
    lastKnownOnlineState = online;
    return online;
  } catch {
    const fallback = typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : true;
    lastKnownOnlineState = fallback;
    return fallback;
  }
}

/**
 * Obtiene los reportes que fueron generados offline y están pendientes de subida
 */
export async function getPendingReports(): Promise<PendingReportPayload[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[OfflineSync] Error leyendo cola de pendientes:', err);
    return [];
  }
}

/**
 * Guarda un nuevo reporte en la cola de pendientes offline en disco
 */
export async function queueReportForSync(payload: PendingReportPayload): Promise<void> {
  try {
    const existing = await getPendingReports();
    // Evitar duplicados por tempId
    const filtered = existing.filter((p) => p.tempId !== payload.tempId);
    filtered.push(payload);
    await AsyncStorage.setItem(PENDING_REPORTS_KEY, JSON.stringify(filtered));
    await notifyPendingListeners();
  } catch (err) {
    console.warn('[OfflineSync] Error encolando reporte offline:', err);
  }
}

/**
 * Elimina un reporte de la cola de pendientes una vez subido con éxito
 */
export async function removePendingReport(tempId: string): Promise<void> {
  try {
    const existing = await getPendingReports();
    const filtered = existing.filter((p) => p.tempId !== tempId);
    await AsyncStorage.setItem(PENDING_REPORTS_KEY, JSON.stringify(filtered));
    await notifyPendingListeners();
  } catch (err) {
    console.warn('[OfflineSync] Error removiendo reporte de cola:', err);
  }
}

/**
 * Guarda en caché la lista completa de reportes para visualización offline inmediata
 */
export async function saveCachedReports(reportes: ReporteInfraccion[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHED_REPORTS_KEY, JSON.stringify(reportes));
  } catch { }
}

/**
 * Lee la lista completa en caché para cuando no hay internet al abrir la app
 */
export async function getCachedReports(): Promise<ReporteInfraccion[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Sincroniza la cola de reportes pendientes hacia el servidor / Supabase.
 *
 * CRÍTICO - Optimización Anti-Egress:
 * 1. Mutex (isSyncInProgress): Evita ejecuciones simultáneas redundantes.
 * 2. Cero Peticiones si cola vacía: Si no hay reportes pendientes, retorna en 0ms (0 bytes egress).
 * 3. Cero Peticiones si offline: Verifica conectividad antes de intentar nada.
 * 4. Detención ante fallos: Si un reporte falla por desconexión repentina, detiene el lote para no generar ruido de red.
 */
export async function syncPendingReports(
  uploadReportExecutor: (payload: PendingReportPayload) => Promise<{ idReporte: number } | null>,
  onReportSuccessfullyUploaded?: (tempId: string, realReporteId: number, realFolio: string) => Promise<void> | void
): Promise<SyncResult> {
  // 1. Candado de concurrencia
  if (isSyncInProgress) {
    const currentQueue = await getPendingReports();
    return {
      syncedCount: 0,
      remainingCount: currentQueue.length,
      success: true,
      errors: ['Sincronización ya en curso.'],
    };
  }

  isSyncInProgress = true;
  const errors: string[] = [];
  let syncedCount = 0;

  try {
    // 2. Verificar estado de la cola (0 peticiones si está vacía)
    const pendingList = await getPendingReports();
    if (pendingList.length === 0) {
      return { syncedCount: 0, remainingCount: 0, success: true, errors: [] };
    }

    // 3. Verificar si realmente hay conexión antes de disparar peticiones
    const online = await isNetworkConnected();
    if (!online) {
      return {
        syncedCount: 0,
        remainingCount: pendingList.length,
        success: false,
        errors: ['Sin conexión a internet disponible.'],
      };
    }

    console.info(`[OfflineSync] Iniciando sincronización de ${pendingList.length} reportes pendientes...`);

    // 4. Procesar secuencialmente cada reporte pendiente
    for (const item of pendingList) {
      try {
        const uploadRes = await uploadReportExecutor(item);

        if (uploadRes && uploadRes.idReporte) {
          const realId = uploadRes.idReporte;
          const realFolio = `F-2026-${String(realId).padStart(4, '0')}`;

          // Eliminar de la cola persistente
          await removePendingReport(item.tempId);
          syncedCount++;

          // Notificar al contexto para reemplazar el folio temporal por el oficial en la UI
          if (onReportSuccessfullyUploaded) {
            await onReportSuccessfullyUploaded(item.tempId, realId, realFolio);
          }
        } else {
          // Si falló, detenemos el procesamiento del lote para no saturar si la conexión cayó
          errors.push(`No se pudo procesar el reporte ${item.tempFolio}`);
          break;
        }
      } catch (itemErr: any) {
        console.warn(`[OfflineSync] Error subiendo reporte ${item.tempFolio}:`, itemErr?.message);
        errors.push(itemErr?.message || 'Error al subir reporte');
        // Detener ante error de conexión para evitar bucles
        break;
      }
    }

    const remainingQueue = await getPendingReports();
    return {
      syncedCount,
      remainingCount: remainingQueue.length,
      success: errors.length === 0,
      errors,
    };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Escucha eventos de restablecimiento de red (Nativo expo-network, Web 'online' y AppState 'active')
 * SIN INTERVALOS NI BUCLES PERIÓDICOS (0 Egress en reposo).
 */
export function setupNetworkRestorationListener(onConnectionRestored: () => void): () => void {
  const unsubscribers: Array<() => void> = [];

  // 1. Listener nativo de Expo Network (reactivo en tiempo real)
  try {
    if (typeof (Network as any).addNetworkStateListener === 'function') {
      const netSub = (Network as any).addNetworkStateListener((event: any) => {
        const isOnline = Boolean(event.isConnected && (event.isInternetReachable ?? true));
        notifyNetworkListeners(isOnline);
        if (isOnline) {
          onConnectionRestored();
        }
      });
      if (netSub && typeof netSub.remove === 'function') {
        unsubscribers.push(() => netSub.remove());
      }
    }
  } catch (err) {
    console.warn('[OfflineSync] No se pudo inicializar addNetworkStateListener:', err);
  }

  // 2. Plataforma Web: evento nativo del navegador
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const handleOnline = () => {
      console.info('[OfflineSync] Conexión a internet restablecida en navegador (evento online).');
      notifyNetworkListeners(true);
      onConnectionRestored();
    };
    const handleOffline = () => {
      notifyNetworkListeners(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    unsubscribers.push(() => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    });
  }

  // 3. Plataforma Móvil: cuando la app vuelve a primer plano
  let previousState: AppStateStatus = AppState.currentState;
  const appStateSub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
    if (previousState.match(/inactive|background/) && nextState === 'active') {
      const isOnline = await isNetworkConnected();
      notifyNetworkListeners(isOnline);
      if (isOnline) {
        onConnectionRestored();
      }
    }
    previousState = nextState;
  });
  unsubscribers.push(() => appStateSub.remove());

  return () => {
    unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch { }
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── CATÁLOGO LOCAL DE VEHÍCULOS OFFLINE (CERO/MÍNIMO EGRESS) ────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const OFFLINE_VEHICLES_CATALOG_KEY = 'hoa_offline_vehicles_catalog';
export const OFFLINE_CATALOG_META_KEY = 'hoa_offline_catalog_meta';

export interface OfflineVehicleRecord {
  id_vehiculo: number;
  placas: string;
  marca: string;
  modelo: string;
  color: string;
  foto_url?: string | null;
  id_corbatin?: number | null;
  numero_corbatin?: number | string | null;
  corbatin_estatus?: string;
  id_empresa?: number | null;
  empresa_nombre?: string;
  conductor_nombre?: string;
  conductor_id?: number;
  updated_at?: string;
}

const offlineVehicleMemoryMap = new Map<string, OfflineVehicleRecord>();

/**
 * Guarda o actualiza un vehículo o corbatín en el catálogo local offline aprovechando consultas que ya ocurrieron (0 bytes Egress extra)
 */
export async function saveVehicleToOfflineCatalog(result: any): Promise<void> {
  if (!result?.vehiculo?.id_vehiculo && !result?.corbatin?.id_corbatin && !result?.corbatin?.numero) return;
  try {
    const v = result.vehiculo || {};
    const c = result.corbatin;
    const e = result.empresa;
    const cond = result.conductorPrincipal;

    const record: OfflineVehicleRecord = {
      id_vehiculo: Number(v.id_vehiculo) || 0,
      placas: (v.placas || '').toUpperCase().trim(),
      marca: v.marca || (c?.numero ? `Corbatín Nº ${c.numero}` : ''),
      modelo: v.modelo || '',
      color: v.color || '',
      foto_url: v.foto_url || null,
      id_corbatin: c?.id_corbatin ? Number(c.id_corbatin) : null,
      numero_corbatin: c?.numero !== undefined && c?.numero !== null ? String(c.numero) : null,
      corbatin_estatus: c?.estatus || 'activo',
      id_empresa: e?.id_empresa ? Number(e.id_empresa) : 1,
      empresa_nombre: e?.razon_social || e?.nombre || 'Empresa Registrada HOA',
      conductor_nombre: cond?.nombre || undefined,
      conductor_id: cond?.id_trabajador ? Number(cond.id_trabajador) : undefined,
      updated_at: new Date().toISOString(),
    };

    // Actualizar mapa en memoria RAM
    if (record.id_vehiculo > 0) {
      offlineVehicleMemoryMap.set(`veh_${record.id_vehiculo}`, record);
    }
    if (record.numero_corbatin) {
      offlineVehicleMemoryMap.set(`num_${record.numero_corbatin}`, record);
    }
    if (record.placas && record.placas !== 'S/P') {
      const cleanP = record.placas.replace(/[-_ ]/g, '');
      offlineVehicleMemoryMap.set(`plate_${cleanP}`, record);
    }

    // Persistir en AsyncStorage en segundo plano
    const current = await getOfflineVehiclesCatalog();
    const filtered = current.filter(
      (item) =>
        (record.id_vehiculo > 0 ? item.id_vehiculo !== record.id_vehiculo : true) &&
        (!record.numero_corbatin || String(item.numero_corbatin) !== String(record.numero_corbatin))
    );
    filtered.unshift(record);
    const sliced = filtered.slice(0, 400); // Límite de 400 registros (~90 KB en disco)
    await AsyncStorage.setItem(OFFLINE_VEHICLES_CATALOG_KEY, JSON.stringify(sliced));
  } catch (err) {
    console.warn('[OfflineCatalog] Error guardando vehículo en catálogo local:', err);
  }
}

/**
 * Guarda en memoria y disco una lista completa de corbatines para disponibilidad offline inmediata
 */
export async function saveCorbatinesListToOfflineCatalog(corbatines: any[]): Promise<void> {
  if (!Array.isArray(corbatines) || corbatines.length === 0) return;
  try {
    const current = await getOfflineVehiclesCatalog();
    const currentMap = new Map<string, OfflineVehicleRecord>();
    for (const item of current) {
      if (item.numero_corbatin) currentMap.set(`num_${item.numero_corbatin}`, item);
      else if (item.id_vehiculo > 0) currentMap.set(`veh_${item.id_vehiculo}`, item);
    }

    for (const c of corbatines) {
      const v = c.vehiculo || {};
      const num = c.numero !== undefined && c.numero !== null ? String(c.numero) : null;
      if (!num && !v.id_vehiculo) continue;

      const record: OfflineVehicleRecord = {
        id_vehiculo: Number(v.id_vehiculo || c.id_vehiculo) || 0,
        placas: (v.placas || c.placasAsignadas || '').toUpperCase().trim(),
        marca: v.marca || (c.tipos === 'VERDE' ? 'Corbatín Verde' : 'Corbatín HOA'),
        modelo: v.modelo || (num ? `Nº ${num}` : ''),
        color: v.color || '',
        foto_url: v.foto_url || null,
        id_corbatin: c.id_corbatin ? Number(c.id_corbatin) : null,
        numero_corbatin: num,
        corbatin_estatus: c.estatus || 'activo',
        id_empresa: v.id_empresa || c.id_empresa || 1,
        empresa_nombre: c.empresa_nombre || c.empresaNombre || v.empresa?.razon_social || 'Empresa Registrada HOA',
        conductor_nombre: c.conductorAsignado || undefined,
        updated_at: new Date().toISOString(),
      };

      if (record.id_vehiculo > 0) {
        offlineVehicleMemoryMap.set(`veh_${record.id_vehiculo}`, record);
      }
      if (record.numero_corbatin) {
        offlineVehicleMemoryMap.set(`num_${record.numero_corbatin}`, record);
        currentMap.set(`num_${record.numero_corbatin}`, record);
      }
      if (record.placas && record.placas !== 'S/P') {
        const cleanP = record.placas.replace(/[-_ ]/g, '');
        offlineVehicleMemoryMap.set(`plate_${cleanP}`, record);
      }
    }

    const merged = Array.from(currentMap.values()).slice(0, 400);
    await AsyncStorage.setItem(OFFLINE_VEHICLES_CATALOG_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('[OfflineCatalog] Error guardando catálogo de corbatines:', err);
  }
}

/**
 * Lee el catálogo de vehículos offline almacenado en disco (exclusivamente los consultados previamente en este dispositivo)
 */
export async function getOfflineVehiclesCatalog(): Promise<OfflineVehicleRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_VEHICLES_CATALOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Formatea un registro plano offline en el formato que espera el Scanner
 */
function formatOfflineRecordAsLookupResult(record: OfflineVehicleRecord): any {
  return {
    corbatin: {
      id_corbatin: record.id_corbatin || 1,
      numero: record.numero_corbatin ? Number(record.numero_corbatin) || 1 : 1,
      estatus: record.corbatin_estatus || 'activo',
      id_empresa: record.id_empresa || 1,
      id_vehiculo: record.id_vehiculo,
    },
    vehiculo: {
      id_vehiculo: record.id_vehiculo,
      placas: record.placas,
      marca: record.marca,
      modelo: record.modelo,
      color: record.color,
      foto_url: record.foto_url || null,
      id_empresa: record.id_empresa || 1,
      estatus_acceso: 'permitido',
    },
    empresa: {
      id_empresa: record.id_empresa || 1,
      razon_social: record.empresa_nombre || 'Empresa Registrada HOA',
      nombre: record.empresa_nombre || 'Empresa Registrada HOA',
    },
    conductorPrincipal: record.conductor_nombre
      ? { id_trabajador: record.conductor_id || 1, nombre: record.conductor_nombre }
      : undefined,
    sancionesActivas: [],
    totalInfracciones: 0,
    ultimoAcceso: null,
    isOfflineData: true,
  };
}

/**
 * Busca un vehículo o corbatín en la base de datos local del teléfono cuando no hay internet
 */
export async function searchOfflineVehicleCatalog(query: string): Promise<any | null> {
  const clean = (query || '').trim();
  if (!clean) return null;

  const numMatch = clean.match(/\d+/);
  const targetNumber = numMatch ? String(parseInt(numMatch[0], 10)) : null;
  const cleanPlate = clean.toUpperCase().replace(/[-_ ]/g, '');

  // 1. Revisar caché en memoria RAM
  if (targetNumber && offlineVehicleMemoryMap.has(`num_${targetNumber}`)) {
    return formatOfflineRecordAsLookupResult(offlineVehicleMemoryMap.get(`num_${targetNumber}`)!);
  }
  if (cleanPlate && offlineVehicleMemoryMap.has(`plate_${cleanPlate}`)) {
    return formatOfflineRecordAsLookupResult(offlineVehicleMemoryMap.get(`plate_${cleanPlate}`)!);
  }

  // 2. Revisar almacenamiento en disco AsyncStorage (o default seed)
  const catalog = await getOfflineVehiclesCatalog();
  for (const item of catalog) {
    if (item.id_vehiculo) offlineVehicleMemoryMap.set(`veh_${item.id_vehiculo}`, item);
    if (item.numero_corbatin) offlineVehicleMemoryMap.set(`num_${item.numero_corbatin}`, item);
    if (item.placas) {
      const cp = item.placas.replace(/[-_ ]/g, '');
      offlineVehicleMemoryMap.set(`plate_${cp}`, item);
    }
  }

  const found = catalog.find((item) => {
    if (targetNumber && String(item.numero_corbatin) === targetNumber) return true;
    if (cleanPlate && item.placas.replace(/[-_ ]/g, '') === cleanPlate) return true;
    if (cleanPlate && item.placas.toUpperCase().includes(cleanPlate)) return true;
    if (cleanPlate && cleanPlate.includes(item.placas.replace(/[-_ ]/g, ''))) return true;
    return false;
  });

  if (found) {
    return formatOfflineRecordAsLookupResult(found);
  }

  return null;
}

