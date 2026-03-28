import React, { useCallback, useMemo, useState } from 'react';
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
}: {
  uri: string;
  itemSize: number;
  borderRadius: number;
  columnIndex: number;
  index: number;
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

  return (
    <Reanimated.View
      entering={
        columnIndex % 2 === 0
          ? FadeInRight.duration(HERO_DURATION).delay(
              HERO_INITIAL_DELAY * (columnIndex + 1) + (index % 17) * 13
            )
          : FadeInLeft.duration(HERO_DURATION).delay(
              HERO_INITIAL_DELAY * (columnIndex + 1) + (index % 17) * 13
            )
      }
      style={{
        width: itemSize,
        aspectRatio: 1,
        borderRadius,
        overflow: 'hidden',
      }}
    >
      <ExpoImage
        source={{ uri: activeUri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={120}
        onError={onError}
      />
    </Reanimated.View>
  );
}
