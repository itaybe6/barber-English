import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi } from '@/lib/api/notifications';
import { Notification } from '@/lib/supabase';
import {
  Bell,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  XCircle,
  User,
  ListTodo,
} from 'lucide-react-native';
import { useColors } from '@/src/theme/ThemeProvider';
import { formatTimeFromDate } from '@/lib/utils/timeFormat';

/** First valid YYYY-MM-DD in title/content (e.g. admin "new appointment" body). */
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

function parseNotificationContentStatic(title: string, content: string) {
  try {
    let text = content || '';
    if (title) {
      const safeTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(safeTitle, 'g'), '').trim();
    }

    let name: string | undefined;
    let phone: string | undefined;
    const namePhoneMatch = text.match(/([A-Za-z\-\s']+)\s*\((0\d{8,10})\)/);
    if (namePhoneMatch) {
      name = namePhoneMatch[1].trim();
      phone = namePhoneMatch[2];
      text = text.replace(namePhoneMatch[0], '').trim();
    } else {
      const phoneMatch = text.match(/\((0\d{8,10})\)/);
      if (phoneMatch) {
        phone = phoneMatch[1];
        text = text.replace(phoneMatch[0], '').trim();
      }
    }

    const serviceMatch = text.match(/"([^\"]+)"/);
    const service = serviceMatch ? serviceMatch[1] : undefined;
    if (serviceMatch) text = text.replace(serviceMatch[0], service || '').trim();

    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    const timeMatch = text.match(/(\d{2}:\d{2})(?::\d{2})?/);
    let datePretty: string | undefined;
    let timePretty: string | undefined;
    if (dateMatch) {
      const dt = new Date(`${dateMatch[1]}T00:00:00`);
      datePretty = dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
      text = text.replace(dateMatch[1], '').trim();
    }
    if (timeMatch) {
      const tm = timeMatch[1];
      const [h, m] = tm.split(':');
      const fake = new Date();
      fake.setHours(Number(h), Number(m));
      timePretty = formatTimeFromDate(fake);
      text = text.replace(timeMatch[0], '').trim();
    }

    text = text.replace(/\s{2,}/g, ' ').trim();

    return { primary: text, name, phone, service, datePretty, timePretty };
  } catch {
    return { primary: content } as const;
  }
}

type ParsedNotification = ReturnType<typeof parseNotificationContentStatic>;

type NotifKind = 'new' | 'cancel' | 'reminder' | 'waitlist' | 'system' | 'default';

interface TypeConfig {
  color: string;
  bg: string;
  tint: string;
  icon: React.ReactNode;
}

function getTypeConfig(kind: NotifKind): TypeConfig {
  switch (kind) {
    case 'new':
      return {
        color: '#007AFF',
        bg: '#EBF4FF',
        tint: '#F0F7FF',
        icon: <Calendar size={18} color="#007AFF" />,
      };
    case 'cancel':
      return {
        color: '#FF3B30',
        bg: '#FFEEED',
        tint: '#FFF5F5',
        icon: <XCircle size={18} color="#FF3B30" />,
      };
    case 'reminder':
      return {
        color: '#FF9500',
        bg: '#FFF3E0',
        tint: '#FFFAF0',
        icon: <Clock size={18} color="#FF9500" />,
      };
    case 'waitlist':
      return {
        color: '#34C759',
        bg: '#E8FAF0',
        tint: '#F3FDF6',
        icon: <ListTodo size={18} color="#34C759" />,
      };
    case 'system':
      return {
        color: '#8E8E93',
        bg: '#F2F2F7',
        tint: '#F9F9FB',
        icon: <AlertCircle size={18} color="#8E8E93" />,
      };
    default:
      return {
        color: '#5E5CE6',
        bg: '#EEEEFF',
        tint: '#F5F5FF',
        icon: <Bell size={18} color="#5E5CE6" />,
      };
  }
}

function formatRelativeDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  if (diffMin < 1) return 'עכשיו';
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  if (diffHrs < 24) return `לפני ${diffHrs} שע׳`;
  if (diffHrs < 48) return 'אתמול';
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

interface NotificationListRowProps {
  notification: Notification;
  kind: NotifKind;
  pressable: boolean;
  onPress: (n: Notification) => void;
  isAdminReminder: (n: Notification) => boolean;
}

const NotificationListRow = memo(function NotificationListRow({
  notification,
  kind,
  pressable,
  onPress,
  isAdminReminder,
}: NotificationListRowProps) {
  const parsed: ParsedNotification = parseNotificationContentStatic(notification.title, notification.content);
  const cfg = getTypeConfig(kind);
  const isUnread = !notification.is_read;
  const timeAgo = formatRelativeDate((notification as any).created_at || '');

  const cardBody = (
    <View style={styles.cardInner}>
      <View style={[styles.accentBar, { backgroundColor: cfg.color }]} />
      <View style={[styles.iconAvatar, { backgroundColor: cfg.bg }]}>
        {cfg.icon}
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {notification.title}
          </Text>
          <View style={styles.cardMeta}>
            {isUnread && <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />}
            {timeAgo ? <Text style={styles.cardTime}>{timeAgo}</Text> : null}
          </View>
        </View>

        {parsed.primary ? (
          <Text style={styles.cardBody} numberOfLines={3}>
            {parsed.primary}
          </Text>
        ) : null}

        {(parsed.name || parsed.datePretty || parsed.timePretty) ? (
          <View style={styles.chipsRow}>
            {parsed.name ? (
              <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                <User size={11} color={cfg.color} />
                <Text style={[styles.chipText, { color: cfg.color }]}>{parsed.name}</Text>
              </View>
            ) : null}
            {parsed.datePretty ? (
              <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                <Calendar size={11} color={cfg.color} />
                <Text style={[styles.chipText, { color: cfg.color }]}>{parsed.datePretty}</Text>
              </View>
            ) : null}
            {parsed.timePretty ? (
              <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                <Clock size={11} color={cfg.color} />
                <Text style={[styles.chipText, { color: cfg.color }]}>{parsed.timePretty}</Text>
              </View>
            ) : null}
            {isAdminReminder(notification) ? (
              <View style={[styles.chip, { backgroundColor: '#FFF3E0' }]}>
                <Clock size={11} color="#FF9500" />
                <Text style={[styles.chipText, { color: '#FF9500' }]}>תזכורת</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {(notification as { push_sent?: boolean }).push_sent && (
          <View style={styles.pushBadge}>
            <CheckCircle size={12} color="#34C759" />
            <Text style={styles.pushBadgeText}>נשלח בהצלחה</Text>
          </View>
        )}
      </View>
    </View>
  );

  const cardStyle = [
    styles.card,
    isUnread && { backgroundColor: cfg.tint },
  ];

  return (
    <View style={styles.rowWrap}>
      {pressable ? (
        <TouchableOpacity style={cardStyle} onPress={() => onPress(notification)} activeOpacity={0.75}>
          {cardBody}
        </TouchableOpacity>
      ) : (
        <View style={cardStyle}>{cardBody}</View>
      )}
    </View>
  );
});

const SkeletonCard = memo(function SkeletonCard() {
  return (
    <View style={[styles.card, styles.skeletonCard]}>
      <View style={[styles.accentBar, { backgroundColor: '#E5E5EA' }]} />
      <View style={[styles.iconAvatar, { backgroundColor: '#F2F2F7' }]} />
      <View style={styles.cardContent}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '60%', marginTop: 8 }]} />
        <View style={[styles.skeletonLine, { width: '40%', marginTop: 6, height: 10 }]} />
      </View>
    </View>
  );
});

export default function AdminNotificationsScreen() {
  const { t } = useTranslation();
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
      const [notificationsData, unreadCountData] = await Promise.all([
        notificationsApi.getUserNotifications(user.phone),
        notificationsApi.getUnreadCount(user.phone),
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
      const [notificationsData, unreadCountData] = await Promise.all([
        notificationsApi.getUserNotifications(user.phone),
        notificationsApi.getUnreadCount(user.phone),
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
    return n.type === 'system' && typeof n.content === 'string' && /\bReminder:\b/i.test(n.content);
  };

  const getNotifKind = (n: Notification): NotifKind => {
    if (isCancellationNotification(n)) return 'cancel';
    if (isNewAppointmentNotification(n)) return 'new';
    if (isWaitlistNotification(n)) return 'waitlist';
    if (isAdminReminder(n) || n.type === 'client_reminder' || n.type === 'appointment_reminder' || n.type === 'admin_reminder') return 'reminder';
    if (n.type === 'system') return 'system';
    return 'default';
  };

  const resolveNotificationRoute = (n: Notification): string | null => {
    if (isCancellationNotification(n)) return null;
    if (isAdmin) {
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
    { key: 'all' as const, label: t('notifications.filter.all', 'הכל') },
    { key: 'new' as const, label: t('notifications.filter.new', 'תורים חדשים') },
    { key: 'cancel' as const, label: t('notifications.filter.cancel', 'ביטולים') },
    { key: 'waitlist' as const, label: t('notifications.filter.waitlist', 'המתנה') },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F8FC" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{t('notifications.title', 'התראות')}</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <Bell size={22} color="#8E8E93" />
      </View>

      {isAdmin && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterBar}
        >
          {FILTERS.map(({ key, label }) => {
            const isActive = activeFilter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setActiveFilter(key)}
                style={[styles.filterChip, isActive && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isActive && { color: '#FFFFFF' }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.listPad}>
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationListRow
              notification={item}
              kind={getNotifKind(item)}
              pressable={!isCancellationNotification(item)}
              onPress={handleNotificationPress}
              isAdminReminder={isAdminReminder}
            />
          )}
          contentContainerStyle={[
            styles.listPad,
            { paddingBottom: bottomPadding, flexGrow: 1 },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Bell size={36} color="#C7C7CC" />
              </View>
              <Text style={styles.emptyTitle}>{t('notifications.empty', 'אין התראות')}</Text>
              <Text style={styles.emptySubtitle}>
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
    backgroundColor: '#F8F8FC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },
  headerBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filterScroll: {
    maxHeight: 48,
    marginBottom: 4,
  },
  filterBar: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3C43',
  },
  listPad: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  rowWrap: {
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  accentBar: {
    width: 3.5,
    borderRadius: 2,
    alignSelf: 'stretch',
    minHeight: 40,
  },
  iconAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
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
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    paddingTop: 2,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  cardTime: {
    fontSize: 11,
    color: '#AEAEB2',
    fontWeight: '500',
  },
  cardBody: {
    fontSize: 14,
    color: '#48484A',
    lineHeight: 20,
    marginBottom: 8,
  },
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
  skeletonCard: {
    shadowOpacity: 0,
    elevation: 0,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#EBEBEB',
    width: '80%',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 80,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
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

