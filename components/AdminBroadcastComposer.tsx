import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  StyleSheet,
  TextInput,
  Platform,
  Alert,
  ViewStyle,
  I18nManager,
} from 'react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
<<<<<<< HEAD
import { notificationsApi } from '@/lib/api/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
=======
import { messagesApi } from '@/lib/api/messages';
import { notificationsApi } from '@/lib/api/notifications';
import { useAuthStore } from '@/stores/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/src/theme/ThemeProvider';

// Composer: title + content; TTL is fixed server-side (see messagesApi).
>>>>>>> 43624e1412203f7b1cca622d4b860e0924ea9933

type AdminBroadcastComposerProps = {
  variant?: 'floating' | 'icon';
  iconContainerStyle?: ViewStyle;
  iconColor?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTrigger?: boolean;
};

export default function AdminBroadcastComposer({
  variant = 'floating',
  iconContainerStyle,
  iconColor,
  open,
  onOpenChange,
  renderTrigger = true,
}: AdminBroadcastComposerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const effectiveIconColor = iconColor ?? colors.primary;
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? !!open : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) onOpenChange?.(value);
    else setInternalOpen(value);
  };

  const isRTL = I18nManager.isRTL;
  const [title, setTitle] = useState('');
  const [notificationContent, setNotificationContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  const currentTitle = title.trim();
  const canSend = currentTitle.length > 0 && notificationContent.trim().length > 0 && !isSending;

<<<<<<< HEAD
  const strings = useMemo(
    () => ({
      triggerLabel: t('admin.broadcastComposer.triggerLabel'),
      headerTitle: t('admin.broadcastComposer.headerTitle'),
      subtitle: t('admin.broadcastComposer.subtitle'),
      titleLabel: t('admin.broadcastComposer.titleLabel'),
      titlePlaceholder: t('admin.broadcastComposer.titlePlaceholder'),
      contentLabel: t('admin.broadcastComposer.contentLabel'),
      contentPlaceholder: t('admin.broadcastComposer.contentPlaceholder'),
      previewHint: t('admin.broadcastComposer.previewHint'),
      previewTitlePlaceholder: t('admin.broadcastComposer.previewTitlePlaceholder'),
      previewContentPlaceholder: t('admin.broadcastComposer.previewContentPlaceholder'),
      cancel: t('admin.broadcastComposer.cancel'),
      sendAll: t('admin.broadcastComposer.sendAll'),
      sending: t('admin.broadcastComposer.sending'),
      error: t('admin.broadcastComposer.error'),
      errorFill: t('admin.broadcastComposer.errorFill'),
      success: t('admin.broadcastComposer.success'),
      successMsg: t('admin.broadcastComposer.successMsg'),
      ok: t('admin.broadcastComposer.ok'),
      failMsg: t('admin.broadcastComposer.failMsg'),
      accessibilitySend: t('admin.broadcastComposer.accessibilitySend'),
    }),
    [t]
  );
=======
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
        cancel: 'Cancel',
        sendAll: 'Send to all',
        sending: 'Sending...',
        error: 'Error',
        errorFill: 'Please fill in title and content',
        success: 'Success',
        successMsg: 'Home banner published and notifications sent to all clients with a phone number.',
        successNoRecipients:
          'Home banner published. No clients with a phone number were found — no notifications were sent.',
        successNotifyFailed:
          'Home banner published, but sending notifications failed. Check your connection and try again.',
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
      cancel: 'ביטול',
      sendAll: 'שלח לכולם',
      sending: 'שולח...',
      error: 'שגיאה',
      errorFill: 'אנא מלא את הכותרת והתוכן של ההתראה',
      success: 'הצלחה',
      successMsg: 'ההודעה פורסמה בדף הבית והתראות נשלחו לכל הלקוחות עם מספר טלפון.',
      successNoRecipients:
        'ההודעה פורסמה בדף הבית. לא נמצאו לקוחות עם מספר טלפון — לא נשלחו התראות.',
      successNotifyFailed:
        'ההודעה פורסמה בדף הבית, אך שליחת ההתראות נכשלה. בדוק חיבור ונסה שוב.',
      ok: 'אישור',
      failMsg: 'שגיאה בפרסום ההודעה. אנא נסה שוב.',
      accessibilitySend: 'שליחת הודעה ללקוחות',
    };
  }, [language]);
>>>>>>> 43624e1412203f7b1cca622d4b860e0924ea9933

  const resetState = () => {
    setTitle('');
    setNotificationContent('');
  };

  const handleSend = async () => {
    const finalTitle = currentTitle;
<<<<<<< HEAD
    const body = notificationContent.trim();
    if (!finalTitle || !body) {
      Alert.alert(strings.error, strings.errorFill);
=======
    if (!finalTitle || !notificationContent.trim()) {
      Alert.alert(t.error, t.errorFill);
>>>>>>> 43624e1412203f7b1cca622d4b860e0924ea9933
      return;
    }

    setIsSending(true);
    try {
<<<<<<< HEAD
      const success = await notificationsApi.sendNotificationToAllClients(finalTitle, body, 'general');
      if (success) {
        Alert.alert(strings.success, strings.successMsg, [
          {
            text: strings.ok,
            onPress: () => {
              setOpen(false);
              resetState();
            },
          },
        ]);
      } else {
        Alert.alert(strings.error, strings.failMsg);
      }
    } catch {
      Alert.alert(strings.error, strings.failMsg);
=======
      const created = await messagesApi.createMessage({
        title: finalTitle,
        content: notificationContent.trim(),
        userId: (currentUser as any)?.id || null,
      });
      if (!created) {
        Alert.alert(t.error, t.failMsg);
        return;
      }

      const notify = await notificationsApi.sendNotificationToAllClients(
        finalTitle,
        notificationContent.trim(),
        'general'
      );

      let body = t.successMsg;
      if (notify.ok && notify.recipientCount === 0) {
        body = t.successNoRecipients;
      } else if (!notify.ok) {
        body = t.successNotifyFailed;
      }

      Alert.alert(t.success, body, [
        { text: t.ok, onPress: () => { setOpen(false); resetState(); } },
      ]);
    } catch (e) {
      Alert.alert(t.error, t.failMsg);
>>>>>>> 43624e1412203f7b1cca622d4b860e0924ea9933
    } finally {
      setIsSending(false);
    }
  };

  const closeBtnSide = isRTL ? { left: 10 } : { right: 10 };
  const textAlign = isRTL ? 'right' : 'left';
  const labelAlign = isRTL ? 'right' : 'left';
  const iconSendMargin = isRTL ? { marginRight: 8 } : { marginLeft: 8 };

  return (
    <>
      {renderTrigger &&
        (variant === 'floating' ? (
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
              accessibilityLabel={strings.accessibilitySend}
              style={styles.fabWrapper}
            >
              <LinearGradient
                colors={[colors.primary, colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fab}
              >
                <Ionicons name="notifications-outline" size={18} color="#fff" style={iconSendMargin} />
                <Text style={styles.fabLabel} numberOfLines={1}>
                  {strings.triggerLabel}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={strings.accessibilitySend}
            style={[styles.iconButton, iconContainerStyle]}
          >
            <Ionicons name="notifications-outline" size={22} color={effectiveIconColor} />
          </TouchableOpacity>
        ))}

      <Modal visible={isOpen} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={styles.overlayDismiss} onPress={() => setOpen(false)} />
          <View style={styles.overlayCenter} pointerEvents="box-none">
            <View style={styles.sheet}>
              <LinearGradient
                colors={[colors.primary, colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sheetHeader}
              >
                <TouchableOpacity
                  style={[styles.headerCloseButton, closeBtnSide]}
                  onPress={() => setOpen(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>{strings.headerTitle}</Text>
              </LinearGradient>

<<<<<<< HEAD
              <KeyboardAwareScreenScroll
                style={{ flexGrow: 1, maxHeight: '100%' }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.content}
              >
                <Text style={[styles.subtitle, { textAlign: labelAlign }]}>{strings.subtitle}</Text>

                <View style={styles.sectionCard}>
                  <Text style={[styles.label, { textAlign: labelAlign }]}>{strings.titleLabel}</Text>
                  <TextInput
                    style={[styles.input, { textAlign }]}
                    placeholder={strings.titlePlaceholder}
=======
            <KeyboardAwareScreenScroll style={{ flexGrow: 1, maxHeight: '100%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              {/* Title */}
              <View style={styles.sectionCard}>
                <Text style={[styles.label, styles.labelAlignStart]}>{t.titleLabel}</Text>
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={[styles.input, styles.inputTextAlignStart]}
                    placeholder={t.customInputPlaceholder}
>>>>>>> 43624e1412203f7b1cca622d4b860e0924ea9933
                    placeholderTextColor={Colors.subtext}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={80}
<<<<<<< HEAD
                  />
                  <Text style={[styles.counter, isRTL ? styles.counterRtl : styles.counterLtr]}>
                    {title.length}/80
                  </Text>
=======
                    textAlign="left"
                  />
                  <Text style={[styles.counter, styles.counterAlignStart]}>{title.length}/80</Text>
>>>>>>> 43624e1412203f7b1cca622d4b860e0924ea9933
                </View>

<<<<<<< HEAD
                <View style={[styles.sectionCard, { marginTop: 14 }]}>
                  <Text style={[styles.label, { textAlign: labelAlign }]}>{strings.contentLabel}</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, { textAlign }]}
                    placeholder={strings.contentPlaceholder}
                    placeholderTextColor={Colors.subtext}
                    value={notificationContent}
                    onChangeText={setNotificationContent}
                    multiline
                    numberOfLines={6}
                    maxLength={500}
                    textAlignVertical="top"
                  />
                  <Text style={[styles.counter, isRTL ? styles.counterRtl : styles.counterLtr]}>
                    {notificationContent.length}/500
                  </Text>
                </View>

                <View style={styles.previewCard}>
                  <Text style={[styles.previewHint, { textAlign: labelAlign }]}>{strings.previewHint}</Text>
                  <View
                    style={[
                      styles.previewInner,
                      { flexDirection: isRTL ? 'row-reverse' : 'row' },
                    ]}
=======
              {/* Content */}
              <View style={[styles.sectionCard, { marginTop: 12 }]}>
                <Text style={[styles.label, styles.labelAlignStart]}>{t.contentLabel}</Text>
                <TextInput
                  style={[styles.input, styles.textArea, styles.inputTextAlignStart]}
                  placeholder={t.contentPlaceholder}
                  placeholderTextColor={Colors.subtext}
                  value={notificationContent}
                  onChangeText={setNotificationContent}
                  multiline
                  numberOfLines={6}
                  maxLength={500}
                  textAlign="left"
                  textAlignVertical="top"
                />
                <Text style={[styles.counter, styles.counterAlignStart]}>{notificationContent.length}/500</Text>
              </View>

              {/* Preview — same visual order as labels: icon + text from the left */}
              <View style={styles.previewCard}>
                <LinearGradient
                  colors={["#F2F2F7", "#FFFFFF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.previewHeader, styles.previewHeaderRow]}
                >
                  <Ionicons name="notifications-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.previewTitle, styles.previewTitleAlignStart]}>{currentTitle || t.previewTitlePlaceholder}</Text>
                </LinearGradient>
                <Text style={[styles.previewContent, styles.previewContentAlignStart]}>{notificationContent || t.previewContentPlaceholder}</Text>
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
>>>>>>> 43624e1412203f7b1cca622d4b860e0924ea9933
                  >
                    <Ionicons
                      name="notifications-outline"
                      size={20}
                      color={colors.primary}
                      style={isRTL ? { marginLeft: 10 } : { marginRight: 10 }}
                    />
                    <Text style={[styles.previewTitle, { textAlign }]} numberOfLines={2}>
                      {currentTitle || strings.previewTitlePlaceholder}
                    </Text>
                  </View>
                  <Text style={[styles.previewContent, { textAlign }]} numberOfLines={8}>
                    {notificationContent || strings.previewContentPlaceholder}
                  </Text>
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => setOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.secondaryButtonText}>{strings.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSend}
                    activeOpacity={0.85}
                    disabled={!canSend}
                    style={{ flex: 1 }}
                  >
                    <LinearGradient
                      colors={canSend ? [colors.primary, colors.primary] : ['#B0B0B0', '#B0B0B0']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.primaryButton, !canSend && { opacity: 0.55 }]}
                    >
                      <Ionicons name="send" size={18} color="#fff" style={iconSendMargin} />
                      <Text style={styles.primaryButtonText}>
                        {isSending ? strings.sending : strings.sendAll}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </KeyboardAwareScreenScroll>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

<<<<<<< HEAD
const createStyles = (colors: { primary: string; text?: string }) =>
  StyleSheet.create({
    fabContainer: {
      position: 'absolute',
      zIndex: 50,
      right: undefined,
    },
    fabWrapper: {
      alignSelf: 'flex-start',
    },
    fab: {
      maxWidth: 240,
      minHeight: 46,
      borderRadius: 23,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
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
    overlayDismiss: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    overlayCenter: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    sheet: {
      width: '100%',
      maxWidth: 400,
      maxHeight: '88%',
      backgroundColor: '#fff',
      borderRadius: 20,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.2,
          shadowRadius: 24,
        },
        android: { elevation: 18 },
      }),
    },
    sheetHeader: {
      paddingHorizontal: 48,
      paddingTop: 20,
      paddingBottom: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetTitle: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: 24,
    },
    headerCloseButton: {
      position: 'absolute',
      top: 12,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 20,
      backgroundColor: '#F5F5F7',
    },
    subtitle: {
      fontSize: 14,
      color: Colors.subtext,
      lineHeight: 21,
      marginBottom: 16,
    },
    label: {
      fontSize: 15,
      color: Colors.text,
      fontWeight: '700',
      marginBottom: 8,
    },
    input: {
      backgroundColor: '#fff',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E5E5EA',
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      color: Colors.text,
    },
    textArea: {
      minHeight: 128,
    },
    counter: {
      fontSize: 12,
      color: Colors.subtext,
      marginTop: 6,
    },
    counterRtl: {
      textAlign: 'left',
    },
    counterLtr: {
      textAlign: 'right',
    },
    sectionCard: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: '#E8E8ED',
    },
    previewCard: {
      backgroundColor: '#fff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E8E8ED',
      padding: 14,
      marginTop: 14,
    },
    previewHint: {
      fontSize: 12,
      fontWeight: '600',
      color: Colors.subtext,
      marginBottom: 10,
    },
    previewInner: {
      alignItems: 'center',
      marginBottom: 10,
    },
    previewTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: Colors.text,
    },
    previewContent: {
      fontSize: 15,
      color: Colors.subtext,
      lineHeight: 22,
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 18,
    },
    secondaryButton: {
      flex: 1,
      backgroundColor: '#fff',
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
      borderWidth: 1,
      borderColor: '#E5E5EA',
    },
    secondaryButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    primaryButton: {
      flex: 1,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
      flexDirection: 'row',
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
  });
=======
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
    marginBottom: 8,
  },
  /** Full row width so textAlign affects screen position (RN Text is intrinsic-width by default). */
  labelAlignStart: {
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  inputTextAlignStart: {
    textAlign: 'left',
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
    alignSelf: 'stretch',
  },
  counterAlignStart: {
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
    alignItems: 'center',
    marginBottom: 8,
  },
  previewHeaderRow: {
    flexDirection: 'row',
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
    marginBottom: 6,
    minWidth: 0,
  },
  previewTitleAlignStart: {
    flex: 1,
    textAlign: 'left',
  },
  previewContent: {
    fontSize: 14,
    color: Colors.subtext,
    lineHeight: 20,
    alignSelf: 'stretch',
  },
  previewContentAlignStart: {
    textAlign: 'left',
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


>>>>>>> 43624e1412203f7b1cca622d4b860e0924ea9933
