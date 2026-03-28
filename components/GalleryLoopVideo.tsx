import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus, type VideoReadyForDisplayEvent } from 'expo-av';

interface GalleryLoopVideoProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  /** Default COVER for tiles; CONTAIN for fullscreen viewer */
  resizeMode?: ResizeMode;
  onReadyForDisplay?: (event: VideoReadyForDisplayEvent) => void;
  onLoad?: (status: AVPlaybackStatus) => void;
  onError?: (error: string) => void;
}

/**
 * Muted autoplay loop for gallery tiles (no tap). Playback is always silent; the file may still contain an audio track.
 */
export function GalleryLoopVideo({
  uri,
  style,
  resizeMode = ResizeMode.COVER,
  onReadyForDisplay,
  onLoad,
  onError,
}: GalleryLoopVideoProps) {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  return (
    <Video
      pointerEvents="none"
      source={{ uri: trimmed }}
      style={style}
      resizeMode={resizeMode}
      isLooping
      shouldPlay
      isMuted
      useNativeControls={false}
      onReadyForDisplay={onReadyForDisplay}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
