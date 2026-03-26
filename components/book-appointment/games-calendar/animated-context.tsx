import React, { createContext, useContext, type PropsWithChildren } from 'react';
import { Dimensions } from 'react-native';
import Animated, {
  useAnimatedRef,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

export type CalendarAnimatedContextType = {
  activeIndexProgress: SharedValue<number>;
  scrollOffsetX: SharedValue<number>;
  pageWidth: SharedValue<number>;
  scrollViewRef: ReturnType<typeof useAnimatedRef<Animated.ScrollView>>;
};

const defaultPage = Dimensions.get('window').width;

export const CalendarAnimatedContext = createContext<CalendarAnimatedContextType | null>(null);

export function useBookingCalendarContext(): CalendarAnimatedContextType {
  const ctx = useContext(CalendarAnimatedContext);
  if (!ctx) {
    throw new Error('useBookingCalendarContext must be used within CalendarAnimatedProvider');
  }
  return ctx;
}

export function CalendarAnimatedProvider({ children }: PropsWithChildren) {
  const scrollOffsetX = useSharedValue(0);
  const activeIndexProgress = useSharedValue(0);
  const pageWidth = useSharedValue(defaultPage);
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>();

  const contextValue: CalendarAnimatedContextType = {
    activeIndexProgress,
    scrollOffsetX,
    pageWidth,
    scrollViewRef,
  };

  return (
    <CalendarAnimatedContext.Provider value={contextValue}>
      {children}
    </CalendarAnimatedContext.Provider>
  );
}
