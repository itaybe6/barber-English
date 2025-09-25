import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, Platform, Modal, ActivityIndicator, TextInput, FlatList, Alert, Linking, RefreshControl, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Colors from '@/constants/colors';
import { generateAppointments } from '@/constants/appointments';
import { services } from '@/constants/services';
import { clients } from '@/constants/clients';
// import { AvailableTimeSlot } from '@/lib/supabase'; // Not used in this file
import { supabase } from '@/lib/supabase';
import Card from '@/components/Card';
import { Calendar, Clock, ChevronLeft, ChevronRight, Star } from 'lucide-react-native';
import DaySelector from '@/components/DaySelector';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ScrollView as RNScrollView } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import AdminBroadcastComposer from '@/components/AdminBroadcastComposer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { businessProfileApi } from '@/lib/api/businessProfile';
import type { BusinessProfile } from '@/lib/supabase';
import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const designsFromStore = useDesignsStore((state) => state.designs);
  const isLoadingDesigns = useDesignsStore((state) => state.isLoading);
  const fetchDesigns = useDesignsStore((state) => state.fetchDesigns);
  
  const productsFromStore = useProductsStore((state) => state.products);
  const isLoadingProducts = useProductsStore((state) => state.isLoading);
  const fetchProducts = useProductsStore((state) => state.fetchProducts);

  const isAdmin = useAuthStore((state) => state.isAdmin);
  const user = useAuthStore((state) => state.user);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const fetchUnread = useNotificationsStore((state) => state.fetchUnreadCount);
  const colors = useColors();
  const styles = createStyles(colors);
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
  const [monthlyStats, setMonthlyStats] = useState({
    totalClients: 0,
    completedAppointments: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);
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
  const [refreshing, setRefreshing] = useState(false);
  const [blockedFilter, setBlockedFilter] = useState<'all' | 'blocked' | 'unblocked'>('all');
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

  // Animated background (match client home behavior)
  const backgroundTranslateYAnim = useRef(new Animated.Value(0)).current;
  const [isBackgroundExpanded, setIsBackgroundExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleScroll = useCallback((event: any) => {
    const scrollY = event?.nativeEvent?.contentOffset?.y ?? 0;
    if (!isBackgroundExpanded && !isAnimating && scrollY > 5) {
      setIsBackgroundExpanded(true);
      setIsAnimating(true);
      Animated.timing(backgroundTranslateYAnim, {
        toValue: -180,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setIsAnimating(false));
    }
    if (isBackgroundExpanded && !isAnimating && scrollY <= 5) {
      setIsBackgroundExpanded(false);
      setIsAnimating(true);
      Animated.timing(backgroundTranslateYAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setIsAnimating(false));
    }
  }, [isBackgroundExpanded, isAnimating, backgroundTranslateYAnim]);

  // Business profile for hero image
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const p = await businessProfileApi.getProfile();
        setBusinessProfile(p);
      } catch {
        setBusinessProfile(null);
      }
    };
    loadProfile();
  }, []);
  
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
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatTimeRange = (dateString: string) => {
    const date = new Date(dateString);
    const startTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    // Find the service to get duration
    const appointment = appointments.find(a => a.appointment_date === dateString);
    if (!appointment) return startTime;
    
    const service = services.find(s => s.id === appointment.service_id);
    if (!service) return startTime;
    
    // Calculate end time
    const endDate = new Date(date.getTime() + service.duration * 60000);
    const endTime = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    return `${startTime} — ${endTime}`;
  };
  
  // Fetch unread notifications count for current admin user
  useEffect(() => {
    if (user?.phone) {
      fetchUnread(user.phone);
    }
  }, [user?.phone, fetchUnread]);

  useFocusEffect(
    React.useCallback(() => {
      if (user?.phone) {
        fetchUnread(user.phone);
      }
    }, [user?.phone, fetchUnread])
  );

  // Fetch next appointment from database
  const fetchNextAppointment = async () => {
    try {
      setLoadingNextAppointment(true);
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().split(' ')[0];

      // Get only today's upcoming booked appointments for the current admin user
      let query = supabase
        .from('appointments')
        .select('*')
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
    try {
      setLoadingTodayCount(true);
      const today = new Date().toISOString().split('T')[0];
      
      let query = supabase
        .from('appointments')
        .select('*')
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

  // Fetch monthly statistics
  const fetchMonthlyStats = async () => {
    try {
      setLoadingStats(true);
      const now = new Date();
      const { getBusinessId } = await import('@/lib/supabase');
      const businessId = getBusinessId();
      
      // Get all clients from users table
      const { data: clientsData, error: clientsError } = await supabase
        .from('users')
        .select('*')
        .eq('user_type', 'client')
        .eq('business_id', businessId);

      if (clientsError) {
        console.error('Error fetching clients:', clientsError);
        return;
      }

      // Get all booked appointments for this month (past and upcoming within current month)
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      
      let appointmentsQuery = supabase
        .from('appointments')
        .select('*')
        .eq('is_available', false) // Only booked appointments
        .gte('slot_date', firstDayOfMonth) // From start of month
        .lte('slot_date', lastDayOfMonth); // To end of month

      // סינון לפי המשתמש הנוכחי - רק תורים שהוא יצר
      if (user?.id) {
        appointmentsQuery = appointmentsQuery.eq('user_id', user.id);
      }

      const { data: appointmentsData, error: appointmentsError } = await appointmentsQuery;

      if (appointmentsError) {
        console.error('Error fetching completed appointments:', appointmentsError);
        return;
      }



      setMonthlyStats({
        totalClients: clientsData?.length || 0,
        completedAppointments: appointmentsData?.length || 0
      });
    } catch (error) {
      console.error('Error in fetchMonthlyStats:', error);
    } finally {
      setLoadingStats(false);
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
        .order('name');

      if (error) {
        console.error('Error fetching clients:', error);
        return;
      }

      setClients(data || []);
      setFilteredClients(data || []);
    } catch (error) {
      console.error('Error in fetchClients:', error);
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
      Alert.alert('Error', 'Phone number is unavailable');
      return;
    }

    Alert.alert(
      'Call',
      `Call ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => {
            Linking.openURL(`tel:${phone}`);
          },
        },
      ]
    );
  };

  const handleBlockClient = (client: any) => {
    Alert.alert(
      'Block Client',
      `Block ${client?.name || 'this client'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
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
                Alert.alert('Error', 'Failed to block client');
                return;
              }
              setClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
              setFilteredClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
              Alert.alert('Client blocked', `${data?.name || 'Client'} was blocked successfully`);
            } catch (e) {
              console.error('Error blocking client:', e);
              Alert.alert('Error', 'Failed to block client');
            }
          },
        },
      ]
    );
  };

  const handleUnblockClient = (client: any) => {
    Alert.alert(
      'Unblock Client',
      `Unblock ${client?.name || 'this client'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
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
                Alert.alert('Error', 'Failed to unblock client');
                return;
              }
              setClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
              setFilteredClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
              Alert.alert('Client unblocked', `${data?.name || 'Client'} was unblocked successfully`);
            } catch (e) {
              console.error('Error unblocking client:', e);
              Alert.alert('Error', 'Failed to unblock client');
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
        Alert.alert('Error', 'Failed to update client');
        return;
      }
      // Update local lists
      setClients((prev) => prev.map((c) => (c.id === editingClient.id ? data : c)));
      setFilteredClients((prev) => prev.map((c) => (c.id === editingClient.id ? data : c)));
      setShowEditClientModal(false);
      setEditingClient(null);
    } catch (e) {
      console.error('Error saving client edit:', e);
      Alert.alert('Error', 'Failed to update client');
    } finally {
      setSavingClient(false);
    }
  };

  const handleDeleteClient = (client: any) => {
    Alert.alert(
      'Delete Client',
      `Delete ${client?.name || 'this client'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('users').delete().eq('id', client.id);
              if (error) {
                console.error('Error deleting client:', error);
                Alert.alert('Error', 'Failed to delete client');
                return;
              }
              setClients((prev) => prev.filter((c) => c.id !== client.id));
              setFilteredClients((prev) => prev.filter((c) => c.id !== client.id));
            } catch (e) {
              console.error('Error deleting client:', e);
              Alert.alert('Error', 'Failed to delete client');
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
    fetchMonthlyStats();
    fetchDesigns();
    fetchProducts();
  }, []);

  const onRefresh = React.useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        fetchNextAppointment(),
        fetchTodayAppointmentsCount(),
        fetchMonthlyStats(),
        (async () => { try { await fetchDesigns(); } catch {} })(),
        (async () => { try { await fetchProducts(); } catch {} })(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Products Section Component
  const ProductsSection = () => {
    if (isLoadingProducts) {
      return (
        <View style={{ paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ marginTop: 8, color: colors.textSecondary }}>Loading products...</Text>
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
      {/* Hero with overlay header (like client home) */}
      <View style={styles.fullScreenHero}>
        <Image
          source={businessProfile?.image_on_page_1 ? { uri: businessProfile.image_on_page_1 } : require('@/assets/images/1homePage.jpg')}
          style={styles.fullScreenHeroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.6)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fullScreenHeroOverlay}
        />

        {/* Overlay Header */}
        <SafeAreaView edges={['top']} style={styles.overlayHeader}>
          <View style={styles.overlayHeaderContent}>
            {/* Left: Broadcast */}
            <View style={styles.headerSide}>
              <View style={[styles.overlayButton, { backgroundColor: `${colors.primary}26` }]}> 
                <AdminBroadcastComposer variant="icon" language="en" iconColor="#fff" />
              </View>
            </View>
            {/* Center placeholder to keep spacing; logo is absolutely positioned */}
            <View style={styles.headerCenter} />
            {/* Right: Notifications */}
            <View style={styles.headerSide}>
              <TouchableOpacity
                style={[styles.overlayButton, { backgroundColor: `${colors.primary}26` }]}
                onPress={() => {
                  router.push('/(tabs)/notifications');
                }}
                activeOpacity={0.85}
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={24} color="#fff" />
                {unreadCount > 0 && (
                  <View style={[styles.overlayNotificationBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>

        {/* Absolute logo overlay so size doesn't affect header layout */}
        <View pointerEvents="none" style={[styles.overlayLogoWrapper, { top: insets.top -15 }]}> 
          <View style={styles.overlayLogoInner}>
            <Image source={getCurrentClientLogo()} style={styles.overlayLogo} resizeMode="contain" />
          </View>
        </View>

        {/* Hero Text Content */}
        <View style={[styles.fullScreenHeroContent, { top: insets.top + 110 }]}>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroWelcome}>Welcome</Text>
            <Text style={styles.heroTitle}>{user?.name || 'Admin'}</Text>
            <Text style={styles.heroSubtitle} numberOfLines={2} ellipsizeMode="tail">
              Manage your day with confidence{'\n'}
              This app keeps your schedule sharp
            </Text>
          </View>
        </View>

        {/* DailySchedule moved to content area below hero */}
      </View>

      {/* Content wrapper with scroll animation */}
      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1 }}>
        <Animated.View
          style={[
            styles.contentWrapper,
            { transform: [{ translateY: backgroundTranslateYAnim }] }
          ]}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 320 }
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
        {/* Spacer for bottom reachability */}
        <View style={{ height: 0 }} />

        {/* DailySchedule below hero, above stats */}
        <View style={{ paddingHorizontal: 8, marginTop: 12, marginBottom: 8 }}>
          <DailySchedule
            nextAppointment={nextAppointment}
            loading={loadingNextAppointment}
            onRefresh={fetchNextAppointment}
            todayAppointmentsCount={todayAppointmentsCount}
            loadingTodayCount={loadingTodayCount}
            variant="card"
          />
        </View>

        <View style={styles.statsBox}>
          <View style={styles.statsButtonsRow}>
            <TouchableOpacity
              style={styles.statsButton}
              onPress={() => {
                setShowClientsModal(true);
                fetchClients();
              }}
              activeOpacity={0.85}
            >
              <View style={[styles.statsButtonIconCircle, { backgroundColor: `${colors.primary}20` }]}> 
                <Ionicons name="people-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.statsButtonContent}>
                {loadingStats ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.statsNumber, { color: colors.primary }]}>{monthlyStats.totalClients}</Text>
                )}
                <Text style={styles.statsLabelSecondary}>Clients</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.statsButton}>
              <View style={[styles.statsButtonIconCircle, { backgroundColor: `${colors.primary}20` }]}> 
                <Ionicons name="checkmark-done-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.statsButtonContent}>
                {loadingStats ? (
                  <ActivityIndicator size="small" color={colors.success} />
                ) : (
                  <Text style={[styles.statsNumber, { color: colors.primary }]}>{monthlyStats.completedAppointments}</Text>
                )}
                <Text style={styles.statsLabelSecondary}>This month</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Admin: Gallery header with title/subtext (left) and edit button (right) */}
        {isAdmin && (
          <View style={{ paddingHorizontal: 8, marginBottom: 8 }}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTexts}>
                <Text style={styles.sectionHeaderTitle}>Gallery</Text>
                <Text style={styles.sectionHeaderSubtitle}>manage your desings</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/edit-gallery')}
                activeOpacity={0.85}
                style={styles.editGalleryButton}
              >
                <View style={[styles.statsButtonIconCircle, { backgroundColor: `${colors.primary}20`, width: 28, height: 28, borderRadius: 14, marginRight: 0 }]}> 
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </View>
                <Text style={styles.editGalleryButtonText}>Edit Gallery</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Admin: Story-style gallery like client home */}
        {isLoadingDesigns ? (
          <View style={{ paddingHorizontal: 16, justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <DesignCarousel designs={designsFromStore as any} showHeader={false} />
        )}

        {/* Spacing and divider between Gallery and Products sections for Admin */}
        {isAdmin && (
          <>
            <View style={styles.sectionSpacerLarge} />
            <View style={styles.sectionDivider} />
            <View style={styles.sectionSpacerLarge} />
          </>
        )}

        {/* Admin: Products header with title/subtext (left) and edit button (right) */}
        {isAdmin && (
          <View style={{ paddingHorizontal: 8, marginBottom: 8 }}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTexts}>
                <Text style={styles.sectionHeaderTitle}>Products</Text>
                <Text style={styles.sectionHeaderSubtitle}>Manage your products</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/edit-products')}
                activeOpacity={0.85}
                style={styles.editGalleryButton}
              >
                <View style={[styles.statsButtonIconCircle, { backgroundColor: `${colors.primary}20`, width: 28, height: 28, borderRadius: 14, marginRight: 12 }]}> 
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </View>
                <Text style={styles.editGalleryButtonText}>Edit Products</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Products Section */}
        <ProductsSection />
        {/* Close outer vertical ScrollView */}
          </ScrollView>
        </Animated.View>



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
                <Text style={styles.modalTitle}>Clients List</Text>
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
                 placeholder="Search by name..."
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
                 <Text style={[styles.filterButtonText, blockedFilter === 'all' && styles.filterButtonTextActive]}>All</Text>
               </TouchableOpacity>
               <TouchableOpacity
                 onPress={() => setBlockedFilter('blocked')}
                 style={[styles.filterButton, blockedFilter === 'blocked' && styles.filterButtonActive]}
                 activeOpacity={0.85}
               >
                 <Text style={[styles.filterButtonText, blockedFilter === 'blocked' && styles.filterButtonTextActive]}>Blocked</Text>
               </TouchableOpacity>
               <TouchableOpacity
                 onPress={() => setBlockedFilter('unblocked')}
                 style={[styles.filterButton, blockedFilter === 'unblocked' && styles.filterButtonActive]}
                 activeOpacity={0.85}
               >
                 <Text style={[styles.filterButtonText, blockedFilter === 'unblocked' && styles.filterButtonTextActive]}>Unblocked</Text>
               </TouchableOpacity>
             </View>

             {/* Clients List */}
             {loadingClients ? (
               <View style={styles.loadingContainer}>
                 <ActivityIndicator size="large" color={colors.primary} />
                 <Text style={styles.loadingText}>Loading clients...</Text>
               </View>
              ) : (
                 <FlatList
                  style={{ flex: 1 }}
                  data={filteredClients}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                   <View style={styles.clientItem}>
                     <View style={styles.clientInfo}>
                       <Text style={styles.clientName}>{item.name}</Text>
                       {item.phone && (
                         <Text style={styles.clientPhone}>{item.phone}</Text>
                       )}
                     </View>
                     <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                       <TouchableOpacity
                         style={styles.phoneButton}
                         onPress={() => handlePhoneCall(item.phone)}
                       >
                         <Ionicons name="call" size={20} color={colors.primary} />
                       </TouchableOpacity>
                       <TouchableOpacity
                         style={styles.blockButton}
                         onPress={() => (item.block ? handleUnblockClient(item) : handleBlockClient(item))}
                         activeOpacity={0.85}
                       >
                         <Text style={styles.blockButtonText}>{item.block ? 'Unblock' : 'Block'}</Text>
                       </TouchableOpacity>
                     </View>
                   </View>
                  )}
                   showsVerticalScrollIndicator={true}
                   contentContainerStyle={[styles.clientsList, { paddingBottom: insets.bottom + 24 }]}
                />
             )}
           </View>
         </View>
       </Modal>

      {/* Removed floating composer */}
 
      </SafeAreaView>
    </View>
  );
 }

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  // Grey rounded container like client home
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -80,
    paddingTop: 8,
    paddingBottom: 0,
    minHeight: '100%',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  // Hero styles (aligned with client home)
  fullScreenHero: {
    position: 'relative',
    height: '50%',
    width: '100%',
    zIndex: 0,
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
  overlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
    width: '100%',
    height: '100%',
    tintColor: '#FFFFFF',
  },
  overlayLogoWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  overlayLogoInner: {
    width: 300,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
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
    left: 16,
    right: 16,
    zIndex: 1,
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
    paddingHorizontal: 20,
    paddingTop: 6,
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
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
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
    flexDirection: 'row', // LTR
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  // Renamed to avoid duplicate key in StyleSheet
  modalClientName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'left',
  },
  clientInfo: {
    flex: 1,
    marginLeft: 16,
    alignItems: 'flex-start',
  },
  clientPhone: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'left',
    marginTop: 4,
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
    paddingHorizontal: 12,
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