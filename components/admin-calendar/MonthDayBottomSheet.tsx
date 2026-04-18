import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  I18nManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  useBottomSheetSpringConfigs,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Appointment, BusinessConstraint } from '@/lib/supabase';
import { getPrimaryAsForegroundOnLightSurface } from '@/lib/colorContrast';

// ─── helpers ─────────────────────────────────────────────────────────────────

function _safeIntl(locale: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, opts);
  } catch {
    return null;
  }
}

function formatDateHeader(dateStr: string): { weekday: string; dayMonth: string } {
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3 || !parts[0]) return { weekday: '', dayMonth: dateStr };
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const weekdayFmt =
    _safeIntl('he-IL-u-ca-gregory', { weekday: 'long' }) ||
    _safeIntl('he-IL', { weekday: 'long' });
  const dayMonthFmt =
    _safeIntl('he-IL-u-ca-gregory', { day: 'numeric', month: 'long' }) ||
    _safeIntl('he-IL', { day: 'numeric', month: 'long' });
  const weekday = weekdayFmt?.format(d) ?? '';
  const dayMonth = dayMonthFmt?.format(d) ?? '';
  return { weekday, dayMonth };
}

function clientInitials(name?: string | null): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.[0] ?? '?').toUpperCase();
}

function addMinutesLocal(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Approximate heights for snap-point estimation
const HEADER_H = 128;   // drag handle + header section + divider + top padding
const CARD_H = 92;      // appointment card + marginBottom
const CONSTRAINT_H = 82;
const SECTION_LABEL_H = 32;
const SECTION_GAP_H = 20;
const EMPTY_H = 220;
const LOADING_H = 120;

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  date: string | null;
  appointments: Appointment[];
  constraints: BusinessConstraint[];
  loading: boolean;
  primaryColor: string;
  onDismiss: () => void;
  onAppointmentPress: (appt: Appointment) => void;
  formatTime: (time?: string | null) => string;
}

// ─── component ────────────────────────────────────────────────────────────────

export function MonthDayBottomSheet({
  date,
  appointments,
  constraints,
  loading,
  primaryColor,
  onDismiss,
  onAppointmentPress,
  formatTime,
}: Props) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const isRtl = I18nManager.isRTL;
  const screenHeight = Dimensions.get('window').height;

  const animationConfigs = useBottomSheetSpringConfigs({
    damping: 72,
    stiffness: 380,
    mass: 0.9,
    overshootClamping: false,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  });

  // ── snap point calculated from content ──────────────────────────────────────
  const snapPoints = useMemo(() => {
    const bottomPad = insets.bottom + 24;
    const maxH = screenHeight * 0.85;

    let contentH: number;
    if (loading) {
      contentH = LOADING_H;
    } else if (appointments.length === 0 && constraints.length === 0) {
      contentH = EMPTY_H;
    } else {
      contentH = 0;
      if (constraints.length > 0) {
        contentH += SECTION_LABEL_H + constraints.length * CONSTRAINT_H;
        if (appointments.length > 0) contentH += SECTION_GAP_H + SECTION_LABEL_H;
      }
      contentH += appointments.length * CARD_H;
    }

    const total = HEADER_H + contentH + bottomPad;
    return [Math.min(total, maxH)];
  }, [appointments.length, constraints.length, loading, insets.bottom, screenHeight]);

  // Max height for the inner ScrollView so the sheet never exceeds 85 %
  const scrollMaxH = useMemo(() => {
    const maxSheetH = screenHeight * 0.85;
    return maxSheetH - HEADER_H - insets.bottom - 24;
  }, [screenHeight, insets.bottom]);

  useEffect(() => {
    if (date) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [date]);

  // Re-snap when content changes (e.g. after data loads)
  useEffect(() => {
    if (date) {
      sheetRef.current?.snapToIndex(0);
    }
  }, [snapPoints, date]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const { weekday, dayMonth } = useMemo(
    () => (date ? formatDateHeader(date) : { weekday: '', dayMonth: '' }),
    [date],
  );

  const totalCount = appointments.length + constraints.length;
  const rowDir = isRtl ? 'row-reverse' : 'row';
  const primaryFg = useMemo(
    () => getPrimaryAsForegroundOnLightSurface(primaryColor, '#5F6368'),
    [primaryColor],
  );

  const renderBackdrop = useCallback(() => null, []);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onDismiss={handleDismiss}
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      handleIndicatorStyle={styles.dragHandle}
      backgroundStyle={styles.sheetBg}
      style={styles.sheetShadow}
    >
      <BottomSheetView style={styles.container}>
        {/* Fixed header */}
        <View style={[styles.header, { flexDirection: rowDir }]}>
          <View style={styles.headerTexts}>
            <Text style={[styles.weekday, { textAlign: isRtl ? 'right' : 'left' }]}>
              {weekday}
            </Text>
            <Text style={[styles.dayMonth, { textAlign: isRtl ? 'right' : 'left' }]}>
              {dayMonth}
            </Text>
          </View>
          {totalCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: primaryColor + '18' }]}>
              <Text style={[styles.countBadgeText, { color: primaryFg }]}>
                {totalCount} {totalCount === 1 ? 'תור' : 'תורים'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Scrollable content — regular ScrollView so BottomSheetView can measure correctly */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={primaryFg} size="large" />
          </View>
        ) : appointments.length === 0 && constraints.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIcon, { backgroundColor: primaryColor + '12' }]}>
              <Ionicons name="calendar-outline" size={32} color={primaryFg} />
            </View>
            <Text style={styles.emptyTitle}>אין תורים ביום זה</Text>
            <Text style={styles.emptySub}>לחצו על יום אחר כדי לראות תורים</Text>
          </View>
        ) : (
          <ScrollView
            style={{ maxHeight: scrollMaxH }}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {constraints.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { textAlign: isRtl ? 'right' : 'left' }]}>
                  זמנים חסומים
                </Text>
                {constraints.map((c) => (
                  <View key={`c-${c.id}`} style={styles.constraintCard}>
                    <View style={styles.constraintAccent} />
                    <View style={[styles.cardInner, { flexDirection: rowDir }]}>
                      <View style={styles.timeCol}>
                        <Text style={[styles.timeText, { color: '#C2410C' }]}>
                          {formatTime(String(c.start_time).slice(0, 5))}
                        </Text>
                        <Text style={[styles.timeSep, { color: '#C2410C' }]}>—</Text>
                        <Text style={[styles.timeText, { color: '#C2410C' }]}>
                          {formatTime(String(c.end_time).slice(0, 5))}
                        </Text>
                      </View>
                      <View style={styles.cardDividerV} />
                      <View style={styles.infoCol}>
                        <Text
                          style={[styles.clientName, { color: '#92400E', textAlign: isRtl ? 'right' : 'left' }]}
                          numberOfLines={2}
                        >
                          {c.reason?.trim() || 'זמן חסום'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
                {appointments.length > 0 && <View style={styles.sectionGap} />}
              </>
            )}

            {appointments.length > 0 && (
              <>
                {constraints.length > 0 && (
                  <Text style={[styles.sectionLabel, { textAlign: isRtl ? 'right' : 'left' }]}>
                    תורים
                  </Text>
                )}
                {appointments.map((appt) => {
                  const dur = appt.duration_minutes || 30;
                  const endTime = addMinutesLocal(appt.slot_time, dur);
                  const initials = clientInitials(appt.client_name);
                  return (
                    <Pressable
                      key={`a-${appt.id}`}
                      style={({ pressed }) => [styles.apptCard, pressed && styles.apptCardPressed]}
                      onPress={() => onAppointmentPress(appt)}
                    >
                      <View style={[styles.apptAccent, { backgroundColor: primaryColor }]} />
                      <View style={[styles.cardInner, { flexDirection: rowDir }]}>
                        <View style={styles.timeCol}>
                          <Text style={[styles.timeText, { color: primaryFg }]}>
                            {formatTime(appt.slot_time)}
                          </Text>
                          <Text style={[styles.timeSep, { color: primaryFg + 'AA' }]}>—</Text>
                          <Text style={[styles.timeText, { color: primaryFg }]}>
                            {formatTime(endTime)}
                          </Text>
                        </View>

                        <View style={styles.cardDividerV} />

                        <View style={styles.infoCol}>
                          <Text
                            style={[styles.clientName, { textAlign: isRtl ? 'right' : 'left' }]}
                            numberOfLines={1}
                          >
                            {appt.client_name || 'לקוח'}
                          </Text>
                          {appt.service_name ? (
                            <Text
                              style={[styles.serviceName, { textAlign: isRtl ? 'right' : 'left' }]}
                              numberOfLines={1}
                            >
                              {appt.service_name}
                            </Text>
                          ) : null}
                        </View>

                        <View style={[styles.avatar, { backgroundColor: primaryColor + '1A' }]}>
                          <Text style={[styles.avatarText, { color: primaryFg }]}>{initials}</Text>
                        </View>
                      </View>

                      {appt.status === 'confirmed' && (
                        <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
                      )}
                      {appt.status === 'pending' && (
                        <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: { elevation: 24 },
    }),
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginTop: 2,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  weekday: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.2,
    writingDirection: 'rtl',
  },
  dayMonth: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
    writingDirection: 'rtl',
    ...Platform.select({
      ios: { fontFamily: 'System' },
      android: { fontFamily: 'sans-serif-black' },
    }),
  },
  countBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginBottom: 16,
  },
  loadingBox: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
    writingDirection: 'rtl',
  },
  emptySub: {
    fontSize: 14,
    color: '#9CA3AF',
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  listContent: {
    paddingTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    writingDirection: 'rtl',
    marginBottom: 10,
  },
  sectionGap: {
    height: 20,
  },

  // Constraint card
  constraintCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(194,65,12,0.20)',
    minHeight: 72,
  },
  constraintAccent: {
    width: 4,
    backgroundColor: '#C2410C',
  },

  // Appointment card
  apptCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    minHeight: 80,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  apptCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  apptAccent: {
    width: 4,
  },

  // Shared card inner layout
  cardInner: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  cardDividerV: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: '#E5E7EB',
    marginVertical: 2,
  },
  timeCol: {
    alignItems: 'center',
    gap: 1,
    minWidth: 52,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  timeSep: {
    fontSize: 10,
    fontWeight: '600',
  },
  infoCol: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
  },
  clientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
    writingDirection: 'rtl',
  },
  serviceName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    writingDirection: 'rtl',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
  },
  statusDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
