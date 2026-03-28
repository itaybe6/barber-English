import type { RefObject } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { default as ExpoVideo } from 'expo-av/build/Video';

/** Gallery design videos: max length (matches `videoMaxDuration` on the picker, seconds → ms on asset). */
export const GALLERY_VIDEO_MAX_DURATION_MS = 15_000;

/**
 * Picker options. We intentionally do **not** set `videoExportPreset` on iOS: presets like H264_1280x720
 * transcode after selection and block for a long time. Default Passthrough returns the asset quickly;
 * upload size follows the original file (still capped at 15s by validation).
 */
export function getGalleryVideoPickerOptions(): ImagePicker.ImagePickerOptions {
  return {
    mediaTypes: ['videos'],
    allowsMultipleSelection: false,
    quality: 1,
    base64: false,
    videoMaxDuration: 15,
  };
}

export function durationMsFromPickerAsset(asset: ImagePicker.ImagePickerAsset): number | null {
  if (typeof asset.duration === 'number' && Number.isFinite(asset.duration)) {
    return asset.duration;
  }
  return null;
}

export function isVideoDurationOverGalleryLimit(durationMs: number | null): boolean {
  return durationMs !== null && durationMs > GALLERY_VIDEO_MAX_DURATION_MS;
}

/**
 * When the picker omits `duration` (some Android paths), load briefly via expo-av to read `durationMillis`.
 */
export async function probeVideoDurationMillisWithRef(
  ref: RefObject<ExpoVideo | null>,
  uri: string
): Promise<number | null> {
  const v = ref.current;
  if (!v) return null;
  try {
    await v.unloadAsync().catch(() => {});
    const status = await v.loadAsync({ uri }, { shouldPlay: false, isMuted: true, isLooping: false }, false);
    if (status.isLoaded && typeof status.durationMillis === 'number') {
      return status.durationMillis;
    }
  } catch (e) {
    console.warn('[galleryVideoPick] duration probe failed', e);
  } finally {
    try {
      await v.unloadAsync();
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function resolveGalleryVideoDurationMs(
  asset: ImagePicker.ImagePickerAsset,
  probeRef: RefObject<ExpoVideo | null>
): Promise<number | null> {
  const direct = durationMsFromPickerAsset(asset);
  if (direct !== null) return direct;
  return probeVideoDurationMillisWithRef(probeRef, asset.uri);
}
