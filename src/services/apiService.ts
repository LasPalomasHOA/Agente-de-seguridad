// Servicio de Comunicación con la API REST (PostgreSQL vía Backend Express y Supabase Egress-Optimized)
import {
  CorbatinRow,
  VehiculoRow,
  EmpresaRow,
  TrabajadorRow,
  CatalogoInfraccionRow,
  SancionDbRow,
  BitacoraAccesoRow,
  ReglamentoRow,
  ReglaReincidenciaRow,
} from '../types/database';

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured, PROJECTIONS, getCountOptimized } from '../lib/supabase';
import { uploadEvidenciaASupabase, comprimirImagen } from './imageService';

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
  ultimoAcceso?: BitacoraAccesoRow | null;
}

// Almacenamiento seguro y persistente para caché entre sesiones y recargas
const memoryStorageMap = new Map<string, string>();

export const safeStorage = {
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

/**
 * Gestor de caché local para imágenes pesadas y Base64 de vehículos y usuarios
 * (Evita re-descargas masivas de 50KB por auto en cada consulta SQL/REST)
 */
export const ImageCacheStore = {
  getVehiclePhoto(idVehiculo: number | string): string | null {
    if (!idVehiculo) return null;
    return safeStorage.getItem(`hoa_photo_veh_${idVehiculo}`);
  },
  setVehiclePhoto(idVehiculo: number | string, photoUrl: string): void {
    if (!idVehiculo || !photoUrl || typeof photoUrl !== 'string' || photoUrl.trim().length === 0) return;
    safeStorage.setItem(`hoa_photo_veh_${idVehiculo}`, photoUrl);
  },
  getUserAvatar(idUsuario: number | string): string | null {
    if (!idUsuario) return null;
    return safeStorage.getItem(`hoa_photo_user_${idUsuario}`);
  },
  setUserAvatar(idUsuario: number | string, avatarUrl: string): void {
    if (!idUsuario || !avatarUrl || typeof avatarUrl !== 'string' || avatarUrl.trim().length === 0) return;
    safeStorage.setItem(`hoa_photo_user_${idUsuario}`, avatarUrl);
  },
};

export const EvidenciaCacheStore = {
  getFoto(idEvidencia: number | string): string | null {
    if (!idEvidencia) return null;
    return safeStorage.getItem(`hoa_evidencia_${idEvidencia}`);
  },
  setFoto(idEvidencia: number | string, urlOrBase64: string): void {
    if (!idEvidencia || !urlOrBase64 || typeof urlOrBase64 !== 'string' || urlOrBase64.trim().length === 0) return;
    safeStorage.setItem(`hoa_evidencia_${idEvidencia}`, urlOrBase64);
  },
};

export async function getEvidenciaFoto(idEvidencia: number | string): Promise<string | null> {
  if (!idEvidencia) return null;
  const cleanId = typeof idEvidencia === 'string' ? idEvidencia.replace('ev_', '') : String(idEvidencia);

  // 1. Revisar caché local (0 bytes Egress)
  const cached = EvidenciaCacheStore.getFoto(cleanId);
  if (cached) return cached;

  // 2. Si no está en caché, consultar vía Supabase si está disponible
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await (supabase as any)
        .from('evidencias_infraccion')
        .select('archivo')
        .eq('id_evidencia', cleanId)
        .single();

      if (!error && data?.archivo) {
        EvidenciaCacheStore.setFoto(cleanId, data.archivo);
        return data.archivo;
      }
    } catch (err) {
      console.warn('[ApiService] Error al obtener foto de evidencia:', err);
    }
  }

  return null;
}

export async function getVehiculoFoto(idVehiculo: number | string): Promise<string | null> {
  if (!idVehiculo) return null;

  // 1. Revisar caché local (0 bytes Egress)
  const cached = ImageCacheStore.getVehiclePhoto(idVehiculo);
  if (cached) return cached;

  // 2. Consultar vía Express API
  try {
    const v = await fetchJson(`/vehiculos/${idVehiculo}`);
    const photo = v?.foto_url || v?.foto;
    if (photo) {
      ImageCacheStore.setVehiclePhoto(idVehiculo, photo);
      return photo;
    }
  } catch {
    // Fallback a Supabase si aplica
  }

  // 3. Fallback directo a Supabase
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await (supabase as any)
        .from('vehiculos')
        .select('foto_url')
        .eq('id_vehiculo', idVehiculo)
        .single();

      if (!error && data?.foto_url) {
        ImageCacheStore.setVehiclePhoto(idVehiculo, data.foto_url);
        return data.foto_url;
      }
    } catch (err) {
      console.warn('[ApiService] Error al obtener foto de vehículo:', err);
    }
  }

  return null;
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
    let cachedEntry = httpEtagCache.get(url);
    if (!cachedEntry) {
      try {
        const stored = safeStorage.getItem(`hoa_etag_${url}`);
        if (stored) {
          cachedEntry = JSON.parse(stored);
          if (cachedEntry) httpEtagCache.set(url, cachedEntry);
        }
      } catch { }
    }
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
        const entry = { etag, data };
        httpEtagCache.set(url, entry);
        try {
          safeStorage.setItem(`hoa_etag_${url}`, JSON.stringify(entry));
        } catch { }
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
const TTL_VEHICLES_CORBATINES = 15 * 60 * 1000;   // 15 minutos para catálogos estáticos de vehículos y corbatines
const TTL_LOOKUPS = 10 * 60 * 1000;               // 10 minutos para metadata estática de vehículos/corbatines
const TTL_REPORTES = 2 * 60 * 1000;              // 2 minutos para reportes del oficial
const TTL_SANCIONES = 30 * 1000;                 // 30 segundos para consulta de sanciones activas

export const getLocalDateStr = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getLocalTimeStr = (d = new Date()): string => {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

export const parseUtcTimestampToLocalTimeStr = (
  isoTimestamp?: string | null,
  fallbackTimeStr?: string | null
): string | null => {
  const val = isoTimestamp || fallbackTimeStr;
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim();
  if (!clean || clean === 'null' || clean === 'undefined') return null;

  // Extraer hora y minutos de cualquier formato UTC (TIMESTAMP WITH TIME ZONE, TIME puro, ISO)
  const match = clean.match(/(?:T|\s|^)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const utcHour = parseInt(match[1], 10);
    const min = match[2];
    const sec = match[3] || '00';
    let localHour = utcHour - 7;
    if (localHour < 0) localHour += 24;
    localHour = localHour % 24;
    return `${String(localHour).padStart(2, '0')}:${min}:${sec}`;
  }

  return clean;
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
            null;
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
   * Obtiene la clave canónica principal y los alias de búsqueda para un término dado
   */
  getCanonicalLookupKeys(param: string): {
    primaryKey: string;
    aliasKeys: string[];
    numbers: number[];
    tokens: string[];
    plates: string[];
  } {
    const rawTokens = (param || '')
      .split(/[\s,;|/]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const tokens = rawTokens.length > 0 ? rawTokens : [(param || '').trim()].filter(Boolean);
    const numbers: number[] = [];
    const plates: string[] = [];
    const aliasKeys: string[] = [];

    for (const token of tokens) {
      const matchNum = token.match(/\b\d+\b/);
      if (matchNum) {
        numbers.push(parseInt(matchNum[0], 10));
      }

      const cleanAlnum = token.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (cleanAlnum.length >= 3 && /[a-zA-Z]/.test(cleanAlnum) && /\d/.test(cleanAlnum)) {
        plates.push(cleanAlnum);
      }
    }

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
        if (cachedResult && cachedResult.vehiculo && Number(cachedResult.vehiculo.id_vehiculo) > 0) {
          // Consultar en vivo el último acceso y las sanciones activas
          const [liveAcceso, liveSanciones] = await Promise.all([
            this.getUltimoAcceso(
              cachedResult.vehiculo.id_vehiculo,
              cachedResult.corbatin?.id_corbatin
            ),
            this.getSanciones({ idVehiculo: cachedResult.vehiculo.id_vehiculo, forceRefresh: true }),
          ]);

          cachedResult.ultimoAcceso = liveAcceso || cachedResult.ultimoAcceso || null;
          // Si en la web se aprobó una infracción, aquí se reflejará de inmediato:
          if (Array.isArray(liveSanciones)) {
            cachedResult.sancionesActivas = liveSanciones
              .filter((s: any) => s.estatus === 'ACTIVA' || s.estatus === 'activa' || s.estatus === 'activo')
              .map((s: any) => ({
                ...s,
                estatus: (s.estatus?.toLowerCase() as any) || 'activa',
              }));
          }

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
            const matchingCorbs = corbList.filter((c: any) => Number(c.numero) === targetNum);
            if (matchingCorbs.length > 0) {
              // Priorizar el corbatín que tenga vehículo asignado y esté activo
              const matched =
                matchingCorbs.find(
                  (c: any) =>
                    (c.vehiculo || c.id_vehiculo) &&
                    String(c.estatus || '').toLowerCase() === 'activo'
                ) ||
                matchingCorbs.find((c: any) => c.vehiculo || c.id_vehiculo) ||
                matchingCorbs[0];

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


      if (!matchedCorbatin && !matchedVehiculo && !expressSucceeded) {
        if (isSupabaseConfigured()) {
          try {
            // 1. Búsqueda por corbatín: Join con vehiculos y su respectiva empresa
            if (numbers.length > 0) {
              const targetNum = numbers[0];
              const { data: directCorb, error: corbErr } = await (supabase as any)
                .from('corbatines')
                .select(
                  `${PROJECTIONS.CORBATINES_LIGHT}, vehiculos(${PROJECTIONS.VEHICULOS_LIGHT}, empresas(id_empresa, razon_social))`
                )
                .eq('numero', targetNum)
                .limit(1);

              if (!corbErr && directCorb && directCorb.length > 0) {
                matchedCorbatin = directCorb[0];

                // Corrección 1: Normalización defensiva (si Supabase entrega objeto único o array)
                const vehRel = directCorb[0].vehiculos;
                matchedVehiculo = Array.isArray(vehRel) ? (vehRel[0] || null) : (vehRel || null);
              }
            }

            // 2. Búsqueda por placa: Join con empresa y sus corbatines
            if (!matchedVehiculo && plates.length > 0) {
              const validPlate = plates.find((p) => p.length >= 3) || plates[0];
              const cleanPlate = validPlate.trim().toUpperCase();
              const candidatePlates = Array.from(new Set([cleanPlate, cleanPlate.replace(/[-_ ]/g, ''), validPlate]));

              const { data: directVeh, error: vehErr } = await (supabase as any)
                .from('vehiculos')
                .select(
                  `${PROJECTIONS.VEHICULOS_LIGHT}, empresas(id_empresa, razon_social), corbatines(${PROJECTIONS.CORBATINES_LIGHT})`
                )
                .in('placas', candidatePlates)
                .limit(1);

              if (!vehErr && directVeh && directVeh.length > 0) {
                matchedVehiculo = directVeh[0];

                // Corrección 2: Priorizar el corbatín ACTIVO si el vehículo tiene historial
                const corbs = directVeh[0].corbatines;
                matchedCorbatin = Array.isArray(corbs)
                  ? (corbs.find((c: any) => String(c.estatus || '').toLowerCase() === 'activo') || corbs[0] || null)
                  : (corbs || null);
              }
            }
          } catch (err) {
            console.warn('[ApiService] Error en consulta unificada Supabase:', err);
          }
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

      // Gestión y caché local de imagen del vehículo
      let finalFotoUrl = matchedVehiculo?.foto_url || matchedVehiculo?.foto;
      if (finalFotoUrl && typeof finalFotoUrl === 'string' && finalFotoUrl.trim().length > 0) {
        ImageCacheStore.setVehiclePhoto(matchedVehiculo?.id_vehiculo || 0, finalFotoUrl);
      } else if (matchedVehiculo?.id_vehiculo) {
        const cachedPhoto = ImageCacheStore.getVehiclePhoto(matchedVehiculo.id_vehiculo);
        if (cachedPhoto) {
          finalFotoUrl = cachedPhoto;
        } else {
          try {
            const directPhoto = await getVehiculoFoto(matchedVehiculo.id_vehiculo);
            if (directPhoto) {
              finalFotoUrl = directPhoto;
            }
          } catch { }
        }
      }

      const vehiculoRow: VehiculoRow = {
        id_vehiculo: matchedVehiculo?.id_vehiculo || 0,
        id_empresa: matchedVehiculo?.id_empresa || 1,
        marca: matchedVehiculo?.marca || 'Genérica',
        modelo: matchedVehiculo?.modelo || 'Vehículo',
        año: matchedVehiculo?.año || matchedVehiculo?.anio || 2024,
        placas: matchedVehiculo?.placas || matchedVehiculo?.placa || 'SIN-PLACA',
        color: matchedVehiculo?.color || 'Blanco',
        foto_url: finalFotoUrl || null,
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

      // Sanciones, conteo de infracciones y último acceso vehicular en paralelo sin redundancia
      const [todasSanciones, totalInfracciones, ultimoAcceso] = await Promise.all([
        matchedVehiculo?.sanciones && Array.isArray(matchedVehiculo.sanciones)
          ? Promise.resolve(matchedVehiculo.sanciones)
          : this.getSanciones({ idVehiculo: vehiculoRow.id_vehiculo }),
        typeof matchedVehiculo?.infracciones_count === 'number'
          ? Promise.resolve(matchedVehiculo.infracciones_count)
          : this.getReportesCount({ idVehiculo: vehiculoRow.id_vehiculo }),
        this.getUltimoAcceso(vehiculoRow.id_vehiculo, corbatinRow.id_corbatin),
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
        ultimoAcceso: ultimoAcceso || null,
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
          if (Array.isArray(data) && data.length > 0) {
            return data.map((reg: any) => ({
              id_reglamento: Number(reg.id_reglamento) || 1,
              version: reg.version || 'V2026-1',
              titulo: reg.titulo || 'Reglamento General de Acceso, Tránsito y Operación',
              archivo_url: reg.archivo_url || '',
              fecha_publicacion: reg.fecha_publicacion || new Date().toISOString(),
              vigente: reg.vigente !== false,
              created_at: reg.created_at || new Date().toISOString(),
              contenido_texto: reg.contenido_texto || '',
              contenido_secciones: Array.isArray(reg.contenido_secciones) ? reg.contenido_secciones : [],
              infracciones: Array.isArray(reg.infracciones) ? reg.infracciones : [],
              aceptaciones: Array.isArray(reg.aceptaciones) ? reg.aceptaciones : [],
            }));
          }
        } catch (e) {
          console.warn('[ApiService] Error al consultar /reglamentos vía API:', e);
        }

        // Fallback a Supabase directo si aplica
        if (isSupabaseConfigured()) {
          try {
            const { data } = await supabase
              .from('reglamentos')
              .select(PROJECTIONS.REGLAMENTOS)
              .order('vigente', { ascending: false })
              .limit(50);
            if (data && Array.isArray(data) && data.length > 0) {
              return data as ReglamentoRow[];
            }
          } catch (supErr) {
            console.warn('[ApiService] Fallback Supabase reglamentos:', supErr);
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
   * Registra un nuevo reporte de infracción, sube evidencias comprimidas a Supabase Storage e invalida selectivamente cachés
   */
  async crearReporteInfraccion(params: {
    idVehiculo: number;
    idCorbatin?: number | null;
    idInfraccion: number;
    idUsuario: number;
    ubicacionTexto?: string;
    descripcionHechos: string;
    evidenciasUrls?: string[];
    evidencias?: Array<{ fotoUrl: string; descripcion?: string; fechaHora?: string }>;
  }): Promise<{ idReporte: number } | null> {
    try {
      const now = new Date();
      // Calcular nivel de reincidencia con la cuenta local/cacheada existente (0 bytes egress adicional)
      const prevCount = await this.getReportesCount({ idVehiculo: params.idVehiculo }).catch(() => 0);
      const nuevoNivel = prevCount + 1;
      let fechaFinStr: string | null = null;
      if (nuevoNivel === 1) {
        fechaFinStr = now.toISOString(); // 1ª Falta: Llamado de atención
      } else if (nuevoNivel === 2) {
        fechaFinStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 2ª Falta: 24 horas
      } else if (nuevoNivel === 3) {
        fechaFinStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 3ª Falta: 7 días
      } else {
        fechaFinStr = null; // 4ª Falta: Permanente
      }

      // 1. Procesar y subir evidencias a Supabase Storage (comprimidas a WebP)
      const processedEvidencias: Array<{ fotoUrl: string; descripcion?: string; fechaHora?: string }> = [];
      const rawList = params.evidencias || (params.evidenciasUrls || []).map((url) => ({ fotoUrl: url }));

      for (let i = 0; i < rawList.length; i++) {
        const item = rawList[i];
        if (!item.fotoUrl) continue;

        try {
          if (item.fotoUrl.startsWith('http://') || item.fotoUrl.startsWith('https://')) {
            // Ya es una URL remota
            processedEvidencias.push(item);
          } else {
            // Es base64 o archivo local: comprimir y subir a Supabase Storage
            const uploadRes = await uploadEvidenciaASupabase(item.fotoUrl, {
              idUsuario: params.idUsuario,
              fileName: `ev_${Date.now()}_${i + 1}.webp`,
            });
            if (uploadRes?.publicUrl) {
              processedEvidencias.push({
                ...item,
                fotoUrl: uploadRes.publicUrl,
              });
            }
          }
        } catch (uploadErr) {
          console.warn('[ApiService] Error subiendo evidencia a Storage:', uploadErr);
          processedEvidencias.push(item);
        }
      }

      const finalUrls = processedEvidencias.map((e) => e.fotoUrl);
      let resReporteId: number | null = null;

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
            evidencia_url: finalUrls[0] || null,
            numero_reincidencia: nuevoNivel,
            fecha_fin: fechaFinStr,
          }),
        });
        if (res && res.id_reporte) {
          resReporteId = res.id_reporte;
        }
      } catch { }

      // Fallback Supabase si no hubo respuesta del servidor Express o para persistir evidencias en tabla
      if (isSupabaseConfigured()) {
        try {
          if (!resReporteId) {
            const { data: repData } = await (supabase as any)
              .from('reportes_infracciones')
              .insert({
                id_vehiculo: params.idVehiculo,
                id_corbatin: params.idCorbatin || null,
                id_infraccion: params.idInfraccion,
                id_usuario: params.idUsuario,
                ubicacion_texto: params.ubicacionTexto || 'Recorrido Residencial',
                descripcion_hechos: params.descripcionHechos,
                estatus_revision: 'aprobada',
              })
              .select('id_reporte')
              .single();

            if (repData && repData.id_reporte) {
              resReporteId = repData.id_reporte;
              await (supabase as any)
                .from('sanciones')
                .insert({
                  id_reporte: repData.id_reporte,
                  id_vehiculo: params.idVehiculo,
                  id_empresa: 1,
                  id_regla: nuevoNivel <= 4 ? nuevoNivel : 4,
                  numero_reincidencia: nuevoNivel,
                  fecha_inicio: now.toISOString(),
                  fecha_fin: fechaFinStr,
                  estatus: 'activa',
                  motivo: params.descripcionHechos || 'Infracción reglamentaria',
                  id_usuario: params.idUsuario,
                });
            }
          }

          // Guardar cada evidencia en la tabla evidencias vinculada al reporte
          if (resReporteId && processedEvidencias.length > 0) {
            for (const ev of processedEvidencias) {
              const { data: evData } = await (supabase as any)
                .from('evidencias')
                .insert({
                  id_reporte: resReporteId,
                  archivo: ev.fotoUrl,
                  descripcion: ev.descripcion || 'Fotografía de evidencia levantada por oficial.',
                  fecha_captura: ev.fechaHora || now.toISOString(),
                  id_usuario: params.idUsuario,
                  activa: true,
                })
                .select('id_evidencia')
                .single();

              if (evData?.id_evidencia) {
                EvidenciaCacheStore.setFoto(evData.id_evidencia, ev.fotoUrl);
              }
            }
          }
        } catch (supabaseInsertErr) {
          console.warn('[ApiService] Error al insertar reporte/evidencias en Supabase:', supabaseInsertErr);
        }
      }

      // Invalidación selectiva y granular
      if (params.idUsuario) {
        apiCache.invalidate(`reportes_list_${params.idUsuario}`);
        apiCache.invalidate(`reportes_count_all_${params.idUsuario}`);
      }

      if (params.idVehiculo) {
        // Invalida conteos y sanciones específicas
        apiCache.invalidate(`reportes_count_${params.idVehiculo}`);
        apiCache.invalidate(`sanciones_list_${params.idVehiculo}`);
        apiCache.invalidate(`reportes_list_all_${params.idVehiculo}`);
        apiCache.invalidate(`lookup_veh_${params.idVehiculo}`);

        // Purgar cualquier lookup previo para forzar recálculo de sanciones en escaneo
        apiCache.invalidate('lookup_');
      }

      if (params.idCorbatin) {
        apiCache.invalidate(`lookup_num_${params.idCorbatin}`);
      }

      if (resReporteId) {
        return { idReporte: resReporteId };
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
      if (Array.isArray(res)) {
        const count = idVehiculo
          ? res.filter((r: any) => Number(r.id_vehiculo) === Number(idVehiculo)).length
          : idUsuario
            ? res.filter((r: any) => Number(r.id_usuario) === Number(idUsuario)).length
            : res.length;
        apiCache.set(cacheKey, count);
        return count;
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
            if (idVehiculo) {
              return data.filter((r: any) => Number(r.id_vehiculo) === Number(idVehiculo));
            }
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
              // Cachear en EvidenciaCacheStore cada URL de evidencia recuperada (0 bytes Egress en futuras consultas)
              data.forEach((r: any) => {
                if (r.evidencias && Array.isArray(r.evidencias)) {
                  r.evidencias.forEach((ev: any) => {
                    if (ev.id_evidencia && ev.archivo) {
                      EvidenciaCacheStore.setFoto(ev.id_evidencia, ev.archivo);
                    }
                  });
                }
              });
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
   * Obtiene el último registro de acceso para un vehículo o corbatín en particular
   */
  async getUltimoAcceso(idVehiculo?: number | null, idCorbatin?: number | null): Promise<BitacoraAccesoRow | null> {
    const vId = idVehiculo ? Number(idVehiculo) : null;
    const cId = idCorbatin ? Number(idCorbatin) : null;
    if (!vId && !cId) return null;

    const cacheKey = vId ? `ultimo_acceso_veh_${vId}` : `ultimo_acceso_corb_${cId}`;
    const cached = apiCache.get<BitacoraAccesoRow>(cacheKey, 45 * 1000);
    if (cached !== null && cached !== undefined) {
      if ((vId && Number(cached.id_vehiculo) === vId) || (cId && Number(cached.id_corbatin) === cId)) {
        return cached;
      }
      apiCache.invalidate(cacheKey);
    }

    // 1. Almacenamiento local en memoria reciente
    let localAcceso: BitacoraAccesoRow | null = null;
    try {
      const localMapStr = safeStorage.getItem('hoa_local_bitacora_map');
      if (localMapStr) {
        const map = JSON.parse(localMapStr);
        const entry = map ? (vId ? (map[String(vId)] || map[vId]) : (map[`corb_${cId}`])) : null;
        if (entry && ((vId && Number(entry.id_vehiculo) === vId) || (cId && Number(entry.id_corbatin) === cId))) {
          localAcceso = entry;
        }
      }
    } catch { }

    // 2. Consultar servidor Express
    try {
      const queryParam = vId ? `id_vehiculo=${vId}` : `id_corbatin=${cId}`;
      const res = await fetchJson(`/bitacora?${queryParam}&limit=1`);
      const list = Array.isArray(res) ? res : res?.accesos || (res?.id_acceso ? [res] : []);
      // FILTRADO ESTRICTO: Solo aceptar el registro si realmente pertenece a idVehiculo o idCorbatin
      const matchedRow = list.find((r: any) => (vId && Number(r.id_vehiculo) === vId) || (cId && Number(r.id_corbatin) === cId));
      if (matchedRow) {
        const mapped: BitacoraAccesoRow = {
          id_acceso: matchedRow.id_acceso,
          id_caseta: matchedRow.id_caseta || 1,
          id_vehiculo: matchedRow.id_vehiculo,
          id_corbatin: matchedRow.id_corbatin || null,
          id_conductor: matchedRow.id_conductor || null,
          id_usuario: matchedRow.id_usuario || 1,
          fecha: matchedRow.fecha || (matchedRow.created_at || '').split('T')[0] || getLocalDateStr(),
          hora_entrada: matchedRow.hora_entrada && matchedRow.hora_entrada !== 'null' ? matchedRow.hora_entrada : (matchedRow.created_at || null),
          hora_salida: (matchedRow.estatus_acceso?.toLowerCase() === 'salida' || matchedRow.hora_salida)
            ? (matchedRow.hora_salida && matchedRow.hora_salida !== 'null' ? matchedRow.hora_salida : (matchedRow.updated_at || matchedRow.created_at || null))
            : null,
          ubicacion_trabajo: matchedRow.ubicacion_trabajo || null,
          estatus_acceso: (matchedRow.estatus_acceso?.toLowerCase() as any) || (matchedRow.hora_salida ? 'salida' : 'permitido'),
          motivo_rechazo: matchedRow.motivo_rechazo || null,
          observaciones: matchedRow.observaciones || null,
          created_at: matchedRow.created_at || new Date().toISOString(),
          updated_at: matchedRow.updated_at || new Date().toISOString(),
        };

        apiCache.set(cacheKey, mapped);
        return mapped;
      }
    } catch { }

    // 3. Supabase Fallback
    if (isSupabaseConfigured()) {
      try {
        let query = (supabase as any)
          .from('bitacora_accesos')
          .select(PROJECTIONS.BITACORA_LIGHT);

        if (vId) {
          query = query.eq('id_vehiculo', vId);
        } else if (cId) {
          query = query.eq('id_corbatin', cId);
        }

        const { data, error } = await query
          .order('id_acceso', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const matchedRow = data.find((r: any) => (vId && Number(r.id_vehiculo) === vId) || (cId && Number(r.id_corbatin) === cId)) || data[0];
          if (matchedRow) {
            const mapped: BitacoraAccesoRow = {
              id_acceso: matchedRow.id_acceso,
              id_caseta: matchedRow.id_caseta || 1,
              id_vehiculo: matchedRow.id_vehiculo,
              id_corbatin: matchedRow.id_corbatin || null,
              id_conductor: matchedRow.id_conductor || null,
              id_usuario: matchedRow.id_usuario || 1,
              fecha: matchedRow.fecha || (matchedRow.created_at || '').split('T')[0] || getLocalDateStr(),
              hora_entrada: matchedRow.hora_entrada && matchedRow.hora_entrada !== 'null' ? matchedRow.hora_entrada : (matchedRow.created_at || null),
              hora_salida: (matchedRow.estatus_acceso?.toLowerCase() === 'salida' || matchedRow.hora_salida)
                ? (matchedRow.hora_salida && matchedRow.hora_salida !== 'null' ? matchedRow.hora_salida : (matchedRow.updated_at || matchedRow.created_at || null))
                : null,
              ubicacion_trabajo: matchedRow.ubicacion_trabajo || null,
              estatus_acceso: (matchedRow.estatus_acceso?.toLowerCase() as any) || (matchedRow.hora_salida ? 'salida' : 'permitido'),
              motivo_rechazo: matchedRow.motivo_rechazo || null,
              observaciones: matchedRow.observaciones || null,
              created_at: matchedRow.created_at || new Date().toISOString(),
              updated_at: matchedRow.updated_at || new Date().toISOString(),
            };

            apiCache.set(cacheKey, mapped);
            return mapped;
          }
        }
      } catch { }
    }

    // 4. Si el backend no devolvió filas pero hay registro local
    if (localAcceso && ((vId && Number(localAcceso.id_vehiculo) === vId) || (cId && Number(localAcceso.id_corbatin) === cId))) {
      return localAcceso;
    }

    return null;
  },

  /**
   * Registra una nueva entrada de vehículo en la bitácora
   */
  async registrarEntradaVehiculo(params: {
    idVehiculo: number;
    idCorbatin?: number | null;
    idConductor?: number | null;
    idUsuario: number;
    idCaseta?: number;
    ubicacionTrabajo?: string;
    observaciones?: string;
  }): Promise<{ success: boolean; acceso?: BitacoraAccesoRow }> {
    const now = new Date();
    const fechaStr = getLocalDateStr(now);
    const utcIsoStr = now.toISOString();

    const newAcceso: BitacoraAccesoRow = {
      id_acceso: Date.now(),
      id_caseta: params.idCaseta || 1,
      id_vehiculo: params.idVehiculo,
      id_corbatin: params.idCorbatin || null,
      id_conductor: params.idConductor || null,
      id_usuario: params.idUsuario,
      fecha: fechaStr,
      hora_entrada: utcIsoStr,
      hora_salida: null,
      ubicacion_trabajo: params.ubicacionTrabajo || 'Caseta Principal',
      estatus_acceso: 'permitido',
      motivo_rechazo: null,
      observaciones: params.observaciones || 'Entrada registrada en caseta.',
      created_at: utcIsoStr,
      updated_at: utcIsoStr,
    };

    // 1. Guardar en almacenamiento local para respuesta instantánea
    try {
      let map: Record<string, BitacoraAccesoRow> = {};
      const localMapStr = safeStorage.getItem('hoa_local_bitacora_map');
      if (localMapStr) {
        map = JSON.parse(localMapStr) || {};
      }
      map[String(params.idVehiculo)] = newAcceso;
      safeStorage.setItem('hoa_local_bitacora_map', JSON.stringify(map));
    } catch { }

    // Invalidar únicamente la caché del último acceso de este vehículo (preserva catálogos de vehículos en RAM)
    apiCache.invalidate(`ultimo_acceso_veh_${params.idVehiculo}`);
    if (params.idCorbatin) {
      apiCache.invalidate(`ultimo_acceso_corb_${params.idCorbatin}`);
    }
    const cachedLookupVeh = apiCache.get<CorbatinLookupResult>(`lookup_veh_${params.idVehiculo}`, TTL_LOOKUPS);
    if (cachedLookupVeh) {
      cachedLookupVeh.ultimoAcceso = newAcceso;
    }
    if (params.idCorbatin) {
      const cachedLookupNum = apiCache.get<CorbatinLookupResult>(`lookup_num_${params.idCorbatin}`, TTL_LOOKUPS);
      if (cachedLookupNum) {
        cachedLookupNum.ultimoAcceso = newAcceso;
      }
    }

    // 2. Enviar a Express Backend
    try {
      const res = await fetchJson('/bitacora', {
        method: 'POST',
        body: JSON.stringify({
          id_caseta: params.idCaseta || 1,
          id_vehiculo: params.idVehiculo,
          id_corbatin: params.idCorbatin || null,
          id_conductor: params.idConductor || null,
          id_usuario: params.idUsuario,
          fecha: fechaStr,
          hora_entrada: utcIsoStr,
          ubicacion_trabajo: params.ubicacionTrabajo || 'Caseta Principal',
          estatus_acceso: 'PERMITIDO',
          observaciones: params.observaciones || null,
        }),
      });
      if (res && res.id_acceso) {
        newAcceso.id_acceso = res.id_acceso;
        try {
          const map = JSON.parse(safeStorage.getItem('hoa_local_bitacora_map') || '{}');
          map[String(params.idVehiculo)] = newAcceso;
          safeStorage.setItem('hoa_local_bitacora_map', JSON.stringify(map));
        } catch { }
      }
    } catch {
      // 3. Fallback a Supabase
      if (isSupabaseConfigured()) {
        try {
          const { data } = await (supabase as any)
            .from('bitacora_accesos')
            .insert({
              id_caseta: params.idCaseta || 1,
              id_vehiculo: params.idVehiculo,
              id_corbatin: params.idCorbatin || null,
              id_conductor: params.idConductor || null,
              id_usuario: params.idUsuario,
              fecha: fechaStr,
              hora_entrada: utcIsoStr,
              ubicacion_trabajo: params.ubicacionTrabajo || 'Caseta Principal',
              estatus_acceso: 'permitido',
              observaciones: params.observaciones || null,
            })
            .select('id_acceso')
            .single();

          if (data && data.id_acceso) {
            newAcceso.id_acceso = data.id_acceso;
            try {
              const map = JSON.parse(safeStorage.getItem('hoa_local_bitacora_map') || '{}');
              map[String(params.idVehiculo)] = newAcceso;
              safeStorage.setItem('hoa_local_bitacora_map', JSON.stringify(map));
            } catch { }
          }
        } catch { }
      }
    }

    return { success: true, acceso: newAcceso };
  },

  /**
   * Registra la salida de un vehículo en la bitácora
   */
  async registrarSalidaVehiculo(params: {
    idAcceso?: number;
    idVehiculo: number;
    idUsuario: number;
    idCaseta?: number;
    idCorbatin?: number | null;
    observaciones?: string;
  }): Promise<{ success: boolean; horaSalida: string }> {
    const now = new Date();
    const fechaStr = getLocalDateStr(now);
    const utcIsoStr = now.toISOString();

    // 1. Actualizar mapa local inmediatamente
    let updatedAcceso: BitacoraAccesoRow | null = null;
    try {
      let map: Record<string, BitacoraAccesoRow> = {};
      const localMapStr = safeStorage.getItem('hoa_local_bitacora_map');
      if (localMapStr) {
        map = JSON.parse(localMapStr) || {};
      }
      const existing = map[String(params.idVehiculo)];
      updatedAcceso = {
        id_acceso: existing?.id_acceso || params.idAcceso || Date.now(),
        id_caseta: params.idCaseta || existing?.id_caseta || 1,
        id_vehiculo: params.idVehiculo,
        id_corbatin: params.idCorbatin || existing?.id_corbatin || null,
        id_conductor: existing?.id_conductor || null,
        id_usuario: params.idUsuario,
        fecha: existing?.fecha || fechaStr,
        hora_entrada: existing?.hora_entrada || null,
        hora_salida: utcIsoStr,
        ubicacion_trabajo: existing?.ubicacion_trabajo || null,
        estatus_acceso: 'salida',
        motivo_rechazo: null,
        observaciones: params.observaciones || 'Salida registrada en caseta.',
        created_at: existing?.created_at || utcIsoStr,
        updated_at: utcIsoStr,
      };
      map[String(params.idVehiculo)] = updatedAcceso;
      safeStorage.setItem('hoa_local_bitacora_map', JSON.stringify(map));
    } catch { }

    // Invalidar únicamente la clave de último acceso (sin purgar lookup_ global)
    apiCache.invalidate(`ultimo_acceso_veh_${params.idVehiculo}`);
    if (params.idCorbatin) {
      apiCache.invalidate(`ultimo_acceso_corb_${params.idCorbatin}`);
    }
    const cachedLookupVeh = apiCache.get<CorbatinLookupResult>(`lookup_veh_${params.idVehiculo}`, TTL_LOOKUPS);
    if (cachedLookupVeh && updatedAcceso) {
      cachedLookupVeh.ultimoAcceso = updatedAcceso;
    }
    if (params.idCorbatin && updatedAcceso) {
      const cachedLookupNum = apiCache.get<CorbatinLookupResult>(`lookup_num_${params.idCorbatin}`, TTL_LOOKUPS);
      if (cachedLookupNum) {
        cachedLookupNum.ultimoAcceso = updatedAcceso;
      }
    }

    // 2. Intentar actualizar en Express Backend mediante POST /bitacora
    try {
      await fetchJson('/bitacora', {
        method: 'POST',
        body: JSON.stringify({
          id_caseta: params.idCaseta || 1,
          id_vehiculo: params.idVehiculo,
          id_corbatin: params.idCorbatin || null,
          id_usuario: params.idUsuario,
          fecha: fechaStr,
          hora_salida: utcIsoStr,
          estatus_acceso: 'SALIDA',
          observaciones: params.observaciones || 'Salida registrada en caseta.',
        }),
      });
    } catch { }

    // 3. Fallback en Supabase (un solo salto de red sin SELECTs previos)
    if (isSupabaseConfigured()) {
      try {
        if (params.idAcceso && params.idAcceso > 0 && params.idAcceso < 1000000000000) {
          await (supabase as any)
            .from('bitacora_accesos')
            .update({
              hora_salida: utcIsoStr,
              estatus_acceso: 'salida',
              updated_at: utcIsoStr,
            })
            .eq('id_acceso', params.idAcceso);
        } else {
          // Actualización directa en una sola instrucción SQL/REST
          await (supabase as any)
            .from('bitacora_accesos')
            .update({
              hora_salida: utcIsoStr,
              estatus_acceso: 'salida',
              updated_at: utcIsoStr,
            })
            .eq('id_vehiculo', params.idVehiculo)
            .is('hora_salida', null);
        }
      } catch { }
    }

    return { success: true, horaSalida: utcIsoStr };
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
      const now = new Date();
      const fechaStr = getLocalDateStr(now);
      const utcIsoStr = now.toISOString();

      await fetchJson('/bitacora', {
        method: 'POST',
        body: JSON.stringify({
          id_caseta: params.idCaseta,
          id_vehiculo: params.idVehiculo,
          id_corbatin: params.idCorbatin || null,
          id_conductor: params.idConductor || null,
          id_usuario: params.idUsuario,
          fecha: fechaStr,
          hora_entrada: utcIsoStr,
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
   * Obtiene vehículos con proyección ligera y persistencia de fotos en ImageCacheStore
   */
  async getVehiculos(): Promise<VehiculoRow[]> {
    return apiCache.getOrFetch('vehiculos_list', TTL_VEHICLES_CORBATINES, async () => {
      try {
        const data = await fetchJson('/vehiculos?limit=50');
        if (Array.isArray(data)) {
          return data.map((v: any) => {
            const f = v.foto_url || v.foto;
            if (f && v.id_vehiculo) {
              ImageCacheStore.setVehiclePhoto(v.id_vehiculo, f);
            }
            return {
              ...v,
              foto_url: f || ImageCacheStore.getVehiclePhoto(v.id_vehiculo) || null,
            };
          });
        }
      } catch {
        if (isSupabaseConfigured()) {
          const { data } = await supabase
            .from('vehiculos')
            .select(PROJECTIONS.VEHICULOS_LIGHT)
            .limit(50);

          if (data && Array.isArray(data)) {
            return data.map((v: any) => {
              const f = v.foto_url || v.foto;
              if (f && v.id_vehiculo) {
                ImageCacheStore.setVehiclePhoto(v.id_vehiculo, f);
              }
              return {
                ...v,
                foto_url: f || ImageCacheStore.getVehiclePhoto(v.id_vehiculo) || null,
              };
            }) as VehiculoRow[];
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
      TTL_SANCIONES,
      async () => {
        try {
          const queryParam = idVehiculo ? `?id_vehiculo=${idVehiculo}&limit=20` : '?limit=20';
          const data = await fetchJson(`/sanciones${queryParam}`);
          if (Array.isArray(data)) {
            if (idVehiculo) {
              return data.filter((s: any) => Number(s.id_vehiculo) === Number(idVehiculo));
            }
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
