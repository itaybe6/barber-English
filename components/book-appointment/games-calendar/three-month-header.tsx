import React from 'react';
import { View, Text, Pressable, I18nManager } from 'react-native';
import type { MonthEntry } from './utils';
import { MONTHS_HEIGHT } from './constants';

type Props = {
  data: MonthEntry[];
  activeIndex: number;
  primaryColor: string;
  onGoToIndex: (index: number) => void;
};

const labelStyle = (isCurrent: boolean) => ({
  fontSize: isCurrent ? 17 : 13,
  fontWeight: (isCurrent ? '800' : '600') as '800' | '600',
  color: isCurrent ? '#111827' : '#6B7280',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
  paddingHorizontal: 4,
});

const sidePressStyle = {
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderBottomWidth: 3,
  borderBottomColor: 'transparent' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

const currentStyle = (primaryColor: string) => ({
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderBottomWidth: 3,
  borderBottomColor: primaryColor,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});

/**
 * Selected month is always at the visual right; previous / next sit to its left (RTL & LTR).
 * No empty flex columns — siblings hug the right edge.
 */
export function ThreeMonthHeader({ data, activeIndex, primaryColor, onGoToIndex }: Props) {
  const rtl = I18nManager.isRTL;
  const n = data.length;
  const safeIndex = Math.max(0, Math.min(n - 1, activeIndex));

  const prevEntry = safeIndex > 0 ? data[safeIndex - 1] : null;
  const currEntry = data[safeIndex];
  const nextEntry = safeIndex < n - 1 ? data[safeIndex + 1] : null;

  const currentEl = (
    <View key="cur" style={currentStyle(primaryColor)}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={labelStyle(true)}>
        {currEntry?.label ?? ''}
      </Text>
    </View>
  );

  const nextEl = nextEntry ? (
    <Pressable
      key="next"
      onPress={() => onGoToIndex(safeIndex + 1)}
      style={sidePressStyle}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={labelStyle(false)}>
        {nextEntry.label}
      </Text>
    </Pressable>
  ) : null;

  const prevEl = prevEntry ? (
    <Pressable
      key="prev"
      onPress={() => onGoToIndex(safeIndex - 1)}
      style={sidePressStyle}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={labelStyle(false)}>
        {prevEntry.label}
      </Text>
    </Pressable>
  ) : null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: MONTHS_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: rtl ? 'flex-start' : 'flex-end',
        paddingHorizontal: 12,
        gap: 8,
        zIndex: 5,
        backgroundColor: '#FFFFFF',
      }}
    >
      {rtl ? (
        <>
          {currentEl}
          {nextEl}
          {prevEl}
        </>
      ) : (
        <>
          {prevEl}
          {nextEl}
          {currentEl}
        </>
      )}
    </View>
  );
}
