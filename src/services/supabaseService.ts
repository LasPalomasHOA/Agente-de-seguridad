// Servicio de Conexión Unificado a PostgreSQL (Vía API Express)
import { ApiService, CorbatinLookupResult, API_BASE_URL, getEvidenciaFoto, getVehiculoFoto } from './apiService';

export type { CorbatinLookupResult };
export { API_BASE_URL, getEvidenciaFoto, getVehiculoFoto };

export const SupabaseService = {
    ...ApiService,
    getEvidenciaFoto,
    getVehiculoFoto,
};

export default SupabaseService;