import { useState, useEffect } from 'react';
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

// Default colors fallback
const defaultColors: BusinessColors = {
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

export const useBusinessColors = () => {
  const [colors, setColors] = useState<BusinessColors>(defaultColors);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBusinessColors();
  }, []);

  const loadBusinessColors = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const profile = await businessProfileApi.getProfile();
      
      if (profile?.primary_color) {
        // Generate color variations based on the primary color
        const primaryColor = profile.primary_color;
        const generatedColors = generateColorPalette(primaryColor);
        setColors(generatedColors);
      } else {
        // Use default colors if no primary color is set
        setColors(defaultColors);
      }
    } catch (err) {
      console.error('Error loading business colors:', err);
      setError(err instanceof Error ? err.message : 'Failed to load colors');
      setColors(defaultColors);
    } finally {
      setIsLoading(false);
    }
  };

  const generateColorPalette = (primaryColor: string): BusinessColors => {
    // Convert hex to RGB
    const hex = primaryColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Generate variations
    const darken = (amount: number) => {
      const factor = 1 - amount;
      return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
    };

    const lighten = (amount: number) => {
      const factor = 1 + amount;
      return `rgb(${Math.round(Math.min(255, r * factor))}, ${Math.round(Math.min(255, g * factor))}, ${Math.round(Math.min(255, b * factor))})`;
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
  };

  const updatePrimaryColor = async (newColor: string) => {
    try {
      // Immediately update the colors first for instant feedback
      const generatedColors = generateColorPalette(newColor);
      setColors(generatedColors);
      
      // Update the database
      const profile = await businessProfileApi.getProfile();
      if (profile) {
        const updatedProfile = await businessProfileApi.upsertProfile({
          ...profile,
          primary_color: newColor,
        });
        
        if (updatedProfile) {
          // Ensure colors are set correctly after database update
          setColors(generatedColors);
          
          // Force multiple updates to ensure all components get the new colors
          setTimeout(() => setColors(generatedColors), 100);
          setTimeout(() => setColors(generatedColors), 300);
          setTimeout(() => setColors(generatedColors), 500);
          
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Error updating primary color:', err);
      setError(err instanceof Error ? err.message : 'Failed to update color');
      return false;
    }
  };

  return {
    colors,
    isLoading,
    error,
    updatePrimaryColor,
    refreshColors: loadBusinessColors,
  };
};
