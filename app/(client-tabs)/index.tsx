import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, Linking, Alert, Animated, Easing, InteractionManager, AppState, Dimensions, RefreshControl, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Colors from '@/constants/colors';
import Constants from 'expo-constants';
import { useAuthStore } from '@/stores/authStore';
import { supabase, getBusinessId } from '@/lib/supabase';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import MovingBorderCard from '@/components/MovingBorderCard';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import LoginRequiredModal from '@/components/LoginRequiredModal';
import { Appointment as AvailableTimeSlot } from '@/lib/supabase';
import { notificationsApi } from '@/lib/api/notifications';
import { messagesApi } from '@/lib/api/messages';
import { businessProfileApi } from '@/lib/api/businessProfile';
import type { BusinessProfile } from '@/lib/supabase';
import DesignCarousel from '@/components/DesignCarousel';
import ProductCarousel from '@/components/ProductCarousel';
import { useDesignsStore } from '@/stores/designsStore';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { useProductsStore } from '@/stores/productsStore';
import { getCurrentClientLogo } from '@/src/theme/assets';
import { useColors } from '@/src/theme/ThemeProvider';
import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';


// API functions for client home
const clientHomeApi = {
  // Get user appointments for multiple dates (most efficient for user appointments)
  async getUserAppointmentsForMultipleDates(dates: string[], userName?: string, userPhone?: string): Promise<AvailableTimeSlot[]> {
    try {
      const businessId = getBusinessId();
      
      let query = supabase
        .from('appointments')
        .select('*')
        .eq('business_id', businessId) // Filter by current business
        .in('slot_date', dates)
        .eq('is_available', false) // Only booked appointments
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
  async getUserWaitlistEntries(userPhone: string): Promise<any[]> {
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

      return data || [];
    } catch (error) {
      console.error('Error in getUserWaitlistEntries:', error);
      throw error;
    }
  },

  // Remove user from waitlist
  async removeFromWaitlist(entryId: string): Promise<boolean> {
    try {
      const businessId = getBusinessId();
      
      const { error } = await supabase
        .from('waitlist_entries')
        .delete()
        .eq('id', entryId)
        .eq('business_id', businessId); // Ensure we only delete from current business

      if (error) {
        console.error('Error removing from waitlist:', error);
        throw error;
      }

      return true;
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
  const colors = useColors();
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
  const [isLoading, setIsLoading] = useState(false);
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([]);
  const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false);
  const [isRemovingFromWaitlist, setIsRemovingFromWaitlist] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [activeMessage, setActiveMessage] = useState<any | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [cardWidth, setCardWidth] = useState(0);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [managerPhone, setManagerPhone] = useState<string | null>(null);
  const [businessPhone, setBusinessPhone] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mapCoords, setMapCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [osmFailed, setOsmFailed] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const GOOGLE_KEY_EXTRA = (Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY;
  const GOOGLE_KEY_JSON = (() => {
    try {
      const cur = require('../../branding/current.json');
      return cur?.config?.expo?.extra?.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY;
    } catch { return undefined; }
  })();
  const GOOGLE_KEY_ENV = (process.env as any)?.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY;
  const GOOGLE_KEY_FALLBACK = '';
  const GOOGLE_STATIC_MAPS_KEY = GOOGLE_KEY_EXTRA || GOOGLE_KEY_JSON || GOOGLE_KEY_ENV || GOOGLE_KEY_FALLBACK;

  

  // Designs store
  const { designs, isLoading: isLoadingDesigns, fetchDesigns } = useDesignsStore();
  
  // Products store
  const { products, isLoading: isLoadingProducts, fetchProducts } = useProductsStore();

  // Animated background expansion effect
  const backgroundScaleAnim = useRef(new Animated.Value(1)).current;
  const backgroundTranslateYAnim = useRef(new Animated.Value(0)).current;
  const [isBackgroundExpanded, setIsBackgroundExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle scroll for background animation
  const handleScroll = useCallback((event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    
    // If background is not expanded yet, trigger expansion animation
    if (!isBackgroundExpanded && !isAnimating && scrollY > 5) {
      setIsBackgroundExpanded(true);
      setIsAnimating(true);
      
      // Smooth background expansion animation
      Animated.timing(backgroundTranslateYAnim, {
        toValue: -150, // Move background up significantly
        duration: 1000, // Longer duration for smooth expansion
        easing: Easing.out(Easing.cubic), // Smooth easing curve
        useNativeDriver: true,
      }).start(() => {
        // Animation completed
        setIsAnimating(false);
      });
    }
    
    // If background is expanded and user scrolls back to top, contract it
    if (isBackgroundExpanded && !isAnimating && scrollY <= 5) {
      setIsBackgroundExpanded(false);
      setIsAnimating(true);
      
      // Smooth background contraction animation
      Animated.timing(backgroundTranslateYAnim, {
        toValue: 0, // Move background back to original position
        duration: 800, // Slightly faster contraction
        easing: Easing.out(Easing.cubic), // Smooth easing curve
        useNativeDriver: true,
      }).start(() => {
        // Animation completed
        setIsAnimating(false);
      });
    }
  }, [isBackgroundExpanded, isAnimating, backgroundTranslateYAnim]);

  const requireAuth = (actionDescription: string, onAuthed: () => void) => {
    if (!isAuthenticated) {
      setLoginModal({
        visible: true,
        title: t('login.required'),
        message: t('login.pleaseSignInTo', { action: actionDescription }),
      });
      return;
    }
    onAuthed();
  };

  const [loginModal, setLoginModal] = useState<{ visible: boolean; title?: string; message?: string }>({ visible: false });

  const SCREEN_W = Dimensions.get('window').width;
  const EMPTY_CARD_WIDTH = Math.max(280, SCREEN_W - 48); // 24px padding on both sides
  const EMPTY_CARD_HEIGHT = 260; // increased to avoid clipping content
  

  // Animated pulse for approved status dot
  const statusPulseAnim = React.useRef(new Animated.Value(0)).current;
  const statusLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const statusDotAnimatedStyle = {
    opacity: statusPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
  } as const;

  // Calendar icon background pulse (infinite)
  const iconPulseAnim = React.useRef(new Animated.Value(0)).current;
  const iconPulseLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
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
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(statusPulseAnim, {
              toValue: 1,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(statusPulseAnim, {
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
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulseAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(iconPulseAnim, {
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
    address: '386 East Shoreline Drive, Long Beach, CA',
    coords: { lat: 33.7609, lon: -118.196 }
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
    
    // Fetch appointments for the next N days based on booking window
    const horizonDays = Math.max(1, Number((businessProfile as any)?.booking_open_days ?? 7));
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
        setNextAppointment(upcomingAppointments[0]);
      } else {
        setNextAppointment(null);
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

  // Fetch unread notifications count
  const fetchUnreadNotificationsCount = useCallback(async () => {
    if (!user?.phone) {
      setUnreadNotificationsCount(0);
      return;
    }

    try {
      const count = await notificationsApi.getUnreadCount(user.phone);
      setUnreadNotificationsCount(count);
    } catch (error) {
      console.error('Error fetching unread notifications count:', error);
      setUnreadNotificationsCount(0);
    }
  }, [user?.phone]);

  // Handle removing from waitlist
  const handleRemoveFromWaitlist = async (entryId: string) => {
    setIsRemovingFromWaitlist(true);
    try {
      const success = await clientHomeApi.removeFromWaitlist(entryId);
      if (success) {
        // Remove from local state
        setWaitlistEntries(prev => prev.filter(entry => entry.id !== entryId));
        Alert.alert(t('removed.from.waitlist', 'Removed from waitlist'), t('removed.from.waitlist.message', 'You have been successfully removed from the waitlist'));
      }
    } catch (error) {
      console.error('Error removing from waitlist:', error);
      Alert.alert(t('error.generic', 'Error'), t('error.removing.waitlist', 'An error occurred while removing from the waitlist'));
    } finally {
      setIsRemovingFromWaitlist(false);
    }
  };

  // Fetch appointments when component mounts
  useEffect(() => {
    fetchUserAppointments();
  }, [fetchUserAppointments]);

  // Fetch waitlist entries when component mounts
  useEffect(() => {
    fetchWaitlistEntries();
  }, [fetchWaitlistEntries]);

  // Fetch unread notifications count when component mounts
  useEffect(() => {
    fetchUnreadNotificationsCount();
  }, [fetchUnreadNotificationsCount]);

  // Fetch active broadcast message on mount
  useEffect(() => {
    (async () => {
      try {
        const msg = await messagesApi.getActiveMessageWithSender();
        if (msg) {
          setActiveMessage(msg);
          setShowMessageModal(true);
        } else {
          setActiveMessage(null);
          setShowMessageModal(false);
        }
      } catch {}
    })();
  }, []);


  // Fetch designs on mount
  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  // Fetch products on mount
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Load business profile (address and social links)
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const p = await businessProfileApi.getProfile();
        setBusinessProfile(p);
        // After profile is loaded, refresh appointments horizon
        try { await fetchUserAppointments(); } catch {}
        
        // Extract phone number from business profile
        if (p?.phone) {
          const numeric = p.phone.replace(/\D/g, '');
          let normalized = numeric;
          if (numeric.startsWith('0') && numeric.length >= 9) {
            normalized = `972${numeric.slice(1)}`;
          } else if (!numeric.startsWith('972')) {
            normalized = numeric; // leave as is; wa.me accepts many formats if country code included
          }
          setBusinessPhone(normalized);
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
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(address)}`,
          {
            headers: {
              'User-Agent': 'SlotlysApp/1.0 (+https://slotlys.com)'
            }
          }
        );
        const data: any[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const { lat, lon } = data[0];
          const latNum = Number(lat);
          const lonNum = Number(lon);
          if (!isNaN(latNum) && !isNaN(lonNum)) {
            setMapCoords({ lat: latNum, lon: lonNum });
            return;
          }
        }
        // If we got here, use default coords to ensure the map renders
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
      fetchUnreadNotificationsCount();
      // Reload business profile to get updated images
      const loadProfile = async () => {
        try {
          const p = await businessProfileApi.getProfile();
          setBusinessProfile(p);
        } catch (error) {
          console.error('Error loading business profile on focus:', error);
        }
      };
      loadProfile();
    }, [fetchUserAppointments, fetchWaitlistEntries, fetchUnreadNotificationsCount])
  );

  // Pull-to-refresh handler to reload dashboard data
  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
        await Promise.all([
        fetchUserAppointments(),
        fetchWaitlistEntries(),
        fetchUnreadNotificationsCount(),
        fetchDesigns(),
        fetchProducts(),
        (async () => {
          try {
            const p = await businessProfileApi.getProfile();
            setBusinessProfile(p);
          } catch { setBusinessProfile(null); }
        })(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchUserAppointments, fetchWaitlistEntries, fetchUnreadNotificationsCount, fetchDesigns, fetchProducts]);

  // Show all services in a horizontal scroll
  
  const appLocale = i18n?.language === 'he' ? 'he-IL' : 'en-US';
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
      {/* Full Screen Hero with Overlay Header */}
      <View style={styles.fullScreenHero}>
        <Image 
          source={
            heroImageFailed
              ? require('@/assets/images/1homePage.jpg')
              : (businessProfile?.image_on_page_1
                  ? { uri: businessProfile.image_on_page_1 }
                  : require('@/assets/images/1homePage.jpg'))
          }
          style={styles.fullScreenHeroImage}
          resizeMode="cover"
          onError={() => setHeroImageFailed(true)}
          defaultSource={require('@/assets/images/1homePage.jpg')}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.6)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fullScreenHeroOverlay}
        />
        
        {/* Header Overlay */}
        <SafeAreaView edges={["top"]} style={styles.overlayHeader}>
          <View style={styles.overlayHeaderContent}>
            <View style={styles.headerSide}>
              <TouchableOpacity
                style={[styles.overlayButton, { backgroundColor: `${colors.primary}26` }]}
                onPress={() => requireAuth(t('profile.title'), () => router.push('/(client-tabs)/profile'))}
                activeOpacity={0.85}
                accessibilityLabel={t('profile.title')}
              >
                <Ionicons name="settings-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.headerCenter}>
              <Image source={getCurrentClientLogo()} style={styles.overlayLogo} resizeMode="contain" />
            </View>
            <View style={styles.headerSide}>
              <TouchableOpacity 
                style={[styles.overlayButton, { backgroundColor: `${colors.primary}26` }]}
                onPress={async () => {
                  return requireAuth(t('notifications.title'), async () => {
                    await router.push('/(client-tabs)/notifications');
                    setUnreadNotificationsCount(0);
                  });
                }}
                activeOpacity={0.85}
                accessibilityLabel={t('notifications.title')}
              >
                <Ionicons name="notifications-outline" size={24} color="#fff" />
                {unreadNotificationsCount > 0 && (
                  <View style={[styles.overlayNotificationBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>

        {/* Hero Text Content */}
        <View style={styles.fullScreenHeroContent}>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroWelcome}>{t('welcome')}</Text>
            <Text style={styles.heroTitle}>{user?.name || t('valuedClient')}</Text>
            <Text style={styles.heroSubtitle} numberOfLines={2} ellipsizeMode="tail">{t('home.subtitle')}</Text>
          </View>
        </View>

      </View>

      {/* Content Section with Rounded Top */}
      <SafeAreaView edges={["left","right"]} style={{ flex: 1 }}>
        <Animated.View 
          style={[
            styles.contentWrapper,
            {
              transform: [
                { translateY: backgroundTranslateYAnim }
              ],
              zIndex: 10, // Always high z-index to stay above hero text
            }
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >

        {/* Waitlist Section - Top Priority */}
        {waitlistEntries.length > 0 && (
          <View style={styles.waitlistTopSection}>
            <View style={[styles.waitlistTopCard, { backgroundColor: colors.primary, borderColor: colors.primary, shadowColor: colors.primary }]}>
              <View style={styles.waitlistTopContent}>
                <View style={styles.waitlistTopIconContainer}>
                  <Ionicons name="time" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.waitlistTopInfo}>
                  <Text style={styles.waitlistTopTitle}>{t('waitlist.title')}</Text>
                  <Text style={styles.waitlistTopSubtitle}>
                    {waitlistEntries.length === 1 
                      ? t('waitlist.waitingFor', { service: waitlistEntries[0].service_name })
                      : t('waitlist.waitingForMany', { count: waitlistEntries.length })
                    }
                  </Text>
                  <View style={styles.waitlistTimePeriodContainer}>
                    {waitlistEntries.slice(0, 3).map((entry, index) => (
                      <View key={entry.id} style={styles.waitlistTimePeriodItem}>
                        <Ionicons 
                          name={
                            entry.time_period === 'morning' ? 'sunny' :
                            entry.time_period === 'afternoon' ? 'partly-sunny' :
                            entry.time_period === 'evening' ? 'moon' : 'time'
                          } 
                          size={16} 
                          color="rgba(255, 255, 255, 0.9)" 
                        />
                        <Text style={styles.waitlistTimePeriodText}>
                          {entry.time_period === 'morning' ? t('time_period.morning') :
                           entry.time_period === 'afternoon' ? t('time_period.afternoon') :
                           entry.time_period === 'evening' ? t('time_period.evening') : t('time_period.any')}
                        </Text>
                      </View>
                    ))}
                    {waitlistEntries.length > 3 && (
                      <View style={styles.waitlistTimePeriodItem}>
                        <Text style={styles.waitlistTimePeriodText}>
                          +{waitlistEntries.length - 3}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.waitlistTopButton}
                onPress={() => {
                  Alert.alert(
                    t('waitlist.leave.title'),
                    t('waitlist.leave.message'),
                    [
                      {
                        text: t('cancel'),
                        style: 'cancel',
                      },
                      {
                        text: t('confirm'),
                        style: 'destructive',
                        onPress: () => {
                          // Remove all waitlist entries
                          waitlistEntries.forEach(entry => {
                            handleRemoveFromWaitlist(entry.id);
                          });
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.8}
              >
                <BlurView
                  intensity={80}
                  tint="light"
                  style={styles.waitlistButtonBlur}
                >
                  <Text style={styles.waitlistTopButtonText}>{t('waitlist.remove')}</Text>
                </BlurView>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Appointments Section */}
        <View style={[styles.sectionContainer, { marginTop: 16 }]}> 
          <View style={styles.appointmentsHeader}>
            <View style={styles.appointmentsHeaderContent}>
              <View style={{ width: 22 }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.appointmentsHeaderTitle}>
                  {t('appointments.title')}
                </Text>
                <Text style={styles.appointmentsHeaderSubtitle}>
                  {t('appointments.subtitle')}
                </Text>
              </View>
              <View style={{ width: 22 }} />
            </View>
          </View>

          {/* Next Appointment */}
          {isLoading ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>{t('appointments.loadingAppointments', 'Loading your appointments...')}</Text>
            </View>
          ) : nextAppointment ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => requireAuth(t('appointments.title'), () => router.push('/(client-tabs)/appointments'))}
              style={styles.nextAppointmentContainer}
            >
              <Image 
                source={businessProfile?.image_on_page_3 ? { uri: businessProfile.image_on_page_3 } : require('@/assets/images/nextApp.jpg')} 
                style={styles.nextAppointmentImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.nextAppointmentOverlay}
              />
              

              {/* Main Content with Blur Background */}
              <View style={styles.nextAppointmentContent}>
                <BlurView 
                  intensity={30} 
                  tint="light"
                  style={styles.nextAppointmentInfoBlur}
                >
                  <View style={styles.appointmentInfo}>
                    <Text style={styles.nextAppointmentLabel}>{t('appointments.next')}</Text>
                    <Text style={styles.nextAppointmentService}>{nextAppointment.service_name || 'Service'}</Text>
                    <View style={styles.nextAppointmentDetails}>
                      <View style={styles.appointmentDetail}>
                        <Ionicons name="calendar-outline" size={16} color="rgba(255, 255, 255, 0.8)" />
                        <Text style={styles.nextAppointmentDetailText}>{formatDate(nextAppointment.slot_date)}</Text>
                      </View>
                      <View style={styles.nextAppointmentDetailsDivider} />
                      <View style={styles.appointmentDetail}>
                        <Ionicons name="time-outline" size={16} color="rgba(255, 255, 255, 0.8)" />
                        <Text style={styles.nextAppointmentDetailText}>{formatTime(nextAppointment.slot_time)}</Text>
                      </View>
                    </View>
                  </View>
                </BlurView>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.bookAppointmentContainer}>
              <Image 
                source={businessProfile?.image_on_page_2 ? { uri: businessProfile.image_on_page_2 } : require('@/assets/images/bookApp.jpg')} 
                style={styles.bookAppointmentImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.bookAppointmentOverlay}
              />
              {businessProfile?.display_name && (
                <View style={styles.bookAppointmentBadgeWrapper}>
                  <BlurView
                    intensity={24}
                    tint="light"
                    style={styles.bookAppointmentBadgeBlur}
                  >
                    <Text style={styles.bookAppointmentBadgeText}>
                      {businessProfile.display_name}
                    </Text>
                  </BlurView>
                </View>
              )}
              
              {/* Content with blur background */}
              <View style={styles.bookAppointmentContent}>
                {/* Book Appointment Button */}
                <TouchableOpacity
                  style={[styles.bookAppointmentButton, isBlocked && { opacity: 0.5 }]}
                  onPress={() => {
                    if (!isAuthenticated) {
                      setLoginModal({
                        visible: true,
                        title: t('login.required'),
                        message: t('login.pleaseSignInToBook'),
                      });
                      return;
                    }
                    if (isBlocked) {
                      Alert.alert(t('account.blocked'), t('account.blocked.message'));
                      return;
                    }
                    router.push('/(client-tabs)/book-appointment');
                  }}
                  activeOpacity={0.8}
                  disabled={isBlocked}
                >
                  <BlurView 
                    intensity={30} 
                    tint="light"
                    style={styles.bookAppointmentButtonBlur}
                  >
                    <View style={styles.bookAppointmentButtonContent}>
                      <Text style={styles.bookAppointmentButtonText}>{t('book.now')}</Text>
                      <View style={[styles.bookAppointmentIconCircle, { backgroundColor: colors.primary }]}>
                        <MaterialCommunityIcons name="arrow-top-left" size={20} color="#FFFFFF" />
                      </View>
                    </View>
                  </BlurView>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Design Carousel */}
        {designs && designs.length > 0 && (
          <DesignCarousel
            designs={designs}
            onDesignPress={(design) => {
              // Handle design press - could navigate to gallery or booking
              if (!isAuthenticated) {
                setLoginModal({
                  visible: true,
                  title: t('login.required', 'Login Required'),
                  message: t('gallery.loginToView', 'Please sign in to view full designs.'),
                });
                return;
              }
              router.push('/(client-tabs)/gallery');
            }}
          />
        )}

        {/* Product Carousel */}
        {products && products.length > 0 && (
          <ProductCarousel
            products={products}
            onProductPress={(product) => {
              // Handle product press - show product details
              if (!isAuthenticated) {
                setLoginModal({
                  visible: true,
                  title: t('login.required', 'Login Required'),
                  message: t('products.loginToViewDetails', 'Please sign in to view product details.'),
                });
                return;
              }
              // Product details will be shown in the modal
            }}
          />
        )}

        {/* Location / Map Section (moved above Follow us) */}
        {displayAddress && (
          <View style={[styles.sectionContainer, { marginBottom: 24 }]}> 
            <View style={styles.sectionHeaderModernSimple}>
              <Text style={{ fontSize: 26, fontWeight: '700', color: '#1C1C1E', textAlign: 'center', letterSpacing: -0.3, marginBottom: 4 }}>{t('how.to.get.here')}</Text>
              <Text style={{ fontSize: 14, fontWeight: '400', color: '#8E8E93', textAlign: 'center', letterSpacing: 0.2 }}>{t('tap.map.for.directions')}</Text>
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
             >
             {GOOGLE_STATIC_MAPS_KEY && !googleFailed ? (
               <Image
                 source={{ uri: (
                   mapCoords
                     ? `https://maps.googleapis.com/maps/api/staticmap?center=${mapCoords.lat},${mapCoords.lon}&zoom=15&scale=2&size=640x400&maptype=roadmap&markers=color:red|${mapCoords.lat},${mapCoords.lon}&key=${GOOGLE_STATIC_MAPS_KEY}`
                     : `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(displayAddress)}&zoom=15&scale=2&size=640x400&maptype=roadmap&markers=color:red|${encodeURIComponent(displayAddress)}&key=${GOOGLE_STATIC_MAPS_KEY}`
                 ) }}
                 style={styles.mapImage}
                 resizeMode="cover"
                 onError={handleGoogleError}
               />
             ) : mapCoords ? (
               <Image
                 source={{ uri: `https://api.maptiler.com/maps/streets/static/${mapCoords.lon},${mapCoords.lat},14/640x400.png?key=get_your_own_OpIi9ZULNHzrESv6T2vL` }}
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
              <View style={[styles.mapLogoCircle, { borderColor: colors.primary }]}>
                <Image source={getCurrentClientLogo()} style={styles.mapLogoImage} resizeMode="contain" />
              </View>
              <View style={styles.mapAttribution}>
                <Text style={styles.mapAttributionText}>{t('map.mapsLabel', 'Maps')}</Text>
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
                    <Text style={styles.mapBottomName}>{businessProfile.display_name}</Text>
                  )}
                  {!!displayAddress && (
                    <Text style={styles.mapBottomAddress} numberOfLines={1}>{displayAddress}</Text>
                  )}
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        )}


        {/* Social Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderModern}>
            <View style={styles.headerDecorationLeft}>
              <View style={[styles.decorationDot, { opacity: 0.3 }]} />
              <View style={[styles.decorationDot, { opacity: 0.2 }]} />
              <View style={[styles.decorationDot, { opacity: 0.1 }]} />
            </View>
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.modernTitle, { color: '#1C1C1E' }]}>{t('follow.us')}</Text>
            </View>
            <View style={styles.headerDecorationRight}>
              <View style={[styles.decorationDot, { opacity: 0.1 }]} />
              <View style={[styles.decorationDot, { opacity: 0.2 }]} />
              <View style={[styles.decorationDot, { opacity: 0.3 }]} />
            </View>
          </View>

          {/* Location + Social icons in one row */}
          <View style={styles.socialContainer}>
            {socialLinks.map((social) => (
              <TouchableOpacity
                key={social.name}
                style={[styles.socialButton, { backgroundColor: social.color }]}
                onPress={() => Linking.openURL(social.url)}
                activeOpacity={0.8}
              >
                <Ionicons name={social.icon as any} size={social.name === 'Instagram' ? 28 : 24} color="#FFFFFF" />
              </TouchableOpacity>
            ))}
            {/* Location button removed – map shown below */}
            <TouchableOpacity
              style={[styles.socialButton, styles.whatsappCircleButton]}
              onPress={async () => {
                const phoneToUse = businessPhone || managerPhone;
                if (!phoneToUse) {
                  Alert.alert(t('error.generic', 'Error'), t('appointments.managerPhoneUnavailable', 'Manager phone number is currently unavailable'));
                  return;
                }
                const message = 'Hi';
                const smsUrl = Platform.OS === 'ios'
                  ? `sms:${phoneToUse}&body=${encodeURIComponent(message)}`
                  : `sms:${phoneToUse}?body=${encodeURIComponent(message)}`;
                try {
                  const canOpen = await Linking.canOpenURL(smsUrl);
                  if (canOpen) {
                    await Linking.openURL(smsUrl);
                  } else {
                    Alert.alert(t('error.generic', 'Error'), t('common.smsOpenFailed', 'SMS app cannot be opened on this device'));
                  }
                } catch (e) {
                  Alert.alert(t('error.generic', 'Error'), t('common.smsOpenFailed', 'SMS app cannot be opened on this device'));
                }
              }}
              activeOpacity={0.8}
              accessibilityLabel={t('notifications.title')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Static Map Section under Follow us – removed (moved above) */}
        
        {/* Social section merged above with Location */}
        
        {/* Footer: Slotlys logo with link */}
        <View style={styles.footerContainer}>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://slotlys.com/')}
            activeOpacity={0.8}
            accessibilityLabel="מעבר לאתר Slotlys"
          >
            <Image
              source={require('../../assets/images/ddoown-08.png')}
              style={styles.footerLogo}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
          </ScrollView>
        </Animated.View>

        {/* Active Broadcast Message Modal */}
        <Modal
          visible={showMessageModal && !!activeMessage}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMessageModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <BlurView intensity={60} tint="light" style={{ width: '92%', maxWidth: 520, borderRadius: 24, overflow: 'hidden' }}>
              <LinearGradient
                colors={[colors.primary, colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
                  {(activeMessage?.sender_name && activeMessage?.sender_name.trim().length > 0) ? activeMessage.sender_name : 'Studio'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowMessageModal(false)}
                  activeOpacity={0.85}
                  style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' }}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </LinearGradient>

              <View style={{ backgroundColor: '#FBFBFD', padding: 16 }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E5E5EA' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primary}20`, marginRight: 10 }}>
                      <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1C1C1E', textAlign: 'left', flex: 1 }} numberOfLines={2}>
                      {activeMessage?.title || 'Message'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#6B7280', lineHeight: 20, textAlign: 'left' }}>
                    {activeMessage?.content || ''}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowMessageModal(false)}
                  activeOpacity={0.85}
                  style={{ marginTop: 14, borderRadius: 16, overflow: 'hidden' }}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('ok')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </Modal>

        {/* Login required modal */}
        <LoginRequiredModal
          visible={loginModal.visible}
          title={loginModal.title}
          message={loginModal.message}
          onClose={() => setLoginModal({ visible: false })}
          onLogin={() => {
            setLoginModal({ visible: false });
            router.push('/login');
          }}
        />

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create<any>({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA', // Same color as contentWrapper to hide the bottom section
    minHeight: '100%', // Ensure container takes full height
  },
  // Full Screen Hero Styles
  fullScreenHero: {
    position: 'relative',
    height: '45%', // Takes up 45% of screen height
    width: '100%',
    zIndex: 0, // Very low z-index so white background can overlap it
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
  overlayHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2, // Lower than white background content
  },
  overlayHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  overlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  overlayLogo: {
    width: 170,
    height: 60,
    tintColor: '#FFFFFF',
  },
  overlayNotificationBadge: {
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
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
  scrollContent: {
    paddingBottom: 400, // Extra bottom padding to see the image at the bottom
    flexGrow: 1, // Allow content to grow and be scrollable
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Grey rounded container like admin home
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20, // Overlap with hero image
    paddingTop: 1, // Reduced to tighten space under hero
    paddingBottom: 0, // No bottom padding to allow full scrolling
    minHeight: '100%', // Fill the entire screen height
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
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
    gap: 16,
    marginBottom: 0, // No margin to avoid extra white space
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
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
  mapLogoCircle: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: [{ translateX: -28 }, { translateY: -28 }],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#000000',
  },
  mapLogoImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
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
  },
  mapBottomAddress: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F2F2F7',
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
    backgroundColor: '#30D158',
  },
  // Footer developer logo
  footerContainer: {
    alignItems: 'center',
    marginTop: 40, // Increased top margin to create more space from Follow us buttons
    marginBottom: 0,
  },
  footerLogo: {
    width: 160,
    height: 32,
    opacity: 0.9,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  // New Waitlist Top Styles
  waitlistTopSection: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  waitlistTopCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  waitlistTopContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  waitlistTopIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitlistTopInfo: {
    flex: 1,
    marginLeft: 16,
    alignItems: 'flex-start',
  },
  waitlistTopTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'left',
  },
  waitlistTopSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    textAlign: 'left',
  },
  waitlistTimePeriodContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  waitlistTimePeriodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  waitlistTimePeriodText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  waitlistTopButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  waitlistButtonBlur: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  waitlistTopButtonText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  // Book Appointment Styles
  bookAppointmentContainer: {
    position: 'relative',
    height: 280,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    marginHorizontal: 4,
  },
  bookAppointmentImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  bookAppointmentOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
  },
  bookAppointmentBadgeWrapper: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 5,
  },
  bookAppointmentBadgeBlur: {
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
  },
  bookAppointmentBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bookAppointmentContent: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
    alignItems: 'flex-end',
  },
  bookAppointmentButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  bookAppointmentButtonBlur: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  bookAppointmentButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  bookAppointmentButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bookAppointmentIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)'
  },
  // Appointments Header (matching gallery design)
  appointmentsHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#F8F9FA',
  },
  appointmentsHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appointmentsHeaderTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  appointmentsHeaderSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginTop: 6,
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
  // Next Appointment with Background Image Styles
  nextAppointmentContainer: {
    position: 'relative',
    height: 220,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    marginHorizontal: 4,
  },
  nextAppointmentImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  nextAppointmentOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
  },
  nextAppointmentContent: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  nextAppointmentInfoBlur: {
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  nextAppointmentLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    textAlign: 'left',
    letterSpacing: -0.1,
    marginBottom: 6,
  },
  nextAppointmentService: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'left',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  nextAppointmentDetails: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 16,
    direction: 'ltr',
  },
  nextAppointmentDetailText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    letterSpacing: -0.2,
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  nextAppointmentDetailsDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  // sectionHeaderModernSimple and sectionSubtitle defined earlier
});

