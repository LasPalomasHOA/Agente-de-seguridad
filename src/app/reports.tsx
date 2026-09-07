import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Image,
  useWindowDimensions,
  ViewStyle,
  DimensionValue,
  RefreshControl,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useMobile } from '../context/MobileContext';
import { Ionicons } from '@expo/vector-icons';
import { ResortHeader } from '../components/resort-header';
import { ReporteInfraccion } from '../types/reporte';

export default function ReportsScreen() {
  const router = useRouter();
  const { reportes, agenteActual, cargarReportes } = useMobile();
  const { width } = useWindowDimensions();

  // Responsive Breakpoints
  const isMobile = width < 650;
  const isTablet = width >= 650 && width < 1050;
  const isDesktop = width >= 1050 && width < 1450;

  // Refreshing state
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await cargarReportes(true);
    setRefreshing(false);
  };

  // Filters state
  const [searchFolio, setSearchFolio] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedReport, setSelectedReport] = useState<ReporteInfraccion | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);

  const misReportes = useMemo(
    () => reportes.filter((r) => r.agenteId === agenteActual.id),
    [reportes, agenteActual.id]
  );

  // Status counts
  const totalCount = useMemo(() => misReportes.length, [misReportes]);
  const pendientesCount = useMemo(
    () => misReportes.filter((r) => r.estado === 'pendiente' || r.estado === 'informacion_solicitada').length,
    [misReportes]
  );
  const aprobadosCount = useMemo(
    () => misReportes.filter((r) => r.estado === 'aprobado').length,
    [misReportes]
  );
  const rechazadosCount = useMemo(
    () => misReportes.filter((r) => r.estado === 'rechazado').length,
    [misReportes]
  );

  const filtered = useMemo(() => {
    const cleanSearch = searchFolio.toLowerCase().trim();
    const cleanDate = dateFilter.trim();

    return misReportes.filter((rep) => {
      const matchesSearch =
        !cleanSearch ||
        rep.folio.toLowerCase().includes(cleanSearch) ||
        rep.infraccionCodigo.toLowerCase().includes(cleanSearch) ||
        rep.lugar.toLowerCase().includes(cleanSearch) ||
        rep.descripcion.toLowerCase().includes(cleanSearch) ||
        rep.corbatinNumero.toLowerCase().includes(cleanSearch);

      if (cleanDate && !rep.fecha.includes(cleanDate)) {
        return false;
      }

      if (selectedStatus === 'pendiente') {
        return matchesSearch && (rep.estado === 'pendiente' || rep.estado === 'informacion_solicitada');
      }
      if (selectedStatus === 'aprobado') {
        return matchesSearch && rep.estado === 'aprobado';
      }
      if (selectedStatus === 'rechazado') {
        return matchesSearch && rep.estado === 'rechazado';
      }
      if (selectedStatus === 'borrador') {
        return matchesSearch && rep.estado === 'borrador';
      }
      return matchesSearch;
    });
  }, [misReportes, searchFolio, dateFilter, selectedStatus]);

  // Dynamic responsive card style based on screen width
  const getCardStyle = (): ViewStyle => {
    if (isMobile) {
      return { width: '100%' as DimensionValue, minWidth: '100%' as DimensionValue };
    }
    if (isTablet) {
      return { width: '48.8%' as DimensionValue, minWidth: 280, maxWidth: '49.2%' as DimensionValue };
    }
    if (isDesktop) {
      return { width: '32.1%' as DimensionValue, minWidth: 280, maxWidth: '32.6%' as DimensionValue };
    }
    // UltraWide (>= 1450px)
    return { width: '23.8%' as DimensionValue, minWidth: 270, maxWidth: '24.2%' as DimensionValue };
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#0D6E5F']}
          tintColor="#0D6E5F"
        />
      }
    >
      {/* ─── ANIMATED RESORT HEADER ─── */}
      <ResortHeader
        title="Mis Reportes e Infracciones"
        subtitle="Historial operativo de inspecciones y dictámenes HOA."
        rightElement={
          <Pressable
            onPress={() => router.push('/scanner')}
            style={({ pressed }) => [
              styles.miniResortActionBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.96 }] },
            ]}
          >
            <Ionicons name="add-circle" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <ThemedText style={styles.miniResortActionBtnText}>Nuevo Reporte</ThemedText>
          </Pressable>
        }
      />

      {/* ─── METRICS & STATUS SUMMARY BAR ─── */}
      <View style={styles.metricsSummaryRow}>
        <Pressable
          onPress={() => setSelectedStatus('todos')}
          style={[
            styles.metricChip,
            selectedStatus === 'todos' && styles.metricChipActive,
          ]}
        >
          <View style={[styles.metricChipIconBox, { backgroundColor: '#F1F5F9' }]}>
            <Ionicons name="albums-outline" size={16} color="#475569" />
          </View>
          <View>
            <ThemedText style={styles.metricChipCount}>{totalCount}</ThemedText>
            <ThemedText style={styles.metricChipLabel}>Todos</ThemedText>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setSelectedStatus('pendiente')}
          style={[
            styles.metricChip,
            selectedStatus === 'pendiente' && styles.metricChipActiveAmber,
          ]}
        >
          <View style={[styles.metricChipIconBox, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="time-outline" size={16} color="#D97706" />
          </View>
          <View>
            <ThemedText style={[styles.metricChipCount, { color: '#D97706' }]}>{pendientesCount}</ThemedText>
            <ThemedText style={styles.metricChipLabel}>Pendientes</ThemedText>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setSelectedStatus('aprobado')}
          style={[
            styles.metricChip,
            selectedStatus === 'aprobado' && styles.metricChipActiveEmerald,
          ]}
        >
          <View style={[styles.metricChipIconBox, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
          </View>
          <View>
            <ThemedText style={[styles.metricChipCount, { color: '#059669' }]}>{aprobadosCount}</ThemedText>
            <ThemedText style={styles.metricChipLabel}>Aprobados</ThemedText>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setSelectedStatus('rechazado')}
          style={[
            styles.metricChip,
            selectedStatus === 'rechazado' && styles.metricChipActiveRed,
          ]}
        >
          <View style={[styles.metricChipIconBox, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
          </View>
          <View>
            <ThemedText style={[styles.metricChipCount, { color: '#DC2626' }]}>{rechazadosCount}</ThemedText>
            <ThemedText style={styles.metricChipLabel}>Rechazados</ThemedText>
          </View>
        </Pressable>
      </View>

      {/* ─── FILTERS BAR ─── */}
      <View style={styles.filterBarCard}>
        {/* Column 1: Search by Folio, Corbatin, Placas */}
        <View style={styles.filterCol}>
          <ThemedText style={styles.filterLabel}>Buscar por Folio, Corbatín o Placas</ThemedText>
          <View style={styles.filterInputWrapper}>
            <Ionicons name="search" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Ej. LP-90234, 105, o placas..."
              placeholderTextColor="#94a3b8"
              value={searchFolio}
              onChangeText={setSearchFolio}
              style={styles.filterTextInput}
            />
            {searchFolio.length > 0 && (
              <Pressable onPress={() => setSearchFolio('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Column 2: Quick Status Tabs */}
        <View style={styles.filterCol}>
          <ThemedText style={styles.filterLabel}>Filtrar por Estado</ThemedText>
          <View style={styles.statusPillsRow}>
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'pendiente', label: 'Pendientes' },
              { id: 'aprobado', label: 'Aprobados' },
              { id: 'rechazado', label: 'Rechazados' },
            ].map((st) => (
              <Pressable
                key={st.id}
                onPress={() => setSelectedStatus(st.id)}
                style={[
                  styles.filterPill,
                  selectedStatus === st.id && styles.filterPillActive,
                ]}
              >
                <ThemedText
                  style={[
                    styles.filterPillText,
                    selectedStatus === st.id && styles.filterPillTextActive,
                  ]}
                >
                  {st.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Column 3: Date Filter */}
        <View style={[styles.filterCol, { maxWidth: isMobile ? '100%' : 190 }]}>
          <ThemedText style={styles.filterLabel}>Fecha</ThemedText>
          <View style={styles.filterInputWrapper}>
            <Ionicons name="calendar-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="dd/mm/aaaa"
              placeholderTextColor="#94a3b8"
              value={dateFilter}
              onChangeText={setDateFilter}
              style={styles.filterTextInput}
            />
            {dateFilter.length > 0 && (
              <Pressable onPress={() => setDateFilter('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* ─── RESPONSIVE REACTIVE GRID OF REPORT CARDS ─── */}
      {filtered.length === 0 ? (
        /* Empty State */
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="document-text-outline" size={36} color="#94a3b8" />
          </View>
          <ThemedText style={styles.emptyTitle}>No se encontraron reportes</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            {searchFolio || dateFilter || selectedStatus !== 'todos'
              ? 'No hay registros que coincidan con los filtros seleccionados.'
              : 'Aún no has generado ningún reporte durante tu turno.'}
          </ThemedText>
          {(searchFolio || dateFilter || selectedStatus !== 'todos') && (
            <Pressable
              onPress={() => {
                setSearchFolio('');
                setDateFilter('');
                setSelectedStatus('todos');
              }}
              style={styles.clearFiltersBtn}
            >
              <ThemedText style={styles.clearFiltersBtnText}>Restablecer Filtros</ThemedText>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.reportsGridContainer}>
          {filtered.map((rep) => {
            const isAprobado = rep.estado === 'aprobado';
            const isRechazado = rep.estado === 'rechazado';
            const isBorrador = rep.estado === 'borrador';

            const leftColor = isAprobado
              ? '#10B981'
              : isRechazado
              ? '#EF4444'
              : isBorrador
              ? '#94A3B8'
              : '#F59E0B';

            return (
              <Pressable
                key={rep.id}
                onPress={() => setSelectedReport(rep)}
                style={({ pressed }) => [
                  styles.reportGridCard,
                  getCardStyle(),
                  { borderLeftColor: leftColor },
                  pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 },
                ]}
              >
                {/* Header: Folio & Status Badge */}
                <View style={styles.cardHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="document-text" size={17} color="#0D6E5F" />
                    <ThemedText style={styles.cardFolioTitle}>{rep.folio}</ThemedText>
                  </View>

                  {isAprobado && (
                    <View style={styles.badgeAprobado}>
                      <View style={styles.dotGreen} />
                      <ThemedText style={styles.badgeAprobadoText}>Aprobado</ThemedText>
                    </View>
                  )}
                  {isRechazado && (
                    <View style={styles.badgeRechazado}>
                      <View style={styles.dotRed} />
                      <ThemedText style={styles.badgeRechazadoText}>Rechazado</ThemedText>
                    </View>
                  )}
                  {isBorrador && (
                    <View style={styles.badgeBorrador}>
                      <ThemedText style={styles.badgeBorradorText}>Borrador</ThemedText>
                    </View>
                  )}
                  {!isAprobado && !isRechazado && !isBorrador && (
                    <View style={styles.badgePendiente}>
                      <View style={styles.dotOrange} />
                      <ThemedText style={styles.badgePendienteText}>Pendiente</ThemedText>
                    </View>
                  )}
                </View>

                {/* Infracción Code Tag */}
                <View style={styles.infraccionTagRow}>
                  <View style={styles.infraccionCodePill}>
                    <ThemedText style={styles.infraccionCodeText}>{rep.infraccionCodigo || 'INF'}</ThemedText>
                  </View>
                  <ThemedText style={styles.infraccionNameText} numberOfLines={1}>
                    {rep.descripcion || 'Infracción al reglamento'}
                  </ThemedText>
                </View>

                {/* Target Identification Box (Corbatin & Vehicle) */}
                <View style={styles.targetVehicleBox}>
                  <View style={styles.targetIconCircle}>
                    <Ionicons name="car-sport" size={16} color="#0D6E5F" />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <ThemedText style={styles.targetCorbatinTitle}>
                      {rep.corbatinNumero ? `Corbatín #${rep.corbatinNumero.replace(/\D/g, '') || rep.corbatinNumero}` : 'Sin Corbatín'}
                    </ThemedText>
                    <ThemedText style={styles.targetVehicleSub} numberOfLines={1}>
                      📍 {rep.lugar || 'Zona Residencial'}
                    </ThemedText>
                  </View>
                </View>

                {/* Evidence Thumbnails Preview */}
                {rep.evidencias && rep.evidencias.length > 0 && (
                  <View style={styles.evidenciasPreviewRow}>
                    <View style={styles.evidenciaCountChip}>
                      <Ionicons name="camera" size={12} color="#0D6E5F" style={{ marginRight: 4 }} />
                      <ThemedText style={styles.evidenciaCountText}>
                        {rep.evidencias.length} {rep.evidencias.length === 1 ? 'Foto' : 'Fotos'}
                      </ThemedText>
                    </View>
                    <View style={styles.thumbMiniList}>
                      {rep.evidencias.slice(0, 3).map((ev) => (
                        <Image key={ev.id} source={{ uri: ev.fotoUrl }} style={styles.cardMiniPhotoThumb} />
                      ))}
                    </View>
                  </View>
                )}

                {/* Card Footer: Timestamp & Action Link */}
                <View style={styles.cardFooterRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="time-outline" size={13} color="#64748B" />
                    <ThemedText style={styles.cardDateText}>
                      {rep.fecha} &bull; {rep.hora || '08:30'}
                    </ThemedText>
                  </View>
                  <View style={styles.viewDetailsBtnRow}>
                    <ThemedText style={styles.viewDetailsText}>Detalles</ThemedText>
                    <Ionicons name="arrow-forward" size={14} color="#0D6E5F" />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ─── MODAL INSPECTOR DE EXPEDIENTE ─── */}
      {selectedReport && (
        <Modal
          visible={!!selectedReport}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedReport(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="document-text" size={22} color="#0D6E5F" />
                  <View>
                    <ThemedText style={styles.modalTitle}>Expediente {selectedReport.folio}</ThemedText>
                    <ThemedText style={styles.modalSubTitle}>
                      Registrado por {agenteActual?.nombre || 'Oficial en Servicio'}
                    </ThemedText>
                  </View>
                </View>
                <Pressable onPress={() => setSelectedReport(null)} style={styles.modalCloseIconBtn}>
                  <Ionicons name="close" size={22} color="#475569" />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 12, paddingVertical: 8 }}>
                  {/* Status Banner */}
                  <View
                    style={[
                      styles.modalStatusBanner,
                      {
                        backgroundColor:
                          selectedReport.estado === 'aprobado'
                            ? '#ECFDF5'
                            : selectedReport.estado === 'rechazado'
                            ? '#FEF2F2'
                            : '#FEF3C7',
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        selectedReport.estado === 'aprobado'
                          ? 'checkmark-circle'
                          : selectedReport.estado === 'rechazado'
                          ? 'close-circle'
                          : 'time'
                      }
                      size={18}
                      color={
                        selectedReport.estado === 'aprobado'
                          ? '#059669'
                          : selectedReport.estado === 'rechazado'
                          ? '#DC2626'
                          : '#D97706'
                      }
                      style={{ marginRight: 6 }}
                    />
                    <ThemedText
                      style={[
                        styles.modalStatusBannerText,
                        {
                          color:
                            selectedReport.estado === 'aprobado'
                              ? '#059669'
                              : selectedReport.estado === 'rechazado'
                              ? '#DC2626'
                              : '#D97706',
                        },
                      ]}
                    >
                      ESTADO: {selectedReport.estado?.toUpperCase() || 'PENDIENTE'}
                    </ThemedText>
                  </View>

                  {/* Detail Grid */}
                  <View style={styles.modalInfoGrid}>
                    <View style={styles.modalInfoBox}>
                      <ThemedText style={styles.modalInfoLabel}>CÓDIGO DE INFRACCIÓN</ThemedText>
                      <ThemedText style={styles.modalInfoValueBold}>{selectedReport.infraccionCodigo}</ThemedText>
                    </View>
                    <View style={styles.modalInfoBox}>
                      <ThemedText style={styles.modalInfoLabel}>CORBATÍN ASIGNADO</ThemedText>
                      <ThemedText style={styles.modalInfoValueBold}>{selectedReport.corbatinNumero || 'S/C'}</ThemedText>
                    </View>
                  </View>

                  <View style={styles.modalInfoBox}>
                    <ThemedText style={styles.modalInfoLabel}>UBICACIÓN DEL INCIDENTE</ThemedText>
                    <ThemedText style={styles.modalInfoValue}>{selectedReport.lugar}</ThemedText>
                  </View>

                  <View style={styles.modalInfoBox}>
                    <ThemedText style={styles.modalInfoLabel}>OBSERVACIONES DE CAMPO</ThemedText>
                    <ThemedText style={styles.modalInfoValue}>{selectedReport.descripcion}</ThemedText>
                  </View>

                  <View style={styles.modalInfoBox}>
                    <ThemedText style={styles.modalInfoLabel}>FECHA Y HORA DE REGISTRO</ThemedText>
                    <ThemedText style={styles.modalInfoValue}>
                      📅 {selectedReport.fecha} &bull; ⏰ {selectedReport.hora || '08:30'} hrs
                    </ThemedText>
                  </View>

                  {/* Evidencias Grid with zoom on tap */}
                  {selectedReport.evidencias && selectedReport.evidencias.length > 0 && (
                    <View style={styles.modalInfoBox}>
                      <ThemedText style={styles.modalInfoLabel}>
                        EVIDENCIAS FOTOGRÁFICAS ({selectedReport.evidencias.length}) - TOCAR PARA ZOOM
                      </ThemedText>
                      <View style={styles.modalPhotosGrid}>
                        {selectedReport.evidencias.map((ev) => (
                          <Pressable key={ev.id} onPress={() => setZoomPhoto(ev.fotoUrl)}>
                            <Image source={{ uri: ev.fotoUrl }} style={styles.modalPhotoThumbLarge} />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={styles.modalFooterActions}>
                <Pressable
                  onPress={() => setSelectedReport(null)}
                  style={styles.modalCloseButton}
                >
                  <ThemedText style={styles.modalCloseButtonText}>Cerrar Expediente</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ─── LIGHTBOX PHOTO ZOOM MODAL ─── */}
      {zoomPhoto && (
        <Modal visible={!!zoomPhoto} transparent animationType="fade" onRequestClose={() => setZoomPhoto(null)}>
          <View style={styles.lightboxOverlay}>
            <Pressable onPress={() => setZoomPhoto(null)} style={styles.lightboxCloseBtn}>
              <Ionicons name="close" size={28} color="#ffffff" />
            </Pressable>
            <Image source={{ uri: zoomPhoto }} style={styles.lightboxImage} resizeMode="contain" />
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
  miniResortActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  miniResortActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  metricsSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricChip: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  metricChipActive: {
    borderColor: '#0D6E5F',
    backgroundColor: '#E6F4F1',
  },
  metricChipActiveAmber: {
    borderColor: '#D97706',
    backgroundColor: '#FEF3C7',
  },
  metricChipActiveEmerald: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  metricChipActiveRed: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  metricChipIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricChipCount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  metricChipLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  filterBarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  filterCol: {
    flex: 1,
    minWidth: 200,
    gap: 6,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
  },
  filterTextInput: {
    flex: 1,
    height: '100%',
    padding: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  statusPillsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#0D6E5F',
    borderColor: '#0D6E5F',
  },
  filterPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  reportsGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    width: '100%',
  },
  reportGridCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    flexGrow: 1,
    flexShrink: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardFolioTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  badgePendiente: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    gap: 4,
  },
  dotOrange: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
  },
  badgePendienteText: {
    color: '#D97706',
    fontSize: 10.5,
    fontWeight: '800',
  },
  badgeAprobado: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    gap: 4,
  },
  dotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  badgeAprobadoText: {
    color: '#059669',
    fontSize: 10.5,
    fontWeight: '800',
  },
  badgeRechazado: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    gap: 4,
  },
  dotRed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
  },
  badgeRechazadoText: {
    color: '#DC2626',
    fontSize: 10.5,
    fontWeight: '800',
  },
  badgeBorrador: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  badgeBorradorText: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '800',
  },
  infraccionTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infraccionCodePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infraccionCodeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0D6E5F',
  },
  infraccionNameText: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  targetVehicleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  targetIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E6F4F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetCorbatinTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  targetVehicleSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  evidenciasPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  evidenciaCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  evidenciaCountText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0D6E5F',
  },
  thumbMiniList: {
    flexDirection: 'row',
    gap: 6,
  },
  cardMiniPhotoThumb: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginTop: 2,
  },
  cardDateText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  viewDetailsBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailsText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0D6E5F',
  },
  emptyStateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 380,
    lineHeight: 18,
  },
  clearFiltersBtn: {
    marginTop: 6,
    backgroundColor: '#0D6E5F',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearFiltersBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalSubTitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  modalCloseIconBtn: {
    padding: 4,
  },
  modalStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalStatusBannerText: {
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modalInfoGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  modalInfoBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 3,
  },
  modalInfoLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  modalInfoValue: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
  },
  modalInfoValueBold: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0D6E5F',
  },
  modalPhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  modalPhotoThumbLarge: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  modalFooterActions: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  modalCloseButton: {
    backgroundColor: '#0D6E5F',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseButtonText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 50,
    padding: 8,
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
});
