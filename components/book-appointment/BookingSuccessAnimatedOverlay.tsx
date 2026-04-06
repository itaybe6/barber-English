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
  variant?:
    | 'headline'
    | 'subheadline'
    | 'body'
    | 'accent'
    | 'emphasis'
    | 'detailLabel'
    | 'detailValue'
    /** Horizontal rule; use inside details to split blocks (e.g. after services + stylist name). */
    | 'sectionDivider';
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
  /** Horizontally center the meta block (date, divider, service, time, closing line) — e.g. waitlist success. */
  centerMeta?: boolean;
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

/** Headline + meta block share `edgeStart` (RTL-aware) so Hebrew lines align the same edge; AnimatedSentence rtl keeps word order. */
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
  centerMeta = false,
}: Props) {
  const showCalendar = Boolean(onAddToCalendarProp && addToCalendarLabelProp?.trim());
  const insets = useSafeAreaInsets();
  const displayLines = useMemo(
    () =>
      lines.filter(
        (l) => l.variant === 'sectionDivider' || l.text.trim().length > 0
      ),
    [lines]
  );
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

  const headlineOnly = displayLines.filter((l) => l.variant === 'headline');
  const subheadlineOnly = displayLines.filter((l) => l.variant === 'subheadline');
  const detailLines = displayLines.filter(
    (l) => l.variant !== 'headline' && l.variant !== 'subheadline'
  );
  const showLeadingDivider =
    detailLines.length > 0 && !detailLines.some((l) => l.variant === 'sectionDivider');

  const delayForLine = (line: SuccessLine) => {
    const idx = displayLines.indexOf(line);
    if (idx >= 0) return baseDelays[idx] ?? 0;
    const fallback = displayLines.findIndex(
      (l) => l.variant === line.variant && l.text === line.text
    );
    return fallback >= 0 ? baseDelays[fallback] ?? 0 : 0;
  };

  const metaCrossAlign = centerMeta ? ('center' as const) : edgeStart;
  const metaTextAlign: 'center' | 'left' = centerMeta ? 'center' : 'left';
  const headlineTextAlign: 'center' | 'left' = centerMeta ? 'center' : 'left';

  const headlineStyle = [
    styles.headline,
    { textAlign: headlineTextAlign, writingDirection, color: '#FFFFFF' },
  ];
  const subheadlineStyle = [
    styles.subheadline,
    { textAlign: metaTextAlign, writingDirection, color: '#FFFFFF' },
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
          <View style={[styles.headlineBlock, { alignItems: metaCrossAlign }]}>
            {headlineOnly.map((line, i) => {
              const delay = delayForLine(line);
              return (
                <View key={`h-${i}`} style={[styles.lineWrap, { alignSelf: metaCrossAlign }]}>
                  <AnimatedSentence
                    rtl={rtl}
                    fullWidth={false}
                    rowJustify={centerMeta ? 'center' : 'flex-start'}
                    wordGap={14}
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

          {/* Date, divider, details — edge-aligned with headline, or centered when `centerMeta` (waitlist). */}
          <View style={[styles.detailsMetaColumn, { alignItems: metaCrossAlign }]}>
            {subheadlineOnly.map((line, i) => (
              <View
                key={`s-${i}`}
                style={[styles.subheadlineLineWrap, styles.lineWrap, { alignSelf: metaCrossAlign }]}
              >
                <AnimatedSentence
                  rtl={rtl}
                  fullWidth={false}
                  nowrap
                  rowJustify={centerMeta ? 'center' : 'flex-start'}
                  stagger={stagger}
                  baseDelay={delayForLine(line)}
                  style={subheadlineStyle}
                  maxFontSizeMultiplier={1.12}
                >
                  {line.text}
                </AnimatedSentence>
              </View>
            ))}

            {showLeadingDivider ? (
              <View style={[styles.divider, { alignSelf: metaCrossAlign }]} />
            ) : null}

            <View style={[styles.detailBlock, { alignItems: metaCrossAlign }]}>
              {detailLines.map((line, i) => {
                const delay = delayForLine(line);
                const variant = line.variant ?? 'body';
                if (variant === 'sectionDivider') {
                  return (
                    <View
                      key={`div-${i}`}
                      style={[
                        styles.divider,
                        styles.dividerInSection,
                        { alignSelf: metaCrossAlign },
                      ]}
                    />
                  );
                }
                const detailStyle =
                  variant === 'accent' || variant === 'detailLabel'
                    ? [
                        styles.detailAccent,
                        {
                          textAlign: metaTextAlign,
                          writingDirection,
                          color: '#FFFFFF',
                        },
                      ]
                    : variant === 'emphasis'
                      ? [
                          styles.detailEmphasis,
                          {
                            textAlign: metaTextAlign,
                            writingDirection,
                            color: 'rgba(255,255,255,0.94)',
                          },
                        ]
                      : variant === 'detailValue'
                        ? [
                            styles.detailMetaValue,
                            {
                              textAlign: metaTextAlign,
                              writingDirection,
                              color: 'rgba(255,255,255,0.94)',
                            },
                          ]
                        : [
                            styles.detailBody,
                            {
                              textAlign: metaTextAlign,
                              writingDirection,
                              color: 'rgba(255,255,255,0.82)',
                            },
                          ];
                return (
                  <View
                    key={`d-${i}`}
                    style={[
                      styles.lineWrapDetail,
                      variant === 'detailLabel' && styles.detailLabelLineWrap,
                      variant === 'detailValue' && styles.detailValueLineWrap,
                      variant === 'emphasis' && styles.emphasisLineWrap,
                      { alignSelf: metaCrossAlign },
                    ]}
                  >
                    {variant === 'emphasis' ? (
                      /* One Text node so BiDi places the final period after the last word (AnimatedSentence splits words and breaks RTL punctuation). */
                      <Text
                        style={[
                          detailStyle,
                          centerMeta && styles.detailEmphasisTextCenterFill,
                          !centerMeta && rtl && styles.detailEmphasisTextRtl,
                        ]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {line.text}
                      </Text>
                    ) : (
                      <AnimatedSentence
                        rtl={rtl}
                        fullWidth={false}
                        rowJustify={centerMeta ? 'center' : 'flex-start'}
                        stagger={stagger}
                        baseDelay={delay}
                        style={detailStyle}
                        maxFontSizeMultiplier={1.2}
                      >
                        {line.text}
                      </AnimatedSentence>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={[styles.footerBar, { paddingBottom: Math.max(insets.bottom, 14) }]}
        pointerEvents="box-none"
      >
        <View style={styles.footerInner}>
          <TouchableOpacity
            style={
              centerMeta
                ? [styles.btnGotItSolidPill, { shadowColor: accentColor }]
                : [styles.btnSecondary, { borderColor: 'rgba(255,255,255,0.55)' }]
            }
            onPress={onDismiss}
            activeOpacity={centerMeta ? 0.88 : 0.82}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.btnSecondaryText,
                centerMeta && { color: accentColor },
              ]}
            >
              {gotItLabel}
            </Text>
          </TouchableOpacity>
          {showCalendar ? (
            <TouchableOpacity
              style={
                centerMeta
                  ? styles.btnAddCalendarTagPill
                  : [styles.btnSecondary, { borderColor: 'rgba(255,255,255,0.55)' }]
              }
              onPress={onAddToCalendarProp}
              activeOpacity={centerMeta ? 0.88 : 0.82}
              accessibilityRole="button"
            >
              <Ionicons
                name="calendar-outline"
                size={centerMeta ? 17 : 21}
                color="#FFFFFF"
              />
              <Text
                style={
                  centerMeta
                    ? [styles.btnAddCalendarTagText, styles.btnAddCalendarTagTextLight]
                    : styles.btnSecondaryText
                }
              >
                {addToCalendarLabelProp}
              </Text>
            </TouchableOpacity>
          ) : null}
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
  subheadlineLineWrap: {
    marginTop: 4,
    marginBottom: 10,
    maxWidth: '100%',
  },
  subheadline: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.35,
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  detailsMetaColumn: {
    width: '100%',
    marginTop: 4,
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
  /** Waitlist-style value line: regular weight under a bold label */
  detailMetaValue: {
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: -0.2,
    lineHeight: 30,
  },
  detailLabelLineWrap: {
    marginBottom: 2,
  },
  detailValueLineWrap: {
    marginBottom: 12,
  },
  detailAccent: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.32,
    lineHeight: 32,
  },
  detailEmphasis: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 31,
  },
  /** Override LTR-ish textAlign from shared detail styles so Hebrew wraps with period at true sentence end */
  detailEmphasisTextRtl: {
    textAlign: 'right',
    writingDirection: 'rtl' as const,
    alignSelf: 'stretch',
  },
  detailEmphasisTextCenterFill: {
    alignSelf: 'stretch',
    width: '100%',
    textAlign: 'center',
  },
  emphasisLineWrap: {
    marginTop: 22,
    paddingTop: 4,
  },
  divider: {
    height: 3,
    width: 56,
    borderRadius: 2,
    marginBottom: 14,
    marginTop: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dividerInSection: {
    marginTop: 12,
    marginBottom: 12,
  },
  detailBlock: {
    gap: 4,
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
  /** Waitlist / booking success (`centerMeta`): full white pill, label uses `accentColor` in JSX */
  btnGotItSolidPill: {
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  /** Compact pill under «Got it» — frosted white so it reads secondary vs solid primary */
  btnAddCalendarTagPill: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.34)',
    alignSelf: 'center',
    maxWidth: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  btnAddCalendarTagText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.08,
  },
  btnAddCalendarTagTextLight: {
    color: '#FFFFFF',
  },
  btnSecondaryText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
    color: '#FFFFFF',
  },
});
