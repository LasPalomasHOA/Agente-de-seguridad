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
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
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
  const [viewerTab, setViewerTab] = useState<'pdf' | 'articulos' | 'infracciones' | 'sanciones' | 'firmas'>('pdf');
  const [copiedLink, setCopiedLink] = useState(false);

  // Consulta directa a la base de datos para obtener reglamentos y su archivo_url
  const fetchReglamentosFromDb = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await SupabaseService.getReglamentos(isRefresh);
      if (data && Array.isArray(data) && data.length > 0) {
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
    if (contextReglamentos && contextReglamentos.length > 0) return contextReglamentos;
    return [];
  }, [dbReglamentos, contextReglamentos]);

  // Filtrado reactivo por texto y vigencia
  const filteredReglamentos = useMemo(() => {
    const cleanSearch = search.toLowerCase().trim();
    return reglamentosList.filter((reg) => {
      const matchesSearch =
        !cleanSearch ||
        (reg.titulo || '').toLowerCase().includes(cleanSearch) ||
        (reg.version || '').toLowerCase().includes(cleanSearch) ||
        (reg.archivo_url || '').toLowerCase().includes(cleanSearch) ||
        String(reg.id_reglamento).includes(cleanSearch);

      if (filterVigente === 'vigentes') return matchesSearch && !!reg.vigente;
      if (filterVigente === 'historicos') return matchesSearch && !reg.vigente;
      return matchesSearch;
    });
  }, [reglamentosList, search, filterVigente]);

  // Función universal para abrir el archivo PDF oficial
  const handleOpenPdf = async (url?: string) => {
    const targetUrl = url || selectedReglamento?.archivo_url;
    if (!targetUrl) {
      Alert.alert(
        'Enlace no disponible',
        'Este reglamento no cuenta con un enlace de archivo_url registrado en la base de datos.'
      );
      return;
    }

    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.open(targetUrl, '_blank');
        } else {
          await Linking.openURL(targetUrl);
        }
      } else {
        await WebBrowser.openBrowserAsync(targetUrl, {
          toolbarColor: '#0D6E5F',
          controlsColor: '#ffffff',
          showTitle: true,
          enableBarCollapsing: true,
        });
      }
    } catch (err) {
      console.warn('Error al abrir visor de documento:', err);
      try {
        await Linking.openURL(targetUrl);
      } catch (linkErr) {
        Alert.alert('Error', 'No se pudo abrir el visor del documento PDF.');
      }
    }
  };

  const handleOpenViewer = (reglamento: ReglamentoRow, initialTab: 'pdf' | 'articulos' = 'pdf') => {
    setSelectedReglamento(reglamento);
    setViewerTab(initialTab);
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
        message: `Reglamento Oficial de Operación y Seguridad Las Palomas Resort (Versión ${selectedReglamento?.version || '2026.1'}). Enlace del documento: ${selectedReglamento?.archivo_url || 'https://laspalomashoa.com/docs/reglamento_v2026_1.pdf'}`,
        url: selectedReglamento?.archivo_url || undefined,
      });
    } catch { }
  };

  const handleCopyLink = () => {
    if (!selectedReglamento?.archivo_url) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(selectedReglamento.archivo_url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const formatFecha = (fechaStr?: string | null) => {
    if (!fechaStr) return '01/09/2026';
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
        subtitle="Marco normativo, estatutos y documentos PDF vigentes de Las Palomas Resort."
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
          placeholder="Buscar por título, versión, link o ID..."
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
            style={[styles.categoryPillText, filterVigente === 'vigentes' && styles.categoryPillTextActive]}
          >
            Vigentes ({reglamentosList.filter((r) => r.vigente).length})
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setFilterVigente('historicos')}
          style={[styles.categoryPill, filterVigente === 'historicos' && styles.categoryPillActive]}
        >
          <ThemedText
            style={[styles.categoryPillText, filterVigente === 'historicos' && styles.categoryPillTextActive]}
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
          {filteredReglamentos.map((reg) => {
            const hasPdfUrl = !!(reg.archivo_url && reg.archivo_url.trim().length > 0);
            return (
              <View key={reg.id_reglamento} style={styles.reglamentoCard}>
                {/* Header de tarjeta */}
                <View style={styles.cardHeader}>
                  <View style={styles.versionBadge}>
                    <Ionicons name="shield-checkmark" size={14} color="#0D6E5F" style={{ marginRight: 5 }} />
                    <ThemedText style={styles.versionText}>Versión {reg.version || 'V2026-1'}</ThemedText>
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

                {/* Banner de Archivo PDF Registrado en la Base de Datos */}
                {hasPdfUrl ? (
                  <View style={styles.pdfBannerBox}>
                    <View style={styles.pdfIconBadge}>
                      <Ionicons name="document-attach" size={18} color="#DC2626" />
                    </View>
                    <View style={styles.pdfInfoCol}>
                      <ThemedText style={styles.pdfBadgeLabel}>DOCUMENTO PDF OFICIAL REGISTRADO</ThemedText>
                      <ThemedText style={styles.pdfUrlLinkText} numberOfLines={1}>
                        {reg.archivo_url}
                      </ThemedText>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.pdfBannerBox, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
                    <Ionicons name="information-circle-outline" size={18} color="#64748B" />
                    <ThemedText style={[styles.pdfBadgeLabel, { color: '#64748B', flex: 1 }]}>
                      Documento normativo digitalizado en sistema
                    </ThemedText>
                  </View>
                )}

                {/* Botones de Acción */}
                <View style={styles.cardActionsRow}>
                  {hasPdfUrl && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.pdfDirectActionBtn,
                        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                      ]}
                      onPress={() => handleOpenPdf(reg.archivo_url)}
                    >
                      <Ionicons name="open-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <ThemedText style={styles.pdfDirectActionText}>Abrir PDF</ThemedText>
                    </Pressable>
                  )}

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      !hasPdfUrl && { flex: 1 },
                      pressed && styles.actionBtnPressed,
                    ]}
                    onPress={() => handleOpenViewer(reg, hasPdfUrl ? 'pdf' : 'articulos')}
                  >
                    <Ionicons
                      name="book-outline"
                      size={16}
                      color={hasPdfUrl ? '#0D6E5F' : '#ffffff'}
                      style={{ marginRight: 6 }}
                    />
                    <ThemedText style={[styles.actionBtnText, hasPdfUrl && { color: '#0D6E5F' }]}>
                      {hasPdfUrl ? 'Ver Visor Completo' : 'Consultar Artículos'}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ─── MODAL VISOR OFICIAL DE REGLAMENTO Y PDF ─── */}
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
              {selectedReglamento?.archivo_url ? (
                <Pressable
                  onPress={() => handleOpenPdf()}
                  style={({ pressed }) => [
                    styles.headerIconButton,
                    pressed && { backgroundColor: '#E2E8F0' },
                  ]}
                >
                  <Ionicons name="open-outline" size={19} color="#0D6E5F" />
                </Pressable>
              ) : null}

              <Pressable
                onPress={handlePrintOrShare}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed && { backgroundColor: '#E2E8F0' },
                ]}
              >
                <Ionicons name="share-outline" size={19} color="#0f172a" />
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
              onPress={() => setViewerTab('pdf')}
              style={[
                styles.modalTabItem,
                viewerTab === 'pdf' && styles.modalTabItemActive,
              ]}
            >
              <Ionicons
                name="document-text"
                size={14}
                color={viewerTab === 'pdf' ? '#0D6E5F' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <ThemedText
                style={[
                  styles.modalTabText,
                  viewerTab === 'pdf' && styles.modalTabTextActive,
                ]}
              >
                Documento PDF
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setViewerTab('articulos')}
              style={[
                styles.modalTabItem,
                viewerTab === 'articulos' && styles.modalTabItemActive,
              ]}
            >
              <Ionicons
                name="list-outline"
                size={14}
                color={viewerTab === 'articulos' ? '#0D6E5F' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <ThemedText
                style={[
                  styles.modalTabText,
                  viewerTab === 'articulos' && styles.modalTabTextActive,
                ]}
              >
                Secciones y Normas
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setViewerTab('sanciones')}
              style={[
                styles.modalTabItem,
                viewerTab === 'sanciones' && styles.modalTabItemActive,
              ]}
            >
              <Ionicons
                name="warning-outline"
                size={14}
                color={viewerTab === 'sanciones' ? '#0D6E5F' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <ThemedText
                style={[
                  styles.modalTabText,
                  viewerTab === 'sanciones' && styles.modalTabTextActive,
                ]}
              >
                Sanciones
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setViewerTab('infracciones')}
              style={[
                styles.modalTabItem,
                viewerTab === 'infracciones' && styles.modalTabItemActive,
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={14}
                color={viewerTab === 'infracciones' ? '#0D6E5F' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <ThemedText
                style={[
                  styles.modalTabText,
                  viewerTab === 'infracciones' && styles.modalTabTextActive,
                ]}
              >
                Infracciones
              </ThemedText>
            </Pressable>

            {selectedReglamento?.aceptaciones && selectedReglamento.aceptaciones.length > 0 && (
              <Pressable
                onPress={() => setViewerTab('firmas')}
                style={[
                  styles.modalTabItem,
                  viewerTab === 'firmas' && styles.modalTabItemActive,
                ]}
              >
                <Ionicons
                  name="create-outline"
                  size={14}
                  color={viewerTab === 'firmas' ? '#0D6E5F' : '#64748B'}
                  style={{ marginRight: 4 }}
                />
                <ThemedText
                  style={[
                    styles.modalTabText,
                    viewerTab === 'firmas' && styles.modalTabTextActive,
                  ]}
                >
                  Firmas ({selectedReglamento.aceptaciones.length})
                </ThemedText>
              </Pressable>
            )}
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
                  Versión: <ThemedText style={{ fontWeight: '800' }}>{selectedReglamento?.version || 'V2026-1'}</ThemedText>
                </ThemedText>
                <ThemedText style={styles.docMetaTag}>
                  Estatus: <ThemedText style={{ fontWeight: '800', color: selectedReglamento?.vigente ? '#065F46' : '#DC2626' }}>{selectedReglamento?.vigente ? 'VIGENTE' : 'HISTÓRICO'}</ThemedText>
                </ThemedText>
                <ThemedText style={styles.docMetaTag}>
                  Emisión: <ThemedText style={{ fontWeight: '800' }}>{formatFecha(selectedReglamento?.fecha_publicacion)}</ThemedText>
                </ThemedText>
              </View>
            </View>

            {/* VISTA 1: DOCUMENTO PDF OFICIAL */}
            {viewerTab === 'pdf' && (
              <View style={styles.pdfViewerHubContainer}>
                {selectedReglamento?.archivo_url ? (
                  <>
                    {/* Tarjeta de Documento Digital */}
                    <View style={styles.pdfFileCard}>
                      <View style={styles.pdfFileHeader}>
                        <View style={styles.pdfLargeIconCircle}>
                          <Ionicons name="document-text" size={32} color="#DC2626" />
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <ThemedText style={styles.pdfFileNameTitle}>
                            {selectedReglamento.archivo_url.split('/').pop() || 'reglamento_oficial.pdf'}
                          </ThemedText>
                          <ThemedText style={styles.pdfFileSub}>
                            Documento PDF Oficial &bull; Servidor Seguro HOA
                          </ThemedText>
                          <ThemedText style={styles.pdfFullUrl} numberOfLines={2}>
                            {selectedReglamento.archivo_url}
                          </ThemedText>
                        </View>
                      </View>

                      {/* Botones de apertura de PDF */}
                      <View style={styles.pdfActionBtnsBox}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.pdfMainOpenBtn,
                            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                          ]}
                          onPress={() => handleOpenPdf()}
                        >
                          <Ionicons name="open" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                          <ThemedText style={styles.pdfMainOpenBtnText}>
                            Abrir en Visor Completo / In-App
                          </ThemedText>
                        </Pressable>

                        <View style={styles.pdfSecondaryBtnsRow}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.pdfSecBtn,
                              pressed && { backgroundColor: '#E2E8F0' },
                            ]}
                            onPress={handlePrintOrShare}
                          >
                            <Ionicons name="share-social-outline" size={16} color="#0f172a" style={{ marginRight: 6 }} />
                            <ThemedText style={styles.pdfSecBtnText}>Compartir</ThemedText>
                          </Pressable>

                          <Pressable
                            style={({ pressed }) => [
                              styles.pdfSecBtn,
                              pressed && { backgroundColor: '#E2E8F0' },
                            ]}
                            onPress={handleCopyLink}
                          >
                            <Ionicons
                              name={copiedLink ? 'checkmark-circle' : 'copy-outline'}
                              size={16}
                              color={copiedLink ? '#10B981' : '#0f172a'}
                              style={{ marginRight: 6 }}
                            />
                            <ThemedText style={[styles.pdfSecBtnText, copiedLink && { color: '#10B981' }]}>
                              {copiedLink ? '¡Enlace Copiado!' : 'Copiar Link'}
                            </ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    </View>

                    {/* Vista Previa Web Embebida si es navegador */}
                    {Platform.OS === 'web' && (
                      <View style={styles.webPreviewWrapper}>
                        <ThemedText style={styles.webPreviewTitle}>
                          Vista Previa Integrada del Documento
                        </ThemedText>
                        {/* Render iframe en Web */}
                        <iframe
                          src={selectedReglamento.archivo_url}
                          title={selectedReglamento.titulo}
                          style={{
                            width: '100%',
                            height: 480,
                            border: '1.5px solid #E2E8F0',
                            borderRadius: 14,
                            backgroundColor: '#f8fafc',
                          }}
                        />
                      </View>
                    )}

                    {/* Resumen del Contenido */}
                    {selectedReglamento.contenido_texto ? (
                      <View style={styles.summaryBox}>
                        <ThemedText style={styles.summaryTitle}>
                          Texto Oficial Digitalizado
                        </ThemedText>
                        <ThemedText style={styles.summaryContent}>
                          {selectedReglamento.contenido_texto}
                        </ThemedText>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.noPdfBox}>
                    <Ionicons name="document-outline" size={42} color="#94a3b8" />
                    <ThemedText style={styles.noPdfTitle}>Enlace PDF no especificado</ThemedText>
                    <ThemedText style={styles.noPdfDesc}>
                      Puedes consultar todas las secciones y artículos normativos en la pestaña contigua.
                    </ThemedText>
                  </View>
                )}
              </View>
            )}

            {/* VISTA 2: SECCIONES Y ARTÍCULOS NORMATIVOS */}
            {viewerTab === 'articulos' && (
              <View style={styles.articlesSection}>
                {selectedReglamento?.contenido_secciones && selectedReglamento.contenido_secciones.length > 0 ? (
                  selectedReglamento.contenido_secciones.map((sec, idx) => (
                    <View key={idx} style={styles.chapterCard}>
                      <ThemedText style={styles.chapterTitle}>{sec.title}</ThemedText>
                      <View style={styles.sectionItemsList}>
                        {sec.items.map((item, itemIdx) => (
                          <View key={itemIdx} style={styles.sectionItemRow}>
                            <View style={styles.itemBulletDot} />
                            <ThemedText style={styles.sectionItemText}>{item}</ThemedText>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  /* Fallback a capítulos estándar */
                  <>
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
                    </View>
                  </>
                )}
              </View>
            )}

            {/* VISTA 3: ESCALA DISCIPLINARIA */}
            {viewerTab === 'sanciones' && (
              <View style={styles.sanctionsSection}>
                <View style={styles.sanctionTierCard}>
                  <View style={[styles.tierHeader, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="information-circle" size={20} color="#D97706" />
                    <ThemedText style={[styles.tierTitle, { color: '#B45309' }]}>1ª Falta &bull; Amonestación Escrita</ThemedText>
                  </View>
                  <View style={styles.tierBody}>
                    <ThemedText style={styles.tierDuration}>Amonestación formal registrada en expediente &bull; Acceso Permitido</ThemedText>
                    <ThemedText style={styles.tierDesc}>
                      Notificación formal registrada en la bitácora digital con fines de apercibimiento administrativo. Se emite folio de reporte oficial.
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.sanctionTierCard}>
                  <View style={[styles.tierHeader, { backgroundColor: '#FFEDD5' }]}>
                    <Ionicons name="time" size={20} color="#EA580C" />
                    <ThemedText style={[styles.tierTitle, { color: '#C2410C' }]}>2ª Falta &bull; Suspensión de 24 a 48 Horas</ThemedText>
                  </View>
                  <View style={styles.tierBody}>
                    <ThemedText style={styles.tierDuration}>Duración: 24 a 48 Horas Continuas &bull; Acceso Bloqueado</ThemedText>
                    <ThemedText style={styles.tierDesc}>
                      Bloqueo reglamentario de acceso vehicular para el vehículo infractor en todas las casetas del complejo.
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.sanctionTierCard}>
                  <View style={[styles.tierHeader, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="ban" size={20} color="#DC2626" />
                    <ThemedText style={[styles.tierTitle, { color: '#B91C1C' }]}>3ª Falta &bull; Suspensión de 1 Semana</ThemedText>
                  </View>
                  <View style={styles.tierBody}>
                    <ThemedText style={styles.tierDuration}>Duración: 7 Días Naturales &bull; Acceso Bloqueado</ThemedText>
                    <ThemedText style={styles.tierDesc}>
                      Bloqueo vehicular por reincidencia reiterada. La unidad queda inhabilitada para cruzar caseta.
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.sanctionTierCard}>
                  <View style={[styles.tierHeader, { backgroundColor: '#7F1D1D' }]}>
                    <Ionicons name="skull" size={20} color="#ffffff" />
                    <ThemedText style={[styles.tierTitle, { color: '#ffffff' }]}>Reincidencia / Falta Grave &bull; Restricción Definitiva</ThemedText>
                  </View>
                  <View style={styles.tierBody}>
                    <ThemedText style={styles.tierDuration}>Duración: Permanente / Indefinido &bull; Acceso Restringido</ThemedText>
                    <ThemedText style={styles.tierDesc}>
                      Veto definitivo del vehículo o colaborador en el predio. Reapertura requiere dictamen de Administración HOA.
                    </ThemedText>
                  </View>
                </View>
              </View>
            )}

            {/* VISTA 4: CATÁLOGO DE INFRACCIONES */}
            {viewerTab === 'infracciones' && (
              <View style={styles.infraccionesGrid}>
                {(selectedReglamento?.infracciones && selectedReglamento.infracciones.length > 0
                  ? selectedReglamento.infracciones
                  : catalogoInfracciones
                ).map((inf) => (
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

            {/* VISTA 5: FIRMAS DE ACEPTACIÓN */}
            {viewerTab === 'firmas' && selectedReglamento?.aceptaciones && (
              <View style={styles.signaturesList}>
                {selectedReglamento.aceptaciones.map((ac) => (
                  <View key={ac.id_aceptacion} style={styles.signatureCard}>
                    <View style={styles.signatureHead}>
                      <Ionicons name="checkmark-done-circle" size={20} color="#10B981" />
                      <ThemedText style={styles.signatureName}>
                        {ac.firma_nombre || 'Representante Acreditado'}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.signatureMeta}>
                      📅 {formatFecha(ac.fecha_hora)} &bull; Empresa ID #{ac.id_empresa} &bull; Usuario #{ac.id_usuario}
                    </ThemedText>
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 80,
    gap: 14,
  },
  miniResortTagBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniResortTagText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPillActive: {
    backgroundColor: '#0D6E5F',
    borderColor: '#0D6E5F',
  },
  categoryPillText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
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
    lineHeight: 15,
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
    lineHeight: 14,
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
    lineHeight: 16,
    color: '#64748B',
    fontWeight: '600',
  },
  pdfBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  pdfIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfInfoCol: {
    flex: 1,
    gap: 2,
  },
  pdfBadgeLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 0.4,
  },
  pdfUrlLinkText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#475569',
    fontWeight: '600',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  pdfDirectActionBtn: {
    flex: 1,
    backgroundColor: '#0D6E5F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  pdfDirectActionText: {
    color: '#ffffff',
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '800',
  },
  actionBtn: {
    flex: 1.2,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionBtnPressed: {
    backgroundColor: '#E2E8F0',
    opacity: 0.9,
  },
  actionBtnText: {
    color: '#334155',
    fontSize: 12.5,
    lineHeight: 16,
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
    paddingHorizontal: 10,
    flexWrap: 'wrap',
  },
  modalTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  modalTabItemActive: {
    borderBottomColor: '#0D6E5F',
  },
  modalTabText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  modalTabTextActive: {
    color: '#0D6E5F',
    fontWeight: '900',
  },
  documentBody: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  officialHeaderBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
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
    marginVertical: 10,
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
  pdfViewerHubContainer: {
    gap: 14,
  },
  pdfFileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  pdfFileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pdfLargeIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfFileNameTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0f172a',
  },
  pdfFileSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  pdfFullUrl: {
    fontSize: 10.5,
    color: '#0D6E5F',
    fontWeight: '600',
  },
  pdfActionBtnsBox: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  pdfMainOpenBtn: {
    backgroundColor: '#0D6E5F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  pdfMainOpenBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
  },
  pdfSecondaryBtnsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pdfSecBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pdfSecBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  webPreviewWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  webPreviewTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  summaryBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0D6E5F',
  },
  summaryContent: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  noPdfBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  noPdfTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },
  noPdfDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
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
    gap: 10,
  },
  chapterTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0D6E5F',
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  sectionItemsList: {
    gap: 8,
  },
  sectionItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0D6E5F',
    marginTop: 6,
  },
  sectionItemText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    fontWeight: '500',
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
    lineHeight: 14,
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
  signaturesList: {
    gap: 10,
  },
  signatureCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  signatureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signatureName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  signatureMeta: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
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
