/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

// @ts-ignore
import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0f172a',
    background: '#f8fafc',
    backgroundElement: '#ffffff',
    backgroundSelected: '#f1f5f9',
    textSecondary: '#64748b',
    primary: '#0D6E5F', // Authentic Las Palomas Teal
    primaryDark: '#074239',
    primaryLight: '#E6F4F1',
    accentYellow: '#F59E0B', // Las Palomas Security Vibrant Gold
    accentYellowLight: '#FEF3C7',
    navy: '#0F172A',
    navyDark: '#0A192F',
    navyCard: '#1E293B',
    border: '#e2e8f0',
    card: '#ffffff',
    cardGlass: 'rgba(255, 255, 255, 0.95)',
    success: '#059669',
    successBg: '#d1fae5',
    warning: '#d97706',
    warningBg: '#fef3c7',
    danger: '#dc2626',
    dangerBg: '#fee2e2',
  },
  dark: {
    text: '#f8fafc',
    background: '#0a0f1d',
    backgroundElement: '#131c31',
    backgroundSelected: '#1e293b',
    textSecondary: '#94a3b8',
    primary: '#10B981',
    primaryDark: '#047857',
    primaryLight: '#064E3B',
    accentYellow: '#FBBF24',
    accentYellowLight: '#78350F',
    navy: '#0F172A',
    navyDark: '#0A192F',
    navyCard: '#1E293B',
    border: '#1e293b',
    card: '#131c31',
    cardGlass: 'rgba(19, 28, 49, 0.92)',
    success: '#34d399',
    successBg: '#064e3b',
    warning: '#fbbf24',
    warningBg: '#78350f',
    danger: '#f87171',
    dangerBg: '#7f1d1d',
  },
} as const;

export const Gradients = {
  primary: ['#0A192F', '#0F172A'] as const, // Security Dark Navy
  gold: ['#F59E0B', '#D97706'] as const, // Security Vibrant Gold
  teal: ['#0D6E5F', '#074239'] as const, // Palomas Teal
  ocean: ['#0284C7', '#0369A1'] as const,
  sunset: ['#F59E0B', '#D97706'] as const,
  coral: ['#EF4444', '#DC2626'] as const,
  emerald: ['#10B981', '#059669'] as const,
  purple: ['#8B5CF6', '#6D28D9'] as const,
};

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
