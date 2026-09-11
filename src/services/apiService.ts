// Servicio de Comunicación con la API REST (PostgreSQL vía Backend Express y Supabase Egress-Optimized)
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
import { supabase, isSupabaseConfigured, PROJECTIONS, getCountOptimized } from '../lib/supabase';

const resolveApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') {
    return envUrl || 'http://localhost:5000/api';
  }

  // Si estamos en un dispositivo móvil y la URL apunta a localhost o 127.0.0.1
  if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
      (Constants as any).manifest?.debuggerHost;
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

// Caché de ETags HTTP para respuestas 304 Not Modified (0 bytes de payload de red)
const httpEtagCache = new Map<string, { etag: string; data: any }>();

const fetchJson = async (endpoint: string, options?: RequestInit): Promise<any> => {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const isGet = !options?.method || options.method.toUpperCase() === 'GET';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as any) || {}),
  };

  // Cabecera condicional para ahorro de Egress
  if (isGet) {
    const cachedEntry = httpEtagCache.get(url);
    if (cachedEntry?.etag) {
      headers['If-None-Match'] = cachedEntry.etag;
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    // 304 Not Modified: datos intactos, devolver caché local sin consumir ancho de banda
    if (res.status === 304 && isGet) {
      const cached = httpEtagCache.get(url);
      if (cached) {
        return cached.data;
      }
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      let errorJson: any = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch { }
      throw new Error(
        errorJson?.error || errorJson?.message || `HTTP ${res.status}: ${errorText || res.statusText}`
      );
    }

    const data = await res.json();

    // Guardar ETag recibido para futuras peticiones condicionales
    if (isGet) {
      const etag = res.headers.get('etag') || res.headers.get('ETag');
      if (etag) {
        httpEtagCache.set(url, { etag, data });
      }
    }

    return data;
  } catch (err: any) {
    // Reducir ruido de logs en consola cuando es fallback esperado
    if (!err.message?.includes('Failed to fetch') && !err.message?.includes('Network request failed')) {
      console.warn(`[ApiService] Solicitud a ${url}:`, err.message);
    }
    throw err;
  }
};

// Almacenamiento seguro y persistente para caché entre sesiones y recargas
const memoryStorageMap = new Map<string, string>();

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch { }
    return memoryStorageMap.get(key) || null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch { }
    memoryStorageMap.set(key, value);
  },
  removeItem: (key: string): void => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch { }
    memoryStorageMap.delete(key);
  },
};

// Caché multinivel con TTL y deduplicación de peticiones concurrentes (In-Flight Request Coalescing)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class PersistentApiCache {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private inFlightRequests = new Map<string, Promise<any>>();

  get<T>(key: string, ttlMs: number): T | null {
    // 1. Memoria RAM (Ultra rápido 0ms)
    const mem = this.memoryCache.get(key);
    if (mem) {
      if (Date.now() - mem.timestamp <= ttlMs) {
        return mem.data as T;
      }
      this.memoryCache.delete(key);
    }

    // 2. Storage local persistente
    try {
      const raw = safeStorage.getItem(`hoa_cache_${key}`);
      if (raw) {
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (entry && typeof entry.timestamp === 'number') {
          if (Date.now() - entry.timestamp <= ttlMs) {
            this.memoryCache.set(key, entry);
            return entry.data;
          } else {
            safeStorage.removeItem(`hoa_cache_${key}`);
          }
        }
      }
    } catch { }

    return null;
  }

  set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    this.memoryCache.set(key, entry);
    try {
      safeStorage.setItem(`hoa_cache_${key}`, JSON.stringify(entry));
    } catch { }
  }

  /**
   * Guarda únicamente en memoria RAM sin bloquear el hilo principal con serialización I/O a disco/localStorage
   */
  setMemoryOnly<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    this.memoryCache.set(key, entry);
  }

  /**
   * Deduplica llamadas simultáneas a la misma consulta (In-Flight Request Coalescing)
   */
  async getOrFetch<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
    forceRefresh = false
  ): Promise<T> {
    if (!forceRefresh) {
      const cached = this.get<T>(key, ttlMs);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    }

    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    const promise = (async () => {
      try {
        const data = await fetcher();
        if (data !== null && data !== undefined) {
          this.set(key, data);
        }
        return data;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.memoryCache.clear();
      memoryStorageMap.clear();
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        try {
          const keys = Object.keys(window.localStorage);
          keys.filter((k) => k.startsWith('hoa_cache_')).forEach((k) => window.localStorage.removeItem(k));
        } catch { }
      }
      return;
    }

    // 1. Limpiar memoria RAM
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.memoryCache.delete(key);
      }
    }

    // 2. Limpiar memoryStorageMap
    const memoryKeys = Array.from(memoryStorageMap.keys());
    for (const key of memoryKeys) {
      if (key.startsWith(`hoa_cache_${keyPrefix}`)) {
        memoryStorageMap.delete(key);
      }
    }

    // 3. Limpiar localStorage en Web (Extracción estática para no mutar el índice en iteración)
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        const keys = Object.keys(window.localStorage);
        keys.filter((k) => k.startsWith(`hoa_cache_${keyPrefix}`)).forEach((k) => window.localStorage.removeItem(k));
      } catch { }
    }
  }
}

export const apiCache = new PersistentApiCache();

// TTL Constants optimizados (en milisegundos) para reducción masiva de Egress
const TTL_STATIC_CATALOGS = 30 * 60 * 1000;      // 30 minutos para catálogos y reglamentos
const TTL_USERS = 15 * 60 * 1000;                 // 15 minutos para usuarios
const TTL_VEHICLES_CORBATINES = 5 * 60 * 1000;    // 5 minutos para listas acotadas
const TTL_LOOKUPS = 5 * 60 * 1000;               // 5 minutos para resultados de búsqueda específicos
const TTL_REPORTES = 2 * 60 * 1000;              // 2 minutos para reportes del oficial

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
   * Autentica al agente con correo/usuario y contraseña con el servidor Express/PostgreSQL
   */
  async login(usuarioOCorreo: string, contrasena: string): Promise<any | null> {
    try {
      const cleanUser = usuarioOCorreo.trim().toLowerCase();
      if (!cleanUser || !contrasena) return null;

      // 1. Intentar login directo con la API
      try {
        const res = await fetchJson('/usuarios/login', {
          method: 'POST',
          body: JSON.stringify({
            correo: cleanUser,
            password: contrasena,
          }),
        });

        const userData = res?.usuario || res?.user || res;
        if (userData && (userData.id_usuario || userData.id)) {
          const id = userData.id_usuario || userData.id;
          const roleName = userData.rolNombre || userData.rol?.nombre || userData.rol || 'Agente de Seguridad';
          const avatarUrl =
            userData.foto_url ||
            userData.avatar ||
            userData.foto ||
            userData.imagen ||
            'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150';
          return {
            id_usuario: id,
            nombre: userData.nombre,
            correo: userData.correo,
            avatar: avatarUrl,
            avatarUrl: avatarUrl,
            rolNombre: roleName,
            numEmpleado: userData.numEmpleado || `AG-2026-${String(id).padStart(3, '0')}`,
            roles: { nombre: roleName },
            token: res.token,
          };
        }
      } catch (loginErr: any) {
        // Si el servidor rechazó las credenciales, no autenticar
        const errorMsg = (loginErr?.message || '').toLowerCase();
        if (
          errorMsg.includes('inválid') ||
          errorMsg.includes('inactiv') ||
          errorMsg.includes('incorrect') ||
          errorMsg.includes('400') ||
          errorMsg.includes('401') ||
          errorMsg.includes('403') ||
          errorMsg.includes('404') ||
          errorMsg.includes('unauthorized')
        ) {
          return null;
        }

        // Si es un error de conectividad de red
        console.warn('[ApiService] Error de conexión al validar usuario:', loginErr.message);
        return null;
      }

      return null;
    } catch (e: any) {
      console.warn('[ApiService] Error en login:', e.message);
      return null;
    }
  },

  /**
   * Obtiene la lista de usuarios con caché persistente y proyección de campos
   */
  async getUsuarios(): Promise<any[]> {
    return apiCache.getOrFetch('usuarios_list', TTL_USERS, async () => {
      try {
        const data = await fetchJson('/usuarios');
        if (Array.isArray(data)) {
          return data;
        }
      } catch {
        if (isSupabaseConfigured()) {
          const { data } = await supabase
            .from('usuarios')
            .select(PROJECTIONS.USUARIOS_LIGHT)
            .eq('activo', true)
            .limit(50);
          if (data && Array.isArray(data)) {
            return data;
          }
        }
      }
      return [];
    });
  },

  /**
   * Extrae candidatos de búsqueda a partir de cualquier formato ingresado o escaneado
   */
  extractSearchTokens(raw: string): { numbers: number[]; tokens: string[]; plates: string[] } {
    const clean = (raw || '').trim();
    const isPureNumber = /^\d+$/.test(clean);
    const candidates: {
      numbers: number[];
      tokens: string[];
      plates: string[];
    } = {
      numbers: [],
      tokens: [clean],
      // Solo inicializar en placas si NO es un número puro
      plates: isPureNumber ? [] : [clean],
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
            if (/^(?:CORB|CORBATIN|NUM|NUMERO|NO|TAG)$/i.test(key)) {
              const numVal = parseInt(val.replace(/\D/g, ''), 10);
              if (!isNaN(numVal) && numVal > 0) {
                candidates.numbers.push(numVal);
              }
            }
            if (/^(?:PLACA|PLACAS|PLATE|PLATES)$/i.test(key)) {
              if (
                val.toUpperCase() !== 'X' &&
                val.toUpperCase() !== 'N/A' &&
                val.toUpperCase() !== 'S/P' &&
                val.toUpperCase() !== 'SIN'
              ) {
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
      } catch { }
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
      } catch { }
    }

    // 5. Número entero directo
    if (isPureNumber) {
      candidates.numbers.push(parseInt(clean, 10));
    }

    // 6. Formatos con prefijos
    const prefixMatch = clean.match(/^(?:C|CORB|CORBATIN|LP)[-_ ]*(?:20\d\d[-_ ]*)?0*(\d+)$/i);
    if (prefixMatch && prefixMatch[1]) {
      candidates.numbers.push(parseInt(prefixMatch[1], 10));
    }

    // 7. Segmento numérico final
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
    if (!isPureNumber) {
      candidates.plates.push(clean.replace(/[-_ ]/g, ''));
    }

    candidates.numbers = Array.from(new Set(candidates.numbers.filter((n) => !isNaN(n) && n > 0)));
    candidates.tokens = Array.from(new Set(candidates.tokens.filter(Boolean)));
    candidates.plates = Array.from(
      new Set(
        candidates.plates.filter((p) => {
          if (!p || typeof p !== 'string') return false;
          const up = p.trim().toUpperCase();
          if (up === 'SIN' || up === 'N/A' || up === 'S/P' || up === 'X') return false;
          // Descartar dígitos puros si el texto original no tenía prefijo explícito de placas
          if (/^\d+$/.test(up) && !clean.toUpperCase().includes('PLACA') && !clean.toUpperCase().includes('PLATE')) {
            return false;
          }
          return up.length >= 3;
        })
      )
    );

    return candidates;
  },

  /**
   * Genera las claves de caché canónicas y alias para búsqueda unificada
   */
  getCanonicalLookupKeys(param: string): {
    primaryKey: string;
    aliasKeys: string[];
    numbers: number[];
    tokens: string[];
    plates: string[];
  } {
    const { numbers, tokens, plates } = this.extractSearchTokens(param);
    const aliasKeys: string[] = [];

    let primaryKey = '';
    if (numbers.length > 0) {
      primaryKey = `lookup_num_${numbers[0]}`;
    } else if (plates.length > 0 && plates[0]) {
      const cleanPlate = plates[0].toUpperCase().replace(/[-_ ]/g, '');
      primaryKey = `lookup_plate_${cleanPlate}`;
    } else {
      primaryKey = `lookup_raw_${param.trim().toLowerCase()}`;
    }

    for (const num of numbers) {
      aliasKeys.push(`lookup_num_${num}`);
    }
    for (const plate of plates) {
      if (plate) {
        const upper = plate.toUpperCase();
        aliasKeys.push(`lookup_plate_${upper}`);
        aliasKeys.push(`lookup_plate_${upper.replace(/[-_ ]/g, '')}`);
      }
    }
    aliasKeys.push(`lookup_raw_${param.trim().toLowerCase()}`);

    return {
      primaryKey,
      aliasKeys: Array.from(new Set(aliasKeys)),
      numbers,
      tokens,
      plates,
    };
  },

  /**
   * Busca un corbatín o placa de forma ultra-optimizada sin descargas masivas de tablas ni cascadas N+1
   */
  async buscarCorbatin(param: string): Promise<CorbatinLookupResult | null> {
    try {
      const cleanParam = (param || '').trim();
      if (!cleanParam) return null;

      // 1. Revisar si la consulta ya está en caché reciente bajo su clave canónica o algún alias
      const { primaryKey, aliasKeys, numbers, plates } = this.getCanonicalLookupKeys(cleanParam);
      for (const key of aliasKeys) {
        const cachedResult = apiCache.get<CorbatinLookupResult>(key, TTL_LOOKUPS);
        if (cachedResult) {
          return cachedResult;
        }
      }

      let matchedCorbatin: any = null;
      let matchedVehiculo: any = null;
      let expressSucceeded = false;

      // 2. Consulta puntual directa con filtros de servidor (Ahorro de Egress >95%)
      try {
        // 2.1 Búsqueda puntual estricta por número de corbatín
        if (numbers.length > 0) {
          const targetNum = numbers[0];
          const directCorbRes = await fetchJson(`/corbatines?numero=${targetNum}&limit=1`);
          expressSucceeded = true;
          const corbList = Array.isArray(directCorbRes)
            ? directCorbRes
            : directCorbRes?.corbatines || (directCorbRes?.id_corbatin ? [directCorbRes] : []);

          if (corbList.length > 0) {
            const matched = corbList.find((c: any) => Number(c.numero) === targetNum);
            if (matched && Number(matched.numero) === targetNum) {
              matchedCorbatin = matched;
              if (matchedCorbatin.vehiculo) {
                matchedVehiculo = matchedCorbatin.vehiculo;
              } else if (matchedCorbatin.id_vehiculo) {
                const directVehRes = await fetchJson(`/vehiculos?id_vehiculo=${matchedCorbatin.id_vehiculo}&limit=1`).catch(() => null);
                const vList = Array.isArray(directVehRes)
                  ? directVehRes
                  : directVehRes?.vehiculos || (directVehRes?.id_vehiculo ? [directVehRes] : []);
                const matchedV = vList.find((v: any) => Number(v.id_vehiculo) === Number(matchedCorbatin.id_vehiculo));
                if (matchedV) {
                  matchedVehiculo = matchedV;
                }
              }
            }
          }
        }

        // 2.2 Búsqueda puntual estricta por placas vehiculares
        if (!matchedVehiculo && plates.length > 0) {
          const validPlate = plates.find((p) => p.length >= 3) || plates[0];
          if (validPlate) {
            const cleanTargetPlate = validPlate.toUpperCase().replace(/[-_ ]/g, '');
            const directVehRes = await fetchJson(`/vehiculos?placas=${encodeURIComponent(validPlate)}&limit=1`);
            expressSucceeded = true;
            const vList = Array.isArray(directVehRes)
              ? directVehRes
              : directVehRes?.vehiculos || (directVehRes?.id_vehiculo ? [directVehRes] : []);

            const matchedV = vList.find((v: any) => {
              if (!v?.placas) return false;
              const vPlate = String(v.placas).toUpperCase().replace(/[-_ ]/g, '');
              return vPlate === cleanTargetPlate || vPlate.includes(cleanTargetPlate) || cleanTargetPlate.includes(vPlate);
            });

            if (matchedV) {
              matchedVehiculo = matchedV;
              if (matchedVehiculo.corbatin) {
                matchedCorbatin = matchedVehiculo.corbatin;
              } else if (matchedVehiculo.corbatines && Array.isArray(matchedVehiculo.corbatines) && matchedVehiculo.corbatines.length > 0) {
                matchedCorbatin = matchedVehiculo.corbatines.find((c: any) => c.estatus === 'activo' || c.estatus === 'ACTIVO') || matchedVehiculo.corbatines[0];
              } else {
                const directCorbRes = await fetchJson(`/corbatines?id_vehiculo=${matchedVehiculo.id_vehiculo}&limit=1`).catch(() => null);
                const cList = Array.isArray(directCorbRes)
                  ? directCorbRes
                  : directCorbRes?.corbatines || (directCorbRes?.id_corbatin ? [directCorbRes] : []);
                const matchedC = cList.find((c: any) => Number(c.id_vehiculo) === Number(matchedVehiculo.id_vehiculo));
                if (matchedC) {
                  matchedCorbatin = matchedC;
                }
              }
            }
          }
        }
      } catch {
        // Fallback controlado
      }

      // 3. Fallback Seguro en Supabase (Únicamente si la API Express no estuvo disponible/alcanzable)
      if (!matchedCorbatin && !matchedVehiculo && !expressSucceeded) {
        if (isSupabaseConfigured()) {
          try {
            if (numbers.length > 0 && !matchedCorbatin) {
              const targetNum = numbers[0];
              const { data: directCorb, error: corbErr } = await (supabase as any)
                .from('corbatines')
                .select(PROJECTIONS.CORBATINES_LIGHT)
                .eq('numero', targetNum)
                .limit(1);

              if (!corbErr && directCorb && directCorb.length > 0 && Number(directCorb[0].numero) === targetNum) {
                matchedCorbatin = directCorb[0];
                if (matchedCorbatin.id_vehiculo) {
                  const { data: directVeh, error: vehErr } = await (supabase as any)
                    .from('vehiculos')
                    .select(PROJECTIONS.VEHICULOS_LIGHT)
                    .eq('id_vehiculo', matchedCorbatin.id_vehiculo)
                    .limit(1);
                  if (!vehErr && directVeh && directVeh.length > 0) {
                    matchedVehiculo = directVeh[0];
                  }
                }
              }
            }

            if (!matchedVehiculo && plates.length > 0) {
              const validPlate = plates.find((p) => p.length >= 3) || plates[0];
              const cleanPlate = validPlate.trim().toUpperCase();
              const cleanPlateNoHyphen = cleanPlate.replace(/[-_ ]/g, '');
              const candidatePlates = Array.from(new Set([cleanPlate, cleanPlateNoHyphen, validPlate]));

              const { data: directVeh, error: vehErr } = await (supabase as any)
                .from('vehiculos')
                .select(PROJECTIONS.VEHICULOS_LIGHT)
                .in('placas', candidatePlates)
                .limit(1);

              if (!vehErr && directVeh && directVeh.length > 0) {
                matchedVehiculo = directVeh[0];
                const { data: directCorb, error: corbErr } = await (supabase as any)
                  .from('corbatines')
                  .select(PROJECTIONS.CORBATINES_LIGHT)
                  .eq('id_vehiculo', matchedVehiculo.id_vehiculo)
                  .eq('estatus', 'activo')
                  .limit(1);
                if (!corbErr && directCorb && directCorb.length > 0) {
                  matchedCorbatin = directCorb[0];
                }
              }
            }
          } catch { }
        }
      }

      // Si no se encontró ningún registro coincidente, retornar null sin consumir más red
      if (!matchedCorbatin && !matchedVehiculo) {
        return null;
      }

      const corbatinRow: CorbatinRow = {
        id_corbatin: matchedCorbatin?.id_corbatin || 0,
        id_vehiculo: matchedVehiculo?.id_vehiculo || 0,
        numero: matchedCorbatin?.numero || (numbers[0] || 0),
        qr_token: matchedCorbatin?.qr_token || 'S/C',
        fecha_emision: matchedCorbatin?.fecha_emision || new Date().toISOString(),
        fecha_vencimiento: matchedCorbatin?.fecha_vencimiento || null,
        estatus: (matchedCorbatin?.estatus?.toLowerCase() as any) || 'activo',
        fecha_impresion: null,
        motivo_cancelacion: null,
      };

      const vehiculoRow: VehiculoRow = {
        id_vehiculo: matchedVehiculo?.id_vehiculo || 0,
        id_empresa: matchedVehiculo?.id_empresa || 1,
        marca: matchedVehiculo?.marca || 'Genérica',
        modelo: matchedVehiculo?.modelo || 'Vehículo',
        año: matchedVehiculo?.año || matchedVehiculo?.anio || 2024,
        placas: matchedVehiculo?.placas || matchedVehiculo?.placa || 'SIN-PLACA',
        color: matchedVehiculo?.color || 'Blanco',
        foto_url:
          matchedVehiculo?.foto_url ||
          matchedVehiculo?.foto ||
          'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=600',
        estatus_acceso: matchedVehiculo?.estatus_acceso || 'HABILITADO',
        created_at: matchedVehiculo?.created_at || new Date().toISOString(),
        updated_at: matchedVehiculo?.updated_at || new Date().toISOString(),
      };

      const empresaRow: EmpresaRow =
        matchedVehiculo?.empresa ||
        matchedVehiculo?.empresas || {
          id_empresa: matchedVehiculo?.id_empresa || 1,
          razon_social: matchedVehiculo?.empresaNombre || 'Constructora y Mantenimiento Residencial',
          responsable_nombre: 'Administración HOA',
          telefono: '(638) 382-8000',
          correo: 'contacto@hoa-laspalomas.com',
          estatus: 'activa',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

      // Conductor asignado
      let conductorPrincipal: TrabajadorRow | undefined = undefined;
      if (matchedVehiculo?.conductor) {
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

      // Sanciones y conteo de infracciones en paralelo sin cascada secuencial
      const [todasSanciones, totalInfracciones] = await Promise.all([
        this.getSanciones({ idVehiculo: vehiculoRow.id_vehiculo }),
        this.getReportesCount({ idVehiculo: vehiculoRow.id_vehiculo }),
      ]);

      const sancionesActivas = (todasSanciones || [])
        .filter((s: any) => s.estatus === 'ACTIVA' || s.estatus === 'activa' || s.estatus === 'activo')
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

      const result: CorbatinLookupResult = {
        corbatin: corbatinRow,
        vehiculo: vehiculoRow,
        empresa: empresaRow,
        conductorPrincipal,
        sancionesActivas,
        totalInfracciones,
      };

      // Guardar en almacenamiento persistente SOLO la clave canónica principal
      apiCache.set(primaryKey, result);

      // Los alias y búsquedas secundarias se mapean únicamente en memoria RAM (0ms y 0 I/O bloqueante a disco/localStorage)
      for (const key of aliasKeys) {
        if (key !== primaryKey) {
          apiCache.setMemoryOnly(key, result);
        }
      }
      if (vehiculoRow.id_vehiculo) {
        apiCache.setMemoryOnly(`lookup_veh_${vehiculoRow.id_vehiculo}`, result);
      }
      if (corbatinRow.numero) {
        apiCache.setMemoryOnly(`lookup_num_${corbatinRow.numero}`, result);
      }
      if (vehiculoRow.placas && vehiculoRow.placas !== 'SIN-PLACA') {
        const cleanP = vehiculoRow.placas.toUpperCase().replace(/[-_ ]/g, '');
        apiCache.setMemoryOnly(`lookup_plate_${cleanP}`, result);
        apiCache.setMemoryOnly(`lookup_plate_${vehiculoRow.placas.toUpperCase()}`, result);
      }

      return result;
    } catch (e) {
      console.warn('[ApiService] Error en buscarCorbatin:', e);
      return null;
    }
  },

  /**
   * Busca un vehículo por su placa (delega a la búsqueda unificada)
   */
  async buscarVehiculoPorPlaca(placa: string): Promise<CorbatinLookupResult | null> {
    return this.buscarCorbatin(placa);
  },

  /**
   * Obtiene el catálogo de infracciones con caché persistente (TTL 30 min) y proyección de campos
   */
  async getCatalogoInfracciones(forceRefresh = false): Promise<CatalogoInfraccionRow[]> {
    return apiCache.getOrFetch(
      'catalogo_infracciones',
      TTL_STATIC_CATALOGS,
      async () => {
        try {
          const data = await fetchJson('/infracciones');
          if (Array.isArray(data)) {
            return data.map((inf: any) => ({
              id_infraccion: inf.id_infraccion,
              id_reglamento: inf.id_reglamento || 1,
              codigo: inf.codigo,
              nombre: inf.nombre,
              descripcion: inf.descripcion || '',
              categoria: inf.categoria || 'General',
              activo: inf.activo ?? true,
            }));
          }
        } catch {
          if (isSupabaseConfigured()) {
            const { data } = await supabase
              .from('catalogo_infracciones')
              .select(PROJECTIONS.CATALOGO_INFRACCIONES)
              .eq('activo', true)
              .limit(100);
            if (data && Array.isArray(data)) {
              return data as CatalogoInfraccionRow[];
            }
          }
        }
        return [];
      },
      forceRefresh
    );
  },

  /**
   * Obtiene los reglamentos con caché persistente (TTL 30 min) y proyección de campos
   */
  async getReglamentos(forceRefresh = false): Promise<ReglamentoRow[]> {
    return apiCache.getOrFetch(
      'reglamentos_list',
      TTL_STATIC_CATALOGS,
      async () => {
        try {
          const data = await fetchJson('/reglamentos');
          if (Array.isArray(data)) {
            return data.map((reg: any) => ({
              id_reglamento: reg.id_reglamento,
              version: reg.version || '2026.1',
              titulo: reg.titulo || 'Reglamento General',
              archivo_url: reg.archivo_url || '',
              fecha_publicacion: reg.fecha_publicacion || new Date().toISOString(),
              vigente: reg.vigente ?? true,
              created_at: reg.created_at || new Date().toISOString(),
            }));
          }
        } catch {
          if (isSupabaseConfigured()) {
            const { data } = await supabase
              .from('reglamentos')
              .select(PROJECTIONS.REGLAMENTOS)
              .eq('vigente', true)
              .limit(50);
            if (data && Array.isArray(data)) {
              return data as ReglamentoRow[];
            }
          }
        }
        return [];
      },
      forceRefresh
    );
  },

  /**
   * Obtiene las reglas de reincidencia con caché persistente (TTL 30 min)
   */
  async getReglasReincidencia(forceRefresh = false): Promise<ReglaReincidenciaRow[]> {
    return apiCache.getOrFetch(
      'reglas_reincidencia',
      TTL_STATIC_CATALOGS,
      async () => {
        try {
          const data = await fetchJson('/reglas');
          if (Array.isArray(data)) {
            return data.map((r: any) => ({
              id_regla: r.id_regla,
              numero_falta: r.numero_falta,
              permite_acceso: r.permite_acceso ?? true,
              requiere_administrador: r.requiere_administrador ?? false,
              mensaje_alerta: r.mensaje_alerta || '',
              activo: r.activo ?? true,
            }));
          }

        } catch {
          if (isSupabaseConfigured()) {
            const { data } = await supabase
              .from('reglas_reincidencia' as any)
              .select(PROJECTIONS.REGLAS_REINCIDENCIA)
              .eq('activo', true)
              .limit(20);
            if (data && Array.isArray(data)) {
              return data as unknown as ReglaReincidenciaRow[];
            }
          }
        }
        return [];
      },
      forceRefresh
    );
  },

  /**
   * Registra un nuevo reporte de infracción e invalida selectivamente las cachés afectadas
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

      // Invalidación selectiva y granular: preserva las consultas de otros vehículos en caché
      apiCache.invalidate('reportes_list');
      apiCache.invalidate('reportes_count_all');

      if (params.idVehiculo) {
        apiCache.invalidate(`lookup_veh_${params.idVehiculo}`);
        apiCache.invalidate(`reportes_count_${params.idVehiculo}`);
        apiCache.invalidate(`sanciones_list_${params.idVehiculo}`);
      }
      if (params.idCorbatin) {
        apiCache.invalidate(`lookup_num_${params.idCorbatin}`);
      }
      if (params.idUsuario) {
        apiCache.invalidate(`reportes_list_${params.idUsuario}`);
        apiCache.invalidate(`reportes_count_all_${params.idUsuario}`);
      }

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
   * Obtiene la cantidad de reportes con Egress mínimo (0 a 50 bytes)
   */
  async getReportesCount(options?: { idVehiculo?: number; idUsuario?: number }): Promise<number> {
    const idVehiculo = options?.idVehiculo;
    const idUsuario = options?.idUsuario;
    const cacheKey = `reportes_count_${idVehiculo || 'all'}_${idUsuario || 'all'}`;

    const cached = apiCache.get<number>(cacheKey, TTL_REPORTES);
    if (cached !== null && cached !== undefined) return cached;

    try {
      const queryParams: string[] = ['count=1', 'limit=1'];
      if (idVehiculo) queryParams.push(`id_vehiculo=${idVehiculo}`);
      if (idUsuario) queryParams.push(`id_usuario=${idUsuario}`);

      const res = await fetchJson(`/reportes?${queryParams.join('&')}`);
      if (typeof res?.count === 'number') {
        apiCache.set(cacheKey, res.count);
        return res.count;
      }
      if (typeof res?.total === 'number') {
        apiCache.set(cacheKey, res.total);
        return res.total;
      }
    } catch { }

    // Fallback Egress = 0 bytes (solicitud HEAD con conteo exacto en headers de Supabase)
    if (isSupabaseConfigured()) {
      try {
        const count = await getCountOptimized(
          'reportes_infracciones',
          idVehiculo ? 'id_vehiculo' : idUsuario ? 'id_usuario' : undefined,
          idVehiculo || idUsuario
        );
        apiCache.set(cacheKey, count);
        return count;
      } catch { }
    }

    return 0;
  },

  /**
   * Obtiene la lista de reportes con soporte para límites y filtrado estricto por oficial
   */
  async getReportes(
    options?:
      | {
        idUsuario?: number;
        idVehiculo?: number;
        limit?: number;
        forceRefresh?: boolean;
      }
      | number
  ): Promise<any[]> {
    let idUsuario: number | undefined;
    let idVehiculo: number | undefined;
    let limit: number | undefined;
    let forceRefresh = false;

    if (typeof options === 'number') {
      idUsuario = options;
    } else if (typeof options === 'object' && options !== null) {
      idUsuario = options.idUsuario;
      idVehiculo = options.idVehiculo;
      limit = options.limit;
      forceRefresh = options.forceRefresh || false;
    }

    const queryLimit = limit || 30; // Límite por defecto reducido para ahorrar ancho de banda
    const cacheKey = `reportes_list_${idUsuario || 'all'}_${idVehiculo || 'all'}_${queryLimit}`;

    return apiCache.getOrFetch(
      cacheKey,
      TTL_REPORTES,
      async () => {
        try {
          const queryParams: string[] = [`limit=${queryLimit}`];
          if (idUsuario) queryParams.push(`id_usuario=${idUsuario}`);
          if (idVehiculo) queryParams.push(`id_vehiculo=${idVehiculo}`);
          const queryString = `?${queryParams.join('&')}`;

          const data = await fetchJson(`/reportes${queryString}`);
          if (Array.isArray(data)) {
            return data;
          }
        } catch {
          if (isSupabaseConfigured()) {
            let query = (supabase as any)
              .from('reportes_infracciones')
              .select(
                'id_reporte, id_vehiculo, id_corbatin, id_infraccion, id_usuario, fecha_hora, estatus_revision, ubicacion_texto, descripcion_hechos, evidencias(id_evidencia, archivo, descripcion, fecha_captura)'
              )
              .order('id_reporte', { ascending: false })
              .limit(queryLimit);

            if (idUsuario) query = query.eq('id_usuario', idUsuario);
            if (idVehiculo) query = query.eq('id_vehiculo', idVehiculo);

            const { data } = await query;
            if (data && Array.isArray(data)) {
              return data;
            }
          }
        }
        return [];
      },
      forceRefresh
    );
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
   * Obtiene vehículos con proyección ligera
   */
  async getVehiculos(): Promise<VehiculoRow[]> {
    return apiCache.getOrFetch('vehiculos_list', TTL_VEHICLES_CORBATINES, async () => {
      try {
        const data = await fetchJson('/vehiculos?limit=50');
        if (Array.isArray(data)) {
          return data;
        }
      } catch {
        if (isSupabaseConfigured()) {
          const { data } = await supabase
            .from('vehiculos')
            .select(PROJECTIONS.VEHICULOS_LIGHT)
            .limit(50);
          if (data && Array.isArray(data)) {
            return data as VehiculoRow[];
          }
        }
      }
      return [];
    });
  },

  /**
   * Obtiene empresas con proyección ligera
   */
  async getEmpresas(): Promise<EmpresaRow[]> {
    return apiCache.getOrFetch('empresas_list', TTL_STATIC_CATALOGS, async () => {
      try {
        const data = await fetchJson('/empresas?limit=50');
        if (Array.isArray(data)) {
          return data;
        }
      } catch { }
      return [];
    });
  },

  /**
   * Obtiene corbatines con proyección ligera
   */
  async getCorbatines(): Promise<CorbatinRow[]> {
    return apiCache.getOrFetch('corbatines_list', TTL_VEHICLES_CORBATINES, async () => {
      try {
        const data = await fetchJson('/corbatines?limit=50');
        if (Array.isArray(data)) {
          return data;
        }
      } catch {
        if (isSupabaseConfigured()) {
          const { data } = await supabase
            .from('corbatines')
            .select(PROJECTIONS.CORBATINES_LIGHT)
            .limit(50);
          if (data && Array.isArray(data)) {
            return data as CorbatinRow[];
          }
        }
      }
      return [];
    });
  },

  /**
   * Obtiene sanciones con soporte para filtrado por vehículo y proyección ligera
   */
  async getSanciones(
    options?: { idVehiculo?: number; forceRefresh?: boolean } | number
  ): Promise<any[]> {
    let idVehiculo: number | undefined;
    let forceRefresh = false;

    if (typeof options === 'number') {
      idVehiculo = options;
    } else if (typeof options === 'object' && options !== null) {
      idVehiculo = options.idVehiculo;
      forceRefresh = options.forceRefresh || false;
    }

    const cacheKey = `sanciones_list_${idVehiculo || 'all'}`;

    return apiCache.getOrFetch(
      cacheKey,
      TTL_VEHICLES_CORBATINES,
      async () => {
        try {
          const queryParam = idVehiculo ? `?id_vehiculo=${idVehiculo}&limit=20` : '?limit=20';
          const data = await fetchJson(`/sanciones${queryParam}`);
          if (Array.isArray(data)) {
            return data;
          }
        } catch {
          if (isSupabaseConfigured()) {
            let query = (supabase as any)
              .from('sanciones' as any)
              .select(PROJECTIONS.SANCIONES_LIGHT)
              .limit(20);
            if (idVehiculo) query = query.eq('id_vehiculo', idVehiculo);
            const { data } = await query;
            if (data && Array.isArray(data)) {
              return data;
            }
          }
        }
        return [];
      },
      forceRefresh
    );
  },

  /**
   * Obtiene casetas con caché persistente
   */
  async getCasetas(): Promise<any[]> {
    return apiCache.getOrFetch('casetas_list', TTL_STATIC_CATALOGS, async () => {
      try {
        const data = await fetchJson('/casetas');
        if (Array.isArray(data)) {
          return data;
        }
      } catch { }
      return [];
    });
  },
};
