// Servicio de Conexión Unificado a PostgreSQL (Vía API Express)
import { ApiService, CorbatinLookupResult, API_BASE_URL } from './apiService';

export type { CorbatinLookupResult };
export { API_BASE_URL };
export const SupabaseService = ApiService;
export default ApiService;
