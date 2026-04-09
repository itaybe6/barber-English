import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Modal,
  ActivityIndicator,
  TextInput,
  FlatList,
  Alert,
  Linking,
  RefreshControl,
  Dimensions,
  I18nManager,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedScrollHandler, runOnJS, useAnimatedStyle } from 'react-native-reanimated';
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
import { Calendar, Clock, ChevronLeft, ChevronRight, Star, Pencil } from 'lucide-react-native';
import DaySelector from '@/components/DaySelector';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView as RNScrollView } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import AdminBroadcastComposer from '@/components/AdminBroadcastComposer';
import BroadcastOwnerOnlyModal from '@/components/BroadcastOwnerOnlyModal';
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
import { getHomeLogoSourceFromUrl } from '@/src/theme/assets';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';
import { useProductsStore } from '@/stores/productsStore';
import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Marquee } from '@animatereactnative/marquee';
import { manicureImages } from '@/src/constants/manicureImages';
import { ManicureMarqueeTile } from '@/components/ManicureMarqueeTile';
import MonthlyInsightsCard from '@/components/MonthlyInsightsCard';
import { PendingClientApprovalsCard, PendingClientApprovalsCardHandle } from '@/components/admin/PendingClientApprovalsCard';
import WaitlistHomePreviewAvatars from '@/components/admin/WaitlistHomePreviewAvatars';
import { clientAppointmentStatsApi } from '@/lib/api/clientAppointmentStats';
import { HorizontalCarouselDots, carouselIndexFromOffset } from '@/components/HorizontalCarouselDots';
import { usersApi } from '@/lib/api/users';
import type { User as DbUser } from '@/lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Admin home — products row (must match `productAdminTile` width + content `gap`) */
const ADMIN_PRODUCT_TILE_WIDTH = 160;
const ADMIN_PRODUCT_TILE_GAP = 14;
const ADMIN_PRODUCT_CAROUSEL_STRIDE = ADMIN_PRODUCT_TILE_WIDTH + ADMIN_PRODUCT_TILE_GAP;
/** Top band above marquee — must cover safe area + full logo; floor so short phones still clear “BARBERSHOP” row */
const HERO_TOP_SCHEDULE_BAND_HEIGHT = Math.round(
  Math.max(196, Math.min(SCREEN_HEIGHT * 0.23, 226))
);
/** Marquee starts flush from top (under status bar) — scrim + logo sit on top */
const HERO_MARQUEE_TRANSLATE_Y = 0;
/** Bottom corner radius of the hero schedule band (matches DailySchedule banner feel) */
const HERO_TOP_SCHEDULE_BAND_BOTTOM_RADIUS = 32;
/** Tile size — smaller tiles so the grid feels less “zoomed in” */
const HERO_ITEM_SIZE = Platform.OS === 'web' ? SCREEN_WIDTH * 0.255 : SCREEN_WIDTH * 0.35;
const HERO_SPACING = Platform.OS === 'web' ? 12 : 6;
/** Logical hero height (scroll padding / snap math) */
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.82);
/** Taller marquee layer so tiles can extend under the white sheet (z-index below sheet) */
const HERO_MARQUEE_BOTTOM_BLEED = Math.round(SCREEN_HEIGHT * 0.135);
const HERO_MARQUEE_HOST_HEIGHT = HERO_HEIGHT + HERO_MARQUEE_BOTTOM_BLEED;
/** How much the white sheet overlaps the hero (larger = sheet sits higher, hides wedge gap) */
const HERO_OVERLAP = 214;
/** Extra pull: negative margin so the sheet covers the tilted marquee’s lower wedge */
const HERO_SHEET_PULL_UP = 64;
/** Subtle tilt + scale; nudge pushes grid down into the bleed zone under the sheet */
const MARQUEE_TILT_Z = I18nManager.isRTL ? '3.2deg' : '-3.2deg';
const MARQUEE_PLANE_SCALE = 1.075;
const MARQUEE_POST_TRANSFORM_NUDGE_Y = 48;
/** Logo overlay (align with `overlayLogoWrapper` top + `overlayLogoInner` height) */
const ADMIN_HOME_LOGO_TOP_OFFSET = -15;
const ADMIN_HOME_LOGO_HEIGHT = 78;
const ADMIN_HOME_LOGO_WIDTH = 200;
const OUTER_INNER_HANDOFF_ON_PX = 4;
/** Wider band reduces handoff flutter when flinging the sheet down */
const OUTER_INNER_HANDOFF_OFF_PX = 36;
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
  left: -SCREEN_WIDTH * 0.18,
  right: -SCREEN_WIDTH * 0.18,
  top: -SCREEN_HEIGHT * 0.02,
  bottom: -SCREEN_HEIGHT * 0.07,
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
          transform: [
            { perspective: 1000 },
            { rotateZ: MARQUEE_TILT_Z },
            { scale: MARQUEE_PLANE_SCALE },
            { translateY: HERO_MARQUEE_TRANSLATE_Y + MARQUEE_POST_TRANSFORM_NUDGE_Y },
          ],
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

  const [adminProductCarouselIndex, setAdminProductCarouselIndex] = useState(0);

  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);
  const user = useAuthStore((state) => state.user);

  const ensureCanBroadcast = useCallback(async () => {
    return businessProfileApi.isUserPhoneMatchingBusinessOwner(user?.phone);
  }, [user?.phone]);

  const [broadcastOwnerOnlyOpen, setBroadcastOwnerOnlyOpen] = useState(false);

  const onPressBroadcastTile = useCallback(async () => {
    const ok = await ensureCanBroadcast();
    if (!ok) {
      setBroadcastOwnerOnlyOpen(true);
      return;
    }
    setShowBroadcast(true);
  }, [ensureCanBroadcast]);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const fetchUnread = useNotificationsStore((state) => state.fetchUnreadCount);
  const colors = useColors();
  const { primaryOnSurface, onPrimary } = usePrimaryContrast();
  const styles = createStyles(colors, primaryOnSurface);
  const heroLogoScrimGradientColors = useMemo(
    () => [
      // Match client home top scrim (`app/(client-tabs)/index.tsx`) — black fade for readability.
      'rgba(0,0,0,0.92)',
      'rgba(0,0,0,0.82)',
      'rgba(0,0,0,0.55)',
      'rgba(0,0,0,0)',
    ],
    []
  );
  /** Section headers: Hebrew titles flush right, edit control on the opposite side (LTR physical layout). */
  const adminSectionTitleOnRight = Boolean(i18n.language?.startsWith('he'));
  const isRTL = I18nManager.isRTL;

  const [heroImages, setHeroImages] = useState<string[] | null>(null);
  const [homeLogoUrl, setHomeLogoUrl] = useState<string | null>(null);

  const loadHeroImages = useCallback(async () => {
    try {
      const p = await businessProfileApi.getProfile();
      const list = sanitizeUrlArray((p as any)?.home_hero_images);
      setHeroImages(list.length > 0 ? list : null);
      const rawLogo = String(p?.home_logo_url ?? '').trim();
      setHomeLogoUrl(/^https?:\/\//i.test(rawLogo) ? rawLogo : null);
    } catch {
      setHeroImages(null);
      setHomeLogoUrl(null);
    }
  }, []);

  useEffect(() => {
    loadHeroImages();
  }, [loadHeroImages]);

  useEffect(() => {
    setAdminProductCarouselIndex(0);
  }, [productsFromStore.length]);

  const syncAdminProductCarouselIndex = useCallback(
    (offsetX: number) => {
      const next = carouselIndexFromOffset(
        offsetX,
        ADMIN_PRODUCT_CAROUSEL_STRIDE,
        productsFromStore.length
      );
      setAdminProductCarouselIndex((prev) => (prev === next ? prev : next));
    },
    [productsFromStore.length]
  );

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
    cancelledAppointmentsThisMonth: 0,
    newClientsThisMonth: 0,
  });
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [innerScrollEnabled, setInnerScrollEnabled] = useState(false);
  const innerScrollEnabledRef = useRef(false);
  const innerScrollRef = useRef<ScrollView>(null);
  /** SharedValue cap so the animated scroll handler (UI thread) can access it */
  const outerScrollCapSV = useSharedValue(0);
  const outerScrollLayoutHRef = useRef(0);
  const outerScrollContentHRef = useRef(0);
  const applyOuterScrollCap = useCallback(() => {
    const lh = outerScrollLayoutHRef.current;
    const ch = outerScrollContentHRef.current;
    if (lh > 0 && ch > lh + 1) {
      outerScrollCapSV.value = ch - lh;
    } else {
      outerScrollCapSV.value = Math.max(
        0,
        HERO_HEIGHT - HERO_OVERLAP - insets.top - 60 - HERO_SHEET_PULL_UP
      );
    }
  }, [insets.top, outerScrollCapSV]);
  useEffect(() => {
    outerScrollCapSV.value = Math.max(
      0,
      HERO_HEIGHT - HERO_OVERLAP - insets.top - 60 - HERO_SHEET_PULL_UP
    );
  }, [insets.top, outerScrollCapSV]);
  const [blockedFilter, setBlockedFilter] = useState<'all' | 'blocked' | 'unblocked'>('all');
  const [clientsListMode, setClientsListMode] = useState<'all' | 'newThisMonth' | 'pendingApproval'>('all');
  const [clientStatsMap, setClientStatsMap] = useState<
    Record<string, { totalAppointments: number; avgMonthlySpend: number | null }>
  >({});
  const clientsModalOpenTsRef = useRef(0);
  const [pendingApprovalsOpenNonce, setPendingApprovalsOpenNonce] = useState(0);
  const [pendingClientsCount, setPendingClientsCount] = useState(0);
  const pendingCardRef = React.useRef<PendingClientApprovalsCardHandle>(null);
  const [pendingClients, setPendingClients] = useState<DbUser[]>([]);
  const [loadingPendingClients, setLoadingPendingClients] = useState(false);
  const [pendingClientActionId, setPendingClientActionId] = useState<string | null>(null);
  const pendingFilteredClients = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) return pendingClients;
    const q = raw.toLowerCase();
    const qDigits = raw.replace(/\D/g, '');
    return pendingClients.filter((u) => {
      const name = String((u as any)?.name || '').toLowerCase();
      const phone = String((u as any)?.phone || '');
      const phoneDigits = phone.replace(/\D/g, '');
      if (name.includes(q)) return true;
      if (qDigits && phoneDigits.includes(qDigits)) return true;
      return false;
    });
  }, [pendingClients, searchQuery]);
  const [waitlistWaitingCount, setWaitlistWaitingCount] = useState(0);
  const [waitlistPreviewClients, setWaitlistPreviewClients] = useState<
    { key: string; client_name: string }[]
  >([]);

  /** SharedValue tracks inner-scroll state so the UI-thread worklet can read it without crossing to JS */
  const innerActiveSV = useSharedValue(0);
  /** Drives subtle hero parallax while dragging the sheet */
  const outerScrollYSV = useSharedValue(0);

  const enableInnerScrollJS = useCallback(
    (enabled: boolean) => {
      innerScrollEnabledRef.current = enabled;
      setInnerScrollEnabled(enabled);
      if (!enabled) {
        const resetInner = () => innerScrollRef.current?.scrollTo({ y: 0, animated: false });
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            requestAnimationFrame(resetInner);
          });
        } else {
          resetInner();
        }
      }
    },
    []
  );

  /** Only coordinates outer ↔ inner scroll handoff — hero marquee is a fixed layer, not driven by scroll */
  const outerScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      outerScrollYSV.value = y;
      const cap = outerScrollCapSV.value;
      const wasInner = innerActiveSV.value === 1;
      let nextInner = wasInner;
      if (cap > 0) {
        if (wasInner) {
          nextInner = y > cap - OUTER_INNER_HANDOFF_OFF_PX;
        } else {
          nextInner = y >= cap - OUTER_INNER_HANDOFF_ON_PX;
        }
      } else {
        nextInner = false;
      }
      if (nextInner !== wasInner) {
        innerActiveSV.value = nextInner ? 1 : 0;
        runOnJS(enableInnerScrollJS)(nextInner);
      }
    },
  });

  const heroMarqueeAnimatedStyle = useAnimatedStyle(() => {
    const y = Math.max(0, outerScrollYSV.value);
    const clamped = Math.min(y, HERO_HEIGHT + 40);
    // Parallax: background shifts slightly slower than the sheet
    const translateY = -clamped * 0.22;
    return { transform: [{ translateY }] };
  }, []);

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

      // Same scope as calendar / insights: slot may use barber_id and/or user_id (legacy schedule rows)
      if (user?.id) {
        query = query.or(`barber_id.eq.${user.id},user_id.eq.${user.id}`);
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

      // סינון לפי המשתמש הנוכחי — תורים של הספר (barber_id או user_id כמו בייצור משבצות)
      if (user?.id) {
        query = query.or(`barber_id.eq.${user.id},user_id.eq.${user.id}`);
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
    try {
      setLoadingInsights(true);
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      const now = new Date();
      // slot_date is a calendar day in local business time — avoid UTC drift from toISOString()
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const toLocalYmd = (d: Date) =>
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const firstDayOfMonth = toLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1));
      const lastDayOfMonth = toLocalYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEndExclusiveIso = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      let monthApptQuery = supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('is_available', false)
        .gte('slot_date', firstDayOfMonth)
        .lte('slot_date', lastDayOfMonth)
        .in('status', ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']);

      let cancelledMonthQuery = supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'cancelled')
        .gte('slot_date', firstDayOfMonth)
        .lte('slot_date', lastDayOfMonth);

      // Super admin: business-wide. Barber admin: rows tied to this worker (matches admin calendar / slot generation).
      if (!isSuperAdmin && user?.id) {
        const barberScope = `barber_id.eq.${user.id},user_id.eq.${user.id}`;
        monthApptQuery = monthApptQuery.or(barberScope);
        cancelledMonthQuery = cancelledMonthQuery.or(barberScope);
      }

      const [monthApptRes, cancelledMonthRes, newClientsRes] = await Promise.all([
        monthApptQuery,
        cancelledMonthQuery,
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('user_type', 'client')
          .gte('created_at', monthStartIso)
          .lt('created_at', monthEndExclusiveIso),
      ]);

      if (monthApptRes.error) console.error('Error fetching month appointments count:', monthApptRes.error);
      if (cancelledMonthRes.error) console.error('Error fetching cancelled appointments count:', cancelledMonthRes.error);
      if (newClientsRes.error) console.error('Error fetching new clients count:', newClientsRes.error);

      setInsightsData({
        appointmentsThisMonth: monthApptRes.error ? 0 : monthApptRes.count ?? 0,
        cancelledAppointmentsThisMonth: cancelledMonthRes.error ? 0 : cancelledMonthRes.count ?? 0,
        newClientsThisMonth: newClientsRes.error ? 0 : newClientsRes.count ?? 0,
      });

      // ממתינים בסטטוס waiting — כמו מסך רשימת המתנה: לספר מחובר רק רשומות עם user_id = הספר
      let waitlistCountQuery = supabase
        .from('waitlist_entries')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'waiting');
      let waitlistPreviewQuery = supabase
        .from('waitlist_entries')
        .select('id, client_name, client_phone, requested_date, created_at')
        .eq('business_id', businessId)
        .eq('status', 'waiting')
        .order('requested_date', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(40);
      if (!isSuperAdmin && user?.id) {
        waitlistCountQuery = waitlistCountQuery.eq('user_id', user.id);
        waitlistPreviewQuery = waitlistPreviewQuery.eq('user_id', user.id);
      }
      const [waitlistCountRes, waitlistPreviewRes] = await Promise.all([
        waitlistCountQuery,
        waitlistPreviewQuery,
      ]);
      setWaitlistWaitingCount(waitlistCountRes.count ?? 0);
      if (waitlistPreviewRes.error) {
        console.error('Error fetching waitlist preview:', waitlistPreviewRes.error);
        setWaitlistPreviewClients([]);
      } else {
        const seen = new Set<string>();
        const unique: { key: string; client_name: string }[] = [];
        for (const row of waitlistPreviewRes.data || []) {
          const r = row as { id?: string; client_name?: string; client_phone?: string };
          const phone = String(r.client_phone || '').trim();
          const dedupeKey = phone || String(r.id || '');
          if (!dedupeKey || seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          unique.push({
            key: String(r.id),
            client_name: String(r.client_name || '').trim() || '?',
          });
        }
        setWaitlistPreviewClients(unique);
      }
    } catch (error) {
      console.error('Error in fetchInsightsData:', error);
    } finally {
      setLoadingInsights(false);
    }
  };

  /** Refresh dashboard stats when returning to home (e.g. client cancelled elsewhere). */
  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin) return;
      void fetchInsightsData();
      void fetchNextAppointment();
      void fetchTodayAppointmentsCount();
      void fetchPendingClients();
    }, [isAdmin, user?.id, isSuperAdmin])
  );

  // Fetch clients
  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('users')
        .select('id, name, phone, image_url, created_at, client_approved, user_type, business_id, birth_date')
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

  /** Same date window as insights "new clients" count — list must match the stat. */
  const fetchNewClientsThisMonth = async () => {
    try {
      setLoadingClients(true);
      setClients([]);
      setFilteredClients([]);
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      const now = new Date();
      const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEndExclusiveIso = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      const { data, error } = await supabase
        .from('users')
        .select('id, name, phone, image_url, created_at, client_approved, user_type, business_id, birth_date')
        .eq('business_id', businessId)
        .eq('user_type', 'client')
        .gte('created_at', monthStartIso)
        .lt('created_at', monthEndExclusiveIso)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching new clients this month:', error);
        setClients([]);
        setFilteredClients([]);
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
      console.error('Error in fetchNewClientsThisMonth:', error);
      setClientStatsMap({});
    } finally {
      setLoadingClients(false);
    }
  };

  const fetchPendingClients = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadingPendingClients(true);
      const list = await usersApi.getPendingClients();
      setPendingClients(list);
      setPendingClientsCount(list.length);
    } catch (e) {
      console.error('Error in fetchPendingClients:', e);
      setPendingClients([]);
    } finally {
      setLoadingPendingClients(false);
    }
  }, [isAdmin]);

  const approvePendingClient = useCallback(
    async (id: string) => {
      setPendingClientActionId(id);
      try {
        const updated = await usersApi.approveClient(id);
        if (!updated) {
          Alert.alert(t('error.generic', 'Error'), t('admin.pendingClients.approveError', 'Could not approve'));
          return;
        }
        setPendingClients((prev) => prev.filter((u) => u.id !== id));
        setPendingClientsCount((prev) => Math.max(0, prev - 1));
        void fetchClients();
      } finally {
        setPendingClientActionId(null);
      }
    },
    [fetchClients, t]
  );

  const rejectPendingClient = useCallback(
    (item: DbUser) => {
      Alert.alert(
        t('admin.pendingClients.rejectTitle', 'Decline registration'),
        t('admin.pendingClients.rejectMessage', 'Remove {{name}}? They will need to register again.', { name: item.name }),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('admin.pendingClients.rejectConfirm', 'Remove'),
            style: 'destructive',
            onPress: async () => {
              setPendingClientActionId(item.id);
              try {
                const done = await usersApi.deleteUser(item.id);
                if (!done) {
                  Alert.alert(t('error.generic', 'Error'), t('admin.pendingClients.rejectError', 'Could not remove'));
                  return;
                }
                setPendingClients((prev) => prev.filter((u) => u.id !== item.id));
                setPendingClientsCount((prev) => Math.max(0, prev - 1));
              } finally {
                setPendingClientActionId(null);
              }
            },
          },
        ]
      );
    },
    [t]
  );

  const closeClientsModal = useCallback(() => {
    if (Date.now() - clientsModalOpenTsRef.current < 400) return;
    setShowClientsModal(false);
    setClientsListMode('all');
    setPendingClients([]);
  }, []);

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
          <ActivityIndicator size="small" color={primaryOnSurface} />
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

      {/* Fixed hero marquee — not a child of the sheet ScrollView; sheet slides over it, zero scroll coupling */}
      <Animated.View
        style={[styles.adminHeroMarqueeHost, heroMarqueeAnimatedStyle]}
        pointerEvents="box-none"
        collapsable={false}
      >
        <ManicureMarqueeHero images={heroImagesResolved} />
      </Animated.View>

      {/* Sheet + outer scroll only moves the white panel; background stays visually independent */}
      <Animated.ScrollView
        style={{ flex: 1, zIndex: 3, backgroundColor: 'transparent' }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
        pointerEvents="box-none"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryOnSurface} />}
        contentContainerStyle={{ paddingTop: HERO_HEIGHT - HERO_OVERLAP }}
        scrollEventThrottle={1}
        onLayout={(e) => {
          outerScrollLayoutHRef.current = e.nativeEvent.layout.height;
          applyOuterScrollCap();
        }}
        onContentSizeChange={(_w, h) => {
          outerScrollContentHRef.current = h;
          applyOuterScrollCap();
        }}
        onScroll={outerScrollHandler}
      >
        {/* Content wrapper — fixed height so outer scroll stops below header */}
        <View
          style={[
            styles.contentWrapper,
            { height: SCREEN_HEIGHT - insets.top - 60, marginTop: -HERO_SHEET_PULL_UP },
          ]}
        >
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
            keyboardShouldPersistTaps="handled"
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

        {/* ── Quick tiles + רשימת המתנה מתחת ── */}
        {isAdmin && (
          <View style={styles.quickTilesGrid}>
            <View style={styles.quickTilesRow}>
              <TouchableOpacity
                style={[styles.quickTile, { backgroundColor: `${colors.primary}0F` }]}
                activeOpacity={0.82}
                onPress={() => {
                  setClientsListMode('all');
                  setSearchQuery('');
                  setBlockedFilter('all');
                  clientsModalOpenTsRef.current = Date.now();
                  setShowClientsModal(true);
                  void fetchClients();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('admin.home.clients')}
              >
                <View style={[styles.quickTileIconWrap, { backgroundColor: `${colors.primary}1C` }]}>
                  <Ionicons name="people-outline" size={24} color={primaryOnSurface} />
                  {pendingClientsCount > 0 ? (
                    <View style={[styles.quickTileBadge, { backgroundColor: '#EF4444' }]}>
                      <Text style={styles.quickTileBadgeText}>
                        {pendingClientsCount > 99 ? '99+' : pendingClientsCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.quickTileLabel, { color: colors.text }]} numberOfLines={2}>
                  {t('admin.home.clients')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickTile, { backgroundColor: `${colors.primary}0F` }]}
                activeOpacity={0.82}
                onPress={() => void onPressBroadcastTile()}
                accessibilityRole="button"
              >
                <View style={[styles.quickTileIconWrap, { backgroundColor: `${colors.primary}1C` }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color={primaryOnSurface} />
                </View>
                <Text style={[styles.quickTileLabel, { color: colors.text }]} numberOfLines={2}>
                  {t('admin.home.broadcastTile')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickTile, { backgroundColor: `${colors.primary}0F` }]}
                activeOpacity={0.82}
                onPress={() => router.push('/(tabs)/notifications')}
                accessibilityRole="button"
                accessibilityLabel={t('notifications.title', 'Notifications')}
              >
                <View style={[styles.quickTileIconWrap, { backgroundColor: `${colors.primary}1C` }]}>
                  <Ionicons name="notifications-outline" size={24} color={primaryOnSurface} />
                  {unreadCount > 0 ? (
                    <View style={[styles.quickTileBadge, { backgroundColor: '#EF4444' }]}>
                      <Text style={styles.quickTileBadgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.quickTileLabel, { color: colors.text }]} numberOfLines={2}>
                  {t('notifications.title', 'Notifications')}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.waitlistCard, { backgroundColor: colors.surface }]}
              activeOpacity={0.88}
              onPress={() => router.push('/(tabs)/waitlist')}
              accessibilityRole="button"
              accessibilityLabel={t('admin.waitlist.title', 'רשימת המתנה')}
            >
              <View style={styles.waitlistCardHeader}>
                <Ionicons name="chevron-back-outline" size={15} color="#CBD5E1" />
                <View style={styles.waitlistCardHeaderTitleGroup}>
                  <Text
                    style={[styles.waitlistCardHeaderTitle, { textAlign: isRTL ? 'right' : 'left' }]}
                    numberOfLines={1}
                  >
                    {t('admin.waitlist.title', 'רשימת המתנה')}
                  </Text>
                  <View style={[styles.waitlistCardHeaderIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <Ionicons name="hourglass-outline" size={15} color={primaryOnSurface} />
                  </View>
                </View>
              </View>
              <View style={styles.waitlistCardDivider} />
              <View style={[styles.waitlistCardBody, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View
                  style={[
                    styles.waitlistCardInfoCol,
                    { alignItems: isRTL ? 'flex-end' : 'flex-start' },
                  ]}
                >
                  <Text
                    style={[
                      styles.waitlistCardSub,
                      { color: '#94A3B8', textAlign: isRTL ? 'right' : 'left' },
                    ]}
                    numberOfLines={2}
                  >
                    {t('admin.waitlist.viewAndManage', 'צפייה וניהול לקוחות ממתינים')}
                  </Text>
                  {waitlistPreviewClients.length > 0 ? (
                    <WaitlistHomePreviewAvatars
                      clients={waitlistPreviewClients}
                      primaryColor={colors.primary}
                      surfaceColor={colors.surface}
                      maxSlots={5}
                    />
                  ) : null}
                </View>
                <View style={[styles.waitlistCardVertDivider, { backgroundColor: `${colors.primary}25` }]} />
                <View style={styles.waitlistCardCountBlock}>
                  <Text style={[styles.waitlistCardCountNum, { color: primaryOnSurface }]}>
                    {waitlistWaitingCount}
                  </Text>
                  <Text style={[styles.waitlistCardCountLabel, { color: `${primaryOnSurface}B3` }]}>
                    {t('admin.waitlist.waitingLabel', 'ממתינים')}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── MONTHLY INSIGHTS CHART ── */}
        {isAdmin && (
          <MonthlyInsightsCard
            appointmentsThisMonth={insightsData.appointmentsThisMonth}
            cancelledAppointmentsThisMonth={insightsData.cancelledAppointmentsThisMonth}
            newClientsThisMonth={insightsData.newClientsThisMonth}
            loading={loadingInsights}
            colors={colors}
            onPressNewClients={() => {
              setClientsListMode('newThisMonth');
              setSearchQuery('');
              setBlockedFilter('all');
              clientsModalOpenTsRef.current = Date.now();
              setShowClientsModal(true);
              void fetchNewClientsThisMonth();
            }}
          />
        )}

        {/* ── GALLERY SECTION ── */}
        {isAdmin && (
          <View style={styles.galleryCard}>
            {(designsFromStore?.length ?? 0) > 0 ? (
              <View style={styles.galleryCardHeader}>
                {adminSectionTitleOnRight ? (
                  <>
                    <TouchableOpacity
                      style={[styles.galleryEditBtn, { backgroundColor: `${colors.primary}18`, flexShrink: 0 }]}
                      activeOpacity={0.82}
                      onPress={() => router.push('/(tabs)/edit-gallery')}
                      accessibilityRole="button"
                      accessibilityLabel={t('admin.gallery.homeSectionEditA11y', 'עריכת גלריה')}
                    >
                      <View style={[styles.galleryEditIconWrap, { backgroundColor: `${colors.primary}24` }]}>
                        <Pencil size={15} color={primaryOnSurface} strokeWidth={2.4} />
                      </View>
                      <Text style={[styles.galleryEditBtnText, { color: primaryOnSurface }]}>
                        {t('admin.gallery.homeSectionEdit', 'עריכה')}
                      </Text>
                    </TouchableOpacity>
                    <Text
                      style={[
                        styles.galleryCardTitle,
                        { color: colors.text, flex: 1, flexShrink: 1, textAlign: 'right' },
                      ]}
                      numberOfLines={1}
                    >
                      {t('admin.gallery.title', 'גלרייה')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.galleryCardTitle,
                        { color: colors.text, flex: 1, flexShrink: 1, textAlign: 'left' },
                      ]}
                      numberOfLines={1}
                    >
                      {t('admin.gallery.title', 'גלרייה')}
                    </Text>
                    <TouchableOpacity
                      style={[styles.galleryEditBtn, { backgroundColor: `${colors.primary}18`, flexShrink: 0 }]}
                      activeOpacity={0.82}
                      onPress={() => router.push('/(tabs)/edit-gallery')}
                      accessibilityRole="button"
                      accessibilityLabel={t('admin.gallery.homeSectionEditA11y', 'עריכת גלריה')}
                    >
                      <View style={[styles.galleryEditIconWrap, { backgroundColor: `${colors.primary}24` }]}>
                        <Pencil size={15} color={primaryOnSurface} strokeWidth={2.4} />
                      </View>
                      <Text style={[styles.galleryEditBtnText, { color: primaryOnSurface }]}>
                        {t('admin.gallery.homeSectionEdit', 'עריכה')}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : null}
            {isLoadingDesigns ? (
              <ActivityIndicator size="small" color={primaryOnSurface} style={{ marginVertical: 12 }} />
            ) : (designsFromStore?.length ?? 0) === 0 ? (
              <View style={styles.galleryEmpty}>
                <View style={[styles.galleryEmptyIconWrap, { backgroundColor: `${colors.primary}14` }]}>
                  <Ionicons name="images-outline" size={34} color={primaryOnSurface} />
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
                  <Ionicons name="add-circle-outline" size={20} color={onPrimary} />
                  <Text style={[styles.galleryEmptyCtaText, { color: onPrimary }]}>{t('admin.gallery.homeEmptyCta')}</Text>
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
                {adminSectionTitleOnRight ? (
                  <>
                    <TouchableOpacity
                      style={[styles.galleryEditBtn, { backgroundColor: `${colors.primary}18`, flexShrink: 0 }]}
                      activeOpacity={0.82}
                      onPress={() => router.push('/(tabs)/edit-products')}
                      accessibilityRole="button"
                      accessibilityLabel={t('admin.products.homeSectionEditA11y', 'עריכת מוצרים')}
                    >
                      <View style={[styles.galleryEditIconWrap, { backgroundColor: `${colors.primary}24` }]}>
                        <Pencil size={15} color={primaryOnSurface} strokeWidth={2.4} />
                      </View>
                      <Text style={[styles.galleryEditBtnText, { color: primaryOnSurface }]}>
                        {t('admin.products.homeSectionEdit', 'עריכה')}
                      </Text>
                    </TouchableOpacity>
                    <Text
                      style={[
                        styles.galleryCardTitle,
                        { color: colors.text, flex: 1, flexShrink: 1, textAlign: 'right' },
                      ]}
                      numberOfLines={1}
                    >
                      {t('admin.products.homeTitle', 'מוצרים')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.galleryCardTitle,
                        { color: colors.text, flex: 1, flexShrink: 1, textAlign: 'left' },
                      ]}
                      numberOfLines={1}
                    >
                      {t('admin.products.homeTitle', 'מוצרים')}
                    </Text>
                    <TouchableOpacity
                      style={[styles.galleryEditBtn, { backgroundColor: `${colors.primary}18`, flexShrink: 0 }]}
                      activeOpacity={0.82}
                      onPress={() => router.push('/(tabs)/edit-products')}
                      accessibilityRole="button"
                      accessibilityLabel={t('admin.products.homeSectionEditA11y', 'עריכת מוצרים')}
                    >
                      <View style={[styles.galleryEditIconWrap, { backgroundColor: `${colors.primary}24` }]}>
                        <Pencil size={15} color={primaryOnSurface} strokeWidth={2.4} />
                      </View>
                      <Text style={[styles.galleryEditBtnText, { color: primaryOnSurface }]}>
                        {t('admin.products.homeSectionEdit', 'עריכה')}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : null}
            {isLoadingProducts ? (
              <ActivityIndicator size="small" color={primaryOnSurface} style={{ marginVertical: 12 }} />
            ) : (productsFromStore?.length ?? 0) === 0 ? (
              <View style={styles.galleryEmpty}>
                <View style={[styles.galleryEmptyIconWrap, { backgroundColor: `${colors.primary}14` }]}>
                  <Ionicons name="bag-outline" size={34} color={primaryOnSurface} />
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
                  <Ionicons name="add-circle-outline" size={20} color={onPrimary} />
                  <Text style={[styles.galleryEmptyCtaText, { color: onPrimary }]}>{t('admin.products.homeEmptyCta', 'הוספת מוצר')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.productAdminCarousel}
                  contentContainerStyle={styles.productAdminCarouselContent}
                  decelerationRate="fast"
                  snapToInterval={ADMIN_PRODUCT_CAROUSEL_STRIDE}
                  snapToAlignment="start"
                  scrollEventThrottle={16}
                  onScroll={(e) => syncAdminProductCarouselIndex(e.nativeEvent.contentOffset.x)}
                  onMomentumScrollEnd={(e) =>
                    syncAdminProductCarouselIndex(e.nativeEvent.contentOffset.x)
                  }
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
                              <Text style={[styles.productAdminPrice, { color: onPrimary }]}>{priceStr}</Text>
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
                <HorizontalCarouselDots
                  count={productsFromStore.length}
                  minCount={2}
                  activeIndex={adminProductCarouselIndex}
                  activeColor={colors.primary}
                />
              </View>
            )}
          </View>
        )}

        {/* ── PRODUCTS SECTION (non-admin only) ── */}
        {!isAdmin && <ProductsSection />}
            </View>
          </ScrollView>
        </View>
      </Animated.ScrollView>

      {/* Top scrim over marquee — semi-transparent gradient so the white logo reads clearly */}
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
        <LinearGradient
          pointerEvents="none"
          colors={heroLogoScrimGradientColors}
          locations={[0, 0.22, 0.52, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
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
          <Image source={getHomeLogoSourceFromUrl(homeLogoUrl)} style={styles.overlayLogo} resizeMode="contain" />
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
         onRequestClose={closeClientsModal}
       >
         <View style={styles.modalOverlay}>
            <View style={styles.clientsModal}>
              <View style={styles.modalHeader}>
                <View style={{ width: 36, height: 36 }} />
                <Text style={styles.modalTitle}>
                  {clientsListMode === 'newThisMonth'
                    ? t('admin.insights.newClientsListTitle', 'New clients this month')
                    : t('clients.listTitle', 'Clients List')}
                </Text>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={closeClientsModal}
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

             {clientsListMode === 'all' || clientsListMode === 'pendingApproval' ? (
               <View style={styles.searchContainer}>
                 <Ionicons name="search" size={20} color={primaryOnSurface} style={styles.searchIcon} />
                 <TextInput
                   style={[
                     styles.searchInput,
                     I18nManager.isRTL ? styles.searchInputRtl : styles.searchInputLtr,
                   ]}
                   placeholder={t('common.searchByName', 'Search by name...')}
                   placeholderTextColor={colors.textSecondary}
                   value={searchQuery}
                   onChangeText={setSearchQuery}
                 />
               </View>
             ) : null}

             {/* Blocked Filter + New Clients (single row) */}
             {clientsListMode !== 'newThisMonth' ? (
               <View style={styles.filterRow}>
                 <TouchableOpacity
                   onPress={() => {
                     const needsReload = clientsListMode !== 'all';
                     setClientsListMode('all');
                     setBlockedFilter('all');
                     if (needsReload) {
                       setSearchQuery('');
                       void fetchClients();
                     }
                   }}
                   style={[
                     styles.filterButton,
                     clientsListMode === 'all' && blockedFilter === 'all' && styles.filterButtonActive,
                   ]}
                   activeOpacity={0.85}
                 >
                   <Text
                     style={[
                       styles.filterButtonText,
                       clientsListMode === 'all' && blockedFilter === 'all' && styles.filterButtonTextActive,
                     ]}
                   >
                     {t('clients.filter.all', 'All')}
                   </Text>
                 </TouchableOpacity>

                 <TouchableOpacity
                   onPress={() => {
                     const needsReload = clientsListMode !== 'all';
                     setClientsListMode('all');
                     setBlockedFilter('unblocked');
                     if (needsReload) {
                       setSearchQuery('');
                       void fetchClients();
                     }
                   }}
                   style={[
                     styles.filterButton,
                     clientsListMode === 'all' && blockedFilter === 'unblocked' && styles.filterButtonActive,
                   ]}
                   activeOpacity={0.85}
                 >
                   <Text
                     style={[
                       styles.filterButtonText,
                       clientsListMode === 'all' && blockedFilter === 'unblocked' && styles.filterButtonTextActive,
                     ]}
                   >
                     {t('clients.filter.unblocked', 'Unblocked')}
                   </Text>
                 </TouchableOpacity>

                 <TouchableOpacity
                   onPress={() => {
                     const needsReload = clientsListMode !== 'all';
                     setClientsListMode('all');
                     setBlockedFilter('blocked');
                     if (needsReload) {
                       setSearchQuery('');
                       void fetchClients();
                     }
                   }}
                   style={[
                     styles.filterButton,
                     clientsListMode === 'all' && blockedFilter === 'blocked' && styles.filterButtonActive,
                   ]}
                   activeOpacity={0.85}
                 >
                   <Text
                     style={[
                       styles.filterButtonText,
                       clientsListMode === 'all' && blockedFilter === 'blocked' && styles.filterButtonTextActive,
                     ]}
                   >
                     {t('clients.filter.blocked', 'Blocked')}
                   </Text>
                 </TouchableOpacity>

                 <TouchableOpacity
                   onPress={() => {
                     setClientsListMode('pendingApproval');
                     setSearchQuery('');
                     setBlockedFilter('all');
                     void fetchPendingClients();
                   }}
                   style={[styles.filterButton, clientsListMode === 'pendingApproval' && styles.filterButtonActive]}
                   activeOpacity={0.85}
                   accessibilityRole="button"
                   accessibilityLabel={t('admin.pendingClients.bannerA11y')}
                 >
                   <Text
                     style={[
                       styles.filterButtonText,
                       clientsListMode === 'pendingApproval' && styles.filterButtonTextActive,
                     ]}
                   >
                     {pendingClientsCount > 0
                       ? `${t('admin.pendingClients.bannerTitle')} (${pendingClientsCount > 99 ? '99+' : pendingClientsCount})`
                       : t('admin.pendingClients.bannerTitle')}
                   </Text>
                 </TouchableOpacity>
               </View>
             ) : null}

             {/* Clients List */}
             <View style={styles.clientsListSheet}>
             {clientsListMode === 'pendingApproval' ? (
               loadingPendingClients ? (
                 <View style={styles.loadingContainer}>
                   <ActivityIndicator size="large" color={primaryOnSurface} />
                   <Text style={styles.loadingText}>{t('admin.pendingClients.loading', 'Loading…')}</Text>
                 </View>
               ) : (
                 <FlatList
                   style={styles.clientsFlatList}
                   data={pendingFilteredClients}
                   keyExtractor={(item) => item.id}
                   keyboardShouldPersistTaps="handled"
                   showsVerticalScrollIndicator={true}
                   ListEmptyComponent={
                     <View style={styles.clientsEmptyWrap}>
                       <View style={[styles.clientsEmptyIcon, { backgroundColor: `${colors.primary}14` }]}>
                         <Ionicons name="people-outline" size={40} color={primaryOnSurface} />
                       </View>
                       <Text style={[styles.clientsEmptyTitle, { color: colors.text }]}>
                         {pendingClients.length === 0
                           ? t('admin.pendingClients.empty', 'No pending clients')
                           : t('common.noResults', 'No results')}
                       </Text>
                     </View>
                   }
                   renderItem={({ item }) => {
                     const busy = pendingClientActionId === item.id;
                     const initial = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
                     return (
                       <View style={styles.clientCard}>
                         <View style={styles.clientCardHeader}>
                           <View style={styles.clientCardLead}>
                             <View style={[styles.clientAvatar, { backgroundColor: `${colors.primary}22` }]}>
                               <Text style={[styles.clientAvatarLetter, { color: primaryOnSurface }]}>
                                 {initial}
                               </Text>
                             </View>
                             <View style={styles.clientCardTextCol}>
                               <View style={styles.clientNameRow}>
                                 <Text style={[styles.modalClientName, { color: colors.text }]} numberOfLines={1}>
                                   {item.name || t('common.client', 'Client')}
                                 </Text>
                               </View>
                               {item.phone ? (
                                 <Text style={[styles.clientStatCaption, { color: colors.textSecondary }]} numberOfLines={1}>
                                   {item.phone}
                                 </Text>
                               ) : null}
                             </View>
                           </View>
                           <View style={styles.clientCardActions}>
                             <TouchableOpacity
                               style={[styles.clientUnblockPill, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}35` }]}
                               onPress={() => approvePendingClient(item.id)}
                               disabled={busy}
                               activeOpacity={0.85}
                               accessibilityRole="button"
                               accessibilityLabel={t('admin.pendingClients.approve', 'Approve')}
                             >
                               {busy ? (
                                 <ActivityIndicator size="small" color={primaryOnSurface} />
                               ) : (
                                 <Text style={[styles.clientUnblockPillText, { color: primaryOnSurface }]}>
                                   {t('admin.pendingClients.approve', 'Approve')}
                                 </Text>
                               )}
                             </TouchableOpacity>
                             <TouchableOpacity
                               style={styles.clientBlockPill}
                               onPress={() => rejectPendingClient(item)}
                               disabled={busy}
                               activeOpacity={0.85}
                               accessibilityRole="button"
                               accessibilityLabel={t('admin.pendingClients.decline', 'Decline')}
                             >
                               {busy ? (
                                 <ActivityIndicator size="small" color="#fff" />
                               ) : (
                                 <Text style={styles.clientBlockPillText}>
                                   {t('admin.pendingClients.decline', 'Decline')}
                                 </Text>
                               )}
                             </TouchableOpacity>
                           </View>
                         </View>
                       </View>
                     );
                   }}
                   contentContainerStyle={[
                     styles.clientsListContent,
                     { paddingBottom: insets.bottom + 24 },
                     pendingFilteredClients.length === 0 && styles.clientsListContentEmpty,
                   ]}
                 />
               )
             ) : loadingClients ? (
               <View style={styles.loadingContainer}>
                 <ActivityIndicator size="large" color={primaryOnSurface} />
                 <Text style={styles.loadingText}>{t('clients.loading','Loading clients...')}</Text>
               </View>
              ) : (
                 <FlatList
                  style={styles.clientsFlatList}
                  data={filteredClients}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  ListEmptyComponent={
                    <View style={styles.clientsEmptyWrap}>
                      <View style={[styles.clientsEmptyIcon, { backgroundColor: `${colors.primary}14` }]}>
                        <Ionicons name="people-outline" size={40} color={primaryOnSurface} />
                      </View>
                      <Text style={[styles.clientsEmptyTitle, { color: colors.text }]}>
                        {clientsListMode === 'newThisMonth'
                          ? t('admin.insights.newClientsListEmpty', 'No new clients registered this month')
                          : t('clients.listEmpty')}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => {
                    const stats = clientStatsMap[item.id];
                    const totalAppts = stats?.totalAppointments ?? 0;
                    const avgMo = stats?.avgMonthlySpend;
                    const initial = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
                    const a11y = t('clients.stats.a11yCard', '{{name}}: {{visits}} visits, {{spend}}', {
                      name: item.name || '',
                      visits: totalAppts,
                      spend:
                        avgMo != null
                          ? formatClientMoney(avgMo)
                          : t('clients.stats.noSpendShort', 'No data'),
                    });
                    return (
                      <View
                        style={[
                          styles.clientCard,
                          item.block && [
                            styles.clientCardBlocked,
                            { borderStartColor: '#EF4444' },
                          ],
                        ]}
                        accessibilityLabel={a11y}
                      >
                        <View style={styles.clientCardHeader}>
                          <View style={styles.clientCardLead}>
                            <View style={[styles.clientAvatar, { backgroundColor: `${colors.primary}22` }]}>
                              <Text style={[styles.clientAvatarLetter, { color: primaryOnSurface }]}>
                                {initial}
                              </Text>
                            </View>
                            <View style={styles.clientCardTextCol}>
                              <View style={styles.clientNameRow}>
                                <Text style={[styles.modalClientName, { color: colors.text }]} numberOfLines={1}>
                                  {item.name || t('common.client', 'Client')}
                                </Text>
                                {item.block ? (
                                  <View style={styles.clientBlockedBadge}>
                                    <Text style={styles.clientBlockedBadgeText}>{t('clients.statusBlocked')}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                          <View style={styles.clientCardActions}>
                            <TouchableOpacity
                              style={[styles.clientCallPill, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}35` }]}
                              onPress={() => handlePhoneCall(item.phone)}
                              accessibilityRole="button"
                              accessibilityLabel={t('clients.call.title', 'Call')}
                            >
                              <Ionicons name="call" size={20} color={primaryOnSurface} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={item.block ? styles.clientUnblockPill : styles.clientBlockPill}
                              onPress={() => (item.block ? handleUnblockClient(item) : handleBlockClient(item))}
                              activeOpacity={0.85}
                              accessibilityRole="button"
                              accessibilityLabel={
                                item.block
                                  ? t('clients.unblock.title', 'Unblock Client')
                                  : t('clients.block.title', 'Block Client')
                              }
                            >
                              <Text style={item.block ? styles.clientUnblockPillText : styles.clientBlockPillText}>
                                {item.block
                                  ? t('clients.actions.unblock', 'Unblock')
                                  : t('clients.actions.block', 'Block')}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={[styles.clientStatsStrip, { backgroundColor: `${colors.primary}10` }]}>
                          <View style={styles.clientStatCell}>
                            <View style={[styles.clientStatIconWrap, { backgroundColor: `${colors.primary}1E` }]}>
                              <Ionicons name="calendar-outline" size={20} color={primaryOnSurface} />
                            </View>
                            <View style={styles.clientStatTextCol}>
                              <Text style={[styles.clientStatValue, { color: colors.text }]}>{totalAppts}</Text>
                              <Text style={[styles.clientStatCaption, { color: colors.textSecondary }]}>
                                {t('clients.stats.visitsShort', 'Visits')}
                              </Text>
                            </View>
                          </View>
                          <View style={[styles.clientStatVRule, { backgroundColor: colors.border }]} />
                          <View style={styles.clientStatCell}>
                            <View style={[styles.clientStatIconWrap, { backgroundColor: `${colors.primary}1E` }]}>
                              <Ionicons name="wallet-outline" size={20} color={primaryOnSurface} />
                            </View>
                            <View style={styles.clientStatTextCol}>
                              <Text
                                style={[
                                  styles.clientStatValue,
                                  { color: colors.text },
                                  avgMo == null && { color: colors.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {avgMo != null ? formatClientMoney(avgMo) : '—'}
                              </Text>
                              <Text style={[styles.clientStatCaption, { color: colors.textSecondary }]}>
                                {t('clients.stats.avgMonthShort', 'Avg / month')}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  }}
                   contentContainerStyle={[
                     styles.clientsListContent,
                     { paddingBottom: insets.bottom + 24 },
                     filteredClients.length === 0 && styles.clientsListContentEmpty,
                   ]}
                />
             )}
             </View>
           </View>
         </View>
       </Modal>

      {isAdmin && (
        <AdminBroadcastComposer
          open={showBroadcast}
          onOpenChange={setShowBroadcast}
          renderTrigger={false}
          ensureCanBroadcast={ensureCanBroadcast}
        />
      )}
      <BroadcastOwnerOnlyModal
        visible={broadcastOwnerOnlyOpen}
        onClose={() => setBroadcastOwnerOnlyOpen(false)}
      />
    </View>
  );
 }

const createStyles = (colors: any, primaryOnSurface: string) => StyleSheet.create({
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
  /** Fixed behind the sheet (sibling under ScrollView z-index); never translated by scroll */
  adminHeroMarqueeHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_MARQUEE_HOST_HEIGHT,
    zIndex: 1,
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
    marginBottom: 0,
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
  /* ─── Quick tiles row + waitlist card (מתחת) ─── */
  quickTilesGrid: {
    marginTop: 12,
    marginBottom: 6,
    gap: 12,
  },
  quickTilesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  /** רשימת המתנה — מיושר לכרטיס nextCard ב-DailySchedule (surface, צל, כותרת+מפריד+גוף) */
  waitlistCard: {
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#1e293b',
        shadowOpacity: 0.09,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
      },
      android: { elevation: 5 },
    }),
  },
  waitlistCardHeader: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 11,
  },
  waitlistCardHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  waitlistCardHeaderIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitlistCardHeaderTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: '#64748B',
    flexShrink: 1,
  },
  waitlistCardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 0,
  },
  waitlistCardBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 14,
  },
  waitlistCardInfoCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 6,
  },
  waitlistCardSub: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    width: '100%',
  },
  waitlistCardVertDivider: {
    width: 1.5,
    height: 44,
    borderRadius: 2,
    marginHorizontal: 4,
  },
  waitlistCardCountBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingStart: 4,
  },
  waitlistCardCountNum: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  waitlistCardCountLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
    direction: 'ltr',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
    alignSelf: 'stretch',
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
  productAdminCarousel: {},
  productAdminCarouselContent: {
    paddingHorizontal: 16,
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
  // Hero styles (aligned with client home) — transparent so marquee shows through any edge
  fullScreenHero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_MARQUEE_HOST_HEIGHT,
    zIndex: 0,
    backgroundColor: 'transparent',
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
    /** Below white sheet (ScrollView zIndex 3) so the card slides over the scrim */
    zIndex: 1,
    overflow: 'hidden',
    borderCurve: 'continuous',
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
    color: primaryOnSurface,
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
    overflow: 'hidden',
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E8ED',
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingLeft: 32, // leave space for the left search icon
  },
  searchInputRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
    direction: 'rtl',
  },
  searchInputLtr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  clientsListSheet: {
    flex: 1,
    backgroundColor: '#F2F4F8',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    minHeight: 120,
  },
  clientsFlatList: {
    flex: 1,
  },
  clientsListContent: {
    paddingTop: 12,
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  clientsListContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  clientsEmptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  clientsEmptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  clientsEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: -0.2,
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
    color: primaryOnSurface,
    fontWeight: '600',
  },
  clientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8EAEF',
    ...Platform.select({
      ios: {
        shadowColor: '#1e293b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  clientCardBlocked: {
    borderStartWidth: 3,
  },
  clientCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  clientCardLead: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  clientAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  clientAvatarLetter: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  clientCardTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  clientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  clientBlockedBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  clientBlockedBadgeText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  modalClientName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.35,
    flexShrink: 1,
  },
  clientCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    paddingTop: 2,
  },
  clientCallPill: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  clientBlockPill: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clientBlockPillText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  clientUnblockPill: {
    backgroundColor: '#D1FAE5',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  clientUnblockPillText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  clientStatsStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 4,
  },
  clientStatCell: {
    flex: 1,
    /** Icon on visual right, numbers/labels on visual left (RTL + LTR) */
    flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  clientStatIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  clientStatTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
  },
  clientStatValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 2,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  clientStatCaption: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.05,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  clientStatVRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 4,
    opacity: 0.85,
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
