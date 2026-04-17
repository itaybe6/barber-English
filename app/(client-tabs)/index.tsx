import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
  Animated as RNAnimated,
  Easing,
  InteractionManager,
  AppState,
  Dimensions,
  RefreshControl,
  Platform,
  I18nManager,
  LayoutChangeEvent,
} from 'react-native';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { supabase, getBusinessId } from '@/lib/supabase';
import { getExpoExtra } from '@/lib/getExtra';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import MovingBorderCard from '@/components/MovingBorderCard';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Appointment as AvailableTimeSlot } from '@/lib/supabase';
import { businessProfileApi, getHomeHeaderTitleWhenLogoHidden } from '@/lib/api/businessProfile';
import { homeHeaderTitleFontStyle, normalizeHomeHeaderTitleFontId } from '@/lib/homeHeaderTitleFont';
import { usersApi } from '@/lib/api/users';
import type { BusinessProfile, WaitlistEntry } from '@/lib/supabase';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import DesignCarousel from '@/components/DesignCarousel';
import ProductCarousel from '@/components/ProductCarousel';
import { useDesignsStore } from '@/stores/designsStore';
import { useProductsStore } from '@/stores/productsStore';
import { getHomeLogoSource, getHomeLogoSourceFromUrl } from '@/src/theme/assets';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';
import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Marquee } from '@animatereactnative/marquee';
import { manicureImages } from '@/src/constants/manicureImages';
import { ManicureMarqueeTile } from '@/components/ManicureMarqueeTile';
import { distributeHeroMarqueeUrlsToRows, resolveAdminHeroMarqueeImages } from '@/components/home/AdminHomeHeroMarquee';
import { HomeHeroSingleBackdrop } from '@/components/home/HomeHeroSingleBackdrop';
import {
  normalizeHomeHeroMode,
  normalizeHomeHeroSingleKind,
  inferHomeHeroSingleKindFromUrl,
} from '@/lib/utils/homeHeroMode';
import { ClientWeekAvailabilityStrip } from '@/components/home/ClientWeekAvailabilityStrip';
import { WaitlistHomeFabPanel } from '@/components/WaitlistHomeFabPanel';
import { DAILY_SCHEDULE_SURFACE_RADIUS } from '@/components/DailySchedule';
import HomeFixedMessageSheet from '@/components/HomeFixedMessageSheet';
import InterestedSwapModal from '@/components/InterestedSwapModal';
import { swapRequestsApi } from '@/lib/api/swapRequests';
import type { SwapRequest } from '@/lib/supabase';
import { isClientAwaitingApproval } from '@/lib/utils/clientApproval';
import { toBcp47Locale } from '@/lib/i18nLocale';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Marquee geometry — aligned with `app/(tabs)/index.tsx` (admin home). */
const HERO_MARQUEE_TRANSLATE_Y = 0;
const HERO_ITEM_SIZE = Platform.OS === 'web' ? SCREEN_WIDTH * 0.255 : SCREEN_WIDTH * 0.35;
const HERO_SPACING = Platform.OS === 'web' ? 12 : 6;
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.82);
const HERO_MARQUEE_BOTTOM_BLEED = Math.round(SCREEN_HEIGHT * 0.135);
const HERO_MARQUEE_HOST_HEIGHT = HERO_HEIGHT + HERO_MARQUEE_BOTTOM_BLEED;
/** Match admin home sheet overlap / pull-up (`app/(tabs)/index.tsx`). */
const HERO_OVERLAP = 214;
const HERO_SHEET_PULL_UP = 64;
const MARQUEE_TILT_Z = I18nManager.isRTL ? '3.2deg' : '-3.2deg';
const MARQUEE_PLANE_SCALE = 1.075;
const MARQUEE_POST_TRANSFORM_NUDGE_Y = 48;
/** Hero header logo frame — same as admin `ADMIN_HOME_LOGO_*` (`app/(tabs)/index.tsx`). */
const CLIENT_HOME_LOGO_WIDTH = 138;
const CLIENT_HOME_LOGO_HEIGHT = 52;
/** Positive = more space below status bar / Dynamic Island (was −15, too tight). */
const CLIENT_HOME_LOGO_TOP_OFFSET = 8;

const HERO_BG = '#FFFFFF';
/** Top scrim over hero images — matches admin home primary fade (readability for status bar / header). */
const HERO_TOP_SCRIM_HEIGHT = Math.round(
  Math.max(196, Math.min(SCREEN_HEIGHT * 0.23, 226))
);
const HERO_TOP_SCRIM_BOTTOM_RADIUS = 32;

const manicureHeroRootStyle = {
  position: 'absolute' as const,
  left: -SCREEN_WIDTH * 0.18,
  right: -SCREEN_WIDTH * 0.18,
  top: -SCREEN_HEIGHT * 0.02,
  bottom: -SCREEN_HEIGHT * 0.07,
  overflow: 'hidden' as const,
};

function sanitizeUrlArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0);
}

const ManicureMarqueeHero = React.memo(({ images }: { images: string[] }) => {
  const safeImages = images.length > 0 ? images : manicureImages;

  const columns = useMemo(() => distributeHeroMarqueeUrlsToRows(safeImages), [safeImages]);

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
            key={`manicure-marquee-client-${columnIndex}`}
            speed={Platform.OS === 'web' ? 1 : 0.25}
            spacing={HERO_SPACING}
            reverse={columnIndex % 2 !== 0}
          >
            <View style={{ flexDirection: 'row', gap: HERO_SPACING }}>
              {column.map((image, index) => (
                <ManicureMarqueeTile
                  key={`manicure-image-client-${columnIndex}-${index}-${image}`}
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

      <LinearGradient
        colors={['rgba(255,255,255,0)', HERO_BG, HERO_BG]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        locations={[0, 0.7, 1]}
        style={styles.manicureHeroFadeBottom}
        pointerEvents="none"
      />
    </View>
  );
});


// API functions for client home
const clientHomeApi = {
  // Get user appointments for multiple dates (most efficient for user appointments)
  async getUserAppointmentsForMultipleDates(dates: string[], userName?: string, userPhone?: string): Promise<AvailableTimeSlot[]> {
    try {
      const businessId = getBusinessId();
      
      let query = supabase
        .from('appointments')
        .select('id, slot_date, slot_time, client_name, client_phone, service_name, barber_id, status, business_id, user_id, duration_minutes')
        .eq('business_id', businessId)
        .in('slot_date', dates)
        .eq('is_available', false)
        .order('slot_date')
        .order('slot_time');

      // Filter strictly by user's phone when available, otherwise fall back to name
      if (userPhone && userPhone.trim().length > 0) {
        query = query.eq('client_phone', userPhone.trim());
      } else if (userName && userName.trim().length > 0) {
        query = query.or([`client_name.ilike.%${userName.trim()}%`].join(','));
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching user appointments for multiple dates:', error);
        throw error;
      }

      // Additional client-side filtering: prefer phone strict match; name fallback only if no phone
      let filteredData = data || [];
      if (userPhone && userPhone.trim().length > 0) {
        filteredData = filteredData.filter(slot => String(slot.client_phone || '').trim() === userPhone.trim());
      } else if (userName && userName.trim().length > 0) {
        filteredData = filteredData.filter(slot => String(slot.client_name || '').trim().toLowerCase() === userName.trim().toLowerCase());
      }

      return filteredData;
    } catch (error) {
      console.error('Error in getUserAppointmentsForMultipleDates:', error);
      throw error;
    }
  },

  // Get user waitlist entries
  async getUserWaitlistEntries(userPhone: string): Promise<WaitlistEntry[]> {
    try {
      const businessId = getBusinessId();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('waitlist_entries')
        .select('*')
        .eq('business_id', businessId) // Filter by current business
        .eq('client_phone', userPhone)
        .gte('requested_date', today.toISOString().split('T')[0])
        .eq('status', 'waiting')
        .order('requested_date')
        .order('created_at');

      if (error) {
        console.error('Error fetching user waitlist entries:', error);
        throw error;
      }

      const entries = data || [];
      const staffIds = [...new Set(entries.map((e) => e.user_id).filter(Boolean))] as string[];
      let nameById: Record<string, string> = {};
      let imageById: Record<string, string | null> = {};
      if (staffIds.length > 0) {
        const { data: staffRows, error: staffErr } = await supabase
          .from('users')
          .select('id, name, image_url')
          .eq('business_id', businessId)
          .in('id', staffIds);
        if (!staffErr && staffRows) {
          nameById = Object.fromEntries(
            staffRows.map((r: { id: string; name: string | null }) => [r.id, String(r.name || '').trim()])
          );
          imageById = Object.fromEntries(
            staffRows.map((r: { id: string; image_url: string | null }) => [
              r.id,
              r.image_url && String(r.image_url).trim() ? String(r.image_url).trim() : null,
            ])
          );
        }
      }

      return entries.map((e) => ({
        ...e,
        staff_name: e.user_id ? nameById[e.user_id] || null : null,
        staff_image_url: e.user_id ? imageById[e.user_id] ?? null : null,
      }));
    } catch (error) {
      console.error('Error in getUserWaitlistEntries:', error);
      throw error;
    }
  },

  // Remove user from waitlist — returns true only if a row was actually deleted
  async removeFromWaitlist(entryId: string): Promise<boolean> {
    try {
      const businessId = getBusinessId();

      const { data, error } = await supabase
        .from('waitlist_entries')
        .delete()
        .eq('id', entryId)
        .eq('business_id', businessId)
        .select('id');

      if (error) {
        console.error('Error removing from waitlist:', error);
        throw error;
      }

      return Array.isArray(data) && data.length > 0;
    } catch (error) {
      console.error('Error in removeFromWaitlist:', error);
      throw error;
    }
  },

};

export default function ClientHomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isBlocked = Boolean((user as any)?.block);
  const awaitingApproval = isClientAwaitingApproval(user);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { primaryOnSurface, onPrimary } = usePrimaryContrast();
  const heroTopScrimGradientColors = [
    'rgba(0,0,0,0.92)',
    'rgba(0,0,0,0.82)',
    'rgba(0,0,0,0.55)',
    'rgba(0,0,0,0)',
  ] as const;
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
  
  const [nextAppointment, setNextAppointment] = useState<AvailableTimeSlot | null>(null);
  const [nextBarberName, setNextBarberName] = useState<string>('');
  const [nextBarberImage, setNextBarberImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false);
  const [interestedOpportunities, setInterestedOpportunities] = useState<Array<{ swapRequest: SwapRequest; myAppointment: AvailableTimeSlot }>>([]);
  const [showInterestedModal, setShowInterestedModal] = useState(false);
  const [cardWidth, setCardWidth] = useState(0);
  const [lavaCardLayout, setLavaCardLayout] = useState<{ w: number; h: number } | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const heroImages = useMemo(
    () => resolveAdminHeroMarqueeImages(sanitizeUrlArray((businessProfile as any)?.home_hero_images)),
    [businessProfile],
  );

  const clientHeroBackdrop = useMemo(() => {
    const mode = normalizeHomeHeroMode((businessProfile as any)?.home_hero_mode);
    const singleUrl = String((businessProfile as any)?.home_hero_single_url ?? '').trim();
    const storedKind = normalizeHomeHeroSingleKind((businessProfile as any)?.home_hero_single_kind);
    const singleKind = storedKind ?? (singleUrl ? inferHomeHeroSingleKindFromUrl(singleUrl) : 'image');
    const useSingle = mode === 'single_fullbleed' && /^https?:\/\//i.test(singleUrl);
    return { useSingle, singleUrl, singleKind };
  }, [businessProfile]);

  /** Full display name (including family name) for the empty-state book card greeting. */
  const bookCardGreetingDisplayName = useMemo(() => {
    const raw = user?.name?.trim();
    return raw && raw.length > 0 ? raw : null;
  }, [user?.name]);

  /** http(s) logo URL for hero — matches admin `homeLogoUrl` (`app/(tabs)/index.tsx`). */
  const homeLogoUrlForHeader = useMemo(() => {
    const raw = String(businessProfile?.home_logo_url ?? '').trim();
    return /^https?:\/\//i.test(raw) ? raw : null;
  }, [businessProfile?.home_logo_url]);
  const clientHomeHeaderShowLogo = businessProfile?.home_header_show_logo !== false;
  const clientHomeHeaderTitleFontStyle = useMemo(
    () =>
      homeHeaderTitleFontStyle(
        normalizeHomeHeaderTitleFontId(businessProfile?.home_header_title_font),
      ),
    [businessProfile?.home_header_title_font],
  );

  const [managerPhone, setManagerPhone] = useState<string | null>(null);
  const [businessPhone, setBusinessPhone] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Bumps after pull-to-refresh so the week strip refetches without leaving the screen */
  const [weekStripReloadToken, setWeekStripReloadToken] = useState(0);
  const [homeFixedMessageDismissed, setHomeFixedMessageDismissed] = useState(false);
  const [mapCoords, setMapCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [osmFailed, setOsmFailed] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const extra = useMemo(() => getExpoExtra(), []);
  const GOOGLE_STATIC_MAPS_KEY =
    (process.env as any)?.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY ||
    (extra as any)?.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY ||
    '';

  const { designs, fetchDesigns } = useDesignsStore();
  const { products, fetchProducts } = useProductsStore();

  // Removed scroll-driven translate animation (normal scroll behavior)

  const requireAuth = (onAuthed: () => void) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    onAuthed();
  };

  const SCREEN_W = Dimensions.get('window').width;
  const EMPTY_CARD_WIDTH = Math.max(280, SCREEN_W - 48); // 24px padding on both sides
  const EMPTY_CARD_HEIGHT = 260; // increased to avoid clipping content
  

  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const heroOverlayOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, 220],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );

  // Animated pulse for approved status dot
  const statusPulseAnim = React.useRef(new RNAnimated.Value(0)).current;
  const statusLoopRef = React.useRef<RNAnimated.CompositeAnimation | null>(null);
  const statusDotAnimatedStyle = {
    opacity: statusPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
  } as const;

  // Calendar icon background pulse (infinite)
  const iconPulseAnim = React.useRef(new RNAnimated.Value(0)).current;
  const iconPulseLoopRef = React.useRef<RNAnimated.CompositeAnimation | null>(null);
  const iconPulseAnimatedStyle = {
    opacity: iconPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] }),
    transform: [
      {
        scale: iconPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }),
      },
    ],
  } as const;

  // Ensure pulse animation keeps running when navigating away and back
  useFocusEffect(
    React.useCallback(() => {
      statusLoopRef.current?.stop();
      statusPulseAnim.stopAnimation?.(() => {});
      statusPulseAnim.setValue(0);

      const start = () => {
        const loop = RNAnimated.loop(
          RNAnimated.sequence([
            RNAnimated.timing(statusPulseAnim, {
              toValue: 1,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            RNAnimated.timing(statusPulseAnim, {
              toValue: 0,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ])
        );
        statusLoopRef.current = loop;
        loop.start();
      };

      const interactionHandle = InteractionManager.runAfterInteractions(() => start());
      const appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          statusLoopRef.current?.stop();
          statusPulseAnim.stopAnimation?.(() => {});
          statusPulseAnim.setValue(0);
          start();
        }
      });

      return () => {
        interactionHandle && typeof interactionHandle.cancel === 'function' && interactionHandle.cancel();
        appStateSub.remove();
        statusLoopRef.current?.stop();
      };
    }, [])
  );

  // Run icon pulse continuously while this screen is mounted (not tied to focus)
  useEffect(() => {
    iconPulseLoopRef.current?.stop();
    iconPulseAnim.stopAnimation?.(() => {});
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(iconPulseAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(iconPulseAnim, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    iconPulseLoopRef.current = loop;
    const handle = InteractionManager.runAfterInteractions(() => loop.start());
    return () => {
      typeof handle?.cancel === 'function' && handle.cancel();
      iconPulseLoopRef.current?.stop();
    };
  }, []);



  // (removed) animated border loop

  // Welcome header animation removed

  // (removed) old perimeter animation

  // Always use business profile address for map display (fallback to a safe default)
  const DEFAULT_MAP = {
    address: 'Tel Aviv-Yafo, Israel',
    coords: { lat: 32.0853, lon: 34.7818 },
  } as const;
  const displayAddress = (
    typeof businessProfile?.address === 'string' && (businessProfile.address as string).trim().length > 0
      ? (businessProfile.address as string).trim()
      : DEFAULT_MAP.address
  );

  const fetchUserAppointments = useCallback(async () => {
    if (!user?.name && !user?.phone) {
      setNextAppointment(null);
      return;
    }

    setIsLoading(true);
    const today = new Date();
    const dates: string[] = [];
    
    // Fetch appointments for the next N days — max horizon across barbers (per-employee windows)
    const horizonDays = await businessProfileApi.getMaxBookingOpenDaysAcrossBusiness();
    for (let i = 0; i <= horizonDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateString = date.toISOString().split('T')[0];
      dates.push(dateString);
    }
    
    try {
      const userAppointments = await clientHomeApi.getUserAppointmentsForMultipleDates(
        dates, 
        user?.name, 
        user?.phone
      );
      
      const upcomingAppointments = userAppointments
        .filter((apt: AvailableTimeSlot) => {
          const timeString = apt.slot_time ? String(apt.slot_time) : '00:00';
          const [hh = '00', mm = '00'] = timeString.split(':');
          const appointmentDateTime = new Date(`${apt.slot_date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`);
          return appointmentDateTime.getTime() >= Date.now();
        })
        .sort((a: AvailableTimeSlot, b: AvailableTimeSlot) => {
          const dateA = new Date(a.slot_date);
          const dateB = new Date(b.slot_date);
          if (dateA.getTime() === dateB.getTime()) {
            // If same date, sort by time
            return a.slot_time.localeCompare(b.slot_time);
          }
          return dateA.getTime() - dateB.getTime();
        });
      
      
      if (upcomingAppointments.length > 0) {
        const appt = upcomingAppointments[0];
        setNextAppointment(appt);
        // Fetch barber info
        if (appt.barber_id) {
          try {
            const barberData = await usersApi.getUserById(appt.barber_id);
            setNextBarberName(barberData?.name ? String(barberData.name) : '');
            setNextBarberImage(barberData?.image_url ?? null);
          } catch {
            setNextBarberName('');
            setNextBarberImage(null);
          }
        }
      } else {
        setNextAppointment(null);
        setNextBarberName('');
        setNextBarberImage(null);
      }
    } catch (error) {
      console.error('Error fetching user appointments:', error);
      setNextAppointment(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.name, user?.phone]);

  // Fetch waitlist entries
  const fetchWaitlistEntries = useCallback(async () => {
    if (!user?.phone) {
      setWaitlistEntries([]);
      return;
    }

    setIsLoadingWaitlist(true);
    try {
      const entries = await clientHomeApi.getUserWaitlistEntries(user.phone);
      setWaitlistEntries(entries);
    } catch (error) {
      console.error('Error fetching waitlist entries:', error);
      setWaitlistEntries([]);
    } finally {
      setIsLoadingWaitlist(false);
    }
  }, [user?.phone]);

  /** Server-side delete for a single entry; UI (loader → ✓) lives inside `WaitlistHomeFabPanel`. */
  const handleConfirmRemoveWaitlistEntry = useCallback(async (entryId: string): Promise<boolean> => {
    try {
      return await clientHomeApi.removeFromWaitlist(entryId);
    } catch (error) {
      console.error('Error removing from waitlist:', error);
      return false;
    }
  }, []);

  const handleWaitlistRemoveEntrySuccessDismiss = useCallback((entryId: string) => {
    setWaitlistEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  // Fetch active swap requests from OTHER users that want MY next appointment slot
  useEffect(() => {
    if (!nextAppointment || !user?.phone) {
      setInterestedOpportunities([]);
      return;
    }
    let cancelled = false;
    swapRequestsApi.findSwapOpportunities(user.phone, [nextAppointment as any]).then((opps) => {
      if (!cancelled) setInterestedOpportunities(opps as any);
    });
    return () => { cancelled = true; };
  }, [nextAppointment?.id, user?.phone]);

  // Fetch appointments when component mounts
  useEffect(() => {
    fetchUserAppointments();
  }, [fetchUserAppointments]);

  // Fetch waitlist entries when component mounts
  useEffect(() => {
    fetchWaitlistEntries();
  }, [fetchWaitlistEntries]);

  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Load business profile (address and social links)
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const p = await businessProfileApi.getProfile();
        // getProfile() returns null on Supabase errors without throwing — never replace a good
        // profile with null or we lose home_logo_url / hero images until the next full reload.
        if (p) {
          setBusinessProfile(p);
          // After profile is loaded, refresh appointments horizon
          try {
            await fetchUserAppointments();
          } catch {}

          // Extract phone number from business profile
          if (p.phone) {
            const numeric = p.phone.replace(/\D/g, '');
            let normalized = numeric;
            if (numeric.startsWith('0') && numeric.length >= 9) {
              normalized = `972${numeric.slice(1)}`;
            } else if (!numeric.startsWith('972')) {
              normalized = numeric; // leave as is; wa.me accepts many formats if country code included
            }
            setBusinessPhone(normalized);
          }
        }
      } catch (error) {
        console.error('Error loading business profile:', error);
        setBusinessProfile(null);
        setBusinessPhone(null);
      }
    };
    loadProfile();
  }, []);

  // Geocode display address (client > business) to coordinates for static map (no API key needed)
  useEffect(() => {
    const geocode = async () => {
      try {
        const address = displayAddress;
        if (!address) { setMapCoords(DEFAULT_MAP.coords); return; }
        // Prefer Google Geocoding (matches "Google Maps" expectations) when we have a key.
        if (GOOGLE_STATIC_MAPS_KEY) {
          try {
            const gRes = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(
                GOOGLE_STATIC_MAPS_KEY
              )}`
            );
            const gData: any = await gRes.json();
            const loc = gData?.results?.[0]?.geometry?.location;
            const latNum = Number(loc?.lat);
            const lonNum = Number(loc?.lng);
            if (!Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
              setMapCoords({ lat: latNum, lon: lonNum });
              return;
            }
          } catch {
            // fall through to OSM geocode
          }
        }

        // Fallback: OSM Nominatim (no key required)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(address)}`,
          {
            headers: {
              'User-Agent': 'SlotlysApp/1.0 (+https://slotlys.com)',
            },
          }
        );
        const data: any[] = await res.json();
        const first = Array.isArray(data) ? data[0] : null;
        const latNum = Number(first?.lat);
        const lonNum = Number(first?.lon);
        if (!Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
          setMapCoords({ lat: latNum, lon: lonNum });
          return;
        }

        setMapCoords(DEFAULT_MAP.coords);
      } catch (e) {
        // Fallback to default coords
        setMapCoords(DEFAULT_MAP.coords);
      }
    };
    geocode();
  }, [displayAddress]);

  // (removed) verbose key and HTTP status logging

  const handleOsmError = useCallback(() => {
    setOsmFailed(true);
  }, []);

  const handleGoogleError = useCallback(() => {
    setGoogleFailed(true);
  }, []);

  // Reset image fallback flags when address/coords change
  useEffect(() => {
    setOsmFailed(false);
    setGoogleFailed(false);
  }, [displayAddress, mapCoords?.lat, mapCoords?.lon]);


  // Load manager phone (first admin user)
  useEffect(() => {
    const loadManagerPhone = async () => {
      try {
        const businessId = getBusinessId();
        
        const { data, error } = await supabase
          .from('users')
          .select('phone')
          .eq('business_id', businessId) // Filter by current business
          .eq('user_type', 'admin')
          .not('phone', 'is', null)
          .neq('phone', '')
          .limit(1)
          .maybeSingle();
        if (!error && data?.phone) {
          const numeric = (data.phone as string).replace(/\D/g, '');
          let normalized = numeric;
          if (numeric.startsWith('0') && numeric.length >= 9) {
            normalized = `972${numeric.slice(1)}`;
          } else if (!numeric.startsWith('972')) {
            normalized = numeric; // leave as is; wa.me accepts many formats if country code included
          }
          setManagerPhone(normalized);
        }
      } catch (e) {
        setManagerPhone(null);
      }
    };
    loadManagerPhone();
  }, []);

  // Fetch appointments when screen comes into focus (e.g., after booking an appointment)
  useFocusEffect(
    useCallback(() => {
      fetchUserAppointments();
      fetchWaitlistEntries();
      // Reload business profile to get updated images
      const loadProfile = async () => {
        try {
          const p = await businessProfileApi.getProfile();
          if (p) setBusinessProfile(p);
        } catch (error) {
          console.error('Error loading business profile on focus:', error);
        }
      };
      loadProfile();
    }, [fetchUserAppointments, fetchWaitlistEntries])
  );

  // Pull-to-refresh handler to reload dashboard data
  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
        await Promise.all([
        fetchUserAppointments(),
        fetchWaitlistEntries(),
        fetchDesigns(),
        fetchProducts(),
        (async () => {
          try {
            const p = await businessProfileApi.getProfile();
            if (p) setBusinessProfile(p);
          } catch {
            /* keep existing profile — avoid flashing bundled logo on transient errors */
          }
        })(),
      ]);
    } finally {
      setRefreshing(false);
      setWeekStripReloadToken((n) => n + 1);
    }
  }, [fetchUserAppointments, fetchWaitlistEntries, fetchDesigns, fetchProducts]);

  // Show all services in a horizontal scroll
  
  const appLocale = toBcp47Locale(i18n?.language);
  const isRTL = I18nManager.isRTL;
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(appLocale as any, {
      day: 'numeric',
      month: 'long'
    });
  };
  
  const formatWaitlistDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(appLocale as any, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  };
  
  const formatTime = (timeString: string) => {
    return formatTime12Hour(timeString);
  };

  const parseFormattedTime = (formatted: string) => {
    const trimmed = formatted.trim();
    const match = trimmed.match(/^(\d{1,2}:\d{2})\s*(.*)$/);
    return {
      hm: match?.[1] ?? trimmed,
      suffix: match?.[2] ?? '',
    };
  };

  const getAppointmentStatusColor = (status?: AvailableTimeSlot['status']) => {
    switch (status) {
      case 'confirmed':
        return '#34C759';
      case 'pending':
        return '#F59E0B';
      case 'cancelled':
      case 'no_show':
        return '#EF4444';
      case 'completed':
        return '#64748B';
      default:
        return '#34C759';
    }
  };

  const getAppointmentStatusLabel = (status?: AvailableTimeSlot['status']) => {
    switch (status) {
      case 'pending':
        return t('appointments.pending', 'Pending');
      case 'cancelled':
        return t('appointments.cancelled', 'Cancelled');
      case 'completed':
        return t('appointments.completed', 'Completed');
      case 'no_show':
        return t('appointments.noShow', 'No show');
      case 'confirmed':
      default:
        return t('appointments.confirmed', 'Confirmed');
    }
  };

  const nextAppointmentTime = parseFormattedTime(formatTime(nextAppointment?.slot_time ?? ''));
  
  const homeFixedMessageText = String(businessProfile?.home_fixed_message ?? '').trim();
  const showHomeFixedMessageModal =
    businessProfile?.home_fixed_message_enabled === true &&
    homeFixedMessageText.length > 0 &&
    !homeFixedMessageDismissed;

  useEffect(() => {
    setHomeFixedMessageDismissed(false);
  }, [businessProfile?.home_fixed_message, businessProfile?.home_fixed_message_enabled]);

  const socialLinks = [
    businessProfile?.instagram_url ? { name: 'Instagram', icon: 'logo-instagram', color: '#E4405F', url: businessProfile.instagram_url } : null,
    businessProfile?.facebook_url ? { name: 'Facebook', icon: 'logo-facebook', color: '#1877F2', url: businessProfile.facebook_url } : null,
    businessProfile?.tiktok_url ? { name: 'TikTok', icon: 'logo-tiktok', color: '#000000', url: businessProfile.tiktok_url } : null,
  ].filter(Boolean) as Array<{ name: string; icon: any; color: string; url: string }>;

  // Animated stripe around empty card - dynamic layout and animated positions
  // (removed) stripeThickness/stripePad — using MovingBorderCard now
  // SVG stroke-dash animation will follow the exact rounded rect

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.fullScreenHero}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fullScreenHeroOverlay}
          pointerEvents="none"
        />
      </View>

      {Platform.OS !== 'android' && (
        <View style={styles.clientHeroMarqueeHost} pointerEvents="none" collapsable={false}>
          {clientHeroBackdrop.useSingle ? (
            <HomeHeroSingleBackdrop
              uri={clientHeroBackdrop.singleUrl}
              kind={clientHeroBackdrop.singleKind}
              fadeToColor={HERO_BG}
            />
          ) : (
            <ManicureMarqueeHero images={heroImages} />
          )}
        </View>
      )}

      <RNAnimated.ScrollView
        style={{ flex: 1, zIndex: 3, backgroundColor: 'transparent' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={primaryOnSurface}
          />
        }
        contentContainerStyle={{
          paddingTop: Platform.OS === 'android' ? 0 : (HERO_HEIGHT - HERO_OVERLAP),
          paddingBottom: insets.bottom + 120,
        }}
      >
        {Platform.OS === 'android' && (
          <View
            style={{ height: HERO_HEIGHT - HERO_OVERLAP, overflow: 'hidden' }}
            pointerEvents="none"
          >
            {clientHeroBackdrop.useSingle ? (
              <HomeHeroSingleBackdrop
                uri={clientHeroBackdrop.singleUrl}
                kind={clientHeroBackdrop.singleKind}
                fadeToColor={HERO_BG}
              />
            ) : (
              <ManicureMarqueeHero images={heroImages} />
            )}
          </View>
        )}
        <View
          style={[
            styles.clientHomeSheetShell,
            {
              minHeight: SCREEN_HEIGHT - insets.top - 60,
              marginTop: -HERO_SHEET_PULL_UP,
            },
          ]}
        >
          <View style={styles.dragHandle} />
          <LinearGradient
            colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.sheetTopShadow}
            pointerEvents="none"
          />
            <SafeAreaView edges={['left', 'right']} style={styles.clientHomeSafeArea}>
              <View style={[styles.contentWrapperSheet, { zIndex: 10 }]}>
                <View style={styles.contentWrapperInner}>
        {/* Appointment / Book Card */}
        <View style={[styles.sectionContainer, { marginTop: 16 }]}>
          {isLoading ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>{t('appointments.loadingAppointments', 'Loading your appointments...')}</Text>
            </View>
          ) : nextAppointment ? (
            /* ── Next Appointment Card (clean, like admin) ── */
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => requireAuth(() => router.push('/(client-tabs)/appointments'))}
              style={styles.clientNextCard}
            >
              <View style={styles.clientNextHeader}>
                {/* Date in header */}
                <Text style={styles.clientNextBarberHeaderName} numberOfLines={1}>
                  {formatDate(nextAppointment.slot_date)}
                </Text>
                <Text style={styles.clientNextHeaderLabel}>{t('appointments.next', 'Next appointment')}</Text>
              </View>
              <View style={styles.clientNextDivider} />
              <View style={[styles.clientNextBody, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {/* Avatar + texts side by side */}
                <View style={[styles.clientNextInfo, { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }]}>
                  {/* Big avatar */}
                  {nextBarberImage ? (
                    <Image
                      source={{ uri: nextBarberImage }}
                      style={styles.clientNextBarberBigAvatar}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.clientNextBarberBigAvatar, styles.clientNextBarberAvatarFallback]}>
                      <Ionicons name="person" size={22} color="#AAA" />
                    </View>
                  )}
                  {/* Service name + barber name stacked */}
                  <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start', gap: 3 }}>
                    <Text
                      style={[styles.clientNextService, { textAlign: isRTL ? 'right' : 'left' }]}
                      numberOfLines={1}
                    >
                      {nextAppointment.service_name || t('service', 'Service')}
                    </Text>
                    {nextBarberName ? (
                      <Text style={[styles.clientNextBarberHeaderName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                        {nextBarberName}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={[styles.clientNextTimeDivider, { backgroundColor: `${colors.primary}25` }]} />
                <View style={styles.clientNextTimeBlock}>
                  <Text style={[styles.clientNextTimeHM, { color: primaryOnSurface }]}>
                    {nextAppointmentTime.hm}
                  </Text>
                  {nextAppointmentTime.suffix ? (
                    <Text style={[styles.clientNextTimeSuffix, { color: `${primaryOnSurface}B3` }]}>
                      {nextAppointmentTime.suffix}
                    </Text>
                  ) : null}
                </View>
              </View>
              {/* Interested swap footer — only when others want this slot */}
              {interestedOpportunities.length > 0 && (
                <>
                  <View style={styles.clientNextDivider} />
                  <View style={styles.clientNextInterestedRow}>
                    <TouchableOpacity
                      style={styles.interestedBadge}
                      onPress={() => setShowInterestedModal(true)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="people" size={13} color="#534AB7" />
                      <Text style={styles.interestedBadgeText}>
                        {t('swap.interested.badge', 'מעוניינים להחלפה')} · {interestedOpportunities.length}
                      </Text>
                      <Ionicons name="chevron-forward" size={12} color="#534AB7" />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </TouchableOpacity>
          ) : (
            /* ── Lava Lamp Book Appointment Card ── */
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.lavaBookCard, (isBlocked || awaitingApproval) && { opacity: 0.55 }]}
              disabled={isBlocked || awaitingApproval}
              accessibilityRole="button"
              accessibilityLabel={
                bookCardGreetingDisplayName
                  ? `${t('home.emptyNextCard.greetingWithName', { name: bookCardGreetingDisplayName })}. ${t('home.emptyNextCard.subtitle')}`
                  : `${t('home.emptyNextCard.greeting')}. ${t('home.emptyNextCard.subtitle')}`
              }
              onPress={() => {
                if (!isAuthenticated) {
                  router.push('/login');
                  return;
                }
                if (isBlocked) { Alert.alert(t('account.blocked'), t('account.blocked.message')); return; }
                if (awaitingApproval) { Alert.alert(t('account.awaitingApproval'), t('account.awaitingApproval.message')); return; }
                router.push('/(client-tabs)/book-appointment');
              }}
              onLayout={(e: LayoutChangeEvent) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) setLavaCardLayout({ w: width, h: height });
              }}
            >
              <LinearGradient
                colors={[colors.primary, `${colors.primary}DD`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {Platform.OS !== 'web' && lavaCardLayout ? (
                <BrandLavaLampBackground
                  primaryColor={colors.primary}
                  baseColor={colors.primary}
                  layoutWidth={lavaCardLayout.w}
                  layoutHeight={lavaCardLayout.h}
                  count={3}
                  duration={13000}
                  blurIntensity={32}
                  emphasis="bold"
                />
              ) : null}
              <View style={styles.lavaBookContent}>
                <View style={styles.lavaBookTextBlock}>
                  <Text style={[styles.lavaBookTitle, { color: onPrimary }]}>
                    {bookCardGreetingDisplayName
                      ? t('home.emptyNextCard.greetingWithName', { name: bookCardGreetingDisplayName })
                      : t('home.emptyNextCard.greeting')}
                  </Text>
                  <Text style={[styles.lavaBookLabel, { color: `${onPrimary}99` }]}>
                    {t('home.emptyNextCard.subtitle')}
                  </Text>
                </View>
                <View style={[styles.lavaBookArrow, { backgroundColor: `${onPrimary}22` }]}>
                  <Ionicons name="add" size={26} color={onPrimary} />
                </View>
              </View>
            </TouchableOpacity>
          )}
          {waitlistEntries.length > 0 ? (
            <View style={styles.waitlistCardHost}>
              <WaitlistHomeFabPanel
                entries={waitlistEntries}
                formatWaitlistDate={formatWaitlistDate}
                triggerVariant="card"
                onConfirmRemoveEntry={handleConfirmRemoveWaitlistEntry}
                onRemoveEntrySuccessDismiss={handleWaitlistRemoveEntrySuccessDismiss}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.sectionContainer}>
          <ClientWeekAvailabilityStrip
            primaryColor={colors.primary}
            isBlocked={isBlocked}
            awaitingApproval={awaitingApproval}
            reloadToken={weekStripReloadToken}
          />
        </View>

        {/* Design Carousel */}
        {designs && designs.length > 0 && (
          <DesignCarousel
            designs={designs}
            title={t('home.designCarouselTitle')}
            subtitle={t('home.designCarouselSubtitle')}
            showDots={false}
            onDesignPress={(design) => {
              if (!isAuthenticated) {
                router.push('/login');
                return;
              }
              router.push(
                `/(client-tabs)/gallery?tab=designs&designId=${encodeURIComponent(design.id)}` as any
              );
            }}
          />
        )}

        {/* Product Carousel */}
        {products && products.length > 0 && (
          <ProductCarousel
            products={products}
            subtitle={t('products.carouselSubtitle')}
            onProductPress={(product) => {
              if (!isAuthenticated) {
                router.push('/login');
                return;
              }
              router.push(
                `/(client-tabs)/gallery?tab=products&productId=${encodeURIComponent(product.id)}` as any
              );
            }}
          />
        )}

        {/* Location / Map Section (moved above Follow us) */}
        {displayAddress ? (
          <View style={[styles.sectionContainer, { marginBottom: 24 }]}> 
            <View style={styles.sectionHeaderModernSimple}>
              <Text style={[styles.sectionHeadingTitle, { color: colors.text }]}>
                {t('how.to.get.here')}
              </Text>
            </View>
             
             <TouchableOpacity
               activeOpacity={0.9}
               onPress={async () => {
                const address = displayAddress;
                 if (!address) return;
                 const appleUrl = `http://maps.apple.com/?q=${encodeURIComponent(address)}`;
                 const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
                 try {
                   const canOpen = await Linking.canOpenURL(appleUrl);
                   if (canOpen) {
                     await Linking.openURL(appleUrl);
                   } else {
                     await Linking.openURL(googleUrl);
                   }
                 } catch {}
               }}
               style={styles.mapCard}
               accessibilityRole="button"
               accessibilityLabel={t('tap.map.for.directions')}
             >
             {GOOGLE_STATIC_MAPS_KEY && !googleFailed ? (
               <Image
                 source={{ uri: (
                   mapCoords
                    ? `https://maps.googleapis.com/maps/api/staticmap?center=${mapCoords.lat},${mapCoords.lon}&zoom=16&scale=2&size=640x400&maptype=roadmap&style=feature:poi|visibility:off&style=feature:transit|visibility:off&style=feature:road|element:geometry|color:0xf0f0f0&style=feature:water|element:geometry|color:0xd8ecff&style=feature:landscape|element:geometry|color:0xf7f7f7&key=${GOOGLE_STATIC_MAPS_KEY}`
                    : `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(displayAddress)}&zoom=16&scale=2&size=640x400&maptype=roadmap&style=feature:poi|visibility:off&style=feature:transit|visibility:off&style=feature:road|element:geometry|color:0xf0f0f0&style=feature:water|element:geometry|color:0xd8ecff&style=feature:landscape|element:geometry|color:0xf7f7f7&key=${GOOGLE_STATIC_MAPS_KEY}`
                 ) }}
                 style={styles.mapImage}
                 resizeMode="cover"
                 onError={handleGoogleError}
               />
             ) : mapCoords ? (
               <Image
                 source={{ uri: `https://staticmap.openstreetmap.de/staticmap.php?center=${mapCoords.lat},${mapCoords.lon}&zoom=16&size=640x400&maptype=mapnik` }}
                 style={styles.mapImage}
                 resizeMode="cover"
                 defaultSource={require('@/assets/images/1homePage.jpg')}
               />
             ) : (
               <View style={[styles.mapImage, { backgroundColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center' }]}>
                 <Ionicons name="location-outline" size={48} color="#8E8E93" />
                 <Text style={{ fontSize: 16, fontWeight: '600', color: '#8E8E93', marginTop: 8, textAlign: 'center' }}>
                   {t('map.preview')}
                 </Text>
                 <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>
                   {displayAddress}
                 </Text>
               </View>
             )}
              <View style={styles.mapOverlay} />
              {/* Apple-style map pin */}
              <View style={styles.mapPinHost} pointerEvents="none">
                {/* Balloon container */}
                <View style={styles.mapBalloon}>
                  {/* White circle with logo */}
                  <View style={[styles.mapBalloonCircle, {
                    shadowColor: '#000000',
                  }]}>
                    <Image
                      source={getHomeLogoSource(businessProfile)}
                      style={styles.mapBalloonLogo}
                      resizeMode="contain"
                    />
                  </View>
                  {/* Tip: white rotated square overlapping the circle bottom */}
                  <View style={styles.mapBalloonTip} />
                  {/* Shadow dot */}
                  <View style={[styles.mapBalloonDot, { backgroundColor: colors.primary + '28' }]} />
                </View>
              </View>
              {/* Bottom dark bar with business name and address */}
              {(businessProfile?.display_name || displayAddress) && (
                <LinearGradient
                  colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.75)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.mapBottomBar}
                >
                  {!!businessProfile?.display_name && (
                    <Text style={[styles.mapBottomName, { textAlign: 'left', width: '100%' }]}>
                      {businessProfile.display_name}
                    </Text>
                  )}
                  {!!displayAddress && (
                    <Text style={[styles.mapBottomAddress, { textAlign: 'left', width: '100%' }]} numberOfLines={1}>
                      {displayAddress}
                    </Text>
                  )}
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        ) : null}


        {/* Social Section — minimal, no title */}
        {(socialLinks.length > 0 || businessPhone || managerPhone) && (
          <View style={styles.socialContainer}>
            {socialLinks.map((social) => (
              <TouchableOpacity
                key={social.name}
                style={styles.socialButtonMinimal}
                onPress={() => Linking.openURL(social.url)}
                activeOpacity={0.7}
              >
                <Ionicons name={social.icon as any} size={22} color={social.color} />
              </TouchableOpacity>
            ))}
            {(businessPhone || managerPhone) && (
              <TouchableOpacity
                style={styles.socialButtonMinimal}
                onPress={async () => {
                  const phoneToUse = businessPhone || managerPhone;
                  if (!phoneToUse) return;
                  const message = 'Hi';
                  const smsUrl = Platform.OS === 'ios'
                    ? `sms:${phoneToUse}&body=${encodeURIComponent(message)}`
                    : `sms:${phoneToUse}?body=${encodeURIComponent(message)}`;
                  try {
                    const canOpen = await Linking.canOpenURL(smsUrl);
                    if (canOpen) await Linking.openURL(smsUrl);
                  } catch {}
                }}
                activeOpacity={0.7}
                accessibilityLabel={t('notifications.title')}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#3C3C43" />
              </TouchableOpacity>
            )}
          </View>
        )}

                </View>
              </View>

            </SafeAreaView>
        </View>
      </RNAnimated.ScrollView>

      <RNAnimated.View
        pointerEvents="none"
        style={[
          styles.heroTopScrimBand,
          {
            height: HERO_TOP_SCRIM_HEIGHT,
            borderBottomLeftRadius: HERO_TOP_SCRIM_BOTTOM_RADIUS,
            borderBottomRightRadius: HERO_TOP_SCRIM_BOTTOM_RADIUS,
          },
          { opacity: heroOverlayOpacity },
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={heroTopScrimGradientColors}
          locations={[0, 0.22, 0.52, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </RNAnimated.View>

      <RNAnimated.View
        pointerEvents="none"
        style={[styles.overlayHeaderLogoOnly, { top: insets.top + CLIENT_HOME_LOGO_TOP_OFFSET }, { opacity: heroOverlayOpacity }]}
      >
        {businessProfile ? (
          clientHomeHeaderShowLogo ? (
            <View style={styles.headerLogoInner}>
              <Image
                source={getHomeLogoSourceFromUrl(homeLogoUrlForHeader)}
                style={[styles.overlayLogo, styles.overlayLogoHeroWhite]}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={styles.clientHomeHeaderTitleNoLogoWrap}>
              <Text
                style={[styles.clientHomeHeaderTitleNoLogo, clientHomeHeaderTitleFontStyle]}
                numberOfLines={2}
              >
                {getHomeHeaderTitleWhenLogoHidden(businessProfile) ||
                  t('settings.profile.displayNameFallbackShort', 'Business')}
              </Text>
            </View>
          )
        ) : null}
      </RNAnimated.View>

      {/* Interested swap requests modal */}
      <InterestedSwapModal
        visible={showInterestedModal}
        opportunities={interestedOpportunities}
        onClose={() => setShowInterestedModal(false)}
        onSwapSuccess={() => {
          setShowInterestedModal(false);
          fetchUserAppointments();
          setInterestedOpportunities([]);
        }}
      />

      <HomeFixedMessageSheet
        visible={showHomeFixedMessageModal}
        message={homeFixedMessageText}
        onDismiss={() => setHomeFixedMessageDismissed(true)}
      />

    </View>
  );
}

const styles = StyleSheet.create<any>({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    minHeight: '100%',
  },
  // Full Screen Hero Styles — fixed behind sheet (aligned with admin home)
  fullScreenHero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_MARQUEE_HOST_HEIGHT,
    zIndex: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  /** Same role as admin `adminHeroMarqueeHost` — fixed top, extra height for bottom bleed under tilted grid */
  clientHeroMarqueeHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_MARQUEE_HOST_HEIGHT,
    zIndex: 1,
    overflow: 'hidden',
  },
  /** Rounded shell for inner scroll — solid white so nothing shows through at the sides/top */
  clientHomeSheetShell: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
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
    zIndex: 0, // Very low z-index so white background can overlap it
  },
  heroTopScrimBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    /** Below sheet (zIndex 3) so the card slides over the scrim — same as admin */
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
    overflow: 'visible',
  },
  /** Hero header: logo only — absolute positioned same as admin overlayLogoWrapper */
  overlayHeaderLogoOnly: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  /** Fills `headerLogoInner` — same as admin `overlayLogo`. */
  overlayLogo: {
    width: '100%',
    height: '100%',
  },
  /** White on hero scrim — same treatment as admin home (`overlayLogoHeroWhite`). */
  overlayLogoHeroWhite: {
    tintColor: '#FFFFFF',
  },
  fullScreenHeroContent: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    alignItems: 'flex-start',
    zIndex: 0, // Very low z-index so white background can overlap it
  },
  manicureHeroFadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '30%',
  },
  scrollContent: {
    paddingBottom: 24,
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
  welcomeSection: {
    flex: 1,
    alignItems: 'flex-start',
  },
  welcomeText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  userName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 4,
    letterSpacing: -0.8,
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
    marginTop: 8,
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#000000',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Admin-like header structure
  headerSide: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Matches admin `overlayLogoInner` — fixed box so logo scales like manager home */
  headerLogoInner: {
    width: CLIENT_HOME_LOGO_WIDTH,
    height: CLIENT_HOME_LOGO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** When `home_header_show_logo` is false — matches admin `overlayNameInner` */
  clientHomeHeaderTitleNoLogoWrap: {
    maxWidth: Math.min(CLIENT_HOME_LOGO_WIDTH + 100, SCREEN_WIDTH - 40),
    minHeight: CLIENT_HOME_LOGO_HEIGHT,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Matches admin `overlayBusinessName` when logo is hidden */
  clientHomeHeaderTitleNoLogo: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  /** Full-width safe area so the sheet is not inset from screen edges (admin home is edge-to-edge white). */
  clientHomeSafeArea: {
    flexGrow: 1,
    width: '100%',
  },
  /** Solid white sheet — matches admin `contentWrapper` (no glass gradient / no inset padding ring). */
  contentWrapperSheet: {
    width: '100%',
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
  contentWrapperInner: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  logo: {
    width: 160,
    height: 60,
    alignSelf: 'center',
  },
  quickActionsContainer: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  primaryAction: {
    marginBottom: 20,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    gap: 12,
  },
  primaryActionText: {
    color: '#1C1C1E',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  singleSecondaryAction: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    minWidth: 200,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  secondaryActionText: {
    fontSize: 14,
    color: '#1C1C1E',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sectionContainer: {
    paddingHorizontal: 24,
    marginBottom: 0, // No margin to avoid extra white space
  },
  waitlistTagHost: {
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  waitlistCardHost: {
    marginTop: 12,
    width: '100%',
  },
  sectionTopSpacer: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 20,
    textAlign: 'right',
    letterSpacing: -0.5,
  },
  sectionHeader: {
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  // Hero Section Styles
  heroSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  heroImageContainer: {
    position: 'relative',
    height: 280,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 28,
    alignItems: 'flex-end',
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
  greetingContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: -4,
    textAlign: 'right',
    letterSpacing: -0.2,
    fontWeight: '500',
  },
  sectionTitleCompact: {
    marginBottom: 4,
  },
  appointmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    overflow: 'hidden',
  },
  appointmentCardWrapper: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  appointmentAccent: {
    display: 'none',
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  serviceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.12)',
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    textAlign: 'left',
    letterSpacing: -0.1,
    marginBottom: 4,
  },
  appointmentService: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
    textAlign: 'left',
    letterSpacing: -0.3,
  },
  appointmentSubtext: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
    textAlign: 'left',
    letterSpacing: -0.2,
    marginTop: -6,
    marginBottom: 6,
  },
  appointmentDetails: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 16,
  },
  appointmentDetailsPill: {
    backgroundColor: '#F7F7FA',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  appointmentDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailsDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 4,
  },
  appointmentDetailText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  appointmentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  appointmentStatusContainer: {
    alignItems: 'flex-start',
    marginTop: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  appointmentStatusText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  appointmentAction: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  appointmentActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appointmentActionButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  appointmentActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  appointmentActionButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  
  emptyAppointmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  emptyAppointmentText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyAppointmentSubtext: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  emptyAppointmentAction: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyAppointmentActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  locationButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  locationButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  locationTextContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  locationButtonTitle: {
    fontSize: 18,
    color: '#1C1C1E',
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  locationButtonSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 20,
  },
  socialButtonMinimal: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleMapsLogo: {
    width: 28,
    height: 28,
  },
  mapCard: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 220,
    marginTop: 16,
    backgroundColor: '#E5E5EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  mapPinHost: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    // total visual height: circle(58) + tip(10) + dot(4) + gap(2) = ~74
    transform: [{ translateX: -29 }, { translateY: -74 }],
    width: 58,
    alignItems: 'center',
  },
  mapPinPulse: {
    position: 'absolute',
    top: -10,
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1.5,
  },
  mapBalloon: {
    alignItems: 'center',
  },
  mapBalloonCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 1,
  },
  mapBalloonLogo: {
    width: 38,
    height: 38,
  },
  mapBalloonTip: {
    width: 18,
    height: 18,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
    marginTop: -13,
    borderBottomRightRadius: 3,
    zIndex: -1,
  },
  mapBalloonDot: {
    width: 10,
    height: 5,
    borderRadius: 5,
    marginTop: 4,
  },
  // legacy (unused but kept to avoid ref errors)
  mapPinRing: { position: 'absolute', width: 0, height: 0 },
  mapPinCore: { width: 0, height: 0 },
  mapPinLogoFrame: { width: 0, height: 0 },
  mapPinLogo: { width: 34, height: 34 },
  mapAttribution: {
    position: 'absolute',
    left: 8,
    top: 8,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  mapAttributionText: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  mapBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 14,
  },
  mapBottomName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    textAlign: 'right',
    width: '100%',
  },
  mapBottomAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: I18nManager.isRTL ? 'flex-start' : 'flex-end',
    gap: 6,
    width: '100%',
  },
  mapBottomAddress: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F2F2F7',
    textAlign: 'right',
    flexShrink: 1,
  },
  mapDetailsContainer: {
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  mapBusinessName: {
    fontSize: 18,
    color: '#1C1C1E',
    fontWeight: '700',
    marginBottom: 4,
  },
  mapBusinessAddress: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  // Removed socialText as per new design (no caption under icons)
  locationCircleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCircleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  whatsappCircleButton: {
    backgroundColor: '#F2F2F7',
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: DAILY_SCHEDULE_SURFACE_RADIUS,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { borderCurve: 'continuous' as const },
      default: {},
    }),
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  // ── Lava Lamp Book Card ──
  lavaBookCard: {
    borderRadius: 9999,
    overflow: 'hidden',
    marginHorizontal: 4,
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
    }),
  },
  lavaBookContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingStart: 26,
    paddingEnd: 16,
    zIndex: 2,
  },
  lavaBookIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lavaBookTextBlock: {
    flex: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  lavaBookTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'right',
  },
  lavaBookLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
    textAlign: 'right',
  },
  lavaBookArrow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Next Appointment Card (clean, like admin DailySchedule) ──
  clientNextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: DAILY_SCHEDULE_SURFACE_RADIUS,
    marginHorizontal: 4,
    ...Platform.select({
      ios: {
        borderCurve: 'continuous' as const,
        shadowColor: '#1e253b',
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 9 },
    }),
  },
  clientNextHeader: {
    flexDirection: 'row',
    direction: 'ltr' as any,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 11,
  },
  clientNextHeaderLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: '#64748B',
  },
  clientNextTimeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientNextDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  clientNextBody: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  clientNextInfo: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  clientNextService: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  clientNextDetails: {
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  clientNextDetail: {
    alignItems: 'center',
    gap: 4,
  },
  clientNextDetailText: {
    fontSize: 12.5,
    color: '#8E8E93',
    fontWeight: '500',
  },
  clientNextDetailSep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#C7C7CC',
  },
  clientNextStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  clientNextStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  clientNextStatusText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
  },
  clientNextBarberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clientNextBarberAvatar: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden' },
  clientNextBarberAvatarFallback: {
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientNextBarberName: { fontSize: 12.5, fontWeight: '500', color: '#6C6C70', flexShrink: 1 },
  clientNextBarberHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clientNextBarberHeaderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  clientNextBarberBigAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    flexShrink: 0,
  },
  clientNextBarberHeaderName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3C43',
    flexShrink: 1,
    maxWidth: 120,
  },
  clientNextTimeDivider: {
    width: 1.5,
    height: 44,
    borderRadius: 2,
    marginHorizontal: 4,
  },
  clientNextTimeBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    flexShrink: 0,
  },
  clientNextTimeHM: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  clientNextTimeSuffix: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // Modern Section Headers (for other sections)
  sectionHeaderModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionHeaderModernSimple: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sectionHeadingTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.25,
  },
  headerDecorationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
    paddingRight: 16,
  },
  headerDecorationRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-start',
    paddingLeft: 16,
  },
  decorationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1C1C1E',
  },
  headerTitleContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modernTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  // sectionHeaderModernSimple and sectionSubtitle defined earlier

  // ── Interested swap footer inside appointment card ──
  clientNextInterestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  interestedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEEDFE',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  interestedBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#534AB7',
    letterSpacing: -0.1,
  },
});

