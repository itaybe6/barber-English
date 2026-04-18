import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  StatusBar,
  FlatList,
  I18nManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi } from '@/lib/api/notifications';
import { Notification } from '@/lib/supabase';
import {
  Bell,
  Clock,
  CheckCircle,
  Calendar,
  User,
  Receipt,
  Phone,
  Tag,
  Timer,
  XCircle,
  Info,
} from 'lucide-react-native';
import { useColors } from '@/src/theme/ThemeProvider';
import {
  parseNotificationContent,
  localeForDates,
  type ParsedNotificationFields,
} from '@/lib/utils/parseNotificationContent';
import type { TFunction } from 'i18next';

/** Only load notifications from the last N days on this screen (smaller queries). */
const NOTIFICATIONS_FETCH_MAX_AGE_DAYS = 2;

/** [[PERIOD:YYYY-MM]] from finance_monthly_review notifications */
function extractFinanceReviewPeriod(n: Pick<Notification, 'content'>): string | null {
  const m = (n.content || '').match(/\[\[PERIOD:(\d{4}-\d{2})\]\]/);
  return m ? m[1] : null;
}

function isFinanceMonthlyReviewNotification(n: Notification): boolean {
  return n.type === 'finance_monthly_review';
}

function extractYyyyMmDdFromNotification(n: Pick<Notification, 'title' | 'content'>): string | null {
  const blob = `${n.title || ''}\n${n.content || ''}`;
  const m = blob.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

type ParsedNotification = ParsedNotificationFields;

type NotifKind = 'new' | 'cancel' | 'reminder' | 'waitlist' | 'system' | 'finance' | 'default';

/** Text inside cards must set alignment explicitly; RN does not always inherit RTL for nested Text. */
function rtlTextStyle(): { textAlign: 'left' | 'right'; writingDirection: 'ltr' | 'rtl' } {
  return I18nManager.isRTL
    ? { textAlign: 'right', writingDirection: 'rtl' }
    : { textAlign: 'left', writingDirection: 'ltr' };
}

interface TypeConfig {
  color: string;
  bg: string;
  tint: string;
}

function getTypeConfig(kind: NotifKind): TypeConfig {
  switch (kind) {
    case 'new':
      return { color: '#007AFF', bg: '#EBF4FF', tint: '#F0F8FF' };
    case 'cancel':
      return { color: '#FF3B30', bg: '#FFEEED', tint: '#FFF5F5' };
    case 'reminder':
      return { color: '#FF9500', bg: '#FFF3E0', tint: '#FFFAF0' };
    case 'waitlist':
      return { color: '#34C759', bg: '#E8FAF0', tint: '#F3FDF6' };
    case 'system':
      return { color: '#8E8E93', bg: '#F2F2F7', tint: '#F9F9FB' };
    case 'finance':
      return { color: '#16A34A', bg: '#DCFCE7', tint: '#F0FDF4' };
    default:
      return { color: '#5E5CE6', bg: '#EEEEFF', tint: '#F5F5FF' };
  }
}

function getTypeIcon(kind: NotifKind, color: string, size: number = 20) {
  switch (kind) {
    case 'new':       return <Calendar size={size} color={color} strokeWidth={1.8} />;
    case 'cancel':    return <XCircle size={size} color={color} strokeWidth={1.8} />;
    case 'reminder':  return <Clock size={size} color={color} strokeWidth={1.8} />;
    case 'waitlist':  return <Timer size={size} color={color} strokeWidth={1.8} />;
    case 'system':    return <Info size={size} color={color} strokeWidth={1.8} />;
    case 'finance':   return <Receipt size={size} color={color} strokeWidth={1.8} />;
    default:          return <Bell size={size} color={color} strokeWidth={1.8} />;
  }
}

function formatRelativeDate(dateString: string, t: TFunction, lang: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  if (diffMin < 1) return t('notifications.relative.justNow', 'עכשיו');
  if (diffMin < 60) {
    return t('notifications.relative.minutesAgo', 'לפני {{count}} דק׳', { count: diffMin });
  }
  if (diffHrs < 24) {
    return t('notifications.relative.hoursAgo', 'לפני {{count}} שע׳', { count: diffHrs });
  }
  if (diffHrs < 48) return t('notifications.relative.yesterday', 'אתמול');
  return date.toLocaleDateString(localeForDates(lang), { day: 'numeric', month: 'short' });
}

interface NotificationListRowProps {
  notification: Notification;
  kind: NotifKind;
  pressable: boolean;
  onPress: (n: Notification) => void;
  isAdminReminder: (n: Notification) => boolean;
  index?: number;
}

const NotificationListRow = memo(function NotificationListRow({
  notification,
  kind,
  pressable,
  onPress,
  isAdminReminder,
  index = 0,
}: NotificationListRowProps) {
  const { t, i18n } = useTranslation();
  const parsed: ParsedNotification = useMemo(
    () => parseNotificationContent(notification.title, notification.content, i18n.language),
    [notification.title, notification.content, i18n.language]
  );
  const cfg = getTypeConfig(kind);
  const isUnread = !notification.is_read;
  const timeAgo = formatRelativeDate(
    (notification as { created_at?: string }).created_at || '',
    t,
    i18n.language
  );
  const rtlText = rtlTextStyle();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (!pressable) return;
    scale.value = withSpring(0.97, { damping: 15, stiffness: 250 });
  }, [pressable, scale]);

  const handlePressOut = useCallback(() => {
    if (!pressable) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 250 });
  }, [pressable, scale]);

  const showChips =
    Boolean(
      parsed.name || parsed.phone || parsed.service ||
      parsed.datePretty || parsed.timePretty || parsed.periodLabel
    ) || isAdminReminder(notification) || kind === 'finance';

  return (
    <Animated.View
      style={[styles.rowWrap, animatedStyle]}
      entering={FadeInDown.delay(Math.min(index * 55, 280)).duration(380).springify()}
    >
      <Pressable
        onPress={pressable ? () => onPress(notification) : undefined}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, isUnread && { backgroundColor: cfg.tint }]}
      >
        <View style={styles.cardInner}>
          {/* Icon bubble — first in JSX → appears on RIGHT side in RTL */}
          <View style={[styles.iconBubble, { backgroundColor: cfg.bg }]}>
            {getTypeIcon(kind, cfg.color, 20)}
            {isUnread && (
              <View style={[styles.unreadPip, { backgroundColor: cfg.color }]} />
            )}
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardTitle, rtlText]} numberOfLines={2}>
                {notification.title}
              </Text>
              {timeAgo ? (
                <Text style={[styles.cardTime, rtlText]}>{timeAgo}</Text>
              ) : null}
            </View>

            {parsed.primary ? (
              <Text style={[styles.cardBody, rtlText]} numberOfLines={6}>
                {parsed.primary}
              </Text>
            ) : null}

            {showChips ? (
              <View style={styles.chipsRow}>
                {kind === 'finance' ? (
                  <View style={[styles.chip, { backgroundColor: '#DCFCE7' }]}>
                    <Receipt size={11} color="#16A34A" />
                    <Text style={[styles.chipText, { color: '#16A34A' }, rtlText]}>
                      {t('notifications.chip.monthClosure', 'סגירת חודש')}
                    </Text>
                  </View>
                ) : null}
                {parsed.name ? (
                  <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                    <User size={11} color={cfg.color} />
                    <Text style={[styles.chipText, { color: cfg.color }, rtlText]}>{parsed.name}</Text>
                  </View>
                ) : null}
                {parsed.phone ? (
                  <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                    <Phone size={11} color={cfg.color} />
                    <Text style={[styles.chipText, { color: cfg.color }, rtlText]}>{parsed.phone}</Text>
                  </View>
                ) : null}
                {parsed.service ? (
                  <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                    <Tag size={11} color={cfg.color} />
                    <Text style={[styles.chipText, { color: cfg.color }, rtlText]}>{parsed.service}</Text>
                  </View>
                ) : null}
                {parsed.datePretty ? (
                  <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                    <Calendar size={11} color={cfg.color} />
                    <Text style={[styles.chipText, { color: cfg.color }, rtlText]}>{parsed.datePretty}</Text>
                  </View>
                ) : null}
                {parsed.timePretty ? (
                  <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                    <Clock size={11} color={cfg.color} />
                    <Text style={[styles.chipText, { color: cfg.color }, rtlText]}>{parsed.timePretty}</Text>
                  </View>
                ) : null}
                {parsed.periodLabel ? (
                  <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                    <Timer size={11} color={cfg.color} />
                    <Text style={[styles.chipText, { color: cfg.color }, rtlText]}>{parsed.periodLabel}</Text>
                  </View>
                ) : null}
                {isAdminReminder(notification) ? (
                  <View style={[styles.chip, { backgroundColor: '#FFF3E0' }]}>
                    <Clock size={11} color="#FF9500" />
                    <Text style={[styles.chipText, { color: '#FF9500' }, rtlText]}>
                      {t('notifications.chip.reminder', 'תזכורת')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {(notification as { push_sent?: boolean }).push_sent && (
              <View style={styles.pushBadge}>
                <CheckCircle size={12} color="#34C759" />
                <Text style={[styles.pushBadgeText, rtlText]}>
                  {t('notifications.pushSent', 'נשלח בהצלחה')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const SkeletonCard = memo(function SkeletonCard({ index = 0 }: { index?: number }) {
  const rtl = I18nManager.isRTL;
  return (
    <Animated.View
      style={styles.rowWrap}
      entering={FadeInDown.delay(index * 80).duration(300)}
    >
      <View style={[styles.card, styles.skeletonCard]}>
        <View style={styles.cardInner}>
          {/* Bubble placeholder */}
          <View style={[styles.iconBubble, { backgroundColor: '#EBEBF0' }]} />
          <View style={styles.cardContent}>
            <View style={[styles.skeletonLine, { width: '72%' }, rtl && styles.skeletonLineRtl]} />
            <View style={[styles.skeletonLine, { width: '52%', marginTop: 8 }, rtl && styles.skeletonLineRtl]} />
            <View style={[
              styles.skeletonLine,
              { width: '38%', marginTop: 10, height: 24, borderRadius: 12 },
              rtl && styles.skeletonLineRtl,
            ]} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

export default function AdminNotificationsScreen() {
  const { t } = useTranslation();
  const rtlText = rtlTextStyle();
  const insets = useSafeAreaInsets();
  const BOTTOM_SPACER = 124;
  const bottomPadding = BOTTOM_SPACER + (insets?.bottom || 0);
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = useAuthStore((s) => s.isAdminUser());
  const colors = useColors();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<'all' | 'new' | 'cancel' | 'waitlist'>('all');

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    }
  }, [user, router]);

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (!user?.phone) {
      isRefresh ? setRefreshing(false) : setLoading(false);
      return;
    }
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const listOpts = { maxAgeDays: NOTIFICATIONS_FETCH_MAX_AGE_DAYS };
      const [notificationsData, unreadCountData] = await Promise.all([
        notificationsApi.getUserNotifications(user.phone, listOpts),
        notificationsApi.getUnreadCount(user.phone, listOpts),
      ]);
      setNotifications(notificationsData);
      setUnreadCount(unreadCountData);
    } catch (error) {
      console.error('❌ Error loading notifications:', error);
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [user?.phone]);

  const markAllAndLoad = useCallback(async () => {
    if (!user?.phone) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await notificationsApi.markAllAsReadForUser(user.phone);
      const listOpts = { maxAgeDays: NOTIFICATIONS_FETCH_MAX_AGE_DAYS };
      const [notificationsData, unreadCountData] = await Promise.all([
        notificationsApi.getUserNotifications(user.phone, listOpts),
        notificationsApi.getUnreadCount(user.phone, listOpts),
      ]);
      setNotifications(notificationsData);
      setUnreadCount(unreadCountData);
    } catch (error) {
      console.error('❌ Error marking/loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.phone]);

  useFocusEffect(useCallback(() => {
    markAllAndLoad();
  }, [markAllAndLoad]));

  const onRefresh = useCallback(() => {
    loadNotifications(true);
  }, [loadNotifications]);

  const isPendingClientApprovalNotification = (n: Notification): boolean => {
    const title = n.title || '';
    const titleLower = title.toLowerCase();
    const body = n.content || '';
    const bodyLower = body.toLowerCase();
    if (/לקוח חדש ממתין לאישור/.test(title)) return true;
    if (/new client awaiting approval/i.test(titleLower)) return true;
    if (
      /נרשם\/ה וממתין\/ה לאישור|ממתין\/ה לאישורר?|ממתינ\/ה לאישורר?ך/i.test(body) ||
      /ממתין לאישורך באפליקציה/i.test(body) ||
      /registered and is waiting|waiting for you to approve/i.test(bodyLower)
    ) return true;
    return false;
  };

  const isNewAppointmentNotification = (n: Notification): boolean => {
    const title = (n.title || '').toLowerCase();
    const content = (n.content || '').toLowerCase();
    return (
      /new appointment|appointment scheduled|appointment confirmed/.test(title) ||
      /new appointment|appointment scheduled|appointment confirmed/.test(content) ||
      /booked successfully|your appointment was/.test(title) ||
      /booked successfully|your appointment was/.test(content) ||
      /נקבע תור חדש|התור שלך נקבע|נקבע לך תור/.test(n.title || '') ||
      /נקבע תור חדש|התור שלך נקבע|נקבע לך תור/.test(n.content || '')
    );
  };

  const isCancellationNotification = (n: Notification): boolean => {
    const title = (n.title || '').toLowerCase();
    const content = (n.content || '').toLowerCase();
    return (
      /cancel|cancellation/.test(title) ||
      /cancel|cancellation/.test(content) ||
      /בוטל|ביטול/.test(n.title || '') ||
      /בוטל|ביטול/.test(n.content || '')
    );
  };

  const isWaitlistNotification = (n: Notification): boolean => {
    const title = (n.title || '').toLowerCase();
    const content = (n.content || '').toLowerCase();
    return (
      /waitlist/.test(title) ||
      /waitlist/.test(content) ||
      /spot opened/.test(title) ||
      /spot opened/.test(content) ||
      /רשימת\s*המתנה/.test(n.title || '') ||
      /רשימת\s*המתנה/.test(n.content || '')
    );
  };

  const isSwapNotification = (n: Notification): boolean =>
    /appointment swapped|swapped to|החלפ/.test(`${n.title || ''} ${n.content || ''}`.toLowerCase());

  const isAdminReminder = (n: Notification): boolean => {
    if (!n) return false;
    if (n.type === 'admin_reminder') return true;
    if (n.type !== 'system' || typeof n.content !== 'string') return false;
    return /\bReminder:\b/i.test(n.content) || /^\s*תזכורת:/u.test(n.content.trim());
  };

  const getNotifKind = (n: Notification): NotifKind => {
    if (isCancellationNotification(n)) return 'cancel';
    if (isNewAppointmentNotification(n)) return 'new';
    if (isWaitlistNotification(n)) return 'waitlist';
    if (isFinanceMonthlyReviewNotification(n)) return 'finance';
    if (isAdminReminder(n) || n.type === 'client_reminder' || n.type === 'appointment_reminder' || n.type === 'admin_reminder') return 'reminder';
    if (n.type === 'system') return 'system';
    return 'default';
  };

  const resolveNotificationRoute = (n: Notification): string | null => {
    if (isCancellationNotification(n)) return null;
    if (isAdmin) {
      if (isFinanceMonthlyReviewNotification(n)) {
        return '/(tabs)/finance';
      }
      if (isPendingClientApprovalNotification(n)) return '/(tabs)?openPendingClients=1';
      if (isWaitlistNotification(n)) return '/(tabs)/waitlist';
      if (isNewAppointmentNotification(n)) {
        const focusDate = extractYyyyMmDdFromNotification(n);
        const qs: string[] = [];
        if (focusDate) qs.push(`focusDate=${encodeURIComponent(focusDate)}`);
        if (n.appointment_id) qs.push(`focusAppointmentId=${encodeURIComponent(n.appointment_id)}`);
        return qs.length > 0 ? `/(tabs)/appointments?${qs.join('&')}` : '/(tabs)/appointments';
      }
      if (isAdminReminder(n) || n.type === 'admin_reminder' || /תזכורת לתור קרוב/i.test(n.title || '')) return '/(tabs)/appointments';
      if (isSwapNotification(n)) return '/(tabs)/appointments';
      return '/(tabs)/';
    }
    if (isWaitlistNotification(n)) return '/(client-tabs)/book-appointment';
    if (isSwapNotification(n)) return '/(client-tabs)/appointments';
    if (n.type === 'client_reminder' || n.type === 'appointment_reminder' || isNewAppointmentNotification(n)) {
      return '/(client-tabs)/appointments';
    }
    return '/(client-tabs)/';
  };

  const handleNotificationPress = async (notification: Notification) => {
    if (isCancellationNotification(notification)) return;
    if (!notification.is_read) {
      try {
        await notificationsApi.markAsRead(notification.id);
        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    const route = resolveNotificationRoute(notification);
    if (route) router.push(route as any);
  };

  const filteredNotifications = notifications.filter((n) => {
    switch (activeFilter) {
      case 'new':
        return isNewAppointmentNotification(n);
      case 'cancel':
        return isCancellationNotification(n);
      case 'waitlist':
        return isWaitlistNotification(n);
      default:
        return true;
    }
  });

  const FILTERS = [
    { key: 'all' as const,      label: t('notifications.filter.all', 'הכל'),           Icon: Bell },
    { key: 'new' as const,      label: t('notifications.filter.new', 'תורים חדשים'),   Icon: Calendar },
    { key: 'cancel' as const,   label: t('notifications.filter.cancel', 'ביטולים'),    Icon: XCircle },
    { key: 'waitlist' as const, label: t('notifications.filter.waitlist', 'המתנה'),    Icon: Timer },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5FB" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={[styles.headerIconWrap, { backgroundColor: colors.primary + '18' }]}>
            <Bell size={20} color={colors.primary} strokeWidth={1.8} />
          </View>
          <Text
            style={[
              styles.headerTitle,
              I18nManager.isRTL ? { writingDirection: 'rtl' } : { writingDirection: 'ltr' },
            ]}
          >
            {t('notifications.title', 'התראות')}
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.headerBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <Text style={[styles.headerSubtitle, I18nManager.isRTL && { writingDirection: 'rtl', textAlign: 'center' }]}>
            {t('notifications.unreadSummary', '{{count}} לא נקראו', { count: unreadCount })}
          </Text>
        )}
      </View>

      {/* ── Filter pills ── */}
      {isAdmin && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterBar}
        >
          {FILTERS.map(({ key, label, Icon }) => {
            const isActive = activeFilter === key;
            return (
              <Pressable
                key={key}
                onPress={() => setActiveFilter(key)}
                style={[
                  styles.filterChip,
                  isActive && { backgroundColor: colors.primary },
                ]}
              >
                <Icon
                  size={13}
                  color={isActive ? '#FFFFFF' : '#6C6C72'}
                  strokeWidth={2}
                />
                <Text style={[styles.filterChipText, rtlText, isActive && { color: '#FFFFFF' }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── List / Skeletons ── */}
      {loading ? (
        <View style={styles.listPad}>
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} index={i} />)}
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <NotificationListRow
              notification={item}
              kind={getNotifKind(item)}
              pressable={!isCancellationNotification(item)}
              onPress={handleNotificationPress}
              isAdminReminder={isAdminReminder}
              index={index}
            />
          )}
          contentContainerStyle={[
            styles.listPad,
            { paddingBottom: bottomPadding, flexGrow: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.primary + '14' }]}>
                <Bell size={40} color={colors.primary} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyTitle, I18nManager.isRTL && { writingDirection: 'rtl' }]}>
                {t('notifications.empty', 'אין התראות')}
              </Text>
              <Text style={[styles.emptySubtitle, I18nManager.isRTL && { writingDirection: 'rtl' }]}>
                {t('notifications.emptySubtitle', 'כשתגיע התראה חדשה, היא תופיע כאן')}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5FB',
  },

  /* ── Header ── */
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    alignItems: 'center',
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  headerBadge: {
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'center',
  },

  /* ── Filter bar ── */
  filterScroll: {
    maxHeight: 50,
    marginBottom: 6,
  },
  filterBar: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#EBEBF0',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3C43',
  },

  /* ── List ── */
  listPad: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  rowWrap: {
    marginBottom: 10,
  },

  /* ── Notification card ── */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#1C1C1E',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 13,
  },

  /* Icon bubble (right side in RTL, first child in row) */
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  unreadPip: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  /* Card content */
  cardContent: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    lineHeight: 20,
  },
  cardTime: {
    fontSize: 11,
    color: '#AEAEB2',
    fontWeight: '500',
    flexShrink: 0,
    paddingTop: 2,
  },
  cardBody: {
    fontSize: 14,
    color: '#48484A',
    lineHeight: 20,
    marginBottom: 8,
  },

  /* Chips */
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },

  /* Push badge */
  pushBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  pushBadgeText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
  },

  /* Skeleton */
  skeletonCard: {
    shadowOpacity: 0,
    elevation: 0,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#EBEBF0',
    width: '80%',
  },
  skeletonLineRtl: {
    alignSelf: 'flex-end',
  },

  /* Empty state */
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 80,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
});
