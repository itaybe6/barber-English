import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, Platform, Modal, ActivityIndicator, TextInput, FlatList, Alert, Linking, RefreshControl, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Colors from '@/constants/colors';
import { generateAppointments } from '@/constants/appointments';
import { services } from '@/constants/services';
import { clients } from '@/constants/clients';
// import { AvailableTimeSlot } from '@/lib/supabase'; // Not used in this file
import { supabase } from '@/lib/supabase';
import { businessProfileApi } from '@/lib/api/businessProfile';
import Card from '@/components/Card';
import { Calendar, Clock, ChevronLeft, ChevronRight, Star, Images, Store } from 'lucide-react-native';
import DaySelector from '@/components/DaySelector';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ScrollView as RNScrollView } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import AdminBroadcastComposer from '@/components/AdminBroadcastComposer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTimeFromDate } from '@/lib/utils/timeFormat';

// Using require for images to avoid TS module resolution issues for static assets
import CategoryBar from '@/components/CategoryBar';
import DesignCard from '@/components/DesignCard';
import DesignCarousel from '@/components/DesignCarousel';
import { useDesignsStore } from '@/stores/designsStore';
import DailySchedule from '@/components/DailySchedule';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationsStore } from '@/stores/notificationsStore';
import { getCurrentClientLogo } from '@/src/theme/assets';
import { useColors } from '@/src/theme/ThemeProvider';
import { useProductsStore } from '@/stores/productsStore';
import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Marquee } from '@animatereactnative/marquee';
import { manicureImages } from '@/src/constants/manicureImages';
import { ManicureMarqueeTile } from '@/components/ManicureMarqueeTile';
import MonthlyInsightsCard from '@/components/MonthlyInsightsCard';
import { PendingClientApprovalsCard, PendingClientApprovalsCardHandle } from '@/components/admin/PendingClientApprovalsCard';
import { clientAppointmentStatsApi } from '@/lib/api/clientAppointmentStats';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** Top band above marquee — matches `DailySchedule` today banner tone (+ room for glass action chips) */
const HERO_TOP_SCHEDULE_BAND_HEIGHT = 105;
/** Push marquee tiles down so they sit clearer under the schedule-tone band */
const HERO_MARQUEE_TRANSLATE_Y = 89;
/** Bottom corner radius of the hero schedule band (matches DailySchedule banner feel) */
const HERO_TOP_SCHEDULE_BAND_BOTTOM_RADIUS = 24;

function darkenHex(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = 1 - ratio;
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n * f))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
/** Tile size: balance ~3 visible marquee rows vs. sheet overlap */
const HERO_ITEM_SIZE = Platform.OS === 'web' ? SCREEN_WIDTH * 0.26 : SCREEN_WIDTH * 0.36;
const HERO_SPACING = Platform.OS === 'web' ? 12 : 6;
const HERO_BG = '#FFFFFF';
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.68);
const HERO_OVERLAP = 100; // how far the white sheet overlaps the hero
/** Logo overlay (align with `overlayLogoWrapper` top + `overlayLogoInner` height) */
const ADMIN_HOME_LOGO_TOP_OFFSET = -15;
const ADMIN_HOME_LOGO_HEIGHT = 78;
const ADMIN_HOME_LOGO_WIDTH = 200;

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunked: T[][] = [];
  let index = 0;
  const safeSize = Math.max(1, Math.floor(size));
  while (index < array.length) {
    chunked.push(array.slice(index, safeSize + index));
    index += safeSize;
  }
  return chunked;
}

const manicureHeroRootStyle = {
  position: 'absolute' as const,
  left: -SCREEN_WIDTH * 0.1,
  right: -SCREEN_WIDTH * 0.1,
  top: 0,
  bottom: 0,
  overflow: 'hidden' as const,
};

const ManicureMarqueeHero = React.memo(({ images }: { images: string[] }) => {
  const columns = useMemo(() => {
    const perColumn = Math.ceil(images.length / 3);
    return chunkArray(images, perColumn);
  }, [images]);

  return (
    <View style={manicureHeroRootStyle} pointerEvents="box-none">
      <View
        style={{
          flex: 1,
          gap: HERO_SPACING,
          transform: [{ translateY: HERO_MARQUEE_TRANSLATE_Y }],
        }}
        pointerEvents="auto"
      >
        {columns.map((column, columnIndex) => (
          <Marquee
            key={`manicure-marquee-admin-${columnIndex}`}
            speed={Platform.OS === 'web' ? 1 : 0.25}
            spacing={HERO_SPACING}
            reverse={columnIndex % 2 !== 0}
          >
            <View style={{ flexDirection: 'row', gap: HERO_SPACING }}>
              {column.map((image, index) => (
                <ManicureMarqueeTile
                  key={`manicure-image-admin-${columnIndex}-${index}-${image}`}
                  uri={image}
                  itemSize={HERO_ITEM_SIZE}
                  borderRadius={HERO_SPACING}
                  columnIndex={columnIndex}
                  index={index}
                />
              ))}
            </View>
          </Marquee>
        ))}
      </View>
    </View>
  );
});

function sanitizeUrlArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0);
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ openPendingClients?: string }>();
  const insets = useSafeAreaInsets();
  const designsFromStore = useDesignsStore((state) => state.designs);
  const isLoadingDesigns = useDesignsStore((state) => state.isLoading);
  const fetchDesigns = useDesignsStore((state) => state.fetchDesigns);
  
  const productsFromStore = useProductsStore((state) => state.products);
  const isLoadingProducts = useProductsStore((state) => state.isLoading);
  const fetchProducts = useProductsStore((state) => state.fetchProducts);

  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);
  const user = useAuthStore((state) => state.user);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const fetchUnread = useNotificationsStore((state) => state.fetchUnreadCount);
  const colors = useColors();
  const styles = createStyles(colors);

  const [heroImages, setHeroImages] = useState<string[] | null>(null);

  const loadHeroImages = useCallback(async () => {
    try {
      const p = await businessProfileApi.getProfile();
      const list = sanitizeUrlArray((p as any)?.home_hero_images);
      setHeroImages(list.length > 0 ? list : null);
    } catch {
      setHeroImages(null);
    }
  }, []);

  useEffect(() => {
    loadHeroImages();
  }, [loadHeroImages]);

  useFocusEffect(
    React.useCallback(() => {
      loadHeroImages();
    }, [loadHeroImages])
  );

  useFocusEffect(
    React.useCallback(() => {
      if (params.openPendingClients === '1') {
        setPendingApprovalsOpenNonce((n) => n + 1);
        router.setParams({ openPendingClients: undefined });
      }
    }, [params.openPendingClients, router])
  );

  const heroImagesResolved = useMemo(() => {
    const raw = heroImages ?? [];
    const web = raw.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
    const stock = [...manicureImages];
    if (web.length === 0) return stock;
    return [...web, ...stock];
  }, [heroImages]);

  useEffect(() => {
    if (user?.phone) {
      void fetchUnread(user.phone);
    }
  }, [user?.phone, fetchUnread]);

  useFocusEffect(
    React.useCallback(() => {
      if (user?.phone) {
        void fetchUnread(user.phone);
      }
    }, [user?.phone, fetchUnread])
  );

  // Ensure light status bar when this screen is focused
  useFocusEffect(
    React.useCallback(() => {
      try {
        setStatusBarStyle('light', true);
        setStatusBarBackgroundColor('transparent', true);
      } catch (e) {
        // noop
      }
      return () => {
        try {
          setStatusBarStyle('dark', true);
        } catch (e) {
          // noop
        }
      };
    }, [])
  );

  const [appointments] = useState(generateAppointments());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = React.useState('Gel Polish');
  const [nextAppointment, setNextAppointment] = useState<any | null>(null);
  const [loadingNextAppointment, setLoadingNextAppointment] = useState(true);
  const [todayAppointmentsCount, setTodayAppointmentsCount] = useState(0);
  const [loadingTodayCount, setLoadingTodayCount] = useState(true);
  const [showClientsModal, setShowClientsModal] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingClients, setLoadingClients] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [insightsData, setInsightsData] = useState({
    appointmentsThisMonth: 0,
    appointmentsToday: 0,
    newClientsThisMonth: 0,
  });
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [innerScrollEnabled, setInnerScrollEnabled] = useState(false);
  const innerScrollEnabledRef = useRef(false);
  const innerScrollRef = useRef<ScrollView>(null);
  const maxOuterScroll = HERO_HEIGHT - HERO_OVERLAP - insets.top - 60;
  const [blockedFilter, setBlockedFilter] = useState<'all' | 'blocked' | 'unblocked'>('all');
  const [clientStatsMap, setClientStatsMap] = useState<
    Record<string, { totalAppointments: number; avgMonthlySpend: number | null }>
  >({});
  const [pendingApprovalsOpenNonce, setPendingApprovalsOpenNonce] = useState(0);
  const [pendingClientsCount, setPendingClientsCount] = useState(0);
  const pendingCardRef = React.useRef<PendingClientApprovalsCardHandle>(null);
  const [waitlistWaitingCount, setWaitlistWaitingCount] = useState(0);

  /** Keeps the hero marquee visually fixed while it lives inside the outer ScrollView (enables pan gestures). */
  const outerScrollY = useSharedValue(0);
  const heroMarqueeCompensateStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: outerScrollY.value }],
  }));

  const formatClientMoney = useCallback(
    (amount: number) => {
      const locale = i18n.language?.startsWith('he') ? 'he-IL' : 'en-US';
      return `₪${Math.round(amount).toLocaleString(locale)}`;
    },
    [i18n.language]
  );
  const categories = [
    {
      key: 'Gel Polish',
      icon: (color: string) => <MaterialCommunityIcons name="bottle-tonic" size={22} color={color} />,
    },
    {
      key: 'Manicure',
      icon: (color: string) => <FontAwesome5 name="hand-sparkles" size={20} color={color} />,
    },
    {
      key: 'Toe Polish',
      icon: (color: string) => <MaterialCommunityIcons name="foot-print" size={22} color={color} />,
    },
    {
      key: 'Pedicure',
      icon: (color: string) => <MaterialCommunityIcons name="spa" size={22} color={color} />,
    },
  ];

  // Removed scroll-driven translate animation (normal scroll behavior)

  // Business profile for hero image
  // (hero media is now the marquee)
  
  // Get today's appointments
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const todayAppointments = appointments.filter(appointment => {
    const appointmentDate = new Date(appointment.appointment_date);
    return appointmentDate >= today && appointmentDate < tomorrow;
  }).sort((a, b) => {
    return new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime();
  });
  
  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.name : 'Unknown client';
  };

  const getClientImage = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client?.image || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330';
  };
  
  const getServiceName = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    return service ? service.name : 'Unknown service';
  };
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return formatTimeFromDate(date);
  };

  const formatTimeRange = (dateString: string) => {
    const date = new Date(dateString);
    const startTime = formatTimeFromDate(date);
    
    // Find the service to get duration
    const appointment = appointments.find(a => a.appointment_date === dateString);
    if (!appointment) return startTime;
    
    const service = services.find(s => s.id === appointment.service_id);
    if (!service) return startTime;
    
    // Calculate end time
    const endDate = new Date(date.getTime() + service.duration * 60000);
    const endTime = formatTimeFromDate(endDate);
    
    return `${startTime} — ${endTime}`;
  };
  
  // Fetch next appointment from database
  const fetchNextAppointment = async () => {
    if (isSuperAdmin) { setLoadingNextAppointment(false); return; }
    try {
      setLoadingNextAppointment(true);
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().split(' ')[0];

      // Get only today's upcoming booked appointments for the current admin user
      let query = supabase
        .from('appointments')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_available', false) // Only booked appointments
        .eq('slot_date', today) // Today only
        .gt('slot_time', currentTime) // After current time
        .order('slot_time');

      // Filter by current user - only appointments assigned to this barber
      if (user?.id) {
        query = query.eq('barber_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching next appointment:', error);
        setNextAppointment(null);
        return;
      }

      setNextAppointment((data?.length || 0) > 0 ? data![0] : null);
    } catch (error) {
      console.error('Error in fetchNextAppointment:', error);
      setNextAppointment(null);
    } finally {
      setLoadingNextAppointment(false);
    }
  };

  // Fetch today's appointments count
  const fetchTodayAppointmentsCount = async () => {
    if (isSuperAdmin) { setLoadingTodayCount(false); return; }
    try {
      setLoadingTodayCount(true);
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      const today = new Date().toISOString().split('T')[0];
      
      let query = supabase
        .from('appointments')
        .select('*')
        .eq('business_id', businessId)
        .eq('slot_date', today)
        .eq('is_available', false); // Only booked appointments

      // סינון לפי המשתמש הנוכחי - רק תורים שמוקצים לספר הזה
      if (user?.id) {
        query = query.eq('barber_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching today appointments count:', error);
        setTodayAppointmentsCount(0);
        return;
      }

      setTodayAppointmentsCount(data?.length || 0);
    } catch (error) {
      console.error('Error in fetchTodayAppointmentsCount:', error);
      setTodayAppointmentsCount(0);
    } finally {
      setLoadingTodayCount(false);
    }
  };

  const fetchInsightsData = async () => {
    if (isSuperAdmin) { setLoadingInsights(false); return; }
    try {
      setLoadingInsights(true);
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEndExclusiveIso = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const todayStr = now.toISOString().split('T')[0];

      let monthApptQuery = supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('is_available', false)
        .gte('slot_date', firstDayOfMonth)
        .lte('slot_date', lastDayOfMonth)
        .in('status', ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']);
      if (user?.id) monthApptQuery = monthApptQuery.eq('barber_id', user.id);

      let todayApptQuery = supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('is_available', false)
        .eq('slot_date', todayStr)
        .in('status', ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']);
      if (user?.id) todayApptQuery = todayApptQuery.eq('barber_id', user.id);

      const [monthApptRes, todayApptRes, newClientsRes] = await Promise.all([
        monthApptQuery,
        todayApptQuery,
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('user_type', 'client')
          .gte('created_at', monthStartIso)
          .lt('created_at', monthEndExclusiveIso),
      ]);

      if (monthApptRes.error) console.error('Error fetching month appointments count:', monthApptRes.error);
      if (todayApptRes.error) console.error('Error fetching today appointments count:', todayApptRes.error);
      if (newClientsRes.error) console.error('Error fetching new clients count:', newClientsRes.error);

      setInsightsData({
        appointmentsThisMonth: monthApptRes.error ? 0 : monthApptRes.count ?? 0,
        appointmentsToday: todayApptRes.error ? 0 : todayApptRes.count ?? 0,
        newClientsThisMonth: newClientsRes.error ? 0 : newClientsRes.count ?? 0,
      });

      // ספירת כל הממתינים (סטטוס waiting), בלי סינון תאריך
      const { count: wCount } = await supabase
        .from('waitlist_entries')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'waiting');
      setWaitlistWaitingCount(wCount ?? 0);
    } catch (error) {
      console.error('Error in fetchInsightsData:', error);
    } finally {
      setLoadingInsights(false);
    }
  };

  // Fetch clients
  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_type', 'client')
        .eq('business_id', businessId)
        .eq('client_approved', true)
        .order('name');

      if (error) {
        console.error('Error fetching clients:', error);
        setClientStatsMap({});
        return;
      }

      const list = data || [];
      setClients(list);
      setFilteredClients(list);

      const ids = list.map((c) => c.id).filter(Boolean);
      const stats = await clientAppointmentStatsApi.getStatsForClientIds(ids);
      setClientStatsMap(stats);
    } catch (error) {
      console.error('Error in fetchClients:', error);
      setClientStatsMap({});
    } finally {
      setLoadingClients(false);
    }
  };

  // Filter clients based on search query
  useEffect(() => {
    let filtered = clients;
    if (blockedFilter === 'blocked') {
      filtered = filtered.filter((c) => c.block === true);
    } else if (blockedFilter === 'unblocked') {
      filtered = filtered.filter((c) => !c.block);
    }
    if (searchQuery.trim() !== '') {
      filtered = filtered.filter((client) =>
        client.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredClients(filtered);
  }, [searchQuery, clients, blockedFilter]);

  // Handle phone call
  const handlePhoneCall = (phone: string) => {
    if (!phone) {
      Alert.alert(t('error.generic', 'Error'), t('clients.phoneUnavailable', 'Phone number is unavailable'));
      return;
    }

    Alert.alert(
      t('clients.call.title', 'Call'),
      t('clients.call.message', { phone }),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('clients.call.title', 'Call'),
          onPress: () => {
            Linking.openURL(`tel:${phone}`);
          },
        },
      ]
    );
  };

  const handleBlockClient = (client: any) => {
    Alert.alert(
      t('clients.block.title', 'Block Client'),
      t('clients.block.message', { name: client?.name || t('clients.thisClient', 'this client') }),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('confirm', 'Confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error } = await supabase
                .from('users')
                .update({ block: true })
                .eq('id', client.id)
                .select('*')
                .single();
              if (error) {
                console.error('Error blocking client:', error);
                Alert.alert(t('error.generic', 'Error'), t('clients.block.failed', 'Failed to block client'));
                return;
              }
              setClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
              setFilteredClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
              const name = data?.name || t('common.client', 'Client');
              Alert.alert(
                t('clients.block.successTitle', 'Client blocked'),
                t('clients.block.successMessage', { name })
              );
            } catch (e) {
              console.error('Error blocking client:', e);
              Alert.alert(t('error.generic', 'Error'), t('clients.block.failed', 'Failed to block client'));
            }
          },
        },
      ]
    );
  };

  const handleUnblockClient = (client: any) => {
    Alert.alert(
      t('clients.unblock.title', 'Unblock Client'),
      t('clients.unblock.message', { name: client?.name || t('clients.thisClient', 'this client') }),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('confirm', 'Confirm'),
          style: 'default',
          onPress: async () => {
            try {
              const { data, error } = await supabase
                .from('users')
                .update({ block: false })
                .eq('id', client.id)
                .select('*')
                .single();
              if (error) {
                console.error('Error unblocking client:', error);
                Alert.alert(t('error.generic', 'Error'), t('clients.unblock.failed', 'Failed to unblock client'));
                return;
              }
              setClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
              setFilteredClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
              const name = data?.name || t('common.client', 'Client');
              Alert.alert(
                t('clients.unblock.successTitle', 'Client unblocked'),
                t('clients.unblock.successMessage', { name })
              );
            } catch (e) {
              console.error('Error unblocking client:', e);
              Alert.alert(t('error.generic', 'Error'), t('clients.unblock.failed', 'Failed to unblock client'));
            }
          },
        },
      ]
    );
  };

  const openEditClient = (client: any) => {
    setEditingClient(client);
    setEditClientName(client?.name || '');
    setEditClientPhone(client?.phone || '');
    setShowEditClientModal(true);
  };

  const saveClientEdit = async () => {
    if (!editingClient) return;
    try {
      setSavingClient(true);
      const { data, error } = await supabase
        .from('users')
        .update({ name: editClientName.trim(), phone: editClientPhone.trim() })
        .eq('id', editingClient.id)
        .select('*')
        .single();
      if (error) {
        console.error('Error updating client:', error);
        Alert.alert(t('error.generic', 'Error'), t('clients.update.failed', 'Failed to update client'));
        return;
      }
      // Update local lists
      setClients((prev) => prev.map((c) => (c.id === editingClient.id ? data : c)));
      setFilteredClients((prev) => prev.map((c) => (c.id === editingClient.id ? data : c)));
      setShowEditClientModal(false);
      setEditingClient(null);
    } catch (e) {
      console.error('Error saving client edit:', e);
      Alert.alert(t('error.generic', 'Error'), t('clients.update.failed', 'Failed to update client'));
    } finally {
      setSavingClient(false);
    }
  };

  const handleDeleteClient = (client: any) => {
    Alert.alert(
      t('clients.delete.title', 'Delete Client'),
      t('clients.delete.message', { name: client?.name || t('clients.thisClient', 'this client') }),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('users').delete().eq('id', client.id);
              if (error) {
                console.error('Error deleting client:', error);
                Alert.alert(t('error.generic', 'Error'), t('clients.delete.failed', 'Failed to delete client'));
                return;
              }
              setClients((prev) => prev.filter((c) => c.id !== client.id));
              setFilteredClients((prev) => prev.filter((c) => c.id !== client.id));
            } catch (e) {
              console.error('Error deleting client:', e);
              Alert.alert(t('error.generic', 'Error'), t('clients.delete.failed', 'Failed to delete client'));
            }
          },
        },
      ]
    );
  };

  // Fetch data on component mount
  useEffect(() => {
    fetchNextAppointment();
    fetchTodayAppointmentsCount();
    fetchInsightsData();
    fetchDesigns();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const onRefresh = React.useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        fetchNextAppointment(),
        fetchTodayAppointmentsCount(),
        fetchInsightsData(),
        (async () => { try { await fetchDesigns(); } catch {} })(),
        (async () => { try { await fetchProducts(); } catch {} })(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [isAdmin]);

  // Products Section Component (rendered only for !isAdmin — admin uses edit-products)
  const ProductsSection = () => {
    if (isLoadingProducts) {
      return (
        <View style={{ paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ marginTop: 8, color: colors.textSecondary }}>{t('admin.products.loading','Loading products...')}</Text>
        </View>
      );
    }

    if (productsFromStore.length === 0) {
      return null; // Don't show anything if no products
    }

    return (
      <View style={{ marginBottom: 24 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 8 }}
          contentContainerStyle={{ flexDirection: 'row', gap: 12, paddingHorizontal: 8 }}
        >
          {productsFromStore.map((product) => (
            <View key={product.id} style={styles.productTile}>
              <View style={styles.productImageContainer}>
                {product.image_url ? (
                  <Image
                    source={{ uri: product.image_url }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.productPlaceholder}>
                    <Ionicons name="bag-outline" size={32} color={colors.textSecondary} />
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.7)']}
                  style={styles.productGradient}
                >
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
                </LinearGradient>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      {/* Hero - fixed behind scroll */}
      <View style={styles.fullScreenHero}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fullScreenHeroOverlay}
          pointerEvents="none"
        />
      </View>

      {/* Content ScrollView — marquee is first child + translateY(scroll) so it stays fixed and pan gestures work */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        pointerEvents="box-none"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: HERO_HEIGHT - HERO_OVERLAP }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          outerScrollY.value = y;
          const atTop = y >= maxOuterScroll - 4;
          if (atTop !== innerScrollEnabledRef.current) {
            innerScrollEnabledRef.current = atTop;
            setInnerScrollEnabled(atTop);
            if (!atTop) {
              innerScrollRef.current?.scrollTo({ y: 0, animated: false });
            }
          }
        }}
      >
        <Animated.View
          style={[
            styles.adminHeroMarqueeHost,
            heroMarqueeCompensateStyle,
          ]}
          pointerEvents="box-none"
          collapsable={false}
        >
          <ManicureMarqueeHero images={heroImagesResolved} />
        </Animated.View>
        {/* Content wrapper — fixed height so outer scroll stops below header */}
        <View style={[styles.contentWrapper, { height: SCREEN_HEIGHT - insets.top - 60 }]}>
          {/* Drag handle indicator */}
          <View style={styles.dragHandle} />
          {/* Subtle top-edge shadow line for separation */}
          <LinearGradient
            colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.sheetTopShadow}
            pointerEvents="none"
          />
          <ScrollView
            ref={innerScrollRef}
            nestedScrollEnabled
            scrollEnabled={innerScrollEnabled}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          >
            <View style={styles.scrollContent}>

        {/* ── DAILY SCHEDULE ── */}
        <View style={styles.dailyScheduleWrap}>
          <DailySchedule
            nextAppointment={nextAppointment}
            loading={loadingNextAppointment}
            onRefresh={fetchNextAppointment}
            todayAppointmentsCount={todayAppointmentsCount}
            loadingTodayCount={loadingTodayCount}
            variant="card"
          />
        </View>

        {/* hidden card — renders only the bottom-sheet modal; trigger via ref */}
        <PendingClientApprovalsCard
          ref={pendingCardRef}
          colors={colors}
          openSheetNonce={pendingApprovalsOpenNonce}
          hideBanner
          onCountChange={setPendingClientsCount}
        />

        {/* ── Quick: gallery · broadcast · products + waitlist ── */}
        {isAdmin && (
          <View style={styles.quickTilesGrid}>
            <View style={styles.quickTilesRow}>
              <TouchableOpacity
                style={[styles.quickTile, { backgroundColor: `${colors.primary}0F` }]}
                activeOpacity={0.82}
                onPress={() => router.push('/(tabs)/edit-gallery')}
                accessibilityRole="button"
                accessibilityLabel={t('admin.gallery.edit', 'עריכת גלריה')}
              >
                <View style={[styles.quickTileIconWrap, { backgroundColor: `${colors.primary}1C` }]}>
                  <Images size={22} color={colors.primary} strokeWidth={2.35} />
                </View>
                <Text style={[styles.quickTileLabel, { color: colors.text }]} numberOfLines={2}>
                  {t('admin.gallery.edit', 'עריכת גלריה')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickTile, { backgroundColor: `${colors.primary}0F` }]}
                activeOpacity={0.82}
                onPress={() => setShowBroadcast(true)}
                accessibilityRole="button"
              >
                <View style={[styles.quickTileIconWrap, { backgroundColor: `${colors.primary}1C` }]}>
                  <Ionicons name="megaphone-outline" size={24} color={colors.primary} />
                </View>
                <Text style={[styles.quickTileLabel, { color: colors.text }]} numberOfLines={2}>
                  {t('admin.home.broadcastTile')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickTile, { backgroundColor: `${colors.primary}0F` }]}
                activeOpacity={0.82}
                onPress={() => router.push('/(tabs)/edit-products')}
                accessibilityRole="button"
                accessibilityLabel={t('admin.products.homeEdit', 'עריכת מוצרים')}
              >
                <View style={[styles.quickTileIconWrap, { backgroundColor: `${colors.primary}1C` }]}>
                  <Store size={22} color={colors.primary} strokeWidth={2.35} />
                </View>
                <Text style={[styles.quickTileLabel, { color: colors.text }]} numberOfLines={2}>
                  {t('admin.products.homeEdit', 'עריכת מוצרים')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* שורה שנייה: רשימת המתנה — מלבן רחב */}
            <TouchableOpacity
              style={[styles.waitlistTile, { backgroundColor: `${colors.primary}0F` }]}
              activeOpacity={0.82}
              onPress={() => router.push('/(tabs)/waitlist')}
              accessibilityRole="button"
            >
              {/* LTR: מונה משמאל | רווח | כותרת+סאב צמודים לאייקון | אייקון מימין (לא לזוז) */}
              <View style={styles.waitlistTileCount}>
                <Text style={[styles.waitlistTileCountNum, { color: colors.primary }]}>
                  {waitlistWaitingCount}
                </Text>
                <Text style={[styles.waitlistTileCountLabel, { color: colors.textSecondary }]}>
                  {t('admin.waitlist.waitingLabel', 'ממתינים')}
                </Text>
              </View>
              <View style={styles.waitlistTileSpacer} />
              <View style={styles.waitlistTileInfo}>
                <Text
                  style={[
                    styles.waitlistTileTitle,
                    { color: colors.text },
                    i18n.language?.startsWith('he') ? styles.waitlistTileTextHe : styles.waitlistTileTextEn,
                  ]}
                  numberOfLines={1}
                >
                  {t('admin.waitlist.title', 'רשימת המתנה')}
                </Text>
                <Text
                  style={[
                    styles.waitlistTileSub,
                    { color: colors.textSecondary },
                    i18n.language?.startsWith('he') ? styles.waitlistTileTextHe : styles.waitlistTileTextEn,
                  ]}
                  numberOfLines={2}
                >
                  {t('admin.waitlist.viewAndManage', 'צפייה וניהול לקוחות ממתינים')}
                </Text>
              </View>
              <View style={[styles.quickTileIconWrap, { backgroundColor: `${colors.primary}1C` }]}>
                <Ionicons name="hourglass-outline" size={24} color={colors.primary} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── MONTHLY INSIGHTS CHART ── */}
        {isAdmin && (
          <MonthlyInsightsCard
            appointmentsThisMonth={insightsData.appointmentsThisMonth}
            appointmentsToday={insightsData.appointmentsToday}
            newClientsThisMonth={insightsData.newClientsThisMonth}
            loading={loadingInsights}
            colors={colors}
          />
        )}

        {/* ── GALLERY SECTION ── */}
        {isAdmin && (
          <View style={styles.galleryCard}>
            {(designsFromStore?.length ?? 0) > 0 ? (
              <View style={styles.galleryCardHeader}>
                <Text style={[styles.galleryCardTitle, { color: colors.text }]}>
                  {t('admin.gallery.title', 'גלרייה')}
                </Text>
              </View>
            ) : null}
            {isLoadingDesigns ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
            ) : (designsFromStore?.length ?? 0) === 0 ? (
              <View style={styles.galleryEmpty}>
                <View style={[styles.galleryEmptyIconWrap, { backgroundColor: `${colors.primary}14` }]}>
                  <Ionicons name="images-outline" size={34} color={colors.primary} />
                </View>
                <Text style={[styles.galleryEmptyTitle, { color: colors.text }]}>
                  {t('admin.gallery.homeEmptyTitle')}
                </Text>
                <Text style={[styles.galleryEmptySubtitle, { color: colors.textSecondary }]}>
                  {t('admin.gallery.homeEmptySubtitle')}
                </Text>
                <TouchableOpacity
                  style={[styles.galleryEmptyCta, { backgroundColor: colors.primary }]}
                  activeOpacity={0.88}
                  onPress={() => router.push('/(tabs)/edit-gallery')}
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.gallery.homeEmptyCta')}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.galleryEmptyCtaText}>{t('admin.gallery.homeEmptyCta')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <DesignCarousel designs={designsFromStore as any} showHeader={false} />
            )}
          </View>
        )}

        {/* ── PRODUCTS SECTION (admin) ── */}
        {isAdmin && (
          <View style={styles.galleryCard}>
            {(productsFromStore?.length ?? 0) > 0 ? (
              <View style={styles.galleryCardHeader}>
                <Text style={[styles.galleryCardTitle, { color: colors.text }]}>
                  {t('admin.products.homeTitle', 'מוצרים')}
                </Text>
              </View>
            ) : null}
            {isLoadingProducts ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
            ) : (productsFromStore?.length ?? 0) === 0 ? (
              <View style={styles.galleryEmpty}>
                <View style={[styles.galleryEmptyIconWrap, { backgroundColor: `${colors.primary}14` }]}>
                  <Ionicons name="bag-outline" size={34} color={colors.primary} />
                </View>
                <Text style={[styles.galleryEmptyTitle, { color: colors.text }]}>
                  {t('admin.products.homeEmptyTitle', 'עדיין אין מוצרים בחנות')}
                </Text>
                <Text style={[styles.galleryEmptySubtitle, { color: colors.textSecondary }]}>
                  {t('admin.products.homeEmptySubtitle', 'הוסיפו מוצרים כדי שהלקוחות יראו את המבצעים שלכם.')}
                </Text>
                <TouchableOpacity
                  style={[styles.galleryEmptyCta, { backgroundColor: colors.primary }]}
                  activeOpacity={0.88}
                  onPress={() => router.push('/(tabs)/edit-products')}
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.products.homeEmptyCta', 'הוספת מוצר')}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.galleryEmptyCtaText}>{t('admin.products.homeEmptyCta', 'הוספת מוצר')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.productAdminCarousel}
                contentContainerStyle={styles.productAdminCarouselContent}
              >
                {productsFromStore.map((product) => {
                  const priceStr = product.price % 1 === 0
                    ? `₪${product.price.toFixed(0)}`
                    : `₪${product.price.toFixed(2)}`;
                  return (
                    <TouchableOpacity
                      key={product.id}
                      onPress={() => router.push('/(tabs)/edit-products')}
                      activeOpacity={0.88}
                      style={styles.productAdminTile}
                    >
                      <View style={styles.productAdminImageWrap}>
                        {product.image_url ? (
                          <Image
                            source={{ uri: product.image_url }}
                            style={styles.productAdminImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.productAdminPlaceholder}>
                            <Ionicons name="bag-outline" size={40} color="#8E8E93" />
                          </View>
                        )}
                        <LinearGradient
                          pointerEvents="none"
                          colors={['rgba(0,0,0,0.5)', 'transparent']}
                          locations={[0, 0.65]}
                          style={styles.productAdminOverlayGradientTop}
                        />
                        <LinearGradient
                          pointerEvents="none"
                          colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
                          locations={[0.15, 0.55, 1]}
                          style={styles.productAdminOverlayGradient}
                        />
                        <View style={styles.productAdminPricePillWrap} pointerEvents="none">
                          <View style={[styles.productAdminPricePill, { backgroundColor: colors.primary }]}>
                            <Text style={styles.productAdminPrice}>{priceStr}</Text>
                          </View>
                        </View>
                        <View style={styles.productAdminNameWrap} pointerEvents="none">
                          <Text style={styles.productAdminNameOverlay} numberOfLines={2}>
                            {product.name}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* ── PRODUCTS SECTION (non-admin only) ── */}
        {!isAdmin && <ProductsSection />}
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Top schedule-tone band + glass chips (notifications L, pending clients R — LTR physical sides) */}
      <View
        pointerEvents="box-none"
        style={[
          styles.heroTopScheduleBand,
          {
            height: HERO_TOP_SCHEDULE_BAND_HEIGHT,
            borderBottomLeftRadius: HERO_TOP_SCHEDULE_BAND_BOTTOM_RADIUS,
            borderBottomRightRadius: HERO_TOP_SCHEDULE_BAND_BOTTOM_RADIUS,
          },
        ]}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <LinearGradient
            colors={[colors.primary, `${colors.primary}CC`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {Platform.OS !== 'web' ? (
            <BrandLavaLampBackground
              primaryColor={colors.primary}
              baseColor={darkenHex(colors.primary, 0.22)}
              layoutWidth={SCREEN_WIDTH}
              layoutHeight={HERO_TOP_SCHEDULE_BAND_HEIGHT}
              count={4}
              duration={10500}
              blurIntensity={28}
            />
          ) : null}
        </View>

        {isAdmin ? (
          <View style={styles.heroBandGlassRow} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.heroBandGlassTouchable}
              activeOpacity={0.88}
              onPress={() => router.push('/(tabs)/notifications')}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.title', 'Notifications')}
            >
              {Platform.OS === 'web' ? (
                <View style={[styles.heroBandGlassBlurFill, { backgroundColor: 'rgba(255,255,255,0.32)' }]} />
              ) : (
                <BlurView intensity={42} tint="light" style={styles.heroBandGlassBlurFill} />
              )}
              <View style={styles.heroBandGlassInner}>
                <View style={styles.heroBandGlassIconSlot}>
                  <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
                  {unreadCount > 0 ? (
                    <View style={styles.heroBandGlassBadge}>
                      <Text style={styles.heroBandGlassBadgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.heroBandGlassTouchable}
              activeOpacity={0.88}
              onPress={() => pendingCardRef.current?.open()}
              accessibilityRole="button"
              accessibilityLabel={t('admin.pendingClients.bannerA11y')}
            >
              {Platform.OS === 'web' ? (
                <View style={[styles.heroBandGlassBlurFill, { backgroundColor: 'rgba(255,255,255,0.32)' }]} />
              ) : (
                <BlurView intensity={42} tint="light" style={styles.heroBandGlassBlurFill} />
              )}
              <View style={styles.heroBandGlassInner}>
                <View style={styles.heroBandGlassIconSlot}>
                  <Ionicons name="person-add-outline" size={22} color="#FFFFFF" />
                  {pendingClientsCount > 0 ? (
                    <View style={styles.heroBandGlassBadge}>
                      <Text style={styles.heroBandGlassBadgeText}>
                        {pendingClientsCount > 99 ? '99+' : pendingClientsCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Overlay Header - always on top of scroll */}
      <SafeAreaView edges={['top']} style={styles.overlayHeader} pointerEvents="box-none">
        <View style={styles.overlayHeaderContent} pointerEvents="box-none">
          {/* Left: spacer (broadcast moved to home quick-actions card) */}
          <View style={styles.headerSide} />
          {/* Center placeholder */}
          <View style={styles.headerCenter} />
          <View style={styles.headerSide} />
        </View>
      </SafeAreaView>

      {/* Logo overlay (white tint on primary band) */}
      <View
        pointerEvents="none"
        style={[styles.overlayLogoWrapper, { top: insets.top + ADMIN_HOME_LOGO_TOP_OFFSET }]}
      >
        <View style={styles.overlayLogoInner}>
          <Image source={getCurrentClientLogo()} style={styles.overlayLogo} resizeMode="contain" />
        </View>
      </View>

       {/* Image Preview Modal for Admin */}
       <Modal
         animationType="fade"
         transparent
         visible={!!previewImageUrl}
         onRequestClose={() => setPreviewImageUrl(null)}
       >
         <View style={styles.imagePreviewOverlay}>
           <View style={styles.imagePreviewHeader}>
             <TouchableOpacity
               style={styles.imagePreviewCloseButton}
               onPress={() => setPreviewImageUrl(null)}
               activeOpacity={0.8}
             >
               <Ionicons name="close" size={26} color="#fff" />
             </TouchableOpacity>
           </View>
           {previewImageUrl && (
             <Image
               source={{ uri: previewImageUrl }}
               style={styles.imagePreview}
               resizeMode="contain"
             />
           )}
         </View>
       </Modal>

       {/* Clients Modal */}
       <Modal
         animationType="slide"
         transparent={true}
         visible={showClientsModal}
         onRequestClose={() => setShowClientsModal(false)}
       >
         <View style={styles.modalOverlay}>
            <View style={styles.clientsModal}>
              <View style={styles.modalHeader}>
                <View style={{ width: 36, height: 36 }} />
                <Text style={styles.modalTitle}>{t('clients.listTitle','Clients List')}</Text>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setShowClientsModal(false)}
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

             {/* Search Bar */}
             <View style={styles.searchContainer}>
               <Ionicons name="search" size={20} color={colors.primary} style={styles.searchIcon} />
               <TextInput
                 style={styles.searchInput}
                 placeholder={t('common.searchByName','Search by name...')}
                 placeholderTextColor={colors.textSecondary}
                 value={searchQuery}
                 onChangeText={setSearchQuery}
               />
             </View>

             {/* Blocked Filter */}
             <View style={styles.filterRow}>
               <TouchableOpacity
                 onPress={() => setBlockedFilter('all')}
                 style={[styles.filterButton, blockedFilter === 'all' && styles.filterButtonActive]}
                 activeOpacity={0.85}
               >
                 <Text style={[styles.filterButtonText, blockedFilter === 'all' && styles.filterButtonTextActive]}>{t('clients.filter.all','All')}</Text>
               </TouchableOpacity>
               <TouchableOpacity
                 onPress={() => setBlockedFilter('blocked')}
                 style={[styles.filterButton, blockedFilter === 'blocked' && styles.filterButtonActive]}
                 activeOpacity={0.85}
               >
                 <Text style={[styles.filterButtonText, blockedFilter === 'blocked' && styles.filterButtonTextActive]}>{t('clients.filter.blocked','Blocked')}</Text>
               </TouchableOpacity>
               <TouchableOpacity
                 onPress={() => setBlockedFilter('unblocked')}
                 style={[styles.filterButton, blockedFilter === 'unblocked' && styles.filterButtonActive]}
                 activeOpacity={0.85}
               >
                 <Text style={[styles.filterButtonText, blockedFilter === 'unblocked' && styles.filterButtonTextActive]}>{t('clients.filter.unblocked','Unblocked')}</Text>
               </TouchableOpacity>
             </View>

             {/* Clients List */}
             {loadingClients ? (
               <View style={styles.loadingContainer}>
                 <ActivityIndicator size="large" color={colors.primary} />
                 <Text style={styles.loadingText}>{t('clients.loading','Loading clients...')}</Text>
               </View>
              ) : (
                 <FlatList
                  style={{ flex: 1 }}
                  data={filteredClients}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const stats = clientStatsMap[item.id];
                    const totalAppts = stats?.totalAppointments ?? 0;
                    const avgMo = stats?.avgMonthlySpend;
                    return (
                   <View style={styles.clientItem}>
                     <View style={styles.clientInfo}>
                       <Text style={styles.modalClientName} numberOfLines={1} ellipsizeMode="tail">
                         {item.name}
                       </Text>
                       {item.phone ? (
                         <Text style={styles.clientPhone} numberOfLines={1} ellipsizeMode="tail">
                           {item.phone}
                         </Text>
                       ) : null}
                       <View
                         style={styles.clientStatsPanel}
                         accessibilityLabel={t('clients.stats.a11yCard', '{{name}}: {{visits}} visits, {{spend}}', {
                           name: item.name || '',
                           visits: totalAppts,
                           spend:
                             avgMo != null
                               ? formatClientMoney(avgMo)
                               : t('clients.stats.noSpendShort', 'No data'),
                         })}
                       >
                         <View style={styles.statBox}>
                           <View style={[styles.statIconCircle, { backgroundColor: `${colors.primary}18` }]}>
                             <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                           </View>
                           <Text style={styles.statBoxValue}>{totalAppts}</Text>
                           <Text style={styles.statBoxLabel}>
                             {t('clients.stats.visitsShort', 'Visits')}
                           </Text>
                         </View>
                         <View style={styles.statBoxDivider} />
                         <View style={styles.statBox}>
                           <View style={[styles.statIconCircle, { backgroundColor: `${colors.primary}18` }]}>
                             <Ionicons name="wallet-outline" size={18} color={colors.primary} />
                           </View>
                           <Text
                             style={[styles.statBoxValue, avgMo == null && styles.statBoxValueMuted]}
                             numberOfLines={1}
                           >
                             {avgMo != null ? formatClientMoney(avgMo) : '—'}
                           </Text>
                           <Text style={styles.statBoxLabel}>
                             {t('clients.stats.avgMonthShort', 'Avg / month')}
                           </Text>
                         </View>
                       </View>
                     </View>
                     <View style={styles.clientActionsRow}>
                       <TouchableOpacity
                         style={styles.phoneButton}
                         onPress={() => handlePhoneCall(item.phone)}
                         accessibilityRole="button"
                         accessibilityLabel={t('clients.call.title', 'Call')}
                       >
                         <Ionicons name="call" size={20} color={colors.primary} />
                       </TouchableOpacity>
                       <TouchableOpacity
                         style={styles.blockButton}
                         onPress={() => (item.block ? handleUnblockClient(item) : handleBlockClient(item))}
                         activeOpacity={0.85}
                         accessibilityRole="button"
                         accessibilityLabel={
                           item.block
                             ? t('clients.unblock.title', 'Unblock Client')
                             : t('clients.block.title', 'Block Client')
                         }
                       >
                         <Text style={styles.blockButtonText}>
                           {item.block
                             ? t('clients.actions.unblock', 'Unblock')
                             : t('clients.actions.block', 'Block')}
                         </Text>
                       </TouchableOpacity>
                     </View>
                   </View>
                    );
                  }}
                   showsVerticalScrollIndicator={true}
                   contentContainerStyle={[styles.clientsList, { paddingBottom: insets.bottom + 24 }]}
                />
             )}
           </View>
         </View>
       </Modal>

      {isAdmin && (
        <AdminBroadcastComposer
          open={showBroadcast}
          onOpenChange={setShowBroadcast}
          renderTrigger={false}
        />
      )}
    </View>
  );
 }

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentWrapper: {
    zIndex: 3,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 18,
  },
  /** Marquee inside outer ScrollView; translateY offsets scroll so tiles stay pinned under the status area */
  adminHeroMarqueeHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
    zIndex: 2,
    overflow: 'hidden',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetTopShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 20,
  },
  /* ─── Daily Schedule ─── */
  dailyScheduleWrap: {
    marginTop: 12,
    marginBottom: 4,
  },
  broadcastBannerWrap: {
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
  broadcastBannerGradient: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  broadcastBannerShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.35)',
  },
  broadcastBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 14,
  },
  broadcastBannerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  broadcastBannerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  broadcastBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'left',
  },
  broadcastBannerSub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 16,
    textAlign: 'left',
  },
  broadcastBannerChevronWrap: {
    opacity: 0.95,
  },
  /* ─── Quick Tiles (3 + waitlist) ─── */
  quickTilesGrid: {
    marginTop: 14,
    marginBottom: 6,
    gap: 10,
  },
  quickTilesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  waitlistTile: {
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    ...({ direction: 'ltr' } as const),
    alignItems: 'center',
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  waitlistTileInfo: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '52%',
    gap: 2,
    alignItems: 'flex-end',
  },
  waitlistTileSpacer: {
    flex: 1,
    minWidth: 6,
  },
  waitlistTileTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    alignSelf: 'stretch',
  },
  waitlistTileSub: {
    fontSize: 12,
    fontWeight: '500',
    alignSelf: 'stretch',
    lineHeight: 16,
  },
  waitlistTileTextHe: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  waitlistTileTextEn: {
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  waitlistTileCount: {
    alignItems: 'center',
    minWidth: 56,
    flexShrink: 0,
  },
  waitlistTileCountNum: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 30,
  },
  waitlistTileCountLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 13,
    marginTop: 2,
  },
  quickTile: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  quickTileIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  quickTileLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
    letterSpacing: -0.1,
  },
  quickTileBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  quickTileBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  /* ─── Gallery Card ─── */
  galleryCard: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.11,
        shadowRadius: 14,
      },
      android: { elevation: 5 },
    }),
  },
  galleryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  galleryCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  galleryEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  galleryEditIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryEditBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  galleryEmpty: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  galleryEmptyIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  galleryEmptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
    marginBottom: 8,
    lineHeight: 24,
  },
  galleryEmptySubtitle: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    maxWidth: 300,
  },
  galleryEmptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  galleryEmptyCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  /* ─── Admin Products Carousel ─── */
  /** Same horizontal inset as `DesignCarousel` (paddingLeft/Right 24) — not flush to card edges */
  productAdminCarousel: {
    paddingLeft: 24,
  },
  productAdminCarouselContent: {
    paddingRight: 24,
    gap: 14,
    paddingVertical: 6,
    paddingBottom: 8,
  },
  productAdminTile: {
    width: 160,
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#ECECEF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  productAdminImageWrap: {
    width: '100%' as const,
    height: '100%' as const,
    position: 'relative' as const,
  },
  productAdminImage: {
    ...StyleSheet.absoluteFillObject,
  },
  productAdminPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#ECECEF',
  },
  productAdminOverlayGradientTop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '42%' as const,
  },
  /** Taller band so 2-line product names stay on a dark enough backdrop to read */
  productAdminOverlayGradient: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: '72%' as const,
  },
  productAdminPricePillWrap: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    zIndex: 2,
  },
  productAdminNameWrap: {
    position: 'absolute' as const,
    bottom: 8,
    left: 8,
    right: 52,
    zIndex: 2,
    alignItems: 'flex-start' as const,
  },
  productAdminNameOverlay: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: -0.15,
    lineHeight: 17,
    textAlign: 'left' as const,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  productAdminPricePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  productAdminPrice: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: -0.25,
  },
  /* ─── Content Sections (kept for products) ─── */
  contentSection: {
    marginTop: 24,
  },
  newSectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sectionAccentBar: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  newSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
    textAlign: 'right',
  },
  newSectionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'right',
  },
  // Hero styles (aligned with client home)
  fullScreenHero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
    zIndex: 0,
    backgroundColor: HERO_BG,
  },
  fullScreenHeroImage: {
    width: '100%',
    height: '100%',
  },
  fullScreenHeroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  heroTopScheduleBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  /** LTR: physical left = notifications, physical right = pending clients */
  heroBandGlassRow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
    ...({ direction: 'ltr' } as const),
  },
  heroBandGlassTouchable: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.52)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  heroBandGlassBlurFill: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBandGlassInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBandGlassIconSlot: {
    position: 'relative',
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBandGlassBadge: {
    position: 'absolute',
    top: -7,
    right: -12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  heroBandGlassBadgeText: {
    color: '#0F172A',
    fontSize: 9,
    fontWeight: '800',
  },
  overlayHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  overlayHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  overlayLogo: {
    width: '100%',
    height: '100%',
    tintColor: '#FFFFFF',
  },
  overlayLogoWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  overlayLogoInner: {
    width: ADMIN_HOME_LOGO_WIDTH,
    height: ADMIN_HOME_LOGO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenHeroContent: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1,
  },
  manicureHeroRoot: {
    position: 'absolute',
    left: -SCREEN_WIDTH * 0.1,
    right: -SCREEN_WIDTH * 0.1,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  manicureHeroFadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '30%',
  },
  manicureHeroFadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: Platform.OS === 'web' ? '25%' : '15%',
  },
  heroTextContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
   
  },
  heroWelcome: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    textAlign: 'left',
    marginBottom: 8,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroTitle: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '900',
    textAlign: 'left',
    marginBottom: 16,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    textAlign: 'left',
    lineHeight: 24,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    maxWidth: '85%',
  },
  dailyBlurCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    padding: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  headerSide: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  featuredImageContainer: {
    position: 'relative',
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 20,
  },
  featuredTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'left',
    letterSpacing: -0.5,
  },
  featuredSubtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'left',
    marginTop: 8,
    fontWeight: '400',
  },
  todaySection: {
    marginBottom: 24,
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  todaySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  todaySectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'left',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 14,
    color: Colors.primary,
    marginLeft: 4,
  },
  appointmentsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyStateText: {
    fontSize: 16,
    color: Colors.subtext,
  },
  appointmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  clientImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  appointmentDetails: {
    flex: 1,
  },
  clientName: {
    fontSize: 15,
    color: '#222',
    fontWeight: '500',
    textAlign: 'left',
    flex: 1,
  },
  timeRange: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'left',
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    marginTop: 4,
  },
  servicesSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'left',
  },
  statsCard: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'left',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.subtext,
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: Colors.border,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },

  bellIconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#fff',
  },
  galleryTile: {
    width: 160,
    height: 160,
    padding: 4,
  },
  galleryImageContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  galleryGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    justifyContent: 'flex-end',
  },
  galleryDesignName: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'left',
    marginBottom: 4,
  },
  galleryCategoryTags: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
  galleryCategoryTag: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
    marginBottom: 4,
  },
  galleryCategoryTagText: {
    color: Colors.white,
    fontSize: 10,
  },
  galleryPopularityContainer: {
    display: 'none',
  },
  galleryPopularityDot: {
    display: 'none',
  },
  galleryActivePopularityDot: {
    display: 'none',
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  rtlFlip: {
    transform: [{ scaleX: -1 }],
  },
  unflip: {
    transform: [{ scaleX: -1 }],
  },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 18,
    flex: 1,
    marginHorizontal: 6,
    padding: 16,
    minHeight: 120,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'flex-start',
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginBottom: 8,
    marginLeft: 0,
    marginRight: 0,
  },
  cardHour: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 2,
    textAlign: 'right',
  },
  cardDate: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
    marginLeft: 6,
  },
  updatesText: {
    fontSize: 13,
    color: colors.text,
    textAlign: 'right',
  },
  statsBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    marginHorizontal: 0,
    marginBottom: 24,
    paddingHorizontal: 24,
    paddingVertical: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
    minHeight: 120,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
  statsButtonIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statsButtonContent: {
    flex: 1,
    alignItems: 'flex-start',
  },
  statsValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 2,
    textAlign: 'center',
  },
  statsNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  statsLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  statsLabelSecondary: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'left',
    marginTop: 2,
  },
  statsDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#eee',
    marginHorizontal: 8,
  },
  editGalleryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  editGalleryButtonText: {
    color: colors.primary,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginLeft: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 8,
  },
  sectionSpacerLarge: {
    height: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sectionHeaderTexts: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'left',
  },
  sectionHeaderSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'left',
  },
  cardTitleHebrew: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'right',
  },
  clockIconCircle: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 0,
    marginRight: 0,
  },
  dailyTitlePill: {
    alignSelf: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 22,
    paddingVertical: 6,
    paddingHorizontal: 22,
    marginBottom: 10,
    marginTop: 8,
    elevation: 0,
  },
  dailyTitleText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  statsTitleWrapper: {
    display: 'none',
  },
  statsTitleNew: {
    display: 'none',
  },
  statsTitleAccent: {
    display: 'none',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 48,
    marginBottom: 2,
  },
  logo: {
    width: 160,
    height: 60,
    alignSelf: 'center',
  },
  logoAbsolute: {
    position: 'absolute',
    top: 48,
    left: 16,
    zIndex: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },

  // Clients Modal Styles
  clientsModal: {
    backgroundColor: '#fff',
    margin: 10,
    borderRadius: 20,
    height: '88%',
    width: '95%',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row', // LTR
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e5e7',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row', // LTR
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 12, // LTR - icon should be on the left in LTR layout
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    textAlign: 'left',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  clientsList: {
    paddingTop: 10,
  },
  filterRow: {
    flexDirection: 'row', // LTR
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  filterButton: {
    backgroundColor: '#f2f2f7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: `${colors.primary}20`,
    borderColor: colors.primary,
  },
  filterButtonText: {
    color: colors.text,
    fontSize: 14,
  },
  filterButtonTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  clientItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 10,
    marginHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E8ED',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  // Renamed to avoid duplicate key in StyleSheet
  modalClientName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  clientInfo: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
  },
  clientPhone: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'left',
    marginTop: 4,
  },
  clientStatsPanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: `${colors.primary}0D`,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 4,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statBoxValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  statBoxValueMuted: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statBoxLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  statBoxDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 10,
    backgroundColor: colors.border,
  },
  clientActionsRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 2,
  },
  phoneButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  blockButton: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FEE2E2',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 92,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewHeader: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 2,
  },
  imagePreviewCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: {
    width: '92%',
    height: '80%',
    borderRadius: 16,
  },
  // sectionTitle defined earlier
  productTile: {
    width: 160,
    height: 160,
    padding: 4,
  },
  productImageContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    justifyContent: 'flex-end',
  },
  productName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'left',
    marginBottom: 4,
  },
  productPrice: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'left',
  },
});