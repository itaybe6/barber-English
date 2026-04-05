import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  InteractionManager,
  ScrollView,
  StatusBar,
  Alert,
  Linking,
  I18nManager,
  Platform,
  Pressable,
  RefreshControl,
  Modal,
} from 'react-native';
import Colors from '@/constants/colors';
import { Phone, Trash2, X } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import WaitlistClientCard from '@/components/WaitlistClientCard';
import { supabase, WaitlistEntry } from '@/lib/supabase';
import AdminVerticalMonthCalendar from '@/components/book-appointment/games-calendar/AdminVerticalMonthCalendar';
import { useAuthStore } from '@/stores/authStore';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { formatTimeFromDate } from '@/lib/utils/timeFormat';
import i18n from '@/src/config/i18n';

const GC_SURFACE = '#FFFFFF';
const GC_PAGE_BG = '#F8F9FA';

function separatorLineColor(borderColor: string): string {
  const b = borderColor.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(b)) return `${b}33`;
  return 'rgba(60, 60, 67, 0.12)';
}

function formatDateToLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const [deferHeavyUI, setDeferHeavyUI] = useState(true);
  const { user } = useAuthStore();
  const colors = useColors();
  const { onPrimary } = usePrimaryContrast();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setDeferHeavyUI(false);
    });
    return () => task.cancel();
  }, []);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [visibleMonth, setVisibleMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const [monthDaySheetOpen, setMonthDaySheetOpen] = useState(false);
  const [monthSheetAnchorDate, setMonthSheetAnchorDate] = useState<Date | null>(null);

  const monthSheetKey = useMemo(
    () => (monthSheetAnchorDate ? formatDateToLocalString(monthSheetAnchorDate) : ''),
    [monthSheetAnchorDate]
  );

  const monthModalTitleLabel = useMemo(() => {
    if (!monthSheetAnchorDate) return '';
    const loc = i18n.language?.startsWith('he') ? 'he-IL-u-ca-gregory' : 'en-US';
    try {
      return monthSheetAnchorDate.toLocaleDateString(loc, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return monthSheetKey;
    }
  }, [monthSheetAnchorDate, i18n.language, monthSheetKey]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const start = new Date(visibleMonth.y, visibleMonth.m, 1);
    const end = new Date(visibleMonth.y, visibleMonth.m + 1, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return { rangeStart: start, rangeEnd: end };
  }, [visibleMonth]);

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
    if (deferHeavyUI) return {};
    const map: Record<string, WaitlistEntry[]> = {};
    for (const entry of waitlist) {
      const key = entry.requested_date;
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    }
    return map;
  }, [waitlist, deferHeavyUI]);

  const monthSheetEntries = useMemo(
    () => (monthSheetKey ? waitlistByDate[monthSheetKey] ?? [] : []),
    [monthSheetKey, waitlistByDate]
  );

  const waitlistCountsByDate = useMemo(() => {
    if (deferHeavyUI) return {};
    const r: Record<string, number> = {};
    for (const e of waitlist) {
      r[e.requested_date] = (r[e.requested_date] || 0) + 1;
    }
    return r;
  }, [waitlist, deferHeavyUI]);
  const headerSubtitle = useMemo(
    () => t('admin.waitlist.subtitleMonth', 'Monthly — tap a day to open the list'),
    [t]
  );

  const headerBadgeText = useMemo(() => {
    const loc = i18n.language?.startsWith('he') ? 'he-IL' : 'en-US';
    const d = new Date(visibleMonth.y, visibleMonth.m, 1);
    return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  }, [visibleMonth, i18n.language]);

  const calendarPrimary = colors.primary || '#1A73E8';

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
    setMonthSheetAnchorDate(d);
    setMonthDaySheetOpen(true);
  }, []);

  const onJumpToDate = useCallback((date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setVisibleMonth({ y: d.getFullYear(), m: d.getMonth() });
  }, []);

  const closeMonthSheet = useCallback(() => {
    setMonthDaySheetOpen(false);
  }, []);

  const formatCountBadge = useCallback(
    (c: number) =>
      c === 1
        ? String(t('admin.waitlist.countPillSingle', '1 on waitlist'))
        : String(t('admin.waitlist.countPill', '{{count}} on waitlist', { count: c })),
    [t]
  );

  const renderEntryCard = (entry: WaitlistEntry) => {
    const registeredAtLabel = entry.created_at ? formatTimeFromDate(new Date(entry.created_at)) : '--:--';
    const pref = formatTimePreference(entry.time_period);
    const timePreferenceLabel = pref || undefined;
    return (
      <View
        style={[
          styles.waitlistCard,
          {
            borderColor: colors.border,
            ...Platform.select({
              ios: {
                shadowColor: colors.text,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.07,
                shadowRadius: 20,
              },
              android: { elevation: 4 },
            }),
          },
        ]}
      >
        <View
          style={[
            styles.cardAccent,
            { backgroundColor: colors.primary },
            I18nManager.isRTL ? { right: 0 } : { left: 0 },
          ]}
        />
        <View style={styles.cardInner}>
          <WaitlistClientCard
            name={entry.client_name}
            image={phoneToImage[entry.client_phone] || ''}
            serviceName={entry.service_name}
            registeredAtLabel={registeredAtLabel}
            timePreferenceLabel={timePreferenceLabel}
            statusLabel={t('admin.waitlist.waiting', 'Waiting')}
          />
        </View>
        <View style={[styles.actionButtons, { borderTopColor: separatorLineColor(colors.border) }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => handleCallClient(entry.client_phone)}
            style={({ pressed }) => [
              styles.actionButtonPrimary,
              { backgroundColor: colors.primary, opacity: pressed ? 0.92 : 1 },
              Platform.OS === 'ios' && styles.actionButtonPrimaryIos,
              Platform.OS === 'android' && styles.actionButtonPrimaryAndroid,
            ]}
          >
            <Phone size={18} color={onPrimary} strokeWidth={2.25} />
            <Text style={[styles.actionButtonPrimaryLabel, { color: onPrimary }]}>
              {t('admin.waitlist.contact', 'Contact')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => handleDelete(entry.id)}
            style={({ pressed }) => [
              styles.actionButtonGhost,
              { backgroundColor: pressed ? 'rgba(255, 59, 48, 0.08)' : colors.surface },
              { borderColor: separatorLineColor(colors.error) },
            ]}
          >
            <Trash2 size={17} color={colors.error} strokeWidth={2.2} />
            <Text style={[styles.actionButtonGhostLabel, { color: colors.error }]}>
              {t('settings.services.delete', 'Delete')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const monthModalListSection = loading ? (
    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
  ) : monthSheetEntries.length > 0 ? (
    <View style={styles.cardsContainer}>
      {monthSheetEntries.map((e) => (
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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: '#fff' }}>
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

      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        {deferHeavyUI ? (
          <View style={styles.calendarDeferPlaceholder}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
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
            monthHint={t(
              'admin.waitlist.monthCalendarHint',
              'Numbers show how many clients are on the waitlist that day. Tap a day to open the list.'
            )}
            formatCountBadge={formatCountBadge}
            showTodayPill={false}
          />
        )}
      </View>

      <Modal
        visible={monthDaySheetOpen}
        animationType="slide"
        onRequestClose={closeMonthSheet}
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      >
        <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.monthModalSafe}>
          <View style={[styles.monthModalHeader, { borderBottomColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={String(t('close', 'Close'))}
              onPress={closeMonthSheet}
              hitSlop={12}
              style={styles.monthModalCloseBtn}
            >
              <X size={24} color={colors.text} strokeWidth={2.4} />
            </Pressable>
            <Text style={[styles.monthModalTitle, { color: colors.text }]} numberOfLines={2}>
              {t('admin.waitlist.monthModalTitle', 'Waitlist — {{date}}', { date: monthModalTitleLabel })}
            </Text>
            <View style={styles.monthModalHeaderSpacer} />
          </View>
          <ScrollView
            contentContainerStyle={[styles.monthModalScroll, { paddingBottom: 28 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[calendarPrimary]}
                tintColor={calendarPrimary}
              />
            }
          >
            {monthModalListSection}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerLikeAppointments: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
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
  calendarDeferPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: GC_SURFACE,
  },
  gcHeader: {
    backgroundColor: GC_SURFACE,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
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
    backgroundColor: GC_SURFACE,
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
  monthModalSafe: {
    flex: 1,
    backgroundColor: GC_PAGE_BG,
  },
  monthModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: GC_SURFACE,
  },
  monthModalCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  monthModalHeaderSpacer: {
    width: 44,
    height: 44,
  },
  monthModalScroll: {
    padding: 16,
    paddingTop: 16,
  },
  waitlistCard: {
    backgroundColor: GC_SURFACE,
    borderRadius: 22,
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 0,
    opacity: 0.88,
  },
  cardInner: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(248, 249, 250, 0.96)',
  },
  actionButtonPrimary: {
    flex: 1.35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 15,
    minHeight: 50,
  },
  actionButtonPrimaryIos: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  actionButtonPrimaryAndroid: {
    elevation: 3,
  },
  actionButtonPrimaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  actionButtonGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: 50,
  },
  actionButtonGhostLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.15,
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
