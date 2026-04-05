import { supabase, getBusinessId } from '@/lib/supabase';
import { Notification } from '@/lib/supabase';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getExpoExtra } from '@/lib/getExtra';
import { Platform } from 'react-native';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Same shape as client_phone / appointment queries — reminders store recipient_phone from the booking row. */
function recipientPhoneQueryVariants(userPhone: string): string[] {
  const phoneRaw = String(userPhone || '').trim();
  if (!phoneRaw) return [];
  const variants = new Set<string>();
  variants.add(phoneRaw);
  const onlyDigits = phoneRaw.replace(/[^+\d]/g, '');
  if (onlyDigits) variants.add(onlyDigits);
  if (onlyDigits.startsWith('0')) {
    variants.add(`+972${onlyDigits.slice(1)}`);
  }
  if (onlyDigits.startsWith('+972')) {
    const rest = onlyDigits.slice(4);
    if (rest && !rest.startsWith('0')) variants.add(`0${rest}`);
  }
  return Array.from(variants);
}

export const notificationsApi = {
  // Push sending moved to server (Supabase Edge Function)
  // Get user's notifications
  async getUserNotifications(userPhone: string): Promise<Notification[]> {
    try {
      const businessId = getBusinessId();
      const variants = recipientPhoneQueryVariants(userPhone);
      if (variants.length === 0) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, content, type, is_read, read_at, created_at, recipient_name, recipient_phone, appointment_id, business_id')
        .eq('business_id', businessId)
        .in('recipient_phone', variants)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching user notifications:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getUserNotifications:', error);
      throw error;
    }
  },

  // Create a new notification
  async createNotification(notificationData: Omit<Notification, 'id' | 'created_at' | 'is_read'>): Promise<Notification | null> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('notifications')
        .insert([{ ...notificationData, business_id: businessId }])
        .select()
        .single();

      if (error) {
        console.error('Error creating notification:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in createNotification:', error);
      return null;
    }
  },

  // Create a notification to all admins (studio managers)
  async createAdminNotification(
    title: string,
    content: string,
    type: Notification['type'] = 'system',
    appointmentId?: string | null
  ): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      
      const { data: admins, error: adminsError } = await supabase
        .from('users')
        .select('name, phone')
        .eq('business_id', businessId) // Filter by current business
        .eq('user_type', 'admin')
        .not('phone', 'is', null)
        .neq('phone', '');

      if (adminsError) {
        console.error('Error fetching admins for notification:', adminsError);
        return false;
      }

      if (!admins || admins.length === 0) {
        return false;
      }

      const notifications = admins.map((admin) => ({
        title,
        content,
        type,
        recipient_name: admin.name || 'מנהל',
        recipient_phone: (admin.phone || '').trim(),
        business_id: businessId,
        ...(appointmentId ? { appointment_id: appointmentId } : {}),
      }));

      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (insertError) {
        console.error('Error inserting admin notifications:', insertError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in createAdminNotification:', error);
      return false;
    }
  },

  // Create a notification for a specific admin by userId (targeted manager notification)
  async createAdminNotificationForUserId(
    userId: string,
    title: string,
    content: string,
    type: Notification['type'] = 'system',
    appointmentId?: string | null
  ): Promise<boolean> {
    try {
      if (!userId) return false;
      const businessId = getBusinessId();

      // Fetch the target admin's name and phone within current business
      const { data: admin, error: adminError } = await supabase
        .from('users')
        .select('id, name, phone')
        .eq('business_id', businessId)
        .eq('id', userId)
        .single();

      if (adminError || !admin) {
        console.error('Error fetching admin for targeted notification:', adminError);
        return false;
      }

      const recipientPhone = (admin.phone || '').trim();
      if (!recipientPhone) {
        // No phone to deliver the in-app notification
        return false;
      }

      const { error: insertError } = await supabase
        .from('notifications')
        .insert([
          {
            title,
            content,
            type,
            recipient_name: admin.name || 'מנהל',
            recipient_phone: recipientPhone,
            business_id: businessId,
            // Store target admin for traceability if the column exists
            user_id: (admin as any).id || userId,
            ...(appointmentId ? { appointment_id: appointmentId } : {}),
          } as any,
        ]);

      if (insertError) {
        console.error('Error inserting targeted admin notification:', insertError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in createAdminNotificationForUserId:', error);
      return false;
    }
  },

  /**
   * Insert one notification row per client (with phone). DB trigger may invoke push/SMS edge function.
   * @returns ok=false only on fetch/insert errors; recipientCount=0 means no eligible clients (not an error).
   */
  async sendNotificationToAllClients(
    title: string,
    content: string,
    type: Notification['type'] = 'general'
  ): Promise<{ ok: boolean; recipientCount: number }> {
    try {
      const businessId = getBusinessId();

      const { data: clients, error: clientsError } = await supabase
        .from('users')
        .select('name, phone')
        .eq('business_id', businessId)
        .eq('user_type', 'client')
        .not('phone', 'is', null)
        .neq('phone', '');

      if (clientsError) {
        console.error('Error fetching clients:', clientsError);
        return { ok: false, recipientCount: 0 };
      }

      const validClients = (clients || []).filter(
        (client) => client.phone && String(client.phone).trim() !== ''
      );

      if (validClients.length === 0) {
        return { ok: true, recipientCount: 0 };
      }

      const notifications = validClients.map((client) => ({
        title,
        content,
        type,
        recipient_name: client.name || 'לקוח',
        recipient_phone: String(client.phone).trim(),
        business_id: businessId,
      }));

      const { error: insertError } = await supabase.from('notifications').insert(notifications);

      if (insertError) {
        console.error('Error inserting notifications:', insertError);
        return { ok: false, recipientCount: 0 };
      }
      return { ok: true, recipientCount: validClients.length };
    } catch (error) {
      console.error('Error in sendNotificationToAllClients:', error);
      return { ok: false, recipientCount: 0 };
    }
  },

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      
      const { error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId)
        .eq('business_id', businessId); // Ensure we only update notifications from current business

      if (error) {
        console.error('Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in markAsRead:', error);
      return false;
    }
  },

  // Mark all notifications as read for a specific user
  async markAllAsReadForUser(userPhone: string): Promise<number> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('business_id', businessId) // Filter by current business
        .eq('recipient_phone', userPhone)
        .eq('is_read', false)
        .select('id');

      if (error) {
        console.error('Error marking all notifications as read:', error);
        return 0;
      }

      return (data?.length as number) || 0;
    } catch (error) {
      console.error('Error in markAllAsReadForUser:', error);
      return 0;
    }
  },

  // Get unread notifications count
  async getUnreadCount(userPhone: string): Promise<number> {
    try {
      const businessId = getBusinessId();
      
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId) // Filter by current business
        .eq('recipient_phone', userPhone)
        .eq('is_read', false);

      if (error) {
        console.error('Error getting unread count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error in getUnreadCount:', error);
      return 0;
    }
  },

  // Register push token for user (disabled for now)
  async registerPushToken(userPhone: string, pushToken: string): Promise<boolean> {
    try {
      if (!userPhone || !pushToken) return false;
      const businessId = getBusinessId();
      
      const { error } = await supabase
        .from('users')
        .update({ push_token: pushToken })
        .eq('business_id', businessId) // Filter by current business
        .eq('phone', userPhone);
      if (error) {
        console.error('Error saving push token:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error in registerPushToken:', error);
      return false;
    }
  },

  // Clear push token for user (disable push notifications server-side)
  async clearPushToken(userPhone: string): Promise<boolean> {
    try {
      if (!userPhone) return false;
      const businessId = getBusinessId();
      
      const { error } = await supabase
        .from('users')
        .update({ push_token: null })
        .eq('business_id', businessId) // Filter by current business
        .eq('phone', userPhone);
      if (error) {
        console.error('Error clearing push token:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error in clearPushToken:', error);
      return false;
    }
  },

  // Request notification permissions and get token
  async requestNotificationPermissions(): Promise<string | null> {
    try {
      // Skip remote push token requests in Expo Go on Android (SDK 53+)
      if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
        console.warn('Skipping push token request in Expo Go. Use a development build to enable push notifications.');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return null;
      }

      // Try to resolve projectId from several sources (env, runtime extra, expoConfig)
      const extra = getExpoExtra();
      const envProjectId = process.env.EXPO_PUBLIC_PROJECT_ID || process.env.EAS_PROJECT_ID;
      const extraProjectId = (extra?.eas?.projectId as string | undefined) || (extra?.projectId as string | undefined);
      const configProjectId = (Constants?.expoConfig as any)?.extra?.eas?.projectId as string | undefined;
      const projectId = envProjectId || extraProjectId || configProjectId;

      // In dev (Expo Go / local), if projectId is still missing, avoid throwing and just return null
      if (!projectId) {
        console.warn('No "projectId" found for push token. Skipping token request. Ensure extra.eas.projectId is set.');
        return null;
      }

      const token = await Notifications.getExpoPushTokenAsync({ projectId });

      return token.data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isExpoTransient =
        msg.includes('503') ||
        msg.includes('SERVICE_UNAVAILABLE') ||
        msg.includes('temporarily unavailable');
      if (isExpoTransient) {
        console.warn(
          'Expo push API is temporarily unavailable (high load). Push token not saved — try again later.',
          error
        );
      } else {
        console.error('Error requesting notification permissions:', error);
      }
      return null;
    }
  },

  // Get all notifications (for debugging)
  async getAllNotifications(): Promise<Notification[]> {
    try {
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('business_id', businessId) // Filter by current business
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching all notifications:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllNotifications:', error);
      throw error;
    }
  },
}; 