// Servicio de Conexión Unificado a PostgreSQL (Vía API Express)
import { ApiService, CorbatinLookupResult, API_BASE_URL, getEvidenciaFoto } from './apiService';

export type { CorbatinLookupResult };
export { API_BASE_URL, getEvidenciaFoto };

export const SupabaseService = {
    ...ApiService,
    getEvidenciaFoto,
};

export default SupabaseService;