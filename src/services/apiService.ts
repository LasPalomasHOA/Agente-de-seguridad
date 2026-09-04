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

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const resolveApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') {
    return envUrl || 'http://localhost:5000/api';
  }

  // Si estamos en un dispositivo móvil y la URL apunta a localhost o 127.0.0.1
  if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost || (Constants as any).manifest?.debuggerHost;
    if (hostUri) {
      const hostIp = hostUri.split(':')[0];
      if (hostIp) {
        return `http://${hostIp}:5000/api`;
      }
    }
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:5000/api';
    }
  }

  return envUrl || 'http://localhost:5000/api';
};

export const API_BASE_URL = resolveApiBaseUrl();

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
   * Extrae candidatos de búsqueda a partir de cualquier formato ingresado o escaneado:
   * Formatos QR soportados: "LP-HOA|CORB:105|PLACAS:X|VIG:2026-2027", JSONs, URLs, prefijos C-2026-105, números puros y placas.
   */
  extractSearchTokens(raw: string): { numbers: number[]; tokens: string[]; plates: string[] } {
    const clean = (raw || '').trim();
    const candidates: {
      numbers: number[];
      tokens: string[];
      plates: string[];
    } = {
      numbers: [],
      tokens: [clean],
      plates: [clean],
    };

    if (!clean) return candidates;

    // 1. Formatos estructurados delimitados
    const delimiterPattern = /[|;,\n\r&]+/;
    if (delimiterPattern.test(clean)) {
      const segments = clean.split(delimiterPattern).map((s) => s.trim()).filter(Boolean);
      for (const seg of segments) {
        candidates.tokens.push(seg);
        if (seg.includes(':') || seg.includes('=')) {
          const [keyPart, ...valParts] = seg.split(/[:=]/);
          const key = keyPart.trim().toUpperCase();
          const val = valParts.join(':').trim();
          if (val) {
            candidates.tokens.push(val);
            // SOLO extraer corbatín para campos correspondientes a corbatín o número (nunca de vehículo)
            if (/^(?:CORB|CORBATIN|NUM|NUMERO|NO|TAG)$/i.test(key)) {
              const numVal = parseInt(val.replace(/\D/g, ''), 10);
              if (!isNaN(numVal) && numVal > 0) {
                candidates.numbers.push(numVal);
              }
            }
            if (/^(?:PLACA|PLACAS|PLATE|PLATES)$/i.test(key)) {
              if (val.toUpperCase() !== 'X' && val.toUpperCase() !== 'N/A' && val.toUpperCase() !== 'S/P' && val.toUpperCase() !== 'SIN') {
                candidates.plates.push(val);
                candidates.plates.push(val.replace(/[-_ ]/g, ''));
              }
            }
          }
        }
      }
    }

    // 2. Extracción directa con Expresiones Regulares para corbatín
    const corbMatches = clean.matchAll(/(?:CORB(?:ATIN)?|NUM(?:ERO)?|TAG|C)[-:_ #=]*(?:20\d\d[-_ ]*)?0*(\d+)/gi);
    for (const match of corbMatches) {
      if (match[1]) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > 0 && !(clean.includes('VIG') && (n === 2026 || n === 2027))) {
          candidates.numbers.push(n);
        }
      }
    }

    // Extracción de placas
    const plateMatches = clean.matchAll(/(?:PLACA(?:S)?|PLATE(?:S)?)[-:_ #=]*([A-Za-z0-9-]+)/gi);
    for (const match of plateMatches) {
      if (match[1] && match[1].toUpperCase() !== 'X' && match[1].toUpperCase() !== 'NA') {
        candidates.plates.push(match[1]);
        candidates.plates.push(match[1].replace(/[-_ ]/g, ''));
      }
    }

    // 3. JSON parse
    if ((clean.startsWith('{') && clean.endsWith('}')) || (clean.startsWith('[') && clean.endsWith(']'))) {
      try {
        const parsed = JSON.parse(clean);
        if (typeof parsed === 'object' && parsed !== null) {
          if (parsed.numero !== undefined) candidates.numbers.push(Number(parsed.numero));
          if (parsed.corbatin !== undefined) candidates.numbers.push(Number(parsed.corbatin));
          if (parsed.qr_token) candidates.tokens.push(String(parsed.qr_token));
          if (parsed.token) candidates.tokens.push(String(parsed.token));
          if (parsed.placas) candidates.plates.push(String(parsed.placas));
          if (parsed.placa) candidates.plates.push(String(parsed.placa));
        }
      } catch {}
    }

    // 4. URL parse
    if (clean.includes('http://') || clean.includes('https://') || clean.includes('?')) {
      try {
        const urlParts = clean.split('?');
        if (urlParts[1]) {
          const queryParams = new URLSearchParams(urlParts[1]);
          const num = queryParams.get('numero') || queryParams.get('corbatin') || queryParams.get('corb');
          if (num && !isNaN(Number(num))) candidates.numbers.push(Number(num));
          const tok = queryParams.get('token') || queryParams.get('qr');
          if (tok) candidates.tokens.push(tok);
          const pl = queryParams.get('placa') || queryParams.get('placas');
          if (pl) candidates.plates.push(pl);
        }
        const pathSegments = urlParts[0].split('/').filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment) {
          candidates.tokens.push(lastSegment);
          if (!isNaN(Number(lastSegment))) candidates.numbers.push(Number(lastSegment));
        }
      } catch {}
    }

    // 5. Número entero directo (ej: "105", "70", "101")
    if (/^\d+$/.test(clean)) {
      candidates.numbers.push(parseInt(clean, 10));
    }

    // 6. Formatos con prefijos como C-2026-070, C-2026-70, C-070, C-70, CORB-070, LP-70
    const prefixMatch = clean.match(/^(?:C|CORB|CORBATIN|LP)[-_ ]*(?:20\d\d[-_ ]*)?0*(\d+)$/i);
    if (prefixMatch && prefixMatch[1]) {
      candidates.numbers.push(parseInt(prefixMatch[1], 10));
    }

    // 7. Segmento numérico final separado por guiones
    const parts = clean.split(/[-_/ ]+/).filter(Boolean);
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart) && lastPart !== '2026' && lastPart !== '2027') {
        candidates.numbers.push(parseInt(lastPart, 10));
      }
    }

    // 8. Extracción de dígitos
    if (!clean.includes('|')) {
      const digitsOnly = clean.replace(/\D/g, '');
      if (digitsOnly) {
        if (digitsOnly.startsWith('2026') && digitsOnly.length > 4) {
          candidates.numbers.push(parseInt(digitsOnly.slice(4), 10));
        } else if (digitsOnly.startsWith('2025') && digitsOnly.length > 4) {
          candidates.numbers.push(parseInt(digitsOnly.slice(4), 10));
        }
        candidates.numbers.push(parseInt(digitsOnly, 10));
      }
    }

    candidates.tokens.push(clean.replace(/[-_ ]/g, ''));
    candidates.plates.push(clean.replace(/[-_ ]/g, ''));

    candidates.numbers = Array.from(new Set(candidates.numbers.filter((n) => !isNaN(n) && n > 0)));
    candidates.tokens = Array.from(new Set(candidates.tokens.filter(Boolean)));
    candidates.plates = Array.from(new Set(candidates.plates.filter(Boolean)));

    return candidates;
  },

  /**
   * Busca un corbatín por número o token QR y retorna vehículo, empresa y sanciones
   */
  async buscarCorbatin(param: string): Promise<CorbatinLookupResult | null> {
    try {
      const cleanParam = (param || '').trim();
      if (!cleanParam) return null;

      const { numbers, tokens, plates } = this.extractSearchTokens(cleanParam);

      const [dbCorbatines, dbVehiculos] = await Promise.all([
        this.getCorbatines(),
        this.getVehiculos(),
      ]);

      const hasDbData = dbCorbatines && dbCorbatines.length > 0;
      const corbatines = hasDbData ? dbCorbatines : [
        {
          id_corbatin: 70,
          id_vehiculo: 70,
          numero: 70,
          qr_token: 'QR-CORB-070',
          fecha_emision: new Date().toISOString(),
          fecha_vencimiento: null,
          estatus: 'activo',
          fecha_impresion: null,
          motivo_cancelacion: null,
        },
        {
          id_corbatin: 101,
          id_vehiculo: 1,
          numero: 101,
          qr_token: 'QR-CORB-101',
          fecha_emision: new Date().toISOString(),
          fecha_vencimiento: null,
          estatus: 'activo',
          fecha_impresion: null,
          motivo_cancelacion: null,
        },
      ];

      const vehiculos = (dbVehiculos && dbVehiculos.length > 0) ? dbVehiculos : [
        {
          id_vehiculo: 70,
          id_empresa: 1,
          marca: 'Ford',
          modelo: 'F-150 Super Duty',
          año: 2024,
          placas: 'SON-7080-A',
          color: 'Blanco Oxford',
          foto_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=600',
          estatus_acceso: 'HABILITADO',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      // 1. Buscar corbatín coincidente estrictamente por número de corbatín (c.numero) o token QR
      let matchedCorbatin: any = corbatines.find((c: any) => {
        const cNum = Number(c.numero);
        if (numbers.includes(cNum)) return true;

        if (c.qr_token) {
          const cQrUpper = String(c.qr_token).toUpperCase();
          const cQrClean = cQrUpper.replace(/[-_ ]/g, '');
          for (const tok of tokens) {
            const tUpper = tok.toUpperCase();
            const tClean = tUpper.replace(/[-_ ]/g, '');
            if (cQrUpper === tUpper || cQrClean === tClean) return true;
          }
        }
        return false;
      });

      // 2. Si se encontró el corbatín, obtener el vehículo al que pertenece ese corbatín (c.id_vehiculo)
      let matchedVehiculo: any = null;
      if (matchedCorbatin) {
        matchedVehiculo =
          matchedCorbatin.vehiculo ||
          vehiculos.find((v: any) => Number(v.id_vehiculo) === Number(matchedCorbatin.id_vehiculo));
      } else {
        // 2.1 Si NO se encontró corbatín por número ni token, buscar ÚNICAMENTE por PLACAS vehiculares (nunca por ID numérico de vehículo)
        matchedVehiculo = vehiculos.find((v: any) => {
          const plateStr = String(v.placas || v.placa || '').toUpperCase();
          const plateClean = plateStr.replace(/[-_ ]/g, '');
          for (const pl of plates) {
            const pUpper = pl.toUpperCase();
            const pClean = pUpper.replace(/[-_ ]/g, '');
            if (plateClean.length >= 4 && (plateStr === pUpper || plateClean === pClean)) return true;
          }
          return false;
        });

        if (matchedVehiculo) {
          matchedCorbatin = corbatines.find((c: any) => Number(c.id_vehiculo) === Number(matchedVehiculo.id_vehiculo)) || {
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

      // Si no se encontró corbatín ni vehículo por placas, retornar null
      if (!matchedCorbatin || !matchedVehiculo) {
        return null;
      }

      const corbatinRow: CorbatinRow = {
        id_corbatin: matchedCorbatin?.id_corbatin || 0,
        id_vehiculo: matchedVehiculo.id_vehiculo,
        numero: matchedCorbatin?.numero || (numbers[0] || 0),
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
        foto_url: matchedVehiculo.foto_url || matchedVehiculo.foto || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=600',
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
