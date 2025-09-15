import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';

// Theme types
export interface ThemeColors {
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

export interface ThemeBranding {
  logo: string;
  logoWhite: string;
  companyName: string;
  website: string;
  supportEmail: string;
}

export interface ThemeFonts {
  primary: string;
  secondary: string;
}

export interface Theme {
  colors: ThemeColors;
  branding: ThemeBranding;
  fonts: ThemeFonts;
}

export interface ThemeContextType {
  theme: Theme;
  isLoading: boolean;
  error: string | null;
  client: string;
}

// Default theme (fallback)
const defaultTheme: Theme = {
  colors: {
    primary: '#007AFF',
    secondary: '#5856D6',
    accent: '#FF3B30',
    background: '#FFFFFF',
    surface: '#F2F2F7',
    text: '#1C1C1E',
    textSecondary: '#8E8E93',
    border: '#E5E5EA',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    info: '#007AFF',
  },
  branding: {
    logo: './assets/images/logo-03.png',
    logoWhite: './assets/images/logo-03.png',
    companyName: 'Default Company',
    website: 'https://default.com',
    supportEmail: 'support@default.com',
  },
  fonts: {
    primary: 'System',
    secondary: 'System',
  },
};

// Create context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme provider props
interface ThemeProviderProps {
  children: ReactNode;
}

// Theme provider component
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<string>('default');
  
  // Use business colors hook
  const { colors: businessColors, isLoading: colorsLoading, error: colorsError } = useBusinessColors();
  
  // Use color update context for immediate updates
  const { colorUpdateTrigger, forceThemeUpdate } = useColorUpdate();

  useEffect(() => {
    loadTheme();
  }, []);

  // Update theme when business colors change
  useEffect(() => {
    if (!colorsLoading && businessColors) {
      setTheme(prevTheme => ({
        ...prevTheme,
        colors: businessColors,
      }));
    }
  }, [businessColors, colorsLoading]);

  // Force update when colors change (for immediate updates)
  const forceUpdate = React.useCallback(() => {
    setTheme(prevTheme => ({
      ...prevTheme,
      colors: businessColors,
    }));
  }, [businessColors]);

  // Register force update function with color update context
  useEffect(() => {
    forceThemeUpdate(forceUpdate);
  }, [forceThemeUpdate, forceUpdate]);

  // Listen for color update triggers and force immediate update
  useEffect(() => {
    if (colorUpdateTrigger > 0) {
      // Force immediate update even if businessColors haven't loaded yet
      if (businessColors) {
        setTheme(prevTheme => ({
          ...prevTheme,
          colors: businessColors,
        }));
      } else {
        // If businessColors aren't loaded yet, force a re-render anyway
        setTheme(prevTheme => ({
          ...prevTheme,
          // Keep existing colors but force update
        }));
      }
    }
  }, [colorUpdateTrigger, businessColors]);

  const loadTheme = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // In a real app, you might fetch this from a remote source
      // For now, we'll try to load from the current.json file
      // Note: In React Native, we can't directly read files, so this would need
      // to be handled differently in a real implementation
      
      // For development, we'll use a mock approach
      // In production, you might want to bundle the theme with the app
      // or fetch it from a remote source
      
      const mockTheme = await loadMockTheme();
      setTheme(mockTheme);
      setClient(mockTheme.branding.companyName.toLowerCase().replace(/\s+/g, ''));
      
    } catch (err) {
      console.error('Error loading theme:', err);
      setError(err instanceof Error ? err.message : 'Failed to load theme');
      setTheme(defaultTheme);
    } finally {
      setIsLoading(false);
    }
  };

  // Load theme from current.json or fallback to default
  const loadMockTheme = async (): Promise<Theme> => {
    try {
      // Try to get theme from Constants (injected by app.config.js)
      const currentTheme = Constants.expoConfig?.extra?.theme;
      if (currentTheme) {
        return currentTheme as Theme;
      }
    } catch (error) {
      console.warn('Could not load theme from Constants:', error);
    }

    // Fallback to default theme
    return defaultTheme;
  };

  const contextValue: ThemeContextType = {
    theme,
    isLoading: isLoading || colorsLoading,
    error: error || colorsError,
    client,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook to use theme
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Hook to get just the colors
export const useColors = (): ThemeColors => {
  const { theme } = useTheme();
  return theme.colors;
};

// Hook to get just the branding
export const useBranding = (): ThemeBranding => {
  const { theme } = useTheme();
  return theme.branding;
};

// Hook to get just the fonts
export const useFonts = (): ThemeFonts => {
  const { theme } = useTheme();
  return theme.fonts;
};
