import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  TextInput,
  Pressable,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { Calendar, Search, User, Clock, CalendarDays, X } from 'lucide-react-native';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { servicesApi } from '@/lib/api/services';
import type { Service } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';

const { width } = Dimensions.get('window');

// English locale for react-native-calendars
LocaleConfig.locales['en'] = {
  monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthNamesShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  dayNames: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  dayNamesShort: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  today: 'Today',
  direction: 'ltr',
};
LocaleConfig.defaultLocale = 'en';

// Helper function to format date as YYYY-MM-DD in local timezone
function formatDateToLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to convert 24-hour format to 12-hour AM/PM format
function formatTimeToAMPM(time24: string): string {
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minutes} ${ampm}`;
}

interface AddAppointmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AddAppointmentModal({ visible, onClose, onSuccess }: AddAppointmentModalProps) {
  const user = useAuthStore((state) => state.user);
  const { colors: businessColors } = useBusinessColors();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedClient, setSelectedClient] = useState<{ name: string; phone: string } | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [calendarMarked, setCalendarMarked] = useState<any>({});
  
  // Dropdown states
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  
  // Data states
  const [clients, setClients] = useState<Array<{ name: string; phone: string }>>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);
  const [lastTimesForDate, setLastTimesForDate] = useState<string | null>(null);
  
  // Stepper state (0: client, 1: service, 2: date, 3: time)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current; // 0..1
  const [viewportWidth, setViewportWidth] = useState<number>(width);
  
  // Search states
  const [clientSearch, setClientSearch] = useState('');
  const [filteredClients, setFilteredClients] = useState<Array<{ name: string; phone: string }>>([]);

  // Load initial data
  useEffect(() => {
    if (visible) {
      loadClients();
      loadServices();
      resetForm();
      goToStep(0, false);
    }
  }, [visible]);

  // Filter clients based on search
  useEffect(() => {
    const query = clientSearch.trim().toLowerCase();
    if (query === '') {
      setFilteredClients(clients);
    } else {
      setFilteredClients(
        clients.filter(
          client =>
            client.name.toLowerCase().includes(query) ||
            client.phone.includes(query)
        )
      );
    }
  }, [clientSearch, clients]);

  const loadClients = async () => {
    try {
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      
      const { data, error } = await supabase
        .from('users')
        .select('name, phone')
        .eq('user_type', 'client')
        .eq('business_id', businessId)
        .order('name');
      
      if (error) throw error;
      
      const validClients = (data || [])
        .filter((client: any) => client.phone && client.phone.trim() !== '')
        .map((client: any) => ({
          name: client.name || 'Client',
          phone: client.phone,
        }));
      
      setClients(validClients);
      setFilteredClients(validClients);
    } catch (error) {
      console.error('Error loading clients:', error);
      Alert.alert('Error', 'Error loading client list');
    }
  };

  const loadServices = async () => {
    try {
      const data = await servicesApi.getAllServices();
      setServices(data);
    } catch (error) {
      console.error('Error loading services:', error);
      Alert.alert('Error', 'Error loading services list');
    }
  };

  const resetForm = () => {
    setSelectedDate(null);
    setSelectedClient(null);
    setSelectedService(null);
    setSelectedTime(null);
    setClientSearch('');
    setShowClientDropdown(false);
    setShowServiceDropdown(false);
    setShowTimeDropdown(false);
    setAvailableTimes([]);
    setCurrentMonth(new Date());
    setCurrentStep(0);
    translateX.setValue(0);
    progressAnim.setValue(0);
  };

  const goToStep = (next: number, animate: boolean = true) => {
    const clamped = Math.max(0, Math.min(3, next));
    setCurrentStep(clamped);
    if (animate) {
      Animated.timing(translateX, {
        toValue: -clamped * (viewportWidth || width),
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      Animated.timing(progressAnim, {
        toValue: clamped / 3,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      translateX.setValue(-clamped * (viewportWidth || width));
      progressAnim.setValue(clamped / 3);
    }
  };

  const goNext = () => goToStep(currentStep + 1);
  const goBack = () => goToStep(currentStep - 1);

  const loadAvailableTimesForDate = async (date: Date) => {
    if (!selectedService) return;
    
    setIsLoadingTimes(true);
    setAvailableTimes([]);
    
    try {
      const dateString = formatDateToLocalString(date);
      const dayOfWeek = date.getDay();
      
      // Get business hours for this day: prefer user-specific row, fallback to global (null user_id)
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      
      let businessHours: any | null = null;
      try {
        const { data: bhUser } = await supabase
          .from('business_hours')
          .select('*')
          .eq('business_id', businessId)
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true)
          .eq('user_id', user?.id)
          .maybeSingle();
        if (bhUser) businessHours = bhUser;
      } catch {}
      if (!businessHours) {
        const { data: bhGlobal } = await supabase
          .from('business_hours')
          .select('*')
          .eq('business_id', businessId)
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true)
          .is('user_id', null)
          .maybeSingle();
        businessHours = bhGlobal || null;
      }

      if (!businessHours) {
        setAvailableTimes([]);
        return;
      }

      // Build time windows and slot duration (normalize to HH:mm to avoid HH:mm:ss mismatches)
      const normalize = (s: any) => String(s).slice(0, 5);
      const startTime = normalize(businessHours.start_time);
      const endTime = normalize(businessHours.end_time);
      const slotDuration = (selectedService?.duration_minutes && selectedService.duration_minutes > 0
        ? selectedService.duration_minutes
        : (businessHours.slot_duration_minutes || 60));
      
      // Subtract breaks from the main window
      type Window = { start: string; end: string };
      const baseWindows: Window[] = [{ start: startTime, end: endTime }];
      const brks: Array<{ start_time: string; end_time: string }> = (businessHours as any).breaks || [];
      const singleBreak = (businessHours.break_start_time && businessHours.break_end_time)
        ? [{ start_time: businessHours.break_start_time, end_time: businessHours.break_end_time }]
        : [];
      const allBreaks = [...brks, ...singleBreak].map(b => ({
        start_time: normalize(b.start_time),
        end_time: normalize(b.end_time),
      }));

      const subtractBreaks = (wins: Window[], breaks: typeof allBreaks): Window[] => {
        let result = wins.slice();
        for (const b of breaks) {
          const next: Window[] = [];
          for (const w of result) {
            if (b.end_time <= w.start || b.start_time >= w.end) {
              next.push(w);
              continue;
            }
            if (w.start < b.start_time) next.push({ start: w.start, end: b.start_time });
            if (b.end_time < w.end) next.push({ start: b.end_time, end: w.end });
          }
          result = next;
        }
        return result.filter(w => w.start < w.end);
      };

      const windows = subtractBreaks(baseWindows, allBreaks);

      // Helpers to add and compare HH:mm
      const addMinutes = (hhmm: string, minutes: number): string => {
        const [h, m] = hhmm.split(':').map((x: string) => parseInt(x, 10));
        const total = h * 60 + m + minutes;
        const hh = Math.floor(total / 60) % 24;
        const mm = total % 60;
        return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
      };
      const compareTimes = (a: string, b: string) => a.localeCompare(b);

      // Generate time slots aligned to service duration within open windows, ensuring the full service fits
      const slots: string[] = [];
      for (const w of windows) {
        let t = w.start as string;
        while (compareTimes(addMinutes(t, slotDuration), w.end) <= 0) {
          slots.push(t.slice(0, 5));
          t = addMinutes(t, slotDuration);
        }
      }

      // Check for existing appointments and remove booked slots
      const { data: existingAppointments } = await supabase
        .from('appointments')
        .select('slot_time, is_available')
        .eq('business_id', businessId)
        .eq('slot_date', dateString)
        .eq('user_id', user?.id);

      const bookedTimes = new Set(
        (existingAppointments || [])
          .filter((apt: any) => apt.is_available === false)
          .map((apt: any) => String(apt.slot_time).slice(0, 5))
      );

      // Subtract date-specific constraints
      const { data: constraintsRows } = await supabase
        .from('business_constraints')
        .select('start_time, end_time')
        .eq('business_id', businessId)
        .eq('date', dateString)
        .order('start_time');
      const withinConstraint = (t: string) => {
        return (constraintsRows || []).some((c: any) => {
          const s = String(c.start_time).slice(0,5);
          const e = String(c.end_time).slice(0,5);
          return s <= t && t < e;
        });
      };

      const availableSlots = slots
        .filter(slot => !bookedTimes.has(slot))
        .filter(slot => !withinConstraint(slot));
      setAvailableTimes(availableSlots);
      setLastTimesForDate(dateString);
      
    } catch (error) {
      console.error('Error loading available times:', error);
      Alert.alert('Error', 'Error loading available times');
    } finally {
      setIsLoadingTimes(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    // Open time dropdown and start loading immediately for better UX
    setShowTimeDropdown(true);
    setIsLoadingTimes(true);
    
    // Load available times for selected date
    if (selectedService) {
      loadAvailableTimesForDate(date);
    } else {
      // If no service yet, we'll fetch after service selection
      setIsLoadingTimes(false);
    }
    // Auto-advance to time step
    goToStep(3);
  };

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setShowServiceDropdown(false);
    
    // If date is already selected, reload available times
    if (selectedDate) {
      setIsLoadingTimes(true);
      loadAvailableTimesForDate(selectedDate);
    }
    // Auto-advance to next step
    goToStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedClient || !selectedService || !selectedTime) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'User not logged in');
      return;
    }

    // Final check - verify the time is still available
    const dateString = formatDateToLocalString(selectedDate);
    const { getBusinessId } = await import('@/lib/supabase');
    const businessId = getBusinessId();
    
    const { data: conflictingAppointments } = await supabase
      .from('appointments')
      .select('id')
      .eq('business_id', businessId)
      .eq('slot_date', dateString)
      .eq('slot_time', `${selectedTime}:00`)
      .eq('user_id', user.id);

    if (conflictingAppointments && conflictingAppointments.length > 0) {
      Alert.alert('Slot taken', 'The selected time is already booked. Please choose another time.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('appointments')
        .insert({
          business_id: businessId,
          slot_date: dateString,
          slot_time: `${selectedTime}:00`,
          is_available: false,
          client_name: selectedClient.name,
          client_phone: selectedClient.phone,
          service_name: selectedService.name,
          user_id: user.id, // שמירת ה-ID של הספר שיוצר את התור
          barber_id: user.id, // שמירת ה-ID של הספר שמבצע את השירות
        });

      if (error) throw error;

      Alert.alert('Success', 'Appointment scheduled successfully', [
        { text: 'OK', onPress: () => {
          onSuccess?.();
          onClose();
        }}
      ]);
      
    } catch (error) {
      console.error('Error creating appointment:', error);
      Alert.alert('Error', 'Error scheduling appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDatePicker = () => {
    const today = new Date();
    const minDate = today.toISOString().slice(0, 10);
    const selected = selectedDate ? formatDateToLocalString(selectedDate) : undefined;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <CalendarDays size={20} color={'#000000'} />
          <Text style={styles.sectionTitle}>Appointment Date</Text>
        </View>
        <Text style={styles.sectionSubtitle}>Select the date for this appointment</Text>
        <View style={styles.calendarContainer}>
          <RNCalendar
            current={selected || undefined}
            minDate={minDate}
            onDayPress={(day: any) => {
              const date = new Date(day.dateString);
              handleDateSelect(date);
            }}
            markedDates={selected ? { [selected]: { selected: true, selectedColor: '#000000' } } : undefined}
            enableSwipeMonths
            hideDayNames={false}
            firstDay={0}
            style={{ 
              direction: 'ltr',
              width: '100%',
            }}
            theme={{
              textDayFontSize: 16,
              textMonthFontSize: 16,
              textDayHeaderFontSize: 14,
              arrowColor: '#000000',
              selectedDayBackgroundColor: '#000000',
              todayTextColor: '#000000',
              dayTextColor: '#000000',
              monthTextColor: '#000000',
              textDisabledColor: '#C6C6C8',
              // Force LTR order for header and weeks
              'stylesheet.calendar.header': {
                week: { 
                  flexDirection: 'row',
                  justifyContent: 'space-around',
                  paddingHorizontal: 0,
                },
                dayHeader: {
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#000000',
                },
              },
              'stylesheet.calendar.main': {
                week: { 
                  flexDirection: 'row',
                  justifyContent: 'space-around',
                  paddingHorizontal: 0,
                },
                day: {
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              },
            }}
          />
        </View>
      </View>
    );
  };

  const renderClientSelector = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <User size={20} color={'#000000'} />
        <Text style={styles.sectionTitle}>Client</Text>
      </View>
      <Text style={styles.sectionSubtitle}>Pick the client for this appointment</Text>
      
      {!selectedClient ? (
        <>
          <View style={[styles.selectorButton, styles.grayField]}>
            <View style={styles.selectorContent}>
              <TextInput
                style={styles.selectorTextInput}
                value={clientSearch}
                onChangeText={setClientSearch}
                placeholder="Select client..."
                placeholderTextColor={Colors.subtext}
                textAlign="left"
                onFocus={() => setShowClientDropdown(true)}
              />
              <View style={styles.selectorIcon}>
                <Search size={16} color={Colors.subtext} />
              </View>
            </View>
          </View>

          {showClientDropdown && (
            <View style={styles.dropdownContainer}>
              <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
                {filteredClients.slice(0, 50).map((client, idx) => (
                  <Pressable
                    key={client.phone}
                    style={[
                      styles.dropdownItem,
                      idx === Math.min(filteredClients.length, 50) - 1 && styles.dropdownItemLast
                    ]}
                    onPress={() => {
                      setSelectedClient(client);
                      setShowClientDropdown(false);
                      setClientSearch('');
                      // Auto-advance
                      goToStep(1);
                    }}
                  >
                    <View style={styles.clientAvatar}>
                      <Text style={styles.clientAvatarText}>
                        {client.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{client.name}</Text>
                      <Text style={styles.clientPhone}>{client.phone}</Text>
                    </View>
                  </Pressable>
                ))}
                {filteredClients.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No results</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </>
      ) : (
        <View style={styles.selectedClientCard}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>
              {selectedClient.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.selectedClientInfo}>
            <Text style={styles.selectedClientName}>{selectedClient.name}</Text>
            <Text style={styles.selectedClientPhone}>{selectedClient.phone}</Text>
          </View>
          <TouchableOpacity 
            onPress={() => setSelectedClient(null)}
            style={styles.changeButton}
          >
            <Text style={[styles.changeButtonText, { color: businessColors.primary }]}>Change</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderServiceSelector = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Calendar size={20} color={'#000000'} />
        <Text style={styles.sectionTitle}>Service</Text>
      </View>
      <Text style={styles.sectionSubtitle}>Choose the service to perform</Text>
      
      <Pressable 
        style={[styles.selectorButton, styles.grayField]} 
        onPress={() => setShowServiceDropdown(!showServiceDropdown)}
      >
        <View style={styles.selectorContent}>
          <Text style={selectedService ? styles.selectorText : styles.selectorPlaceholder}>
            {selectedService ? `${selectedService.name} · $${selectedService.price}` : 'Select service...'}
          </Text>
          <View style={styles.selectorIcon}>
            <Calendar size={16} color={Colors.subtext} />
          </View>
        </View>
      </Pressable>
      
      {showServiceDropdown && (
        <View style={styles.dropdownContainer}>
          <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
            {services.map((service, idx) => (
              <Pressable
                key={service.id}
                style={[
                  styles.dropdownItem,
                  idx === services.length - 1 && styles.dropdownItemLast
                ]}
                onPress={() => handleServiceSelect(service)}
              >
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <Text style={styles.servicePrice}>${service.price}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const renderTimeSelector = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Clock size={20} color={'#000000'} />
        <Text style={styles.sectionTitle}>Time</Text>
      </View>
      <Text style={styles.sectionSubtitle}>Pick an available time slot</Text>
      
      <Pressable 
        style={[
          styles.selectorButton,
          styles.grayField,
          { opacity: selectedDate && selectedService ? 1 : 0.6 }
        ]} 
        onPress={() => {
          if (!selectedDate || !selectedService) {
            Alert.alert('Error', 'Please select date and service first');
            return;
          }
          // Ensure times are up-to-date when opening
          if (!showTimeDropdown) {
            setIsLoadingTimes(true);
            loadAvailableTimesForDate(selectedDate);
          }
          setShowTimeDropdown(!showTimeDropdown);
        }}
      >
        <View style={styles.selectorContent}>
          <Text style={selectedTime ? styles.selectorText : styles.selectorPlaceholder}>
            {selectedTime ? formatTimeToAMPM(selectedTime) : (isLoadingTimes ? 'Loading times...' : 'Select time...')}
          </Text>
          <View style={styles.selectorIcon}>
            <Clock size={16} color={Colors.subtext} />
          </View>
        </View>
      </Pressable>
      
      {showTimeDropdown && (
        <View style={styles.dropdownContainer}>
          <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
            {isLoadingTimes ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading available times...</Text>
              </View>
            ) : availableTimes.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No available times for this day</Text>
              </View>
            ) : (
              availableTimes.map((time, idx) => (
                <Pressable
                  key={time}
                  style={[
                    styles.dropdownItem,
                    idx === availableTimes.length - 1 && styles.dropdownItemLast
                  ]}
                  onPress={() => {
                    setSelectedTime(time);
                    setShowTimeDropdown(false);
                  }}
                >
                  <Text style={styles.timeText}>{formatTimeToAMPM(time)}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <>
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { textAlign: 'center', position: 'absolute', left: 54, right: 54 }]}>add appointment</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.bodyWrapper}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Stepper */}
          <View style={styles.stepperContainer}>
            <View style={styles.stepperTrack}>
              <Animated.View
                style={[styles.stepperProgress, { backgroundColor: businessColors.primary, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
              />
            </View>
            <View style={styles.stepperLabels}>
              {['Client','Service','Date','Time'].map((label, idx) => (
                <View key={label} style={styles.stepperLabelWrap}>
                  <View style={[styles.stepDot, { borderColor: idx <= currentStep ? businessColors.primary : '#D1D1D6', backgroundColor: idx < currentStep ? businessColors.primary : '#FFFFFF' }]} />
                  <Text style={[styles.stepLabelText, { color: idx <= currentStep ? businessColors.primary : '#8E8E93' }]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Animated steps viewport */}
          <View style={styles.groupCard}>
            <View style={styles.stepsViewport} onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w && w > 0) {
                setViewportWidth(w);
                // Keep current step position aligned to new width
                translateX.setValue(-currentStep * w);
              }
            }}>
              <Animated.View style={[styles.stepsContainer, { width: (viewportWidth || width) * 4, transform: [{ translateX }] }]}> 
                <View style={[styles.stepPane, { width: viewportWidth || width }]}>
                  {renderClientSelector()}
                </View>
                <View style={[styles.stepPane, { width: viewportWidth || width }]}>
                  {renderServiceSelector()}
                </View>
                <View style={[styles.stepPane, { width: viewportWidth || width }]}>
                  {renderDatePicker()}
                </View>
                <View style={[styles.stepPane, { width: viewportWidth || width }]}>
                  {renderTimeSelector()}
                </View>
              </Animated.View>
            </View>
            {/* Navigation controls */}
            <View style={styles.stepNavRow}>
              <TouchableOpacity onPress={goBack} disabled={currentStep === 0} style={[styles.stepNavButton, currentStep === 0 && styles.stepNavButtonDisabled]}> 
                <Text style={[styles.stepNavText, currentStep === 0 && styles.stepNavTextDisabled]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={currentStep < 3 ? goNext : handleSubmit}
                disabled={
                  (currentStep === 0 && !selectedClient) ||
                  (currentStep === 1 && !selectedService) ||
                  (currentStep === 2 && !selectedDate) ||
                  (currentStep === 3 && (!selectedTime || isSubmitting))
                }
                style={[styles.stepNavPrimary, { backgroundColor: businessColors.primary },
                  ((currentStep === 0 && !selectedClient) || (currentStep === 1 && !selectedService) || (currentStep === 2 && !selectedDate) || (currentStep === 3 && (!selectedTime || isSubmitting))) && { opacity: 0.6 }
                ]}
              >
                <Text style={styles.stepNavPrimaryText}>{currentStep < 3 ? 'Next' : (isSubmitting ? 'Saving...' : 'Done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Summary */}
          {selectedDate && selectedClient && selectedService && selectedTime && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Appointment Summary</Text>
              <View style={styles.summaryContent}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryValue}>{selectedClient.name}</Text>
                  <Text style={styles.summaryLabel}>Client:</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryValue}>{selectedService.name}</Text>
                  <Text style={styles.summaryLabel}>Service:</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryValue}>
                    {selectedDate.toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      weekday: 'long'
                    })}
                  </Text>
                  <Text style={styles.summaryLabel}>Date:</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryValue}>{formatTimeToAMPM(selectedTime)}</Text>
                  <Text style={styles.summaryLabel}>Time:</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bodyWrapper: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  // (styles for success modal were removed)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 17,
    color: '#7B61FF',
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
    textAlign: 'center',
  },
  submitButton: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 60,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: '#8E8E93',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  stepperContainer: {
    marginBottom: 12,
  },
  stepperTrack: {
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    overflow: 'hidden',
  },
  stepperProgress: {
    height: '100%',
  },
  stepperLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  stepperLabelWrap: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  stepLabelText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    justifyContent: 'flex-start',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: -6,
    marginBottom: 10,
    textAlign: 'left',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    marginLeft: 8,
    textAlign: 'left',
  },
  selectorButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  grayField: {
    backgroundColor: '#F2F2F7',
    borderColor: 'transparent',
    borderWidth: 0,
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    fontSize: 17,
    color: '#000000',
    flex: 1,
    textAlign: 'left',
  },
  selectorPlaceholder: {
    fontSize: 17,
    color: '#8E8E93',
    flex: 1,
    textAlign: 'left',
  },
  selectorTextInput: {
    fontSize: 17,
    color: '#000000',
    flex: 1,
    textAlign: 'left',
    paddingVertical: 0,
  },
  selectorIcon: {
    marginRight: 8,
  },
  dropdownContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginTop: 8,
    maxHeight: 300,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: '#000000',
    textAlign: 'left',
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  dropdownList: {
    maxHeight: 250,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7B61FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  clientAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  clientInfo: {
    flex: 1,
    alignItems: 'flex-start',
  },
  clientName: {
    fontSize: 17,
    fontWeight: '500',
    color: '#000000',
  },
  clientPhone: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 2,
  },
  serviceInfo: {
    flex: 1,
    alignItems: 'flex-start',
  },
  serviceName: {
    fontSize: 17,
    fontWeight: '500',
    color: '#000000',
  },
  servicePrice: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 2,
  },
  timeText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#000000',
    textAlign: 'left',
    flex: 1,
  },
  selectedClientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedClientInfo: {
    flex: 1,
    alignItems: 'flex-start',
    marginLeft: 12,
  },
  selectedClientName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  selectedClientPhone: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 2,
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  changeButtonText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 8,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
  },
  datePickerContainer: {
    paddingHorizontal: 4,
  },
  // Calendar container for react-native-calendars
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 8,
    direction: 'ltr',
    width: '100%',
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stepsViewport: {
    overflow: 'hidden',
  },
  stepsContainer: {
    flexDirection: 'row',
  },
  stepPane: {
    paddingRight: 4,
  },
  stepNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  stepNavButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  stepNavButtonDisabled: {
    opacity: 0.6,
  },
  stepNavText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '600',
  },
  stepNavTextDisabled: {
    color: '#8E8E93',
  },
  stepNavPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  stepNavPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dateOption: {
    width: 70,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dateOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  dateOptionToday: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  dateOptionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  dateOptionTextSelected: {
    color: '#FFFFFF',
  },
  dateOptionDay: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
    textAlign: 'left',
  },
  summaryContent: {
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
    textAlign: 'left',
  },
  summaryValue: {
    fontSize: 15,
    color: '#000000',
    fontWeight: '600',
    textAlign: 'left',
    flex: 1,
    marginLeft: 8,
  },
});
