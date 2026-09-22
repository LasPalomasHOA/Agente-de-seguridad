// Servicio de Conexión Unificado a PostgreSQL (Vía API Express)
import { ApiService, CorbatinLookupResult, API_BASE_URL, getEvidenciaFoto, getVehiculoFoto } from './apiService';
import { comprimirImagen, uploadEvidenciaASupabase } from './imageService';

export type { CorbatinLookupResult };
export { API_BASE_URL, getEvidenciaFoto, getVehiculoFoto, comprimirImagen, uploadEvidenciaASupabase };

export const SupabaseService = {
    ...ApiService,
    getEvidenciaFoto,
    getVehiculoFoto,
    comprimirImagen,
    uploadEvidenciaASupabase,
};

export default SupabaseService;