import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Database } from '../types/database';

// Supabase project credentials for Las Palomas HOA
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://iocpmwzyvkangytybcwh.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'TU_ANON_KEY_AQUI';

// Storage adapter safe across Web, iOS, Android
const customStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      await AsyncStorage.setItem(key, value);
    } catch { }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      await AsyncStorage.removeItem(key);
    } catch { }
  },
};

export const isSupabaseConfigured = (): boolean => {
  return (
    !!SUPABASE_URL &&
    !!SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== 'TU_ANON_KEY_AQUI'
  );
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: (process.env.EXPO_PUBLIC_SUPABASE_SCHEMA as any) || 'control_acceso',
  },
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'x-client-info': 'las-palomas-agente-mobile/1.0',
    },
  },
});

// Proyecciones de columnas optimizadas para evitar SELECT * y reducir el consumo de Egress
export const PROJECTIONS = {
  CATALOGO_INFRACCIONES: 'id_infraccion, id_reglamento, codigo, nombre, descripcion, categoria, activo',
  REGLAMENTOS: 'id_reglamento, version, titulo, archivo_url, fecha_publicacion, vigente, created_at',
  REGLAS_REINCIDENCIA: 'id_regla, numero_falta, permite_acceso, requiere_administrador, mensaje_alerta, horas_suspension, activo',
  USUARIOS_LIGHT: 'id_usuario, nombre, correo, id_rol, activo',
  VEHICULOS_LIGHT: 'id_vehiculo, id_empresa, marca, modelo, a\u00f1o, placas, color, foto_url, estatus_acceso',
  CORBATINES_LIGHT: 'id_corbatin, id_vehiculo, numero, qr_token, fecha_emision, fecha_vencimiento, estatus',
  SANCIONES_LIGHT: 'id_sancion, id_reporte, id_vehiculo, id_empresa, id_regla, numero_reincidencia, fecha_inicio, fecha_fin, estatus, motivo, created_at, updated_at',
  BITACORA_LIGHT: 'id_acceso, id_caseta, id_vehiculo, id_corbatin, id_conductor, id_usuario, fecha, hora_entrada, hora_salida, estatus_acceso, created_at, updated_at',
  REPORTES_COUNT_ONLY: 'id_reporte',
} as const;

