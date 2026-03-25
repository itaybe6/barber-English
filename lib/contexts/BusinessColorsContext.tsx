/**
 * Global shared colors context.
 * Replaces per-component useState in useBusinessColors.
 * All components that call useBusinessColors() share ONE instance of this state.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { businessProfileApi } from '@/lib/api/businessProfile';

export interface BusinessColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

interface BusinessColorsContextType {
  colors: BusinessColors;
  isLoading: boolean;
  error: string | null;
  updatePrimaryColor: (newColor: string) => Promise<boolean>;
  refreshColors: () => Promise<void>;
}

const DEFAULT_COLORS: BusinessColors = {
  primary: '#000000',
  secondary: '#111111',
  accent: '#1f1f1f',
  background: '#ffffff',
  surface: '#ffffff',
  text: '#000000',
  textSecondary: '#4a4a4a',
  border: '#000000',
  success: '#16a34a',
  warning: '#f59e0b',
  error: '#dc2626',
  info: '#007AFF',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function generateColorPalette(primaryColor: string): BusinessColors {
  const rgb = hexToRgb(primaryColor);
  if (!rgb) return { ...DEFAULT_COLORS, primary: primaryColor };

  const { r, g, b } = rgb;
  const darken = (amount: number) => {
    const f = 1 - amount;
    return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
  };

  return {
    primary: primaryColor,
    secondary: darken(0.1),
    accent: darken(0.2),
    background: '#ffffff',
    surface: '#ffffff',
    text: '#000000',
    textSecondary: '#4a4a4a',
    border: primaryColor,
    success: '#16a34a',
    warning: '#f59e0b',
    error: '#dc2626',
    info: primaryColor,
  };
}

const BusinessColorsContext = createContext<BusinessColorsContextType | undefined>(undefined);

export const BusinessColorsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [colors, setColors] = useState<BusinessColors>(DEFAULT_COLORS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const refreshColors = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const profile = await businessProfileApi.getProfile();
      if (profile?.primary_color) {
        setColors(generateColorPalette(profile.primary_color));
      } else {
        setColors(DEFAULT_COLORS);
      }
    } catch (err) {
      console.error('[BusinessColors] load error', err);
      setError(err instanceof Error ? err.message : 'Failed to load colors');
      setColors(DEFAULT_COLORS);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshColors();
  }, [refreshColors]);

  const updatePrimaryColor = useCallback(async (newColor: string): Promise<boolean> => {
    const generated = generateColorPalette(newColor);
    // Optimistic: update state immediately so every consumer sees it right away.
    setColors(generated);
    try {
      const profile = await businessProfileApi.getProfile();
      if (!profile) return false;
      const updated = await businessProfileApi.upsertProfile({
        ...profile,
        primary_color: newColor,
      });
      if (updated) {
        setColors(generated);
        return true;
      }
      // Roll back on failure
      await refreshColors();
      return false;
    } catch (err) {
      console.error('[BusinessColors] update error', err);
      setError(err instanceof Error ? err.message : 'Failed to update color');
      await refreshColors();
      return false;
    }
  }, [refreshColors]);

  const value = useMemo(
    () => ({ colors, isLoading, error, updatePrimaryColor, refreshColors }),
    [colors, isLoading, error, updatePrimaryColor, refreshColors]
  );

  return (
    <BusinessColorsContext.Provider value={value}>
      {children}
    </BusinessColorsContext.Provider>
  );
};

/** Internal hook — only for useBusinessColors wrapper below. */
export const useBusinessColorsContext = (): BusinessColorsContextType => {
  const ctx = useContext(BusinessColorsContext);
  if (!ctx) throw new Error('useBusinessColorsContext must be used inside <BusinessColorsProvider>');
  return ctx;
};
