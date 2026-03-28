import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

interface GalleryLoopVideoProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  /** Default COVER for tiles; CONTAIN for fullscreen viewer */
  resizeMode?: ResizeMode;
}

/**
 * Muted autoplay loop for gallery tiles (no tap). Playback is always silent; the file may still contain an audio track.
 */
export function GalleryLoopVideo({
  uri,
  style,
  resizeMode = ResizeMode.COVER,
}: GalleryLoopVideoProps) {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  return (
    <Video
      source={{ uri: trimmed }}
      style={style}
      resizeMode={resizeMode}
      isLooping
      shouldPlay
      isMuted
      useNativeControls={false}
    />
  );
}
