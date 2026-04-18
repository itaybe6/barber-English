import React, { useEffect, type PropsWithChildren } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, I18nManager } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SuccessLine } from '@/components/book-appointment/BookingSuccessAnimatedOverlay';

const CONFIRM_BTN_H = 50;
const CHECK_ICON = 60;
const CHECK_RING = 80;

function parseConstraintSuccessLines(lines: SuccessLine[]) {
  const headline =
    lines.find((l) => l.variant === 'headline')?.text ?? lines[0]?.text ?? '';
  const accents = lines.filter((l) => l.variant === 'accent');
  const bodies = lines.filter((l) => l.variant === 'body');
  const timeLike = bodies.find((b) => /\d{1,2}:\d{2}/.test(b.text) && /[–—-]/.test(b.text));
  const metaBodies = bodies.filter((b) => b !== timeLike);
  return { headline, accents, timeLike, metaBodies };
}

type Props = PropsWithChildren<{
  success: boolean;
  animKey: number;
  lines: SuccessLine[];
  primaryColor: string;
  gotItLabel: string;
  onGotIt: () => void;
}>;

export function ConstraintSaveSuccessShell({
  success,
  animKey,
  lines,
  primaryColor,
  gotItLabel,
  onGotIt,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const successEnter = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const isRTL = I18nManager.isRTL;

  useEffect(() => {
    if (success) {
      successEnter.value = withDelay(120, withTiming(1, { duration: 340 }));
      checkScale.value = withDelay(280, withSpring(1, { damping: 13, stiffness: 160 }));
    } else {
      successEnter.value = 0;
      checkScale.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, animKey]);

  const summaryFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(successEnter.value, [0, 0.45], [1, 0], Extrapolation.CLAMP),
  }));

  const successLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(successEnter.value, [0.32, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(successEnter.value, [0.28, 1], [12, 0], Extrapolation.CLAMP) },
      { scale: interpolate(successEnter.value, [0.28, 1], [0.94, 1], Extrapolation.CLAMP) },
    ],
  }));

  const checkmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const { headline, accents, timeLike, metaBodies } = parseConstraintSuccessLines(lines);
  const bottomPad = Math.max(insets.bottom, 12);

  return (
    <View style={styles.shell}>
      <Animated.View
        style={[{ flex: 1, minHeight: 0 }, summaryFadeStyle]}
        pointerEvents={success ? 'none' : 'auto'}
      >
        {children}
      </Animated.View>

      <Animated.View
        style={[StyleSheet.absoluteFill, styles.successOverlay, successLayerStyle]}
        pointerEvents={success ? 'auto' : 'none'}
      >
        <View style={styles.successTopCluster}>
          <Animated.View style={[styles.successCheckWrap, checkmarkAnimStyle]}>
            <View
              style={[
                styles.successCheckGlow,
                { width: CHECK_RING, height: CHECK_RING, borderRadius: CHECK_RING / 2 },
                { backgroundColor: `${primaryColor}18` },
              ]}
            >
              <Ionicons name="checkmark-circle" size={CHECK_ICON} color={primaryColor} />
            </View>
          </Animated.View>

          <Text style={[styles.successTitle, { color: primaryColor }]}>{headline}</Text>

          <View style={[styles.pillsWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {accents.map((line, i) => (
              <View
                key={`a-${i}`}
                style={[styles.successDatePill, { backgroundColor: `${primaryColor}14` }]}
              >
                <Ionicons name="calendar-outline" size={13} color={primaryColor} />
                <Text style={[styles.successDatePillText, { color: primaryColor }]} numberOfLines={3}>
                  {line.text}
                </Text>
              </View>
            ))}
            {timeLike ? (
              <View style={[styles.successDatePill, { backgroundColor: `${primaryColor}14` }]}>
                <Ionicons name="time-outline" size={13} color={primaryColor} />
                <Text style={[styles.successDatePillText, { color: primaryColor }]} numberOfLines={2}>
                  {timeLike.text}
                </Text>
              </View>
            ) : null}
          </View>

          {metaBodies.length > 0 ? (
            <View style={styles.successMetaCard}>
              {metaBodies.map((line, i) => {
                const colon = line.text.indexOf(':');
                const hasLabel = colon > 0 && colon < 40;
                const label = hasLabel ? line.text.slice(0, colon).trim() : '';
                const value = hasLabel ? line.text.slice(colon + 1).trim() : line.text;
                return (
                  <React.Fragment key={`m-${i}`}>
                    {i > 0 ? <View style={styles.successMetaCardDivider} /> : null}
                    <View style={styles.successMetaRow}>
                      {label ? (
                        <Text style={styles.successMetaLabel} numberOfLines={2}>
                          {label}
                        </Text>
                      ) : null}
                      <Text style={styles.successMetaValue} numberOfLines={4}>
                        {value}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={[styles.successBtns, { flexDirection: isRTL ? 'row-reverse' : 'row', paddingBottom: bottomPad }]}>
          <Pressable
            onPress={onGotIt}
            style={({ pressed }) => [
              styles.confirmBtn,
              { backgroundColor: primaryColor, flex: 1, marginTop: 0 },
              pressed && styles.confirmBtnPressed,
            ]}
          >
            <Text style={styles.confirmBtnText}>{gotItLabel}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  successOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 4,
    zIndex: 100,
    backgroundColor: '#FFFFFF',
  },
  successTopCluster: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    paddingTop: 2,
  },
  successCheckWrap: {},
  successCheckGlow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 26,
    paddingHorizontal: 6,
  },
  pillsWrap: {
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingHorizontal: 2,
  },
  successDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
  successDatePillText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  successMetaCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.04)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  successMetaRow: {
    alignItems: 'center',
    paddingVertical: 7,
    gap: 2,
  },
  successMetaCardDivider: {
    width: '88%',
    alignSelf: 'center',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  successMetaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8e8e93',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  successMetaValue: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  successBtns: {
    width: '100%',
    gap: 8,
    marginTop: 4,
    alignItems: 'stretch',
  },
  confirmBtn: {
    height: CONFIRM_BTN_H,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 3,
  },
  confirmBtnPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  confirmBtnText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
