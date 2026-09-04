import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { MobileProvider, useMobile } from '../context/MobileContext';
import { LoginScreen } from '../components/login-screen';
import { AnimatedSplashScreen } from '../components/animated-splash';
import { Slot, useRouter, usePathname } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';

SplashScreen.preventAutoHideAsync();

function DashboardShell() {
  const { isAuthenticated, logout } = useMobile();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  // Breakpoint: Desktop / horizontal tablet >= 768px
  const isDesktop = width >= 768;

  const NAV_ITEMS = [
    { id: '/', label: 'Inicio', icon: 'home-outline', activeIcon: 'home' },
    { id: '/scanner', label: 'Escanear', icon: 'qr-code-outline', activeIcon: 'qr-code' },
    { id: '/reports', label: 'Reportes', icon: 'document-text-outline', activeIcon: 'document-text' },
    { id: '/reglamento', label: 'Reglamento', icon: 'scale-outline', activeIcon: 'scale' },
    { id: '/ayuda', label: 'Ayuda', icon: 'help-circle-outline', activeIcon: 'help-circle' },
  ];

  const currentPath = pathname || '/';

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <SafeAreaView style={styles.shellRoot}>
      {/* ─── 1. UNIFIED LEFT SIDEBAR (Desktop >= 768px) ─── */}
      {isDesktop && (
        <View style={styles.sidebar}>
          {/* Official Brand Logo & Subtitle */}
          <View style={styles.sidebarBrandSection}>
            <Image
              source={require('@/assets/images/lp-logo.png')}
              style={styles.sidebarLogoImg}
              resizeMode="contain"
            />
            <ThemedText style={styles.sidebarBrandSubtitle}>
              CONTROL OPERATIVO &bull; SEGURIDAD
            </ThemedText>
          </View>

          {/* Section Heading */}
          <View style={styles.navSectionHeader}>
            <ThemedText style={styles.navSectionHeaderText}>MÓDULOS DEL SISTEMA</ThemedText>
          </View>

          {/* Nav Items List */}
          <View style={styles.navMenuCol}>
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.id === '/'
                  ? currentPath === '/' || currentPath === '' || currentPath === '/index'
                  : currentPath.startsWith(item.id);

              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.replace(item.id as any)}
                  style={({ pressed }) => [
                    styles.navItemButton,
                    isActive && styles.navItemButtonActive,
                    pressed && !isActive && { backgroundColor: '#F1F5F9' },
                  ]}
                >
                  <View style={[styles.navIconBox, isActive && styles.navIconBoxActive]}>
                    <Ionicons
                      name={(isActive ? item.activeIcon : item.icon) as any}
                      size={18}
                      color={isActive ? '#ffffff' : '#64748B'}
                    />
                  </View>
                  <ThemedText
                    style={[
                      styles.navItemLabel,
                      isActive && styles.navItemLabelActive,
                    ]}
                  >
                    {item.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Bottom Sidebar Box */}
          <View style={styles.sidebarBottomBox}>
            <View style={styles.systemStatusLine}>
              <View style={styles.systemStatusDot} />
              <ThemedText style={styles.systemStatusText}>En Línea &bull; v2.4.1</ThemedText>
            </View>
            <Pressable
              onPress={logout}
              style={({ pressed }) => [
                styles.logoutButton,
                pressed && { backgroundColor: '#FEE2E2' },
              ]}
            >
              <Ionicons name="log-out-outline" size={17} color="#DC2626" style={{ marginRight: 8 }} />
              <ThemedText style={styles.logoutButtonText}>Cerrar Sesión</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* ─── 2. MAIN CONTENT COLUMN ─── */}
      <View style={styles.contentColumn}>
        {/* Mobile Header (< 768px) */}
        {!isDesktop && (
          <View style={styles.mobileTopBar}>
            <View style={styles.mobileTopLeft}>
              <Image
                source={require('@/assets/images/lp-logo.png')}
                style={styles.mobileTopLogoImg}
                resizeMode="contain"
              />
            </View>

            <View style={styles.mobileTopRight}>
              <View style={styles.officerDutyPill}>
                <View style={styles.liveDot} />
                <ThemedText style={styles.officerDutyText}>C. Ramírez</ThemedText>
              </View>
              <Pressable
                onPress={logout}
                style={({ pressed }) => [
                  styles.mobileLogoutBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="log-out-outline" size={18} color="#DC2626" />
              </Pressable>
            </View>
          </View>
        )}

        {/* Page Content Slot */}
        <View style={styles.slotWrapper}>
          <Slot />
        </View>

        {/* Desktop Footer (>= 768px) */}
        {isDesktop && (
          <View style={styles.desktopFooter}>
            <ThemedText style={styles.desktopFooterText}>
              Las Palomas v2.4.1 - Conectado &bull; Sistema Operativo Integral
            </ThemedText>
            <View style={styles.desktopFooterLinks}>
              <ThemedText style={styles.desktopFooterLink}>Soporte</ThemedText>
              <ThemedText style={styles.desktopFooterDot}>&bull;</ThemedText>
              <ThemedText style={styles.desktopFooterLink}>Privacidad</ThemedText>
            </View>
          </View>
        )}

        {/* Mobile Bottom Navigation (< 768px) */}
        {!isDesktop && (
          <View style={styles.mobileBottomNav}>
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.id === '/'
                  ? currentPath === '/' || currentPath === '' || currentPath === '/index'
                  : currentPath.startsWith(item.id);

              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.replace(item.id as any)}
                  style={[
                    styles.mobileNavItem,
                    isActive && styles.mobileNavItemActive,
                  ]}
                >
                  <Ionicons
                    name={(isActive ? item.activeIcon : item.icon) as any}
                    size={19}
                    color={isActive ? '#0D6E5F' : '#64748B'}
                  />
                  <ThemedText
                    style={[
                      styles.mobileNavText,
                      isActive && styles.mobileNavTextActive,
                    ]}
                  >
                    {item.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <SafeAreaProvider>
      <MobileProvider>
        <View style={{ flex: 1, backgroundColor: '#042F2E' }}>
          <DashboardShell />
          {showSplash && (
            <AnimatedSplashScreen
              onFinish={() => setShowSplash(false)}
              minDurationMs={1400}
            />
          )}
        </View>
      </MobileProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  shellRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    height: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
  },
  sidebar: {
    width: 240,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    justifyContent: 'space-between',
    flexShrink: 0,
    height: '100%',
  },
  sidebarBrandSection: {
    marginBottom: 20,
    gap: 4,
  },
  sidebarLogoImg: {
    width: '100%',
    maxWidth: 200,
    height: 54,
    alignSelf: 'flex-start',
  },
  sidebarBrandSubtitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0D6E5F',
    letterSpacing: 0.8,
    marginTop: 3,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  officerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    position: 'relative',
  },
  officerPhotoAvatar: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#0D6E5F',
  },
  onlineBadgeDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  officerTextCol: {
    flex: 1,
    gap: 1,
  },
  officerNameText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  officerRoleText: {
    fontSize: 10.5,
    color: '#0D6E5F',
    fontWeight: '800',
  },
  officerShiftText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  navSectionHeader: {
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  navSectionHeaderText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  navMenuCol: {
    flex: 1,
    gap: 3,
  },
  navItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 10,
  },
  navItemButtonActive: {
    backgroundColor: '#0D6E5F',
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  navIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconBoxActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  navItemLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  navItemLabelActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  sidebarBottomBox: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  systemStatusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  systemStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  systemStatusText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
  },
  contentColumn: {
    flex: 1,
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    minWidth: 0,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  slotWrapper: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  desktopFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#ffffff',
    flexShrink: 0,
  },
  desktopFooterText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  desktopFooterLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  desktopFooterLink: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  desktopFooterDot: {
    color: '#cbd5e1',
    marginHorizontal: 4,
  },
  mobileTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexShrink: 0,
    zIndex: 10,
  },
  mobileTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mobileTopLogoImg: {
    width: 150,
    height: 42,
  },
  mobileTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  officerDutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
    borderColor: '#0D6E5F',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  officerDutyText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D6E5F',
  },
  mobileLogoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileBottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 6,
    paddingBottom: Platform.OS === 'ios' ? 22 : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
    flexShrink: 0,
    zIndex: 10,
  },
  mobileNavItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 2,
  },
  mobileNavItemActive: {
    backgroundColor: '#E6F4F1',
  },
  mobileNavText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  mobileNavTextActive: {
    color: '#0D6E5F',
    fontWeight: '900',
  },
});
