import React, { useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const _defaultDuration = 480;

/** כשאין מדידה — פותחים ממרכז המסך */
export function getDefaultAppointmentAnchorRect(): AnchorRect {
  const s = 56;
  return {
    x: (SCREEN_W - s) / 2,
    y: SCREEN_H * 0.38,
    width: s,
    height: s,
  };
}

type Props = {
  open: boolean;
  anchor: AnchorRect;
  onRequestClose: () => void;
  onDismissed: () => void;
  duration?: number;
  children: React.ReactNode;
};

/**
 * לוח פעולות לבן שנפתח ונסגר ממיקום הכרטיס שלחצו (מורפולוגיה דומה ל־Fab).
 */
export function AppointmentActionsAnchorSheet({
  open,
  anchor,
  onRequestClose,
  onDismissed,
  duration = _defaultDuration,
  children,
}: Props) {
  const progress = useSharedValue(0);

  const cx0 = useSharedValue(SCREEN_W / 2);
  const cy0 = useSharedValue(SCREEN_H * 0.4);
  const w0 = useSharedValue(56);
  const h0 = useSharedValue(56);

  const closingRef = useRef(false);
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  const syncAnchor = useCallback(
    (a: AnchorRect) => {
      cx0.value = a.x + a.width / 2;
      cy0.value = a.y + a.height / 2;
      w0.value = Math.max(a.width, 40);
      h0.value = Math.max(a.height, 36);
    },
    [cx0, cy0, w0, h0]
  );

  useLayoutEffect(() => {
    syncAnchor(anchor);
  }, [anchor, syncAnchor]);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      progress.value = 0;
      progress.value = withTiming(1, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [open, duration, progress]);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      return;
    }
    if (closingRef.current) return;
    closingRef.current = true;
    progress.value = withTiming(
      0,
      { duration, easing: Easing.in(Easing.cubic) },
      (finished) => {
        closingRef.current = false;
        if (finished) {
          runOnJS(() => onDismissedRef.current())();
        }
      }
    );
  }, [open, duration, progress]);

  const finalW = Math.min(SCREEN_W * 0.88, 420);
  const finalH = 340;

  const targetCX = SCREEN_W / 2;
  const targetCY = SCREEN_H * 0.42;

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const panelStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const cx = interpolate(p, [0, 1], [cx0.value, targetCX], Extrapolation.CLAMP);
    const cy = interpolate(p, [0, 1], [cy0.value, targetCY], Extrapolation.CLAMP);
    const w = interpolate(p, [0, 1], [w0.value, finalW], Extrapolation.CLAMP);
    const h = interpolate(p, [0, 1], [h0.value, finalH], Extrapolation.CLAMP);
    const borderRadius = interpolate(p, [0, 1], [10, 22], Extrapolation.CLAMP);
    const shadowOpacity = interpolate(p, [0, 0.35, 1], [0, 0, 0.14], Extrapolation.CLAMP);
    return {
      position: 'absolute' as const,
      left: cx - w / 2,
      top: cy - h / 2,
      width: w,
      height: h,
      borderRadius,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden' as const,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity,
          shadowRadius: 20,
        },
        android: { elevation: p > 0.2 ? 12 : 0 },
        default: {},
      }),
    };
  });

  const innerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.22, 0.68], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [16, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onRequestClose}>
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} accessibilityRole="button" />
        </Animated.View>
        <Animated.View style={[styles.panelTouchWrap, panelStyle]} pointerEvents="box-none">
          <Animated.View style={[styles.panelInner, innerStyle]} pointerEvents="auto">
            {children}
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panelTouchWrap: {
    zIndex: 2,
  },
  panelInner: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
});
