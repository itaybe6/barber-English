import AsyncStorage from '@react-native-async-storage/async-storage';

export const MAX_LOGIN_FAILURES = 5;

const loginFailuresStorageKey = (phoneKey: string) => `@login_failures:${phoneKey}`;

export function normalizePhoneKey(phone: string): string {
  return phone.trim().replace(/\s+/g, '');
}

export async function readLoginFailures(phoneKey: string): Promise<number> {
  if (!phoneKey) return 0;
  const raw = await AsyncStorage.getItem(loginFailuresStorageKey(phoneKey));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function writeLoginFailures(phoneKey: string, count: number): Promise<void> {
  if (!phoneKey) return;
  if (count <= 0) {
    await AsyncStorage.removeItem(loginFailuresStorageKey(phoneKey));
  } else {
    await AsyncStorage.setItem(loginFailuresStorageKey(phoneKey), String(count));
  }
}
