import { Platform } from 'react-native';
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy';

function pickExtension(fileName: string | null | undefined, sourceUri: string): string {
  const n = (fileName || '').toLowerCase();
  const fromName = n.match(/\.(mp4|mov|m4v|webm|3gp|mkv)$/);
  if (fromName) return `.${fromName[1]}`;
  const u = sourceUri.toLowerCase();
  const fromUri = u.match(/\.(mp4|mov|m4v|webm|3gp|mkv)(\?|$)/);
  if (fromUri) return `.${fromUri[1]}`;
  return '.mp4';
}

/**
 * Copy a picked gallery video into the app cache as a plain `file://` path.
 * expo-av often fails on Android `content://` and some iOS temp/library URIs; upload via `fetch` still works on the same path.
 */
export async function copyGalleryVideoToCacheForPlayback(
  sourceUri: string,
  fileNameHint?: string | null
): Promise<string> {
  const from = sourceUri.trim();
  if (!from) throw new Error('empty_uri');
  if (Platform.OS === 'web') return from;

  const base = cacheDirectory;
  if (!base) throw new Error('no_cache_directory');

  const ext = pickExtension(fileNameHint, from);
  const dest = `${base}gallery_pick_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;

  await copyAsync({ from, to: dest });
  return dest;
}
