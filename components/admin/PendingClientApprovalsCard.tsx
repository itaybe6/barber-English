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
  Dimensions,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_ANIM_MS = 500;
const SHEET_CLOSE_MS = 450;
const OFF_BOTTOM = Math.min(SCREEN_HEIGHT * 1.05, SCREEN_HEIGHT + 80);

interface ThemeColors {
  primary: string;
  secondary: string;
  text: string;
  textSecondary: string;
}

export function PendingClientApprovalsCard({ colors }: { colors: ThemeColors }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [pending, setPending] = React.useState<DbUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [displayModal, setDisplayModal] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);

  const translateY = useSharedValue(OFF_BOTTOM);

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
    translateY.value = OFF_BOTTOM;
    translateY.value = withTiming(0, {
      duration: SHEET_ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [modalOpen, translateY]);

  React.useEffect(() => {
    if (modalOpen || !displayModal) return;
    translateY.value = withTiming(
      OFF_BOTTOM,
      { duration: SHEET_CLOSE_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finishClose)();
      }
    );
  }, [modalOpen, displayModal, finishClose, translateY]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, OFF_BOTTOM], [0.48, 0], Extrapolate.CLAMP),
  }));

  const sheetSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: interpolate(translateY.value, [OFF_BOTTOM * 0.35, 0], [0, 1], Extrapolate.CLAMP),
  }));

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
                  <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
                </View>
              </View>
              <View style={styles.bannerTextCol}>
                <Text style={styles.bannerTitle}>{t('admin.pendingClients.bannerTitle', 'New clients')}</Text>
                <Text style={styles.bannerSub}>
                  {t('admin.pendingClients.bannerSubtitle', '{{count}} waiting for your approval', { count })}
                </Text>
              </View>
              <View style={styles.bannerChevronWrap}>
                <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.9)" />
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
                paddingBottom: insets.bottom + 12,
                maxHeight: SCREEN_HEIGHT * 0.88,
                minHeight: SCREEN_HEIGHT * 0.42,
              },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.sheetSurface,
                {
                  borderColor: `${colors.primary}14`,
                  shadowColor: colors.primary,
                },
              ]}
            >
              <View style={styles.dragHandleWrap}>
                <View style={[styles.dragHandle, { backgroundColor: `${colors.primary}33` }]} />
              </View>

              <View style={styles.sheetHeaderRow}>
                <View style={{ width: 44 }} />
                <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
                  {t('admin.pendingClients.sheetTitle', 'Approve clients')}
                </Text>
                <TouchableOpacity
                  onPress={requestClose}
                  style={[styles.closeFab, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('close', 'Close')}
                >
                  <AnimatedEntypo
                    name="cross"
                    size={20}
                    color="#FFFFFF"
                    entering={FadeIn.duration(280)}
                  />
                </TouchableOpacity>
              </View>

              <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>
                {t('admin.pendingClients.sheetHint', 'Approve to let them use the app, or remove the registration.')}
              </Text>

              <Animated.View
                layout={LinearTransition.duration(SHEET_ANIM_MS)}
                style={styles.sheetBody}
              >
                {loading ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                  </View>
                ) : (
                  <FlatList
                    style={styles.listFlex}
                    data={pending}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        {t('admin.pendingClients.empty', 'No pending clients')}
                      </Text>
                    }
                    renderItem={({ item }) => {
                      const busy = actionId === item.id;
                      return (
                        <View style={[styles.row, { borderColor: `${colors.primary}22`, backgroundColor: '#FAFBFC' }]}>
                          <View style={styles.rowLeft}>
                            {item.image_url ? (
                              <Image source={{ uri: item.image_url }} style={styles.avatar} />
                            ) : (
                              <View style={[styles.avatarPh, { backgroundColor: `${colors.primary}14` }]}>
                                <Ionicons name="person-outline" size={22} color={colors.primary} />
                              </View>
                            )}
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
                          <View style={styles.actions}>
                            <TouchableOpacity
                              style={[styles.btnOutline, { borderColor: `${colors.textSecondary}55` }]}
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
                              style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
                              onPress={() => onApprove(item.id)}
                              disabled={busy}
                            >
                              {busy ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.btnPrimaryText}>{t('admin.pendingClients.approve', 'Approve')}</Text>
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
  bannerChevronWrap: {
    opacity: 0.95,
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
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  closeFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  sheetHint: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 12,
    lineHeight: 19,
  },
  sheetBody: {
    flex: 1,
    minHeight: 120,
  },
  listFlex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 32,
    fontSize: 15,
  },
  row: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
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
  },
  btnOutline: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 100,
    alignItems: 'center',
  },
  btnOutlineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
