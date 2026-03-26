import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
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
 * Visual left → right: … furthest future, next+1, next, current (current flush right).
 * So “reading” from current toward the left: current → next → next+1 …
 * Futures are reversed vs chronological array so the immediate left neighbor of current is the next month.
 */
export function ThreeMonthHeader({ data, activeIndex, primaryColor, onGoToIndex }: Props) {
  const n = data.length;
  const safeIndex = Math.max(0, Math.min(n - 1, activeIndex));
  const currEntry = data[safeIndex];

  const upcoming = data.slice(safeIndex + 1).map((entry, i) => ({
    entry,
    index: safeIndex + 1 + i,
  }));

  const [containerW, setContainerW] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [safeIndex, n, scrollToEnd]);

  const currentEl = (
    <View key={`cur-${safeIndex}`} style={currentStyle(primaryColor)}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={labelStyle(true)}>
        {currEntry?.label ?? ''}
      </Text>
    </View>
  );

  const futureEls = [...upcoming].reverse().map(({ entry, index }) => (
    <Pressable
      key={`f-${index}`}
      onPress={() => onGoToIndex(index)}
      style={sidePressStyle}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={labelStyle(false)}>
        {entry.label}
      </Text>
    </Pressable>
  ));

  /** Left → right: … Mar+1y, Feb+1y, …, Apr (next), current (right) */
  const rowChildren = [...futureEls, currentEl];

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
        direction: 'ltr',
      }}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: MONTHS_HEIGHT, direction: 'ltr' }}
        contentContainerStyle={{ minHeight: MONTHS_HEIGHT }}
        onContentSizeChange={scrollToEnd}
      >
        <View
          style={{
            flexDirection: 'row',
            direction: 'ltr',
            alignItems: 'center',
            justifyContent: 'flex-end',
            minWidth: containerW > 0 ? containerW : undefined,
            paddingHorizontal: 12,
            gap: 8,
            minHeight: MONTHS_HEIGHT,
          }}
        >
          {rowChildren}
        </View>
      </ScrollView>
    </View>
  );
}
