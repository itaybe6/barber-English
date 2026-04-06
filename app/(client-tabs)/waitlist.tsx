import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  Pressable,
  I18nManager,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BookingSuccessAnimatedOverlay, {
  type SuccessLine,
} from '@/components/book-appointment/BookingSuccessAnimatedOverlay';
import TimePeriodSelector, { TimePeriod } from '@/components/TimePeriodSelector';
import { useWaitlistStore } from '@/stores/waitlistStore';
import { isRtlLanguage, toBcp47Locale } from '@/lib/i18nLocale';
import { bidiIsolateLtrValue, bidiRtlLabelWithColon } from '@/lib/utils/rtlPunctuation';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { getScrollContentPaddingBottomForFloatingClientTabBar } from '@/constants/clientTabBarInsets';
import { getSelectableTimePeriodsForDate } from '@/lib/utils/waitlistTimePeriods';
import { formatWaitlistSuccessSubheadDate } from '@/lib/utils/formatWaitlistSuccessSubheadDate';

export default function WaitlistScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams();
  const { serviceName = 'General service', selectedDate = '', barberId = '' } = params as {
    serviceName: string;
    selectedDate: string;
    barberId: string;
  };

  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod | null>(null);
  const [showWaitlistSuccessModal, setShowWaitlistSuccessModal] = useState(false);
  const [waitlistSuccessAnimKey, setWaitlistSuccessAnimKey] = useState(0);
  const { user } = useAuthStore();
  const { addToWaitlist, isLoading, error } = useWaitlistStore();
  const { colors } = useBusinessColors();
  const safeInsets = useSafeAreaInsets();
  const scrollBottomPad = getScrollContentPaddingBottomForFloatingClientTabBar(safeInsets.bottom);

  const isValidDate = Boolean(selectedDate && selectedDate !== '');
  const displayDate = isValidDate ? selectedDate : new Date().toISOString().split('T')[0];

  const allowedPeriods = useMemo(
    () => getSelectableTimePeriodsForDate(isValidDate ? selectedDate : ''),
    [isValidDate, selectedDate]
  );

  useEffect(() => {
    if (selectedPeriod && !allowedPeriods.includes(selectedPeriod)) {
      setSelectedPeriod(null);
    }
  }, [allowedPeriods, selectedPeriod]);

  const formatDate = useCallback(
    (dateString: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString).trim());
      const date = m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        : new Date(dateString);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString(toBcp47Locale(i18n?.language), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    },
    [i18n?.language]
  );

  const gradientTop = useMemo(
    () => [colors.surface, `${colors.primary}10`, `${colors.primary}06`] as const,
    [colors.primary, colors.surface]
  );

  const sheetTint = useMemo(
    () => [colors.surface, `${colors.primary}05`] as const,
    [colors.primary, colors.surface]
  );

  const backIcon = I18nManager.isRTL ? 'chevron-forward' : 'chevron-back';

  const handleAddToWaitlist = async () => {
    if (!selectedPeriod) {
      Alert.alert(t('error.generic', 'Error'), t('waitlist.selectPeriod', 'Please select a preferred time period'));
      return;
    }

    if (!user?.name || !user?.phone) {
      Alert.alert(t('error.generic', 'Error'), t('waitlist.userInfoMissing', 'User info is missing'));
      return;
    }

    if (!selectedDate || selectedDate === '') {
      Alert.alert(t('error.generic', 'Error'), t('waitlist.noDate', 'No date selected'));
      return;
    }

    try {
      const success = await addToWaitlist(
        user.name,
        user.phone,
        serviceName,
        selectedDate,
        selectedPeriod,
        barberId || undefined
      );

      if (success) {
        setWaitlistSuccessAnimKey((k) => k + 1);
        setShowWaitlistSuccessModal(true);
      } else {
        Alert.alert(t('error.generic', 'Error'), error || t('waitlist.addError', 'An error occurred while adding to the waitlist'));
      }
    } catch {
      Alert.alert(t('error.generic', 'Error'), t('waitlist.addError', 'An error occurred while adding to the waitlist'));
    }
  };

  const subtitleText =
    serviceName === 'General service'
      ? t('waitlist.noAppointmentsOnDate', 'No appointments available\non this date')
      : t('waitlist.noAppointmentsForServiceOnDate', 'No appointments available\nfor {{service}} on this date', {
          service: serviceName,
        });

  const serviceDisplay =
    serviceName === 'General service' ? t('waitlist.anyService', 'Any available service') : serviceName;

  const periodLabelKey =
    selectedPeriod === 'morning'
      ? 'time_period.morning'
      : selectedPeriod === 'afternoon'
        ? 'time_period.afternoon'
        : selectedPeriod === 'evening'
          ? 'time_period.evening'
          : selectedPeriod === 'any'
            ? 'time_period.any'
            : '';

  const waitlistSuccessLines = useMemo((): SuccessLine[] => {
    if (!showWaitlistSuccessModal || !selectedDate || !selectedPeriod || !periodLabelKey) {
      return [];
    }
    const svc =
      serviceName === 'General service' ? t('waitlist.anyService', 'Any available service') : serviceName;
    const langRtl = isRtlLanguage(i18n?.language);
    const serviceLabel = t('booking.field.service', 'Service');
    const windowLabel = t('waitlist.preferredWindow', 'Preferred time');
    const periodName = t(periodLabelKey as never);
    const notifyRaw = t(
      'waitlist.successAnimatedNotify',
      "We'll let you know as soon as\na slot opens in the time you chose"
    );
    return [
      {
        variant: 'headline',
        text: t('waitlist.successAnimatedHeadline', "You're on the waitlist"),
      },
      {
        variant: 'subheadline',
        text: t('waitlist.successForDateLine', 'לתאריך {{date}}', {
          date: formatWaitlistSuccessSubheadDate(selectedDate, toBcp47Locale(i18n?.language)),
        }),
      },
      {
        variant: 'detailLabel',
        text: langRtl ? bidiRtlLabelWithColon(serviceLabel) : `${serviceLabel}:`,
      },
      {
        variant: 'detailValue',
        text: langRtl ? bidiIsolateLtrValue(svc) : svc,
      },
      {
        variant: 'detailLabel',
        text: langRtl ? bidiRtlLabelWithColon(windowLabel) : `${windowLabel}:`,
      },
      {
        variant: 'detailValue',
        text: langRtl ? bidiIsolateLtrValue(periodName) : periodName,
      },
      {
        variant: 'emphasis',
        text: notifyRaw,
      },
    ];
  }, [
    showWaitlistSuccessModal,
    selectedDate,
    selectedPeriod,
    periodLabelKey,
    serviceName,
    t,
    i18n?.language,
  ]);

  const dismissWaitlistSuccess = () => {
    setShowWaitlistSuccessModal(false);
    router.replace('/(client-tabs)' as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top', 'bottom']}>
      <LinearGradient colors={[...gradientTop]} locations={[0, 0.45, 1]} style={styles.gradient}>
        {/* Decorative orbs */}
        <View pointerEvents="none" style={styles.decorWrap}>
          <View style={[styles.decorBlob, styles.decorBlobA, { backgroundColor: `${colors.primary}14` }]} />
          <View style={[styles.decorBlob, styles.decorBlobB, { backgroundColor: `${colors.primary}0C` }]} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(client-tabs)/book-appointment')}
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: pressed ? `${colors.text}10` : `${colors.text}08`,
                  borderColor: `${colors.text}12`,
                },
              ]}
            >
              <Ionicons name={backIcon} size={22} color={colors.text} />
            </Pressable>
            <View style={styles.heroTopSpacer} />
          </View>

          <View style={styles.heroIconOuter}>
            <LinearGradient
              colors={[`${colors.primary}35`, `${colors.primary}12`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconGradient}
            >
              <Ionicons name="notifications-outline" size={34} color={colors.primary} />
            </LinearGradient>
          </View>

          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('waitlist.title', 'Waitlist')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={3}>
            {subtitleText}
          </Text>
        </View>

        <LinearGradient colors={[...sheetTint]} style={styles.sheet}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPad }]}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.infoCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: `${colors.primary}18`,
                  shadowColor: colors.primary,
                },
              ]}
            >
              <View style={styles.infoHeaderRow}>
                <LinearGradient
                  colors={[`${colors.primary}28`, `${colors.primary}0D`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoHeaderIcon}
                >
                  <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                </LinearGradient>
                <Text style={[styles.infoTitle, { color: colors.text }]}>{t('waitlist.requestDetails', 'Request details')}</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: `${colors.text}0D` }]} />

              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: `${colors.primary}12` }]}>
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('booking.field.date', 'Date')}</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{formatDate(displayDate)}</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: `${colors.text}0D` }]} />

              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: `${colors.primary}12` }]}>
                  <Ionicons name="cut-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('booking.field.service', 'Service')}</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2}>
                    {serviceDisplay}
                  </Text>
                </View>
              </View>
            </View>

            <TimePeriodSelector
              selectedPeriod={selectedPeriod}
              onSelectPeriod={setSelectedPeriod}
              disabled={isLoading}
              allowedPeriods={allowedPeriods}
            />

            <View style={styles.footer}>
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={handleAddToWaitlist}
                disabled={!selectedPeriod || isLoading}
                style={styles.ctaTouchable}
              >
                {isLoading && selectedPeriod ? (
                  <LinearGradient
                    colors={[colors.primary, colors.secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.confirmButton, styles.confirmButtonActive]}
                  >
                    <View style={styles.buttonContent}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={styles.confirmButtonText}>{t('waitlist.adding', 'Adding to waitlist...')}</Text>
                    </View>
                  </LinearGradient>
                ) : selectedPeriod ? (
                  <LinearGradient
                    colors={[colors.primary, colors.secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.confirmButton, styles.confirmButtonActive]}
                  >
                    <View style={styles.buttonContent}>
                      <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                      <Text style={styles.confirmButtonText}>{t('waitlist.confirmAndSave', 'Confirm and save')}</Text>
                    </View>
                  </LinearGradient>
                ) : (
                  <View
                    style={[
                      styles.confirmButton,
                      styles.confirmButtonIdle,
                      { backgroundColor: `${colors.text}14`, borderColor: `${colors.text}10` },
                    ]}
                  >
                    <View style={styles.buttonContent}>
                      <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
                      <Text style={[styles.confirmButtonTextMuted, { color: colors.textSecondary }]}>
                        {t('waitlist.selectPeriodFirst', 'Select a time period first')}
                      </Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      </LinearGradient>

      {showWaitlistSuccessModal ? (
        <Modal
          visible={showWaitlistSuccessModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={dismissWaitlistSuccess}
        >
          <View style={{ flex: 1 }}>
            <BookingSuccessAnimatedOverlay
              key={waitlistSuccessAnimKey}
              lines={waitlistSuccessLines}
              rtl={isRtlLanguage(i18n?.language)}
              accentColor={colors.primary}
              centerMeta
              onDismiss={dismissWaitlistSuccess}
              gotItLabel={t('booking.gotIt', 'Got it')}
            />
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    writingDirection: 'ltr',
  },
  gradient: {
    flex: 1,
  },
  decorWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  decorBlob: {
    position: 'absolute',
    borderRadius: 999,
  },
  decorBlobA: {
    width: 220,
    height: 220,
    top: -40,
    end: -50,
  },
  decorBlobB: {
    width: 160,
    height: 160,
    top: 120,
    start: -60,
  },
  hero: {
    paddingHorizontal: 22,
    paddingBottom: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroTopSpacer: {
    flex: 1,
  },
  heroIconOuter: {
    alignSelf: 'center',
    marginBottom: 14,
    marginTop: 4,
  },
  heroIconGradient: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
      android: { elevation: 4 },
    }),
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  headerSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
    paddingHorizontal: 12,
    maxWidth: 320,
    alignSelf: 'center',
    opacity: 0.92,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 12,
    paddingTop: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    flexGrow: 1,
  },
  infoCard: {
    borderRadius: 22,
    padding: 20,
    marginTop: 18,
    marginBottom: 8,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: { elevation: 4 },
    }),
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 14,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    letterSpacing: -0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 14,
  },
  infoContent: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'left',
    opacity: 0.9,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'left',
    lineHeight: 22,
  },
  footer: {
    marginTop: 12,
    paddingTop: 8,
  },
  ctaTouchable: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  confirmButton: {
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
    borderWidth: 1,
  },
  confirmButtonActive: {
    borderColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  confirmButtonIdle: {},
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  confirmButtonTextMuted: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
