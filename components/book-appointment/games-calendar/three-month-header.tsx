import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { MonthEntry } from './utils';
import { MONTHS_HEIGHT } from './constants';

type Props = {
  data: MonthEntry[];
  activeIndex: number;
  primaryColor: string;
  onGoToIndex: (index: number) => void;
};

const HIT_SLOP = { top: 14, bottom: 14, left: 14, right: 14 };

export function ThreeMonthHeader({ data, activeIndex, primaryColor, onGoToIndex }: Props) {
  const n = data.length;
  const safeIndex = Math.max(0, Math.min(n - 1, activeIndex));
  const currEntry = data[safeIndex];

  const canGoPrev = safeIndex > 0;
  const canGoNext = safeIndex < n - 1;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: MONTHS_HEIGHT,
        zIndex: 5,
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        direction: 'ltr',
        paddingHorizontal: 6,
        // Subtle bottom separator
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0,0,0,0.08)',
      }}
    >
      {/* ← Previous month */}
      <Pressable
        onPress={() => canGoPrev && onGoToIndex(safeIndex - 1)}
        disabled={!canGoPrev}
        hitSlop={HIT_SLOP}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
          opacity: !canGoPrev ? 0.18 : 1,
          backgroundColor:
            pressed && canGoPrev
              ? `${primaryColor}12`
              : 'transparent',
        })}
        accessibilityRole="button"
        accessibilityLabel="חודש קודם"
      >
        <ChevronLeft
          size={21}
          color={primaryColor}
          strokeWidth={2.6}
        />
      </Pressable>

      {/* Month + Year title */}
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            fontSize: 17,
            fontWeight: '700',
            color: '#1C1C1E',
            letterSpacing: -0.3,
            textAlign: 'center',
            ...Platform.select({
              ios: { fontFamily: 'System' },
              android: { fontFamily: 'sans-serif-medium' },
            }),
          }}
        >
          {currEntry?.label ?? ''}
        </Text>
      </View>

      {/* → Next month */}
      <Pressable
        onPress={() => canGoNext && onGoToIndex(safeIndex + 1)}
        disabled={!canGoNext}
        hitSlop={HIT_SLOP}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
          opacity: !canGoNext ? 0.18 : 1,
          backgroundColor:
            pressed && canGoNext
              ? `${primaryColor}12`
              : 'transparent',
        })}
        accessibilityRole="button"
        accessibilityLabel="חודש הבא"
      >
        <ChevronRight
          size={21}
          color={primaryColor}
          strokeWidth={2.6}
        />
      </Pressable>
    </View>
  );
}

