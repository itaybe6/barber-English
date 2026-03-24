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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { usersApi } from '@/lib/api/users';
import type { User as DbUser } from '@/lib/supabase';

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
  const [actionId, setActionId] = React.useState<string | null>(null);

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
            colors={['#F59E0B', '#EA580C', '#C2410C']}
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
              <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.9)" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <Modal
        animationType="slide"
        transparent
        visible={modalOpen}
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <View style={{ width: 36 }} />
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {t('admin.pendingClients.sheetTitle', 'Approve clients')}
              </Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>
              {t('admin.pendingClients.sheetHint', 'Approve to let them use the app, or remove the registration.')}
            </Text>

            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={pending}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>
                    {t('admin.pendingClients.empty', 'No pending clients')}
                  </Text>
                }
                renderItem={({ item }) => {
                  const busy = actionId === item.id;
                  return (
                    <View style={[styles.row, { borderColor: `${colors.primary}18` }]}>
                      <View style={styles.rowLeft}>
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.avatar} />
                        ) : (
                          <View style={[styles.avatarPh, { backgroundColor: `${colors.primary}18` }]}>
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
                          style={[styles.btnOutline, { borderColor: colors.textSecondary }]}
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
          </View>
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
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  bannerGradient: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  bannerShine: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
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
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  bannerSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e7',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHint: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 12,
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
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
    backgroundColor: '#fafafa',
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
