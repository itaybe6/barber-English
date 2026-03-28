import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { AVPlaybackStatus } from 'expo-av';
import { GalleryLoopVideo } from '@/components/GalleryLoopVideo';

interface GalleryPickedVideoPreviewProps {
  uri: string;
  /** Numeric size fixes expo-av `Video` staying blank with percentage sizing in tiles */
  width: number;
  height: number;
  accentColor?: string;
  /**
   * When false, only a static thumbnail is shown (no `Video`). Required inside modals/sheets on
   * **Android**: `expo-av` Video can capture touches for the whole window, breaking header close and other controls.
   * On **web**, playback stays live even when false (thumbnails are unreliable there).
   */
  playback?: boolean;
}

/**
 * Local picked video: looping muted playback + optional thumbnail overlay until the first frame is ready.
 */
export function GalleryPickedVideoPreview({
  uri,
  width,
  height,
  accentColor = '#666',
  playback = true,
}: GalleryPickedVideoPreviewProps) {
  const trimmed = uri.trim();
  /** Poster-only on native when playback is off; web keeps Video so admin FAB controls still work there. */
  const posterOnly = !playback && Platform.OS !== 'web';
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [thumbnailLoadFailed, setThumbnailLoadFailed] = useState(false);
  const [posterWaitTimedOut, setPosterWaitTimedOut] = useState(false);

  useEffect(() => {
    setVideoReady(false);
    setVideoError(false);
    setThumbUri(null);
    setThumbnailLoadFailed(false);
    setPosterWaitTimedOut(false);
    if (Platform.OS === 'web' && trimmed) {
      setVideoReady(true);
    }
  }, [trimmed]);

  useEffect(() => {
    if (!trimmed || Platform.OS === 'web') return;
    const safety = setTimeout(() => {
      setVideoReady((prev) => prev || true);
    }, 6500);
    return () => clearTimeout(safety);
  }, [trimmed]);

  useEffect(() => {
    if (!posterOnly || !trimmed) return;
    const t = setTimeout(() => setPosterWaitTimedOut(true), 5500);
    return () => clearTimeout(t);
  }, [posterOnly, trimmed]);

  useEffect(() => {
    if (Platform.OS === 'web' || !trimmed) return;
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(trimmed, { time: 200, quality: 0.48 })
      .then((r) => {
        if (!cancelled && r.uri) setThumbUri(r.uri);
      })
      .catch(() => {
        if (!cancelled) setThumbnailLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [trimmed]);

  const markReady = useCallback(() => {
    setVideoReady(true);
  }, []);

  const onLoad = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) setVideoReady(true);
  }, []);

  const onErr = useCallback(() => {
    setVideoError(true);
  }, []);

  if (!trimmed) return null;

  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (posterOnly) {
    const showPosterSpinner = !thumbUri && !thumbnailLoadFailed && !posterWaitTimedOut;
    const showPosterFallback = !thumbUri && (thumbnailLoadFailed || posterWaitTimedOut);

    return (
      <View
        pointerEvents="none"
        style={{ width: w, height: h, backgroundColor: '#141414', position: 'relative' }}
      >
        {thumbUri ? (
          <ExpoImage
            source={{ uri: thumbUri }}
            style={{ width: w, height: h }}
            contentFit="cover"
            cachePolicy="none"
          />
        ) : null}
        {showPosterSpinner ? (
          <View style={[StyleSheet.absoluteFillObject, styles.overlay]} pointerEvents="none">
            <ActivityIndicator size="small" color={accentColor} />
          </View>
        ) : null}
        {showPosterFallback ? (
          <View style={[StyleSheet.absoluteFillObject, styles.overlay]} pointerEvents="none">
            <Ionicons name="videocam" size={32} color={accentColor} style={{ opacity: 0.75 }} />
          </View>
        ) : null}
      </View>
    );
  }

  const showLoadingOverlay = !videoReady && !videoError;
  const showFallbackOnly = videoError && !thumbUri;
  const showThumbOnError = videoError && !!thumbUri;

  return (
    <View
      pointerEvents="none"
      style={{ width: w, height: h, backgroundColor: '#141414', position: 'relative' }}
    >
      <GalleryLoopVideo
        uri={trimmed}
        style={{ width: w, height: h }}
        onReadyForDisplay={markReady}
        onLoad={onLoad}
        onError={onErr}
      />
      {showLoadingOverlay ? (
        <View style={[StyleSheet.absoluteFillObject, styles.overlay]} pointerEvents="none">
          {thumbUri ? (
            <ExpoImage source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" />
          ) : null}
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      ) : null}
      {showThumbOnError ? (
        <View style={[StyleSheet.absoluteFillObject, styles.overlay]} pointerEvents="none">
          <ExpoImage source={{ uri: thumbUri! }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" />
        </View>
      ) : null}
      {showFallbackOnly ? (
        <View style={[StyleSheet.absoluteFillObject, styles.overlay]}>
          <Ionicons name="videocam" size={32} color={accentColor} style={{ opacity: 0.75 }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
