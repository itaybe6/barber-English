import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  Platform,
  Pressable,
  I18nManager,
} from 'react-native';
import { Phone, Trash2 } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import WaitlistClientCard from '@/components/WaitlistClientCard';
import { supabase, getBusinessId, WaitlistEntry } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import i18n from '@/src/config/i18n';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetSectionList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminWaitlistSheetStore } from '@/stores/adminWaitlistSheetStore';

const GC_SURFACE = '#FFFFFF';

function formatDateToLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWaitlistFetchRange(): { rangeStart: Date; rangeEnd: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 365);
  return { rangeStart: today, rangeEnd: end };
}

async function fetchWaitlistForRange(startDate: Date, endDate: Date, userId?: string): Promise<WaitlistEntry[]> {
  try {
    const startStr = formatDateToLocalString(startDate);
    const endStr = formatDateToLocalString(endDate);
    const businessId = getBusinessId();

    let query = supabase
      .from('waitlist_entries')
      .select('*')
      .eq('business_id', businessId)
      .gte('requested_date', startStr)
      .lte('requested_date', endStr)
      .eq('status', 'waiting');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query
      .order('requested_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching waitlist range:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchWaitlistForRange:', error);
    return [];
  }
}

async function deleteWaitlistEntry(entryId: string): Promise<boolean> {
  try {
    const businessId = getBusinessId();

    const { error } = await supabase
      .from('waitlist_entries')
      .delete()
      .eq('business_id', businessId)
      .eq('id', entryId);

    if (error) {
      console.error('Error deleting waitlist entry:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWaitlistEntry:', error);
    return false;
  }
}

async function makePhoneCall(phoneNumber: string) {
  try {
    const url = `tel:${phoneNumber}`;
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(i18n.t('error.generic', 'Error'), i18n.t('common.phoneOpenFailed', 'Unable to open the dialer on this device'));
    }
  } catch (error) {
    console.error('Error making phone call:', error);
    Alert.alert(i18n.t('error.generic', 'Error'), i18n.t('common.tryAgain', 'An error occurred. Please try again.'));
  }
}

function formatTimePreference(period?: 'morning' | 'afternoon' | 'evening' | 'any'): string {
  switch (period) {
    case 'morning':
      return i18n.t('time_period.morning', 'Morning');
    case 'afternoon':
      return i18n.t('time_period.afternoon', 'Afternoon');
    case 'evening':
      return i18n.t('time_period.evening', 'Evening');
    case 'any':
      return i18n.t('time_period.any', 'Any time');
    default:
      return '';
  }
}

async function fetchImagesForPhones(phones: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const { data: users, error: usersError } = await supabase.from('users').select('phone, image_url').in('phone', phones);
    if (!usersError && Array.isArray(users)) {
      users.forEach((u: any) => {
        if (u?.phone && u?.image_url) {
          map[u.phone] = u.image_url as string;
        }
      });
    }
  } catch {
    /* ignore */
  }
  return map;
}

interface WaitlistSection {
  date: string;
  data: WaitlistEntry[];
}

/**
 * Admin waitlist as a bottom sheet over the home tab so the dimmed backdrop sits on real home UI
 * (not a dedicated grey route). Open via `useAdminWaitlistSheetStore.getState().open()`.
 */
export function AdminWaitlistBottomSheet() {
  const isOpen = useAdminWaitlistSheetStore((s) => s.isOpen);
  const closeSheet = useAdminWaitlistSheetStore((s) => s.close);

  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [phoneToImage, setPhoneToImage] = useState<Record<string, string>>({});
  const { user } = useAuthStore();
  const colors = useColors();
  const { onPrimary } = usePrimaryContrast();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);

  const snapPoints = useMemo(() => ['93%'], []);

  const loadWaitlistRange = useCallback(async () => {
    setLoading(true);
    try {
      const { rangeStart, rangeEnd } = getWaitlistFetchRange();
      const data = await fetchWaitlistForRange(rangeStart, rangeEnd, user?.id);
      setWaitlist(data);
      const uniquePhones = Array.from(new Set((data || []).map((e) => e.client_phone).filter(Boolean)));
      if (uniquePhones.length > 0) {
        const imagesMap = await fetchImagesForPhones(uniquePhones);
        setPhoneToImage(imagesMap);
      } else {
        setPhoneToImage({});
      }
    } catch (error) {
      console.error('Error loading waitlist:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.waitlist.loadFailed', 'Could not load the waitlist'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      void loadWaitlistRange();
    }
  }, [isOpen, loadWaitlistRange]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { rangeStart, rangeEnd } = getWaitlistFetchRange();
      const data = await fetchWaitlistForRange(rangeStart, rangeEnd, user?.id);
      setWaitlist(data);
      const uniquePhones = Array.from(new Set((data || []).map((e) => e.client_phone).filter(Boolean)));
      if (uniquePhones.length > 0) {
        const imagesMap = await fetchImagesForPhones(uniquePhones);
        setPhoneToImage(imagesMap);
      } else {
        setPhoneToImage({});
      }
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  const handleSheetDismiss = useCallback(() => {
    closeSheet();
  }, [closeSheet]);

  const handleCallClient = async (phoneNumber: string) => {
    Alert.alert(t('admin.waitlist.contact', 'Contact'), t('admin.waitlist.callPrompt', 'Would you like to call this client?'), [
      { text: t('cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('admin.waitlist.call', 'Call'),
        onPress: () => makePhoneCall(phoneNumber),
      },
    ]);
  };

  const handleDelete = async (entryId: string) => {
    Alert.alert(t('admin.waitlist.deleteTitle', 'Delete entry'), t('admin.waitlist.deleteConfirm', 'Are you sure?'), [
      { text: t('cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('settings.services.delete', 'Delete'),
        style: 'destructive',
        onPress: async () => {
          const success = await deleteWaitlistEntry(entryId);
          if (success) {
            void loadWaitlistRange();
            Alert.alert(t('admin.waitlist.deleted', 'Deleted'), t('admin.waitlist.deleteSuccess', 'Entry deleted'));
          } else {
            Alert.alert(t('error.generic', 'Error'), t('admin.waitlist.deleteFailed', 'Delete failed'));
          }
        },
      },
    ]);
  };

  const waitlistByDate: Record<string, WaitlistEntry[]> = useMemo(() => {
    const map: Record<string, WaitlistEntry[]> = {};
    for (const entry of waitlist) {
      const key = entry.requested_date;
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    }
    return map;
  }, [waitlist]);

  const sections: WaitlistSection[] = useMemo(() => {
    const sortedDates = Object.keys(waitlistByDate).sort();
    return sortedDates.map((date) => ({
      date,
      data: waitlistByDate[date] ?? [],
    }));
  }, [waitlistByDate]);

  const appLocale = i18n.language?.startsWith('he') ? 'he-IL' : 'en-US';

  const DateHeader = useCallback(
    ({ date }: { date: string }) => {
      const dateObj = new Date(`${date}T12:00:00`);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      const isToday = dateObj.toDateString() === today.toDateString();
      const isTomorrow = dateObj.toDateString() === tomorrow.toDateString();

      let dateText = '';
      if (isToday) {
        dateText = t('today', 'Today');
      } else if (isTomorrow) {
        dateText = t('tomorrow', 'Tomorrow');
      } else {
        dateText = dateObj.toLocaleDateString(appLocale as any, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }

      return (
        <View style={styles.dateHeaderContainer}>
          <Text style={[styles.dateHeaderText, { color: colors.text }]}>{dateText}</Text>
          <View style={[styles.dateHeaderLine, { backgroundColor: 'rgba(0, 0, 0, 0.1)' }]} />
        </View>
      );
    },
    [t, appLocale, colors.text]
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.45} pressBehavior="close" />
    ),
    []
  );

  const sheetBg = useCallback(
    () => (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: GC_SURFACE,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          },
        ]}
      />
    ),
    []
  );

  const renderEntryCard = (entry: WaitlistEntry) => {
    const pref = formatTimePreference(entry.time_period);
    const timePreferenceLabel = pref || undefined;
    const contactLabel = String(t('admin.waitlist.contact', 'Contact'));
    const deleteLabel = String(t('settings.services.delete', 'Delete'));

    const iconStack = (
      <View style={styles.iconActionColumn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={contactLabel}
          onPress={() => handleCallClient(entry.client_phone)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.iconCircleBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
            Platform.OS === 'ios' ? styles.iconCircleBtnPrimaryIos : styles.iconCircleBtnPrimaryAndroid,
          ]}
        >
          <Phone size={16} color={onPrimary} strokeWidth={2.25} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          onPress={() => handleDelete(entry.id)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.iconCircleBtn,
            styles.iconCircleBtnDanger,
            {
              backgroundColor: pressed ? 'rgba(239, 68, 68, 0.82)' : colors.error,
            },
          ]}
        >
          <Trash2 size={16} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>
    );

    const cardBlock = (
      <View style={styles.cardContentFlex}>
        <WaitlistClientCard
          name={entry.client_name}
          image={phoneToImage[entry.client_phone] || ''}
          serviceName={entry.service_name}
          timePreferenceLabel={timePreferenceLabel}
        />
      </View>
    );

    return (
      <View style={styles.waitlistCardShadowWrap}>
        <View style={[styles.waitlistCard, { backgroundColor: colors.surface }]}>
          <View style={styles.cardInner}>
            {I18nManager.isRTL ? (
              <>
                {iconStack}
                {cardBlock}
              </>
            ) : (
              <>
                {cardBlock}
                {iconStack}
              </>
            )}
          </View>
        </View>
      </View>
    );
  };

  const listEmpty = loading ? (
    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
  ) : (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="hourglass-outline" size={22} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{t('admin.waitlist.emptyTitle', 'No waitlist entries')}</Text>
      <Text style={styles.emptySubtitle}>{t('admin.waitlist.emptySubtitle', 'No clients are waiting')}</Text>
    </View>
  );

  const listHeader = (
    <View style={styles.sheetTitleBlock}>
      <Text style={[styles.sheetTitle, { color: colors.primary }]}>{t('admin.waitlist.title', 'Waitlist')}</Text>
    </View>
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      index={0}
      enableDynamicSizing={false}
      onDismiss={handleSheetDismiss}
      backdropComponent={renderBackdrop}
      backgroundComponent={sheetBg}
      handleIndicatorStyle={{ backgroundColor: `${colors.text}30`, width: 40 }}
      enablePanDownToClose
      topInset={insets.top}
    >
      <BottomSheetSectionList<WaitlistEntry, WaitlistSection>
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => <DateHeader date={section.date} />}
        renderItem={({ item }) => <View style={styles.cardSectionRow}>{renderEntryCard(item)}</View>}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          styles.sheetScrollContent,
          { paddingBottom: Math.max(insets.bottom, 12) + 10 },
          sections.length === 0 && !loading ? styles.sheetScrollEmpty : undefined,
        ]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sheetScrollEmpty: {
    flexGrow: 1,
  },
  sheetTitleBlock: {
    paddingBottom: 8,
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dateHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 0,
    marginTop: 16,
    marginBottom: 18,
  },
  dateHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    marginEnd: 12,
    letterSpacing: -0.3,
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
  },
  cardSectionRow: {
    marginBottom: 8,
  },
  waitlistCardShadowWrap: {
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
    }),
  },
  waitlistCard: {
    borderRadius: 14,
    marginBottom: 0,
    borderWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  cardContentFlex: {
    flex: 1,
    minWidth: 0,
  },
  iconActionColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleBtnPrimaryIos: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  iconCircleBtnPrimaryAndroid: {
    elevation: 2,
  },
  iconCircleBtnDanger: {},
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyIconCircle: {
    backgroundColor: 'rgba(123,97,255,0.10)',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d1d1f',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
});
