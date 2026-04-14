import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Platform } from 'react-native';
import { BOOKING_TIME_PERIOD_EMOJI } from '@/constants/bookingTimePeriodEmoji';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import type { WaitlistDayWindow } from '@/lib/utils/waitlistTimePeriods';

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'any';

interface TimePeriodOption {
  value: TimePeriod;
  label: string;
  rangeKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  accentSoft: string;
}

const timePeriodOptions: TimePeriodOption[] = [
  {
    value: 'morning',
    label: 'time_period.morning',
    rangeKey: 'time_period.range.morning',
    icon: 'sunny',
    accent: '#E8A849',
    accentSoft: 'rgba(232, 168, 73, 0.14)',
  },
  {
    value: 'afternoon',
    label: 'time_period.afternoon',
    rangeKey: 'time_period.range.afternoon',
    icon: 'partly-sunny',
    accent: '#E85D5D',
    accentSoft: 'rgba(232, 93, 93, 0.12)',
  },
  {
    value: 'evening',
    label: 'time_period.evening',
    rangeKey: 'time_period.range.evening',
    icon: 'moon',
    accent: '#7B6CF6',
    accentSoft: 'rgba(123, 108, 246, 0.14)',
  },
  {
    value: 'any',
    label: 'time_period.any',
    rangeKey: 'time_period.flexible',
    icon: 'time',
    accent: '#3DBB7A',
    accentSoft: 'rgba(61, 187, 122, 0.12)',
  },
];

const WINDOW_ORDER: Record<WaitlistDayWindow, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
};

function sortWindows(w: WaitlistDayWindow[]): WaitlistDayWindow[] {
  return [...w].sort((a, b) => WINDOW_ORDER[a] - WINDOW_ORDER[b]);
}

interface TimePeriodSelectorProps {
  disabled?: boolean;
  hideHeader?: boolean;
  /** When set, only these periods are listed (e.g. same-day: drop windows that already ended). */
  allowedPeriods?: TimePeriod[] | null;
  /** Waitlist: toggle multiple day windows (morning / afternoon / evening only). */
  multiSelect?: boolean;
  selectedWindows?: WaitlistDayWindow[];
  onChangeWindows?: (next: WaitlistDayWindow[]) => void;
  /** Single-choice mode (ignored when `multiSelect` is true). */
  selectedPeriod?: TimePeriod | null;
  onSelectPeriod?: (period: TimePeriod) => void;
}

export default function TimePeriodSelector({
  disabled = false,
  hideHeader = false,
  allowedPeriods = null,
  multiSelect = false,
  selectedWindows = [],
  onChangeWindows,
  selectedPeriod = null,
  onSelectPeriod,
}: TimePeriodSelectorProps) {
  const { t } = useTranslation();
  const { colors } = useBusinessColors();

  const allowed = allowedPeriods == null ? null : new Set<TimePeriod>(allowedPeriods);

  const optionsToShow = (() => {
    const pool = multiSelect
      ? timePeriodOptions.filter((o) => o.value !== 'any')
      : timePeriodOptions;
    if (allowed == null) return pool;
    return pool.filter((o) => allowed.has(o.value));
  })();

  const toggleWindow = (w: WaitlistDayWindow) => {
    if (!onChangeWindows || disabled) return;
    const next = selectedWindows.includes(w)
      ? selectedWindows.filter((x) => x !== w)
      : sortWindows([...selectedWindows, w]);
    onChangeWindows(next);
  };

  return (
    <View style={styles.outer}>
      {!hideHeader && (
        <>
          <View style={[styles.sectionPill, { backgroundColor: `${colors.primary}12` }]}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={[styles.sectionPillText, { color: colors.primary }]}>
              {t('waitlist.preferredWindow', 'Preferred time')}
            </Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            {multiSelect
              ? t('waitlist.selectPeriodMulti', 'Choose one or more time windows')
              : t('waitlist.selectPeriod', 'Please select a preferred time period')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {multiSelect
              ? t(
                  'waitlist.selectPeriodsSubtitle',
                  "We'll notify you when a slot opens in any of the windows you select"
                )
              : t(
                  'waitlist.selectPeriodSubtitle',
                  "We'll notify you when a slot opens in your preferred time period"
                )}
          </Text>
        </>
      )}

      <View style={[styles.optionsStack, multiSelect && styles.optionsStackRow]}>
        {optionsToShow.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            {t(
              'waitlist.noPeriodsLeftToday',
              'אין יותר חלונות זמן היום לפי שעות הפעילות — בחרו תאריך אחר או נסו שוב מחר.'
            )}
          </Text>
        ) : null}
        {optionsToShow.map((option) => {
          const isWindow = option.value === 'morning' || option.value === 'afternoon' || option.value === 'evening';
          const selected = multiSelect
            ? isWindow && selectedWindows.includes(option.value as WaitlistDayWindow)
            : selectedPeriod === option.value;

          const isMultiWindowCard = multiSelect && isWindow;

          const cardShell = (
            <>
              {selected && !isMultiWindowCard && (
                <LinearGradient
                  colors={[`${colors.primary}22`, 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              {multiSelect && isWindow ? (
                <>
                  <View style={[styles.iconRingMulti, { backgroundColor: option.accentSoft }]}>
                    <Text style={styles.periodEmojiMulti} maxFontSizeMultiplier={1.25}>
                      {BOOKING_TIME_PERIOD_EMOJI[option.value as WaitlistDayWindow]}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.optionLabelMulti,
                      { color: colors.text },
                      selected && { color: colors.primary, fontWeight: '700' },
                      disabled && styles.disabledText,
                    ]}
                    numberOfLines={1}
                  >
                    {t(option.label as never)}
                  </Text>
                  <Text
                    style={[
                      styles.optionDescriptionMulti,
                      { color: colors.textSecondary },
                      selected && { color: colors.primary, opacity: 0.85 },
                      disabled && styles.disabledText,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {t(option.rangeKey as never)}
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.iconRing, { backgroundColor: option.accentSoft }]}>
                    <Ionicons name={option.icon} size={22} color={option.accent} />
                  </View>

                  <View style={styles.optionTextBlock}>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: colors.text },
                        selected && { color: colors.primary, fontWeight: '700' },
                        disabled && styles.disabledText,
                      ]}
                    >
                      {t(option.label as never)}
                    </Text>
                    <Text
                      style={[
                        styles.optionDescription,
                        { color: colors.textSecondary },
                        selected && { color: colors.primary, opacity: 0.85 },
                        disabled && styles.disabledText,
                      ]}
                    >
                      {t(option.rangeKey as never)}
                    </Text>
                  </View>

                  <View style={styles.trailingSlot}>
                    {selected ? (
                      <LinearGradient
                        colors={[colors.primary, colors.secondary || colors.primary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.checkBubble}
                      >
                        <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                      </LinearGradient>
                    ) : (
                      <View style={[styles.emptyRing, { borderColor: `${colors.text}18` }]} />
                    )}
                  </View>
                </>
              )}
            </>
          );

          /**
           * Waitlist windows: plain `View` holds white + rounded rect — RN `TouchableOpacity` often
           * fails to paint backgrounds inside @gorhom/bottom-sheet (gesture-handler stack).
           */
          if (isMultiWindowCard) {
            return (
              <View
                key={option.value}
                collapsable={false}
                style={[styles.cardTouchable, styles.cardTouchableMulti, styles.multiWindowCube]}
              >
                <Pressable
                  disabled={disabled}
                  onPress={() => {
                    if (disabled) return;
                    toggleWindow(option.value as WaitlistDayWindow);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!selected }}
                  android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
                  style={({ pressed }) => [
                    styles.multiWindowCubeInner,
                    disabled && styles.disabledOption,
                    pressed && !disabled && styles.multiWindowCubePressed,
                  ]}
                >
                  {cardShell}
                </Pressable>
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={option.value}
              activeOpacity={disabled ? 1 : 0.88}
              disabled={disabled}
              onPress={() => {
                if (disabled) return;
                if (!multiSelect && onSelectPeriod) {
                  onSelectPeriod(option.value);
                }
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: !!selected }}
              style={[styles.cardTouchable]}
            >
              <View
                collapsable={false}
                style={[
                  styles.optionCard,
                  {
                    borderColor: selected ? colors.primary : 'rgba(0,0,0,0.06)',
                    backgroundColor: selected ? `${colors.primary}0A` : colors.surface,
                  },
                  disabled && styles.disabledOption,
                  selected && styles.optionCardSelected,
                ]}
              >
                {cardShell}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    marginBottom: 18,
  },
  sectionPillText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 22,
    paddingHorizontal: 8,
    opacity: 0.92,
  },
  optionsStack: {
    gap: 11,
  },
  optionsStackRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  cardTouchable: {
    borderRadius: 18,
  },
  cardTouchableMulti: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  /**
   * Each waitlist window: white rounded tile.
   * Do not use `overflow: 'hidden'` here — it clips the drop shadow on iOS.
   */
  multiWindowCube: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: {
        elevation: 7,
      },
    }),
  },
  multiWindowCubeInner: {
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 6,
    minHeight: 108,
    width: '100%',
  },
  multiWindowCubePressed: {
    opacity: 0.94,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
    }),
  },
  optionCardSelected: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: { elevation: 5 },
    }),
  },
  disabledOption: {
    opacity: 0.48,
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 14,
  },
  iconRingMulti: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodEmojiMulti: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: 'center',
  },
  optionLabelMulti: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  optionDescriptionMulti: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    opacity: 0.9,
  },
  optionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 3,
    textAlign: 'left',
  },
  optionDescription: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'left',
    opacity: 0.88,
  },
  trailingSlot: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
  },
  checkBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  disabledText: {
    opacity: 0.45,
  },
  emptyHint: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
});
