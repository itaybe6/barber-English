import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  I18nManager,
  Platform,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import type { BookingProgressChipModel } from './BookingProgressChipsStrip';

const PEEK_H = 80;
/** Extra vertical space for “סיכום תור” above the peek chips row (line height + margin). */
const PEEK_TITLE_BLOCK = 26;
const HANDLE_SIZE = 36;
const HANDLE_RADIUS = HANDLE_SIZE / 2;
const ROW_H = 58;
/** Service row shows name + price/duration line — slightly taller than other rows. */
const SERVICE_ROW_EXTRA_H = 8;
/** Dashed separator between summary rows (same vertical budget as ServiceSelection divider). */
const SUMMARY_DIVIDER_H = 12;
/** Spacer under floating title in expanded layout (keeps rows below the heading). */
const TITLE_H = 48;
/** Tighter spacer when “קבע תור” is shown — gray card sits closer to «סיכום תור». */
const TITLE_SPACER_WITH_CONFIRM = 30;
const V_PAD = 12;
const BORDER_RADIUS = 24;
/** Height of the "Book Appointment" confirm button + its top margin. */
const CONFIRM_BTN_H = 50;
const CONFIRM_BTN_MARGIN = 8;
/** Padding under the confirm button before the peek strip (keep small — tall sheet felt empty). */
const EXPANDED_PAD_BELOW_CONFIRM = 10;
/** Height of the success view — sized to fit content with space-between layout. */
const SUCCESS_H_MIN = 510;
/** Y from top of `sheet` where the expanded header title ends (matches expandedArea paddingTop). */
const SUMMARY_TITLE_TOP = HANDLE_RADIUS + 10;
/** Peek: title sits a bit lower so it clears the floating handle pill. */
const PEEK_SUMMARY_TITLE_TOP = HANDLE_RADIUS + 4;
const SUMMARY_TITLE_SLIDE_DY = SUMMARY_TITLE_TOP - PEEK_SUMMARY_TITLE_TOP;

/** Solid light tint from theme primary (no alpha — avoids “washed” semi-transparent pill). */
function opaquePrimaryTint(primaryColor: string, mixPrimary = 0.14): string {
  const raw = primaryColor.trim().replace(/^#/, '');
  const full =
    raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (full.length !== 6 || !/^[0-9a-fA-F]+$/.test(full)) {
    return '#EFEAF8';
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const blend = (c: number) =>
    Math.round(255 * (1 - mixPrimary) + c * mixPrimary);
  return `#${[blend(r), blend(g), blend(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
}

function computeExpandedH(
  chipCount: number,
  hasConfirmBtn: boolean,
  hasServiceChip: boolean,
): number {
  if (chipCount === 0) return 0;
  /** Matches `expandedArea`: paddingTop + title spacer. */
  const titleSpacerH = hasConfirmBtn ? TITLE_SPACER_WITH_CONFIRM : TITLE_H;
  const topBlock = SUMMARY_TITLE_TOP + titleSpacerH;
  /** One gray card: row heights + white dashed dividers (no per-row margins). */
  const rowsHeights = chipCount * ROW_H + (hasServiceChip ? SERVICE_ROW_EXTRA_H : 0);
  const dividerBlock = chipCount > 1 ? (chipCount - 1) * SUMMARY_DIVIDER_H : 0;
  const rowsBlock = rowsHeights + dividerBlock;
  const btnBlock = hasConfirmBtn ? CONFIRM_BTN_MARGIN + CONFIRM_BTN_H : 0;
  const bottomPad = hasConfirmBtn ? EXPANDED_PAD_BELOW_CONFIRM : V_PAD;
  return topBlock + rowsBlock + btnBlock + bottomPad;
}

/** Subtle dashed line — matches ServiceSelection; visible on the light gray card. */
function SummaryDashedDivider({ width }: { width: number }) {
  const w = Math.max(40, Math.floor(width - 24));
  return (
    <View style={summaryDividerStyles.wrap} pointerEvents="none">
      <Svg width={w} height={3}>
        <Line
          x1={0}
          y1={1.5}
          x2={w}
          y2={1.5}
          stroke="rgba(0,0,0,0.10)"
          strokeWidth={1}
          strokeDasharray="5 6"
        />
      </Svg>
    </View>
  );
}

const summaryDividerStyles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: SUMMARY_DIVIDER_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export interface BookingSuccessData {
  serviceName: string;
  barberName?: string;
  /** Formatted date label, e.g. "יום שני · 21.4.26" */
  dateLabel: string;
  /** Formatted time label, e.g. "14:00 – 15:15" */
  timeLabel: string;
}

export interface BookingSummarySheetHandle {
  expand: () => void;
  collapse: () => void;
}

export interface BookingSummarySheetProps {
  visible: boolean;
  chips: BookingProgressChipModel[];
  primaryColor: string;
  /** Distance from bottom of screen to top of booking step bar */
  bottomOffset: number;
  /** Safe area bottom inset — used to extend white background through home indicator */
  safeAreaBottom?: number;
  onChipPress?: (kind: BookingProgressChipModel['kind']) => void;
  /** Called when the user taps "Book Appointment" in the expanded sheet */
  onConfirm?: () => void;
  /** Show a loading spinner on the confirm button */
  confirmLoading?: boolean;
  /** When set, the sheet transitions to a success view showing booking confirmation */
  successData?: BookingSuccessData;
  /** Called when the user taps "הבנתי" in the success view */
  onSuccessDismiss?: () => void;
  /** Called when the user taps "הוסף ליומן" in the success view */
  onAddToCalendar?: () => void;
  addToCalendarLabel?: string;
  gotItLabel?: string;
}

const BookingSummarySheet = forwardRef<BookingSummarySheetHandle, BookingSummarySheetProps>(
  function BookingSummarySheet(
    {
      visible,
      chips,
      primaryColor,
      bottomOffset,
      safeAreaBottom = 0,
      onChipPress,
      onConfirm,
      confirmLoading = false,
      successData,
      onSuccessDismiss,
      onAddToCalendar,
      addToCalendarLabel,
      gotItLabel,
    },
    ref,
  ) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const prevChipsLengthRef = useRef(chips.length);

  const hasTime = chips.some((c) => c.kind === 'time');
  const hasConfirmBtn = hasTime && typeof onConfirm === 'function';
  const hasServiceChip = chips.some((c) => c.kind === 'service');
  const { width: winW, height: winH } = useWindowDimensions();
  const summaryDividerLineW = Math.max(160, winW - 32);
  const expandedH = computeExpandedH(chips.length, hasConfirmBtn, hasServiceChip);
  // Fit content; on very small screens shrink to 76% of viewport
  const successH = Math.min(SUCCESS_H_MIN, winH * 0.76);

  // Only the inner expanded container animates — the sheet itself sizes naturally
  const expandedContainerH = useSharedValue(0);
  const progress = useSharedValue(0);

  const collapseAnim = { duration: 300, easing: Easing.out(Easing.cubic) };
  const expandAnim  = { duration: 380, easing: Easing.out(Easing.cubic) };

  const doExpand = () => {
    setExpanded(true);
    expandedContainerH.value = withTiming(expandedH, expandAnim);
    progress.value = withTiming(1, expandAnim);
  };

  const doCollapse = () => {
    setExpanded(false);
    expandedContainerH.value = withTiming(0, collapseAnim);
    progress.value = withTiming(0, collapseAnim);
  };

  // Re-collapse only when chips list shrinks (user went back a step)
  useEffect(() => {
    const prev = prevChipsLengthRef.current;
    prevChipsLengthRef.current = chips.length;
    if (expanded && chips.length < prev) {
      doCollapse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chips.length]);

  // Expose expand/collapse to parent via ref
  useImperativeHandle(ref, () => ({
    expand: () => { if (!expanded) doExpand(); },
    collapse: () => { if (expanded) doCollapse(); },
  }), [expanded, expandedH]);

  // ── Success transition ──────────────────────────────────────────────────────
  const successEnter = useSharedValue(0);
  const checkScale  = useSharedValue(0);

  useEffect(() => {
    if (successData) {
      // Auto-expand and resize to fit the success content
      if (!expanded) setExpanded(true);
      progress.value = withTiming(1, expandAnim);
      expandedContainerH.value = withTiming(successH, expandAnim);
      // Fade in success content, then spring-in checkmark
      successEnter.value = withDelay(160, withTiming(1, { duration: 380 }));
      checkScale.value   = withDelay(340, withSpring(1, { damping: 11, stiffness: 155 }));
    } else {
      // Reset success animations so next visit doesn't show stale success state
      successEnter.value = 0;
      checkScale.value = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successData]);

  const summaryFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(successEnter.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  const successFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(successEnter.value, [0.35, 1], [0, 1], Extrapolation.CLAMP),
  }));
  const checkmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));
  // ────────────────────────────────────────────────────────────────────────────

  const toggle = () => {
    if (successData) return; // locked in success view
    if (expanded) {
      doCollapse();
    } else {
      doExpand();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  /** Expanded container clips its children to exactly its animated height. */
  const expandedContainerStyle = useAnimatedStyle(() => ({
    height: expandedContainerH.value,
    overflow: 'hidden',
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.38]),
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }],
  }));

  /**
   * Peek bar: always animate height + opacity in lockstep with `progress` so the strip
   * smoothly shrinks/grows with every expand/collapse - no sudden pops at any step.
   */
  const peekBarWrapAnimStyle = useAnimatedStyle(() => {
    const fullH = PEEK_H + HANDLE_RADIUS - 6 + PEEK_TITLE_BLOCK;
    return {
      height: interpolate(progress.value, [0, 1], [fullH, 0], Extrapolation.CLAMP),
      opacity: interpolate(progress.value, [0, 0.3, 0.65, 1], [1, 0.7, 0.08, 0], Extrapolation.CLAMP),
      overflow: 'hidden',
    };
  });

  /**
   * Single “סיכום תור” line: anchored at peek heading, slides down into expanded header
   * (physical sheet motion reads as rising into the big header).
   */
  const summaryTitleFloatStyle = useAnimatedStyle(() => ({
    top: PEEK_SUMMARY_TITLE_TOP,
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [0, SUMMARY_TITLE_SLIDE_DY],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(progress.value, [0, 1], [0.9, 1], Extrapolation.CLAMP),
      },
    ],
    opacity: interpolate(progress.value, [0, 0.25, 1], [0.88, 0.96, 1], Extrapolation.CLAMP),
  }));

  if (!visible || chips.length === 0) return null;

  const barber = chips.find((c) => c.kind === 'barber');
  const service = chips.find((c) => c.kind === 'service');
  const day = chips.find((c) => c.kind === 'day');
  const time = chips.find((c) => c.kind === 'time');

  const isRTL = I18nManager.isRTL;
  const rowDir = isRTL ? 'row-reverse' : 'row';

  const handleChipPress = (kind: BookingProgressChipModel['kind']) => {
    toggle();
    setTimeout(() => onChipPress?.(kind), 180);
  };

  /** Peek placeholders navigate without opening the sheet when it’s already collapsed. */
  const onPeekPlaceholderPress = (kind: BookingProgressChipModel['kind']) => {
    if (expanded) {
      toggle();
      setTimeout(() => onChipPress?.(kind), 180);
    } else {
      onChipPress?.(kind);
    }
  };

  return (
    <>
      {/* Backdrop overlay */}
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
      </Animated.View>

      {/* Shell: no border-radius so the handle isn’t clipped (iOS clips overflow on rounded parents). */}
      <View style={[styles.sheetShell, { bottom: bottomOffset }]}>
        {/* Floating handle — sibling of rounded card; center sits on purple/white edge */}
        <Pressable
          onPress={toggle}
          style={[
            styles.sheetHandle,
            {
              top: -HANDLE_RADIUS,
              marginLeft: -HANDLE_RADIUS,
              backgroundColor: opaquePrimaryTint(primaryColor),
            },
          ]}
        >
          <Animated.View style={arrowStyle}>
            <Ionicons name="chevron-up" size={18} color={primaryColor} />
          </Animated.View>
        </Pressable>

        <View style={styles.sheet}>
        {/* ─── Expanded content — animated from height 0, clips via overflow:hidden ─── */}
        <Animated.View
          style={[expandedContainerStyle, hasConfirmBtn && styles.expandedContainerColumn]}
        >
          {/* Summary content fades out when success arrives */}
          <Animated.View style={[summaryFadeStyle, hasConfirmBtn && styles.expandedAreaFill]} pointerEvents={successData ? 'none' : 'auto'}>
        <View
          style={[
            styles.expandedArea,
            hasConfirmBtn && styles.expandedAreaFill,
            {
              paddingBottom: hasConfirmBtn ? EXPANDED_PAD_BELOW_CONFIRM : V_PAD,
            },
          ]}
        >
          <View
            style={{
              height: hasConfirmBtn ? TITLE_SPACER_WITH_CONFIRM : TITLE_H,
            }}
          />

          <View style={styles.summaryListCard}>
            {barber && (
              <Pressable
                onPress={() => handleChipPress('barber')}
                style={({ pressed }) => [
                  styles.summaryRowInCard,
                  pressed && styles.summaryRowInCardPressed,
                ]}
              >
                <View style={[styles.summaryRowInner, { flexDirection: rowDir }]}>
                  <View style={styles.summaryAvatar}>
                    {barber.imageUri ? (
                      <Image
                        source={{ uri: barber.imageUri }}
                        style={styles.summaryAvatarImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={20} color="#aaa" />
                    )}
                  </View>
                  <View style={[styles.summaryTextCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={styles.summaryRowLabel}>
                      {barber.customRowLabel ?? t('booking.summary.staffLabel', 'איש צוות')}
                    </Text>
                    <Text style={styles.summaryRowValue} numberOfLines={1}>
                      {barber.label}
                    </Text>
                  </View>
                  <View style={styles.summaryChevronPhysical} collapsable={false}>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color="#AEAEB2"
                      style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                    />
                    <Text style={styles.summaryBackTag}>
                      {t('booking.summary.goBack', '\u05D7\u05D6\u05D5\u05E8 \u05DC\u05E9\u05DC\u05D1')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
            {barber && (service || day || time) ? (
              <SummaryDashedDivider width={summaryDividerLineW} />
            ) : null}

            {service && (
              <Pressable
                onPress={() => handleChipPress('service')}
                style={({ pressed }) => [
                  styles.summaryRowInCard,
                  pressed && styles.summaryRowInCardPressed,
                ]}
              >
                <View
                  style={[
                    styles.summaryRowInner,
                    { flexDirection: rowDir, height: ROW_H + SERVICE_ROW_EXTRA_H },
                  ]}
                >
                  <View style={[styles.summaryIconCircle, { backgroundColor: `${primaryColor}18` }]}>
                    <View style={styles.summaryChevronPhysical} collapsable={false}>
                      <Ionicons name="checkmark-circle" size={22} color={primaryColor} />
                    </View>
                  </View>
                  <View style={[styles.summaryTextCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={styles.summaryRowLabel}>
                      {'\u05E9\u05D9\u05E8\u05D5\u05EA'}
                    </Text>
                    <Text style={styles.summaryRowValue} numberOfLines={1}>
                      {service.serviceName ?? service.label}
                    </Text>
                    <Text style={styles.summaryRowMeta} numberOfLines={1}>
                      {`${service.servicePriceText ?? '—'} · ${service.serviceDurationMinutes ?? 60} ${t('booking.min', 'min')}`}
                    </Text>
                  </View>
                  <View style={styles.summaryChevronPhysical} collapsable={false}>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color="#AEAEB2"
                      style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                    />
                    <Text style={styles.summaryBackTag}>
                      {t('booking.summary.goBack', '\u05D7\u05D6\u05D5\u05E8 \u05DC\u05E9\u05DC\u05D1')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
            {service && (day || time) ? <SummaryDashedDivider width={summaryDividerLineW} /> : null}

            {day && (
              <Pressable
                onPress={() => handleChipPress('day')}
                style={({ pressed }) => [
                  styles.summaryRowInCard,
                  pressed && styles.summaryRowInCardPressed,
                ]}
              >
                <View style={[styles.summaryRowInner, { flexDirection: rowDir }]}>
                  <View style={[styles.summaryIconCircle, { backgroundColor: `${primaryColor}18` }]}>
                    <Ionicons name="calendar" size={18} color={primaryColor} />
                  </View>
                  <View style={[styles.summaryTextCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={styles.summaryRowLabel}>
                      {'\u05EA\u05D0\u05E8\u05D9\u05DA'}
                    </Text>
                    <Text style={styles.summaryRowValue} numberOfLines={1}>
                      {(day.dayWeekdayLong ?? day.dayWeekday) && day.dayDateLine
                        ? `${day.dayWeekdayLong ?? day.dayWeekday} · ${day.dayDateLine}`
                        : day.label}
                    </Text>
                  </View>
                  <View style={styles.summaryChevronPhysical} collapsable={false}>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color="#AEAEB2"
                      style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                    />
                    <Text style={styles.summaryBackTag}>
                      {t('booking.summary.goBack', '\u05D7\u05D6\u05D5\u05E8 \u05DC\u05E9\u05DC\u05D1')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
            {day && time ? <SummaryDashedDivider width={summaryDividerLineW} /> : null}

            {time && (
              <Pressable
                onPress={() => handleChipPress('time')}
                style={({ pressed }) => [
                  styles.summaryRowInCard,
                  pressed && styles.summaryRowInCardPressed,
                ]}
              >
                <View style={[styles.summaryRowInner, { flexDirection: rowDir }]}>
                  <View style={[styles.summaryIconCircle, { backgroundColor: `${primaryColor}18` }]}>
                    <Ionicons name="time" size={18} color={primaryColor} />
                  </View>
                  <View style={[styles.summaryTextCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={styles.summaryRowLabel}>
                      {'\u05E9\u05E2\u05D4'}
                    </Text>
                    <Text style={styles.summaryRowValue} numberOfLines={1}>
                      {time.timeDaypart
                        ? `${time.label} · ${time.timeDaypart}`
                        : time.label}
                    </Text>
                  </View>
                  <View style={styles.summaryChevronPhysical} collapsable={false}>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color="#AEAEB2"
                      style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                    />
                    <Text style={styles.summaryBackTag}>
                      {t('booking.summary.goBack', '\u05D7\u05D6\u05D5\u05E8 \u05DC\u05E9\u05DC\u05D1')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          </View>

          {hasConfirmBtn ? <View style={styles.summaryFlexSpacer} /> : null}

          {/* ── Confirm button — shown when all details are filled ── */}
          {hasConfirmBtn && (
            <Pressable
              onPress={onConfirm}
              disabled={confirmLoading}
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: primaryColor },
                pressed && styles.confirmBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('booking.bookAppointment', 'Book Appointment')}
            >
              {confirmLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {t('booking.bookAppointment', 'קבע תור')}
                </Text>
              )}
            </Pressable>
          )}
        </View>
          </Animated.View>

          {/* Success overlay — fades in after booking */}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.successOverlay, successFadeStyle]}
            pointerEvents={successData ? 'auto' : 'none'}
          >
            {/* Checkmark with glow ring */}
            <Animated.View style={[styles.successCheckWrap, checkmarkAnimStyle]}>
              <View style={[styles.successCheckGlow, { backgroundColor: `${primaryColor}18` }]}>
                <Ionicons name="checkmark-circle" size={72} color={primaryColor} />
              </View>
            </Animated.View>

            <Text style={[styles.successTitle, { color: primaryColor }]}>
              {t('booking.successAnimatedHeadline', '\u05D4\u05EA\u05D5\u05E8 \u05E0\u05E7\u05D1\u05E2 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4!')}
            </Text>

            {successData && (
              <>
                {/* Date pill */}
                <View style={[styles.successDatePill, { backgroundColor: `${primaryColor}14` }]}>
                  <Ionicons name="calendar-outline" size={13} color={primaryColor} />
                  <Text style={[styles.successDatePillText, { color: primaryColor }]}>
                    {successData.dateLabel}
                  </Text>
                </View>

                {/* Time pill */}
                <View style={[styles.successDatePill, { backgroundColor: `${primaryColor}14` }]}>
                  <Ionicons name="time-outline" size={13} color={primaryColor} />
                  <Text style={[styles.successDatePillText, { color: primaryColor }]}>
                    {successData.timeLabel}
                  </Text>
                </View>

                {/* Meta card */}
                <View style={styles.successMetaCard}>
                  <View style={styles.successMetaRow}>
                    <Text style={styles.successMetaLabel}>
                      {t('booking.field.service', '\u05E9\u05D9\u05E8\u05D5\u05EA')}
                    </Text>
                    <Text style={styles.successMetaValue} numberOfLines={2}>
                      {successData.serviceName}
                    </Text>
                  </View>
                  {successData.barberName ? (
                    <>
                      <View style={styles.successMetaCardDivider} />
                      <View style={styles.successMetaRow}>
                        <Text style={styles.successMetaLabel}>
                          {t('booking.field.barber', '\u05E1\u05E4\u05E8')}
                        </Text>
                        <Text style={styles.successMetaValue} numberOfLines={1}>
                          {successData.barberName}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </>
            )}

            <View style={[styles.successBtns, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {onAddToCalendar ? (
                <Pressable
                  onPress={onAddToCalendar}
                  style={({ pressed }) => [
                    styles.successBtnCalendar,
                    { backgroundColor: `${primaryColor}12` },
                    pressed && styles.successBtnCalendarPressed,
                  ]}
                >
                  <Ionicons name="calendar-outline" size={17} color={primaryColor} />
                  <Text style={[styles.successBtnCalendarText, { color: primaryColor }]}>
                    {addToCalendarLabel ?? t('booking.addToCalendar', '\u05D4\u05D5\u05E1\u05E3 \u05DC\u05D9\u05D5\u05DE\u05DF')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={onSuccessDismiss}
                style={({ pressed }) => [styles.confirmBtn, { backgroundColor: primaryColor, flex: 1, marginTop: 0 }, pressed && styles.confirmBtnPressed]}
              >
                <Text style={styles.confirmBtnText}>
                  {gotItLabel ?? t('booking.gotIt', '\u05D4\u05D1\u05E0\u05EA\u05D9')}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[styles.summaryTitleFloatWrap, summaryTitleFloatStyle, summaryFadeStyle]}
        >
          <Text
            style={[styles.summaryTitleFloatText, { color: primaryColor }]}
            maxFontSizeMultiplier={1.25}
          >
            {t('booking.peekSummaryTitle', 'Appointment summary')}
          </Text>
        </Animated.View>

        {/* ─── Peek bar — hidden only while expanded on final step; collapsed shows chip preview ─── */}
        <Animated.View
          pointerEvents={expanded ? 'none' : 'auto'}
          style={peekBarWrapAnimStyle}>
          <View style={styles.peekBar}>
          <View style={styles.peekTitleSpacer} />
          <View style={styles.peekItemsRowOuter}>
            <View
              style={[
                styles.peekItemsRow,
                { flexDirection: isRTL ? 'row-reverse' : 'row' },
                /* Full width only while “choose service” placeholder stretches; with a real service, hug content + center */
                barber && !service ? styles.peekItemsRowFill : null,
              ]}
            >
            {barber && (
              <Pressable onPress={toggle} hitSlop={6} accessibilityRole="button" accessibilityLabel={barber.label}>
                <View style={[styles.peekItemFixed, { flexDirection: rowDir }]}>
                  <View style={styles.peekAvatar}>
                    {barber.imageUri ? (
                      <Image
                        source={{ uri: barber.imageUri }}
                        style={styles.peekAvatarImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={11} color="#aaa" />
                    )}
                  </View>
                  <Text style={styles.peekItemTextFixed} numberOfLines={1}>
                    {barber.label}
                  </Text>
                </View>
              </Pressable>
            )}

            {service ? (
              <>
                <View style={styles.peekSep} />
                <Pressable
                  onPress={toggle}
                  hitSlop={4}
                  style={styles.peekItemFlexOuter}
                  accessibilityRole="button"
                  accessibilityLabel={service.serviceName ?? service.label}
                >
                  <View style={[styles.peekItemFlex, { flexDirection: rowDir }]}>
                    <View style={[styles.peekPriceBadge, { borderColor: `${primaryColor}40`, backgroundColor: `${primaryColor}12`, flexShrink: 0 }]}>
                      <Text style={[styles.peekPriceText, { color: primaryColor }]} numberOfLines={1}>
                        {service.servicePriceText ?? '\u2014'}
                      </Text>
                    </View>
                    <Text style={styles.peekItemTextFlex} numberOfLines={1} ellipsizeMode="tail">
                      {service.serviceName ?? service.label}
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : barber ? (
              <>
                <View style={styles.peekSep} />
                <Pressable
                  onPress={() => onPeekPlaceholderPress('service')}
                  style={({ pressed }) => [
                    styles.peekPlaceholder,
                    { flexDirection: rowDir },
                    pressed && styles.peekPlaceholderPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={'\u05D1\u05D7\u05E8 \u05E9\u05D9\u05E8\u05D5\u05EA'}
                >
                  <Ionicons name="cut-outline" size={14} color="#9a9a9e" />
                  <Text style={styles.peekPlaceholderText} numberOfLines={1}>
                    {'\u05D1\u05D7\u05E8 \u05E9\u05D9\u05E8\u05D5\u05EA'}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {day ? (
              <>
                <View style={styles.peekSep} />
                <Pressable onPress={toggle} hitSlop={4} accessibilityRole="button">
                  <View style={[styles.peekItemFixed, { flexDirection: rowDir }]}>
                    <Ionicons name="calendar-outline" size={12} color="#888" style={styles.peekIcon} />
                    <Text style={styles.peekItemTextFixed} numberOfLines={1}>
                      {day.dayDateLine ?? day.label}
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : barber ? (
              <>
                <View style={styles.peekSep} />
                <Pressable
                  onPress={() =>
                    onPeekPlaceholderPress(service ? 'day' : 'service')
                  }
                  style={({ pressed }) => [
                    styles.peekPlaceholder,
                    styles.peekPlaceholderCompact,
                    { flexDirection: rowDir },
                    pressed && styles.peekPlaceholderPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('booking.step.date.none', 'Choose a date')}
                >
                  <Ionicons name="calendar-outline" size={13} color="#9a9a9e" />
                  <Text
                    style={styles.peekPlaceholderTextDate}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {t('booking.step.date.none', 'Choose a date')}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {time && (
              <>
                <View style={styles.peekSep} />
                <Pressable onPress={toggle} hitSlop={4} accessibilityRole="button">
                  <View style={[styles.peekItemFixed, { flexDirection: rowDir }]}>
                    <Ionicons name="time-outline" size={12} color="#888" style={styles.peekIcon} />
                    <Text style={styles.peekItemTextFixed} numberOfLines={1}>
                      {time.label}
                    </Text>
                  </View>
                </Pressable>
              </>
            )}
            </View>
          </View>
          </View>
        </Animated.View>

        {/* White safe-area spacer — extends white bg through home indicator */}
        {safeAreaBottom > 0 && (
          <View style={{ height: safeAreaBottom, backgroundColor: '#FFFFFF' }} />
        )}
        </View>
      </View>
    </>
  );
});

export default BookingSummarySheet;

const styles = StyleSheet.create({
  backdrop: {
    zIndex: 28,
    backgroundColor: '#000',
  },
  sheetShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 29,
    overflow: 'visible',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BORDER_RADIUS,
    borderTopRightRadius: BORDER_RADIUS,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sheetHandle: {
    position: 'absolute',
    left: '50%',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },

  // ── Expanded area ──
  expandedArea: {
    paddingHorizontal: 16,
    paddingTop: SUMMARY_TITLE_TOP,
  },
  /** Fill animated height so the summary card can sit centered above the confirm button */
  expandedAreaFill: {
    flex: 1,
  },
  expandedContainerColumn: {
    flexDirection: 'column',
  },
  /** Grows between gray card and button so the card stays near the title, not the button */
  summaryFlexSpacer: {
    flex: 1,
    minHeight: 0,
  },
  summaryTitleFloatWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 55,
    alignItems: 'center',
  },
  summaryTitleFloatText: {
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: 0.15,
    textAlign: 'center',
    opacity: 0.92,
  },
  peekTitleSpacer: {
    height: PEEK_TITLE_BLOCK,
  },
  /** Light grouped surface — same family as the old per-row `#F7F7F9` chips. */
  summaryListCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  summaryRowInCard: {
    backgroundColor: 'transparent',
  },
  summaryRowInCardPressed: {
    backgroundColor: 'rgba(0,0,0,0.035)',
  },
  summaryRowInner: {
    height: ROW_H,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 10,
  },
  /** Prevents `forceRTL` from mirroring the chevron twice (wrong final direction). */
  summaryChevronPhysical: {
    direction: 'ltr',
    alignItems: 'center',
    gap: 3,
  },
  summaryBackTag: {
    fontSize: 8,
    fontWeight: '700',
    color: '#AEAEB2',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    letterSpacing: 0.1,
    overflow: 'hidden',
    textAlign: 'center',
  },
  summaryAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: '#EBEBED',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryAvatarImg: {
    width: '100%',
    height: '100%',
  },
  summaryIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryPriceInCircle: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  summaryTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 1,
  },
  summaryRowLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#aaa',
    letterSpacing: 0.2,
  },
  summaryRowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  summaryRowMeta: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: -0.15,
  },

  // ── Success overlay ──
  successOverlay: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    zIndex: 100,
    backgroundColor: '#FFFFFF',
  },
  successCheckWrap: {},
  successCheckGlow: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  successDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  successDatePillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  successMetaCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.04)',
    paddingVertical: 4,
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
    paddingVertical: 8,
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
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  successBtns: {
    width: '100%',
    gap: 10,
    marginTop: 8,
    alignItems: 'stretch',
  },
  successBtnCalendar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 0,
    borderRadius: 16,
    paddingVertical: 0,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 3,
  },
  successBtnCalendarPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  successBtnCalendarText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  // ── Peek bar ──
  peekBar: {
    minHeight: PEEK_H + HANDLE_RADIUS - 6 + PEEK_TITLE_BLOCK,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingTop: HANDLE_RADIUS - 4,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.07)',
    paddingBottom: 4,
  },
  /** No chip strip after time is selected — sheet ends at expanded content + home indicator */
  peekBarFinalStep: {
    minHeight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    gap: 0,
    borderTopWidth: 0,
  },
  peekItemsRowOuter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    minHeight: 0,
  },
  peekItemsRow: {
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  /** Barber + “choose service” — row spans width so the placeholder can grow */
  peekItemsRowFill: {
    width: '100%',
  },
  peekItemFlexOuter: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekPlaceholder: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C8C8CE',
    backgroundColor: '#F4F4F6',
  },
  /**
   * Date placeholder next to service — intrinsic width only so the service
   * strip keeps most of the row (service placeholder above still uses flex).
   */
  peekPlaceholderCompact: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: 118,
    paddingHorizontal: 7,
    gap: 4,
  },
  peekPlaceholderPressed: {
    opacity: 0.88,
  },
  peekPlaceholderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#909096',
    letterSpacing: -0.2,
    flexShrink: 1,
    minWidth: 0,
  },
  /** Slightly smaller label so “בחר תאריך” fits in a narrow chip */
  peekPlaceholderTextDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#909096',
    letterSpacing: -0.25,
    flexShrink: 1,
    minWidth: 0,
  },
  /** Fixed-size item (barber, date, time) — never shrinks */
  peekItemFixed: {
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  peekItemTextFixed: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    letterSpacing: -0.2,
    flexShrink: 0,
  },
  /** Flexible item (service name) — shrinks first when space is tight */
  peekItemFlex: {
    flexShrink: 1,
    flexGrow: 0,
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  peekItemTextFlex: {
    flexShrink: 1,
    flexGrow: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    letterSpacing: -0.2,
    minWidth: 0,
  },
  peekAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#EBEBED',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  peekAvatarImg: {
    width: '100%',
    height: '100%',
  },
  peekPriceBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  peekPriceText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  peekSep: {
    width: 1,
    height: 16,
    backgroundColor: '#E0E0E0',
    flexShrink: 0,
  },
  peekIcon: {
    flexShrink: 0,
  },

  /* ── Confirm button ── */
  confirmBtn: {
    marginTop: CONFIRM_BTN_MARGIN,
    height: CONFIRM_BTN_H,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmBtnPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
