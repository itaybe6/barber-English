import React, { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Reanimated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { manicureImages } from '@/src/constants/manicureImages';

const HERO_INITIAL_DELAY = 200;
const HERO_DURATION = 500;

/**
 * Single hero marquee cell: tries primary URL, then cycles bundled manicure URLs on load error
 * (e.g. private Supabase object or transient network). Keeps the hero from appearing empty.
 */
export function ManicureMarqueeTile({
  uri,
  itemSize,
  borderRadius,
  columnIndex,
  index,
  glassFrame = false,
}: {
  uri: string;
  itemSize: number;
  borderRadius: number;
  columnIndex: number;
  index: number;
  /** Frosted glass-style rim so tiles float on busy backgrounds (admin home). */
  glassFrame?: boolean;
}) {
  const chain = useMemo(() => {
    const trimmed = uri.trim();
    const rest = manicureImages.filter((u) => u !== trimmed);
    return trimmed.length > 0 ? [trimmed, ...rest] : [...manicureImages];
  }, [uri]);

  const [chainIndex, setChainIndex] = useState(0);
  const maxI = Math.max(0, chain.length - 1);
  const activeUri = chain[Math.min(chainIndex, maxI)];

  const onError = useCallback(() => {
    setChainIndex((i) => (i < maxI ? i + 1 : i));
  }, [maxI]);

  const entering =
    columnIndex % 2 === 0
      ? FadeInRight.duration(HERO_DURATION).delay(
          HERO_INITIAL_DELAY * (columnIndex + 1) + (index % 17) * 13
        )
      : FadeInLeft.duration(HERO_DURATION).delay(
          HERO_INITIAL_DELAY * (columnIndex + 1) + (index % 17) * 13
        );

  const imageEl = (
    <ExpoImage
      source={{ uri: activeUri }}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={120}
      onError={onError}
    />
  );

  if (!glassFrame) {
    return (
      <Reanimated.View
        entering={entering}
        style={{
          width: itemSize,
          aspectRatio: 1,
          borderRadius,
          overflow: 'hidden',
        }}
      >
        {imageEl}
      </Reanimated.View>
    );
  }

  const pad = 3;
  return (
    <Reanimated.View
      entering={entering}
      style={[
        styles.glassOuter,
        {
          width: itemSize + pad * 2,
          height: itemSize + pad * 2,
          borderRadius: borderRadius + pad,
        },
      ]}
    >
      <View
        style={[
          styles.glassInnerClip,
          { width: itemSize, aspectRatio: 1, borderRadius },
        ]}
      >
        {imageEl}
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  glassOuter: {
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  glassInnerClip: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
});
