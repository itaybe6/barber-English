import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

const thumbUriCache = new Map<string, string>();
const CACHE_CAP = 220;

/** Few parallel native thumbnail jobs — many at once causes iOS/Android to drop or fail thumbnails. */
const THUMB_MAX_PARALLEL = Platform.OS === 'ios' ? 3 : 4;

let thumbActive = 0;
const thumbWaitQueue: Array<() => void> = [];

function runThumbQueue() {
  while (thumbActive < THUMB_MAX_PARALLEL && thumbWaitQueue.length > 0) {
    const job = thumbWaitQueue.shift()!;
    thumbActive++;
    job();
  }
}

function enqueueThumbTask<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      fn()
        .then(resolve, reject)
        .finally(() => {
          thumbActive--;
          runThumbQueue();
        });
    };
    thumbWaitQueue.push(run);
    runThumbQueue();
  });
}

const inflightThumbs = new Map<string, Promise<string | null>>();

function cacheSet(key: string, uri: string) {
  while (thumbUriCache.size >= CACHE_CAP) {
    const first = thumbUriCache.keys().next().value;
    if (first === undefined) break;
    thumbUriCache.delete(first);
  }
  thumbUriCache.set(key, uri);
}

function cacheKeyFor(asset: MediaLibrary.Asset) {
  return `${asset.id}:${asset.modificationTime}`;
}

async function generateThumbnailFromSource(source: string, durationMs: number): Promise<string> {
  const safeDuration = Math.max(1, durationMs);
  const candidates = [
    Math.min(800, Math.max(1, Math.floor(safeDuration * 0.1))),
    50,
    Math.min(safeDuration - 1, Math.floor(safeDuration * 0.5)),
  ];
  let lastErr: unknown;
  for (const timeMs of candidates) {
    if (timeMs < 1) continue;
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(source, {
        quality: Platform.OS === 'ios' ? 0.38 : 0.45,
        time: timeMs,
      });
      if (uri) return uri;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('thumbnail_failed');
}

async function resolveThumbnailUri(asset: MediaLibrary.Asset): Promise<string | null> {
  const tryOnce = async (allowNetwork: boolean) => {
    const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
      shouldDownloadFromNetwork: allowNetwork,
    });
    const source = info.localUri ?? info.uri;
    if (!source) {
      throw new Error('no_local_uri');
    }
    const durationSec =
      Number.isFinite(info.duration) && info.duration > 0 ? info.duration : asset.duration;
    const durationMs = Math.max(1, Math.floor(durationSec * 1000));
    return generateThumbnailFromSource(source, durationMs);
  };

  try {
    return await tryOnce(false);
  } catch {
    try {
      return await tryOnce(true);
    } catch {
      return null;
    }
  }
}

function resolveThumbnailUriQueued(asset: MediaLibrary.Asset): Promise<string | null> {
  const key = cacheKeyFor(asset);
  const cached = thumbUriCache.get(key);
  if (cached) return Promise.resolve(cached);

  const existing = inflightThumbs.get(key);
  if (existing) return existing;

  const p = enqueueThumbTask(() => resolveThumbnailUri(asset));
  inflightThumbs.set(key, p);
  p.finally(() => inflightThumbs.delete(key));
  return p;
}

interface ShortGalleryVideoThumbProps {
  asset: MediaLibrary.Asset;
  iconColor: string;
}

/**
 * Lazy video poster for the short-video picker grid (MediaLibrary + expo-video-thumbnails).
 * Uses a global queue + cache so scrolling does not spawn dozens of parallel native calls.
 */
export const ShortGalleryVideoThumb = React.memo(function ShortGalleryVideoThumb({
  asset,
  iconColor,
}: ShortGalleryVideoThumbProps) {
  const cacheKey = cacheKeyFor(asset);
  const [thumbUri, setThumbUri] = useState<string | null>(() => thumbUriCache.get(cacheKey) ?? null);
  const [loading, setLoading] = useState(() => !thumbUriCache.has(cacheKey));

  useEffect(() => {
    const cached = thumbUriCache.get(cacheKey);
    if (cached) {
      setThumbUri(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setThumbUri(null);
    setLoading(true);

    (async () => {
      const uri = await resolveThumbnailUriQueued(asset);
      if (uri) {
        cacheSet(cacheKey, uri);
      }
      if (cancelled) return;
      setThumbUri(uri);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, asset.id, asset.modificationTime, asset.duration]);

  return (
    <View style={styles.wrap}>
      {thumbUri ? (
        <ExpoImage source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={iconColor} />
        </View>
      ) : null}
      {!loading && !thumbUri ? (
        <View style={styles.fallback}>
          <Ionicons name="videocam" size={28} color={iconColor} style={{ opacity: 0.85 }} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
