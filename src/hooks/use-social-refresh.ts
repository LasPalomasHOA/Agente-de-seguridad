import { useState, useRef, useCallback } from 'react';
import { Vibration, Platform } from 'react-native';
import { SyncState } from '../components/social-sync-pill';

const COOLDOWN_MS = 6000; // 6 segundos de protección anti-spam

interface UseSocialRefreshOptions {
  onRefreshAction: () => Promise<{ hasChanges: boolean; totalCount?: number }>;
}

export function useSocialRefresh({ onRefreshAction }: UseSocialRefreshOptions) {
  const [refreshing, setRefreshing] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const lastPullTimestampRef = useRef<number>(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHaptic = (pattern: number | number[]) => {
    try {
      if (Platform.OS !== 'web') {
        Vibration.vibrate(pattern);
      }
    } catch { }
  };

  const formatLocalTime = (d = new Date()): string => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const schedulePillDismiss = useCallback((delayMs = 2400) => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = setTimeout(() => {
      setSyncState('idle');
    }, delayMs);
  }, []);

  const handleRefresh = useCallback(async () => {
    const now = Date.now();
    const timeSinceLast = now - lastPullTimestampRef.current;

    // ─── NIVEL 1: COOLDOWN GATE (< 6 SEG) ───
    if (timeSinceLast < COOLDOWN_MS) {
      const timeStr = formatLocalTime();
      setSyncState('up_to_date');
      setSyncMessage(`Al día • Sin cambios (${timeStr})`);
      triggerHaptic(12);
      schedulePillDismiss(2000);
      return;
    }

    lastPullTimestampRef.current = now;
    setRefreshing(true);
    setSyncState('syncing');
    setSyncMessage('Sincronizando reportes...');

    try {
      const result = await onRefreshAction();
      const timeStr = formatLocalTime();
      setLastSyncTime(new Date());

      if (result.hasChanges) {
        setSyncState('updated');
        setSyncMessage('¡Sincronizado! Se actualizaron tus reportes');
        triggerHaptic(Platform.OS === 'android' ? [0, 20, 40, 20] : 15);
      } else {
        setSyncState('up_to_date');
        setSyncMessage(`Al día • Sin reportes nuevos (${timeStr})`);
        triggerHaptic(12);
      }
    } catch (err) {
      console.warn('[useSocialRefresh] Error al sincronizar:', err);
      setSyncState('up_to_date');
      setSyncMessage('Al día con datos locales');
    } finally {
      setRefreshing(false);
      schedulePillDismiss(2400);
    }
  }, [onRefreshAction, schedulePillDismiss]);

  return {
    refreshing,
    syncState,
    syncMessage,
    lastSyncTime,
    handleRefresh,
  };
}
