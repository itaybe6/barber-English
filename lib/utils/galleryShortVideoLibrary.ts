import * as MediaLibrary from 'expo-media-library';
import type { ImagePickerAsset } from 'expo-image-picker';
import { guessMediaMimeFromUri } from '@/lib/utils/mediaUrl';
import { GALLERY_VIDEO_MAX_DURATION_MS } from '@/lib/utils/galleryVideoPick';

const MAX_DURATION_SEC = GALLERY_VIDEO_MAX_DURATION_MS / 1000;

export function mediaLibraryVideoWithinGalleryLimit(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > 0 && durationSec <= MAX_DURATION_SEC + 0.02;
}

/**
 * Paginates the device library and returns only videos whose reported duration is within the gallery limit.
 * (System pickers cannot filter by duration; this is used for the in-app short-video grid.)
 */
export async function loadShortGalleryVideosFromLibrary(options?: {
  targetCount?: number;
  pageSize?: number;
  maxPages?: number;
}): Promise<MediaLibrary.Asset[]> {
  const targetCount = options?.targetCount ?? 120;
  const pageSize = options?.pageSize ?? 40;
  const maxPages = options?.maxPages ?? 40;

  const out: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let hasNext = true;
  let pages = 0;

  while (out.length < targetCount && hasNext && pages < maxPages) {
    pages += 1;
    const page = await MediaLibrary.getAssetsAsync({
      first: pageSize,
      after,
      mediaType: MediaLibrary.MediaType.video,
      sortBy: MediaLibrary.SortBy.creationTime,
    });

    for (const a of page.assets) {
      if (a.mediaType !== 'video') continue;
      if (mediaLibraryVideoWithinGalleryLimit(a.duration)) {
        out.push(a);
        if (out.length >= targetCount) break;
      }
    }

    after = page.endCursor;
    hasNext = page.hasNextPage;
  }

  return out;
}

export function formatVideoDurationShort(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Resolve a playable/uploadable URI and map to an ImagePicker-shaped asset (duration in ms).
 */
export async function mediaLibraryAssetToImagePickerVideoAsset(
  asset: MediaLibrary.Asset
): Promise<ImagePickerAsset | null> {
  const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
    shouldDownloadFromNetwork: true,
  });

  const durationSec =
    Number.isFinite(info.duration) && info.duration > 0 ? info.duration : asset.duration;
  const durationMs = Math.round(durationSec * 1000);

  const uri = info.localUri ?? info.uri;
  if (!uri) return null;
  if (uri.startsWith('ph://')) return null;

  return {
    uri,
    width: info.width,
    height: info.height,
    type: 'video',
    fileName: info.filename,
    duration: durationMs,
    mimeType: guessMediaMimeFromUri(info.filename || uri),
    assetId: info.id,
  };
}
