import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  Animated,
  Dimensions,
  SafeAreaView,
  Modal,
  Platform,
} from 'react-native';
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
import { VehiculoRow, CorbatinRow, EmpresaRow, TrabajadorRow, CatalogoInfraccionRow, SancionDbRow } from '../types/database';
import { Evidencia } from '../types/evidencia';

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
  { id: 'estacionamiento', name: 'Estacionamiento', icon: 'car-outline', defaultCode: 'EST-01' },
  { id: 'epp', name: 'EPP Ausente', icon: 'construct-outline', defaultCode: 'SEG-02' },
  { id: 'ruido', name: 'Ruido Excesivo', icon: 'volume-high-outline', defaultCode: 'CON-01' },
  { id: 'dano', name: 'Daño Instalaciones', icon: 'hammer-outline', defaultCode: 'DAN-01' },
  { id: 'seguridad', name: 'Brecha Seguridad', icon: 'shield-alert-outline', defaultCode: 'SEG-01' },
  { id: 'otros', name: 'Otros', icon: 'ellipsis-horizontal-circle-outline', defaultCode: 'OTR-01' },
];

export default function ScannerScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme();
  const { agregarReporte } = useMobile();

  // Navigation / Mode states
  const [mode, setMode] = useState<Mode>('camera');
  const [loadingText, setLoadingText] = useState('Consultando información del vehículo...');
  const [selectedVehicle, setSelectedVehicle] = useState<VehiculoRow | null>(null);
  const [selectedCorbatin, setSelectedCorbatin] = useState<CorbatinRow | null>(null);
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaRow | null>(null);
  const [selectedConductor, setSelectedConductor] = useState<TrabajadorRow | null>(null);
  const [sancionesActivas, setSancionesActivas] = useState<SancionDbRow[]>([]);
  const [catalogoInfracciones, setCatalogoInfracciones] = useState<CatalogoInfraccionRow[]>([]);

  // Manual input state on scanner screen
  const [manualCorbatinInput, setManualCorbatinInput] = useState('');
  const [laserAnim] = useState(new Animated.Value(0));
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Wizard state (3 steps)
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('seguridad');
  const [selectedInfraccion, setSelectedInfraccion] = useState<CatalogoInfraccionRow | null>(null);
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

  // Fetch catalog on mount
  useEffect(() => {
    SupabaseService.getCatalogoInfracciones().then((infs) => {
      setCatalogoInfracciones(infs);
      if (infs && infs.length > 0) {
        setSelectedInfraccion(infs[0]);
      }
    });
  }, []);

  const executeLookup = async (code: string) => {
    if (!code.trim()) return;
    setLoadingText('Consultando base de datos HOA...');
    setMode('loading');
    try {
      let res = await SupabaseService.buscarCorbatin(code);
      if (!res) {
        res = await SupabaseService.buscarVehiculoPorPlaca(code);
      }
      if (res && res.vehiculo) {
        setSelectedVehicle(res.vehiculo);
        setSelectedCorbatin(res.corbatin);
        setSelectedEmpresa(res.empresa);
        setSelectedConductor(res.conductorPrincipal || null);
        setSancionesActivas(res.sancionesActivas || []);
        setMode('result');
      } else {
        alert(`No se encontró vehículo ni corbatín con "${code}" en la base de datos.`);
        setMode('camera');
      }
    } catch (e) {
      alert('Error de conexión con la base de datos.');
      setMode('camera');
    }
  };

  // Handle incoming deep links (e.g. from index.tsx)
  useEffect(() => {
    if (params.corbatinNumero) {
      executeLookup(params.corbatinNumero as string);
    }
  }, [params.corbatinNumero]);

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
  const handleTriggerScanSimulate = async () => {
    try {
      const corbatines = await SupabaseService.getCorbatines();
      if (corbatines && corbatines.length > 0) {
        const rand = corbatines[Math.floor(Math.random() * corbatines.length)];
        executeLookup(String(rand.numero || rand.qr_token));
      } else {
        executeLookup('1');
      }
    } catch {
      executeLookup('1');
    }
  };

  const handleManualSearch = (codeToSearch?: string) => {
    const target = codeToSearch || manualCorbatinInput;
    if (!target.trim()) return;
    executeLookup(target.trim());
  };

  const startReportWizard = () => {
    setStep(1);
    setSelectedCategory('seguridad');
    const defaultInf = catalogoInfracciones.find((i) => i.codigo === 'SEG-01') || catalogoInfracciones[0] || {
      id_infraccion: 1,
      id_reglamento: 1,
      codigo: 'INF-01',
      nombre: 'Infracción General',
      descripcion: 'Reporte de falta',
      categoria: 'Seguridad',
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
          corbatinNumero: String(selectedCorbatin?.numero || '0'),
          infraccionCodigo: selectedInfraccion.codigo,
          lugar: lugar,
          descripcion: descripcion || 'Infracción reportada durante inspección de seguridad.',
          observaciones: 'Evidencias registradas desde el dispositivo de oficial.',
          evidencias: evidencias,
        },
        'pendiente'
      );

      setGeneratedFolio(folio);
      setMode('confirmation');
    } catch {
      alert('Error al registrar el reporte.');
    } finally {
      setSubmitting(false);
    }
  };

  const isSuspended =
    selectedCorbatin?.estatus === 'suspendido' ||
    selectedCorbatin?.estatus === 'cancelado' ||
    selectedVehicle?.estatus_acceso === 'denegado' ||
    selectedVehicle?.estatus_acceso === 'suspendido' ||
    sancionesActivas.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
      {/* ─── 1. CAMERA VIEW (Image 1 Right) ─── */}
      {mode === 'camera' && (
        <ScrollView contentContainerStyle={styles.scrollPage} showsVerticalScrollIndicator={false}>
          {/* ─── ANIMATED RESORT HEADER ─── */}
          <ResortHeader
            title="Verificación de Acceso"
            subtitle="Escanee el código QR del corbatín o ingrese el número."
            rightElement={
              <View style={styles.miniResortTagBadge}>
                <ThemedText style={styles.miniResortTagText}>Cámara Activa</ThemedText>
              </View>
            }
          />

          {/* Dark Camera Viewfinder Box */}
          <View style={styles.viewfinderDarkBox}>
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

            <ThemedText style={styles.viewfinderInstructions}>
              Coloque el código QR del corbatín dentro del recuadro para escanear
            </ThemedText>

            {/* Quick Simulate Trigger in Palomas Emerald */}
            <Pressable
              onPress={handleTriggerScanSimulate}
              style={({ pressed }) => [
                styles.simulateScanButton,
                { backgroundColor: '#0D6E5F' },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="scan" size={18} color="#ffffff" />
              <ThemedText style={[styles.simulateScanText, { color: '#ffffff' }]}>
                Simular Detección de QR
              </ThemedText>
            </Pressable>
          </View>

          {/* Manual Input Card */}
          <View style={styles.manualEntryCard}>
            <ThemedText style={styles.manualEntryHeading}>Ingresar manualmente</ThemedText>
            <ThemedText style={styles.manualEntryLabel}>Número de Corbatín</ThemedText>
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
            /* ─── ACCESO DENEGADO VIEW (Image 4 Right) ─── */
            <View style={{ gap: 16 }}>
              {/* Top Red Alert Full-Width Banner */}
              <View style={styles.accessDeniedTopBanner}>
                <Ionicons name="warning" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <ThemedText style={styles.accessDeniedTopBannerText}>ACCESO DENEGADO</ThemedText>
              </View>

              {/* Sub-bar with Volver and Timestamp */}
              <View style={styles.subHeaderBar}>
                <Pressable onPress={handleBackPress} style={styles.volverBtn}>
                  <Ionicons name="arrow-back" size={16} color="#0f172a" style={{ marginRight: 4 }} />
                  <ThemedText style={styles.volverBtnText}>VOLVER</ThemedText>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="time-outline" size={14} color="#64748B" />
                  <ThemedText style={styles.lastUpdateText}>Última actualización: Hoy, 09:42 AM</ThemedText>
                </View>
              </View>

              {/* Suspended Vehicle Card with Photo on Left */}
              <View style={styles.suspendedVehicleCard}>
                <View style={styles.suspendedPhotoCol}>
                  <Image
                    source={{ uri: selectedVehicle.foto_url || SAMPLE_EVIDENCIA_PHOTOS[1] }}
                    style={styles.suspendedPhotoImg}
                    resizeMode="cover"
                  />
                  <View style={styles.plateTagOverlay}>
                    <ThemedText style={styles.plateTagOverlayText}>{selectedVehicle.placas}</ThemedText>
                  </View>
                </View>

                <View style={styles.suspendedMetaCol}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ThemedText style={styles.suspendedVehicleTitle}>
                      {selectedVehicle.marca} {selectedVehicle.modelo}
                    </ThemedText>
                    <View style={styles.suspendedRedBadge}>
                      <View style={styles.dotRed} />
                      <ThemedText style={styles.suspendedRedBadgeText}>SUSPENDIDO</ThemedText>
                    </View>
                  </View>

                  <ThemedText style={styles.suspendedCompanyText}>
                    🏢 {selectedEmpresa?.razon_social || 'Construcciones del Puerto'}
                  </ThemedText>

                  <View style={styles.suspendedMiniGrid}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.dataLabel}>Conductor Asignado</ThemedText>
                      <ThemedText style={styles.dataValueSmall}>
                        👤 {selectedConductor ? `${selectedConductor.nombre} ${selectedConductor.apellidos}` : 'No Registrado'}
                      </ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.dataLabel}>Tipo de Pase</ThemedText>
                      <ThemedText style={styles.dataValueSmall}>📄 Contratista Acreditado</ThemedText>
                    </View>
                  </View>
                </View>
              </View>

              {/* Active Suspension Details Card */}
              <View style={styles.suspensionDetailCard}>
                <View style={styles.suspensionDetailHeader}>
                  <View style={styles.gavelIconBox}>
                    <Ionicons name="hammer" size={18} color="#DC2626" />
                  </View>
                  <ThemedText style={styles.suspensionDetailHeading}>Detalles de Suspensión Activa</ThemedText>
                </View>

                <View style={styles.suspensionDetailRow}>
                  <View style={{ flex: 2 }}>
                    <ThemedText style={styles.dataLabel}>Motivo de Infracción</ThemedText>
                    <View style={styles.motifBox}>
                      <ThemedText style={styles.motifText}>
                        {sancionesActivas[0]?.motivo || selectedCorbatin.motivo_cancelacion || 'Exceso de velocidad en zona peatonal y maniobra imprudente.'}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.dataLabel}>Reincidencia</ThemedText>
                    <View style={styles.reincidenciaBadge}>
                      <Ionicons name="warning" size={14} color="#DC2626" style={{ marginRight: 4 }} />
                      <ThemedText style={styles.reincidenciaText}>
                        {sancionesActivas[0]?.numero_reincidencia ? `Nivel ${sancionesActivas[0].numero_reincidencia}` : 'Nivel 1'}
                      </ThemedText>
                    </View>
                  </View>
                </View>

                <View style={styles.suspensionVencimientoRow}>
                  <View>
                    <ThemedText style={styles.dataLabel}>Vencimiento de Sanción</ThemedText>
                    <ThemedText style={styles.suspensionVencimientoText}>
                      {sancionesActivas[0]?.fecha_fin ? new Date(sancionesActivas[0].fecha_fin).toLocaleDateString() : 'Activa'}
                    </ThemedText>
                  </View>
                  <View style={styles.hoursRemainingBadge}>
                    <ThemedText style={styles.hoursRemainingText}>En revisión</ThemedText>
                  </View>
                </View>
              </View>

              {/* Action Button: REPORTAR NUEVA INFRACCIÓN */}
              <Pressable
                onPress={startReportWizard}
                style={({ pressed }) => [
                  styles.reportYellowBtn,
                  { backgroundColor: '#0D6E5F' },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="add-circle-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <ThemedText style={[styles.reportYellowBtnText, { color: '#ffffff' }]}>
                  REPORTAR NUEVA INFRACCIÓN
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            /* ─── VEHÍCULO IDENTIFICADO (HABILITADO) VIEW (Image 4 Left) ─── */
            <View style={{ gap: 16 }}>
              {/* Header */}
              <View style={styles.identifiedHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable onPress={handleBackPress} style={styles.backIconButton}>
                    <Ionicons name="arrow-back" size={20} color="#0f172a" />
                  </Pressable>
                  <View>
                    <ThemedText style={styles.screenMainTitle}>
                      Corbatín #{selectedCorbatin.numero}
                    </ThemedText>
                    <ThemedText style={styles.screenSubTitle}>
                      Detalle de registro vehicular y permisos de acceso.
                    </ThemedText>
                  </View>
                </View>

                {/* Green Habilitado Badge */}
                <View style={styles.habilitadoPillBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" style={{ marginRight: 6 }} />
                  <ThemedText style={styles.habilitadoPillBadgeText}>HABILITADO</ThemedText>
                </View>
              </View>

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

                  {/* Card Historial Reciente */}
                  <View style={styles.historyCard}>
                    <View style={styles.cardHeaderTitleRow}>
                      <Ionicons name="time-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                      <ThemedText style={styles.historyCardTitle}>Historial Reciente</ThemedText>
                    </View>
                    <View style={styles.historyRowBox}>
                      <Ionicons name="checkmark-circle-outline" size={28} color="#94A3B8" />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.historyRowTitle}>
                          Sin infracciones activas o reportes recientes.
                        </ThemedText>
                        <ThemedText style={styles.historyRowSubtitle}>
                          Último acceso registrado hace 4 horas.
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Right Column: Foto, Botón de Infracción & Enlace */}
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
                      resizeMode="cover"
                    />
                    <View style={styles.photoReferenceFooter}>
                      <ThemedText style={styles.photoReferenceLabel}>Foto de Referencia &bull; Tocar para Zoom</ThemedText>
                      <Ionicons name="search" size={14} color="#0D6E5F" />
                    </View>
                  </Pressable>

                  {/* Action Button: REPORTAR INFRACCIÓN */}
                  <Pressable
                    onPress={startReportWizard}
                    style={({ pressed }) => [
                      styles.reportYellowBtn,
                      { backgroundColor: '#0D6E5F' },
                      pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons name="warning-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <ThemedText style={[styles.reportYellowBtnText, { color: '#ffffff' }]}>
                      REPORTAR INFRACCIÓN
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
        <ScrollView contentContainerStyle={styles.scrollPage} showsVerticalScrollIndicator={false}>
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
                numberOfLines={3}
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
                      <Image source={{ uri: photo.fotoUrl }} style={styles.photoSlotImg} />
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
                      corbatinNumero: String(selectedCorbatin?.numero || '0'),
                      infraccionCodigo: selectedInfraccion.codigo,
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
                <Image key={ev.id} source={{ uri: ev.fotoUrl }} style={styles.reviewPhotoThumb} />
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
                resizeMode="contain"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollPage: {
    padding: Spacing.three,
    paddingBottom: 40,
    gap: 14,
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
    padding: 24,
    alignItems: 'center',
    gap: 16,
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
  viewfinderInstructions: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 16,
  },
  simulateScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D6E5F',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    marginTop: 4,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  simulateScanText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
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
    marginBottom: 4,
  },
  habilitadoPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  habilitadoPillBadgeText: {
    color: '#059669',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  identified2ColRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  identifiedLeftCol: {
    flex: 1.6,
    minWidth: 320,
    gap: 14,
  },
  identifiedRightCol: {
    flex: 1,
    minWidth: 240,
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
    borderRadius: 12,
    marginHorizontal: -Spacing.three,
    marginTop: -Spacing.three,
  },
  accessDeniedTopBannerText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
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
  lastUpdateText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  suspendedVehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
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
    fontSize: 18,
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
    gap: 12,
    marginTop: 4,
  },
  dataValueSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 1,
  },
  suspensionDetailCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    gap: 12,
  },
  suspensionDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gavelIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suspensionDetailHeading: {
    fontSize: 14,
    fontWeight: '900',
    color: '#991B1B',
  },
  suspensionDetailRow: {
    flexDirection: 'row',
    gap: 12,
  },
  motifBox: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 4,
  },
  motifText: {
    fontSize: 12,
    color: '#7F1D1D',
    fontWeight: '600',
  },
  reincidenciaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F87171',
    marginTop: 4,
  },
  reincidenciaText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '900',
  },
  suspensionVencimientoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
    paddingTop: 10,
  },
  suspensionVencimientoText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 1,
  },
  hoursRemainingBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  hoursRemainingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991B1B',
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
});
