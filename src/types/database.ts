export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: RolRow;
        Insert: Omit<RolRow, 'id_rol'> & { id_rol?: number };
        Update: Partial<RolRow>;
      };
      empresas: {
        Row: EmpresaRow;
        Insert: Omit<EmpresaRow, 'id_empresa' | 'created_at' | 'updated_at'> & {
          id_empresa?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<EmpresaRow>;
      };
      usuarios: {
        Row: UsuarioRow;
        Insert: Omit<UsuarioRow, 'id_usuario' | 'created_at' | 'updated_at'> & {
          id_usuario?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<UsuarioRow>;
      };
      trabajadores: {
        Row: TrabajadorRow;
        Insert: Omit<TrabajadorRow, 'id_trabajador' | 'created_at' | 'updated_at'> & {
          id_trabajador?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<TrabajadorRow>;
      };
      vehiculos: {
        Row: VehiculoRow;
        Insert: Omit<VehiculoRow, 'id_vehiculo' | 'created_at' | 'updated_at'> & {
          id_vehiculo?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<VehiculoRow>;
      };
      conductores_vehiculos: {
        Row: ConductorVehiculoRow;
        Insert: Omit<ConductorVehiculoRow, 'id_relacion'> & { id_relacion?: number };
        Update: Partial<ConductorVehiculoRow>;
      };
      casetas: {
        Row: CasetaRow;
        Insert: Omit<CasetaRow, 'id_caseta'> & { id_caseta?: number };
        Update: Partial<CasetaRow>;
      };
      corbatines: {
        Row: CorbatinRow;
        Insert: Omit<CorbatinRow, 'id_corbatin' | 'fecha_emision'> & {
          id_corbatin?: number;
          fecha_emision?: string;
        };
        Update: Partial<CorbatinRow>;
      };
      bitacora_accesos: {
        Row: BitacoraAccesoRow;
        Insert: Omit<BitacoraAccesoRow, 'id_acceso' | 'fecha' | 'created_at' | 'updated_at'> & {
          id_acceso?: number;
          fecha?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<BitacoraAccesoRow>;
      };
      reglamentos: {
        Row: ReglamentoRow;
        Insert: Omit<ReglamentoRow, 'id_reglamento' | 'created_at'> & {
          id_reglamento?: number;
          created_at?: string;
        };
        Update: Partial<ReglamentoRow>;
      };
      aceptaciones_reglamento: {
        Row: AceptacionReglamentoRow;
        Insert: Omit<AceptacionReglamentoRow, 'id_aceptacion' | 'fecha_hora'> & {
          id_aceptacion?: number;
          fecha_hora?: string;
        };
        Update: Partial<AceptacionReglamentoRow>;
      };
      catalogo_infracciones: {
        Row: CatalogoInfraccionRow;
        Insert: Omit<CatalogoInfraccionRow, 'id_infraccion'> & { id_infraccion?: number };
        Update: Partial<CatalogoInfraccionRow>;
      };
      reglas_reincidencia: {
        Row: ReglaReincidenciaRow;
        Insert: Omit<ReglaReincidenciaRow, 'id_regla'> & { id_regla?: number };
        Update: Partial<ReglaReincidenciaRow>;
      };
      reportes_infracciones: {
        Row: ReporteInfraccionDbRow;
        Insert: Omit<ReporteInfraccionDbRow, 'id_reporte' | 'fecha_hora' | 'created_at' | 'updated_at'> & {
          id_reporte?: number;
          fecha_hora?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ReporteInfraccionDbRow>;
      };
      evidencias: {
        Row: EvidenciaDbRow;
        Insert: Omit<EvidenciaDbRow, 'id_evidencia' | 'fecha_captura'> & {
          id_evidencia?: number;
          fecha_captura?: string;
        };
        Update: Partial<EvidenciaDbRow>;
      };
      revisiones_reportes: {
        Row: RevisionReporteRow;
        Insert: Omit<RevisionReporteRow, 'id_revision' | 'fecha_revision'> & {
          id_revision?: number;
          fecha_revision?: string;
        };
        Update: Partial<RevisionReporteRow>;
      };
      sanciones: {
        Row: SancionDbRow;
        Insert: Omit<SancionDbRow, 'id_sancion' | 'fecha_inicio' | 'created_at' | 'updated_at'> & {
          id_sancion?: number;
          fecha_inicio?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<SancionDbRow>;
      };
    };
  };
}

// 1. ROLES
export interface RolRow {
  id_rol: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

// 2. EMPRESAS
export interface EmpresaRow {
  id_empresa: number;
  razon_social: string;
  responsable_nombre: string;
  telefono: string;
  correo: string | null;
  estatus: string; // 'activa' | 'suspendida' | 'inactiva'
  created_at: string;
  updated_at: string;
}

// 3. USUARIOS
export interface UsuarioRow {
  id_usuario: number;
  id_empresa: number | null;
  id_rol: number;
  nombre: string;
  correo: string;
  password_hash: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// 4. TRABAJADORES
export interface TrabajadorRow {
  id_trabajador: number;
  id_empresa: number;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  foto_url: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// 5. VEHICULOS
export interface VehiculoRow {
  id_vehiculo: number;
  id_empresa: number;
  marca: string;
  modelo: string;
  año: number;
  placas: string;
  color: string;
  foto_url: string | null;
  estatus_acceso: string; // 'permitido' | 'denegado' | 'condicionado' | 'suspendido'
  created_at: string;
  updated_at: string;
}

// 6. CONDUCTORES_VEHICULOS
export interface ConductorVehiculoRow {
  id_relacion: number;
  id_vehiculo: number;
  id_trabajador: number;
  activo: boolean;
}

// 7. CASETAS
export interface CasetaRow {
  id_caseta: number;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
}

// 8. CORBATINES
export interface CorbatinRow {
  id_corbatin: number;
  id_vehiculo: number;
  numero: number;
  qr_token: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  estatus: 'activo' | 'suspendido' | 'vencido' | 'cancelado' | 'extraviado';
  fecha_impresion: string | null;
  motivo_cancelacion: string | null;
}

// 9. BITACORA_ACCESOS
export interface BitacoraAccesoRow {
  id_acceso: number;
  id_caseta: number;
  id_vehiculo: number;
  id_corbatin: number | null;
  id_conductor: number | null;
  id_usuario: number; // Agente que registró
  fecha: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  ubicacion_trabajo: string | null;
  estatus_acceso: 'permitido' | 'denegado' | 'salida' | 'forzado';
  motivo_rechazo: string | null;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

// 10. REGLAMENTOS
export interface ReglamentoRow {
  id_reglamento: number;
  version: string;
  titulo: string;
  archivo_url: string;
  fecha_publicacion: string;
  vigente: boolean;
  created_at: string;
}

// 11. ACEPTACIONES_REGLAMENTO
export interface AceptacionReglamentoRow {
  id_aceptacion: number;
  id_reglamento: number;
  id_empresa: number;
  id_usuario: number;
  aceptado: boolean;
  fecha_hora: string;
  firma_nombre: string | null;
}

// 12. CATALOGO_INFRACCIONES
export interface CatalogoInfraccionRow {
  id_infraccion: number;
  id_reglamento: number;
  codigo: string; // ej: 'EST-01', 'SEG-02'
  nombre: string;
  descripcion: string;
  categoria: string; // 'Estacionamiento', 'Seguridad', 'Velocidad', 'Convivencia', etc.
  activo: boolean;
}

// 13. REGLAS_REINCIDENCIA
export interface ReglaReincidenciaRow {
  id_regla: number;
  numero_falta: number;
  permite_acceso: boolean;
  requiere_administrador: boolean;
  mensaje_alerta: string;
  activo: boolean;
}

// 14. REPORTES_INFRACCIONES
export interface ReporteInfraccionDbRow {
  id_reporte: number;
  id_vehiculo: number;
  id_corbatin: number | null;
  id_infraccion: number;
  id_usuario: number; // Agente que emite
  fecha_hora: string;
  ubicacion_texto: string | null;
  descripcion_hechos: string;
  estatus_revision: 'pendiente' | 'en_revision' | 'aprobada' | 'rechazada' | 'anulada';
  created_at: string;
  updated_at: string;
}

// 15. EVIDENCIAS
export interface EvidenciaDbRow {
  id_evidencia: number;
  id_reporte: number;
  archivo: string; // URL de la foto / video en Supabase Storage
  descripcion: string | null;
  fecha_captura: string;
  id_usuario: number;
  hash_archivo: string | null;
  activa: boolean;
}

// 16. REVISIONES_REPORTES
export interface RevisionReporteRow {
  id_revision: number;
  id_reporte: number;
  id_usuario: number;
  decision: 'aprobado' | 'rechazado' | 'solicitar_info';
  comentarios: string | null;
  fecha_revision: string;
  nivel_reincidencia_aplicado: number | null;
}

// 17. SANCIONES
export interface SancionDbRow {
  id_sancion: number;
  id_reporte: number;
  id_vehiculo: number;
  id_empresa: number;
  id_regla: number;
  numero_reincidencia: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  estatus: 'activa' | 'cumplida' | 'revocada' | 'apelada';
  motivo: string;
  id_usuario: number;
  created_at: string;
  updated_at: string;
}
