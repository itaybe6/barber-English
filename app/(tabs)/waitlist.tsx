import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  Linking,
  I18nManager,
  Platform,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { Phone, Trash2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import WaitlistClientCard from '@/components/WaitlistClientCard';
import { supabase, WaitlistEntry } from '@/lib/supabase';
import DaySelector from '@/components/DaySelector';
import AdminVerticalMonthCalendar from '@/components/book-appointment/games-calendar/AdminVerticalMonthCalendar';
import { useAuthStore } from '@/stores/authStore';
import { useColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { formatTimeFromDate } from '@/lib/utils/timeFormat';
import i18n from '@/src/config/i18n';
import { useAdminWaitlistCalendarView } from '@/contexts/AdminWaitlistCalendarViewContext';

const GC_HEADER_CHROME = '#F0F3F7';
const GC_SURFACE = '#FFFFFF';
const GC_PAGE_BG = '#F8F9FA';

function formatDateToLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStartOfWeekSunday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatWeekRangeLabel(anchorDate: Date, lang: string): string {
  const start = getStartOfWeekSunday(anchorDate);
  const end = addDays(start, 6);
  const isHe = lang.startsWith('he');
  try {
    const sameMonth =
      start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    if (sameMonth) {
      const my = new Intl.DateTimeFormat(isHe ? 'he-IL-u-ca-gregory' : 'en-US', {
        month: 'long',
        year: 'numeric',
      }).format(start);
      return `${start.getDate()}–${end.getDate()} ${my}`;
    }
    const fmt = new Intl.DateTimeFormat(isHe ? 'he-IL-u-ca-gregory' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  } catch {
    return `${formatDateToLocalString(start)} – ${formatDateToLocalString(end)}`;
  }
}

async function fetchWaitlistForRange(startDate: Date, endDate: Date, userId?: string): Promise<WaitlistEntry[]> {
  try {
    const startStr = formatDateToLocalString(startDate);
    const endStr = formatDateToLocalString(endDate);
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();

    let query = supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .gte('requested_date', startStr)
      .lte('requested_date', endStr)
      .eq('status', 'waiting');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query
      .order('requested_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching waitlist range:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchWaitlistForRange:', error);
    return [];
  }
}

async function updateWaitlistStatus(entryId: string, status: 'contacted' | 'booked' | 'cancelled'): Promise<boolean> {
  try {
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();

    const { error } = await supabase
      .from('waitlist_entries')
      .update({ status })
      .eq('business_id', businessId)
      .eq('id', entryId);

    if (error) {
      console.error('Error updating waitlist status:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateWaitlistStatus:', error);
    return false;
  }
}

async function deleteWaitlistEntry(entryId: string): Promise<boolean> {
  try {
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();

    const { error } = await supabase
      .from('waitlist_entries')
      .delete()
      .eq('business_id', businessId)
      .eq('id', entryId);

    if (error) {
      console.error('Error deleting waitlist entry:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWaitlistEntry:', error);
    return false;
  }
}

async function makePhoneCall(phoneNumber: string) {
  try {
    const url = `tel:${phoneNumber}`;
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(i18n.t('error.generic', 'Error'), i18n.t('common.phoneOpenFailed', 'Unable to open the dialer on this device'));
    }
  } catch (error) {
    console.error('Error making phone call:', error);
    Alert.alert(i18n.t('error.generic', 'Error'), i18n.t('common.tryAgain', 'An error occurred. Please try again.'));
  }
}

function formatTimePreference(period?: 'morning' | 'afternoon' | 'evening' | 'any'): string {
  switch (period) {
    case 'morning':
      return i18n.t('time_period.morning', 'Morning');
    case 'afternoon':
      return i18n.t('time_period.afternoon', 'Afternoon');
    case 'evening':
      return i18n.t('time_period.evening', 'Evening');
    case 'any':
      return i18n.t('time_period.any', 'Any time');
    default:
      return '';
  }
}

async function fetchImagesForPhones(phones: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const { data: users, error: usersError } = await supabase.from('users').select('phone, image_url').in('phone', phones);
    if (!usersError && Array.isArray(users)) {
      users.forEach((u: any) => {
        if (u?.phone && u?.image_url) {
          map[u.phone] = u.image_url as string;
        }
      });
    }
  } catch {
    /* ignore */
  }
  return map;
}

export default function WaitlistScreen() {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [phoneToImage, setPhoneToImage] = useState<Record<string, string>>({});
  const { user } = useAuthStore();
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { waitlistCalendarView } = useAdminWaitlistCalendarView();
  const isRtl = I18nManager.isRTL;

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [visibleMonth, setVisibleMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const selectedDateKey = useMemo(() => formatDateToLocalString(selectedDate), [selectedDate]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (waitlistCalendarView === 'month') {
      const start = new Date(visibleMonth.y, visibleMonth.m, 1);
      const end = new Date(visibleMonth.y, visibleMonth.m + 1, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      return { rangeStart: start, rangeEnd: end };
    }
    const wkStart = getStartOfWeekSunday(selectedDate);
    const wkEnd = addDays(wkStart, 6);
    return { rangeStart: wkStart, rangeEnd: wkEnd };
  }, [waitlistCalendarView, selectedDate, visibleMonth]);

  const fetchRangeKey = useMemo(
    () => `${formatDateToLocalString(rangeStart)}_${formatDateToLocalString(rangeEnd)}`,
    [rangeStart, rangeEnd]
  );

  const loadWaitlistRange = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWaitlistForRange(rangeStart, rangeEnd, user?.id);
      setWaitlist(data);
      const uniquePhones = Array.from(new Set((data || []).map((e) => e.client_phone).filter(Boolean)));
      if (uniquePhones.length > 0) {
        const imagesMap = await fetchImagesForPhones(uniquePhones);
        setPhoneToImage(imagesMap);
      } else {
        setPhoneToImage({});
      }
    } catch (error) {
      console.error('Error loading waitlist:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.waitlist.loadFailed', 'Could not load the waitlist'));
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd, user?.id, t]);

  useEffect(() => {
    void loadWaitlistRange();
  }, [fetchRangeKey, user?.id, loadWaitlistRange]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchWaitlistForRange(rangeStart, rangeEnd, user?.id);
      setWaitlist(data);
      const uniquePhones = Array.from(new Set((data || []).map((e) => e.client_phone).filter(Boolean)));
      if (uniquePhones.length > 0) {
        const imagesMap = await fetchImagesForPhones(uniquePhones);
        setPhoneToImage(imagesMap);
      } else {
        setPhoneToImage({});
      }
    } finally {
      setRefreshing(false);
    }
  }, [rangeStart, rangeEnd, user?.id]);

  const handleCallClient = async (phoneNumber: string) => {
    Alert.alert(t('admin.waitlist.contact', 'Contact'), t('admin.waitlist.callPrompt', 'Would you like to call this client?'), [
      { text: t('cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('admin.waitlist.call', 'Call'),
        onPress: () => makePhoneCall(phoneNumber),
      },
    ]);
  };

  const handleDelete = async (entryId: string) => {
    Alert.alert(t('admin.waitlist.deleteTitle', 'Delete entry'), t('admin.waitlist.deleteConfirm', 'Are you sure?'), [
      { text: t('cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('settings.services.delete', 'Delete'),
        style: 'destructive',
        onPress: async () => {
          const success = await deleteWaitlistEntry(entryId);
          if (success) {
            void loadWaitlistRange();
            Alert.alert(t('admin.waitlist.deleted', 'Deleted'), t('admin.waitlist.deleteSuccess', 'Entry deleted'));
          } else {
            Alert.alert(t('error.generic', 'Error'), t('admin.waitlist.deleteFailed', 'Delete failed'));
          }
        },
      },
    ]);
  };

  const waitlistByDate: Record<string, WaitlistEntry[]> = useMemo(() => {
    const map: Record<string, WaitlistEntry[]> = {};
    for (const entry of waitlist) {
      const key = entry.requested_date;
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    }
    return map;
  }, [waitlist]);

  const markedDates = useMemo(() => new Set(Object.keys(waitlistByDate)), [waitlistByDate]);

  const waitlistCountsByDate = useMemo(() => {
    const r: Record<string, number> = {};
    for (const e of waitlist) {
      r[e.requested_date] = (r[e.requested_date] || 0) + 1;
    }
    return r;
  }, [waitlist]);

  const selectedDayEntries = useMemo(() => waitlistByDate[selectedDateKey] || [], [waitlistByDate, selectedDateKey]);

  const weekDayKeys = useMemo(() => {
    const start = getStartOfWeekSunday(selectedDate);
    return Array.from({ length: 7 }, (_, i) => formatDateToLocalString(addDays(start, i)));
  }, [selectedDate]);

  const headerSubtitle = useMemo(() => {
    if (waitlistCalendarView === 'day') return t('admin.waitlist.subtitleDay', 'Daily — pick a day');
    if (waitlistCalendarView === 'week') return t('admin.waitlist.subtitleWeek', 'Weekly — all days in this week');
    return t('admin.waitlist.subtitleMonth', 'Monthly — tap a day, list below');
  }, [waitlistCalendarView, t]);

  const headerBadgeText = useMemo(() => {
    const loc = i18n.language?.startsWith('he') ? 'he-IL' : 'en-US';
    if (waitlistCalendarView === 'month') {
      const d = new Date(visibleMonth.y, visibleMonth.m, 1);
      return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
    }
    if (waitlistCalendarView === 'week') {
      return formatWeekRangeLabel(selectedDate, i18n.language || 'en');
    }
    return selectedDate.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  }, [waitlistCalendarView, visibleMonth, selectedDate, i18n.language]);

  const selectedDateLineLabel = useMemo(() => {
    const loc = i18n.language?.startsWith('he') ? 'he-IL-u-ca-gregory' : 'en-US';
    try {
      return selectedDate.toLocaleDateString(loc, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return selectedDateKey;
    }
  }, [selectedDate, selectedDateKey, i18n.language]);

  const calendarPrimary = colors.primary || '#1A73E8';
  const calendarRipple = `${calendarPrimary}2A`;

  const adminMonthAnchorKey = useMemo(() => `${visibleMonth.y}-${visibleMonth.m}`, [visibleMonth]);

  const onWaitlistMonthVisible = useCallback((monthFirstDay: Date) => {
    const y = monthFirstDay.getFullYear();
    const m = monthFirstDay.getMonth();
    setVisibleMonth({ y, m });
    setSelectedDate((prev) => {
      const lastD = new Date(y, m + 1, 0).getDate();
      const day = Math.min(prev.getDate(), lastD);
      const d = new Date(y, m, day);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }, []);

  const onWaitlistDayPress = useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  }, []);

  const onJumpToDate = useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setVisibleMonth({ y: d.getFullYear(), m: d.getMonth() });
  }, []);

  const formatCountBadge = useCallback(
    (c: number) =>
      c === 1
        ? String(t('admin.waitlist.countPillSingle', '1 on waitlist'))
        : String(t('admin.waitlist.countPill', '{{count}} on waitlist', { count: c })),
    [t]
  );

  const renderEntryCard = (entry: WaitlistEntry) => {
    const baseTime = entry.created_at ? formatTimeFromDate(new Date(entry.created_at)) : '--:--';
    const pref = formatTimePreference(entry.time_period);
    const time = pref ? `${baseTime} | ${pref}` : baseTime;
    return (
      <View style={styles.waitlistCard}>
        <WaitlistClientCard
          name={entry.client_name}
          image={phoneToImage[entry.client_phone] || ''}
          time={time}
          type={entry.service_name}
          tag={t('admin.waitlist.waiting', 'Waiting')}
        />
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.callButton, { borderColor: colors.primary }]}
            onPress={() => handleCallClient(entry.client_phone)}
          >
            <Phone size={16} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>{t('admin.waitlist.contact', 'Contact')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(entry.id)}>
            <Trash2 size={16} color="#FF3B30" />
            <Text style={[styles.actionButtonText, { color: '#FF3B30' }]}>{t('settings.services.delete', 'Delete')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const hasAnyInWeek = useMemo(
    () => weekDayKeys.some((k) => (waitlistByDate[k]?.length ?? 0) > 0),
    [weekDayKeys, waitlistByDate]
  );

  const listBody = loading ? (
    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
  ) : waitlistCalendarView === 'week' ? (
    hasAnyInWeek ? (
      <View style={styles.cardsContainer}>
        {weekDayKeys.map((dayKey) => {
          const entries = waitlistByDate[dayKey] || [];
          if (entries.length === 0) return null;
          const [yy, mm, dd] = dayKey.split('-').map((x) => parseInt(x, 10));
          const d = new Date(yy, mm - 1, dd);
          const loc = i18n.language?.startsWith('he') ? 'he-IL-u-ca-gregory' : 'en-US';
          let sectionTitle = dayKey;
          try {
            sectionTitle = d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'short' });
          } catch {
            /* keep key */
          }
          return (
            <View key={dayKey} style={styles.weekSection}>
              <Text style={styles.weekSectionTitle}>{sectionTitle}</Text>
              {entries.map((e) => (
                <React.Fragment key={e.id}>{renderEntryCard(e)}</React.Fragment>
              ))}
            </View>
          );
        })}
      </View>
    ) : (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="hourglass-outline" size={22} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{t('admin.waitlist.emptyWeekTitle', 'No waitlist this week')}</Text>
        <Text style={styles.emptySubtitle}>{t('admin.waitlist.emptyWeekSubtitle', 'No clients are waiting in this date range')}</Text>
      </View>
    )
  ) : selectedDayEntries.length > 0 ? (
    <View style={styles.cardsContainer}>
      {selectedDayEntries.map((e) => (
        <React.Fragment key={e.id}>{renderEntryCard(e)}</React.Fragment>
      ))}
    </View>
  ) : (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="hourglass-outline" size={22} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{t('admin.waitlist.emptyTitle', 'No waitlist entries for this day')}</Text>
      <Text style={styles.emptySubtitle}>{t('admin.waitlist.emptySubtitle', 'No clients are waiting for this day')}</Text>
    </View>
  );

  const listScroll = (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { padding: 16, paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[calendarPrimary]} tintColor={calendarPrimary} />
      }
    >
      {waitlistCalendarView === 'month' && !loading ? (
        <Text style={styles.monthListHint}>
          {t('admin.waitlist.monthSelectedDay', 'Selected: {{date}}', { date: selectedDateLineLabel })}
        </Text>
      ) : null}
      {listBody}
    </ScrollView>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: '#fff', marginTop: 8 }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.headerLikeAppointments}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleColumn}>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>{t('admin.waitlist.title', 'Waitlist')}</Text>
            <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
          </View>
          <View style={styles.monthBadge}>
            <Text style={styles.monthText} numberOfLines={2}>
              {headerBadgeText}
            </Text>
          </View>
        </View>
      </View>

      {waitlistCalendarView === 'day' ? (
        <View style={{ paddingTop: insets.top, backgroundColor: GC_HEADER_CHROME }}>
          <DaySelector
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            daysToShow={7}
            mode="week"
            startFromToday={false}
            markedDates={markedDates}
            containerBackgroundColor={GC_HEADER_CHROME}
          />
        </View>
      ) : null}

      {waitlistCalendarView === 'week' ? (
        <View style={[styles.gcTopChrome, { paddingTop: insets.top }]}>
          <View style={styles.gcHeader}>
            <View style={[styles.gcNavTrack, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={String(t('admin.appointments.navPrev', 'Previous'))}
                onPress={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 7);
                  d.setHours(0, 0, 0, 0);
                  setSelectedDate(getStartOfWeekSunday(d));
                }}
                android_ripple={{ color: calendarRipple, borderless: false }}
                style={({ pressed }) => [
                  styles.gcNavCircleBtn,
                  Platform.OS === 'ios' && pressed && styles.gcNavCircleBtnPressedIos,
                ]}
              >
                <ChevronRight size={22} color={calendarPrimary} strokeWidth={2.5} />
              </Pressable>
              <View style={styles.gcMonthTitleWrap} pointerEvents="none">
                <Text style={styles.gcMonthTitle} numberOfLines={1}>
                  {formatWeekRangeLabel(selectedDate, i18n.language || 'en')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={String(t('admin.appointments.navNext', 'Next'))}
                onPress={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 7);
                  d.setHours(0, 0, 0, 0);
                  setSelectedDate(getStartOfWeekSunday(d));
                }}
                android_ripple={{ color: calendarRipple, borderless: false }}
                style={({ pressed }) => [
                  styles.gcNavCircleBtn,
                  Platform.OS === 'ios' && pressed && styles.gcNavCircleBtnPressedIos,
                ]}
              >
                <ChevronLeft size={22} color={calendarPrimary} strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {waitlistCalendarView === 'month' ? (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <View style={{ flex: 1, minHeight: 200 }}>
            <AdminVerticalMonthCalendar
              dayAvailability={waitlistCountsByDate}
              selectedDate={selectedDate}
              language={typeof i18n.language === 'string' && i18n.language.startsWith('he') ? 'he' : 'en'}
              primaryColor={calendarPrimary}
              anchorMonthKey={adminMonthAnchorKey}
              onVisibleMonthChange={onWaitlistMonthVisible}
              onDayPress={onWaitlistDayPress}
              onJumpToDate={onJumpToDate}
              refreshing={refreshing}
              onRefresh={onRefresh}
              todayLabel={t('admin.calendar.today', 'Today')}
              monthHint={t('admin.waitlist.monthCalendarHint', 'Numbers show how many clients are on the waitlist that day. Tap a day to see them below.')}
              formatCountBadge={formatCountBadge}
            />
          </View>
          <View style={[styles.waitlistBg, styles.waitlistBgMonthSplit]}>{listScroll}</View>
        </View>
      ) : (
        <View style={[styles.waitlistBg, { marginTop: 0, paddingTop: 12 }]}>{listScroll}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerLikeAppointments: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'stretch',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleColumn: {
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  monthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    maxWidth: '46%',
  },
  monthText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  gcTopChrome: {
    backgroundColor: GC_HEADER_CHROME,
  },
  gcHeader: {
    backgroundColor: GC_HEADER_CHROME,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EAED',
    ...Platform.select({
      ios: {
        shadowColor: '#1a1a2e',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  gcNavTrack: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: GC_HEADER_CHROME,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 64, 67, 0.1)',
  },
  gcNavCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GC_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E3E6EC',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#1a1a2e',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 5,
      },
      android: { elevation: 2 },
    }),
  },
  gcNavCircleBtnPressedIos: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  gcMonthTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  gcMonthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#202124',
    textAlign: 'center',
    writingDirection: 'rtl',
    letterSpacing: -0.3,
  },
  waitlistBg: {
    flex: 1,
    backgroundColor: GC_PAGE_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 12,
    position: 'relative',
  },
  waitlistBgMonthSplit: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60, 60, 67, 0.12)',
    minHeight: 200,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  cardsContainer: {
    flexDirection: 'column',
    gap: 12,
  },
  weekSection: {
    marginBottom: 20,
  },
  weekSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 10,
    writingDirection: 'rtl',
  },
  monthListHint: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3C3C43',
    marginBottom: 12,
    writingDirection: 'rtl',
  },
  waitlistCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  callButton: {
    backgroundColor: '#F0F8FF',
    borderWidth: 1,
    borderColor: '#D6EBFF',
  },
  deleteButton: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFD6D6',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyIconCircle: {
    backgroundColor: 'rgba(123,97,255,0.10)',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d1d1f',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
});
