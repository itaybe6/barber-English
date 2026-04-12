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

const HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 };

/** Extract just the month name (without year) using Gregorian calendar */
function formatMonthOnly(date: Date): string {
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-gregory', { month: 'long' }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(date);
    } catch {
      return '';
    }
  }
}

export function ThreeMonthHeader({ data, activeIndex, primaryColor, onGoToIndex }: Props) {
  const n = data.length;
  const safeIndex = Math.max(0, Math.min(n - 1, activeIndex));
  const currEntry = data[safeIndex];

  // RTL: visually right = earlier in time, visually left = later in time
  const canGoPrev = safeIndex < n - 1;  // left arrow → next month (forward in RTL)
  const canGoNext = safeIndex > 0;      // right arrow → prev month (backward in RTL)

  const monthName = currEntry ? formatMonthOnly(currEntry.date) : '';
  const yearStr = currEntry ? String(currEntry.date.getFullYear()) : '';

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
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0,0,0,0.08)',
      }}
    >
      {/* ← Next month (RTL: left = forward in time) */}
      <Pressable
        onPress={() => canGoPrev && onGoToIndex(safeIndex + 1)}
        disabled={!canGoPrev}
        hitSlop={HIT_SLOP}
        style={({ pressed }) => ({
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 24,
          opacity: !canGoPrev ? 0.18 : 1,
          backgroundColor: pressed && canGoPrev ? `${primaryColor}15` : 'transparent',
        })}
        accessibilityRole="button"
        accessibilityLabel="חודש הבא"
      >
        <ChevronLeft size={22} color={primaryColor} strokeWidth={2.5} />
      </Pressable>

      {/* Month name + Year — large iOS Calendar style (avoid adjustsFontSizeToFit in flex: it shrinks Hebrew month to illegible size). */}
      <View
        style={{
          flex: 1,
          minWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 2,
        }}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            width: '100%',
            fontSize: 23,
            fontWeight: '700',
            color: '#1C1C1E',
            letterSpacing: -0.35,
            textAlign: 'center',
            includeFontPadding: false,
            lineHeight: 28,
            ...Platform.select({
              ios: { fontFamily: 'System' },
              android: { fontFamily: 'sans-serif-medium' },
            }),
          }}
        >
          {monthName}
        </Text>
        <Text
          style={{
            width: '100%',
            fontSize: 14,
            fontWeight: '500',
            color: '#8E8E93',
            textAlign: 'center',
            marginTop: 2,
            includeFontPadding: false,
            lineHeight: 18,
          }}
        >
          {yearStr}
        </Text>
      </View>

      {/* → Previous month (RTL: right = backward in time) */}
      <Pressable
        onPress={() => canGoNext && onGoToIndex(safeIndex - 1)}
        disabled={!canGoNext}
        hitSlop={HIT_SLOP}
        style={({ pressed }) => ({
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 24,
          opacity: !canGoNext ? 0.18 : 1,
          backgroundColor: pressed && canGoNext ? `${primaryColor}15` : 'transparent',
        })}
        accessibilityRole="button"
        accessibilityLabel="חודש קודם"
      >
        <ChevronRight size={22} color={primaryColor} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}
