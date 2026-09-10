import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { ResortHeader } from '../components/resort-header';

interface FAQItem {
  id: number;
  categoria: 'acceso' | 'infracciones' | 'operacion' | 'sistema';
  q: string;
  a: string;
  tag: string;
}

const CATEGORIAS = [
  { id: 'todas', label: 'Todas las Preguntas', icon: 'apps-outline' },
  { id: 'acceso', label: 'Acceso y Corbatines', icon: 'qr-code-outline' },
  { id: 'infracciones', label: 'Infracciones y Fotos', icon: 'alert-circle-outline' },
  { id: 'operacion', label: 'Protocolos de Caseta', icon: 'shield-checkmark-outline' },
  { id: 'sistema', label: 'Uso de la Aplicación', icon: 'phone-portrait-outline' },
] as const;

const FAQS_OPERATIVAS: FAQItem[] = [
  // ─── ACCESO Y CORBATINES ───
  {
    id: 1,
    categoria: 'acceso',
    tag: 'Sin Corbatín',
    q: '¿Cómo procedo si un vehículo no tiene corbatín visible o está vencido?',
    a: '1. Solicite al conductor su identificación oficial y el nombre de la empresa contratista o residente al que visita.\n2. Busque en el sistema utilizando las placas del vehículo.\n3. Si el corbatín está vencido o no existe registro previo, deniegue el acceso vehicular y canalice al conductor a la Oficina de Seguridad HOA para su regularización.',
  },
  {
    id: 2,
    categoria: 'acceso',
    tag: 'Falla QR',
    q: '¿Qué hacer si el escáner de la cámara no lee el código QR?',
    a: '1. Limpie el lente de la cámara y asegúrese de que el corbatín tenga iluminación adecuada.\n2. Si el código QR está roto, doblado o desgastado por el sol, utilice el botón "Búsqueda Manual" en la pantalla de inicio o escáner e ingrese el número visible (ej. C-105 o 70) o las placas vehiculares.',
  },
  {
    id: 3,
    categoria: 'acceso',
    tag: 'Sanción Activa',
    q: '¿Qué hacer si el sistema marca al vehículo con "SANCIÓN ACTIVA" o "ACCESO DENEGADO"?',
    a: '1. No permita la entrada del vehículo al complejo residencial.\n2. Informe respetuosamente al conductor que la unidad cuenta con una sanción administrativa vigente en el sistema HOA.\n3. Registre en la bitácora el intento de ingreso con estatus "Denegado" y proporcione el número de atención de la administración para que liquide o aclare su situación.',
  },
  {
    id: 4,
    categoria: 'acceso',
    tag: 'Placas Diferentes',
    q: '¿Qué hacer si las placas físicas del vehículo no coinciden con las del corbatín registrado?',
    a: '1. Los corbatines son intransferibles entre vehículos.\n2. Retenga temporalmente el corbatín para investigación y levante un reporte de infracción por uso indebido/transferencia no autorizada de acreditación.\n3. Deniegue el acceso del vehículo no acreditado e informe al supervisor en turno.',
  },
  {
    id: 5,
    categoria: 'acceso',
    tag: 'Horarios',
    q: '¿Se permite el acceso a proveedores y contratistas fuera del horario oficial?',
    a: 'El horario general de contratistas y obras es de 07:00 a 18:00 de Lunes a Viernes, y de 08:00 a 14:00 los Sábados. Queda estrictamente prohibido el acceso fuera de este horario salvo que exista una autorización expresa por escrito de la Administración HOA por emergencia comprobada.',
  },

  // ─── INFRACCIONES Y EVIDENCIA ───
  {
    id: 6,
    categoria: 'infracciones',
    tag: 'Evidencia Obligatoria',
    q: '¿Qué fotografías son indispensables al levantar un reporte de infracción?',
    a: 'Debe incluir al menos 3 fotografías nítidas:\n1. Vista Panorámica: Donde se aprecie el vehículo completo, el entorno y el lugar exacto del complejo.\n2. Placa y Corbatín: Fotografía legible de la placa de circulación y del corbatín si está presente.\n3. Evidencia del Hecho: Fotografía clara de la falta (ej. invasión de banqueta/rampa, sin equipo de protección, exceso de velocidad, tiradero de escombro).',
  },
  {
    id: 7,
    categoria: 'infracciones',
    tag: 'Negativa de Conductor',
    q: '¿Qué procede si el conductor o infractor se niega a cooperar o muestra conducta agresiva?',
    a: '1. Mantenga la calma y no entre en confrontaciones verbales ni físicas.\n2. Tome las fotografías del vehículo y del entorno guardando una distancia segura.\n3. Registre el reporte en la aplicación detallando en la descripción los hechos ocurridos y la actitud evasiva.\n4. Si hay riesgo de seguridad o alteración del orden, solicite apoyo de supervisión inmediatamente.',
  },
  {
    id: 8,
    categoria: 'infracciones',
    tag: 'Reincidencias',
    q: '¿Cómo calcula el sistema el monto y la gravedad de las reincidencias?',
    a: 'El sistema consulta automáticamente el historial acumulado del vehículo y de la empresa contratista. A partir de la segunda falta idéntica, el sistema incrementa la sanción conforme al reglamento vigente (multa doble o suspensión temporal de acceso) notificando a los administradores del HOA.',
  },
  {
    id: 9,
    categoria: 'infracciones',
    tag: 'Corrección',
    q: '¿Qué hago si me equivoqué al registrar los datos de un reporte ya enviado?',
    a: 'Los reportes enviados pasan al módulo de revisión administrativa. Debe comunicarse con el Administrador o Supervisor HOA para que actualice la información del folio o reasigne la infracción antes de su aprobación definitiva.',
  },

  // ─── OPERACIÓN EN CASETA ───
  {
    id: 10,
    categoria: 'operacion',
    tag: 'Ingreso Forzado',
    q: '¿Cómo actuar ante un acceso forzado o cuando un vehículo entra sin detenerse?',
    a: '1. No intente bloquear físicamente el paso arriesgando su integridad.\n2. Anote inmediatamente la placa, color, marca y modelo del vehículo, así como la hora exacta.\n3. Registre el evento en la Bitácora seleccionando estatus "FORZADO".\n4. Reporte por radio a los oficiales de recorrido para localizar la unidad dentro del complejo.',
  },
  {
    id: 11,
    categoria: 'operacion',
    tag: 'Autorización Residente',
    q: '¿Qué hacer si un residente llama solicitando el pase de un contratista sin acreditación?',
    a: 'Todo personal externo que realice trabajos de construcción o mantenimiento debe contar con su corbatín vigente o pase temporal expedido por la oficina HOA. El oficial no está facultado para autorizar excepciones directas sin folio emitido por la administración.',
  },
  {
    id: 12,
    categoria: 'operacion',
    tag: 'Velocidad y Ruido',
    q: '¿Cómo reportar vehículos a exceso de velocidad o con música alta en áreas comunes?',
    a: '1. Identifique el vehículo mediante placa o corbatín.\n2. Ingrese a "Escanear / Búsqueda Manual" en la app.\n3. Seleccione el código de infracción correspondiente (ej. INF-03 Exceso de Velocidad o INF-07 Contaminación Auditiva) y describa la zona o vialidad donde ocurrió el incidente.',
  },

  // ─── USO DE LA APLICACIÓN ───
  {
    id: 13,
    categoria: 'sistema',
    tag: 'Sin Internet',
    q: '¿Puedo usar la aplicación si hay baja señal o falla el internet en caseta?',
    a: 'Sí. La aplicación almacena en su memoria local las normativas y datos recientes. Los reportes e ingresos quedan registrados en el dispositivo y se sincronizan con la base de datos central en cuanto se restablece la conexión de red.',
  },
  {
    id: 14,
    categoria: 'sistema',
    tag: 'Sincronización',
    q: '¿Los reportes que guardo se reflejan inmediatamente en la oficina administrativa?',
    a: 'Sí. Los reportes e infracciones generados desde la aplicación móvil se transmiten en tiempo real a la plataforma web de Las Palomas HOA, permitiendo la validación y emisión de sanciones al instante.',
  },
  {
    id: 15,
    categoria: 'sistema',
    tag: 'Cierre de Turno',
    q: '¿Qué debo verificar antes de concluir mi turno de servicio?',
    a: '1. Verifique en la pestaña "Reportes" que todos sus folios del día hayan sido enviados correctamente (sin borradores pendientes).\n2. Asegúrese de que todos los accesos denegados o forzados quedaron debidamente asentados en bitácora.\n3. Cierre sesión en la app desde el apartado "Perfil" para el siguiente oficial de guardia.',
  },
];

export default function AyudaScreen() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredFaqs = useMemo(() => {
    const cleanSearch = searchQuery.toLowerCase().trim();

    return FAQS_OPERATIVAS.filter((faq) => {
      const matchesCategory =
        selectedCategory === 'todas' || faq.categoria === selectedCategory;

      const matchesSearch =
        !cleanSearch ||
        faq.q.toLowerCase().includes(cleanSearch) ||
        faq.a.toLowerCase().includes(cleanSearch) ||
        faq.tag.toLowerCase().includes(cleanSearch);

      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
      {/* ─── RESORT HEADER ─── */}
      <ResortHeader
        title="Centro de Ayuda Operativa"
        subtitle="Protocolos oficiales de seguridad, caseta y normativas."
        rightElement={
          <View style={styles.miniResortTagBadge}>
            <ThemedText style={styles.miniResortTagText}>
              {FAQS_OPERATIVAS.length} Guías
            </ThemedText>
          </View>
        }
      />

      {/* ─── SEARCH INPUT ─── */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#0D6E5F" style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar protocolo, falta, corbatín o situación..."
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {searchQuery.trim().length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {/* ─── CATEGORY FILTER PILLS ─── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesRow}
      >
        {CATEGORIAS.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() => setSelectedCategory(cat.id)}
              style={[
                styles.categoryPill,
                isSelected && styles.categoryPillActive,
              ]}
            >
              <Ionicons
                name={cat.icon as any}
                size={15}
                color={isSelected ? '#ffffff' : '#0D6E5F'}
                style={{ marginRight: 6 }}
              />
              <ThemedText
                style={[
                  styles.categoryPillText,
                  isSelected && styles.categoryPillTextActive,
                ]}
              >
                {cat.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ─── OPERATIONAL PROTOCOLS & FAQS LIST ─── */}
      <View style={styles.headingRow}>
        <ThemedText style={styles.sectionHeading}>
          Preguntas Frecuentes y Protocolos ({filteredFaqs.length})
        </ThemedText>
        <ThemedText style={styles.sectionSubtitle}>
          Toca cualquier pregunta para consultar el procedimiento
        </ThemedText>
      </View>

      {filteredFaqs.length === 0 ? (
        <View style={styles.emptyStateBox}>
          <Ionicons name="search" size={36} color="#cbd5e1" />
          <ThemedText style={styles.emptyStateTitle}>No se encontraron preguntas</ThemedText>
          <ThemedText style={styles.emptyStateDesc}>
            Intenta con otros términos como "corbatín", "placas", "sanción", "foto" o "acceso".
          </ThemedText>
        </View>
      ) : (
        <View style={styles.faqsList}>
          {filteredFaqs.map((faq) => {
            const isExpanded = expandedFaq === faq.id;

            return (
              <Pressable
                key={faq.id}
                onPress={() => setExpandedFaq(isExpanded ? null : faq.id)}
                style={({ pressed }) => [
                  styles.faqCard,
                  isExpanded && styles.faqCardExpanded,
                  pressed && { opacity: 0.95 },
                ]}
              >
                <View style={styles.faqHeaderRow}>
                  <View style={styles.faqLeftCol}>
                    <View style={styles.faqTagBadge}>
                      <ThemedText style={styles.faqTagText}>{faq.tag}</ThemedText>
                    </View>
                    <ThemedText style={styles.faqQuestionText}>{faq.q}</ThemedText>
                  </View>
                  <View style={[styles.chevronBox, isExpanded && styles.chevronBoxActive]}>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={isExpanded ? '#ffffff' : '#0D6E5F'}
                    />
                  </View>
                </View>

                {isExpanded && (
                  <View style={styles.faqAnswerBox}>
                    <View style={styles.answerIndicator} />
                    <ThemedText style={styles.faqAnswerText}>{faq.a}</ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ─── QUICK FOOTER NOTE ─── */}
      <View style={styles.footerInfoBox}>
        <Ionicons name="shield-checkmark" size={18} color="#0D6E5F" style={{ marginRight: 8 }} />
        <ThemedText style={styles.footerInfoText}>
          Procedimientos estandarizados conforme al Reglamento Operativo HOA Las Palomas 2026.
        </ThemedText>
      </View>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '600',
  },
  clearSearchBtn: {
    padding: 4,
  },
  categoriesRow: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  categoryPillActive: {
    backgroundColor: '#0D6E5F',
    borderColor: '#0D6E5F',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0D6E5F',
  },
  categoryPillTextActive: {
    color: '#ffffff',
  },
  headingRow: {
    marginTop: 4,
    gap: 2,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  faqsList: {
    gap: 12,
  },
  faqCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  faqCardExpanded: {
    borderColor: '#0D6E5F',
    backgroundColor: '#FAFCFC',
  },
  faqHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqLeftCol: {
    flex: 1,
    gap: 6,
  },
  faqTagBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  faqTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0D6E5F',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  faqQuestionText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 18,
  },
  chevronBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#E6F4F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronBoxActive: {
    backgroundColor: '#0D6E5F',
  },
  faqAnswerBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 10,
  },
  answerIndicator: {
    width: 3.5,
    borderRadius: 2,
    backgroundColor: '#0D6E5F',
  },
  faqAnswerText: {
    flex: 1,
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 19,
    fontWeight: '500',
  },
  emptyStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },
  emptyStateDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16,
  },
  footerInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFE3DC',
  },
  footerInfoText: {
    flex: 1,
    fontSize: 11.5,
    color: '#0D6E5F',
    fontWeight: '700',
    lineHeight: 16,
  },
});
