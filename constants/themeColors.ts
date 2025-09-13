import { useColors } from '@/src/theme/ThemeProvider';

// This file provides a hook-based approach to colors
// Use this instead of the static colors.ts file

export const useThemeColors = () => {
  const colors = useColors();
  
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    subtext: colors.textSecondary,
    border: colors.border,
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
    overlay: 'rgba(0, 0, 0, 0.5)',
  };
};

// Fallback colors for when theme is not available
export const fallbackColors = {
  primary: '#000000',
  secondary: '#111111',
  accent: '#1f1f1f',
  background: '#ffffff',
  card: '#ffffff',
  text: '#000000',
  subtext: '#4a4a4a',
  border: '#000000',
  success: '#16a34a',
  error: '#dc2626',
  warning: '#f59e0b',
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
  overlay: '#0a0a0a',
};
