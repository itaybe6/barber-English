import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const PANEL_SHADOW_STATIC = Platform.select({
  ios: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
  },
  android: { elevation: 18 },
  default: {},
});

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const _defaultDuration = 480;

export function getDefaultAppointmentAnchorRect(): AnchorRect {
  const { width, height } = Dimensions.get('window');
  const s = 56;
  return {
    x: (width - s) / 2,
    y: height * 0.38,
    width: s,
    height: s,
  };
}

function anchorToShared(anchor: AnchorRect) {
  return {
    cy: anchor.y + anchor.height / 2,
    h: Math.max(anchor.height, 36),
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

export function AppointmentActionsAnchorSheet({
  open,
  anchor,
  onRequestClose,
  onDismissed,
  duration = _defaultDuration,
  children,
}: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const progress = useSharedValue(0);

  const init = anchorToShared(anchor);
  const cy0 = useSharedValue(init.cy);
  const h0 = useSharedValue(init.h);

  const closingRef = useRef(false);
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  const scheduleDismissed = useCallback(() => {
    onDismissedRef.current();
  }, []);

  const syncAnchor = useCallback(
    (a: AnchorRect) => {
      const o = anchorToShared(a);
      cy0.value = o.cy;
      h0.value = o.h;
    },
    [cy0, h0]
  );

  useLayoutEffect(() => {
    syncAnchor(anchor);
    if (!open) return;
    closingRef.current = false;
    progress.value = 0;
    const id = requestAnimationFrame(() => {
      progress.value = withTiming(1, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
    });
    return () => cancelAnimationFrame(id);
  }, [anchor, open, duration, progress, syncAnchor]);

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
          runOnJS(scheduleDismissed)();
        }
      }
    );
  }, [open, duration, progress, scheduleDismissed]);

  /** Shorter than full sheet; ScrollView scrolls if content exceeds (e.g. small phone + large text) */
  const finalH = Math.min(Math.max(winH * 0.58, 340), 500);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const panelStyle = useAnimatedStyle(() => {
    const finalW = Math.min(winW * 0.88, 420);
    const targetTop = winH * 0.40 - finalH / 2;
    const p = progress.value;
    const startTop = cy0.value - h0.value / 2;
    const top = interpolate(p, [0, 1], [startTop, targetTop], Extrapolation.CLAMP);
    const h = interpolate(p, [0, 1], [h0.value, finalH], Extrapolation.CLAMP);
    const borderRadius = interpolate(p, [0, 1], [10, 22], Extrapolation.CLAMP);
    return {
      position: 'absolute' as const,
      left: (winW - finalW) / 2,
      top,
      width: finalW,
      height: h,
      borderRadius,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden' as const,
    };
  }, [winW, winH, finalH]);

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
      <View style={styles.root} pointerEvents={open ? 'box-none' : 'none'}>
        <Animated.View
          style={[styles.backdrop, backdropStyle]}
          pointerEvents={open ? 'box-none' : 'none'}
        >
          {/* When `open` is false the sheet is closing; do not steal touches from a stacked Modal (e.g. cancel confirm). */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onRequestClose}
            accessibilityRole="button"
            pointerEvents={open ? 'auto' : 'none'}
          />
        </Animated.View>
        <Animated.View style={[styles.panelTouchWrap, PANEL_SHADOW_STATIC, panelStyle]} pointerEvents="box-none">
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
    backgroundColor: 'rgba(15,23,42,0.42)',
  },
  panelTouchWrap: {
    zIndex: 2,
  },
  panelInner: {
    flex: 1,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
});
