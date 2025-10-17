import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Image, Modal, RefreshControl, Linking, Platform, Dimensions, FlatList } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Calendar from 'expo-calendar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { Service } from '@/lib/supabase';
import { servicesApi } from '@/lib/api/services';
import { supabase, getBusinessId, Appointment } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi } from '@/lib/api/notifications';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { usersApi } from '@/lib/api/users';
import { User } from '@/lib/supabase';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS, withTiming, Easing } from 'react-native-reanimated';


// API functions for booking appointments
const bookingApi = {
  // Get available time slots for a specific date and barber
  async getAvailableSlots(date: string, barberId?: string): Promise<Appointment[]> {
    try {
      const businessId = getBusinessId();
      
      let query = supabase
        .from('appointments')
        .select('*')
        .eq('slot_date', date)
        .eq('business_id', businessId);

      if (barberId) {
        query = query.eq('barber_id', barberId);
      }

      const { data, error } = await query.order('slot_time');

      if (error) {
        console.error('Error fetching available slots:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAvailableSlots:', error);
      throw error;
    }
  },

  // Get user appointments for multiple dates (most efficient for user appointments)
  async getUserAppointmentsForMultipleDates(dates: string[], userName?: string, userPhone?: string): Promise<Appointment[]> {
    try {
      const businessId = getBusinessId();
      
      let query = supabase
        .from('appointments')
        .select('*')
        .in('slot_date', dates)
        .eq('is_available', false) // Only booked appointments
        .eq('business_id', businessId)
        .order('slot_date')
        .order('slot_time');

      // Filter by user if provided
      if (userName || userPhone) {
        const conditions = [];
        if (userName) {
          conditions.push(`client_name.ilike.%${userName.trim()}%`);
        }
        if (userPhone) {
          conditions.push(`client_phone.eq.${userPhone.trim()}`);
        }
        
        if (conditions.length > 0) {
          query = query.or(conditions.join(','));
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching user appointments for multiple dates:', error);
        throw error;
      }

      // Additional client-side filtering for exact matches
      let filteredData = data || [];
      if (userName || userPhone) {
        filteredData = filteredData.filter(slot => {
          const nameMatch = userName && slot.client_name && 
            slot.client_name.trim().toLowerCase() === userName.trim().toLowerCase();
          const phoneMatch = userPhone && slot.client_phone && 
            slot.client_phone.trim() === userPhone.trim();
          
          return nameMatch || phoneMatch;
        });
      }

      return filteredData;
    } catch (error) {
      console.error('Error in getUserAppointmentsForMultipleDates:', error);
      throw error;
    }
  },

  // Book a time slot
  async bookTimeSlot(
    slotId: string, 
    clientName: string, 
    clientPhone: string, 
    serviceName: string,
    durationMinutes?: number,
    barberId?: string,
    serviceId?: string,
    userId?: string
  ): Promise<Appointment | null> {
    try {
      const businessId = getBusinessId();
      
      const updateData = {
        is_available: false,
        client_name: clientName,
        client_phone: clientPhone,
        service_name: serviceName,
        business_id: businessId,
        barber_id: barberId || null,
        service_id: serviceId || null,
        user_id: userId || null,
        ...(typeof durationMinutes === 'number' ? { duration_minutes: durationMinutes } : {}),
      };
      
      
      const { data, error } = await supabase
            .from('appointments')
            .update(updateData)
            .eq('id', slotId)
            .eq('business_id', businessId)
            .eq('is_available', true) // Only book if still available
            .select()
            .single();

        if (error || !data) {
            console.error('Error booking time slot:', error || 'No data returned');
            return null;
        }
        return data;
    } catch (error) {
        console.error('Error in bookTimeSlot:', error);
        throw error;
    }
  },

  // Book by date+time (creates a new row if no available row exists)
  async bookByDateTime(
    slotDate: string,
    slotTime: string,
    clientName: string,
    clientPhone: string,
    serviceName: string,
    durationMinutes?: number,
    barberId?: string,
    serviceId?: string,
    userId?: string
  ): Promise<Appointment | null> {
    try {
      const businessId = getBusinessId();
      
      // First try to update an existing available row for this date/time and user
      const updateData = {
        is_available: false,
        client_name: clientName,
        client_phone: clientPhone,
        service_name: serviceName,
        business_id: businessId,
        barber_id: barberId || null,
        service_id: serviceId || null,
        user_id: userId || null,
        ...(typeof durationMinutes === 'number' ? { duration_minutes: durationMinutes } : {}),
      };
      
      
      let updateQuery = supabase
        .from('appointments')
        .update(updateData)
        .eq('slot_date', slotDate)
        .eq('slot_time', slotTime)
        .eq('business_id', businessId)
        .eq('is_available', true);

      if (barberId) {
        updateQuery = updateQuery.eq('barber_id', barberId);
      }

      const { data: updated, error: updateError } = await updateQuery
        .select()
        .maybeSingle();

      if (!updateError && updated) {
        return updated as any;
      }

      // Ensure no conflicting booked row already exists for this user
      let existingQuery = supabase
        .from('appointments')
        .select('id, is_available')
        .eq('slot_date', slotDate)
        .eq('slot_time', slotTime)
        .eq('business_id', businessId);

      if (barberId) {
        existingQuery = existingQuery.eq('barber_id', barberId);
      }

      const { data: existing } = await existingQuery;

      if (existing && existing.length > 0) {
        return null;
      }

      // Insert a new booked slot
      const insertData = {
        slot_date: slotDate,
        slot_time: slotTime,
        is_available: false,
        client_name: clientName,
        client_phone: clientPhone,
        service_name: serviceName,
        user_id: userId || null,
        business_id: businessId,
        barber_id: barberId || null,
        service_id: serviceId || null,
        duration_minutes: (typeof durationMinutes === 'number' ? durationMinutes : await (async () => {
          // Infer duration from services table if not provided
          const svc = (await supabase
            .from('services')
            .select('duration_minutes')
            .eq('name', serviceName)
            .eq('business_id', businessId)
            .maybeSingle()).data as any;
          return (svc && typeof svc.duration_minutes === 'number') ? svc.duration_minutes : 60;
        })()),
      };
      

      const { data: inserted, error: insertError } = await supabase
        .from('appointments')
        .insert([insertData])
        .select()
        .single();

      if (insertError || !inserted) {
        console.error('Error inserting time slot:', insertError);
        return null;
      }
      return inserted as any;
    } catch (error) {
      console.error('Error in bookByDateTime:', error);
      throw error;
    }
  },

  // Cancel a time slot booking
  async cancelTimeSlot(slotId: string): Promise<{ success: boolean; data?: Appointment; error?: string }> {
    try {
      const businessId = getBusinessId();
      
      // First, get the appointment details before cancelling
      const { data: appointmentData, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', slotId)
        .eq('business_id', businessId)
        .single();

      if (fetchError) {
        console.error('Error fetching appointment before cancellation:', fetchError);
        return { success: false, error: 'Failed to fetch appointment details' };
      }

      if (!appointmentData) {
        return { success: false, error: 'Appointment not found' };
      }

      // Check cancellation policy
      const { data: businessProfile } = await supabase
        .from('business_profile')
        .select('min_cancellation_hours')
        .single();

      const minCancellationHours = businessProfile?.min_cancellation_hours || 24;
      
      // Calculate time difference
      const appointmentDateTime = new Date(`${appointmentData.slot_date}T${appointmentData.slot_time}`);
      const now = new Date();
      const hoursUntilAppointment = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilAppointment < minCancellationHours) {
        return { 
          success: false, 
          error: `Cannot cancel appointment. Minimum cancellation time is ${minCancellationHours} hours before the appointment.` 
        };
      }
      
      const { data, error } = await supabase
        .from('appointments')
        .update({
          is_available: true,
          client_name: null,
          client_phone: null,
          service_name: 'Available Slot', // Set to default value instead of null
        })
        .eq('id', slotId)
        .eq('business_id', businessId)
        .select()
        .single();

      if (error) {
        console.error('Error canceling time slot:', error);
        return { success: false, error: 'Failed to cancel appointment' };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error in cancelTimeSlot:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },
};

// Generate next N days with Hebrew day names
const getNextNDays = (n: number) => {
  const today = new Date();
  const days = [];
  const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  
  for (let i = 0; i < Math.max(1, n); i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push({
      date: date.getDate(),
      dayName: hebrewDays[date.getDay()],
      fullDate: date,
    });
  }
  
  return days;
};

// Circular slider constants
const AVATAR_SIZE = 68;
const ITEM_SPACING = 16;
const ITEM_SIZE = AVATAR_SIZE + ITEM_SPACING;
const SCREEN = Dimensions.get('window');
const CAROUSEL_HEIGHT = SCREEN.height;
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList as any);

type BarberSelectorProps = {
  barbers: User[];
  activeIndex: number;
  onIndexChange: (idx: number) => void;
  styles: any;
  renderTopOverlay?: () => React.ReactNode;
  bottomOffset?: number;
};

const BarberCarouselSelector: React.FC<BarberSelectorProps> = ({ barbers, activeIndex, onIndexChange, styles, renderTopOverlay, bottomOffset }) => {
  const scrollX = useSharedValue(Math.max(0, activeIndex) * ITEM_SIZE);
  const listRef = React.useRef<FlatList>(null);
  const lastIndex = React.useRef<number>(Math.max(0, activeIndex));

  // Background cross-fade between current and next barber image
  const [bgCurrent, setBgCurrent] = React.useState<string | null>(barbers[activeIndex]?.image_url || null);
  const [bgNext, setBgNext] = React.useState<string | null>(null);
  const bgFade = useSharedValue(0);
  const bgScale = useSharedValue(1);

  React.useEffect(() => {
    const nextUrl = barbers[activeIndex]?.image_url || null;
    if (nextUrl && nextUrl !== bgCurrent) {
      setBgNext(nextUrl);
      bgFade.value = 0;
      bgScale.value = 0.985;
      bgFade.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(setBgCurrent)(nextUrl);
          runOnJS(setBgNext)(null);
        }
        bgFade.value = 0;
        bgScale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      });
    }
  }, [activeIndex, barbers.length]);

  React.useEffect(() => {
    try {
      if (listRef.current && Number.isFinite(activeIndex)) {
        listRef.current.scrollToOffset({ offset: Math.max(0, activeIndex) * ITEM_SIZE, animated: true });
      }
    } catch {}
  }, [activeIndex]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollX.value = e.contentOffset.x;
    },
  });

  const nextBgStyle = useAnimatedStyle(() => ({ opacity: bgFade.value, transform: [{ scale: bgScale.value }] }));

  const CarouselItem: React.FC<{ item: User; index: number }> = ({ item, index }) => {
    const cardStyle = (useAnimatedStyle(() => {
      const pos = scrollX.value / ITEM_SIZE;
      const scale = interpolate(pos, [index - 1, index, index + 1], [0.94, 1.08, 0.94], Extrapolate.CLAMP);
      const opacity = interpolate(pos, [index - 1, index, index + 1], [0.6, 1, 0.6], Extrapolate.CLAMP);
      return { transform: [{ scale: scale as any }] as any, opacity } as any;
    }) as any);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          try {
            listRef.current?.scrollToOffset({ offset: index * ITEM_SIZE, animated: true });
          } catch {}
          onIndexChange(index);
        }}
      >
        <Animated.View style={[styles.carouselItem, cardStyle]}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.carouselItemImage} />
          ) : (
            <View style={[styles.carouselItemImage, styles.carouselItemPlaceholder]}>
              <Ionicons name="person" size={28} color="#8E8E93" />
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.carouselContainer}>
      {!!bgCurrent && (
        <Image source={{ uri: bgCurrent }} style={styles.bgImage} />
      )}
      {!!bgNext && (
        <Animated.Image source={{ uri: bgNext }} style={[styles.bgImage, nextBgStyle]} />
      )}
      <View style={styles.bgDimOverlay} />
      {typeof renderTopOverlay === 'function' ? (
        <View style={styles.carouselTopOverlay}>{renderTopOverlay()}</View>
      ) : null}

      <View style={[styles.carouselBottomArea, { bottom: (bottomOffset ?? 28) }] }>
        <AnimatedFlatList
          ref={listRef as any}
          horizontal
          data={barbers}
          keyExtractor={(it: User) => String(it.id)}
          renderItem={({ item, index }) => <CarouselItem item={item} index={index} />}
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_SIZE}
          decelerationRate="fast"
          bounces={false}
          style={styles.carouselList}
          contentContainerStyle={{ paddingHorizontal: (SCREEN.width - ITEM_SIZE) / 2 }}
          onScroll={scrollHandler}
          onMomentumScrollEnd={(e: any) => {
            const raw = e.nativeEvent.contentOffset.x / ITEM_SIZE;
            const idx = Math.round(raw);
            const clamped = Math.max(0, Math.min(barbers.length - 1, idx));
            if (clamped !== lastIndex.current) {
              lastIndex.current = clamped;
              onIndexChange(clamped);
            }
          }}
          scrollEventThrottle={16}
        />
        {Number.isFinite(activeIndex) && barbers[activeIndex] && (
          <Text style={styles.carouselActiveName} numberOfLines={1}>
            {barbers[activeIndex]?.name || ''}
          </Text>
        )}
      </View>
    </View>
  );
};

export default function BookAppointment() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { colors } = useBusinessColors();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);
  const footerBottom = Math.max(insets.bottom, 16) + 80;
  const params = (router as any).useLocalSearchParams?.() || {};
  
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState<boolean>(false);
  const [selectedBarber, setSelectedBarber] = useState<User | null>(null);
  const [availableBarbers, setAvailableBarbers] = useState<User[]>([]);
  const [isLoadingBarbers, setIsLoadingBarbers] = useState<boolean>(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [isCheckingAppointments, setIsCheckingAppointments] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [existingAppointment, setExistingAppointment] = useState<any>(null);
  const [modalType, setModalType] = useState<'confirm' | 'replace'>('confirm');
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [dayAvailability, setDayAvailability] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [globalBreakMinutes, setGlobalBreakMinutes] = useState<number>(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  // Reset all local state when the screen gains focus so each visit starts fresh
  useFocusEffect(
    React.useCallback(() => {
      const preserve = (globalThis as any).__preserve_booking_state_on_focus__ === true;
      if (preserve) {
        // Coming back from select-time → keep selections and show day step
        setCurrentStep(2);
        (globalThis as any).__preserve_booking_state_on_focus__ = false;
        return () => {};
      }

      setCurrentStep(1);
      setSelectedService(null);
      setSelectedBarber(null);
      setSelectedDay(null);
      setSelectedTime(null);
      setAvailableSlots([]);
      setIsLoadingSlots(false);
      setShowConfirmModal(false);
      setShowReplaceModal(false);
      setExistingAppointment(null);
      setDayAvailability({});
      return () => {};
    }, [])
  );
  // Load per-barber break (minutes) from business_profile.break_by_user whenever barber changes
  useEffect(() => {
    let isMounted = true;
    const loadBreak = async () => {
      try {
        const minutes = selectedBarber?.id
          ? await businessProfileApi.getBreakMinutesForUser(selectedBarber.id)
          : 0;
        if (isMounted) {
          const br = Math.max(0, Math.min(180, Number(minutes ?? 0)));
          setGlobalBreakMinutes(br);
        }
      } catch {
        if (isMounted) setGlobalBreakMinutes(0);
      }
    };
    loadBreak();
    return () => { isMounted = false; };
  }, [selectedBarber?.id]);

  const [bookingOpenDays, setBookingOpenDays] = useState<number>(7);
  useEffect(() => {
    (async () => {
      try {
        const profile = await businessProfileApi.getProfile();
        const n = Number(((profile as any)?.booking_open_days ?? 7));
        setBookingOpenDays(Number.isFinite(n) && n > 0 ? n : 7);
      } catch {}
    })();
  }, []);

  const days = getNextNDays(bookingOpenDays);
  const selectedDate = selectedDay !== null ? days[selectedDay]?.fullDate : null;
  const footerVisible =
    (currentStep === 1 && !!selectedBarber) ||
    (currentStep === 2 && !!selectedService) ||
    (currentStep === 3 && selectedDay !== null) ||
    currentStep === 4;
  const buttonHeight = 56;
  const contentBottomPadding = footerVisible
    ? footerBottom + buttonHeight + 12
    : 96;
  
  // Compute available start times dynamically for the selected service and date using business_hours
  const getAvailableTimeSlotsForDate = () => {
    if (!selectedDate) return [];
    const serviceDuration = selectedService?.duration_minutes || 60;
    const dateStr = selectedDate.toISOString().split('T')[0];
    const dow = selectedDate.getDay(); // 0..6

    // Gather busy intervals (start/end minutes) for that date
    type Busy = { startMin: number; endMin: number };
    const busyIntervals: Busy[] = (() => {
      const toMinutes = (time: string) => {
        const parts = String(time).split(':');
        const h = parseInt(parts[0] || '0', 10);
        const m = parseInt(parts[1] || '0', 10);
        return h * 60 + m;
      };
      return (availableSlots || [])
        .filter(s => String(s.slot_date) === dateStr && s.is_available === false)
        .map(s => {
          const startMin = toMinutes(String(s.slot_time));
          const dur = typeof s.duration_minutes === 'number' ? s.duration_minutes : 60;
          return { startMin, endMin: startMin + dur } as Busy;
        })
        .sort((a, b) => a.startMin - b.startMin);
    })();

    // Business hour windows cached per barber and date
    const cacheKey = `${selectedBarber?.id || 'global'}:${dateStr}`;
    const windows = (globalThis as any).__bh_windows__?.[cacheKey] as Array<{ start: string; end: string }> | undefined;
    if (!windows || windows.length === 0) {
      // Avoid showing misleading availability until windows are fetched for this barber and date
      return [];
    }

    // Robust time helpers (support HH:MM or HH:MM:SS; compare numerically; never wrap over midnight)
    const toMinutes = (time: string) => {
      const parts = String(time).split(':');
      const h = parseInt(parts[0] || '0', 10);
      const m = parseInt(parts[1] || '0', 10);
      return h * 60 + m;
    };
    const toHHMM = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // Sort windows by start time in minutes
    const normalizedWindows = windows
      .map(w => ({ startMin: toMinutes(w.start), endMin: toMinutes(w.end) }))
      .filter(w => w.startMin < w.endMin)
      .sort((a, b) => a.startMin - b.startMin);

    const times: string[] = [];
    const overlapsBusy = (startMin: number, endMin: number) => {
      return busyIntervals.some(b => Math.max(b.startMin, startMin) < Math.min(b.endMin, endMin));
    };
    const findPrevBusyEnd = (startMin: number) => {
      let prevEnd = -1;
      for (const b of busyIntervals) {
        if (b.endMin <= startMin && b.endMin > prevEnd) prevEnd = b.endMin;
      }
      return prevEnd; // -1 if none
    };
    const findNextBusyStart = (startMin: number) => {
      let nextStart = Number.POSITIVE_INFINITY;
      for (const b of busyIntervals) {
        if (b.startMin >= startMin && b.startMin < nextStart) nextStart = b.startMin;
      }
      return Number.isFinite(nextStart) ? nextStart : -1;
    };

    for (const w of normalizedWindows) {
      let tMin = w.startMin;
      while (tMin + serviceDuration <= w.endMin) {
        // Enforce break after the previous busy interval
        const prevEnd = findPrevBusyEnd(tMin);
        if (prevEnd >= 0) {
          const requiredStart = prevEnd + globalBreakMinutes;
          if (tMin < requiredStart) {
            tMin = requiredStart;
            continue;
          }
        }

        const endMin = tMin + serviceDuration;
        // Skip if overlaps an existing busy slot
        if (overlapsBusy(tMin, endMin)) {
          // Jump to the end of the overlapping interval to avoid small steps
          const overlapped = busyIntervals.find(b => Math.max(b.startMin, tMin) < Math.min(b.endMin, endMin));
          if (overlapped) {
            tMin = overlapped.endMin;
            continue;
          }
        }

        // Enforce break before the next busy interval starts
        const nextStart = findNextBusyStart(tMin);
        if (nextStart >= 0 && (endMin + globalBreakMinutes) > nextStart) {
          tMin = nextStart + globalBreakMinutes;
          continue;
        }

        // Candidate is valid
        const tStr = toHHMM(tMin);
        times.push(tStr);
        tMin += serviceDuration;
      }
    }

    // Filter-out past times if today
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
    const filtered = isToday
      ? times.filter(t => {
          const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
          const dt = new Date(selectedDate);
          dt.setHours(hh, mm, 0, 0);
          return dt.getTime() >= now.getTime();
        })
      : times;
    return filtered;
  };
  
  const availableTimeSlots = getAvailableTimeSlotsForDate();

  // Check if user has any booked appointment on a specific date (match by phone variants; fallback to name)
  const checkUserAppointmentsOnDate = async (dateString: string) => {
    try {
      const phoneRaw = (user?.phone || '').trim();
      const nameRaw = (user?.name || '').trim();

      const phoneVariants = (() => {
        if (!phoneRaw) return [] as string[];
        const variants = new Set<string>();
        const onlyDigits = phoneRaw.replace(/[^+\d]/g, '');
        variants.add(onlyDigits);
        // 0XXXXXXXXX ↔ +972XXXXXXXXX conversion (Israel)
        if (onlyDigits.startsWith('0')) {
          variants.add(`+972${onlyDigits.slice(1)}`);
        }
        if (onlyDigits.startsWith('+972')) {
          const rest = onlyDigits.slice(4);
          if (rest && !rest.startsWith('0')) variants.add(`0${rest}`);
        }
        return Array.from(variants);
      })();

      let data: any[] | null = null;
      let error: any = null;

      const businessId = getBusinessId();
      
      if (phoneVariants.length > 0) {
        let query = supabase
          .from('appointments')
          .select('*')
          .eq('business_id', businessId)
          .eq('slot_date', dateString)
          .eq('is_available', false)
          .in('client_phone', phoneVariants);

        if (selectedBarber?.id) {
          query = query.eq('barber_id', selectedBarber.id);
        }

        const res = await query.order('slot_time');
        data = res.data as any[] | null;
        error = res.error;
      } else if (nameRaw) {
        let query = supabase
          .from('appointments')
          .select('*')
          .eq('business_id', businessId)
          .eq('slot_date', dateString)
          .eq('is_available', false)
          .ilike('client_name', `%${nameRaw}%`);

        if (selectedBarber?.id) {
          query = query.eq('barber_id', selectedBarber.id);
        }

        const res = await query.order('slot_time');
        data = res.data as any[] | null;
        error = res.error;
      } else {
        // Fallback: fetch none
        data = [];
      }

      if (error) {
        console.error('Error checking appointments for date:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error checking appointments for date:', error);
      return [];
    }
  };

  // Fetch booked slots WHEN date changes and also load business hours windows for that day
  useEffect(() => {
    let isStale = false;
    const fetchSlots = async () => {
      if (selectedDay === null) return;
      setIsLoadingSlots(true);
      try {
        const date = days[selectedDay].fullDate;
        const dateString = date.toISOString().split('T')[0];
        const slots = await bookingApi.getAvailableSlots(dateString, selectedBarber?.id);
        // Load business hours for DOW and cache time windows on global for this session
        const dayOfWeek = date.getDay();
        const businessId = getBusinessId();
        
        let bhQuery = supabase
          .from('business_hours')
          .select('*')
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true)
          .eq('business_id', businessId);

        if (selectedBarber?.id) {
          bhQuery = bhQuery.eq('user_id', selectedBarber.id);
        } else {
          bhQuery = bhQuery.is('user_id', null);
        }

        const { data: bhRow } = await bhQuery.maybeSingle();
        if (!isStale && bhRow) {
          type Window = { start: string; end: string };
          const base: Window[] = [{ start: bhRow.start_time, end: bhRow.end_time }];
          const brks: Array<{ start_time: string; end_time: string }> = (bhRow as any).breaks || [];
          const singleBreak = (bhRow.break_start_time && bhRow.break_end_time)
            ? [{ start_time: bhRow.break_start_time, end_time: bhRow.break_end_time }]
            : [];
          const allBreaks = [...brks, ...singleBreak];
          let windows: Window[] = base;
          for (const b of allBreaks) {
            const next: Window[] = [];
            for (const w of windows) {
              if (b.end_time <= w.start || b.start_time >= w.end) { next.push(w); continue; }
              if (w.start < b.start_time) next.push({ start: w.start, end: b.start_time });
              if (b.end_time < w.end) next.push({ start: b.end_time, end: w.end });
            }
            windows = next.filter(w => w.start < w.end);
          }
          // Subtract date-specific constraints
          try {
            let constraintsQuery = supabase
              .from('business_constraints')
              .select('start_time, end_time')
              .eq('date', dateString)
              .eq('business_id', businessId)
              .order('start_time');
            if (selectedBarber?.id) {
              constraintsQuery = constraintsQuery.or(`user_id.is.null,user_id.eq.${selectedBarber.id}`);
            } else {
              constraintsQuery = constraintsQuery.is('user_id', null);
            }
            const { data: constraintsRows } = await constraintsQuery;
            for (const c of (constraintsRows || []) as Array<{ start_time: string; end_time: string }>) {
              const next: Window[] = [];
              for (const w of windows) {
                if (c.end_time <= w.start || c.start_time >= w.end) { next.push(w); continue; }
                if (w.start < c.start_time) next.push({ start: w.start, end: c.start_time });
                if (c.end_time < w.end) next.push({ start: c.end_time, end: w.end });
              }
              windows = next.filter(w => w.start < w.end);
            }
          } catch {}
          (globalThis as any).__bh_windows__ = (globalThis as any).__bh_windows__ || {};
          const cacheKey = `${selectedBarber?.id || 'global'}:${dateString}`;
          (globalThis as any).__bh_windows__[cacheKey] = windows;
        }
        if (!isStale) {
          setAvailableSlots(slots);
        }
      } catch (error) {
        console.error('Error fetching slots:', error);
      } finally {
        if (!isStale) {
          setIsLoadingSlots(false);
        }
      }
    };
    if (selectedDay !== null) {
      fetchSlots();
    } else {
      setAvailableSlots([]);
      setIsLoadingSlots(false);
    }
    return () => { isStale = true; };
  }, [selectedDay, selectedBarber]);

  // When barber changes, reset subsequent selections
  useEffect(() => {
    if (selectedBarber) {
      setSelectedDay(null);
      setSelectedTime(null);
      setAvailableSlots([]);
      setIsLoadingSlots(false);
      setShowConfirmModal(false);
      setShowReplaceModal(false);
      setExistingAppointment(null);
      setDayAvailability({});
      // Clear cached windows for previous barber to prevent stale constraints
      try {
        const cache = (globalThis as any).__bh_windows__ as Record<string, any> | undefined;
        if (cache) {
          const newCache: Record<string, any> = {};
          const prefix = `${selectedBarber.id || 'global'}:`; // keep only current barber keys if any exist
          // Actually, safest: clear all and let effects repopulate
          for (const k of Object.keys(cache)) {
            // no-op to drop all
          }
          (globalThis as any).__bh_windows__ = newCache;
        }
      } catch {}
    }
  }, [selectedBarber?.id]);

  // When service changes, reset day and time selections
  useEffect(() => {
    setSelectedDay(null);
    setSelectedTime(null);
    setAvailableSlots([]);
    setIsLoadingSlots(false);
    setShowConfirmModal(false);
    setShowReplaceModal(false);
    setExistingAppointment(null);
  }, [selectedService?.id]);

  // If navigated back from select-time asking to open dates screen
  useEffect(() => {
    try {
      const goto = (params as any)?.goto;
      if (goto === 'dates') {
        setCurrentStep(2);
      }
    } catch {}
  }, [params]);

  // Fetch services from Supabase
  const loadServices = async () => {
    setIsLoadingServices(true);
    try {
      const list = await servicesApi.getAllServices();
      setAvailableServices(list);
    } catch (e) {
      setAvailableServices([]);
    } finally {
      setIsLoadingServices(false);
    }
  };

  // Fetch barbers (admin users) from Supabase
  const loadBarbers = async () => {
    setIsLoadingBarbers(true);
    try {
      const list = await usersApi.getAdminUsers();
      setAvailableBarbers(list);
      // Auto-select first barber if only one exists
      if (list.length === 1) {
        setSelectedBarber(list[0]);
        // Skip the barber selection step and go straight to service selection
        setCurrentStep(2);
      }
    } catch (e) {
      setAvailableBarbers([]);
    } finally {
      setIsLoadingBarbers(false);
    }
  };

  useEffect(() => {
    loadServices();
    loadBarbers();
  }, []);

  // Prefetch availability for next 7 days when entering day selection
  useEffect(() => {
    let isStale = false;
    const prefetch = async () => {
      if (currentStep !== 3 || !selectedService || !selectedBarber) return;
      try {
        const toMinutes = (time: string) => {
          const [h, m] = String(time).split(':');
          return (parseInt(h || '0', 10) * 60) + parseInt(m || '0', 10);
        };
        const toHHMM = (mins: number) => {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        const checks = await Promise.all(days.map(async (d) => {
          const dateStr = d.fullDate.toISOString().split('T')[0];
          // fetch existing appointments for that date
          const slots = await bookingApi.getAvailableSlots(dateStr, selectedBarber?.id);
          const busyIntervals: { startMin: number; endMin: number }[] = (() => {
            const toMinutes = (time: string) => {
              const parts = String(time).split(':');
              const h = parseInt(parts[0] || '0', 10);
              const m = parseInt(parts[1] || '0', 10);
              return h * 60 + m;
            };
            return (slots || [])
              .filter(s => s.is_available === false)
              .map(s => {
                const startMin = toMinutes(String(s.slot_time));
                const dur = typeof (s as any).duration_minutes === 'number' ? (s as any).duration_minutes : 60;
                return { startMin, endMin: startMin + dur };
              })
              .sort((a, b) => a.startMin - b.startMin);
          })();
          // fetch business hours for that day of week
          const dow = d.fullDate.getDay();
          const businessId = getBusinessId();
          
          let bhQuery = supabase
            .from('business_hours')
            .select('*')
            .eq('day_of_week', dow)
            .eq('is_active', true)
            .eq('business_id', businessId);

          if (selectedBarber?.id) {
            bhQuery = bhQuery.eq('user_id', selectedBarber.id);
          } else {
            bhQuery = bhQuery.is('user_id', null);
          }

          const { data: bhRow } = await bhQuery.maybeSingle();
          if (!bhRow) return [dateStr, 0] as const;
          type Window = { start: string; end: string };
          const base: Window[] = [{ start: bhRow.start_time, end: bhRow.end_time }];
          const brks: Array<{ start_time: string; end_time: string }> = (bhRow as any).breaks || [];
          const singleBreak = (bhRow.break_start_time && bhRow.break_end_time)
            ? [{ start_time: bhRow.break_start_time, end_time: bhRow.break_end_time }]
            : [];
          const allBreaks = [...brks, ...singleBreak];
          let windows: Window[] = base;
          for (const b of allBreaks) {
            const next: Window[] = [];
            for (const w of windows) {
              if (b.end_time <= w.start || b.start_time >= w.end) { next.push(w); continue; }
              if (w.start < b.start_time) next.push({ start: w.start, end: b.start_time });
              if (b.end_time < w.end) next.push({ start: b.end_time, end: w.end });
            }
            windows = next.filter(w => w.start < w.end);
          }
          // Subtract date-specific constraints
          try {
            let constraintsQuery = supabase
              .from('business_constraints')
              .select('start_time, end_time')
              .eq('date', dateStr)
              .eq('business_id', businessId)
              .order('start_time');
            if (selectedBarber?.id) {
              constraintsQuery = constraintsQuery.or(`user_id.is.null,user_id.eq.${selectedBarber.id}`);
            } else {
              constraintsQuery = constraintsQuery.is('user_id', null);
            }
            const { data: constraintsRows } = await constraintsQuery;
            for (const c of (constraintsRows || []) as Array<{ start_time: string; end_time: string }>) {
              const next: Window[] = [];
              for (const w of windows) {
                if (c.end_time <= w.start || c.start_time >= w.end) { next.push(w); continue; }
                if (w.start < c.start_time) next.push({ start: w.start, end: c.start_time });
                if (c.end_time < w.end) next.push({ start: c.end_time, end: w.end });
              }
              windows = next.filter(w => w.start < w.end);
            }
          } catch {}
          // Cache windows per barber & date for quick reuse
          (globalThis as any).__bh_windows__ = (globalThis as any).__bh_windows__ || {};
          const cacheKey = `${selectedBarber?.id || 'global'}:${dateStr}`;
          (globalThis as any).__bh_windows__[cacheKey] = windows;

          const normalized = windows
            .map(w => ({ startMin: toMinutes(w.start), endMin: toMinutes(w.end) }))
            .filter(w => w.startMin < w.endMin)
            .sort((a, b) => a.startMin - b.startMin);
          const serviceDuration = selectedService.duration_minutes ?? 60;
          let availableCount = 0;
          const now = new Date();
          const isSameDay = d.fullDate.toDateString() === now.toDateString();
          const findPrevBusyEnd = (startMin: number) => {
            let prevEnd = -1;
            for (const b of busyIntervals) {
              if (b.endMin <= startMin && b.endMin > prevEnd) prevEnd = b.endMin;
            }
            return prevEnd;
          };
          const findNextBusyStart = (startMin: number) => {
            let nextStart = Number.POSITIVE_INFINITY;
            for (const b of busyIntervals) {
              if (b.startMin >= startMin && b.startMin < nextStart) nextStart = b.startMin;
            }
            return Number.isFinite(nextStart) ? nextStart : -1;
          };
          for (const w of normalized) {
            let tMin = w.startMin;
            while (tMin + serviceDuration <= w.endMin) {
              // Enforce break after previous busy
              const prevEnd = findPrevBusyEnd(tMin);
              if (prevEnd >= 0) {
                const requiredStart = prevEnd + globalBreakMinutes;
                if (tMin < requiredStart) {
                  tMin = requiredStart;
                  continue;
                }
              }
              const tStr = toHHMM(tMin);
              const hh = Math.floor(tMin / 60);
              const mm = tMin % 60;
              const dtCandidate = new Date(d.fullDate);
              dtCandidate.setHours(hh, mm, 0, 0);
              const isFutureOrNotToday = !isSameDay || dtCandidate.getTime() >= now.getTime();
              // Skip if overlaps an existing busy interval
              const overlaps = busyIntervals.some(b => Math.max(b.startMin, tMin) < Math.min(b.endMin, tMin + serviceDuration));
              // Enforce break before next busy
              const endMin = tMin + serviceDuration;
              const nextStart = findNextBusyStart(tMin);
              const violatesNextBreak = nextStart >= 0 && (endMin + globalBreakMinutes) > nextStart;
              if (isFutureOrNotToday && !overlaps && !violatesNextBreak) availableCount += 1;
              tMin += serviceDuration;
            }
          }
          return [dateStr, availableCount] as const;
        }));

        if (!isStale) {
          const map: Record<string, number> = {};
          checks.forEach(([ds, cnt]) => { map[ds] = cnt; });
          setDayAvailability(map);
        }
      } catch {
        if (!isStale) setDayAvailability({});
      }
    };
    prefetch();
    return () => { isStale = true; };
  }, [currentStep, selectedService, selectedBarber, refreshTick, globalBreakMinutes]);

  // Explicitly refresh slots for the currently selected day (used by pull-to-refresh)
  const refreshSelectedDaySlots = async () => {
    if (selectedDay === null) return;
    setIsLoadingSlots(true);
    try {
      const date = days[selectedDay].fullDate;
      const dateString = date.toISOString().split('T')[0];
      const slots = await bookingApi.getAvailableSlots(dateString, selectedBarber?.id);
      // Refresh business hours windows cache for this DOW
      const dayOfWeek = date.getDay();
      const businessId = getBusinessId();
      
      let bhQuery = supabase
        .from('business_hours')
        .select('*')
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .eq('business_id', businessId);

      if (selectedBarber?.id) {
        bhQuery = bhQuery.eq('user_id', selectedBarber.id);
      } else {
        bhQuery = bhQuery.is('user_id', null);
      }

      const { data: bhRow } = await bhQuery.maybeSingle();
      if (bhRow) {
        type Window = { start: string; end: string };
        const base: Window[] = [{ start: bhRow.start_time, end: bhRow.end_time }];
        const brks: Array<{ start_time: string; end_time: string }> = (bhRow as any).breaks || [];
        const singleBreak = (bhRow.break_start_time && bhRow.break_end_time)
          ? [{ start_time: bhRow.break_start_time, end_time: bhRow.break_end_time }]
          : [];
        const allBreaks = [...brks, ...singleBreak];
        let windows: Window[] = base;
        for (const b of allBreaks) {
          const next: Window[] = [];
          for (const w of windows) {
            if (b.end_time <= w.start || b.start_time >= w.end) { next.push(w); continue; }
            if (w.start < b.start_time) next.push({ start: w.start, end: b.start_time });
            if (b.end_time < w.end) next.push({ start: b.end_time, end: w.end });
          }
          windows = next.filter(w => w.start < w.end);
        }
        // Subtract date-specific constraints as well
        try {
          let constraintsQuery = supabase
            .from('business_constraints')
            .select('start_time, end_time')
            .eq('date', dateString)
            .eq('business_id', businessId)
            .order('start_time');
          if (selectedBarber?.id) {
            constraintsQuery = constraintsQuery.or(`user_id.is.null,user_id.eq.${selectedBarber.id}`);
          } else {
            constraintsQuery = constraintsQuery.is('user_id', null);
          }
          const { data: constraintsRows } = await constraintsQuery;
          for (const c of (constraintsRows || []) as Array<{ start_time: string; end_time: string }>) {
            const next: Window[] = [];
            for (const w of windows) {
              if (c.end_time <= w.start || c.start_time >= w.end) { next.push(w); continue; }
              if (w.start < c.start_time) next.push({ start: w.start, end: c.start_time });
              if (c.end_time < w.end) next.push({ start: c.end_time, end: w.end });
            }
            windows = next.filter(w => w.start < w.end);
          }
        } catch {}
        (globalThis as any).__bh_windows__ = (globalThis as any).__bh_windows__ || {};
        const cacheKey = `${selectedBarber?.id || 'global'}:${dateString}`;
        (globalThis as any).__bh_windows__[cacheKey] = windows;
      }
      setAvailableSlots(slots);
    } catch (error) {
      console.error('Error refreshing selected day slots:', error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // Pull-to-refresh handler: reload services and re-trigger slot/availability effects
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadServices();
      // Recompute availability summaries
      setRefreshTick((t) => t + 1);
      // Also refresh concrete slots for the currently selected day (if any)
      await refreshSelectedDaySlots();
    } finally {
      setRefreshing(false);
    }
  };

  // Function to actually book the appointment
  const proceedWithBooking = async (existingAppointmentToCancel?: any) => {
    
    if (!selectedService || selectedTime === null || selectedDay === null) {
      return;
    }

    const dateString = selectedDate?.toISOString().split('T')[0];
    
    
    // Guard: disallow booking in constrained windows
    try {
      const businessId = getBusinessId();
      
      let constraintsQuery = supabase
        .from('business_constraints')
        .select('start_time, end_time')
        .eq('date', dateString)
        .eq('business_id', businessId)
        .order('start_time');
      if (selectedBarber?.id) {
        constraintsQuery = constraintsQuery.or(`user_id.is.null,user_id.eq.${selectedBarber.id}`);
      } else {
        constraintsQuery = constraintsQuery.is('user_id', null);
      }
      const { data: constraintsRows } = await constraintsQuery;
      const withinConstraint = (t: string) => {
        return (constraintsRows || []).some((c: any) => {
          const s = String(c.start_time).slice(0,5);
          const e = String(c.end_time).slice(0,5);
          return s <= t && t < e;
        });
      };
      if (withinConstraint(selectedTime)) {
        Alert.alert('לא ניתן לקבוע', 'קיימים אילוצים בשעה/תאריך שבחרת. אנא בחר/י זמן אחר.');
        return;
      }
    } catch {}
    
    // קיימים שני תרחישים:
    // 1) יש שורה זמינה עבור התאריך/שעה → נעדכן אותה ל-booked
    // 2) אין שורה זמינה → ניצור שורה חדשה כ-booked
    const slotToBook = availableSlots.find(
      slot => slot.slot_date === dateString && 
              slot.slot_time === selectedTime && 
              slot.is_available &&
              (selectedBarber?.id ? slot.barber_id === selectedBarber.id : !slot.barber_id)
    );


    setIsBooking(true);
    try {
      // Cancel existing appointment if provided
      if (existingAppointmentToCancel) {
        const cancelSuccess = await bookingApi.cancelTimeSlot(existingAppointmentToCancel.id);
        if (!cancelSuccess) {
          Alert.alert('שגיאה', 'שגיאה בביטול התור הקיים. אנא נסה שוב.');
          return;
        }
      }

      // Book slot (update existing if available, else insert new row)
      const durationMinutes = selectedService.duration_minutes ?? 60;
      
      
      const success = slotToBook
        ? await bookingApi.bookTimeSlot(
            slotToBook.id,
            user?.name || 'לקוח',
            user?.phone || '',
            selectedService.name,
            durationMinutes,
            selectedBarber?.id,
            selectedService.id,
            user?.id
          )
        : await bookingApi.bookByDateTime(
            dateString!,
            selectedTime,
            user?.name || 'לקוח',
            user?.phone || '',
            selectedService.name,
            durationMinutes,
            selectedBarber?.id,
            selectedService.id,
            user?.id
          );


      if (success) {
        const dateUs = selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
        const baseMessage = `Your appointment for\n"${selectedService.name}"\n\nhas been scheduled for\n${dateUs}\n${selectedTime}`;
        const message = existingAppointmentToCancel
          ? `התור הקודם בוטל והתור החדש נקבע בהצלחה!\n\n${baseMessage}`
          : baseMessage;
         
        setSuccessMessage(message);
        setShowSuccessModal(true);

        // Notify the assigned admin (barber) about the new booking
        try {
          const title = 'נקבע תור חדש';
          const dateString = selectedDate?.toISOString().split('T')[0];
          const content = `${user?.name || 'לקוח'} (${user?.phone || ''}) קבע/ה תור ל"${selectedService.name}" בתאריך ${dateString} בשעה ${selectedTime}`;
          if (selectedBarber?.id) {
            notificationsApi.createAdminNotificationForUserId(selectedBarber.id, title, content, 'system').catch(() => {});
          } else {
            notificationsApi.createAdminNotification(title, content, 'system').catch(() => {});
          }
        } catch {}

        // Create a notification for the client
        try {
          if (user?.phone && user.phone.trim() !== '') {
            const notifTitle = 'התור שלך נקבע';
            const notifContent = `התור שלך ל"${selectedService.name}" נקבע ליום ${days[selectedDay].dayName} ${days[selectedDay].date} בשעה ${selectedTime}`;
            await notificationsApi.createNotification({
              title: notifTitle,
              content: notifContent,
              type: 'appointment_reminder',
              recipient_name: user?.name || 'לקוח',
              recipient_phone: user.phone.trim(),
              business_id: getBusinessId(),
            });
          }
        } catch {}

        // הניווט יתבצע לאחר אישור בחלון ההצלחה
      } else {
        Alert.alert('שגיאה', 'קביעת התור נכשלה. אנא נסה שוב.');
      }
    } catch (error) {
      console.error('Error booking appointment:', error);
      Alert.alert('שגיאה', 'קביעת התור נכשלה. אנא נסה שוב.');
    } finally {
      setIsBooking(false);
    }
  };

  // Move the booking logic to execute only after confirmation in the modal
  const handleBookAppointment = async () => {
    
    if (!selectedService || selectedTime === null || selectedDay === null) {
      Alert.alert('Error', 'Please select a date, time, and service before booking the appointment');
      return;
    }

    const dateString = selectedDate?.toISOString().split('T')[0];
    const slotToBook = availableSlots.find(
      slot => slot.slot_date === dateString && 
              slot.slot_time === selectedTime && 
              slot.is_available &&
              (selectedBarber?.id ? slot.barber_id === selectedBarber.id : !slot.barber_id)
    );

    setIsCheckingAppointments(true);
    
    // Check if user has an existing appointment on the selected day
    try {
      const sameDayAppointments = await checkUserAppointmentsOnDate(dateString!);
      if (sameDayAppointments.length > 0) {
        const existing = sameDayAppointments[0];
        setExistingAppointment(existing);
        setModalType('replace');
        setShowReplaceModal(true);
      } else {
        setModalType('confirm');
        setShowConfirmModal(true);
      }
    } catch (error) {
      console.error('Error checking same-day appointments:', error);
      setModalType('confirm');
      setShowConfirmModal(true);
    } finally {
      setIsCheckingAppointments(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={currentStep === 1 ? [] : ['top']}>
      {currentStep !== 1 && (
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={{ width: 22 }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.title}>Appointment Booking</Text>
              <Text style={styles.headerSubtitle}>Select a service, day, and time</Text>
            </View>
            <View style={{ width: 22 }} />
          </View>
        </View>
      )}
      <View style={[styles.contentWrapper, currentStep === 1 ? { backgroundColor: 'transparent', borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 0 } : null]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: currentStep === 1 ? 160 : contentBottomPadding }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#000" />}
        >

        {/* Step 1: Barber Selection */}
        {currentStep === 1 && (
          <View style={[styles.section, styles.sectionFullBleed]}>
            {isLoadingBarbers ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading Employees...</Text>
              </View>
            ) : (
              <View>
                <BarberCarouselSelector
                  barbers={availableBarbers}
                  activeIndex={Math.max(0, availableBarbers.findIndex(b => b.id === selectedBarber?.id))}
                  onIndexChange={(idx) => {
                    const barber = availableBarbers[idx];
                    if (!barber) return;
                    const isSame = selectedBarber?.id === barber.id;
                    setSelectedBarber(isSame ? barber : barber);
                    setSelectedService(null);
                    setSelectedDay(null);
                    setSelectedTime(null);
                    setAvailableSlots([]);
                    setIsLoadingSlots(false);
                    setDayAvailability({});
                  }}
                  styles={styles}
                  renderTopOverlay={() => (
                    selectedBarber ? (
                      <TouchableOpacity
                        style={styles.overlayContinueBtn}
                        activeOpacity={0.9}
                        onPress={() => setCurrentStep(2)}
                      >
                        <BlurView intensity={24} tint="dark" style={styles.overlayContinueBlur} />
                        <Text style={styles.overlayContinueText}>Continue to Service Selection</Text>
                      </TouchableOpacity>
                    ) : null
                  )}
                  bottomOffset={Math.max(insets.bottom, 20) + 60}
                />
              </View>
            )}
          </View>
        )}

        {/* Step 2: Service Selection */}
        {currentStep === 2 && selectedBarber && (
          <View style={styles.section}>
            <View style={styles.dayHeaderRow}>
              <TouchableOpacity onPress={() => setCurrentStep(1)} style={styles.backCircle} activeOpacity={0.8}>
                <Ionicons name="arrow-back" size={18} color="#000000" />
              </TouchableOpacity>
              <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Select Service</Text>
              <View style={{ width: 36 }} />
            </View>
            {isLoadingServices ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading services...</Text>
              </View>
            ) : (
              <View style={styles.servicesList}>
                {availableServices.map((service) => (
                  <TouchableOpacity
                    key={service.id}
                    style={[
                      styles.serviceListItem,
                      selectedService?.id === service.id && styles.serviceListItemSelected
                    ]}
                    onPress={() => {
                      const isSame = selectedService?.id === service.id;
                      setSelectedService(isSame ? null : service);
                      setSelectedDay(null);
                      setSelectedTime(null);
                      setAvailableSlots([]);
                      setIsLoadingSlots(false);
                      setShowConfirmModal(false);
                      setShowReplaceModal(false);
                      setExistingAppointment(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.serviceListItemContent}>
                      <Text style={styles.serviceListItemName}>{service.name}</Text>
                      <View style={styles.serviceListItemDetails}>
                        <View style={styles.serviceListItemPrice}>
                          <Text style={styles.serviceListItemPriceText}>${service.price}</Text>
                        </View>
                        <View style={styles.serviceListItemDuration}>
                          <Ionicons name="time-outline" size={14} color="#8E8E93" />
                          <Text style={styles.serviceListItemDurationText}>{(service.duration_minutes ?? 60)} min</Text>
                        </View>
                      </View>
                    </View>
                    {selectedService?.id === service.id && (
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Step 3: Day Selection */}
        {currentStep >= 3 && selectedBarber && selectedService && (
          <View style={styles.section}>
            <View style={styles.dayHeaderRow}>
              <TouchableOpacity 
                onPress={() => setCurrentStep(2)} 
                style={styles.backCircle} 
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={18} color="#000000" />
              </TouchableOpacity>
              <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Select Day</Text>
              <View style={{ width: 36 }} />
            </View>
            {/* Monthly calendar grid limited by booking window */}
            {(() => {
              const start = new Date();
              const end = new Date();
              end.setDate(start.getDate() + Math.max(0, bookingOpenDays - 1));

              const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
              const monthEnd = new Date(end.getFullYear(), end.getMonth(), 1);

              const months: Date[] = [];
              const cursor = new Date(monthStart);
              while (cursor <= monthEnd) {
                months.push(new Date(cursor));
                cursor.setMonth(cursor.getMonth() + 1);
              }

              const isSameDate = (a: Date, b: Date) => a.toDateString() === b.toDateString();

              return (
                <View>
                  {months.map((m, mi) => {
                    const year = m.getFullYear();
                    const month = m.getMonth();
                    const firstDayIdx = new Date(year, month, 1).getDay(); // 0..6, 0=Sun
                    const daysInMonth = new Date(year, month + 1, 0).getDate();

                    // Build grid cells with leading blanks
                    const cells: (Date | null)[] = Array(firstDayIdx).fill(null);
                    for (let d = 1; d <= daysInMonth; d++) {
                      cells.push(new Date(year, month, d));
                    }
                    // chunk into weeks
                    const weeks: (Date | null)[][] = [];
                    for (let i = 0; i < cells.length; i += 7) {
                      weeks.push(cells.slice(i, i + 7));
                    }

                    const monthLabel = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

                    return (
                      <View key={`m-${year}-${month}`} style={{ marginBottom: 16 }}>
                        <Text style={styles.calendarMonthTitle}>{monthLabel}</Text>
                        {weeks.map((week, wi) => (
                          <View key={`w-${mi}-${wi}`} style={styles.calendarGrid}>
                            {week.map((dateObj, di) => {
                              if (!dateObj) {
                                return <View key={`c-${mi}-${wi}-${di}`} style={[styles.calendarCell, { backgroundColor: 'transparent' }]} />;
                              }
                              // within range?
                              const inRange = dateObj >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) && dateObj <= end;
                              const dsIso = dateObj.toISOString().split('T')[0];
                              const hasAvail = (dayAvailability[dsIso] ?? 0) > 0;
                              const isSel = selectedDate ? isSameDate(dateObj, selectedDate) : false;
                              return (
                                <TouchableOpacity
                                  key={`c-${mi}-${wi}-${di}`}
                                  disabled={!inRange}
                                  onPress={() => {
                                    const idx = days.findIndex(d => d.fullDate.toDateString() === dateObj.toDateString());
                                    setSelectedDay(idx >= 0 ? idx : null);
                                    setSelectedTime(null);
                                  }}
                                  style={[
                                    styles.calendarCell,
                                    !inRange && styles.calendarCellDisabled,
                                    isSel && styles.calendarCellSelected,
                                  ]}
                                  activeOpacity={0.7}
                                >
                                  <Text style={{
                                    fontSize: 14,
                                    fontWeight: '600',
                                    color: isSel ? '#FFFFFF' : (!inRange ? '#C7C7CC' : '#1C1C1E'),
                                  }}>
                                    {dateObj.getDate()}
                                  </Text>
                                  {inRange && (
                                    <View style={[styles.calendarAvailDot, { backgroundColor: hasAvail ? '#34C759' : '#FF3B30' }]} />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              );
            })()}
            <Text style={styles.daysLegendNew}>* Days with no available appointments are marked in red</Text>
            <Text style={styles.daysLegendSecondaryNew}>
              * Even if there are no available appointments – you can click on the day and join the waitlist for that day
            </Text>
          </View>
        )}

        </ScrollView>
      </View>

      {/* Footer action button per step */}
      {footerVisible && currentStep !== 1 && (
        <View style={[styles.bookingFooter, { bottom: footerBottom }]}>
          {/* Step 1 button moved into overlay; footer hidden */}

          {currentStep === 2 && selectedService && (
            <TouchableOpacity
              style={[styles.bookBtn]}
              onPress={() => setCurrentStep(3)}
            >
              <Text style={styles.bookBtnText}>Continue to Day Selection</Text>
            </TouchableOpacity>
          )}
        {currentStep === 3 && selectedDay !== null && (() => {
          const dateStr = selectedDate?.toISOString().split('T')[0] || '';
          const hasAvailForSelected = dateStr ? ((dayAvailability[dateStr] ?? 0) > 0) : false;
          if (hasAvailForSelected) {
            return (
              <TouchableOpacity
                style={[
                  styles.bookBtn,
                  (isBooking || isCheckingAppointments) && styles.bookBtnDisabled
                ]}
                onPress={() => {
                const dateStr = selectedDate?.toISOString().split('T')[0] || '';
                router.push({
                  pathname: '/(client-tabs)/select-time' as any,
                  params: {
                    serviceName: selectedService?.name || '',
                    durationMinutes: selectedService?.duration_minutes?.toString() || '60',
                    price: selectedService?.price?.toString() || '0',
                    selectedDate: dateStr,
                    serviceId: selectedService?.id || '',
                    barberId: selectedBarber?.id || '',
                    breakMinutes: String(globalBreakMinutes ?? 0),
                  } as any
                });
              }}
                disabled={isBooking || isCheckingAppointments}
              >
                <Text style={styles.bookBtnText}>Continue to Time Selection</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              style={styles.waitlistButton}
              onPress={() => {
                router.push({
                  pathname: '/(client-tabs)/waitlist' as any,
                  params: {
                    serviceName: selectedService?.name || 'שירות כללי',
                    selectedDate: dateStr,
                    barberId: selectedBarber?.id || '',
                  } as any,
                } as any);
              }}
              activeOpacity={0.9}
            >
              <Ionicons name="hourglass" size={18} color="#FFFFFF" />
              <Text style={styles.waitlistButtonText}>Join Waitlist</Text>
            </TouchableOpacity>
          );
        })()}
        {currentStep === 4 && (
          <TouchableOpacity 
            style={[
              styles.bookBtn,
              (!selectedService || selectedTime === null || isBooking || isCheckingAppointments) && styles.bookBtnDisabled
            ]}
            onPress={() => {
              handleBookAppointment();
            }}
            disabled={!selectedService || selectedTime === null || isBooking || isCheckingAppointments}
          >
            <Text style={styles.bookBtnText}>
              {isBooking ? 'קביעת תור...' : 
               isCheckingAppointments ? 'בודק תורים קיימים...' : 
               `קבע תור - ₪${selectedService?.price || 0}`}
            </Text>
          </TouchableOpacity>
        )}
        </View>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <Modal
          visible={showConfirmModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowConfirmModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalIconContainer}>
                  <Ionicons name="calendar-outline" size={32} color={colors.primary} />
                </View>
                <Text style={styles.modalTitle}>Confirm Appointment Booking</Text>
              </View>
              
              <View style={styles.appointmentDetails}>
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="cut-outline" size={20} color="#6B7280" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Service</Text>
                    <Text style={styles.detailValue}>{selectedService?.name}</Text>
                  </View>
                </View>
                
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="calendar" size={20} color="#6B7280" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>
                      {selectedDay !== null ? (() => {
                        const date = days[selectedDay].fullDate;
                        const dayName = days[selectedDay].dayName;
                        const formattedDate = date.toLocaleDateString('en-US', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        });
                        return `${dayName}, ${formattedDate}`;
                      })() : ''}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="time" size={20} color="#6B7280" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Time</Text>
                    <Text style={styles.detailValue}>{selectedTime}</Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => setShowConfirmModal(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={() => {
                    setShowConfirmModal(false);
                    proceedWithBooking();
                  }}
                >
                  <Text style={styles.modalButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Replace Confirmation Modal */}
      {existingAppointment && showReplaceModal && (
        <Modal
          visible={showReplaceModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowReplaceModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Existing Appointment</Text>
              <Text style={styles.modalMessage} numberOfLines={0} allowFontScaling={false}>
                You have an existing appointment on {existingAppointment?.slot_date ? new Date(existingAppointment.slot_date).toLocaleDateString('en-US', { 
                 weekday: 'long', 
                 month: 'long', 
                 day: 'numeric' 
               }) : 'Unknown'} at {existingAppointment?.slot_time || 'Unknown'} for {existingAppointment?.service_name || 'Undefined'}.
                {'\n'}
                {'\n'}
                Do you want to cancel the existing appointment and book a new one on {selectedDay !== null ? `${days[selectedDay].dayName} ${days[selectedDay].date}` : ''} at {selectedTime}?
              </Text>
              <View style={[styles.modalButtons, styles.modalButtonsStacked]}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, styles.modalButtonCancel]}
                  onPress={() => setShowReplaceModal(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, styles.modalButtonReplace]}
                  onPress={() => {
                    setShowReplaceModal(false);
                    if (existingAppointment) {
                      proceedWithBooking(existingAppointment);
                    }
                  }}
                >
                  <Text style={styles.modalButtonText}>Replace Appointment</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, styles.modalButtonBookAdditional]}
                  onPress={() => {
                    setShowReplaceModal(false);
                    proceedWithBooking();
                  }}
                >
                  <Text style={styles.modalButtonText}>Book Additional Appointment</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Success Modal (Apple-style) */}
      {showSuccessModal && (
        <Modal
          visible={showSuccessModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <View style={styles.modalOverlay}>
            <BlurView style={StyleSheet.absoluteFill} intensity={24} tint="dark" />
            <View style={styles.modalContent}>
              <View style={styles.modalIconWrapper}>
                <Ionicons name="checkmark-circle" size={56} color="#34C759" />
              </View>
              <Text style={styles.modalTitle}>Appointment Successfully Booked!</Text>
              <Text style={styles.modalMessage} numberOfLines={0} allowFontScaling={false}>
                {successMessage}
              </Text>
              <View style={styles.scheduleBlock}>
                <Text style={styles.scheduleLine}>has been scheduled for</Text>
                <Text style={styles.scheduleDate}>
                  {selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''}
                </Text>
                <Text style={styles.scheduleTime}>{selectedTime || ''}</Text>
              </View>
              <View style={styles.modalInfoSection}>
                <Text style={styles.modalInfoTitle}>Your info</Text>
                {!!selectedService?.name && (
                  <View style={styles.modalInfoRow}>
                    <Ionicons name="pricetag-outline" size={18} color="#8E8E93" style={styles.modalInfoIcon} />
                    <Text style={styles.modalInfoText}><Text style={styles.modalInfoLabel}>Service: </Text>{selectedService?.name}</Text>
                  </View>
                )}
                <View style={styles.modalInfoRow}>
                  <Ionicons name="calendar-outline" size={18} color="#8E8E93" style={styles.modalInfoIcon} />
                  <Text style={styles.modalInfoText}><Text style={styles.modalInfoLabel}>Date: </Text>{selectedDate ? new Date(selectedDate).toLocaleDateString() : '-'}</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Ionicons name="time-outline" size={18} color="#8E8E93" style={styles.modalInfoIcon} />
                  <Text style={styles.modalInfoText}><Text style={styles.modalInfoLabel}>Time: </Text>{selectedTime || '-'}</Text>
                </View>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCalendar]}
                  onPress={async () => {
                    try {
                      const duration = selectedService?.duration_minutes ?? 60;
                      const dateStr = selectedDate?.toISOString().split('T')[0] || '';
                      const timeStr = selectedTime || '00:00';
                      const start = new Date(`${dateStr}T${timeStr}:00`);
                      const end = new Date(start.getTime() + duration * 60000);

                      const perm = await Calendar.requestCalendarPermissionsAsync();
                      if (perm.status !== 'granted') {
                        Alert.alert('נדרש אישור', 'נדרש אישור גישה ליומן כדי להוסיף אירוע.');
                        return;
                      }

                      let calendarId: string | undefined;
                      if (Platform.OS === 'ios') {
                        const defCal = await Calendar.getDefaultCalendarAsync();
                        calendarId = defCal?.id;
                      } else {
                        const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
                        calendarId = cals.find((c: any) => (c.allowsModifications || c.accessLevel === Calendar.CalendarAccessLevel.OWNER))?.id || cals[0]?.id;
                      }

                      if (!calendarId) {
                        Alert.alert('שגיאה', 'לא נמצא יומן שניתן לכתוב אליו.');
                        return;
                      }

                      await Calendar.createEventAsync(calendarId, {
                        title: selectedService?.name || 'Appointment',
                        startDate: start,
                        endDate: end,
                        notes: 'Booked via the app',
                      });

                      Alert.alert('נוסף', 'האירוע נוסף ליומן שלך.');
                    } catch (e) {
                      Alert.alert('שגיאה', 'לא ניתן להוסיף את האירוע ליומן.');
                    }
                  }}
                  activeOpacity={0.9}
                >
                  <View style={styles.modalButtonRow}>
                    <Ionicons name="calendar-outline" size={20} color="#FFFFFF" style={styles.modalButtonIcon} />
                    <Text style={styles.modalButtonCalendarText}>Add to Calendar</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={() => {
                    setShowSuccessModal(false);
                    try {
                      (router as any).replace?.('/(client-tabs)/appointments');
                    } catch {
                      router.back();
                    }
                  }}
                >
                  <Text style={styles.modalButtonText}>Got it</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  // Carousel & background styles
  carouselContainer: {
    height: CAROUSEL_HEIGHT,
    borderRadius: 0,
    overflow: 'hidden',
    marginBottom: 0,
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject as any,
    width: '100%',
    height: '100%',
  },
  bgDimOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  carouselTopOverlay: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  carouselBottomArea: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  carouselList: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  carouselItem: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#FFFFFF',
    marginHorizontal: ITEM_SPACING / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    // Keep stable layout to avoid jumps
    alignSelf: 'center',
  },
  carouselItemImage: {
    width: '100%',
    height: '100%',
    borderRadius: AVATAR_SIZE / 2,
  },
  carouselItemPlaceholder: {
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselActiveName: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  overlayContinueBtn: {
    width: '88%',
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  overlayContinueBlur: {
    ...StyleSheet.absoluteFillObject as any,
    borderRadius: 22,
  },
  overlayContinueText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    paddingVertical: 14,
    paddingHorizontal: 18,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  calendarCellDisabled: {
    opacity: 0.35,
  },
  calendarCellSelected: {
    backgroundColor: colors.primary,
  },
  calendarAvailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topSafeArea: {
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flex: 1,
    marginBottom: 0,
  },
  scrollContent: {
    paddingBottom: 96,
  },
  bookingFooter: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  sectionFixedTitle: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  header: {
    height: 104,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  placeholder: {
    width: 36,
  },
  section: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionFullBleed: {
    marginTop: 0,
    marginHorizontal: 0,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  sectionTitleCentered: {
    textAlign: 'center',
  },
  servicesScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  serviceCard: {
    width: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginLeft: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  serviceCardSelected: {
    borderColor: colors.primary,
    shadowOpacity: 0.15,
    transform: [{ scale: 1.02 }],
  },
  serviceCardGrid: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'rgba(142, 142, 147, 0.12)',
    marginBottom: 12,
  },
  imageWrapper: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F8F8F8',
  },
  serviceImage: {
    width: '100%',
    height: '100%',
  },
  serviceInfo: {
    padding: 14,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 10,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F2F2F2',
    borderColor: '#E5E5E5',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  durationChipText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '600',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 28,
    height: 28,
    backgroundColor: colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  priceBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(142,142,147,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  priceBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  daysRow: {
    flexGrow: 0,
    paddingHorizontal: 0,
  },
  dayBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 6,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    minWidth: 70,
    borderWidth: 1,
    borderColor: 'rgba(142, 142, 147, 0.2)',
  },
  dayBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowOpacity: 0.15,
    transform: [{ scale: 1.05 }],
  },
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(142,142,147,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysList: {
    gap: 14,
    paddingTop: 8,
  },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '86%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)'
  },
  dayPillUnavailable: {
    borderColor: 'rgba(255,59,48,0.35)',
  },
  dayPillUnavailableSelected: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
    shadowOpacity: 0.18,
  },
  dayPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowOpacity: 0.18,
  },
  dayPillDate: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '700',
  },
  dayPillDateEm: {
    color: '#DC2626',
  },
  dayPillDateSelected: {
    color: '#FFFFFF',
  },
  dayPillLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '800',
  },
  dayPillLabelEm: {
    color: '#DC2626',
  },
  dayPillLabelSelected: {
    color: '#FFFFFF',
  },
  timesList: {
    gap: 14,
    paddingTop: 8,
  },
  timePill: {
    alignSelf: 'center',
    width: '86%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)'
  },
  timePillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timePillLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '800',
  },
  timePillLabelSelected: {
    color: '#FFFFFF',
  },
  daysLegend: {
    marginTop: 10,
    textAlign: 'right',
    color: '#1C1C1E',
    fontSize: 12,
  },
  daysLegendSecondary: {
    marginTop: 6,
    textAlign: 'right',
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 16,
  },
  dayDate: {
    fontSize: 20,
    color: '#1C1C1E',
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  dayDateSelected: {
    color: '#FFFFFF',
  },
  dayText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
  slotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  slotBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '30%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 2,
    borderColor: 'rgba(142, 142, 147, 0.12)',
    position: 'relative',
  },
  slotBtnSelected: {
    backgroundColor: '#000000',
    borderColor: '#000000',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    transform: [{ scale: 1.05 }],
  },
  slotContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  slotText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: -0.3,
  },
  slotTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  slotSelectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 16,
    marginVertical: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(142, 142, 147, 0.1)',
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'right',
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(142, 142, 147, 0.2)',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '88%',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  bookBtnDisabled: {
    backgroundColor: '#8E8E93',
    shadowOpacity: 0,
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  tabBarSpacing: {
    height: 120,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  noSlotsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noSlotsText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  noSlotsSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: -0.2,
    marginBottom: 20,
  },
  waitlistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  waitlistButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(10px)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 25,
    elevation: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appointmentDetails: {
    width: '100%',
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  detailContent: {
    flex: 1,
    alignItems: 'flex-end',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '700',
    textAlign: 'right',
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  modalMessage: {
    fontSize: 17,
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
    letterSpacing: -0.2,
    fontWeight: '500',
  },
  scheduleBlock: {
    width: '100%',
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  scheduleLine: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 6,
  },
  scheduleDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  scheduleTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  // Stacked layout for long labels on compact screens
  modalButtonsStacked: {
    flexDirection: 'column',
    gap: 12,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  modalButtonStacked: {
    width: '100%',
    flex: 0,
    minHeight: 52,
  },
  modalButtonCancel: {
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  modalButtonConfirm: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modalButtonCalendar: {
    backgroundColor: '#4285F4',
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  modalButtonReplace: {
    backgroundColor: '#FF9500',
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  modalButtonBookAdditional: {
    backgroundColor: '#34C759',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  modalButtonCalendarText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  modalButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonIcon: {
    marginRight: 8,
  },
  modalIconWrapper: {
    alignItems: 'center',
    marginBottom: 8,
  },
  modalInfoSection: {
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(118,118,128,0.08)',
    borderRadius: 12,
  },
  modalInfoTitle: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
    marginBottom: 6,
  },
  modalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalInfoIcon: {
    marginRight: 8,
  },
  modalInfoText: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  modalInfoLabel: {
    color: '#3A3A3C',
    fontWeight: '600',
  },
  modalButtonCancelText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  // Barber selection styles
  barbersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  barberCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 16,
  },
  barberCardSelected: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    transform: [{ scale: 1.05 }],
  },
  barberImageWrapper: {
    width: '100%',
    height: 160,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#667eea',
  },
  barberImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  barberImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#667eea',
  },
  barberOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(10px)',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    paddingHorizontal: 12,
  },
  barberNameContainer: {
    alignItems: 'center',
  },
  barberNameOverlay: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 2,
  },
  barberRoleOverlay: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  selectedIndicatorOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(10px)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCheckmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  // New barber list item styles
  barbersList: {
    gap: 12,
  },
  barberListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F2F2F7',
  },
  barberListItemSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0F8FF',
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
  },
  barberListItemImageContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    marginRight: 16,
    backgroundColor: '#F2F2F7',
  },
  barberListItemImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  barberListItemImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  barberListItemContent: {
    flex: 1,
  },
  barberListItemName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  barberListItemRole: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '400',
  },
  // New service list item styles
  servicesList: {
    gap: 12,
  },
  serviceListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F2F2F7',
  },
  serviceListItemSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0F8FF',
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
  },
  serviceListItemContent: {
    flex: 1,
  },
  serviceListItemName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  serviceListItemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  serviceListItemPrice: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  serviceListItemPriceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  serviceListItemDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  serviceListItemDurationText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  // New day list item styles
  daysListNew: {
    gap: 12,
  },
  dayListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F2F2F7',
    minHeight: 80,
  },
  dayListItemUnavailable: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
  },
  dayListItemSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0F8FF',
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
  },
  dayListItemUnavailableSelected: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
    shadowColor: '#FF3B30',
    shadowOpacity: 0.15,
  },
  dayListItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayListItemLeftSection: {
    flex: 1,
  },
  dayListItemRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  dayListItemDate: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  dayListItemDateUnavailable: {
    color: '#FF3B30',
  },
  dayListItemDateSelected: {
    color: colors.primary,
  },
  dayListItemLabel: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
    marginBottom: 4,
  },
  dayListItemLabelUnavailable: {
    color: '#FF3B30',
  },
  dayListItemLabelSelected: {
    color: '#007AFF',
  },
  dayListItemWaitlist: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  dayListItemWaitlistText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dayListItemDayTag: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  dayListItemDayTagUnavailable: {
    backgroundColor: '#FFE5E5',
  },
  dayListItemDayTagSelected: {
    backgroundColor: '#E3F2FD',
  },
  dayListItemDayTagText: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  dayListItemDayTagTextUnavailable: {
    color: '#FF3B30',
  },
  dayListItemDayTagTextSelected: {
    color: colors.primary,
  },
  dayListItemAvailable: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dayListItemAvailableText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  daysLegendNew: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
    textAlign: 'left',
    marginTop: 16,
    marginBottom: 4,
    writingDirection: 'ltr',
  },
  daysLegendSecondaryNew: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '400',
    textAlign: 'left',
    marginBottom: 16,
    writingDirection: 'ltr',
  },
});