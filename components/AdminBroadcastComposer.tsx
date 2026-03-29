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
import { messagesApi } from '@/lib/api/messages';
import { notificationsApi } from '@/lib/api/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';

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
  const user = useAuthStore((s) => s.user);
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
      successNoRecipients: t('admin.broadcastComposer.successNoRecipients'),
      successNotifyFailed: t('admin.broadcastComposer.successNotifyFailed'),
      ok: t('admin.broadcastComposer.ok'),
      failMsg: t('admin.broadcastComposer.failMsg'),
      accessibilitySend: t('admin.broadcastComposer.accessibilitySend'),
    }),
    [t]
  );

  const resetState = () => {
    setTitle('');
    setNotificationContent('');
  };

  const handleSend = async () => {
    const finalTitle = currentTitle;
    const body = notificationContent.trim();
    if (!finalTitle || !body) {
      Alert.alert(strings.error, strings.errorFill);
      return;
    }

    setIsSending(true);
    try {
      const created = await messagesApi.createMessage({
        title: finalTitle,
        content: body,
        userId: user?.id ?? null,
      });
      if (!created) {
        Alert.alert(strings.error, strings.failMsg);
        return;
      }

      const notify = await notificationsApi.sendNotificationToAllClients(finalTitle, body, 'general');

      let msg = strings.successMsg;
      if (notify.ok && notify.recipientCount === 0) {
        msg = strings.successNoRecipients;
      } else if (!notify.ok) {
        msg = strings.successNotifyFailed;
      }

      Alert.alert(strings.success, msg, [
        {
          text: strings.ok,
          onPress: () => {
            setOpen(false);
            resetState();
          },
        },
      ]);
    } catch {
      Alert.alert(strings.error, strings.failMsg);
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
                    placeholderTextColor={Colors.subtext}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={80}
                  />
                  <Text style={[styles.counter, isRTL ? styles.counterRtl : styles.counterLtr]}>
                    {title.length}/80
                  </Text>
                </View>

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
