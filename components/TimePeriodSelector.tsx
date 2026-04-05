import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

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

interface TimePeriodSelectorProps {
  selectedPeriod: TimePeriod | null;
  onSelectPeriod: (period: TimePeriod) => void;
  disabled?: boolean;
  hideHeader?: boolean;
}

export default function TimePeriodSelector({
  selectedPeriod,
  onSelectPeriod,
  disabled = false,
  hideHeader = false,
}: TimePeriodSelectorProps) {
  const { t } = useTranslation();
  const { colors } = useBusinessColors();

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
            {t('waitlist.selectPeriod', 'Please select a preferred time period')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t(
              'waitlist.selectPeriodSubtitle',
              "We'll notify you when a slot opens in your preferred time period"
            )}
          </Text>
        </>
      )}

      <View style={styles.optionsStack}>
        {timePeriodOptions.map((option) => {
          const selected = selectedPeriod === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              activeOpacity={disabled ? 1 : 0.88}
              disabled={disabled}
              onPress={() => !disabled && onSelectPeriod(option.value)}
              style={styles.cardTouchable}
            >
              <View
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
                {selected && (
                  <LinearGradient
                    colors={[`${colors.primary}22`, 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
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
                      colors={[colors.primary, colors.secondary]}
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
  cardTouchable: {
    borderRadius: 18,
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
});
