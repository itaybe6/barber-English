import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { AvailableTimeSlot } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

const SHEET_ANIM_MS = 320;

type Phase = 'confirm' | 'working' | 'success';

interface CancelAppointmentBottomSheetProps {
  visible: boolean;
  appointment: AvailableTimeSlot | null;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  formatDate: (dateString: string) => string;
  formatTime: (timeString: string) => string;
}

export default function CancelAppointmentBottomSheet({
  visible,
  appointment,
  onClose,
  onConfirm,
  formatDate,
  formatTime,
}: CancelAppointmentBottomSheetProps) {
  const { t } = useTranslation();
  const { colors } = useBusinessColors();
  const { height: winH } = useWindowDimensions();
  const rtl = I18nManager.isRTL;
  const textAlign = rtl ? ('right' as const) : ('left' as const);

  const [isMounted, setIsMounted] = useState(visible);
  const [phase, setPhase] = useState<Phase>('confirm');
  const [snapshot, setSnapshot] = useState<AvailableTimeSlot | null>(appointment);

  const sheetTranslateY = useSharedValue(winH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    setSnapshot(appointment);
    setPhase('confirm');
    setIsMounted(true);
  }, [appointment, visible]);

  useEffect(() => {
    if (!isMounted) return;

    if (visible) {
      sheetTranslateY.set(winH);
      backdropOpacity.set(0);

      const frame = requestAnimationFrame(() => {
        sheetTranslateY.set(
          withTiming(0, {
            duration: SHEET_ANIM_MS,
            easing: Easing.out(Easing.cubic),
          })
        );
        backdropOpacity.set(
          withTiming(1, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
          })
        );
      });

      return () => cancelAnimationFrame(frame);
    }

    sheetTranslateY.set(
      withTiming(winH, {
        duration: SHEET_ANIM_MS,
        easing: Easing.in(Easing.cubic),
      })
    );
    backdropOpacity.set(
      withTiming(0, {
        duration: SHEET_ANIM_MS,
        easing: Easing.in(Easing.cubic),
      })
    );

    const timer = setTimeout(() => {
      setIsMounted(false);
      setPhase('confirm');
      setSnapshot(null);
    }, SHEET_ANIM_MS);

    return () => clearTimeout(timer);
  }, [backdropOpacity, isMounted, sheetTranslateY, visible, winH]);

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.get(),
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.get() }],
  }));

  const dismiss = useCallback(() => {
    if (phase === 'working') return;
    onClose();
  }, [onClose, phase]);

  const handleConfirm = useCallback(async () => {
    setPhase('working');
    try {
      const ok = await onConfirm();
      if (ok) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          /* noop */
        }
        setPhase('success');
      } else {
        setPhase('confirm');
        Alert.alert(
          t('error.generic', 'Error'),
          t('appointments.cannotCancel.message', 'Unable to cancel the appointment. Please try again.')
        );
      }
    } catch {
      setPhase('confirm');
      Alert.alert(
        t('error.generic', 'Error'),
        t('appointments.cancelError', 'An error occurred while cancelling. Please try again.')
      );
    }
  }, [onConfirm, t]);

  const detailAppointment = snapshot ?? appointment;
  const serviceLabel = detailAppointment?.service_name || t('booking.field.service', 'Service');
  const dateLabel = detailAppointment?.slot_date ? formatDate(detailAppointment.slot_date) : '';
  const timeLabel = detailAppointment?.slot_time ? formatTime(detailAppointment.slot_time) : '';

  const confirmMessage = useMemo(() => {
    if (!detailAppointment) {
      return t('appointments.cancel.bottomSheetMessageShort', 'האם לבטל את התור?');
    }
    return t(
      'appointments.cancel.bottomSheetMessageShort',
      'האם לבטל את התור?',
      {
        service: serviceLabel,
        date: dateLabel,
      }
    );
  }, [dateLabel, detailAppointment, serviceLabel, t]);

  if (!isMounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.modalRoot} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={phase === 'confirm' ? dismiss : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            sheetAnimatedStyle,
            { backgroundColor: colors.background },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: `${colors.text}18` }]} />

          {phase === 'confirm' ? (
            <View style={styles.sheetContent}>
              <View style={[styles.headerRow, { flexDirection: rtl ? 'row' : 'row-reverse' }]}>
                <Pressable
                  onPress={dismiss}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.closeBtn,
                    {
                      backgroundColor: pressed ? `${colors.text}18` : `${colors.text}0D`,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('close')}
                >
                  <Ionicons name="close" size={22} color={colors.text} />
                </Pressable>

                <View style={styles.headerTextWrap}>
                  <Text style={[styles.title, { color: colors.text, textAlign }]}>
                    {t('appointments.cancel.title', 'Cancel Appointment')}
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign }]}>
                    {confirmMessage}
                  </Text>
                </View>
              </View>

              {detailAppointment ? (
                <View style={[styles.chipsWrap, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                  {dateLabel ? (
                    <View
                      style={[
                        styles.chip,
                        { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: `${colors.primary}10` },
                      ]}
                    >
                      <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                      <Text style={[styles.chipText, { color: colors.text }]}>{dateLabel}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.chipsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    {serviceLabel ? (
                      <View
                        style={[
                          styles.chip,
                          { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: 'rgba(255,59,48,0.08)' },
                        ]}
                      >
                        <Ionicons name="pricetag-outline" size={14} color="#FF3B30" />
                        <Text style={[styles.chipText, { color: colors.text }]}>{serviceLabel}</Text>
                      </View>
                    ) : null}

                    {timeLabel ? (
                      <View
                        style={[
                          styles.chip,
                          { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: `${colors.text}06` },
                        ]}
                      >
                        <Ionicons name="time-outline" size={14} color={colors.primary} />
                        <Text style={[styles.chipText, { color: colors.text }]}>{timeLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <View style={[styles.actionsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Pressable
                  onPress={dismiss}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.secondaryBtn,
                    {
                      borderColor: `${colors.text}18`,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('back', 'Back')}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                    {t('back', 'Back')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void handleConfirm()}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.primaryBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.92 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('confirm')}
                >
                  <Text style={styles.primaryBtnText}>{t('confirm')}</Text>
                </Pressable>
              </View>
            </View>
          ) : phase === 'working' ? (
            <View style={styles.phaseBlock}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.phaseText, { color: colors.textSecondary, textAlign }]}>
                {t('appointments.cancel.loading', 'מבטלים את התור…')}
              </Text>
            </View>
          ) : (
            <View style={styles.phaseBlock}>
              <Animated.View entering={ZoomIn.duration(380)}>
                <Ionicons name="checkmark-circle" size={76} color={colors.primary} />
              </Animated.View>
              <Animated.Text
                entering={FadeIn.duration(280)}
                style={[styles.successTitle, { color: colors.text, textAlign }]}
              >
                {t('appointments.clientCancelled.title', 'Appointment canceled')}
              </Animated.Text>
              <Animated.Text
                entering={FadeIn.delay(40).duration(280)}
                style={[styles.successSub, { color: colors.textSecondary, textAlign: 'center' }]}
              >
                {t(
                  'appointments.cancel.successSheetSub',
                  'התור בוטל בהצלחה. אפשר לקבוע תור חדש בכל זמן שתרצה.'
                )}
              </Animated.Text>
              <Animated.View entering={FadeIn.delay(80).duration(260)}>
                <Pressable
                  onPress={dismiss}
                  style={({ pressed }) => [
                    styles.successBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.92 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('booking.gotIt', 'Got it')}
                >
                  <Text style={styles.primaryBtnText}>{t('booking.gotIt', 'Got it')}</Text>
                </Pressable>
              </Animated.View>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  sheetContent: {
    width: '100%',
  },
  headerRow: {
    gap: 14,
    alignItems: 'flex-start',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  chipsWrap: {
    marginTop: 18,
    gap: 10,
  },
  chipsRow: {
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chip: {
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  actionsRow: {
    gap: 10,
    alignItems: 'stretch',
    marginTop: 22,
  },
  actionBtn: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryBtn: {
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  primaryBtn: {
    backgroundColor: '#FF3B30',
  },
  secondaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  phaseBlock: {
    minHeight: 280,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  phaseText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.35,
    lineHeight: 30,
    marginTop: 6,
  },
  successSub: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.1,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  successBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
});
