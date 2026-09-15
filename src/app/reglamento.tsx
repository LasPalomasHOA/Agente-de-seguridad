import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  Share,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { ResortHeader } from '../components/resort-header';
import { useMobile } from '../context/MobileContext';
import { SupabaseService } from '../services/supabaseService';
import { ReglamentoRow } from '../types/database';

export default function ReglamentoScreen() {
  const { reglamentos: contextReglamentos, catalogoInfracciones, cargarCatalogo } = useMobile();
  const [dbReglamentos, setDbReglamentos] = useState<ReglamentoRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [search, setSearch] = useState('');
  const [filterVigente, setFilterVigente] = useState<'todos' | 'vigentes' | 'historicos'>('todos');

  // Estado para el Visor Oficial de Documento PDF / Reglamento
  const [selectedReglamento, setSelectedReglamento] = useState<ReglamentoRow | null>(null);
  const [viewerModalVisible, setViewerModalVisible] = useState<boolean>(false);
  const [viewerTab, setViewerTab] = useState<'articulos' | 'infracciones' | 'sanciones'>('articulos');

  // Consulta directa a la tabla reglamentos en la base de datos
  const fetchReglamentosFromDb = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await SupabaseService.getReglamentos(isRefresh);
      if (data && Array.isArray(data)) {
        setDbReglamentos(data);
      }
    } catch (e) {
      console.warn('[ReglamentoScreen] Error al consultar tabla reglamentos:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReglamentosFromDb(false);
  }, [fetchReglamentosFromDb]);

  // Lista combinada (priorizando datos directos de la BD)
  const reglamentosList = useMemo(() => {
    if (dbReglamentos.length > 0) return dbReglamentos;
    return contextReglamentos || [];
  }, [dbReglamentos, contextReglamentos]);

  // Filtrado reactivo por texto y vigencia
  const filteredReglamentos = useMemo(() => {
    const cleanSearch = search.toLowerCase().trim();
    return reglamentosList.filter((reg) => {
      const matchesSearch =
        !cleanSearch ||
        (reg.titulo || '').toLowerCase().includes(cleanSearch) ||
        (reg.version || '').toLowerCase().includes(cleanSearch) ||
        String(reg.id_reglamento).includes(cleanSearch);

      if (filterVigente === 'vigentes') return matchesSearch && !!reg.vigente;
      if (filterVigente === 'historicos') return matchesSearch && !reg.vigente;
      return matchesSearch;
    });
  }, [reglamentosList, search, filterVigente]);

  const handleOpenViewer = (reglamento: ReglamentoRow) => {
    setSelectedReglamento(reglamento);
    setViewerTab('articulos');
    setViewerModalVisible(true);
  };

  const handlePrintOrShare = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.print) {
      window.print();
      return;
    }
    try {
      await Share.share({
        title: selectedReglamento?.titulo || 'Reglamento Oficial HOA',
        message: `Reglamento Oficial de Operación y Seguridad Las Palomas Resort (Versión ${selectedReglamento?.version || '2026.1'}). Consulta con el Comité de Seguridad HOA.`,
      });
    } catch {}
  };

  const formatFecha = (fechaStr?: string | null) => {
    if (!fechaStr) return 'Fecha no especificada';
    try {
      const clean = fechaStr.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return clean;
    } catch {
      return fechaStr;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            fetchReglamentosFromDb(true);
            cargarCatalogo(true);
          }}
          tintColor="#0D6E5F"
          colors={['#0D6E5F']}
        />
      }
    >
      {/* ─── ENCABEZADO RESORT HOA ─── */}
      <ResortHeader
        title="Reglamentos Oficiales HOA"
        subtitle="Marco normativo, estatutos y documentos vigentes de Las Palomas Resort."
        rightElement={
          <View style={styles.miniResortTagBadge}>
            <ThemedText style={styles.miniResortTagText}>
              {reglamentosList.length} {reglamentosList.length === 1 ? 'Reglamento' : 'Reglamentos'}
            </ThemedText>
          </View>
        }
      />

      {/* ─── BUSCADOR ─── */}
      <View style={styles.searchBarWrapper}>
        <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
        <TextInput
          placeholder="Buscar por título, versión o ID de reglamento..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          style={styles.searchTextInput}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {/* ─── FILTROS DE VIGENCIA ─── */}
      <View style={styles.categoryPillsRow}>
        <Pressable
          onPress={() => setFilterVigente('todos')}
          style={[styles.categoryPill, filterVigente === 'todos' && styles.categoryPillActive]}
        >
          <ThemedText
            style={[styles.categoryPillText, filterVigente === 'todos' && styles.categoryPillTextActive]}
          >
            Todos ({reglamentosList.length})
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setFilterVigente('vigentes')}
          style={[styles.categoryPill, filterVigente === 'vigentes' && styles.categoryPillActive]}
        >
          <ThemedText
            style={[styles.categoryPillText, filterVigente === 'vigentes' && styles.categoryPillActive]}
          >
            Vigentes ({reglamentosList.filter((r) => r.vigente).length})
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setFilterVigente('historicos')}
          style={[styles.categoryPill, filterVigente === 'historicos' && styles.categoryPillActive]}
        >
          <ThemedText
            style={[styles.categoryPillText, filterVigente === 'historicos' && styles.categoryPillActive]}
          >
            Históricos ({reglamentosList.filter((r) => !r.vigente).length})
          </ThemedText>
        </Pressable>
      </View>

      {/* ─── LISTADO DE REGLAMENTOS DE LA BD ─── */}
      {loading && reglamentosList.length === 0 ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#0D6E5F" />
          <ThemedText style={styles.stateText}>Consultando tabla "reglamentos" en la base de datos...</ThemedText>
        </View>
      ) : filteredReglamentos.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="documents-outline" size={48} color="#94a3b8" />
          <ThemedText style={[styles.stateText, { textAlign: 'center', maxWidth: 280 }]}>
            No se encontraron reglamentos registrados en la tabla oficial para este filtro.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.reglamentosList}>
          {filteredReglamentos.map((reg) => (
            <View key={reg.id_reglamento} style={styles.reglamentoCard}>
              {/* Header de tarjeta */}
              <View style={styles.cardHeader}>
                <View style={styles.versionBadge}>
                  <Ionicons name="shield-checkmark" size={14} color="#0D6E5F" style={{ marginRight: 5 }} />
                  <ThemedText style={styles.versionText}>Versión {reg.version || '2026.1'}</ThemedText>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    reg.vigente ? styles.statusPillActive : styles.statusPillInactive,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: reg.vigente ? '#10B981' : '#94A3B8' },
                    ]}
                  />
                  <ThemedText
                    style={[
                      styles.statusPillText,
                      { color: reg.vigente ? '#065F46' : '#475569' },
                    ]}
                  >
                    {reg.vigente ? 'VIGENTE' : 'HISTÓRICO'}
                  </ThemedText>
                </View>
              </View>

              {/* Título Oficial */}
              <ThemedText style={styles.regTitulo}>{reg.titulo}</ThemedText>

              {/* Metadatos */}
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={14} color="#64748B" />
                  <ThemedText style={styles.metaText}>
                    Publicación: {formatFecha(reg.fecha_publicacion)}
                  </ThemedText>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="key-outline" size={14} color="#64748B" />
                  <ThemedText style={styles.metaText}>ID #{reg.id_reglamento}</ThemedText>
                </View>
              </View>

              {/* Botón para abrir el Visor Integrado Oficial */}
              <View style={styles.cardFooter}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    pressed && styles.actionBtnPressed,
                  ]}
                  onPress={() => handleOpenViewer(reg)}
                >
                  <Ionicons
                    name="document-text"
                    size={17}
                    color="#ffffff"
                    style={{ marginRight: 8 }}
                  />
                  <ThemedText style={styles.actionBtnText}>
                    Ver Reglamento Oficial (PDF / Visor)
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ─── MODAL VISOR OFICIAL DE REGLAMENTO Y ARTÍCULOS ─── */}
      <Modal
        visible={viewerModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setViewerModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* Header del Modal */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Ionicons name="shield-checkmark" size={16} color="#0D6E5F" />
                <ThemedText style={styles.modalSubHeader}>
                  DOCUMENTO OFICIAL LAS PALOMAS HOA
                </ThemedText>
              </View>
              <ThemedText style={styles.modalTitle} numberOfLines={1}>
                {selectedReglamento?.titulo || 'Reglamento Oficial'}
              </ThemedText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={handlePrintOrShare}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed && { backgroundColor: '#E2E8F0' },
                ]}
              >
                <Ionicons name="print-outline" size={20} color="#0f172a" />
              </Pressable>
              <Pressable
                onPress={() => setViewerModalVisible(false)}
                style={({ pressed }) => [
                  styles.closeModalButton,
                  pressed && { backgroundColor: '#E2E8F0' },
                ]}
              >
                <Ionicons name="close" size={22} color="#0f172a" />
              </Pressable>
            </View>
          </View>

          {/* Selector de Pestañas del Documento */}
          <View style={styles.modalTabsRow}>
            <Pressable
              onPress={() => setViewerTab('articulos')}
              style={[
                styles.modalTabItem,
                viewerTab === 'articulos' && styles.modalTabItemActive,
              ]}
            >
              <ThemedText
                style={[
                  styles.modalTabText,
                  viewerTab === 'articulos' && styles.modalTabTextActive,
                ]}
              >
                Artículos Oficiales
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setViewerTab('sanciones')}
              style={[
                styles.modalTabItem,
                viewerTab === 'sanciones' && styles.modalTabItemActive,
              ]}
            >
              <ThemedText
                style={[
                  styles.modalTabText,
                  viewerTab === 'sanciones' && styles.modalTabTextActive,
                ]}
              >
                Escala Disciplinaria
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setViewerTab('infracciones')}
              style={[
                styles.modalTabItem,
                viewerTab === 'infracciones' && styles.modalTabItemActive,
              ]}
            >
              <ThemedText
                style={[
                  styles.modalTabText,
                  viewerTab === 'infracciones' && styles.modalTabTextActive,
                ]}
              >
                Catálogo de Códigos ({catalogoInfracciones.length})
              </ThemedText>
            </Pressable>
          </View>

          {/* Cuerpo del Documento */}
          <ScrollView contentContainerStyle={styles.documentBody} showsVerticalScrollIndicator={false}>
            {/* Membrete Oficial */}
            <View style={styles.officialHeaderBanner}>
              <ThemedText style={styles.resortTitleText}>
                LAS PALOMAS BEACH & GOLF RESORT
              </ThemedText>
              <ThemedText style={styles.resortSubTitleText}>
                ASOCIACIÓN DE CONDÓMINOS HOA &bull; DIRECCIÓN DE SEGURIDAD Y CONTROL DE ACCESO
              </ThemedText>
              <View style={styles.docDivider} />
              <View style={styles.docMetaGrid}>
                <ThemedText style={styles.docMetaTag}>
                  Versión Oficial: <ThemedText style={{ fontWeight: '800' }}>{selectedReglamento?.version || '2026.1'}</ThemedText>
                </ThemedText>
                <ThemedText style={styles.docMetaTag}>
                  Estatus: <ThemedText style={{ fontWeight: '800', color: selectedReglamento?.vigente ? '#065F46' : '#DC2626' }}>{selectedReglamento?.vigente ? 'VIGENTE' : 'HISTÓRICO'}</ThemedText>
                </ThemedText>
                <ThemedText style={styles.docMetaTag}>
                  Emisión: <ThemedText style={{ fontWeight: '800' }}>{formatFecha(selectedReglamento?.fecha_publicacion)}</ThemedText>
                </ThemedText>
              </View>
            </View>

            {/* VISTA 1: ARTÍCULOS NORMATIVOS */}
            {viewerTab === 'articulos' && (
              <View style={styles.articlesSection}>
                {/* CAPÍTULO I */}
                <View style={styles.chapterCard}>
                  <ThemedText style={styles.chapterTitle}>CAPÍTULO I &bull; DISPOSICIONES GENERALES</ThemedText>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 1 (Objeto y Ámbito de Aplicación):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      El presente reglamento tiene por objeto normar, ordenar y salvaguardar la seguridad, tranquilidad, patrimonio y control de acceso vehicular y peatonal para todos los contratistas, proveedores, prestadores de servicios y trabajadores que ingresen al desarrollo habitacional y turístico Las Palomas Beach & Golf Resort.
                    </ThemedText>
                  </View>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 2 (Obligatoriedad):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      El cumplimiento de las normas aquí establecidas es de carácter estricto e irrenunciable para toda empresa, contratista o persona física acreditada. El desconocimiento del presente reglamento no exime de su observancia ni de las sanciones aplicables.
                    </ThemedText>
                  </View>
                </View>

                {/* CAPÍTULO II */}
                <View style={styles.chapterCard}>
                  <ThemedText style={styles.chapterTitle}>CAPÍTULO II &bull; IDENTIFICACIÓN Y CORBATINES</ThemedText>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 3 (Uso Obligatorio de Corbatín):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      Todo vehículo de contratista o proveedor autorizado deberá portar de manera visible en el espejo retrovisor interior el corbatín numerado oficial emitido por la Administración HOA durante toda su permanencia dentro de las instalaciones.
                    </ThemedText>
                  </View>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 4 (Verificación Digital en Caseta):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      Al ingresar o salir por cualquiera de las casetas de control, el oficial en turno escaneará el código QR del corbatín y verificará que las placas, marca, modelo y conductor coincidan con el registro digital del sistema. Queda prohibido el traspaso o préstamo no autorizado de corbatines.
                    </ThemedText>
                  </View>
                </View>

                {/* CAPÍTULO III */}
                <View style={styles.chapterCard}>
                  <ThemedText style={styles.chapterTitle}>CAPÍTULO III &bull; CIRCULACIÓN VIAL Y VELOCIDAD</ThemedText>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 5 (Límite Máximo de Velocidad):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      La velocidad máxima permitida dentro del desarrollo es de <ThemedText style={{ fontWeight: '800' }}>20 km/h</ThemedText> en avenidas principales y <ThemedText style={{ fontWeight: '800' }}>10 km/h</ThemedText> en zonas de estacionamiento y andadores peatonales.
                    </ThemedText>
                  </View>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 6 (Prioridad Peatonal):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      Los residentes, peatones, huéspedes y carritos de golf tienen derecho de paso primordial en todas las intersecciones y vías de circulación del complejo.
                    </ThemedText>
                  </View>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 7 (Estacionamiento):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      Queda estrictamente prohibido estacionarse sobre banquetas, áreas verdes, cajones asignados a residentes, rampas de personas con discapacidad o bloqueando hidrantes y vialidades de emergencia.
                    </ThemedText>
                  </View>
                </View>

                {/* CAPÍTULO IV */}
                <View style={styles.chapterCard}>
                  <ThemedText style={styles.chapterTitle}>CAPÍTULO IV &bull; HORARIOS Y RUIDO</ThemedText>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 8 (Horarios de Trabajo Autorizados):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      Las labores de construcción, mantenimiento y descarga de materiales solo están permitidas de <ThemedText style={{ fontWeight: '800' }}>Lunes a Viernes de 08:00 a 17:00 hrs</ThemedText> y <ThemedText style={{ fontWeight: '800' }}>Sábados de 08:00 a 13:00 hrs</ThemedText>. Queda terminantemente prohibida toda actividad ruidosa o de obra los días domingos y días festivos oficiales.
                    </ThemedText>
                  </View>
                  <View style={styles.articleBox}>
                    <ThemedText style={styles.articleNumber}>Artículo 9 (Control de Ruido):</ThemedText>
                    <ThemedText style={styles.articleText}>
                      Queda prohibido el uso de bocinas, música a volumen excesivo y cualquier emisión sonora que perturbe la tranquilidad de la comunidad residencial.
                    </ThemedText>
                  </View>
                </View>
              </View>
            )}

            {/* VISTA 2: ESCALA DISCIPLINARIA */}
            {viewerTab === 'sanciones' && (
              <View style={styles.sanctionsSection}>
                <View style={styles.sanctionTierCard}>
                  <View style={[styles.tierHeader, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="information-circle" size={20} color="#D97706" />
                    <ThemedText style={[styles.tierTitle, { color: '#B45309' }]}>1ª Falta &bull; Llamado de Atención</ThemedText>
                  </View>
                  <View style={styles.tierBody}>
                    <ThemedText style={styles.tierDuration}>Duración: Informativo &bull; Acceso Permitido</ThemedText>
                    <ThemedText style={styles.tierDesc}>
                      Notificación formal registrada en la bitácora digital con fines de apercibimiento administrativo. Se emite folio de reporte oficial sin bloqueo de caseta.
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.sanctionTierCard}>
                  <View style={[styles.tierHeader, { backgroundColor: '#FFEDD5' }]}>
                    <Ionicons name="time" size={20} color="#EA580C" />
                    <ThemedText style={[styles.tierTitle, { color: '#C2410C' }]}>2ª Falta &bull; Suspensión Temporal (24 Horas)</ThemedText>
                  </View>
                  <View style={styles.tierBody}>
                    <ThemedText style={styles.tierDuration}>Duración: 24 Horas Continuas (1 Día) &bull; Acceso Bloqueado</ThemedText>
                    <ThemedText style={styles.tierDesc}>
                      Bloqueo reglamentario de acceso vehicular para el vehículo infractor. La suspensión concluye exactamente a las 24 horas del reporte.
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.sanctionTierCard}>
                  <View style={[styles.tierHeader, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="ban" size={20} color="#DC2626" />
                    <ThemedText style={[styles.tierTitle, { color: '#B91C1C' }]}>3ª Falta &bull; Suspensión de 1 Semana (7 Días)</ThemedText>
                  </View>
                  <View style={styles.tierBody}>
                    <ThemedText style={styles.tierDuration}>Duración: 168 Horas (7 Días) &bull; Acceso Bloqueado</ThemedText>
                    <ThemedText style={styles.tierDesc}>
                      Bloqueo vehicular por reincidencia reiterada. La unidad quedará inhabilitada para cruzar caseta durante una semana completa.
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.sanctionTierCard}>
                  <View style={[styles.tierHeader, { backgroundColor: '#7F1D1D' }]}>
                    <Ionicons name="skull" size={20} color="#ffffff" />
                    <ThemedText style={[styles.tierTitle, { color: '#ffffff' }]}>4ª Falta o Más &bull; Lista Negra Permanente</ThemedText>
                  </View>
                  <View style={styles.tierBody}>
                    <ThemedText style={styles.tierDuration}>Duración: Permanente / Indefinido &bull; Acceso Restringido</ThemedText>
                    <ThemedText style={styles.tierDesc}>
                      Veto definitivo del vehículo en el complejo habitacional. Cualquier reapertura o reconsideración requiere solicitud formal ante la Administración y Comité HOA.
                    </ThemedText>
                  </View>
                </View>
              </View>
            )}

            {/* VISTA 3: CATÁLOGO DE CÓDIGOS DE INFRACCIÓN */}
            {viewerTab === 'infracciones' && (
              <View style={styles.infraccionesGrid}>
                {catalogoInfracciones.map((inf) => (
                  <View key={inf.id_infraccion || inf.codigo} style={styles.infractionItemCard}>
                    <View style={styles.infHeaderRow}>
                      <View style={styles.infCodeBadge}>
                        <ThemedText style={styles.infCodeText}>{inf.codigo}</ThemedText>
                      </View>
                      <ThemedText style={styles.infCategoryText}>{inf.categoria}</ThemedText>
                    </View>
                    <ThemedText style={styles.infTitleText}>{inf.nombre}</ThemedText>
                    <ThemedText style={styles.infDescText}>{inf.descripcion}</ThemedText>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Footer del Modal */}
          <View style={styles.modalFooter}>
            <Pressable
              style={styles.closeFooterBtn}
              onPress={() => setViewerModalVisible(false)}
            >
              <ThemedText style={styles.closeFooterBtnText}>Cerrar Documento</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    padding: 18,
    paddingBottom: 70,
    gap: 16,
  },
  miniResortTagBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  miniResortTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 46,
  },
  searchTextInput: {
    flex: 1,
    height: '100%',
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  categoryPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  categoryPillActive: {
    backgroundColor: '#0D6E5F',
    borderColor: '#0D6E5F',
  },
  categoryPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  categoryPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  stateBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  reglamentosList: {
    gap: 14,
  },
  reglamentoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  versionText: {
    color: '#0D6E5F',
    fontSize: 11.5,
    fontWeight: '800',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    gap: 5,
  },
  statusPillActive: {
    backgroundColor: '#D1FAE5',
  },
  statusPillInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  regTitulo: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0f172a',
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  cardFooter: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  actionBtn: {
    backgroundColor: '#0D6E5F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnPressed: {
    backgroundColor: '#0A554A',
    opacity: 0.9,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  // ─── MODAL STYLES ───
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalSubHeader: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#0D6E5F',
    letterSpacing: 0.6,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 14,
  },
  modalTabItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modalTabItemActive: {
    borderBottomColor: '#0D6E5F',
  },
  modalTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalTabTextActive: {
    color: '#0D6E5F',
    fontWeight: '900',
  },
  documentBody: {
    padding: 18,
    paddingBottom: 40,
    gap: 16,
  },
  officialHeaderBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  resortTitleText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0D6E5F',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  resortSubTitleText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 3,
    textAlign: 'center',
  },
  docDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  docMetaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    flexWrap: 'wrap',
    gap: 8,
  },
  docMetaTag: {
    fontSize: 11,
    color: '#475569',
  },
  articlesSection: {
    gap: 14,
  },
  chapterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  chapterTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0D6E5F',
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  articleBox: {
    gap: 4,
  },
  articleNumber: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  articleText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  sanctionsSection: {
    gap: 12,
  },
  sanctionTierCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  tierTitle: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  tierBody: {
    padding: 14,
    gap: 6,
  },
  tierDuration: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  tierDesc: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },
  infraccionesGrid: {
    gap: 10,
  },
  infractionItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  infHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  infCodeBadge: {
    backgroundColor: '#0D6E5F',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  infCodeText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '900',
  },
  infCategoryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  infTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  infDescText: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },
  modalFooter: {
    padding: 14,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  closeFooterBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeFooterBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
});
