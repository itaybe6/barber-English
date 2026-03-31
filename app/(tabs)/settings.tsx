import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image, Platform, Alert, TextInput, Modal, Pressable, ActivityIndicator, Animated, Easing, TouchableWithoutFeedback, PanResponder, GestureResponderEvent, PanResponderGestureState, KeyboardAvoidingView, Linking, Dimensions, Switch, I18nManager, type LayoutChangeEvent } from 'react-native';
import Constants from 'expo-constants';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { servicesApi, updateService, createService, deleteService, updateServicesOrderIndexes } from '@/lib/api/services';
import type { Service } from '@/lib/supabase';
import { recurringAppointmentsApi } from '@/lib/api/recurringAppointments';
import { supabase, getBusinessId } from '@/lib/supabase';
import { businessProfileApi, isClientApprovalRequired, isClientSwapEnabled } from '@/lib/api/businessProfile';
import type { BusinessProfile } from '@/lib/supabase';
import { 
  HelpCircle, 
  LogOut, 
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Trash2,
  Check,
  Instagram,
  Facebook,
  MapPin,
  Calendar,
  Image as ImageIcon,
  Home,
  Clock,
  User,
  Repeat,
  Plus,
  Bell,
} from 'lucide-react-native';
import { Users } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersApi } from '@/lib/api/users';
import InlineEditableRow from '@/components/InlineEditableRow';
import { ColorPicker } from '@/components/ColorPicker';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { TabButton } from '@/components/shopify-tab-bar/tab-button';
import AddAdminModal from '@/components/AddAdminModal';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
import { useTranslation } from 'react-i18next';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { SettingsScreenTabs } from '@/components/settings/SettingsScreenTabs';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';

// Helper for shadow style
const shadowStyle = Platform.select({
  ios: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
  },
  android: {
    elevation: 3,
  },
});

/** Grouped settings canvas — ScrollView content + screen root use this so bottom padding isn’t white */
const SETTINGS_GROUPED_BG = '#F2F2F7';

export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((s) => s.updateUserProfile);
  const { triggerColorUpdate, forceAppRefresh } = useColorUpdate();
  const { colors: businessColors } = useBusinessColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();

  /** Match client booking list: `order_index` (then name). Missing index sorts after indexed rows. */
  const sortServicesLikeClientBooking = useCallback((list: Service[]) => {
    const locale = i18n.language || undefined;
    return [...list].sort((a, b) => {
      const ai =
        typeof a.order_index === 'number' && !Number.isNaN(a.order_index)
          ? a.order_index
          : Number.POSITIVE_INFINITY;
      const bi =
        typeof b.order_index === 'number' && !Number.isNaN(b.order_index)
          ? b.order_index
          : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return String(a.name || '').localeCompare(String(b.name || ''), locale, { sensitivity: 'base', numeric: true });
    });
  }, [i18n.language]);

  // Notification modal states
  const [showSupportModal, setShowSupportModal] = useState(false);
  
  // Add admin modal state
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  
  // Delete account modal state
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  // Title dropdown states (removed)

  // Services edit modal state
  const [showServicesModal, setShowServicesModal] = useState(false);
  const [editableServices, setEditableServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  const [savedServiceId, setSavedServiceId] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [isAddingService, setIsAddingService] = useState(false);
  const [servicesReorderMode, setServicesReorderMode] = useState(false);

  // Business profile state
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileInstagram, setProfileInstagram] = useState('');
  const [profileFacebook, setProfileFacebook] = useState('');
  const [profileTiktok, setProfileTiktok] = useState('');
  const [profileMinCancellationHours, setProfileMinCancellationHours] = useState(24);
  const [profileBookingOpenDays, setProfileBookingOpenDays] = useState(7);
  const [clientSwapEnabled, setClientSwapEnabled] = useState(true);
  const [requireClientApproval, setRequireClientApproval] = useState(true);
  const [showEditAddressModal, setShowEditAddressModal] = useState(false);
  const [showAddressSheet, setShowAddressSheet] = useState(false);
  const [showEditInstagramModal, setShowEditInstagramModal] = useState(false);
  const [showEditFacebookModal, setShowEditFacebookModal] = useState(false);
  const [showEditTiktokModal, setShowEditTiktokModal] = useState(false);
  const [showEditCancellationModal, setShowEditCancellationModal] = useState(false);
  const [showBookingWindowModal, setShowBookingWindowModal] = useState(false);
  const [bookingWindowDraft, setBookingWindowDraft] = useState('7');
  const [showCancellationDropdown, setShowCancellationDropdown] = useState(false);
  const [cancellationDropdownDirection, setCancellationDropdownDirection] = useState<'up' | 'down'>('down');
  // Address bottom sheet animation
  const addressSheetAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const addressOverlayOpacity = addressSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const addressSheetTranslateY = addressSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });
  const addressDragY = useRef(new Animated.Value(0)).current;
  const addressCombinedTranslateY = Animated.add(addressSheetTranslateY as any, addressDragY as any);
  const [addressDraft, setAddressDraft] = useState('');
  const [instagramDraft, setInstagramDraft] = useState('');
  const [facebookDraft, setFacebookDraft] = useState('');
  const [tiktokDraft, setTiktokDraft] = useState('');
  const [showEditDisplayNameModal, setShowEditDisplayNameModal] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [cancellationHoursDraft, setCancellationHoursDraft] = useState('24');
  // Admin name/phone edit
  const [showEditAdminModal, setShowEditAdminModal] = useState(false);
  const [adminNameDraft, setAdminNameDraft] = useState('');
  const [adminPhoneDraft, setAdminPhoneDraft] = useState('');
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  const [isUploadingAdminAvatar, setIsUploadingAdminAvatar] = useState(false);
  const [adminProfileLavaLayout, setAdminProfileLavaLayout] = useState({ w: 0, h: 0 });
  const onAdminProfileLavaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setAdminProfileLavaLayout((prev) =>
        prev.w === width && prev.h === height ? prev : { w: width, h: height },
      );
    }
  }, []);

  /** Primary business owner (profile phone matches user phone); used for owner-only settings. */
  const canSeeAddEmployee = React.useMemo(() => {
    const userPhone = String(user?.phone || '').trim();
    const businessPhone = String((profile as any)?.phone || '').trim();
    return userPhone !== '' && businessPhone !== '' && userPhone === businessPhone;
  }, [user?.phone, (profile as any)?.phone]);

  // Per-admin: reminder for you (optional) vs reminder for clients (optional)
  const [adminReminderMinutes, setAdminReminderMinutes] = useState<number | null>(null);
  const [adminReminderEnabled, setAdminReminderEnabled] = useState(false);
  const [clientReminderMinutes, setClientReminderMinutes] = useState<number | null>(null);
  const [clientReminderEnabled, setClientReminderEnabled] = useState(false);
  const [showClientReminderModal, setShowClientReminderModal] = useState(false);
  const [clientReminderModalHoursDraft, setClientReminderModalHoursDraft] = useState('');
  const [clientReminderModalMinutesDraft, setClientReminderModalMinutesDraft] = useState('');
  const [clientReminderSwitchPending, setClientReminderSwitchPending] = useState(false);
  const [showAdminReminderModal, setShowAdminReminderModal] = useState(false);
  const [adminReminderModalHoursDraft, setAdminReminderModalHoursDraft] = useState('');
  const [adminReminderModalMinutesDraft, setAdminReminderModalMinutesDraft] = useState('');
  /** Lets the switch show “on” while the user fills the modal after enabling */
  const [adminReminderSwitchPending, setAdminReminderSwitchPending] = useState(false);
  const [cancellationSwitchPending, setCancellationSwitchPending] = useState(false);

  // Animated bottom-sheet controls
  const sheetAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const sheetTranslateY = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });
  const dragY = useRef(new Animated.Value(0)).current; // additional drag delta
  const combinedTranslateY = Animated.add(sheetTranslateY as any, dragY as any);
  const overlayOpacity = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const animateOpenSheet = () => {
    dragY.setValue(0);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  // Load business profile function
  const loadBusinessProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      const p = await businessProfileApi.getProfile();
      if (p) {
        setProfile(p);
        setProfileDisplayName(p?.display_name || '');
        setProfileAddress(p?.address || '');
        setProfileInstagram(p?.instagram_url || '');
        setProfileFacebook(p?.facebook_url || '');
        setProfileTiktok((p as any)?.tiktok_url || '');
        {
          const mc = (p as any)?.min_cancellation_hours;
          setProfileMinCancellationHours(
            mc === null || mc === undefined ? 24 : Math.max(0, Math.min(168, Number(mc))),
          );
        }
        if (user?.id) {
          try {
            const myDays = await businessProfileApi.getBookingOpenDaysForUser(user.id);
            setProfileBookingOpenDays(myDays);
          } catch {
            setProfileBookingOpenDays(Number(((p as any)?.booking_open_days ?? 7)));
          }
        } else {
          setProfileBookingOpenDays(Number(((p as any)?.booking_open_days ?? 7)));
        }
        setClientSwapEnabled(isClientSwapEnabled(p));
        setRequireClientApproval(isClientApprovalRequired(p));
      }
    } catch (error) {
      console.error('Failed to load business profile:', error);
      // Don't show error to user, just log it
    } finally {
      setIsLoadingProfile(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadBusinessProfile();
    }, [loadBusinessProfile])
  );

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) return;
        const adminRem = await businessProfileApi.getReminderMinutesForUser(user.id);
        setAdminReminderMinutes(adminRem);
        setAdminReminderEnabled(adminRem !== null && Number(adminRem) > 0);
        const clientRem = await businessProfileApi.getClientReminderMinutesForUser(user.id);
        setClientReminderMinutes(clientRem);
        setClientReminderEnabled(clientRem !== null && Number(clientRem) > 0);
      } catch (e) {
        // silent
      }
    })();
  }, [user?.id]);

  // Keep edit drafts in sync when modal opens or profile updates
  useEffect(() => {
    if (showEditAddressModal) {
      setAddressDraft(profileAddress || '');
    }
  }, [showEditAddressModal, profileAddress]);

  // Debug log removed per request

  useEffect(() => {
    if (showEditInstagramModal) {
      setInstagramDraft(profileInstagram || '');
    }
  }, [showEditInstagramModal, profileInstagram]);

  useEffect(() => {
    if (showEditFacebookModal) {
      setFacebookDraft(profileFacebook || '');
    }
  }, [showEditFacebookModal, profileFacebook]);

  useEffect(() => {
    if (showEditTiktokModal) {
      setTiktokDraft(profileTiktok || '');
    }
  }, [showEditTiktokModal, profileTiktok]);

  useEffect(() => {
    if (showEditCancellationModal) {
      setCancellationHoursDraft(profileMinCancellationHours.toString());
    }
  }, [showEditCancellationModal, profileMinCancellationHours]);

  // Close dropdown when modal closes
  useEffect(() => {
    if (!showEditCancellationModal) {
      setShowCancellationDropdown(false);
    }
  }, [showEditCancellationModal]);

  useEffect(() => {
    if (showBookingWindowModal) {
      setBookingWindowDraft(String(profileBookingOpenDays || 7));
    }
  }, [showBookingWindowModal, profileBookingOpenDays]);

  const handleSaveBusinessProfile = async () => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        display_name: profileDisplayName.trim() || null as any,
        address: profileAddress.trim() || null as any,
        instagram_url: profileInstagram.trim() || null as any,
        facebook_url: profileFacebook.trim() || null as any,
        tiktok_url: profileTiktok.trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.saveFailed','Failed to save business profile'));
        return;
      }
      setProfile(updated);
      Alert.alert(t('success.generic','Success'), t('settings.profile.saveSuccess','Business details saved successfully'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Open editors with current values
  const openEditAddress = () => {
    setAddressDraft(profileAddress || '');
    setShowAddressSheet(true);
    addressSheetAnim.setValue(0);
    Animated.timing(addressSheetAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    try {
      if (placesInputRef.current && (profileAddress || '')) {
        placesInputRef.current.setAddressText(profileAddress);
      }
    } catch {}
  };
  const openEditInstagram = () => {
    setInstagramDraft(profileInstagram || '');
    setShowEditInstagramModal(true);
  };
  const openEditFacebook = () => {
    setFacebookDraft(profileFacebook || '');
    setShowEditFacebookModal(true);
  };
  const openEditTiktok = () => {
    setTiktokDraft(profileTiktok || '');
    setShowEditTiktokModal(true);
  };

  // Inline save handlers for social links (used by InlineEditableRow)
  const handleSaveInstagramInline = async (next: string) => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (next || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
        tiktok_url: (profileTiktok || '').trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.instagramSaveFailed','Failed to save Instagram link'));
        return;
      }
      setProfile(updated);
      setProfileInstagram(updated.instagram_url || '');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveFacebookInline = async (next: string) => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (next || '').trim() || null as any,
        tiktok_url: (profileTiktok || '').trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.facebookSaveFailed','Failed to save Facebook link'));
        return;
      }
      setProfile(updated);
      setProfileFacebook(updated.facebook_url || '');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveTiktokInline = async (next: string) => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
        tiktok_url: (next || '').trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.tiktokSaveFailed','Failed to save TikTok link'));
        return;
      }
      setProfile(updated);
      setProfileTiktok(updated.tiktok_url || '');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleClientSwapToggle = async (next: boolean) => {
    if (!canSeeAddEmployee) return;
    const prev = clientSwapEnabled;
    setClientSwapEnabled(next);
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        display_name: (profileDisplayName || '').trim() || null as any,
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
        tiktok_url: (profileTiktok || '').trim() || null as any,
        min_cancellation_hours: profileMinCancellationHours,
        client_swap_enabled: next,
        require_client_approval: requireClientApproval,
      });
      if (!updated) {
        setClientSwapEnabled(prev);
        Alert.alert(t('error.generic', 'Error'), t('settings.policies.clientSwapSaveFailed', 'Could not update swap setting'));
        return;
      }
      setProfile(updated);
      setClientSwapEnabled(isClientSwapEnabled(updated));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleRequireClientApprovalToggle = async (next: boolean) => {
    if (!canSeeAddEmployee) return;
    const prev = requireClientApproval;
    setRequireClientApproval(next);
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        display_name: (profileDisplayName || '').trim() || null as any,
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
        tiktok_url: (profileTiktok || '').trim() || null as any,
        min_cancellation_hours: profileMinCancellationHours,
        client_swap_enabled: clientSwapEnabled,
        require_client_approval: next,
      });
      if (!updated) {
        setRequireClientApproval(prev);
        Alert.alert(
          t('error.generic', 'Error'),
          t('settings.policies.requireClientApprovalSaveFailed', 'Could not update client approval setting'),
        );
        return;
      }
      setProfile(updated);
      setRequireClientApproval(isClientApprovalRequired(updated));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const persistBookingOpenDays = async (next: string): Promise<boolean> => {
    if (!user?.id) {
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.bookingWindowNeedUser', 'Sign in to save your booking window.'));
      return false;
    }
    const trimmed = (next || '').trim();
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 1 || n > 60) {
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.bookingWindowInvalid', 'Enter a number between 1 and 60.'));
      return false;
    }
    const parsed = Math.max(1, Math.min(60, Math.floor(n)));
    setIsSavingProfile(true);
    try {
      await businessProfileApi.setBookingOpenDaysForUser(user.id, parsed);
      const updated = await businessProfileApi.getProfile();
      if (updated) setProfile(updated);
      setProfileBookingOpenDays(await businessProfileApi.getBookingOpenDaysForUser(user.id));
      try {
        await supabase.rpc('generate_time_slots_for_open_window');
      } catch {}
      return true;
    } catch (e) {
      console.error('persistBookingOpenDays', e);
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.bookingWindowSaveFailed', 'Failed to save booking window'));
      return false;
    } finally {
      setIsSavingProfile(false);
    }
  };

  const confirmBookingWindowModal = async () => {
    const ok = await persistBookingOpenDays(bookingWindowDraft);
    if (ok) {
      Alert.alert(t('success.generic', 'Success'), t('settings.profile.bookingWindowSaved', 'Booking window updated successfully'));
      setShowBookingWindowModal(false);
    }
  };

  const openClientReminderModal = useCallback(
    (fromSwitch = false) => {
      if (!user?.id) return;
      if (fromSwitch) setClientReminderSwitchPending(true);
      if (clientReminderMinutes != null && clientReminderMinutes > 0) {
        setClientReminderModalHoursDraft(String(Math.floor(clientReminderMinutes / 60)));
        setClientReminderModalMinutesDraft(String(clientReminderMinutes % 60));
      } else {
        setClientReminderModalHoursDraft('');
        setClientReminderModalMinutesDraft('');
      }
      setShowClientReminderModal(true);
    },
    [user?.id, clientReminderMinutes],
  );

  const dismissClientReminderModal = useCallback(() => {
    setShowClientReminderModal(false);
    setClientReminderSwitchPending(false);
  }, []);

  const handleClientReminderSwitch = async (on: boolean) => {
    if (!user?.id) return;
    if (!on) {
      setClientReminderSwitchPending(false);
      setShowClientReminderModal(false);
      try {
        setIsSavingProfile(true);
        await businessProfileApi.setClientReminderMinutesForUser(user.id, null);
        setClientReminderMinutes(null);
        setClientReminderEnabled(false);
      } finally {
        setIsSavingProfile(false);
      }
      return;
    }
    openClientReminderModal(true);
  };

  const clientReminderActive =
    (clientReminderMinutes != null && clientReminderMinutes > 0) || clientReminderSwitchPending;

  const saveClientReminderFromModal = async () => {
    if (!user?.id) return;
    const hRaw = clientReminderModalHoursDraft.trim();
    const mRaw = clientReminderModalMinutesDraft.trim();
    if ((hRaw && !/^\d+$/.test(hRaw)) || (mRaw && !/^\d+$/.test(mRaw))) {
      Alert.alert(t('error.generic', 'Error'), t('settings.reminder.clientDialogInvalidParts'));
      return;
    }
    const h = hRaw ? parseInt(hRaw, 10) : 0;
    const m = mRaw ? parseInt(mRaw, 10) : 0;
    if (m > 59) {
      Alert.alert(t('error.generic', 'Error'), t('settings.reminder.clientDialogInvalidParts'));
      return;
    }
    if (h > 24) {
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.reminderInvalid', 'Enter a valid number between 1 and 1440 minutes'));
      return;
    }
    const total = h * 60 + m;
    try {
      setIsSavingProfile(true);
      if (total === 0) {
        await businessProfileApi.setClientReminderMinutesForUser(user.id, null);
        setClientReminderMinutes(null);
        setClientReminderEnabled(false);
        setClientReminderSwitchPending(false);
        setShowClientReminderModal(false);
        return;
      }
      if (total < 1 || total > 1440) {
        Alert.alert(t('error.generic', 'Error'), t('settings.profile.reminderInvalid', 'Enter a valid number between 1 and 1440 minutes'));
        return;
      }
      await businessProfileApi.setClientReminderMinutesForUser(user.id, total);
      setClientReminderMinutes(total);
      setClientReminderEnabled(true);
      setClientReminderSwitchPending(false);
      setShowClientReminderModal(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const openAdminReminderModal = useCallback(
    (fromSwitch = false) => {
      if (!user?.id) return;
      if (fromSwitch) setAdminReminderSwitchPending(true);
      if (adminReminderMinutes != null && adminReminderMinutes > 0) {
        setAdminReminderModalHoursDraft(String(Math.floor(adminReminderMinutes / 60)));
        setAdminReminderModalMinutesDraft(String(adminReminderMinutes % 60));
      } else {
        setAdminReminderModalHoursDraft('');
        setAdminReminderModalMinutesDraft('');
      }
      setShowAdminReminderModal(true);
    },
    [user?.id, adminReminderMinutes],
  );

  const dismissAdminReminderModal = useCallback(() => {
    setShowAdminReminderModal(false);
    setAdminReminderSwitchPending(false);
  }, []);

  const saveAdminReminderFromModal = async () => {
    if (!user?.id) return;
    const hRaw = adminReminderModalHoursDraft.trim();
    const mRaw = adminReminderModalMinutesDraft.trim();
    if ((hRaw && !/^\d+$/.test(hRaw)) || (mRaw && !/^\d+$/.test(mRaw))) {
      Alert.alert(t('error.generic', 'Error'), t('settings.reminder.clientDialogInvalidParts'));
      return;
    }
    const h = hRaw ? parseInt(hRaw, 10) : 0;
    const m = mRaw ? parseInt(mRaw, 10) : 0;
    if (m > 59) {
      Alert.alert(t('error.generic', 'Error'), t('settings.reminder.clientDialogInvalidParts'));
      return;
    }
    if (h > 24) {
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.reminderInvalid', 'Enter a valid number between 1 and 1440 minutes'));
      return;
    }
    const total = h * 60 + m;
    try {
      setIsSavingProfile(true);
      if (total === 0) {
        await businessProfileApi.setReminderMinutesForUser(user.id, null);
        setAdminReminderMinutes(null);
        setAdminReminderEnabled(false);
        setAdminReminderSwitchPending(false);
        setShowAdminReminderModal(false);
        return;
      }
      if (total < 1 || total > 1440) {
        Alert.alert(t('error.generic', 'Error'), t('settings.profile.reminderInvalid', 'Enter a valid number between 1 and 1440 minutes'));
        return;
      }
      await businessProfileApi.setReminderMinutesForUser(user.id, total);
      setAdminReminderMinutes(total);
      setAdminReminderEnabled(true);
      setAdminReminderSwitchPending(false);
      setShowAdminReminderModal(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAdminReminderSwitch = async (on: boolean) => {
    if (!user?.id) return;
    if (!on) {
      setAdminReminderSwitchPending(false);
      setShowAdminReminderModal(false);
      try {
        setIsSavingProfile(true);
        await businessProfileApi.setReminderMinutesForUser(user.id, null);
        setAdminReminderMinutes(null);
        setAdminReminderEnabled(false);
      } finally {
        setIsSavingProfile(false);
      }
      return;
    }
    openAdminReminderModal(true);
  };

  const adminSelfReminderOn =
    (adminReminderMinutes != null && adminReminderMinutes > 0) || adminReminderSwitchPending;

  const openCancellationEditor = useCallback(
    (fromSwitch = false) => {
      if (!canSeeAddEmployee) return;
      if (fromSwitch) setCancellationSwitchPending(true);
      const h = profileMinCancellationHours;
      setCancellationHoursDraft(h > 0 ? String(h) : '24');
      setShowEditCancellationModal(true);
    },
    [canSeeAddEmployee, profileMinCancellationHours],
  );

  const dismissCancellationModal = useCallback(() => {
    setShowCancellationDropdown(false);
    setShowEditCancellationModal(false);
    setCancellationSwitchPending(false);
  }, []);

  const handleCancellationSwitchToggle = async (on: boolean) => {
    if (!canSeeAddEmployee) return;
    if (!on) {
      setCancellationSwitchPending(false);
      setShowEditCancellationModal(false);
      setIsSavingProfile(true);
      try {
        const updated = await businessProfileApi.upsertProfile({
          display_name: (profileDisplayName || '').trim() || null as any,
          address: (profileAddress || '').trim() || null as any,
          instagram_url: (profileInstagram || '').trim() || null as any,
          facebook_url: (profileFacebook || '').trim() || null as any,
          tiktok_url: (profileTiktok || '').trim() || null as any,
          min_cancellation_hours: 0,
          client_swap_enabled: clientSwapEnabled,
          require_client_approval: requireClientApproval,
        });
        if (!updated) {
          Alert.alert(t('error.generic', 'Error'), t('settings.profile.cancellationSaveFailed', 'Failed to save cancellation policy'));
          return;
        }
        setProfile(updated);
        setProfileMinCancellationHours(0);
      } finally {
        setIsSavingProfile(false);
      }
      return;
    }
    openCancellationEditor(true);
  };

  const cancellationLimitActive = profileMinCancellationHours > 0 || cancellationSwitchPending;

  // Save single-field handlers (preserve other values)
  const saveAddress = async () => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        address: addressDraft.trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.addressSaveFailed','Failed to save address'));
        return;
      }
      setProfile(updated);
      setProfileAddress(updated.address || '');
      setShowEditAddressModal(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Google Places state for Admin address editing
  const [placesFormattedAddress, setPlacesFormattedAddress] = useState<string>('');
  const [placesPlaceId, setPlacesPlaceId] = useState<string>('');
  const [placesLat, setPlacesLat] = useState<number | null>(null);
  const [placesLng, setPlacesLng] = useState<number | null>(null);
  const justSelectedPlaceRef = useRef(false);
  const placesInputRef = useRef<any>(null);

  // Format a concise address like: "2319 E 3rd St Dayton, OH"
  const formatShortAddress = (details: any, fallbackDescription?: string): string => {
    try {
      const comps = details?.address_components as any[] | undefined;
      if (Array.isArray(comps) && comps.length > 0) {
        const get = (type: string) => comps.find((c) => Array.isArray(c.types) && c.types.includes(type));
        const streetNum = get('street_number')?.short_name || '';
        const route = get('route')?.long_name || '';
        const locality = get('locality')?.long_name || get('sublocality')?.long_name || get('administrative_area_level_2')?.long_name || '';
        const stateShort = get('administrative_area_level_1')?.short_name || '';
        const stateLong = get('administrative_area_level_1')?.long_name || '';
        const state = stateShort || usStateToAbbrev(stateLong) || '';
        const street = `${streetNum} ${route}`.trim();
        const cityState = `${locality}${locality && state ? ', ' : ''}${state}`.trim();
        const shortAddr = [street, cityState].filter(Boolean).join(' ').trim();
        if (shortAddr) return shortAddr.replace(/,\s*,/g, ', ').replace(/[,\s]+$/, '');
      }
      const desc = (fallbackDescription || details?.formatted_address || '').trim();
      if (!desc) return '';
      const parts = desc.split(',').map((p: string) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        const street = parts[0];
        const city = parts[1];
        const stateCandidate = parts[2];
        const state = usStateToAbbrev(stateCandidate) || stateCandidate.split(' ')[0];
        return `${street} ${city}${city && state ? ', ' : ''}${state}`.trim().replace(/,\s*,/g, ', ').replace(/[,\s]+$/, '');
      }
      return parts.join(', ').replace(/,\s*,/g, ', ').replace(/[,\s]+$/, '');
    } catch {
      return (details?.formatted_address || fallbackDescription || '').trim();
    }
  };

  // Force English short address for display (parse formatted_address to English if available)
  const toEnglishShortAddress = (full: string): string => {
    const ascii = full.normalize('NFKD').replace(/[\u0590-\u05FF]/g, '').trim();
    const compressed = compressUsState(ascii || full);
    const withoutCountry = stripCountryNames(compressed || full);
    return (withoutCountry || full).replace(/,\s*,/g, ', ').replace(/[,\s]+$/, '');
  };

  // US state mapping (long -> abbrev)
  const US_STATES: Record<string, string> = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC'
  };

  const usStateToAbbrev = (nameOrAbbrev?: string): string | '' => {
    if (!nameOrAbbrev) return '';
    const s = String(nameOrAbbrev).trim();
    if (s.length === 2 && /^[A-Z]{2}$/.test(s)) return s;
    const mapped = US_STATES[s] || US_STATES[capitalizeWords(s)];
    return mapped || '';
  };

  const capitalizeWords = (str: string): string => str.replace(/\b\w/g, (m) => m.toUpperCase());

  const compressUsState = (input: string): string => {
    let out = input;
    Object.keys(US_STATES).forEach((long) => {
      const abbr = US_STATES[long];
      const re = new RegExp(`(^|,\s*)${long}(?=\s|,|$)`, 'gi');
      out = out.replace(re, (match, p1) => `${p1}${abbr}`);
    });
    return out;
  };

  const stripCountryNames = (input: string): string => {
    // Remove common country suffixes like ", USA" / ", United States" / ", US" and Hebrew variant
    let out = input.replace(/,\s*(United States(?: of America)?|USA|U\.S\.A\.|US|ארצות הברית)\b/gi, '');
    // Also remove standalone country names at end without comma
    out = out.replace(/\s*(United States(?: of America)?|USA|U\.S\.A\.|US|ארצות הברית)\s*$/gi, '');
    return out;
  };

  const businessAddressDisplay = useMemo(() => {
    const source = (profileAddress || '').trim();
    if (!source) return '';
    // Keep Hebrew/RTL text as stored — old helper stripped \u0590-\u05FF and looked like "not saved"
    if (/[\u0590-\u05FF]/.test(source)) return source;
    return toEnglishShortAddress(source);
  }, [profileAddress]);

  const saveBusinessAddress = async () => {
    if (!placesFormattedAddress) {
      Alert.alert(t('error.generic','Error'), t('settings.profile.addressSelectRequired','Please select an address'));
      return;
    }
    setAddressDraft(placesFormattedAddress);
    await saveAddress();
  };

  const saveInstagram = async () => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        address: (profileAddress || '').trim() || null as any,
        instagram_url: instagramDraft.trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.instagramSaveFailed','Failed to save Instagram link'));
        return;
      }
      setProfile(updated);
      setProfileInstagram(updated.instagram_url || '');
      setShowEditInstagramModal(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveFacebook = async () => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: facebookDraft.trim() || null as any,
        tiktok_url: (profileTiktok || '').trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.facebookSaveFailed','Failed to save Facebook link'));
        return;
      }
      setProfile(updated);
      setProfileFacebook(updated.facebook_url || '');
      setShowEditFacebookModal(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveTiktok = async () => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
        tiktok_url: tiktokDraft.trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.tiktokSaveFailed','Failed to save TikTok link'));
        return;
      }
      setProfile(updated);
      setProfileTiktok((updated as any).tiktok_url || '');
      setShowEditTiktokModal(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveCancellationHours = async () => {
    if (!canSeeAddEmployee) return;
    const hours = parseInt(cancellationHoursDraft);
    if (isNaN(hours) || hours < 0 || hours > 168) {
      Alert.alert(t('error.generic','Error'), t('settings.profile.cancellationInvalid','Please enter a valid number between 0 and 168 hours'));
      return;
    }
    
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        display_name: (profileDisplayName || '').trim() || null as any,
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
        tiktok_url: (profileTiktok || '').trim() || null as any,
        min_cancellation_hours: hours,
      });
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.cancellationSaveFailed','Failed to save cancellation policy'));
        return;
      }
      setProfile(updated);
      const mh = updated.min_cancellation_hours;
      setProfileMinCancellationHours(typeof mh === 'number' && !Number.isNaN(mh) ? mh : 0);
      setCancellationSwitchPending(false);
      setShowCancellationDropdown(false);
      setShowEditCancellationModal(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const animateCloseSheet = (after?: () => void) => {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      dragY.setValue(0);
      if (finished) after && after();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        return g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx);
      },
      onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        const delta = Math.max(0, g.dy);
        dragY.setValue(delta);
      },
      onPanResponderRelease: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        const shouldClose = g.dy > 140 || g.vy > 0.9;
        if (shouldClose) {
          if (showServicesModal) {
            animateCloseSheet(() => setShowServicesModal(false));
          }
        } else {
          Animated.timing(dragY, {
            toValue: 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.timing(dragY, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;
 
  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    router.replace('/login');
  };

  const openServicesModal = async () => {
    setShowServicesModal(true);
    setIsLoadingServices(true);
    setServicesError(null);
    setIsAddingService(false);
    setExpandedServiceId(null);
    setServicesReorderMode(false);
    try {
      const data = await servicesApi.getAllServices();
      // Filter to only services belonging to the logged-in worker
      const myServices = (data || []).filter((s: any) => String(s?.worker_id || '') === String(user?.id || ''));
      setEditableServices(sortServicesLikeClientBooking(myServices || []));
    } catch (e) {
      setServicesError(t('settings.services.loadFailed','Error loading services'));
    } finally {
      setIsLoadingServices(false);
    }
  };

  const closeServicesModal = () => {
    setShowServicesModal(false);
    setServicesReorderMode(false);
    setExpandedServiceId(null);
    setIsAddingService(false);
  };


  const updateLocalServiceField = <K extends keyof Service>(id: string, key: K, value: Service[K]) => {
    setEditableServices(prev => prev.map(s => (s.id === id ? { ...s, [key]: value } : s)));
  };

  // Add Service modal state
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [showCountsDropdown, setShowCountsDropdown] = useState(false);
  
  
  
  const [addSvcName, setAddSvcName] = useState('');
  const [addSvcPrice, setAddSvcPrice] = useState<string>('0');
  // removed per-service duration field
  const [addSvcDuration, setAddSvcDuration] = useState<string>('60');
  // category removed
  const [addSvcIsSaving, setAddSvcIsSaving] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  // null = picker is for add-new-service; string = picker is for editing that service id
  const [editingServiceDurationId, setEditingServiceDurationId] = useState<string | null>(null);
  // category removed
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  // add-service image upload
  const [addSvcImageUrl, setAddSvcImageUrl] = useState<string | null>(null);
  const [addSvcUploadingImage, setAddSvcUploadingImage] = useState(false);

  // Uploading indicator for per-service image update
  const [uploadingServiceId, setUploadingServiceId] = useState<string | null>(null);


  /** 5 דק׳ עד 3 שעות (180), בקפיצות של 5 דק׳ */
  const durationOptions: number[] = useMemo(
    () => Array.from({ length: (180 - 5) / 5 + 1 }, (_, i) => 5 + i * 5),
    [],
  );

  const guessMimeFromUri = (uriOrName: string): string => {
    const ext = uriOrName.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'heic' || ext === 'heif') return 'image/heic';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  };

  // Guess mime for images and videos
  const guessMimeFromUriForAny = (uriOrName: string): string => {
    const ext = (uriOrName.split('.').pop() || '').toLowerCase().split('?')[0];
    if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    if (ext === '3gp' || ext === '3gpp') return 'video/3gpp';
    return guessMimeFromUri(uriOrName);
  };

  const base64ToUint8Array = (base64: string): Uint8Array => {
    const clean = base64.replace(/^data:[^;]+;base64,/, '');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let outputLength = (clean.length / 4) * 3;
    if (clean.endsWith('==')) outputLength -= 2; else if (clean.endsWith('=')) outputLength -= 1;
    const bytes = new Uint8Array(outputLength);
    let p = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const enc1 = chars.indexOf(clean.charAt(i));
      const enc2 = chars.indexOf(clean.charAt(i + 1));
      const enc3 = chars.indexOf(clean.charAt(i + 2));
      const enc4 = chars.indexOf(clean.charAt(i + 3));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      bytes[p++] = chr1;
      if (enc3 !== 64) bytes[p++] = chr2;
      if (enc4 !== 64) bytes[p++] = chr3;
    }
    return bytes;
  };

  const uploadAdminAvatar = async (asset: { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
      let fileBody: Blob | Uint8Array;
      if (asset.base64) {
        const bytes = base64ToUint8Array(asset.base64);
        fileBody = bytes;
      } else {
        const response = await fetch(asset.uri, { cache: 'no-store' });
        const fetched = await response.blob();
        fileBody = fetched;
        contentType = fetched.type || contentType;
      }
      const extGuess = (contentType.split('/')![1] || 'jpg').toLowerCase();
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const filePath = `avatars/${user?.id || 'anon'}/${Date.now()}_${randomId()}.${extGuess}`;
      const { error: uploadError } = await supabase.storage.from('app_design').upload(filePath, fileBody as any, { contentType, upsert: false });
      if (uploadError) {
        console.error('avatar upload error', uploadError);
        return null;
      }
      const { data } = supabase.storage.from('app_design').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('avatar upload exception', e);
      return null;
    }
  };

  const handlePickAdminAvatar = async () => {
    try {
      if (!user?.id) return;
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionRequired','Permission Required'), t('profile.permissionGallery','Please allow gallery access to pick a profile picture'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: false,
        quality: 0.9,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const a: any = result.assets[0];
      setIsUploadingAdminAvatar(true);
      const uploadedUrl = await uploadAdminAvatar({
        uri: a.uri,
        base64: a.base64 ?? null,
        mimeType: a.mimeType ?? null,
        fileName: a.fileName ?? null,
      });
      if (!uploadedUrl) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.uploadFailed','Image upload failed'));
        return;
      }
      const updated = await usersApi.updateUser(user.id as any, { image_url: uploadedUrl } as any);
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.saveImageFailed','Failed to save profile image'));
        return;
      }
      updateUserProfile({ image_url: uploadedUrl } as any);
    } catch (e) {
      console.error('pick/upload admin avatar failed', e);
      Alert.alert(t('error.generic','Error'), t('settings.profile.uploadFailed','Image upload failed'));
    } finally {
      setIsUploadingAdminAvatar(false);
    }
  };

  const uploadBusinessVideo = async (asset: { uri: string; mimeType?: string | null; fileName?: string | null }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUriForAny(asset.fileName || asset.uri);
      const response = await fetch(asset.uri, { cache: 'no-store' });
      const arrayBuffer = await response.arrayBuffer();
      const fileBody = new Uint8Array(arrayBuffer);
      contentType = response.headers.get('content-type') || contentType || 'video/mp4';
      const extGuess = (contentType.split('/')[1] || 'mp4').toLowerCase();
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const filePath = `business-videos/${Date.now()}_${randomId()}.${extGuess}`;
      const { error } = await supabase.storage.from('app_design').upload(filePath, fileBody, { contentType, upsert: false });
      if (error) {
        console.error('business video upload error', error);
        return null;
      }
      const { data } = supabase.storage.from('app_design').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('business video upload exception', e);
      return null;
    }
  };

  const uploadServiceImage = async (asset: { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
      let fileBody: Blob | Uint8Array;
      if (asset.base64) {
        const bytes = base64ToUint8Array(asset.base64);
        fileBody = bytes;
      } else {
        const response = await fetch(asset.uri, { cache: 'no-store' });
        const fetched = await response.blob();
        fileBody = fetched;
        contentType = fetched.type || contentType;
      }
      const extGuess = (contentType.split('/')[1] || 'jpg').toLowerCase();
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const filePath = `services/${Date.now()}_${randomId()}.${extGuess}`;
      // Upload to new unified bucket 'app_design'
      const { error } = await supabase.storage.from('app_design').upload(filePath, fileBody as any, { contentType, upsert: false });
      if (error) {
        console.error('upload error', error);
        return null;
      }
      const { data } = supabase.storage.from('app_design').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('upload exception', e);
      return null;
    }
  };

  const handlePickServiceImage = async (serviceId: string) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionRequired','Permission Required'), t('profile.permissionGallery','Please allow gallery access to pick a profile picture'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: false,
        quality: 0.9,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const a: any = result.assets[0];
      setUploadingServiceId(serviceId);
      const uploadedUrl = await uploadServiceImage({
        uri: a.uri,
        base64: a.base64 ?? null,
        mimeType: a.mimeType ?? null,
        fileName: a.fileName ?? null,
      });
      if (!uploadedUrl) {
        Alert.alert(t('error.generic','Error'), t('settings.profile.uploadFailed','Image upload failed'));
        return;
      }
      const persisted = await updateService(serviceId, { image_url: uploadedUrl } as any);
      if (!persisted) {
        Alert.alert(t('error.generic','Error'), t('settings.services.saveFailed','Failed to save service'));
        return;
      }
      setEditableServices((prev) => prev.map((s) => (s.id === serviceId ? persisted : s)));
    } catch (e) {
      Alert.alert(t('error.generic','Error'), t('settings.profile.uploadFailed','Image upload failed'));
    } finally {
      setUploadingServiceId(null);
    }
  };

  const handleOpenAddService = () => {
    setServicesReorderMode(false);
    setAddSvcName('');
    setAddSvcPrice('0');
    setAddSvcDuration('60');
    setAddSvcImageUrl(null);
    setIsAddingService(true);
  };

  const handleCreateService = async () => {
    if (!addSvcName.trim()) {
      Alert.alert(t('error.generic','Error'), t('settings.services.nameRequired','Please enter a service name'));
      return;
    }
    setAddSvcIsSaving(true);
    try {
      const created = await createService({
        name: addSvcName.trim(),
        price: parseFloat(addSvcPrice) || 0,
        duration_minutes: parseInt(addSvcDuration, 10) || 60,
        is_active: true,
        worker_id: (user?.id as any) as any,
        image_url: addSvcImageUrl || undefined,
      } as any);
      if (created) {
        const nextOrder = editableServices.length;
        const withOrder = await updateService(created.id, { order_index: nextOrder } as any);
        const row: Service = (withOrder as Service) || { ...created, order_index: nextOrder };
        setEditableServices((prev) => sortServicesLikeClientBooking([...prev, row]));
        setIsAddingService(false);
        setAddSvcName('');
        setAddSvcPrice('0');
        setAddSvcDuration('60');
        setAddSvcImageUrl(null);
      } else {
        Alert.alert(t('error.generic','Error'), t('settings.services.createFailed','Failed to create service'));
      }
    } catch (e) {
      Alert.alert(t('error.generic','Error'), t('settings.services.createFailed','Failed to create service'));
    } finally {
      setAddSvcIsSaving(false);
    }
  };

  const handleDeleteService = (id: string) => {
    Alert.alert(t('settings.services.deleteTitle','Delete service'), t('settings.services.deleteConfirm','Are you sure you want to delete this service?'), [
      { text: t('cancel','Cancel'), style: 'cancel' },
      {
        text: t('settings.services.delete','Delete'), 
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteService(id);
          if (ok) {
            setEditableServices(prev => prev.filter(s => s.id !== id));
            if (expandedServiceId === id) setExpandedServiceId(null);
          } else {
            Alert.alert(t('error.generic','Error'), t('settings.services.deleteFailed','Failed to delete service'));
          }
        }
      }
    ]);
  };

  const handleServicesDragEnd = useCallback(({ data: next }: { data: Service[] }) => {
    const withIdx = next.map((s, i) => ({ ...s, order_index: i }));
    setEditableServices(withIdx);
    void (async () => {
      const ok = await updateServicesOrderIndexes(withIdx.map((s) => s.id));
      if (!ok) {
        Alert.alert(t('error.generic', 'Error'), t('settings.services.orderSaveFailed'));
      }
    })();
  }, [t]);

  const handleSaveService = async (service: Service) => {
    setSavingServiceId(service.id);
    try {
      const updated = await updateService(service.id, {
        name: service.name,
        price: service.price,
        image_url: service.image_url,
        duration_minutes: service.duration_minutes,
        is_active: service.is_active,
        worker_id: (user?.id as any) as any,
      } as any);
      if (!updated) {
        Alert.alert(t('error.generic','Error'), t('settings.services.saveFailed','Failed to save service'));
        return;
      }
      setEditableServices(prev => prev.map(s => (s.id === service.id ? updated : s)));
      setExpandedServiceId(null);
      setSavedServiceId(service.id);
      setTimeout(() => setSavedServiceId(null), 2000);
    } catch (e) {
      Alert.alert(t('error.generic','Error'), t('settings.services.saveFailed','Failed to save service'));
    } finally {
      setSavingServiceId(null);
    }
  };

  // handleSendNotification removed (handled by AdminBroadcastComposer)

  const handleCallSupport = async () => {
    const email = 'slotlysapp@gmail.com';
    const subject = 'Support Request';
    const body = 'Hello Slotlys Support Team,\n\nI need assistance with:\n\n';
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t('error.generic','Error'), t('common.emailOpenFailed','Cannot open email client on this device'));
      }
    } catch {
      Alert.alert(t('error.generic','Error'), t('common.emailOpenFailed','Cannot open email client on this device'));
    }
  };

  // Title helpers removed (handled by AdminBroadcastComposer)
  
  // Recurring appointment modal state
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const settingsScreenTabs = useMemo(
    () => {
      const list: { id: string; label: string }[] = [];
      /** LTR array order: account → … → appointments. SettingsScreenTabs reverses in RTL for correct visual + indicator. */
      if (user) {
        list.push({
          id: 'account',
          label: t('settings.sections.accountManagement', 'Account Management'),
        });
      }
      list.push({
        id: 'security',
        label: t('settings.sections.securitySupport', 'Security & support'),
      });
      if (canSeeAddEmployee) {
        list.push({
          id: 'design',
          label: t('settings.sections.designApp', 'Design Application'),
        });
        list.push({
          id: 'business',
          label: t('settings.sections.businessDetails', 'Business details'),
        });
        list.push({ id: 'employees', label: t('settings.sections.employees', 'Employees') });
      }
      list.push({ id: 'services', label: t('settings.sections.services', 'Services') });
      list.push({
        id: 'appointments',
        label: t('settings.sections.appointments', 'Appointments'),
      });
      return list;
    },
    [canSeeAddEmployee, user, t],
  );

  const [activeSettingsTab, setActiveSettingsTab] = useState<string>('appointments');
  const { tab: settingsDeepTabParam } = useLocalSearchParams<{ tab?: string | string[] }>();

  useEffect(() => {
    const raw = settingsDeepTabParam;
    const tab = Array.isArray(raw) ? raw[0] : raw;
    if (!tab || typeof tab !== 'string') return;
    const ids = settingsScreenTabs.map((x) => x.id);
    if (!ids.includes(tab)) return;
    setActiveSettingsTab(tab);
    router.setParams({ tab: undefined });
  }, [settingsDeepTabParam, settingsScreenTabs, router]);

  useEffect(() => {
    const ids = settingsScreenTabs.map((x) => x.id);
    if (ids.length && !ids.includes(activeSettingsTab)) {
      setActiveSettingsTab(ids[0]!);
    }
  }, [settingsScreenTabs, activeSettingsTab]);

  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [isSubmittingRecurring, setIsSubmittingRecurring] = useState(false);
  const [showManageRecurringModal, setShowManageRecurringModal] = useState(false);
  const [isLoadingRecurring, setIsLoadingRecurring] = useState(false);
  const [recurringList, setRecurringList] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Array<{ name: string; phone: string }>>([]);
  const [selectedClient, setSelectedClient] = useState<{ name: string; phone: string } | null>(null);
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | null>(null);
  const [showDayDropdown, setShowDayDropdown] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [recurringServices, setRecurringServices] = useState<Service[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState<number>(1);
  const [showRepeatDropdown, setShowRepeatDropdown] = useState(false);

  // Stepper state for recurring appointment modal
  const [recStep, setRecStep] = useState<number>(0); // 0: client, 1: service, 2: day, 3: time, 4: repeat
  const recTranslateX = useRef(new Animated.Value(0)).current;
  const recProgressAnim = useRef(new Animated.Value(0)).current;
  // Give the steps viewport an initial width so content doesn't overflow on first render
  const initialRecViewportWidth = Math.max(1, (Dimensions.get('window')?.width || 0) - 40);
  const [recViewportWidth, setRecViewportWidth] = useState<number>(initialRecViewportWidth);
  const [recRenderKey, setRecRenderKey] = useState<number>(0);

  const goToRecStep = (next: number, animate: boolean = true) => {
    const maxStep = 4;
    const clamped = Math.max(0, Math.min(maxStep, next));
    setRecStep(clamped);
    const widthToUse = recViewportWidth || 0;
    if (widthToUse && animate) {
      Animated.timing(recTranslateX, {
        toValue: -clamped * widthToUse,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      Animated.timing(recProgressAnim, {
        toValue: clamped / maxStep,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      recTranslateX.setValue(-(clamped * widthToUse));
      recProgressAnim.setValue(clamped / maxStep);
    }
  };
  const goNextRec = () => goToRecStep(recStep + 1);
  const goBackRec = () => goToRecStep(recStep - 1);

  // Employees management modal state
  const [showManageEmployeesModal, setShowManageEmployeesModal] = useState(false);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [manageEmpSearch, setManageEmpSearch] = useState('');
  const [bookingOpenDaysByUser, setBookingOpenDaysByUser] = useState<Record<string, number>>({});
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [savingBookingDaysForUser, setSavingBookingDaysForUser] = useState<string | null>(null);
  
  const filteredAdmins = useMemo(() => {
    const q = (manageEmpSearch || '').trim().toLowerCase();
    if (!q) return adminUsers;
    return (adminUsers || []).filter((u: any) => {
      const name = String(u?.name || '').toLowerCase();
      const phone = String(u?.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [adminUsers, manageEmpSearch]);

  const handleSaveBookingDaysForUser = async (userId: string, days: number) => {
    setSavingBookingDaysForUser(userId);
    try {
      await businessProfileApi.setBookingOpenDaysForUser(userId, days);
      setBookingOpenDaysByUser((prev) => ({ ...prev, [userId]: days }));
      Alert.alert(t('success.generic','Success'), t('settings.profile.bookingWindowSaved','Booking window updated successfully'));
    } catch (error) {
      console.error('Error saving booking days for user:', error);
      Alert.alert(t('error.generic','Error'), t('settings.profile.bookingWindowSaveFailed','Failed to save booking window'));
    } finally {
      setSavingBookingDaysForUser(null);
    }
  };

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const timeOptions = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2,'0')}:00`);

  // Compute next date string (YYYY-MM-DD, local) for a given dayOfWeek (0..6) from today
  const getNextDateForDay = (dayOfWeek: number): string => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const currentDow = start.getDay();
    const delta = (dayOfWeek - currentDow + 7) % 7; // 0..6
    const target = new Date(start);
    target.setDate(start.getDate() + delta);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Validate that the selected time is still available for the nearest occurrence of the chosen day for this barber
  const isTimeAvailable = async (dayOfWeek: number, timeHHmm: string): Promise<boolean> => {
    try {
      const businessId = getBusinessId();
      
      // 1) Check conflicts with other recurring rules for this barber
      let recurringQuery = supabase
        .from('recurring_appointments')
        .select('slot_time')
        .eq('business_id', businessId)
        .eq('day_of_week', dayOfWeek);
      // Only filter by user_id if the column exists (avoid schema errors)
      try {
        if (user?.id) {
          recurringQuery = recurringQuery.eq('user_id', user.id);
        }
      } catch {
        // If user_id column doesn't exist, just get all recurring appointments for this day
      }
      const { data: recurring } = await recurringQuery;
      const recurringTimes = new Set((recurring || []).map((r: any) => String(r.slot_time).slice(0,5)));
      if (recurringTimes.has(timeHHmm)) return false;

      // 2) Check conflicts with existing booked slots on ANY date that falls on this day of week
      // Limit to recent dates to avoid loading too much data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      let bookedQuery = supabase
        .from('appointments')
        .select('slot_time, slot_date, is_available')
        .eq('business_id', businessId)
        .eq('is_available', false)
        .gte('slot_date', thirtyDaysAgo.toISOString().split('T')[0])
        .lte('slot_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .limit(1000); // Limit results to prevent hanging
      if (user?.id) {
        bookedQuery = bookedQuery.or(`user_id.eq.${user.id},user_id.is.null`);
      } else {
        bookedQuery = bookedQuery.is('user_id', null);
      }
      const { data: allBooked } = await bookedQuery;
      
      // Filter to only appointments that fall on the selected day of week
      const bookedOnThisDay = (allBooked || []).filter((apt: any) => {
        const aptDate = new Date(apt.slot_date + 'T00:00:00'); // Local date
        return aptDate.getDay() === dayOfWeek;
      });
      const bookedTimes = new Set(bookedOnThisDay.map((s: any) => String(s.slot_time).slice(0,5)));
      if (bookedTimes.has(timeHHmm)) return false;

      return true;
    } catch {
      // If check fails for any reason, be conservative and prevent selection
      return false;
    }
  };

  const loadAvailableTimesForDay = async (dayOfWeek: number) => {
    setIsLoadingTimes(true);
    setAvailableTimes([]);
    try {
      const businessId = getBusinessId();
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout loading times')), 10000)
      );
      
      const loadPromise = (async () => {
      
      // Fetch business hours for day: prefer user-specific row, fallback to global (user_id IS NULL)
      let bhRow: any | null = null;
      try {
        const { data: bhUser } = await supabase
          .from('business_hours')
          .select('*')
          .eq('business_id', businessId)
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true)
          .eq('user_id', user?.id)
          .maybeSingle();
        if (bhUser) bhRow = bhUser;
      } catch {}
      if (!bhRow) {
        const { data: bhGlobal } = await supabase
          .from('business_hours')
          .select('*')
          .eq('business_id', businessId)
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true)
          .is('user_id', null)
          .maybeSingle();
        bhRow = bhGlobal || null;
      }

      if (!bhRow) {
        setAvailableTimes([]);
        return;
      }

      // Normalize to HH:mm to avoid HH:mm:ss mismatches
      const normalize = (s: any) => String(s).slice(0, 5);

      // Build windows minus breaks
      type Window = { start: string; end: string };
      const startTime = normalize((bhRow as any).start_time);
      const endTime = normalize((bhRow as any).end_time);
      const baseWindows: Window[] = [{ start: startTime, end: endTime }];
      const brks: Array<{ start_time: string; end_time: string }> = (bhRow as any).breaks || [];
      const singleBreak = (bhRow.break_start_time && bhRow.break_end_time)
        ? [{ start_time: (bhRow as any).break_start_time, end_time: (bhRow as any).break_end_time }]
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

      // Enumerate options by slot duration (prefer selected service's duration)
      const dur: number = (selectedService?.duration_minutes && selectedService.duration_minutes > 0)
        ? (selectedService.duration_minutes as number)
        : (bhRow.slot_duration_minutes && bhRow.slot_duration_minutes > 0 ? bhRow.slot_duration_minutes : 60);
      const addMinutes = (hhmm: string, minutes: number): string => {
        const [h, m] = hhmm.split(':').map((x: string) => parseInt(x, 10));
        const total = h * 60 + m + minutes;
        const hh = Math.floor(total / 60) % 24;
        const mm = total % 60;
        return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
      };

      const compareTimes = (a: string, b: string) => a.localeCompare(b);
      const baseTimes: string[] = [];
      for (const w of windows) {
        let t = w.start as string;
        while (compareTimes(addMinutes(t, dur), w.end) <= 0) {
          baseTimes.push(t.slice(0,5));
          t = addMinutes(t, dur);
        }
      }

      // Exclude conflicts with other recurring rules for this barber (same day/time)
      let recurringQuery = supabase
        .from('recurring_appointments')
        .select('slot_time')
        .eq('business_id', businessId)
        .eq('day_of_week', dayOfWeek);
      // Only filter by user_id if the column exists (avoid schema errors)
      try {
        if (user?.id) {
          recurringQuery = recurringQuery.eq('user_id', user.id);
        }
      } catch {
        // If user_id column doesn't exist, just get all recurring appointments for this day
      }
      const { data: recurring } = await recurringQuery;
      const recurringTimes = new Set((recurring || []).map((r: any) => String(r.slot_time).slice(0,5)));

      // Exclude conflicts with existing booked slots on ANY date that falls on this day of week
      let bookedQuery = supabase
        .from('appointments')
        .select('slot_time, slot_date, is_available')
        .eq('business_id', businessId)
        .eq('is_available', false);
      if (user?.id) {
        bookedQuery = bookedQuery.or(`user_id.eq.${user.id},user_id.is.null`);
      } else {
        bookedQuery = bookedQuery.is('user_id', null);
      }
      const { data: allBooked } = await bookedQuery;
      
      // Filter to only appointments that fall on the selected day of week
      const bookedOnThisDay = (allBooked || []).filter((apt: any) => {
        const aptDate = new Date(apt.slot_date + 'T00:00:00'); // Local date
        return aptDate.getDay() === dayOfWeek;
      });
      const bookedTimes = new Set(bookedOnThisDay.map((s: any) => String(s.slot_time).slice(0,5)));

      const filtered = baseTimes.filter(t => !recurringTimes.has(t) && !bookedTimes.has(t));
      setAvailableTimes(filtered);
      // Reset selected time if it became invalid
      if (selectedTime && !filtered.includes(selectedTime)) {
        setSelectedTime(null);
      }
      })();
      
      // Race between loading and timeout
      await Promise.race([loadPromise, timeoutPromise]);
      
    } catch (error) {
      console.error('Error loading available times:', error);
      setAvailableTimes([]);
      // Show error to user
      Alert.alert(t('error.generic','Error'), t('settings.recurring.timesLoadFailed','Failed to load available times. Please try again.'));
    } finally {
      setIsLoadingTimes(false);
    }
  };

  // Reload available times when the day changes or when opening modal
  useEffect(() => {
    if (showRecurringModal && Number.isInteger(selectedDayOfWeek as any)) {
      loadAvailableTimesForDay(selectedDayOfWeek as number);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecurringModal, selectedDayOfWeek]);

  useEffect(() => {
    if (showRecurringModal) {
      // Preload services list for selection
      servicesApi
        .getAllServices()
        .then((all) => {
          const mine = (all || []).filter(
            (s) => String(s.worker_id || '') === String(user?.id || '')
          );
          setRecurringServices(mine);
        })
        .catch(() => setRecurringServices([]));
      // Reset fields
      setClientSearch('');
      setSelectedClient(null);
      setSelectedDayOfWeek(null);
      setSelectedTime(null);
      setSelectedService(null);
      setRepeatWeeks(1);
      setShowDayDropdown(false);
      setShowTimeDropdown(false);
      setShowServiceDropdown(false);
      setShowClientDropdown(false);
      setShowRepeatDropdown(false);
      // Load initial client list (show all clients by default)
      searchClients('');
      // Reset stepper
      setTimeout(() => {
        setRecStep(0);
        recTranslateX.setValue(0);
        recProgressAnim.setValue(0);
        setRecRenderKey((k) => k + 1);
      }, 0);
    }
  }, [showRecurringModal, user?.id]);

  const searchClients = async (q: string) => {
    setClientSearch(q);
    const query = (q || '').trim();
    const businessId = getBusinessId();
    
    let builder = supabase
      .from('users')
      .select('id, name, phone')
      .eq('user_type', 'client')
      .eq('business_id', businessId)
      .order('name');
    if (query.length > 0) {
      builder = builder.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
    }
    const { data, error } = await builder;
    if (error) {
      setClientResults([]);
      return;
    }
    // Exclude clients that already have a recurring appointment with this barber
    const { data: recs } = await supabase
      .from('recurring_appointments')
      .select('client_phone')
      .eq('business_id', businessId)
      .eq('admin_id', user?.id);
    const recurringPhones = new Set((recs || []).map((r: any) => String(r.client_phone).trim()).filter(Boolean));

    const filtered = (data || [])
      .filter((u: any) => u.phone && u.phone.trim() !== '')
      .filter((u: any) => !recurringPhones.has(String(u.phone).trim()));

    setClientResults(filtered);
  };

  const handleSubmitRecurring = async () => {
    if (!selectedClient || selectedDayOfWeek === null || !selectedTime || !selectedService) {
      Alert.alert(t('error.generic','Error'), t('settings.recurring.fillAll','Please fill all fields: client, day, time, and service'));
      return;
    }
    // Final guard before creating: verify time is still available for the nearest occurrence
    const stillAvailable = await isTimeAvailable(selectedDayOfWeek as number, selectedTime as string);
    if (!stillAvailable) {
      Alert.alert(t('settings.recurring.slotTakenTitle','Slot taken'), t('settings.recurring.slotTaken','The selected time is already booked this week. Please choose another time.'));
      return;
    }
    setIsSubmittingRecurring(true);
    try {
      const recurringData: any = {
        client_name: selectedClient.name || 'Client',
        client_phone: selectedClient.phone,
        day_of_week: selectedDayOfWeek,
        slot_time: selectedTime,
        service_name: selectedService.name,
        service_id: selectedService.id, // Add service_id reference
        repeat_interval: repeatWeeks,
        business_id: getBusinessId(), // Add business_id from the current business
      };
      // Add admin_id (the current admin creating the recurring appointment)
      if (user?.id) {
        recurringData.admin_id = user.id;
      }
      // Add client_id if the selected client has an ID (optional)
      if ((selectedClient as any).id) {
        recurringData.client_id = (selectedClient as any).id;
      }
      const created = await recurringAppointmentsApi.create(recurringData);
      if (created) {
        Alert.alert(t('success.generic','Success'), t('settings.recurring.createSuccess','Recurring appointment created. The slot will be kept after weekly generation.'));
        setShowRecurringModal(false);
        try {
          const items = await recurringAppointmentsApi.listAll();
          setRecurringList(items);
        } catch {
          /* list refresh optional */
        }
      } else {
        Alert.alert(t('error.generic','Error'), t('settings.recurring.createFailed','Failed to create recurring appointment'));
      }
    } catch (e) {
      Alert.alert(t('error.generic','Error'), t('settings.recurring.createFailed','Failed to create recurring appointment'));
    } finally {
      setIsSubmittingRecurring(false);
    }
  };



  const renderSettingItem = (
    icon: React.ReactNode,
    title: string,
    subtitle?: string,
    rightComponent?: React.ReactNode,
    onPress?: () => void,
    swapIconAndRight?: boolean
  ) => {
    return (
      <View>
        <TouchableOpacity 
          style={styles.settingItem}
          onPress={onPress}
          disabled={!onPress}
        >
          {/* LTR: icon left, text center-left, chevron right */}
          {!rightComponent && onPress ? (
            <>
              <View style={styles.settingIcon}>{icon}</View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>{title}</Text>
                {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
              </View>
              <View style={styles.settingChevron}><ChevronLeft size={20} color={businessColors.primary} /></View>
            </>
          ) : (
            <>
              {swapIconAndRight ? (
                <>
                  <View style={styles.settingIcon}>{icon}</View>
                  <View style={styles.settingContent}>
                    <Text style={styles.settingTitle}>{title}</Text>
                    {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
                  </View>
                  <View>{rightComponent}</View>
                </>
              ) : (
                <>
                  <View style={styles.settingIcon}>{icon}</View>
                  <View style={styles.settingContent}>
                    <Text style={styles.settingTitle}>{title}</Text>
                    {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
                  </View>
                  <View>{rightComponent}</View>
                </>
              )}
            </>
          )}
        </TouchableOpacity>
        <View style={styles.settingDivider} />
      </View>
    );
  };

  const renderSettingItemLTR = (
    icon: React.ReactNode,
    title: string,
    subtitle?: string,
    rightComponent?: React.ReactNode,
    onPress?: () => void,
    swapIconAndRight?: boolean,
    disabled?: boolean
  ) => {
    return (
      <View>
        <TouchableOpacity 
          style={[styles.settingItemLTR, disabled && styles.settingItemDisabled]}
          onPress={onPress}
          disabled={!onPress || disabled}
        >
          {/* Perfect LTR: icon left, text left, chevron right */}
          {!rightComponent && onPress ? (
            <>
              <View style={styles.settingIconLTR}>{icon}</View>
              <View style={styles.settingContentLTR}>
                <Text style={styles.settingTitleLTR}>{title}</Text>
                {subtitle && <Text style={styles.settingSubtitleLTR}>{subtitle}</Text>}
              </View>
              <View style={styles.settingChevronLTR}><ChevronLeft size={20} color={businessColors.primary} /></View>
            </>
          ) : (
            <>
              {swapIconAndRight ? (
                <>
                  <View style={styles.settingIconLTR}>{icon}</View>
                  <View style={styles.settingContentLTR}>
                    <Text style={styles.settingTitleLTR}>{title}</Text>
                    {subtitle && <Text style={styles.settingSubtitleLTR}>{subtitle}</Text>}
                  </View>
                  <View>{rightComponent}</View>
                </>
              ) : (
                <>
                  <View style={styles.settingIconLTR}>{icon}</View>
                  <View style={styles.settingContentLTR}>
                    <Text style={styles.settingTitleLTR}>{title}</Text>
                    {subtitle && <Text style={styles.settingSubtitleLTR}>{subtitle}</Text>}
                  </View>
                  <View>{rightComponent}</View>
                </>
              )}
            </>
          )}
        </TouchableOpacity>
        <View style={styles.settingDivider} />
      </View>
    );
  };
  
  return (
    <SafeAreaView style={[styles.container, styles.settingsPageRoot]} edges={['left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.settingsScroll}>
        <View style={[styles.settingsScrollFill, styles.settingsPageColumn]}>
          <View style={styles.adminProfileHeaderRoot}>
            <View style={styles.adminProfileHeaderColumn}>
              <View style={styles.adminProfileBlueBackdrop} onLayout={onAdminProfileLavaLayout} pointerEvents="none">
                <LinearGradient
                  colors={[businessColors.primary, businessColors.primary + 'CC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1.1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                {adminProfileLavaLayout.w > 0 && adminProfileLavaLayout.h > 0 ? (
                  <BrandLavaLampBackground
                    primaryColor={businessColors.primary}
                    baseColor={businessColors.primary}
                    layoutWidth={adminProfileLavaLayout.w}
                    layoutHeight={adminProfileLavaLayout.h}
                    emphasis="bold"
                    count={6}
                    duration={10000}
                    blurIntensity={28}
                  />
                ) : null}
              </View>
              <View style={[styles.adminProfileHeaderContent, { paddingTop: insets.top + 10 }]}>
                <View style={styles.adminProfileHeaderRowSlot}>
                  <TouchableOpacity
                    style={[
                      styles.adminProfileEditIconHit,
                      I18nManager.isRTL ? styles.adminProfileEditIconHitRtl : styles.adminProfileEditIconHitLtr,
                    ]}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.admin.edit', 'Edit admin')}
                    onPress={() => {
                      setAdminNameDraft(user?.name || '');
                      setAdminPhoneDraft(user?.phone || '');
                      setShowEditAdminModal(true);
                    }}
                  >
                    <View style={styles.adminProfileEditIconCircle}>
                      <Pencil size={20} color="rgba(255,255,255,0.95)" strokeWidth={2} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => {
                      setAdminNameDraft(user?.name || '');
                      setAdminPhoneDraft(user?.phone || '');
                      setShowEditAdminModal(true);
                    }}
                  >
                    <View style={[styles.adminProfileRow, I18nManager.isRTL ? styles.adminProfileRowRtl : styles.adminProfileRowLtr]}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.14)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.adminAvatarRing}
                    >
                      <View style={styles.adminAvatar}>
                        {user?.image_url ? (
                          <Image
                            source={{ uri: (user as any).image_url }}
                            style={styles.adminAvatarImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <User size={32} color={Colors.subtext} strokeWidth={1.75} />
                        )}
                      </View>
                    </LinearGradient>
                    <View style={[styles.adminProfileInfo, I18nManager.isRTL ? styles.adminProfileInfoRtl : styles.adminProfileInfoLtr]}>
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => {
                          setDisplayNameDraft(profileDisplayName || '');
                          setShowEditDisplayNameModal(true);
                        }}
                      >
                        {(profileDisplayName || '').trim() ? (
                          <Text style={styles.adminBusinessDisplayName} numberOfLines={1}>
                            {profileDisplayName}
                          </Text>
                        ) : (
                          <Text style={[styles.adminBusinessDisplayName, { opacity: 0.64 }]} numberOfLines={1}>
                            {t('settings.profile.addBusinessName', 'Add business name')}
                          </Text>
                        )}
                      </TouchableOpacity>
                      <Text style={styles.adminName} numberOfLines={1}>
                        {user?.name || 'Manager'}
                      </Text>
                      <Text style={styles.adminPhone} numberOfLines={1}>
                        {user?.phone || 'Phone Number'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.settingsTabsStickyHost}>
            <SettingsScreenTabs
              tabs={settingsScreenTabs}
              activeId={activeSettingsTab}
              onSelect={setActiveSettingsTab}
              accentColor={businessColors.primary}
            />
          </View>

          <View style={[styles.settingsBelowTabs, { paddingBottom: insets.bottom + 100 }]}>
        {activeSettingsTab === 'appointments' && (
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
            {!canSeeAddEmployee ? (
              <Text style={[styles.settingSubtitleLTR, { paddingHorizontal: 16, paddingBottom: 12 }]}>
                {t(
                  'settings.policies.ownerOnlyEditHint',
                  'Only the business owner (account linked to the business phone) can change these policies.',
                )}
              </Text>
            ) : null}
            {canSeeAddEmployee
              ? renderSettingItemLTR(
                  <Calendar size={20} color={businessColors.primary} />,
                  t('settings.profile.bookingWindowRowTitle', 'How far ahead clients can book you'),
                  t('settings.profile.bookingWindowRowSubtitle', { count: profileBookingOpenDays || 7 }),
                  undefined,
                  () => setShowBookingWindowModal(true)
                )
              : null}
            {isAdmin
              ? renderSettingItem(
                  <Repeat size={20} color={businessColors.primary} />,
                  t('settings.recurring.hubTitle', 'Fixed appointments'),
                  t('settings.recurring.hubSubtitle', 'View the list — tap + to add'),
                  undefined,
                  async () => {
                    setShowManageRecurringModal(true);
                    animateOpenSheet();
                    setIsLoadingRecurring(true);
                    try {
                      const items = await recurringAppointmentsApi.listAll();
                      setRecurringList(items);
                    } finally {
                      setIsLoadingRecurring(false);
                    }
                  },
                )
              : null}
            <View style={styles.settingItemLTR}>
              <View style={styles.settingIconLTR}>
                <Clock size={20} color={businessColors.primary} />
              </View>
              <Pressable
                style={({ pressed }) => [
                  { flex: 1, paddingRight: 8, opacity: cancellationLimitActive && canSeeAddEmployee ? 1 : 0.55 },
                  pressed && cancellationLimitActive && canSeeAddEmployee ? { opacity: 0.88 } : null,
                ]}
                onPress={() => {
                  if (cancellationLimitActive && canSeeAddEmployee) openCancellationEditor(false);
                }}
                disabled={!cancellationLimitActive || !canSeeAddEmployee}
              >
                <Text style={styles.settingTitleLTR}>
                  {t('settings.policies.minCancellationRowTitle', 'Appointment cancellation time')}
                </Text>
                {cancellationLimitActive ? (
                  profileMinCancellationHours > 0 ? (
                    <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                      {t('settings.policies.cancellationLimitActiveSubtitle', {
                        count: profileMinCancellationHours,
                        unit:
                          profileMinCancellationHours === 1
                            ? t('settings.policies.hour', 'hour')
                            : t('settings.policies.hours', 'hours'),
                      })}
                    </Text>
                  ) : (
                    <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                      {t('settings.policies.minCancellationTapToEdit', 'Tap to edit the time')}
                    </Text>
                  )
                ) : (
                  <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                    {t(
                      'settings.policies.cancellationLimitOffSubtitle',
                      'Off — appointments can be cancelled anytime',
                    )}
                  </Text>
                )}
              </Pressable>
              <Switch
                value={cancellationLimitActive}
                onValueChange={(v) => {
                  void handleCancellationSwitchToggle(v);
                }}
                disabled={!canSeeAddEmployee || isSavingProfile}
                trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                thumbColor={
                  cancellationLimitActive
                    ? businessColors.primary
                    : Platform.OS === 'android'
                      ? '#f4f3f4'
                      : undefined
                }
                ios_backgroundColor="#E5E5EA"
              />
            </View>
            <View style={styles.settingDivider} />
            <View style={styles.settingItemLTR}>
              <View style={styles.settingIconLTR}>
                <Bell size={20} color={businessColors.primary} />
              </View>
              <Pressable
                style={({ pressed }) => [
                  { flex: 1, paddingRight: 8, opacity: clientReminderActive && user?.id ? 1 : 0.55 },
                  pressed && clientReminderActive && user?.id ? { opacity: 0.88 } : null,
                ]}
                onPress={() => {
                  if (clientReminderActive && user?.id) openClientReminderModal(false);
                }}
                disabled={!clientReminderActive || !user?.id}
              >
                <Text style={styles.settingTitleLTR}>
                  {t('settings.reminder.clientRowTitle', 'Client reminder before appointment')}
                </Text>
                {clientReminderActive ? (
                  clientReminderMinutes != null && clientReminderMinutes > 0 ? (
                    <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                      {t('settings.reminder.clientRowValueMinutes', { count: clientReminderMinutes })}
                    </Text>
                  ) : (
                    <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                      {t('settings.reminder.clientTapToEdit', 'Tap to edit reminder timing')}
                    </Text>
                  )
                ) : (
                  <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                    {t('settings.reminder.clientRowValueOff', 'Off')}
                  </Text>
                )}
              </Pressable>
              <Switch
                value={clientReminderActive}
                onValueChange={(v) => {
                  void handleClientReminderSwitch(v);
                }}
                disabled={!user?.id || isSavingProfile}
                trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                thumbColor={
                  clientReminderActive
                    ? businessColors.primary
                    : Platform.OS === 'android'
                      ? '#f4f3f4'
                      : undefined
                }
                ios_backgroundColor="#E5E5EA"
              />
            </View>
            <View style={styles.settingDivider} />
            <View style={styles.settingItemLTR}>
              <View style={styles.settingIconLTR}>
                <Clock size={20} color={businessColors.primary} />
              </View>
              <Pressable
                style={({ pressed }) => [
                  { flex: 1, paddingRight: 8, opacity: adminSelfReminderOn ? 1 : 0.55 },
                  pressed && adminSelfReminderOn ? { opacity: 0.88 } : null,
                ]}
                onPress={() => {
                  if (adminSelfReminderOn) openAdminReminderModal(false);
                }}
                disabled={!adminSelfReminderOn || !user?.id}
              >
                <Text style={styles.settingTitleLTR}>
                  {t('settings.reminder.adminRowTitle', 'Self-reminder before appointment')}
                </Text>
                {adminSelfReminderOn ? (
                  adminReminderMinutes != null && adminReminderMinutes > 0 ? (
                    <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                      {t('settings.reminder.clientRowValueMinutes', { count: adminReminderMinutes })}
                    </Text>
                  ) : (
                    <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                      {t('settings.reminder.adminTapToEdit', 'Tap to edit the time')}
                    </Text>
                  )
                ) : (
                  <Text style={[styles.settingSubtitleLTR, { marginTop: 4 }]}>
                    {t('settings.reminder.clientRowValueOff', 'Off')}
                  </Text>
                )}
              </Pressable>
              <Switch
                value={adminSelfReminderOn}
                onValueChange={(v) => {
                  void handleAdminReminderSwitch(v);
                }}
                disabled={!user?.id || isSavingProfile}
                trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                thumbColor={
                  adminSelfReminderOn
                    ? businessColors.primary
                    : Platform.OS === 'android'
                      ? '#f4f3f4'
                      : undefined
                }
                ios_backgroundColor="#E5E5EA"
              />
            </View>
            <View style={styles.settingDivider} />
            <View style={styles.settingItemLTR}>
              <View style={styles.settingIconLTR}>
                <User size={20} color={businessColors.primary} />
              </View>
              <View
                style={{
                  flex: 1,
                  paddingRight: 8,
                  opacity: requireClientApproval && canSeeAddEmployee ? 1 : 0.55,
                }}
              >
                <Text style={styles.settingTitleLTR}>
                  {t('settings.policies.requireClientApprovalTitle', 'Approve new clients')}
                </Text>
                <Text style={styles.settingSubtitleLTR}>
                  {t(
                    'settings.policies.requireClientApprovalSubtitle',
                    'When on, new sign-ups wait for your approval before booking',
                  )}
                </Text>
              </View>
              <Switch
                value={requireClientApproval}
                onValueChange={handleRequireClientApprovalToggle}
                disabled={!canSeeAddEmployee || isSavingProfile}
                trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                thumbColor={
                  requireClientApproval
                    ? businessColors.primary
                    : Platform.OS === 'android'
                      ? '#f4f3f4'
                      : undefined
                }
                ios_backgroundColor="#E5E5EA"
              />
            </View>
            <View style={styles.settingDivider} />
            <View style={styles.settingItemLTR}>
              <View style={styles.settingIconLTR}>
                <Ionicons name="swap-horizontal" size={20} color={businessColors.primary} />
              </View>
              <View
                style={{
                  flex: 1,
                  paddingRight: 8,
                  opacity: clientSwapEnabled && canSeeAddEmployee ? 1 : 0.55,
                }}
              >
                <Text style={styles.settingTitleLTR}>
                  {t('settings.policies.clientSwapTitle', 'Client appointment swap')}
                </Text>
                <Text style={styles.settingSubtitleLTR}>
                  {t('settings.policies.clientSwapSubtitle', 'Allow clients to exchange time slots with each other')}
                </Text>
              </View>
              <Switch
                value={clientSwapEnabled}
                onValueChange={handleClientSwapToggle}
                disabled={!canSeeAddEmployee || isSavingProfile}
                trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                thumbColor={
                  clientSwapEnabled
                    ? businessColors.primary
                    : Platform.OS === 'android'
                      ? '#f4f3f4'
                      : undefined
                }
                ios_backgroundColor="#E5E5EA"
              />
            </View>
          </View>
        </View>
        )}

        {activeSettingsTab === 'services' && (
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
            {renderSettingItem(
              <Pencil size={20} color={businessColors.primary} />,
              t('settings.services.edit', 'Edit services'),
              t('settings.services.editSubtitle', 'Update prices and durations'),
              undefined,
              openServicesModal
            )}
          </View>
        </View>
        )}

        {canSeeAddEmployee && activeSettingsTab === 'business' && (
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
              {renderSettingItemLTR(
                <MapPin size={20} color="#FF3B30" />,
                t('settings.profile.businessAddressTitle', 'Business address'),
                businessAddressDisplay || t('settings.profile.addAddress', 'Add address'),
                undefined,
                openEditAddress
              )}
              <View style={styles.settingItemLTR}>
                <View style={styles.settingIconLTR}><Instagram size={20} color="#E4405F" /></View>
                <View style={{ flex: 1 }}>
                  <InlineEditableRow
                    title={t('settings.profile.instagram', 'Instagram')}
                    value={profileInstagram || ''}
                    placeholder={t('settings.profile.instagramUrlPlaceholder', 'https://instagram.com/yourpage')}
                    keyboardType="url"
                    onSave={handleSaveInstagramInline}
                    chevronColor={businessColors.primary}
                    validate={(v) => v.trim().length === 0 || /^https?:\/\//i.test(v)}
                  />
                </View>
              </View>
              <View style={styles.settingItemLTR}>
                <View style={styles.settingIconLTR}><Facebook size={20} color="#1877F2" /></View>
                <View style={{ flex: 1 }}>
                  <InlineEditableRow
                    title={t('settings.profile.facebook', 'Facebook')}
                    value={profileFacebook || ''}
                    placeholder={t('settings.profile.facebookUrlPlaceholder', 'https://facebook.com/yourpage')}
                    keyboardType="url"
                    onSave={handleSaveFacebookInline}
                    chevronColor={businessColors.primary}
                    validate={(v) => v.trim().length === 0 || /^https?:\/\//i.test(v)}
                  />
                </View>
              </View>
              <View style={styles.settingItemLTR}>
                <View style={styles.settingIconLTR}><Ionicons name="logo-tiktok" size={20} color="#000000" /></View>
                <View style={{ flex: 1 }}>
                  <InlineEditableRow
                    title={t('settings.profile.tiktok', 'TikTok')}
                    value={profileTiktok || ''}
                    placeholder={t('settings.profile.tiktokUrlPlaceholder', 'https://www.tiktok.com/@yourpage')}
                    keyboardType="url"
                    onSave={handleSaveTiktokInline}
                    chevronColor={businessColors.primary}
                    validate={(v) => v.trim().length === 0 || /^https?:\/\//i.test(v)}
                  />
                </View>
              </View>
            </View>
        </View>
        )}

        {canSeeAddEmployee && activeSettingsTab === 'design' && (
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
              <View style={styles.colorPickerWrapper}>
                <ColorPicker
                  currentColor={profile?.primary_color || '#000000'}
                  returnSettingsTab="design"
                />
              </View>
              {renderSettingItemLTR(
                <Ionicons name="images-outline" size={20} color={businessColors.primary} />,
                t('settings.profile.homeAnimationRowTitle', 'Home animation images'),
                t('settings.profile.homeAnimationRowSubtitle', 'Edit the images in the top home animation'),
                undefined,
                () => router.push('/(tabs)/edit-home-hero'),
                false,
                false
              )}
          </View>
        </View>
        )}

        {canSeeAddEmployee && activeSettingsTab === 'employees' && (
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
              {renderSettingItem(
                <User size={20} color={businessColors.primary} />,
                t('settings.admin.addEmployee', 'Add employee user'),
                t('settings.admin.addEmployeeSubtitle', 'Add another employee to the system'),
                undefined,
                () => setShowAddAdminModal(true)
              )}
              {renderSettingItem(
                <Users size={20} color={businessColors.primary} />,
                t('settings.admin.manageEmployees', 'Manage employees'),
                t('settings.admin.manageEmployeesSubtitle', 'Remove employees from this business'),
                undefined,
                async () => {
                  setShowManageEmployeesModal(true);
                  setIsLoadingEmployees(true);
                  try {
                    const list = await usersApi.getAdminUsers();
                    const filtered = (list || []).filter((u: any) => u.id !== (user as any)?.id);
                    setAdminUsers(filtered);
                    const daysMap: Record<string, number> = {};
                    for (const emp of filtered) {
                      try {
                        const days = await businessProfileApi.getBookingOpenDaysForUser(emp.id);
                        daysMap[emp.id] = days;
                      } catch (e) {
                        console.error('Error loading booking days for user:', emp.id, e);
                        daysMap[emp.id] = 7;
                      }
                    }
                    setBookingOpenDaysByUser(daysMap);
                  } finally {
                    setIsLoadingEmployees(false);
                  }
                }
              )}
          </View>
        </View>
        )}

        {activeSettingsTab === 'security' && (
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
            {renderSettingItem(
              <HelpCircle size={20} color={businessColors.primary} />,
              t('settings.support.title', 'Support and help'),
              t('settings.support.common', 'Common questions and contact'),
              undefined,
              () => setShowSupportModal(true)
            )}
          </View>
        </View>
        )}

        {user && activeSettingsTab === 'account' && (
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
              {renderSettingItem(
                <Ionicons name="globe-outline" size={20} color={businessColors.primary} />,
                t('profile.language.title', 'Language'),
                i18n.language?.startsWith('he') ? t('profile.language.hebrew', 'Hebrew') : t('profile.language.english', 'English'),
                undefined,
                () => setIsLanguageOpen(true)
              )}
              {renderSettingItem(
                <Trash2 size={20} color="#FF3B30" />,
                t('profile.delete.title', 'Delete Account'),
                t('profile.delete.subtitle', 'Permanently delete your account'),
                undefined,
                () => setShowDeleteAccountModal(true)
              )}
          </View>
        </View>
        )}

        {user && activeSettingsTab === 'account' ? (
          <TouchableOpacity style={[styles.logoutButton, { backgroundColor: businessColors.primary }]} onPress={handleLogout}>
            <LogOut size={20} color={Colors.white} />
            <Text style={styles.logoutText}>{t('settings.sections.logoutLabel', 'Logout')}</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.versionText}>{t('settings.sections.version', 'Version')} 1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <Pressable
          style={styles.logoutOverlay}
          onPress={() => setShowLogoutModal(false)}
        >
          <Pressable style={styles.logoutDialog} onPress={() => {}}>
            <Text style={styles.logoutDialogTitle}>{t('profile.logout.title', 'Log out')}</Text>
            <Text style={styles.logoutDialogMessage}>{t('profile.logout.message', 'Are you sure you want to log out?')}</Text>
            <View style={styles.logoutDialogButtons}>
              <TouchableOpacity
                style={[styles.logoutDialogBtn, styles.logoutDialogCancelBtn]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.logoutDialogCancelText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.logoutDialogBtn, { backgroundColor: businessColors.primary }]}
                onPress={confirmLogout}
              >
                <Text style={styles.logoutDialogConfirmText}>{t('profile.logout.confirm', 'Log out')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Support Modal */}
      <Modal
        visible={showSupportModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSupportModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: '#F2F2F7' }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.cancellationModalCloseButton}
              onPress={() => setShowSupportModal(false)}
            >
              <X size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('settings.support.title','Support and help')}</Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView style={[styles.modalContent, { padding: 20 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.groupCard}>
              <Text style={styles.previewNotificationTitle}>
                {t('settings.support.header','Need help? Contact Slotlys support team')}
              </Text>
              <Text style={styles.previewNotificationContent}>
                {t('settings.support.description',"Our dedicated support team is here to assist you with any questions or issues you may have. Whether you need help with appointments, account settings, or technical support, we're ready to help. Please use the contact button below to reach out to us directly.")}
              </Text>
              <View style={{ marginTop: 16, alignItems: 'center' }}>
                <TouchableOpacity style={[styles.modalSendButton, { backgroundColor: businessColors.primary }]} onPress={handleCallSupport}>
                  <Text style={[styles.modalSendText, { color: Colors.white }]}>{t('settings.support.contactNow','Contact us now')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit Display Name Modal */}
      <Modal
        visible={showEditDisplayNameModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditDisplayNameModal(false)}
      >
        <View style={styles.smallModalOverlay}>
          <View style={styles.smallModalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowEditDisplayNameModal(false)}>
                <Text style={styles.modalCloseText}>{t('cancel','Cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>{t('settings.profile.businessName','Business name')}</Text>
              <TouchableOpacity style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]} onPress={async () => {
                setIsSavingProfile(true);
                try {
                  const updated = await businessProfileApi.upsertProfile({
                    display_name: displayNameDraft.trim() || null as any,
                    address: (profileAddress || '').trim() || null as any,
                    instagram_url: (profileInstagram || '').trim() || null as any,
                    facebook_url: (profileFacebook || '').trim() || null as any,
                  });
                  if (updated) {
                    setProfile(updated);
                    setProfileDisplayName(updated.display_name || '');
                    setShowEditDisplayNameModal(false);
                  } else {
                    Alert.alert(t('error.generic','Error'), t('settings.profile.nameSaveFailed','Failed to save business name'));
                  }
                } finally {
                  setIsSavingProfile(false);
                }
              }} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? t('settings.common.saving','Saving...') : t('save','Save')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>{t('settings.profile.businessName','Business name')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={displayNameDraft}
                  onChangeText={setDisplayNameDraft}
                  placeholder={t('settings.profile.businessNamePlaceholder','For example: The Studio of Hadas')}
                  placeholderTextColor={Colors.subtext}
                  textAlign="left"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Client reminder (before appointment) — full copy + hours/minutes in modal */}
      <Modal
        visible={showClientReminderModal}
        animationType="fade"
        transparent
        onRequestClose={dismissClientReminderModal}
      >
        <KeyboardAvoidingView
          style={styles.smallModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.smallModalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalCloseButton} onPress={dismissClientReminderModal}>
                <Text style={styles.modalCloseText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitleLTR, I18nManager.isRTL && { textAlign: 'center' }]} numberOfLines={2}>
                {t('settings.reminder.clientRowTitle', 'Client reminder before appointment')}
              </Text>
              <TouchableOpacity
                style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]}
                onPress={() => {
                  void saveClientReminderFromModal();
                }}
                disabled={isSavingProfile}
              >
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>
                  {isSavingProfile ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.smallModalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={[
                  styles.settingSubtitleLTR,
                  { marginBottom: 16, lineHeight: 22 },
                  I18nManager.isRTL && { textAlign: 'right' },
                ]}
              >
                {t('settings.reminder.clientAutomatedHint')}
              </Text>
              <Text style={[styles.inputLabelLTR, I18nManager.isRTL && { textAlign: 'right' }]}>
                {t('settings.reminder.clientDialogHoursLabel', 'Hours')}
              </Text>
              <TextInput
                style={[styles.textInput, { marginBottom: 12 }]}
                value={clientReminderModalHoursDraft}
                onChangeText={setClientReminderModalHoursDraft}
                placeholder="0"
                placeholderTextColor={Colors.subtext}
                keyboardType="number-pad"
                textAlign={I18nManager.isRTL ? 'right' : 'left'}
              />
              <Text style={[styles.inputLabelLTR, I18nManager.isRTL && { textAlign: 'right' }]}>
                {t('settings.reminder.clientDialogMinutesLabel', 'Minutes (0–59)')}
              </Text>
              <TextInput
                style={[styles.textInput, { marginBottom: 12 }]}
                value={clientReminderModalMinutesDraft}
                onChangeText={setClientReminderModalMinutesDraft}
                placeholder="0"
                placeholderTextColor={Colors.subtext}
                keyboardType="number-pad"
                textAlign={I18nManager.isRTL ? 'right' : 'left'}
              />
              <Text
                style={[
                  styles.settingSubtitleLTR,
                  { fontSize: 13, opacity: 0.85 },
                  I18nManager.isRTL && { textAlign: 'right' },
                ]}
              >
                {t('settings.reminder.clientDialogCombinedHint')}
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Admin self-reminder — same time fields as client reminder */}
      <Modal
        visible={showAdminReminderModal}
        animationType="fade"
        transparent
        onRequestClose={dismissAdminReminderModal}
      >
        <KeyboardAvoidingView
          style={styles.smallModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.smallModalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalCloseButton} onPress={dismissAdminReminderModal}>
                <Text style={styles.modalCloseText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitleLTR, I18nManager.isRTL && { textAlign: 'center' }]} numberOfLines={2}>
                {t('settings.reminder.adminRowTitle', 'Self-reminder before appointment')}
              </Text>
              <TouchableOpacity
                style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]}
                onPress={() => {
                  void saveAdminReminderFromModal();
                }}
                disabled={isSavingProfile}
              >
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>
                  {isSavingProfile ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.smallModalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={[
                  styles.settingSubtitleLTR,
                  { marginBottom: 16, lineHeight: 22 },
                  I18nManager.isRTL && { textAlign: 'right' },
                ]}
              >
                {t('settings.reminder.adminAutomatedHint')}
              </Text>
              <Text style={[styles.inputLabelLTR, I18nManager.isRTL && { textAlign: 'right' }]}>
                {t('settings.reminder.clientDialogHoursLabel', 'Hours')}
              </Text>
              <TextInput
                style={[styles.textInput, { marginBottom: 12 }]}
                value={adminReminderModalHoursDraft}
                onChangeText={setAdminReminderModalHoursDraft}
                placeholder="0"
                placeholderTextColor={Colors.subtext}
                keyboardType="number-pad"
                textAlign={I18nManager.isRTL ? 'right' : 'left'}
              />
              <Text style={[styles.inputLabelLTR, I18nManager.isRTL && { textAlign: 'right' }]}>
                {t('settings.reminder.clientDialogMinutesLabel', 'Minutes (0–59)')}
              </Text>
              <TextInput
                style={[styles.textInput, { marginBottom: 12 }]}
                value={adminReminderModalMinutesDraft}
                onChangeText={setAdminReminderModalMinutesDraft}
                placeholder="0"
                placeholderTextColor={Colors.subtext}
                keyboardType="number-pad"
                textAlign={I18nManager.isRTL ? 'right' : 'left'}
              />
              <Text
                style={[
                  styles.settingSubtitleLTR,
                  { fontSize: 13, opacity: 0.85 },
                  I18nManager.isRTL && { textAlign: 'right' },
                ]}
              >
                {t('settings.reminder.adminDialogCombinedHint')}
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Admin (name & phone) Modal */}
      <Modal
        visible={showEditAdminModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditAdminModal(false)}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 50}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: '#F8F9FA' }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowEditAdminModal(false)}>
              <Text style={styles.modalCloseText}>{t('cancel','Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('settings.admin.edit','Edit admin')}</Text>
            <TouchableOpacity
              style={[styles.modalSendButton, { backgroundColor: businessColors.primary }, (isSavingAdmin) && styles.modalSendButtonDisabled]}
              onPress={async () => {
                if (!user?.id) { setShowEditAdminModal(false); return; }
                if (!adminNameDraft.trim() || !adminPhoneDraft.trim()) { Alert.alert(t('error.generic','Error'), t('settings.admin.fillNamePhone','Please fill in name and phone number')); return; }
                try {
                  setIsSavingAdmin(true);
                  const updated = await usersApi.updateUser(
                    user.id as any,
                    {
                      name: adminNameDraft.trim() as any,
                      phone: adminPhoneDraft.trim() as any,
                    } as any
                  );
                  if (updated) {
                    updateUserProfile({ name: updated.name as any, phone: (updated as any).phone } as any);
                    setShowEditAdminModal(false);
                  } else {
                    Alert.alert(t('error.generic','Error'), t('settings.admin.saveDetailsFailed','Failed to save admin details'));
                  }
                } finally {
                  setIsSavingAdmin(false);
                }
              }}
              disabled={isSavingAdmin}
            >
              <Text style={[styles.modalSendText, { color: Colors.white }, isSavingAdmin && styles.modalSendTextDisabled]}>{isSavingAdmin ? t('settings.common.saving','Saving...') : t('save','Save')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView 
            style={styles.modalContent} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustKeyboardInsets={true}
          >
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={styles.modalAvatarWrap}>
                <LinearGradient
                  colors={[businessColors.primary, businessColors.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalAvatarRing}
                >
                  <TouchableOpacity style={styles.modalAvatar} onPress={handlePickAdminAvatar} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={t('settings.profile.changeProfilePicture','Change profile picture')}>
                    {user?.image_url ? (
                      <Image source={{ uri: (user as any).image_url }} style={styles.modalAvatarImage} resizeMode="cover" />
                    ) : (
                      <User size={36} color={Colors.subtext} strokeWidth={1.75} />
                    )}
                    {isUploadingAdminAvatar && (
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 36 }}>
                        <ActivityIndicator size="small" color={businessColors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                </LinearGradient>
              </View>
              <Text style={styles.modalAdminName}>{adminNameDraft || user?.name || t('settings.admin.admin','Admin')}</Text>
              <Text style={styles.modalAdminMeta}>{adminPhoneDraft || (user as any)?.phone || ''}</Text>
              <View style={{ marginTop: 8 }}>
                <TouchableOpacity onPress={handlePickAdminAvatar} style={[styles.pickButton, { alignSelf: 'center', backgroundColor: '#F2F2F7', borderColor: '#E5E5EA' }]} activeOpacity={0.85} disabled={isUploadingAdminAvatar}>
                  <Text style={styles.pickButtonText}>{isUploadingAdminAvatar ? t('settings.common.uploading','Uploading...') : t('settings.profile.changeProfilePicture','Change profile picture')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.iosCard}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>{t('settings.admin.name','Admin name')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={adminNameDraft}
                  onChangeText={setAdminNameDraft}
                  placeholder={t('profile.edit.namePlaceholder','Full Name')}
                  placeholderTextColor={Colors.subtext}
                  textAlign="left"
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>{t('profile.phone','Phone number')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={adminPhoneDraft}
                  onChangeText={setAdminPhoneDraft}
                  placeholder={t('settings.admin.phonePlaceholder','(555) 123-4567')}
                  placeholderTextColor={Colors.subtext}
                  keyboardType="phone-pad"
                  textAlign="left"
                />
              </View>
            </View>
            <View style={{ height: 100 }} />
          </ScrollView>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Address bottom sheet (2/3 screen) */}
      <Modal visible={showAddressSheet} transparent animationType="none" onRequestClose={() => setShowAddressSheet(false)}>
        <TouchableWithoutFeedback onPress={() => {
          Animated.timing(addressSheetAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setShowAddressSheet(false));
        }}>
          <Animated.View style={[styles.sheetOverlay, { opacity: addressOverlayOpacity }]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.addressSheetContainer, { transform: [{ translateY: addressCombinedTranslateY }] }]}>
          <LinearGradient
            colors={['#F8FAFF', '#FFFFFF', '#FFFFFF']}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={styles.dragHandleArea}>
            <View style={styles.sheetGrabberWrapper} {...(PanResponder.create({
              onStartShouldSetPanResponder: () => true,
              onMoveShouldSetPanResponder: (_: any, g: any) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
              onPanResponderMove: (_: any, g: any) => {
                addressDragY.setValue(Math.max(0, g.dy));
              },
              onPanResponderRelease: (_: any, g: any) => {
                const shouldClose = g.dy > 140 || g.vy > 0.9;
                if (shouldClose) {
                  Animated.timing(addressSheetAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
                    addressDragY.setValue(0);
                    setShowAddressSheet(false);
                  });
                } else {
                  Animated.timing(addressDragY, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
                }
              },
              onPanResponderTerminate: () => {
                Animated.timing(addressDragY, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
              },
            }).panHandlers)}><View style={styles.sheetGrabber} /></View>
          </View>
          {(() => {
            const hasAddressText = ((placesFormattedAddress || addressDraft || '').trim().length > 0);
            const pinTint =
              (businessColors.primary || '#6366F1').length === 7
                ? `${businessColors.primary}1A`
                : 'rgba(99, 102, 241, 0.1)';
            return (
              <>
                <View style={styles.addressSheetHeaderBlock}>
                  <View style={styles.addressSheetTopRow}>
                    <TouchableOpacity
                      style={styles.addressSheetCloseOrb}
                      onPress={() => {
                        Animated.timing(addressSheetAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
                          addressDragY.setValue(0);
                          setShowAddressSheet(false);
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('cancel', 'Cancel')}
                    >
                      <X size={18} color={Colors.text} strokeWidth={2.2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.addressSheetSavePill,
                        { backgroundColor: businessColors.primary },
                        !hasAddressText && styles.addressSheetSavePillDisabled,
                      ]}
                      disabled={!hasAddressText || isSavingProfile}
                      onPress={async () => {
                        const selected = (placesFormattedAddress || addressDraft || '').trim();
                        if (!selected || isSavingProfile) return;
                        setAddressDraft(selected);
                        await saveAddress();
                        Animated.timing(addressSheetAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() =>
                          setShowAddressSheet(false),
                        );
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('save', 'Save')}
                    >
                      {isSavingProfile ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.addressSheetSavePillText}>{t('save', 'Save')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={styles.addressSheetTitleBlock}>
                    <View style={[styles.addressSheetTitleIconRing, { borderColor: `${businessColors.primary}33` }]}>
                      <MapPin size={22} color={businessColors.primary} strokeWidth={2.2} />
                    </View>
                    <Text style={styles.addressSheetHeroTitle}>{t('settings.profile.businessAddressTitle', 'Business address')}</Text>
                    <Text style={styles.addressSheetHeroSubtitle}>
                      {t('settings.profile.businessAddressSheetSubtitle', 'Clients see this when booking. Pick a suggestion or type freely.')}
                    </Text>
                  </View>
                </View>

                <KeyboardAvoidingView
                  behavior={Platform.select({ ios: 'padding', android: undefined })}
                  style={styles.addressSheetBody}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
                >
                  <View style={[styles.addressSheetContentPad, { paddingBottom: insets.bottom + 20 }]}>
                    <Text
                      style={[
                        styles.addressFieldSectionLabel,
                        { textAlign: I18nManager.isRTL ? 'right' : 'left' },
                      ]}
                    >
                      {t('settings.profile.addressLabel', 'Address')}
                    </Text>
                    <View style={[styles.addressSearchShell, { borderColor: `${businessColors.primary}22` }]}>
                      <View style={[styles.addressSearchPin, { backgroundColor: pinTint }]}>
                        <MapPin size={20} color={businessColors.primary} strokeWidth={2.2} />
                      </View>
                      <View style={styles.addressAutocompleteFlex}>
                        <GooglePlacesAutocomplete
                          keyboardShouldPersistTaps="handled"
                          placeholder={t('settings.profile.businessAddressSearchPlaceholder', 'Street, city…')}
                          fetchDetails
                          debounce={220}
                          enablePoweredByContainer={false}
                          minLength={2}
                          predefinedPlaces={[]}
                          nearbyPlacesAPI={undefined as any}
                          query={{
                            key: (Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_PLACES_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY,
                            language: (i18n.language || '').toLowerCase().startsWith('he') ? 'he' : 'en',
                            types: 'geocode',
                          }}
                          ref={placesInputRef}
                          onPress={(data: any, details: any) => {
                            const formatted = details?.formatted_address || data?.description || '';
                            const placeId = data?.place_id || details?.place_id || '';
                            const lat = details?.geometry?.location?.lat ?? null;
                            const lng = details?.geometry?.location?.lng ?? null;
                            const shortAddress =
                              formatShortAddress(details, data?.description || formatted) ||
                              String(formatted || data?.description || '').trim();
                            setPlacesFormattedAddress(shortAddress);
                            setPlacesPlaceId(placeId);
                            setPlacesLat(lat);
                            setPlacesLng(lng);
                            setAddressDraft(shortAddress);
                            justSelectedPlaceRef.current = true;
                          }}
                          textInputProps={{
                            value: addressDraft,
                            onChangeText: (tx: string) => {
                              if (justSelectedPlaceRef.current) {
                                justSelectedPlaceRef.current = false;
                                setAddressDraft(tx);
                                return;
                              }
                              setAddressDraft(tx);
                              if (placesPlaceId) {
                                setPlacesPlaceId('');
                                setPlacesFormattedAddress('');
                                setPlacesLat(null);
                                setPlacesLng(null);
                              }
                            },
                            placeholderTextColor: '#9CA3AF',
                            autoCorrect: false,
                            autoCapitalize: 'none',
                            textAlign: (i18n.language || '').toLowerCase().startsWith('he') ? 'right' : 'left',
                          }}
                          styles={{
                            container: { flex: 0 },
                            textInputContainer: { padding: 0, borderWidth: 0, backgroundColor: 'transparent' },
                            textInput: [styles.addressSearchInput as any],
                            listView: {
                              position: 'absolute',
                              top: 54,
                              left: 0,
                              right: 0,
                              zIndex: 9999,
                              elevation: 16,
                              backgroundColor: '#FFFFFF',
                              borderRadius: 16,
                              marginTop: 8,
                              borderWidth: StyleSheet.hairlineWidth,
                              borderColor: '#E8EAEF',
                              maxHeight: 280,
                              ...Platform.select({
                                ios: {
                                  shadowColor: '#1a1f36',
                                  shadowOffset: { width: 0, height: 10 },
                                  shadowOpacity: 0.12,
                                  shadowRadius: 24,
                                },
                                android: { elevation: 12 },
                              }),
                            },
                          }}
                        />
                      </View>
                    </View>

                    {!!placesPlaceId && (
                      <View style={styles.addressMapSection}>
                        <View style={styles.addressMapSectionHeader}>
                          <MapPin size={15} color={businessColors.primary} strokeWidth={2.2} />
                          <Text style={styles.addressMapSectionLabel}>{t('map.preview', 'Map preview')}</Text>
                        </View>
                        <View style={[styles.addressMapFrame, { borderColor: `${businessColors.primary}28` }]}>
                          <Image
                            source={{
                              uri: `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent((placesFormattedAddress || addressDraft) as string)}&zoom=15&size=800x400&scale=2&markers=color:red|${encodeURIComponent((placesFormattedAddress || addressDraft) as string)}&key=${(Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_PLACES_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY}`,
                            }}
                            style={styles.addressMapImage}
                            resizeMode="cover"
                          />
                          <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.06)']}
                            style={styles.addressMapGradient}
                            pointerEvents="none"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                </KeyboardAvoidingView>
              </>
            );
          })()}
        </Animated.View>
      </Modal>

      {/* Edit Instagram Modal */}
      <Modal
        visible={showEditInstagramModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditInstagramModal(false)}
      >
        <View style={styles.smallModalOverlay}>
          <View style={styles.smallModalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowEditInstagramModal(false)}>
                <Text style={styles.modalCloseText}>{t('cancel','Cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>{t('settings.profile.instagramUrl','Instagram URL')}</Text>
              <TouchableOpacity style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveInstagram} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? t('settings.common.saving','Saving...') : t('save','Save')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>{t('settings.profile.instagramUrl','Instagram URL')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={instagramDraft}
                  onChangeText={setInstagramDraft}
                  placeholder={t('settings.profile.instagramUrlPlaceholder','https://instagram.com/yourpage')}
                  placeholderTextColor={Colors.subtext}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="left"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Facebook Modal */}
      <Modal
        visible={showEditFacebookModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditFacebookModal(false)}
      >
        <View style={styles.smallModalOverlay}>
          <View style={styles.smallModalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowEditFacebookModal(false)}>
                <Text style={styles.modalCloseText}>{t('cancel','Cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>{t('settings.profile.facebookUrl','Facebook URL')}</Text>
              <TouchableOpacity style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveFacebook} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? t('settings.common.saving','Saving...') : t('save','Save')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>{t('settings.profile.facebookUrl','Facebook URL')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={facebookDraft}
                  onChangeText={setFacebookDraft}
                  placeholder={t('settings.profile.facebookUrlPlaceholder','https://facebook.com/yourpage')}
                  placeholderTextColor={Colors.subtext}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="left"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit TikTok Modal */}
      <Modal
        visible={showEditTiktokModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditTiktokModal(false)}
      >
        <View style={styles.smallModalOverlay}>
          <View style={styles.smallModalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowEditTiktokModal(false)}>
                <Text style={styles.modalCloseText}>{t('cancel','Cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>{t('settings.profile.tiktokUrl','TikTok URL')}</Text>
              <TouchableOpacity style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveTiktok} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? t('settings.common.saving','Saving...') : t('save','Save')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>{t('settings.profile.tiktokUrl','TikTok URL')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={tiktokDraft}
                  onChangeText={setTiktokDraft}
                  placeholder={t('settings.profile.tiktokUrlPlaceholder','https://www.tiktok.com/@yourpage')}
                  placeholderTextColor={Colors.subtext}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="left"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Cancellation Policy Modal */}
      <Modal
        visible={showEditCancellationModal}
        animationType="fade"
        transparent
        onRequestClose={dismissCancellationModal}
      >
        <TouchableWithoutFeedback onPress={dismissCancellationModal}>
          <View style={styles.smallModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.smallModalCard}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity style={styles.cancellationModalCloseButton} onPress={dismissCancellationModal}>
                    <X size={20} color={Colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.modalTitleLTR}>{t('settings.policies.minCancellationTitle','Appointment cancellation time')}</Text>
                  <TouchableOpacity style={[styles.modalSendButton, { backgroundColor: businessColors.primary }, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveCancellationHours} disabled={isSavingProfile}>
                    <Text style={[styles.modalSendText, { color: Colors.white }, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? t('settings.common.saving','Saving...') : t('save','Save')}</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
                  <TouchableWithoutFeedback onPress={() => setShowCancellationDropdown(false)}>
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabelLTR}>{t('settings.policies.hoursBefore','Hours before appointment')}</Text>
                      <View style={styles.dropdownContainer}>
                        <TouchableOpacity
                          style={styles.dropdownButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            // Open downward to ensure visibility
                            setCancellationDropdownDirection('down');
                            setShowCancellationDropdown(!showCancellationDropdown);
                          }}
                        >
                          <Text style={styles.dropdownButtonText}>
                            {cancellationHoursDraft === '0' 
                              ? t('settings.policies.noRestriction','0 hours (No restriction)') 
                              : `${cancellationHoursDraft} ${cancellationHoursDraft === '1' ? t('settings.policies.hour','hour') : t('settings.policies.hours','hours')}${parseInt(cancellationHoursDraft) >= 24 ? ` (${Math.floor(parseInt(cancellationHoursDraft) / 24)} ${Math.floor(parseInt(cancellationHoursDraft) / 24) === 1 ? t('settings.policies.day','day') : t('settings.policies.days','days')}${parseInt(cancellationHoursDraft) % 24 > 0 ? ` ${parseInt(cancellationHoursDraft) % 24} ${t('settings.policies.hours','hours')}` : ''})` : ''}`
                            }
                          </Text>
                          {showCancellationDropdown ? (
                            <Ionicons name="chevron-up" size={20} color={businessColors.primary} />
                          ) : (
                            <Ionicons name="chevron-down" size={20} color={businessColors.primary} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </ScrollView>
                
                {/* Dropdown positioned outside of ScrollView for better visibility */}
                {showCancellationDropdown && (
                  <View style={[
                    styles.cancellationDropdownOptions,
                    cancellationDropdownDirection === 'up' 
                      ? styles.cancellationDropdownOptionsUp 
                      : styles.cancellationDropdownOptionsDown
                  ]}>
                    <ScrollView style={styles.cancellationDropdownList} showsVerticalScrollIndicator={false}>
                      {/* 0 hours option */}
                      <TouchableOpacity
                          style={[
                            styles.cancellationDropdownItem,
                            cancellationHoursDraft === '0' && styles.cancellationDropdownItemSelected
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            setCancellationHoursDraft('0');
                            setShowCancellationDropdown(false);
                          }}
                        >
                          <Text style={[
                            styles.cancellationDropdownItemText,
                            cancellationHoursDraft === '0' && styles.cancellationDropdownItemTextSelected
                          ]}>
                            0 hours (No restriction)
                          </Text>
                        </TouchableOpacity>
                        
                        {/* Common options */}
                        {[1, 2, 3, 6, 12, 24, 48, 72, 168].map((hour) => (
                          <TouchableOpacity
                            key={hour}
                            style={[
                              styles.cancellationDropdownItem,
                              cancellationHoursDraft === hour.toString() && styles.cancellationDropdownItemSelected
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              setCancellationHoursDraft(hour.toString());
                              setShowCancellationDropdown(false);
                            }}
                          >
                            <Text style={[
                              styles.cancellationDropdownItemText,
                              cancellationHoursDraft === hour.toString() && styles.cancellationDropdownItemTextSelected
                            ]}>
                              {hour} {hour === 1 ? 'hour' : 'hours'}
                              {hour >= 24 && (
                                <Text style={styles.cancellationDropdownItemSubtext}>
                                  {' '}({Math.floor(hour / 24)} {Math.floor(hour / 24) === 1 ? 'day' : 'days'}
                                  {hour % 24 > 0 ? ` ${hour % 24} hours` : ''})
                                </Text>
                              )}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        
                        {/* Custom option */}
                        <TouchableOpacity
                          style={styles.cancellationDropdownItem}
                          onPress={(e) => {
                            e.stopPropagation();
                            Alert.prompt(
                              t('settings.policies.customHoursTitle','Custom Hours'),
                              t('settings.policies.customHoursMessage','Enter number of hours (0-168):'),
                              [
                                { text: t('cancel','Cancel'), style: 'cancel' },
                                {
                                  text: t('ok','OK'),
                                  onPress: (text) => {
                                    const hours = parseInt(text || '0');
                                    if (hours >= 0 && hours <= 168) {
                                      setCancellationHoursDraft(hours.toString());
                                    } else {
                                      Alert.alert(t('error.generic','Error'), t('settings.profile.cancellationInvalid','Please enter a valid number between 0 and 168 hours'));
                                    }
                                  }
                                }
                              ],
                              'plain-text',
                              cancellationHoursDraft,
                              'numeric'
                            );
                            setShowCancellationDropdown(false);
                          }}
                        >
                          <Text style={styles.cancellationDropdownItemText}>
                            {t('settings.policies.customHoursLabel','Custom hours...')}
                          </Text>
                        </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}
                
                <View style={styles.smallModalContent}>
                  <Text style={[styles.inputLabelLTR, { fontSize: 12, color: Colors.subtext, marginTop: 8 }]}>
                    Clients cannot cancel appointments within this time period before the appointment.
                  </Text>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Booking horizon (per staff) — sheet with explainer + days input */}
      <Modal
        visible={showBookingWindowModal}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setShowBookingWindowModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: '#F2F2F7' }]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.cancellationModalCloseButton}
                onPress={() => setShowBookingWindowModal(false)}
                accessibilityRole="button"
                accessibilityLabel={t('cancel', 'Cancel')}
              >
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { textAlign: 'center', position: 'absolute', left: 54, right: 54 }]}>
                {t('settings.profile.bookingWindowModalTitle', 'Your booking range')}
              </Text>
              <TouchableOpacity
                style={[
                  styles.modalSendButton,
                  { backgroundColor: businessColors.primary },
                  isSavingProfile && styles.modalSendButtonDisabled,
                ]}
                onPress={confirmBookingWindowModal}
                disabled={isSavingProfile}
              >
                <Text style={[styles.modalSendText, { color: Colors.white }, isSavingProfile && styles.modalSendTextDisabled]}>
                  {isSavingProfile ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 28 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <LinearGradient
                colors={[`${businessColors.primary}22`, `${businessColors.primary}0D`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 16,
                  padding: 18,
                  marginBottom: 24,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: `${businessColors.primary}40`,
                }}
              >
                <Text style={[styles.previewNotificationContent, { lineHeight: 22, color: Colors.text }]}>
                  {t('settings.profile.bookingWindowModalBody')}
                </Text>
              </LinearGradient>
              <View style={[styles.groupCard, { marginBottom: 0 }]}>
                <Text style={styles.inputLabelLTR}>{t('settings.profile.bookingWindowModalDaysLabel', 'Days open for booking')}</Text>
                <TextInput
                  style={[styles.textInput, { marginTop: 10, fontSize: 28, fontWeight: '700', textAlign: 'center', letterSpacing: 1 }]}
                  value={bookingWindowDraft}
                  onChangeText={setBookingWindowDraft}
                  placeholder={t('settings.profile.bookingWindowPlaceholder', '7')}
                  placeholderTextColor={Colors.subtext}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={{ marginTop: 12, fontSize: 13, color: Colors.subtext, textAlign: 'center' }}>
                  {t('settings.profile.bookingWindowModalRange', 'From 1 to 60 days')}
                </Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Time selection now uses inline dropdown below the field (no nested modal) */}
      {/* Manage Recurring Appointments Modal */}
      <Modal
        visible={showManageRecurringModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowManageRecurringModal(false)}
      >
        <View style={styles.sheetRoot}>
          <TouchableWithoutFeedback onPress={() => animateCloseSheet(() => setShowManageRecurringModal(false))}>
            <Animated.View style={[styles.sheetOverlay, { opacity: overlayOpacity }]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: combinedTranslateY }] } ] }>
            <View style={styles.dragHandleArea}>
              <View style={styles.sheetGrabberWrapper} {...panResponder.panHandlers}>
                <View style={styles.sheetGrabber} />
              </View>
            </View>
            <View style={[styles.servicesModalHeader, { paddingHorizontal: 12 }]}>
              <TouchableOpacity style={[styles.servicesModalCloseButton, { marginLeft: 0 }]} onPress={() => animateCloseSheet(() => setShowManageRecurringModal(false))}>
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { textAlign: 'center', position: 'absolute', left: 54, right: 54 }]} numberOfLines={2}>
                {t('settings.recurring.hubTitle', 'Fixed appointments')}
              </Text>
              <TouchableOpacity
                style={[styles.servicesModalCloseButton, { marginLeft: 0, marginRight: -4 }]}
                onPress={() => setShowRecurringModal(true)}
                accessibilityRole="button"
                accessibilityLabel={t('settings.recurring.addFromHubA11y', 'Add fixed appointment')}
              >
                <Plus size={22} color={businessColors.primary} strokeWidth={2.25} />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetBody}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.modalContentContainer, { paddingBottom: insets.bottom + 8 }]}
                showsVerticalScrollIndicator={false}>
                <View style={styles.recurringCard}>
                  {isLoadingRecurring ? (
                    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                      <ActivityIndicator size="large" color={businessColors.primary} />
                      <Text style={{ marginTop: 12, color: Colors.subtext }}>{t('common.loading','Loading...')}</Text>
                    </View>
                  ) : (
                    <View>
                      {recurringList.length === 0 ? (
                        <Text style={{ textAlign: 'center', color: Colors.subtext }}>{t('settings.recurring.empty','No recurring appointments')}</Text>
                      ) : (
                        recurringList.map((item, idx) => (
                          <View key={item.id}>
                        <View style={[styles.manageItemRow]}> 
                          <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 18, ...shadowStyle }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                                <Text style={styles.previewNotificationTitle}>{item.client_name}</Text>
                                <Text style={styles.previewNotificationContent}>{item.client_phone}</Text>
                                <Text style={styles.previewNotificationContent}>{item.service_name}</Text>
                                <Text style={styles.previewNotificationContent}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][item.day_of_week]} · {String(item.slot_time).slice(0,5)}</Text>
                                {!!item.repeat_interval && (
                                  <Text style={styles.previewNotificationContent}>
                                    Repeat: {item.repeat_interval === 1 ? 'every week' : `every ${item.repeat_interval} weeks`}
                                  </Text>
                                )}
                              </View>
                              <TouchableOpacity
                                style={[styles.iconActionButton, { backgroundColor: '#FFECEC', borderColor: '#FFD1D1' }]}
                                onPress={async () => {
                                  const ok = await recurringAppointmentsApi.delete(item.id);
                                  if (ok) setRecurringList((prev) => prev.filter((x) => x.id !== item.id));
                                  else Alert.alert(t('error.generic','Error'), t('settings.recurring.deleteFailed','Failed to delete appointment'));
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={t('settings.recurring.a11yDelete','Delete')}
                              >
                                <Trash2 size={18} color="#FF3B30" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                            {idx < recurringList.length - 1 && <View style={styles.manageDivider} />}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      </Modal>
      {/* Manage Employees Modal */}
      <Modal
        visible={showManageEmployeesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowManageEmployeesModal(false)}
      >
        <SafeAreaView edges={['top']} style={[styles.modalContainer, { backgroundColor: Colors.white }]}> 
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={[styles.cancellationModalCloseButton, { marginLeft: -10 }]}
              onPress={() => setShowManageEmployeesModal(false)}
            >
              <X size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { textAlign: 'center', position: 'absolute', left: 54, right: 54 }]}>{t('settings.admin.manageEmployees','Manage employees')}</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.modalBodyRounded}>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.recurringCard}>
              {/* Title and subtitle removed as requested */}
              <View style={[styles.inputContainer, { marginTop: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, borderWidth: 0, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Ionicons name="search-outline" size={18} color={Colors.subtext} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.textInput, { borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 0, flex: 1 }]}
                    value={manageEmpSearch}
                    onChangeText={setManageEmpSearch}
                    placeholder={t('common.searchByNamePhoneEmail','Search by name, phone, or email')}
                    placeholderTextColor={Colors.subtext}
                    textAlign="left"
                    autoCapitalize="none"
                    autoCorrect={false}
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>
              {isLoadingEmployees ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={businessColors.primary} />
                  <Text style={{ marginTop: 12, color: Colors.subtext }}>{t('common.loading','Loading...')}</Text>
                </View>
              ) : (
                <View>
                  {filteredAdmins.length === 0 ? (
                    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                      <Ionicons name="people-outline" size={36} color={Colors.subtext} />
                      <Text style={{ marginTop: 8, color: Colors.subtext }}>{t('settings.admin.noEmployees','No employees found')}</Text>
                    </View>
                  ) : (
                    filteredAdmins.map((adm: any) => {
                      const isExpanded = expandedEmployeeId === adm.id;
                      const currentBookingDays = bookingOpenDaysByUser[adm.id] ?? 7;
                      const isSaving = savingBookingDaysForUser === adm.id;
                      
                      return (
                        <View key={adm.id}>
                          <Swipeable
                            friction={2}
                            rightThreshold={28}
                            renderRightActions={() => (
                              <TouchableOpacity
                                style={styles.swipeDeleteAction}
                                activeOpacity={0.85}
                                onPress={() => {
                                  if (adm.id === user?.id) {
                                    Alert.alert(t('settings.admin.actionNotAllowed','Action not allowed'), t('settings.admin.cannotRemoveSelf','You cannot remove yourself.'));
                                    return;
                                  }
                                  Alert.alert(
                                    t('settings.admin.removeEmployeeTitle','Remove employee'),
                                    `${t('settings.admin.removeEmployeeConfirm','Are you sure you want to remove')} ${adm.name || t('settings.admin.thisEmployee','this employee')}?`,
                                    [
                                      { text: t('cancel','Cancel'), style: 'cancel' },
                                      {
                                        text: t('settings.admin.remove','Remove'),
                                        style: 'destructive',
                                        onPress: async () => {
                                          const ok = await usersApi.deleteUserAndAllDataById(adm.id);
                                          if (ok) {
                                            setAdminUsers((prev) => prev.filter((u) => u.id !== adm.id));
                                            Alert.alert(t('success.generic','Success'), t('settings.admin.removeSuccess','Employee deleted successfully'));
                                          } else {
                                            Alert.alert(t('error.generic','Error'), t('settings.admin.removeFailed','Failed to remove employee'));
                                          }
                                        }
                                      }
                                    ]
                                  );
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={t('settings.services.a11yDelete','Delete service')}
                              >
                                <Trash2 size={20} color={'#fff'} />
                                <Text style={styles.swipeDeleteText}>{t('settings.services.delete','Delete')}</Text>
                              </TouchableOpacity>
                            )}
                          >
                            <View style={styles.iosCard}>
                              <TouchableOpacity 
                                style={{ flexDirection: 'row', alignItems: 'center' }}
                                onPress={() => setExpandedEmployeeId(isExpanded ? null : adm.id)}
                                activeOpacity={0.7}
                              >
                                {adm.image_url ? (
                                  <Image source={{ uri: adm.image_url }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} resizeMode="cover" />
                                ) : (
                                  <View style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center' }}>
                                    <User size={22} color={Colors.subtext} strokeWidth={1.75} />
                                  </View>
                                )}
                                <View style={{ alignItems: 'flex-start', flex: 1 }}>
                                  <Text style={styles.previewNotificationTitle}>{adm.name || 'Admin'}</Text>
                                  {!!adm.phone && <Text style={styles.previewNotificationContent}>{adm.phone}</Text>}
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  {isExpanded ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                                  <TouchableOpacity
                                    style={[styles.iconActionButton, { backgroundColor: '#FFECEC', borderColor: '#FFD1D1' }]}
                                    onPress={() => {
                                      if (adm.id === user?.id) {
                                        Alert.alert(t('settings.admin.actionNotAllowed','Action not allowed'), t('settings.admin.cannotRemoveSelf','You cannot remove yourself.'));
                                        return;
                                      }
                                      Alert.alert(
                                        t('settings.admin.removeEmployeeTitle','Remove employee'),
                                        `${t('settings.admin.removeEmployeeConfirm','Are you sure you want to remove')} ${adm.name || t('settings.admin.thisEmployee','this employee')}?`,
                                        [
                                          { text: t('cancel','Cancel'), style: 'cancel' },
                                          {
                                            text: t('settings.admin.remove','Remove'),
                                            style: 'destructive',
                                            onPress: async () => {
                                              const ok = await usersApi.deleteUserAndAllDataById(adm.id);
                                              if (ok) {
                                                setAdminUsers((prev) => prev.filter((u) => u.id !== adm.id));
                                                Alert.alert(t('success.generic','Success'), t('settings.admin.removeSuccess','Employee deleted successfully'));
                                              } else {
                                                Alert.alert(t('error.generic','Error'), t('settings.admin.removeFailed','Failed to remove employee'));
                                              }
                                            }
                                          }
                                        ]
                                      );
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('settings.recurring.a11yDelete','Delete')}
                                  >
                                    <Trash2 size={20} color="#FF3B30" />
                                  </TouchableOpacity>
                                </View>
                              </TouchableOpacity>
                              
                              {isExpanded && (
                                <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.border }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <Calendar size={18} color={businessColors.primary} style={{ marginRight: 8 }} />
                                    <Text style={{ fontSize: 15, color: Colors.text, fontWeight: '500' }}>
                                      {t('settings.profile.bookingWindow','Booking window (days)')}
                                    </Text>
                                  </View>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <TextInput
                                      style={{ 
                                        flex: 1,
                                        borderWidth: 1, 
                                        borderColor: Colors.border, 
                                        borderRadius: 8, 
                                        paddingHorizontal: 12, 
                                        paddingVertical: 10,
                                        fontSize: 15,
                                        color: Colors.text,
                                        backgroundColor: Colors.white
                                      }}
                                      value={String(currentBookingDays)}
                                      onChangeText={(text) => {
                                        const num = Math.max(1, Math.min(60, Math.floor(Number(text) || 7)));
                                        setBookingOpenDaysByUser((prev) => ({ ...prev, [adm.id]: num }));
                                      }}
                                      placeholder="7"
                                      keyboardType="number-pad"
                                      placeholderTextColor={Colors.subtext}
                                    />
                                    <TouchableOpacity
                                      style={{
                                        backgroundColor: businessColors.primary,
                                        paddingHorizontal: 20,
                                        paddingVertical: 10,
                                        borderRadius: 8,
                                        opacity: isSaving ? 0.6 : 1
                                      }}
                                      onPress={() => handleSaveBookingDaysForUser(adm.id, currentBookingDays)}
                                      disabled={isSaving}
                                    >
                                      {isSaving ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                      ) : (
                                        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>
                                          {t('save','Save')}
                                        </Text>
                                      )}
                                    </TouchableOpacity>
                                  </View>
                                  <Text style={{ fontSize: 12, color: Colors.subtext, marginTop: 8, textAlign: i18n.language === 'he' ? 'right' : 'left' }}>
                                    {t('settings.profile.bookingWindowHint','How many days ahead can clients book appointments with this employee?')}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </Swipeable>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
      {/* Recurring Appointment Modal */}
      <Modal
        visible={showRecurringModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRecurringModal(false)}
      >
        <SafeAreaView edges={['top']} style={[styles.modalContainer, { backgroundColor: Colors.white }]}> 
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.cancellationModalCloseButton}
              onPress={() => setShowRecurringModal(false)}
            >
              <X size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { textAlign: 'center', position: 'absolute', left: 54, right: 54 }]}>{t('settings.recurring.addTitle','Add recurring appointment')}</Text>
            <View style={{ width: 44 }} />
          </View>

          <View key={`rec-body-${recRenderKey}`} style={styles.modalBodyRounded}>
          {/* Stepper */}
          <View style={{ paddingHorizontal: 20, paddingTop: 12 }} onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w && w > 0 && w !== recViewportWidth) {
              setRecViewportWidth(w);
              recTranslateX.setValue(-recStep * w);
            }
          }}>
            <View style={{ height: 4, backgroundColor: '#E5E5EA', borderRadius: 2, overflow: 'hidden' }}>
              <Animated.View style={{ height: '100%', backgroundColor: businessColors.primary, width: recProgressAnim.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }) }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              {['Client','Service','Day','Time','Repeat'].map((label, idx) => (
                <View key={label} style={{ alignItems: 'center', flex: 1 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: idx <= recStep ? businessColors.primary : '#D1D1D6', backgroundColor: idx < recStep ? businessColors.primary : '#FFFFFF', marginBottom: 4 }} />
                  <Text style={{ fontSize: 12, color: idx <= recStep ? businessColors.primary : Colors.subtext }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Steps viewport */}
          <View style={{ paddingHorizontal: 20 }}>
            <View style={{ overflow: 'hidden' }} onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w && w > 0 && w !== recViewportWidth) {
                setRecViewportWidth(w);
                recTranslateX.setValue(-recStep * w);
              }
            }}>
              <Animated.View key={`steps-${recViewportWidth}-${recRenderKey}`} style={{ flexDirection: 'row', width: Math.max(1, recViewportWidth || 0) * 5, minHeight: 1, transform: [{ translateX: recTranslateX }] }}>
                <View style={{ width: recViewportWidth }}>
                  <View style={styles.wizardSectionCard}>
                    <View style={styles.inputContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <User size={18} color={businessColors.primary} />
                        <Text style={[styles.inputLabel, { textAlign: 'left', marginBottom: 0 }]}>{t('adminEx.appointmentsAdmin.client','Client')}</Text>
                      </View>
                      <Text style={styles.stepHint}>{t('adminEx.appointmentsAdmin.pickClient','Pick the client for this appointment')}</Text>
                      {!selectedClient ? (
                        <>
                      <Pressable style={[styles.dropdownContainer, styles.grayField, { minHeight: 52 }]} onPress={() => setShowClientDropdown(!showClientDropdown)}>
                            <View style={styles.dropdownHeader}>
                              <Text style={[styles.dropdownText, styles.dropdownPlaceholder, { textAlign: 'left' }]}>{t('adminEx.appointmentsAdmin.selectClientPlaceholder','Select client...')}</Text>
                              {showClientDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                            </View>
                          </Pressable>
                          {showClientDropdown && (
                            <View style={[styles.dropdownOptions, styles.dropPanelRecurring]}>
                              <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                                <TextInput
                                  style={[styles.textInput, { borderWidth: 1, borderColor: '#E5E5EA', backgroundColor: '#F2F2F7' }]}
                                  value={clientSearch}
                                  onChangeText={searchClients}
                                  placeholder={t('common.searchByNamePhone','Search by name or phone...')}
                                  placeholderTextColor={Colors.subtext}
                                  textAlign="left"
                                />
                              </View>
                              <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                {clientResults.map((c, idx) => (
                                  <Pressable
                                    key={c.phone}
                                    style={[styles.dropdownOption, idx === clientResults.length - 1 && styles.dropdownOptionLast]}
                                    onPress={() => { setSelectedClient(c); setShowClientDropdown(false); goToRecStep(1); }}
                                  >
                                    <View style={styles.dropdownOptionContent}>
                                      <Text style={styles.dropdownOptionTitle}>{c.name || t('commonEx.client','Client')}</Text>
                                      <Text style={styles.dropdownOptionDescription}>{c.phone}</Text>
                                    </View>
                                  </Pressable>
                                ))}
                                {clientResults.length === 0 && (
                                  <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                                    <Text style={{ textAlign: 'center', color: Colors.subtext }}>{t('common.noResults','No results')}</Text>
                                  </View>
                                )}
                              </ScrollView>
                            </View>
                          )}
                        </>
                      ) : (
                        <View style={[styles.previewCard, { marginTop: 6 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ alignItems: 'flex-start' }}>
                              <Text style={styles.previewNotificationTitle}>{selectedClient.name}</Text>
                              <Text style={styles.previewNotificationContent}>{selectedClient.phone}</Text>
                            </View>
                            <TouchableOpacity onPress={() => { setSelectedClient(null); setShowClientDropdown(false); }}>
                              <Text style={{ color: '#FF3B30', fontWeight: '600' }}>{t('commonEx.change','Change')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={{ width: recViewportWidth }}>
                  <View style={styles.wizardSectionCard}>
                    <View style={styles.inputContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Calendar size={18} color={businessColors.primary} />
                        <Text style={[styles.inputLabel, { textAlign: 'left', marginBottom: 0 }]}>{t('booking.field.service','Service')}</Text>
                      </View>
                      <Text style={styles.stepHint}>{t('adminEx.appointmentsAdmin.pickService','Choose the service to perform')}</Text>
                      <Pressable style={[styles.dropdownContainer, styles.grayField, { minHeight: 52 }]} onPress={() => setShowServiceDropdown(!showServiceDropdown)}>
                        <View style={styles.dropdownHeader}>
                          {selectedService ? (
                            <View style={{ flex: 1, alignItems: 'flex-start' }}>
                              <Text style={styles.serviceHeaderTitle}>{selectedService.name}</Text>
                              {!!selectedService.duration_minutes && (
                                <Text style={styles.serviceHeaderSub}>{`${selectedService.duration_minutes} ${t('settings.services.minutes','minutes')}`}</Text>
                              )}
                            </View>
                          ) : (
                            <Text style={[styles.dropdownText, styles.dropdownPlaceholder, { textAlign: 'left' }]}>{t('adminEx.appointmentsAdmin.selectServicePlaceholder','Select service...')}</Text>
                          )}
                          {showServiceDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                        </View>
                      </Pressable>
                      {showServiceDropdown && (
                        <View style={[styles.dropdownOptions, styles.dropPanelRecurring]}>
                          <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            {recurringServices.map((svc, idx) => (
                              <Pressable
                                key={svc.id}
                                style={[styles.dropdownOption, idx === recurringServices.length - 1 && styles.dropdownOptionLast]}
                                onPress={() => { setSelectedService(svc); setShowServiceDropdown(false); goToRecStep(2); }}
                              >
                                <View style={styles.dropdownOptionContent}>
                                  <Text style={styles.dropdownOptionTitle}>{svc.name}</Text>
                                  {!!svc.duration_minutes && (
                                    <Text style={styles.dropdownOptionDescription}>{`${svc.duration_minutes} ${t('settings.services.minutes','minutes')}`}</Text>
                                  )}
                                </View>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={{ width: recViewportWidth }}>
                  <View style={styles.wizardSectionCard}>
                    <View style={styles.inputContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Calendar size={18} color={businessColors.primary} />
                        <Text style={[styles.inputLabel, { textAlign: 'left', marginBottom: 0 }]}>{t('settings.recurring.dayOfWeek','Day of week')}</Text>
                      </View>
                      <Text style={styles.stepHint}>{t('settings.recurring.selectDayOfWeek','Select a day of the week')}</Text>
                      <Pressable
                        style={[styles.dropdownContainer, styles.grayField, { opacity: selectedService ? 1 : 0.6 }]}
                        onPress={() => {
                          if (!selectedService) { Alert.alert(t('error.generic','Error'), t('settings.recurring.selectServiceFirst','Please select a service')); return; }
                          setShowDayDropdown(!showDayDropdown);
                        }}
                      >
                        <View style={styles.dropdownHeader}>
                          <Text style={[styles.dropdownText, !Number.isInteger(selectedDayOfWeek as any) && styles.dropdownPlaceholder, { textAlign: 'left' }]}>
                            {Number.isInteger(selectedDayOfWeek as any) ? dayNames[selectedDayOfWeek as number] : t('admin2.hours.selectDate','Please select a date')}
                          </Text>
                          {showDayDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                        </View>
                      </Pressable>
                      {showDayDropdown && (
                        <View style={[styles.dropdownOptions, styles.dropPanelRecurring]}>
                          <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            {dayNames.map((n, idx) => (
                              <Pressable key={n} style={[styles.dropdownOption, idx === dayNames.length - 1 && styles.dropdownOptionLast]} onPress={() => { setSelectedDayOfWeek(idx); setShowDayDropdown(false); goToRecStep(3); }}>
                                <Text style={styles.dropdownOptionTitle}>{n}</Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={{ width: recViewportWidth }}>
                  <View style={styles.wizardSectionCard}>
                    <View style={styles.inputContainer}> 
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Clock size={18} color={businessColors.primary} />
                        <Text style={[styles.sectionHeaderTitle, { textAlign: 'left' }]}>{t('selectTime.selectTime','Select Time')}</Text>
                      </View>
                      <Text style={styles.stepHint}>{t('adminEx.appointmentsAdmin.pickTime','Pick an available time slot')}</Text>
                      <Pressable
                        style={[styles.dropdownContainer, styles.grayField, { minHeight: 52, opacity: Number.isInteger(selectedDayOfWeek as any) ? 1 : 0.6 }]}
                        onPress={() => {
                          if (!selectedService) { Alert.alert(t('error.generic','Error'), t('settings.recurring.selectServiceFirst','Please select a service')); return; }
                          if (!Number.isInteger(selectedDayOfWeek as any)) { Alert.alert(t('error.generic','Error'), t('settings.recurring.selectDayFirst','Please select a day of the week')); return; }
                          if (!showTimeDropdown) { setIsLoadingTimes(true); if (Number.isInteger(selectedDayOfWeek as any)) { loadAvailableTimesForDay(selectedDayOfWeek as number); } }
                          setShowTimeDropdown(!showTimeDropdown);
                        }}
                      >
                        <View style={styles.dropdownHeader}>
                          <Text style={[styles.dropdownText, !selectedTime && styles.dropdownPlaceholder, { textAlign: 'left' }]}>
                            {selectedTime ? formatTime12Hour(selectedTime) : (isLoadingTimes ? 'Loading times...' : 'Select time...')}
                          </Text>
                          {showTimeDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                        </View>
                      </Pressable>
                      {showTimeDropdown && (
                        <View style={[styles.dropdownOptions, styles.dropPanelRecurring]}>
                          {isLoadingTimes ? (
                            <View style={{ padding: 12, alignItems: 'center' }}>
                              <ActivityIndicator size="small" color={businessColors.primary} />
                              <Text style={{ textAlign: 'center', color: Colors.subtext, marginTop: 8 }}>
                                {t('selectTime.loadingTimes','Loading available times...')}
                              </Text>
                            </View>
                          ) : availableTimes.length === 0 ? (
                            <View style={{ padding: 12 }}>
                              <Text style={{ textAlign: 'center', color: Colors.subtext }}>
                                {t('selectTime.noTimes','No available times for this day')}
                              </Text>
                            </View>
                          ) : (
                            <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                              {availableTimes.map((timeStr, idx) => (
                                <Pressable
                                  key={timeStr}
                                  style={[styles.dropdownOption, idx === availableTimes.length - 1 && styles.dropdownOptionLast]}
                                  onPress={async () => {
                                    if (!Number.isInteger(selectedDayOfWeek as any)) return;
                                    const ok = await isTimeAvailable(selectedDayOfWeek as number, timeStr);
                                    if (!ok) { Alert.alert(t('settings.recurring.slotTakenTitle','Slot taken'), t('settings.recurring.slotTaken','The selected time is already booked this week. Please choose another time.')); return; }
                                    setSelectedTime(timeStr);
                                    setShowTimeDropdown(false);
                                    goToRecStep(4);
                                  }}
                                >
                                  <View style={styles.dropdownOptionContent}>
                                    <Text style={styles.dropdownOptionTitle}>{formatTime12Hour(timeStr)}</Text>
                                  </View>
                                </Pressable>
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={{ width: recViewportWidth }}>
                  <View style={styles.wizardSectionCard}>
                    <View style={styles.inputContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Repeat size={18} color={businessColors.primary} />
                        <Text style={[styles.inputLabel, { textAlign: 'left', marginBottom: 0 }]}>{t('settings.recurring.repeatEvery','Repeat every')}</Text>
                      </View>
                      <Text style={styles.stepHint}>{t('settings.recurring.repeatHint','Set how often this repeats')}</Text>
                      <Pressable style={[styles.dropdownContainer, styles.grayField, { minHeight: 52 }]} onPress={() => setShowRepeatDropdown(!showRepeatDropdown)}>
                        <View style={styles.dropdownHeader}>
                          <Text style={[styles.dropdownText, { textAlign: 'left' }]}>{repeatWeeks === 1 ? t('settings.recurring.everyWeek','every week') : t('settings.recurring.everyNWeeks','every {{count}} weeks', { count: repeatWeeks })}</Text>
                          {showRepeatDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                        </View>
                      </Pressable>
                      {showRepeatDropdown && (
                        <View style={[styles.dropdownOptions, styles.dropPanelRecurring]}>
                          <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            {[1, 2, 3, 4].map((w, idx) => (
                              <Pressable
                                key={w}
                                style={[styles.dropdownOption, idx === 3 && styles.dropdownOptionLast]}
                                onPress={() => { setRepeatWeeks(w); setShowRepeatDropdown(false); }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Text style={styles.dropdownOptionTitle}>{w === 1 ? 'every week' : `every ${w} weeks`}</Text>
                                  {repeatWeeks === w && <Check size={18} color={businessColors.primary} />}
                                </View>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </Animated.View>
            </View>
            {/* Step navigation visible for all steps */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 }}>
              <TouchableOpacity onPress={goBackRec} disabled={recStep === 0} style={[styles.stepNavButton, recStep === 0 && styles.stepNavButtonDisabled]}>
                <Text style={[styles.stepNavText, recStep === 0 && styles.stepNavTextDisabled]}>{t('back','Back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={recStep < 4 ? goNextRec : handleSubmitRecurring}
                disabled={
                  (recStep === 0 && !selectedClient) ||
                  (recStep === 1 && !selectedService) ||
                  (recStep === 2 && selectedDayOfWeek === null) ||
                  (recStep === 3 && !selectedTime) ||
                  (recStep === 4 && !repeatWeeks)
                }
                style={[styles.stepNavPrimary, { backgroundColor: businessColors.primary }, ((recStep === 0 && !selectedClient) || (recStep === 1 && !selectedService) || (recStep === 2 && selectedDayOfWeek === null) || (recStep === 3 && !selectedTime) || (recStep === 4 && !repeatWeeks)) && { opacity: 0.6 }]}
              >
                <Text style={styles.stepNavPrimaryText}>{recStep < 4 ? 'Next' : (isSubmittingRecurring ? 'Saving...' : 'Done')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          
          </View>
        </SafeAreaView>
      </Modal>
      {/* Services Edit Modal */}
      <Modal
        visible={showServicesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeServicesModal}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F5F7' }} edges={['top', 'left', 'right']}>
            <View style={styles.servicesModalTitleBar}>
              <Text style={styles.servicesModalTitlePlain}>
                {t('settings.services.edit', 'עריכת שירותים')}
              </Text>
              {!isLoadingServices && editableServices.length > 0 && (
                <Text style={styles.servicesModalTitleCount}>
                  {editableServices.length} {t('settings.services.servicesCount', 'שירותים')}
                </Text>
              )}
            </View>
            <View style={styles.servicesModalBodyColumn}>
              <GestureHandlerRootView style={{ flex: 1 }}>
              <DraggableFlatList<Service>
                style={{ flex: 1 }}
                containerStyle={{ flex: 1 }}
                contentContainerStyle={[
                  styles.modalContentContainer,
                  styles.servicesModalScrollContent,
                  { paddingBottom: insets.bottom + 88 },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                automaticallyAdjustKeyboardInsets
                data={editableServices}
                keyExtractor={(item) => item.id}
                activationDistance={10}
                onDragBegin={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  } catch {
                    /* no-op */
                  }
                }}
                onDragEnd={handleServicesDragEnd}
                ListHeaderComponent={
                <>
                {isLoadingServices && (
                  <View style={styles.servicesModalFullWidthBlock}>
                    <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                      <ActivityIndicator size="large" color={businessColors.primary} />
                      <Text style={{ marginTop: 12, color: Colors.subtext, fontSize: 14 }}>{t('settings.services.loading','Loading services...')}</Text>
                    </View>
                  </View>
                )}

                {servicesError && (
                  <View style={styles.servicesModalFullWidthBlock}>
                    <Text style={{ color: 'red', textAlign: 'center', marginVertical: 12 }}>{servicesError}</Text>
                  </View>
                )}

                {/* Reorder mode hint banner */}
                {servicesReorderMode && !isLoadingServices && (
                  <View style={styles.svcReorderHint}>
                    <Text style={styles.svcReorderHintText}>
                      {t('settings.services.reorderHint', 'גרור את ≡ כדי לשנות את סדר השירותים')}
                    </Text>
                  </View>
                )}


                {/* Empty state */}
                {!isLoadingServices && !servicesError && editableServices.length === 0 && !isAddingService && (
                  <View style={[styles.svcEmptyState, styles.servicesModalFullWidthBlock]}>
                    <View style={[styles.svcEmptyIcon, { backgroundColor: `${businessColors.primary}15` }]}>
                      <Ionicons name="cut-outline" size={32} color={businessColors.primary} />
                    </View>
                    <Text style={styles.svcEmptyTitle}>{t('settings.services.emptyTitle','No services yet')}</Text>
                    <Text style={styles.svcEmptySubtitle}>{t('settings.services.emptySubtitle','Add your first service to get started')}</Text>
                    <TouchableOpacity
                      style={[styles.svcSaveButton, { backgroundColor: businessColors.primary, marginTop: 16 }]}
                      onPress={handleOpenAddService}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.svcSaveButtonText}>+ {t('settings.services.add','Add service')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                </>
                }
                renderItem={({ item: svc, drag, isActive }) => {
                  const isExpanded = !servicesReorderMode && expandedServiceId === svc.id;
                  const isSaving = savingServiceId === svc.id;
                  const justSaved = savedServiceId === svc.id;
                  return (
                    <ScaleDecorator activeScale={1.03}>
                    <View style={styles.svcListCell}>
                    <Pressable
                      onLongPress={servicesReorderMode ? drag : undefined}
                      delayLongPress={200}
                      disabled={isActive}
                      style={({ pressed }) => (pressed && servicesReorderMode ? { opacity: 0.95 } : undefined)}
                    >
                    <Swipeable
                      enabled={!servicesReorderMode}
                      friction={2}
                      rightThreshold={40}
                      renderRightActions={() => (
                        <TouchableOpacity
                          style={styles.swipeDeleteAction}
                          activeOpacity={0.85}
                          onPress={() => handleDeleteService(svc.id)}
                        >
                          <Trash2 size={20} color={'#fff'} />
                          <Text style={styles.swipeDeleteText}>{t('settings.services.delete','Delete')}</Text>
                        </TouchableOpacity>
                      )}
                    >
                      <View style={[styles.svcCard, styles.svcListCard, justSaved && styles.svcCardSaved, isActive && styles.svcListCardDragging]}>
                        {/* LTR row: chevron left | text (title+chips) | thumb right — matches mockup regardless of app RTL */}
                        <View style={[styles.svcCardAccent, { backgroundColor: businessColors.primary }]} />
                        {!isExpanded ? (
                          <View style={styles.svcListCollapsedRow}>
                            {/* 1 — Chevron / drag (physical left) */}
                            {servicesReorderMode ? (
                              <Pressable
                                onPressIn={drag}
                                style={styles.svcDragHandle}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <View style={styles.svcDragLine} />
                                <View style={styles.svcDragLine} />
                                <View style={styles.svcDragLine} />
                              </Pressable>
                            ) : (
                              <TouchableOpacity
                                style={styles.svcListChevronHit}
                                activeOpacity={0.85}
                                onPress={() => setExpandedServiceId(prev => (prev === svc.id ? null : svc.id))}
                              >
                                {justSaved ? (
                                  <View style={[styles.svcSavedBadge, { backgroundColor: `${businessColors.primary}15` }]}>
                                    <Check size={14} color={businessColors.primary} />
                                    <Text style={[styles.svcSavedText, { color: businessColors.primary }]}>
                                      {t('saved','Saved')}
                                    </Text>
                                  </View>
                                ) : (
                                  <ChevronDown size={18} color={Colors.subtext} />
                                )}
                              </TouchableOpacity>
                            )}
                            {/* 2 — Title + badges (grows; align content toward thumb on the right) */}
                            <TouchableOpacity
                              style={styles.svcListCollapsedMain}
                              activeOpacity={0.85}
                              disabled={servicesReorderMode}
                              onPress={() => !servicesReorderMode && setExpandedServiceId(prev => (prev === svc.id ? null : svc.id))}
                            >
                              {/* Fixed height = thumb (70); centers title+chips vertically — TouchableOpacity does not stretch reliably */}
                              <View style={styles.svcListCollapsedTextCol}>
                                <View style={styles.svcCardInfo}>
                                  <Text style={styles.svcCardName} numberOfLines={1}>
                                    {svc.name || t('common.noName','No name')}
                                  </Text>
                                  <View style={styles.svcMetaRow}>
                                    {svc.duration_minutes ? (
                                      <View style={styles.svcMetaChipDuration}>
                                        <Text style={styles.svcMetaChipDurationText}>
                                          {svc.duration_minutes} {t('settings.services.minShort','דק׳')}
                                        </Text>
                                      </View>
                                    ) : null}
                                    {typeof svc.price === 'number' && (
                                      <View style={[styles.svcMetaChip, { backgroundColor: `${businessColors.primary}14` }]}>
                                        <Text style={[styles.svcMetaChipText, { color: businessColors.primary }]}>
                                          ₪{svc.price}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>
                              </View>
                            </TouchableOpacity>
                            {/* 3 — Thumbnail (physical right, next to orange accent) */}
                            <View style={styles.svcListThumbOuter}>
                              {servicesReorderMode && (
                                <TouchableOpacity
                                  style={styles.svcDeleteBadge}
                                  onPress={() => handleDeleteService(svc.id)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  activeOpacity={0.8}
                                >
                                  <Trash2 size={13} color="#fff" />
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                onPress={() => !servicesReorderMode && handlePickServiceImage(svc.id)}
                                activeOpacity={0.85}
                                style={styles.svcListThumbWrap}
                                disabled={servicesReorderMode}
                              >
                                {svc.image_url ? (
                                  <Image source={{ uri: svc.image_url }} style={styles.svcListThumb} resizeMode="cover" />
                                ) : (
                                  <View style={[styles.svcListThumbPlaceholder, { backgroundColor: `${businessColors.primary}15` }]}>
                                    <Text style={[styles.svcListThumbPlaceholderText, { color: businessColors.primary }]}>
                                      {(svc.name || '?').charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                {uploadingServiceId === svc.id && (
                                  <View style={styles.svcListThumbUploadOverlay}>
                                    <ActivityIndicator size="small" color="#fff" />
                                  </View>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          /* ── Expanded edit form – same look as Add Service ── */
                          <>
                            {/* Colored header band */}
                            <View style={[styles.svcAddCardHeaderBand, { backgroundColor: `${businessColors.primary}12` }]}>
                              <Text style={styles.svcAddCardTitle} numberOfLines={1}>
                                {svc.name || t('common.noName','No name')}
                              </Text>
                              <TouchableOpacity
                                onPress={() => setExpandedServiceId(null)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              >
                                {justSaved ? (
                                  <View style={[styles.svcSavedBadge, { backgroundColor: `${businessColors.primary}20` }]}>
                                    <Check size={13} color={businessColors.primary} />
                                    <Text style={[styles.svcSavedText, { color: businessColors.primary }]}>{t('saved','נשמר')}</Text>
                                  </View>
                                ) : (
                                  <ChevronUp size={18} color={Colors.subtext} />
                                )}
                              </TouchableOpacity>
                            </View>

                            {/* Circular image picker area */}
                            <View style={[styles.svcAddImageBandArea, { backgroundColor: `${businessColors.primary}08` }]}>
                              <TouchableOpacity
                                style={styles.svcAddImageCircleBtn}
                                onPress={() => handlePickServiceImage(svc.id)}
                                activeOpacity={0.85}
                                disabled={uploadingServiceId === svc.id}
                              >
                                {svc.image_url ? (
                                  <>
                                    <Image source={{ uri: svc.image_url }} style={styles.svcAddImageCircleFull} resizeMode="cover" />
                                    <View style={styles.svcAddImageChangeOverlay}>
                                      <Ionicons name="camera-outline" size={22} color="#fff" />
                                    </View>
                                  </>
                                ) : (
                                  <View style={[styles.svcAddImageCirclePlaceholder, { borderColor: `${businessColors.primary}40` }]}>
                                    {uploadingServiceId === svc.id ? (
                                      <ActivityIndicator size="large" color={businessColors.primary} />
                                    ) : (
                                      <>
                                        <View style={[styles.svcAddImageIconWrap, { backgroundColor: `${businessColors.primary}20` }]}>
                                          <Ionicons name="camera-outline" size={28} color={businessColors.primary} />
                                        </View>
                                        <Text style={[styles.svcAddImageDashedLabel, { color: businessColors.primary, marginTop: 8 }]}>
                                          {t('settings.services.changeImage','החלף תמונה')}
                                        </Text>
                                      </>
                                    )}
                                  </View>
                                )}
                              </TouchableOpacity>
                            </View>

                            {/* Fields */}
                            <View style={styles.svcAddFieldsArea}>
                              <View style={[styles.formGroup, { marginBottom: 10 }]}>
                                <Text style={styles.formLabel}>{t('settings.services.name','שם השירות')}</Text>
                                <TextInput
                                  style={[styles.formInput, styles.svcAddNameInput]}
                                  value={svc.name}
                                  onChangeText={(v) => updateLocalServiceField(svc.id, 'name', v)}
                                  textAlign="right"
                                />
                              </View>

                              <View style={[styles.twoColumnRow, { flexDirection: 'row', marginBottom: 4 }]}>
                                <View style={[styles.formGroup, styles.twoColumnItem, { marginBottom: 0 }]}>
                                  <Text style={styles.formLabel}>{t('settings.services.price','מחיר (₪)')}</Text>
                                  <TextInput
                                    style={styles.formInput}
                                    value={String(svc.price ?? '')}
                                    onChangeText={(v) => {
                                      const num = parseFloat(v.replace(/[^0-9.]/g, ''));
                                      updateLocalServiceField(svc.id, 'price', isNaN(num) ? 0 : num);
                                    }}
                                    keyboardType="numeric"
                                    textAlign="right"
                                  />
                                </View>
                                <View style={[styles.formGroup, styles.twoColumnItem, { marginBottom: 0 }]}>
                                  <Text style={styles.formLabel}>{t('settings.services.duration','משך')}</Text>
                                  <TouchableOpacity
                                    style={styles.svcDurationPickerBtn}
                                    onPress={() => { setEditingServiceDurationId(svc.id); setShowDurationPicker(true); }}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.svcDurationPickerBtnText}>
                                      {svc.duration_minutes
                                        ? `${svc.duration_minutes} ${t('settings.services.minShort','דק׳')}`
                                        : t('settings.services.selectDuration','בחר...')}
                                    </Text>
                                    <ChevronDown size={16} color={Colors.subtext} />
                                  </TouchableOpacity>
                                </View>
                              </View>

                              <View style={[styles.svcAddActions, { marginTop: 14 }]}>
                                <TouchableOpacity
                                  style={styles.svcDeleteButton}
                                  onPress={() => handleDeleteService(svc.id)}
                                  activeOpacity={0.85}
                                >
                                  <Trash2 size={16} color="#FF3B30" />
                                  <Text style={styles.svcDeleteButtonText}>{t('settings.services.delete','מחק')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.svcSaveButton, { backgroundColor: businessColors.primary, opacity: isSaving ? 0.7 : 1, flex: 1 }]}
                                  onPress={() => handleSaveService(svc)}
                                  disabled={isSaving}
                                  activeOpacity={0.85}
                                >
                                  <Text style={styles.svcSaveButtonText}>
                                    {isSaving ? t('settings.common.saving','שומר...') : t('settings.services.saveChanges','שמירת שינויים')}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </>
                        )}
                      </View>
                    </Swipeable>
                    </Pressable>
                    </View>
                    </ScaleDecorator>
                  );
                }}
              />

              </GestureHandlerRootView>

              <View style={[styles.servicesModalTabBarRoot, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
                {/* LTR row so layout matches design: [ + | pencil ] pill, then chevron — same in Hebrew RTL */}
                <View style={[styles.servicesModalTabBarInner, styles.servicesModalTabBarRowLtr]}>
                  <View style={[styles.servicesModalTabPill, styles.servicesModalTabPillRow, styles.servicesModalTabBorder, styles.servicesModalTabShadow]}>
                    <TabButton
                      focused={false}
                      activeColor={businessColors.primary}
                      onPress={handleOpenAddService}
                    >
                      <Plus size={22} color="#8a8a8a" />
                    </TabButton>
                    <TabButton
                      focused={servicesReorderMode}
                      activeColor={businessColors.primary}
                      onPress={() =>
                        setServicesReorderMode((v) => {
                          const next = !v;
                          if (next) setExpandedServiceId(null);
                          return next;
                        })
                      }
                    >
                      <Pencil
                        size={22}
                        color={servicesReorderMode ? '#ffffff' : '#8a8a8a'}
                      />
                    </TabButton>
                  </View>
                  <View style={[styles.servicesModalTabPill, styles.servicesModalTabBorder, styles.servicesModalTabShadow]}>
                    <TabButton
                      focused={false}
                      activeColor={businessColors.primary}
                      onPress={closeServicesModal}
                    >
                      <ChevronRight size={22} color="#8a8a8a" />
                    </TabButton>
                  </View>
                </View>
              </View>
            </View>
        {/* Duration picker overlay — inside Services Modal so it renders on top correctly on iOS */}
        {showDurationPicker && (
          <Pressable
            style={styles.durationPickerOverlay}
            onPress={() => { setShowDurationPicker(false); setEditingServiceDurationId(null); }}
          >
            <Pressable style={styles.durationPickerSheet} onPress={() => {}}>
              <View style={styles.durationPickerHeader}>
                <Text style={styles.durationPickerTitle}>{t('settings.services.duration','משך הזמן')}</Text>
              </View>
              <ScrollView
                style={styles.durationPickerScroll}
                contentContainerStyle={styles.durationPickerScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {durationOptions.map((mins, idx) => {
                  const currentVal = editingServiceDurationId
                    ? editableServices.find(s => s.id === editingServiceDurationId)?.duration_minutes
                    : parseInt(addSvcDuration, 10);
                  const isSelected = currentVal === mins;
                  return (
                    <TouchableOpacity
                      key={mins}
                      style={[
                        styles.durationPickerRow,
                        idx < durationOptions.length - 1 && styles.durationPickerRowBorder,
                        isSelected && styles.durationPickerRowSelected,
                      ]}
                      onPress={() => {
                        if (editingServiceDurationId) {
                          updateLocalServiceField(editingServiceDurationId, 'duration_minutes', mins as any);
                        } else {
                          setAddSvcDuration(String(mins));
                        }
                        setShowDurationPicker(false);
                        setEditingServiceDurationId(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.durationPickerRowText, isSelected && { color: businessColors.primary, fontWeight: '700' }]}>
                        {mins} {t('settings.services.minShort','דק׳')}
                      </Text>
                      {isSelected && <Check size={18} color={businessColors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        )}

        {/* Add service form — rendered as overlay OUTSIDE GestureHandlerRootView so all taps work */}
        {isAddingService && (
          <View style={styles.svcAddFormOverlay}>
            <View style={styles.svcAddCard}>
              {/* Colored header band */}
              <View style={[styles.svcAddCardHeaderBand, { backgroundColor: `${businessColors.primary}12` }]}>
                <Text style={styles.svcAddCardTitle}>{t('settings.services.newService','שירות חדש')}</Text>
                <TouchableOpacity onPress={() => setIsAddingService(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={17} color={Colors.subtext} />
                </TouchableOpacity>
              </View>

              {/* Image picker — centered in the header band */}
              <View style={[styles.svcAddImageBandArea, { backgroundColor: `${businessColors.primary}08` }]}>
                <TouchableOpacity
                  style={styles.svcAddImageCircleBtn}
                  onPress={async () => {
                    try {
                      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                      if (status !== 'granted') { Alert.alert(t('permission.required','Permission Required'), t('settings.common.galleryPermissionImage','Please allow gallery access')); return; }
                      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: false, quality: 0.9, base64: true });
                      if (result.canceled || !result.assets?.length) return;
                      const a: any = result.assets[0];
                      setAddSvcUploadingImage(true);
                      const uploadedUrl = await uploadServiceImage({ uri: a.uri, base64: a.base64 ?? null, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null });
                      if (uploadedUrl) setAddSvcImageUrl(uploadedUrl);
                    } catch { } finally { setAddSvcUploadingImage(false); }
                  }}
                  activeOpacity={0.85}
                  disabled={addSvcUploadingImage}
                >
                  {addSvcImageUrl ? (
                    <>
                      <Image source={{ uri: addSvcImageUrl }} style={styles.svcAddImageCircleFull} resizeMode="cover" />
                      <View style={styles.svcAddImageChangeOverlay}>
                        <Ionicons name="camera-outline" size={22} color="#fff" />
                      </View>
                    </>
                  ) : (
                    <View style={[styles.svcAddImageCirclePlaceholder, { borderColor: `${businessColors.primary}40` }]}>
                      {addSvcUploadingImage ? (
                        <ActivityIndicator size="large" color={businessColors.primary} />
                      ) : (
                        <>
                          <View style={[styles.svcAddImageIconWrap, { backgroundColor: `${businessColors.primary}20` }]}>
                            <Ionicons name="camera-outline" size={28} color={businessColors.primary} />
                          </View>
                          <Text style={[styles.svcAddImageDashedLabel, { color: businessColors.primary, marginTop: 8 }]}>
                            {t('settings.services.uploadImage','העלה תמונה')}
                          </Text>
                        </>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Fields area */}
              <View style={styles.svcAddFieldsArea}>
              {/* Service name */}
              <View style={[styles.formGroup, { marginBottom: 10 }]}>
                <Text style={styles.formLabel}>{t('settings.services.name','שם השירות')} *</Text>
                <TextInput
                  style={[styles.formInput, styles.svcAddNameInput]}
                  value={addSvcName}
                  onChangeText={setAddSvcName}
                  placeholder={t('settings.services.enterName','הזן שם שירות')}
                  placeholderTextColor={Colors.subtext}
                  textAlign="right"
                />
              </View>

              {/* Price + Duration row */}
              <View style={[styles.twoColumnRow, { flexDirection: 'row', marginBottom: 4 }]}>
                <View style={[styles.formGroup, styles.twoColumnItem, { marginBottom: 0 }]}>
                  <Text style={styles.formLabel}>{t('settings.services.price','מחיר (₪)')} *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={addSvcPrice}
                    onChangeText={(v) => setAddSvcPrice(v.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    placeholderTextColor={Colors.subtext}
                    keyboardType="numeric"
                    textAlign="right"
                  />
                </View>
                <View style={[styles.formGroup, styles.twoColumnItem, { marginBottom: 0 }]}>
                  <Text style={styles.formLabel}>{t('settings.services.duration','משך')} *</Text>
                  <TouchableOpacity
                    style={styles.svcDurationPickerBtn}
                    onPress={() => setShowDurationPicker(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.svcDurationPickerBtnText, !addSvcDuration && { color: Colors.subtext }]}>
                      {addSvcDuration ? `${addSvcDuration} ${t('settings.services.minShort','דק׳')}` : t('settings.services.selectDuration','בחר...')}
                    </Text>
                    <ChevronDown size={16} color={Colors.subtext} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Actions */}
              <View style={[styles.svcAddActions, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={styles.svcCancelButton}
                  onPress={() => setIsAddingService(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.svcCancelButtonText}>{t('cancel','ביטול')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.svcSaveButton, { backgroundColor: businessColors.primary, opacity: (addSvcIsSaving || addSvcUploadingImage) ? 0.7 : 1 }]}
                  onPress={handleCreateService}
                  disabled={addSvcIsSaving || addSvcUploadingImage}
                  activeOpacity={0.85}
                >
                  <Text style={styles.svcSaveButtonText}>
                    {addSvcIsSaving ? t('settings.common.saving','שומר...') : t('settings.services.add','הוספת שירות')}
                  </Text>
                </TouchableOpacity>
              </View>
              </View>{/* end svcAddFieldsArea */}
            </View>
          </View>
        )}
        </SafeAreaView>
      </Modal>


      {/* Add Admin Modal */}
      <AddAdminModal
        visible={showAddAdminModal}
        onClose={() => setShowAddAdminModal(false)}
        onSuccess={() => {
        }}
      />

      {/* Delete Account Modal */}
      <DeleteAccountModal
        visible={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        onSuccess={() => {
        }}
      />

      {/* Language picker (same flow as client profile) */}
      <Modal visible={isLanguageOpen} transparent animationType="slide" onRequestClose={() => setIsLanguageOpen(false)}>
        <View style={styles.languagePickerOverlay}>
          <View style={styles.languagePickerSheet}>
            <View style={styles.languagePickerHandle} />
            <View style={styles.languagePickerHeader}>
              <View style={{ width: 44 }} />
              <Text style={styles.languagePickerTitle}>{t('profile.language.title', 'Language')}</Text>
              <TouchableOpacity onPress={() => setIsLanguageOpen(false)} style={styles.languagePickerCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <TouchableOpacity
                style={styles.languagePickerOption}
                onPress={async () => {
                  try {
                    await i18n.changeLanguage('en');
                    if (user?.id) {
                      const updated = await usersApi.updateUser(user.id, { language: 'en' } as any);
                      if (updated) updateUserProfile({ language: 'en' } as any);
                    }
                  } finally {
                    setIsLanguageOpen(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.languagePickerOptionText}>{t('profile.language.english', 'English')}</Text>
                {i18n.language?.startsWith('en') && <Ionicons name="checkmark" size={18} color={businessColors.primary} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.languagePickerOption}
                onPress={async () => {
                  try {
                    await i18n.changeLanguage('he');
                    if (user?.id) {
                      const updated = await usersApi.updateUser(user.id, { language: 'he' } as any);
                      if (updated) updateUserProfile({ language: 'he' } as any);
                    }
                  } finally {
                    setIsLanguageOpen(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.languagePickerOptionText}>{t('profile.language.hebrew', 'Hebrew')}</Text>
                {i18n.language?.startsWith('he') && <Ionicons name="checkmark" size={18} color={businessColors.primary} />}
              </TouchableOpacity>
              <Text style={styles.languagePickerNote}>{t('profile.language.restartNote', 'Direction changes may require app restart')}</Text>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  /**
   * Top safe area is covered by the full-bleed profile header overlay; body uses grouped gray in scroll.
   */
  settingsPageRoot: {
    flex: 1,
    backgroundColor: SETTINGS_GROUPED_BG,
  },
  settingsScroll: {
    flex: 1,
    backgroundColor: SETTINGS_GROUPED_BG,
  },
  settingsScrollFill: {
    flex: 1,
    backgroundColor: SETTINGS_GROUPED_BG,
  },
  /** Main column: header + tabs + content — no vertical ScrollView */
  settingsPageColumn: {
    flex: 1,
  },
  settingsTabsStickyHost: {
    backgroundColor: Colors.white,
    zIndex: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
    }),
  },
  /** Canvas under horizontal tabs: grouped list look (cards read as white on soft gray) */
  settingsBelowTabs: {
    flex: 1,
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: SETTINGS_GROUPED_BG,
  },
  /** Profile header in layout flow (full-width gradient + lava) */
  adminProfileHeaderRoot: {
    width: '100%',
  },
  adminProfileHeaderColumn: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  adminProfileBlueBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  adminProfileHeaderContent: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 16,
    position: 'relative',
    zIndex: 1,
  },
  /** Only the avatar row — edit button absolute top/bottom centers vs profile image, not vs safe-area padding */
  adminProfileHeaderRowSlot: {
    position: 'relative',
    width: '100%',
  },
  /** Opposite side from avatar block (RTL: physical left); does not shift the profile row layout */
  adminProfileEditIconHit: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminProfileEditIconHitRtl: {
    left: 14,
  },
  adminProfileEditIconHitLtr: {
    right: 14,
  },
  adminProfileEditIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 1,
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '85%',
    width: '100%',
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
    }),
  },
  dragHandleArea: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetGrabberWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D1D6',
    marginTop: 6,
    marginBottom: 6,
  },
  adminProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 16,
  },
  adminProfileRowLtr: {
    flexDirection: 'row',
  },
  adminProfileRowRtl: {
    flexDirection: 'row-reverse',
  },
  adminProfileInfo: {
    flex: 1,
    gap: 2,
  },
  adminProfileInfoLtr: {
    alignItems: 'flex-start',
  },
  adminProfileInfoRtl: {
    alignItems: 'flex-end',
  },
  adminBusinessDisplayName: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.80)',
    letterSpacing: 0.1,
  },
  adminAvatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminAvatarRing: {
    padding: 2.5,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  adminAvatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  adminName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  adminPhone: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 1,
  },
  adminEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  statsRowNew: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 18,
  },
  statCardNew: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 18,
    marginHorizontal: 6,
    alignItems: 'center',
    paddingVertical: 18,
    ...shadowStyle,
  },
  statValueNew: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 2,
  },
  statLabelNew: {
    fontSize: 14,
    color: Colors.subtext,
  },
  sectionTitleWrapper: {
    backgroundColor: Colors.white,
    paddingTop: 20,
    paddingBottom: 0,
  },
  /** Extra air between the sticky profile card and the first section label */
  sectionTitleWrapperFirst: {
    marginTop: 14,
  },
  sectionTitleNew: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    paddingLeft: 20,
    marginBottom: 7,
    marginTop: 4,
    textAlign: 'left',
  },
  cardNew: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 4,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  /** Inner panel for tab content (replaces accordion card body) */
  settingsAccordionBody: {
    overflow: 'hidden',
  },
  settingsTabPanel: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 14,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.14)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  settingsAppointmentsSubsectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  colorPickerWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  addressSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '75%',
    width: '100%',
    zIndex: 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#1a2744',
        shadowOffset: { width: 0, height: -12 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
      },
      android: { elevation: 16 },
    }),
  },
  addressSheetHeaderBlock: {
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  addressSheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  addressSheetCloseOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF0F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressSheetSavePill: {
    minWidth: 92,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  addressSheetSavePillDisabled: {
    opacity: 0.45,
  },
  addressSheetSavePillText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  addressSheetTitleBlock: {
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 8,
  },
  addressSheetTitleIconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    marginBottom: 12,
  },
  addressSheetHeroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  addressSheetHeroSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 340,
  },
  addressSheetContentPad: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  addressFieldSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.4,
    marginBottom: 10,
    textAlign: 'left',
  },
  addressSearchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    paddingLeft: 6,
    paddingRight: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#1a2744',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
    }),
  },
  addressSearchPin: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressAutocompleteFlex: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
  },
  addressSearchInput: {
    minHeight: 52,
    fontSize: 17,
    color: '#111827',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 12,
    margin: 0,
  },
  addressMapSection: {
    marginTop: 22,
  },
  addressMapSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  addressMapSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  addressMapFrame: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: { elevation: 5 },
    }),
  },
  addressMapImage: {
    width: '100%',
    height: 176,
    backgroundColor: '#E5E7EB',
  },
  addressMapGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  addressHeaderRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressHeaderIcon: {
    marginRight: 8,
  },
  addressSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'left',
    marginTop: 8,
  },
  addressSheetSubtitle: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'left',
    marginTop: 4,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  addressSheetBody: {
    flex: 1,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 4,
  },
  addressInfoCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 12,
    ...shadowStyle,
  },
  addressInputBox: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.white,
    color: Colors.text,
  },
  addressSaveRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  addressSaveButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  addressSaveButtonDisabled: {
    opacity: 0.5,
  },
  addressSaveText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 56,
    backgroundColor: Colors.white,
  },
  settingItem_last: {
    borderBottomWidth: 0,
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60,60,67,0.1)',
    marginLeft: 68,
    marginRight: 8,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  settingChevron: {
    marginLeft: 8,
  },
  settingIconRight: {
    marginLeft: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15.5,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 1,
    textAlign: 'left',
  },
  settingSubtitle: {
    fontSize: 12.5,
    color: '#8E8E93',
    textAlign: 'left',
    lineHeight: 16,
  },

  settingItemLTR: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 56,
    backgroundColor: Colors.white,
  },
  settingIconLTR: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  settingChevronLTR: {
    marginLeft: 8,
  },
  settingContentLTR: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  settingTitleLTR: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
    textAlign: 'left',
    alignSelf: 'flex-start',
    letterSpacing: -0.15,
  },
  settingSubtitleLTR: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'left',
    alignSelf: 'flex-start',
    lineHeight: 17,
  },
  settingItemDisabled: {
    opacity: 0.5,
  },

  logoutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutDialog: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    width: '82%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  logoutDialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  logoutDialogMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  logoutDialogButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  logoutDialogBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutDialogCancelBtn: {
    backgroundColor: '#F2F2F7',
  },
  logoutDialogCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  logoutDialogConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
    marginHorizontal: 28,
    paddingVertical: 15,
    borderRadius: 14,
    marginBottom: 10,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
    letterSpacing: 0.2,
  },

  versionText: {
    fontSize: 11.5,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 8,
    letterSpacing: 0.3,
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  smallModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  smallModalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: Colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  glassOuter: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    overflow: 'hidden',
  },
  glassCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.55)'
  },
  smallModalContent: {
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  modalBodyRounded: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    backgroundColor: Colors.white,
  },
  modalCloseButton: {
    minWidth: 72,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  cancellationModalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
    zIndex: 10,
  },
  modalActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
    zIndex: 10,
  },
  modalActionText: {
    fontSize: 22,
    color: Colors.text,
    fontWeight: '600',
    marginTop: -2,
  },
  modalCloseText: {
    fontSize: 17,
    color: Colors.primary,
    fontWeight: '500',
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
  },
  modalTitleLTR: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    flex: 1,
    textAlign: 'left',
  },
  servicesModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: Colors.white,
  },
  servicesModalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
    zIndex: 10,
  },
  servicesModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  modalSendButton: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  modalSendButtonDisabled: {
    backgroundColor: Colors.border,
  },
  modalSendText: {
    fontSize: 17,
    color: Colors.white,
    fontWeight: '600',
  },
  modalSendTextDisabled: {
    color: Colors.subtext,
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  modalFormContent: {
    padding: 20,
  },
  formSection: {
    marginBottom: 24,
  },
  formSectionLast: {
    marginBottom: 16,
  },
  modalAvatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarRing: {
    padding: 3,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  modalAvatarImage: {
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  modalAdminName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  modalAdminMeta: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'center',
  },
  modalContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexGrow: 1,
    backgroundColor: '#F5F5F7',
  },
  sheetBody: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  servicesModalTitleBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: Colors.white,
  },
  servicesModalTitleCount: {
    fontSize: 12,
    color: '#8A8A8E',
    marginTop: 2,
    fontWeight: '400',
  },
  servicesModalTitlePlain: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  servicesModalBodyColumn: {
    flex: 1,
    backgroundColor: Colors.white,
    position: 'relative',
  },
  servicesModalTabBarRoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  servicesModalTabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  servicesModalTabBarRowLtr: {
    direction: 'ltr',
  },
  servicesModalTabPill: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    padding: 2,
  },
  servicesModalTabPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  servicesModalTabBorder: {
    borderWidth: 1,
    borderColor: '#F1F1F1',
  },
  servicesModalTabShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  svcGridDeleteBtn: {
    position: 'absolute',
    top: 8,
    start: 8,
    zIndex: 20,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
      android: { elevation: 4 },
    }),
  },
  svcDeleteBadge: {
    position: 'absolute',
    top: -7,
    left: -7,
    zIndex: 30,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2 },
      android: { elevation: 5 },
    }),
  },
  svcReorderHint: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
  },
  svcReorderHintText: {
    fontSize: 13,
    color: '#6C6C70',
    textAlign: 'center',
  },
  svcListCardDragging: {
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
    borderColor: '#D0D0D8',
  },
  svcDragHandle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
  },
  svcDragLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#C7C7CC',
  },
  servicesModalScrollContent: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
  },
  servicesModalFullWidthBlock: {
    width: '100%',
  },
  svcListCell: {
    width: '100%',
    marginBottom: 10,
    alignSelf: 'stretch',
  },
  svcListCard: {
    marginHorizontal: 0,
    marginVertical: 0,
    width: '100%',
    position: 'relative',
  },
  svcListCollapsedRow: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 10,
    paddingRight: 8,
    gap: 10,
  },
  svcListThumbOuter: {
    position: 'relative',
    width: 70,
    height: 70,
  },
  svcListThumbWrap: {
    width: 70,
    height: 70,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F0F0F5',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  svcListThumb: {
    width: 70,
    height: 70,
    borderRadius: 14,
  },
  svcListThumbPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svcListThumbPlaceholderText: {
    fontSize: 24,
    fontWeight: '700',
  },
  svcListThumbUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  svcListCollapsedMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  /** Exact thumb height; justifyContent centers title+chips (must not use flex:1 on inner svcCardInfo) */
  svcListCollapsedTextCol: {
    height: 70,
    justifyContent: 'center',
    width: '100%',
  },
  svcListChevronHit: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    minHeight: 44,
    paddingHorizontal: 2,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 8,
    textAlign: 'left',
  },
  stepHint: {
    fontSize: 12,
    color: Colors.subtext,
    marginBottom: 8,
    textAlign: 'left',
  },
  inputLabelLTR: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'left',
  },
  textInput: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'left',
  },
  glassInput: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(0,0,0,0.06)'
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: '#F0F8FF',
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: Colors.primary,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    color: Colors.subtext,
    textAlign: 'left',
    marginTop: 4,
  },
  notificationPreview: {
    marginTop: 16,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'left',
  },
  previewCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...shadowStyle,
  },
  manageItemRow: {
    padding: 0,
    marginBottom: 10,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  manageDivider: {
    height: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.primary,
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  iconActionButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  previewNotificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'left',
  },
  previewNotificationContent: {
    fontSize: 14,
    color: Colors.subtext,
    lineHeight: 20,
    textAlign: 'left',
  },
  pickButton: {
    marginTop: 6,
    alignSelf: 'flex-end',
    backgroundColor: '#F2F2F7',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  pickButtonText: {
    color: '#1d1d1f',
    fontWeight: '600',
  },

  // Dropdown Styles
  dropdownContainer: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: 8,
  },
  grayField: {
    backgroundColor: '#F2F2F7',
    borderColor: '#E5E5EA',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    textAlign: 'left',
  },
  cancellationDropdownOptions: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 150,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  cancellationDropdownOptionsUp: {
    bottom: '100%',
    marginBottom: 4,
    shadowOffset: { width: 0, height: -2 },
  },
  cancellationDropdownOptionsDown: {
    top: 160,
    shadowOffset: { width: 0, height: 2 },
  },
  cancellationDropdownList: {
    maxHeight: 130,
  },
  cancellationDropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  cancellationDropdownItemSelected: {
    backgroundColor: '#F0F8FF',
  },
  cancellationDropdownItemText: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'left',
  },
  cancellationDropdownItemTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  cancellationDropdownItemSubtext: {
    fontSize: 14,
    color: Colors.subtext,
    fontWeight: '400',
  },
  dropdownText: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    textAlign: 'left',
  },
  dropdownPlaceholder: {
    color: Colors.subtext,
  },
  dropdownOptions: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: -1,
    zIndex: 1000,
    elevation: 10,
    ...shadowStyle,
  },
  dropPanelRecurring: {
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dropdownList: {
    maxHeight: 180,
    flexGrow: 0,
    flexShrink: 1,
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.primary,
    borderStyle: 'dashed',
  },
  dropdownOptionLast: {
    borderBottomWidth: 0,
  },
  dropdownOptionContent: {
    flex: 1,
  },
  dropdownOptionTitle: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
    marginBottom: 2,
    textAlign: 'left',
  },
  dropdownOptionDescription: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'left',
  },
  serviceHeaderTitle: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'left',
    fontWeight: '500',
  },
  serviceHeaderSub: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'left',
    marginTop: 2,
  },
  customTitleContainer: {
    marginTop: 8,
  },

  // iOS style editor
  iosCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 4,
    marginVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  // iOS-like section card and time sheet rows
  iosSectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  recurringCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  wizardSectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
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
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,122,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    flex: 1,
    textAlign: 'left',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  sheetOptionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sheetOptionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
  },
  accordionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  accordionTitle: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'left',
  },
  accordionSubtitle: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'left',
    marginTop: 2,
  },
  accordionThumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    marginLeft: 12,
  },
  accordionThumbPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  accordionThumbPlaceholderText: {
    fontSize: 14,
    color: Colors.subtext,
    fontWeight: '600',
  },
  accordionChevron: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageHeaderContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceImagePreview: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 14,
    color: Colors.subtext,
    marginBottom: 6,
    textAlign: 'left',
  },
  formInput: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    textAlign: 'left',
  },
  formTextArea: {
    height: 110,
    textAlignVertical: 'top',
  },
  twoColumnRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  twoColumnItem: {
    flex: 1,
  },
  formGroupRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  primaryPillButton: {
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'center',
    minWidth: 160,
  },
  primaryPillButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionsRowInline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  deleteIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeDeleteAction: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    marginVertical: 6,
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },

  // Services "Add" button in header
  svcAddButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    minWidth: 60,
    alignItems: 'center',
  },
  svcAddButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Inline Add Service card
  svcAddFormOverlay: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F5F5F7',
    zIndex: 50,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  svcAddCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.09, shadowRadius: 14 },
      android: { elevation: 4 },
    }),
  },
  svcAddCardHeaderBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  svcAddCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  svcAddCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  svcAddImageBandArea: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  svcAddImageCircleBtn: {
    width: 120,
    height: 120,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svcAddImageCirclePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FAFAFA',
  },
  svcAddImageIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svcAddImageCircleFull: {
    width: 120,
    height: 120,
    borderRadius: 20,
  },
  svcAddImageDashedBox: {
    width: 110,
    height: 110,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FAFAFA',
  },
  svcAddImageDashedLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  svcAddImageFull: {
    width: 110,
    height: 110,
    borderRadius: 16,
  },
  svcAddImageChangeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  svcAddFieldsArea: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  svcAddNameInput: {
    textAlign: 'right',
  },
  svcDurationPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#FAFAFA',
  },
  svcDurationPickerBtnText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  durationPickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  durationPickerSheet: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  durationPickerHeader: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    alignItems: 'center',
  },
  durationPickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  durationPickerScroll: {
    maxHeight: Dimensions.get('window').height * 0.52,
  },
  durationPickerScrollContent: {
    flexGrow: 0,
  },
  durationPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  durationPickerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  durationPickerRowSelected: {
    backgroundColor: '#F2F2F7',
  },
  durationPickerRowText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  svcAddActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  svcCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  svcCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  svcSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svcSaveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },

  // Service card (list item)
  svcCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    marginHorizontal: 2,
    marginVertical: 5,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  svcCardAccent: {
    position: 'absolute',
    top: 10,
    bottom: 10,
    left: 0,
    width: 3.5,
    borderRadius: 2,
  },
  svcCardSaved: {
    borderColor: '#34C759',
    borderWidth: 1.5,
  },
  svcCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  svcThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  svcThumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svcThumbInitial: {
    fontSize: 20,
    fontWeight: '700',
  },
  svcThumbUploadOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svcCardInfo: {
    alignItems: 'stretch',
    width: '100%',
  },
  svcCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    textAlign: 'right',
  },
  svcCardMeta: {
    fontSize: 13,
    color: Colors.subtext,
  },
  svcMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  svcMetaChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  svcMetaChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  svcMetaChipDuration: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#E8E8EE',
  },
  svcMetaChipDurationText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6C6C70',
  },
  svcCardRight: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
  },
  svcSavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  svcSavedText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Expanded form inside service card
  svcExpandedForm: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  svcFormDivider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginBottom: 12,
  },
  svcImageEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    marginBottom: 4,
  },
  svcImageEditThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  svcImageEditPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svcImageEditLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  svcExpandedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  svcDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,59,48,0.08)',
  },
  svcDeleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
  },

  // Empty state
  svcEmptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  svcEmptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  svcEmptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  svcEmptySubtitle: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'center',
    lineHeight: 20,
  },

  // deleteIconText removed in favor of vector icon

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBottomSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    minHeight: '85%',
    marginTop: 40,
  },
  imagePickerButton: {
    width: 140,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: '#E5E5EA',
    backgroundColor: '#F8F9FA',
  },
  imagePickerPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
  },
  imagePickerText: {
    fontSize: 12,
    color: Colors.subtext,
    marginTop: 4,
    textAlign: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  saveButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: Colors.background,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 15,
    color: '#000000',
    fontWeight: '600',
    textAlign: 'left',
    flex: 1,
    marginLeft: 8,
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
  languagePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  languagePickerSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  languagePickerHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginTop: 8,
    marginBottom: 8,
  },
  languagePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  languagePickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  languagePickerCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languagePickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  languagePickerOptionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
  },
  languagePickerNote: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.subtext,
    textAlign: 'left',
  },
});