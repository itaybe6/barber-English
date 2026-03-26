import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AnimatedSentence } from '@/components/book-appointment/AnimatedSentence';

const { width: SCREEN_W } = Dimensions.get('window');

export interface SuccessLine {
  text: string;
  variant?: 'headline' | 'body' | 'accent';
}

type Props = {
  lines: SuccessLine[];
  rtl: boolean;
  accentColor: string;
  stagger?: number;
  lineGapMs?: number;
  onDismiss: () => void;
  onAddToCalendar: () => void;
  addToCalendarLabel: string;
  gotItLabel: string;
};

function computeBaseDelays(texts: string[], stagger: number, lineGapMs: number): number[] {
  const delays: number[] = [];
  let cum = 0;
  for (const raw of texts) {
    const wordCount = raw.trim().length ? raw.trim().split(/\s+/).length : 0;
    delays.push(cum);
    cum += wordCount * stagger + lineGapMs;
  }
  return delays;
}

/** Lighten accentColor by mixing with white at given ratio (0=original, 1=white). */
function alphaHex(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${hex.slice(1)}${a}`;
}

export default function BookingSuccessAnimatedOverlay({
  lines,
  rtl,
  accentColor,
  stagger = 80,
  lineGapMs = 140,
  onDismiss,
  onAddToCalendar,
  addToCalendarLabel,
  gotItLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const displayLines = useMemo(() => lines.filter((l) => l.text.trim().length > 0), [lines]);
  const texts = useMemo(() => displayLines.map((l) => l.text), [displayLines]);
  const baseDelays = useMemo(
    () => computeBaseDelays(texts, stagger, lineGapMs),
    [texts, stagger, lineGapMs]
  );

  const textAlign = rtl ? ('right' as const) : ('left' as const);
  const writingDirection = rtl ? ('rtl' as const) : ('ltr' as const);

  /** Split headline from rest */
  const headlineLines = displayLines.filter((l) => l.variant === 'headline');
  const detailLines = displayLines.filter((l) => l.variant !== 'headline');
  const headlineIndexOffset = 0;
  const detailIndexOffset = headlineLines.length;

  return (
    <View style={[styles.root, { direction: rtl ? 'rtl' : 'ltr' }]}>
      {/* Rich background gradient — deep forest night */}
      <LinearGradient
        colors={['#050e06', '#0a1a0d', '#0d2410', '#06120a']}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle radial-like glow blob behind headline */}
      <View
        pointerEvents="none"
        style={[
          styles.glowBlob,
          {
            backgroundColor: alphaHex(accentColor, 0.13),
            width: SCREEN_W * 1.2,
            height: SCREEN_W * 1.2,
            borderRadius: SCREEN_W * 0.6,
            top: -SCREEN_W * 0.3,
            left: -SCREEN_W * 0.1,
          },
        ]}
      />

      {/* Noise / grain overlay — pure CSS-style using nested views */}
      <View pointerEvents="none" style={[styles.grainOverlay, StyleSheet.absoluteFill]} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 148 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Headline block ── */}
        <View style={[styles.headlineBlock, { alignItems: textAlign === 'right' ? 'flex-end' : 'flex-start' }]}>
          {headlineLines.map((line, i) => {
            const delay = baseDelays[headlineIndexOffset + i] ?? 0;
            return (
              <View key={`h-${i}`} style={styles.lineWrapHeadline}>
                <AnimatedSentence
                  stagger={stagger}
                  baseDelay={delay}
                  style={[styles.headline, { textAlign, writingDirection, color: accentColor }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {line.text}
                </AnimatedSentence>
              </View>
            );
          })}
        </View>

        {/* Divider line */}
        <View
          style={[
            styles.divider,
            {
              backgroundColor: alphaHex(accentColor, 0.35),
              alignSelf: rtl ? 'flex-end' : 'flex-start',
            },
          ]}
        />

        {/* ── Detail lines ── */}
        <View
          style={[
            styles.detailBlock,
            { alignItems: textAlign === 'right' ? 'flex-end' : 'flex-start' },
          ]}
        >
          {detailLines.map((line, i) => {
            const variant = line.variant ?? 'body';
            const delay = baseDelays[detailIndexOffset + i] ?? 0;
            const isAccent = variant === 'accent';
            const textStyle = isAccent
              ? [
                  styles.detailAccent,
                  { textAlign, writingDirection, color: accentColor },
                ]
              : [styles.detailBody, { textAlign, writingDirection }];
            return (
              <View key={`d-${i}`} style={styles.lineWrapDetail}>
                <AnimatedSentence
                  stagger={stagger}
                  baseDelay={delay}
                  style={textStyle}
                  maxFontSizeMultiplier={1.2}
                >
                  {line.text}
                </AnimatedSentence>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Footer ── */}
      <LinearGradient
        colors={['transparent', 'rgba(5,14,6,0.97)', '#050e06']}
        locations={[0, 0.28, 1]}
        style={[
          styles.footerGradient,
          { paddingBottom: Math.max(insets.bottom + 4, 20), paddingHorizontal: 22 },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: alphaHex(accentColor, 0.7) }]}
          onPress={onAddToCalendar}
          activeOpacity={0.82}
        >
          <Ionicons
            name="calendar-outline"
            size={19}
            color={accentColor}
            style={styles.btnIcon}
          />
          <Text style={[styles.btnSecondaryText, { color: accentColor }]}>
            {addToCalendarLabel}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: accentColor }]}
          onPress={onDismiss}
          activeOpacity={0.88}
        >
          {/* Sheen on primary button */}
          <View style={styles.btnSheen} />
          <Text style={styles.btnPrimaryText}>{gotItLabel}</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050e06',
  },
  glowBlob: {
    position: 'absolute',
    opacity: 1,
  },
  grainOverlay: {
    opacity: 0.03,
    backgroundColor: '#ffffff',
  },

  /* ── Scroll ── */
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 26,
  },

  /* ── Headline ── */
  headlineBlock: {
    marginBottom: 20,
  },
  lineWrapHeadline: {
    overflow: 'hidden',
    marginBottom: 2,
  },
  headline: {
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: -1.8,
    lineHeight: 62,
  },

  /* ── Divider ── */
  divider: {
    height: 2,
    width: 52,
    borderRadius: 2,
    marginBottom: 28,
  },

  /* ── Detail lines ── */
  detailBlock: {
    gap: 6,
  },
  lineWrapDetail: {
    overflow: 'hidden',
  },
  detailAccent: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  detailBody: {
    fontSize: 18,
    fontWeight: '400',
    letterSpacing: -0.2,
    color: 'rgba(200, 230, 210, 0.78)',
    lineHeight: 26,
  },

  /* ── Footer ── */
  footerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 56,
    gap: 10,
  },
  btnPrimary: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  btnSheen: {
    position: 'absolute',
    top: -30,
    left: -20,
    width: '70%',
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.22)',
    transform: [{ rotate: '-12deg' }],
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  btnSecondary: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  btnIcon: {
    marginEnd: 8,
  },
});
