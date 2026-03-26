import React, { type PropsWithChildren } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useBookingCalendarContext } from './animated-context';
import { DAYS_HEADER_HEIGHT, MONTHS_HEIGHT } from './constants';

type Props = PropsWithChildren<{
  monthCount: number;
  onActiveIndexChange?: (index: number) => void;
}>;

export function ScrollContainer({ children, monthCount, onActiveIndexChange }: Props) {
  const { scrollOffsetX, activeIndexProgress, scrollViewRef, pageWidth } = useBookingCalendarContext();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const offsetX = event.contentOffset.x;
      const w = pageWidth.get();
      scrollOffsetX.set(offsetX);
      activeIndexProgress.set(offsetX / Math.max(1, w));
    },
  });

  const reportIndex = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = pageWidth.value;
    const idx = Math.max(0, Math.min(monthCount - 1, Math.round(x / Math.max(1, w))));
    onActiveIndexChange?.(idx);
  };

  return (
    <Animated.ScrollView
      ref={scrollViewRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      pagingEnabled
      directionalLockEnabled
      onMomentumScrollEnd={reportIndex}
      contentContainerStyle={{ paddingTop: MONTHS_HEIGHT + DAYS_HEADER_HEIGHT }}
    >
      {children}
    </Animated.ScrollView>
  );
}
