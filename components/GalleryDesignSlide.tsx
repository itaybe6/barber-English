import React from 'react';
import { Image, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { isVideoUrl } from '@/lib/utils/designGalleryMedia';

interface GalleryDesignSlideProps {
  uri: string;
  style: StyleProp<ImageStyle | ViewStyle>;
  resizeMode?: 'cover' | 'contain';
  onVisualReady?: () => void;
  /** When set, applied to the root (e.g. Animated.Image opacity pattern) */
  contentStyle?: StyleProp<ImageStyle | ViewStyle>;
  /** Fullscreen viewer: native controls and playback */
  videoInteractive?: boolean;
}

export function GalleryDesignSlide({
  uri,
  style,
  resizeMode = 'cover',
  onVisualReady,
  contentStyle,
  videoInteractive = false,
}: GalleryDesignSlideProps) {
  if (!isVideoUrl(uri)) {
    return (
      <Image
        source={{ uri }}
        style={[style, contentStyle] as StyleProp<ImageStyle>}
        resizeMode={resizeMode}
        onLoad={onVisualReady}
      />
    );
  }

  return (
    <Video
      source={{ uri }}
      style={[style, contentStyle] as object}
      resizeMode={resizeMode === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER}
      shouldPlay={false}
      isLooping={false}
      isMuted={!videoInteractive}
      useNativeControls={videoInteractive}
      onReadyForDisplay={onVisualReady}
    />
  );
}
