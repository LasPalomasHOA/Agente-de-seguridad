import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Dimensions,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMobile } from '../context/MobileContext';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SupabaseService } from '../services/supabaseService';
import { ReporteInfraccion } from '../types/reporte';
import { Evidencia } from '../types/evidencia';

const RESORT_SLIDES = [
  require('@/assets/images/resort-1.jpg'),
  require('@/assets/images/resort-2.jpg'),
  require('@/assets/images/resort-3.jpg'),
];

export default function HomeDashboard() {
  const { agenteActual, reportes } = useMobile();
  const router = useRouter();

  // Search corbatín
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Background animated crossfade
  const [bgIndex, setBgIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Selected Report Modal
  const [selectedReport, setSelectedReport] = useState<ReporteInfraccion | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0.3,
        duration: 700,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        setBgIndex((prev) => (prev + 1) % RESORT_SLIDES.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      });
    }, 5500);

    return () => clearInterval(timer);
  }, []);

  const misReportes = reportes.filter((r) => r.agenteId === agenteActual.id);
  const pendientesCount = misReportes.filter((r) => r.estado === 'pendiente' || r.estado === 'borrador').length;
  const aprobadosCount = misReportes.filter((r) => r.estado === 'aprobado').length;

  const handleManualSearch = (code?: string) => {
    const target = (code || manualCode).trim();
    if (!target) return;

    router.push({
      pathname: '/scanner',
      params: { corbatinNumero: target },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
      {/* ─── 1. ANIMATED RESORT HERO BANNER WITH CARLOS PROFILE ─── */}
      <View style={styles.heroBannerContainer}>
        <Animated.Image
          source={RESORT_SLIDES[bgIndex]}
          style={[
            styles.heroBannerImg,
            { opacity: fadeAnim },
          ]}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(13, 110, 95, 0.88)', 'rgba(15, 23, 42, 0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.heroBannerContent}>
          {/* Left: Carlos Photo Avatar + Info */}
          <View style={styles.heroLeftCol}>
            <View style={styles.heroAvatarWrap}>
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200' }}
                style={styles.heroAvatarImg}
              />
              <View style={styles.heroLiveDot} />
            </View>

            <View style={styles.heroTextCol}>
              <ThemedText style={styles.heroWelcomeTitle}>
                Bienvenido, Carlos
              </ThemedText>
              <ThemedText style={styles.heroWelcomeSubtitle} numberOfLines={1}>
                Turno Matutino &bull; Caseta Acceso Principal (Sector 4)
              </ThemedText>
            </View>
          </View>

          {/* Right: Live Clock Pill */}
          <View style={styles.liveClockBadge}>
            <View style={styles.liveGreenDot} />
            <ThemedText style={styles.liveClockText}>08:45 AM &bull; En Servicio</ThemedText>
          </View>
        </View>
      </View>

      {/* ─── 2. BALANCED 2 HERO ACTION CARDS ─── */}
      <View style={styles.heroActionsRow}>
        {/* Card 1: Emerald QR Scanner */}
        <Pressable
          onPress={() => router.push('/scanner')}
          style={({ pressed }) => [
            styles.heroActionCardGreen,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={styles.heroActionIconBoxGreen}>
            <Ionicons name="qr-code" size={28} color="#ffffff" />
          </View>
          <View style={styles.heroActionTextBox}>
            <ThemedText style={styles.heroActionTitleGreen}>
              INICIAR ESCANEO QR
            </ThemedText>
            <ThemedText style={styles.heroActionSubtitleGreen}>
              Detección de corbatines vehiculares
            </ThemedText>
          </View>
        </Pressable>

        {/* Card 2: Slate Navy Manual Keypad */}
        <Pressable
          onPress={() => setShowManualInput(!showManualInput)}
          style={({ pressed }) => [
            styles.heroActionCardNavy,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={styles.heroActionIconBoxNavy}>
            <Ionicons name="keypad" size={26} color="#38BDF8" />
          </View>
          <View style={styles.heroActionTextBox}>
            <ThemedText style={styles.heroActionTitleNavy}>
              INGRESO MANUAL
            </ThemedText>
            <ThemedText style={styles.heroActionSubtitleNavy}>
              Búsqueda por número o placas
            </ThemedText>
          </View>
        </Pressable>
      </View>

      {/* Manual Search Expandable Card */}
      {showManualInput && (
        <View style={styles.manualSearchBox}>
          <ThemedText style={styles.manualSearchHeading}>Ingreso Rápido de Corbatín</ThemedText>
          <View style={styles.manualSearchInputRow}>
            <TextInput
              placeholder="Ej. C-102 o 70"
              placeholderTextColor="#94a3b8"
              value={manualCode}
              onChangeText={setManualCode}
              style={styles.manualSearchInput}
              autoCapitalize="characters"
              onSubmitEditing={() => handleManualSearch()}
            />
            <Pressable
              onPress={() => handleManualSearch()}
              style={({ pressed }) => [
                styles.manualSearchSubmitBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <ThemedText style={styles.manualSearchSubmitBtnText}>Buscar</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* ─── 3. STATS & RECENT REPORTS SECTION ─── */}
      <View style={styles.bottomSectionGrid}>
        {/* KPI Cards Column */}
        <View style={styles.summaryCol}>
          <ThemedText style={styles.sectionHeaderTitle}>Resumen Operativo</ThemedText>
          <View style={styles.summaryCardList}>
            {/* KPI 1: Royal Blue */}
            <View style={styles.kpiCard}>
              <View style={styles.kpiIconBoxBlue}>
                <Ionicons name="documents" size={20} color="#2563EB" />
              </View>
              <View>
                <ThemedText style={styles.kpiNumber}>12</ThemedText>
                <ThemedText style={styles.kpiLabel}>Reportes Hoy</ThemedText>
              </View>
            </View>

            {/* KPI 2: Amber Orange */}
            <View style={styles.kpiCard}>
              <View style={styles.kpiIconBoxOrange}>
                <Ionicons name="time" size={20} color="#D97706" />
              </View>
              <View>
                <ThemedText style={styles.kpiNumber}>{pendientesCount}</ThemedText>
                <ThemedText style={styles.kpiLabel}>Pendientes de Envío</ThemedText>
              </View>
            </View>

            {/* KPI 3: Emerald Green */}
            <View style={styles.kpiCard}>
              <View style={styles.kpiIconBoxGreen}>
                <Ionicons name="shield-checkmark" size={20} color="#059669" />
              </View>
              <View>
                <ThemedText style={styles.kpiNumber}>{aprobadosCount || 8}</ThemedText>
                <ThemedText style={styles.kpiLabel}>Dictaminados HOA</ThemedText>
              </View>
            </View>
          </View>
        </View>

        {/* Recent Reports List Column */}
        <View style={styles.reportsCol}>
          <View style={styles.reportsColHeader}>
            <ThemedText style={styles.sectionHeaderTitle}>Reportes Recientes</ThemedText>
            <Pressable onPress={() => router.push('/reports')}>
              <ThemedText style={styles.seeAllLink}>Ver todos &rarr;</ThemedText>
            </Pressable>
          </View>

          <View style={styles.reportItemList}>
            {misReportes.slice(0, 3).map((rep) => {
              const statusColors = {
                pendiente: { bg: '#FEF3C7', text: '#D97706', label: 'Pendiente' },
                aprobado: { bg: '#ECFDF5', text: '#059669', label: 'Aprobado' },
                rechazado: { bg: '#FEF2F2', text: '#DC2626', label: 'Rechazado' },
                borrador: { bg: '#F1F5F9', text: '#475569', label: 'Borrador' },
                informacion_solicitada: { bg: '#EFF6FF', text: '#2563EB', label: 'En Revisión' },
              }[rep.estado] || { bg: '#F1F5F9', text: '#475569', label: rep.estado };

              return (
                <Pressable
                  key={rep.id}
                  onPress={() => setSelectedReport(rep)}
                  style={({ pressed }) => [
                    styles.reportCardRow,
                    pressed && { opacity: 0.9, backgroundColor: '#F8FAFC' },
                  ]}
                >
                  <View style={styles.reportCardLeft}>
                    <View style={styles.reportDocIconBox}>
                      <Ionicons name="document-text-outline" size={18} color="#2563EB" />
                    </View>
                    <View style={{ gap: 2 }}>
                      <ThemedText style={styles.reportCardFolio}>
                        Folio: {rep.folio}
                      </ThemedText>
                      <ThemedText style={styles.reportCardDesc} numberOfLines={1}>
                        {rep.descripcion || rep.infraccionCodigo || 'Incidente en predio'}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={[styles.statusBadgePill, { backgroundColor: statusColors.bg }]}>
                    <ThemedText style={[styles.statusBadgeText, { color: statusColors.text }]}>
                      {statusColors.label}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* ─── 4. INTERACTIVE REPORT INSPECTION MODAL ─── */}
      {selectedReport && (
        <Modal
          visible={!!selectedReport}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedReport(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentCard}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="document-text" size={22} color="#0D6E5F" />
                  <ThemedText style={styles.modalFolioTitle}>
                    Detalle del Folio {selectedReport.folio}
                  </ThemedText>
                </View>
                <Pressable onPress={() => setSelectedReport(null)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color="#64748B" />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
                <View style={styles.modalBody}>
                  <View style={styles.modalFieldBox}>
                    <ThemedText style={styles.modalFieldLabel}>INFRACCIÓN REGISTRADA</ThemedText>
                    <ThemedText style={styles.modalFieldValueBold}>
                      {selectedReport.infraccionCodigo}
                    </ThemedText>
                  </View>

                  <View style={styles.modalFieldBox}>
                    <ThemedText style={styles.modalFieldLabel}>UBICACIÓN DEL INCIDENTE</ThemedText>
                    <ThemedText style={styles.modalFieldValue}>
                      {selectedReport.lugar}
                    </ThemedText>
                  </View>

                  <View style={styles.modalFieldBox}>
                    <ThemedText style={styles.modalFieldLabel}>OBSERVACIONES DE CAMPO</ThemedText>
                    <ThemedText style={styles.modalFieldValue}>
                      {selectedReport.descripcion}
                    </ThemedText>
                  </View>

                  <View style={styles.modalFieldBox}>
                    <ThemedText style={styles.modalFieldLabel}>FECHA Y HORA</ThemedText>
                    <ThemedText style={styles.modalFieldValue}>
                      {selectedReport.fecha} &bull; {selectedReport.hora} hrs
                    </ThemedText>
                  </View>

                  {selectedReport.evidencias && selectedReport.evidencias.length > 0 && (
                    <View style={styles.modalFieldBox}>
                      <ThemedText style={styles.modalFieldLabel}>
                        EVIDENCIAS FOTOGRÁFICAS ({selectedReport.evidencias.length})
                      </ThemedText>
                      <View style={styles.modalPhotosRow}>
                        {selectedReport.evidencias.map((ev: Evidencia) => (
                          <Image key={ev.id} source={{ uri: ev.fotoUrl }} style={styles.modalPhotoThumb} />
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={styles.modalFooterActions}>
                <Pressable
                  onPress={() => setSelectedReport(null)}
                  style={styles.modalClosePrimaryBtn}
                >
                  <ThemedText style={styles.modalClosePrimaryBtnText}>Cerrar Expediente</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    padding: 18,
    paddingBottom: 70,
    gap: 16,
  },
  heroBannerContainer: {
    position: 'relative',
    height: 78,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 2,
  },
  heroBannerImg: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  heroBannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 12,
  },
  heroLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  heroAvatarWrap: {
    position: 'relative',
  },
  heroAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  heroLiveDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  heroTextCol: {
    flex: 1,
    gap: 2,
  },
  heroWelcomeTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  heroWelcomeSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '500',
  },
  liveClockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveClockText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  heroActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroActionCardGreen: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#0D6E5F',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  heroActionIconBoxGreen: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionTextBox: {
    flex: 1,
    gap: 2,
  },
  heroActionTitleGreen: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  heroActionSubtitleGreen: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '500',
  },
  heroActionCardNavy: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  heroActionIconBoxNavy: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionTitleNavy: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  heroActionSubtitleNavy: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  manualSearchBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  manualSearchHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  manualSearchInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualSearchInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  manualSearchSubmitBtn: {
    backgroundColor: '#1E293B',
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSearchSubmitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  bottomSectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  summaryCol: {
    flex: 1,
    minWidth: 260,
    gap: 10,
  },
  reportsCol: {
    flex: 1.4,
    minWidth: 280,
    gap: 10,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  summaryCardList: {
    gap: 10,
  },
  kpiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  kpiIconBoxBlue: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconBoxOrange: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconBoxGreen: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  reportsColHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seeAllLink: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  reportItemList: {
    gap: 10,
  },
  reportCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  reportCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reportDocIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCardFolio: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  reportCardDesc: {
    fontSize: 11.5,
    color: '#64748B',
    maxWidth: 200,
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContentCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
  },
  modalFolioTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    gap: 10,
    paddingVertical: 6,
  },
  modalFieldBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  modalFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  modalFieldValue: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
  },
  modalFieldValueBold: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0D6E5F',
  },
  modalPhotosRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  modalPhotoThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalFooterActions: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  modalClosePrimaryBtn: {
    backgroundColor: '#0D6E5F',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClosePrimaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
});
