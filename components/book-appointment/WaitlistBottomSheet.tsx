import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useWaitlistStore } from '@/stores/waitlistStore';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import TimePeriodSelector, { TimePeriod } from '@/components/TimePeriodSelector';
import { isRtlLanguage, toBcp47Locale } from '@/lib/i18nLocale';
import { bidiIsolateLtrValue, bidiRtlLabelWithColon } from '@/lib/utils/rtlPunctuation';
import {
  getSelectableTimePeriodsForDate,
  type WaitlistDayWindow,
} from '@/lib/utils/waitlistTimePeriods';
import { formatWaitlistSuccessSubheadDate } from '@/lib/utils/formatWaitlistSuccessSubheadDate';

/** In-sheet success (same rhythm as `BookingSummarySheet` after booking). */
function WaitlistInlineSuccessView({
  primaryColor,
  textPrimary,
  textSecondary,
  headline,
  dateLine,
  serviceLabel,
  serviceValue,
  windowLabel,
  windowValue,
  notify,
  gotItLabel,
  onGotIt,
}: {
  primaryColor: string;
  textPrimary: string;
  textSecondary: string;
  headline: string;
  dateLine: string;
  serviceLabel: string;
  serviceValue: string;
  windowLabel: string;
  windowValue: string;
  notify: string;
  gotItLabel: string;
  onGotIt: () => void;
}) {
  const fade = useSharedValue(0);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    fade.value = withTiming(1, { duration: 300 });
    checkScale.value = withDelay(140, withSpring(1, { damping: 11, stiffness: 155 }));
  }, [fade, checkScale]);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <Animated.View style={[inlineSuccessStyles.root, rootStyle]}>
      <Animated.View style={[inlineSuccessStyles.checkWrap, checkStyle]}>
        <Ionicons name="checkmark-circle" size={72} color={primaryColor} />
      </Animated.View>
      <Text style={[inlineSuccessStyles.title, { color: primaryColor }]} maxFontSizeMultiplier={1.25}>
        {headline}
      </Text>
      <Text
        style={[inlineSuccessStyles.dateLine, { color: textSecondary }]}
        maxFontSizeMultiplier={1.2}
      >
        {dateLine}
      </Text>
      <View style={inlineSuccessStyles.meta}>
        <Text style={[inlineSuccessStyles.metaLabel, { color: textSecondary }]}>{serviceLabel}</Text>
        <Text style={[inlineSuccessStyles.metaValue, { color: textPrimary }]} numberOfLines={2}>
          {serviceValue}
        </Text>
        <View style={inlineSuccessStyles.divider} />
        <Text style={[inlineSuccessStyles.metaLabel, { color: textSecondary }]}>{windowLabel}</Text>
        <Text style={[inlineSuccessStyles.metaValue, { color: textPrimary }]} numberOfLines={2}>
          {windowValue}
        </Text>
      </View>
      <Text
        style={[inlineSuccessStyles.notify, { color: textSecondary }]}
        maxFontSizeMultiplier={1.15}
      >
        {notify}
      </Text>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onGotIt}
        style={[inlineSuccessStyles.gotItBtn, { backgroundColor: primaryColor }]}
        accessibilityRole="button"
        accessibilityLabel={gotItLabel}
      >
        <Text style={inlineSuccessStyles.gotItText}>{gotItLabel}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const inlineSuccessStyles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
    minHeight: 360,
    gap: 8,
  },
  checkWrap: {
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  dateLine: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
    marginBottom: 4,
  },
  meta: {
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    width: '100%',
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  divider: {
    width: 32,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 6,
  },
  notify: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
    paddingHorizontal: 8,
  },
  gotItBtn: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 36,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  gotItText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});

interface Props {
  visible: boolean;
  onClose: () => void;
  /** After in-sheet waitlist success — "Got it" — e.g. go to client home */
  onWaitlistSuccessGotIt?: () => void;
  selectedDate: string;
  serviceName: string;
  barberId?: string;
  /** Periods that already have available slots — excluded from the waitlist options. */
  unavailablePeriods?: TimePeriod[];
}

export default function WaitlistBottomSheet({
  visible,
  onClose,
  onWaitlistSuccessGotIt,
  selectedDate,
  serviceName,
  barberId,
  unavailablePeriods,
}: Props) {
  const { t, i18n } = useTranslation();
  const { colors } = useBusinessColors();
  const { user } = useAuthStore();
  const { addToWaitlist, isLoading, error } = useWaitlistStore();
  const insets = useSafeAreaInsets();

  const sheetRef = useRef<BottomSheetModal>(null);

  const [selectedWindows, setSelectedWindows] = useState<WaitlistDayWindow[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAnimKey, setSuccessAnimKey] = useState(0);
  /** Snapshot so success copy stays valid if local state resets before the modal paints. */
  const [successSnapshot, setSuccessSnapshot] = useState<{
    periods: WaitlistDayWindow[];
    dateStr: string;
    service: string;
  } | null>(null);

  const allowedPeriods = useMemo((): WaitlistDayWindow[] => {
    const base = getSelectableTimePeriodsForDate(selectedDate);
    if (!unavailablePeriods?.length) return base;
    return base.filter((p) => !unavailablePeriods.includes(p as TimePeriod));
  }, [selectedDate, unavailablePeriods]);

  // Open / close in response to `visible` prop
  useEffect(() => {
    if (visible) {
      setSelectedWindows([]);
      setShowSuccess(false);
      setSuccessSnapshot(null);
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setSelectedWindows((prev) => prev.filter((p) => allowedPeriods.includes(p)));
  }, [visible, allowedPeriods]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleWaitlistSuccessDismiss = useCallback(() => {
    setShowSuccess(false);
    setSuccessSnapshot(null);
    onClose();
    onWaitlistSuccessGotIt?.();
  }, [onClose, onWaitlistSuccessGotIt]);

  const formatDate = useCallback(
    (dateString: string) => {
      if (!dateString) return '';
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString).trim());
      const date = m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        : new Date(dateString);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString(toBcp47Locale(i18n?.language), {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    },
    [i18n?.language]
  );

  const serviceDisplay =
    serviceName === 'General service' || !serviceName
      ? t('waitlist.anyService', 'Any available service')
      : serviceName;

  const waitlistSuccessCopy = useMemo(() => {
    const dateStr = successSnapshot?.dateStr ?? selectedDate;
    const svc =
      successSnapshot?.service != null
        ? successSnapshot.service === 'General service' || !successSnapshot.service
          ? t('waitlist.anyService', 'Any available service')
          : successSnapshot.service
        : serviceDisplay;
    const periodsForCopy =
      successSnapshot?.periods?.length ? successSnapshot.periods : selectedWindows;
    if (!showSuccess || !successSnapshot || !dateStr || periodsForCopy.length === 0) return null;
    const langRtl = isRtlLanguage(i18n?.language);
    const serviceLabel = t('booking.field.service', 'Service');
    const windowLabel = t('waitlist.preferredWindow', 'Preferred time');
    const periodName = periodsForCopy.map((p) => t(`time_period.${p}` as never)).join(' · ');
    const notifyRaw = t(
      'waitlist.successAnimatedNotify',
      "We'll let you know as soon as\na slot opens in the time you chose"
    );
    return {
      headline: t('waitlist.successAnimatedHeadline', "You're on the waitlist"),
      dateLine: t('waitlist.successForDateLine', 'לתאריך {{date}}', {
        date: formatWaitlistSuccessSubheadDate(dateStr, toBcp47Locale(i18n?.language)),
      }),
      serviceLabel: langRtl ? bidiRtlLabelWithColon(serviceLabel) : `${serviceLabel}:`,
      serviceValue: langRtl ? bidiIsolateLtrValue(svc) : svc,
      windowLabel: langRtl ? bidiRtlLabelWithColon(windowLabel) : `${windowLabel}:`,
      windowValue: langRtl ? bidiIsolateLtrValue(periodName) : periodName,
      notify: notifyRaw,
    };
  }, [
    showSuccess,
    successSnapshot,
    selectedDate,
    selectedWindows,
    serviceDisplay,
    t,
    i18n?.language,
  ]);

  const handleSubmit = async () => {
    if (selectedWindows.length === 0) {
      Alert.alert(
        t('error.generic', 'Error'),
        t('waitlist.selectAtLeastOneWindow', 'Select at least one time window')
      );
      return;
    }
    if (!user?.name || !user?.phone) {
      Alert.alert(t('error.generic', 'Error'), t('waitlist.userInfoMissing', 'User info is missing'));
      return;
    }
    if (!selectedDate) {
      Alert.alert(t('error.generic', 'Error'), t('waitlist.noDate', 'No date selected'));
      return;
    }
    try {
      const success = await addToWaitlist(
        user.name,
        user.phone,
        serviceName || 'General service',
        selectedDate,
        selectedWindows,
        barberId || undefined
      );
      if (success) {
        setSuccessSnapshot({
          periods: [...selectedWindows],
          dateStr: selectedDate,
          service: serviceName || 'General service',
        });
        setSuccessAnimKey((k) => k + 1);
        setShowSuccess(true);
      } else {
        Alert.alert(
          t('error.generic', 'Error'),
          error || t('waitlist.addError', 'An error occurred while adding to the waitlist')
        );
      }
    } catch {
      Alert.alert(
        t('error.generic', 'Error'),
        t('waitlist.addError', 'An error occurred while adding to the waitlist')
      );
    }
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
        pressBehavior="close"
      />
    ),
    []
  );

  const sheetBg = useCallback(
    () => (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          },
        ]}
      />
    ),
    [colors.surface]
  );

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        backgroundComponent={sheetBg}
        handleIndicatorStyle={{ backgroundColor: `${colors.text}30`, width: 40 }}
        enablePanDownToClose={!showSuccess}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetView
          style={[styles.sheetBody, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}
        >
          {showSuccess && waitlistSuccessCopy ? (
            <WaitlistInlineSuccessView
              key={successAnimKey}
              primaryColor={colors.primary}
              textPrimary={colors.text}
              textSecondary={colors.textSecondary}
              headline={waitlistSuccessCopy.headline}
              dateLine={waitlistSuccessCopy.dateLine}
              serviceLabel={waitlistSuccessCopy.serviceLabel}
              serviceValue={waitlistSuccessCopy.serviceValue}
              windowLabel={waitlistSuccessCopy.windowLabel}
              windowValue={waitlistSuccessCopy.windowValue}
              notify={waitlistSuccessCopy.notify}
              gotItLabel={t('booking.gotIt', 'הבנתי')}
              onGotIt={handleWaitlistSuccessDismiss}
            />
          ) : (
            <>
              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                  {t('waitlist.joinSheetTitle', 'הצטרפות לרשימת המתנה')}
                </Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                  {t('waitlist.joinSheetSubtitleMulti', 'Choose one or more windows')}
                </Text>
              </View>

              {/* Date + service — compact primary chips */}
              <View style={styles.infoTagStack}>
                <View style={[styles.infoTag, { backgroundColor: colors.primary }]}>
                  <Text style={styles.infoTagText} maxFontSizeMultiplier={1.15}>
                    {formatDate(selectedDate)}
                  </Text>
                </View>
                <View style={[styles.infoTag, styles.infoTagService, { backgroundColor: colors.primary }]}>
                  <Text
                    style={styles.infoTagText}
                    numberOfLines={2}
                    maxFontSizeMultiplier={1.12}
                  >
                    {serviceDisplay}
                  </Text>
                </View>
              </View>

              {/* Time period selector — header hidden, shown inline */}
              <View style={styles.selectorWrap}>
                <TimePeriodSelector
                  multiSelect
                  selectedWindows={selectedWindows}
                  onChangeWindows={setSelectedWindows}
                  disabled={isLoading}
                  hideHeader
                  allowedPeriods={allowedPeriods}
                />
              </View>

              {/* Submit button */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSubmit}
                disabled={isLoading || selectedWindows.length === 0}
                style={styles.submitTouch}
              >
                <LinearGradient
                  colors={
                    selectedWindows.length > 0
                      ? [colors.primary, colors.secondary || colors.primary]
                      : ['#C7C7CC', '#AEAEB2']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {isLoading ? (
                    <>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={styles.submitText}>
                        {t('waitlist.joinButton', 'הצטרפות לרשימה')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.submitText}>
                        {t('waitlist.joinButton', 'הצטרפות לרשימה')}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 14,
    gap: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    opacity: 0.8,
  },
  infoTagStack: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    alignContent: 'center',
    gap: 8,
    marginBottom: 6,
    paddingVertical: 4,
  },
  infoTag: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  /** Long service names: cap width so chips stay “tag-sized”, wrap to 2 lines max */
  infoTagService: {
    maxWidth: '88%',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  infoTagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
    lineHeight: 16,
  },
  selectorWrap: {
    marginTop: 4,
  },
  submitTouch: {
    marginTop: 12,
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 18,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
