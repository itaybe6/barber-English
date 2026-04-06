import { Platform } from 'react-native';
import type { CompressOptions, VideoMetadata } from 'expo-image-and-video-compressor';
import { guessMediaMimeFromUri } from '@/lib/utils/mediaUrl';

export const GALLERY_VIDEO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

const VIDEO_SIZE_LIMIT_ERROR = 'gallery_video_size_limit_exceeded';
const VIDEO_COMPRESSOR_UNAVAILABLE_ERROR = 'gallery_video_compressor_unavailable';
const AUDIO_HEADROOM_BPS = 96_000;

/** `aggressive` = gallery **edit** flow: smaller dimensions / bitrates and recompress even when already under 2MB if it reduces size. */
export type GalleryVideoCompressionPreset = 'standard' | 'aggressive';

const COMPRESSION_PRESET = {
  standard: {
    minVideoBitrateBps: 260_000,
    maxVideoBitrateBps: 2_400_000,
    bitrateFactors: [1, 0.86, 0.72, 0.58] as const,
    maxSizeAttempts: [960, 720, 540, 480] as const,
    budgetVideoShare: 0.84,
  },
  aggressive: {
    minVideoBitrateBps: 160_000,
    maxVideoBitrateBps: 1_450_000,
    bitrateFactors: [0.9, 0.76, 0.62, 0.5, 0.38] as const,
    maxSizeAttempts: [720, 540, 480, 420, 360] as const,
    budgetVideoShare: 0.7,
  },
} as const;

export interface EnsureGalleryVideoWithinSizeLimitInput {
  uri: string;
  durationMs: number;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  /** Default `standard`. Use `aggressive` when editing an existing gallery item to squeeze more under the same cap. */
  compressionPreset?: GalleryVideoCompressionPreset;
}

export interface PreparedGalleryVideoAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
}

type VideoCompressorModule = typeof import('expo-image-and-video-compressor');

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sanitizeBaseName(fileName: string | null | undefined): string {
  const base = (fileName || '').replace(/\.[^.]+$/, '').trim();
  const cleaned = base.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'gallery_video';
}

function normalizeExtension(ext: string | null | undefined): string {
  const cleaned = (ext || '').trim().toLowerCase().replace(/^\./, '');
  if (!cleaned) return 'mp4';
  if (cleaned === 'quicktime') return 'mov';
  return cleaned;
}

function extensionFromMimeType(mimeType: string | null | undefined): string {
  const ct = (mimeType || '').trim().toLowerCase();
  if (ct === 'video/quicktime') return 'mov';
  if (ct.includes('m4v')) return 'm4v';
  if (ct === 'video/webm') return 'webm';
  if (ct === 'video/3gpp' || ct === 'video/3gp') return '3gp';
  return 'mp4';
}

function resolveExtension(meta: VideoMetadata | null, input: EnsureGalleryVideoWithinSizeLimitInput): string {
  const fromMeta = normalizeExtension(meta?.extension);
  if (fromMeta) return fromMeta;
  const fromName = input.fileName?.split('.').pop();
  if (fromName) return normalizeExtension(fromName);
  return extensionFromMimeType(input.mimeType);
}

function buildPreparedVideo(
  uri: string,
  meta: VideoMetadata | null,
  input: EnsureGalleryVideoWithinSizeLimitInput
): PreparedGalleryVideoAsset {
  const extension = resolveExtension(meta, input);
  const fileName = `${sanitizeBaseName(input.fileName)}_${Date.now()}.${extension}`;
  return {
    uri,
    fileName,
    mimeType: guessMediaMimeFromUri(`video.${extension}`),
    sizeBytes: meta?.size ?? input.fileSize ?? null,
  };
}

function createSizeLimitError() {
  return new Error(VIDEO_SIZE_LIMIT_ERROR);
}

function createCompressorUnavailableError() {
  return new Error(VIDEO_COMPRESSOR_UNAVAILABLE_ERROR);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

function isNativeCompressorUnavailable(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("cannot find native module 'bayutvideocompressor'") ||
    message.includes('cannot find native module "bayutvideocompressor"') ||
    message.includes('bayutvideocompressor') ||
    message.includes('compressor.compress is not a function') ||
    message.includes('getmetadata is not a function')
  );
}

async function loadVideoCompressor(): Promise<VideoCompressorModule | null> {
  try {
    const compressor = await import('expo-image-and-video-compressor');
    if (
      !compressor ||
      typeof compressor.compress !== 'function' ||
      typeof compressor.getMetadata !== 'function'
    ) {
      console.warn('[galleryVideoCompression] compressor module missing runtime methods');
      return null;
    }
    return compressor;
  } catch (error) {
    console.warn('[galleryVideoCompression] compressor module unavailable', error);
    return null;
  }
}

async function safeGetMetadata(
  compressor: VideoCompressorModule,
  uri: string
): Promise<VideoMetadata | null> {
  try {
    return await compressor.getMetadata(uri);
  } catch (error) {
    if (isNativeCompressorUnavailable(error)) {
      throw createCompressorUnavailableError();
    }
    console.warn('[galleryVideoCompression] getMetadata failed', error);
    return null;
  }
}

function buildCompressionPlan(
  durationMs: number,
  sourceMeta: VideoMetadata | null,
  preset: GalleryVideoCompressionPreset
): CompressOptions[] {
  const p = COMPRESSION_PRESET[preset];
  const durationSeconds = Math.max(durationMs / 1000, 1);
  const totalBudgetBps = Math.floor((GALLERY_VIDEO_MAX_SIZE_BYTES * 8) / durationSeconds);
  const targetVideoBitrate = clamp(
    Math.floor((totalBudgetBps - AUDIO_HEADROOM_BPS) * p.budgetVideoShare),
    p.minVideoBitrateBps,
    p.maxVideoBitrateBps
  );
  const sourceMaxDimension = Math.max(sourceMeta?.width ?? 0, sourceMeta?.height ?? 0);
  const seen = new Set<string>();
  const plan: CompressOptions[] = [];

  for (let i = 0; i < p.maxSizeAttempts.length; i += 1) {
    const rawMaxSize = p.maxSizeAttempts[i];
    const maxSize =
      sourceMaxDimension > 0 ? Math.min(rawMaxSize, sourceMaxDimension) : rawMaxSize;
    const factor = p.bitrateFactors[Math.min(i, p.bitrateFactors.length - 1)];
    const bitrate = clamp(
      Math.floor(targetVideoBitrate * factor),
      p.minVideoBitrateBps,
      p.maxVideoBitrateBps
    );
    const key = `${maxSize}-${bitrate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plan.push({
      bitrate,
      maxSize,
      codec: 'h264',
      speed: 'balanced',
      progressDivider: 5,
      minimumFileSizeForCompress: 0,
    });
  }

  return plan;
}

export function isGalleryVideoSizeLimitError(error: unknown): boolean {
  return error instanceof Error && error.message === VIDEO_SIZE_LIMIT_ERROR;
}

export function isGalleryVideoCompressionUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.message === VIDEO_COMPRESSOR_UNAVAILABLE_ERROR;
}

function isAtOrUnderGallerySizeLimit(bytes: unknown): bytes is number {
  return typeof bytes === 'number' && bytes <= GALLERY_VIDEO_MAX_SIZE_BYTES;
}

export async function ensureGalleryVideoWithinSizeLimit(
  input: EnsureGalleryVideoWithinSizeLimitInput
): Promise<PreparedGalleryVideoAsset> {
  if (Platform.OS === 'web') {
    if (typeof input.fileSize === 'number' && input.fileSize > GALLERY_VIDEO_MAX_SIZE_BYTES) {
      throw createSizeLimitError();
    }
    return buildPreparedVideo(input.uri, null, input);
  }

  const compressor = await loadVideoCompressor();
  if (!compressor) {
    throw createCompressorUnavailableError();
  }

  const preset: GalleryVideoCompressionPreset = input.compressionPreset ?? 'standard';

  const sourceMeta = await safeGetMetadata(compressor, input.uri);
  const alreadyWithinLimit =
    isAtOrUnderGallerySizeLimit(sourceMeta?.size) ||
    (sourceMeta?.size == null && isAtOrUnderGallerySizeLimit(input.fileSize));

  if (preset !== 'aggressive' && alreadyWithinLimit) {
    return buildPreparedVideo(input.uri, sourceMeta, input);
  }

  let smallestCandidate: PreparedGalleryVideoAsset | null = null;
  if (preset === 'aggressive' && alreadyWithinLimit) {
    smallestCandidate = buildPreparedVideo(input.uri, sourceMeta, input);
  } else if (sourceMeta?.size != null) {
    smallestCandidate = buildPreparedVideo(input.uri, sourceMeta, input);
  }

  let lastCompressionError: unknown = null;

  for (const attempt of buildCompressionPlan(input.durationMs, sourceMeta, preset)) {
    try {
      const compressedUri = await compressor.compress(input.uri, attempt);
      const compressedMeta = await safeGetMetadata(compressor, compressedUri);
      if (!compressedMeta) continue;

      const prepared = buildPreparedVideo(compressedUri, compressedMeta, input);
      if (
        !smallestCandidate ||
        (prepared.sizeBytes != null &&
          (smallestCandidate.sizeBytes == null || prepared.sizeBytes < smallestCandidate.sizeBytes))
      ) {
        smallestCandidate = prepared;
      }

      if (
        preset === 'standard' &&
        typeof prepared.sizeBytes === 'number' &&
        prepared.sizeBytes <= GALLERY_VIDEO_MAX_SIZE_BYTES
      ) {
        return prepared;
      }
    } catch (error) {
      if (isNativeCompressorUnavailable(error)) {
        throw createCompressorUnavailableError();
      }
      lastCompressionError = error;
      console.warn('[galleryVideoCompression] compression attempt failed', error);
    }
  }

  if (
    smallestCandidate &&
    typeof smallestCandidate.sizeBytes === 'number' &&
    smallestCandidate.sizeBytes <= GALLERY_VIDEO_MAX_SIZE_BYTES
  ) {
    return smallestCandidate;
  }

  const sizeError = createSizeLimitError();
  (sizeError as Error & { cause?: unknown }).cause = lastCompressionError;
  throw sizeError;
}
