import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { MonthEntry } from './utils';
import { MONTHS_HEIGHT } from './constants';

type Props = {
  data: MonthEntry[];
  activeIndex: number;
  primaryColor: string;
  onGoToIndex: (index: number) => void;
};

const labelStyle = (isCenter: boolean) => ({
  fontSize: isCenter ? 17 : 13,
  fontWeight: (isCenter ? '800' : '600') as '800' | '600',
  color: isCenter ? '#111827' : '#6B7280',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
  paddingHorizontal: 4,
});

/**
 * Always shows three columns: previous | current | next month (fixed width thirds).
 */
export function ThreeMonthHeader({ data, activeIndex, primaryColor, onGoToIndex }: Props) {
  const n = data.length;
  const safeIndex = Math.max(0, Math.min(n - 1, activeIndex));

  const prevEntry = safeIndex > 0 ? data[safeIndex - 1] : null;
  const currEntry = data[safeIndex];
  const nextEntry = safeIndex < n - 1 ? data[safeIndex + 1] : null;

  const emptyThird = () => (
    <View
      style={{
        flex: 1,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
      }}
    />
  );

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: MONTHS_HEIGHT,
        flexDirection: 'row',
        zIndex: 5,
        backgroundColor: '#FFFFFF',
      }}
    >
      {prevEntry ? (
        <Pressable
          onPress={() => onGoToIndex(safeIndex - 1)}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 4,
            borderBottomWidth: 3,
            borderBottomColor: 'transparent',
          }}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={labelStyle(false)}>
            {prevEntry.label}
          </Text>
        </Pressable>
      ) : (
        emptyThird()
      )}

      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 4,
          borderBottomWidth: 3,
          borderBottomColor: primaryColor,
        }}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={labelStyle(true)}>
          {currEntry?.label ?? ''}
        </Text>
      </View>

      {nextEntry ? (
        <Pressable
          onPress={() => onGoToIndex(safeIndex + 1)}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 4,
            borderBottomWidth: 3,
            borderBottomColor: 'transparent',
          }}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={labelStyle(false)}>
            {nextEntry.label}
          </Text>
        </Pressable>
      ) : (
        emptyThird()
      )}
    </View>
  );
}
