import React, { type PropsWithChildren } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useBookingCalendarContext } from './animated-context';
import { DAYS_HEADER_HEIGHT, MONTHS_HEIGHT } from './constants';

type Props = PropsWithChildren<{
  monthCount: number;
  /** When true: pages are rendered last→first; scroll offset maps so swiping right moves to the next month. */
  invertedPaging: boolean;
  onActiveIndexChange?: (index: number) => void;
}>;

export function ScrollContainer({
  children,
  monthCount,
  invertedPaging,
  onActiveIndexChange,
}: Props) {
  const { scrollOffsetX, activeIndexProgress, scrollViewRef, pageWidth } = useBookingCalendarContext();

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const offsetX = event.contentOffset.x;
        const w = pageWidth.get();
        scrollOffsetX.set(offsetX);
        const physical = offsetX / Math.max(1, w);
        if (invertedPaging) {
          activeIndexProgress.set(monthCount - 1 - physical);
        } else {
          activeIndexProgress.set(physical);
        }
      },
    },
    [monthCount, invertedPaging]
  );

  const reportIndex = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = pageWidth.value;
    const physical = Math.max(0, Math.min(monthCount - 1, Math.round(x / Math.max(1, w))));
    const logical = invertedPaging ? monthCount - 1 - physical : physical;
    onActiveIndexChange?.(logical);
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
      style={{ direction: 'ltr' }}
      contentContainerStyle={{ paddingTop: MONTHS_HEIGHT + DAYS_HEADER_HEIGHT }}
    >
      {children}
    </Animated.ScrollView>
  );
}
