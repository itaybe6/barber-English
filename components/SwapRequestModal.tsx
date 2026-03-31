import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { swapRequestsApi } from '@/lib/api/swapRequests';
import { toBcp47Locale } from '@/lib/i18nLocale';
import type { Appointment } from '@/lib/supabase';

interface SwapRequestModalProps {
  visible: boolean;
  appointment: Appointment | null;
  userPhone: string;
  userName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'dates' | 'times';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 – 21:00

export default function SwapRequestModal({
  visible,
  appointment,
  userPhone,
  userName,
  onClose,
  onSuccess,
}: SwapRequestModalProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useBusinessColors();
  const [step, setStep] = useState<Step>('dates');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [timeFrom, setTimeFrom] = useState<number>(7);
  const [timeTo, setTimeTo] = useState<number>(21);
  const [isSaving, setIsSaving] = useState(false);

  const appLocale = toBcp47Locale(i18n?.language);

  const upcomingDays = useMemo(() => {
    const days: { date: string; label: string; dayName: string }[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      if (appointment && dateStr === appointment.slot_date) continue;
      const dayName = d.toLocaleDateString(appLocale, { weekday: 'short' });
      const label = d.toLocaleDateString(appLocale, {
        day: 'numeric',
        month: 'short',
      });
      days.push({ date: dateStr, label, dayName });
    }
    return days;
  }, [appointment, appLocale]);

  const toggleDate = useCallback((date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  }, []);

  const resetState = useCallback(() => {
    setStep('dates');
    setSelectedDates([]);
    setTimeFrom(7);
    setTimeTo(21);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleSave = useCallback(async () => {
    if (!appointment) return;
    if (selectedDates.length === 0) {
      Alert.alert(t('error.generic'), t('swap.selectAtLeastOneDay', 'Please select at least one day'));
      return;
    }
    if (timeFrom >= timeTo) {
      Alert.alert(t('error.generic'), t('swap.invalidTimeRange', 'End time must be after start time'));
      return;
    }

    setIsSaving(true);
    try {
      const result = await swapRequestsApi.createSwapRequest({
        appointmentId: appointment.id,
        requesterPhone: userPhone,
        requesterName: userName,
        originalDate: appointment.slot_date,
        originalTime: appointment.slot_time,
        originalServiceName: appointment.service_name,
        originalDurationMinutes: appointment.duration_minutes || 60,
        originalBarberId: appointment.barber_id,
        preferredDates: selectedDates,
        preferredTimeFrom: `${String(timeFrom).padStart(2, '0')}:00`,
        preferredTimeTo: `${String(timeTo).padStart(2, '0')}:00`,
      });

      if (result) {
        Alert.alert(
          t('success.generic', 'Success'),
          t('swap.requestCreated', 'Your swap request has been created. We will notify you when a match is found!')
        );
        resetState();
        onSuccess();
      } else {
        Alert.alert(t('error.generic'), t('swap.createFailed', 'Failed to create swap request'));
      }
    } catch {
      Alert.alert(t('error.generic'), t('swap.createFailed', 'Failed to create swap request'));
    } finally {
      setIsSaving(false);
    }
  }, [appointment, selectedDates, timeFrom, timeTo, userPhone, userName, onSuccess, resetState, t]);

  if (!appointment) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color="#8E8E93" />
            </TouchableOpacity>
            <Text style={s.title}>{t('swap.title', 'Swap Appointment')}</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Current appointment summary */}
          <View style={[s.summaryCard, { borderColor: colors.primary + '30' }]}>
            <View style={s.summaryRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={s.summaryText}>
                {new Date(appointment.slot_date).toLocaleDateString(appLocale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
            </View>
            <View style={s.summaryRow}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={s.summaryText}>{appointment.slot_time}</Text>
            </View>
            {appointment.service_name && (
              <View style={s.summaryRow}>
                <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                <Text style={s.summaryText}>{appointment.service_name}</Text>
              </View>
            )}
          </View>

          {/* Steps indicator */}
          <View style={s.stepsRow}>
            <View style={[s.stepDot, step === 'dates' && { backgroundColor: colors.primary }]} />
            <View style={[s.stepLine, { backgroundColor: step === 'times' ? colors.primary : '#E5E5EA' }]} />
            <View style={[s.stepDot, step === 'times' && { backgroundColor: colors.primary }]} />
          </View>

          {step === 'dates' ? (
            <>
              <Text style={s.stepTitle}>
                {t('swap.selectDays', 'Which days work for you?')}
              </Text>
              <Text style={s.stepSubtitle}>
                {t('swap.selectDaysHint', 'Select the days you would like to swap to')}
              </Text>

              <ScrollView
                style={s.daysScroll}
                contentContainerStyle={s.daysGrid}
                showsVerticalScrollIndicator={false}
              >
                {upcomingDays.map((day) => {
                  const isSelected = selectedDates.includes(day.date);
                  return (
                    <TouchableOpacity
                      key={day.date}
                      style={[
                        s.dayChip,
                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => toggleDate(day.date)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          s.dayChipName,
                          isSelected && { color: '#FFF' },
                        ]}
                      >
                        {day.dayName}
                      </Text>
                      <Text
                        style={[
                          s.dayChipDate,
                          isSelected && { color: '#FFF' },
                        ]}
                      >
                        {day.label}
                      </Text>
                      {isSelected && (
                        <View style={s.dayCheckmark}>
                          <Ionicons name="checkmark" size={14} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  { backgroundColor: selectedDates.length > 0 ? colors.primary : '#CCC' },
                ]}
                disabled={selectedDates.length === 0}
                onPress={() => setStep('times')}
                activeOpacity={0.8}
              >
                <Text style={s.primaryBtnText}>
                  {t('next', 'Next')} ({selectedDates.length})
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.stepTitle}>
                {t('swap.selectTimeRange', 'What time range works?')}
              </Text>
              <Text style={s.stepSubtitle}>
                {t('swap.selectTimeRangeHint', 'Choose the hours you prefer for the swap')}
              </Text>

              <View style={s.timeSection}>
                <Text style={s.timeLabel}>{t('swap.from', 'From')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.hoursRow}
                >
                  {HOURS.map((h) => {
                    const isActive = h === timeFrom;
                    return (
                      <TouchableOpacity
                        key={`from-${h}`}
                        style={[
                          s.hourChip,
                          isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => {
                          setTimeFrom(h);
                          if (h >= timeTo) setTimeTo(Math.min(h + 1, 22));
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.hourText, isActive && { color: '#FFF' }]}>
                          {`${String(h).padStart(2, '0')}:00`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={s.timeSection}>
                <Text style={s.timeLabel}>{t('swap.to', 'To')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.hoursRow}
                >
                  {HOURS.filter((h) => h > timeFrom).map((h) => {
                    const isActive = h === timeTo;
                    return (
                      <TouchableOpacity
                        key={`to-${h}`}
                        style={[
                          s.hourChip,
                          isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => setTimeTo(h)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.hourText, isActive && { color: '#FFF' }]}>
                          {`${String(h).padStart(2, '0')}:00`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Selected range preview */}
              <View style={s.rangePreview}>
                <LinearGradient
                  colors={[colors.primary + '15', colors.primary + '08']}
                  style={s.rangePreviewGradient}
                >
                  <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
                  <Text style={[s.rangePreviewText, { color: colors.primary }]}>
                    {`${String(timeFrom).padStart(2, '0')}:00 — ${String(timeTo).padStart(2, '0')}:00`}
                  </Text>
                  <Text style={s.rangePreviewDays}>
                    {selectedDates.length} {t('swap.daysSelected', 'days selected')}
                  </Text>
                </LinearGradient>
              </View>

              <View style={s.bottomRow}>
                <TouchableOpacity
                  style={s.backBtn}
                  onPress={() => setStep('dates')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={18} color="#8E8E93" />
                  <Text style={s.backBtnText}>{t('back', 'Back')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSave}
                  disabled={isSaving}
                  activeOpacity={0.8}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#FFF" />
                      <Text style={s.saveBtnText}>{t('swap.submit', 'Submit Swap Request')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    gap: 8,
    backgroundColor: '#FAFAFA',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3C3C43',
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 0,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5E5EA',
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: '#E5E5EA',
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  stepSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 16,
  },
  daysScroll: {
    maxHeight: 260,
    marginBottom: 16,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dayChip: {
    width: 90,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFF',
    alignItems: 'center',
    position: 'relative',
  },
  dayChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  dayChipDate: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8E8E93',
  },
  dayCheckmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  timeSection: {
    marginBottom: 16,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3C3C43',
    marginBottom: 8,
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  hourChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFF',
  },
  hourText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  rangePreview: {
    marginBottom: 20,
  },
  rangePreviewGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  rangePreviewText: {
    fontSize: 16,
    fontWeight: '700',
  },
  rangePreviewDays: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8E8E93',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
