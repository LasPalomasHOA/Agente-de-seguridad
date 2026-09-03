import React, { createContext, useContext, useState, useEffect } from 'react';
import { Agente } from '../types/agente';
import { ReporteInfraccion } from '../types/reporte';
import { mockAgente, mockReportesIniciales } from '../data/mockData';

interface MobileContextType {
  isAuthenticated: boolean;
  agenteActual: Agente;
  reportes: ReporteInfraccion[];
  themeMode: 'light' | 'dark';
  toggleTheme: () => void;
  login: (usuario: string, contrasena: string) => boolean;
  logout: () => void;
  agregarReporte: (
    nuevo: Omit<ReporteInfraccion, 'id' | 'folio' | 'fecha' | 'hora' | 'estado' | 'historial' | 'agenteId'>,
    estado?: 'pendiente' | 'borrador'
  ) => string;
  actualizarReporte: (reporte: ReporteInfraccion) => void;
}

const MobileContext = createContext<MobileContextType | undefined>(undefined);

export const MobileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [agenteActual, setAgenteActual] = useState<Agente>(mockAgente);
  const [reportes, setReportes] = useState<ReporteInfraccion[]>([]);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light'); // default light

  useEffect(() => {
    try {
      const localAuth = localStorage.getItem('hoa_mobile_auth');
      const localReportes = localStorage.getItem('hoa_mobile_reportes');
      const localAgente = localStorage.getItem('hoa_mobile_agente');
      const localTheme = localStorage.getItem('hoa_mobile_theme');

      if (localAuth === 'true') {
        setIsAuthenticated(true);
      }
      setReportes(localReportes ? JSON.parse(localReportes) : mockReportesIniciales);
      if (localAgente) {
        setAgenteActual(JSON.parse(localAgente));
      }
      if (localTheme === 'light' || localTheme === 'dark') {
        setThemeMode(localTheme);
      }
    } catch (e) {
      setReportes(mockReportesIniciales);
    }
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

  const login = (usuario: string, contrasena: string): boolean => {
    if (usuario.trim().toLowerCase() === 'agente' && contrasena === '1234') {
      setIsAuthenticated(true);
      try {
        localStorage.setItem('hoa_mobile_auth', 'true');
      } catch (e) {}
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

  const agregarReporte = (
    nuevo: Omit<ReporteInfraccion, 'id' | 'folio' | 'fecha' | 'hora' | 'estado' | 'historial' | 'agenteId'>,
    estado: 'pendiente' | 'borrador' = 'pendiente'
  ): string => {
    const now = new Date();
    const folioNum = Math.floor(1000 + Math.random() * 9000);
    const folioStr = `F-2026-${folioNum}`;
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    const completo: ReporteInfraccion = {
      ...nuevo,
      id: `rep_${Date.now()}`,
      folio: folioStr,
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

    // Synchronize directly with web portal hoa_sanciones database
    try {
      if (estado === 'pendiente') {
        const localSanciones = localStorage.getItem('hoa_sanciones');
        const parsedSanciones = localSanciones ? JSON.parse(localSanciones) : [];
        
        const newWebSancion = {
          id: `san_${Date.now()}`,
          vehiculoId: nuevo.vehiculoId,
          infraccionCodigo: nuevo.infraccionCodigo,
          infraccionDescripcion: nuevo.descripcion || 'Infracción reportada en recorrido',
          gravedad: 'moderada',
          estado: 'pendiente_aprobacion',
          fechaSancion: now.toISOString(),
          montoMulta: 100,
          evidenciaUrl: nuevo.evidencias[0]?.fotoUrl || 'https://images.unsplash.com/photo-1508962914676-134849a727f0?auto=format&fit=crop&q=80&w=300',
          comentarios: nuevo.descripcion,
          agenteNombre: agenteActual.nombre,
        };

        localStorage.setItem('hoa_sanciones', JSON.stringify([newWebSancion, ...parsedSanciones]));
      }
    } catch (e) {}

    return folioStr;
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
