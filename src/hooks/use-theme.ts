import { Colors } from '@/constants/theme';
import { useMobile } from '../context/MobileContext';

export function useTheme() {
  let theme: 'light' | 'dark' = 'light';
  try {
    const context = useMobile();
    theme = context.themeMode;
  } catch (e) {
    // Fallback if context is not yet loaded
  }

  return Colors[theme];
}
