import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export function getExpoExtra(): Record<string, any> {
  try {
    const devExtra = (Constants as any)?.expoConfig?.extra;
    if (devExtra) return devExtra as Record<string, any>;
  } catch {}

  try {
    const manifest: any = (Updates as any)?.manifest ?? {};
    const prodExtra =
      manifest?.extra?.expoClient?.extra // EAS manifest2 shape
      ?? manifest?.extra                 // Classic shape
      ?? {};
    return prodExtra as Record<string, any>;
  } catch {}

  return {};
}


