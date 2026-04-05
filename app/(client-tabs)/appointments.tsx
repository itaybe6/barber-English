import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, Alert, Modal, RefreshControl, Linking, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { AvailableTimeSlot } from '@/lib/supabase';
import { supabase, getBusinessId } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { checkWaitlistAndNotify } from '@/lib/api/waitlistNotifications';
import { notificationsApi } from '@/lib/api/notifications';
import { businessProfileApi, isClientSwapEnabled } from '@/lib/api/businessProfile';
import { usersApi } from '@/lib/api/users';
import { servicesApi } from '@/lib/api/services';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import SwapRequestModal from '@/components/SwapRequestModal';
import { toBcp47Locale } from '@/lib/i18nLocale';

type TabType = 'upcoming' | 'past';

// API functions for client appointments
const clientAppointmentsApi = {
  // Get user appointments for multiple dates (most efficient for user appointments)
  async getUserAppointmentsForMultipleDates(dates: string[], userName?: string, userPhone?: string, currentUserId?: string): Promise<AvailableTimeSlot[]> {
    try {
      const businessId = getBusinessId();
      let query = supabase
        .from('appointments')
        .select('id, slot_date, slot_time, client_name, client_phone, service_name, barber_id, status, is_available, business_id, user_id, created_at')
        .in('slot_date', dates)
        .eq('business_id', businessId)
        .eq('is_available', false);

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
  async cancelAppointment(
    slotId: string,
    minCancellationHours: number,
    auth?: { callerPhone?: string | null; callerUserId?: string | null; isAdmin?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const businessId = getBusinessId();

      const { data: appointmentData, error: fetchError } = await supabase
        .from('appointments')
        .select('id, slot_date, slot_time, client_name, client_phone, service_name, barber_id, status, is_available, business_id, user_id')
        .eq('id', slotId)
        .eq('business_id', businessId)
        .single();

      if (fetchError || !appointmentData) {
        console.error('Error fetching appointment before cancellation:', fetchError);
        return { success: false, error: 'Failed to fetch appointment details' };
      }

      if (appointmentData.status === 'cancelled') {
        return { success: false, error: 'Appointment already cancelled' };
      }

      if (appointmentData.is_available === true) {
        return { success: false, error: 'Appointment is not active' };
      }

      if (!auth?.isAdmin) {
        const phone = String(auth?.callerPhone || '').trim();
        const rowPhone = String(appointmentData.client_phone || '').trim();
        const phoneOk = phone.length > 0 && rowPhone === phone;
        const userOk =
          !!auth?.callerUserId &&
          !!appointmentData.user_id &&
          String(appointmentData.user_id) === String(auth.callerUserId);
        if (!phoneOk && !userOk) {
          return { success: false, error: 'Not authorized to cancel this appointment' };
        }
      }

      // Note: Cancellation time validation is already done in the component
      // before calling this function, so we skip the validation here

      // status=cancelled is used for analytics (e.g. monthly cancelled count). Free the slot for rebooking.
      const { data: updated, error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          is_available: true,
          client_name: null,
          client_phone: null,
          service_name: 'Available Slot',
          client_reminder_sent_at: null,
          admin_reminder_sent_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', slotId)
        .eq('business_id', businessId)
        .select('id, status')
        .maybeSingle();

      if (error) {
        console.error('Error canceling appointment:', error);
        return { success: false, error: 'Failed to cancel appointment' };
      }
      if (!updated || updated.status !== 'cancelled') {
        console.error('Cancel appointment: update did not persist cancelled status', { slotId, updated });
        return { success: false, error: 'Failed to cancel appointment' };
      }

      if (appointmentData) {
        await checkWaitlistAndNotify(appointmentData);
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
  const { t, i18n } = useTranslation();
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
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapAppointment, setSwapAppointment] = useState<AvailableTimeSlot | null>(null);
  const [clientSwapEnabled, setClientSwapEnabled] = useState(true);

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
        setClientSwapEnabled(isClientSwapEnabled(profile));
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
    const minHours = minCancellationHours ?? 24;
    if (minHours <= 0) return false;
    return hours < minHours;
  }, [minCancellationHours]);

  // Open WhatsApp chat with manager
  const contactManagerOnWhatsApp = useCallback(async (message: string) => {
    if (!managerPhone) {
      Alert.alert(t('error.generic', 'Error'), t('appointments.managerPhoneUnavailable', 'Manager phone number is currently unavailable'));
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
      Alert.alert(t('error.generic', 'Error'), t('appointments.whatsappOpenFailed', 'WhatsApp cannot be opened on this device'));
    }
  }, [managerPhone]);

  // Open business location in maps
  const openBusinessLocation = useCallback(async () => {
    if (!businessAddress) {
      Alert.alert(t('appointments.addressUnavailable', 'Address unavailable'), t('appointments.addressUnavailableMessage', 'Business address is not available right now.'));
      return;
    }
    const encoded = encodeURIComponent(businessAddress);
    const url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert(t('error.generic', 'Error'), t('appointments.mapsOpenFailed', 'Unable to open maps on this device'));
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

    const today = new Date();
    const dates: string[] = [];
    
    // Load past 7 days and next N days according to booking window
    let horizonDays = 14;
    try {
      horizonDays = await businessProfileApi.getMaxBookingOpenDaysAcrossBusiness();
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

  const onRefresh = useCallback(async () => {
    try {
      const profile = await businessProfileApi.getProfile();
      if (profile?.address) setBusinessAddress(String(profile.address));
      if (profile?.min_cancellation_hours !== undefined) {
        setMinCancellationHours(profile.min_cancellation_hours);
      }
      setClientSwapEnabled(isClientSwapEnabled(profile));
    } catch {
      // keep previous policy values
    }
    loadUserAppointments(true);
  }, [loadUserAppointments]);

  const appLocale = toBcp47Locale(i18n?.language);
  const formatDate = React.useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(appLocale as any, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }, [appLocale]);

  const formatTime = React.useCallback((timeString: string) => {
    return formatTime12Hour(timeString);
  }, []);

  const formatCompactDate = React.useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(appLocale as any, {
      day: 'numeric',
      month: 'short',
    });
  }, [appLocale]);

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
      dateText = t('today', 'Today');
    } else if (!forceFull && isTomorrow) {
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
        <Text style={styles.dateHeaderText}>{dateText}</Text>
        <View style={styles.dateHeaderLine} />
      </View>
    );
  }, [t, appLocale]);

  // Small calendar-like date pill (e.g., JUN / 20)
  const DatePill: React.FC<{ date: string }> = React.useCallback(({ date }) => {
    const d = new Date(date);
    const month = d.toLocaleString(appLocale as any, { month: 'short' }).toUpperCase();
    const day = String(d.getDate());
    return (
      <View style={styles.datePill}>
        <Text style={styles.datePillMonth}>{month}</Text>
        <View style={styles.datePillDivider} />
        <Text style={styles.datePillDay}>{day}</Text>
      </View>
    );
  }, [appLocale]);

  // Barber Avatar Component — premium large avatar with colored ring + glow
  const BarberAvatar: React.FC<{ barberId?: string; size?: number }> = React.useCallback(({ barberId, size = 72 }) => {
    const imageUrl = barberId ? barberImages[barberId] : undefined;
    const ringSize = size + 4;
    const hasImage = Boolean(imageUrl);

    return (
      <View
        style={[
          styles.barberAvatarRing,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: hasImage ? colors.primary : 'rgba(142,142,147,0.25)',
            shadowColor: hasImage ? colors.primary : '#000',
            shadowOpacity: hasImage ? 0.18 : 0.08,
          },
        ]}
      >
        <View
          style={[
            styles.barberAvatarInner,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: size, height: size, borderRadius: size / 2 }}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.barberAvatarFallback, { borderRadius: size / 2 }]}>
              <Ionicons name="person" size={size * 0.42} color="#AAA" />
            </View>
          )}
        </View>
      </View>
    );
  }, [barberImages, colors.primary]);

  // Hero card — reuses the same premium card style as renderAppointment
  const NextAppointmentHero: React.FC = React.useCallback(() => {
    if (!(activeTab === 'upcoming' && nextAppointment)) return null;
    return renderAppointment({ item: nextAppointment! });
  }, [activeTab, nextAppointment, renderAppointment]);

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
      const result = await clientAppointmentsApi.cancelAppointment(selectedAppointment.id, minCancellationHours, {
        callerPhone: user?.phone,
        callerUserId: user?.id,
        isAdmin: user?.user_type === 'admin',
      });
      if (result.success) {
        // Remove the canceled appointment from the list
        setUserAppointments(prev => prev.filter(apt => apt.id !== selectedAppointment.id));
        setShowCancelModal(false);
        setSelectedAppointment(null);

        // Create admin notification about the cancellation (target specific assigned barber if available)
        const canceledBy = user?.name || selectedAppointment.client_name || t('common.client', 'Client');
        const canceledPhone = user?.phone || selectedAppointment.client_phone || '';
        const serviceName = selectedAppointment.service_name || t('booking.field.service', 'Service');
        const date = selectedAppointment.slot_date;
        const time = selectedAppointment.slot_time;
        const title = t('appointments.cancelled.title', 'Appointment Cancellation');
        const content = t('appointments.cancelled.content', '{{name}} ({{phone}}) canceled an appointment for "{{service}}" on {{date}} at {{time}}', { name: canceledBy, phone: canceledPhone, service: serviceName, date, time });
        // If the appointment has a specific barber/admin, notify only them
        const assignedAdminId = (selectedAppointment as any)?.barber_id || (selectedAppointment as any)?.user_id;
        if (assignedAdminId) {
          notificationsApi.createAdminNotificationForUserId(String(assignedAdminId), title, content, 'system').catch(() => {});
        } else {
          // Fallback: notify all admins
          notificationsApi.createAdminNotification(title, content, 'system').catch(() => {});
        }

        // In-app notification for the client who canceled (appears under Notifications)
        if (user?.user_type !== 'admin') {
          const clientPhone = (user?.phone || selectedAppointment.client_phone || '').trim();
          const clientName = user?.name || selectedAppointment.client_name || t('common.client', 'Client');
          if (clientPhone) {
            const tHe = i18n.getFixedT('he');
            const slotDate = selectedAppointment.slot_date;
            const dateHebrew = new Date(`${slotDate}T12:00:00`).toLocaleDateString('he-IL', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            const timeRaw = String(selectedAppointment.slot_time || '00:00');
            const [th = '0', tm = '0'] = timeRaw.split(':');
            const timeAt = new Date();
            timeAt.setHours(parseInt(th, 10) || 0, parseInt(tm, 10) || 0, 0, 0);
            const timeHebrew = timeAt.toLocaleTimeString('he-IL', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
            const clientTitle = tHe('appointments.clientCancelled.title', 'התור בוטל');
            const clientContent = tHe(
              'appointments.clientCancelled.content',
              'התור שלך ל־"{{service}}" בתאריך {{date}} בשעה {{time}} בוטל בהצלחה.',
              {
                service: serviceName,
                date: dateHebrew,
                time: timeHebrew,
              }
            );
            notificationsApi
              .createNotification({
                title: clientTitle,
                content: clientContent,
                type: 'general',
                recipient_name: clientName,
                recipient_phone: clientPhone,
                business_id: getBusinessId(),
                appointment_id: selectedAppointment.id,
                ...(user?.id ? { user_id: user.id } : {}),
              })
              .catch(() => {});
          }
        }
      } else {
        Alert.alert(t('appointments.cannotCancel.title', 'Cannot Cancel Appointment'), result.error || t('appointments.cannotCancel.message', 'Unable to cancel the appointment. Please try again.'));
      }
    } catch (error) {
      Alert.alert(t('error.generic', 'Error'), t('appointments.cancelError', 'An error occurred while cancelling. Please try again.'));
    } finally {
      setIsCanceling(false);
    }
  };

  const renderAppointment = React.useCallback(({ item }: { item: AvailableTimeSlot }) => {
    const isPast = activeTab === 'past';
    const statusConfig = (() => {
      if (isPast || item.status === 'completed') {
        return {
          label: t('appointments.completed', 'Completed'),
          color: '#34C759',
          backgroundColor: 'rgba(52,199,89,0.10)',
          borderColor: 'rgba(52,199,89,0.18)',
          icon: 'checkmark-circle' as const,
        };
      }

      switch (item.status) {
        case 'pending':
          return {
            label: t('appointments.pending', 'Pending'),
            color: '#F59E0B',
            backgroundColor: 'rgba(245,158,11,0.10)',
            borderColor: 'rgba(245,158,11,0.18)',
            icon: 'time-outline' as const,
          };
        case 'cancelled':
        case 'no_show':
          return {
            label: t('appointments.cancelled', 'Cancelled'),
            color: '#EF4444',
            backgroundColor: 'rgba(239,68,68,0.10)',
            borderColor: 'rgba(239,68,68,0.18)',
            icon: 'close-circle' as const,
          };
        case 'confirmed':
        default:
          return {
            label: t('appointments.confirmed', 'Confirmed'),
            color: colors.primary,
            backgroundColor: colors.primary + '10',
            borderColor: colors.primary + '1A',
            icon: 'checkmark-done-circle-outline' as const,
          };
      }
    })();

    const secondaryInfo = user?.user_type === 'admin' && item.client_name
      ? `${item.client_name}${item.client_phone ? ` • ${item.client_phone}` : ''}`
      : user?.user_type !== 'admin' && item.barber_id
        ? getBarberName(item.barber_id)
        : '';

    return (
      <View style={styles.apptCardShadow}>
        {/* ── שורה עליונה: אווטאר ימין + שם שירות + נותן שירות ── */}
        <View style={styles.apptCardHeader}>
          {/* אווטאר – ראשון ב־row → ימין ב־RTL */}
          <BarberAvatar barberId={item.barber_id} size={64} />

          <View style={styles.apptCardHeaderContent}>
            <Text style={styles.apptServiceName} numberOfLines={2}>
              {item.service_name || t('booking.field.service', 'Service')}
            </Text>
            {secondaryInfo ? (
              <View style={styles.apptInfoRow}>
                <Ionicons name="person-outline" size={13} color="#8E8E93" />
                <Text style={styles.apptInfoText} numberOfLines={1}>
                  {secondaryInfo}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── שורת צ'יפים + מיקום ── */}
        <View style={styles.apptTopMetaRow}>
          {/* צ'יפים – ראשון ב־row → ימין ב־RTL */}
          <View style={styles.apptCardBadgeRow}>
            <View
              style={[
                styles.apptStatusBadge,
                {
                  backgroundColor: statusConfig.backgroundColor,
                  borderColor: statusConfig.borderColor,
                },
              ]}
            >
              <Ionicons name={statusConfig.icon} size={13} color={statusConfig.color} />
              <Text style={[styles.apptStatusBadgeText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>

            <View
              style={[
                styles.apptMiniDateChip,
                {
                  backgroundColor: colors.primary + '0B',
                  borderColor: colors.primary + '14',
                },
              ]}
            >
              <Ionicons name="calendar-outline" size={12} color={colors.primary} />
              <Text style={[styles.apptMiniDateChipText, { color: colors.primary }]}>
                {formatCompactDate(item.slot_date)}
              </Text>
            </View>
          </View>

          {/* מיקום – אחרון ב־row → שמאל ב־RTL */}
          {businessAddress ? (
            <TouchableOpacity
              style={[styles.apptLocationBtn, { borderColor: colors.primary + '22' }]}
              onPress={openBusinessLocation}
              activeOpacity={0.75}
            >
              <Ionicons name="location-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : <View style={{ width: 42 }} />}
        </View>

        <View style={styles.apptCardDivider} />

        {/* ── שורת כפתורים תחתונה: ביטול | החלף | שעה (RTL) ── */}
        <View style={styles.apptCardFooter}>
          {/* ביטול – ראשון → ימין ב־RTL */}
          {!isPast ? (
            <TouchableOpacity
              style={[styles.apptFooterBtn, styles.apptCancelBtn]}
              onPress={() => handleCancelAppointment(item)}
              activeOpacity={0.78}
            >
              <Ionicons name="close" size={14} color="#FF3B30" />
              <Text style={styles.apptCancelBtnText}>{t('cancel', 'Cancel')}</Text>
            </TouchableOpacity>
          ) : null}

          {/* החלף – שני → אמצע */}
          {!isPast && user?.user_type !== 'admin' && clientSwapEnabled ? (
            <TouchableOpacity
              style={[
                styles.apptFooterBtn,
                styles.apptSwapBtn,
                { borderColor: 'rgba(15,23,42,0.12)' },
              ]}
              onPress={() => {
                setSwapAppointment(item);
                setShowSwapModal(true);
              }}
              activeOpacity={0.78}
            >
              <Ionicons name="swap-horizontal" size={14} color="#3C3C43" />
              <Text style={styles.apptSwapBtnText}>{t('swap.swap', 'Swap')}</Text>
            </TouchableOpacity>
          ) : null}

          {/* שעה – אחרון → שמאל ב־RTL */}
          <View
            style={[
              styles.apptFooterBtn,
              styles.apptTimeBtn,
              {
                backgroundColor: colors.primary + '0D',
                borderColor: colors.primary + '18',
              },
            ]}
          >
            <Text style={[styles.apptTimeBtnText, { color: colors.primary }]}>
              {formatTime(item.slot_time)}
            </Text>
            <Ionicons name="time-outline" size={15} color={colors.primary} />
          </View>
        </View>
      </View>
    );
  }, [formatTime, formatCompactDate, activeTab, handleCancelAppointment, businessAddress, colors.primary, clientSwapEnabled, user?.user_type, t, getBarberName]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>

        {/* ── Page Header ── */}
        <View style={styles.pageHeader}>
          {/* Left: back arrow when in history mode */}
          <View style={styles.pageHeaderSide}>
            {activeTab === 'past' && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => setActiveTab('upcoming')}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Center: title */}
          <Text style={styles.pageTitle}>
            {activeTab === 'past'
              ? t('appointments.history', 'היסטוריה')
              : t('appointments.myAppointments', 'התורים שלי')}
          </Text>

          {/* Right: history icon */}
          <View style={styles.pageHeaderSide}>
            <TouchableOpacity
              style={[
                styles.headerIconBtn,
                activeTab === 'past' && { backgroundColor: colors.primary + '18' },
              ]}
              onPress={() => setActiveTab(activeTab === 'past' ? 'upcoming' : 'past')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'past' ? 'time' : 'time-outline'}
                size={22}
                color={activeTab === 'past' ? colors.primary : '#8E8E93'}
              />
            </TouchableOpacity>
          </View>
        </View>


        {isLoading ? (
          <ScrollView
            contentContainerStyle={styles.loadingContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors.primary]}
                tintColor={Colors.primary}
                title={t('appointments.updating', 'Updating appointments...')}
                titleColor={Colors.primary}
              />
            }
          >
            <ActivityIndicator size="large" color={Colors.primary} style={{ alignSelf: 'center' }} />
            <Text style={styles.loadingText}>
              {user?.user_type === 'admin' ? t('appointments.loadingSchedule', 'Loading your schedule...') : t('appointments.loadingAppointments', 'Loading your appointments...')}
            </Text>
            <Text style={styles.loadingSubtext}>
              {user?.user_type === 'admin' 
                ? (user?.name ? t('appointments.loadingForBarber', 'Loading appointments for barber {{name}}', { name: user.name }) : t('appointments.loading', 'Loading appointments...'))
                : (user?.name ? t('appointments.searchingForClient', 'Searching appointments for {{name}}', { name: user.name }) : t('appointments.searching', 'Searching appointments...'))
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
                title={t('appointments.updating', 'Updating appointments...')}
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
              />
            }
          >
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + '12' }]}>
              <Ionicons
                name={activeTab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
                size={42}
                color={colors.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === 'upcoming'
                ? t('appointments.empty.upcoming', 'אין תורים קרובים')
                : t('appointments.empty.past', 'אין תורים קודמים')}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'upcoming'
                ? t('appointments.emptySubtitle.upcoming', 'התורים הקרובים שלך יופיעו כאן')
                : t('appointments.emptySubtitle.past', 'התורים הקודמים שלך יופיעו כאן')}
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
              <Text style={styles.modalTitle}>{t('appointments.cancel.title', 'Cancel Appointment')}</Text>
              <Text style={styles.modalMessage}>
                {t('appointments.cancel.message', 'Would you like to cancel your appointment?')}
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
                <Text style={styles.cancelModalButtonText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={confirmCancelAppointment}
                disabled={isCanceling}
              >
                {isCanceling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmModalButtonText}>{t('confirm', 'Confirm')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Swap Request Modal */}
      <SwapRequestModal
        visible={showSwapModal}
        appointment={swapAppointment}
        userPhone={user?.phone || ''}
        userName={user?.name}
        onClose={() => {
          setShowSwapModal(false);
          setSwapAppointment(null);
        }}
        onSuccess={() => {
          setShowSwapModal(false);
          setSwapAppointment(null);
        }}
      />

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
              <Text style={styles.modalTitle}>{t('appointments.lateCancel.title', 'Cannot Cancel Appointment')}</Text>
              <Text style={styles.modalMessage}>
                {t('appointments.lateCancel.message', 'Appointments can be canceled up to {{hours}} hours before the time. For short notice cancellations, please contact the manager.', { hours: minCancellationHours })}
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
                <Text style={styles.cancelModalButtonText}>{t('close', 'Close')}</Text>
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
                  <Text style={styles.whatsappButtonText}>{t('appointments.sendMessage', 'Send Message')}</Text>
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
    backgroundColor: '#F2F2F7',
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
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
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  pageHeaderSide: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.5,
    textAlign: 'center',
    flex: 1,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countChipRow: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    paddingTop: 2,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  countChipText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
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
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 120,
  },
  emptyStateWithHero: {
    flexGrow: 1,
    alignItems: 'stretch',
  },
    afterHeroSpacer: {
      height: 16,
    },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
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
  // ─── Premium Appointment Card ────────────────────────────────────────────
  apptCardShadow: {
    marginBottom: 16,
    marginTop: 4,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
    padding: 20,
  },
  apptCardHeader: {
    // row + RTL → first child (avatar) lands on the RIGHT
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  apptCardHeaderContent: {
    flexShrink: 1,
    alignItems: 'flex-start',
    gap: 3,
  },
  apptTopMetaRow: {
    // row + RTL → badges (first) RIGHT, location (last) LEFT
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 2,
  },
  apptCardBadgeRow: {
    // row + RTL → status (first) rightmost, date second
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  apptCardBlobLarge: {
    position: 'absolute',
    top: -35,
    right: -35,
    width: 155,
    height: 155,
    borderRadius: 78,
    zIndex: 0,
  },
  apptCardBlobSmall: {
    position: 'absolute',
    bottom: -15,
    left: -15,
    width: 85,
    height: 85,
    borderRadius: 43,
    zIndex: 0,
  },
  apptCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    zIndex: 1,
  },
  apptCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  apptCancelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,59,48,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.18)',
  },
  apptCancelPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF3B30',
  },
  apptSwapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  apptSwapPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  apptCompletedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(52,199,89,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.20)',
  },
  apptCompletedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34C759',
  },
  apptStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  apptStatusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  apptMiniDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  apptMiniDateChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  apptServiceName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },
  apptInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  apptInfoIconBubble: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(142,142,147,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptInfoText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'right',
    flexShrink: 1,
  },
  apptSeparator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.07)',
    marginBottom: 14,
    zIndex: 1,
  },
  apptCardDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.06)',
    marginVertical: 16,
  },
  apptCardFooter: {
    // row + RTL → cancel (first) RIGHT, swap middle, time (last) LEFT
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  apptLocationBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
    borderWidth: 1,
  },
  // ── שלושת כפתורי ה-footer – pill אחיד ──
  apptFooterBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  apptCancelBtn: {
    backgroundColor: 'rgba(255,59,48,0.09)',
    borderColor: 'rgba(255,59,48,0.15)',
  },
  apptCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF3B30',
    letterSpacing: -0.2,
  },
  apptSwapBtn: {
    backgroundColor: '#F5F5F7',
  },
  apptSwapBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3C3C43',
    letterSpacing: -0.2,
  },
  apptTimeBtn: {
    // primary-tinted pill, no border radius override needed
  },
  apptTimeBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  // legacy names kept so no ref errors
  apptFooterActions: { flexDirection: 'row', gap: 8 },
  apptTimeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  apptTimeCardText: { fontSize: 16, fontWeight: '800' },
  apptActionButton: { height: 44, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  apptSwapButton: { backgroundColor: '#F5F5F7' },
  apptSwapButtonText: { fontSize: 14, fontWeight: '700' },
  apptCancelButton: { backgroundColor: 'rgba(255,59,48,0.09)', borderColor: 'rgba(255,59,48,0.15)' },
  apptCancelButtonText: { fontSize: 14, fontWeight: '700', color: '#FF3B30' },
  // ─── BarberAvatar (premium ring + glow) ──────────────────────────────────
  barberAvatarRing: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  barberAvatarInner: {
    overflow: 'hidden',
    backgroundColor: '#F0F0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barberAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F0F5',
  },
  // ─── Date Pill ────────────────────────────────────────────────────────────
  datePill: {
    width: 58,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  datePillDivider: {
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 4,
  },
  datePillMonth: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3C3C3E',
    letterSpacing: 0.3,
  },
  datePillDay: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
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