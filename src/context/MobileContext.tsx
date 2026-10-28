import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Agente } from '../types/agente';
import { ReporteInfraccion } from '../types/reporte';
import { CatalogoInfraccionRow, ReglamentoRow } from '../types/database';
import { SupabaseService } from '../services/supabaseService';
import {
  queueReportForSync,
  getPendingReports,
  saveCachedReports,
  getCachedReports,
  syncPendingReports,
  setupNetworkRestorationListener,
  subscribeToPendingCount,
  isNetworkConnected,
  subscribeToNetworkState,
  SyncResult,
} from '../services/offlineSyncService';
import { safeStorage } from '../services/apiService';

const computeTurno = (): string => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) {
    return 'Turno Matutino (06:00 - 14:00)';
  } else if (hour >= 14 && hour < 22) {
    return 'Turno Vespertino (14:00 - 22:00)';
  } else {
    return 'Turno Nocturno (22:00 - 06:00)';
  }
};

const computeZona = (rolName?: string): string => {
  const r = (rolName || '').toLowerCase();
  if (r.includes('supervisor')) {
    return 'Supervisión General & Recorridos';
  }
  if (r.includes('admin')) {
    return 'Oficinas Administrativas HOA';
  }
  if (r.includes('proveedor')) {
    return 'Acceso Proveedores y Contratistas';
  }
  return 'Caseta Acceso Principal (Sector 4)';
};

const getAvatarUrl = (nombre?: string, avatar?: string | null): string => {
  if (avatar && typeof avatar === 'string' && avatar.trim().length > 0) {
    return avatar.trim();
  }
  return '';
};

const DEFAULT_AGENTE: Agente = {
  id: 'usr_1',
  nombre: 'Oficial de Seguridad',
  correo: 'seguridad@laspalomashoa.com',
  rol: 'Oficial',
  numEmpleado: 'AG-2026-001',
  turno: computeTurno(),
  zona: 'Caseta Acceso Principal (Sector 4)',
  estadoServicio: 'activo',
  avatarUrl: getAvatarUrl('Oficial de Seguridad', null),
};

interface MobileContextType {
  isAuthenticated: boolean;
  agenteActual: Agente;
  reportes: ReporteInfraccion[];
  catalogoInfracciones: CatalogoInfraccionRow[];
  reglamentos: ReglamentoRow[];
  themeMode: 'light' | 'dark';
  pendingSyncCount: number;
  isSyncingOffline: boolean;
  isOnline: boolean;
  toggleTheme: () => void;
  login: (usuario: string, contrasena: string) => Promise<boolean>;
  logout: () => void;
  cargarReportes: (forceRefresh?: boolean, idUsuario?: number) => Promise<void>;
  refrescarReportesOptimizado: () => Promise<{ hasChanges: boolean; totalCount: number }>;
  sincronizarPendientes: () => Promise<SyncResult>;
  cargarCatalogo: (forceRefresh?: boolean) => Promise<void>;
  agregarReporte: (
    nuevo: Omit<ReporteInfraccion, 'id' | 'folio' | 'fecha' | 'hora' | 'estado' | 'historial' | 'agenteId'> & {
      idVehiculo?: number;
      idCorbatin?: number | null;
      idInfraccion?: number;
      idUsuario?: number;
    },
    estado?: 'pendiente' | 'borrador'
  ) => Promise<string>;
  actualizarReporte: (reporte: ReporteInfraccion) => void;
}

const MobileContext = createContext<MobileContextType | undefined>(undefined);

export const MobileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [agenteActual, setAgenteActual] = useState<Agente>(DEFAULT_AGENTE);
  const [reportes, setReportes] = useState<ReporteInfraccion[]>([]);
  const [catalogoInfracciones, setCatalogoInfracciones] = useState<CatalogoInfraccionRow[]>([]);
  const [reglamentos, setReglamentos] = useState<ReglamentoRow[]>([]);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const agenteRef = React.useRef(agenteActual);
  agenteRef.current = agenteActual;

  const cargarCatalogo = useCallback(async (forceRefresh = false) => {
    try {
      const [infs, regs] = await Promise.all([
        SupabaseService.getCatalogoInfracciones(forceRefresh),
        SupabaseService.getReglamentos(forceRefresh),
        SupabaseService.getCorbatines().catch(() => []),
      ]);
      if (infs && infs.length > 0) setCatalogoInfracciones(infs);
      if (regs && regs.length > 0) setReglamentos(regs);
    } catch (err) {
      console.warn('Error cargando catálogo en contexto:', err);
    }
  }, []);

  const cargarReportes = useCallback(async (forceRefresh = false, idUsuario?: number) => {
    try {
      const currentAgenteId = agenteRef.current?.id;
      const targetUserId = idUsuario !== undefined
        ? idUsuario
        : (currentAgenteId ? parseInt(currentAgenteId.replace(/\D/g, ''), 10) : undefined);

      const [dbReportes, pendingOffline] = await Promise.all([
        SupabaseService.getReportes({
          idUsuario: targetUserId && !isNaN(targetUserId) ? targetUserId : undefined,
          limit: 30,
          forceRefresh,
        }).catch(() => null),
        getPendingReports(),
      ]);

      setPendingSyncCount(pendingOffline.length);

      const pendingReportObjects: ReporteInfraccion[] = pendingOffline
        .filter((p) => !targetUserId || Number(p.params.idUsuario) === targetUserId)
        .map((p) => ({
          ...p.reporteCompleto,
          isOfflinePending: true,
        }));

      if (dbReportes && dbReportes.length > 0) {
        const mapped: ReporteInfraccion[] = dbReportes.map((r: any) => {
          const statusLower = (r.estatus_revision || '').toLowerCase();
          const estado = statusLower === 'aprobado' || statusLower === 'aprobada'
            ? 'aprobado'
            : statusLower === 'rechazado' || statusLower === 'rechazada'
            ? 'rechazado'
            : statusLower === 'borrador'
            ? 'borrador'
            : 'pendiente';

          const corbRel = Array.isArray(r.corbatines) ? r.corbatines[0] : r.corbatines;
          const infRel = Array.isArray(r.catalogo_infracciones) ? r.catalogo_infracciones[0] : r.catalogo_infracciones;

          const resolvedNumero =
            r.corbatin?.numero ??
            r.corbatines?.numero ??
            corbRel?.numero ??
            r.numero;

          const corbatinNumeroStr = resolvedNumero !== undefined && resolvedNumero !== null
            ? `C-${resolvedNumero}`
            : (r.id_corbatin ? `C-${r.id_corbatin}` : 'S/C');

          return {
            id: `rep_${r.id_reporte}`,
            folio: `F-2026-${String(r.id_reporte).padStart(4, '0')}`,
            vehiculoId: String(r.id_vehiculo),
            corbatinNumero: corbatinNumeroStr,
            infraccionCodigo: r.infraccion?.codigo || r.catalogo_infracciones?.codigo || infRel?.codigo || 'INF-01',
            lugar: r.ubicacion_texto || 'Área Común',
            fecha: (r.fecha_hora || '').split('T')[0] || new Date().toISOString().split('T')[0],
            hora: (r.fecha_hora || '').split('T')[1]?.substring(0, 5) || '12:00',
            descripcion: r.descripcion_hechos || '',
            observaciones: r.ubicacion_texto,
            agenteId: String(r.id_usuario),
            estado,
            isOfflinePending: false,
            evidencias: (r.evidencias || []).map((ev: any, idx: number) => ({
              id: `ev_${ev.id_evidencia || idx}`,
              fotoUrl: ev.archivo,
              descripcion: ev.descripcion,
              fechaHora: ev.fecha_captura || new Date().toISOString(),
              isPrincipal: idx === 0,
            })),
            historial: [],
          };
        });

        // Fusión protegida: reportes offline pendientes van al inicio y no son eliminados
        const combined = [...pendingReportObjects, ...mapped];
        setReportes(combined);
        await saveCachedReports(combined);
        return;
      } else if (pendingReportObjects.length > 0) {
        setReportes(pendingReportObjects);
        return;
      }
    } catch (err) {
      console.warn('[MobileContext] Error cargando reportes remotos, recurriendo a caché local:', err);
      // Fallback a almacenamiento offline en disco
      const [cached, pendingOffline] = await Promise.all([
        getCachedReports(),
        getPendingReports(),
      ]);
      const pendingObjects = pendingOffline.map((p) => ({ ...p.reporteCompleto, isOfflinePending: true }));
      const combined = [...pendingObjects, ...cached.filter((c) => !pendingObjects.some((p) => p.id === c.id))];
      if (combined.length > 0) {
        setReportes(combined);
      }
    }
  }, []);

  const sincronizarPendientes = useCallback(async (): Promise<SyncResult> => {
    setIsSyncingOffline(true);
    try {
      const res = await syncPendingReports(
        async (pendingItem) => {
          return await SupabaseService.crearReporteInfraccion(pendingItem.params);
        },
        async (tempId, realId, realFolio) => {
          setReportes((prev) => {
            const updated = prev.map((r) => {
              if (r.id === tempId) {
                return {
                  ...r,
                  id: `rep_${realId}`,
                  folio: realFolio,
                  isOfflinePending: false,
                };
              }
              return r;
            });
            saveCachedReports(updated);
            return updated;
          });
        }
      );

      const pending = await getPendingReports();
      setPendingSyncCount(pending.length);
      return res;
    } finally {
      setIsSyncingOffline(false);
    }
  }, []);

  const refrescarReportesOptimizado = useCallback(async (): Promise<{ hasChanges: boolean; totalCount: number }> => {
    try {
      // 1. Sincronizar reportes pendientes offline si hay conexión (Egress 0 si no hay pendientes)
      const syncResult = await sincronizarPendientes();
      const hadOfflineSync = syncResult.syncedCount > 0;

      const currentAgenteId = agenteActual?.id;
      const targetUserId = currentAgenteId ? parseInt(currentAgenteId.replace(/\D/g, ''), 10) : undefined;
      const validUserId = targetUserId && !isNaN(targetUserId) ? targetUserId : undefined;

      const currentList = reportes || [];
      const currentCount = currentList.length;

      let latestReportId: number | undefined;
      let latestStatus: string | undefined;

      if (currentList.length > 0) {
        const topRep = currentList.find((r) => !r.isOfflinePending);
        if (topRep) {
          const numId = parseInt((topRep.id || '').replace(/\D/g, ''), 10);
          if (!isNaN(numId)) {
            latestReportId = numId;
          }
          latestStatus = topRep.estado;
        }
      }

      // 2. Verificación delta ultraligera (~80 bytes)
      const delta = await SupabaseService.checkReportesDelta({
        idUsuario: validUserId,
        currentCount,
        latestReportId,
        latestStatus,
      });

      if (!delta.hasChanges && !hadOfflineSync) {
        return { hasChanges: false, totalCount: currentCount };
      }

      // 3. Si se detectaron cambios reales o se subieron reportes offline, recargar
      await cargarReportes(true, validUserId);
      return { hasChanges: true, totalCount: delta.totalCount };
    } catch (e) {
      console.warn('[MobileContext] Error en refrescarReportesOptimizado:', e);
      return { hasChanges: false, totalCount: reportes?.length || 0 };
    }
  }, [sincronizarPendientes, agenteActual, reportes, cargarReportes]);

  // Inicialización única al montar el componente
  useEffect(() => {
    const initApp = async () => {
      try {
        const [localAuth, localAgente, localTheme, localToken, cachedList, pendingOffline] = await Promise.all([
          AsyncStorage.getItem('hoa_mobile_auth').catch(() => safeStorage.getItem('hoa_mobile_auth')),
          AsyncStorage.getItem('hoa_mobile_agente').catch(() => safeStorage.getItem('hoa_mobile_agente')),
          AsyncStorage.getItem('hoa_mobile_theme').catch(() => safeStorage.getItem('hoa_mobile_theme')),
          AsyncStorage.getItem('hoa_mobile_token').catch(() => safeStorage.getItem('hoa_mobile_token')),
          getCachedReports().catch(() => []),
          getPendingReports().catch(() => []),
        ]);

        if (localToken) {
          safeStorage.setItem('hoa_mobile_token', localToken);
        }

        if (pendingOffline && pendingOffline.length > 0) {
          setPendingSyncCount(pendingOffline.length);
        }

        if (localTheme === 'light' || localTheme === 'dark') {
          setThemeMode(localTheme);
        }

        // Carga inmediata de la UI con caché local (0ms de latencia, 0 bytes de red)
        if (cachedList && cachedList.length > 0) {
          setReportes(cachedList);
        }

        if (localAuth === 'true' && localAgente) {
          try {
            const parsed = JSON.parse(localAgente);
            if (parsed && (parsed.id || parsed.id_usuario)) {
              const activeAgente: Agente = {
                ...parsed,
                id: String(parsed.id || parsed.id_usuario),
                turno: computeTurno(),
                zona: parsed.zona || computeZona(parsed.rol),
                avatarUrl: getAvatarUrl(parsed.nombre, parsed.foto_url || parsed.avatarUrl || parsed.avatar),
              };
              setAgenteActual(activeAgente);
              setIsAuthenticated(true);
              const officerId = parseInt(activeAgente.id.replace(/\D/g, ''), 10);
              cargarReportes(false, !isNaN(officerId) ? officerId : undefined);
              cargarCatalogo(false);

              // Sincronizar pendientes si hay conexión (una sola vez al montar)
              sincronizarPendientes();
            }
          } catch {}
        }
      } catch (e) {
        console.warn('Error inicializando contexto:', e);
      }
    };

    initApp();
  }, [cargarCatalogo, cargarReportes, sincronizarPendientes]);

  // Suscribirse a eventos de red, reconexión y cambios en cola sin bucles ni intervalos
  useEffect(() => {
    isNetworkConnected().then(setIsOnline);

    const unsubRestoration = setupNetworkRestorationListener(() => {
      sincronizarPendientes();
    });
    const unsubNetState = subscribeToNetworkState((connected) => {
      setIsOnline(connected);
    });
    const unsubCount = subscribeToPendingCount((count) => {
      setPendingSyncCount(count);
    });

    return () => {
      unsubRestoration();
      unsubNetState();
      unsubCount();
    };
  }, [sincronizarPendientes]);

  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      const nextTheme = prev === 'light' ? 'dark' : 'light';
      safeStorage.setItem('hoa_mobile_theme', nextTheme);
      return nextTheme;
    });
  }, []);

  const login = useCallback(async (usuario: string, contrasena: string): Promise<boolean> => {
    const dbUser = await SupabaseService.login(usuario, contrasena);
    if (dbUser && (dbUser.id_usuario || dbUser.id)) {
      const role = dbUser.rolNombre || dbUser.roles?.nombre || dbUser.rol || 'Agente de Seguridad';
      const avatar = getAvatarUrl(dbUser.nombre, dbUser.foto_url || dbUser.avatar || dbUser.avatarUrl || dbUser.foto);
      const officerNumericId = Number(dbUser.id_usuario || dbUser.id || 1);
      const agente: Agente = {
        id: String(officerNumericId),
        nombre: dbUser.nombre || 'Oficial de Seguridad',
        correo: dbUser.correo || '',
        rol: role,
        numEmpleado: dbUser.numEmpleado || `AG-2026-${String(officerNumericId).padStart(3, '0')}`,
        turno: computeTurno(),
        zona: computeZona(role),
        estadoServicio: 'activo',
        avatarUrl: avatar,
      };
      safeStorage.setItem('hoa_mobile_auth', 'true');
      safeStorage.setItem('hoa_mobile_agente', JSON.stringify(agente));
      if (dbUser.token) {
        safeStorage.setItem('hoa_mobile_token', dbUser.token);
      }
      setAgenteActual(agente);
      setIsAuthenticated(true);
      cargarReportes(true, officerNumericId);
      cargarCatalogo(false);
      sincronizarPendientes();
      return true;
    }
    return false;
  }, [cargarReportes, cargarCatalogo, sincronizarPendientes]);

  const logout = useCallback(() => {
    safeStorage.removeItem('hoa_mobile_auth');
    safeStorage.removeItem('hoa_mobile_agente');
    safeStorage.removeItem('hoa_mobile_reportes');
    safeStorage.removeItem('hoa_mobile_token');
    setIsAuthenticated(false);
    setAgenteActual(DEFAULT_AGENTE);
    setReportes([]);
  }, []);

  const agregarReporte = useCallback(async (
    nuevo: Omit<ReporteInfraccion, 'id' | 'folio' | 'fecha' | 'hora' | 'estado' | 'historial' | 'agenteId'> & {
      idVehiculo?: number;
      idCorbatin?: number | null;
      idInfraccion?: number;
      idUsuario?: number;
    },
    estado: 'pendiente' | 'borrador' = 'pendiente'
  ): Promise<string> => {
    const now = new Date();
    const folioNum = Math.floor(1000 + Math.random() * 9000);
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    let vehIdNum = nuevo.idVehiculo;
    if (!vehIdNum) {
      vehIdNum = parseInt(nuevo.vehiculoId.replace(/\D/g, '') || '1', 10);
    }

    let corbIdNum = nuevo.idCorbatin;
    if (corbIdNum === undefined) {
      corbIdNum = null;
    }

    let infIdNum = nuevo.idInfraccion;
    const catalogo = catalogoInfracciones.length > 0 ? catalogoInfracciones : await SupabaseService.getCatalogoInfracciones();
    const validExists = catalogo.some((c) => Number(c.id_infraccion) === Number(infIdNum));

    if (!infIdNum || !validExists) {
      const found =
        catalogo.find((c) => (c.codigo || '').toLowerCase() === (nuevo.infraccionCodigo || '').toLowerCase()) ||
        catalogo.find((c) => (c.categoria || '').toLowerCase().includes('general') || (c.nombre || '').toLowerCase().includes('otro')) ||
        catalogo[0];
      infIdNum = found ? Number(found.id_infraccion) : 1;
    }

    let usrIdNum = nuevo.idUsuario;
    if (!usrIdNum) {
      usrIdNum = parseInt(agenteActual.id.replace(/\D/g, '') || '1', 10) || 1;
    }

    const payloadParams = {
      idVehiculo: Number(vehIdNum) || 1,
      idCorbatin: corbIdNum && Number(corbIdNum) > 0 ? Number(corbIdNum) : null,
      idInfraccion: Number(infIdNum) || 1,
      idUsuario: Number(usrIdNum) || 1,
      ubicacionTexto: nuevo.lugar,
      descripcionHechos: nuevo.descripcion,
      evidencias: nuevo.evidencias,
      evidenciasUrls: nuevo.evidencias.map((e) => e.fotoUrl),
    };

    let dbReporteId: number | null = null;
    const isOnline = await isNetworkConnected();

    // Si hay internet, intentar guardar de inmediato en el servidor
    if (isOnline) {
      try {
        const dbRes = await SupabaseService.crearReporteInfraccion(payloadParams);
        if (dbRes?.idReporte) {
          dbReporteId = dbRes.idReporte;
        }
      } catch (e) {
        console.warn('[MobileContext] Error guardando directamente en Supabase:', e);
      }
    }

    // Si falló el envío o no había conexión y es un reporte pendiente, encolar offline
    const isOffline = !dbReporteId;
    const finalId = dbReporteId ? `rep_${dbReporteId}` : `pending_${Date.now()}`;
    const finalFolio = dbReporteId ? `F-2026-${String(dbReporteId).padStart(4, '0')}` : `F-2026-PEND-${folioNum}`;

    const completo: ReporteInfraccion = {
      ...nuevo,
      id: finalId,
      folio: finalFolio,
      fecha: dateStr,
      hora: timeStr,
      estado: estado,
      agenteId: agenteActual.id,
      isOfflinePending: isOffline && estado !== 'borrador',
      historial: [
        {
          id: `hist_${Date.now()}`,
          fecha: now.toISOString(),
          estado: estado,
          detalles: estado === 'borrador'
            ? 'Reporte guardado como borrador.'
            : isOffline
            ? 'Reporte guardado localmente (sin internet). Se subirá al restablecerse la conexión.'
            : 'Reporte enviado a revisión de HOA.',
          usuarioNombre: agenteActual.nombre,
        },
      ],
    };

    // Guardar en cola persistente si es un reporte que debe subirse al servidor
    if (isOffline && estado !== 'borrador') {
      await queueReportForSync({
        tempId: finalId,
        tempFolio: finalFolio,
        createdAt: now.toISOString(),
        params: payloadParams,
        reporteCompleto: completo,
      });
    }

    setReportes((prev) => {
      const updated = [completo, ...prev];
      saveCachedReports(updated);
      return updated;
    });

    return completo.folio;
  }, [agenteActual, catalogoInfracciones]);

  const actualizarReporte = useCallback((reporte: ReporteInfraccion) => {
    setReportes((prev) => {
      const updated = prev.map((r) => (r.id === reporte.id ? reporte : r));
      saveCachedReports(updated);
      return updated;
    });
  }, []);

  const contextValue = useMemo<MobileContextType>(
    () => ({
      isAuthenticated,
      agenteActual,
      reportes,
      catalogoInfracciones,
      reglamentos,
      themeMode,
      pendingSyncCount,
      isSyncingOffline,
      isOnline,
      toggleTheme,
      login,
      logout,
      cargarReportes,
      refrescarReportesOptimizado,
      sincronizarPendientes,
      cargarCatalogo,
      agregarReporte,
      actualizarReporte,
    }),
    [
      isAuthenticated,
      agenteActual,
      reportes,
      catalogoInfracciones,
      reglamentos,
      themeMode,
      pendingSyncCount,
      isSyncingOffline,
      isOnline,
      toggleTheme,
      login,
      logout,
      cargarReportes,
      refrescarReportesOptimizado,
      sincronizarPendientes,
      cargarCatalogo,
      agregarReporte,
      actualizarReporte,
    ]
  );

  return (
    <MobileContext.Provider value={contextValue}>
      {children}
    </MobileContext.Provider>
  );
};

export const useMobile = () => {
  const context = useContext(MobileContext);
  if (context === undefined) {
    throw new Error('useMobile must be used within a MobileProvider');
  }
  return context;
};
