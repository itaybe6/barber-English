import React from 'react';
import { View, StyleSheet } from 'react-native';

interface HorizontalCarouselDotsProps {
  /** Show only when count > minCount */
  count: number;
  minCount?: number;
  activeIndex: number;
  activeColor: string;
  inactiveColor?: string;
}

/** Pagination dots under a horizontal carousel (admin gallery / products on home). */
export function HorizontalCarouselDots({
  count,
  minCount = 2,
  activeIndex,
  activeColor,
  inactiveColor = 'rgba(60,60,67,0.28)',
}: HorizontalCarouselDotsProps) {
  if (count <= minCount) return null;

  return (
    <View style={styles.row} accessible={false} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => {
        const active = i === activeIndex;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              active ? styles.dotActive : null,
              {
                backgroundColor: active ? activeColor : inactiveColor,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    borderRadius: 3,
  },
});

export function carouselIndexFromOffset(
  offsetX: number,
  itemStride: number,
  count: number
): number {
  if (count <= 0) return 0;
  if (itemStride <= 0) return 0;
  const raw = Math.round(offsetX / itemStride);
  return Math.min(count - 1, Math.max(0, raw));
}
