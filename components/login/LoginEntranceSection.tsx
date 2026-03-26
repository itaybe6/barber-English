import React, { type ReactNode, useEffect } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const DURATION = 1350;
const FROM_Y = -44;

/**
 * Custom ease: fast start, strong deceleration — looks natural on mobile.
 * Bezier(0.22, 1, 0.36, 1) is close to iOS "spring" without actual spring physics.
 */
const SMOOTH_EASE = Easing.bezier(0.22, 1, 0.36, 1);

export interface LoginEntranceSectionProps {
  children: ReactNode;
  /** Milliseconds before this block's entrance animation starts (stagger). */
  delayMs: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fade-in + slide-down-from-above.
 * One shared value drives both opacity and translateY so they can never drift apart.
 */
export function LoginEntranceSection({ children, delayMs, style }: LoginEntranceSectionProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Start immediately — InteractionManager adds indeterminate lag that looks like stutter.
    progress.value = withDelay(
      delayMs,
      withTiming(1, { duration: DURATION, easing: SMOOTH_EASE }),
    );
  }, [delayMs]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [FROM_Y, 0]) }],
  }));

  return (
    <Animated.View
      style={[style, animStyle]}
      collapsable={false}
      // Pre-render to GPU texture before animation starts → eliminates first-frame jank.
      renderToHardwareTextureAndroid={Platform.OS === 'android'}
      shouldRasterizeIOS={Platform.OS === 'ios'}
    >
      {children}
    </Animated.View>
  );
}
