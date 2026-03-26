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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
  },
  android: { elevation: 12 },
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

/**
 * When the tap is on the physical right side of the screen (e.g. Sunday column
 * in RTL week view), the sheet can look slightly too far right; nudge the open
 * resting position left. Values are in physical px; `winW` is window width.
 */
function computeOpenedCenterOffsetX(cx: number, winW: number): number {
  if (winW <= 0) return 0;
  const r = cx / winW;
  // Strong right (rightmost day column)
  if (r > 0.62) return -Math.min(36, winW * 0.085);
  // Moderate right
  if (r > 0.52) return -Math.min(22, winW * 0.048);
  return 0;
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
  /** Extra horizontal offset for the *opened* position (interpolated target), not the anchor */
  const openedCenterOffsetX = useSharedValue(computeOpenedCenterOffsetX(init.cx, winW));

  const closingRef = useRef(false);
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  const scheduleDismissed = useCallback(() => {
    onDismissedRef.current();
  }, []);

  const syncAnchor = useCallback(
    (a: AnchorRect, width: number) => {
      const o = anchorToShared(a);
      cx0.value = o.cx;
      cy0.value = o.cy;
      w0.value = o.w;
      h0.value = o.h;
      openedCenterOffsetX.value = computeOpenedCenterOffsetX(o.cx, width);
    },
    [cx0, cy0, w0, h0, openedCenterOffsetX]
  );

  useLayoutEffect(() => {
    syncAnchor(anchor, winW);
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
  }, [anchor, open, duration, progress, syncAnchor, winW]);

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

  const finalH = 340;

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
    const targetCX = winW / 2 + openedCenterOffsetX.value;
    const targetCY = winH * 0.42;
    const p = progress.value;
    const cx = interpolate(p, [0, 1], [cx0.value, targetCX], Extrapolation.CLAMP);
    const cy = interpolate(p, [0, 1], [cy0.value, targetCY], Extrapolation.CLAMP);
    const w = interpolate(p, [0, 1], [w0.value, finalW], Extrapolation.CLAMP);
    const h = interpolate(p, [0, 1], [h0.value, finalH], Extrapolation.CLAMP);
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
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} accessibilityRole="button" />
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
