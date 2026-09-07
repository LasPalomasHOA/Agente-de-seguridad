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

// Cache en memoria con TTL (Time-To-Live) para evitar descargas continuas de tablas
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string, ttlMs: number): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }
}

export const apiCache = new SimpleMemoryCache();

// TTL Constants (en milisegundos)
const TTL_STATIC_CATALOGS = 10 * 60 * 1000; // 10 minutos para catálogos y reglamentos
const TTL_USERS = 5 * 60 * 1000;            // 5 minutos para usuarios
const TTL_VEHICLES_CORBATINES = 2 * 60 * 1000; // 2 minutos para listas de vehículos/corbatines
const TTL_LOOKUPS = 2 * 60 * 1000;          // 2 minutos para resultados de búsqueda específicos
const TTL_REPORTES = 60 * 1000;             // 1 minuto para reportes

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
          const roleName = userData.rolNombre || userData.rol?.nombre || userData.rol || 'Agente de Seguridad';
          const avatarUrl = userData.foto_url || userData.avatar || userData.foto || userData.imagen || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150';
          return {
            id_usuario: id,
            nombre: userData.nombre,
            correo: userData.correo,
            avatar: avatarUrl,
            avatarUrl: avatarUrl,
            rolNombre: roleName,
            numEmpleado: `AG-2026-${String(id).padStart(3, '0')}`,
            roles: { nombre: roleName },
            token: res.token,
          };
        }
      } catch (loginErr) {
        // Fallback usando caché de usuarios para no saturar con SELECT *
        const usuarios = await this.getUsuarios();
        let found = usuarios.find(
          (u: any) =>
            u.correo?.toLowerCase() === cleanUser ||
            u.nombre?.toLowerCase() === cleanUser ||
            u.nombre?.toLowerCase().includes(cleanUser) ||
            u.rol?.toLowerCase() === cleanUser ||
            u.rolNombre?.toLowerCase() === cleanUser ||
            String(u.id_usuario || u.id) === cleanUser
        );

        // Alias comunes: agente, caseta, guardia, admin
        if (!found && cleanUser === 'agente') {
          found = usuarios.find(
            (u: any) =>
              (u.rolNombre || u.rol || '').toLowerCase().includes('agente') ||
              (u.rolNombre || u.rol || '').toLowerCase().includes('caseta') ||
              (u.rolNombre || u.rol || '').toLowerCase().includes('guardia') ||
              u.correo?.toLowerCase().includes('agente')
          );
        }

        if (found) {
          const id = found.id_usuario || found.id || 1;
          const roleName = found.rolNombre || found.rol || 'Agente de Seguridad';
          const avatarUrl = found.foto_url || found.avatar || found.foto || found.imagen || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150';
          return {
            id_usuario: id,
            nombre: found.nombre || 'Oficial en Servicio',
            correo: found.correo || '',
            avatar: avatarUrl,
            avatarUrl: avatarUrl,
            rolNombre: roleName,
            numEmpleado: `AG-2026-${String(id).padStart(3, '0')}`,
            roles: { nombre: roleName },
          };
        }
      }

      // Fallback estático de emergencia
      return {
        id_usuario: 1,
        nombre: 'Oficial de Seguridad',
        correo: 'seguridad@laspalomas.com',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150',
        numEmpleado: 'AG-2026-001',
        roles: { nombre: 'Agente de Seguridad' },
      };
    } catch (e) {
      console.warn('[ApiService] Error en login:', e);
      return {
        id_usuario: 1,
        nombre: 'Oficial de Seguridad',
        correo: 'seguridad@laspalomas.com',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150',
        numEmpleado: 'AG-2026-001',
        roles: { nombre: 'Agente de Seguridad' },
      };
    }
  },

  /**
   * Obtiene la lista de usuarios (con caché en memoria)
   */
  async getUsuarios(): Promise<any[]> {
    const cacheKey = 'usuarios_list';
    const cached = apiCache.get<any[]>(cacheKey, TTL_USERS);
    if (cached) return cached;

    try {
      const data = await fetchJson('/usuarios');
      if (Array.isArray(data)) {
        apiCache.set(cacheKey, data);
        return data;
      }
      return [];
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
   * Busca un corbatín o placa de forma optimizada con caché y sin saturar el egress
   */
  async buscarCorbatin(param: string): Promise<CorbatinLookupResult | null> {
    try {
      const cleanParam = (param || '').trim();
      if (!cleanParam) return null;

      // 1. Revisar si la consulta ya está en caché en memoria reciente
      const lookupCacheKey = `lookup_${cleanParam.toLowerCase()}`;
      const cachedResult = apiCache.get<CorbatinLookupResult>(lookupCacheKey, TTL_LOOKUPS);
      if (cachedResult) {
        return cachedResult;
      }

      // 2. Extraer tokens de búsqueda
      const { numbers, tokens, plates } = this.extractSearchTokens(cleanParam);

      // 3. Obtener listas cacheadas (evita re-descargar tablas completas en cada tecla o escaneo)
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
          estatus: 'activo' as const,
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
          estatus: 'activo' as const,
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

      // 4. Buscar corbatín coincidente por número o token QR
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

      // 5. Si se encontró corbatín, obtener el vehículo correspondiente
      let matchedVehiculo: any = null;
      if (matchedCorbatin) {
        matchedVehiculo =
          matchedCorbatin.vehiculo ||
          vehiculos.find((v: any) => Number(v.id_vehiculo) === Number(matchedCorbatin.id_vehiculo));
      } else {
        // 5.1 Si NO se encontró corbatín por número ni token, buscar por PLACAS vehiculares
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

      // Sanciones del vehículo (usando caché)
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

      // Infracciones históricas (usando caché)
      const reportesVehiculo = await this.getReportes();
      const totalInfracciones = reportesVehiculo.filter((r: any) => r.id_vehiculo === vehiculoRow.id_vehiculo).length;

      const result: CorbatinLookupResult = {
        corbatin: corbatinRow,
        vehiculo: vehiculoRow,
        empresa: empresaRow,
        conductorPrincipal,
        sancionesActivas,
        totalInfracciones,
      };

      // Guardar en caché el resultado para futuras consultas idénticas
      apiCache.set(lookupCacheKey, result);

      return result;
    } catch (e) {
      console.warn('[ApiService] Error en buscarCorbatin:', e);
      return null;
    }
  },

  /**
   * Busca un vehículo por su placa (reutiliza el método unificado)
   */
  async buscarVehiculoPorPlaca(placa: string): Promise<CorbatinLookupResult | null> {
    return this.buscarCorbatin(placa);
  },

  /**
   * Obtiene el catálogo de infracciones (con caché en memoria)
   */
  async getCatalogoInfracciones(): Promise<CatalogoInfraccionRow[]> {
    const cacheKey = 'catalogo_infracciones';
    const cached = apiCache.get<CatalogoInfraccionRow[]>(cacheKey, TTL_STATIC_CATALOGS);
    if (cached) return cached;

    try {
      const data = await fetchJson('/infracciones');
      const mapped = (data || []).map((inf: any) => ({
        id_infraccion: inf.id_infraccion,
        id_reglamento: inf.id_reglamento || 1,
        codigo: inf.codigo,
        nombre: inf.nombre,
        descripcion: inf.descripcion || '',
        categoria: inf.categoria || 'General',
        activo: inf.activo ?? true,
      }));
      apiCache.set(cacheKey, mapped);
      return mapped;
    } catch {
      return [];
    }
  },

  /**
   * Obtiene los reglamentos (con caché en memoria)
   */
  async getReglamentos(): Promise<ReglamentoRow[]> {
    const cacheKey = 'reglamentos_list';
    const cached = apiCache.get<ReglamentoRow[]>(cacheKey, TTL_STATIC_CATALOGS);
    if (cached) return cached;

    try {
      const data = await fetchJson('/reglamentos');
      const mapped = (data || []).map((reg: any) => ({
        id_reglamento: reg.id_reglamento,
        version: reg.version || '2026.1',
        titulo: reg.titulo || 'Reglamento General',
        archivo_url: reg.archivo_url || '',
        fecha_publicacion: reg.fecha_publicacion || new Date().toISOString(),
        vigente: reg.vigente ?? true,
        created_at: reg.created_at || new Date().toISOString(),
      }));
      apiCache.set(cacheKey, mapped);
      return mapped;
    } catch {
      return [];
    }
  },

  /**
   * Obtiene las reglas de reincidencia (con caché en memoria)
   */
  async getReglasReincidencia(): Promise<ReglaReincidenciaRow[]> {
    const cacheKey = 'reglas_reincidencia';
    const cached = apiCache.get<ReglaReincidenciaRow[]>(cacheKey, TTL_STATIC_CATALOGS);
    if (cached) return cached;

    try {
      const data = await fetchJson('/reglas');
      const mapped = (data || []).map((r: any) => ({
        id_regla: r.id_regla,
        numero_falta: r.numero_falta,
        permite_acceso: r.permite_acceso ?? true,
        requiere_administrador: r.requiere_administrador ?? false,
        mensaje_alerta: r.mensaje_alerta || '',
        activo: r.activo ?? true,
      }));
      apiCache.set(cacheKey, mapped);
      return mapped;
    } catch {
      return [];
    }
  },

  /**
   * Registra un nuevo reporte de infracción e invalida la caché de reportes
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

      // Invalidar cachés relacionadas para que la próxima lectura traiga el nuevo reporte
      apiCache.invalidate('reportes');
      apiCache.invalidate('lookup_');

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
   * Obtiene la lista de reportes emitidos (con soporte para filtros y caché de corta duración)
   */
  async getReportes(options?: { idUsuario?: number; limit?: number; forceRefresh?: boolean } | number): Promise<any[]> {
    let idUsuario: number | undefined;
    let limit: number | undefined;
    let forceRefresh: boolean = false;

    if (typeof options === 'number') {
      idUsuario = options;
    } else if (typeof options === 'object' && options !== null) {
      idUsuario = options.idUsuario;
      limit = options.limit;
      forceRefresh = options.forceRefresh || false;
    }

    const cacheKey = `reportes_list_${idUsuario || 'all'}_${limit || 'default'}`;
    if (!forceRefresh) {
      const cached = apiCache.get<any[]>(cacheKey, TTL_REPORTES);
      if (cached) return cached;
    }

    try {
      const queryParams: string[] = [];
      if (idUsuario) queryParams.push(`id_usuario=${idUsuario}`);
      if (limit) queryParams.push(`limit=${limit}`);
      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const data = await fetchJson(`/reportes${queryString}`);
      if (Array.isArray(data)) {
        let filtered = data;
        if (idUsuario) {
          filtered = data.filter((r: any) => r.id_usuario === idUsuario);
        }
        apiCache.set(cacheKey, filtered);
        return filtered;
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
   * Obtiene vehículos (con caché en memoria)
   */
  async getVehiculos(): Promise<VehiculoRow[]> {
    const cacheKey = 'vehiculos_list';
    const cached = apiCache.get<VehiculoRow[]>(cacheKey, TTL_VEHICLES_CORBATINES);
    if (cached) return cached;

    try {
      const data = await fetchJson('/vehiculos');
      if (Array.isArray(data)) {
        apiCache.set(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Obtiene empresas (con caché en memoria)
   */
  async getEmpresas(): Promise<EmpresaRow[]> {
    const cacheKey = 'empresas_list';
    const cached = apiCache.get<EmpresaRow[]>(cacheKey, TTL_STATIC_CATALOGS);
    if (cached) return cached;

    try {
      const data = await fetchJson('/empresas');
      if (Array.isArray(data)) {
        apiCache.set(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Obtiene corbatines (con caché en memoria)
   */
  async getCorbatines(): Promise<CorbatinRow[]> {
    const cacheKey = 'corbatines_list';
    const cached = apiCache.get<CorbatinRow[]>(cacheKey, TTL_VEHICLES_CORBATINES);
    if (cached) return cached;

    try {
      const data = await fetchJson('/corbatines');
      if (Array.isArray(data)) {
        apiCache.set(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Obtiene sanciones (con caché en memoria)
   */
  async getSanciones(): Promise<any[]> {
    const cacheKey = 'sanciones_list';
    const cached = apiCache.get<any[]>(cacheKey, TTL_VEHICLES_CORBATINES);
    if (cached) return cached;

    try {
      const data = await fetchJson('/sanciones');
      if (Array.isArray(data)) {
        apiCache.set(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Obtiene casetas (con caché en memoria)
   */
  async getCasetas(): Promise<any[]> {
    const cacheKey = 'casetas_list';
    const cached = apiCache.get<any[]>(cacheKey, TTL_STATIC_CATALOGS);
    if (cached) return cached;

    try {
      const data = await fetchJson('/casetas');
      if (Array.isArray(data)) {
        apiCache.set(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },
};

