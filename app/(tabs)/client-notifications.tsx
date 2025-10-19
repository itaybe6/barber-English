import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Animated, Keyboard, Dimensions, ScrollView, StatusBar } from 'react-native';
import Colors from '@/constants/colors';
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Bell, Send, Users, Calendar, Gift, MessageSquare } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notificationsApi } from '@/lib/api/notifications';
import { useFonts } from 'expo-font';
import { useTranslation } from 'react-i18next';

const TITLE_KEYS = ['appointmentReminder','holidayGreeting','promotion','general'] as const;
const KEY_TO_TYPE: Record<typeof TITLE_KEYS[number], 'appointment_reminder'|'promotion'|'general'> = {
  appointmentReminder: 'appointment_reminder',
  holidayGreeting: 'general',
  promotion: 'promotion',
  general: 'general',
};
const KEY_TO_ICON: Record<typeof TITLE_KEYS[number], any> = {
  appointmentReminder: Calendar,
  holidayGreeting: Gift,
  promotion: Bell,
  general: MessageSquare,
};

export default function ClientNotificationsScreen() {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [buttonAnim] = useState(new Animated.Value(1));
  const [toast, setToast] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [fontsLoaded] = useFonts({
    'FbPragmati-Regular': require('@/assets/fonts/FbPragmati-Regular.otf'),
    'FbPragmati-Bold': require('@/assets/fonts/FbPragmati-Bold.otf'),
    'FbPragmati-Light': require('@/assets/fonts/FbPragmati-Light.otf'),
    'FbPragmati-Thin': require('@/assets/fonts/FbPragmati-Thin.otf'),
    'FbPragmati-Black': require('@/assets/fonts/FbPragmati-Black.otf'),
  });

  const titles = useMemo(() => TITLE_KEYS.map(k => t(`admin.notificationsComposer.title.${k}`, k)), [t]);
  const handleSend = async () => {
    Keyboard.dismiss();
    if (!title) {
      setError(t('admin.notificationsComposer.error.noTitle','Please select a title'));
      return;
    }
    if (!message.trim()) {
      setError(t('admin.notificationsComposer.error.noMessage','Please enter a message'));
      return;
    }
    
    setError('');
    setIsSending(true);
    
    try {
      Animated.sequence([
        Animated.timing(buttonAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
        Animated.timing(buttonAnim, { toValue: 1, duration: 100, useNativeDriver: true })
      ]).start();

      // Find key by current localized title
      const keyIndex = titles.indexOf(title);
      const key = keyIndex >= 0 ? TITLE_KEYS[keyIndex] : 'general';
      const notificationType = KEY_TO_TYPE[key];
      
      const success = await notificationsApi.sendNotificationToAllClients(
        title,
        message.trim(),
        notificationType
      );

      if (success) {
        setSent(true);
        setToast(t('admin.notificationsComposer.sentToast','Notification sent to all clients with push enabled!'));
        setMessage('');
        setTitle('');
      } else {
        setError(t('admin.notificationsComposer.error.sendFailed','Failed to send notification. Please try again.'));
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      setError(t('admin.notificationsComposer.error.sendFailed','Failed to send notification. Please try again.'));
    } finally {
      setIsSending(false);
      setTimeout(() => {
        setSent(false);
        setToast('');
      }, 2500);
    }
  };

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}><Text>{t('loading','Loading...')}</Text></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('notifications.title','Notifications')}</Text>
        <Text style={styles.headerSubtitle}>{t('admin.notificationsComposer.subtitle','Send a message to all clients')}</Text>
      </View>

      {/* Toast Message */}
      {toast ? (
        <View style={styles.toast}>
          <CheckCircle2 size={20} color="#4CAF50" style={{ marginLeft: 8 }} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Main Card */}
        <View style={styles.mainCard}>
          <View style={styles.cardHeader}>
            <View style={styles.iconContainer}>
              <Bell size={24} color="#1C1C1E" />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.cardTitle}>{t('admin.notificationsComposer.createTitle','Create a new notification')}</Text>
              <Text style={styles.cardSubtitle}>{t('admin.notificationsComposer.createSubtitle','Choose a type and enter the content to send now')}</Text>
            </View>
          </View>

          {/* Notification Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('admin.notificationsComposer.type','Notification type')}</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setShowDropdown(!showDropdown)}
              activeOpacity={0.8}
            >
              <View style={styles.dropdownContent}>
                {title ? (
                  <>
                    {(() => {
                      const idx = titles.indexOf(title);
                      const key = idx >= 0 ? TITLE_KEYS[idx] : 'general';
                      const IconComponent = KEY_TO_ICON[key];
                      return IconComponent ? <IconComponent size={20} color="#1C1C1E" style={{ marginLeft: 12 }} /> : null;
                    })()}
                    <Text style={styles.dropdownText}>{title}</Text>
                  </>
                ) : (
                  <>
                    <MessageSquare size={20} color="#8E8E93" style={{ marginLeft: 12 }} />
                    <Text style={[styles.dropdownText, { color: '#8E8E93' }]}>{t('admin.notificationsComposer.selectType','Select notification type')}</Text>
                  </>
                )}
              </View>
              {showDropdown ? (
                <ChevronUp size={20} color="#1C1C1E" />
              ) : (
                <ChevronDown size={20} color="#1C1C1E" />
              )}
            </TouchableOpacity>
            
            {showDropdown && (
              <View style={styles.dropdownList}>
                {titles.map((label, idx) => {
                  const key = TITLE_KEYS[idx];
                  const IconComponent = KEY_TO_ICON[key];
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.dropdownItem, idx !== TITLES.length - 1 && styles.dropdownItemBorder]}
                      onPress={() => {
                        setTitle(label);
                        setShowDropdown(false);
                      }}
                    >
                      <View style={styles.dropdownItemContent}>
                        {IconComponent && <IconComponent size={18} color="#1C1C1E" style={{ marginLeft: 12 }} />}
                        <Text style={styles.dropdownItemText}>{label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Message Content */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('admin.notificationsComposer.message','Message content')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, { minHeight: 120 }]}
                value={message}
                onChangeText={setMessage}
                placeholder={t('admin.notificationsComposer.messagePlaceholder','Write your message here...')}
                placeholderTextColor="#8E8E93"
                multiline
                textAlign="right"
              />
            </View>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <AlertCircle size={16} color="#FF3B30" style={{ marginLeft: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Send Button */}
          <Animated.View style={{ transform: [{ scale: buttonAnim }], width: '100%' }}>
            <TouchableOpacity
              style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
              onPress={handleSend}
              activeOpacity={0.85}
              disabled={isSending}
            >
              <View style={styles.sendButtonContent}>
                <Send size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
                <Text style={styles.sendButtonText}>
                  {isSending ? t('admin.notificationsComposer.sending','Sending...') : t('admin.notificationsComposer.sendAll','Send to all clients')}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Preview Section */}
        {title && message && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{t('admin.notificationsComposer.preview','Preview')}</Text>
            <View style={styles.notificationPreview}>
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.notificationTitle}>{title}</Text>
              </View>
              <Text style={styles.notificationContent}>{message}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Regular',
  },
  toast: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  toastText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Regular',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  headerTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Bold',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Regular',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'right',
    marginBottom: 12,
    fontFamily: 'FbPragmati-Bold',
  },
  dropdown: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    minHeight: 56,
  },
  dropdownContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
  },
  dropdownText: {
    fontSize: 16,
    color: '#1A1A1A',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Regular',
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginTop: 8,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#1A1A1A',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Regular',
  },
  inputContainer: {
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  input: {
    padding: 16,
    minHeight: 120,
    fontSize: 16,
    textAlignVertical: 'top',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Regular',
    color: '#1A1A1A',
  },
  errorContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'right',
    fontFamily: 'FbPragmati-Regular',
  },
  sendButton: {
    backgroundColor: '#000000',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#C7C7CC',
    shadowOpacity: 0.1,
  },
  sendButtonContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: 'FbPragmati-Bold',
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'right',
    marginBottom: 16,
    fontFamily: 'FbPragmati-Bold',
  },
  notificationPreview: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5E7',
  },
  notificationHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'right',
    marginRight: 8,
    fontFamily: 'FbPragmati-Bold',
  },
  notificationTime: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'right',
    fontFamily: 'FbPragmati-Regular',
  },
  notificationContent: {
    fontSize: 14,
    color: '#1A1A1A',
    textAlign: 'right',
    lineHeight: 20,
    fontFamily: 'FbPragmati-Regular',
  },
}); 