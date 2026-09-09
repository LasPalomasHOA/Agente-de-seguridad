import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Platform } from 'react-native';
import { Agente } from '../types/agente';
import { ReporteInfraccion } from '../types/reporte';
import { CatalogoInfraccionRow, ReglamentoRow } from '../types/database';
import { SupabaseService } from '../services/supabaseService';

const memoryStorageMap = new Map<string, string>();

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return memoryStorageMap.get(key) || null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
    memoryStorageMap.set(key, value);
  },
  removeItem: (key: string): void => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
    memoryStorageMap.delete(key);
  },
};

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
  return 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200';
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
  toggleTheme: () => void;
  login: (usuario: string, contrasena: string) => Promise<boolean>;
  logout: () => void;
  cargarReportes: (forceRefresh?: boolean, idUsuario?: number) => Promise<void>;
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

  const agenteRef = React.useRef(agenteActual);
  agenteRef.current = agenteActual;

  const cargarCatalogo = useCallback(async (forceRefresh = false) => {
    try {
      const [infs, regs] = await Promise.all([
        SupabaseService.getCatalogoInfracciones(forceRefresh),
        SupabaseService.getReglamentos(forceRefresh),
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

      const dbReportes = await SupabaseService.getReportes({
        idUsuario: targetUserId && !isNaN(targetUserId) ? targetUserId : undefined,
        limit: 30,
        forceRefresh,
      });
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

          return {
            id: `rep_${r.id_reporte}`,
            folio: `F-2026-${String(r.id_reporte).padStart(4, '0')}`,
            vehiculoId: String(r.id_vehiculo),
            corbatinNumero: r.corbatin?.numero ? `C-2026-${String(r.corbatin.numero).padStart(3, '0')}` : (r.id_corbatin ? `C-2026-${String(r.id_corbatin).padStart(3, '0')}` : 'S/C'),
            infraccionCodigo: r.infraccion?.codigo || r.catalogo_infracciones?.codigo || 'INF-01',
            lugar: r.ubicacion_texto || 'Área Común',
            fecha: (r.fecha_hora || '').split('T')[0] || new Date().toISOString().split('T')[0],
            hora: (r.fecha_hora || '').split('T')[1]?.substring(0, 5) || '12:00',
            descripcion: r.descripcion_hechos || '',
            observaciones: r.ubicacion_texto,
            agenteId: String(r.id_usuario),
            estado,
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
        setReportes(mapped);
        return;
      }
    } catch (err) {
      console.warn('Error cargando reportes:', err);
    }
  }, []);

  // Inicialización única al montar el componente
  useEffect(() => {
    const initApp = async () => {
      try {
        const localAuth = safeStorage.getItem('hoa_mobile_auth');
        const localAgente = safeStorage.getItem('hoa_mobile_agente');
        const localTheme = safeStorage.getItem('hoa_mobile_theme');

        if (localTheme === 'light' || localTheme === 'dark') {
          setThemeMode(localTheme);
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
            }
          } catch {}
        }
      } catch (e) {
        console.warn('Error inicializando contexto:', e);
      } finally {
        cargarCatalogo(false);
      }
    };

    initApp();
  }, [cargarCatalogo, cargarReportes]);

  const saveReportes = useCallback((newReportes: ReporteInfraccion[]) => {
    setReportes(newReportes);
    safeStorage.setItem('hoa_mobile_reportes', JSON.stringify(newReportes));
  }, []);

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
      setAgenteActual(agente);
      setIsAuthenticated(true);
      cargarReportes(true, officerNumericId);
      cargarCatalogo(false);
      return true;
    }
    return false;
  }, [cargarReportes, cargarCatalogo]);

  const logout = useCallback(() => {
    safeStorage.removeItem('hoa_mobile_auth');
    safeStorage.removeItem('hoa_mobile_agente');
    safeStorage.removeItem('hoa_mobile_reportes');
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
    const folioStr = `F-2026-${folioNum}`;
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    let dbReporteId: number | null = null;

    // Guardar en la base de datos Supabase / API Express
    try {
      let vehIdNum = nuevo.idVehiculo;
      if (!vehIdNum) {
        vehIdNum = parseInt(nuevo.vehiculoId.replace(/\D/g, '') || '1', 10);
      }

      let corbIdNum = nuevo.idCorbatin;
      if (corbIdNum === undefined) {
        corbIdNum = null;
      }

      let infIdNum = nuevo.idInfraccion;
      if (!infIdNum) {
        const catalogo = catalogoInfracciones.length > 0 ? catalogoInfracciones : await SupabaseService.getCatalogoInfracciones();
        const found = catalogo.find(
          (c) => (c.codigo || '').toLowerCase() === (nuevo.infraccionCodigo || '').toLowerCase()
        );
        infIdNum = found ? Number(found.id_infraccion) : 1;
      }

      let usrIdNum = nuevo.idUsuario;
      if (!usrIdNum) {
        usrIdNum = parseInt(agenteActual.id.replace(/\D/g, '') || '1', 10) || 1;
      }

      const dbRes = await SupabaseService.crearReporteInfraccion({
        idVehiculo: Number(vehIdNum) || 1,
        idCorbatin: corbIdNum && Number(corbIdNum) > 0 ? Number(corbIdNum) : null,
        idInfraccion: Number(infIdNum) || 1,
        idUsuario: Number(usrIdNum) || 1,
        ubicacionTexto: nuevo.lugar,
        descripcionHechos: nuevo.descripcion,
        evidenciasUrls: nuevo.evidencias.map((e) => e.fotoUrl),
      });

      if (dbRes?.idReporte) {
        dbReporteId = dbRes.idReporte;
      }
    } catch (e) {
      console.warn('Error guardando en Supabase:', e);
    }

    const completo: ReporteInfraccion = {
      ...nuevo,
      id: dbReporteId ? `rep_${dbReporteId}` : `rep_${Date.now()}`,
      folio: dbReporteId ? `F-2026-${String(dbReporteId).padStart(4, '0')}` : folioStr,
      fecha: dateStr,
      hora: timeStr,
      estado: estado,
      agenteId: agenteActual.id,
      historial: [
        {
          id: `hist_${Date.now()}`,
          fecha: now.toISOString(),
          estado: estado,
          detalles: estado === 'borrador' ? 'Reporte guardado como borrador.' : 'Reporte enviado a revisión de HOA.',
          usuarioNombre: agenteActual.nombre,
        },
      ],
    };

    setReportes((prev) => {
      const updated = [completo, ...prev];
      safeStorage.setItem('hoa_mobile_reportes', JSON.stringify(updated));
      return updated;
    });

    return completo.folio;
  }, [agenteActual, catalogoInfracciones]);

  const actualizarReporte = useCallback((reporte: ReporteInfraccion) => {
    setReportes((prev) => {
      const updated = prev.map((r) => (r.id === reporte.id ? reporte : r));
      safeStorage.setItem('hoa_mobile_reportes', JSON.stringify(updated));
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
      toggleTheme,
      login,
      logout,
      cargarReportes,
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
      toggleTheme,
      login,
      logout,
      cargarReportes,
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
