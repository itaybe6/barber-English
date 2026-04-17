import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { ResizeMode } from 'expo-av';
import { GalleryLoopVideo } from '@/components/GalleryLoopVideo';
import type { HomeHeroSingleKind } from '@/lib/utils/homeHeroMode';

type Props = {
  uri: string;
  kind: HomeHeroSingleKind;
  /** Bottom fade target — matches client/admin hero sheet (`#FFFFFF`). */
  fadeToColor?: string;
};

/**
 * Full-bleed image or muted looping video for client/admin home hero (under the white sheet).
 * Image is always centered and covers the full area (even if the source is small).
 * The bottom fade only occupies the lower 48% of the area so the top stays crisp.
 */
export function HomeHeroSingleBackdrop({ uri, kind, fadeToColor = '#FFFFFF' }: Props) {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  return (
    <View style={styles.root} pointerEvents="none">
      {kind === 'video' ? (
        <GalleryLoopVideo uri={trimmed} style={StyleSheet.absoluteFillObject} resizeMode={ResizeMode.COVER} />
      ) : (
        <Image
          source={{ uri: trimmed }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          contentPosition={{ top: '50%', left: '50%' }}
          transition={200}
        />
      )}
      {/* Gradient covers only the bottom 48% — the top half of the image is fully crisp */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0)',
          'rgba(255,255,255,0.45)',
          'rgba(255,255,255,0.82)',
          fadeToColor,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        locations={[0, 0.42, 0.78, 1]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%',
  },
});
