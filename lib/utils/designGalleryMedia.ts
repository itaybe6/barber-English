import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { compressImage, compressImages } from '@/lib/utils/imageCompression';
import type { ImagePickerAsset } from 'expo-image-picker';

export interface GalleryPickAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  base64?: string | null;
  mediaKind: 'image' | 'video';
  /** Compressed JPEG poster (local file) — only for videos */
  posterUri?: string | null;
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)(\?|$)/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXT.test(url.split('#')[0]);
}

/**
 * In grid carousels, hide the raw video URL when it is immediately preceded by a still image
 * (poster + video pair from upload pipeline).
 */
export function filterUrlsForCompactGrid(urls: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (isVideoUrl(u)) {
      const prev = urls[i - 1];
      if (prev && !isVideoUrl(prev)) continue;
    }
    out.push(u);
  }
  return out;
}

function guessVideoMime(fileName?: string | null, uri?: string): string {
  const name = (fileName || uri || '').toLowerCase();
  if (name.endsWith('.mov') || name.includes('.mov?')) return 'video/quicktime';
  if (name.endsWith('.webm') || name.includes('.webm?')) return 'video/webm';
  return 'video/mp4';
}

function isPickedVideo(asset: ImagePickerAsset): boolean {
  if (asset.type === 'video') return true;
  const m = asset.mimeType || '';
  return m.startsWith('video/');
}

/**
 * After picker: compress images; for videos, transcode preset is handled by ImagePicker (iOS).
 * Builds a small JPEG poster per video for fast gallery loading.
 */
export async function processGalleryPickerAssets(assets: ImagePickerAsset[]): Promise<GalleryPickAsset[]> {
  const out: GalleryPickAsset[] = [];

  for (const a of assets) {
    if (isPickedVideo(a)) {
      let posterUri: string | null = null;
      if (Platform.OS !== 'web') {
        try {
          const thumb = await VideoThumbnails.getThumbnailAsync(a.uri, {
            time: 450,
            quality: 0.82,
          });
          const poster = await compressImage(thumb.uri, {
            quality: 0.74,
            maxWidth: 960,
            maxHeight: 960,
            format: 'jpeg',
          });
          posterUri = poster.uri;
        } catch (e) {
          console.warn('designGalleryMedia: video poster failed', e);
        }
      }
      out.push({
        mediaKind: 'video',
        uri: a.uri,
        mimeType: a.mimeType || guessVideoMime(a.fileName, a.uri),
        fileName: a.fileName,
        base64: null,
        posterUri,
      });
    } else {
      const [compressed] = await compressImages([a.uri], {
        quality: 0.7,
        maxWidth: 1200,
        maxHeight: 1200,
        format: 'jpeg',
      });
      out.push({
        mediaKind: 'image',
        uri: compressed.uri,
        mimeType: 'image/jpeg',
        fileName: `compressed_${Date.now()}_${out.length}.jpg`,
        base64: null,
      });
    }
  }

  return out;
}
