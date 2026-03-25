/**
 * Persists up to MAX_CUSTOM custom colors the admin has saved.
 * Custom colors are prepended to the flower presets (replacing the oldest custom slot).
 */
import { create } from 'zustand/react';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'custom_primary_colors_v1';
const MAX_CUSTOM  = 3; // how many custom slots to keep in the flower

interface CustomColorsState {
  customColors: string[];
  addCustomColor: (hex: string) => void;
}

export const useCustomColorsStore = create<CustomColorsState>()(
  persist(
    (set, get) => ({
      customColors: [],

      addCustomColor: (hex: string) => {
        const upper = hex.toUpperCase();
        const existing = get().customColors.filter((c) => c.toUpperCase() !== upper);
        // Newest first; cap at MAX_CUSTOM
        const next = [upper, ...existing].slice(0, MAX_CUSTOM);
        set({ customColors: next });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
