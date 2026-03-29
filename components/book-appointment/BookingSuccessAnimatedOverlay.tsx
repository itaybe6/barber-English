import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  Platform,
  I18nManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AnimatedSentence } from '@/components/book-appointment/AnimatedSentence';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';

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
  /** When omitted, only the primary dismiss button is shown (e.g. pending approval or constraint saved — no calendar action). */
  onAddToCalendar?: () => void;
  addToCalendarLabel?: string;
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

/** All copy flush to the physical left; Hebrew word order preserved via AnimatedSentence rtl + shrink-wrap. */
export default function BookingSuccessAnimatedOverlay({
  lines,
  rtl,
  accentColor,
  stagger = 72,
  lineGapMs = 120,
  onDismiss,
  onAddToCalendar: onAddToCalendarProp,
  addToCalendarLabel: addToCalendarLabelProp,
  gotItLabel,
}: Props) {
  const showCalendar = Boolean(onAddToCalendarProp && addToCalendarLabelProp?.trim());
  const insets = useSafeAreaInsets();
  const displayLines = useMemo(() => lines.filter((l) => l.text.trim().length > 0), [lines]);
  const texts = useMemo(() => displayLines.map((l) => l.text), [displayLines]);
  const baseDelays = useMemo(
    () => computeBaseDelays(texts, stagger, lineGapMs),
    [texts, stagger, lineGapMs]
  );

  const loginGradient = useMemo(
    () => [lightenHex(accentColor, 0.1), darkenHex(accentColor, 0.42)] as const,
    [accentColor]
  );
  const gradientEnd = loginGradient[1];

  const writingDirection = rtl ? ('rtl' as const) : ('ltr' as const);
  /** Physical left edge of the screen (under forceRTL, flex-start is the right side). */
  const edgeStart = I18nManager.isRTL ? ('flex-end' as const) : ('flex-start' as const);

  const headlineLines = displayLines.filter((l) => l.variant === 'headline');
  const detailLines = displayLines.filter((l) => l.variant !== 'headline');
  const headlineIndexOffset = 0;
  const detailIndexOffset = headlineLines.length;

  const headlineStyle = [
    styles.headline,
    { textAlign: 'left' as const, writingDirection, color: '#FFFFFF' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: gradientEnd }]}>
      <LinearGradient colors={[...loginGradient]} style={StyleSheet.absoluteFill} />
      {Platform.OS !== 'web' ? (
        <BrandLavaLampBackground
          primaryColor={accentColor}
          baseColor={gradientEnd}
          count={4}
          duration={16000}
          blurIntensity={48}
        />
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 36,
            paddingBottom: insets.bottom + 118,
            alignItems: edgeStart,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.copyBlock, { alignItems: edgeStart }]}>
          <View style={[styles.headlineBlock, { alignItems: edgeStart }]}>
            {headlineLines.map((line, i) => {
              const delay = baseDelays[headlineIndexOffset + i] ?? 0;
              return (
                <View key={`h-${i}`} style={[styles.lineWrap, { alignSelf: edgeStart }]}>
                  <AnimatedSentence
                    rtl={rtl}
                    fullWidth={false}
                    stagger={stagger}
                    baseDelay={delay}
                    style={headlineStyle}
                    maxFontSizeMultiplier={1.05}
                  >
                    {line.text}
                  </AnimatedSentence>
                </View>
              );
            })}
          </View>

          <View style={[styles.divider, { alignSelf: edgeStart }]} />

          <View style={[styles.detailBlock, { alignItems: edgeStart }]}>
            {detailLines.map((line, i) => {
              const delay = baseDelays[detailIndexOffset + i] ?? 0;
              const variant = line.variant ?? 'body';
              const detailStyle =
                variant === 'accent'
                  ? [
                      styles.detailAccent,
                      {
                        textAlign: 'left' as const,
                        writingDirection,
                        color: 'rgba(255,255,255,0.96)',
                      },
                    ]
                  : [
                      styles.detailBody,
                      {
                        textAlign: 'left' as const,
                        writingDirection,
                        color: 'rgba(255,255,255,0.82)',
                      },
                    ];
              return (
                <View key={`d-${i}`} style={[styles.lineWrapDetail, { alignSelf: edgeStart }]}>
                  <AnimatedSentence
                    rtl={rtl}
                    fullWidth={false}
                    stagger={stagger}
                    baseDelay={delay}
                    style={detailStyle}
                    maxFontSizeMultiplier={1.2}
                  >
                    {line.text}
                  </AnimatedSentence>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View
        style={[styles.footerBar, { paddingBottom: Math.max(insets.bottom, 14) }]}
        pointerEvents="box-none"
      >
        <View style={styles.footerInner}>
          {showCalendar ? (
            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: 'rgba(255,255,255,0.55)' }]}
              onPress={onAddToCalendarProp}
              activeOpacity={0.82}
            >
              <Ionicons name="calendar-outline" size={21} color="#FFFFFF" />
              <Text style={styles.btnSecondaryText}>{addToCalendarLabelProp}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.btnSecondary, { borderColor: 'rgba(255,255,255,0.55)' }]}
            onPress={onDismiss}
            activeOpacity={0.82}
            accessibilityRole="button"
          >
            <Text style={styles.btnSecondaryText}>{gotItLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    width: '100%',
  },
  copyBlock: {
    width: '100%',
  },
  headlineBlock: {
    marginBottom: 20,
    width: '100%',
  },
  lineWrap: {
    maxWidth: '100%',
    overflow: 'hidden',
    marginBottom: 4,
  },
  headline: {
    fontSize: 76,
    fontWeight: '900',
    letterSpacing: -2.8,
    lineHeight: 84,
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  lineWrapDetail: {
    maxWidth: '100%',
    overflow: 'hidden',
    marginBottom: 4,
  },
  detailBody: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.24,
    lineHeight: 30,
  },
  detailAccent: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.32,
    lineHeight: 32,
  },
  divider: {
    height: 3,
    width: 56,
    borderRadius: 2,
    marginBottom: 22,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  detailBlock: {
    gap: 6,
    width: '100%',
  },
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 52,
    paddingTop: 12,
    paddingHorizontal: 22,
    backgroundColor: 'transparent',
  },
  footerInner: {
    width: '100%',
    gap: 12,
    alignItems: 'stretch',
  },
  btnSecondary: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    borderWidth: 2,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  btnSecondaryText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
    color: '#FFFFFF',
  },
});
