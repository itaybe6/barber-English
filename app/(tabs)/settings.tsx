import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image, Platform, Alert, TextInput, Modal, Pressable, ActivityIndicator, Animated, Easing, TouchableWithoutFeedback, PanResponder, GestureResponderEvent, PanResponderGestureState, KeyboardAvoidingView, Linking, Dimensions, Switch, I18nManager, DeviceEventEmitter, Keyboard, InteractionManager, type LayoutChangeEvent } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { servicesApi, updateService, deleteService, updateServicesOrderIndexes } from '@/lib/api/services';
import type { Service } from '@/lib/supabase';
import { recurringAppointmentsApi } from '@/lib/api/recurringAppointments';
import { supabase, getBusinessId } from '@/lib/supabase';
import { businessProfileApi, isClientApprovalRequired, isClientSwapEnabled, isMultiServiceBookingAllowed } from '@/lib/api/businessProfile';
import type { BusinessProfile } from '@/lib/supabase';
import { 
  LogOut, 
  ChevronLeft,
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
  Phone,
  Home,
  Clock,
  User,
  Repeat,
  Plus,
  Bell,
  Camera,
  Megaphone,
  Layers,
  FileText,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersApi } from '@/lib/api/users';
import InlineEditableRow from '@/components/InlineEditableRow';
import { ColorPicker } from '@/components/ColorPicker';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import AddAdminModal from '@/components/AddAdminModal';
import AddServiceModal from '@/components/AddServiceModal';
import { SettingsServiceSwipeRow } from '@/components/SettingsServiceSwipeRow';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import { formatBookingTimeLabel } from '@/lib/hooks/useAdminAddAppointmentForm';
import { ADMIN_RECURRING_APPOINTMENTS_CHANGED } from '@/constants/adminCalendarEvents';
import { useTranslation } from 'react-i18next';
import { normalizeAppLanguage, isRtlLanguage, toBcp47Locale } from '@/lib/i18nLocale';
import { persistAppUiLanguage } from '@/lib/appLanguagePreference';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { SettingsScreenTabs } from '@/components/settings/SettingsScreenTabs';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
import { BookingDaysRuler, type BookingDaysRulerHandle } from '@/components/BookingDaysRuler';
import { getExpoExtra } from '@/lib/getExtra';
import { getHomeLogoSource } from '@/src/theme/assets';
import { readAsStringAsync } from 'expo-file-system/legacy';

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

const BOOKING_WINDOW_MIN = 0;
const BOOKING_WINDOW_MAX = 60;
/** Ruler shows ticks 0…60; only 1…60 are saved (0 snaps to 1). */
const BOOKING_RULER_MIN_DISPLAY = 0;

const CLIENT_REMINDER_HOURS_MIN = 0;
const CLIENT_REMINDER_HOURS_MAX = 24;
const WINDOW_HEIGHT = Dimensions.get('window').height;

const ADMIN_SELF_REMINDER_MIN_MINUTES = 5;
const ADMIN_SELF_REMINDER_MAX_MINUTES = 60;
const HOME_FIXED_MESSAGE_MAX_LEN = 500;

const RECURRING_DOW_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((s) => s.updateUserProfile);
  const { triggerColorUpdate, forceAppRefresh } = useColorUpdate();
  const { colors: businessColors } = useBusinessColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const editAdminInputsRtl = isRtlLanguage(i18n.language);
  const expoExtra = useMemo(() => getExpoExtra(), []);
  const googlePlacesKey = useMemo(
    () =>
      String(
        (process.env as any)?.EXPO_PUBLIC_GOOGLE_PLACES_KEY ||
          (expoExtra as any)?.EXPO_PUBLIC_GOOGLE_PLACES_KEY ||
          (process.env as any)?.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY ||
          (expoExtra as any)?.EXPO_PUBLIC_GOOGLE_STATIC_MAPS_KEY ||
          ''
      ).trim(),
    [expoExtra]
  );
  const hasGooglePlacesAutocomplete = googlePlacesKey.length > 0;
  const [addressKeyboardHeight, setAddressKeyboardHeight] = useState(0);
  const addressSheetHeight = addressKeyboardHeight > 0 ? '88%' : '75%';
  const addressSuggestionsMaxHeight = useMemo(() => {
    if (addressKeyboardHeight <= 0) return 280;
    const visibleScreenHeight = WINDOW_HEIGHT - addressKeyboardHeight;
    const available = visibleScreenHeight - 320;
    return Math.max(120, Math.min(220, available));
  }, [addressKeyboardHeight]);

  /** Match client booking list: `order_index` (then name). Missing index sorts after indexed rows. */
  const sortServicesLikeClientBooking = useCallback((list: Service[]) => {
    const locale = toBcp47Locale(i18n.language);
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
  // Add admin modal state
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [removeEmployeeDialog, setRemoveEmployeeDialog] = useState<{ id: string; name: string } | null>(null);
  const [removeEmployeeLoading, setRemoveEmployeeLoading] = useState(false);
  const [deleteServiceDialog, setDeleteServiceDialog] = useState<{ id: string } | null>(null);
  const [deleteServiceLoading, setDeleteServiceLoading] = useState(false);

  // Delete account modal state
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  // Title dropdown states (removed)

  // Services editor (inline on Services tab)
  const [editableServices, setEditableServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  const [savedServiceId, setSavedServiceId] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);

  // Business profile state
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  /** Custom home header line when logo is hidden (saved to `home_header_text_without_logo`). */
  const [homeHeaderNoLogoTitleDraft, setHomeHeaderNoLogoTitleDraft] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileInstagram, setProfileInstagram] = useState('');
  const [profileFacebook, setProfileFacebook] = useState('');
  const [profileTiktok, setProfileTiktok] = useState('');
  const [profileMinCancellationHours, setProfileMinCancellationHours] = useState(24);
  const [profileBookingOpenDays, setProfileBookingOpenDays] = useState(7);
  const [clientSwapEnabled, setClientSwapEnabled] = useState(true);
  const [requireClientApproval, setRequireClientApproval] = useState(true);
  const [homeFixedMessageEnabled, setHomeFixedMessageEnabled] = useState(false);
  const [homeFixedMessageText, setHomeFixedMessageText] = useState('');
  const [homeFixedInputFocused, setHomeFixedInputFocused] = useState(false);
  /** When false, show a one-line summary; full editor opens on tap (collapsed after save / when message exists). */
  const [homeFixedMessageEditorOpen, setHomeFixedMessageEditorOpen] = useState(false);
  /** Extra ScrollView bottom inset so policies + home-message composer stay above keyboard & tab bar */
  const [settingsKeyboardInset, setSettingsKeyboardInset] = useState(0);
  const [allowMultiServiceBooking, setAllowMultiServiceBooking] = useState(false);
  const [showEditAddressModal, setShowEditAddressModal] = useState(false);
  const [showAddressSheet, setShowAddressSheet] = useState(false);
  const [showEditInstagramModal, setShowEditInstagramModal] = useState(false);
  const [showEditFacebookModal, setShowEditFacebookModal] = useState(false);
  const [showEditTiktokModal, setShowEditTiktokModal] = useState(false);
  const [showEditCancellationModal, setShowEditCancellationModal] = useState(false);
  const [showBookingWindowModal, setShowBookingWindowModal] = useState(false);
  const [bookingWindowDraft, setBookingWindowDraft] = useState('7');
  const bookingDaysRulerRef = useRef<BookingDaysRulerHandle>(null);
  const clientReminderHoursRulerRef = useRef<BookingDaysRulerHandle>(null);
  const adminReminderMinutesRulerRef = useRef<BookingDaysRulerHandle>(null);
  const homeFixedMessageInputRef = useRef<TextInput>(null);
  /** Text when the home fixed-message editor was opened — restored on Cancel. */
  const homeFixedMessageEditorSnapshotRef = useRef('');
  const [showCancellationDropdown, setShowCancellationDropdown] = useState(false);
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
  const [showReceiptLegalModal, setShowReceiptLegalModal] = useState(false);
  const [receiptLegalDisplayName, setReceiptLegalDisplayName] = useState('');
  const [receiptLegalBusinessNumber, setReceiptLegalBusinessNumber] = useState('');
  const [receiptLegalBusinessPhone, setReceiptLegalBusinessPhone] = useState('');
  const [receiptLegalVatExempt, setReceiptLegalVatExempt] = useState(false);
  const [cancellationHoursDraft, setCancellationHoursDraft] = useState('24');
  // Admin name/phone edit
  const [showEditAdminModal, setShowEditAdminModal] = useState(false);
  const [adminNameDraft, setAdminNameDraft] = useState('');
  const [adminPhoneDraft, setAdminPhoneDraft] = useState('');
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  /** Bottom sheet: backdrop fades in place; sheet slides separately (avoids RN Modal `slide` moving dimmer with sheet). */
  const editAdminSheetAnim = useRef(new Animated.Value(0)).current;
  const editAdminDragY = useRef(new Animated.Value(0)).current;
  const editAdminSheetTranslateY = useMemo(
    () => editAdminSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [WINDOW_HEIGHT, 0] }),
    [editAdminSheetAnim],
  );
  const editAdminCombinedTranslateY = useMemo(
    () => Animated.add(editAdminSheetTranslateY as any, editAdminDragY as any),
    [editAdminSheetTranslateY, editAdminDragY],
  );
  const editAdminBackdropOpacity = useMemo(
    () => editAdminSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    [editAdminSheetAnim],
  );
  const [isUploadingAdminAvatar, setIsUploadingAdminAvatar] = useState(false);
  const [isUploadingHomeLogo, setIsUploadingHomeLogo] = useState(false);
  /** expo-document-picker throws if a second pick starts before the first finishes (e.g. double tap). */
  const homeLogoDocumentPickerBusyRef = useRef(false);
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
  const [showClientReminderModal, setShowClientReminderModal] = useState(false);
  const [clientReminderModalHoursDraft, setClientReminderModalHoursDraft] = useState('');
  const [showAdminReminderModal, setShowAdminReminderModal] = useState(false);
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
  /** `panResponder` is created before `showManageRecurringModal` state — dismiss via ref */
  const closeManageRecurringSheetRef = useRef<() => void>(() => {});

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
        setAllowMultiServiceBooking(isMultiServiceBookingAllowed(p));
        {
          const cr = (p as BusinessProfile)?.client_reminder_minutes;
          const n = cr === null || cr === undefined ? NaN : Number(cr);
          setClientReminderMinutes(Number.isFinite(n) && n > 0 ? n : null);
        }
        setHomeFixedMessageEnabled(p.home_fixed_message_enabled === true);
        setHomeFixedMessageText(p.home_fixed_message ?? '');
        {
          const hm = String(p.home_fixed_message ?? '').trim();
          const on = p.home_fixed_message_enabled === true;
          setHomeFixedMessageEditorOpen(on && hm.length === 0);
        }
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
    setHomeHeaderNoLogoTitleDraft(String(profile?.home_header_text_without_logo ?? ''));
  }, [profile?.home_header_text_without_logo]);

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) return;
        const adminRem = await businessProfileApi.getReminderMinutesForUser(user.id);
        setAdminReminderMinutes(adminRem);
        setAdminReminderEnabled(adminRem !== null && Number(adminRem) > 0);
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
      setBookingWindowDraft(String(profileBookingOpenDays ?? 7));
    }
  }, [showBookingWindowModal, profileBookingOpenDays]);

  useLayoutEffect(() => {
    if (!showBookingWindowModal) return;
    const day = profileBookingOpenDays ?? 7;
    const id = requestAnimationFrame(() => {
      bookingDaysRulerRef.current?.scrollToDay(day);
    });
    return () => cancelAnimationFrame(id);
  }, [showBookingWindowModal, profileBookingOpenDays]);

  useLayoutEffect(() => {
    if (!showClientReminderModal) return;
    const h =
      clientReminderMinutes != null && clientReminderMinutes > 0
        ? Math.min(CLIENT_REMINDER_HOURS_MAX, Math.ceil(clientReminderMinutes / 60))
        : 0;
    setClientReminderModalHoursDraft(String(h));
    const id = requestAnimationFrame(() => {
      clientReminderHoursRulerRef.current?.scrollToDay(h);
    });
    return () => cancelAnimationFrame(id);
  }, [showClientReminderModal, clientReminderMinutes]);

  useLayoutEffect(() => {
    if (!showAdminReminderModal) return;
    const raw = adminReminderMinutes;
    const m =
      raw != null && raw > 0
        ? Math.min(
            ADMIN_SELF_REMINDER_MAX_MINUTES,
            Math.max(ADMIN_SELF_REMINDER_MIN_MINUTES, raw),
          )
        : 15;
    setAdminReminderModalMinutesDraft(String(m));
    const id = requestAnimationFrame(() => {
      adminReminderMinutesRulerRef.current?.scrollToDay(m);
    });
    return () => cancelAnimationFrame(id);
  }, [showAdminReminderModal, adminReminderMinutes]);

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

  const openReceiptLegalModal = useCallback(() => {
    setReceiptLegalDisplayName((profileDisplayName || '').trim());
    setReceiptLegalBusinessNumber(String(profile?.business_number ?? '').trim());
    setReceiptLegalBusinessPhone(String(profile?.phone ?? '').trim());
    setReceiptLegalVatExempt(profile?.vat_exempt === true);
    setShowReceiptLegalModal(true);
  }, [profileDisplayName, profile?.business_number, profile?.phone, profile?.vat_exempt]);

  const handleSaveReceiptLegalDetails = async () => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        display_name: receiptLegalDisplayName.trim() || null as any,
        business_number: receiptLegalBusinessNumber.trim() || null as any,
        phone: receiptLegalBusinessPhone.trim() || null as any,
        vat_exempt: receiptLegalVatExempt as any,
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
        tiktok_url: (profileTiktok || '').trim() || null as any,
      });
      if (!updated) {
        Alert.alert(t('error.generic', 'Error'), t('settings.profile.receiptLegalSaveFailed', 'Could not save receipt details'));
        return;
      }
      setProfile(updated);
      setProfileDisplayName(updated.display_name || '');
      setShowReceiptLegalModal(false);
      Alert.alert(t('success.generic', 'Success'), t('settings.profile.saveSuccess', 'Business details saved successfully'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Open editors with current values
  const openEditAddress = () => {
    setAddressDraft(profileAddress || '');
    setPlacesFormattedAddress('');
    setPlacesPlaceId('');
    setPlacesLat(null);
    setPlacesLng(null);
    justSelectedPlaceRef.current = false;
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
  useEffect(() => {
    if (!showAddressSheet) {
      setAddressKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setAddressKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setAddressKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [showAddressSheet]);
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

  const handleAllowMultiServiceBookingToggle = async (next: boolean) => {
    if (!canSeeAddEmployee) return;
    const prev = allowMultiServiceBooking;
    setAllowMultiServiceBooking(next);
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.setAllowMultiServiceBooking(next);
      if (!updated) {
        setAllowMultiServiceBooking(prev);
        Alert.alert(
          t('error.generic', 'Error'),
          t('settings.policies.allowMultiServiceBookingSaveFailed', 'Could not save this setting'),
        );
        return;
      }
      setProfile(updated);
      setAllowMultiServiceBooking(isMultiServiceBookingAllowed(updated));
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

  const handleHomeFixedMessageToggle = async (next: boolean) => {
    if (!canSeeAddEmployee) return;
    const prevEnabled = homeFixedMessageEnabled;
    setHomeFixedMessageEnabled(next);
    setIsSavingProfile(true);
    try {
      if (next) {
        const trimmed = homeFixedMessageText.trim();
        if (trimmed.length > HOME_FIXED_MESSAGE_MAX_LEN) {
          setHomeFixedMessageEnabled(prevEnabled);
          Alert.alert(
            t('error.generic', 'Error'),
            t('settings.policies.homeFixedMessageTooLong', { max: HOME_FIXED_MESSAGE_MAX_LEN }),
          );
          return;
        }
        const updated = await businessProfileApi.updateHomeFixedMessage({
          enabled: true,
          message: trimmed || null,
        });
        if (!updated) {
          setHomeFixedMessageEnabled(prevEnabled);
          Alert.alert(
            t('error.generic', 'Error'),
            t('settings.policies.homeFixedMessageSaveFailed', 'Could not save the home message setting'),
          );
          return;
        }
        setProfile(updated);
        setHomeFixedMessageEnabled(updated.home_fixed_message_enabled === true);
        setHomeFixedMessageText(updated.home_fixed_message ?? '');
        {
          const hm = String(updated.home_fixed_message ?? '').trim();
          setHomeFixedMessageEditorOpen(hm.length === 0);
        }
      } else {
        const updated = await businessProfileApi.updateHomeFixedMessage({ enabled: false });
        if (!updated) {
          setHomeFixedMessageEnabled(prevEnabled);
          Alert.alert(
            t('error.generic', 'Error'),
            t('settings.policies.homeFixedMessageSaveFailed', 'Could not save the home message setting'),
          );
          return;
        }
        setProfile(updated);
        setHomeFixedMessageEnabled(false);
        setHomeFixedMessageText(updated.home_fixed_message ?? homeFixedMessageText);
        setHomeFixedMessageEditorOpen(false);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    if (homeFixedMessageEditorOpen) {
      homeFixedMessageEditorSnapshotRef.current = homeFixedMessageText;
    }
  }, [homeFixedMessageEditorOpen]);

  const handleHomeFixedMessageEditorCancel = useCallback(() => {
    setHomeFixedMessageText(homeFixedMessageEditorSnapshotRef.current);
    setHomeFixedMessageEditorOpen(false);
    Keyboard.dismiss();
  }, []);

  const handleHomeFixedMessageSavePress = async () => {
    if (!canSeeAddEmployee || !homeFixedMessageEnabled) return;
    const trimmed = homeFixedMessageText.trim();
    if (trimmed.length > HOME_FIXED_MESSAGE_MAX_LEN) {
      Alert.alert(
        t('error.generic', 'Error'),
        t('settings.policies.homeFixedMessageTooLong', { max: HOME_FIXED_MESSAGE_MAX_LEN }),
      );
      return;
    }
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.updateHomeFixedMessage({
        enabled: true,
        message: trimmed || null,
      });
      if (!updated) {
        Alert.alert(
          t('error.generic', 'Error'),
          t('settings.policies.homeFixedMessageSaveFailed', 'Could not save the home message setting'),
        );
        return;
      }
      setProfile(updated);
      setHomeFixedMessageText(updated.home_fixed_message ?? '');
      setHomeFixedMessageEditorOpen(false);
      Keyboard.dismiss();
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: { endCoordinates?: { height?: number } }) => {
      setSettingsKeyboardInset(Math.max(0, e.endCoordinates?.height ?? 0));
    };
    const onHide = () => setSettingsKeyboardInset(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const persistBookingOpenDays = async (next: string): Promise<boolean> => {
    if (!user?.id) {
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.bookingWindowNeedUser', 'Sign in to save your booking window.'));
      return false;
    }
    const trimmed = (next || '').trim();
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.bookingWindowInvalid', 'Enter a number between 0 and 60.'));
      return false;
    }
    const parsed = Math.max(0, Math.min(60, Math.floor(n)));
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
      setShowBookingWindowModal(false);
    }
  };

  const onBookingWindowRulerDay = useCallback((day: number) => {
    if (day < BOOKING_WINDOW_MIN) {
      setBookingWindowDraft(String(BOOKING_WINDOW_MIN));
      requestAnimationFrame(() => bookingDaysRulerRef.current?.scrollToDay(BOOKING_WINDOW_MIN));
      return;
    }
    const d = Math.min(BOOKING_WINDOW_MAX, day);
    setBookingWindowDraft(String(d));
  }, []);

  const onBookingWindowTextChange = useCallback((text: string) => {
    setBookingWindowDraft(text);
    const digits = text.replace(/\D/g, '');
    const n = parseInt(digits, 10);
    if (Number.isFinite(n) && n >= BOOKING_WINDOW_MIN && n <= BOOKING_WINDOW_MAX) {
      bookingDaysRulerRef.current?.scrollToDay(n);
    }
  }, []);

  const openClientReminderModal = useCallback(() => {
    if (!user?.id || !canSeeAddEmployee) return;
    setShowClientReminderModal(true);
  }, [user?.id, canSeeAddEmployee]);

  const dismissClientReminderModal = useCallback(() => {
    setShowClientReminderModal(false);
  }, []);

  const onClientReminderHoursRulerChange = useCallback((hours: number) => {
    const d = Math.min(CLIENT_REMINDER_HOURS_MAX, Math.max(CLIENT_REMINDER_HOURS_MIN, hours));
    setClientReminderModalHoursDraft(String(d));
  }, []);

  const onClientReminderHoursTextChange = useCallback((text: string) => {
    setClientReminderModalHoursDraft(text);
    const digits = text.replace(/\D/g, '');
    const n = parseInt(digits, 10);
    if (Number.isFinite(n) && n >= CLIENT_REMINDER_HOURS_MIN && n <= CLIENT_REMINDER_HOURS_MAX) {
      clientReminderHoursRulerRef.current?.scrollToDay(n);
    }
  }, []);

  const saveClientReminderFromModal = async () => {
    if (!user?.id || !canSeeAddEmployee) return;
    const hRaw = clientReminderModalHoursDraft.trim();
    if (!hRaw || !/^\d+$/.test(hRaw)) {
      Alert.alert(t('error.generic', 'Error'), t('settings.reminder.clientDialogInvalidHours'));
      return;
    }
    const h = parseInt(hRaw, 10);
    if (h < CLIENT_REMINDER_HOURS_MIN || h > CLIENT_REMINDER_HOURS_MAX) {
      Alert.alert(t('error.generic', 'Error'), t('settings.reminder.clientDialogInvalidHours'));
      return;
    }
    const total = h * 60;
    try {
      setIsSavingProfile(true);
      if (total === 0) {
        await businessProfileApi.setClientReminderMinutes(null);
        setClientReminderMinutes(null);
        setProfile((prev) => (prev ? { ...prev, client_reminder_minutes: null } : prev));
        setShowClientReminderModal(false);
        return;
      }
      if (total > 1440) {
        Alert.alert(t('error.generic', 'Error'), t('settings.profile.reminderInvalid', 'Enter a valid number between 1 and 1440 minutes'));
        return;
      }
      await businessProfileApi.setClientReminderMinutes(total);
      setClientReminderMinutes(total);
      setProfile((prev) => (prev ? { ...prev, client_reminder_minutes: total } : prev));
      setShowClientReminderModal(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const openAdminReminderModal = useCallback(
    (fromSwitch = false) => {
      if (!user?.id) return;
      if (fromSwitch) setAdminReminderSwitchPending(true);
      setShowAdminReminderModal(true);
    },
    [user?.id],
  );

  const onAdminReminderMinutesRulerChange = useCallback((minutes: number) => {
    const d = Math.min(
      ADMIN_SELF_REMINDER_MAX_MINUTES,
      Math.max(ADMIN_SELF_REMINDER_MIN_MINUTES, minutes),
    );
    setAdminReminderModalMinutesDraft(String(d));
  }, []);

  const onAdminReminderMinutesTextChange = useCallback((text: string) => {
    setAdminReminderModalMinutesDraft(text);
    const digits = text.replace(/\D/g, '');
    const n = parseInt(digits, 10);
    if (
      Number.isFinite(n) &&
      n >= ADMIN_SELF_REMINDER_MIN_MINUTES &&
      n <= ADMIN_SELF_REMINDER_MAX_MINUTES
    ) {
      adminReminderMinutesRulerRef.current?.scrollToDay(n);
    }
  }, []);

  const dismissAdminReminderModal = useCallback(() => {
    setShowAdminReminderModal(false);
    setAdminReminderSwitchPending(false);
  }, []);

  const saveAdminReminderFromModal = async () => {
    if (!user?.id) return;
    const raw = adminReminderModalMinutesDraft.trim();
    if (!raw || !/^\d+$/.test(raw)) {
      Alert.alert(t('error.generic', 'Error'), t('settings.reminder.adminDialogInvalidMinutes'));
      return;
    }
    const total = parseInt(raw, 10);
    if (total < ADMIN_SELF_REMINDER_MIN_MINUTES || total > ADMIN_SELF_REMINDER_MAX_MINUTES) {
      Alert.alert(t('error.generic', 'Error'), t('settings.reminder.adminDialogInvalidMinutes'));
      return;
    }
    try {
      setIsSavingProfile(true);
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
          animateCloseSheet(() => closeManageRecurringSheetRef.current());
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

  const updateLocalServiceField = <K extends keyof Service>(id: string, key: K, value: Service[K]) => {
    setEditableServices(prev => prev.map(s => (s.id === id ? { ...s, [key]: value } : s)));
  };

  // Add Service modal (same native sheet pattern as AddAdminModal)
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [showCountsDropdown, setShowCountsDropdown] = useState(false);

  const [showDurationPicker, setShowDurationPicker] = useState(false);
  /** When set, duration picker updates this service row */
  const [editingServiceDurationId, setEditingServiceDurationId] = useState<string | null>(null);
  // category removed
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
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

  /** Storage path extension — avoid `image/svg+xml` → invalid `svg+xml` segment from naive split('/')[1]. */
  const fileExtensionForHomeLogoMime = (mime: string): string => {
    const m = mime.toLowerCase().split(';')[0].trim();
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpeg';
    if (m === 'image/png') return 'png';
    if (m === 'image/webp') return 'webp';
    if (m === 'image/heic' || m === 'image/heif') return 'heic';
    if (m === 'image/gif') return 'gif';
    return 'png';
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

  const animateEditAdminSheetClosed = useCallback(() => {
    Animated.parallel([
      Animated.timing(editAdminSheetAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(editAdminDragY, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      editAdminDragY.setValue(0);
      setShowEditAdminModal(false);
    });
  }, [editAdminSheetAnim, editAdminDragY]);

  const requestCloseEditAdminSheet = useCallback(() => {
    if (isSavingAdmin) return;
    animateEditAdminSheetClosed();
  }, [isSavingAdmin, animateEditAdminSheetClosed]);

  useEffect(() => {
    if (!showEditAdminModal) return;
    editAdminDragY.setValue(0);
    editAdminSheetAnim.setValue(0);
    const id = requestAnimationFrame(() => {
      Animated.timing(editAdminSheetAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => cancelAnimationFrame(id);
  }, [showEditAdminModal, editAdminSheetAnim, editAdminDragY]);

  const editAdminGrabberPanHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, g: PanResponderGestureState) =>
          g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
          editAdminDragY.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_: GestureResponderEvent, g: PanResponderGestureState) => {
          const shouldClose = g.dy > 90 || g.vy > 0.82;
          if (shouldClose && !isSavingAdmin) {
            Animated.timing(editAdminSheetAnim, {
              toValue: 0,
              duration: 220,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }).start(() => {
              editAdminDragY.setValue(0);
              setShowEditAdminModal(false);
            });
          } else {
            Animated.timing(editAdminDragY, {
              toValue: 0,
              duration: 180,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.timing(editAdminDragY, {
            toValue: 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        },
      }).panHandlers,
    [editAdminDragY, editAdminSheetAnim, isSavingAdmin],
  );

  const saveEditAdminModal = useCallback(async () => {
    if (!user?.id) {
      animateEditAdminSheetClosed();
      return;
    }
    if (!adminNameDraft.trim() || !adminPhoneDraft.trim()) {
      Alert.alert(
        t('error.generic', 'Error'),
        t('settings.admin.fillNamePhone', 'Please fill in name and phone number'),
      );
      return;
    }
    try {
      setIsSavingAdmin(true);
      const updated = await usersApi.updateUser(
        user.id as any,
        {
          name: adminNameDraft.trim() as any,
          phone: adminPhoneDraft.trim() as any,
        } as any,
      );
      if (updated) {
        updateUserProfile({ name: updated.name as any, phone: (updated as any).phone } as any);
        animateEditAdminSheetClosed();
      } else {
        Alert.alert(
          t('error.generic', 'Error'),
          t('settings.admin.saveDetailsFailed', 'Failed to save admin details'),
        );
      }
    } finally {
      setIsSavingAdmin(false);
    }
  }, [user?.id, adminNameDraft, adminPhoneDraft, t, updateUserProfile, animateEditAdminSheetClosed]);

  const uploadHomeScreenLogo = async (asset: {
    uri: string;
    base64?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
  }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
      let fileBody: Blob | Uint8Array;
      if (asset.base64) {
        const bytes = base64ToUint8Array(asset.base64);
        fileBody = bytes;
      } else {
        const uri = String(asset.uri || '').trim();
        /** iOS Files + Hermes: `fetch(file://…)` often yields an empty Blob; read bytes via Expo FS. */
        const readLocalViaFs =
          Platform.OS !== 'web' &&
          uri.length > 0 &&
          (uri.startsWith('file:') || (Platform.OS === 'android' && uri.startsWith('content:')));
        if (readLocalViaFs) {
          const b64 = await readAsStringAsync(uri, { encoding: 'base64' });
          const bytes = base64ToUint8Array(b64);
          if (bytes.length < 32) {
            console.error('home logo file read too small', bytes.length);
            return null;
          }
          fileBody = bytes;
        } else {
          const response = await fetch(uri, { cache: 'no-store' });
          const fetched = await response.blob();
          fileBody = fetched;
          contentType = fetched.type || contentType;
        }
      }
      const extGuess = fileExtensionForHomeLogoMime(contentType);
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const bid = getBusinessId();
      const filePath = `home-logos/${bid}/${Date.now()}_${randomId()}.${extGuess}`;
      const { error: uploadError } = await supabase.storage
        .from('app_design')
        .upload(filePath, fileBody as any, { contentType, upsert: false });
      if (uploadError) {
        console.error('home logo upload error', uploadError);
        return null;
      }
      const { data } = supabase.storage.from('app_design').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('home logo upload exception', e);
      return null;
    }
  };

  const uploadAndSaveHomeLogo = async (asset: {
    uri: string;
    base64?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
  }) => {
    setIsUploadingHomeLogo(true);
    try {
      const uploadedUrl = await uploadHomeScreenLogo(asset);
      if (!uploadedUrl) {
        Alert.alert(t('error.generic', 'Error'), t('settings.profile.homeLogoUploadFailed', 'Logo upload failed'));
        return;
      }
      const updated = await businessProfileApi.updateHomeLogoUrl(uploadedUrl);
      if (!updated) {
        Alert.alert(t('error.generic', 'Error'), t('settings.profile.homeLogoSaveFailed', 'Failed to save logo'));
        return;
      }
      setProfile(updated);
    } catch (e) {
      console.error('pick/upload home logo failed', e);
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.homeLogoUploadFailed', 'Logo upload failed'));
    } finally {
      setIsUploadingHomeLogo(false);
    }
  };

  const pickHomeScreenLogoFromPhotoLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('profile.permissionRequired', 'Permission Required'),
          t('profile.permissionGallery', 'Please allow gallery access to pick a profile picture'),
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: false,
        quality: 0.92,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const a: any = result.assets[0];
      await uploadAndSaveHomeLogo({
        uri: a.uri,
        base64: a.base64 ?? null,
        mimeType: a.mimeType ?? null,
        fileName: a.fileName ?? null,
      });
    } catch (e) {
      console.error('pick home logo from gallery failed', e);
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.homeLogoUploadFailed', 'Logo upload failed'));
    }
  };

  const pickHomeScreenLogoFromFiles = async () => {
    if (homeLogoDocumentPickerBusyRef.current || isUploadingHomeLogo) return;
    homeLogoDocumentPickerBusyRef.current = true;
    try {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(resolve, Platform.OS === 'ios' ? 80 : 0);
        });
      });
      /** Dynamic import so the route can load without the native module (dev clients must be rebuilt after adding the dependency). */
      let DocumentPicker: typeof import('expo-document-picker');
      try {
        DocumentPicker = await import('expo-document-picker');
      } catch {
        Alert.alert(
          t('error.generic', 'Error'),
          t(
            'settings.profile.documentPickerNativeMissing',
            'בחירת קובץ דורשת build מחדש של האפליקציה עם expo-document-picker (למשל: npx expo run:ios או EAS build).',
          ),
        );
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      const mime = String(file.mimeType || guessMimeFromUri(file.name || file.uri));
      if (!mime.startsWith('image/')) {
        Alert.alert(
          t('error.generic', 'Error'),
          t('settings.profile.homeLogoFileNotImage', 'Please choose an image file (PNG, JPEG, etc.).'),
        );
        return;
      }
      await uploadAndSaveHomeLogo({
        uri: file.uri,
        base64: null,
        mimeType: file.mimeType ?? null,
        fileName: file.name ?? null,
      });
    } catch (e) {
      console.error('pick home logo from files failed', e);
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('document picking in progress')) {
        return;
      }
      if (msg.includes('ExpoDocumentPicker') || msg.includes('native module')) {
        Alert.alert(
          t('error.generic', 'Error'),
          t(
            'settings.profile.documentPickerNativeMissing',
            'בחירת קובץ דורשת build מחדש של האפליקציה עם expo-document-picker (למשל: npx expo run:ios או EAS build).',
          ),
        );
        return;
      }
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.homeLogoUploadFailed', 'Logo upload failed'));
    } finally {
      homeLogoDocumentPickerBusyRef.current = false;
    }
  };

  const handleHomeHeaderShowLogoToggle = async (next: boolean) => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.updateHomeHeaderShowLogo(next);
      if (!updated) {
        Alert.alert(
          t('error.generic', 'Error'),
          t('settings.profile.homeHeaderShowLogoSaveFailed', 'Could not save this setting'),
        );
        return;
      }
      setProfile(updated);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveHomeHeaderTextWithoutLogoIfChanged = async () => {
    const raw = homeHeaderNoLogoTitleDraft.trim();
    const stored = String(profile?.home_header_text_without_logo ?? '').trim();
    if (raw === stored) return;
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.updateHomeHeaderTextWithoutLogo(raw.length > 0 ? raw : null);
      if (!updated) {
        Alert.alert(
          t('error.generic', 'Error'),
          t('settings.profile.homeHeaderNoLogoTitleSaveFailed', 'Could not save header text'),
        );
        return;
      }
      setProfile(updated);
    } finally {
      setIsSavingProfile(false);
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

  const handleOpenAddService = () => {
    setShowAddServiceModal(true);
  };

  const handleDeleteService = (id: string) => {
    setDeleteServiceDialog({ id });
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
    const email = 'we.toriaapps@gmail.com';
    const subject = 'Support Request';
    const body = 'Hello Tori Support Team,\n\nI need assistance with:\n\n';
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
      /** General: owner policies + language / delete account (all signed-in admins). */
      if (user || canSeeAddEmployee) {
        const generalTab = {
          id: 'general',
          label: t('settings.sections.general', 'General'),
        };
        /**
         * Visual order uses `flexDirection: 'row'` + LTR. `SettingsScreenTabs` reverses the whole list in RTL.
         * RTL: prepend `general` → after reverse it renders last → physically right (Hebrew “start”).
         * LTR: append `general` → last → physically right.
         */
        if (I18nManager.isRTL) {
          list.unshift(generalTab);
        } else {
          list.push(generalTab);
        }
      }
      return list;
    },
    [canSeeAddEmployee, user, t],
  );

  const [activeSettingsTab, setActiveSettingsTab] = useState<string>('general');
  const { tab: settingsDeepTabParam } = useLocalSearchParams<{ tab?: string | string[] }>();

  useEffect(() => {
    const raw = settingsDeepTabParam;
    const tab = Array.isArray(raw) ? raw[0] : raw;
    if (!tab || typeof tab !== 'string') return;
    const resolved = tab === 'account' ? 'general' : tab;
    const ids = settingsScreenTabs.map((x) => x.id);
    if (!ids.includes(resolved)) return;
    setActiveSettingsTab(resolved);
    router.setParams({ tab: undefined });
  }, [settingsDeepTabParam, settingsScreenTabs, router]);

  useEffect(() => {
    const ids = settingsScreenTabs.map((x) => x.id);
    if (ids.length && !ids.includes(activeSettingsTab)) {
      setActiveSettingsTab(ids[0]!);
    }
  }, [settingsScreenTabs, activeSettingsTab]);

  useEffect(() => {
    if (activeSettingsTab !== 'appointments' && activeSettingsTab !== 'general') {
      Keyboard.dismiss();
    }
  }, [activeSettingsTab]);

  const [showManageRecurringModal, setShowManageRecurringModal] = useState(false);

  const [isLoadingRecurring, setIsLoadingRecurring] = useState(false);
  const [recurringList, setRecurringList] = useState<any[]>([]);

  useEffect(() => {
    closeManageRecurringSheetRef.current = () => setShowManageRecurringModal(false);
  }, []);

  /** No close animation — avoids the sheet flashing / jumping over the add screen when navigating away */
  const dismissRecurringHubAndGoToAdd = useCallback(() => {
    sheetAnim.stopAnimation();
    dragY.stopAnimation();
    sheetAnim.setValue(0);
    dragY.setValue(0);
    setShowManageRecurringModal(false);
    requestAnimationFrame(() => {
      router.push('/(tabs)/add-recurring-appointment');
    });
  }, [router]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(ADMIN_RECURRING_APPOINTMENTS_CHANGED, () => {
      void (async () => {
        try {
          const items = await recurringAppointmentsApi.listAll();
          setRecurringList(items);
        } catch {
          /* ignore */
        }
        setShowManageRecurringModal(true);
        animateOpenSheet();
      })();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (activeSettingsTab !== 'services') {
      setExpandedServiceId(null);
      setShowAddServiceModal(false);
      setShowDurationPicker(false);
      setEditingServiceDurationId(null);
      return;
    }
    let cancelled = false;
    setIsLoadingServices(true);
    setServicesError(null);
    setShowAddServiceModal(false);
    setExpandedServiceId(null);
    void (async () => {
      try {
        const data = await servicesApi.getAllServices();
        const myServices = (data || []).filter((s: any) => String(s?.worker_id || '') === String(user?.id || ''));
        if (!cancelled) setEditableServices(sortServicesLikeClientBooking(myServices || []));
      } catch {
        if (!cancelled) setServicesError(t('settings.services.loadFailed', 'Error loading services'));
      } finally {
        if (!cancelled) setIsLoadingServices(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSettingsTab, user?.id, sortServicesLikeClientBooking, t]);

  // Employees tab (inline list + FAB)
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);

  const loadAdminEmployeesForTab = useCallback(async () => {
    setIsLoadingEmployees(true);
    try {
      const list = await usersApi.getAdminUsers();
      const filtered = (list || []).filter((u: any) => u.id !== (user as any)?.id);
      setAdminUsers(filtered);
    } catch {
      setAdminUsers([]);
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeSettingsTab !== 'employees' || !canSeeAddEmployee) {
      return;
    }
    void loadAdminEmployeesForTab();
  }, [activeSettingsTab, canSeeAddEmployee, loadAdminEmployeesForTab]);

  const openRemoveEmployeeDialog = useCallback(
    (adm: any) => {
      if (adm?.id === user?.id) {
        Alert.alert(
          t('settings.admin.actionNotAllowed', 'Action not allowed'),
          t('settings.admin.cannotRemoveSelf', 'You cannot remove yourself.'),
        );
        return;
      }
      setRemoveEmployeeDialog({
        id: adm.id,
        name: String(adm.name || t('settings.admin.thisEmployee', 'this employee')),
      });
    },
    [user?.id, t],
  );

  const confirmRemoveEmployee = useCallback(async () => {
    if (!removeEmployeeDialog) return;
    const targetId = removeEmployeeDialog.id;
    setRemoveEmployeeLoading(true);
    try {
      const ok = await usersApi.deleteUserAndAllDataById(targetId);
      if (ok) {
        setRemoveEmployeeDialog(null);
        setAdminUsers((prev) => prev.filter((u) => u.id !== targetId));
      } else {
        Alert.alert(t('error.generic', 'Error'), t('settings.admin.removeFailed', 'Failed to remove employee'));
      }
    } catch {
      Alert.alert(t('error.generic', 'Error'), t('settings.admin.removeFailed', 'Failed to remove employee'));
    } finally {
      setRemoveEmployeeLoading(false);
    }
  }, [removeEmployeeDialog, t]);

  const confirmDeleteService = useCallback(async () => {
    if (!deleteServiceDialog) return;
    const targetId = deleteServiceDialog.id;
    setDeleteServiceLoading(true);
    try {
      const ok = await deleteService(targetId);
      if (ok) {
        setDeleteServiceDialog(null);
        setEditableServices((prev) => prev.filter((s) => s.id !== targetId));
        setExpandedServiceId((e) => (e === targetId ? null : e));
      } else {
        Alert.alert(t('error.generic', 'Error'), t('settings.services.deleteFailed', 'Failed to delete service'));
      }
    } catch {
      Alert.alert(t('error.generic', 'Error'), t('settings.services.deleteFailed', 'Failed to delete service'));
    } finally {
      setDeleteServiceLoading(false);
    }
  }, [deleteServiceDialog, t]);

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

          <View
            style={[
              styles.settingsBelowTabs,
              {
                /** Reserve space for floating tab bar (general: logout is inside ScrollView). */
                paddingBottom:
                  activeSettingsTab === 'appointments' ? 0 : insets.bottom + 100,
              },
            ]}
          >
        {activeSettingsTab === 'general' && (
          <ScrollView
            style={styles.settingsAppointmentsScroll}
            contentContainerStyle={[
              styles.settingsAppointmentsScrollContent,
              /** Without this override, `flexGrow: 1` can leave the logout row off-layout on some devices. */
              { flexGrow: 0 },
              {
                paddingBottom:
                  insets.bottom +
                  120 +
                  (Platform.OS === 'android' ? settingsKeyboardInset : 0),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
            <View style={styles.settingsTabPanel}>
              <View style={styles.settingsAccordionBody}>
                {canSeeAddEmployee ? (
                <>
                <View style={styles.settingItemLTR}>
                  <View style={styles.settingIconLTR}>
                    <User size={20} color={businessColors.primary} />
                  </View>
                  <View
                    style={{
                      flex: 1,
                      paddingRight: 8,
                      opacity: requireClientApproval ? 1 : 0.55,
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
                    disabled={isSavingProfile}
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
                    <Megaphone size={20} color={businessColors.primary} />
                  </View>
                  <View
                    style={{
                      flex: 1,
                      paddingRight: 8,
                      opacity: homeFixedMessageEnabled ? 1 : 0.55,
                    }}
                  >
                    <Text style={styles.settingTitleLTR}>
                      {t('settings.policies.homeFixedMessageTitle', 'Fixed message on client home')}
                    </Text>
                    <Text style={styles.settingSubtitleLTR}>
                      {t(
                        'settings.policies.homeFixedMessageSubtitle',
                        'When on, clients will see your message on the home screen (after you enable it in the app).',
                      )}
                    </Text>
                  </View>
                  <Switch
                    value={homeFixedMessageEnabled}
                    onValueChange={(v) => {
                      void handleHomeFixedMessageToggle(v);
                    }}
                    disabled={isSavingProfile}
                    trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                    thumbColor={
                      homeFixedMessageEnabled
                        ? businessColors.primary
                        : Platform.OS === 'android'
                          ? '#f4f3f4'
                          : undefined
                    }
                    ios_backgroundColor="#E5E5EA"
                  />
                </View>
                {homeFixedMessageEnabled ? (
                  homeFixedMessageEditorOpen ? (
                    <View style={styles.homeFixedMessageComposer}>
                      <TextInput
                        ref={homeFixedMessageInputRef}
                        style={[
                          styles.homeFixedMessageInput,
                          {
                            borderColor: homeFixedInputFocused
                              ? `${businessColors.primary}66`
                              : 'rgba(60,60,67,0.11)',
                            textAlign: editAdminInputsRtl ? 'right' : 'left',
                          },
                        ]}
                        value={homeFixedMessageText}
                        onChangeText={setHomeFixedMessageText}
                        placeholder={t('settings.policies.homeFixedMessagePlaceholder', 'Message for clients…')}
                        placeholderTextColor={Colors.subtext}
                        multiline
                        maxLength={HOME_FIXED_MESSAGE_MAX_LEN}
                        editable={!isSavingProfile}
                        textAlignVertical="top"
                        selectionColor={businessColors.primary}
                        onFocus={() => {
                          setHomeFixedInputFocused(true);
                        }}
                        onBlur={() => setHomeFixedInputFocused(false)}
                      />
                      <View
                        style={[
                          styles.homeFixedMessageComposerFooter,
                          editAdminInputsRtl ? styles.homeFixedMessageComposerFooterRtl : null,
                        ]}
                      >
                        <Text style={styles.homeFixedMessageCounter}>
                          {homeFixedMessageText.length}/{HOME_FIXED_MESSAGE_MAX_LEN}
                        </Text>
                      </View>
                      <View style={styles.homeFixedMessageComposerActions}>
                        <TouchableOpacity
                          style={[
                            styles.homeFixedMessageSaveButton,
                            styles.homeFixedMessageSaveButtonInComposerRow,
                            {
                              backgroundColor: businessColors.primary,
                              opacity: isSavingProfile ? 0.55 : 1,
                            },
                          ]}
                          onPress={() => {
                            void handleHomeFixedMessageSavePress();
                          }}
                          disabled={isSavingProfile}
                          activeOpacity={0.88}
                          accessibilityRole="button"
                          accessibilityLabel={t('settings.policies.homeFixedMessageSave', 'Save message')}
                        >
                          <Text style={styles.homeFixedMessageSaveButtonText}>
                            {isSavingProfile
                              ? t('settings.common.saving', 'Saving...')
                              : t('settings.policies.homeFixedMessageSave', 'Save message')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.homeFixedMessageCancelButton}
                          onPress={handleHomeFixedMessageEditorCancel}
                          disabled={isSavingProfile}
                          activeOpacity={0.88}
                          accessibilityRole="button"
                          accessibilityLabel={t('cancel', 'Cancel')}
                        >
                          <Text style={styles.homeFixedMessageCancelButtonText}>{t('cancel', 'Cancel')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.homeFixedMessageSummaryCard,
                        pressed ? { opacity: 0.88 } : null,
                      ]}
                      onPress={() => {
                        setHomeFixedMessageEditorOpen(true);
                      }}
                      disabled={isSavingProfile}
                    >
                      <View style={styles.homeFixedMessageSummaryTextCol}>
                        <Text
                          style={[
                            styles.homeFixedMessagePreviewText,
                            editAdminInputsRtl ? styles.homeFixedMessageSummaryTextRtl : null,
                            homeFixedMessageText.trim().length === 0
                              ? styles.homeFixedMessagePreviewEmpty
                              : null,
                          ]}
                          numberOfLines={2}
                        >
                          {homeFixedMessageText.trim().length > 0
                            ? homeFixedMessageText.trim()
                            : t(
                                'settings.policies.homeFixedMessageNoMessageYet',
                                'No message yet — tap to add one',
                              )}
                        </Text>
                        <Text
                          style={[
                            styles.homeFixedMessageTapToEdit,
                            editAdminInputsRtl ? styles.homeFixedMessageSummaryTextRtl : null,
                          ]}
                        >
                          {t('settings.policies.homeFixedMessageTapToEdit', 'Tap to edit')}
                        </Text>
                      </View>
                      <View style={styles.homeFixedMessageSummaryIconWrap}>
                        <Pencil size={18} color={businessColors.primary} strokeWidth={2} />
                      </View>
                    </Pressable>
                  )
                ) : null}
                </>
                ) : null}
                {user ? (
                  <>
                    {canSeeAddEmployee ? <View style={styles.settingDivider} /> : null}
                    {renderSettingItem(
                      <Ionicons name="globe-outline" size={20} color={businessColors.primary} />,
                      t('profile.language.title', 'Language'),
                      (() => {
                        switch (normalizeAppLanguage(i18n.language)) {
                          case 'he':
                            return t('profile.language.hebrew', 'Hebrew');
                          case 'ar':
                            return t('profile.language.arabic', 'Arabic');
                          case 'ru':
                            return t('profile.language.russian', 'Russian');
                          default:
                            return t('profile.language.english', 'English');
                        }
                      })(),
                      undefined,
                      () => setIsLanguageOpen(true),
                    )}
                    {renderSettingItem(
                      <Trash2 size={20} color="#FF3B30" />,
                      t('profile.delete.title', 'Delete Account'),
                      t('profile.delete.subtitle', 'Permanently delete your account'),
                      undefined,
                      () => setShowDeleteAccountModal(true),
                    )}
                  </>
                ) : null}
              </View>
            </View>
            {user ? (
              <TouchableOpacity
                style={[styles.logoutButton, { backgroundColor: businessColors.primary }]}
                onPress={handleLogout}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={t('settings.sections.logoutLabel', 'Logout')}
              >
                <LogOut size={20} color={Colors.white} />
                <Text style={styles.logoutText}>{t('settings.sections.logoutLabel', 'Logout')}</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        )}

        {activeSettingsTab === 'appointments' && (
          <ScrollView
            style={styles.settingsAppointmentsScroll}
            contentContainerStyle={[
              styles.settingsAppointmentsScrollContent,
              {
                /**
                 * iOS: do NOT add keyboard height here — `automaticallyAdjustKeyboardInsets` already
                 * adjusts insets; adding both + scrollToEnd scrolled into empty space below the field.
                 * Android: manual bottom padding when keyboard is open (insets API is weaker).
                 */
                paddingBottom:
                  insets.bottom +
                  120 +
                  (Platform.OS === 'android' ? settingsKeyboardInset : 0),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
            {canSeeAddEmployee
              ? renderSettingItemLTR(
                  <Calendar size={20} color={businessColors.primary} />,
                  t('settings.profile.bookingWindowRowTitle', 'How far ahead clients can book you'),
                  t('settings.profile.bookingWindowRowSubtitle', { count: profileBookingOpenDays ?? 7 }),
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
            {canSeeAddEmployee
              ? renderSettingItemLTR(
                  <Bell size={20} color={businessColors.primary} />,
                  t('settings.reminder.clientRowTitle', 'Client reminder before appointment'),
                  clientReminderMinutes != null && clientReminderMinutes > 0
                    ? t('settings.reminder.clientRowValueHours', {
                        count: Math.max(1, Math.round(clientReminderMinutes / 60)),
                      })
                    : t('settings.reminder.clientTapToEdit', 'Tap to edit reminder timing'),
                  undefined,
                  () => openClientReminderModal(),
                  undefined,
                  !user?.id,
                )
              : null}
            {canSeeAddEmployee ? (
              <>
                <View style={styles.settingItemLTR}>
                  <View style={styles.settingIconLTR}>
                    <Clock size={20} color={businessColors.primary} />
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      { flex: 1, paddingRight: 8, opacity: cancellationLimitActive ? 1 : 0.55 },
                      pressed && cancellationLimitActive ? { opacity: 0.88 } : null,
                    ]}
                    onPress={() => {
                      if (cancellationLimitActive) openCancellationEditor(false);
                    }}
                    disabled={!cancellationLimitActive}
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
                    disabled={isSavingProfile}
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
              </>
            ) : null}
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
            {canSeeAddEmployee ? (
              <>
                <View style={styles.settingDivider} />
                <View style={styles.settingItemLTR}>
                  <View style={styles.settingIconLTR}>
                    <Ionicons name="swap-horizontal" size={20} color={businessColors.primary} />
                  </View>
                  <View
                    style={{
                      flex: 1,
                      paddingRight: 8,
                      opacity: clientSwapEnabled ? 1 : 0.55,
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
                    disabled={isSavingProfile}
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
                <View style={styles.settingDivider} />
                <View style={styles.settingItemLTR}>
                  <View style={styles.settingIconLTR}>
                    <Layers size={20} color={businessColors.primary} />
                  </View>
                  <View
                    style={{
                      flex: 1,
                      paddingRight: 8,
                      opacity: allowMultiServiceBooking ? 1 : 0.55,
                    }}
                  >
                    <Text style={styles.settingTitleLTR}>
                      {t(
                        'settings.policies.allowMultiServiceBookingTitle',
                        'Several services in one visit',
                      )}
                    </Text>
                    <Text style={styles.settingSubtitleLTR}>
                      {t(
                        'settings.policies.allowMultiServiceBookingSubtitle',
                        'Off: one service per booking. On: clients can pick multiple services as one continuous slot.',
                      )}
                    </Text>
                  </View>
                  <Switch
                    value={allowMultiServiceBooking}
                    onValueChange={handleAllowMultiServiceBookingToggle}
                    disabled={isSavingProfile}
                    trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                    thumbColor={
                      allowMultiServiceBooking
                        ? businessColors.primary
                        : Platform.OS === 'android'
                          ? '#f4f3f4'
                          : undefined
                    }
                    ios_backgroundColor="#E5E5EA"
                  />
                </View>
              </>
            ) : null}
          </View>
        </View>
          </ScrollView>
        )}

        {activeSettingsTab === 'services' && (
        <View style={[styles.settingsTabPanel, styles.settingsTabPanelServices]}>
            <View style={[styles.servicesModalBodyColumn, styles.servicesModalBodyGrouped]}>
              <View style={styles.settingsListScreenHeader}>
                <TouchableOpacity
                  style={[styles.settingsListScreenHeaderAdd, { backgroundColor: businessColors.primary }]}
                  onPress={handleOpenAddService}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.services.add', 'Add service')}
                >
                  <Plus size={22} color={Colors.white} strokeWidth={2.4} />
                </TouchableOpacity>
                <View style={styles.settingsListScreenHeaderTextCol}>
                  <Text style={styles.settingsListScreenHeaderTitle} numberOfLines={1}>
                    {t('settings.services.edit', 'Edit services')}
                  </Text>
                  <Text style={styles.settingsListScreenHeaderSubtitle} numberOfLines={2}>
                    {t('settings.services.editSubtitle', 'Update prices and durations')}
                  </Text>
                </View>
              </View>
              <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
              <DraggableFlatList<Service>
                style={{ flex: 1, backgroundColor: 'transparent' }}
                containerStyle={{ flex: 1, backgroundColor: 'transparent' }}
                contentContainerStyle={[
                  styles.modalContentContainer,
                  styles.servicesModalScrollContent,
                  {
                    paddingTop: 10,
                    paddingBottom: insets.bottom + 80,
                    backgroundColor: 'transparent',
                  },
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

                {!isLoadingServices && !servicesError && editableServices.length === 0 && !showAddServiceModal && (
                  <View style={[styles.svcEmptyState, styles.servicesModalFullWidthBlock]}>
                    <View style={[styles.svcEmptyIcon, { backgroundColor: `${businessColors.primary}15` }]}>
                      <Ionicons name="cut-outline" size={32} color={businessColors.primary} />
                    </View>
                    <Text style={styles.svcEmptyTitle}>{t('settings.services.emptyTitle','No services yet')}</Text>
                    <Text style={styles.svcEmptySubtitle}>{t('settings.services.emptySubtitle','Add your first service to get started')}</Text>
                    <Text style={[styles.svcEmptySubtitle, { marginTop: 10, textAlign: 'center' }]}>
                      {t('settings.services.fabAddHint', 'Long-press a row to reorder · + below to add')}
                    </Text>
                  </View>
                )}
                </>
                }
                renderItem={({ item: svc, drag, isActive }) => {
                  const isExpanded = expandedServiceId === svc.id;
                  const isSaving = savingServiceId === svc.id;
                  const justSaved = savedServiceId === svc.id;
                  return (
                    <ScaleDecorator activeScale={1.03}>
                    <View style={styles.svcListCell}>
                    <Pressable
                      onLongPress={!isExpanded ? drag : undefined}
                      delayLongPress={280}
                      disabled={isActive}
                      style={({ pressed }) => (pressed && isActive ? { opacity: 0.95 } : undefined)}
                    >
                    <SettingsServiceSwipeRow
                      enabled={!isExpanded && !isActive}
                      onDeletePress={() => handleDeleteService(svc.id)}
                    >
                      <View style={[styles.svcCard, styles.svcListCard, justSaved && styles.svcCardSaved, isActive && styles.svcListCardDragging]}>
                        <View style={[styles.svcCardAccent, { backgroundColor: businessColors.primary }]} />
                        {!isExpanded ? (
                          <View style={styles.svcListCollapsedRow}>
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
                            <TouchableOpacity
                              style={styles.svcListCollapsedMain}
                              activeOpacity={0.85}
                              onPress={() => setExpandedServiceId(prev => (prev === svc.id ? null : svc.id))}
                            >
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
                          </View>
                        ) : (
                          <>
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
                    </SettingsServiceSwipeRow>
                    </Pressable>
                    </View>
                    </ScaleDecorator>
                  );
                }}
              />

              </GestureHandlerRootView>
            </View>
        </View>
        )}

        {canSeeAddEmployee && activeSettingsTab === 'business' && (
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
              {renderSettingItemLTR(
                <FileText size={20} color={businessColors.primary} />,
                t('settings.profile.receiptLegalRowTitle', 'Receipt & tax details'),
                t(
                  'settings.profile.receiptLegalRowSubtitle',
                  'Name, VAT ID, phone, VAT-exempt — used on receipts (320)',
                ),
                undefined,
                openReceiptLegalModal,
              )}
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
          <GHScrollView
            style={styles.settingsAppointmentsScroll}
            contentContainerStyle={[
              styles.settingsAppointmentsScrollContent,
              {
                paddingBottom:
                  insets.bottom +
                  120 +
                  (Platform.OS === 'android' ? settingsKeyboardInset : 0),
              },
            ]}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
        <View style={styles.settingsTabPanel}>
          <View style={styles.settingsAccordionBody}>
              <View style={styles.colorPickerWrapper}>
                <ColorPicker
                  currentColor={profile?.primary_color || '#000000'}
                  returnSettingsTab="design"
                />
              </View>
              <View style={styles.settingDivider} />
              {renderSettingItemLTR(
                <Ionicons name="images-outline" size={20} color={businessColors.primary} />,
                t('settings.profile.homeAnimationRowTitle', 'Home animation images'),
                t('settings.profile.homeAnimationRowSubtitle', 'Edit the images in the top home animation'),
                undefined,
                () => router.push('/(tabs)/edit-home-hero'),
                false,
                false
              )}
              <View style={styles.homeLogoDesignBlock}>
                <View style={styles.homeHeaderLogoToggleRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.settingTitleLTR}>
                      {t('settings.profile.homeHeaderShowLogoTitle', 'Show logo on home')}
                    </Text>
                    <Text style={styles.settingSubtitleLTR}>
                      {t(
                        'settings.profile.homeHeaderShowLogoSubtitle',
                        'When off, set a custom name for the top of the home screen (manager and client). Leave blank to use the business display name.',
                      )}
                    </Text>
                  </View>
                  {/* RN Switch keeps LTR thumb semantics in RTL rows — mirror so “on” matches Hebrew expectations */}
                  <View style={editAdminInputsRtl ? styles.homeHeaderShowLogoSwitchRtl : undefined}>
                    <Switch
                      value={profile?.home_header_show_logo !== false}
                      onValueChange={(v) => {
                        void handleHomeHeaderShowLogoToggle(v);
                      }}
                      disabled={isUploadingHomeLogo || isSavingProfile}
                      trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                      thumbColor={
                        profile?.home_header_show_logo !== false
                          ? businessColors.primary
                          : Platform.OS === 'android'
                            ? '#f4f3f4'
                            : undefined
                      }
                      ios_backgroundColor="#E5E5EA"
                    />
                  </View>
                </View>
                {profile?.home_header_show_logo === false ? (
                  <>
                    <View style={styles.settingDivider} />
                    <View style={styles.homeHeaderNoLogoCard}>
                      <Text style={styles.homeHeaderNoLogoTitleLabel}>
                        {t('settings.profile.homeHeaderNoLogoTitleLabel', 'Name at top of home (no logo)')}
                      </Text>
                      <Text style={styles.homeHeaderNoLogoTitleHint}>
                        {t(
                          'settings.profile.homeHeaderNoLogoTitleHint',
                          'Leave empty to use the business display name from business details.',
                        )}
                      </Text>
                      <TextInput
                        style={[
                          styles.homeHeaderNoLogoTitleInput,
                          {
                            textAlign: editAdminInputsRtl ? 'right' : 'left',
                            writingDirection: editAdminInputsRtl ? 'rtl' : 'ltr',
                          },
                        ]}
                        value={homeHeaderNoLogoTitleDraft}
                        onChangeText={setHomeHeaderNoLogoTitleDraft}
                        onBlur={() => void saveHomeHeaderTextWithoutLogoIfChanged()}
                        placeholder={
                          (profileDisplayName || '').trim() ||
                          t('settings.profile.displayNameFallbackShort', 'Business')
                        }
                        placeholderTextColor="#8E8E93"
                        maxLength={120}
                        editable={!isSavingProfile && !isUploadingHomeLogo}
                      />
                      <TouchableOpacity
                        style={[
                          styles.homeFixedMessageSaveButton,
                          {
                            backgroundColor: businessColors.primary,
                            opacity: isSavingProfile || isUploadingHomeLogo ? 0.55 : 1,
                          },
                        ]}
                        onPress={async () => {
                          await saveHomeHeaderTextWithoutLogoIfChanged();
                          Keyboard.dismiss();
                        }}
                        disabled={isSavingProfile || isUploadingHomeLogo}
                        activeOpacity={0.88}
                        accessibilityRole="button"
                        accessibilityLabel={t('save', 'Save')}
                      >
                        <Text style={styles.homeFixedMessageSaveButtonText}>
                          {isSavingProfile
                            ? t('settings.common.saving', 'Saving...')
                            : t('save', 'Save')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.settingDivider} />
                  </>
                ) : null}
                <View style={styles.homeLogoDesignRow}>
                  <View style={styles.homeLogoPreviewWrap}>
                    <Image
                      source={getHomeLogoSource(profile)}
                      style={styles.homeLogoPreviewImage}
                      resizeMode="contain"
                    />
                    {isUploadingHomeLogo ? (
                      <View style={styles.homeLogoPreviewLoading}>
                        <ActivityIndicator size="small" color={businessColors.primary} />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.homeLogoDesignActions}>
                    <TouchableOpacity
                      style={[
                        styles.homeLogoActionBtn,
                        {
                          borderColor: `${businessColors.primary}40`,
                          backgroundColor: `${businessColors.primary}12`,
                          opacity: isUploadingHomeLogo ? 0.55 : 1,
                        },
                      ]}
                      onPress={() => void pickHomeScreenLogoFromPhotoLibrary()}
                      disabled={isUploadingHomeLogo}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.profile.homeLogoFromPhotos', 'Photo library')}
                      hitSlop={{ top: 10, bottom: 6, left: 10, right: 10 }}
                    >
                      <Camera size={18} color={businessColors.primary} strokeWidth={2.2} />
                      <Text style={[styles.homeLogoActionBtnText, { color: businessColors.primary }]}>
                        {isUploadingHomeLogo
                          ? t('settings.common.uploading', 'Uploading...')
                          : t('settings.profile.homeLogoFromPhotos', 'Photo library')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.homeLogoActionBtn,
                        styles.homeLogoActionBtnSecondary,
                        {
                          borderColor: 'rgba(60, 60, 67, 0.22)',
                          opacity: isUploadingHomeLogo ? 0.55 : 1,
                        },
                      ]}
                      onPress={() => void pickHomeScreenLogoFromFiles()}
                      disabled={isUploadingHomeLogo}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.profile.homeLogoFromFiles', 'Files')}
                      hitSlop={{ top: 6, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="folder-outline" size={20} color={businessColors.primary} />
                      <Text style={[styles.homeLogoActionBtnText, { color: businessColors.primary }]}>
                        {t('settings.profile.homeLogoFromFiles', 'Files')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
          </View>
        </View>
          </GHScrollView>
        )}

        {canSeeAddEmployee && activeSettingsTab === 'employees' && (
        <View style={[styles.settingsTabPanel, styles.settingsTabPanelServices]}>
            <View style={[styles.servicesModalBodyColumn, styles.servicesModalBodyGrouped]}>
              <View style={styles.settingsListScreenHeader}>
                <TouchableOpacity
                  style={[styles.settingsListScreenHeaderAdd, { backgroundColor: businessColors.primary }]}
                  onPress={() => setShowAddAdminModal(true)}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.admin.addEmployee', 'Add employee user')}
                >
                  <Plus size={22} color={Colors.white} strokeWidth={2.4} />
                </TouchableOpacity>
                <View style={styles.settingsListScreenHeaderTextCol}>
                  <Text style={styles.settingsListScreenHeaderTitle} numberOfLines={1}>
                    {t('settings.admin.editEmployees', 'Edit employees')}
                  </Text>
                  <Text style={styles.settingsListScreenHeaderSubtitle} numberOfLines={2}>
                    {t(
                      'settings.admin.editEmployeesSubtitle',
                      'Add, update details, or remove team members',
                    )}
                  </Text>
                </View>
              </View>
              <ScrollView
                style={{ flex: 1, backgroundColor: 'transparent' }}
                contentContainerStyle={[
                  styles.modalContentContainer,
                  { paddingTop: 4, paddingBottom: insets.bottom + 80, backgroundColor: 'transparent' },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {isLoadingEmployees ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={businessColors.primary} />
                    <Text style={{ marginTop: 12, color: Colors.subtext }}>{t('common.loading', 'Loading...')}</Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 0 }}>
                    {adminUsers.length === 0 ? (
                      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                        <Ionicons name="people-outline" size={36} color={Colors.subtext} />
                        <Text style={{ marginTop: 8, color: Colors.subtext, textAlign: 'center' }}>
                          {t('settings.admin.noEmployees', 'No employees found')}
                        </Text>
                      </View>
                    ) : (
                      adminUsers.map((adm: any) => {
                        return (
                          <View key={adm.id} style={{ marginBottom: 10 }}>
                            <SettingsServiceSwipeRow
                              enabled
                              outerBorderRadius={16}
                              onDeletePress={() => openRemoveEmployeeDialog(adm)}
                              deleteButtonText={t('settings.services.delete', 'Delete')}
                              deleteAccessibilityLabel={t('settings.admin.removeEmployeeTitle', 'Remove employee')}
                            >
                              <View style={styles.iosCard}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                                    <TouchableOpacity
                                      style={[styles.iconActionButton, { backgroundColor: '#FFECEC', borderColor: '#FFD1D1' }]}
                                      onPress={() => openRemoveEmployeeDialog(adm)}
                                      accessibilityRole="button"
                                      accessibilityLabel={t('settings.recurring.a11yDelete', 'Delete')}
                                    >
                                      <Trash2 size={20} color="#FF3B30" />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </View>
                            </SettingsServiceSwipeRow>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
        </View>
        )}

        {activeSettingsTab === 'security' && (
        <View style={[styles.settingsTabPanel, styles.settingsTabPanelServices]}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.modalContentContainer, { paddingTop: 12, paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.groupCard}>
              <Text style={styles.previewNotificationTitle}>{t('settings.support.header', "Need help? Contact Tori's support team")}</Text>
              <Text style={[styles.previewNotificationContent, { marginTop: 12 }]}>
                {t(
                  'settings.support.description',
                  "Our dedicated support team is here to assist you with any questions or issues you may have. Whether you need help with appointments, account settings, or technical support, we're ready to help. Please use the contact button below to reach out to us directly.",
                )}
              </Text>
              <View style={{ marginTop: 20, alignItems: 'center' }}>
                <TouchableOpacity
                  style={[styles.modalSendButton, { backgroundColor: businessColors.primary }]}
                  onPress={handleCallSupport}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.modalSendText, { color: Colors.white }]}>
                    {t('settings.support.contactNow', 'Contact us now')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
        )}

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

      {/* Remove employee — custom sheet (Hebrew RTL text; LTR `direction` on card avoids mirror + textAlign clash) */}
      <Modal
        visible={removeEmployeeDialog !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!removeEmployeeLoading) setRemoveEmployeeDialog(null);
        }}
      >
        <Pressable
          style={styles.removeEmployeeOverlay}
          onPress={() => {
            if (!removeEmployeeLoading) setRemoveEmployeeDialog(null);
          }}
        >
          {/*
            Force LTR layout on the card so `textAlign: 'right'` is visually the right edge even when
            the app uses `I18nManager.forceRTL` (avoids double-RTL with `direction: 'rtl'` on the card).
          */}
          <Pressable style={[styles.removeEmployeeCard, { direction: 'ltr' }]} onPress={() => {}}>
            <Text style={styles.removeEmployeeTitle} maxFontSizeMultiplier={1.35}>
              {t('settings.admin.removeEmployeeTitle', 'Remove employee')}
            </Text>
            <Text style={styles.removeEmployeeMessage} maxFontSizeMultiplier={1.35}>
              {removeEmployeeDialog
                ? `${t('settings.admin.removeEmployeeConfirm', 'Are you sure you want to remove')} ${removeEmployeeDialog.name}?`
                : ''}
            </Text>
            <View style={styles.removeEmployeeButtonsRow}>
              <TouchableOpacity
                style={styles.removeEmployeeBtnCancel}
                onPress={() => !removeEmployeeLoading && setRemoveEmployeeDialog(null)}
                disabled={removeEmployeeLoading}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={t('cancel', 'Cancel')}
              >
                <Text style={styles.removeEmployeeBtnCancelText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeEmployeeBtnRemove}
                onPress={() => void confirmRemoveEmployee()}
                disabled={removeEmployeeLoading}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={t('settings.admin.remove', 'Remove')}
              >
                {removeEmployeeLoading ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Text style={styles.removeEmployeeBtnRemoveText}>{t('settings.admin.remove', 'Remove')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete service — same layout as remove-employee confirm */}
      <Modal
        visible={deleteServiceDialog !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!deleteServiceLoading) setDeleteServiceDialog(null);
        }}
      >
        <Pressable
          style={styles.removeEmployeeOverlay}
          onPress={() => {
            if (!deleteServiceLoading) setDeleteServiceDialog(null);
          }}
        >
          <Pressable style={[styles.removeEmployeeCard, { direction: 'ltr' }]} onPress={() => {}}>
            <Text style={styles.removeEmployeeTitle} maxFontSizeMultiplier={1.35}>
              {t('settings.services.deleteTitle', 'Delete service')}
            </Text>
            <Text style={styles.removeEmployeeMessage} maxFontSizeMultiplier={1.35}>
              {t('settings.services.deleteConfirm', 'Are you sure you want to delete this service?')}
            </Text>
            <View style={styles.removeEmployeeButtonsRow}>
              <TouchableOpacity
                style={styles.removeEmployeeBtnCancel}
                onPress={() => !deleteServiceLoading && setDeleteServiceDialog(null)}
                disabled={deleteServiceLoading}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={t('cancel', 'Cancel')}
              >
                <Text style={styles.removeEmployeeBtnCancelText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeEmployeeBtnRemove}
                onPress={() => void confirmDeleteService()}
                disabled={deleteServiceLoading}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={t('settings.services.delete', 'Delete')}
              >
                {deleteServiceLoading ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Text style={styles.removeEmployeeBtnRemoveText}>{t('settings.services.delete', 'Delete')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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

      {/* Receipt / VAT legal fields (local kabala 320 + compliance) */}
      <Modal
        visible={showReceiptLegalModal}
        animationType="fade"
        transparent
        onRequestClose={() => !isSavingProfile && setShowReceiptLegalModal(false)}
      >
        <View style={styles.smallModalOverlay}>
          <View style={styles.smallModalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => !isSavingProfile && setShowReceiptLegalModal(false)}
                disabled={isSavingProfile}
              >
                <Text style={styles.modalCloseText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR} numberOfLines={2}>
                {t('settings.profile.receiptLegalModalTitle', 'Receipt & tax details')}
              </Text>
              <TouchableOpacity
                style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]}
                onPress={() => void handleSaveReceiptLegalDetails()}
                disabled={isSavingProfile}
              >
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>
                  {isSavingProfile ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>{t('settings.profile.businessName', 'Business name')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={receiptLegalDisplayName}
                  onChangeText={setReceiptLegalDisplayName}
                  placeholder={t('settings.profile.businessNamePlaceholder', 'For example: The Studio of Hadas')}
                  placeholderTextColor={Colors.subtext}
                  textAlign="left"
                  editable={!isSavingProfile}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>
                  {t('settings.profile.receiptLegalOsekLabel', 'Authorized dealer / company ID (ח.פ.)')}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={receiptLegalBusinessNumber}
                  onChangeText={setReceiptLegalBusinessNumber}
                  placeholder={t('settings.profile.receiptLegalOsekPlaceholder', 'e.g. 515000000')}
                  placeholderTextColor={Colors.subtext}
                  keyboardType="number-pad"
                  textAlign="left"
                  editable={!isSavingProfile}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>
                  {t('settings.profile.receiptLegalPhoneLabel', 'Business phone (on receipts)')}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={receiptLegalBusinessPhone}
                  onChangeText={setReceiptLegalBusinessPhone}
                  placeholder={t('settings.profile.receiptLegalPhonePlaceholder', 'e.g. 050-1234567')}
                  placeholderTextColor={Colors.subtext}
                  keyboardType="phone-pad"
                  textAlign="left"
                  editable={!isSavingProfile}
                />
              </View>
              <View style={[styles.settingItemLTR, { borderBottomWidth: 0, paddingVertical: 12 }]}>
                <View style={styles.settingContentLTR}>
                  <Text style={styles.settingTitleLTR}>
                    {t('settings.profile.receiptLegalVatExemptLabel', 'VAT-exempt business (עוסק פטור)')}
                  </Text>
                  <Text style={styles.settingSubtitleLTR}>
                    {t(
                      'settings.profile.receiptLegalVatExemptSubtitle',
                      'On if you do not charge VAT; receipts omit the VAT breakdown.',
                    )}
                  </Text>
                </View>
                <Switch
                  value={receiptLegalVatExempt}
                  onValueChange={setReceiptLegalVatExempt}
                  disabled={isSavingProfile}
                  trackColor={{ false: '#E5E5EA', true: '#E5E5EA' }}
                  thumbColor={
                    receiptLegalVatExempt
                      ? businessColors.primary
                      : Platform.OS === 'android'
                        ? '#f4f3f4'
                        : undefined
                  }
                  ios_backgroundColor="#E5E5EA"
                />
              </View>
              <Text style={[styles.settingSubtitleLTR, { paddingHorizontal: 4, paddingBottom: 16, opacity: 0.85 }]}>
                {t(
                  'settings.profile.receiptLegalHint',
                  'Edit the address below under «Business address». Receipt accent color is under Design.',
                )}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Client reminder — bottom sheet (same pattern as booking window) */}
      <Modal
        visible={showClientReminderModal}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={dismissClientReminderModal}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: SETTINGS_GROUPED_BG }]} edges={['top']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <View style={[styles.modalHeader, styles.bookingWindowModalHeader]}>
              <TouchableOpacity
                style={styles.cancellationModalCloseButton}
                onPress={dismissClientReminderModal}
                accessibilityRole="button"
                accessibilityLabel={t('cancel', 'Cancel')}
              >
                <X size={22} color={Colors.text} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, styles.bookingWindowModalTitle]} numberOfLines={2}>
                {t('settings.reminder.clientRowTitle', 'Client reminder before appointment')}
              </Text>
              <View style={styles.bookingWindowHeaderSpacer} />
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: insets.bottom + 120,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <LinearGradient
                colors={[`${businessColors.primary}18`, `${businessColors.primary}08`, 'transparent']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bookingWindowExplainer}
              >
                <View style={[styles.bookingWindowExplainerIcon, { backgroundColor: `${businessColors.primary}20` }]}>
                  <Bell size={22} color={businessColors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.bookingWindowExplainerText}>{t('settings.reminder.clientAutomatedHint')}</Text>
              </LinearGradient>

              <View style={styles.bookingWindowHeroCard}>
                <Text style={styles.bookingWindowFieldLabel}>
                  {t('settings.reminder.clientDialogHoursLabel', 'Hours before appointment')}
                </Text>
                <View style={styles.bookingWindowRulerLtr}>
                  <BookingDaysRuler
                    ref={clientReminderHoursRulerRef}
                    minDay={CLIENT_REMINDER_HOURS_MIN}
                    maxDay={CLIENT_REMINDER_HOURS_MAX}
                    fadeColor={Colors.white}
                    tickColor={Colors.text}
                    indicatorColor={businessColors.primary}
                    unitLabel={t('settings.reminder.clientDialogHoursUnit', 'hours')}
                    onDayChange={onClientReminderHoursRulerChange}
                  />
                </View>
                <Text style={styles.bookingWindowManualLabel}>
                  {t('settings.reminder.clientDialogManualHours', 'Or enter a number')}
                </Text>
                <TextInput
                  style={styles.bookingWindowManualInput}
                  value={clientReminderModalHoursDraft}
                  onChangeText={onClientReminderHoursTextChange}
                  placeholder="0"
                  placeholderTextColor={Colors.subtext}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={styles.bookingWindowRangeFoot}>
                  {t('settings.reminder.clientDialogHoursRange', '0–24 hours. 0 turns the reminder off.')}
                </Text>
              </View>
            </ScrollView>

            <View style={[styles.bookingWindowFooter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <TouchableOpacity
                style={[
                  styles.bookingWindowFooterBtn,
                  { backgroundColor: businessColors.primary },
                  isSavingProfile && styles.bookingWindowFooterBtnDisabled,
                ]}
                onPress={() => {
                  void saveClientReminderFromModal();
                }}
                disabled={isSavingProfile}
                activeOpacity={0.88}
              >
                <Text style={[styles.bookingWindowFooterBtnText, isSavingProfile && { opacity: 0.85 }]}>
                  {isSavingProfile ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Admin self-reminder — minutes 5–60, ruler + bottom sheet */}
      <Modal
        visible={showAdminReminderModal}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={dismissAdminReminderModal}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: SETTINGS_GROUPED_BG }]} edges={['top']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <View style={[styles.modalHeader, styles.bookingWindowModalHeader]}>
              <TouchableOpacity
                style={styles.cancellationModalCloseButton}
                onPress={dismissAdminReminderModal}
                accessibilityRole="button"
                accessibilityLabel={t('cancel', 'Cancel')}
              >
                <X size={22} color={Colors.text} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, styles.bookingWindowModalTitle]} numberOfLines={2}>
                {t('settings.reminder.adminRowTitle', 'Self-reminder before appointment')}
              </Text>
              <View style={styles.bookingWindowHeaderSpacer} />
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: insets.bottom + 120,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <LinearGradient
                colors={[`${businessColors.primary}18`, `${businessColors.primary}08`, 'transparent']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bookingWindowExplainer}
              >
                <View style={[styles.bookingWindowExplainerIcon, { backgroundColor: `${businessColors.primary}20` }]}>
                  <Clock size={22} color={businessColors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.bookingWindowExplainerText}>{t('settings.reminder.adminAutomatedHint')}</Text>
              </LinearGradient>

              <View style={styles.bookingWindowHeroCard}>
                <Text style={styles.bookingWindowFieldLabel}>
                  {t('settings.reminder.adminDialogMinutesLabel', 'Minutes before appointment')}
                </Text>
                <View style={styles.bookingWindowRulerLtr}>
                  <BookingDaysRuler
                    ref={adminReminderMinutesRulerRef}
                    minDay={ADMIN_SELF_REMINDER_MIN_MINUTES}
                    maxDay={ADMIN_SELF_REMINDER_MAX_MINUTES}
                    fadeColor={Colors.white}
                    tickColor={Colors.text}
                    indicatorColor={businessColors.primary}
                    unitLabel={t('settings.reminder.adminDialogMinutesUnit', 'minutes')}
                    onDayChange={onAdminReminderMinutesRulerChange}
                  />
                </View>
                <Text style={styles.bookingWindowManualLabel}>
                  {t('settings.reminder.adminDialogManualMinutes', 'Or enter a number')}
                </Text>
                <TextInput
                  style={styles.bookingWindowManualInput}
                  value={adminReminderModalMinutesDraft}
                  onChangeText={onAdminReminderMinutesTextChange}
                  placeholder="15"
                  placeholderTextColor={Colors.subtext}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={styles.bookingWindowRangeFoot}>
                  {t('settings.reminder.adminDialogMinutesRange', '5–60 minutes. Turn off the reminder from settings.')}
                </Text>
              </View>
            </ScrollView>

            <View style={[styles.bookingWindowFooter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <TouchableOpacity
                style={[
                  styles.bookingWindowFooterBtn,
                  { backgroundColor: businessColors.primary },
                  isSavingProfile && styles.bookingWindowFooterBtnDisabled,
                ]}
                onPress={() => {
                  void saveAdminReminderFromModal();
                }}
                disabled={isSavingProfile}
                activeOpacity={0.88}
              >
                <Text style={[styles.bookingWindowFooterBtnText, isSavingProfile && { opacity: 0.85 }]}>
                  {isSavingProfile ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Edit Admin (name & phone) — compact bottom sheet; backdrop fades in place, sheet slides + drag-to-dismiss */}
      <Modal
        visible={showEditAdminModal}
        transparent
        animationType="none"
        onRequestClose={requestCloseEditAdminSheet}
      >
        <KeyboardAvoidingView
          style={styles.editAdminKavRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.editAdminOverlayFill}>
            <TouchableWithoutFeedback onPress={requestCloseEditAdminSheet}>
              <Animated.View style={[styles.editAdminBackdrop, { opacity: editAdminBackdropOpacity }]} />
            </TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.editAdminSheetWrap,
                { maxHeight: WINDOW_HEIGHT * 0.92, transform: [{ translateY: editAdminCombinedTranslateY }] },
              ]}
              pointerEvents="box-none"
            >
              <View style={styles.editAdminSheetSurface}>
                <SafeAreaView edges={['bottom']} style={styles.editAdminSheetSafe}>
                  <View style={styles.editAdminModalColumn}>
              <View style={styles.editAdminTopChrome}>
                <View
                  style={styles.editAdminGrabberTrack}
                  accessibilityLabel={t('settings.admin.dragSheetToClose', 'Drag down to close')}
                  {...editAdminGrabberPanHandlers}
                >
                  <View style={styles.editAdminGrabberBar} />
                </View>
                <Text style={styles.editAdminHeaderTitle} numberOfLines={1}>
                  {t('settings.admin.edit', 'Edit admin')}
                </Text>
              </View>

              <ScrollView
                style={styles.editAdminScroll}
                contentContainerStyle={styles.editAdminScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentInsetAdjustmentBehavior="automatic"
                automaticallyAdjustKeyboardInsets
              >
              <View style={styles.editAdminHero}>
                <LinearGradient
                  colors={[businessColors.primary, `${businessColors.primary}BB`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.editAdminAvatarRing}
                >
                  <TouchableOpacity
                    style={styles.editAdminAvatarInner}
                    onPress={handlePickAdminAvatar}
                    activeOpacity={0.92}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.profile.changeProfilePicture', 'Change profile picture')}
                  >
                    {user?.image_url ? (
                      <Image
                        source={{ uri: (user as any).image_url }}
                        style={styles.editAdminAvatarImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <User size={36} color={Colors.subtext} strokeWidth={1.75} />
                    )}
                    {isUploadingAdminAvatar && (
                      <View style={styles.editAdminAvatarLoading}>
                        <ActivityIndicator size="small" color={businessColors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                </LinearGradient>
                <Text style={styles.editAdminHeroName}>
                  {adminNameDraft || user?.name || t('settings.admin.admin', 'Admin')}
                </Text>
                <Text style={styles.editAdminHeroPhone}>
                  {adminPhoneDraft || (user as any)?.phone || '—'}
                </Text>
                <TouchableOpacity
                  onPress={handlePickAdminAvatar}
                  style={[
                    styles.editAdminPhotoBtn,
                    { borderColor: `${businessColors.primary}40`, backgroundColor: `${businessColors.primary}12` },
                  ]}
                  activeOpacity={0.88}
                  disabled={isUploadingAdminAvatar}
                >
                  <Camera size={17} color={businessColors.primary} strokeWidth={2} />
                  <Text style={[styles.editAdminPhotoBtnText, { color: businessColors.primary }]}>
                    {isUploadingAdminAvatar
                      ? t('settings.common.uploading', 'Uploading...')
                      : t('settings.profile.changeProfilePicture', 'Change profile picture')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.editAdminFormCard}>
                <View style={styles.editAdminField}>
                  <View
                    style={[
                      styles.editAdminLabelWrap,
                      { justifyContent: editAdminInputsRtl ? 'flex-end' : 'flex-start' },
                    ]}
                  >
                    <Text style={styles.editAdminFieldLabel}>{t('settings.admin.name', 'Admin name')}</Text>
                  </View>
                  <TextInput
                    style={[
                      styles.editAdminFieldInput,
                      editAdminInputsRtl ? styles.editAdminFieldInputRtl : styles.editAdminFieldInputLtr,
                    ]}
                    textAlign={editAdminInputsRtl ? 'right' : 'left'}
                    value={adminNameDraft}
                    onChangeText={setAdminNameDraft}
                    placeholder={t('profile.edit.namePlaceholder', 'Full Name')}
                    placeholderTextColor={Colors.subtext}
                  />
                </View>
                <View style={styles.editAdminFieldLast}>
                  <View
                    style={[
                      styles.editAdminLabelWrap,
                      { justifyContent: editAdminInputsRtl ? 'flex-end' : 'flex-start' },
                    ]}
                  >
                    <Text style={styles.editAdminFieldLabel}>{t('profile.phone', 'Phone number')}</Text>
                  </View>
                  <TextInput
                    style={[
                      styles.editAdminFieldInput,
                      editAdminInputsRtl ? styles.editAdminFieldInputRtl : styles.editAdminFieldInputLtr,
                    ]}
                    textAlign={editAdminInputsRtl ? 'right' : 'left'}
                    value={adminPhoneDraft}
                    onChangeText={setAdminPhoneDraft}
                    placeholder={t('settings.admin.phonePlaceholder', '(555) 123-4567')}
                    placeholderTextColor={Colors.subtext}
                    keyboardType="phone-pad"
                    {...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : {})}
                  />
                </View>
              </View>
            </ScrollView>

                    <View style={styles.editAdminFooter}>
                      <TouchableOpacity
                        style={[
                          styles.editAdminFooterSave,
                          { backgroundColor: businessColors.primary },
                          isSavingAdmin && styles.editAdminFooterSaveDisabled,
                        ]}
                        onPress={() => {
                          void saveEditAdminModal();
                        }}
                        disabled={isSavingAdmin}
                        activeOpacity={0.88}
                        accessibilityRole="button"
                        accessibilityLabel={t('save', 'Save')}
                      >
                        <Text style={styles.editAdminFooterSaveText}>
                          {isSavingAdmin ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </SafeAreaView>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Address bottom sheet (2/3 screen) */}
      <Modal visible={showAddressSheet} transparent animationType="none" onRequestClose={() => setShowAddressSheet(false)}>
        <TouchableWithoutFeedback onPress={() => {
          Animated.timing(addressSheetAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setShowAddressSheet(false));
        }}>
          <Animated.View style={[styles.sheetOverlay, { opacity: addressOverlayOpacity }]} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[
            styles.addressSheetContainer,
            {
              height: addressSheetHeight,
              transform: [{ translateY: addressCombinedTranslateY }],
            },
          ]}
        >
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
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
                >
                  <View
                    style={[
                      styles.addressSheetContentPad,
                      {
                        paddingBottom:
                          insets.bottom + 20 + (addressKeyboardHeight > 0 ? Math.min(addressKeyboardHeight * 0.18, 56) : 0),
                      },
                    ]}
                  >
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
                        {hasGooglePlacesAutocomplete ? (
                          <GooglePlacesAutocomplete
                            keyboardShouldPersistTaps="always"
                            placeholder={t('settings.profile.businessAddressSearchPlaceholder', 'Street, city…')}
                            fetchDetails
                            debounce={220}
                            enablePoweredByContainer={false}
                            minLength={2}
                            predefinedPlaces={[]}
                            nearbyPlacesAPI={undefined as any}
                            query={{
                              key: googlePlacesKey,
                              language: normalizeAppLanguage(i18n.language),
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
                              textAlign: isRtlLanguage(i18n.language) ? 'right' : 'left',
                            }}
                            styles={{
                              container: { flex: 0 },
                              textInputContainer: { padding: 0, borderWidth: 0, backgroundColor: 'transparent' },
                              textInput: [styles.addressSearchInput as any],
                              row: {
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                backgroundColor: '#FFFFFF',
                              },
                              description: {
                                color: '#111827',
                                fontSize: 15,
                                textAlign: isRtlLanguage(i18n.language) ? 'right' : 'left',
                                writingDirection: isRtlLanguage(i18n.language) ? 'rtl' : 'ltr',
                              },
                              separator: {
                                height: StyleSheet.hairlineWidth,
                                backgroundColor: '#E8EAEF',
                              },
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
                                maxHeight: addressSuggestionsMaxHeight,
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
                        ) : (
                          <TextInput
                            style={styles.addressSearchInput}
                            value={addressDraft}
                            onChangeText={setAddressDraft}
                            placeholder={t('settings.profile.businessAddressSearchPlaceholder', 'Street, city…')}
                            placeholderTextColor="#9CA3AF"
                            autoCorrect={false}
                            autoCapitalize="none"
                            textAlign={isRtlLanguage(i18n.language) ? 'right' : 'left'}
                          />
                        )}
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
                              uri: `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent((placesFormattedAddress || addressDraft) as string)}&zoom=15&size=800x400&scale=2&markers=color:red|${encodeURIComponent((placesFormattedAddress || addressDraft) as string)}&key=${googlePlacesKey}`,
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
          <View style={styles.cancellationModalOverlay}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
            ) : null}
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    Platform.OS === 'ios' ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.52)',
                },
              ]}
            />
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.cancellationModalCard}>
                <View style={styles.cancellationModalInner}>
                <View style={styles.cancellationModalHeader}>
                  <TouchableOpacity
                    style={[styles.cancellationModalCloseButton, styles.cancellationModalCloseOnEnd]}
                    onPress={dismissCancellationModal}
                    accessibilityRole="button"
                    accessibilityLabel={t('cancel', 'Cancel')}
                  >
                    <X size={22} color={Colors.text} strokeWidth={2} />
                  </TouchableOpacity>
                  <Text style={styles.cancellationModalTitle} numberOfLines={2}>
                    {t('settings.policies.minCancellationTitle', 'Appointment cancellation time')}
                  </Text>
                  <View style={styles.cancellationModalHeaderSpacer} />
                </View>

                <ScrollView
                  style={styles.cancellationModalScroll}
                  contentContainerStyle={styles.cancellationModalScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  <TouchableWithoutFeedback onPress={() => setShowCancellationDropdown(false)}>
                    <View>
                      <LinearGradient
                        colors={[`${businessColors.primary}18`, `${businessColors.primary}08`, 'transparent']}
                        locations={[0, 0.55, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cancellationModalExplainer}
                      >
                        <View
                          style={[
                            styles.cancellationModalExplainerIcon,
                            { backgroundColor: `${businessColors.primary}22` },
                          ]}
                        >
                          <Clock size={22} color={businessColors.primary} strokeWidth={2} />
                        </View>
                        <Text style={styles.cancellationModalExplainerText}>
                          {t(
                            'settings.policies.cancellationModalHint',
                            'Clients cannot cancel inside this window before the appointment starts. Choose how many hours ahead they must cancel by.',
                          )}
                        </Text>
                      </LinearGradient>

                      <View style={styles.cancellationModalHero}>
                        <Text style={styles.cancellationModalFieldLabel}>
                          {t('settings.policies.hoursBefore', 'Hours before appointment')}
                        </Text>

                        <TouchableOpacity
                          style={[
                            styles.cancellationModalPicker,
                            showCancellationDropdown && {
                              borderColor: businessColors.primary,
                              backgroundColor: `${businessColors.primary}0D`,
                            },
                          ]}
                          onPress={() => setShowCancellationDropdown(!showCancellationDropdown)}
                          activeOpacity={0.92}
                        >
                          {showCancellationDropdown ? (
                            <Ionicons name="chevron-up" size={22} color={businessColors.primary} />
                          ) : (
                            <Ionicons name="chevron-down" size={22} color={businessColors.primary} />
                          )}
                          <Text style={styles.cancellationModalPickerText} numberOfLines={3}>
                            {cancellationHoursDraft === '0'
                              ? t('settings.policies.noRestriction', '0 hours (No restriction)')
                              : `${cancellationHoursDraft} ${
                                  cancellationHoursDraft === '1'
                                    ? t('settings.policies.hour', 'hour')
                                    : t('settings.policies.hours', 'hours')
                                }${
                                  parseInt(cancellationHoursDraft, 10) >= 24
                                    ? ` (${Math.floor(parseInt(cancellationHoursDraft, 10) / 24)} ${
                                        Math.floor(parseInt(cancellationHoursDraft, 10) / 24) === 1
                                          ? t('settings.policies.day', 'day')
                                          : t('settings.policies.days', 'days')
                                      }${
                                        parseInt(cancellationHoursDraft, 10) % 24 > 0
                                          ? ` ${parseInt(cancellationHoursDraft, 10) % 24} ${t('settings.policies.hours', 'hours')}`
                                          : ''
                                      })`
                                    : ''
                                }`}
                          </Text>
                        </TouchableOpacity>

                        {showCancellationDropdown ? (
                          <View style={styles.cancellationModalDropdownPanel}>
                            <ScrollView
                              style={styles.cancellationModalDropdownScroll}
                              showsVerticalScrollIndicator={false}
                              nestedScrollEnabled
                              keyboardShouldPersistTaps="handled"
                            >
                              <TouchableOpacity
                                style={[
                                  styles.cancellationModalDropdownRow,
                                  cancellationHoursDraft === '0' && {
                                    backgroundColor: `${businessColors.primary}12`,
                                  },
                                ]}
                                onPress={() => {
                                  setCancellationHoursDraft('0');
                                  setShowCancellationDropdown(false);
                                }}
                              >
                                <Text
                                  style={[
                                    styles.cancellationModalDropdownRowText,
                                    cancellationHoursDraft === '0' && {
                                      color: businessColors.primary,
                                      fontWeight: '700',
                                    },
                                  ]}
                                >
                                  {t('settings.policies.noRestriction', '0 hours (No restriction)')}
                                </Text>
                              </TouchableOpacity>

                              {[1, 2, 3, 6, 12, 24, 48, 72, 168].map((hour) => (
                                <TouchableOpacity
                                  key={hour}
                                  style={[
                                    styles.cancellationModalDropdownRow,
                                    cancellationHoursDraft === hour.toString() && {
                                      backgroundColor: `${businessColors.primary}12`,
                                    },
                                  ]}
                                  onPress={() => {
                                    setCancellationHoursDraft(hour.toString());
                                    setShowCancellationDropdown(false);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.cancellationModalDropdownRowText,
                                      cancellationHoursDraft === hour.toString() && {
                                        color: businessColors.primary,
                                        fontWeight: '700',
                                      },
                                    ]}
                                  >
                                    {hour}{' '}
                                    {hour === 1
                                      ? t('settings.policies.hour', 'hour')
                                      : t('settings.policies.hours', 'hours')}
                                    {hour >= 24 ? (
                                      <Text style={styles.cancellationModalDropdownSubtext}>
                                        {' '}
                                        ({Math.floor(hour / 24)}{' '}
                                        {Math.floor(hour / 24) === 1
                                          ? t('settings.policies.day', 'day')
                                          : t('settings.policies.days', 'days')}
                                        {hour % 24 > 0
                                          ? ` ${hour % 24} ${t('settings.policies.hours', 'hours')}`
                                          : ''}
                                        )
                                      </Text>
                                    ) : null}
                                  </Text>
                                </TouchableOpacity>
                              ))}

                              <TouchableOpacity
                                style={[
                                  styles.cancellationModalDropdownRow,
                                  styles.cancellationModalDropdownRowLast,
                                ]}
                                onPress={() => {
                                  setShowCancellationDropdown(false);
                                  Alert.prompt(
                                    t('settings.policies.customHoursTitle', 'Custom Hours'),
                                    t('settings.policies.customHoursMessage', 'Enter number of hours (0-168):'),
                                    [
                                      { text: t('cancel', 'Cancel'), style: 'cancel' },
                                      {
                                        text: t('ok', 'OK'),
                                        onPress: (text) => {
                                          const hours = parseInt(text || '0', 10);
                                          if (hours >= 0 && hours <= 168) {
                                            setCancellationHoursDraft(hours.toString());
                                          } else {
                                            Alert.alert(
                                              t('error.generic', 'Error'),
                                              t(
                                                'settings.profile.cancellationInvalid',
                                                'Please enter a valid number between 0 and 168 hours',
                                              ),
                                            );
                                          }
                                        },
                                      },
                                    ],
                                    'plain-text',
                                    cancellationHoursDraft,
                                    'numeric',
                                  );
                                }}
                              >
                                <Text style={styles.cancellationModalDropdownRowText}>
                                  {t('settings.policies.customHoursLabel', 'Custom hours...')}
                                </Text>
                              </TouchableOpacity>
                            </ScrollView>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </ScrollView>

                <View
                  style={[
                    styles.cancellationModalFooter,
                    { paddingBottom: Math.max(insets.bottom, 12) },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.cancellationModalSaveBtn,
                      { backgroundColor: businessColors.primary },
                      isSavingProfile && styles.cancellationModalSaveBtnDisabled,
                    ]}
                    onPress={saveCancellationHours}
                    disabled={isSavingProfile}
                    activeOpacity={0.88}
                  >
                    <Text style={[styles.cancellationModalSaveBtnText, isSavingProfile && { opacity: 0.88 }]}>
                      {isSavingProfile ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                    </Text>
                  </TouchableOpacity>
                </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Booking horizon (per staff) — explainer + Reanimated ruler + manual entry */}
      <Modal
        visible={showBookingWindowModal}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setShowBookingWindowModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: SETTINGS_GROUPED_BG }]} edges={['top']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <View style={[styles.modalHeader, styles.bookingWindowModalHeader]}>
              <TouchableOpacity
                style={styles.cancellationModalCloseButton}
                onPress={() => setShowBookingWindowModal(false)}
                accessibilityRole="button"
                accessibilityLabel={t('cancel', 'Cancel')}
              >
                <X size={22} color={Colors.text} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, styles.bookingWindowModalTitle]} numberOfLines={2}>
                {t('settings.profile.bookingWindowModalTitle', 'Your booking range')}
              </Text>
              <View style={styles.bookingWindowHeaderSpacer} />
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: insets.bottom + 120,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <LinearGradient
                colors={[`${businessColors.primary}18`, `${businessColors.primary}08`, 'transparent']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bookingWindowExplainer}
              >
                <View style={[styles.bookingWindowExplainerIcon, { backgroundColor: `${businessColors.primary}20` }]}>
                  <Calendar size={22} color={businessColors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.bookingWindowExplainerText}>{t('settings.profile.bookingWindowModalBody')}</Text>
              </LinearGradient>

              <View style={styles.bookingWindowHeroCard}>
                <Text style={styles.bookingWindowFieldLabel}>
                  {t('settings.profile.bookingWindowModalDaysLabel', 'Days open for booking')}
                </Text>

                <View style={styles.bookingWindowRulerLtr}>
                  <BookingDaysRuler
                    ref={bookingDaysRulerRef}
                    minDay={BOOKING_RULER_MIN_DISPLAY}
                    maxDay={BOOKING_WINDOW_MAX}
                    fadeColor={Colors.white}
                    tickColor={Colors.text}
                    indicatorColor={businessColors.primary}
                    unitLabel={t('settings.profile.bookingWindowModalDaysUnit', 'days')}
                    onDayChange={onBookingWindowRulerDay}
                  />
                </View>

                <Text style={styles.bookingWindowManualLabel}>
                  {t('settings.profile.bookingWindowModalManual', 'Or enter a number')}
                </Text>
                <TextInput
                  style={styles.bookingWindowManualInput}
                  value={bookingWindowDraft}
                  onChangeText={onBookingWindowTextChange}
                  placeholder={t('settings.profile.bookingWindowPlaceholder', '7')}
                  placeholderTextColor={Colors.subtext}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={styles.bookingWindowRangeFoot}>
                  {t('settings.profile.bookingWindowModalRange', 'From 1 to 60 days')}
                </Text>
              </View>
            </ScrollView>

            <View style={[styles.bookingWindowFooter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <TouchableOpacity
                style={[
                  styles.bookingWindowFooterBtn,
                  { backgroundColor: businessColors.primary },
                  isSavingProfile && styles.bookingWindowFooterBtnDisabled,
                ]}
                onPress={confirmBookingWindowModal}
                disabled={isSavingProfile}
                activeOpacity={0.88}
              >
                <Text style={[styles.bookingWindowFooterBtnText, isSavingProfile && { opacity: 0.85 }]}>
                  {isSavingProfile ? t('settings.common.saving', 'Saving...') : t('save', 'Save')}
                </Text>
              </TouchableOpacity>
            </View>
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
                onPress={dismissRecurringHubAndGoToAdd}
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
                          <View key={item.id} style={idx > 0 ? styles.recurringHubItemSpacing : undefined}>
                            <View
                              style={[
                                styles.recurringHubItemCard,
                                { borderStartColor: businessColors.primary },
                              ]}
                            >
                              <View style={styles.recurringHubItemRow}>
                                <View style={styles.recurringHubItemBody}>
                                  <Text style={styles.recurringHubItemName} numberOfLines={1}>
                                    {item.client_name}
                                  </Text>
                                  <View style={styles.recurringHubMetaStack}>
                                    <View style={styles.recurringHubMetaRow}>
                                      <Text style={styles.recurringHubMetaText} numberOfLines={1}>
                                        {item.client_phone}
                                      </Text>
                                      <Phone size={15} color={Colors.subtext} strokeWidth={2.2} />
                                    </View>
                                    <View style={styles.recurringHubMetaRow}>
                                      <Text style={styles.recurringHubMetaText} numberOfLines={2}>
                                        {item.service_name}
                                      </Text>
                                      <Layers size={15} color={Colors.subtext} strokeWidth={2.2} />
                                    </View>
                                    <View style={styles.recurringHubMetaRow}>
                                      <Text style={styles.recurringHubMetaText} numberOfLines={1}>
                                        {t(`day.${RECURRING_DOW_KEYS[Math.min(Math.max(0, item.day_of_week), 6)]}`)} ·{' '}
                                        {formatBookingTimeLabel(String(item.slot_time).slice(0, 5), i18n.language)}
                                      </Text>
                                      <Calendar size={15} color={Colors.subtext} strokeWidth={2.2} />
                                    </View>
                                    {!!item.repeat_interval && (
                                      <View style={styles.recurringHubMetaRow}>
                                        <Text style={styles.recurringHubMetaTextMuted} numberOfLines={2}>
                                          {t('settings.recurring.listRepeat', 'Repeats {{label}}', {
                                            label:
                                              item.repeat_interval === 1
                                                ? t('settings.recurring.everyWeek', 'every week')
                                                : t('settings.recurring.everyNWeeks', 'every {{count}} weeks', {
                                                    count: item.repeat_interval,
                                                  }),
                                          })}
                                        </Text>
                                        <Repeat size={15} color={Colors.subtext} strokeWidth={2.2} />
                                      </View>
                                    )}
                                  </View>
                                </View>
                                <TouchableOpacity
                                  style={styles.recurringHubDeleteBtn}
                                  onPress={async () => {
                                    const ok = await recurringAppointmentsApi.delete(item.id);
                                    if (ok) setRecurringList((prev) => prev.filter((x) => x.id !== item.id));
                                    else
                                      Alert.alert(
                                        t('error.generic', 'Error'),
                                        t('settings.recurring.deleteFailed', 'Failed to delete appointment'),
                                      );
                                  }}
                                  accessibilityRole="button"
                                  accessibilityLabel={t('settings.recurring.a11yDelete', 'Delete')}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Trash2 size={18} color="#FF3B30" strokeWidth={2.2} />
                                </TouchableOpacity>
                              </View>
                            </View>
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

      {activeSettingsTab === 'services' && (
      <>
        {/* Duration / add-service overlays (full screen; only on Services tab) */}
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
                  const editSvc = editingServiceDurationId
                    ? editableServices.find((s) => s.id === editingServiceDurationId)
                    : undefined;
                  const currentVal = editSvc?.duration_minutes ?? 60;
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

      </>
      )}

      <AddServiceModal
        visible={showAddServiceModal}
        onClose={() => setShowAddServiceModal(false)}
        onSuccess={(row) => {
          setEditableServices((prev) => sortServicesLikeClientBooking([...prev, row]));
        }}
        nextOrderIndex={editableServices.length}
      />

      {/* Add Admin Modal */}
      <AddAdminModal
        visible={showAddAdminModal}
        onClose={() => setShowAddAdminModal(false)}
        onSuccess={() => {
          setActiveSettingsTab('employees');
          void loadAdminEmployeesForTab();
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
                    await persistAppUiLanguage('en');
                    if (user?.id) {
                      await usersApi.updateUser(user.id, { language: 'en' } as any);
                      updateUserProfile({ language: 'en' } as any);
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
                    await persistAppUiLanguage('he');
                    if (user?.id) {
                      await usersApi.updateUser(user.id, { language: 'he' } as any);
                      updateUserProfile({ language: 'he' } as any);
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
              <TouchableOpacity
                style={styles.languagePickerOption}
                onPress={async () => {
                  try {
                    await i18n.changeLanguage('ar');
                    await persistAppUiLanguage('ar');
                    if (user?.id) {
                      await usersApi.updateUser(user.id, { language: 'ar' } as any);
                      updateUserProfile({ language: 'ar' } as any);
                    }
                  } finally {
                    setIsLanguageOpen(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.languagePickerOptionText}>{t('profile.language.arabic', 'Arabic')}</Text>
                {i18n.language?.startsWith('ar') && <Ionicons name="checkmark" size={18} color={businessColors.primary} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.languagePickerOption}
                onPress={async () => {
                  try {
                    await i18n.changeLanguage('ru');
                    await persistAppUiLanguage('ru');
                    if (user?.id) {
                      await usersApi.updateUser(user.id, { language: 'ru' } as any);
                      updateUserProfile({ language: 'ru' } as any);
                    }
                  } finally {
                    setIsLanguageOpen(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.languagePickerOptionText}>{t('profile.language.russian', 'Russian')}</Text>
                {i18n.language?.startsWith('ru') && <Ionicons name="checkmark" size={18} color={businessColors.primary} />}
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
  settingsAppointmentsScroll: {
    flex: 1,
  },
  settingsAppointmentsScrollContent: {
    flexGrow: 1,
  },
  homeFixedMessageComposer: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.08)',
  },
  /** direction: 'ltr' fixes physical row order [text | pencil] so RTL text can align right (see finance.tsx rtlRoot / rtlText). */
  homeFixedMessageSummaryCard: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.08)',
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeFixedMessageSummaryTextCol: {
    flex: 1,
    minWidth: 0,
  },
  homeFixedMessageSummaryTextRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  homeFixedMessagePreviewText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    color: Colors.text,
  },
  homeFixedMessagePreviewEmpty: {
    fontWeight: '400',
    color: Colors.subtext,
    fontStyle: 'italic',
  },
  homeFixedMessageTapToEdit: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.subtext,
  },
  homeFixedMessageSummaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeFixedMessageInput: {
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.text,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: Colors.white,
  },
  homeFixedMessageComposerFooter: {
    marginTop: 8,
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'flex-end',
  },
  homeFixedMessageComposerFooterRtl: {
    justifyContent: 'flex-start',
  },
  homeFixedMessageCounter: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.subtext,
    letterSpacing: 0.2,
  },
  /** `direction: 'ltr'` keeps [Save | Cancel] order consistent in RTL locales (primary action on the left of the pair). */
  homeFixedMessageComposerActions: {
    marginTop: 14,
    flexDirection: 'row',
    direction: 'ltr',
    width: '100%',
    alignItems: 'stretch',
    gap: 10,
  },
  homeFixedMessageCancelButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.14)',
  },
  homeFixedMessageCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  homeFixedMessageSaveButton: {
    marginTop: 14,
    alignSelf: 'stretch',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  homeFixedMessageSaveButtonInComposerRow: {
    marginTop: 0,
    flex: 1,
    minWidth: 0,
  },
  homeFixedMessageSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
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
  /** Services / Employees: full-bleed on page background — no inset gray card */
  settingsTabPanelServices: {
    flex: 1,
    minHeight: 320,
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    overflow: 'visible',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  servicesModalBodyGrouped: {
    backgroundColor: 'transparent',
  },
  settingsListScreenHeader: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: 'transparent',
  },
  settingsListScreenHeaderTextCol: {
    flex: 1,
    minWidth: 0,
  },
  settingsListScreenHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.35,
    textAlign: 'right',
  },
  settingsListScreenHeaderSubtitle: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.subtext,
    textAlign: 'right',
    lineHeight: 18,
  },
  settingsListScreenHeaderAdd: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  homeLogoDesignBlock: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  homeHeaderLogoToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  homeHeaderShowLogoSwitchRtl: {
    transform: [{ scaleX: -1 }],
  },
  homeHeaderNoLogoCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(142, 142, 147, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.12)',
  },
  homeHeaderNoLogoTitleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'left',
  },
  homeHeaderNoLogoTitleHint: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.subtext,
    marginBottom: 10,
    textAlign: 'left',
  },
  homeHeaderNoLogoTitleInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.22)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    backgroundColor: '#FFFFFF',
  },
  homeLogoDesignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 14,
  },
  homeLogoPreviewWrap: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.18)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeLogoPreviewImage: {
    width: '82%',
    height: '82%',
  },
  homeLogoPreviewLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeLogoDesignActions: {
    flex: 1,
    gap: 10,
  },
  homeLogoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  homeLogoActionBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  homeLogoActionBtnSecondary: {
    backgroundColor: 'rgba(142, 142, 147, 0.08)',
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
    zIndex: 1,
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
    overflow: 'visible',
    zIndex: 50,
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
    zIndex: 50,
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

  removeEmployeeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  removeEmployeeCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 22,
      },
      android: { elevation: 10 },
    }),
  },
  removeEmployeeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.35,
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  removeEmployeeMessage: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.subtext,
    lineHeight: 22,
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  removeEmployeeButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  removeEmployeeBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  removeEmployeeBtnCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  removeEmployeeBtnRemove: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFECEC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFD0D0',
    minHeight: 48,
  },
  removeEmployeeBtnRemoveText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FF3B30',
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
  cancellationModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    position: 'relative',
  },
  /** LTR box so textAlign:right is physical right (global RTL swaps left/right on Text). */
  cancellationModalInner: {
    direction: 'ltr',
    width: '100%',
    alignSelf: 'stretch',
  },
  cancellationModalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: Colors.white,
    borderRadius: 22,
    overflow: 'hidden',
    maxHeight: '88%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.2,
        shadowRadius: 26,
      },
      android: { elevation: 14 },
    }),
  },
  cancellationModalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.12)',
    backgroundColor: Colors.white,
  },
  cancellationModalTitle: {
    flex: 1,
    minWidth: 0,
    marginLeft: 6,
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    color: Colors.text,
  },
  cancellationModalHeaderSpacer: {
    width: 44,
    height: 44,
  },
  cancellationModalScroll: {
    flexGrow: 0,
    flexShrink: 1,
    backgroundColor: SETTINGS_GROUPED_BG,
    maxHeight: 460,
  },
  cancellationModalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    alignItems: 'stretch',
    width: '100%',
  },
  cancellationModalExplainer: {
    direction: 'ltr',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.1)',
  },
  cancellationModalExplainerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancellationModalExplainerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    lineHeight: 21,
    textAlign: 'right',
  },
  cancellationModalHero: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  cancellationModalFieldLabel: {
    alignSelf: 'stretch',
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtext,
    marginBottom: 10,
    letterSpacing: 0.15,
    textAlign: 'right',
  },
  cancellationModalPicker: {
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(60,60,67,0.04)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.18)',
    gap: 12,
  },
  cancellationModalPickerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 22,
    textAlign: 'right',
  },
  cancellationModalDropdownPanel: {
    direction: 'ltr',
    marginTop: 10,
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.12)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  cancellationModalDropdownScroll: {
    maxHeight: 228,
  },
  cancellationModalDropdownRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.08)',
  },
  cancellationModalDropdownRowLast: {
    borderBottomWidth: 0,
  },
  cancellationModalDropdownRowText: {
    alignSelf: 'stretch',
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
    textAlign: 'right',
  },
  cancellationModalDropdownSubtext: {
    fontSize: 14,
    color: Colors.subtext,
    fontWeight: '400',
    textAlign: 'right',
  },
  cancellationModalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60,60,67,0.1)',
  },
  cancellationModalSaveBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  cancellationModalSaveBtnDisabled: {
    opacity: 0.55,
  },
  cancellationModalSaveBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
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
  cancellationModalCloseOnEnd: {
    marginLeft: 0,
    marginRight: -4,
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
  bookingWindowModalHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.1)',
  },
  bookingWindowModalTitle: {
    position: 'absolute',
    left: 52,
    right: 52,
    textAlign: 'center',
    zIndex: 0,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  bookingWindowHeaderSpacer: {
    width: 44,
    height: 44,
  },
  bookingWindowExplainer: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.08)',
    overflow: 'hidden',
  },
  bookingWindowExplainerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  bookingWindowExplainerText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
    textAlign: 'left',
    fontWeight: '500',
  },
  bookingWindowHeroCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
    }),
  },
  bookingWindowFieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtext,
    textAlign: 'left',
    letterSpacing: 0.15,
  },
  bookingWindowRulerLtr: {
    direction: 'ltr',
    marginTop: 4,
  },
  bookingWindowManualLabel: {
    marginTop: 22,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.subtext,
    textAlign: 'left',
  },
  bookingWindowManualInput: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.18)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: Colors.text,
    backgroundColor: 'rgba(60,60,67,0.04)',
    fontVariant: ['tabular-nums'],
  },
  bookingWindowRangeFoot: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.subtext,
    textAlign: 'center',
    fontWeight: '500',
  },
  bookingWindowFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: SETTINGS_GROUPED_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60,60,67,0.1)',
  },
  bookingWindowFooterBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  bookingWindowFooterBtnDisabled: {
    opacity: 0.55,
  },
  bookingWindowFooterBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
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
  editAdminKavRoot: {
    flex: 1,
  },
  editAdminOverlayFill: {
    flex: 1,
  },
  editAdminBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 1,
  },
  editAdminSheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  editAdminSheetSurface: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: { elevation: 12 },
    }),
  },
  editAdminSheetSafe: {
    backgroundColor: Colors.white,
  },
  editAdminModalColumn: {
    backgroundColor: Colors.white,
  },
  editAdminTopChrome: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 10,
  },
  editAdminGrabberTrack: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  editAdminGrabberBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(60,60,67,0.22)',
  },
  editAdminHeaderTitle: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.28,
  },
  editAdminFooter: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: Colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60,60,67,0.06)',
  },
  editAdminFooterSave: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  editAdminFooterSaveDisabled: {
    opacity: 0.55,
  },
  editAdminFooterSaveText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  editAdminScroll: {
    flexGrow: 0,
    flexShrink: 1,
    backgroundColor: Colors.white,
  },
  editAdminScrollContent: {
    flexGrow: 0,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  editAdminHero: {
    alignItems: 'center',
    marginBottom: 18,
  },
  editAdminAvatarRing: {
    padding: 3,
    borderRadius: 48,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: { elevation: 5 },
    }),
  },
  editAdminAvatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  editAdminAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  editAdminAvatarLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 40,
  },
  editAdminHeroName: {
    marginTop: 12,
    fontSize: 19,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.35,
  },
  editAdminHeroPhone: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.subtext,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  editAdminPhotoBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  editAdminPhotoBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  editAdminFormCard: {
    alignSelf: 'stretch',
    alignItems: 'stretch',
    backgroundColor: '#EFEFF4',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  editAdminField: {
    alignSelf: 'stretch',
    marginBottom: 14,
  },
  editAdminFieldLast: {
    alignSelf: 'stretch',
    marginBottom: 0,
  },
  editAdminLabelWrap: {
    width: '100%',
    marginBottom: 6,
    flexDirection: 'row',
    direction: 'ltr',
  },
  editAdminFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636366',
    letterSpacing: -0.08,
  },
  editAdminFieldInput: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    backgroundColor: Colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.07)',
  },
  editAdminFieldInputRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  editAdminFieldInputLtr: {
    textAlign: 'left',
    writingDirection: 'ltr',
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
    backgroundColor: 'transparent',
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
    paddingLeft: 28,
    paddingRight: 12,
    gap: 10,
  },
  svcListCollapsedMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  svcListCollapsedTextCol: {
    minHeight: 44,
    justifyContent: 'center',
    width: '100%',
  },
  svcListChevronHit: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    minHeight: 44,
    paddingHorizontal: 8,
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
  recurringHubItemSpacing: {
    marginTop: 12,
  },
  recurringHubItemCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderStartWidth: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderEndWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    borderEndColor: 'rgba(0,0,0,0.06)',
    borderBottomColor: 'rgba(0,0,0,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  recurringHubItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  recurringHubItemBody: {
    flex: 1,
    minWidth: 0,
    paddingEnd: 4,
  },
  recurringHubItemName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.25,
    marginBottom: 4,
  },
  recurringHubMetaStack: {
    marginTop: 4,
    gap: 8,
  },
  recurringHubMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recurringHubMetaText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 20,
  },
  recurringHubMetaTextMuted: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.subtext,
    lineHeight: 18,
  },
  recurringHubDeleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFECEC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFD1D1',
    marginStart: 10,
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