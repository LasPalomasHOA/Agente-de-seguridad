import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobile } from '../context/MobileContext';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ResortHeader } from '../components/resort-header';
import { Select } from '../components/ui/select';
import { SupabaseService, CorbatinLookupResult } from '../services/supabaseService';
import { VehiculoRow, CorbatinRow, EmpresaRow, TrabajadorRow, CatalogoInfraccionRow, SancionDbRow, BitacoraAccesoRow } from '../types/database';
import { Evidencia } from '../types/evidencia';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';

type Mode = 'camera' | 'loading' | 'result' | 'wizard' | 'confirmation';
type WizardStep = 1 | 2 | 3;

const { width } = Dimensions.get('window');

const SAMPLE_EVIDENCIA_PHOTOS = [
  'https://images.unsplash.com/photo-1508962914676-134849a727f0?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&q=80&w=600',
  'https://images.unsplash.com/photo-1590674899484-d5640e854abe?auto=format&fit=crop&q=80&w=600',
];

const INFRACTION_CATEGORIES = [
  { id: 'estacionamiento', name: 'Estacionamiento', icon: 'car-outline', defaultCode: 'INF-04' },
  { id: 'epp', name: 'EPP Ausente', icon: 'construct-outline', defaultCode: 'INF-03' },
  { id: 'horario', name: 'Fuera de Horario', icon: 'time-outline', defaultCode: 'INF-02' },
  { id: 'velocidad', name: 'Exceso Velocidad', icon: 'speedometer-outline', defaultCode: 'INF-01' },
  { id: 'corbatin', name: 'Sin Corbatín QR', icon: 'qr-code-outline', defaultCode: 'INF-05' },
  { id: 'escombros', name: 'Escombros/Basura', icon: 'trash-outline', defaultCode: 'INF-06' },
];

const formatHora = (timeStr?: string | null): string | null => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const clean = timeStr.trim();
  if (!clean || clean === 'null' || clean === 'undefined') return null;

  // 1. Si es un ISO String UTC completo (ej: "2026-09-14T19:48:00.000Z")
  if (clean.includes('T') || clean.endsWith('Z')) {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }

  // 2. Si viene como timestamp SQL con espacio (ej: "2026-09-14 19:48:00")
  if (clean.includes('-') && clean.includes(' ')) {
    const d = new Date(clean.replace(' ', 'T') + 'Z');
    if (!isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }

  // 3. Si viene únicamente como formato TIME ("19:48:00" o "12:48:00")
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    let hour = parseInt(match[1], 10);
    const min = match[2];

    // Si la hora viene inflada en UTC (ej: 19 o más tarde) respecto a la hora local actual
    const currentLocalHour = new Date().getHours();
    if (hour - currentLocalHour >= 5) {
      hour = hour - 7;
      if (hour < 0) hour += 24;
    }

    return `${String(hour).padStart(2, '0')}:${min}`;
  }

  return null;
};

export const parseSqlUtcDate = (dateStr?: string | null): number => {
  if (!dateStr || typeof dateStr !== 'string') return Date.now();
  let clean = dateStr.trim();
  if (!clean || clean === 'null' || clean === 'undefined') return Date.now();

  // 1. Si viene con espacio entre fecha y hora (ej: "2026-09-15 12:27:45.272-07" o "2026-09-15 19:27:45"), normalizar espacio a 'T'
  if (clean.includes(' ') && clean.includes('-')) {
    clean = clean.replace(' ', 'T');
  }

  // 2. Si el offset de zona horaria es de 2 dígitos sin minutos (ej: "-07" o "+00" al final), normalizar a "-07:00" o "+00:00"
  clean = clean.replace(/([+-]\d{2})$/, '$1:00');

  // 3. Si no trae zona horaria explícita (+HH:MM, -HH:MM ni Z), los timestamps de SQL/PostgreSQL representan UTC, por lo que agregamos 'Z'
  if (!clean.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(clean)) {
    clean = clean + 'Z';
  }

  // 4. Intentar parseo estándar con ISO 8601 normalizado
  const ms = new Date(clean).getTime();
  if (!isNaN(ms)) {
    return ms;
  }

  return Date.now();
};

export default function ScannerScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme();
  const { agregarReporte, catalogoInfracciones, agenteActual } = useMobile();

  // Navigation / Mode states
  const [mode, setMode] = useState<Mode>('camera');
  const [loadingText, setLoadingText] = useState('Consultando información del vehículo...');
  const [selectedVehicle, setSelectedVehicle] = useState<VehiculoRow | null>(null);
  const [selectedCorbatin, setSelectedCorbatin] = useState<CorbatinRow | null>(null);
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaRow | null>(null);
  const [selectedConductor, setSelectedConductor] = useState<TrabajadorRow | null>(null);
  const [sancionesActivas, setSancionesActivas] = useState<SancionDbRow[]>([]);
  const [ultimoAcceso, setUltimoAcceso] = useState<BitacoraAccesoRow | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [exitSuccessModal, setExitSuccessModal] = useState<{
    visible: boolean;
    horaSalida?: string;
    horaEntrada?: string;
    duracion?: string;
  } | null>(null);

  // Camera & Permissions states
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState<boolean>(false);
  const [scanned, setScanned] = useState<boolean>(false);

  // Manual input state on scanner screen
  const [manualCorbatinInput, setManualCorbatinInput] = useState('');
  const [laserAnim] = useState(new Animated.Value(0));
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Wizard state (3 steps)
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('seguridad');
  const [selectedInfraccion, setSelectedInfraccion] = useState<CatalogoInfraccionRow | null>(() => catalogoInfracciones[0] || null);
  const [lugar, setLugar] = useState('Estacionamiento Norte');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [hora, setHora] = useState(new Date().toTimeString().split(' ')[0].substring(0, 5));
  const [descripcion, setDescripcion] = useState('');

  // Step 2: Photos
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [photoCount, setPhotoCount] = useState(0);

  // Step 3: Confirmation
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatedFolio, setGeneratedFolio] = useState('');
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Ticker to dynamically recalculate remaining suspension time in real-time
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Sync default infraccion when catalog loads
  useEffect(() => {
    if (catalogoInfracciones && catalogoInfracciones.length > 0 && !selectedInfraccion) {
      setSelectedInfraccion(catalogoInfracciones[0]);
    }
  }, [catalogoInfracciones, selectedInfraccion]);

  const isAccesoToday = React.useMemo(() => {
    if (!ultimoAcceso) return false;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const fechaStr =
      ultimoAcceso.fecha ||
      (ultimoAcceso.created_at ? ultimoAcceso.created_at.split('T')[0] : '');

    return !!fechaStr && fechaStr.startsWith(todayStr);
  }, [ultimoAcceso]);

  const isVehicleInside = React.useMemo(() => {
    if (!ultimoAcceso || !isAccesoToday) return false;
    const hasEntered = !!ultimoAcceso.hora_entrada;
    const hasNotExited = !ultimoAcceso.hora_salida && ultimoAcceso.estatus_acceso !== 'salida';
    return hasEntered && hasNotExited;
  }, [ultimoAcceso, isAccesoToday]);

  const tiempoEstancia = React.useMemo(() => {
    if (!ultimoAcceso?.hora_entrada) return '';
    const timeVal = formatHora(ultimoAcceso.hora_entrada);
    if (!timeVal) return '';

    try {
      const parts = timeVal.split(':');
      if (parts.length >= 2) {
        const entryHour = parseInt(parts[0], 10);
        const entryMin = parseInt(parts[1], 10);
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        let totalMinutes = (currentHour * 60 + currentMin) - (entryHour * 60 + entryMin);
        // Si cruzó la medianoche
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        if (totalMinutes < 1) return 'Menos de 1 min';
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins} min`;
      }
    } catch { }
    return '';
  }, [ultimoAcceso]);

  const handleMarcarSalida = async () => {
    if (!selectedVehicle) return;
    setActionLoading(true);
    try {
      const officerId = parseInt(agenteActual?.id?.replace(/\D/g, '') || '1', 10) || 1;
      const res = await SupabaseService.registrarSalidaVehiculo({
        idAcceso: ultimoAcceso?.id_acceso,
        idVehiculo: selectedVehicle.id_vehiculo,
        idUsuario: officerId,
        idCorbatin: selectedCorbatin?.id_corbatin,
      });

      if (res && res.success) {
        const salidaFmt = formatHora(res.horaSalida) || res.horaSalida.substring(0, 5);
        const entradaFmt = formatHora(ultimoAcceso?.hora_entrada) || undefined;
        setExitSuccessModal({
          visible: true,
          horaSalida: salidaFmt,
          horaEntrada: entradaFmt,
          duracion: tiempoEstancia || 'Estancia concluida',
        });
        setUltimoAcceso((prev) =>
          prev ? { ...prev, hora_salida: res.horaSalida, estatus_acceso: 'salida' } : null
        );
      } else {
        alert('No se pudo registrar la salida. Intente de nuevo.');
      }
    } catch (e: any) {
      alert(`Error al registrar salida: ${e?.message || 'Error de conexión'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegistrarEntrada = async () => {
    if (!selectedVehicle) return;
    setActionLoading(true);
    try {
      const officerId = parseInt(agenteActual?.id?.replace(/\D/g, '') || '1', 10) || 1;
      const res = await SupabaseService.registrarEntradaVehiculo({
        idVehiculo: selectedVehicle.id_vehiculo,
        idCorbatin: selectedCorbatin?.id_corbatin,
        idConductor: selectedConductor?.id_trabajador || null,
        idUsuario: officerId,
      });

      if (res && res.success && res.acceso) {
        setUltimoAcceso(res.acceso);
        const horaFmt = formatHora(res.acceso.hora_entrada) || '';
        alert(`¡Entrada autorizada y registrada a las ${horaFmt} hrs!`);
      }
    } catch (e: any) {
      alert(`Error al registrar entrada: ${e?.message || 'Error de conexión'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const lookupInProgress = React.useRef(false);
  const lastScanTimeRef = React.useRef<number>(0);

  const executeLookup = async (code: string) => {
    const cleanCode = (code || '').trim();
    if (!cleanCode) return;
    if (lookupInProgress.current) return;
    lookupInProgress.current = true;

    setLoadingText('Consultando base de datos HOA...');
    setMode('loading');
    try {
      const res = await SupabaseService.buscarCorbatin(cleanCode);
      if (res && res.vehiculo) {
        // Si el vehículo no trae foto en memoria, pedirla de forma puntual y cacheada
        if (!res.vehiculo.foto_url && res.vehiculo.id_vehiculo) {
          const foto = await SupabaseService.getVehiculoFoto(res.vehiculo.id_vehiculo);
          if (foto) {
            res.vehiculo.foto_url = foto;
          }
        }

        setSelectedVehicle(res.vehiculo);
        setSelectedCorbatin(res.corbatin);
        setSelectedEmpresa(res.empresa);
        setSelectedConductor(res.conductorPrincipal || null);
        setSancionesActivas(res.sancionesActivas || []);
        setUltimoAcceso(res.ultimoAcceso || null);
        setMode('result');
      } else {
        alert(`No se encontró vehículo ni corbatín con "${cleanCode}" en la base de datos.`);
        setMode('camera');
        setScanned(false);
      }
    } catch (e) {
      alert('Error de conexión con la base de datos.');
      setMode('camera');
      setScanned(false);
    } finally {
      lookupInProgress.current = false;
    }
  };

  // Handle incoming deep links (e.g. from index.tsx)
  useEffect(() => {
    if (params.corbatinNumero) {
      const codeParam = Array.isArray(params.corbatinNumero)
        ? params.corbatinNumero[0]
        : (params.corbatinNumero as string);
      if (codeParam && codeParam.trim()) {
        executeLookup(codeParam.trim());
      }
    }
  }, [params.corbatinNumero]);

  // Reset scanned state when returning to camera mode
  useEffect(() => {
    if (mode === 'camera') {
      setScanned(false);
      lookupInProgress.current = false;
    }
  }, [mode]);

  const handleBarcodeScanned = ({ data }: { data: string; type?: string }) => {
    const now = Date.now();
    // Bloquea ráfagas de frames si ocurrieron hace menos de 2500 ms o si ya hay petición activa
    if (now - lastScanTimeRef.current < 2500 || lookupInProgress.current || !data || mode !== 'camera') {
      return;
    }

    lastScanTimeRef.current = now;
    setScanned(true);
    executeLookup(data);
  };

  // Animate laser line in camera mode
  useEffect(() => {
    if (mode === 'camera') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 180,
            duration: 1800,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [mode, laserAnim]);

  // Actions
  const handleManualSearch = (codeToSearch?: string) => {
    const target = codeToSearch || manualCorbatinInput;
    if (!target.trim()) return;
    executeLookup(target.trim());
  };

  const startReportWizard = () => {
    setStep(1);
    setSelectedCategory('estacionamiento');
    const defaultInf = catalogoInfracciones.find((i) => i.codigo === 'INF-04') || catalogoInfracciones[0] || {
      id_infraccion: 1,
      id_reglamento: 1,
      codigo: 'INF-04',
      nombre: 'Estacionamiento en áreas no autorizadas',
      descripcion: 'Bloquear banquetas, rampas o cajones de condóminos con unidades de trabajo',
      categoria: 'VEHÍCULOS',
      activo: true,
    };
    setSelectedInfraccion(defaultInf);
    setDescripcion('');
    setEvidencias([]);
    setPhotoCount(0);
    setConfirmed(false);
    setMode('wizard');
  };

  const handleAddPhotoSimulate = () => {
    if (evidencias.length >= 5) return;
    const nextPhotoUrl = SAMPLE_EVIDENCIA_PHOTOS[photoCount % SAMPLE_EVIDENCIA_PHOTOS.length];
    const newEvidencia: Evidencia = {
      id: `ev_${Date.now()}`,
      fotoUrl: nextPhotoUrl,
      fechaHora: new Date().toISOString(),
      isPrincipal: evidencias.length === 0,
      descripcion: 'Fotografía de evidencia levantada por oficial.',
    };
    setEvidencias([...evidencias, newEvidencia]);
    setPhotoCount(photoCount + 1);
  };

  const handleDeletePhoto = (id: string) => {
    setEvidencias(evidencias.filter((e) => e.id !== id));
  };

  const handleBackPress = () => {
    if (mode === 'camera' || mode === 'loading') {
      router.replace('/');
    } else if (mode === 'result') {
      setMode('camera');
    } else if (mode === 'wizard') {
      if (step > 1) {
        setStep((step - 1) as WizardStep);
      } else {
        setMode('result');
      }
    } else if (mode === 'confirmation') {
      router.replace('/');
    }
  };

  const submitReport = async () => {
    if (!selectedVehicle || !selectedInfraccion) return;
    setSubmitting(true);

    try {
      const folio = await agregarReporte(
        {
          vehiculoId: String(selectedVehicle.id_vehiculo),
          corbatinNumero: selectedCorbatin?.numero ? `C-${selectedCorbatin.numero}` : 'S/C',
          infraccionCodigo: selectedInfraccion.codigo,
          idVehiculo: Number(selectedVehicle.id_vehiculo),
          idCorbatin: selectedCorbatin?.id_corbatin && Number(selectedCorbatin.id_corbatin) > 0 ? Number(selectedCorbatin.id_corbatin) : null,
          idInfraccion: Number(selectedInfraccion.id_infraccion) || 1,
          lugar: lugar,
          descripcion: descripcion || 'Infracción reportada durante inspección de seguridad.',
          observaciones: 'Evidencias registradas desde el dispositivo de oficial.',
          evidencias: evidencias,
        },
        'pendiente'
      );

      setGeneratedFolio(folio);
      setMode('confirmation');
    } catch (err: any) {
      alert(`Error al registrar el reporte: ${err?.message || 'Error de conexión'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const evaluacionSancion = React.useMemo(() => {
    const estatusVehiculo = (selectedVehicle?.estatus_acceso || '').toLowerCase();
    const estatusCorbatin = (selectedCorbatin?.estatus || '').toLowerCase();

    if (
      estatusCorbatin === 'cancelado' ||
      estatusCorbatin === 'suspendido' ||
      estatusVehiculo === 'denegado' ||
      estatusVehiculo === 'restringido' ||
      estatusVehiculo === 'bloqueado'
    ) {
      return {
        isBlocked: true,
        isWarning: false,
        level: 4,
        levelTitle: 'ACCESO RESTRINGIDO PERMANENTE',
        levelBadge: 'LISTA NEGRA',
        levelName: 'Nivel 4 - Lista Negra Permanente',
        motivo: selectedCorbatin?.motivo_cancelacion || 'Acceso restringido permanentemente por administración HOA.',
        timeRemainingText: 'Permanente',
        fechaFinText: 'Permanente (Requiere Administrador)',
        requiresAdmin: true,
        badgeBg: '#991B1B',
      };
    }

    if (!sancionesActivas || sancionesActivas.length === 0) {
      return null;
    }

    // Tomar la sanción activa más relevante (mayor nivel o más reciente)
    const sancion = [...sancionesActivas].sort(
      (a, b) => (Number(b.numero_reincidencia) || Number(b.id_regla) || 1) - (Number(a.numero_reincidencia) || Number(a.id_regla) || 1)
    )[0];
    const nivel = Number(sancion.numero_reincidencia) || Number(sancion.id_regla) || 1;
    const ahoraMs = nowTick;
    const fechaInicioMs = parseSqlUtcDate(sancion.fecha_inicio || (sancion as any).created_at);

    // ─── 1ª FALTA: Llamado de atención (Banner amarillo informativo, acceso permitido) ───
    if (nivel === 1) {
      return {
        isBlocked: false,
        isWarning: true,
        level: 1,
        levelTitle: '1ª Falta: Llamado de Atención',
        levelBadge: '1ª FALTA',
        levelName: '1ª Falta - Llamado de Atención',
        motivo: sancion.motivo || 'Primer llamado de atención registrado en el sistema.',
        timeRemainingText: 'Informativo',
        fechaFinText: 'Acceso Permitido',
        requiresAdmin: false,
        badgeBg: '#F59E0B',
      };
    }

    // ─── 2ª FALTA: Suspensión temporal de 24 horas (1 Día) ───
    if (nivel === 2) {
      const fechaFinMs = fechaInicioMs + 24 * 60 * 60 * 1000;

      if (ahoraMs < fechaFinMs) {
        const diffMs = fechaFinMs - ahoraMs;
        const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
        const totalMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const timeRemainingText =
          totalHours > 0 ? `${totalHours}h ${totalMinutes}m restantes` : `${totalMinutes}m restantes`;

        return {
          isBlocked: true,
          isWarning: false,
          level: 2,
          levelTitle: 'SUSPENSIÓN TEMPORAL (24 HORAS)',
          levelBadge: 'SUSPENSIÓN 24H',
          levelName: '2ª Falta - Suspensión de 1 Día',
          motivo: sancion.motivo || 'Segunda infracción: suspensión vehicular reglamentaria por 24 horas.',
          timeRemainingText,
          fechaFinText: new Date(fechaFinMs).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
          requiresAdmin: false,
          badgeBg: '#EA580C',
        };
      }
      // Ya transcurrieron las 24 horas -> Suspensión expirada automáticamente
      return null;
    }

    // ─── 3ª FALTA: Suspensión de 1 semana (Bloqueo reglamentario de 7 días dinámico) ───
    if (nivel === 3) {
      const fechaFinMs = fechaInicioMs + 7 * 24 * 60 * 60 * 1000;

      if (ahoraMs < fechaFinMs) {
        const diffMs = fechaFinMs - ahoraMs;
        const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const totalHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const totalMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const timeRemainingText =
          totalDays > 0
            ? `${totalDays}d ${totalHours}h restantes`
            : totalHours > 0
              ? `${totalHours}h ${totalMinutes}m restantes`
              : `${totalMinutes}m restantes`;

        return {
          isBlocked: true,
          isWarning: false,
          level: 3,
          levelTitle: 'SUSPENSIÓN TEMPORAL (7 DÍAS)',
          levelBadge: 'SUSPENSIÓN 7 DÍAS',
          levelName: '3ª Falta - Suspensión de 1 Semana',
          motivo: sancion.motivo || 'Tercera infracción: suspensión vehicular reglamentaria por 7 días.',
          timeRemainingText,
          fechaFinText: new Date(fechaFinMs).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
          requiresAdmin: false,
          badgeBg: '#DC2626',
        };
      }
      // Ya transcurrieron los 7 días -> Suspensión expirada automáticamente
      return null;
    }

    // ─── 4ª FALTA O MÁS: Acceso restringido permanente (Lista Negra) ───
    return {
      isBlocked: true,
      isWarning: false,
      level: nivel >= 4 ? nivel : 4,
      levelTitle: 'ACCESO RESTRINGIDO PERMANENTE',
      levelBadge: 'LISTA NEGRA',
      levelName: `Nivel ${nivel} - Lista Negra Permanente`,
      motivo: sancion.motivo || 'Acceso vehicular restringido permanentemente por reincidencia.',
      timeRemainingText: 'Permanente',
      fechaFinText: 'Indefinido (Requiere Comité HOA)',
      requiresAdmin: true,
      badgeBg: '#991B1B',
    };
  }, [selectedVehicle, selectedCorbatin, sancionesActivas, nowTick]);

  const isSuspended = !!evaluacionSancion?.isBlocked;
  const hasWarningLevel1 = !!evaluacionSancion?.isWarning;

  return (
    <View style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
      {/* ─── 1. CAMERA VIEW (Image 1 Right) ─── */}
      {mode === 'camera' && (
        <ScrollView contentContainerStyle={styles.scrollPage} showsVerticalScrollIndicator={false}>
          {/* ─── ANIMATED RESORT HEADER ─── */}
          <ResortHeader
            title="Verificación de Acceso"
            subtitle="Escanee el código QR del corbatín o ingrese el número."
            rightElement={
              <View style={styles.miniResortTagBadge}>
                <ThemedText style={styles.miniResortTagText}>
                  {permission?.granted ? 'Cámara Activa' : 'Cámara'}
                </ThemedText>
              </View>
            }
          />

          {/* Camera Viewfinder Box */}
          <View style={styles.viewfinderDarkBox}>
            {!permission ? (
              <View style={styles.cameraLoadingBox}>
                <ActivityIndicator size="large" color="#10B981" />
                <ThemedText style={styles.cameraLoadingText}>Inicializando sensor de cámara...</ThemedText>
              </View>
            ) : !permission.granted ? (
              /* Permisos requeridos */
              <View style={styles.permissionCard}>
                <View style={styles.permissionIconCircle}>
                  <Ionicons name="camera" size={32} color="#10B981" />
                </View>
                <ThemedText style={styles.permissionTitle}>Permiso de Cámara Requerido</ThemedText>
                <ThemedText style={styles.permissionDesc}>
                  Para escanear corbatines QR en tiempo real, autorice el acceso a la cámara de su dispositivo.
                </ThemedText>
                <Pressable
                  onPress={requestPermission}
                  style={({ pressed }) => [
                    styles.grantPermissionBtn,
                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Ionicons name="shield-checkmark" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <ThemedText style={styles.grantPermissionBtnText}>Conceder Permiso</ThemedText>
                </Pressable>
              </View>
            ) : (
              /* Cámara en vivo con HUD */
              <View style={styles.cameraFrameWrapper}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  enableTorch={torch}
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                  }}
                  onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                />

                {/* Camera Top Controls Bar */}
                <View style={styles.cameraTopControls}>
                  <View style={styles.liveBadgePill}>
                    <View style={styles.liveBlinkingDot} />
                    <ThemedText style={styles.liveBadgeText}>EN VIVO</ThemedText>
                  </View>

                  <View style={styles.cameraActionsRow}>
                    {/* Torch toggle */}
                    <Pressable
                      onPress={() => setTorch(!torch)}
                      style={[
                        styles.cameraControlCircleBtn,
                        torch && { backgroundColor: '#F59E0B', borderColor: '#FDE68A' },
                      ]}
                    >
                      <Ionicons
                        name={torch ? 'flashlight' : 'flashlight-outline'}
                        size={18}
                        color={torch ? '#0F172A' : '#ffffff'}
                      />
                    </Pressable>

                    {/* Facing toggle */}
                    <Pressable
                      onPress={() => setFacing((prev) => (prev === 'back' ? 'front' : 'back'))}
                      style={styles.cameraControlCircleBtn}
                    >
                      <Ionicons name="camera-reverse-outline" size={18} color="#ffffff" />
                    </Pressable>
                  </View>
                </View>

                {/* Focus Target Frame */}
                <View style={styles.focusFrame}>
                  <Animated.View
                    style={[
                      styles.laserLine,
                      { backgroundColor: '#10B981', shadowColor: '#10B981', transform: [{ translateY: laserAnim }] },
                    ]}
                  />
                  {/* Emerald Green Corner Brackets */}
                  <View style={[styles.cornerBracket, styles.bracketTL, { borderColor: '#10B981' }]} />
                  <View style={[styles.cornerBracket, styles.bracketTR, { borderColor: '#10B981' }]} />
                  <View style={[styles.cornerBracket, styles.bracketBL, { borderColor: '#10B981' }]} />
                  <View style={[styles.cornerBracket, styles.bracketBR, { borderColor: '#10B981' }]} />
                </View>

                {/* Bottom Instructions inside Camera */}
                <View style={styles.cameraBottomPill}>
                  <ThemedText style={styles.cameraBottomPillText}>
                    Alinee el código QR dentro del recuadro
                  </ThemedText>
                </View>
              </View>
            )}
          </View>

          {/* Manual Input Card */}
          <View style={styles.manualEntryCard}>
            <ThemedText style={styles.manualEntryHeading}>Ingresar manualmente</ThemedText>
            <ThemedText style={styles.manualEntryLabel}>Número de Corbatín o Placas</ThemedText>
            <View style={styles.manualEntryRow}>
              <TextInput
                value={manualCorbatinInput}
                onChangeText={setManualCorbatinInput}
                placeholder="Ej. C-102 o 70"
                placeholderTextColor="#94a3b8"
                style={styles.manualTextInput}
                autoCapitalize="characters"
                onSubmitEditing={() => handleManualSearch()}
              />
              <Pressable
                onPress={() => handleManualSearch()}
                style={({ pressed }) => [
                  styles.manualSearchButton,
                  { backgroundColor: '#0D6E5F' },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <ThemedText style={[styles.manualSearchButtonText, { color: '#ffffff' }]}>
                  Buscar
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ─── 2. LOADING STATE ─── */}
      {mode === 'loading' && (
        <View style={styles.loadingCenterContainer}>
          <ActivityIndicator size="large" color="#0D6E5F" />
          <ThemedText style={styles.loadingTextLabel}>{loadingText}</ThemedText>
        </View>
      )}

      {/* ─── 3. VEHICLE IDENTIFIED VIEW (Image 4 Left & Right) ─── */}
      {mode === 'result' && selectedVehicle && selectedCorbatin && (
        <ScrollView contentContainerStyle={styles.scrollPage} showsVerticalScrollIndicator={false}>
          {isSuspended ? (
            /* ─── ACCESO DENEGADO / SUSPENDIDO VIEW ─── */
            <View style={{ gap: 16 }}>
              {/* Top Dynamic Alert Full-Width Banner */}
              <View style={[styles.accessDeniedTopBanner, { backgroundColor: evaluacionSancion?.badgeBg || '#DC2626' }]}>
                <View style={styles.accessDeniedIconBadge}>
                  <Ionicons name={evaluacionSancion?.requiresAdmin ? 'ban' : 'time'} size={18} color="#ffffff" />
                </View>
                <ThemedText style={styles.accessDeniedTopBannerText}>
                  {evaluacionSancion?.levelTitle || 'ACCESO DENEGADO'}
                </ThemedText>
              </View>

              {/* Sub-bar with Volver */}
              <View style={styles.subHeaderBar}>
                <Pressable onPress={handleBackPress} style={styles.volverBtn}>
                  <Ionicons name="arrow-back" size={16} color="#0f172a" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.volverBtnText}>VOLVER</ThemedText>
                </Pressable>
              </View>

              {/* Suspended Vehicle Card with Photo on Left */}
              <View style={styles.suspendedVehicleCard}>
                <View style={styles.suspendedPhotoCol}>
                  <Image
                    source={{ uri: selectedVehicle.foto_url || SAMPLE_EVIDENCIA_PHOTOS[1] }}
                    style={styles.suspendedPhotoImg}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.plateTagOverlay}>
                    <ThemedText style={styles.plateTagOverlayText}>{selectedVehicle.placas}</ThemedText>
                  </View>
                </View>

                <View style={styles.suspendedMetaCol}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <ThemedText style={styles.suspendedVehicleTitle}>
                      {selectedVehicle.marca} {selectedVehicle.modelo}
                    </ThemedText>
                    <View style={[styles.suspendedRedBadge, { backgroundColor: evaluacionSancion?.badgeBg ? evaluacionSancion.badgeBg + '18' : '#FEE2E2' }]}>
                      <View style={[styles.dotRed, { backgroundColor: evaluacionSancion?.badgeBg || '#DC2626' }]} />
                      <ThemedText style={[styles.suspendedRedBadgeText, { color: evaluacionSancion?.badgeBg || '#DC2626' }]}>
                        {evaluacionSancion?.levelBadge || 'SUSPENDIDO'}
                      </ThemedText>
                    </View>
                  </View>

                  <ThemedText style={styles.suspendedCompanyText}>
                    🏢 {selectedEmpresa?.razon_social || 'Constructora Integral del Noroeste S.A. de C.V.'}
                  </ThemedText>

                  <View style={styles.suspendedMiniGrid}>
                    <View style={styles.suspendedMiniBox}>
                      <ThemedText style={styles.dataLabel}>Conductor Asignado</ThemedText>
                      <ThemedText style={styles.dataValueSmall}>
                        👤 {selectedConductor ? `${selectedConductor.nombre} ${selectedConductor.apellidos}` : 'No Registrado'}
                      </ThemedText>
                    </View>
                    <View style={styles.suspendedMiniBox}>
                      <ThemedText style={styles.dataLabel}>Tipo de Pase</ThemedText>
                      <ThemedText style={styles.dataValueSmall}>📄 Contratista Acreditado</ThemedText>
                    </View>
                  </View>
                </View>
              </View>

              {/* Active Suspension Details Card */}
              <View style={styles.suspensionDetailCard}>
                <View style={styles.suspensionDetailHeader}>
                  <View style={[styles.gavelIconBox, { backgroundColor: evaluacionSancion?.badgeBg ? evaluacionSancion.badgeBg + '18' : '#FEE2E2' }]}>
                    <Ionicons name="hammer" size={18} color={evaluacionSancion?.badgeBg || '#DC2626'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.suspensionDetailHeading}>Detalles de Sanción Vigente</ThemedText>
                    <ThemedText style={styles.suspensionDetailSubHeading}>Medida disciplinaria y control de acceso</ThemedText>
                  </View>
                  <View style={[styles.statusActivePill, { backgroundColor: evaluacionSancion?.badgeBg ? evaluacionSancion.badgeBg + '18' : '#FEE2E2' }]}>
                    <ThemedText style={[styles.statusActivePillText, { color: evaluacionSancion?.badgeBg || '#DC2626' }]}>
                      VIGENTE
                    </ThemedText>
                  </View>
                </View>

                {/* Nivel de Falta Banner */}
                <View style={[styles.reincidenciaBanner, { backgroundColor: evaluacionSancion?.badgeBg ? evaluacionSancion.badgeBg + '12' : '#FFF7ED', borderColor: evaluacionSancion?.badgeBg ? evaluacionSancion.badgeBg + '35' : '#FED7AA' }]}>
                  <Ionicons name="warning" size={18} color={evaluacionSancion?.badgeBg || '#EA580C'} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.reincidenciaBannerLabel}>NIVEL DE FALTA APLICADO</ThemedText>
                    <ThemedText style={[styles.reincidenciaBannerTitle, { color: evaluacionSancion?.badgeBg || '#C2410C' }]}>
                      {evaluacionSancion?.levelName || '2ª Falta - Suspensión de 1 Día'}
                    </ThemedText>
                  </View>
                </View>

                {/* Motivo de Infracción Section */}
                <View style={styles.motifSection}>
                  <ThemedText style={styles.dataLabel}>MOTIVO DE INFRACCIÓN</ThemedText>
                  <View style={styles.motifBox}>
                    <Ionicons name="document-text-outline" size={16} color="#64748B" style={{ marginTop: 2, marginRight: 8 }} />
                    <ThemedText style={styles.motifText}>
                      {evaluacionSancion?.motivo || 'Falta a la normativa HOA.'}
                    </ThemedText>
                  </View>
                </View>

                {/* Término de Sanción */}
                <View style={styles.suspensionVencimientoRow}>
                  <View style={styles.vencimientoCol}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <Ionicons name="calendar-outline" size={13} color="#64748B" />
                      <ThemedText style={styles.dataLabel}>TÉRMINO DE SANCIÓN</ThemedText>
                    </View>
                    <ThemedText style={styles.suspensionVencimientoText}>
                      {evaluacionSancion?.fechaFinText || 'Activa'}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Action Button: REPORTAR NUEVA INFRACCIÓN */}
              <Pressable
                onPress={startReportWizard}
                style={({ pressed }) => [
                  styles.reportActionBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="add-circle" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <ThemedText style={styles.reportActionBtnText}>
                  REPORTAR NUEVA INFRACCIÓN
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            /* ─── VEHÍCULO IDENTIFICADO (HABILITADO) VIEW ─── */
            <View style={{ gap: 16 }}>
              {/* Header */}
              <View style={styles.identifiedHeaderRow}>
                <View style={styles.identifiedHeaderLeft}>
                  <Pressable onPress={handleBackPress} style={styles.backIconButton}>
                    <Ionicons name="arrow-back" size={20} color="#0f172a" />
                  </Pressable>
                  <View style={styles.identifiedTitleContainer}>
                    <ThemedText style={styles.screenMainTitle} numberOfLines={1}>
                      Corbatín #{selectedCorbatin.numero}
                    </ThemedText>
                    <ThemedText style={styles.screenSubTitle} numberOfLines={1}>
                      Detalle de registro vehicular y permisos
                    </ThemedText>
                  </View>
                </View>

                {/* Green Habilitado Badge */}
                <View style={styles.habilitadoPillBadge}>
                  <Ionicons name="checkmark-circle" size={15} color="#059669" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.habilitadoPillBadgeText}>HABILITADO</ThemedText>
                </View>
              </View>

              {/* ─── BANNER INFORMATIVO AMARILLO PARA 1ª FALTA (LLAMADO DE ATENCIÓN) ─── */}
              {hasWarningLevel1 && (
                <View style={styles.warningLevel1Banner}>
                  <View style={styles.warningLevel1IconCircle}>
                    <Ionicons name="warning" size={20} color="#D97706" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText style={styles.warningLevel1Title}>1ª Falta: Llamado de Atención</ThemedText>
                    <ThemedText style={styles.warningLevel1Desc}>
                      {evaluacionSancion?.motivo || 'Primer llamado de atención registrado en el sistema. Se autoriza el acceso vehicular.'}
                    </ThemedText>
                  </View>
                  <View style={styles.warningLevel1Pill}>
                    <Ionicons name="checkmark-circle" size={12} color="#059669" style={{ marginRight: 4 }} />
                    <ThemedText style={styles.warningLevel1PillText}>PERMITIDO</ThemedText>
                  </View>
                </View>
              )}

              {/* 2-Column Layout */}
              <View style={styles.identified2ColRow}>
                {/* Left Column: Datos del Vehículo & Historial */}
                <View style={styles.identifiedLeftCol}>
                  {/* Card Datos del Vehículo */}
                  <View style={styles.vehicleDataCardGreenLeft}>
                    <View style={styles.cardHeaderTitleRow}>
                      <Ionicons name="car-sport-outline" size={18} color="#0D6E5F" style={{ marginRight: 6 }} />
                      <ThemedText style={styles.vehicleDataCardTitle}>Datos del Vehículo</ThemedText>
                    </View>

                    {/* Row 1: Empresa & Marca/Modelo */}
                    <View style={styles.grid2Col}>
                      <View style={styles.dataCol}>
                        <ThemedText style={styles.dataLabel}>Empresa Contratista</ThemedText>
                        <View style={styles.dataValueBox}>
                          <ThemedText style={styles.dataValue}>
                            {selectedEmpresa?.razon_social || 'Servicios y Contratistas'}
                          </ThemedText>
                        </View>
                      </View>
                      <View style={styles.dataCol}>
                        <ThemedText style={styles.dataLabel}>Marca / Modelo</ThemedText>
                        <View style={styles.dataValueBox}>
                          <ThemedText style={styles.dataValue}>
                            {selectedVehicle.marca} {selectedVehicle.modelo}
                          </ThemedText>
                        </View>
                      </View>
                    </View>

                    {/* Row 2: Placas & Color */}
                    <View style={styles.grid2Col}>
                      <View style={styles.dataCol}>
                        <ThemedText style={styles.dataLabel}>Placas</ThemedText>
                        <View style={styles.dataValueBox}>
                          <ThemedText style={styles.dataValueBold}>{selectedVehicle.placas}</ThemedText>
                        </View>
                      </View>
                      <View style={styles.dataCol}>
                        <ThemedText style={styles.dataLabel}>Color</ThemedText>
                        <View style={[styles.dataValueBox, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                          <View style={styles.colorDotRadio} />
                          <ThemedText style={styles.dataValue}>{selectedVehicle.color}</ThemedText>
                        </View>
                      </View>
                    </View>

                    {/* Row 3: Conductor & Vencimiento */}
                    <View style={styles.grid2Col}>
                      <View style={styles.dataCol}>
                        <ThemedText style={styles.dataLabel}>Conductor Asignado</ThemedText>
                        <View style={styles.dataValueBox}>
                          <ThemedText style={styles.dataValue}>
                            👤 {selectedConductor ? `${selectedConductor.nombre} ${selectedConductor.apellidos}` : 'No Registrado'}
                          </ThemedText>
                        </View>
                      </View>
                      <View style={styles.dataCol}>
                        <ThemedText style={styles.dataLabel}>Vencimiento Corbatín</ThemedText>
                        <View style={styles.dataValueBox}>
                          <ThemedText style={styles.dataValue}>
                            📅 {selectedCorbatin?.fecha_vencimiento ? new Date(selectedCorbatin.fecha_vencimiento).toLocaleDateString() : 'Vigente'}
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Card Historial y Estatus de Caseta */}
                  <View style={[styles.historyCard, isVehicleInside && styles.historyCardInsideHighlight]}>
                    <View style={styles.cardHeaderTitleRow}>
                      <Ionicons
                        name={isVehicleInside ? 'navigate-circle' : 'time-outline'}
                        size={16}
                        color={isVehicleInside ? '#0D6E5F' : '#64748B'}
                        style={{ marginRight: 6 }}
                      />
                      <ThemedText style={[styles.historyCardTitle, isVehicleInside && { color: '#0D6E5F' }]}>
                        {isVehicleInside ? 'Vehículo Dentro del Complejo' : 'Estatus de Estancia en Caseta'}
                      </ThemedText>
                    </View>
                    <View style={styles.historyRowBox}>
                      <Ionicons
                        name={isVehicleInside ? 'checkmark-circle' : 'log-out-outline'}
                        size={28}
                        color={isVehicleInside ? '#10B981' : '#94A3B8'}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.historyRowTitle}>
                          {isVehicleInside
                            ? `🟢 Acceso activo registrado a las ${formatHora(ultimoAcceso?.hora_entrada) || ''} hrs.`
                            : isAccesoToday && formatHora(ultimoAcceso?.hora_salida)
                              ? `⚪ Última salida registrada a las ${formatHora(ultimoAcceso?.hora_salida)} hrs.`
                              : 'Sin registro de estancia activo el día de hoy.'}
                        </ThemedText>
                        <ThemedText style={styles.historyRowSubtitle}>
                          {isVehicleInside
                            ? `Tiempo de estancia actual: ${tiempoEstancia || 'En curso'}`
                            : 'El vehículo se encuentra fuera del resort.'}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Right Column: Foto, Botón de Salida/Entrada, Botón de Infracción & Enlace */}
                <View style={styles.identifiedRightCol}>
                  <Pressable
                    onPress={() => setLightboxPhoto(selectedVehicle.foto_url || SAMPLE_EVIDENCIA_PHOTOS[0])}
                    style={({ pressed }) => [
                      styles.photoReferenceCard,
                      pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Image
                      source={{ uri: selectedVehicle.foto_url || SAMPLE_EVIDENCIA_PHOTOS[0] }}
                      style={styles.referencePhotoImg}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    <View style={styles.photoReferenceFooter}>
                      <ThemedText style={styles.photoReferenceLabel}>Foto de Referencia &bull; Tocar para Zoom</ThemedText>
                      <Ionicons name="search" size={14} color="#0D6E5F" />
                    </View>
                  </Pressable>

                  {/* ─── BOTÓN PRINCIPAL DE CONTROL DE ACCESO (SALIDA / ENTRADA) ─── */}
                  {isVehicleInside ? (
                    <Pressable
                      onPress={handleMarcarSalida}
                      disabled={actionLoading}
                      style={({ pressed }) => [
                        styles.exitActionBtn,
                        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                        actionLoading && { opacity: 0.7 },
                      ]}
                    >
                      {actionLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons name="log-out-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                          <ThemedText style={styles.exitActionBtnText}>
                            MARCAR SALIDA DEL VEHÍCULO
                          </ThemedText>
                        </>
                      )}
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={handleRegistrarEntrada}
                      disabled={actionLoading}
                      style={({ pressed }) => [
                        styles.entryActionBtn,
                        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                        actionLoading && { opacity: 0.7 },
                      ]}
                    >
                      {actionLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons name="log-in-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                          <ThemedText style={styles.entryActionBtnText}>
                            REGISTRAR ENTRADA
                          </ThemedText>
                        </>
                      )}
                    </Pressable>
                  )}

                  {/* Action Button: REPORTAR INFRACCIÓN */}
                  <Pressable
                    onPress={startReportWizard}
                    disabled={!isVehicleInside}
                    style={({ pressed }) => [
                      styles.reportInfractionSecBtn,
                      !isVehicleInside && styles.reportInfractionDisabledBtn,
                      pressed && isVehicleInside && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons
                      name={isVehicleInside ? 'warning-outline' : 'ban-outline'}
                      size={18}
                      color={isVehicleInside ? '#D97706' : '#94A3B8'}
                      style={{ marginRight: 8 }}
                    />
                    <ThemedText
                      style={[
                        styles.reportInfractionSecBtnText,
                        !isVehicleInside && styles.reportInfractionDisabledText,
                      ]}
                    >
                      {isVehicleInside ? 'REPORTAR INFRACCIÓN' : 'REPORTAR INFRACCIÓN (VEHÍCULO FUERA)'}
                    </ThemedText>
                  </Pressable>

                  {/* Historial Completo Link */}
                  <Pressable
                    onPress={() => router.push('/reports')}
                    style={styles.viewFullHistoryBtn}
                  >
                    <Ionicons name="list-outline" size={16} color="#475569" style={{ marginRight: 6 }} />
                    <ThemedText style={styles.viewFullHistoryText}>Ver Historial Completo</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── 4. WIZARD STEP 1: LEVANTAMIENTO DE INFRACCIÓN (Image 3 Right) ─── */}
      {mode === 'wizard' && step === 1 && selectedVehicle && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollPage, { paddingBottom: 280 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {/* Header */}
            <View style={styles.topHeaderBar}>
              <Pressable onPress={handleBackPress} style={styles.backIconButton}>
                <Ionicons name="arrow-back" size={22} color="#0f172a" />
              </Pressable>
              <View style={styles.headerTitleBox}>
                <ThemedText style={styles.screenMainTitle}>Levantamiento de Infracción</ThemedText>
                <ThemedText style={styles.screenSubTitle}>Paso 1 de 3: Selección y detalles</ThemedText>
              </View>
            </View>

            {/* Active Context Banner */}
            <View style={styles.contextActiveBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="warning" size={16} color="#F59E0B" />
                <ThemedText style={styles.contextActiveTitle}>Infracción en Proceso</ThemedText>
              </View>
              <ThemedText style={styles.contextActiveDesc}>
                {selectedVehicle.marca} {selectedVehicle.modelo} &bull; {selectedVehicle.placas} &bull; Corbatín #{selectedCorbatin?.numero}
              </ThemedText>
            </View>

            {/* Catálogo de Infracciones Grid (2x3) */}
            <ThemedText style={styles.sectionFormTitle}>Catálogo de Infracciones</ThemedText>
            <View style={styles.catGrid}>
              {INFRACTION_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      setSelectedCategory(cat.id);
                      const matched =
                        catalogoInfracciones.find((i) => (i.codigo || '').toLowerCase() === cat.defaultCode.toLowerCase()) ||
                        catalogoInfracciones.find((i) => (i.categoria || '').toLowerCase().includes(cat.id)) ||
                        catalogoInfracciones[0] ||
                        {
                          id_infraccion: 1,
                          id_reglamento: 1,
                          codigo: cat.defaultCode,
                          nombre: cat.name,
                          descripcion: 'Falta a la normativa',
                          categoria: cat.name,
                          activo: true,
                        };
                      setSelectedInfraccion(matched);
                    }}
                    style={[
                      styles.catCard,
                      isSelected && styles.catCardSelected,
                    ]}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={24}
                      color={isSelected ? '#DC2626' : '#64748B'}
                    />
                    <ThemedText style={[styles.catCardText, isSelected && styles.catCardTextSelected]}>
                      {cat.name}
                    </ThemedText>
                    {isSelected && (
                      <View style={styles.selectedCheckPill}>
                        <Ionicons name="checkmark" size={10} color="#ffffff" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Detalles del Incidente Form */}
            <ThemedText style={styles.sectionFormTitle}>Detalles del Incidente</ThemedText>
            <View style={styles.incidentDetailsCard}>
              <Select
                label="Ubicación del Incidente"
                value={lugar}
                onValueChange={setLugar}
                options={[
                  { label: 'Estacionamiento Norte', value: 'Estacionamiento Norte' },
                  { label: 'Estacionamiento Sur', value: 'Estacionamiento Sur' },
                  { label: 'Área de Construcción', value: 'Área de Construcción' },
                  { label: 'Lobby Principal', value: 'Lobby Principal' },
                  { label: 'Alberca / Playa', value: 'Alberca / Playa' },
                  { label: 'Acceso de Proveedores', value: 'Acceso de Proveedores' },
                ]}
              />

              <View style={styles.grid2Col}>
                <View style={styles.dataCol}>
                  <ThemedText style={styles.inputFieldLabel}>Fecha</ThemedText>
                  <View style={styles.dateReadOnlyBox}>
                    <ThemedText style={styles.dateReadOnlyText}>{fecha}</ThemedText>
                  </View>
                </View>
                <View style={styles.dataCol}>
                  <ThemedText style={styles.inputFieldLabel}>Hora</ThemedText>
                  <View style={styles.dateReadOnlyBox}>
                    <ThemedText style={styles.dateReadOnlyText}>{hora} hrs</ThemedText>
                  </View>
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <ThemedText style={styles.inputFieldLabel}>Descripción Detallada</ThemedText>
                <TextInput
                  placeholder="Describa brevemente la falta cometida, reincidencia o detalles específicos..."
                  placeholderTextColor="#94a3b8"
                  value={descripcion}
                  onChangeText={setDescripcion}
                  multiline
                  numberOfLines={4}
                  style={styles.formTextArea}
                />
              </View>
            </View>

            {/* Continue Button */}
            <Pressable
              onPress={() => setStep(2)}
              style={({ pressed }) => [
                styles.navyActionBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <ThemedText style={styles.navyActionBtnText}>Continuar a Evidencias</ThemedText>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 6 }} />
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ─── 5. WIZARD STEP 2: EVIDENCIA FOTOGRÁFICA (Image 4 Left) ─── */}
      {mode === 'wizard' && step === 2 && (
        <ScrollView contentContainerStyle={styles.scrollPage} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.topHeaderBar}>
            <Pressable onPress={handleBackPress} style={styles.backIconButton}>
              <Ionicons name="arrow-back" size={22} color="#0f172a" />
            </Pressable>
            <View style={styles.headerTitleBox}>
              <ThemedText style={styles.screenMainTitle}>Evidencia Fotográfica (Máximo 5)</ThemedText>
              <ThemedText style={styles.screenSubTitle}>
                Asegúrese de capturar las placas y el contexto de la infracción.
              </ThemedText>
            </View>
          </View>

          {/* Camera Take Button Card */}
          <Pressable
            onPress={handleAddPhotoSimulate}
            disabled={evidencias.length >= 5}
            style={({ pressed }) => [
              styles.dashedPhotoBox,
              evidencias.length >= 5 && { opacity: 0.5 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="camera" size={32} color="#F59E0B" />
            <ThemedText style={styles.dashedPhotoText}>TOMAR FOTOGRAFÍA</ThemedText>
            <ThemedText style={styles.dashedPhotoSub}>
              {evidencias.length} de 5 fotografías adjuntas
            </ThemedText>
          </Pressable>

          {/* 5 Photo Slots Grid */}
          <View style={styles.photoSlotsGrid}>
            {[0, 1, 2, 3, 4].map((index) => {
              const photo = evidencias[index];
              return (
                <View key={index} style={styles.photoSlotBox}>
                  {photo ? (
                    <View style={styles.photoSlotFilled}>
                      <Image source={{ uri: photo.fotoUrl }} style={styles.photoSlotImg} cachePolicy="memory-disk" />
                      <Pressable
                        onPress={() => handleDeletePhoto(photo.id)}
                        style={styles.deletePhotoSlotBtn}
                      >
                        <Ionicons name="close" size={12} color="#ffffff" />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.photoSlotEmpty}>
                      <Ionicons name="image-outline" size={20} color="#cbd5e1" />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Wizard Step 2 Actions */}
          <View style={styles.wizardFooterRow}>
            <Pressable
              onPress={async () => {
                if (selectedVehicle && selectedInfraccion) {
                  await agregarReporte(
                    {
                      vehiculoId: String(selectedVehicle.id_vehiculo),
                      corbatinNumero: selectedCorbatin?.numero ? `C-${selectedCorbatin.numero}` : 'S/C',
                      infraccionCodigo: selectedInfraccion.codigo,
                      idVehiculo: Number(selectedVehicle.id_vehiculo),
                      idCorbatin: selectedCorbatin?.id_corbatin && Number(selectedCorbatin.id_corbatin) > 0 ? Number(selectedCorbatin.id_corbatin) : null,
                      idInfraccion: Number(selectedInfraccion.id_infraccion) || 1,
                      lugar: lugar,
                      descripcion: descripcion || 'Borrador guardado.',
                      observaciones: 'Guardado por el oficial.',
                      evidencias: evidencias,
                    },
                    'borrador'
                  );
                  alert('Borrador guardado exitosamente.');
                  router.replace('/');
                }
              }}
              style={styles.draftOutlineBtn}
            >
              <ThemedText style={styles.draftOutlineBtnText}>Guardar Borrador</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setStep(3)}
              style={({ pressed }) => [
                styles.reviewYellowBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons name="checkmark" size={16} color="#0f172a" style={{ marginRight: 4 }} />
              <ThemedText style={styles.reviewYellowBtnText}>REVISAR REPORTE</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* ─── 6. WIZARD STEP 3: REVISIÓN Y CONFIRMACIÓN (Image 4 Right) ─── */}
      {mode === 'wizard' && step === 3 && selectedVehicle && selectedInfraccion && (
        <ScrollView contentContainerStyle={styles.scrollPage} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.topHeaderBar}>
            <Pressable onPress={handleBackPress} style={styles.backIconButton}>
              <Ionicons name="arrow-back" size={22} color="#0f172a" />
            </Pressable>
            <View style={styles.headerTitleBox}>
              <ThemedText style={styles.screenMainTitle}>Revisión y Confirmación</ThemedText>
              <ThemedText style={styles.screenSubTitle}>
                Verifique que todos los datos sean correctos antes de enviar.
              </ThemedText>
            </View>
          </View>

          {/* Summary Card: Infracción */}
          <View style={styles.reviewCard}>
            <ThemedText style={styles.reviewCardTitle}>Detalles de la Infracción</ThemedText>
            <ThemedText style={styles.reviewCardText}>
              <ThemedText style={{ fontWeight: 'bold' }}>Tipo:</ThemedText> {selectedInfraccion.codigo} - {selectedInfraccion.nombre}{'\n'}
              <ThemedText style={{ fontWeight: 'bold' }}>Ubicación:</ThemedText> {lugar}{'\n'}
              <ThemedText style={{ fontWeight: 'bold' }}>Fecha y Hora:</ThemedText> {fecha} a las {hora} hrs{'\n'}
              <ThemedText style={{ fontWeight: 'bold' }}>Descripción:</ThemedText> {descripcion || 'Sin descripción adicional'}
            </ThemedText>
          </View>

          {/* Summary Card: Vehículo */}
          <View style={styles.reviewCard}>
            <ThemedText style={styles.reviewCardTitle}>Datos del Vehículo</ThemedText>
            <ThemedText style={styles.reviewCardText}>
              <ThemedText style={{ fontWeight: 'bold' }}>Corbatín:</ThemedText> #{selectedCorbatin?.numero}{'\n'}
              <ThemedText style={{ fontWeight: 'bold' }}>Vehículo:</ThemedText> {selectedVehicle.marca} {selectedVehicle.modelo} ({selectedVehicle.color}){'\n'}
              <ThemedText style={{ fontWeight: 'bold' }}>Placas:</ThemedText> {selectedVehicle.placas}{'\n'}
              <ThemedText style={{ fontWeight: 'bold' }}>Empresa:</ThemedText> {selectedEmpresa?.razon_social || 'Empresa Registrada HOA'}
            </ThemedText>
          </View>

          {/* Summary Card: Evidencias */}
          <View style={styles.reviewCard}>
            <ThemedText style={styles.reviewCardTitle}>Evidencias Adjuntas ({evidencias.length})</ThemedText>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {evidencias.map((ev) => (
                <Image key={ev.id} source={{ uri: ev.fotoUrl }} style={styles.reviewPhotoThumb} cachePolicy="memory-disk" />
              ))}
            </View>
          </View>

          {/* Declaration Checkbox */}
          <Pressable
            onPress={() => setConfirmed(!confirmed)}
            style={styles.declarationCheckboxRow}
          >
            <View style={[styles.checkboxBox, confirmed && { backgroundColor: '#0D6E5F', borderColor: '#0D6E5F' }]}>
              {confirmed && <Ionicons name="checkmark" size={14} color="#ffffff" />}
            </View>
            <ThemedText style={styles.declarationText}>
              Confirmo que la información capturada es verídica y corresponde a los hechos observados.
            </ThemedText>
          </Pressable>

          {/* Submit Yellow Button */}
          <Pressable
            onPress={submitReport}
            disabled={!confirmed || submitting}
            style={({ pressed }) => [
              styles.sendReportBtn,
              (!confirmed || submitting) && { opacity: 0.5 },
              pressed && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#0f172a" />
            ) : (
              <ThemedText style={styles.sendReportBtnText}>ENVIAR REPORTE AL HOA</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      )}

      {/* ─── 7. CONFIRMATION SCREEN (Image 5 Left) ─── */}
      {mode === 'confirmation' && (
        <ScrollView contentContainerStyle={styles.confirmScrollPage} showsVerticalScrollIndicator={false}>
          {/* Green Check Halo */}
          <View style={styles.successHalo}>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          </View>

          <ThemedText style={styles.successTitleText}>¡Reporte Enviado Exitosamente!</ThemedText>
          <ThemedText style={styles.successSubText}>
            El reporte ha sido registrado. Un supervisor revisará la evidencia desde la plataforma administrativa.
          </ThemedText>

          {/* Folio Receipt Card */}
          <View style={styles.folioReceiptCard}>
            <View style={styles.receiptLine}>
              <ThemedText style={styles.receiptLabel}>Folio de Reporte:</ThemedText>
              <ThemedText style={styles.receiptValueBold}>{generatedFolio}</ThemedText>
            </View>
            <View style={styles.receiptLine}>
              <ThemedText style={styles.receiptLabel}>Fecha y Hora:</ThemedText>
              <ThemedText style={styles.receiptValue}>{fecha} - {hora} hrs</ThemedText>
            </View>
            <View style={styles.receiptLine}>
              <ThemedText style={styles.receiptLabel}>Estado:</ThemedText>
              <View style={styles.pendingPillMini}>
                <ThemedText style={styles.pendingPillMiniText}>Pendiente de revisión</ThemedText>
              </View>
            </View>
          </View>

          {/* 3 Action Buttons */}
          <View style={styles.confirmationBtnCol}>
            {/* Yellow button: Ver Reporte */}
            <Pressable
              onPress={() => router.replace('/reports')}
              style={({ pressed }) => [
                styles.confirmYellowBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons name="eye-outline" size={18} color="#0f172a" style={{ marginRight: 6 }} />
              <ThemedText style={styles.confirmYellowBtnText}>Ver Reporte</ThemedText>
            </Pressable>

            {/* Navy button: Escanear Nuevo Vehículo */}
            <Pressable
              onPress={() => {
                setMode('camera');
                setManualCorbatinInput('');
              }}
              style={({ pressed }) => [
                styles.confirmNavyBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons name="scan-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <ThemedText style={styles.confirmNavyBtnText}>Escanear Nuevo Vehículo</ThemedText>
            </Pressable>

            {/* Outline button: Ir al Inicio */}
            <Pressable
              onPress={() => router.replace('/')}
              style={({ pressed }) => [
                styles.confirmOutlineBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <ThemedText style={styles.confirmOutlineBtnText}>Ir al Inicio</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* ─── LIGHTBOX MODAL FOR ZOOMING VEHICLE / EVIDENCE PHOTOS ─── */}
      {lightboxPhoto && (
        <Modal
          visible={!!lightboxPhoto}
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxPhoto(null)}
        >
          <View style={styles.lightboxOverlay}>
            <View style={styles.lightboxCard}>
              <View style={styles.lightboxHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="image-outline" size={20} color="#ffffff" />
                  <ThemedText style={styles.lightboxTitle}>Inspección Visual del Vehículo</ThemedText>
                </View>
                <Pressable onPress={() => setLightboxPhoto(null)} style={styles.lightboxCloseBtn}>
                  <Ionicons name="close" size={24} color="#ffffff" />
                </Pressable>
              </View>

              <Image
                source={{ uri: lightboxPhoto }}
                style={styles.lightboxImg}
                contentFit="contain"
                cachePolicy="memory-disk"
              />

              <View style={styles.lightboxFooter}>
                <ThemedText style={styles.lightboxPlate}>
                  Placas: {selectedVehicle?.placas || 'N/A'} &bull; {selectedVehicle?.marca} {selectedVehicle?.modelo}
                </ThemedText>
                <ThemedText style={styles.lightboxCompany}>
                  {selectedEmpresa?.razon_social || 'Empresa Acreditada HOA'}
                </ThemedText>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ─── MODAL DE CONFIRMACIÓN DE SALIDA EXITOSA ─── */}
      {exitSuccessModal && (
        <Modal
          visible={exitSuccessModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setExitSuccessModal(null)}
        >
          <View style={styles.exitModalOverlay}>
            <View style={styles.exitModalCard}>
              <View style={styles.exitModalHalo}>
                <Ionicons name="checkmark-circle" size={56} color="#10B981" />
              </View>

              <ThemedText style={styles.exitModalTitle}>¡Salida Marcada Exitosamente!</ThemedText>
              <ThemedText style={styles.exitModalSubtitle}>
                El vehículo ha salido del complejo. Se registró la hora de salida en la bitácora oficial.
              </ThemedText>

              {/* Receipt info card */}
              <View style={styles.exitReceiptBox}>
                <View style={styles.exitReceiptRow}>
                  <ThemedText style={styles.exitReceiptLabel}>Vehículo / Placas:</ThemedText>
                  <ThemedText style={styles.exitReceiptValBold}>
                    {selectedVehicle?.placas} &bull; {selectedVehicle?.marca} {selectedVehicle?.modelo}
                  </ThemedText>
                </View>
                <View style={styles.exitReceiptRow}>
                  <ThemedText style={styles.exitReceiptLabel}>Corbatín:</ThemedText>
                  <ThemedText style={styles.exitReceiptVal}>#{selectedCorbatin?.numero}</ThemedText>
                </View>
                {exitSuccessModal.horaEntrada && (
                  <View style={styles.exitReceiptRow}>
                    <ThemedText style={styles.exitReceiptLabel}>Hora de Ingreso:</ThemedText>
                    <ThemedText style={styles.exitReceiptVal}>{exitSuccessModal.horaEntrada} hrs</ThemedText>
                  </View>
                )}
                <View style={styles.exitReceiptRow}>
                  <ThemedText style={styles.exitReceiptLabel}>Hora de Salida:</ThemedText>
                  <ThemedText style={styles.exitReceiptValGreen}>{exitSuccessModal.horaSalida} hrs</ThemedText>
                </View>
                {exitSuccessModal.duracion && (
                  <View style={styles.exitReceiptRow}>
                    <ThemedText style={styles.exitReceiptLabel}>Tiempo de Estancia:</ThemedText>
                    <ThemedText style={styles.exitReceiptVal}>{exitSuccessModal.duracion}</ThemedText>
                  </View>
                )}
              </View>

              {/* Action buttons */}
              <View style={styles.exitModalBtnCol}>
                <Pressable
                  onPress={() => {
                    setExitSuccessModal(null);
                    setMode('camera');
                    setManualCorbatinInput('');
                  }}
                  style={({ pressed }) => [
                    styles.exitModalScanNextBtn,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Ionicons name="scan-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <ThemedText style={styles.exitModalScanNextBtnText}>Escanear Siguiente Vehículo</ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => setExitSuccessModal(null)}
                  style={({ pressed }) => [
                    styles.exitModalCloseBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <ThemedText style={styles.exitModalCloseBtnText}>Cerrar Detalle</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollPage: {
    paddingHorizontal: Spacing.three,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 12,
  },
  miniResortHeader: {
    position: 'relative',
    height: 78,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 4,
  },
  miniResortHeaderBg: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  miniResortHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  miniResortIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  miniResortTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  miniResortSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    marginTop: 1,
  },
  miniResortTagBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  miniResortTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  headerTitleBox: {
    flex: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#0D6E5F',
    paddingLeft: 14,
  },
  backIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  screenMainTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  screenSubTitle: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  viewfinderDarkBox: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    gap: 14,
  },
  cameraFrameWrapper: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
  },
  cameraTopControls: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  liveBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  liveBlinkingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cameraActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cameraControlCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBottomPill: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  cameraBottomPillText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  cameraLoadingBox: {
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  cameraLoadingText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  permissionCard: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 12,
    maxWidth: 280,
  },
  permissionIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionDesc: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  grantPermissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D6E5F',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 6,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  grantPermissionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  focusFrame: {
    width: 220,
    height: 220,
    borderRadius: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  laserLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  cornerBracket: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#10B981',
  },
  bracketTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  bracketTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bracketBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bracketBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  manualEntryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  manualEntryHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  manualEntryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  manualEntryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualTextInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  manualSearchButton: {
    backgroundColor: '#0D6E5F',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSearchButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  loadingCenterContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingTextLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  accessDeniedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 12,
  },
  accessDeniedBannerText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusPillRow: {
    flexDirection: 'row',
  },
  habilitadoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  habilitadoPillText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '900',
  },
  suspendedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  suspendedPillText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '900',
  },
  vehicleDataCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderLeftWidth: 6,
    gap: 12,
  },
  vehicleDataCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 2,
  },
  grid2Col: {
    flexDirection: 'row',
    gap: 12,
  },
  dataCol: {
    flex: 1,
    gap: 2,
  },
  dataLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  dataValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  vehicleThumbWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 120,
  },
  vehiclePhotoImg: {
    width: '100%',
    height: '100%',
  },
  reportYellowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D6E5F',
    height: 48,
    borderRadius: 12,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  reportYellowBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  historyCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyRowText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  contextActiveBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 12,
    gap: 2,
  },
  contextActiveTitle: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '900',
  },
  contextActiveDesc: {
    color: '#78350F',
    fontSize: 11.5,
    fontWeight: '600',
  },
  sectionFormTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catCard: {
    width: '48.5%',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  catCardSelected: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  catCardText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  catCardTextSelected: {
    color: '#DC2626',
    fontWeight: '900',
  },
  selectedCheckPill: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incidentDetailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  inputFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  dateReadOnlyBox: {
    height: 42,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  dateReadOnlyText: {
    fontSize: 12.5,
    color: '#0f172a',
    fontWeight: '600',
  },
  formTextArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
    fontSize: 12.5,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  navyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    height: 48,
    borderRadius: 12,
    marginTop: 4,
  },
  navyActionBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
  },
  dashedPhotoBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#0D6E5F',
    borderRadius: 16,
    backgroundColor: '#E6F4F1',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dashedPhotoText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0D6E5F',
    letterSpacing: 0.5,
  },
  dashedPhotoSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#074239',
  },
  photoSlotsGrid: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  photoSlotBox: {
    width: '18%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  photoSlotFilled: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  photoSlotImg: {
    width: '100%',
    height: '100%',
  },
  deletePhotoSlotBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSlotEmpty: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  draftOutlineBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftOutlineBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  reviewYellowBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0D6E5F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewYellowBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  reviewCardTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0D6E5F',
  },
  reviewCardText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  reviewPhotoThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  declarationCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declarationText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
  sendReportBtn: {
    height: 50,
    backgroundColor: '#0D6E5F',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  sendReportBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  confirmScrollPage: {
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    gap: 16,
  },
  successHalo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitleText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
  successSubText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 16,
  },
  folioReceiptCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  receiptLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  receiptValueBold: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0D6E5F',
  },
  receiptValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  pendingPillMini: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pendingPillMiniText: {
    color: '#D97706',
    fontSize: 10.5,
    fontWeight: '800',
  },
  confirmationBtnCol: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  confirmYellowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#0D6E5F',
    borderRadius: 12,
  },
  confirmYellowBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  confirmNavyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#0F172A',
    borderRadius: 12,
  },
  confirmNavyBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  confirmOutlineBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  confirmOutlineBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  /* ─── IMAGE 4: 2-COLUMN VEHICLE IDENTIFIED STYLES ─── */
  identifiedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  identifiedHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  identifiedTitleContainer: {
    flex: 1,
    minWidth: 0,
  },
  habilitadoPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    flexShrink: 0,
  },
  habilitadoPillBadgeText: {
    color: '#059669',
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  identified2ColRow: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  identifiedLeftCol: {
    flex: 1.4,
    minWidth: 280,
    gap: 14,
  },
  identifiedRightCol: {
    flex: 1,
    minWidth: 280,
    gap: 12,
  },
  vehicleDataCardGreenLeft: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
    borderLeftColor: '#0D6E5F',
    gap: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  dataValueBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  dataValueBold: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  colorDotRadio: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#94a3b8',
  },
  historyRowBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  historyRowTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  historyRowSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  photoReferenceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  referencePhotoImg: {
    width: '100%',
    height: 160,
  },
  photoReferenceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  photoReferenceLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  viewFullHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  viewFullHistoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },

  /* ─── IMAGE 4 RIGHT: ACCESO DENEGADO / SUSPENDIDO STYLES ─── */
  accessDeniedTopBanner: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  accessDeniedIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  accessDeniedTopBannerText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  subHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  volverBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  timeBadgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 5,
  },
  timeBadgeChipText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '700',
  },
  suspendedVehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  suspendedPhotoCol: {
    width: 140,
    height: 110,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  suspendedPhotoImg: {
    width: '100%',
    height: '100%',
  },
  plateTagOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  plateTagOverlayText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  suspendedMetaCol: {
    flex: 1,
    minWidth: 200,
    gap: 6,
  },
  suspendedVehicleTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  suspendedRedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  dotRed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
  },
  suspendedRedBadgeText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '900',
  },
  suspendedCompanyText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
  },
  suspendedMiniGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  suspendedMiniBox: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dataValueSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  suspensionDetailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    gap: 12,
    shadowColor: '#991B1B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  suspensionDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gavelIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suspensionDetailHeading: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  suspensionDetailSubHeading: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  statusActivePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusActivePillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  reincidenciaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  reincidenciaBannerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  reincidenciaBannerTitle: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 1,
  },
  motifSection: {
    gap: 4,
  },
  motifBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  motifText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#334155',
    fontWeight: '600',
  },
  suspensionVencimientoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  vencimientoCol: {
    flex: 1,
    minWidth: 140,
  },
  suspensionVencimientoText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  hoursRemainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  hoursRemainingText: {
    fontSize: 12,
    fontWeight: '900',
  },
  reportActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#0D6E5F',
    borderRadius: 12,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  reportActionBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  lightboxCard: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
    padding: 16,
  },
  lightboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lightboxTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  lightboxCloseBtn: {
    padding: 4,
  },
  lightboxImg: {
    width: '100%',
    height: 300,
    borderRadius: 12,
  },
  lightboxFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
    gap: 2,
  },
  lightboxPlate: {
    fontSize: 13,
    fontWeight: '900',
    color: '#10B981',
  },
  lightboxCompany: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  historyCardInsideHighlight: {
    borderColor: '#0D6E5F',
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 4,
    borderLeftColor: '#0D6E5F',
  },
  exitActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D6E5F',
    height: 48,
    borderRadius: 12,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  exitActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  entryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D6E5F',
    height: 48,
    borderRadius: 12,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  entryActionBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  reportInfractionSecBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    height: 46,
    borderRadius: 12,
  },
  reportInfractionSecBtnText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  reportInfractionDisabledBtn: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    opacity: 0.75,
  },
  reportInfractionDisabledText: {
    color: '#94A3B8',
  },
  exitModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  exitModalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  exitModalHalo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  exitModalTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  exitModalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  exitReceiptBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 8,
    marginVertical: 4,
  },
  exitReceiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exitReceiptLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  exitReceiptVal: {
    fontSize: 12.5,
    color: '#0f172a',
    fontWeight: '700',
  },
  exitReceiptValBold: {
    fontSize: 12.5,
    color: '#0f172a',
    fontWeight: '800',
  },
  exitReceiptValGreen: {
    fontSize: 13.5,
    color: '#059669',
    fontWeight: '900',
  },
  exitModalBtnCol: {
    width: '100%',
    gap: 8,
    marginTop: 6,
  },
  exitModalScanNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D6E5F',
    height: 46,
    borderRadius: 12,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  exitModalScanNextBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
  },
  exitModalCloseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  exitModalCloseBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  warningLevel1Banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  warningLevel1IconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningLevel1Title: {
    fontSize: 13,
    fontWeight: '900',
    color: '#92400E',
  },
  warningLevel1Desc: {
    fontSize: 11.5,
    color: '#78350F',
    fontWeight: '600',
    lineHeight: 16,
  },
  warningLevel1Pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  warningLevel1PillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
  },
});
