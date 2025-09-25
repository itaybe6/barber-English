import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, TextInput, Platform, Alert, ScrollView, KeyboardAvoidingView, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { messagesApi } from '@/lib/api/messages';
import { useAuthStore } from '@/stores/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/src/theme/ThemeProvider';

// Simplified composer: free-text title and TTL hours

type AdminBroadcastComposerProps = {
  variant?: 'floating' | 'icon';
  iconContainerStyle?: ViewStyle;
  iconColor?: string;
  // When provided, the modal acts in controlled mode
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Hide the built-in trigger (useful when controlling from a parent)
  renderTrigger?: boolean;
  // Language for UI strings and direction
  language?: 'en' | 'he';
};

export default function AdminBroadcastComposer({
  variant = 'floating',
  iconContainerStyle,
  iconColor,
  open,
  onOpenChange,
  renderTrigger = true,
  language = 'he',
}: AdminBroadcastComposerProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = createStyles(colors);
  const currentUser = useAuthStore((s) => s.user);
  const effectiveIconColor = iconColor ?? colors.primary;
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? !!open : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) onOpenChange?.(value);
    else setInternalOpen(value);
  };
  const isLTR = language === 'en';
  const [title, setTitle] = useState('');
  const [notificationContent, setNotificationContent] = useState('');
  const [ttlInput, setTtlInput] = useState('24');
  const [isSending, setIsSending] = useState(false);

  const currentTitle = title.trim();
  const canSend = currentTitle.length > 0 && notificationContent.trim().length > 0 && !isSending;

  const t = useMemo(() => {
    if (language === 'en') {
      return {
        triggerLabel: 'Send message to clients',
        headerTitle: 'Send message to clients',
        titleLabel: 'Title',
        customInputPlaceholder: 'Enter a title...',
        contentLabel: 'Content',
        contentPlaceholder: 'Enter content...',
        previewTitlePlaceholder: 'Title',
        previewContentPlaceholder: 'Content will appear here...',
        ttlLabel: 'Visible for (hours)',
        ttlPlaceholder: 'Enter hours (1–720)',
        cancel: 'Cancel',
        sendAll: 'Send to all',
        sending: 'Sending...',
        error: 'Error',
        errorFill: 'Please fill in title and content',
        ttlError: 'Please enter hours between 1 and 720',
        success: 'Success',
        successMsg: 'Message published',
        ok: 'OK',
        failMsg: 'Failed to publish message. Please try again.',
        accessibilitySend: 'Send message to clients',
      };
    }
    return {
      triggerLabel: 'שליחת הודעה ללקוחות',
      headerTitle: 'שליחת הודעה ללקוחות',
      titleLabel: 'כותרת',
      customInputPlaceholder: 'הכנס כותרת...',
      contentLabel: 'תוכן',
      contentPlaceholder: 'הכנס תוכן...',
      previewTitlePlaceholder: 'כותרת',
      previewContentPlaceholder: 'תוכן יופיע כאן...',
      ttlLabel: 'זמן באוויר (שעות)',
      ttlPlaceholder: 'הכנס שעות (1–720)',
      cancel: 'ביטול',
      sendAll: 'שלח לכולם',
      sending: 'שולח...',
      error: 'שגיאה',
      errorFill: 'אנא מלא את הכותרת והתוכן של ההתראה',
      ttlError: 'אנא הזן שעות בין 1 ל‑720',
      success: 'הצלחה',
      successMsg: 'ההודעה פורסמה',
      ok: 'אישור',
      failMsg: 'שגיאה בפרסום ההודעה. אנא נסה שוב.',
      accessibilitySend: 'שליחת הודעה ללקוחות',
    };
  }, [language]);

  const resetState = () => {
    setTitle('');
    setNotificationContent('');
    setTtlInput('24');
  };

  const handleSend = async () => {
    const finalTitle = currentTitle;
    if (!finalTitle || !notificationContent.trim()) {
      Alert.alert(t.error, t.errorFill);
      return;
    }
    const ttl = parseInt(ttlInput, 10);
    if (!Number.isFinite(ttl) || ttl < 1 || ttl > 720) {
      Alert.alert(t.error, t.ttlError);
      return;
    }

    setIsSending(true);
    try {
      // Insert a single broadcast message record instead of per-client notifications
      const created = await messagesApi.createMessage({
        title: finalTitle,
        content: notificationContent.trim(),
        ttlHours: ttl,
        userId: (currentUser as any)?.id || null,
      });
      if (created) {
        Alert.alert(t.success, t.successMsg, [
          { text: t.ok, onPress: () => { setOpen(false); resetState(); } },
        ]);
      } else {
        Alert.alert(t.error, t.failMsg);
      }
    } catch (e) {
      Alert.alert(t.error, t.failMsg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* Trigger */}
      {renderTrigger && (variant === 'floating' ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.fabContainer,
            {
              top: Math.max(110, insets.top + 80),
              left: 10,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t.accessibilitySend}
            style={styles.fabWrapper}
          >
            <LinearGradient
              // Apple-style vibrant gradient
              colors={["#007AFF", "#5E5CE6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fab}
            >
              <Ionicons name="paper-plane-outline" size={18} color="#fff" style={{ marginRight: 8, marginLeft: 0 }} />
              <Text style={styles.fabLabel} numberOfLines={1}>{t.triggerLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t.accessibilitySend}
          style={[styles.iconButton, iconContainerStyle]}
        >
          <Ionicons
  name="paper-plane-outline"
  size={22}
  color={effectiveIconColor}
  style={{ transform: [{ scaleX: -1 }] }}
/>
        </TouchableOpacity>
      ))}

      {/* Composer Modal */}
      <Modal
        visible={isOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
            <LinearGradient
              colors={[colors.primary, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sheetHeader}
            >
              <Text style={styles.sheetTitle}>{t.headerTitle}</Text>
              <TouchableOpacity style={[styles.headerCloseButton, isLTR ? { right: 10 } : { left: 10 }]} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={{ maxHeight: '100%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              {/* Title */}
              <View style={styles.sectionCard}>
                <Text style={[styles.label, isLTR && { textAlign: 'left' }]}>{t.titleLabel}</Text>
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={[styles.input, isLTR && { textAlign: 'left' }]}
                    placeholder={t.customInputPlaceholder}
                    placeholderTextColor={Colors.subtext}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={80}
                    textAlign={isLTR ? 'left' : 'right'}
                  />
                  <Text style={styles.counter}>{title.length}/80</Text>
                </View>
              </View>

              {/* Content */}
              <View style={[styles.sectionCard, { marginTop: 12 }]}>
                <Text style={[styles.label, isLTR && { textAlign: 'left' }]}>{t.contentLabel}</Text>
                <TextInput
                  style={[styles.input, styles.textArea, isLTR && { textAlign: 'left' }]}
                  placeholder={t.contentPlaceholder}
                  placeholderTextColor={Colors.subtext}
                  value={notificationContent}
                  onChangeText={setNotificationContent}
                  multiline
                  numberOfLines={6}
                  maxLength={500}
                  textAlign={isLTR ? 'left' : 'right'}
                  textAlignVertical="top"
                />
                <Text style={styles.counter}>{notificationContent.length}/500</Text>
              </View>

              {/* TTL Hours */}
              <View style={[styles.sectionCard, { marginTop: 12 }]}>
                <Text style={[styles.label, isLTR && { textAlign: 'left' }]}>{t.ttlLabel}</Text>
                <TextInput
                  style={[styles.input, isLTR && { textAlign: 'left' }]}
                  placeholder={t.ttlPlaceholder}
                  placeholderTextColor={Colors.subtext}
                  value={ttlInput}
                  onChangeText={(v) => setTtlInput(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                  textAlign={isLTR ? 'left' : 'right'}
                />
              </View>

              {/* Preview */}
              <View style={styles.previewCard}>
                <LinearGradient
                  colors={["#F2F2F7", "#FFFFFF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.previewHeader, isLTR && { flexDirection: 'row' }]}
                >
                  <Ionicons name="notifications-outline" size={18} color={colors.primary} style={isLTR ? { marginRight: 6 } : { marginLeft: 6 }} />
                  <Text style={[styles.previewTitle, isLTR && { textAlign: 'left' }]}>{currentTitle || t.previewTitlePlaceholder}</Text>
                </LinearGradient>
                <Text style={[styles.previewContent, isLTR && { textAlign: 'left' }]}>{notificationContent || t.previewContentPlaceholder}</Text>
              </View>

              {/* Actions */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.secondaryButton]}
                  onPress={() => setOpen(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSend}
                  activeOpacity={0.85}
                  disabled={!canSend}
                  style={{ flex: 1 }}
                >
                  <LinearGradient
                    colors={canSend ? ["#0A84FF", "#5E5CE6"] : ["#B0B0B0", "#B0B0B0"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.primaryButton, (!canSend) && { opacity: 0.6 }]}
                  >
                    <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginLeft: 8 }} />
                    <Text style={styles.primaryButtonText}>{isSending ? t.sending : t.sendAll}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
            </View>
            {/* Dropdown removed in simplified UX */}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Dropdown Portal */}
      {/* Removed external portal modal to avoid double rendering; we render inside the sheet overlay above */}
    </>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    zIndex: 50,
    right: undefined,
  },
  fabWrapper: {
    alignSelf: 'flex-start',
  },
  fab: {
    maxWidth: 200,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  fabLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '92%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.22,
        shadowRadius: 28,
      },
      android: { elevation: 22 },
    }),
  },
  grabberContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D1D6',
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerCloseButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  content: {
    padding: 16,
    backgroundColor: '#FBFBFD',
  },
  label: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 8,
  },
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleDropdownWrap: {
    position: 'relative',
  },
  titleDropdownWrapOpen: {
    zIndex: 999,
    ...Platform.select({
      android: { elevation: 20 },
      ios: {},
    }),
  },
  dropdownText: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'right',
    flex: 1,
    marginLeft: 8,
  },
  dropdownPlaceholder: {
    color: Colors.subtext,
  },
  dropdownOptions: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginTop: 8,
    overflow: 'hidden',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 52,
    maxHeight: 280,
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
        android: { elevation: 24 },
    }),
  },
  customTitlePanel: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FAFAFA',
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownOptionLast: {
    borderBottomWidth: 0,
  },
  dropdownOptionTitle: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'right',
  },
  dropdownOptionDescription: {
    fontSize: 12,
    color: Colors.subtext,
    marginTop: 2,
    textAlign: 'right',
  },
  dropdownOptionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownList: {
    maxHeight: 280,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  textArea: {
    height: 120,
  },
  counter: {
    fontSize: 12,
    color: Colors.subtext,
    marginTop: 6,
    textAlign: 'left',
  },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 14,
    marginTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  previewHeader: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 6,
  },
  previewContent: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'right',
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    flexDirection: 'row',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  applyButton: {
    backgroundColor: '#0A84FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  portalRoot: {
    flex: 1,
  },
  portalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  portalDropdown: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    maxHeight: 320,
    overflow: 'hidden',
    zIndex: 9999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 24 },
    }),
  },
});


