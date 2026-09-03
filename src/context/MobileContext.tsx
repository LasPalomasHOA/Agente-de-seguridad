import React, { createContext, useContext, useState, useEffect } from 'react';
import { Agente } from '../types/agente';
import { ReporteInfraccion } from '../types/reporte';
import { SupabaseService } from '../services/supabaseService';

const DEFAULT_AGENTE: Agente = {
  id: 'usr_1',
  nombre: 'Oficial de Guardia',
  numEmpleado: 'AG-2026-001',
  turno: 'Matutino (06:00 - 14:00)',
  zona: 'Caseta Principal & Fase 1',
  estadoServicio: 'activo',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
};

interface MobileContextType {
  isAuthenticated: boolean;
  agenteActual: Agente;
  reportes: ReporteInfraccion[];
  themeMode: 'light' | 'dark';
  toggleTheme: () => void;
  login: (usuario: string, contrasena: string) => Promise<boolean>;
  logout: () => void;
  cargarReportes: () => Promise<void>;
  agregarReporte: (
    nuevo: Omit<ReporteInfraccion, 'id' | 'folio' | 'fecha' | 'hora' | 'estado' | 'historial' | 'agenteId'>,
    estado?: 'pendiente' | 'borrador'
  ) => Promise<string>;
  actualizarReporte: (reporte: ReporteInfraccion) => void;
}

const MobileContext = createContext<MobileContextType | undefined>(undefined);

export const MobileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [agenteActual, setAgenteActual] = useState<Agente>(DEFAULT_AGENTE);
  const [reportes, setReportes] = useState<ReporteInfraccion[]>([]);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');

  const cargarReportes = async () => {
    try {
      const dbReportes = await SupabaseService.getReportes();
      if (dbReportes && dbReportes.length > 0) {
        const mapped: ReporteInfraccion[] = dbReportes.map((r: any) => {
          const statusLower = (r.estatus_revision || '').toLowerCase();
          const estado = statusLower === 'aprobado' || statusLower === 'aprobada'
            ? 'aprobado'
            : statusLower === 'rechazado' || statusLower === 'rechazada'
            ? 'rechazado'
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
  };

  useEffect(() => {
    try {
      const localAuth = localStorage.getItem('hoa_mobile_auth');
      const localAgente = localStorage.getItem('hoa_mobile_agente');
      const localTheme = localStorage.getItem('hoa_mobile_theme');

      if (localAuth === 'true') {
        setIsAuthenticated(true);
      }
      if (localAgente) {
        setAgenteActual(JSON.parse(localAgente));
      }
      if (localTheme === 'light' || localTheme === 'dark') {
        setThemeMode(localTheme);
      }
    } catch (e) {}

    cargarReportes();
  }, []);

  const saveReportes = (newReportes: ReporteInfraccion[]) => {
    setReportes(newReportes);
    try {
      localStorage.setItem('hoa_mobile_reportes', JSON.stringify(newReportes));
    } catch (e) {}
  };

  const toggleTheme = () => {
    const nextTheme = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(nextTheme);
    try {
      localStorage.setItem('hoa_mobile_theme', nextTheme);
    } catch (e) {}
  };

  const login = async (usuario: string, contrasena: string): Promise<boolean> => {
    const dbUser = await SupabaseService.login(usuario, contrasena);
    if (dbUser) {
      const agente: Agente = {
        id: String(dbUser.id_usuario || 1),
        nombre: dbUser.nombre || 'Oficial de Seguridad',
        numEmpleado: dbUser.numEmpleado || `AG-2026-${String(dbUser.id_usuario || 1).padStart(3, '0')}`,
        turno: 'Turno en Servicio',
        zona: 'Residencial Las Palomas',
        estadoServicio: 'activo',
        avatarUrl: DEFAULT_AGENTE.avatarUrl,
      };
      setAgenteActual(agente);
      setIsAuthenticated(true);
      try {
        localStorage.setItem('hoa_mobile_auth', 'true');
        localStorage.setItem('hoa_mobile_agente', JSON.stringify(agente));
      } catch (e) {}
      cargarReportes();
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('hoa_mobile_auth');
    } catch (e) {}
  };

  const agregarReporte = async (
    nuevo: Omit<ReporteInfraccion, 'id' | 'folio' | 'fecha' | 'hora' | 'estado' | 'historial' | 'agenteId'>,
    estado: 'pendiente' | 'borrador' = 'pendiente'
  ): Promise<string> => {
    const now = new Date();
    const folioNum = Math.floor(1000 + Math.random() * 9000);
    const folioStr = `F-2026-${folioNum}`;
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    let dbReporteId: number | null = null;

    // Guardar en la base de datos Supabase
    try {
      const vehIdNum = parseInt(nuevo.vehiculoId.replace(/\D/g, '') || '1', 10);
      const corbIdNum = parseInt(nuevo.corbatinNumero.replace(/\D/g, '') || '0', 10);
      const usrIdNum = parseInt(agenteActual.id.replace(/\D/g, '') || '1', 10);
      const infIdNum = parseInt(nuevo.infraccionCodigo.replace(/\D/g, '') || '1', 10);

      const dbRes = await SupabaseService.crearReporteInfraccion({
        idVehiculo: vehIdNum,
        idCorbatin: corbIdNum > 0 ? corbIdNum : null,
        idInfraccion: infIdNum,
        idUsuario: usrIdNum,
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

    const updated = [completo, ...reportes];
    saveReportes(updated);

    return completo.folio;
  };

  const actualizarReporte = (reporte: ReporteInfraccion) => {
    const updated = reportes.map((r) => (r.id === reporte.id ? reporte : r));
    saveReportes(updated);
  };

  return (
    <MobileContext.Provider
      value={{
        isAuthenticated,
        agenteActual,
        reportes,
        themeMode,
        toggleTheme,
        login,
        logout,
        cargarReportes,
        agregarReporte,
        actualizarReporte,
      }}
    >
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
