import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { messagesApi } from '@/lib/api/messages';
import { notificationsApi } from '@/lib/api/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import BroadcastOwnerOnlyModal from '@/components/BroadcastOwnerOnlyModal';

type AdminBroadcastComposerProps = {
  variant?: 'floating' | 'icon';
  iconContainerStyle?: ViewStyle;
  iconColor?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTrigger?: boolean;
  /** When set, opening the sheet and sending require this to resolve true (business owner / super-admin gate). */
  ensureCanBroadcast?: () => Promise<boolean>;
};

function darkenHex(hex: string, ratio: number): string {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = 1 - Math.max(0, Math.min(1, ratio));
  const to = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n * f)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export default function AdminBroadcastComposer({
  variant = 'floating',
  iconContainerStyle,
  iconColor,
  open,
  onOpenChange,
  renderTrigger = true,
  ensureCanBroadcast,
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
  const [ownerOnlyModalOpen, setOwnerOnlyModalOpen] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [contentFocused, setContentFocused] = useState(false);
  const closeOwnerOnlyModal = useCallback(() => setOwnerOnlyModalOpen(false), []);

  // Slide-in animation
  const slideAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isOpen) {
      Animated.spring(slideAnim, {
        toValue: 1,
        damping: 24,
        stiffness: 260,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [isOpen, slideAnim]);

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
    setTitleFocused(false);
    setContentFocused(false);
  };

  const handleSendWithConfirm = () => {
    if (!canSend) return;
    const confirmTitle = t('admin.broadcastComposer.confirmTitle', 'לשלוח לכל הלקוחות?');
    const confirmBody = t(
      'admin.broadcastComposer.confirmBody',
      'הודעה זו תישלח כעת לכל הלקוחות ותופיע גם בדף הבית.\n\nאפשר לערוך ולשלוח מחדש בכל זמן.',
    );
    Alert.alert(confirmTitle, confirmBody, [
      { text: strings.cancel, style: 'cancel' },
      { text: strings.sendAll, style: 'default', onPress: () => void handleSend() },
    ]);
  };

  const handleSend = async () => {
    const finalTitle = currentTitle;
    const body = notificationContent.trim();
    if (!finalTitle || !body) {
      Alert.alert(strings.error, strings.errorFill);
      return;
    }

    if (ensureCanBroadcast) {
      try {
        const allowed = await ensureCanBroadcast();
        if (!allowed) {
          setOwnerOnlyModalOpen(true);
          return;
        }
      } catch {
        Alert.alert(strings.error, strings.failMsg);
        return;
      }
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

  const textAlign = isRTL ? 'right' : 'left';
  const rowDir = isRTL ? { flexDirection: 'row-reverse' as const } : { flexDirection: 'row' as const };
  const rowDirReverse = isRTL ? { flexDirection: 'row' as const } : { flexDirection: 'row-reverse' as const };

  const openSheetIfAllowed = async () => {
    if (ensureCanBroadcast) {
      try {
        const allowed = await ensureCanBroadcast();
        if (!allowed) {
          setOwnerOnlyModalOpen(true);
          return;
        }
      } catch {
        Alert.alert(strings.error, strings.failMsg);
        return;
      }
    }
    setOpen(true);
  };

  const sheetTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  const now = new Date();
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <BroadcastOwnerOnlyModal visible={ownerOnlyModalOpen} onClose={closeOwnerOnlyModal} />

      {renderTrigger &&
        (variant === 'floating' ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.fabContainer,
              { top: Math.max(110, insets.top + 80), left: 10 },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => void openSheetIfAllowed()}
              accessibilityRole="button"
              accessibilityLabel={strings.accessibilitySend}
              style={styles.fabWrapper}
            >
              <LinearGradient
                colors={[colors.primary, darkenHex(colors.primary, 0.3)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fab}
              >
                <Ionicons name="megaphone-outline" size={17} color="#fff" style={{ marginEnd: 7 }} />
                <Text style={styles.fabLabel} numberOfLines={1}>
                  {strings.triggerLabel}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => void openSheetIfAllowed()}
            accessibilityRole="button"
            accessibilityLabel={strings.accessibilitySend}
            style={[styles.iconButton, iconContainerStyle]}
          >
            <Ionicons name="megaphone-outline" size={22} color={effectiveIconColor} />
          </TouchableOpacity>
        ))}

      <Modal
        visible={isOpen}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={{ flex: 1 }}>
          {/* Backdrop */}
          <Pressable style={styles.overlayDismiss} onPress={() => setOpen(false)} />

          {/* Sheet */}
          <Animated.View
            style={[
              styles.overlayBottom,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.sheet,
                { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 8) + 86 },
              ]}
            >
              {/* Drag handle */}
              <View style={styles.dragHandle} />

              {/* KeyboardAware scroll — all content except sticky bar */}
              <KeyboardAwareScreenScroll
                style={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
              >
                {/* ── Hero header ── */}
                <View style={styles.heroSection}>
                  {/* Close button */}
                  <TouchableOpacity
                    style={[styles.closeBtn, isRTL ? { left: 16 } : { right: 16 }]}
                    onPress={() => setOpen(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={strings.cancel}
                  >
                    <View style={[styles.closeBtnInner, { backgroundColor: `${colors.textSecondary}18` }]}>
                      <Ionicons name="close" size={16} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>

                  {/* Icon */}
                  <View style={[styles.heroIconWrap, { backgroundColor: `${colors.primary}14` }]}>
                    <LinearGradient
                      colors={[colors.primary, darkenHex(colors.primary, 0.28)]}
                      start={{ x: 0.1, y: 0 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.heroIconGradient}
                    >
                      <Ionicons name="megaphone" size={30} color="#fff" />
                    </LinearGradient>
                  </View>

                  <Text style={[styles.heroTitle, { color: colors.text }]}>
                    {strings.headerTitle}
                  </Text>
                  <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                    {strings.subtitle}
                  </Text>

                  {/* Audience chip */}
                  <View style={[styles.audienceChip, rowDir, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}22` }]}>
                    <Ionicons name="people" size={14} color={colors.primary} />
                    <Text style={[styles.audienceChipText, { color: colors.primary }]}>
                      {t('admin.broadcastComposer.audienceAllClients', 'לכל הלקוחות')}
                    </Text>
                  </View>
                </View>

                {/* ── Title field ── */}
                <View style={styles.sectionGroup}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary, textAlign }]}>
                    {strings.titleLabel.toUpperCase()}
                  </Text>
                  <View
                    style={[
                      styles.fieldCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: titleFocused ? colors.primary : `${colors.border}88`,
                        shadowColor: titleFocused ? colors.primary : '#000',
                        shadowOpacity: titleFocused ? 0.12 : 0.04,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.fieldInput, { color: colors.text }]}
                      placeholder={strings.titlePlaceholder}
                      placeholderTextColor={`${colors.textSecondary}80`}
                      value={title}
                      onChangeText={setTitle}
                      maxLength={80}
                      returnKeyType="next"
                      textAlign="right"
                      onFocus={() => setTitleFocused(true)}
                      onBlur={() => setTitleFocused(false)}
                    />
                    <Text style={[styles.charCounter, { color: `${colors.textSecondary}80` }]}>
                      {title.length}/80
                    </Text>
                  </View>
                </View>

                {/* ── Content field ── */}
                <View style={[styles.sectionGroup, { marginTop: 4 }]}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary, textAlign }]}>
                    {strings.contentLabel.toUpperCase()}
                  </Text>
                  <View
                    style={[
                      styles.fieldCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: contentFocused ? colors.primary : `${colors.border}88`,
                        shadowColor: contentFocused ? colors.primary : '#000',
                        shadowOpacity: contentFocused ? 0.12 : 0.04,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.fieldInput, styles.fieldInputMulti, { color: colors.text }]}
                      placeholder={strings.contentPlaceholder}
                      placeholderTextColor={`${colors.textSecondary}80`}
                      value={notificationContent}
                      onChangeText={setNotificationContent}
                      multiline
                      numberOfLines={5}
                      maxLength={500}
                      textAlignVertical="top"
                      textAlign="right"
                      onFocus={() => setContentFocused(true)}
                      onBlur={() => setContentFocused(false)}
                    />
                    <Text style={[styles.charCounter, { color: `${colors.textSecondary}80` }]}>
                      {notificationContent.length}/500
                    </Text>
                  </View>
                </View>

                {/* ── iOS Notification Preview ── */}
                <View style={[styles.sectionGroup, { marginTop: 4 }]}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary, textAlign }]}>
                    {strings.previewHint.toUpperCase()}
                  </Text>

                  {/* iOS notification widget */}
                  <View style={[styles.notifCard, { backgroundColor: Platform.OS === 'ios' ? 'rgba(242,242,247,0.97)' : '#F2F2F7' }]}>
                    {/* Top row: app icon + name + time */}
                    <View style={[styles.notifTopRow, rowDirReverse]}>
                      <View style={[rowDir, styles.notifAppRow]}>
                        <View style={[styles.notifAppIcon, { backgroundColor: colors.primary }]}>
                          <Ionicons name="notifications" size={11} color="#fff" />
                        </View>
                      </View>
                      <Text style={styles.notifTime}>{timeStr}</Text>
                    </View>

                    {/* Divider */}
                    <View style={styles.notifDivider} />

                    {/* Notification body */}
                    <Text style={[styles.notifTitle, { textAlign }]} numberOfLines={2}>
                      {currentTitle || strings.previewTitlePlaceholder}
                    </Text>
                    <Text style={[styles.notifBody, { textAlign }]} numberOfLines={4}>
                      {notificationContent || strings.previewContentPlaceholder}
                    </Text>
                  </View>
                </View>
              </KeyboardAwareScreenScroll>

              {/* ── Sticky action bar ── */}
              <View
                style={[
                  styles.actionBar,
                  {
                    backgroundColor: colors.background,
                    borderTopColor: `${colors.border}44`,
                    paddingBottom: Math.max(insets.bottom, 8),
                  },
                ]}
              >
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: `${colors.border}BB` }]}
                  onPress={() => setOpen(false)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                    {strings.cancel}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSendWithConfirm}
                  activeOpacity={canSend ? 0.88 : 1}
                  disabled={!canSend}
                  style={styles.sendBtnWrap}
                  accessibilityRole="button"
                  accessibilityLabel={strings.accessibilitySend}
                  accessibilityState={{ disabled: !canSend, busy: isSending }}
                >
                  <LinearGradient
                    colors={
                      canSend
                        ? [colors.primary, darkenHex(colors.primary, 0.3)]
                        : ['#C7C7CC', '#C7C7CC']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.sendBtn, !canSend && { opacity: 0.6 }]}
                  >
                    {isSending ? (
                      <Ionicons name="hourglass-outline" size={18} color="#fff" style={{ marginEnd: 8 }} />
                    ) : (
                      <Ionicons name="send" size={16} color="#fff" style={{ marginEnd: 8 }} />
                    )}
                    <Text style={styles.sendBtnText}>
                      {isSending ? strings.sending : strings.sendAll}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: { primary: string; text?: string }) =>
  StyleSheet.create({
    /* ─── FAB trigger ─── */
    fabContainer: {
      position: 'absolute',
      zIndex: 50,
    },
    fabWrapper: {
      alignSelf: 'flex-start',
    },
    fab: {
      maxWidth: 240,
      minHeight: 46,
      borderRadius: 23,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
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
      alignItems: 'center',
      justifyContent: 'center',
    },

    /* ─── Overlay ─── */
    overlayDismiss: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    overlayBottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'flex-end',
    },

    /* ─── Sheet ─── */
    sheet: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '99%',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
      alignSelf: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.14,
          shadowRadius: 30,
        },
        android: { elevation: 20 },
      }),
    },
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(60,60,67,0.25)',
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 4,
    },
    scrollContent: {
      paddingBottom: 16,
    },

    /* ─── Hero header ─── */
    heroSection: {
      alignItems: 'center',
      paddingTop: 20,
      paddingBottom: 22,
      paddingHorizontal: 20,
    },
    closeBtn: {
      position: 'absolute',
      top: 16,
      zIndex: 10,
    },
    closeBtnInner: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        },
        android: { elevation: 4 },
      }),
    },
    heroIconGradient: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.5,
      textAlign: 'center',
      lineHeight: 28,
    },
    heroSubtitle: {
      fontSize: 14,
      fontWeight: '400',
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 6,
      maxWidth: 280,
    },
    audienceChip: {
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      marginTop: 14,
    },
    audienceChipText: {
      fontSize: 13,
      fontWeight: '700',
    },

    /* ─── Form sections ─── */
    sectionGroup: {
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginStart: 4,
    },
    fieldCard: {
      borderRadius: 16,
      borderWidth: 1.5,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 8,
        },
        android: {},
      }),
    },
    fieldInput: {
      fontSize: 16,
      fontWeight: '400',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
      lineHeight: 22,
      textAlign: 'right',
    },
    fieldInputMulti: {
      minHeight: 120,
      paddingBottom: 10,
    },
    charCounter: {
      fontSize: 11,
      fontWeight: '500',
      textAlign: 'right',
      paddingEnd: 14,
      paddingBottom: 10,
    },

    /* ─── iOS Notification Preview ─── */
    notifCard: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.07,
          shadowRadius: 10,
        },
        android: { elevation: 2 },
      }),
    },
    notifTopRow: {
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    notifAppRow: {
      alignItems: 'center',
      gap: 6,
    },
    notifAppIcon: {
      width: 18,
      height: 18,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifAppName: {
      fontSize: 12,
      fontWeight: '600',
      color: 'rgba(60,60,67,0.7)',
    },
    notifTime: {
      fontSize: 12,
      color: 'rgba(60,60,67,0.5)',
      fontWeight: '400',
    },
    notifDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(60,60,67,0.15)',
      marginBottom: 8,
    },
    notifTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: '#1C1C1E',
      lineHeight: 20,
      marginBottom: 3,
    },
    notifBody: {
      fontSize: 13,
      fontWeight: '400',
      color: 'rgba(60,60,67,0.85)',
      lineHeight: 18,
    },

    /* ─── Action bar ─── */
    actionBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    cancelBtn: {
      flex: 0.9,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    cancelBtnText: {
      fontSize: 16,
      fontWeight: '600',
    },
    sendBtnWrap: {
      flex: 1.8,
    },
    sendBtn: {
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
        },
        android: { elevation: 4 },
      }),
    },
    sendBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
  });
