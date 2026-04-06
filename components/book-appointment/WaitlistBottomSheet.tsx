import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  I18nManager,
  Modal,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
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
import BookingSuccessAnimatedOverlay, {
  type SuccessLine,
} from '@/components/book-appointment/BookingSuccessAnimatedOverlay';
import { isRtlLanguage, toBcp47Locale } from '@/lib/i18nLocale';
import { bidiIsolateLtrValue, bidiRtlLabelWithColon } from '@/lib/utils/rtlPunctuation';
import { getSelectableTimePeriodsForDate } from '@/lib/utils/waitlistTimePeriods';
import { formatWaitlistSuccessSubheadDate } from '@/lib/utils/formatWaitlistSuccessSubheadDate';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** After fullscreen waitlist success — e.g. go to client home */
  onWaitlistSuccessGotIt?: () => void;
  selectedDate: string;
  serviceName: string;
  barberId?: string;
}

const SNAP_POINTS = ['68%', '92%'];

export default function WaitlistBottomSheet({
  visible,
  onClose,
  onWaitlistSuccessGotIt,
  selectedDate,
  serviceName,
  barberId,
}: Props) {
  const { t, i18n } = useTranslation();
  const { colors } = useBusinessColors();
  const { user } = useAuthStore();
  const { addToWaitlist, isLoading, error } = useWaitlistStore();
  const insets = useSafeAreaInsets();

  const sheetRef = useRef<BottomSheetModal>(null);

  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAnimKey, setSuccessAnimKey] = useState(0);
  /** Snapshot so success copy stays valid if local state resets before the modal paints. */
  const [successSnapshot, setSuccessSnapshot] = useState<{
    period: TimePeriod;
    dateStr: string;
    service: string;
  } | null>(null);

  const allowedPeriods = useMemo(
    () => getSelectableTimePeriodsForDate(selectedDate),
    [selectedDate]
  );

  // Open / close in response to `visible` prop
  useEffect(() => {
    if (visible) {
      setSelectedPeriod(null);
      setShowSuccess(false);
      setSuccessSnapshot(null);
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (selectedPeriod && !allowedPeriods.includes(selectedPeriod)) {
      setSelectedPeriod(null);
    }
  }, [visible, allowedPeriods, selectedPeriod]);

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

  const successPeriodKey = useMemo(() => {
    const p = successSnapshot?.period ?? selectedPeriod;
    if (p === 'morning') return 'time_period.morning';
    if (p === 'afternoon') return 'time_period.afternoon';
    if (p === 'evening') return 'time_period.evening';
    if (p === 'any') return 'time_period.any';
    return '';
  }, [successSnapshot?.period, selectedPeriod]);

  const successLines = useMemo((): SuccessLine[] => {
    const dateStr = successSnapshot?.dateStr ?? selectedDate;
    const svc =
      successSnapshot?.service != null
        ? successSnapshot.service === 'General service' || !successSnapshot.service
          ? t('waitlist.anyService', 'Any available service')
          : successSnapshot.service
        : serviceDisplay;
    if (!showSuccess || !dateStr || !successPeriodKey) return [];
    const langRtl = isRtlLanguage(i18n?.language);
    const serviceLabel = t('booking.field.service', 'Service');
    const windowLabel = t('waitlist.preferredWindow', 'Preferred time');
    const periodName = t(successPeriodKey as never);
    const notifyRaw = t(
      'waitlist.successAnimatedNotify',
      "We'll let you know as soon as\na slot opens in the time you chose"
    );

    return [
      { variant: 'headline', text: t('waitlist.successAnimatedHeadline', "You're on the waitlist") },
      {
        variant: 'subheadline',
        text: t('waitlist.successForDateLine', 'לתאריך {{date}}', {
          date: formatWaitlistSuccessSubheadDate(dateStr, toBcp47Locale(i18n?.language)),
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
    showSuccess,
    successSnapshot,
    selectedDate,
    successPeriodKey,
    serviceDisplay,
    t,
    i18n?.language,
  ]);

  const handleSubmit = async () => {
    if (!selectedPeriod) {
      Alert.alert(
        t('error.generic', 'Error'),
        t('waitlist.selectPeriod', 'Please select a preferred time period')
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
        selectedPeriod,
        barberId || undefined
      );
      if (success) {
        setSuccessSnapshot({
          period: selectedPeriod,
          dateStr: selectedDate,
          service: serviceName || 'General service',
        });
        setSuccessAnimKey((k) => k + 1);
        setShowSuccess(true);
        try {
          sheetRef.current?.dismiss();
        } catch {}
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

  const isRTL = I18nManager.isRTL;

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
        snapPoints={SNAP_POINTS}
        index={0}
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        backgroundComponent={sheetBg}
        handleIndicatorStyle={{ backgroundColor: `${colors.text}30`, width: 40 }}
        enablePanDownToClose
        enableDynamicSizing={false}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t('waitlist.joinSheetTitle', 'הצטרפות לרשימת המתנה')}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {t('waitlist.joinSheetSubtitle', 'בחר חלון זמן מועדף')}
            </Text>
          </View>

          {/* Date + service info card */}
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.surface, borderColor: `${colors.primary}18` },
            ]}
          >
            {/* Date row */}
            <View style={styles.infoRow}>
              <View style={[styles.infoIconBubble, { backgroundColor: `${colors.primary}12` }]}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.infoTextBlock}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {t('booking.field.date', 'תאריך')}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {formatDate(selectedDate)}
                </Text>
              </View>
            </View>

            <View style={[styles.infoDivider, { backgroundColor: `${colors.primary}12` }]} />

            {/* Service row */}
            <View style={styles.infoRow}>
              <View style={[styles.infoIconBubble, { backgroundColor: `${colors.primary}12` }]}>
                <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.infoTextBlock}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {t('booking.field.service', 'שירות')}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {serviceDisplay}
                </Text>
              </View>
            </View>
          </View>

          {/* Time period selector — header hidden, shown inline */}
          <View style={styles.selectorWrap}>
            <TimePeriodSelector
              selectedPeriod={selectedPeriod}
              onSelectPeriod={setSelectedPeriod}
              disabled={isLoading}
              hideHeader
              allowedPeriods={allowedPeriods}
            />
          </View>

          {/* Submit button */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handleSubmit}
            disabled={isLoading || !selectedPeriod}
            style={styles.submitTouch}
          >
            <LinearGradient
              colors={
                selectedPeriod
                  ? [colors.primary, colors.secondary || colors.primary]
                  : ['#C7C7CC', '#AEAEB2']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              {isLoading ? (
                <Ionicons name="hourglass-outline" size={20} color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.submitText}>{t('waitlist.joinButton', 'הצטרף לרשימה')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Full-screen success — must use Modal so it appears above @gorhom/bottom-sheet portal */}
      <Modal
        visible={showSuccess}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={handleWaitlistSuccessDismiss}
      >
        {showSuccess ? (
          <BookingSuccessAnimatedOverlay
            key={successAnimKey}
            lines={successLines}
            rtl={isRTL}
            accentColor={colors.primary}
            centerMeta
            gotItLabel={t('booking.gotIt', 'הבנתי')}
            onDismiss={handleWaitlistSuccessDismiss}
          />
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
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
  infoCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  infoTextBlock: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'left',
    letterSpacing: 0.1,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  infoIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoDivider: {
    height: 1,
    marginHorizontal: -4,
  },
  selectorWrap: {
    marginTop: 8,
  },
  submitTouch: {
    marginTop: 16,
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
