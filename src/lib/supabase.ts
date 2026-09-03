import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Database } from '../types/database';

// Supabase project credentials for Las Palomas HOA
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://iocpmwzyvkangytybcwh.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'TU_ANON_KEY_AQUI';

// Storage adapter safe across Web, iOS, Android
const customStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  },
};

export const SUPABASE_SCHEMA =
  process.env.EXPO_PUBLIC_SUPABASE_SCHEMA || 'control_acceso';

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
});

