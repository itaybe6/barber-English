import React, { Children, type PropsWithChildren } from 'react';
import { I18nManager, View, type NativeSyntheticEvent, type NativeScrollEvent, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useBookingCalendarContext } from './animated-context';
import { DAYS_HEADER_HEIGHT, MONTHS_HEIGHT } from './constants';

type Props = PropsWithChildren<{
  monthCount: number;
  onActiveIndexChange?: (index: number) => void;
}>;

/** Mirror horizontal scroll so in RTL a rightward swipe moves to the next month (chronologically). */
const RTL_MIRROR: ViewStyle = { transform: [{ scaleX: -1 }] };

export function ScrollContainer({ children, monthCount, onActiveIndexChange }: Props) {
  const { scrollOffsetX, activeIndexProgress, scrollViewRef, pageWidth } = useBookingCalendarContext();
  const rtl = I18nManager.isRTL;

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

  const mirroredChildren = rtl
    ? Children.map(children, (child, index) =>
        child ? (
          <View key={`cal-page-${index}`} style={RTL_MIRROR}>
            {child}
          </View>
        ) : null
      )
    : children;

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
      style={rtl ? RTL_MIRROR : undefined}
      contentContainerStyle={{ paddingTop: MONTHS_HEIGHT + DAYS_HEADER_HEIGHT }}
    >
      {mirroredChildren}
    </Animated.ScrollView>
  );
}
