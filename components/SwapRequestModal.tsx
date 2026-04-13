import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { swapRequestsApi } from '@/lib/api/swapRequests';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { formatDateToYMDLocal } from '@/lib/utils/localDate';
import type { Appointment } from '@/lib/supabase';

const PRIMARY = '#534AB7';
const INFO_BG   = '#EEEDFE';
const INFO_TEXT    = '#3C3489';

// ── ימי השבוע ללא שבת (RTL: א מופיע ראשון = ימין) ──────────────────────
const DAYS = [
  { label: 'א', dayIndex: 0 },
  { label: 'ב', dayIndex: 1 },
  { label: 'ג', dayIndex: 2 },
  { label: 'ד', dayIndex: 3 },
  { label: 'ה', dayIndex: 4 },
  { label: 'ו', dayIndex: 5 },
] as const;

/** Same period emojis + windows as `book-appointment/TimeSelection` + `time_period.range.*` */
const TIME_SLOTS = [
  { id: 'morning',   emoji: '☀️',  labelKey: 'time_period.morning',   rangeKey: 'time_period.range.morning',   from: '08:00', to: '12:00' },
  { id: 'afternoon', emoji: '🌤', labelKey: 'time_period.afternoon', rangeKey: 'time_period.range.afternoon', from: '12:00', to: '16:00' },
  { id: 'evening',   emoji: '🌙', labelKey: 'time_period.evening',   rangeKey: 'time_period.range.evening',   from: '16:00', to: '20:00' },
] as const;

interface SwapRequestModalProps {
  visible: boolean;
  appointment: Appointment | null;
  userPhone: string;
  userName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function datesForDayIndices(dayIndices: number[], horizonDays = 28): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: string[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (dayIndices.includes(d.getDay())) result.push(formatDateToYMDLocal(d));
  }
  return result;
}

function timeToMinutes(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

export default function SwapRequestModal({
  visible,
  appointment,
  userPhone,
  userName,
  onClose,
  onSuccess,
}: SwapRequestModalProps) {
  const { t, i18n } = useTranslation();
  const [selectedDays,  setSelectedDays]  = useState<number[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [isSaving,      setIsSaving]      = useState(false);

  const toggleDay  = useCallback((idx: number) =>
    setSelectedDays(p  => p.includes(idx) ? p.filter(d => d !== idx) : [...p, idx]), []);
  const toggleSlot = useCallback((id: string) =>
    setSelectedSlots(p => p.includes(id)  ? p.filter(s => s !== id)  : [...p, id]),  []);

  const resetState  = useCallback(() => { setSelectedDays([]); setSelectedSlots([]); }, []);
  const handleClose = useCallback(() => { resetState(); onClose(); }, [onClose, resetState]);

  const canSubmit = selectedDays.length > 0 && selectedSlots.length > 0;

  const handleSave = useCallback(async () => {
    if (!appointment || !canSubmit) return;

    const preferredDates = datesForDayIndices(selectedDays);
    if (preferredDates.length === 0) {
      Alert.alert(t('error.generic', 'שגיאה'), t('swap.noMatchingDates', 'לא נמצאו תאריכים קרובים'));
      return;
    }

    const active  = TIME_SLOTS.filter(s => selectedSlots.includes(s.id));
    const fromMin = Math.min(...active.map(s => timeToMinutes(s.from)));
    const toMin   = Math.max(...active.map(s => timeToMinutes(s.to)));
    const pad     = (n: number) =>
      `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

    setIsSaving(true);
    try {
      const result = await swapRequestsApi.createSwapRequest({
        appointmentId:           appointment.id,
        requesterPhone:          userPhone,
        requesterName:           userName,
        originalDate:            appointment.slot_date,
        originalTime:            appointment.slot_time,
        originalServiceName:     appointment.service_name,
        originalDurationMinutes: appointment.duration_minutes || 60,
        originalBarberId:        appointment.barber_id,
        preferredDates,
        preferredTimeFrom:       pad(fromMin),
        preferredTimeTo:         pad(toMin),
      });

      if (result) {
        Alert.alert(
          t('success.generic', 'הצלחה'),
          t('swap.requestCreated', 'בקשת ההחלפה נשלחה! נודיע לך כשנמצא מתאים.')
        );
        resetState();
        onSuccess();
      } else {
        Alert.alert(t('error.generic', 'שגיאה'), t('swap.createFailed', 'שליחת הבקשה נכשלה'));
      }
    } catch {
      Alert.alert(t('error.generic', 'שגיאה'), t('swap.createFailed', 'שליחת הבקשה נכשלה'));
    } finally {
      setIsSaving(false);
    }
  }, [appointment, canSubmit, selectedDays, selectedSlots, userPhone, userName, onSuccess, resetState, t]);

  if (!appointment) return null;

  const locale = i18n?.language?.startsWith('he') ? 'he-IL' : 'en-US';
  const formattedDate = new Date(appointment.slot_date).toLocaleDateString(locale as any, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={s.overlay}>

        {/*
          direction: 'rtl' על ה-sheet מאלץ את כל הילדים לפעול ב-RTL
          ללא תלות ב-I18nManager — זהו הפתרון הבטוח ביותר.
          עם direction:'rtl':
            flexDirection:'row' זורם מימין לשמאל
            alignItems:'flex-start' = מיישר לימין
            textAlign:'right' ← יש גם מפורשות
        */}
        <View style={s.sheet}>

          {/* ── Drag handle ── */}
          <View style={s.handle} />

          {/* ── Header ─────────────────────────────────────────────────────
              row + direction:rtl → ① כותרת = ימין  ② X = שמאל          */}
          <View style={s.header}>
            <Text style={s.title}>{t('swap.title', 'החלפת תור')}</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={s.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color="#636366" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {/* ── Appointment card — styled like clientNextCard on home screen ── */}
            <View style={s.apptCard}>

              {/* Header: date (RIGHT) + label (LEFT) */}
              <View style={s.apptCardHeader}>
                {/* ① first → RIGHT in RTL */}
                <Text style={s.apptCardDate}>{formattedDate}</Text>
                {/* ② second → LEFT in RTL */}
                <Text style={s.apptCardLabel}>{t('swap.yourAppointment', 'התור שלך')}</Text>
              </View>

              <View style={s.apptCardDivider} />

              {/* Body: [service+icon RIGHT] | [divider] | [time LEFT] */}
              <View style={s.apptCardBody}>

                {/* ① Service info — RIGHT side */}
                <View style={s.apptServiceRow}>
                  {/* icon bubble — first in row = rightmost */}
                  <View style={s.apptIconCircle}>
                    <LinearGradient
                      colors={[PRIMARY, `${PRIMARY}CC`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.apptIconGradient}
                    >
                      <Ionicons name="cut-outline" size={20} color="#FFF" />
                    </LinearGradient>
                  </View>
                  {/* text — second in row */}
                  <View style={s.apptTextCol}>
                    <Text style={s.apptServiceName} numberOfLines={2}>
                      {appointment.service_name || t('booking.field.service', 'שירות')}
                    </Text>
                    <View style={s.apptStatusRow}>
                      <View style={s.apptStatusDot} />
                      <Text style={s.apptStatusText}>{t('appointments.confirmed', 'מאושר')}</Text>
                    </View>
                  </View>
                </View>

                {/* ② Vertical divider */}
                <View style={[s.apptTimeDivider, { backgroundColor: `${PRIMARY}25` }]} />

                {/* ③ Time block — LEFT side */}
                <View style={s.apptTimeBlock}>
                  <Text style={[s.apptTimeHM, { color: PRIMARY }]}>
                    {formatTime12Hour(appointment.slot_time || '').split(' ')[0]}
                  </Text>
                  {formatTime12Hour(appointment.slot_time || '').split(' ')[1] ? (
                    <Text style={[s.apptTimeSuffix, { color: `${PRIMARY}99` }]}>
                      {formatTime12Hour(appointment.slot_time || '').split(' ')[1]}
                    </Text>
                  ) : null}
                </View>

              </View>
            </View>

            {/* ── Days — row + rtl → א=ימין … ו=שמאל ─────────────────────── */}
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionLabel}>{t('swap.selectDays', 'באילו ימים מתאים לך?')}</Text>
              {selectedDays.length > 0 && (
                <View style={s.countBadge}>
                  <Text style={s.countBadgeText}>{selectedDays.length}</Text>
                </View>
              )}
            </View>

            <View style={s.daysRow}>
              {DAYS.map(day => {
                const active = selectedDays.includes(day.dayIndex);
                return (
                  <TouchableOpacity
                    key={day.dayIndex}
                    style={[s.dayBtn, active && s.dayBtnActive]}
                    onPress={() => toggleDay(day.dayIndex)}
                    activeOpacity={0.72}
                  >
                    <Text style={[s.dayBtnText, active && s.dayBtnTextActive]}>
                      {day.label}
                    </Text>
                    {active && <View style={s.dayDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Divider ── */}
            <View style={s.divider} />

            {/* ── Time slots ──────────────────────────────────────────────── */}
            <Text style={s.sectionLabel}>{t('swap.selectTime', 'באיזה שעות?')}</Text>

            <View style={s.slotsRow}>
              {TIME_SLOTS.map(slot => {
                const active = selectedSlots.includes(slot.id);
                return (
                  <TouchableOpacity
                    key={slot.id}
                    style={[s.slotCube, active && s.slotCubeActive]}
                    onPress={() => toggleSlot(slot.id)}
                    activeOpacity={0.72}
                  >
                    <Text style={s.slotCubeEmoji}>{slot.emoji}</Text>
                    <Text
                      style={[s.slotCubeLabel, active && s.slotCubeLabelActive]}
                      numberOfLines={1}
                    >
                      {t(slot.labelKey as never)}
                    </Text>
                    <Text
                      style={[s.slotCubeRange, active && s.slotCubeRangeActive]}
                      numberOfLines={2}
                    >
                      {t(slot.rangeKey as never)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Info box ────────────────────────────────────────────────────
                row + rtl → ① text=ימין (flex:1)  ② icon=שמאל            */}
            <View style={s.infoBox}>
              <Text style={s.infoText}>
                {t(
                  'swap.infoText',
                  'כשנמצא לקוח עם תור מתאים, הוא מאשר את ההחלפה פעם אחת והתורים מתעדכנים. תקבל התראה עם הזמן החדש — בלי אישור נוסף ממך.'
                )}
              </Text>
              <Ionicons name="information-circle-outline" size={17} color={INFO_TEXT} style={s.infoIcon} />
            </View>

          </ScrollView>

          {/* ── Footer / CTA ── */}
          <View style={s.footer}>
            <TouchableOpacity
              style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
              onPress={handleSave}
              disabled={!canSubmit || isSaving}
              activeOpacity={0.84}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                /* row + rtl → ① text=ימין  ② icon=שמאל */
                <>
                  <Text style={[s.submitBtnText, !canSubmit && s.submitBtnTextDisabled]}>
                    {t('swap.submit', 'שלח בקשת החלפה')}
                  </Text>
                  <Ionicons
                    name="swap-horizontal"
                    size={18}
                    color={canSubmit ? '#FFF' : '#AEAEB2'}
                  />
                </>
              )}
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.50)',
    justifyContent: 'flex-end',
  },

  /* ─── direction:'rtl' כאן מפעיל RTL על כל הילדים ─────────────────────── */
  sheet: {
    direction: 'rtl' as any,
    backgroundColor: '#F8F8FC',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '92%',
    overflow: 'hidden',
  },

  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DCDCE0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 2,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.4,
    textAlign: 'right',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
  },

  // ── Appointment summary card (mirrors clientNextCard from home screen) ──
  apptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 22,
    ...Platform.select({
      ios: { shadowColor: '#1e253b', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 5 },
    }),
  },
  // Header — RTL row: ① date=RIGHT, ② label=LEFT
  apptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 11,
  },
  apptCardDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3C43',
    textAlign: 'right',
    flexShrink: 1,
  },
  apptCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: '#64748B',
    textAlign: 'left',
  },
  apptCardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  // Body — RTL row: ① serviceRow=RIGHT, ② timeDivider, ③ timeBlock=LEFT
  apptCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  // RTL row inside: ① iconCircle=RIGHT, ② textCol=LEFT
  apptServiceRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  apptIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    flexShrink: 0,
  },
  apptIconGradient: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptTextCol: {
    flex: 1,
    gap: 4,
  },
  apptServiceName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.3,
    textAlign: 'right',
  },
  apptStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'flex-start',
  },
  apptStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  apptStatusText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
  },
  apptTimeDivider: {
    width: 1.5,
    height: 44,
    borderRadius: 2,
    marginHorizontal: 4,
    flexShrink: 0,
  },
  apptTimeBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    flexShrink: 0,
    minWidth: 52,
  },
  apptTimeHM: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  apptTimeSuffix: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // ── Section header ───────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'right',
    marginBottom: 12,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginBottom: 12,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },

  // ── Days row ─────────────────────────────────────────────────────────────
  daysRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 22,
  },
  dayBtn: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DCDCE0',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dayBtnActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
    shadowColor: PRIMARY,
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  dayBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3C3C43',
  },
  dayBtnTextActive: {
    color: '#FFF',
  },
  dayDot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.70)',
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: 20,
  },

  // ── Time slots (one row — same cube feel as book-appointment TimeSelection grid) ──
  slotsRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 22,
    marginTop: 4,
  },
  slotCube: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 102,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.13,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  slotCubeActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY,
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
    }),
  },
  slotCubeEmoji: {
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 4,
  },
  slotCubeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  slotCubeLabelActive: {
    color: '#FFF',
  },
  slotCubeRange: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 13,
  },
  slotCubeRangeActive: {
    color: 'rgba(255,255,255,0.88)',
  },

  // ── Info box ──────────────────────────────────────────────────────────────
  infoBox: {
    flexDirection: 'row',
    backgroundColor: INFO_BG,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: INFO_TEXT,
    fontWeight: '500',
    textAlign: 'right',
  },
  infoIcon: {
    marginTop: 2,
    flexShrink: 0,
  },

  // ── Footer / CTA ──────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#FFF',
  },
  submitBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: '#E5E5EA',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.3,
    textAlign: 'right',
  },
  submitBtnTextDisabled: {
    color: '#AEAEB2',
  },
});
