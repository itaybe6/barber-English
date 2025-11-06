import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl, StatusBar } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi } from '@/lib/api/notifications';
import { Notification } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Bell, Clock, CheckCircle, AlertCircle, Calendar, XCircle, User } from 'lucide-react-native';
import { useColors } from '@/src/theme/ThemeProvider';
import { formatTimeFromDate } from '@/lib/utils/timeFormat';

export default function ClientNotificationsScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const BOTTOM_SPACER = 124; // to keep last item above the tab bar
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

  // Local iOS-like palette for this screen (Colors in project are currently monochrome)
  const ios = {
    background: '#F2F2F7',
    card: '#FFFFFF',
    border: '#E5E5EA',
    primary: '#007AFF',
    secondary: '#8E8E93',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
  } as const;

  // Allow both admin and client to access this shared screen
  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
  }, [user, router]);

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (!user?.phone) {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [notificationsData, unreadCountData] = await Promise.all([
        notificationsApi.getUserNotifications(user.phone),
        notificationsApi.getUnreadCount(user.phone)
      ]);

      setNotifications(notificationsData);
      setUnreadCount(unreadCountData);
    } catch (error) {
      console.error('❌ Error loading notifications:', error);
      // Silent fail UI-wise; could add a toast here if needed
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [user?.phone]);

  // On screen focus: first mark all as read, then load fresh notifications
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

  useFocusEffect(
    useCallback(() => {
      markAllAndLoad();
    }, [markAllAndLoad])
  );

  const onRefresh = useCallback(() => {
    loadNotifications(true);
  }, [loadNotifications]);

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.is_read) {
      try {
        await notificationsApi.markAsRead(notification.id);
        // Update local state
        setNotifications(prev => 
          prev.map(n => 
            n.id === notification.id 
              ? { ...n, is_read: true, read_at: new Date().toISOString() }
              : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'appointment_reminder':
        return <Clock size={20} color={Colors.primary} />;
      case 'promotion':
        return <AlertCircle size={20} color={Colors.warning} />;
      case 'system':
        return <AlertCircle size={20} color={Colors.error} />;
      default:
        return <Bell size={20} color={Colors.primary} />;
    }
  };

  // Detect admin reminder (our per-user pre-appointment reminder inserted as type 'system')
  const isAdminReminder = (n: Notification): boolean => {
    if (!n) return false;
    // Our SQL builds content starting with "Reminder:" in English
    return n.type === 'system' && typeof n.content === 'string' && /\bReminder:\b/i.test(n.content);
  };

  const getNotificationTypeText = (type: Notification['type']) => {
    switch (type) {
      case 'appointment_reminder':
        return 'Appointment Reminder';
      case 'promotion':
        return 'Promotion';
      case 'system':
        return 'System Alert';
      default:
        return 'General Message';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} hours ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  };

  // Parse raw content into structured fields for iconified rendering
  const parseNotificationContent = (title: string, content: string) => {
    try {
      let text = content || '';
      if (title) {
        const safeTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(safeTitle, 'g'), '').trim();
      }

      // Name (Heb/Eng) and phone in parentheses
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

      // Service in quotes
      const serviceMatch = text.match(/"([^\"]+)"/);
      const service = serviceMatch ? serviceMatch[1] : undefined;
      if (serviceMatch) text = text.replace(serviceMatch[0], service || '').trim();

      // Date and time
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
  };

  const getTitleStatusIcon = (title: string) => {
    const t = (title || '').toLowerCase();
    if (/cancel/.test(t)) return <XCircle size={18} color="#FF3B30" />;
    if (/confirmed|approved|new/.test(t)) return <CheckCircle size={18} color="#34C759" />;
    return null;
  };

  // Filtering helpers
  const isNewAppointmentNotification = (n: Notification): boolean => {
    const title = (n.title || '').toLowerCase();
    const content = (n.content || '').toLowerCase();
    return (
      /new appointment|appointment scheduled|appointment confirmed/.test(title) ||
      /new appointment|appointment scheduled|appointment confirmed/.test(content) ||
      /נקבע תור חדש|התור שלך נקבע/.test(n.title || '') ||
      /נקבע תור חדש|התור שלך נקבע/.test(n.content || '')
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

  const filteredNotifications = notifications.filter((n) => {
    switch (activeFilter) {
      case 'new':
        return isNewAppointmentNotification(n);
      case 'cancel':
        return isCancellationNotification(n);
      case 'waitlist':
        return isWaitlistNotification(n);
      case 'all':
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('notifications.title', 'Notifications')}</Text>
            <View style={styles.headerRight} />
          </View>
          <View style={styles.contentWrapper}>
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>{t('notifications.loading', 'Loading notifications...')}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('notifications.title', 'Notifications')}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.contentWrapper}>
        {/* Filters */}
        {isAdmin && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterBar}
          >
            {([
              { key: 'all', label: t('notifications.filter.all', 'All') },
              { key: 'new', label: t('notifications.filter.new', 'New Appointments') },
              { key: 'cancel', label: t('notifications.filter.cancel', 'Cancellations') },
              { key: 'waitlist', label: t('notifications.filter.waitlist', 'Waitlist') },
            ] as const).map(({ key, label }) => {
              const isActive = activeFilter === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setActiveFilter(key)}
                  style={[
                    styles.filterChip,
                    isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.filterChipText,
                    isActive && { color: '#FFFFFF' },
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
          >
            {filteredNotifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Bell size={64} color={ios.secondary} />
                <Text style={styles.emptyTitle}>{t('notifications.empty', 'No notifications')}</Text>
                <Text style={styles.emptySubtitle}>{t('notifications.emptySubtitle', 'When you have a new notification, it will appear here')}</Text>
              </View>
            ) : (
              <View style={styles.notificationsContainer}>
                {filteredNotifications.map((notification) => (
                  <TouchableOpacity
                    key={notification.id}
                    style={[
                      styles.notificationCard,
                      !notification.is_read && styles.unreadCard
                    ]}
                    onPress={() => handleNotificationPress(notification)}
                    activeOpacity={0.7}
                  >
                    
                    <View style={styles.titleRow}>
                      <View style={styles.titleWithIcon}>
                        {getTitleStatusIcon(notification.title)}
                        <Text style={styles.notificationTitle}>{notification.title}</Text>
                      </View>
                      {isAdminReminder(notification) ? (
                        <Clock size={18} color={Colors.primary} />
                      ) : null}
                    </View>
                    {(() => {
                      const parsed = parseNotificationContent(notification.title, notification.content);
                      return (
                        <View>
                          {parsed.primary ? (
                            <Text style={styles.notificationContent}>{parsed.primary}</Text>
                          ) : null}
                          <View style={styles.detailsContainer}>
                            {parsed.name ? (
                              <View style={styles.detailRow}>
                                <View style={styles.detailIcon}><User size={14} color="#8E8E93" /></View>
                                <Text style={styles.detailText}>{parsed.name}</Text>
                              </View>
                            ) : null}
                            {parsed.datePretty ? (
                              <View style={styles.detailRow}>
                                <View style={styles.detailIcon}><Calendar size={14} color="#8E8E93" /></View>
                                <Text style={styles.detailText}>{parsed.datePretty}</Text>
                              </View>
                            ) : null}
                            {parsed.timePretty ? (
                              <View style={styles.detailRow}>
                                <View style={styles.detailIcon}><Clock size={14} color="#8E8E93" /></View>
                                <Text style={styles.detailText}>{parsed.timePretty}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}
                    
                    {(notification as any).push_sent && (
                      <View style={styles.pushStatus}>
                        <CheckCircle size={14} color={ios.success} />
                        <Text style={styles.pushStatusText}>נשלח בהצלחה</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    backgroundColor: '#FFFFFF',
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 24,
  },
  notificationsContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  unreadCard: {
    borderColor: '#007AFF',
    backgroundColor: '#FFFFFF',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  notificationIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  notificationInfo: {
    flex: 1,
  },
  notificationType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 2,
    textAlign: 'left',
  },
  notificationTime: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'left',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'left',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationContent: {
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 22,
    textAlign: 'left',
  },
  detailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailIcon: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#6B7280',
  },
  pushStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  pushStatusText: {
    fontSize: 12,
    color: '#34C759',
    marginLeft: 4,
    textAlign: 'left',
  },
  filterScroll: {
    maxHeight: 52,
  },
  filterBar: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginTop: 4,
  },
  filterChipActive: {
    // Kept for fallback; dynamic color applied inline using useColors()
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
}); 