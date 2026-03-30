/**
 * Lava-lamp style rotating blobs + BlurView, tinted from business primary (no random hues).
 * Reanimated: one SharedValue per blob + withRepeat (useDerivedValue must not return animations).
 */
import { BlurView } from 'expo-blur';
import randomColor from 'randomcolor';
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// ─── hex helpers (same idea as login / pick-primary) ───────────────────────
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r + g + b)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}

function darkenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = 1 - ratio;
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n * f))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function lightenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * ratio));
  const to = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}

function randomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export interface BrandLavaLampBackgroundProps {
  primaryColor: string;
  /** Deep tone under blobs (e.g. login gradient end) — very light veil so gradient still reads */
  baseColor: string;
  count?: number;
  duration?: number;
  blurIntensity?: number;
  /** When both set (>0), blob positions/sizes use this box instead of the full window (e.g. admin banner). */
  layoutWidth?: number;
  layoutHeight?: number;
  /**
   * `bold` — stronger blob opacity, larger blobs in bounded layouts, less blur wash, no per-blob blur (good for small cards).
   */
  emphasis?: 'default' | 'bold';
}

type Circle = {
  x: number;
  y: number;
  radius: number;
  index: number;
  color: string;
};

type LavaBlobCircleProps = {
  circle: Circle;
  duration: number;
  withBlur: boolean;
  /** Extra BlurView on each blob — softens edges; disable for sharper “lava” on small surfaces */
  perBlobBlur: boolean;
};

function LavaBlobCircle({ circle, duration, withBlur, perBlobBlur }: LavaBlobCircleProps) {
  const randRotation = useRef(Math.random() * 360).current;
  const rotation = useSharedValue(randRotation);

  useEffect(() => {
    rotation.value = randRotation;
    rotation.value = withRepeat(
      withSequence(
        withTiming(randRotation + 360, { duration, easing: Easing.linear }),
        withTiming(randRotation, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [duration, randRotation, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]} pointerEvents="none">
      <View
        style={{
          backgroundColor: circle.color,
          position: 'absolute',
          left: circle.x - circle.radius,
          top: circle.y - circle.radius,
          width: circle.radius * 2,
          height: circle.radius * 2,
          borderRadius: circle.radius,
        }}
      />
      {withBlur && perBlobBlur && Platform.OS === 'ios' ? (
        <BlurView style={StyleSheet.absoluteFill} intensity={8} tint="light" />
      ) : null}
    </Animated.View>
  );
}

function buildBrandPalette(primary: string, count: number): string[] {
  const palette = [
    hexToRgba(lightenHex(primary, 0.14), 0.4),
    hexToRgba(primary, 0.34),
    hexToRgba(lightenHex(primary, 0.32), 0.26),
    hexToRgba(darkenHex(primary, 0.15), 0.36),
    hexToRgba(lightenHex(primary, 0.42), 0.22),
    hexToRgba(darkenHex(primary, 0.08), 0.28),
  ];
  return palette.slice(0, Math.max(1, count));
}

/** Higher contrast blobs for compact UI (admin header card, etc.) */
function buildBrandPaletteBold(primary: string, count: number): string[] {
  const palette = [
    hexToRgba(lightenHex(primary, 0.22), 0.68),
    hexToRgba(lightenHex(primary, 0.06), 0.58),
    hexToRgba(lightenHex(primary, 0.4), 0.52),
    hexToRgba(darkenHex(primary, 0.25), 0.62),
    hexToRgba(lightenHex(primary, 0.5), 0.46),
    hexToRgba(darkenHex(primary, 0.14), 0.55),
  ];
  return palette.slice(0, Math.max(1, count));
}

/**
 * Full-screen lava lamp using **brand primary** (and friends). Place above a gradient.
 */
export function BrandLavaLampBackground({
  primaryColor,
  baseColor,
  count = 4,
  duration = 14000,
  blurIntensity = 52,
  layoutWidth,
  layoutHeight,
  emphasis = 'default',
}: BrandLavaLampBackgroundProps) {
  const { width: winW, height: winH } = useWindowDimensions();

  const useBox =
    typeof layoutWidth === 'number' &&
    typeof layoutHeight === 'number' &&
    layoutWidth > 0 &&
    layoutHeight > 0;
  const isBold = emphasis === 'bold';

  const circles = useMemo<Circle[]>(() => {
    const cols = isBold ? buildBrandPaletteBold(primaryColor, count) : buildBrandPalette(primaryColor, count);
    const w = Math.max(useBox ? layoutWidth! : winW, 1);
    const h = Math.max(useBox ? layoutHeight! : winH, 1);
    /** באנר רחב ונמוך — מקטינים מעט את המחלק כדי שהבלובים ייחסו לגובה */
    let radiusDiv = h < 100 ? 1.75 : 2.2;
    if (useBox && isBold) {
      radiusDiv = h < 100 ? 1.35 : 1.38;
    }
    return cols.map((color, index) => {
      const rand = randomNumber(5, 11) / 10;
      const radius = (Math.min(w, h) * rand) / radiusDiv;
      const x = Math.random() * Math.max(8, w - radius * 1.2);
      const y = Math.random() * Math.max(8, h - radius * 1.2);
      return { x, y, radius, index, color };
    });
  }, [primaryColor, count, winW, winH, layoutWidth, layoutHeight, useBox, isBold]);

  if (Platform.OS === 'web') {
    return null;
  }

  const withBlur = blurIntensity > 0;
  /** Strong blur + small area = uniform mush; cap and use a less “milky” tint in bold card mode */
  const resolvedBlur =
    withBlur && useBox && isBold ? Math.max(10, Math.min(blurIntensity, 24)) : blurIntensity;
  const blurTint = useBox && isBold ? ('default' as const) : ('light' as const);
  const perBlobBlur = !(useBox && isBold);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]} pointerEvents="none">
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: baseColor, opacity: useBox && isBold ? 0.06 : 0.12 },
        ]}
      />
      {circles.map((circle) => (
        <LavaBlobCircle
          key={`lava-${circle.index}`}
          circle={circle}
          duration={
            useBox && isBold ? duration + circle.index * Math.round(duration * 0.14) : duration
          }
          withBlur={withBlur}
          perBlobBlur={perBlobBlur}
        />
      ))}
      {withBlur ? (
        <BlurView style={StyleSheet.absoluteFill} intensity={resolvedBlur} tint={blurTint} />
      ) : null}
    </View>
  );
}

// ─── Legacy demo (random hues) ───────────────────────────────────────────────
export type LavaLampProps = {
  count?: number;
  hue?: string;
  intensity?: number;
  colors?: string[];
  duration?: number;
};

export function LavaLamp({
  count = 4,
  hue = 'green',
  intensity = 100,
  colors,
  duration = 10000,
}: LavaLampProps) {
  const { width, height } = useWindowDimensions();

  const circles = useMemo<Circle[]>(() => {
    const _colors =
      colors ??
      randomColor({
        count,
        hue,
        format: 'rgba',
        luminosity: 'light',
        alpha: 0.3,
      });
    return _colors.map((color, index) => {
      const rand = randomNumber(5, 12) / 10;
      const radius = (width * rand) / 2;
      return {
        x: Math.random() * Math.max(1, width - radius * 2),
        y: Math.random() * Math.max(1, height - radius * 2),
        radius,
        index,
        color,
      };
    });
  }, [count, hue, colors, width, height]);

  const baseBg = useMemo(() => {
    const raw = randomColor({ hue, count: 1, luminosity: 'dark' });
    return Array.isArray(raw) ? raw[0] : raw;
  }, [hue]);
  const withBlur = intensity !== 0;

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: baseBg }]} pointerEvents="none">
      {circles.map((circle) => (
        <LavaBlobCircle
          key={`legacy-${circle.index}`}
          circle={circle}
          duration={duration}
          withBlur={withBlur}
          perBlobBlur
        />
      ))}
      {withBlur ? (
        <BlurView style={StyleSheet.absoluteFill} intensity={intensity} tint="light" />
      ) : null}
    </View>
  );
}
