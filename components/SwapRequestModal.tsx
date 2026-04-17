import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  Pressable,
  I18nManager,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { swapRequestsApi } from '@/lib/api/swapRequests';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { formatDateToYMDLocal } from '@/lib/utils/localDate';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import type { Appointment } from '@/lib/supabase';

const SHEET_ANIM_MS = 320;
const DRAG_DISMISS_THRESHOLD = 80;
const DRAG_VELOCITY_THRESHOLD = 0.5;

const DAYS = [
  { label: 'א', dayIndex: 0 },
  { label: 'ב', dayIndex: 1 },
  { label: 'ג', dayIndex: 2 },
  { label: 'ד', dayIndex: 3 },
  { label: 'ה', dayIndex: 4 },
  { label: 'ו', dayIndex: 5 },
] as const;

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
  barberName?: string;
  barberImage?: string | null;
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

function nextOccurrenceForWeekday(dayIndex: number, horizonDays = 28): Date | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === dayIndex) return d;
  }
  return null;
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
  barberName,
  barberImage,
  onClose,
  onSuccess,
}: SwapRequestModalProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useBusinessColors();
  const { height: winH } = useWindowDimensions();
  const rtl = I18nManager.isRTL;

  const [selectedDays,  setSelectedDays]  = useState<number[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [isSaving,      setIsSaving]      = useState(false);
  const [isMounted,     setIsMounted]     = useState(visible);

  const sheetTranslateY = useSharedValue(winH);
  const backdropOpacity = useSharedValue(0);
  const panY            = useSharedValue(0);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleDay  = useCallback((idx: number) =>
    setSelectedDays(p  => p.includes(idx) ? p.filter(d => d !== idx) : [...p, idx]), []);
  const toggleSlot = useCallback((id: string) =>
    setSelectedSlots(p => p.includes(id)  ? p.filter(s => s !== id)  : [...p, id]),  []);

  const resetState  = useCallback(() => { setSelectedDays([]); setSelectedSlots([]); }, []);
  const handleClose = useCallback(() => { resetState(); onClose(); }, [onClose, resetState]);

  // ── Drag-to-dismiss via Gesture.Pan (native gesture system, not PanResponder) ──
  // runOnJS(true) keeps callbacks on JS thread — no worklet complexity needed.
  const panGesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY([0, 5])          // only activates on downward movement
    .failOffsetY([-5, 9999])        // cancel if user swipes up
    .onUpdate((e) => {
      if (e.translationY > 0) panY.set(e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DRAG_DISMISS_THRESHOLD || e.velocityY > 500) {
        panY.set(withTiming(0, { duration: 80 }));
        handleClose();
      } else {
        panY.set(withSpring(0, { damping: 20, stiffness: 300 }));
      }
    })
    .onFinalize(() => {
      panY.set(withSpring(0, { damping: 20, stiffness: 300 }));
    }),
  [panY, handleClose]);

  // ── Mount / unmount with animation ──────────────────────────────────────
  useEffect(() => {
    if (visible) {
      panY.set(0);
      setIsMounted(true);
    }
  }, [visible, panY]);

  useEffect(() => {
    if (!isMounted) return;

    if (visible) {
      sheetTranslateY.set(winH);
      backdropOpacity.set(0);
      const frame = requestAnimationFrame(() => {
        sheetTranslateY.set(withTiming(0,    { duration: SHEET_ANIM_MS, easing: Easing.out(Easing.cubic) }));
        backdropOpacity.set(withTiming(1,    { duration: 220,           easing: Easing.out(Easing.cubic) }));
      });
      return () => cancelAnimationFrame(frame);
    }

    sheetTranslateY.set(withTiming(winH, { duration: SHEET_ANIM_MS, easing: Easing.in(Easing.cubic) }));
    backdropOpacity.set(withTiming(0,    { duration: SHEET_ANIM_MS, easing: Easing.in(Easing.cubic) }));
    const timer = setTimeout(() => setIsMounted(false), SHEET_ANIM_MS);
    return () => clearTimeout(timer);
  }, [backdropOpacity, isMounted, sheetTranslateY, visible, winH]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.get() }));
  // Combine slide-in/out animation with live drag offset
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.get() + Math.max(0, panY.get()) }],
  }));

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

  // ── Locale helpers ───────────────────────────────────────────────────────
  const locale = i18n?.language?.startsWith('he') ? 'he-IL' : 'en-US';

  const nextDateLabelByDayIndex = useMemo(() => {
    const out: Record<number, string> = {};
    for (const { dayIndex } of DAYS) {
      const d = nextOccurrenceForWeekday(dayIndex);
      out[dayIndex] = d
        ? d.toLocaleDateString(locale as any, { day: 'numeric', month: 'numeric' })
        : '';
    }
    return out;
  }, [locale]);

  if (!isMounted || !appointment) return null;

  const formattedDate = new Date(appointment.slot_date).toLocaleDateString(locale as any, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const PRIMARY  = colors.primary;
  const INFO_BG  = `${PRIMARY}12`;
  const timeParts = formatTime12Hour(appointment.slot_time || '').split(' ');

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={s.modalRoot} pointerEvents="box-none">

        {/* ── Backdrop ── */}
        <Animated.View style={[s.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
        </Animated.View>

        {/* ── Sheet ── */}
        <Animated.View style={[s.sheet, sheetStyle]}>

          {/* ── Drag area: handle + header ── */}
          <GestureDetector gesture={panGesture}>
            <View>
              <View style={s.handleWrap}>
                <View style={s.handle} />
              </View>
              <View style={s.header}>
                <Text style={s.title}>{t('swap.title', 'החלפת תור')}</Text>
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            scrollEventThrottle={16}
          >

            {/* ── Appointment card — identical to home screen clientNextCard ── */}
            <View style={s.apptCard}>

              {/* Header: direction:ltr forces date LEFT, label RIGHT — same as home screen */}
              <View style={s.apptCardHeader}>
                <Text style={s.apptCardDate}>{formattedDate}</Text>
                <Text style={s.apptCardLabel}>{t('swap.yourAppointment', 'התור שלך')}</Text>
              </View>

              <View style={s.apptCardDivider} />

              {/* Body: [info RIGHT] | [divider] | [time LEFT] — 'row' in global RTL = right-to-left */}
              <View style={s.apptCardBody}>

                {/* Info side — first child in RTL row → rightmost */}
                <View style={s.apptInfo}>
                  {barberImage ? (
                    <Image
                      source={{ uri: barberImage }}
                      style={s.apptAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[s.apptAvatar, s.apptAvatarFallback]}>
                      <Ionicons name="person" size={22} color="#AAA" />
                    </View>
                  )}
                  <View style={s.apptTextCol}>
                    <Text style={s.apptServiceName} numberOfLines={1}>
                      {appointment.service_name || t('booking.field.service', 'שירות')}
                    </Text>
                    {barberName ? (
                      <Text style={s.apptBarberName} numberOfLines={1}>{barberName}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={[s.apptTimeDivider, { backgroundColor: `${PRIMARY}25` }]} />

                {/* Time — last child in RTL row → leftmost */}
                <View style={s.apptTimeBlock}>
                  <Text style={[s.apptTimeHM, { color: PRIMARY }]}>{timeParts[0]}</Text>
                  {timeParts[1] ? (
                    <Text style={[s.apptTimeSuffix, { color: `${PRIMARY}B3` }]}>{timeParts[1]}</Text>
                  ) : null}
                </View>

              </View>
            </View>

            {/* ── Days section ── */}
            <View style={s.sectionBlock}>
              {/* Title centered; badge on physical LEFT (direction:ltr row) */}
              <View style={s.sectionTitleRow}>
                <View style={s.sectionTitleSide}>
                  {selectedDays.length > 0 ? (
                    <View style={[s.countBadge, { backgroundColor: PRIMARY }]}>
                      <Text style={s.countBadgeText}>{selectedDays.length}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={s.sectionLabel}>{t('swap.selectDays', 'באילו ימים מתאים לך?')}</Text>
                <View style={s.sectionTitleSide} />
              </View>

              {/* Days grid — 'row' in global RTL → א first = rightmost */}
              <View style={s.daysRow}>
                {DAYS.map(day => {
                  const active   = selectedDays.includes(day.dayIndex);
                  const dateHint = nextDateLabelByDayIndex[day.dayIndex];
                  return (
                    <TouchableOpacity
                      key={day.dayIndex}
                      style={[
                        s.dayBtn,
                        active && [s.dayBtnActive, { backgroundColor: PRIMARY, borderColor: PRIMARY, shadowColor: PRIMARY }],
                      ]}
                      onPress={() => toggleDay(day.dayIndex)}
                      activeOpacity={0.72}
                    >
                      <Text style={[s.dayLetter, active && s.dayLetterActive]}>{day.label}</Text>
                      <Text style={[s.dayDate,   active && s.dayDateActive]}>{dateHint || '—'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={s.divider} />

            {/* ── Time slots ── */}
            <View style={s.sectionBlock}>
              <View style={s.sectionTitleRow}>
                <View style={s.sectionTitleSide} />
                <Text style={s.sectionLabel}>{t('swap.selectTime', 'באיזה שעות?')}</Text>
                <View style={s.sectionTitleSide} />
              </View>

              <View style={s.slotsRow}>
                {TIME_SLOTS.map(slot => {
                  const active = selectedSlots.includes(slot.id);
                  return (
                    <TouchableOpacity
                      key={slot.id}
                      style={[
                        s.slotCube,
                        active && [
                          s.slotCubeActive,
                          { backgroundColor: PRIMARY, borderColor: PRIMARY },
                          Platform.OS === 'ios'
                            ? { shadowColor: PRIMARY, shadowOpacity: 0.28, shadowRadius: 10 }
                            : { elevation: 5 },
                        ],
                      ]}
                      onPress={() => toggleSlot(slot.id)}
                      activeOpacity={0.72}
                    >
                      <Text style={s.slotEmoji}>{slot.emoji}</Text>
                      <Text style={[s.slotLabel, active && s.slotLabelActive]} numberOfLines={1}>
                        {t(slot.labelKey as never)}
                      </Text>
                      <Text style={[s.slotRange, active && s.slotRangeActive]} numberOfLines={2}>
                        {t(slot.rangeKey as never)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Info box ── */}
            <View style={[s.infoBox, { backgroundColor: INFO_BG }]}>
              <Ionicons
                name="information-circle-outline"
                size={17}
                color={PRIMARY}
                style={s.infoIcon}
              />
              <Text style={[s.infoText, { color: PRIMARY }]}>
                {t(
                  'swap.infoText',
                  'כשנמצא לקוח עם תור מתאים, הוא מאשר את ההחלפה פעם אחת והתורים מתעדכנים. תקבל התראה עם הזמן החדש — בלי אישור נוסף ממך.'
                )}
              </Text>
            </View>

          </ScrollView>

          {/* ── Footer / CTA ── */}
          <View style={s.footer}>
            <TouchableOpacity
              style={[
                s.submitBtn,
                { backgroundColor: canSubmit ? PRIMARY : '#E5E5EA', shadowColor: PRIMARY },
                !canSubmit && { shadowOpacity: 0, elevation: 0 },
              ]}
              onPress={handleSave}
              disabled={!canSubmit || isSaving}
              activeOpacity={0.84}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <View style={[s.submitBtnInner, { flexDirection: rtl ? 'row' : 'row-reverse' }]}>
                  <Text style={[s.submitBtnText, !canSubmit && s.submitBtnTextDisabled]}>
                    {t('swap.submit', 'שלח בקשת החלפה')}
                  </Text>
                  <Ionicons name="swap-horizontal" size={18} color={canSubmit ? '#FFF' : '#AEAEB2'} />
                </View>
              )}
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  sheet: {
    backgroundColor: '#F7F7FB',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    overflow: 'hidden',
  },

  // ── Drag handle ───────────────────────────────────────────────────────────
  handleWrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DCDCE0',
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.4,
    textAlign: 'center',
  },

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 0,
  },

  // ── Appointment card — mirrors home screen clientNextCard exactly ─────────
  apptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 20,
    ...Platform.select({
      ios:     { shadowColor: '#1e253b', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 9 },
    }),
  },
  // direction:'ltr' keeps date physically LEFT, label physically RIGHT —
  // matching clientNextHeader on the home screen (same trick used there).
  apptCardHeader: {
    flexDirection: 'row',
    direction: 'ltr' as any,
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
  },
  apptCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: '#64748B',
  },
  apptCardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  apptCardBody: {
    flexDirection: 'row',         // global RTL makes 'row' flow right-to-left
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  apptInfo: {
    flex: 1,
    flexDirection: 'row',         // global RTL: first child (avatar) on right
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  apptTextCol: {
    flex: 1,
    alignItems: 'flex-start',     // flex-start in RTL row = right side (towards start)
    gap: 3,
    minWidth: 0,
  },
  apptAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    flexShrink: 0,
  },
  apptAvatarFallback: {
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptServiceName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  apptBarberName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3C43',
    flexShrink: 1,
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
    minWidth: 60,
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

  // ── Section blocks ────────────────────────────────────────────────────────
  sectionBlock: {
    marginBottom: 20,
  },
  // direction:'ltr' + row → physical LEFT (badge) | CENTER (title) | RIGHT (spacer)
  // Title uses textAlign:'center' (ממורכז); row anchor is the physical left column.
  sectionTitleRow: {
    flexDirection: 'row',
    direction: 'ltr' as any,
    alignItems: 'center',
    width: '100%',
    marginBottom: 14,
  },
  sectionTitleSide: {
    width: 36,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },

  // ── Days ──────────────────────────────────────────────────────────────────
  // 'row' in global RTL → first day (א) rightmost, last day (ו) leftmost
  daysRow: {
    flexDirection: 'row',
    gap: 7,
  },
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    gap: 4,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  dayBtnActive: {
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  dayLetter: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  dayLetterActive: {
    color: '#FFFFFF',
  },
  dayDate: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.1,
  },
  dayDateActive: {
    color: 'rgba(255,255,255,0.78)',
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: 20,
  },

  // ── Time slot cubes ───────────────────────────────────────────────────────
  slotsRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 4,
  },
  slotCube: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    minHeight: 100,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  slotCubeActive: {
    borderWidth: 0,
  },
  slotEmoji: {
    fontSize: 22,
    lineHeight: 28,
    marginBottom: 5,
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  slotLabelActive: {
    color: '#FFF',
  },
  slotRange: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 14,
  },
  slotRangeActive: {
    color: 'rgba(255,255,255,0.85)',
  },

  // ── Info box ──────────────────────────────────────────────────────────────
  infoBox: {
    flexDirection: 'row',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
    gap: 9,
  },
  infoIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'right',
  },

  // ── Footer / CTA ──────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#FFFFFF',
  },
  submitBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnInner: {
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.3,
  },
  submitBtnTextDisabled: {
    color: '#AEAEB2',
  },
});
