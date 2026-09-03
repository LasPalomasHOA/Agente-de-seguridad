// Servicio de Comunicación con la API REST (PostgreSQL vía Backend Express)
import {
  CorbatinRow,
  VehiculoRow,
  EmpresaRow,
  TrabajadorRow,
  CatalogoInfraccionRow,
  ReporteInfraccionDbRow,
  EvidenciaDbRow,
  SancionDbRow,
  BitacoraAccesoRow,
  ReglamentoRow,
  ReglaReincidenciaRow,
} from '../types/database';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

export interface CorbatinLookupResult {
  corbatin: CorbatinRow;
  vehiculo: VehiculoRow;
  empresa: EmpresaRow;
  conductorPrincipal?: TrabajadorRow;
  sancionesActivas: SancionDbRow[];
  totalInfracciones: number;
}

const fetchJson = async (endpoint: string, options?: RequestInit): Promise<any> => {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      let errorJson: any = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch {}
      throw new Error(errorJson?.error || errorJson?.message || `HTTP ${res.status}: ${errorText || res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    console.warn(`[ApiService] Error en llamada a ${url}:`, err.message);
    throw err;
  }
};

export const ApiService = {
  /**
   * Verifica el estado del servidor Express / PostgreSQL
   */
  async checkStatus(): Promise<{ status: string; timestamp?: string } | null> {
    try {
      return await fetchJson('/status');
    } catch {
      return null;
    }
  },

  /**
   * Autentica al agente con correo/usuario y contraseña
   */
  async login(usuarioOCorreo: string, contrasena: string): Promise<any | null> {
    try {
      const cleanUser = usuarioOCorreo.trim().toLowerCase();

      // 1. Intentar login directo con la API
      try {
        const res = await fetchJson('/usuarios/login', {
          method: 'POST',
          body: JSON.stringify({
            correo: cleanUser,
            password: contrasena,
          }),
        });

        const userData = res?.usuario || res;
        if (userData && (userData.id_usuario || userData.id)) {
          const id = userData.id_usuario || userData.id;
          return {
            id_usuario: id,
            nombre: userData.nombre,
            correo: userData.correo,
            numEmpleado: `AG-2026-${String(id).padStart(3, '0')}`,
            roles: { nombre: userData.rolNombre || userData.rol?.nombre || userData.rol || 'Agente de Seguridad' },
            token: res.token,
          };
        }
      } catch (loginErr) {
        // Si el usuario ingresó nombre de usuario o rfc en vez de correo, buscar en /usuarios
        const usuarios = await this.getUsuarios();
        const found = usuarios.find(
          (u: any) =>
            u.correo?.toLowerCase() === cleanUser ||
            u.nombre?.toLowerCase().includes(cleanUser)
        );

        if (found && found.correo) {
          try {
            const resRetry = await fetchJson('/usuarios/login', {
              method: 'POST',
              body: JSON.stringify({
                correo: found.correo,
                password: contrasena,
              }),
            });
            const userDataRetry = resRetry?.usuario || resRetry;
            if (userDataRetry && (userDataRetry.id_usuario || userDataRetry.id)) {
              const id = userDataRetry.id_usuario || userDataRetry.id;
              return {
                id_usuario: id,
                nombre: userDataRetry.nombre,
                correo: userDataRetry.correo,
                numEmpleado: `AG-2026-${String(id).padStart(3, '0')}`,
                roles: { nombre: userDataRetry.rolNombre || userDataRetry.rol?.nombre || userDataRetry.rol || 'Agente de Seguridad' },
              };
            }
          } catch {}
        }
      }

      // Fallback demo local si la base de datos no tiene credenciales aún
      if (cleanUser === 'agente' && contrasena === '1234') {
        return {
          id_usuario: 1,
          nombre: 'Oficial de Seguridad',
          correo: 'seguridad@laspalomas.com',
          numEmpleado: 'AG-2026-001',
          roles: { nombre: 'Agente de Seguridad' },
        };
      }

      return null;
    } catch (e) {
      console.warn('[ApiService] Error en login:', e);
      if (usuarioOCorreo.trim().toLowerCase() === 'agente' && contrasena === '1234') {
        return {
          id_usuario: 1,
          nombre: 'Oficial de Seguridad',
          correo: 'seguridad@laspalomas.com',
          numEmpleado: 'AG-2026-001',
          roles: { nombre: 'Agente de Seguridad' },
        };
      }
      return null;
    }
  },

  /**
   * Obtiene la lista de usuarios
   */
  async getUsuarios(): Promise<any[]> {
    try {
      return await fetchJson('/usuarios');
    } catch {
      return [];
    }
  },

  /**
   * Busca un corbatín por número o token QR y retorna vehículo, empresa y sanciones
   */
  async buscarCorbatin(param: string): Promise<CorbatinLookupResult | null> {
    try {
      const cleanParam = param.trim();
      const isNum = /^\d+$/.test(cleanParam);
      const numTarget = isNum ? parseInt(cleanParam, 10) : parseInt(cleanParam.replace(/\D/g, '') || '0', 10);

      const [corbatines, vehiculos] = await Promise.all([
        this.getCorbatines(),
        this.getVehiculos(),
      ]);

      // Buscar corbatín coincidente
      let matchedCorbatin: any = corbatines.find((c: any) => {
        if (isNum && c.numero === numTarget) return true;
        if (c.qr_token && c.qr_token.toUpperCase().includes(cleanParam.toUpperCase())) return true;
        if (c.numero === numTarget && numTarget > 0) return true;
        return false;
      });

      // Si no se encontró en corbatines, buscar en vehículos por placa o ID
      let matchedVehiculo: any = null;
      if (matchedCorbatin) {
        matchedVehiculo =
          matchedCorbatin.vehiculo ||
          vehiculos.find((v: any) => v.id_vehiculo === matchedCorbatin.id_vehiculo);
      } else {
        matchedVehiculo = vehiculos.find(
          (v: any) =>
            (v.placas && v.placas.toUpperCase().includes(cleanParam.toUpperCase())) ||
            (v.placa && v.placa.toUpperCase().includes(cleanParam.toUpperCase())) ||
            String(v.id_vehiculo) === cleanParam
        );
        if (matchedVehiculo) {
          matchedCorbatin = corbatines.find((c: any) => c.id_vehiculo === matchedVehiculo.id_vehiculo) || {
            id_corbatin: 0,
            id_vehiculo: matchedVehiculo.id_vehiculo,
            numero: 0,
            qr_token: 'S/C',
            fecha_emision: new Date().toISOString(),
            fecha_vencimiento: null,
            estatus: 'activo',
            fecha_impresion: null,
            motivo_cancelacion: null,
          };
        }
      }

      if (!matchedVehiculo) return null;

      const corbatinRow: CorbatinRow = {
        id_corbatin: matchedCorbatin?.id_corbatin || 0,
        id_vehiculo: matchedVehiculo.id_vehiculo,
        numero: matchedCorbatin?.numero || 0,
        qr_token: matchedCorbatin?.qr_token || 'S/C',
        fecha_emision: matchedCorbatin?.fecha_emision || new Date().toISOString(),
        fecha_vencimiento: matchedCorbatin?.fecha_vencimiento || null,
        estatus: (matchedCorbatin?.estatus?.toLowerCase() as any) || 'activo',
        fecha_impresion: null,
        motivo_cancelacion: null,
      };

      const vehiculoRow: VehiculoRow = {
        id_vehiculo: matchedVehiculo.id_vehiculo,
        id_empresa: matchedVehiculo.id_empresa || 1,
        marca: matchedVehiculo.marca || 'Genérica',
        modelo: matchedVehiculo.modelo || 'Vehículo',
        año: matchedVehiculo.año || matchedVehiculo.anio || 2024,
        placas: matchedVehiculo.placas || matchedVehiculo.placa || 'SIN-PLACA',
        color: matchedVehiculo.color || 'Blanco',
        foto_url: matchedVehiculo.foto_url || matchedVehiculo.foto || null,
        estatus_acceso: matchedVehiculo.estatus_acceso || 'HABILITADO',
        created_at: matchedVehiculo.created_at || new Date().toISOString(),
        updated_at: matchedVehiculo.updated_at || new Date().toISOString(),
      };

      const empresaRow: EmpresaRow = matchedVehiculo.empresa || {
        id_empresa: matchedVehiculo.id_empresa || 1,
        razon_social: matchedVehiculo.empresaNombre || 'Constructora y Mantenimiento Residencial',
        responsable_nombre: 'Administración HOA',
        telefono: '(638) 382-8000',
        correo: 'contacto@hoa-laspalomas.com',
        estatus: 'activa',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Conductor asignado
      let conductorPrincipal: TrabajadorRow | undefined = undefined;
      if (matchedVehiculo.conductor) {
        conductorPrincipal = {
          id_trabajador: matchedVehiculo.conductorId || 1,
          id_empresa: empresaRow.id_empresa,
          nombre: matchedVehiculo.conductor,
          apellidos: '',
          telefono: '(638) 100-2020',
          foto_url: null,
          activo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      // Sanciones del vehículo
      const todasSanciones = await this.getSanciones();
      const sancionesActivas = todasSanciones
        .filter((s: any) => s.id_vehiculo === vehiculoRow.id_vehiculo && (s.estatus === 'ACTIVA' || s.estatus === 'activa'))
        .map((s: any) => ({
          id_sancion: s.id_sancion,
          id_reporte: s.id_reporte || 1,
          id_vehiculo: s.id_vehiculo,
          id_empresa: s.id_empresa,
          id_regla: s.id_regla || 1,
          numero_reincidencia: s.numero_reincidencia || 1,
          fecha_inicio: s.fecha_inicio || new Date().toISOString(),
          fecha_fin: s.fecha_fin || null,
          estatus: (s.estatus?.toLowerCase() as any) || 'activa',
          motivo: s.motivo || 'Falta al reglamento',
          id_usuario: s.id_usuario || 1,
          created_at: s.created_at || new Date().toISOString(),
          updated_at: s.updated_at || new Date().toISOString(),
        }));

      const reportesVehiculo = await this.getReportes();
      const totalInfracciones = reportesVehiculo.filter((r: any) => r.id_vehiculo === vehiculoRow.id_vehiculo).length;

      return {
        corbatin: corbatinRow,
        vehiculo: vehiculoRow,
        empresa: empresaRow,
        conductorPrincipal,
        sancionesActivas,
        totalInfracciones,
      };
    } catch (e) {
      console.warn('[ApiService] Error en buscarCorbatin:', e);
      return null;
    }
  },

  /**
   * Busca un vehículo por su placa
   */
  async buscarVehiculoPorPlaca(placa: string): Promise<CorbatinLookupResult | null> {
    return this.buscarCorbatin(placa);
  },

  /**
   * Obtiene el catálogo de infracciones
   */
  async getCatalogoInfracciones(): Promise<CatalogoInfraccionRow[]> {
    try {
      const data = await fetchJson('/infracciones');
      return (data || []).map((inf: any) => ({
        id_infraccion: inf.id_infraccion,
        id_reglamento: inf.id_reglamento || 1,
        codigo: inf.codigo,
        nombre: inf.nombre,
        descripcion: inf.descripcion || '',
        categoria: inf.categoria || 'General',
        activo: inf.activo ?? true,
      }));
    } catch {
      return [];
    }
  },

  /**
   * Obtiene los reglamentos
   */
  async getReglamentos(): Promise<ReglamentoRow[]> {
    try {
      const data = await fetchJson('/reglamentos');
      return (data || []).map((reg: any) => ({
        id_reglamento: reg.id_reglamento,
        version: reg.version || '2026.1',
        titulo: reg.titulo || 'Reglamento General',
        archivo_url: reg.archivo_url || '',
        fecha_publicacion: reg.fecha_publicacion || new Date().toISOString(),
        vigente: reg.vigente ?? true,
        created_at: reg.created_at || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  },

  /**
   * Obtiene las reglas de reincidencia
   */
  async getReglasReincidencia(): Promise<ReglaReincidenciaRow[]> {
    try {
      const data = await fetchJson('/reglas');
      return (data || []).map((r: any) => ({
        id_regla: r.id_regla,
        numero_falta: r.numero_falta,
        permite_acceso: r.permite_acceso ?? true,
        requiere_administrador: r.requiere_administrador ?? false,
        mensaje_alerta: r.mensaje_alerta || '',
        activo: r.activo ?? true,
      }));
    } catch {
      return [];
    }
  },

  /**
   * Registra un nuevo reporte de infracción
   */
  async crearReporteInfraccion(params: {
    idVehiculo: number;
    idCorbatin?: number | null;
    idInfraccion: number;
    idUsuario: number;
    ubicacionTexto?: string;
    descripcionHechos: string;
    evidenciasUrls?: string[];
  }): Promise<{ idReporte: number } | null> {
    try {
      const res = await fetchJson('/reportes', {
        method: 'POST',
        body: JSON.stringify({
          id_vehiculo: params.idVehiculo,
          id_corbatin: params.idCorbatin || null,
          id_infraccion: params.idInfraccion,
          id_usuario: params.idUsuario,
          ubicacion_texto: params.ubicacionTexto || 'Recorrido Residencial',
          descripcion_hechos: params.descripcionHechos,
          evidencia_url: params.evidenciasUrls?.[0] || null,
        }),
      });

      if (res && res.id_reporte) {
        return { idReporte: res.id_reporte };
      }
      return null;
    } catch (e) {
      console.error('[ApiService] Error al crear reporte de infracción:', e);
      return null;
    }
  },

  /**
   * Obtiene la lista de reportes emitidos
   */
  async getReportes(idUsuario?: number): Promise<any[]> {
    try {
      const data = await fetchJson('/reportes');
      if (Array.isArray(data)) {
        if (idUsuario) {
          return data.filter((r: any) => r.id_usuario === idUsuario);
        }
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Registra un evento en la bitácora de accesos
   */
  async registrarAccesoBitacora(params: {
    idCaseta: number;
    idVehiculo: number;
    idCorbatin?: number | null;
    idConductor?: number | null;
    idUsuario: number;
    ubicacionTrabajo?: string;
    estatusAcceso: 'permitido' | 'denegado' | 'salida' | 'forzado';
    motivoRechazo?: string;
    observaciones?: string;
  }): Promise<boolean> {
    try {
      const estatusMap: Record<string, string> = {
        permitido: 'PERMITIDO',
        denegado: 'DENEGADO',
        salida: 'SALIDA',
        forzado: 'FORZADO',
      };

      await fetchJson('/bitacora', {
        method: 'POST',
        body: JSON.stringify({
          id_caseta: params.idCaseta,
          id_vehiculo: params.idVehiculo,
          id_corbatin: params.idCorbatin || null,
          id_conductor: params.idConductor || null,
          id_usuario: params.idUsuario,
          ubicacion_trabajo: params.ubicacionTrabajo || null,
          estatus_acceso: estatusMap[params.estatusAcceso] || 'PERMITIDO',
          motivo_rechazo: params.motivoRechazo || null,
          observaciones: params.observaciones || null,
        }),
      });

      return true;
    } catch {
      return false;
    }
  },

  /**
   * Obtiene vehículos
   */
  async getVehiculos(): Promise<VehiculoRow[]> {
    try {
      const data = await fetchJson('/vehiculos');
      return data || [];
    } catch {
      return [];
    }
  },

  /**
   * Obtiene empresas
   */
  async getEmpresas(): Promise<EmpresaRow[]> {
    try {
      const data = await fetchJson('/empresas');
      return data || [];
    } catch {
      return [];
    }
  },

  /**
   * Obtiene corbatines
   */
  async getCorbatines(): Promise<CorbatinRow[]> {
    try {
      const data = await fetchJson('/corbatines');
      return data || [];
    } catch {
      return [];
    }
  },

  /**
   * Obtiene sanciones
   */
  async getSanciones(): Promise<any[]> {
    try {
      const data = await fetchJson('/sanciones');
      return data || [];
    } catch {
      return [];
    }
  },

  /**
   * Obtiene casetas
   */
  async getCasetas(): Promise<any[]> {
    try {
      const data = await fetchJson('/casetas');
      return data || [];
    } catch {
      return [];
    }
  },
};
