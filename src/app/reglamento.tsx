import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { ResortHeader } from '../components/resort-header';
import { mockCategorias, mockInfracciones } from '../data/mockData';

export default function ReglamentoScreen() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('todos');

  const filteredInfracciones = mockInfracciones.filter((inf) => {
    const matchesSearch =
      inf.codigo.toLowerCase().includes(search.toLowerCase()) ||
      inf.nombre.toLowerCase().includes(search.toLowerCase()) ||
      inf.descripcion.toLowerCase().includes(search.toLowerCase()) ||
      inf.reglaRelacionada.toLowerCase().includes(search.toLowerCase());

    if (activeCategory === 'todos') return matchesSearch;
    return matchesSearch && inf.categoriaId === activeCategory;
  });

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
      {/* ─── ANIMATED RESORT HEADER ─── */}
      <ResortHeader
        title="Reglamento Operativo HOA"
        subtitle="Catálogo oficial de normativas, códigos y sanciones."
        rightElement={
          <View style={styles.miniResortTagBadge}>
            <ThemedText style={styles.miniResortTagText}>14 Normas</ThemedText>
          </View>
        }
      />

      {/* Search Input */}
      <View style={styles.searchBarWrapper}>
        <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
        <TextInput
          placeholder="Buscar por artículo, falta o código (ej. EST-01, EPP, Ruido)..."
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

      {/* Category Pills */}
      <View style={styles.categoryPillsRow}>
        <Pressable
          onPress={() => setActiveCategory('todos')}
          style={[
            styles.categoryPill,
            activeCategory === 'todos' && styles.categoryPillActive,
          ]}
        >
          <ThemedText
            style={[
              styles.categoryPillText,
              activeCategory === 'todos' && styles.categoryPillTextActive,
            ]}
          >
            Todas las Categorías
          </ThemedText>
        </Pressable>

        {mockCategorias.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => setActiveCategory(cat.id)}
            style={[
              styles.categoryPill,
              activeCategory === cat.id && styles.categoryPillActive,
            ]}
          >
            <ThemedText
              style={[
                styles.categoryPillText,
                activeCategory === cat.id && styles.categoryPillTextActive,
              ]}
            >
              {cat.nombre}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Infractions List Cards */}
      <View style={styles.infraccionesList}>
        {filteredInfracciones.map((inf) => {
          const gravedadConfig = {
            leve: { color: '#0D6E5F', bg: '#E6F4F1', label: 'Leve' },
            moderada: { color: '#2563EB', bg: '#EFF6FF', label: 'Moderada' },
            grave: { color: '#D97706', bg: '#FEF3C7', label: 'Grave' },
            critica: { color: '#DC2626', bg: '#FEE2E2', label: 'Crítica' },
          }[inf.gravedad] || { color: '#0D6E5F', bg: '#E6F4F1', label: inf.gravedad };

          return (
            <View key={inf.codigo} style={styles.infractionCard}>
              <View style={styles.infractionCardTop}>
                <View style={styles.codeRow}>
                  <View style={styles.codePill}>
                    <ThemedText style={styles.codePillText}>{inf.codigo}</ThemedText>
                  </View>
                  <View style={[styles.gravedadPill, { backgroundColor: gravedadConfig.bg }]}>
                    <ThemedText style={[styles.gravedadPillText, { color: gravedadConfig.color }]}>
                      {gravedadConfig.label}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.reglaText}>{inf.reglaRelacionada}</ThemedText>
              </View>

              <ThemedText style={styles.infractionTitle}>{inf.nombre}</ThemedText>
              <ThemedText style={styles.infractionDesc}>{inf.descripcion}</ThemedText>

              <View style={styles.sancionBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#0D6E5F" style={{ marginRight: 6 }} />
                <ThemedText style={styles.sancionText}>
                  Medida: Suspensión de acceso &bull; Multa: ${inf.multaBase.toLocaleString()} MXN
                </ThemedText>
              </View>
            </View>
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
  infraccionesList: {
    gap: 12,
  },
  infractionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  infractionCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codePill: {
    backgroundColor: '#0D6E5F',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  codePillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  gravedadPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gravedadPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  reglaText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '700',
  },
  infractionTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0f172a',
  },
  infractionDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  sancionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  sancionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0D6E5F',
    flex: 1,
  },
});
