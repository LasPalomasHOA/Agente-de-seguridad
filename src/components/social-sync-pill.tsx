import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated, Platform, ActivityIndicator } from 'react-native';
import { ThemedText } from './themed-text';
import { Ionicons } from '@expo/vector-icons';

export type SyncState = 'idle' | 'syncing' | 'up_to_date' | 'updated';

interface SocialSyncPillProps {
  state: SyncState;
  message?: string;
}

export function SocialSyncPill({ state, message }: SocialSyncPillProps) {
  const [animY] = useState(() => new Animated.Value(-40));
  const [animOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (state !== 'idle') {
      Animated.parallel([
        Animated.spring(animY, {
          toValue: 0,
          useNativeDriver: Platform.OS !== 'web',
          tension: 90,
          friction: 9,
        }),
        Animated.timing(animOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(animY, {
          toValue: -30,
          duration: 220,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(animOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    }
  }, [state, animY, animOpacity]);

  if (state === 'idle') {
    return null;
  }

  const isSyncing = state === 'syncing';
  const isUpdated = state === 'updated';

  const defaultText = isSyncing
    ? 'Sincronizando reportes...'
    : isUpdated
    ? '¡Sincronizado! Se actualizaron tus reportes'
    : 'Al día • Sin reportes nuevos';

  const displayText = message || defaultText;

  return (
    <Animated.View
      style={[
        styles.pillContainer,
        {
          transform: [{ translateY: animY }],
          opacity: animOpacity,
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.pillBadge}>
        {isSyncing ? (
          <ActivityIndicator size="small" color="#0D6E5F" style={{ marginRight: 6 }} />
        ) : isUpdated ? (
          <Ionicons name="sparkles" size={15} color="#0D6E5F" style={{ marginRight: 6 }} />
        ) : (
          <Ionicons name="checkmark-circle" size={15} color="#0D6E5F" style={{ marginRight: 6 }} />
        )}
        <ThemedText style={styles.pillText}>{displayText}</ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pillContainer: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 10,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    maxWidth: '92%',
  },
  pillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0D6E5F',
    letterSpacing: -0.2,
  },
});
