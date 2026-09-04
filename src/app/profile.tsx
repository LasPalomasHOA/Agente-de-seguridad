import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Modal, Image, useWindowDimensions } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMobile } from '../context/MobileContext';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { SupabaseService } from '../services/supabaseService';
import { CatalogoInfraccionRow } from '../types/database';

export default function ProfileScreen() {
  const { agenteActual, reportes, logout, themeMode, toggleTheme } = useMobile();
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // Modal references
  const [helpVisible, setHelpVisible] = useState(false);
  const [rulesVisible, setRulesVisible] = useState(false);
  const [infracciones, setInfracciones] = useState<CatalogoInfraccionRow[]>([]);

  useEffect(() => {
    SupabaseService.getCatalogoInfracciones().then(setInfracciones);
  }, []);

  // Stats calculation
  const misReportes = (reportes || []).filter((r: any) => r.agenteId === agenteActual?.id);
  const pendientes = misReportes.filter((r: any) => r.estado === 'pendiente' || r.estado === 'informacion_solicitada').length;
  const aprobados = misReportes.filter((r: any) => r.estado === 'aprobado').length;

  const isTablet = width >= 600;

  // 1. OFFICER PROFILE BADGE CARD
  const renderProfileCard = () => (
    <View
      style={[
        styles.profileCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <Image
        source={require('../../assets/images/lp-logo.png')}
        style={{ width: 210, height: 56, marginBottom: 14 }}
        resizeMode="contain"
      />

      <View
        style={[
          styles.avatarContainer,
          { backgroundColor: theme.primaryLight || '#E6F4F1', borderColor: theme.primary },
        ]}
      >
        <ThemedText style={[styles.avatarText, { color: theme.primary }]}>
          {(agenteActual?.nombre || 'Oficial')
            .split(' ')
            .map((n: string) => n[0] || '')
            .join('')}
        </ThemedText>
        <View style={[styles.statusIndicator, { backgroundColor: theme.success }]} />
      </View>

      <ThemedText type="smallBold" style={[styles.profileName, { color: theme.text }]}>
        {agenteActual.nombre}
      </ThemedText>
      <ThemedText style={[styles.profileSub, { color: theme.primary }]}>
        Personal de Vigilancia y Recorrido
      </ThemedText>
      <ThemedText style={[styles.employeeNum, { color: theme.textSecondary }]}>
        No. Empleado: {agenteActual.numEmpleado}
      </ThemedText>
    </View>
  );

  // 2. SHIFT & SECTOR DETAILS
  const renderShiftDetails = () => (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <ThemedText
        type="smallBold"
        style={[styles.sectionTitle, { color: theme.textSecondary, borderBottomColor: theme.border }]}
      >
        Detalles de Turno
      </ThemedText>

      <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
        <ThemedText style={[styles.infoLabel, { color: theme.textSecondary }]}>Turno Asignado:</ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.text }}>
          {agenteActual.turno}
        </ThemedText>
      </View>

      <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
        <ThemedText style={[styles.infoLabel, { color: theme.textSecondary }]}>Zona de Patrullaje:</ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.text }}>
          {agenteActual.zona}
        </ThemedText>
      </View>

      <View style={styles.infoRow}>
        <ThemedText style={[styles.infoLabel, { color: theme.textSecondary }]}>Estado de Servicio:</ThemedText>
        <View style={styles.stateBadge}>
          <View style={[styles.stateDot, { backgroundColor: theme.success }]} />
          <ThemedText type="smallBold" style={{ color: theme.success, fontSize: 12 }}>
            En Guardia Activa
          </ThemedText>
        </View>
      </View>
    </View>
  );

  // 3. EMERGENCY CONTACT DIRECTORY (Fills space on tablet with high-value info)
  const renderDirectoryCard = () => (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <ThemedText
        type="smallBold"
        style={[styles.sectionTitle, { color: theme.textSecondary, borderBottomColor: theme.border }]}
      >
        Directorio Operativo de Emergencia
      </ThemedText>

      <View style={[styles.directoryItem, { borderBottomColor: theme.border }]}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.text }}>
            Supervisor en Turno
          </ThemedText>
          <ThemedText style={{ fontSize: 11, color: theme.textSecondary }}>
            Ing. Morales &bull; Ext. 104
          </ThemedText>
        </View>
        <View style={[styles.contactPill, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="call-outline" size={13} color={theme.primary} />
          <ThemedText style={{ fontSize: 11, fontWeight: 'bold', color: theme.primary }}>Llamar</ThemedText>
        </View>
      </View>

      <View style={[styles.directoryItem, { borderBottomColor: theme.border }]}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.text }}>
            Caseta Principal
          </ThemedText>
          <ThemedText style={{ fontSize: 11, color: theme.textSecondary }}>
            Acceso Norte &bull; Ext. 100
          </ThemedText>
        </View>
        <View style={[styles.contactPill, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="call-outline" size={13} color={theme.primary} />
          <ThemedText style={{ fontSize: 11, fontWeight: 'bold', color: theme.primary }}>Llamar</ThemedText>
        </View>
      </View>

      <View style={styles.directoryItem}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.text }}>
            Administración HOA
          </ThemedText>
          <ThemedText style={{ fontSize: 11, color: theme.textSecondary }}>
            Oficinas Generales &bull; Ext. 200
          </ThemedText>
        </View>
        <View style={[styles.contactPill, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="call-outline" size={13} color={theme.primary} />
          <ThemedText style={{ fontSize: 11, fontWeight: 'bold', color: theme.primary }}>Llamar</ThemedText>
        </View>
      </View>
    </View>
  );

  // 4. PERFORMANCE STATS
  const renderPerformanceStats = () => (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <ThemedText
        type="smallBold"
        style={[styles.sectionTitle, { color: theme.textSecondary, borderBottomColor: theme.border }]}
      >
        Rendimiento del Turno
      </ThemedText>

      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <ThemedText type="subtitle" style={[styles.statVal, { color: theme.text }]}>
            {misReportes.length}
          </ThemedText>
          <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>Realizados</ThemedText>
        </View>

        <View style={[styles.statBox, { borderLeftWidth: 1.5, borderLeftColor: theme.border }]}>
          <ThemedText type="subtitle" style={[styles.statVal, { color: theme.success }]}>
            {aprobados}
          </ThemedText>
          <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>Aprobados</ThemedText>
        </View>

        <View style={[styles.statBox, { borderLeftWidth: 1.5, borderLeftColor: theme.border }]}>
          <ThemedText type="subtitle" style={[styles.statVal, { color: theme.warning }]}>
            {pendientes}
          </ThemedText>
          <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>Pendientes</ThemedText>
        </View>
      </View>
    </View>
  );

  // 5. INLINE COMMON REGULATIONS (Fills space on tablet with high-value reference)
  const renderCommonRulesCard = () => (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.cardHeaderRow}>
        <ThemedText
          type="smallBold"
          style={[styles.sectionTitle, { color: theme.textSecondary, borderBottomWidth: 0, paddingBottom: 0, marginBottom: 0 }]}
        >
          Reglamento Frecuente HOA
        </ThemedText>
        <Pressable onPress={() => setRulesVisible(true)} style={{ paddingVertical: 2 }}>
          <ThemedText style={{ color: theme.primary, fontSize: 11, fontWeight: 'bold' }}>Ver Todo</ThemedText>
        </Pressable>
      </View>
      <View style={{ height: 1.5, backgroundColor: theme.border, marginVertical: 10 }} />

      <View style={styles.rulesListCompact}>
        <View style={[styles.ruleItemRow, { borderBottomColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.text }}>
              EST-01 &bull; Mal estacionamiento
            </ThemedText>
            <ThemedText style={{ fontSize: 10, color: theme.textSecondary }}>
              Art. 12.4 &bull; Invadir cajón ajeno o zona amarilla
            </ThemedText>
          </View>
          <View style={[styles.fineBadge, { borderColor: theme.success }]}>
            <ThemedText style={{ fontSize: 9, fontWeight: '900', color: theme.success }}>LEVE</ThemedText>
          </View>
        </View>

        <View style={[styles.ruleItemRow, { borderBottomColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.text }}>
              SEG-01 &bull; Exceso de velocidad
            </ThemedText>
            <ThemedText style={{ fontSize: 10, color: theme.textSecondary }}>
              Art. 15.2 &bull; Mayor a 10 km/h en vialidades
            </ThemedText>
          </View>
          <View style={[styles.fineBadge, { borderColor: theme.warning }]}>
            <ThemedText style={{ fontSize: 9, fontWeight: '900', color: theme.warning }}>MODERADA</ThemedText>
          </View>
        </View>

        <View style={styles.ruleItemRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.text }}>
              INS-02 &bull; Daño a propiedad
            </ThemedText>
            <ThemedText style={{ fontSize: 10, color: theme.textSecondary }}>
              Art. 18.1 &bull; Daño a banquetas, plantas o muros
            </ThemedText>
          </View>
          <View style={[styles.fineBadge, { borderColor: theme.danger }]}>
            <ThemedText style={{ fontSize: 9, fontWeight: '900', color: theme.danger }}>CRÍTICA</ThemedText>
          </View>
        </View>
      </View>
    </View>
  );

  // 6. OPTIONS & SESSION
  const renderOptions = () => (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <ThemedText
        type="smallBold"
        style={[styles.sectionTitle, { color: theme.textSecondary, borderBottomColor: theme.border }]}
      >
        Configuración y Opciones
      </ThemedText>

      {/* Manual appearance toggler */}
      <Pressable
        onPress={toggleTheme}
        style={({ pressed }) => [styles.menuOptionRow, pressed && styles.pressed]}
      >
        <Ionicons name={themeMode === 'dark' ? 'moon' : 'sunny'} size={20} color={theme.primary} />
        <ThemedText style={[styles.menuOptionText, { color: theme.text }]}>
          Apariencia: {themeMode === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}
        </ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ThemedText style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '800' }}>
            Cambiar
          </ThemedText>
          <Ionicons name="swap-horizontal" size={14} color={theme.textSecondary} />
        </View>
      </Pressable>

      <Pressable
        onPress={() => setRulesVisible(true)}
        style={({ pressed }) => [styles.menuOptionRow, pressed && styles.pressed]}
      >
        <Ionicons name="book-outline" size={20} color={theme.primary} />
        <ThemedText style={[styles.menuOptionText, { color: theme.text }]}>
          Consultar catálogo completo de infracciones
        </ThemedText>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </Pressable>

      <Pressable
        onPress={() => setHelpVisible(true)}
        style={({ pressed }) => [styles.menuOptionRow, pressed && styles.pressed]}
      >
        <Ionicons name="help-circle-outline" size={20} color={theme.primary} />
        <ThemedText style={[styles.menuOptionText, { color: theme.text }]}>
          Ayuda y protocolos de soporte
        </ThemedText>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </Pressable>

      <Pressable
        onPress={logout}
        style={({ pressed }) => [
          styles.menuOptionRow,
          { borderBottomWidth: 0, marginTop: Spacing.two },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="log-out-outline" size={20} color={theme.danger} />
        <ThemedText style={[styles.menuOptionText, { color: theme.danger, fontWeight: 'bold' }]}>
          Cerrar sesión del agente
        </ThemedText>
        <Ionicons name="chevron-forward" size={18} color={theme.danger} />
      </Pressable>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isTablet ? (
          /* Tablet Balanced Double-Column Layout */
          <View style={styles.tabletGrid}>
            <View style={styles.tabletColLeft}>
              {renderProfileCard()}
              {renderShiftDetails()}
              {renderDirectoryCard()}
            </View>
            <View style={styles.tabletColRight}>
              {renderPerformanceStats()}
              {renderCommonRulesCard()}
              {renderOptions()}
            </View>
          </View>
        ) : (
          /* Phone Standard Flow */
          <View style={{ gap: 16 }}>
            {renderProfileCard()}
            {renderShiftDetails()}
            {renderPerformanceStats()}
            {renderDirectoryCard()}
            {renderCommonRulesCard()}
            {renderOptions()}
          </View>
        )}
      </ScrollView>

      {/* HELP SUPPORT MODAL */}
      <Modal
        visible={helpVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setHelpVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                Ayuda y Soporte
              </ThemedText>
              <Pressable onPress={() => setHelpVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <ThemedText style={{ color: theme.text, fontSize: 13, lineHeight: 18 }}>
                Esta aplicación está diseñada para el uso exclusivo de guardias en recorrido en Las Palomas Rocky Point.{'\n\n'}
                <ThemedText type="smallBold">¿Cómo funciona?</ThemedText>{'\n'}
                1. Escanea el código QR del corbatín de un vehículo desde la pestaña central.{'\n'}
                2. Si identificas una infracción, presiona "Reportar Infracción".{'\n'}
                3. Completa los pasos seleccionando el tipo de falta, ubicando el incidente y tomando fotos claras.{'\n'}
                4. Envía el reporte. Éste quedará pendiente de aprobación por el administrador de la HOA.{'\n\n'}
                <ThemedText type="smallBold">Contacto:</ThemedText>{'\n'}
                Para soporte técnico o incidencias con la app, favor de comunicarse a las oficinas generales de la administración o contactar al supervisor en turno.
              </ThemedText>
            </ScrollView>

            <Pressable
              onPress={() => setHelpVisible(false)}
              style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: theme.primary }, pressed && styles.pressed]}
            >
              <ThemedText type="smallBold" style={{ color: '#fff' }}>Entendido</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* RULES SUMMARY MODAL */}
      <Modal
        visible={rulesVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRulesVisible(false)}
      >
        <View style={styles.rulesOverlay}>
          <View style={[styles.rulesContent, { backgroundColor: theme.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                Reglamento Completo HOA
              </ThemedText>
              <Pressable onPress={() => setRulesVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.rulesList} showsVerticalScrollIndicator={false}>
              {infracciones.map((inf: CatalogoInfraccionRow) => {
                const gravityColor = theme.primary;

                return (
                  <View key={inf.id_infraccion || inf.codigo} style={[styles.ruleItemCard, { borderBottomColor: theme.border }]}>
                    <View style={styles.ruleItemHead}>
                      <ThemedText type="smallBold" style={{ fontSize: 13, color: theme.text }}>
                        {inf.codigo} &bull; {inf.nombre}
                      </ThemedText>
                      <View style={[styles.gravityBadge, { borderColor: gravityColor }]}>
                        <ThemedText style={{ color: gravityColor, fontSize: 8, fontWeight: 'bold' }}>
                          {inf.categoria.toUpperCase()}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>
                      {inf.descripcion}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 10, color: theme.primary, fontWeight: 'bold', marginTop: 4 }}>
                      Reglamento Oficial HOA
                    </ThemedText>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: 110,
    gap: 16,
  },
  tabletGrid: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
  },
  tabletColLeft: {
    flex: 1,
    gap: 16,
  },
  tabletColRight: {
    flex: 1.2,
    gap: 16,
  },
  profileCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  avatarContainer: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '900',
  },
  statusIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
  },
  profileSub: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  employeeNum: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  sectionCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
    gap: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    borderBottomWidth: 1.5,
    paddingBottom: 10,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1.5,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  directoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1.5,
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  statVal: {
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  rulesListCompact: {
    gap: 8,
  },
  ruleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1.5,
    gap: 10,
  },
  fineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  menuOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  menuOptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.75,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: Spacing.four,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
  },
  closeBtn: {
    padding: Spacing.one,
  },
  modalCloseBtn: {
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  rulesOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  rulesContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: Spacing.four,
  },
  rulesList: {
    gap: 12,
    paddingBottom: 30,
  },
  ruleItemCard: {
    borderBottomWidth: 1.5,
    paddingBottom: 12,
  },
  ruleItemHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  gravityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
});
