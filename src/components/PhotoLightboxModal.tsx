import React from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './themed-text';

interface PhotoLightboxModalProps {
  visible: boolean;
  uri: string | null;
  title?: string;
  subtitle?: string;
  footerTitle?: string;
  footerSubtitle?: string;
  onClose: () => void;
}

export function PhotoLightboxModal({
  visible,
  uri,
  title = 'Inspección Fotográfica',
  subtitle,
  footerTitle,
  footerSubtitle,
  onClose,
}: PhotoLightboxModalProps) {
  if (!visible || !uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={styles.iconBadge}>
                <Ionicons name="camera" size={18} color="#0D6E5F" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.title}>{title}</ThemedText>
                {!!subtitle && (
                  <ThemedText style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </ThemedText>
                )}
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#475569" />
            </Pressable>
          </View>

          <View style={styles.stageBox}>
            <Image
              source={{ uri }}
              style={styles.img}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </View>

          {(!!footerTitle || !!footerSubtitle) && (
            <View style={styles.footer}>
              {!!footerTitle && <ThemedText style={styles.footerTitle}>{footerTitle}</ThemedText>}
              {!!footerSubtitle && <ThemedText style={styles.footerSubtitle}>{footerSubtitle}</ThemedText>}
            </View>
          )}

          <Pressable onPress={onClose} style={styles.primaryCloseBtn}>
            <ThemedText style={styles.primaryCloseText}>Cerrar Vista</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E6F4F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageBox: {
    width: '100%',
    height: 340,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  footer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  footerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  primaryCloseBtn: {
    backgroundColor: '#0D6E5F',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
