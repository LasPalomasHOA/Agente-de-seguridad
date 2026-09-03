import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useMobile } from '../context/MobileContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ResortHeader } from '../components/resort-header';
import { ReporteInfraccion } from '../types/reporte';

const { width } = Dimensions.get('window');

export default function ReportsScreen() {
  const router = useRouter();
  const { reportes, agenteActual } = useMobile();

  // Filters state
  const [searchFolio, setSearchFolio] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedReport, setSelectedReport] = useState<ReporteInfraccion | null>(null);

  const misReportes = reportes.filter((r) => r.agenteId === agenteActual.id);

  const filtered = misReportes.filter((rep) => {
    const matchesSearch =
      rep.folio.toLowerCase().includes(searchFolio.toLowerCase()) ||
      rep.infraccionCodigo.toLowerCase().includes(searchFolio.toLowerCase()) ||
      rep.lugar.toLowerCase().includes(searchFolio.toLowerCase()) ||
      rep.descripcion.toLowerCase().includes(searchFolio.toLowerCase()) ||
      rep.corbatinNumero.toLowerCase().includes(searchFolio.toLowerCase());

    if (dateFilter.trim()) {
      if (!rep.fecha.includes(dateFilter.trim())) return false;
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

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
      {/* ─── ANIMATED RESORT HEADER ─── */}
      <ResortHeader
        title="Mis Reportes"
        subtitle="Historial de reportes e inspecciones vehiculares."
        rightElement={
          <Pressable
            onPress={() => router.push('/scanner')}
            style={({ pressed }) => [
              styles.miniResortActionBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.96 }] },
            ]}
          >
            <Ionicons name="add" size={16} color="#ffffff" style={{ marginRight: 2 }} />
            <ThemedText style={styles.miniResortActionBtnText}>Nuevo Reporte</ThemedText>
          </Pressable>
        }
      />

      {/* Filter Bar (3 Columns: Buscar por Folio, Estado, Fecha) */}
      <View style={styles.filterBarCard}>
        {/* Column 1: Buscar por Folio */}
        <View style={styles.filterCol}>
          <ThemedText style={styles.filterLabel}>Buscar por Folio</ThemedText>
          <View style={styles.filterInputWrapper}>
            <Ionicons name="search" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Ej. LP-90234 o placas"
              placeholderTextColor="#94a3b8"
              value={searchFolio}
              onChangeText={setSearchFolio}
              style={styles.filterTextInput}
            />
          </View>
        </View>

        {/* Column 2: Estado */}
        <View style={styles.filterCol}>
          <ThemedText style={styles.filterLabel}>Estado</ThemedText>
          <View style={styles.statusPillsRow}>
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'pendiente', label: 'Pendiente' },
              { id: 'aprobado', label: 'Aprobado' },
              { id: 'rechazado', label: 'Rechazado' },
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

        {/* Column 3: Fecha */}
        <View style={[styles.filterCol, { maxWidth: 180 }]}>
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
          </View>
        </View>
      </View>

      {/* 2x2 Grid of Report Cards matching Image 5 Right */}
      <View style={styles.reportsGrid2x2}>
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
                { borderLeftColor: leftColor },
                pressed && { transform: [{ scale: 0.99 }] },
              ]}
            >
              {/* Card Header: Folio & Status Pill */}
              <View style={styles.cardHeaderRow}>
                <ThemedText style={styles.cardFolioTitle}>{rep.folio}</ThemedText>
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

              {/* Vehicle Description */}
              <ThemedText style={styles.cardVehicleName}>
                {rep.corbatinNumero ? `Corbatín ${rep.corbatinNumero}` : 'Inspección en Predio'}
              </ThemedText>

              {/* Card Footer: Date & Arrow */}
              <View style={styles.cardFooterRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time-outline" size={13} color="#64748B" />
                  <ThemedText style={styles.cardDateText}>{rep.fecha || 'Hoy'}</ThemedText>
                </View>
                <Ionicons name="arrow-forward" size={16} color="#94a3b8" />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Modal Inspector for Full Evidence View */}
      {selectedReport && (
        <Modal
          visible={!!selectedReport}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedReport(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Detalle del Folio {selectedReport.folio}</ThemedText>
                <Pressable onPress={() => setSelectedReport(null)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={22} color="#0f172a" />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 10, paddingVertical: 8 }}>
                  <ThemedText style={styles.modalDetailText}>
                    <ThemedText style={{ fontWeight: 'bold' }}>Infracción:</ThemedText> {selectedReport.infraccionCodigo}
                  </ThemedText>
                  <ThemedText style={styles.modalDetailText}>
                    <ThemedText style={{ fontWeight: 'bold' }}>Lugar:</ThemedText> {selectedReport.lugar}
                  </ThemedText>
                  <ThemedText style={styles.modalDetailText}>
                    <ThemedText style={{ fontWeight: 'bold' }}>Descripción:</ThemedText> {selectedReport.descripcion}
                  </ThemedText>
                  <ThemedText style={styles.modalDetailText}>
                    <ThemedText style={{ fontWeight: 'bold' }}>Fecha y Hora:</ThemedText> {selectedReport.fecha} - {selectedReport.hora} hrs
                  </ThemedText>

                  {/* Evidencias Grid */}
                  <ThemedText style={[styles.modalDetailText, { fontWeight: 'bold', marginTop: 6 }]}>
                    Evidencias Fotográficas ({selectedReport.evidencias?.length || 0}):
                  </ThemedText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {selectedReport.evidencias?.map((ev) => (
                      <Image key={ev.id} source={{ uri: ev.fotoUrl }} style={styles.modalPhotoThumb} />
                    ))}
                  </View>
                </View>
              </ScrollView>

              <Pressable
                onPress={() => setSelectedReport(null)}
                style={styles.modalCloseButton}
              >
                <ThemedText style={styles.modalCloseButtonText}>Cerrar Expediente</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    padding: 20,
    paddingBottom: 70,
    gap: 20,
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
    fontSize: 11.5,
    fontWeight: '900',
  },
  filterBarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  filterCol: {
    flex: 1,
    minWidth: 180,
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
    paddingHorizontal: 10,
  },
  filterTextInput: {
    flex: 1,
    height: '100%',
    padding: 0,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0f172a',
  },
  statusPillsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  reportsGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  reportGridCard: {
    width: '48.5%',
    minWidth: 260,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardFolioTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  cardVehicleName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  cardDateText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  badgePendiente: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 8,
  },
  badgeBorradorText: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalDetailText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  modalPhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalCloseButton: {
    backgroundColor: '#0D6E5F',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  modalCloseButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
