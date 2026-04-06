import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  I18nManager,
} from 'react-native';
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
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

export interface ConfirmBookingSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  serviceName: string;
  serviceDuration: number;
  servicePrice: number;
  date: string;
  time: string;
  /** Extra services beyond the first (for multi-service) */
  extraServices?: Array<{ name: string; duration_minutes: number }>;
  totalDuration?: number;
  totalPrice?: number;
}

export default function ConfirmBookingSheet({
  visible,
  onClose,
  onConfirm,
  serviceName,
  serviceDuration,
  servicePrice,
  date,
  time,
  extraServices = [],
  totalDuration,
  totalPrice,
}: ConfirmBookingSheetProps) {
  const { t } = useTranslation();
  const { colors } = useBusinessColors();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => onClose(), [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
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

  const isRTL = I18nManager.isRTL;
  const allServices = [
    { name: serviceName, duration_minutes: serviceDuration },
    ...extraServices,
  ];
  const hasMultiple = allServices.length > 1;

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundComponent={sheetBg}
      handleIndicatorStyle={{ backgroundColor: `${colors.text}28`, width: 40 }}
      enablePanDownToClose
    >
      <BottomSheetView style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>

        {/* Header */}
        <View style={styles.header}>
          <LinearGradient
            colors={[`${colors.primary}30`, `${colors.primary}14`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerIcon}
          >
            <Ionicons name="calendar-outline" size={26} color={colors.primary} />
          </LinearGradient>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('booking.confirmTitle', 'אישור קביעת תור')}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {t('booking.confirmSubtitle', 'בדוק את הפרטים ואשר')}
          </Text>
        </View>

        {/* Details card */}
        <View style={[styles.card, { borderColor: `${colors.primary}14` }]}>

          {/* Services */}
          <View style={styles.cardRow}>
            <View style={[styles.cardIconBubble, { backgroundColor: `${colors.primary}12` }]}>
              <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>
                {hasMultiple ? t('booking.field.services', 'שירותים') : t('booking.field.service', 'שירות')}
              </Text>
              <View style={styles.serviceChips}>
                {allServices.map((svc, i) => (
                  <View
                    key={i}
                    style={[
                      styles.serviceChip,
                      {
                        borderColor: `${colors.primary}22`,
                        backgroundColor: `${colors.primary}0A`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.serviceChipName,
                        { color: colors.text, textAlign: isRTL ? 'right' : 'left' },
                      ]}
                      numberOfLines={2}
                    >
                      {svc.name}
                    </Text>
                    <View
                      style={[
                        styles.serviceChipDuration,
                        { backgroundColor: `${colors.primary}14` },
                      ]}
                    >
                      <Ionicons name="time-outline" size={11} color={colors.primary} />
                      <Text style={[styles.serviceChipDurationText, { color: colors.primary }]}>
                        {svc.duration_minutes} {t('booking.min', 'ד׳')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              {hasMultiple && (
                <View style={styles.totalsRow}>
                  <Text style={[styles.totalSummaryLabel, { color: colors.textSecondary }]}>
                    {t('booking.total', 'סה״כ')}
                  </Text>
                  <View
                    style={[
                      styles.summaryPill,
                      { backgroundColor: `${colors.primary}14` },
                    ]}
                  >
                    <Ionicons name="time-outline" size={11} color={colors.primary} />
                    <Text style={[styles.summaryPillText, { color: colors.primary }]}>
                      {totalDuration ?? 0} {t('booking.min', 'ד׳')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.summaryPill,
                      { backgroundColor: `${colors.primary}14` },
                    ]}
                  >
                    <Ionicons name="pricetag-outline" size={11} color={colors.primary} />
                    <Text style={[styles.summaryPillText, { color: colors.primary }]}>
                      ₪{totalPrice ?? 0}
                    </Text>
                  </View>
                </View>
              )}
              {!hasMultiple && servicePrice > 0 && (
                <View style={styles.totalsRow}>
                  <View
                    style={[
                      styles.summaryPill,
                      { backgroundColor: `${colors.primary}14` },
                    ]}
                  >
                    <Ionicons name="pricetag-outline" size={11} color={colors.primary} />
                    <Text style={[styles.summaryPillText, { color: colors.primary }]}>
                      ₪{servicePrice}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: `${colors.primary}10` }]} />

          {/* Date */}
          <View style={styles.cardRow}>
            <View style={[styles.cardIconBubble, { backgroundColor: `${colors.primary}12` }]}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>
                {t('booking.field.date', 'תאריך')}
              </Text>
              <Text style={[styles.cardValue, { color: colors.text }]}>{date}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: `${colors.primary}10` }]} />

          {/* Time */}
          <View style={styles.cardRow}>
            <View style={[styles.cardIconBubble, { backgroundColor: `${colors.primary}12` }]}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>
                {t('booking.field.time', 'שעה')}
              </Text>
              <Text style={[styles.cardValue, { color: colors.text }]}>{time}</Text>
            </View>
          </View>

        </View>

        {/* Actions — force LTR row so order matches screen left/right (sheet often ignores RTL flex) */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.btnConfirmTouch}
            onPress={onConfirm}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[colors.primary, colors.secondary || colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnConfirmGradient}
            >
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              <Text style={styles.btnConfirmText}>{t('confirm', 'אישור')}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnCancel, { borderColor: `${colors.text}18` }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnCancelText, { color: colors.textSecondary }]}>
              {t('cancel', 'ביטול')}
            </Text>
          </TouchableOpacity>
        </View>

      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
    gap: 6,
  },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
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
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardTextBlock: {
    flex: 1,
    gap: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'left',
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  serviceChips: {
    marginTop: 4,
    gap: 6,
    width: '100%',
    alignItems: 'flex-start',
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  serviceChipName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  serviceChipDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  serviceChipDurationText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.15,
  },
  totalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    maxWidth: '100%',
  },
  totalSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  summaryPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    direction: 'ltr',
  },
  btnCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  btnConfirmTouch: {
    flex: 2,
    borderRadius: 18,
    overflow: 'hidden',
  },
  btnConfirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 18,
  },
  btnConfirmText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
