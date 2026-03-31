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

/**
 * Convert anchor rect to center + size.
 * measureInWindow always returns physical screen coordinates (x=0 at
 * physical left edge), which is what we need for transform-based positioning.
 */
function anchorToShared(anchor: AnchorRect) {
  return {
    cx: anchor.x + anchor.width / 2,
    cy: anchor.y + anchor.height / 2,
    w: Math.max(anchor.width, 40),
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
  const cx0 = useSharedValue(init.cx);
  const cy0 = useSharedValue(init.cy);
  const w0 = useSharedValue(init.w);
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
      cx0.value = o.cx;
      cy0.value = o.cy;
      w0.value = o.w;
      h0.value = o.h;
    },
    [cx0, cy0, w0, h0]
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

  /**
   * Position the panel using ONLY transform (translateX/Y) instead of left/top.
   * Transforms are always in physical screen coordinates regardless of RTL,
   * which matches the physical x/y from measureInWindow.
   */
  const panelStyle = useAnimatedStyle(() => {
    const finalW = Math.min(winW * 0.88, 420);
    /** Always rest at horizontal screen center (physical px); clamp keeps edges on-screen during resize animation. */
    const targetCX = winW / 2;
    const targetCY = winH * 0.40;
    const p = progress.value;
    let cx = interpolate(p, [0, 1], [cx0.value, targetCX], Extrapolation.CLAMP);
    const cy = interpolate(p, [0, 1], [cy0.value, targetCY], Extrapolation.CLAMP);
    const w = interpolate(p, [0, 1], [w0.value, finalW], Extrapolation.CLAMP);
    const h = interpolate(p, [0, 1], [h0.value, finalH], Extrapolation.CLAMP);
    const halfW = w / 2;
    const padX = 12;
    if (winW > 0) {
      cx = Math.max(halfW + padX, Math.min(winW - halfW - padX, cx));
    }
    const borderRadius = interpolate(p, [0, 1], [10, 22], Extrapolation.CLAMP);
    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      width: w,
      height: h,
      borderRadius,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden' as const,
      transform: [
        { translateX: cx - w / 2 },
        { translateY: cy - h / 2 },
      ],
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
