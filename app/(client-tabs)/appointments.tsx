import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, Alert, Modal, RefreshControl, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { AvailableTimeSlot } from '@/lib/supabase';
import { supabase, getBusinessId } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { checkWaitlistAndNotify, notifyServiceWaitlistClients } from '@/lib/api/waitlistNotifications';
import { notificationsApi } from '@/lib/api/notifications';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { usersApi } from '@/lib/api/users';
import { servicesApi } from '@/lib/api/services';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { formatTime12Hour } from '@/lib/utils/timeFormat';

type TabType = 'upcoming' | 'past';

// API functions for client appointments
const clientAppointmentsApi = {
  // Get user appointments for multiple dates (most efficient for user appointments)
  async getUserAppointmentsForMultipleDates(dates: string[], userName?: string, userPhone?: string, currentUserId?: string): Promise<AvailableTimeSlot[]> {
    try {
      const businessId = getBusinessId();
      let query = supabase
        .from('appointments')
        .select('*')
        .in('slot_date', dates)
        .eq('business_id', businessId)
        .eq('is_available', false); // Only booked appointments

      // If this is an admin user (barber), filter by their user_id OR barber_id
      if (currentUserId) {
        query = query.or(`user_id.eq.${currentUserId},barber_id.eq.${currentUserId}`);
      }

      query = query.order('slot_date').order('slot_time');

      // Strict client scoping: phone equality only
      if (!currentUserId) { // client view only
        if (userPhone && userPhone.trim().length > 0) {
          query = query.eq('client_phone', userPhone.trim());
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching user appointments for multiple dates:', error);
        throw error;
      }

      // Additional client-side filtering: phone strict match only (defensive)
      let filteredData = data || [];
      if (!currentUserId) {
        if (userPhone && userPhone.trim().length > 0) {
          filteredData = filteredData.filter(slot => String(slot.client_phone || '').trim() === userPhone.trim());
        }
      }

      return filteredData;
    } catch (error) {
      console.error('Error in getUserAppointmentsForMultipleDates:', error);
      throw error;
    }
  },

  // Cancel appointment
  async cancelAppointment(slotId: string, minCancellationHours: number): Promise<{ success: boolean; error?: string }> {
    try {
      // First, get the appointment details before cancelling
      const { data: appointmentData, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', slotId)
        .single();

      if (fetchError) {
        console.error('Error fetching appointment before cancellation:', fetchError);
        return { success: false, error: 'Failed to fetch appointment details' };
      }

      if (!appointmentData) {
        return { success: false, error: 'Appointment not found' };
      }

      // Note: Cancellation time validation is already done in the component
      // before calling this function, so we skip the validation here

      // Cancel the appointment
      const { error } = await supabase
        .from('appointments')
        .update({
          is_available: true,
          client_name: null,
          client_phone: null,
          service_name: 'Available Slot', // Set to default value instead of null
        })
        .eq('id', slotId)
        .eq('business_id', appointmentData.business_id)
        .eq('is_available', false);

      if (error) {
        console.error('Error canceling appointment:', error);
        return { success: false, error: 'Failed to cancel appointment' };
      }

      // Check waitlist and notify waiting clients
      if (appointmentData) {
        // Notify clients waiting for the same date and time period
        await checkWaitlistAndNotify(appointmentData);
        
        // Also notify clients waiting for the same service on any future date
        await notifyServiceWaitlistClients(appointmentData);
      }

      return { success: true };
    } catch (error) {
      console.error('Error in cancelAppointment:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },
};

export default function ClientAppointmentsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userAppointments, setUserAppointments] = useState<AvailableTimeSlot[]>([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AvailableTimeSlot | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showLateCancelModal, setShowLateCancelModal] = useState(false);
  const [managerPhone, setManagerPhone] = useState<string | null>(null);
  const [businessAddress, setBusinessAddress] = useState<string>('');
  const [barberImages, setBarberImages] = useState<Record<string, string>>({});
  const [barberNames, setBarberNames] = useState<Record<string, string>>({});
  const [minCancellationHours, setMinCancellationHours] = useState<number>(24);
  const { user } = useAuthStore();
  const { colors } = useBusinessColors();
  const [serviceIdList, setServiceIdList] = useState<string[]>([]);
  const [serviceNameList, setServiceNameList] = useState<string[]>([]);

  // Load manager phone (first admin user)
  useEffect(() => {
    const loadManagerPhone = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('phone')
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
            normalized = numeric;
          }
          setManagerPhone(normalized);
        }
      } catch (e) {
        setManagerPhone(null);
      }
    };
    
    const loadBusinessAddress = async () => {
      try {
        const profile = await businessProfileApi.getProfile();
        if (profile?.address) {
          setBusinessAddress(String(profile.address));
        }
        if (profile?.min_cancellation_hours !== undefined) {
          setMinCancellationHours(profile.min_cancellation_hours);
        }
      } catch (error) {
        console.error('Error loading business address:', error);
      }
    };
    
    loadManagerPhone();
    loadBusinessAddress();
  }, []);

  // Helper to check if appointment is within the minimum cancellation hours from now
  const isWithinMinCancellationHours = useCallback((appointment: AvailableTimeSlot) => {
    if (!appointment?.slot_date) return false;
    const time = appointment.slot_time ? String(appointment.slot_time) : '00:00';
    const [hh = '00', mm = '00'] = time.split(':');
    const dateTime = new Date(`${appointment.slot_date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`);
    const diffMs = dateTime.getTime() - Date.now();
    const hours = diffMs / (1000 * 60 * 60);
    // Use the configured value as-is; only default to 24 if it's undefined/null
    const minHours = (minCancellationHours ?? 24);
    return hours < minHours;
  }, [minCancellationHours]);

  // Open WhatsApp chat with manager
  const contactManagerOnWhatsApp = useCallback(async (message: string) => {
    if (!managerPhone) {
      Alert.alert('Error', 'Manager phone number is currently unavailable');
      return;
    }
    const encoded = encodeURIComponent(message);
    const appUrl = `whatsapp://send?phone=${managerPhone}&text=${encoded}`;
    const webUrl = `https://wa.me/${managerPhone}?text=${encoded}`;
    try {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch (e) {
      Alert.alert('Error', 'WhatsApp cannot be opened on this device');
    }
  }, [managerPhone]);

  // Open business location in maps
  const openBusinessLocation = useCallback(async () => {
    if (!businessAddress) {
      Alert.alert('Address unavailable', 'Business address is not available right now.');
      return;
    }
    const encoded = encodeURIComponent(businessAddress);
    const url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Error', 'Unable to open maps on this device');
    }
  }, [businessAddress]);

  const loadUserAppointments = useCallback(async (isRefresh = false) => {
    const isAdminUser = user?.user_type === 'admin';
    
    // For admin users, we need user ID. For clients, we need name or phone.
    if (isAdminUser && !user?.id) {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setIsLoading(false);
      }
      return;
    }
    
    if (!isAdminUser && !user?.name && !user?.phone) {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setIsLoading(false);
      }
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setIsLoading(true);
    }

    // Fix any existing appointments with null service_name first
    try {
      const { businessHoursApi } = await import('@/lib/api/businessHours');
      await businessHoursApi.fixNullServiceNames();
    } catch (error) {
      console.error('Error fixing null service names:', error);
      // Continue anyway
    }

    const today = new Date();
    const dates: string[] = [];
    
    // Load past 7 days and next N days according to booking window
    let horizonDays = 14;
    try {
      const profile = await businessProfileApi.getProfile();
      horizonDays = Math.max(1, Number((profile as any)?.booking_open_days ?? 14));
    } catch {}
    for (let i = -7; i <= horizonDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateString = date.toISOString().split('T')[0];
      dates.push(dateString);
    }
    
    try {
      // For admin users (barbers), pass their user ID to filter appointments
      // For clients, pass their name/phone for filtering
      const isAdminUser = user?.user_type === 'admin';
      const appointments = await clientAppointmentsApi.getUserAppointmentsForMultipleDates(
        dates, 
        isAdminUser ? undefined : user.name, // Only use name/phone for client filtering
        isAdminUser ? undefined : user.phone, // Only use name/phone for client filtering
        isAdminUser ? user.id : undefined // Pass user ID for admin filtering
      );
      // Load current business services and cache ids/names for filtering
      try {
        const services = await servicesApi.getAllServices();
        const ids = (services || []).map((s: any) => String(s.id));
        const names = (services || []).map((s: any) => String((s.name || '').trim().toLowerCase()));
        setServiceIdList(ids);
        setServiceNameList(names);
      } catch {}
      // Debug: compare appointment services against current business services
      try {
        const services = await servicesApi.getAllServices();
        const idSet = new Set((services || []).map((s: any) => String(s.id)));
        const nameSet = new Set((services || []).map((s: any) => String((s.name || '').trim().toLowerCase())));
        (appointments || []).forEach((a) => {
          const byId = a.service_id ? idSet.has(String(a.service_id)) : false;
          const byName = a.service_name ? nameSet.has(String(String(a.service_name).trim().toLowerCase())) : false;
          console.log('[AppointmentsDebug] service check', {
            id: (a as any).id,
            service_id: (a as any).service_id,
            service_name: (a as any).service_name,
            inCurrentServicesById: byId,
            inCurrentServicesByName: byName,
          });
        });
      } catch (e) {
        console.log('[AppointmentsDebug] error while checking services against current list', e);
      }
      // Debug: log fetched business_ids vs current app business_id
      try {
        const currentBusinessId = String(getBusinessId());
        const fetchedBusinessIds = Array.from(new Set((appointments || []).map(a => String((a as any).business_id))));
        const mismatches = (appointments || [])
          .filter(a => String((a as any).business_id) !== currentBusinessId)
          .slice(0, 5)
          .map(a => ({ id: (a as any).id, business_id: (a as any).business_id }));
        console.log('[AppointmentsDebug] currentBusinessId=', currentBusinessId, 'fetchedBusinessIds=', fetchedBusinessIds, 'mismatchSamples=', mismatches);
      } catch (e) {
        console.log('[AppointmentsDebug] error while logging business ids', e);
      }
      
      setUserAppointments(appointments);
    } catch (error) {
      console.error('Error loading user appointments:', error);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [user?.name, user?.phone]);

  useEffect(() => {
    loadUserAppointments();
  }, [loadUserAppointments]);

  const onRefresh = useCallback(() => {
    loadUserAppointments(true);
  }, [loadUserAppointments]);

  const formatDate = React.useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }, []);

  const formatTime = React.useCallback((timeString: string) => {
    return formatTime12Hour(timeString);
  }, []);

  // Memoize date calculations for better performance
  const today = React.useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  
  // Double-check that all appointments belong to the current user
  const verifiedUserAppointments = React.useMemo(() => {
    const businessId = getBusinessId();

    // Always scope by current app business_id first (defensive client-side check)
    const scopedByBusiness = userAppointments.filter(slot => {
      return String(slot.business_id) === String(businessId);
    });

    // Debug: log incoming and scoped business ids
    try {
      const inputBizIds = Array.from(new Set(userAppointments.map(s => String((s as any).business_id))));
      const scopedBizIds = Array.from(new Set(scopedByBusiness.map(s => String((s as any).business_id))));
      console.log('[AppointmentsDebug] memo inputBizIds=', inputBizIds, 'scopedBizIds=', scopedBizIds, 'currentBusinessId=', String(businessId), 'counts:', { input: userAppointments.length, scoped: scopedByBusiness.length });
    } catch {}

    const isAdminUser = user?.user_type === 'admin';

    if (isAdminUser) {
      // For admin users (barbers), allow appointments owned by their user_id OR barber_id
      if (!user?.id) {
        return [];
      }
      const filtered = scopedByBusiness.filter(slot => slot.user_id === user.id || slot.barber_id === user.id);
      // Additional filter by services of current business
      const serviceFiltered = filtered.filter(slot => {
        if (serviceIdList.length === 0 && serviceNameList.length === 0) return true;
        const sid = slot.service_id ? String(slot.service_id) : '';
        const sname = slot.service_name ? String(slot.service_name).trim().toLowerCase() : '';
        const byId = sid ? serviceIdList.includes(sid) : false;
        const byName = sname ? serviceNameList.includes(sname) : false;
        return byId || byName;
      });
      try { console.log('[AppointmentsDebug] admin filtered count=', filtered.length, 'serviceFiltered=', serviceFiltered.length); } catch {}
      return serviceFiltered;
    }

    // For clients, check name/phone match as before
    if (!user?.name && !user?.phone) {
      return [];
    }

    const clientFiltered = scopedByBusiness.filter(slot => {
      const nameMatch = slot.client_name && user?.name &&
        slot.client_name.trim().toLowerCase() === user.name.trim().toLowerCase();
      const phoneMatch = slot.client_phone && user?.phone &&
        slot.client_phone.trim() === user.phone.trim();

      return Boolean(nameMatch || phoneMatch);
    });
    // Additional filter by services of current business
    const serviceFiltered = clientFiltered.filter(slot => {
      if (serviceIdList.length === 0 && serviceNameList.length === 0) return true;
      const sid = slot.service_id ? String(slot.service_id) : '';
      const sname = slot.service_name ? String(slot.service_name).trim().toLowerCase() : '';
      const byId = sid ? serviceIdList.includes(sid) : false;
      const byName = sname ? serviceNameList.includes(sname) : false;
      return byId || byName;
    });
    try { console.log('[AppointmentsDebug] client filtered count=', clientFiltered.length, 'serviceFiltered=', serviceFiltered.length); } catch {}
    return serviceFiltered;
  }, [userAppointments, user?.id, user?.name, user?.phone, user?.user_type, serviceIdList, serviceNameList]);

  // Load barber images and names for appointments
  useEffect(() => {
    const loadBarberImages = async () => {
      const barberIds = Array.from(new Set(verifiedUserAppointments.map(apt => apt.barber_id).filter(Boolean)));
      if (barberIds.length === 0) return;

      const images: Record<string, string> = {};
      const names: Record<string, string> = {};
      await Promise.all(
        barberIds.map(async (barberId) => {
          try {
            const userData = await usersApi.getUserById(barberId);
            if (userData?.image_url) {
              images[barberId] = userData.image_url;
            }
            if (userData?.name) {
              names[barberId] = String(userData.name);
            }
          } catch (error) {
            console.error('Error loading barber image:', error);
          }
        })
      );
      setBarberImages(images);
      setBarberNames(names);
    };

    loadBarberImages();
  }, [verifiedUserAppointments]);

  const getBarberName = React.useCallback((barberId?: string) => {
    if (!barberId) return '';
    return barberNames[barberId] || '';
  }, [barberNames]);
  
  const upcomingAppointments = React.useMemo(() => {
    return verifiedUserAppointments.filter(slot => {
      const timeString = slot.slot_time ? String(slot.slot_time) : '00:00';
      const [hh = '00', mm = '00'] = timeString.split(':');
      const appointmentDateTime = new Date(`${slot.slot_date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`);
      return appointmentDateTime.getTime() >= Date.now();
    });
  }, [verifiedUserAppointments]);
  
  const pastAppointments = React.useMemo(() => {
    return verifiedUserAppointments.filter(slot => {
      const timeString = slot.slot_time ? String(slot.slot_time) : '00:00';
      const [hh = '00', mm = '00'] = timeString.split(':');
      const appointmentDateTime = new Date(`${slot.slot_date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`);
      return appointmentDateTime.getTime() < Date.now();
    });
  }, [verifiedUserAppointments]);

  // Determine next (closest) upcoming appointment
  const nextAppointment = React.useMemo(() => {
    if (upcomingAppointments.length === 0) return null;
    const withDateTime = upcomingAppointments.map(a => ({
      item: a,
      dateTime: new Date(`${a.slot_date}T${(a.slot_time || '00:00')}`),
    }));
    withDateTime.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    return withDateTime[0].item;
  }, [upcomingAppointments]);

  // Exclude next appointment from the list to avoid duplication in the card + list
  const displayedUpcomingAppointments = React.useMemo(() => {
    // Always use the same narrow list style; do not exclude any appointment
    return upcomingAppointments;
  }, [upcomingAppointments, nextAppointment]);

  // Group appointments by date
  const groupAppointmentsByDate = React.useCallback((appointments: AvailableTimeSlot[]) => {
    const grouped: { [key: string]: AvailableTimeSlot[] } = {};
    
    appointments.forEach(appointment => {
      const dateKey = appointment.slot_date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(appointment);
    });
    
    // Sort dates and appointments within each date
    const sortedDates = Object.keys(grouped).sort();
    const sortedGroups: { date: string; appointments: AvailableTimeSlot[] }[] = [];
    
    sortedDates.forEach(date => {
      const sortedAppointments = grouped[date].sort((a, b) => {
        const timeA = a.slot_time || '00:00';
        const timeB = b.slot_time || '00:00';
        return timeA.localeCompare(timeB);
      });
      sortedGroups.push({ date, appointments: sortedAppointments });
    });
    
    return sortedGroups;
  }, []);

  const currentAppointments = activeTab === 'upcoming' ? displayedUpcomingAppointments : pastAppointments;
  const groupedAppointments = groupAppointmentsByDate(currentAppointments);

  // Debug: log each displayed appointment's business_id vs current app business_id
  useEffect(() => {
    try {
      const currentBusinessId = String(getBusinessId());
      (currentAppointments || []).forEach((a) => {
        const bid = String((a as any).business_id);
        console.log('[AppointmentsDebug] item business_id check', {
          id: (a as any).id,
          business_id: bid,
          matches: bid === currentBusinessId,
          date: a.slot_date,
          time: a.slot_time,
        });
      });
    } catch (e) {
      console.log('[AppointmentsDebug] error while logging per-item business ids', e);
    }
  }, [currentAppointments, activeTab]);

  // Date Header Component
  const DateHeader: React.FC<{ date: string; forceFull?: boolean }> = React.useCallback(({ date, forceFull = false }) => {
    const dateObj = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const isToday = dateObj.toDateString() === today.toDateString();
    const isTomorrow = dateObj.toDateString() === tomorrow.toDateString();

    let dateText = '';
    if (!forceFull && isToday) {
      dateText = 'Today';
    } else if (!forceFull && isTomorrow) {
      dateText = 'Tomorrow';
    } else {
      dateText = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }

    return (
      <View style={styles.dateHeaderContainer}>
        <Text style={styles.dateHeaderText}>{dateText}</Text>
        <View style={styles.dateHeaderLine} />
      </View>
    );
  }, []);

  // Small calendar-like date pill (e.g., JUN / 20)
  const DatePill: React.FC<{ date: string }> = React.useCallback(({ date }) => {
    const d = new Date(date);
    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = String(d.getDate());
    return (
      <View style={styles.datePill}>
        <Text style={styles.datePillMonth}>{month}</Text>
        <View style={styles.datePillDivider} />
        <Text style={styles.datePillDay}>{day}</Text>
      </View>
    );
  }, []);

  // Barber Avatar Component
  const BarberAvatar: React.FC<{ barberId?: string; size?: number }> = React.useCallback(({ barberId, size = 36 }) => {
    if (!barberId) return null;
    
    const imageUrl = barberImages[barberId];
    
    return (
      <View style={[styles.barberAvatarContainer, { width: size, height: size }]}>
        <LinearGradient
          colors={["#000000", "#333333"]}
          style={[styles.barberAvatarGradient, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <View style={[styles.barberAvatar, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }]}>
            {imageUrl ? (
              <Image 
                source={{ uri: imageUrl }} 
                style={[styles.barberAvatarImage, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }]} 
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="person" size={size * 0.5} color="#666" />
            )}
          </View>
        </LinearGradient>
      </View>
    );
  }, [barberImages]);

  // Hero card component for the next appointment so it can be embedded in scrollable content
  const NextAppointmentHero: React.FC = React.useCallback(() => {
    if (!(activeTab === 'upcoming' && nextAppointment)) return null;
    return (
      <View style={styles.heroCardContainer}>
        <LinearGradient
          colors={["#FFFFFF", "#FAFAFA"]}
          style={styles.heroCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroCardOverlay} />
          
          <View style={styles.heroContent}>
            {/* Barber Avatar in top right corner */}
            <View style={styles.heroBarberAvatarContainer}>
              <BarberAvatar barberId={nextAppointment!.barber_id} size={48} />
            </View>
            
            {/* Cancel button in top left corner */}
            <TouchableOpacity
              style={styles.heroCancelButtonTopLeft}
              onPress={() => handleCancelAppointment(nextAppointment!)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={16} color="#FF3B30" />
              <Text style={styles.heroCancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            {/* Location removed for client cards per request */}

            <Text style={styles.heroServiceNameNext}>{nextAppointment!.service_name || 'Service'}</Text>

            {/* Admin: client info remains */}
            {user?.user_type === 'admin' && nextAppointment!.client_name && (
              <View style={styles.heroLocationRow}>
                <Text style={styles.heroLocationText}>
                  {nextAppointment!.client_name}
                  {nextAppointment!.client_phone && ` • ${nextAppointment!.client_phone}`}
                </Text>
                <View style={styles.heroLocationIcon}>
                  <Ionicons name="person" size={12} color="#000000" />
                </View>
              </View>
            )}

            {/* Worker under service for clients */}
            {user?.user_type !== 'admin' && nextAppointment?.barber_id ? (
              <View style={styles.heroLocationRow}>
                <View style={styles.heroLocationIcon}>
                  <Ionicons name="person" size={12} color="#000000" />
                </View>
                <Text style={styles.heroLocationText}>{getBarberName(nextAppointment.barber_id)}</Text>
              </View>
            ) : null}

              <View style={styles.heroDetailsContainer}>
                <View style={styles.timeRowAligned}>
                  <View style={styles.timeLeftGroup}>
                    <View style={styles.heroDetailCard}>
                      <Ionicons name="time" size={16} color={colors.primary} />
                      <Text style={styles.heroDetailValue}>{formatTime(nextAppointment!.slot_time)}</Text>
                    </View>
                    {businessAddress ? (
                      <TouchableOpacity style={styles.mapIconButton} onPress={openBusinessLocation} activeOpacity={0.8}>
                        <Ionicons name="location" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <DatePill date={nextAppointment!.slot_date} />
                </View>
              </View>
          </View>
        </LinearGradient>
      </View>
    );
  }, [activeTab, nextAppointment, formatDate, formatTime, handleCancelAppointment, businessAddress, colors.primary]);

  // Handle cancel appointment
  function handleCancelAppointment(appointment: AvailableTimeSlot) {
    setSelectedAppointment(appointment);
    if (isWithinMinCancellationHours(appointment)) {
      setShowLateCancelModal(true);
      return;
    }
    setShowCancelModal(true);
  }

  const confirmCancelAppointment = async () => {
    if (!selectedAppointment) return;

    setIsCanceling(true);
    try {
      const result = await clientAppointmentsApi.cancelAppointment(selectedAppointment.id, minCancellationHours);
      if (result.success) {
        // Remove the canceled appointment from the list
        setUserAppointments(prev => prev.filter(apt => apt.id !== selectedAppointment.id));
        setShowCancelModal(false);
        setSelectedAppointment(null);

        // Create admin notification about the cancellation (target specific assigned barber if available)
        const canceledBy = user?.name || selectedAppointment.client_name || 'Client';
        const canceledPhone = user?.phone || selectedAppointment.client_phone || '';
        const serviceName = selectedAppointment.service_name || 'Service';
        const date = selectedAppointment.slot_date;
        const time = selectedAppointment.slot_time;
        const title = 'Appointment Cancellation';
        const content = `${canceledBy} (${canceledPhone}) canceled an appointment for "${serviceName}" on ${date} at ${time}`;
        // If the appointment has a specific barber/admin, notify only them
        const assignedAdminId = (selectedAppointment as any)?.barber_id || (selectedAppointment as any)?.user_id;
        if (assignedAdminId) {
          notificationsApi.createAdminNotificationForUserId(String(assignedAdminId), title, content, 'system').catch(() => {});
        } else {
          // Fallback: notify all admins
          notificationsApi.createAdminNotification(title, content, 'system').catch(() => {});
        }
      } else {
        Alert.alert('Cannot Cancel Appointment', result.error || 'Unable to cancel the appointment. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while cancelling. Please try again.');
    } finally {
      setIsCanceling(false);
    }
  };

  const renderAppointment = React.useCallback(({ item }: { item: AvailableTimeSlot }) => {
    if (activeTab === 'past') {
      return (
        <View style={styles.heroCardContainer}>
          <LinearGradient
            colors={["#FFFFFF", "#FAFAFA"]}
            style={styles.heroCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.heroCardOverlay} />
            
            <View style={styles.heroContent}>
              {/* Barber Avatar in top right corner for history cards */}
              <View style={styles.heroBarberAvatarContainer}>
                <BarberAvatar barberId={item.barber_id} size={48} />
              </View>
              <View style={styles.regularHeader}>
                <View style={styles.pastBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                  <Text style={styles.pastBadgeText}>Completed</Text>
                </View>
                <View style={styles.regularHeaderRight} />
              </View>

              {/* Location removed for client cards per request */}

              <Text style={styles.heroServiceName}>{item.service_name || 'Service'}</Text>

              {/* Admin: client info remains */}
              {user?.user_type === 'admin' && item.client_name && (
                <View style={styles.heroLocationRow}>
                  <Text style={styles.heroLocationText}>
                    {item.client_name}
                    {item.client_phone && ` • ${item.client_phone}`}
                  </Text>
                  <View style={styles.heroLocationIcon}>
                    <Ionicons name="person" size={12} color="#000000" />
                  </View>
                </View>
              )}

              {/* Worker under service (client view) */}
              {user?.user_type !== 'admin' && item?.barber_id ? (
                <View style={styles.heroLocationRow}>
                  <View style={styles.heroLocationIcon}>
                    <Ionicons name="person" size={12} color="#000000" />
                  </View>
                  <Text style={styles.heroLocationText}>{getBarberName(item.barber_id)}</Text>
                </View>
              ) : null}

              <View style={styles.heroDetailsContainer}>
                <View style={styles.timeRowAligned}>
                  <View style={styles.timeLeftGroup}>
                    <View style={styles.heroDetailCard}>
                      <Ionicons name="time" size={16} color={colors.primary} />
                      <Text style={styles.heroDetailValue}>{formatTime(item.slot_time)}</Text>
                    </View>
                    {businessAddress ? (
                      <TouchableOpacity style={styles.mapIconButton} onPress={openBusinessLocation} activeOpacity={0.8}>
                        <Ionicons name="location" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <DatePill date={item.slot_date} />
                </View>
              </View>
            </View>
          </LinearGradient>
        </View>
      );
    }

    // Upcoming appointments: modern card design
    return (
      <View style={styles.heroCardContainer}>
        <LinearGradient
          colors={["#FFFFFF", "#FAFAFA"]}
          style={styles.heroCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroCardOverlay} />
          
          <View style={styles.heroContent}>
            {/* Barber Avatar in top right corner */}
            <View style={styles.heroBarberAvatarContainer}>
              <BarberAvatar barberId={item.barber_id} size={48} />
            </View>
            
            {/* Cancel button in top left corner */}
            <TouchableOpacity
              style={styles.heroCancelButtonTopLeft}
              onPress={() => handleCancelAppointment(item)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={16} color="#FF3B30" />
              <Text style={styles.heroCancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            {/* Location removed for client cards per request */}

            <Text style={styles.heroServiceNameNext}>{item.service_name || 'Service'}</Text>

            {/* Admin: client info remains */}
            {user?.user_type === 'admin' && item.client_name && (
              <View style={styles.heroLocationRow}>
                <Text style={styles.heroLocationText}>
                  {item.client_name}
                  {item.client_phone && ` • ${item.client_phone}`}
                </Text>
                <View style={styles.heroLocationIcon}>
                  <Ionicons name="person" size={12} color="#000000" />
                </View>
              </View>
            )}

            {/* Worker under service for clients */}
            {user?.user_type !== 'admin' && item?.barber_id ? (
              <View style={styles.heroLocationRow}>
                <View style={styles.heroLocationIcon}>
                  <Ionicons name="person" size={12} color="#000000" />
                </View>
                <Text style={styles.heroLocationText}>{getBarberName(item.barber_id)}</Text>
              </View>
            ) : null}

            <View style={styles.heroDetailsContainer}>
              <View style={styles.timeRowAligned}>
                <View style={styles.timeLeftGroup}>
                  <View style={styles.heroDetailCard}>
                    <Ionicons name="time" size={16} color={colors.primary} />
                    <Text style={styles.heroDetailValue}>{formatTime(item.slot_time)}</Text>
                  </View>
                  {businessAddress ? (
                    <TouchableOpacity style={styles.mapIconButton} onPress={openBusinessLocation} activeOpacity={0.8}>
                      <Ionicons name="location" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <DatePill date={item.slot_date} />
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }, [formatDate, formatTime, activeTab, handleCancelAppointment, businessAddress, colors.primary]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={{ width: 22 }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>
              {user?.user_type === 'admin' ? 'My Schedule' : 'My Appointments'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {user?.user_type === 'admin' ? 'Your appointments as a barber' : 'Upcoming and past appointments'}
            </Text>
          </View>
          <View style={{ width: 22 }} />
        </View>
      </View>

      <View style={styles.container}>
        <View style={styles.toggleContainer}>
          <View style={styles.toggleWrapper}>
            <TouchableOpacity 
              style={[
                styles.toggleBtn,
                activeTab === 'upcoming' && {
                  ...styles.toggleBtnActive,
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                }
              ]}
              onPress={() => setActiveTab('upcoming')}
              activeOpacity={0.7}
            >
              <View style={[
                styles.toggleBadge,
                { backgroundColor: activeTab === 'upcoming' ? 'rgba(255,255,255,0.3)' : colors.primary }
              ]}>
                <Text style={[
                  styles.toggleBadgeText,
                  { color: '#FFFFFF' }
                ]}>
                  {upcomingAppointments.length}
                </Text>
              </View>
              <Text style={[
                styles.toggleText, 
                activeTab === 'upcoming' && styles.toggleTextActive
              ]}>
                Upcoming
              </Text>
              <Ionicons 
                name="calendar-outline" 
                size={18} 
                color={activeTab === 'upcoming' ? '#FFFFFF' : '#8E8E93'} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.toggleBtn,
                activeTab === 'past' && {
                  ...styles.toggleBtnActive,
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                }
              ]}
              onPress={() => setActiveTab('past')}
              activeOpacity={0.7}
            >
              <View style={[
                styles.toggleBadge,
                { backgroundColor: activeTab === 'past' ? 'rgba(255,255,255,0.3)' : colors.primary }
              ]}>
                <Text style={[
                  styles.toggleBadgeText,
                  { color: '#FFFFFF' }
                ]}>
                  {pastAppointments.length}
                </Text>
              </View>
              <Text style={[
                styles.toggleText, 
                activeTab === 'past' && styles.toggleTextActive
              ]}>
                History
              </Text>
              <Ionicons 
                name="checkmark-done-circle-outline" 
                size={18} 
                color={activeTab === 'past' ? '#FFFFFF' : '#8E8E93'} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Include the hero card within refreshable content (below) */}

        {isLoading ? (
          <ScrollView
            contentContainerStyle={styles.loadingContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors.primary]}
                tintColor={Colors.primary}
                title="Updating appointments..."
                titleColor={Colors.primary}
              />
            }
          >
            <ActivityIndicator size="large" color={Colors.primary} style={{ alignSelf: 'center' }} />
            <Text style={styles.loadingText}>
              {user?.user_type === 'admin' ? 'Loading your schedule...' : 'Loading your appointments...'}
            </Text>
            <Text style={styles.loadingSubtext}>
              {user?.user_type === 'admin' 
                ? (user?.name ? `Loading appointments for barber ${user.name}` : 'Loading appointments...')
                : (user?.name ? `Searching appointments for ${user.name}` : 'Searching appointments...')
              }
            </Text>
          </ScrollView>
        ) : groupedAppointments.length > 0 ? (
          <FlatList
            data={groupedAppointments}
            renderItem={({ item: group }) => {
              const omitHeader = false;
              return (
                <View>
                  {!omitHeader && <DateHeader date={group.date} forceFull={activeTab === 'past'} />}
                  {group.appointments.map((appointment) => (
                    <View key={`${appointment.id}-${appointment.slot_date}-${appointment.slot_time}`}>
                      {renderAppointment({ item: appointment })}
                    </View>
                  ))}
                </View>
              );
            }}
            keyExtractor={(item) => item.date}
            contentContainerStyle={styles.appointmentsList}
            ListHeaderComponent={undefined}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            maxToRenderPerBatch={3}
            windowSize={3}
            initialNumToRender={2}
            updateCellsBatchingPeriod={100}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors.primary]}
                tintColor={Colors.primary}
                title="Updating appointments..."
                titleColor={Colors.primary}
              />
            }
          />
        ) : (
            <ScrollView
              contentContainerStyle={styles.emptyState}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[Colors.primary]}
                  tintColor={Colors.primary}
                  title="Updating appointments..."
                  titleColor={Colors.primary}
                />
              }
            >
              <Ionicons 
                name="calendar-outline" 
                size={64} 
                color={Colors.subtext} 
                style={styles.emptyIcon}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'upcoming' 
                  ? (user?.user_type === 'admin' ? 'No upcoming appointments' : 'No upcoming appointments')
                  : (user?.user_type === 'admin' ? 'No past appointments' : 'No past appointments')}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'upcoming' 
                  ? (user?.user_type === 'admin' ? 'Your upcoming appointments will appear here' : 'Your upcoming appointments will appear here')
                  : (user?.user_type === 'admin' ? 'Appointments you handled will appear here' : 'Your past appointments will appear here')}
              </Text>
            </ScrollView>
        )}
      </View>

      {/* Cancel Appointment Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showCancelModal}
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.cancelModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cancel Appointment</Text>
              <Text style={styles.modalMessage}>
                Would you like to cancel your appointment?
              </Text>
              {selectedAppointment && (
                <View style={styles.appointmentChips}>
                  <View style={styles.chip}>
                    <Ionicons name="calendar" size={14} color={colors.primary} style={styles.chipIcon} />
                    <Text style={styles.chipText}>{formatDate(selectedAppointment.slot_date)}</Text>
                  </View>
                  {Boolean(selectedAppointment.slot_time) && (
                    <View style={styles.chip}>
                      <Ionicons name="time-outline" size={14} color={colors.primary} style={styles.chipIcon} />
                      <Text style={styles.chipText}>{formatTime(selectedAppointment.slot_time)}</Text>
                    </View>
                  )}
                  {Boolean(selectedAppointment.service_name) && (
                    <View style={styles.chip}>
                      <Ionicons name="pricetag" size={14} color={colors.primary} style={styles.chipIcon} />
                      <Text style={styles.chipText}>{selectedAppointment.service_name}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => setShowCancelModal(false)}
                disabled={isCanceling}
              >
                <Text style={styles.cancelModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={confirmCancelAppointment}
                disabled={isCanceling}
              >
                {isCanceling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmModalButtonText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Late-cancel blocked Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showLateCancelModal}
        onRequestClose={() => setShowLateCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.iosModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cannot Cancel Appointment</Text>
              <Text style={styles.modalMessage}>
                Appointments can be canceled up to {minCancellationHours} hours before the time. For short notice cancellations, please contact the manager.
              </Text>
              {selectedAppointment && (
                <View style={styles.appointmentChips}>
                  <View style={styles.chip}>
                    <Ionicons name="calendar" size={14} color={colors.primary} style={styles.chipIcon} />
                    <Text style={styles.chipText}>{formatDate(selectedAppointment.slot_date)}</Text>
                  </View>
                  {Boolean(selectedAppointment.slot_time) && (
                    <View style={styles.chip}>
                      <Ionicons name="time-outline" size={14} color={colors.primary} style={styles.chipIcon} />
                      <Text style={styles.chipText}>{formatTime(selectedAppointment.slot_time)}</Text>
                    </View>
                  )}
                  {Boolean(selectedAppointment.service_name) && (
                    <View style={styles.chip}>
                      <Ionicons name="pricetag" size={14} color={colors.primary} style={styles.chipIcon} />
                      <Text style={styles.chipText}>{selectedAppointment.service_name}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => setShowLateCancelModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelModalButtonText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.whatsappButton]}
                onPress={() => {
                  const apt = selectedAppointment;
                  const msg = apt
                    ? `Hi, I would like to cancel the appointment set for ${formatDate(apt.slot_date)} at ${formatTime(apt.slot_time)} for \"${apt.service_name || 'Service'}\". Can you help?`
                    : 'Hi, I need help cancelling an appointment on short notice.';
                  contactManagerOnWhatsApp(msg);
                  setShowLateCancelModal(false);
                }}
                activeOpacity={0.9}
              >
                <View style={styles.whatsappButtonRow}>
                  <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={styles.whatsappButtonIcon} />
                  <Text style={styles.whatsappButtonText}>Send Message</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create<any>({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  header: {
    height: 104,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: Colors.white,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: {
    width: 44,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.subtext,
    marginTop: 6,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  loadingContainerWithHero: {
    flexGrow: 1,
    alignItems: 'stretch',
  },
  loadingText: {
    fontSize: 17,
    color: '#8E8E93',
    marginTop: 16,
    fontWeight: '400',
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
    fontWeight: '400',
  },
  toggleContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  toggleWrapper: {
    flexDirection: 'row',
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
    borderRadius: 25,
    padding: 4,
    width: '85%',
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 21,
    gap: 8,
  },
  toggleBtnActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: -0.3,
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  toggleBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  toggleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  appointmentsList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  appointmentCard: {
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  cardGradient: {
    borderRadius: 24,
  },
  cardContent: {
    padding: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  serviceInfo: {
    flex: 1,
    alignItems: 'flex-start',
  },
  serviceName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'left',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: -0.2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  appointmentDetails: {
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  detailContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  detailText: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: '600',
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  cardFooter: {
    marginTop: 20,
    alignItems: 'flex-start',
  },
  priorityIndicator: {
    width: 60,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },

  emptyState: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyStateWithHero: {
    flexGrow: 1,
    alignItems: 'stretch',
  },
    afterHeroSpacer: {
      height: 16,
    },
  emptyIcon: {
    marginTop: 20,
    marginBottom: 10,
    opacity: 0.6,
    alignSelf: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 17,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },
  // Hero card styles (next appointment)
  heroCardContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    marginTop: 14,
  },
  heroCard: {
    borderRadius: 20,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  heroCardOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 100,
    height: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 50,
    transform: [{ translateX: 30 }, { translateY: -30 }],
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'flex-start',
  },
  heroHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  heroTypeIndicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(142, 142, 147, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
    marginRight: -6,
  },
  heroTypeIndicatorAbsolute: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(142, 142, 147, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  heroCancelButtonTopLeft: {
    position: 'absolute',
    top: -6,
    left: -6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  heroCancelButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF3B30',
  },
    nextCancelButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,59,48,0.08)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 14,
    },
    nextCancelText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FF3B30',
    },
  heroServiceName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'left',
    letterSpacing: -0.4,
    marginTop: 8,
    marginBottom: 4,
  },
  heroServiceNameNext: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'left',
    letterSpacing: -0.4,
    marginBottom: 4,
    marginTop: 36,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  heroLocationIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLocationText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    lineHeight: 18,
    textAlign: 'left',
  },
  heroDetailsContainer: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: 8,
  },
  timeRowAligned: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  timeLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  heroDetailCard: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  heroDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'left',
  },

  // Date pill styles
  datePill: {
    width: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  datePillDivider: {
    width: '85%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 5,
  },
  datePillMonth: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2C2C2E',
    opacity: 0.9,
  },
  datePillDay: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2C2C2E',
    marginTop: 2,
  },

  // Regular appointment card styles
  regularHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  upcomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  upcomingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  pastBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pastBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34C759',
  },
  regularTypeIndicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(142, 142, 147, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  regularCancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  regularFooter: {
    marginTop: 16,
    alignItems: 'flex-start',
  },
  regularStatusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  regularStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  regularStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  loadMoreButton: {
    marginTop: 20,
    backgroundColor: '#000000',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Cancel button styles
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF3B30',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  iosModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  policyBadge: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  policyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000000',
  },
  modalIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,59,48,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appointmentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipIcon: {
    marginLeft: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  cancelModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  appointmentSummary: {
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#1C1C1E',
    textAlign: 'center',
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalButton: {
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  confirmModalButton: {
    backgroundColor: '#FF3B30',
  },
  cancelModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
  },
  confirmModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  whatsappButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  whatsappButtonIcon: {
    marginTop: 1,
  },
  whatsappButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Barber Avatar Styles
  barberAvatarContainer: {
    position: 'relative',
  },
  barberAvatarGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  barberAvatar: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  barberAvatarImage: {
    width: '100%',
    height: '100%',
  },
  heroBarberAvatarContainer: {
    position: 'absolute',
    top: -12,
    right: -12,
    zIndex: 3,
  },
  regularHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  // Date Header Styles
  dateHeaderContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: 16,
    marginVertical: 16,
    marginBottom: 8,
  },
  dateHeaderText: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1C1C1E',
    marginRight: 12,
    letterSpacing: -0.3,
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
});