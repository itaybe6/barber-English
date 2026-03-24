import * as React from 'react';
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

export function PendingClientApprovalsCard({ colors }: { colors: ThemeColors }) {
  const { t } = useTranslation();
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

  React.useLayoutEffect(() => {
    if (!displayModal) {
      translateY.value = offBottom;
    }
  }, [offBottom, displayModal, translateY]);

  const load = React.useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const list = await usersApi.getPendingClients();
      setPending(list);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [isAdmin]);

  useFocusEffect(
    React.useCallback(() => {
      if (isAdmin) load();
    }, [isAdmin, load])
  );

  React.useEffect(() => {
    if (modalOpen && !loading && pending.length === 0) {
      setModalOpen(false);
    }
  }, [modalOpen, loading, pending.length]);

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

  return (
    <>
      {count > 0 ? (
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
                <Ionicons name="person-add-outline" size={26} color="#FFFFFF" />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
                </View>
              </View>
              <View style={styles.bannerTextCol}>
                <Text style={styles.bannerTitle} numberOfLines={1}>
                  {t('admin.pendingClients.bannerTitle', 'New clients')}
                </Text>
                <Text style={styles.bannerSub} numberOfLines={2}>
                  {t('admin.pendingClients.bannerSubtitle', '{{count}} waiting for your approval', { count })}
                </Text>
              </View>
              <View style={styles.bannerChevronCircle}>
                <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.95)" />
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
                  borderColor: `${colors.primary}18`,
                  shadowColor: colors.primary,
                },
              ]}
            >
              <View style={styles.dragHandleWrap}>
                <View style={[styles.dragHandle, { backgroundColor: `${colors.primary}40` }]} />
              </View>

              <View style={styles.sheetHero}>
                <LinearGradient
                  colors={[
                    `${colors.primary}1A`,
                    `${colors.primary}0D`,
                    'rgba(255,255,255,0.98)',
                    '#FFFFFF',
                  ]}
                  locations={[0, 0.35, 0.72, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.sheetHeroForeground}>
                  <View style={styles.sheetHeaderRow}>
                    <View style={styles.headerSpacer} />
                    <View style={styles.sheetTitleBlock}>
                      <View style={[styles.sheetTitleIconWrap, { backgroundColor: `${colors.primary}20` }]}>
                        <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
                      </View>
                      <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={2}>
                        {t('admin.pendingClients.sheetTitle', 'Approve clients')}
                      </Text>
                      <View
                        style={[
                          styles.pendingCountPill,
                          {
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: `${colors.primary}35`,
                          },
                        ]}
                      >
                        {loading ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text style={[styles.pendingCountPillText, { color: colors.text }]}>
                            {t('admin.pendingClients.pendingCount', '{{count}} pending', { count })}
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={requestClose}
                      style={[styles.closeFab, { backgroundColor: `${colors.primary}12` }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('close', 'Close')}
                    >
                      <AnimatedEntypo name="cross" size={22} color={colors.primary} entering={FadeIn.duration(280)} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.hintCallout, { borderColor: `${colors.primary}22`, backgroundColor: '#FFFFFF' }]}>
                    <Ionicons name="information-circle-outline" size={20} color={colors.primary} style={styles.hintIcon} />
                    <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>
                      {t('admin.pendingClients.sheetHint', 'Approve to let them use the app, or remove the registration.')}
                    </Text>
                  </View>
                </View>
              </View>

              <Animated.View layout={LinearTransition.duration(SHEET_ANIM_MS)} style={styles.sheetBody}>
                {loading ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
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
                          <Ionicons name="people-outline" size={36} color={colors.primary} />
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
                              borderColor: `${colors.primary}18`,
                              backgroundColor: '#FFFFFF',
                            },
                          ]}
                        >
                          <View style={styles.rowLeft}>
                            <View style={[styles.avatarRing, { borderColor: `${colors.primary}35` }]}>
                              {item.image_url ? (
                                <Image source={{ uri: item.image_url }} style={styles.avatar} />
                              ) : (
                                <View style={[styles.avatarPh, { backgroundColor: `${colors.primary}12` }]}>
                                  <Ionicons name="person-outline" size={22} color={colors.primary} />
                                </View>
                              )}
                            </View>
                            <View style={styles.rowText}>
                              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                                {item.name}
                              </Text>
                              {item.phone ? (
                                <Text style={[styles.phone, { color: colors.textSecondary }]}>{item.phone}</Text>
                              ) : null}
                              {item.email ? (
                                <Text style={[styles.email, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {item.email}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                          <View style={[styles.actions, actionsStacked && styles.actionsStacked]}>
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
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.btnPrimaryText}>
                                  {t('admin.pendingClients.approve', 'Approve')}
                                </Text>
                              )}
                            </TouchableOpacity>
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
}

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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  sheetTitleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 10,
  },
  sheetTitleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 26,
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
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  phone: {
    fontSize: 14,
    marginTop: 2,
  },
  email: {
    fontSize: 12,
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
