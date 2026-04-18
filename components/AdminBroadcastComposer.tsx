import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  Modal,
  StyleSheet,
  TextInput,
  Platform,
  ViewStyle,
  I18nManager,
  Animated,
  PanResponder,
  Dimensions,
  Keyboard,
  Easing,
  useWindowDimensions,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { messagesApi } from '@/lib/api/messages';
import { notificationsApi } from '@/lib/api/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import BroadcastOwnerOnlyModal from '@/components/BroadcastOwnerOnlyModal';
import ClientsListActionModal from '@/components/admin/ClientsListActionModal';
import { getHomeLogoSourceFromUrl } from '@/src/theme/assets';

type BroadcastComposerDialog =
  | null
  | { type: 'error'; message: string }
  | { type: 'success'; message: string };

type AdminBroadcastComposerProps = {
  variant?: 'floating' | 'icon';
  iconContainerStyle?: ViewStyle;
  iconColor?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTrigger?: boolean;
  /** When set, opening the sheet and sending require this to resolve true (business owner / super-admin gate). */
  ensureCanBroadcast?: () => Promise<boolean>;
  /** `business_profile.home_logo_url` — preview uses bundled logo when omitted or empty. */
  homeLogoUrl?: string | null;
};

const SHEET_OFFSCREEN_Y = Math.min(620, Math.round(Dimensions.get('window').height * 0.85));

/** Broadcast-to-all-clients limits (UI + insert payloads). */
const BROADCAST_TITLE_MAX_LEN = 40;
const BROADCAST_BODY_MAX_LEN = 130;

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
  homeLogoUrl,
}: AdminBroadcastComposerProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const colors = useColors();
  const { onPrimary } = usePrimaryContrast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  /** Taller sheet so step-1 title + multiline body fit without scrolling on typical phones */
  const broadcastSheetMaxHeight = useMemo(
    () => Math.min(Math.round(windowHeight * 0.94), windowHeight - 6),
    [windowHeight]
  );
  const actionBarReserve = Math.max(insets.bottom, 8) + 88;
  /** Step 1: cap scroll area so the sheet can shrink to content (avoids huge dead gap above the action bar). */
  const step1ScrollMaxHeight = useMemo(() => {
    const dragAndHandle = 52;
    return Math.max(260, broadcastSheetMaxHeight - actionBarReserve - dragAndHandle);
  }, [broadcastSheetMaxHeight, actionBarReserve]);
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
  const [dialog, setDialog] = useState<BroadcastComposerDialog>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const [contentFocused, setContentFocused] = useState(false);
  /** 1 = title + body; 2 = push-style preview only, then confirm send */
  const [composerStep, setComposerStep] = useState<1 | 2>(1);
  const closeOwnerOnlyModal = useCallback(() => setOwnerOnlyModalOpen(false), []);

  const [renderModal, setRenderModal] = useState(false);
  const translateY = useRef(new Animated.Value(SHEET_OFFSCREEN_Y)).current;
  const panStartTranslateY = useRef(0);

  /**
   * Do not tie sheet maxHeight to keyboard height: KeyboardAwareScrollView already adjusts insets,
   * and shrinking the sheet here caused double-offset — sheet jumped off-screen (keyboard + dim only).
   */
  const sheetMaxHeightApplied = broadcastSheetMaxHeight;

  const requestCloseSheet = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(translateY, {
      toValue: SHEET_OFFSCREEN_Y,
      duration: 280,
      easing: Easing.bezier(0.33, 0.99, 0.33, 1),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setRenderModal(false);
        setOpen(false);
      }
    });
  }, [setOpen, translateY]);

  /** Drag-to-dismiss: no extra exit animation — follows finger, then closes immediately. */
  const closeSheetAfterDrag = useCallback(() => {
    Keyboard.dismiss();
    translateY.stopAnimation();
    translateY.setValue(SHEET_OFFSCREEN_Y);
    setRenderModal(false);
    setOpen(false);
  }, [setOpen, translateY]);

  useLayoutEffect(() => {
    if (isOpen) {
      setRenderModal(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setComposerStep(1);
      translateY.setValue(SHEET_OFFSCREEN_Y);
      Animated.spring(translateY, {
        toValue: 0,
        damping: 24,
        stiffness: 260,
        useNativeDriver: false,
      }).start();
    }
  }, [isOpen, translateY]);

  useEffect(() => {
    if (!isOpen && renderModal) {
      Animated.timing(translateY, {
        toValue: SHEET_OFFSCREEN_Y,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setRenderModal(false);
      });
    }
  }, [isOpen, renderModal, translateY]);

  const dismissThreshold = useMemo(
    () => Math.min(140, Math.round(Dimensions.get('window').height * 0.18)),
    []
  );

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        /* Handle zone is only the grabber — claim touch immediately so movement tracks the finger without a dead zone. */
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, g: PanResponderGestureState) =>
          Math.abs(g.dy) > Math.abs(g.dx) * 0.55,
        onPanResponderGrant: () => {
          translateY.stopAnimation((v) => {
            panStartTranslateY.current = typeof v === 'number' ? v : 0;
          });
        },
        onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
          const next = Math.max(0, panStartTranslateY.current + g.dy);
          translateY.setValue(next);
        },
        onPanResponderRelease: (_: GestureResponderEvent, g: PanResponderGestureState) => {
          const end = Math.max(0, panStartTranslateY.current + g.dy);
          const shouldClose = end > dismissThreshold || g.vy > 1.1;
          if (shouldClose) {
            closeSheetAfterDrag();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              damping: 28,
              stiffness: 380,
              mass: 0.85,
              useNativeDriver: false,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 28,
            stiffness: 380,
            mass: 0.85,
            useNativeDriver: false,
          }).start();
        },
      }),
    [closeSheetAfterDrag, dismissThreshold, translateY]
  );

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, SHEET_OFFSCREEN_Y * 0.45, SHEET_OFFSCREEN_Y],
    outputRange: [1, 0.35, 0],
    extrapolate: 'clamp',
  });

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
      nextToPreview: t('admin.broadcastComposer.nextToPreview', 'המשך לתצוגה מקדימה'),
      backToEdit: t('admin.broadcastComposer.backToEdit', 'חזור'),
      accessibilityBackToEdit: t(
        'admin.broadcastComposer.accessibilityBackToEdit',
        'חזרה לעריכת ההודעה',
      ),
      previewConfirm: t('admin.broadcastComposer.previewConfirm', 'אישור'),
      accessibilityNextPreview: t(
        'admin.broadcastComposer.accessibilityNextPreview',
        'המשך לתצוגה המקדימה',
      ),
      accessibilityConfirmSend: t(
        'admin.broadcastComposer.accessibilityConfirmSend',
        'אישור ושליחה לכל הלקוחות',
      ),
      previewStepSubtitle: t(
        'admin.broadcastComposer.previewStepSubtitle',
        'כך תיראה ההתראה אצל הלקוחות.\nלחצו אישור לשליחה לכל הלקוחות.',
      ),
    }),
    [t]
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  const resetState = () => {
    setTitle('');
    setNotificationContent('');
    setTitleFocused(false);
    setContentFocused(false);
    setComposerStep(1);
  };

  const goToPreviewStep = () => {
    if (!canSend) return;
    Keyboard.dismiss();
    setComposerStep(2);
  };

  const handleSend = async () => {
    const finalTitle = currentTitle;
    const body = notificationContent.trim();
    if (!finalTitle || !body) {
      setDialog({ type: 'error', message: strings.errorFill });
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
        setDialog({ type: 'error', message: strings.failMsg });
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
        setDialog({ type: 'error', message: strings.failMsg });
        return;
      }

      const notify = await notificationsApi.sendNotificationToAllClients(finalTitle, body, 'home_broadcast');

      let msg = strings.successMsg;
      if (notify.ok && notify.recipientCount === 0) {
        msg = strings.successNoRecipients;
      } else if (!notify.ok) {
        msg = strings.successNotifyFailed;
      }

      setDialog({ type: 'success', message: msg });
    } catch {
      setDialog({ type: 'error', message: strings.failMsg });
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
        setDialog({ type: 'error', message: strings.failMsg });
        return;
      }
    }
    setOpen(true);
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const previewLogoSource = useMemo(() => getHomeLogoSourceFromUrl(homeLogoUrl), [homeLogoUrl]);

  const dialogTitle =
    dialog && typeof dialog === 'object' && dialog.type === 'error'
      ? strings.error
      : dialog && typeof dialog === 'object' && dialog.type === 'success'
        ? strings.success
        : '';
  const dialogMessage =
    dialog && typeof dialog === 'object' ? dialog.message : '';

  const handleDialogConfirm = () => {
    if (dialog && typeof dialog === 'object' && dialog.type === 'success') {
      resetState();
      requestCloseSheet();
    }
    closeDialog();
  };

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
        visible={renderModal}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={requestCloseSheet}
      >
        <View style={{ flex: 1 }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestCloseSheet}>
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.overlayDismiss,
                { opacity: backdropOpacity },
              ]}
            />
          </Pressable>

          {/* Sheet */}
          <Animated.View
            style={[
              styles.overlayBottom,
              { transform: [{ translateY }] },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: 'transparent',
                  paddingBottom: actionBarReserve,
                  maxHeight: sheetMaxHeightApplied,
                },
              ]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={[colors.background, colors.surface]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View
                style={styles.dragHandleZone}
                {...sheetPanResponder.panHandlers}
                accessibilityLabel={t('admin.broadcastComposer.dragToCloseA11y', 'גרור למטה לסגירה')}
              >
                <View style={styles.dragHandle} />
              </View>

              {composerStep === 1 ? (
              <KeyboardAwareScreenScroll
                style={{ alignSelf: 'stretch', maxHeight: step1ScrollMaxHeight, flexGrow: 0 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                enableAutomaticScroll
                enableOnAndroid
                extraScrollHeight={120}
                extraHeight={32}
                contentContainerStyle={styles.scrollContent}
                scrollEventThrottle={16}
                {...(Platform.OS === 'android' ? { nestedScrollEnabled: true } : {})}
              >
                  <>
                    {/* ── Hero header ── */}
                    <View style={[styles.heroSection, styles.heroSectionStep1]}>
                      <View
                        style={[
                          styles.heroIconWrap,
                          styles.heroIconWrapStep1,
                          { backgroundColor: `${colors.primary}14` },
                        ]}
                      >
                        <LinearGradient
                          colors={[colors.primary, darkenHex(colors.primary, 0.28)]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 0.9, y: 1 }}
                          style={styles.heroIconGradientStep1}
                        >
                          <Ionicons name="megaphone" size={26} color="#fff" />
                        </LinearGradient>
                      </View>

                      <Text style={[styles.heroTitle, { color: colors.text }]}>
                        {strings.headerTitle}
                      </Text>
                      <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                        {strings.subtitle}
                      </Text>

                      <View
                        style={[
                          styles.audienceChip,
                          rowDir,
                          { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}22` },
                        ]}
                      >
                        <Ionicons name="people" size={14} color={colors.primary} />
                        <Text style={[styles.audienceChipText, { color: colors.primary }]}>
                          {t('admin.broadcastComposer.audienceAllClients', 'לכל הלקוחות')}
                        </Text>
                      </View>
                    </View>

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
                          maxLength={BROADCAST_TITLE_MAX_LEN}
                          returnKeyType="next"
                          textAlign="right"
                          onFocus={() => setTitleFocused(true)}
                          onBlur={() => setTitleFocused(false)}
                        />
                        <Text style={[styles.charCounter, { color: `${colors.textSecondary}80` }]}>
                          {title.length}/{BROADCAST_TITLE_MAX_LEN}
                        </Text>
                      </View>
                    </View>

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
                          maxLength={BROADCAST_BODY_MAX_LEN}
                          textAlignVertical="top"
                          textAlign="right"
                          onFocus={() => setContentFocused(true)}
                          onBlur={() => setContentFocused(false)}
                        />
                        <Text style={[styles.charCounter, { color: `${colors.textSecondary}80` }]}>
                          {notificationContent.length}/{BROADCAST_BODY_MAX_LEN}
                        </Text>
                      </View>
                    </View>
                  </>
              </KeyboardAwareScreenScroll>
              ) : (
                <View style={styles.previewStepBody}>
                  <View style={styles.previewOnlySection}>
                    <Text style={[styles.previewOnlyTitle, { color: colors.text }]}>
                      {strings.previewHint}
                    </Text>
                    <Text style={[styles.previewOnlySubtitle, { color: colors.textSecondary }]}>
                      {strings.previewStepSubtitle}
                    </Text>
                    <View
                      style={[
                        styles.notifCard,
                        {
                          backgroundColor:
                            Platform.OS === 'ios' ? 'rgba(242,242,247,0.97)' : '#F2F2F7',
                          marginTop: 10,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: 'rgba(0,0,0,0.08)',
                        },
                      ]}
                    >
                      <View style={[styles.notifTopRow, rowDir]}>
                        <Text style={styles.notifTime}>{timeStr}</Text>
                        <View style={[rowDir, styles.notifAppRow]}>
                          <View style={[styles.notifAppIcon, { backgroundColor: colors.primary }]}>
                            <Ionicons name="notifications" size={11} color="#fff" />
                          </View>
                        </View>
                      </View>
                      <View style={styles.notifDivider} />
                      <View style={styles.notifBodyRow}>
                        <View
                          style={[
                            styles.notifLogoSquare,
                            { borderColor: `${colors.border}66`, backgroundColor: colors.background },
                          ]}
                        >
                          <Image
                            source={previewLogoSource}
                            style={styles.notifLogoImage}
                            resizeMode="contain"
                            accessibilityIgnoresInvertColors
                          />
                        </View>
                        <View style={styles.notifTextColumn}>
                          <Text style={[styles.notifTitle, { textAlign }]} numberOfLines={2}>
                            {currentTitle}
                          </Text>
                          <Text style={[styles.notifBody, { textAlign }]} numberOfLines={8}>
                            {notificationContent.trim()}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* ── Sticky action bar ── */}
              <View
                style={[
                  styles.actionBar,
                  {
                    backgroundColor: colors.surface,
                    borderTopColor: `${colors.border}44`,
                    paddingBottom: Math.max(insets.bottom, 8),
                  },
                ]}
              >
                {composerStep === 1 ? (
                  <>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { borderColor: `${colors.border}BB` }]}
                      onPress={requestCloseSheet}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                        {strings.cancel}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={goToPreviewStep}
                      activeOpacity={canSend ? 0.85 : 1}
                      disabled={!canSend}
                      style={[
                        styles.sendBtnWrap,
                        {
                          backgroundColor: canSend ? colors.primary : '#C7C7CC',
                          opacity: canSend ? 1 : 0.65,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={strings.accessibilityNextPreview}
                      accessibilityState={{ disabled: !canSend }}
                    >
                      <Text style={[styles.sendBtnText, { color: canSend ? onPrimary : '#fff' }]}>
                        {strings.nextToPreview}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.previewBackBtn,
                        {
                          borderColor: `${colors.primary}55`,
                          backgroundColor: colors.surface,
                          opacity: isSending ? 0.5 : 1,
                        },
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setComposerStep(1);
                      }}
                      activeOpacity={0.75}
                      disabled={isSending}
                      accessibilityRole="button"
                      accessibilityLabel={strings.accessibilityBackToEdit}
                    >
                      <Text style={[styles.previewBackBtnText, { color: colors.primary }]}>
                        {strings.backToEdit}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => void handleSend()}
                      activeOpacity={isSending ? 1 : 0.85}
                      disabled={isSending}
                      style={[
                        styles.sendBtnWrap,
                        {
                          backgroundColor: isSending ? '#C7C7CC' : colors.primary,
                          opacity: isSending ? 0.65 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={strings.accessibilityConfirmSend}
                      accessibilityState={{ disabled: isSending, busy: isSending }}
                    >
                      <Text style={[styles.sendBtnText, { color: isSending ? '#fff' : onPrimary }]}>
                        {isSending ? strings.sending : strings.previewConfirm}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </Animated.View>

          {dialog !== null ? (
            <ClientsListActionModal
              embedded
              visible
              title={dialogTitle}
              message={dialogMessage}
              showCancel={false}
              cancelText={strings.cancel}
              confirmText={strings.ok}
              confirmDestructive={false}
              onCancel={closeDialog}
              onConfirm={handleDialogConfirm}
            />
          ) : null}
        </View>
      </Modal>

      {dialog !== null && !renderModal ? (
        <ClientsListActionModal
          visible
          title={dialogTitle}
          message={dialogMessage}
          showCancel={false}
          cancelText={strings.cancel}
          confirmText={strings.ok}
          confirmDestructive={false}
          onCancel={closeDialog}
          onConfirm={handleDialogConfirm}
        />
      ) : null}
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
      position: 'relative',
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
    dragHandleZone: {
      paddingTop: 8,
      paddingBottom: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dragHandle: {
      width: 44,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: 'rgba(60,60,67,0.32)',
      alignSelf: 'center',
    },
    scrollContent: {
      paddingBottom: 12,
    },
    /** Step 2: light gray block like step-1 sheet bottom; no flex:1 — sheet hugs content (tighter to action bar). */
    previewStepBody: {
      alignSelf: 'stretch',
      flexGrow: 0,
      backgroundColor: colors.surface,
      paddingTop: 4,
      paddingBottom: 8,
    },
    previewOnlySection: {
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    previewOnlyTitle: {
      fontSize: 20,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    previewOnlySubtitle: {
      fontSize: 14,
      fontWeight: '400',
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 4,
      paddingHorizontal: 8,
    },

    /* ─── Hero header ─── */
    heroSection: {
      alignItems: 'center',
      paddingTop: 2,
      paddingBottom: 22,
      paddingHorizontal: 20,
    },
    /** Tighter header on step 1 so the message body field fits above the action bar */
    heroSectionStep1: {
      paddingBottom: 8,
      paddingTop: 0,
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
    heroIconWrapStep1: {
      width: 60,
      height: 60,
      borderRadius: 18,
      marginBottom: 8,
    },
    heroIconGradientStep1: {
      width: 52,
      height: 52,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      fontSize: 21,
      fontWeight: '800',
      letterSpacing: -0.5,
      textAlign: 'center',
      lineHeight: 26,
    },
    heroSubtitle: {
      fontSize: 13,
      fontWeight: '400',
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 4,
      maxWidth: 300,
    },
    audienceChip: {
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      marginTop: 8,
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
      /** ~6 lines at default font so the body field reads as “full” without scrolling */
      minHeight: 148,
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
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.16,
          shadowRadius: 16,
        },
        android: { elevation: 6 },
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
    notifBodyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    notifLogoSquare: {
      width: 44,
      height: 44,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      flexShrink: 0,
    },
    notifLogoImage: {
      width: '100%',
      height: '100%',
    },
    notifTextColumn: {
      flex: 1,
      minWidth: 0,
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
    previewBackBtn: {
      flex: 0.9,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        android: { elevation: 3 },
      }),
    },
    previewBackBtnText: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    sendBtnWrap: {
      flex: 1.8,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnText: {
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
  });
