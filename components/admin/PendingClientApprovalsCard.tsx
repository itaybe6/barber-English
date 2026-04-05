import * as React from 'react';
export interface PendingClientApprovalsCardHandle {
  open: () => void;
}
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  Image,
  TouchableWithoutFeedback,
  useWindowDimensions,
  I18nManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Entypo } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  Extrapolate,
  FadeIn,
  LinearTransition,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { usersApi } from '@/lib/api/users';
import { usePrimaryContrast } from '@/src/theme/ThemeProvider';
import type { User as DbUser } from '@/lib/supabase';

const AnimatedEntypo = Animated.createAnimatedComponent(Entypo);

const SHEET_ANIM_MS = 500;
const SHEET_CLOSE_MS = 450;

interface ThemeColors {
  primary: string;
  secondary: string;
  text: string;
  textSecondary: string;
}

interface Props {
  colors: ThemeColors;
  /** Increment (e.g. from home deep link) to open the approvals sheet when ready */
  openSheetNonce?: number;
  /** When true the inline gradient banner is suppressed (caller manages the trigger) */
  hideBanner?: boolean;
  /** Called whenever the pending count changes */
  onCountChange?: (count: number) => void;
}

export const PendingClientApprovalsCard = React.forwardRef<
  PendingClientApprovalsCardHandle,
  Props
>(function PendingClientApprovalsCard({
  colors,
  openSheetNonce = 0,
  hideBanner = false,
  onCountChange,
}, ref) {
  const { t } = useTranslation();
  const { onPrimary, onPrimaryMuted, primaryOnSurface } = usePrimaryContrast();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const offBottom = React.useMemo(
    () => Math.min(windowHeight * 1.05, windowHeight + 80),
    [windowHeight]
  );
  const sheetHeight = React.useMemo(
    () => Math.round(Math.min(windowHeight * 0.92, windowHeight - insets.top - 8)),
    [windowHeight, insets.top]
  );
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [pending, setPending] = React.useState<DbUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [displayModal, setDisplayModal] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);

  const translateY = useSharedValue(offBottom);
  const prevOpenSheetNonce = React.useRef(0);

  // Expose open() to parent via ref
  React.useImperativeHandle(ref, () => ({
    open: () => {
      setModalOpen(true);
      load();
    },
  }), [load]);

  const load = React.useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const list = await usersApi.getPendingClients();
      setPending(list);
      onCountChange?.(list.length);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [isAdmin, onCountChange]);

  React.useEffect(() => {
    if (openSheetNonce <= prevOpenSheetNonce.current) return;
    if (!isAdmin || !initialized) return;
    prevOpenSheetNonce.current = openSheetNonce;
    setModalOpen(true);
    load();
  }, [openSheetNonce, isAdmin, initialized, load]);

  React.useLayoutEffect(() => {
    if (!displayModal) {
      translateY.value = offBottom;
    }
  }, [offBottom, displayModal, translateY]);

  useFocusEffect(
    React.useCallback(() => {
      if (isAdmin) load();
    }, [isAdmin, load])
  );

  const finishClose = React.useCallback(() => {
    setDisplayModal(false);
  }, []);

  React.useEffect(() => {
    if (!modalOpen) return;
    setDisplayModal(true);
    translateY.value = offBottom;
    translateY.value = withTiming(0, {
      duration: SHEET_ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [modalOpen, translateY, offBottom]);

  React.useEffect(() => {
    if (modalOpen || !displayModal) return;
    translateY.value = withTiming(
      offBottom,
      { duration: SHEET_CLOSE_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finishClose)();
      }
    );
  }, [modalOpen, displayModal, finishClose, translateY, offBottom]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, offBottom], [0.48, 0], Extrapolate.CLAMP),
  }), [offBottom]);

  const sheetSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: interpolate(translateY.value, [offBottom * 0.35, 0], [0, 1], Extrapolate.CLAMP),
  }), [offBottom]);

  const requestClose = () => setModalOpen(false);

  const onApprove = async (id: string) => {
    setActionId(id);
    try {
      const updated = await usersApi.approveClient(id);
      if (!updated) {
        Alert.alert(t('error.generic', 'Error'), t('admin.pendingClients.approveError', 'Could not approve'));
        return;
      }
      setPending((prev) => prev.filter((u) => u.id !== id));
    } finally {
      setActionId(null);
    }
  };

  const onReject = (item: DbUser) => {
    Alert.alert(
      t('admin.pendingClients.rejectTitle', 'Decline registration'),
      t('admin.pendingClients.rejectMessage', 'Remove {{name}}? They will need to register again.', { name: item.name }),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('admin.pendingClients.rejectConfirm', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            setActionId(item.id);
            try {
              const done = await usersApi.deleteUser(item.id);
              if (!done) {
                Alert.alert(t('error.generic', 'Error'), t('admin.pendingClients.rejectError', 'Could not remove'));
                return;
              }
              setPending((prev) => prev.filter((u) => u.id !== item.id));
            } finally {
              setActionId(null);
            }
          },
        },
      ]
    );
  };

  if (!isAdmin || !initialized) {
    return null;
  }

  const count = pending.length;
  const actionsStacked = windowWidth < 420;
  const isRtl = I18nManager.isRTL;
  const rowDir = isRtl ? 'row-reverse' : 'row';

  const headerBalance = <View style={styles.headerSpacer} />;
  const headerCenterPill = (
    <View style={styles.sheetHeaderCenter}>
      <View
        style={[
          styles.pendingCountPill,
          {
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: 'rgba(15,23,42,0.12)',
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Text style={[styles.pendingCountPillText, { color: colors.text }]}>
            {t('admin.pendingClients.pendingCount', '{{count}} pending', { count })}
          </Text>
        )}
      </View>
    </View>
  );
  const closeHeaderButton = (
    <TouchableOpacity
      onPress={requestClose}
      style={[styles.closeFab, { backgroundColor: 'rgba(15,23,42,0.06)' }]}
      accessibilityRole="button"
      accessibilityLabel={t('close', 'Close')}
    >
      <AnimatedEntypo name="cross" size={22} color={colors.textSecondary} entering={FadeIn.duration(280)} />
    </TouchableOpacity>
  );

  return (
    <>
      {!hideBanner && count > 0 ? (
        <TouchableOpacity
          style={styles.bannerWrap}
          activeOpacity={0.92}
          onPress={() => {
            setModalOpen(true);
            load();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('admin.pendingClients.bannerA11y', 'New clients awaiting approval')}
        >
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerGradient}
          >
            <View style={styles.bannerShine} pointerEvents="none" />
            <View style={styles.bannerRow}>
              <View style={styles.bannerIconWrap}>
                <Ionicons name="person-add-outline" size={26} color={onPrimary} />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
                </View>
              </View>
              <View style={styles.bannerTextCol}>
                <Text style={[styles.bannerTitle, { color: onPrimary }]} numberOfLines={1}>
                  {t('admin.pendingClients.bannerTitle', 'New clients')}
                </Text>
                <Text style={[styles.bannerSub, { color: onPrimaryMuted }]} numberOfLines={2}>
                  {t('admin.pendingClients.bannerSubtitle', '{{count}} waiting for your approval', { count })}
                </Text>
              </View>
              <View style={styles.bannerChevronCircle}>
                <Ionicons name="chevron-back" size={20} color={onPrimary} />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={displayModal}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={requestClose}
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={requestClose}>
            <Animated.View style={[styles.backdropFill, backdropStyle]} />
          </TouchableWithoutFeedback>

          <Animated.View
            layout={LinearTransition.duration(SHEET_ANIM_MS)}
            style={[
              styles.sheetOuter,
              sheetSlideStyle,
              {
                height: sheetHeight,
                maxHeight: sheetHeight,
              },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.sheetSurface,
                {
                  borderColor: 'rgba(15,23,42,0.08)',
                  shadowColor: '#0f172a',
                },
              ]}
            >
              <View style={styles.dragHandleWrap}>
                <View style={[styles.dragHandle, { backgroundColor: 'rgba(15,23,42,0.18)' }]} />
              </View>

              <View style={styles.sheetHero}>
                <View style={styles.sheetHeroForeground}>
                  <View style={styles.sheetHeaderRow}>
                    {isRtl ? (
                      <>
                        {closeHeaderButton}
                        {headerCenterPill}
                        {headerBalance}
                      </>
                    ) : (
                      <>
                        {headerBalance}
                        {headerCenterPill}
                        {closeHeaderButton}
                      </>
                    )}
                  </View>

                  <View
                    style={[
                      styles.hintCallout,
                      {
                        borderColor: 'rgba(15,23,42,0.1)',
                        backgroundColor: '#FFFFFF',
                      },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color={colors.textSecondary}
                      style={styles.hintIcon}
                    />
                    <Text
                      style={[
                        styles.sheetHint,
                        { color: colors.textSecondary, textAlign: isRtl ? 'right' : 'left' },
                      ]}
                    >
                      {t('admin.pendingClients.sheetHint', 'Approve to let them use the app, or remove the registration.')}
                    </Text>
                  </View>
                </View>
              </View>

              <Animated.View layout={LinearTransition.duration(SHEET_ANIM_MS)} style={styles.sheetBody}>
                {loading ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size="large" color={primaryOnSurface} />
                    <Text style={[styles.loadingLabel, { color: colors.textSecondary }]}>
                      {t('admin.pendingClients.loading', 'Loading…')}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    style={styles.listFlex}
                    data={pending}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={[
                      styles.listContent,
                      { paddingBottom: insets.bottom + 20 },
                    ]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                      <View style={styles.emptyWrap}>
                        <View style={[styles.emptyIconWrap, { backgroundColor: `${colors.primary}12` }]}>
                          <Ionicons name="people-outline" size={36} color={primaryOnSurface} />
                        </View>
                        <Text style={[styles.empty, { color: colors.textSecondary }]}>
                          {t('admin.pendingClients.empty', 'No pending clients')}
                        </Text>
                      </View>
                    }
                    renderItem={({ item }) => {
                      const busy = actionId === item.id;
                      return (
                        <View
                          style={[
                            styles.row,
                            {
                              borderColor: 'rgba(15,23,42,0.08)',
                              backgroundColor: '#FFFFFF',
                            },
                          ]}
                        >
                          <View style={[styles.rowLeft, { flexDirection: rowDir }]}>
                            <View style={[styles.avatarRing, { borderColor: 'rgba(15,23,42,0.12)' }]}>
                              {item.image_url ? (
                                <Image source={{ uri: item.image_url }} style={styles.avatar} />
                              ) : (
                                <View style={[styles.avatarPh, { backgroundColor: 'rgba(15,23,42,0.06)' }]}>
                                  <Ionicons name="person-outline" size={22} color={colors.textSecondary} />
                                </View>
                              )}
                            </View>
                            <View style={[styles.rowText, isRtl ? styles.rowTextRtl : null]}>
                              <Text
                                style={[styles.name, { color: colors.text, textAlign: isRtl ? 'right' : 'left' }]}
                                numberOfLines={1}
                              >
                                {item.name}
                              </Text>
                              {item.phone ? (
                                <Text
                                  style={[styles.phone, { color: colors.textSecondary, textAlign: isRtl ? 'right' : 'left' }]}
                                >
                                  {item.phone}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                          <View
                            style={[
                              styles.actions,
                              actionsStacked && styles.actionsStacked,
                              !actionsStacked && { justifyContent: isRtl ? 'flex-start' : 'flex-end' },
                            ]}
                          >
                            {isRtl ? (
                              <>
                                <TouchableOpacity
                                  style={[
                                    styles.btnPrimary,
                                    { backgroundColor: colors.primary },
                                    actionsStacked && styles.btnFullWidth,
                                  ]}
                                  onPress={() => onApprove(item.id)}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <ActivityIndicator size="small" color={onPrimary} />
                                  ) : (
                                    <Text style={[styles.btnPrimaryText, { color: onPrimary }]}>
                                      {t('admin.pendingClients.approve', 'Approve')}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[
                                    styles.btnOutline,
                                    { borderColor: `${colors.textSecondary}40` },
                                    actionsStacked && styles.btnFullWidth,
                                  ]}
                                  onPress={() => onReject(item)}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <ActivityIndicator size="small" color={colors.textSecondary} />
                                  ) : (
                                    <Text style={[styles.btnOutlineText, { color: colors.textSecondary }]}>
                                      {t('admin.pendingClients.decline', 'Decline')}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              </>
                            ) : (
                              <>
                                <TouchableOpacity
                                  style={[
                                    styles.btnOutline,
                                    { borderColor: `${colors.textSecondary}40` },
                                    actionsStacked && styles.btnFullWidth,
                                  ]}
                                  onPress={() => onReject(item)}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <ActivityIndicator size="small" color={colors.textSecondary} />
                                  ) : (
                                    <Text style={[styles.btnOutlineText, { color: colors.textSecondary }]}>
                                      {t('admin.pendingClients.decline', 'Decline')}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[
                                    styles.btnPrimary,
                                    { backgroundColor: colors.primary },
                                    actionsStacked && styles.btnFullWidth,
                                  ]}
                                  onPress={() => onApprove(item.id)}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <ActivityIndicator size="small" color={onPrimary} />
                                  ) : (
                                    <Text style={[styles.btnPrimaryText, { color: onPrimary }]}>
                                      {t('admin.pendingClients.approve', 'Approve')}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>
                      );
                    }}
                  />
                )}
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  bannerWrap: {
    marginTop: 10,
    marginBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  bannerGradient: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  bannerShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.35)',
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 14,
  },
  bannerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  bannerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  bannerSub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 16,
  },
  bannerChevronCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
  },
  sheetOuter: {
    width: '100%',
  },
  sheetSurface: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: -12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  sheetHero: {
    position: 'relative',
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.08)',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  sheetHeroForeground: {
    position: 'relative',
    zIndex: 1,
    paddingBottom: 6,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  sheetHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minHeight: 44,
  },
  pendingCountPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingCountPillText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  hintCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  hintIcon: {
    marginTop: 1,
  },
  sheetHint: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  closeFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
  },
  listFlex: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    flexGrow: 1,
  },
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLabel: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  empty: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  row: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatarRing: {
    borderWidth: 2,
    borderRadius: 999,
    padding: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPh: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTextRtl: {
    alignItems: 'flex-end',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  phone: {
    fontSize: 14,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  actionsStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  btnFullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  btnOutline: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  btnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    minWidth: 108,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
