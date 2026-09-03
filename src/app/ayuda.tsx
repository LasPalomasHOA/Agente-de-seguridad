import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { ResortHeader } from '../components/resort-header';

export default function AyudaScreen() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const CONTACTOS = [
    {
      id: 1,
      titulo: 'Caseta Principal',
      subtitulo: 'Acceso Vehicular Norte',
      canal: 'Canal 1 - Radio',
      tel: 'Ext. 401',
      icon: 'radio',
      color: '#0D6E5F',
    },
    {
      id: 2,
      titulo: 'Supervisión HOA',
      subtitulo: 'Oficina Central de Seguridad',
      canal: 'Canal 3 - Directo',
      tel: 'Ext. 102',
      icon: 'shield',
      color: '#074239',
    },
    {
      id: 3,
      titulo: 'Atención Médica',
      subtitulo: 'Paramédicos de Guardia',
      canal: 'Línea de Urgencia',
      tel: '911 / Ext. 999',
      icon: 'medkit',
      color: '#DC2626',
    },
    {
      id: 4,
      titulo: 'Mesa de Ayuda TI',
      subtitulo: 'Soporte de Plataforma',
      canal: 'Lunes a Sábado 8-18h',
      tel: 'Ext. 305',
      icon: 'headset',
      color: '#2563EB',
    },
  ];

  const FAQS = [
    {
      q: '¿Cómo procedo si un vehículo no tiene corbatín visible?',
      a: 'Solicite al conductor su identificación y nombre de la empresa contratista. Realice la búsqueda manual en el sistema usando el número de placas. Si no cuenta con registro activo, debe dirigirlo a la Oficina de Seguridad HOA para su acreditación formal.',
    },
    {
      q: '¿Qué hacer si el escáner de la cámara no lee el código QR?',
      a: 'Verifique que la lente esté limpia y que haya suficiente luz. Si el código QR está dañado o desvanecido, use la opción "Ingreso Manual de Corbatín" en la pantalla de inicio o escáner e ingrese el número visible en el corbatín (ej. C-102 o 70).',
    },
    {
      q: '¿Qué fotografías son indispensables al levantar una infracción?',
      a: '1. Fotografía general donde se aprecie el vehículo completo y el entorno del incidente.\n2. Fotografía legible de la placa de circulación.\n3. Fotografía detallada de la falta cometida (ej. sin EPP, mal estacionado invadiendo rampa, etc.).',
    },
    {
      q: '¿Los reportes que envío se reflejan inmediatamente en la oficina?',
      a: 'Sí, la plataforma móvil sincroniza en tiempo real con el portal administrativo web de Las Palomas HOA, permitiendo a los supervisores revisar la evidencia y validar sanciones al instante.',
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
      {/* ─── ANIMATED RESORT HEADER ─── */}
      <ResortHeader
        title="Centro de Ayuda y Soporte"
        subtitle="Protocolos de seguridad y líneas directas 24/7."
        rightElement={
          <View style={styles.miniResortTagBadge}>
            <ThemedText style={styles.miniResortTagText}>Líneas 24/7</ThemedText>
          </View>
        }
      />

      {/* Direct Emergency and Radio Lines (2x2 Grid) */}
      <ThemedText style={styles.sectionHeading}>Líneas Directas de Contacto</ThemedText>
      <View style={styles.contactsGrid}>
        {CONTACTOS.map((c) => (
          <View key={c.id} style={styles.contactCard}>
            <View style={[styles.contactIconCircle, { backgroundColor: '#E6F4F1' }]}>
              <Ionicons name={c.icon as any} size={22} color={c.color} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <ThemedText style={styles.contactTitle}>{c.titulo}</ThemedText>
              <ThemedText style={styles.contactSubtitle}>{c.subtitulo}</ThemedText>
              <View style={styles.contactPillRow}>
                <ThemedText style={styles.contactPillText}>{c.canal}</ThemedText>
                <ThemedText style={styles.contactExtText}>{c.tel}</ThemedText>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* FAQs Accordion */}
      <ThemedText style={styles.sectionHeading}>Preguntas Frecuentes de Operación</ThemedText>
      <View style={styles.faqsList}>
        {FAQS.map((faq, idx) => {
          const isExpanded = expandedFaq === idx;

          return (
            <Pressable
              key={idx}
              onPress={() => setExpandedFaq(isExpanded ? null : idx)}
              style={({ pressed }) => [
                styles.faqCard,
                pressed && { opacity: 0.9 },
              ]}
            >
              <View style={styles.faqHeaderRow}>
                <Ionicons
                  name="help-circle-outline"
                  size={20}
                  color="#0D6E5F"
                  style={{ marginRight: 10 }}
                />
                <ThemedText style={styles.faqQuestionText}>{faq.q}</ThemedText>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#94a3b8"
                />
              </View>

              {isExpanded && (
                <View style={styles.faqAnswerBox}>
                  <ThemedText style={styles.faqAnswerText}>{faq.a}</ThemedText>
                </View>
              )}
            </Pressable>
          );
        })}
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
  sectionHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  contactsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  contactCard: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  contactIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  contactSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
  },
  contactPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  contactPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0D6E5F',
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  contactExtText: {
    fontSize: 10.5,
    color: '#94a3b8',
    fontWeight: '700',
  },
  faqsList: {
    gap: 10,
  },
  faqCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  faqHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  faqAnswerBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  faqAnswerText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
});
