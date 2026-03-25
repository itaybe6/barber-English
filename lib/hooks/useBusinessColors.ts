/**
 * Thin wrapper so all existing imports stay unchanged.
 * The actual state lives in BusinessColorsContext (one shared instance).
 */
export type { BusinessColors } from '@/lib/contexts/BusinessColorsContext';
export { useBusinessColorsContext as useBusinessColors } from '@/lib/contexts/BusinessColorsContext';
