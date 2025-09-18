import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Switch, ScrollView, Image, Platform, Alert, TextInput, Modal, Pressable, ActivityIndicator, Animated, Easing, TouchableWithoutFeedback, PanResponder, GestureResponderEvent, PanResponderGestureState, KeyboardAvoidingView, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { servicesApi, updateService, createService, deleteService } from '@/lib/api/services';
import type { Service } from '@/lib/supabase';
import { notificationsApi } from '@/lib/api/notifications';
import { recurringAppointmentsApi } from '@/lib/api/recurringAppointments';
import { supabase, getBusinessId } from '@/lib/supabase';
import { businessProfileApi } from '@/lib/api/businessProfile';
import type { BusinessProfile } from '@/lib/supabase';
import { 
  Bell, 
  HelpCircle, 
  LogOut, 
  ChevronLeft,
  ChevronRight,
  Send,
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
  User
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersApi } from '@/lib/api/users';
import AdminBroadcastComposer from '@/components/AdminBroadcastComposer';
import AddAppointmentModal from '@/components/AddAppointmentModal';
import { ColorPicker } from '@/components/ColorPicker';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';
import ImageSelectionModal from '@/components/ImageSelectionModal';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import AddAdminModal from '@/components/AddAdminModal';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import GradientBackground from '@/components/GradientBackground';
import { formatTime12Hour } from '@/lib/utils/timeFormat';

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

function AppSwitch({ value, onValueChange, primaryColor }: { value: boolean; onValueChange: (v: boolean) => void; primaryColor: string }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{
        false: '#E5E5EA',
        true: `${primaryColor}20`,
      }}
      thumbColor={value ? primaryColor : '#FFFFFF'}
      ios_backgroundColor={'#E5E5EA'}
      style={{
        transform: [{ scaleX: 1.0 }, { scaleY: 1.0 }],
        marginLeft: 8,
        marginRight: 2,
        shadowColor: '#000',
        shadowOpacity: value ? 0.12 : 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: value ? 2 : 0,
        borderRadius: 20,
        borderWidth: value ? 0 : 1,
        borderColor: value ? 'transparent' : '#E5E5EA',
      }}
    />
  );
}

export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((s) => s.updateUserProfile);
  const { triggerColorUpdate, forceAppRefresh } = useColorUpdate();
  const { colors: businessColors } = useBusinessColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showBroadcast, setShowBroadcast] = useState(false);
  
  
  // Notification modal states (replaced by AdminBroadcastComposer)
  const [showSupportModal, setShowSupportModal] = useState(false);
  
  // Add admin modal state
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  
  // Delete account modal state
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  
  // Title dropdown states (removed)

  // Services edit modal state
  const [showServicesModal, setShowServicesModal] = useState(false);
  const [editableServices, setEditableServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [editDurationDropdownFor, setEditDurationDropdownFor] = useState<string | null>(null);

  // Business profile state
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileInstagram, setProfileInstagram] = useState('');
  const [profileFacebook, setProfileFacebook] = useState('');
  const [profileTiktok, setProfileTiktok] = useState('');
  const [profileImageOnPage1, setProfileImageOnPage1] = useState('');
  const [profileImageOnPage2, setProfileImageOnPage2] = useState('');
  const [profileImageOnPage3, setProfileImageOnPage3] = useState('');
  const [profileLoginImg, setProfileLoginImg] = useState('');
  const [profileMinCancellationHours, setProfileMinCancellationHours] = useState(24);
  const [showEditDisplayNameModal, setShowEditDisplayNameModal] = useState(false);
  const [showEditAddressModal, setShowEditAddressModal] = useState(false);
  const [showEditInstagramModal, setShowEditInstagramModal] = useState(false);
  const [showEditFacebookModal, setShowEditFacebookModal] = useState(false);
  const [showEditTiktokModal, setShowEditTiktokModal] = useState(false);
  const [showEditImagePage1Modal, setShowEditImagePage1Modal] = useState(false);
  const [showEditImagePage2Modal, setShowEditImagePage2Modal] = useState(false);
  const [showEditCancellationModal, setShowEditCancellationModal] = useState(false);
  const [showCancellationDropdown, setShowCancellationDropdown] = useState(false);
  const [cancellationDropdownDirection, setCancellationDropdownDirection] = useState<'up' | 'down'>('down');
  const [isUploadingImagePage1, setIsUploadingImagePage1] = useState(false);
  const [isUploadingImagePage2, setIsUploadingImagePage2] = useState(false);
  const [isUploadingImagePage3, setIsUploadingImagePage3] = useState(false);
  const [isUploadingLoginImg, setIsUploadingLoginImg] = useState(false);
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false);
  const [previewImageType, setPreviewImageType] = useState<'page1' | 'page2' | 'page3' | 'login' | null>(null);
  const [showImageSelectionModal, setShowImageSelectionModal] = useState(false);
  const [currentImageType, setCurrentImageType] = useState<'page1' | 'page2' | 'page3' | 'login' | null>(null);
  const [imageTranslateX, setImageTranslateX] = useState(0);
  const [imageTranslateY, setImageTranslateY] = useState(0);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageLoadTimeout, setImageLoadTimeout] = useState<number | null>(null);
  const [progressAnimation] = useState(new Animated.Value(0));
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [addressDraft, setAddressDraft] = useState('');
  const [instagramDraft, setInstagramDraft] = useState('');
  const [facebookDraft, setFacebookDraft] = useState('');
  const [tiktokDraft, setTiktokDraft] = useState('');
  const [cancellationHoursDraft, setCancellationHoursDraft] = useState('24');
  // Admin name/phone edit
  const [showEditAdminModal, setShowEditAdminModal] = useState(false);
  const [adminNameDraft, setAdminNameDraft] = useState('');
  const [adminPhoneDraft, setAdminPhoneDraft] = useState('');
  const [adminEmailDraft, setAdminEmailDraft] = useState('');
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  const [isUploadingAdminAvatar, setIsUploadingAdminAvatar] = useState(false);

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
  const loadBusinessProfile = async () => {
    setIsLoadingProfile(true);
    try {
      const p = await businessProfileApi.getProfile();
      if (p) {
        const isBadLocalAssetRef = (val: any): boolean => {
          const s = String(val || '');
          return s.includes('unstable_path=') || /(^\.?\/?assets\/images\/default)/i.test(s);
        };

        setProfile(p);
        setProfileDisplayName(p?.display_name || '');
        setProfileAddress(p?.address || '');
        setProfileInstagram(p?.instagram_url || '');
        setProfileFacebook(p?.facebook_url || '');
        setProfileTiktok((p as any)?.tiktok_url || '');
        setProfileImageOnPage1(isBadLocalAssetRef((p as any)?.image_on_page_1) ? '' : ((p as any)?.image_on_page_1 || ''));
        setProfileImageOnPage2(isBadLocalAssetRef((p as any)?.image_on_page_2) ? '' : ((p as any)?.image_on_page_2 || ''));
        setProfileImageOnPage3(isBadLocalAssetRef((p as any)?.image_on_page_3) ? '' : ((p as any)?.image_on_page_3 || ''));
        setProfileLoginImg(isBadLocalAssetRef((p as any)?.login_img) ? '' : ((p as any)?.login_img || ''));
        setProfileMinCancellationHours(p?.min_cancellation_hours || 24);
        
        // Preload images for better performance
        preloadImages(p);
      }
    } catch (error) {
      console.error('Failed to load business profile:', error);
      // Don't show error to user, just log it
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const preloadImages = (profile: any) => {
    const images = [
      profile?.image_on_page_1,
      profile?.image_on_page_2,
      profile?.image_on_page_3,
      profile?.login_img
    ].filter(Boolean);
    
    images.forEach((imageUrl) => {
      // Only prefetch remote or file-based URLs. Avoid relative asset paths and Expo dev asset URLs
      const isRemote = typeof imageUrl === 'string' && /^(https?:|data:|file:)/.test(imageUrl) && !String(imageUrl).includes('unstable_path=');
      if (isRemote) {
        Image.prefetch(imageUrl).catch((error) => {
          console.log('Failed to prefetch image:', error);
        });
      }
    });
  };

  // Load business profile on mount
  useEffect(() => {
    loadBusinessProfile();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (imageLoadTimeout) {
        clearTimeout(imageLoadTimeout);
      }
      progressAnimation.stopAnimation();
    };
  }, [imageLoadTimeout, progressAnimation]);

  // Keep edit drafts in sync when modal opens or profile updates
  useEffect(() => {
    if (showEditAddressModal) {
      setAddressDraft(profileAddress || '');
    }
  }, [showEditAddressModal, profileAddress]);

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

  // Keep business name draft in sync when modal opens
  useEffect(() => {
    if (showEditDisplayNameModal) {
      setDisplayNameDraft(profileDisplayName || '');
    }
  }, [showEditDisplayNameModal, profileDisplayName]);

  const handleSaveBusinessProfile = async () => {
    setIsSavingProfile(true);
    try {
      const updated = await businessProfileApi.upsertProfile({
        display_name: profileDisplayName.trim() || null as any,
        address: profileAddress.trim() || null as any,
        instagram_url: profileInstagram.trim() || null as any,
        facebook_url: profileFacebook.trim() || null as any,
        tiktok_url: profileTiktok.trim() || null as any,
        image_on_page_1: profileImageOnPage1.trim() || null as any,
        image_on_page_2: profileImageOnPage2.trim() || null as any,
        image_on_page_3: profileImageOnPage3.trim() || null as any,
        login_img: profileLoginImg.trim() || null as any,
      });
      if (!updated) {
        Alert.alert('Error', 'Failed to save business profile');
        return;
      }
      setProfile(updated);
      Alert.alert('Success', 'Business details saved successfully');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Open editors with current values
  const openEditAddress = () => {
    setAddressDraft(profileAddress || '');
    setShowEditAddressModal(true);
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

  const openEditCancellation = () => {
    setCancellationHoursDraft(profileMinCancellationHours.toString());
    setShowEditCancellationModal(true);
  };

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
        Alert.alert('Error', 'Failed to save address');
        return;
      }
      setProfile(updated);
      setProfileAddress(updated.address || '');
      setShowEditAddressModal(false);
    } finally {
      setIsSavingProfile(false);
    }
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
        Alert.alert('Error', 'Failed to save Instagram link');
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
        Alert.alert('Error', 'Failed to save Facebook link');
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
        Alert.alert('Error', 'Failed to save TikTok link');
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
    const hours = parseInt(cancellationHoursDraft);
    if (isNaN(hours) || hours < 0 || hours > 168) {
      Alert.alert('Error', 'Please enter a valid number between 0 and 168 hours');
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
        Alert.alert('Error', 'Failed to save cancellation policy');
        return;
      }
      setProfile(updated);
      setProfileMinCancellationHours(updated.min_cancellation_hours || 24);
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
      onStartShouldSetPanResponder: () => false,
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
 
  // Predefined titles
  const predefinedTitles = [
    { id: 'promotion', title: 'New Promotion! 🎉', description: 'Message about promotion or discount' },
    { id: 'reminder', title: 'Important Reminder ⏰', description: 'Reminder for appointment or event' },
    { id: 'update', title: 'Service Update 📢', description: 'Update about new services' },
    { id: 'holiday', title: 'Holiday Closure 🏖️', description: 'Message about closure or schedule change' },
    { id: 'welcome', title: 'Welcome! 👋', description: 'Welcome message for clients' },
    { id: 'custom', title: 'Custom Title ✏️', description: 'Custom title' }
  ];

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: () => {
            logout();
            // Force navigation to login page
            router.replace('/login');
          }
        }
      ]
    );
  };

  const openServicesModal = async () => {
    setShowServicesModal(true);
    setIsLoadingServices(true);
    setServicesError(null);
    try {
      const data = await servicesApi.getAllServices();
      // Sort services by order_index if available, otherwise by name
      const sortedServices = (data || []).sort((a, b) => {
        if (a.order_index !== undefined && b.order_index !== undefined) {
          return a.order_index - b.order_index;
        }
        return a.name.localeCompare(b.name);
      });
      setEditableServices(sortedServices);
    } catch (e) {
      setServicesError('Error loading services');
    } finally {
      setIsLoadingServices(false);
      // defer to allow modal mount
      setTimeout(() => animateOpenSheet(), 0);
    }
  };

  const closeServicesModal = () => {
    animateCloseSheet(() => setShowServicesModal(false));
  };


  const updateLocalServiceField = <K extends keyof Service>(id: string, key: K, value: Service[K]) => {
    setEditableServices(prev => prev.map(s => (s.id === id ? { ...s, [key]: value } : s)));
  };

  // Add Service modal state
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  
  
  
  const [addSvcName, setAddSvcName] = useState('');
  const [addSvcPrice, setAddSvcPrice] = useState<string>('0');
  // removed per-service duration field
  const [addSvcDuration, setAddSvcDuration] = useState<string>('60');
  // category removed
  const [addSvcIsSaving, setAddSvcIsSaving] = useState(false);
  // category removed
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);


  const durationOptions: number[] = Array.from({ length: ((180 - 10) / 5) + 1 }, (_, i) => 10 + i * 5);

  const guessMimeFromUri = (uriOrName: string): string => {
    const ext = uriOrName.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'heic' || ext === 'heif') return 'image/heic';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
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
      const filePath = `${user?.id || 'anon'}/${Date.now()}_${randomId()}.${extGuess}`;
      let bucketUsed = 'avatars';
      const firstAttempt = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, { contentType, upsert: false });
      if (firstAttempt.error) {
        const msg = String((firstAttempt.error as any)?.message || '').toLowerCase();
        if (msg.includes('bucket') && msg.includes('not found')) {
          bucketUsed = 'designs';
          const retry = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, { contentType, upsert: false });
          if (retry.error) {
            console.error('avatar upload error (retry)', retry.error);
            return null;
          }
        } else {
          console.error('avatar upload error', firstAttempt.error);
          return null;
        }
      }
      const { data } = supabase.storage.from(bucketUsed).getPublicUrl(filePath);
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
        Alert.alert('Permission required', 'Please allow gallery access to pick an image');
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
        Alert.alert('Error', 'Image upload failed');
        return;
      }
      const updated = await usersApi.updateUser(user.id as any, { image_url: uploadedUrl } as any);
      if (!updated) {
        Alert.alert('Error', 'Failed to save profile image');
        return;
      }
      updateUserProfile({ image_url: uploadedUrl } as any);
    } catch (e) {
      console.error('pick/upload admin avatar failed', e);
      Alert.alert('Error', 'Image upload failed');
    } finally {
      setIsUploadingAdminAvatar(false);
    }
  };

  const uploadBusinessImage = async (asset: { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
      let fileBody: Uint8Array;
      
      if (asset.base64) {
        const bytes = base64ToUint8Array(asset.base64);
        fileBody = bytes;
      } else {
        const response = await fetch(asset.uri, { cache: 'no-store' });
        const arrayBuffer = await response.arrayBuffer();
        fileBody = new Uint8Array(arrayBuffer);
        contentType = response.headers.get('content-type') || contentType;
      }
      
      const extGuess = (contentType.split('/')[1] || 'jpg').toLowerCase();
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const filePath = `business-images/${Date.now()}_${randomId()}.${extGuess}`;
      
      const { error } = await supabase.storage.from('designs').upload(filePath, fileBody, { contentType, upsert: false });
      if (error) {
        console.error('business image upload error', error);
        return null;
      }
      const { data } = supabase.storage.from('designs').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('business image upload exception', e);
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
      // Reuse 'designs' bucket as בפרויקט – ניתן להחליף ל-bucket ייעודי 'services' אם קיים
      const { error } = await supabase.storage.from('designs').upload(filePath, fileBody as any, { contentType, upsert: false });
      if (error) {
        console.error('upload error', error);
        return null;
      }
      const { data } = supabase.storage.from('designs').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('upload exception', e);
      return null;
    }
  };


  const openImagePreview = (imageType: 'page1' | 'page2' | 'page3' | 'login') => {
    // Clear any existing timeout
    if (imageLoadTimeout) {
      clearTimeout(imageLoadTimeout);
    }
    
    setPreviewImageType(imageType);
    setImageTranslateX(0);
    setImageTranslateY(0);
    
    // Special handling for special backgrounds - no loading needed
    if (imageType === 'login' && (profileLoginImg === 'gradient-background' || 
                                 profileLoginImg === 'solid-blue-background' ||
                                 profileLoginImg === 'solid-purple-background' ||
                                 profileLoginImg === 'solid-green-background' ||
                                 profileLoginImg === 'solid-orange-background' ||
                                 profileLoginImg === 'light-silver-background' ||
                                 profileLoginImg === 'light-white-background' ||
                                 profileLoginImg === 'light-gray-background' ||
                                 profileLoginImg === 'light-pink-background' ||
                                 profileLoginImg === 'light-cyan-background' ||
                                 profileLoginImg === 'light-lavender-background' ||
                                 profileLoginImg === 'light-coral-background' ||
                                 profileLoginImg === 'dark-black-background' ||
                                 profileLoginImg === 'dark-charcoal-background')) {
      setIsImageLoading(false);
      setImageLoadError(false);
      setShowImagePreviewModal(true);
      return;
    }
    
    // If the stored image is a non-remote relative asset path (e.g. './assets/...'),
    // skip preview and open the picker directly to let the user choose a valid image.
    const currentUrl = imageType === 'page1'
      ? profileImageOnPage1
      : imageType === 'page2'
        ? profileImageOnPage2
        : imageType === 'page3'
          ? profileImageOnPage3
          : profileLoginImg;
    const isRemote = typeof currentUrl === 'string' && /^(https?:|data:|file:)/.test(currentUrl) && !String(currentUrl).includes('unstable_path=');
    if (!isRemote) {
      setShowImagePreviewModal(false);
      handlePickBusinessImage(imageType);
      return;
    }
    
    setIsImageLoading(true);
    setImageLoadError(false);
    setShowImagePreviewModal(true);
    
    // Start progress animation
    progressAnimation.setValue(0);
    Animated.timing(progressAnimation, {
      toValue: 1,
      duration: 15000,
      useNativeDriver: false,
    }).start();
    
    // Set a timeout to show error if image doesn't load within 15 seconds
    const timeout = setTimeout(() => {
      // Only show error if still loading (image didn't load successfully)
      if (isImageLoading) {
        setIsImageLoading(false);
        setImageLoadError(true);
      }
    }, 15000);
    
    setImageLoadTimeout(timeout);
  };

  const handlePickBusinessImage = async (imageType: 'page1' | 'page2' | 'page3' | 'login') => {
    setCurrentImageType(imageType);
    setShowImageSelectionModal(true);
  };

  const handleImageSelected = async (imageUri: string, isPreset: boolean) => {
    if (!currentImageType) return;

    try {
      // Set loading state
      if (currentImageType === 'page1') {
        setIsUploadingImagePage1(true);
      } else if (currentImageType === 'page2') {
        setIsUploadingImagePage2(true);
      } else if (currentImageType === 'page3') {
        setIsUploadingImagePage3(true);
      } else if (currentImageType === 'login') {
        setIsUploadingLoginImg(true);
      }

      let uploadedUrl: string;

      if (isPreset) {
        // For preset images, we'll use the URL directly since they're external URLs
        // Special case for gradient background - save as special identifier
        uploadedUrl = imageUri;
      } else {
        // For gallery images, parse the asset data
        try {
          const assetData = JSON.parse(imageUri);
          uploadedUrl = await uploadBusinessImage({
            uri: assetData.uri,
            base64: assetData.base64,
            mimeType: assetData.mimeType,
            fileName: assetData.fileName,
          });
        } catch (parseError) {
          // Fallback for old format (just URI)
          uploadedUrl = await uploadBusinessImage({
            uri: imageUri,
            base64: null,
            mimeType: null,
            fileName: null,
          });
        }
      }

      if (!uploadedUrl) {
        Alert.alert('Error', 'Failed to upload image');
        return;
      }

      // Update the appropriate image state
      if (currentImageType === 'page1') {
        setProfileImageOnPage1(uploadedUrl);
      } else if (currentImageType === 'page2') {
        setProfileImageOnPage2(uploadedUrl);
      } else if (currentImageType === 'page3') {
        setProfileImageOnPage3(uploadedUrl);
      } else if (currentImageType === 'login') {
        setProfileLoginImg(uploadedUrl);
      }

      // Save to database
      const updated = await businessProfileApi.upsertProfile({
        display_name: (profileDisplayName || '').trim() || null as any,
        address: (profileAddress || '').trim() || null as any,
        instagram_url: (profileInstagram || '').trim() || null as any,
        facebook_url: (profileFacebook || '').trim() || null as any,
        tiktok_url: (profileTiktok || '').trim() || null as any,
        image_on_page_1: currentImageType === 'page1' ? uploadedUrl : (profileImageOnPage1 || '').trim() || null as any,
        image_on_page_2: currentImageType === 'page2' ? uploadedUrl : (profileImageOnPage2 || '').trim() || null as any,
        image_on_page_3: currentImageType === 'page3' ? uploadedUrl : (profileImageOnPage3 || '').trim() || null as any,
        login_img: currentImageType === 'login' ? uploadedUrl : (profileLoginImg || '').trim() || null as any,
      });

      if (updated) {
        setProfile(updated);
        // Update local state with the new data from server
        setProfileDisplayName(updated?.display_name || '');
        setProfileAddress(updated?.address || '');
        setProfileInstagram(updated?.instagram_url || '');
        setProfileFacebook(updated?.facebook_url || '');
        setProfileTiktok((updated as any)?.tiktok_url || '');
        setProfileImageOnPage1((updated as any)?.image_on_page_1 || '');
        setProfileImageOnPage2((updated as any)?.image_on_page_2 || '');
        setProfileImageOnPage3((updated as any)?.image_on_page_3 || '');
        setProfileLoginImg((updated as any)?.login_img || '');
        setProfileMinCancellationHours(updated?.min_cancellation_hours || 24);
        
        // Clear all modal states immediately after successful save
        setShowImageSelectionModal(false);
        setShowImagePreviewModal(false);
        setPreviewImageType(null);
        setCurrentImageType(null);
        
        Alert.alert('Success', 'Image saved successfully');
      } else {
        Alert.alert('Error', 'Failed to save image');
      }
    } catch (e) {
      console.error('image selection failed', e);
      Alert.alert('Error', 'Failed to save image');
    } finally {
      // Clear all image-related states
      setIsUploadingImagePage1(false);
      setIsUploadingImagePage2(false);
      setIsUploadingImagePage3(false);
      setIsUploadingLoginImg(false);
      setCurrentImageType(null);
      setShowImageSelectionModal(false);
      setShowImagePreviewModal(false);
      setPreviewImageType(null);
      setImageTranslateX(0);
      setImageTranslateY(0);
      // Ensure we're not in a loading state
      setIsLoadingProfile(false);
    }
  };


  const handleOpenAddService = async () => {
    // Close the services bottom sheet first to avoid overlay blocking touches
    if (showServicesModal) {
      animateCloseSheet(() => setShowServicesModal(false));
    }
    // Small delay to ensure sheet closed before opening new modal
    setTimeout(async () => {
      setShowAddServiceModal(true);
      // category selection removed
    }, 250);
  };

  const handleCreateService = async () => {
    if (!addSvcName.trim()) {
      Alert.alert('Error', 'Please enter a service name');
      return;
    }
    setAddSvcIsSaving(true);
    try {
      const created = await createService({
        name: addSvcName.trim(),
        price: parseFloat(addSvcPrice) || 0,
        duration_minutes: parseInt(addSvcDuration, 10) || 60,
        is_active: true,
      } as any);
      if (created) {
        setEditableServices(prev => [created, ...prev]);
        setShowAddServiceModal(false);
        // reset
        setAddSvcName('New Service');
        setAddSvcPrice('0');
        setAddSvcDuration('60');
      } else {
        Alert.alert('Error', 'Failed to create service');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create service');
    } finally {
      setAddSvcIsSaving(false);
    }
  };

  const handleDeleteService = (id: string) => {
    Alert.alert('Delete service', 'Are you sure you want to delete this service?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteService(id);
          if (ok) {
            setEditableServices(prev => prev.filter(s => s.id !== id));
            if (expandedServiceId === id) setExpandedServiceId(null);
          } else {
            Alert.alert('Error', 'Failed to delete service');
          }
        }
      }
    ]);
  };

  // Drag and drop functions
  const reorderServicesList = (fromIndex: number, toIndex: number) => {
    const newServices = [...editableServices];
    const [movedService] = newServices.splice(fromIndex, 1);
    newServices.splice(toIndex, 0, movedService);
    setEditableServices(newServices);
    
    // Update order in database
    updateServicesOrder(newServices);
  };

  const updateServicesOrder = async (services: Service[]) => {
    try {
      // For now, just update the local state since order_index column doesn't exist
      // The order will be maintained in the local state
      console.log('Services reordered locally:', services.map(s => s.name));
      
      // TODO: Once order_index column is added to database, uncomment this:
      // for (let i = 0; i < services.length; i++) {
      //   try {
      //     await updateService(services[i].id, {
      //       order_index: i,
      //     });
      //   } catch (error) {
      //     console.warn('Could not update order_index for service:', services[i].name, error);
      //   }
      // }
    } catch (error) {
      console.error('Failed to update services order:', error);
    }
  };



  const handleSaveService = async (service: Service) => {
    setSavingServiceId(service.id);
    try {
      const updated = await updateService(service.id, {
        name: service.name,
        price: service.price,
        image_url: service.image_url,
        duration_minutes: service.duration_minutes,
        is_active: service.is_active,
      });
      if (!updated) {
        Alert.alert('Error', 'Failed to save service');
        return;
      }
      setEditableServices(prev => prev.map(s => (s.id === service.id ? updated : s)));
      Alert.alert('Success', 'Service saved successfully');
    } catch (e) {
      Alert.alert('Error', 'Failed to save service');
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
        Alert.alert('Error', 'Cannot open email client on this device');
      }
    } catch {
      Alert.alert('Error', 'Cannot open email client on this device');
    }
  };

  // Title helpers removed (handled by AdminBroadcastComposer)
  
  // Recurring appointment modal state
  const isAdmin = useAuthStore((s) => s.isAdmin);
  // Show Add employee button only if current user's phone equals business profile phone
  const canSeeAddEmployee = React.useMemo(() => {
    const userPhone = String(user?.phone || '').trim();
    const businessPhone = String((profile as any)?.phone || '').trim();
    return userPhone !== '' && businessPhone !== '' && userPhone === businessPhone;
  }, [user?.phone, (profile as any)?.phone]);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [isSubmittingRecurring, setIsSubmittingRecurring] = useState(false);
  const [showManageRecurringModal, setShowManageRecurringModal] = useState(false);
  const [showAddAppointmentModal, setShowAddAppointmentModal] = useState(false);
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

  // Employees management modal state
  const [showManageEmployeesModal, setShowManageEmployeesModal] = useState(false);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);

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
      Alert.alert('Error', 'Failed to load available times. Please try again.');
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
      servicesApi.getAllServices().then(setRecurringServices).catch(() => setRecurringServices([]));
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
    }
  }, [showRecurringModal]);

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
      Alert.alert('Error', 'Please fill all fields: client, day, time, and service');
      return;
    }
    // Final guard before creating: verify time is still available for the nearest occurrence
    const stillAvailable = await isTimeAvailable(selectedDayOfWeek as number, selectedTime as string);
    if (!stillAvailable) {
      Alert.alert('Slot taken', 'The selected time is already booked this week. Please choose another time.');
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
        Alert.alert('Success', 'Recurring appointment created. The slot will be kept after weekly generation.');
        setShowRecurringModal(false);
      } else {
        Alert.alert('Error', 'Failed to create recurring appointment');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create recurring appointment');
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
              <View style={styles.settingChevron}><ChevronRight size={20} color={businessColors.primary} /></View>
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
              <View style={styles.settingChevronLTR}><ChevronRight size={20} color={businessColors.primary} /></View>
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
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]} edges={['top']}>
      <LinearGradient
        colors={[Colors.white, Colors.white]}
        style={styles.headerGradient}
      >
        
        <View style={styles.adminProfileCard}>
          <TouchableOpacity 
            style={styles.adminAvatarWrap}
            onPress={() => {
              setAdminNameDraft(user?.name || '');
              setAdminPhoneDraft(user?.phone || '');
              setAdminEmailDraft((user as any)?.email || '');
              setShowEditAdminModal(true);
            }}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[businessColors.primary, businessColors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.adminAvatarRing}
            >
              <View style={styles.adminAvatar}>
                <Image source={user?.image_url ? { uri: (user as any).image_url } : require('@/assets/images/logo-03.png')} style={styles.adminAvatarImage} resizeMode="cover" />
              </View>
            </LinearGradient>
            <View style={[styles.editIconContainer, { backgroundColor: businessColors.primary }]}>
              <Pencil size={16} color={Colors.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.adminName}>{user?.name || 'Manager'}</Text>
          <Text style={styles.adminPhone}>{user?.phone || 'Phone Number'}</Text>
          <Text style={styles.adminEmail}>{(user as any)?.email || 'Email Address'}</Text>
        </View>
      </LinearGradient>
      
      <View style={styles.contentWrapper}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <Text style={styles.sectionTitleNew}>Notifications & messages</Text>
        
        <View style={[styles.cardNew, shadowStyle]}>
          {renderSettingItem(
            <Bell size={20} color={businessColors.primary} />,
            'Notifications',
            'Receive notifications about appointments and updates',
            <AppSwitch value={notificationsEnabled} onValueChange={setNotificationsEnabled} primaryColor={businessColors.primary} />,
            undefined,
            true
          )}
          
          {renderSettingItem(
            <Send size={20} color={businessColors.primary} />,
            'Send message to all clients',
            'Send a custom message to all clients',
            undefined,
            () => setShowBroadcast(true)
          )}
          

        </View>
        
        <Text style={styles.sectionTitleNew}>Services</Text>
        <View style={[styles.cardNew, shadowStyle]}>
          {renderSettingItem(
            <Pencil size={20} color={businessColors.primary} />,
            'Edit services',
            'Update prices and durations',
            undefined,
            openServicesModal
          )}
        </View>


        <Text style={styles.sectionTitleNew}>Business details</Text>
        <View style={[styles.cardNew, shadowStyle]}>
          {renderSettingItemLTR(
            <Pencil size={20} color={businessColors.primary} />, 
            'Business name',
            profileDisplayName || 'Add business name',
            undefined,
            () => { setDisplayNameDraft(profileDisplayName || ''); setShowEditDisplayNameModal(true); }
          )}
          {renderSettingItemLTR(
            <MapPin size={20} color="#FF3B30" />, 
            'Business address',
            profileAddress || 'Add address',
            undefined,
            openEditAddress
          )}
          {renderSettingItemLTR(
            <Instagram size={20} color="#E4405F" />, 
            'Instagram',
            profileInstagram ? undefined : 'Add Instagram link',
            undefined,
            openEditInstagram
          )}
          {renderSettingItemLTR(
            <Facebook size={20} color="#1877F2" />, 
            'Facebook',
            profileFacebook ? undefined : 'Add Facebook link',
            undefined,
            openEditFacebook
          )}
          {renderSettingItemLTR(
            <Ionicons name="logo-tiktok" size={20} color="#000000" />, 
            'TikTok',
            profileTiktok ? undefined : 'Add TikTok link',
            undefined,
            openEditTiktok
          )}
        </View>

        <Text style={styles.sectionTitleNew}>Design Application</Text>
        <View style={[styles.cardNew, shadowStyle]}>
          <ColorPicker 
            currentColor={profile?.primary_color || '#000000'}
            onColorSelect={(color) => {
              // Update local profile state immediately
              if (profile) {
                setProfile({ ...profile, primary_color: color });
              }
              
              // Trigger comprehensive app refresh immediately
              triggerColorUpdate();
              forceAppRefresh();
              
              // Trigger additional color updates to ensure all components refresh
              setTimeout(() => triggerColorUpdate(), 100);
              setTimeout(() => triggerColorUpdate(), 300);
              setTimeout(() => triggerColorUpdate(), 600);
              setTimeout(() => triggerColorUpdate(), 1000);
              
              // Force additional app refresh
              setTimeout(() => forceAppRefresh(), 200);
              setTimeout(() => forceAppRefresh(), 800);
              
              // Force a complete re-render of the settings screen
              setTimeout(() => {
                // This will force the entire component to re-render
                setProfile(prev => prev ? { ...prev } : null);
              }, 1200);
            }}
          />
          
          {renderSettingItemLTR(
            <Home size={20} color={isUploadingImagePage1 ? Colors.subtext : businessColors.primary} />, 
            'Home page image',
            isUploadingImagePage1 ? 'Uploading...' : (profileImageOnPage1 ? 'Image uploaded' : 'Upload home page image'),
            isUploadingImagePage1 ? (
              <ActivityIndicator size="small" color={businessColors.primary} />
            ) : undefined,
            isUploadingImagePage1 ? undefined : (profileImageOnPage1 ? () => openImagePreview('page1') : () => handlePickBusinessImage('page1')),
            false,
            isUploadingImagePage1
          )}
          {renderSettingItemLTR(
            <ImageIcon size={20} color={isUploadingImagePage2 ? Colors.subtext : businessColors.primary} />, 
            'Booking page image',
            isUploadingImagePage2 ? 'Uploading...' : (profileImageOnPage2 ? 'Image uploaded' : 'Upload booking page image'),
            isUploadingImagePage2 ? (
              <ActivityIndicator size="small" color={businessColors.primary} />
            ) : undefined,
            isUploadingImagePage2 ? undefined : (profileImageOnPage2 ? () => openImagePreview('page2') : () => handlePickBusinessImage('page2')),
            false,
            isUploadingImagePage2
          )}
          {renderSettingItemLTR(
            <ImageIcon size={20} color={isUploadingImagePage3 ? Colors.subtext : businessColors.primary} />, 
            'Existing Booking',
            isUploadingImagePage3 ? 'Uploading...' : (profileImageOnPage3 ? 'Image uploaded' : 'Upload existing booking image'),
            isUploadingImagePage3 ? (
              <ActivityIndicator size="small" color={businessColors.primary} />
            ) : undefined,
            isUploadingImagePage3 ? undefined : (profileImageOnPage3 ? () => openImagePreview('page3') : () => handlePickBusinessImage('page3')),
            false,
            isUploadingImagePage3
          )}
          {renderSettingItemLTR(
            <Ionicons name="log-in-outline" size={20} color={isUploadingLoginImg ? Colors.subtext : businessColors.primary} />, 
            'Login page image',
            isUploadingLoginImg ? 'Uploading...' : (profileLoginImg ? 'Image uploaded' : 'Upload login page image'),
            isUploadingLoginImg ? (
              <ActivityIndicator size="small" color={businessColors.primary} />
            ) : undefined,
            isUploadingLoginImg ? undefined : (profileLoginImg ? () => openImagePreview('login') : () => handlePickBusinessImage('login')),
            false,
            isUploadingLoginImg
          )}
        </View>

        <Text style={styles.sectionTitleNew}>Appointment policies</Text>
        <View style={[styles.cardNew, shadowStyle]}>
          {renderSettingItemLTR(
            <Clock size={20} color={businessColors.primary} />, 
            'Minimum cancellation time',
            `${profileMinCancellationHours} hours before appointment`,
            undefined,
            openEditCancellation
          )}
        </View>


        {isAdmin && (
          <>
            <Text style={styles.sectionTitleNew}>Appointments management</Text>
            <View style={[styles.cardNew, shadowStyle]}>
              {renderSettingItem(
                <Calendar size={20} color={businessColors.primary} />,
                'Add appointment for a client',
                'Create a new appointment for a client',
                undefined,
                () => setShowAddAppointmentModal(true)
              )}
            </View>

            <Text style={styles.sectionTitleNew}>Recurring appointments</Text>
            <View style={[styles.cardNew, shadowStyle]}>
              {renderSettingItem(
                <Pencil size={20} color={businessColors.primary} />, // reuse icon
                'Add recurring appointment',
                'Choose a client, day, and time for a recurring appointment',
                undefined,
                () => setShowRecurringModal(true)
              )}
              {renderSettingItem(
                <Pencil size={20} color={businessColors.primary} />, // reuse icon
                'Manage recurring appointments',
                'View, edit, and delete existing recurring appointments',
                undefined,
                async () => {
                  setShowManageRecurringModal(true);
                  setIsLoadingRecurring(true);
                  try {
                    const items = await recurringAppointmentsApi.listAll();
                    setRecurringList(items);
                  } finally {
                    setIsLoadingRecurring(false);
                  }
                }
              )}
            </View>
          </>
        )}
        
        
        
        <Text style={styles.sectionTitleNew}>Security & support</Text>
        
        <View style={[styles.cardNew, shadowStyle]}>
          {canSeeAddEmployee && (
            renderSettingItem(
              <User size={20} color={businessColors.primary} />,
              'Add employee user',
              'Add another employee to the system',
              undefined,
              () => setShowAddAdminModal(true)
            )
          )}
          {canSeeAddEmployee && (
            renderSettingItem(
              <Trash2 size={20} color="#FF3B30" />,
              'Manage employees',
              'Remove employees from this business',
              undefined,
              async () => {
                setShowManageEmployeesModal(true);
                setIsLoadingEmployees(true);
                try {
                  const list = await usersApi.getAdminUsers();
                  const filtered = (list || []).filter((u: any) => u.id !== (user as any)?.id);
                  setAdminUsers(filtered);
                } finally {
                  setIsLoadingEmployees(false);
                }
              }
            )
          )}
          {renderSettingItem(
            <HelpCircle size={20} color={businessColors.primary} />,
            'Support and help',
            'Common questions and contact',
            undefined,
            () => setShowSupportModal(true)
          )}
        </View>

        {user && (
          <>
            <Text style={styles.sectionTitleNew}>Account Management</Text>
            
            <View style={[styles.cardNew, shadowStyle]}>
              {renderSettingItem(
                <Trash2 size={20} color="#FF3B30" />,
                'Delete Account',
                'Delete your account and all data',
                undefined,
                () => setShowDeleteAccountModal(true)
              )}
            </View>
          </>
        )}
        
        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: businessColors.primary }]} onPress={handleLogout}>
          <LogOut size={20} color={Colors.white} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
        
        <Text style={styles.versionText}>Version 1.0.0</Text>
        </ScrollView>
      </View>

      {/* Admin broadcast popup (consistent with Home screen) */}
      <AdminBroadcastComposer open={showBroadcast} onOpenChange={setShowBroadcast} renderTrigger={false} language="en" />

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
            <Text style={styles.modalTitle}>Support and help</Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView style={[styles.modalContent, { padding: 20 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.groupCard}>
              <Text style={styles.previewNotificationTitle}>
                Need help? Contact Slotlys support team
              </Text>
              <Text style={styles.previewNotificationContent}>
                Our dedicated support team is here to assist you with any questions or issues you may have. Whether you need help with appointments, account settings, or technical support, we're ready to help. Please use the contact button below to reach out to us directly.
              </Text>
              <View style={{ marginTop: 16, alignItems: 'center' }}>
                <TouchableOpacity style={[styles.modalSendButton, { backgroundColor: businessColors.primary }]} onPress={handleCallSupport}>
                  <Text style={[styles.modalSendText, { color: Colors.white }]}>Contact us now </Text>
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
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>Business name</Text>
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
                    Alert.alert('Error', 'Failed to save business name');
                  }
                } finally {
                  setIsSavingProfile(false);
                }
              }} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>Business name</Text>
                <TextInput
                  style={styles.textInput}
                  value={displayNameDraft}
                  onChangeText={setDisplayNameDraft}
                  placeholder="For example: The Studio of Hadas"
                  placeholderTextColor={Colors.subtext}
                  textAlign="left"
                />
              </View>
            </ScrollView>
          </View>
        </View>
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
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit admin</Text>
            <TouchableOpacity
              style={[styles.modalSendButton, { backgroundColor: businessColors.primary }, (isSavingAdmin) && styles.modalSendButtonDisabled]}
              onPress={async () => {
                if (!user?.id) { setShowEditAdminModal(false); return; }
                if (!adminNameDraft.trim() || !adminPhoneDraft.trim()) { Alert.alert('Error', 'Please fill in name and phone number'); return; }
                try {
                  setIsSavingAdmin(true);
                  const updated = await usersApi.updateUser(
                    user.id as any,
                    {
                      name: adminNameDraft.trim() as any,
                      phone: adminPhoneDraft.trim() as any,
                      // pass null to clear email when empty
                      email: (adminEmailDraft || '').trim() ? (adminEmailDraft || '').trim() : (null as any),
                    } as any
                  );
                  if (updated) {
                    updateUserProfile({ name: updated.name as any, phone: (updated as any).phone, email: (updated as any).email } as any);
                    setShowEditAdminModal(false);
                  } else {
                    Alert.alert('Error', 'Failed to save admin details');
                  }
                } finally {
                  setIsSavingAdmin(false);
                }
              }}
              disabled={isSavingAdmin}
            >
              <Text style={[styles.modalSendText, { color: Colors.white }, isSavingAdmin && styles.modalSendTextDisabled]}>{isSavingAdmin ? 'Saving...' : 'Save'}</Text>
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
                  <TouchableOpacity style={styles.modalAvatar} onPress={handlePickAdminAvatar} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Change admin profile picture">
                    <Image source={user?.image_url ? { uri: (user as any).image_url } : require('@/assets/images/logo-03.png')} style={styles.modalAvatarImage} resizeMode="cover" />
                    {isUploadingAdminAvatar && (
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 36 }}>
                        <ActivityIndicator size="small" color={businessColors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                </LinearGradient>
              </View>
              <Text style={styles.modalAdminName}>{adminNameDraft || user?.name || 'Admin'}</Text>
              <Text style={styles.modalAdminMeta}>{adminPhoneDraft || (user as any)?.phone || ''}</Text>
              {(adminEmailDraft || (user as any)?.email) ? (
                <Text style={styles.modalAdminMeta}>{adminEmailDraft || (user as any)?.email}</Text>
              ) : null}
              <View style={{ marginTop: 8 }}>
                <TouchableOpacity onPress={handlePickAdminAvatar} style={[styles.pickButton, { alignSelf: 'center', backgroundColor: '#F2F2F7', borderColor: '#E5E5EA' }]} activeOpacity={0.85} disabled={isUploadingAdminAvatar}>
                  <Text style={styles.pickButtonText}>{isUploadingAdminAvatar ? 'Uploading...' : 'Change profile picture'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.iosCard}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Admin name</Text>
                <TextInput
                  style={styles.textInput}
                  value={adminNameDraft}
                  onChangeText={setAdminNameDraft}
                  placeholder="Full name"
                  placeholderTextColor={Colors.subtext}
                  textAlign="left"
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Phone number</Text>
                <TextInput
                  style={styles.textInput}
                  value={adminPhoneDraft}
                  onChangeText={setAdminPhoneDraft}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={Colors.subtext}
                  keyboardType="phone-pad"
                  textAlign="left"
                />
              </View>
              <View style={[styles.inputContainer, { marginBottom: 0 }]}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.textInput}
                  value={adminEmailDraft}
                  onChangeText={setAdminEmailDraft}
                  placeholder="name@example.com"
                  placeholderTextColor={Colors.subtext}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="left"
                  onFocus={() => {
                    // Scroll to bottom when email field is focused
                    setTimeout(() => {
                      // This will help ensure the field is visible
                    }, 100);
                  }}
                />
              </View>
            </View>
            <View style={{ height: 100 }} />
          </ScrollView>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Address Modal */}
      <Modal
        visible={showEditAddressModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditAddressModal(false)}
      >
        <View style={styles.smallModalOverlay}>
          <View style={styles.smallModalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowEditAddressModal(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>Edit address</Text>
              <TouchableOpacity style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveAddress} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>Address</Text>
                <TextInput
                  style={styles.textInput}
                  value={addressDraft}
                  onChangeText={setAddressDraft}
                  placeholder="Business address"
                  placeholderTextColor={Colors.subtext}
                  textAlign="left"
                />
              </View>
            </ScrollView>
          </View>
        </View>
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
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>Instagram URL</Text>
              <TouchableOpacity style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveInstagram} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>Instagram URL</Text>
                <TextInput
                  style={styles.textInput}
                  value={instagramDraft}
                  onChangeText={setInstagramDraft}
                  placeholder="https://instagram.com/yourpage"
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
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>Facebook URL</Text>
              <TouchableOpacity style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveFacebook} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>Facebook URL</Text>
                <TextInput
                  style={styles.textInput}
                  value={facebookDraft}
                  onChangeText={setFacebookDraft}
                  placeholder="https://facebook.com/yourpage"
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
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitleLTR}>TikTok URL</Text>
              <TouchableOpacity style={[styles.modalSendButton, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveTiktok} disabled={isSavingProfile}>
                <Text style={[styles.modalSendText, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabelLTR}>TikTok URL</Text>
                <TextInput
                  style={styles.textInput}
                  value={tiktokDraft}
                  onChangeText={setTiktokDraft}
                  placeholder="https://www.tiktok.com/@yourpage"
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
        onRequestClose={() => {
          setShowCancellationDropdown(false);
          setShowEditCancellationModal(false);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          setShowCancellationDropdown(false);
          setShowEditCancellationModal(false);
        }}>
          <View style={styles.smallModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.smallModalCard}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity style={styles.cancellationModalCloseButton} onPress={() => {
                    setShowCancellationDropdown(false);
                    setShowEditCancellationModal(false);
                  }}>
                    <X size={20} color={Colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.modalTitleLTR}>Minimum cancellation time</Text>
                  <TouchableOpacity style={[styles.modalSendButton, { backgroundColor: businessColors.primary }, isSavingProfile && styles.modalSendButtonDisabled]} onPress={saveCancellationHours} disabled={isSavingProfile}>
                    <Text style={[styles.modalSendText, { color: Colors.white }, isSavingProfile && styles.modalSendTextDisabled]}>{isSavingProfile ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.smallModalContent} showsVerticalScrollIndicator={false}>
                  <TouchableWithoutFeedback onPress={() => setShowCancellationDropdown(false)}>
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabelLTR}>Hours before appointment</Text>
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
                              ? '0 hours (No restriction)' 
                              : `${cancellationHoursDraft} ${cancellationHoursDraft === '1' ? 'hour' : 'hours'}${parseInt(cancellationHoursDraft) >= 24 ? ` (${Math.floor(parseInt(cancellationHoursDraft) / 24)} ${Math.floor(parseInt(cancellationHoursDraft) / 24) === 1 ? 'day' : 'days'}${parseInt(cancellationHoursDraft) % 24 > 0 ? ` ${parseInt(cancellationHoursDraft) % 24} hours` : ''})` : ''}`
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
                              'Custom Hours',
                              'Enter number of hours (1-168):',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'OK',
                                  onPress: (text) => {
                                    const hours = parseInt(text || '0');
                                    if (hours >= 0 && hours <= 168) {
                                      setCancellationHoursDraft(hours.toString());
                                    } else {
                                      Alert.alert('Error', 'Please enter a number between 0 and 168');
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
                            Custom hours...
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

      {/* Time selection now uses inline dropdown below the field (no nested modal) */}
      {/* Manage Recurring Appointments Modal */}
      <Modal
        visible={showManageRecurringModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowManageRecurringModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: '#F8F9FA' }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowManageRecurringModal(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Manage recurring appointments</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.recurringCard}>
              {isLoadingRecurring ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={businessColors.primary} />
                  <Text style={{ marginTop: 12, color: Colors.subtext }}>Loading...</Text>
                </View>
              ) : (
                <View>
                  {recurringList.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: Colors.subtext }}>No recurring appointments</Text>
                  ) : (
                    recurringList.map((item, idx) => (
                      <View key={item.id}>
                        <View style={styles.manageItemRow}>
                          <View style={styles.itemActions}>
                            <TouchableOpacity
                              style={styles.iconActionButton}
                              onPress={async () => {
                                const ok = await recurringAppointmentsApi.delete(item.id);
                                if (ok) setRecurringList((prev) => prev.filter((x) => x.id !== item.id));
                                else Alert.alert('Error', 'Failed to delete appointment');
                              }}
                              accessibilityRole="button"
                              accessibilityLabel="Delete"
                            >
                              <Trash2 size={18} color="#FF3B30" />
                            </TouchableOpacity>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ alignItems: 'flex-start', flex: 1 }}>
                              <Text style={styles.previewNotificationTitle}>{item.client_name}</Text>
                              <Text style={styles.previewNotificationContent}>{item.client_phone}</Text>
                              <Text style={styles.previewNotificationContent}>{item.service_name}</Text>
                              <Text style={styles.previewNotificationContent}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][item.day_of_week]} · {String(item.slot_time).slice(0,5)}</Text>
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
        </SafeAreaView>
      </Modal>
      {/* Manage Employees Modal */}
      <Modal
        visible={showManageEmployeesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowManageEmployeesModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: '#F8F9FA' }]}> 
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowManageEmployeesModal(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Manage employees</Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.recurringCard}>
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.previewNotificationTitle}>Employees list</Text>
                <Text style={styles.previewNotificationContent}>Remove admins from your business</Text>
              </View>
              {isLoadingEmployees ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={businessColors.primary} />
                  <Text style={{ marginTop: 12, color: Colors.subtext }}>Loading...</Text>
                </View>
              ) : (
                <View>
                  {adminUsers.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: Colors.subtext }}>No employees</Text>
                  ) : (
                    adminUsers.map((adm: any, idx: number) => (
                      <View key={adm.id}>
                        <View style={[styles.manageItemRow, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                            <View style={[styles.accordionThumb, { width: 40, height: 40, borderRadius: 20, marginLeft: 0 }]}>
                              <Image source={adm.image_url ? { uri: adm.image_url } : require('@/assets/images/logo-03.png')} style={{ width: 40, height: 40, borderRadius: 20 }} />
                            </View>
                            <View style={{ alignItems: 'flex-start', flex: 1 }}>
                              <Text style={styles.previewNotificationTitle}>{adm.name || 'Admin'}</Text>
                              {!!adm.phone && <Text style={styles.previewNotificationContent}>{adm.phone}</Text>}
                              {!!adm.email && <Text style={styles.previewNotificationContent}>{adm.email}</Text>}
                            </View>
                          </View>
                          <TouchableOpacity
                              style={[styles.deleteIconButton, { backgroundColor: '#FFECEC', borderWidth: 1, borderColor: '#FFD1D1' }]}
                              onPress={() => {
                                if (adm.id === user?.id) {
                                  Alert.alert('Action not allowed', 'You cannot remove yourself.');
                                  return;
                                }
                                Alert.alert(
                                  'Remove employee',
                                  `Are you sure you want to remove ${adm.name || 'this employee'}?`,
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Remove',
                                      style: 'destructive',
                                      onPress: async () => {
                                        const ok = await usersApi.deleteUserAndAllDataById(adm.id);
                                        if (ok) {
                                          setAdminUsers((prev) => prev.filter((u) => u.id !== adm.id));
                                          Alert.alert('Success', 'Employee deleted successfully');
                                        } else {
                                          Alert.alert('Error', 'Failed to remove employee');
                                        }
                                      }
                                    }
                                  ]
                                );
                              }}
                              accessibilityRole="button"
                              accessibilityLabel="Delete"
                            >
                              <Trash2 size={20} color="#FF3B30" />
                            </TouchableOpacity>
                        </View>
                        {idx < adminUsers.length - 1 && <View style={styles.manageDivider} />}
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {/* Recurring Appointment Modal */}
      <Modal
        visible={showRecurringModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRecurringModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: '#F8F9FA' }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.cancellationModalCloseButton}
              onPress={() => setShowRecurringModal(false)}
            >
              <X size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add recurring appointment</Text>
            <TouchableOpacity 
              style={[styles.modalSendButton, { backgroundColor: businessColors.primary }, isSubmittingRecurring && styles.modalSendButtonDisabled]}
              onPress={handleSubmitRecurring}
              disabled={isSubmittingRecurring}
            >
              <Text style={[styles.modalSendText, { color: Colors.white }, isSubmittingRecurring && styles.modalSendTextDisabled]}>
                {isSubmittingRecurring ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={[styles.modalContent, { padding: 20 }]} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
          >
            <View style={styles.recurringCard}>
            {/* Client select as dropdown with inline search */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { textAlign: 'left' }]}>Client</Text>
              {!selectedClient ? (
                <>
                  <Pressable style={[styles.dropdownContainer, styles.grayField]} onPress={() => setShowClientDropdown(!showClientDropdown)}>
                    <View style={styles.dropdownHeader}>
                      <Text style={[styles.dropdownText, styles.dropdownPlaceholder, { textAlign: 'left' }]}>Select client...</Text>
                      {showClientDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                    </View>
                  </Pressable>
                  {showClientDropdown && (
                    <View style={styles.dropdownOptions}>
                      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                        <TextInput
                          style={[styles.textInput, { borderWidth: 1, borderColor: '#E5E5EA', backgroundColor: '#F2F2F7' }]}
                          value={clientSearch}
                          onChangeText={searchClients}
                          placeholder="Search by name or phone..."
                          placeholderTextColor={Colors.subtext}
                          textAlign="left"
                        />
                      </View>
                      <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {clientResults.map((c, idx) => (
                          <Pressable
                            key={c.phone}
                            style={[styles.dropdownOption, idx === clientResults.length - 1 && styles.dropdownOptionLast]}
                            onPress={() => { setSelectedClient(c); setShowClientDropdown(false); }}
                          >
                            <View style={styles.dropdownOptionContent}>
                              <Text style={styles.dropdownOptionTitle}>{c.name || 'Client'}</Text>
                              <Text style={styles.dropdownOptionDescription}>{c.phone}</Text>
                            </View>
                          </Pressable>
                        ))}
                        {clientResults.length === 0 && (
                          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                            <Text style={{ textAlign: 'center', color: Colors.subtext }}>No results</Text>
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
                      <Text style={{ color: '#FF3B30', fontWeight: '600' }}>Change</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Service select (before day/time) */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { textAlign: 'left' }]}>Service</Text>
              <Pressable style={[styles.dropdownContainer, styles.grayField]} onPress={() => setShowServiceDropdown(!showServiceDropdown)}>
                <View style={styles.dropdownHeader}>
                  {selectedService ? (
                    <View style={{ flex: 1, alignItems: 'flex-start' }}>
                      <Text style={styles.serviceHeaderTitle}>{selectedService.name}</Text>
                      {!!selectedService.duration_minutes && (
                        <Text style={styles.serviceHeaderSub}>{`${selectedService.duration_minutes} minutes`}</Text>
                      )}
                    </View>
                  ) : (
                    <Text style={[styles.dropdownText, styles.dropdownPlaceholder, { textAlign: 'left' }]}>Select service...</Text>
                  )}
                  {showServiceDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                </View>
              </Pressable>
              {showServiceDropdown && (
                <View style={styles.dropdownOptions}>
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {recurringServices.map((svc, idx) => (
                      <Pressable
                        key={svc.id}
                        style={[styles.dropdownOption, idx === recurringServices.length - 1 && styles.dropdownOptionLast]}
                        onPress={() => { setSelectedService(svc); setShowServiceDropdown(false); }}
                      >
                        <View style={styles.dropdownOptionContent}>
                          <Text style={styles.dropdownOptionTitle}>{svc.name}</Text>
                          {!!svc.duration_minutes && (
                            <Text style={styles.dropdownOptionDescription}>{`${svc.duration_minutes} minutes`}</Text>
                          )}
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Repeat interval selection */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { textAlign: 'left' }]}>Repeat every</Text>
              <Pressable style={[styles.dropdownContainer, styles.grayField]} onPress={() => setShowRepeatDropdown(!showRepeatDropdown)}>
                <View style={styles.dropdownHeader}>
                  <Text style={[styles.dropdownText, { textAlign: 'left' }]}>{repeatWeeks === 1 ? 'every week' : `every ${repeatWeeks} weeks`}</Text>
                  {showRepeatDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                </View>
              </Pressable>
              {showRepeatDropdown && (
                <View style={styles.dropdownOptions}>
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

            {/* Day select (disabled until service chosen) */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { textAlign: 'left' }]}>Day of week</Text>
              <Pressable
                style={[styles.dropdownContainer, styles.grayField, { opacity: selectedService ? 1 : 0.6 }]}
                onPress={() => {
                  if (!selectedService) {
                    Alert.alert('Error', 'Please select a service');
                    return;
                  }
                  setShowDayDropdown(!showDayDropdown);
                }}
              >
                <View style={styles.dropdownHeader}>
                  <Text style={[styles.dropdownText, !Number.isInteger(selectedDayOfWeek as any) && styles.dropdownPlaceholder, { textAlign: 'left' }]}>
                    {Number.isInteger(selectedDayOfWeek as any) ? dayNames[selectedDayOfWeek as number] : 'Select day...'}
                  </Text>
                  {showDayDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                </View>
              </Pressable>
              {showDayDropdown && (
                <View style={styles.dropdownOptions}>
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {dayNames.map((n, idx) => (
                      <Pressable key={n} style={[styles.dropdownOption, idx === dayNames.length - 1 && styles.dropdownOptionLast]} onPress={() => { setSelectedDayOfWeek(idx); setShowDayDropdown(false); }}>
                        <Text style={styles.dropdownOptionTitle}>{n}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Time select */}
            <View style={styles.inputContainer}> 
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeaderTitle, { textAlign: 'left' }]}>Select time</Text>
              </View>
              <Pressable
                style={[styles.dropdownContainer, styles.grayField, { opacity: Number.isInteger(selectedDayOfWeek as any) ? 1 : 0.6 }]}
                onPress={() => {
                  if (!selectedService) {
                    Alert.alert('Error', 'Please select a service');
                    return;
                  }
                  if (!Number.isInteger(selectedDayOfWeek as any)) {
                    Alert.alert('Error', 'Please select a day of the week');
                    return;
                  }
                  setShowTimeDropdown((prev) => !prev);
                  if (availableTimes.length === 0 && !isLoadingTimes && Number.isInteger(selectedDayOfWeek as any)) {
                    loadAvailableTimesForDay(selectedDayOfWeek as number);
                  }
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
                <View style={styles.dropdownOptions}>
                  {isLoadingTimes ? (
                    <View style={{ padding: 12, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={businessColors.primary} />
                      <Text style={{ textAlign: 'center', color: Colors.subtext, marginTop: 8 }}>
                        Loading available times...
                      </Text>
                    </View>
                  ) : availableTimes.length === 0 ? (
                    <View style={{ padding: 12 }}>
                      <Text style={{ textAlign: 'center', color: Colors.subtext }}>
                        No available times for this day
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {availableTimes.map((t, idx) => (
                        <Pressable
                          key={t}
                          style={[styles.dropdownOption, idx === availableTimes.length - 1 && styles.dropdownOptionLast]}
                          onPress={async () => {
                            if (!Number.isInteger(selectedDayOfWeek as any)) return;
                            const ok = await isTimeAvailable(selectedDayOfWeek as number, t);
                            if (!ok) {
                              Alert.alert('Appointment booked', 'The selected time is already booked for this week. Please choose another time.');
                              return;
                            }
                            setSelectedTime(t);
                            setShowTimeDropdown(false);
                          }}
                        >
                          <View style={styles.dropdownOptionContent}>
                            <Text style={styles.dropdownOptionTitle}>{formatTime12Hour(t)}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>

            {/* Service select moved above */}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {/* Services Edit Modal as animated bottom sheet */}
      <Modal
        visible={showServicesModal}
        transparent
        animationType="fade"
        onRequestClose={closeServicesModal}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={styles.sheetRoot}>
            <TouchableWithoutFeedback onPress={closeServicesModal}>
              <Animated.View style={[styles.sheetOverlay, { opacity: overlayOpacity }]} />
            </TouchableWithoutFeedback>
            <Animated.View
              style={[styles.sheetContainer, { transform: [{ translateY: combinedTranslateY }] } ] }
            >
            <View style={styles.dragHandleArea}>
              <View style={styles.sheetGrabberWrapper} {...panResponder.panHandlers}>
                <View style={styles.sheetGrabber} />
              </View>
            </View>
            <View style={styles.servicesModalHeader}>
              <TouchableOpacity 
                style={styles.servicesModalCloseButton}
                onPress={closeServicesModal}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.servicesModalTitle}>Edit services</Text>
              <TouchableOpacity 
                style={styles.modalActionButton}
                onPress={handleOpenAddService}
                accessibilityRole="button"
                accessibilityLabel="Add service"
              >
                <Text style={styles.modalActionText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sheetBody}>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[styles.modalContentContainer, { paddingBottom: insets.bottom + 8 }]}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={false}
                scrollIndicatorInsets={{ bottom: 0 }}
                alwaysBounceVertical
              >
                {isLoadingServices && (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={businessColors.primary} />
                    <Text style={{ marginTop: 12, color: Colors.subtext }}>Loading services...</Text>
                  </View>
                )}

                {servicesError && (
                  <Text style={{ color: 'red', textAlign: 'center', marginVertical: 12 }}>{servicesError}</Text>
                )}

                {!isLoadingServices && !servicesError && editableServices.map((svc, index) => (
                  <Swipeable
                    key={svc.id}
                    friction={2}
                    rightThreshold={28}
                    renderRightActions={(progress, dragX) => (
                      <TouchableOpacity
                        style={styles.swipeDeleteAction}
                        activeOpacity={0.85}
                        onPress={() => handleDeleteService(svc.id)}
                      >
                        <Trash2 size={20} color={'#fff'} />
                        <Text style={styles.swipeDeleteText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  >
                    <View style={styles.iosCard}>
                      <TouchableOpacity
                        style={[styles.accordionHeader, { flexDirection: 'row' }]}
                        activeOpacity={0.85}
                        onPress={() => setExpandedServiceId(prev => prev === svc.id ? null : svc.id)}
                      >
                          {/* Right: thumbnail */}
                          {svc.image_url ? (
                            <Image source={{ uri: svc.image_url }} style={[styles.accordionThumb, { marginLeft: 0, marginRight: 12 }]} />
                          ) : (
                            <View style={[styles.accordionThumbPlaceholder, { marginLeft: 0, marginRight: 12 }]}>
                              <Text style={styles.accordionThumbPlaceholderText}>
                                {(svc.name || '').slice(0, 1)}
                              </Text>
                            </View>
                          )}
                          {/* Middle: title and subtitle */}
                          <View style={{ flex: 1, alignItems: 'flex-start' }}>
                            <Text style={styles.accordionTitle}>{svc.name || 'No name'}</Text>
                            <Text style={styles.accordionSubtitle}>
                              {typeof svc.price === 'number' ? `$${svc.price}` : 'No price'}
                            </Text>
                          </View>
                          {/* Left: chevron */}
                          <View style={styles.accordionChevron}>
                            {expandedServiceId === svc.id ? (
                              <ChevronUp size={18} color={businessColors.primary} />
                            ) : (
                              <ChevronDown size={18} color={businessColors.primary} />
                            )}
                          </View>
                        </TouchableOpacity>

                    {expandedServiceId === svc.id && (
                      <View>

                        <View style={styles.formGroup}>
                          <Text style={styles.formLabel}>Service name</Text>
                          <TextInput
                            style={styles.formInput}
                            value={svc.name}
                            onChangeText={(t) => updateLocalServiceField(svc.id, 'name', t)}
                            textAlign="left"
                          />
                        </View>

                        

                        <View style={[styles.twoColumnRow, { flexDirection: 'row' }]}>
                          <View style={[styles.formGroup, styles.twoColumnItem]}>
                            <Text style={[styles.formLabel, { textAlign: 'left' }]}>Price ($)</Text>
                            <TextInput
                              style={styles.formInput}
                              value={String(svc.price ?? '')}
                              onChangeText={(t) => {
                                const num = parseFloat(t.replace(/[^0-9.]/g, ''));
                                updateLocalServiceField(svc.id, 'price', isNaN(num) ? 0 : num);
                              }}
                              keyboardType="numeric"
                              textAlign="left"
                            />
                          </View>
                          <View style={[styles.formGroup, styles.twoColumnItem]}>
                            <Text style={styles.formLabel}>Duration (minutes)</Text>
                            <Pressable
                              style={styles.dropdownContainer}
                              onPress={() => setEditDurationDropdownFor(prev => prev === svc.id ? null : svc.id)}
                            >
                              <View style={styles.dropdownHeader}>
                                <Text style={[styles.dropdownText, { textAlign: 'left' }, !svc.duration_minutes && styles.dropdownPlaceholder]}>
                                  {svc.duration_minutes ? `${svc.duration_minutes} minutes` : 'Select duration...'}
                                </Text>
                                {editDurationDropdownFor === svc.id ? (
                                  <ChevronUp size={20} color={businessColors.primary} />
                                ) : (
                                  <ChevronDown size={20} color={businessColors.primary} />
                                )}
                              </View>
                            </Pressable>
                            {editDurationDropdownFor === svc.id && (
                              <View style={styles.dropdownOptions}>
                                <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                  {durationOptions.map((mins, idx) => (
                                    <Pressable
                                      key={mins}
                                      style={[styles.dropdownOption, idx === durationOptions.length - 1 && styles.dropdownOptionLast]}
                                      onPress={() => { updateLocalServiceField(svc.id, 'duration_minutes', mins as any); setEditDurationDropdownFor(null); }}
                                    >
                                      <Text style={[styles.dropdownOptionTitle, { textAlign: 'left' }]}>{`${mins} minutes`}</Text>
                                    </Pressable>
                                  ))}
                                </ScrollView>
                              </View>
                            )}
                          </View>
                        </View>

                        

                        <View style={styles.actionsRowInline}>
                          <TouchableOpacity
                            style={[styles.primaryPillButton, { opacity: savingServiceId === svc.id ? 0.7 : 1 }]}
                            onPress={() => handleSaveService(svc)}
                            disabled={savingServiceId === svc.id}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.primaryPillButtonText}>
                              {savingServiceId === svc.id ? 'Saving...' : 'Save changes'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.deleteIconButton}
                            onPress={() => handleDeleteService(svc.id)}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Delete service"
                          >
                            <Trash2 size={20} color="#FF3B30" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                      </View>
                    </Swipeable>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Service Modal */}
      <Modal
        visible={showAddServiceModal}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent={true}
        onRequestClose={() => setShowAddServiceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setShowAddServiceModal(false)}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>
          <View style={styles.modalBottomSheet}>
            <KeyboardAvoidingView
              behavior={Platform.select({ ios: 'padding', android: undefined })}
              keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 }) as number}
              style={{ flex: 1 }}
            >
            <View style={styles.dragHandleArea}>
              <View style={styles.sheetGrabberWrapper}>
                <View style={styles.sheetGrabber} />
              </View>
            </View>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                style={[styles.modalCloseButton, { marginLeft: -10, paddingLeft: 0 }]}
                onPress={() => setShowAddServiceModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { textAlign: 'center', flex: 1, marginLeft: -44 }]}>
                Add Service
              </Text>
              <View style={{ width: 44 }} />
            </View>
            <ScrollView 
              style={styles.modalContent}
              contentContainerStyle={{ paddingBottom: 30 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalFormContent}>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Service Name *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={addSvcName}
                    onChangeText={setAddSvcName}
                    placeholder="Enter service name"
                    placeholderTextColor={Colors.subtext}
                  />
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Price ($) *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={addSvcPrice}
                    onChangeText={(t) => {
                      const num = t.replace(/[^0-9.]/g, '');
                      setAddSvcPrice(num);
                    }}
                    placeholder="0.00"
                    placeholderTextColor={Colors.subtext}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.formSectionLast}>
                  <Text style={styles.inputLabel}>Service Duration (minutes) *</Text>
              <Pressable style={styles.dropdownContainer} onPress={() => setShowDurationDropdown(!showDurationDropdown)}>
                <View style={styles.dropdownHeader}>
                  <Text style={[styles.dropdownText, { textAlign: 'left' }, !addSvcDuration && styles.dropdownPlaceholder]}>
                    {addSvcDuration ? `${addSvcDuration} minutes` : 'Select duration...'}
                  </Text>
                  {showDurationDropdown ? <ChevronUp size={20} color={businessColors.primary} /> : <ChevronDown size={20} color={businessColors.primary} />}
                </View>
              </Pressable>
              {showDurationDropdown && (
                <View style={styles.dropdownOptions}>
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {durationOptions.map((mins, idx) => (
                      <Pressable
                        key={mins}
                        style={[styles.dropdownOption, idx === durationOptions.length - 1 && styles.dropdownOptionLast]}
                        onPress={() => { setAddSvcDuration(String(mins)); setShowDurationDropdown(false); }}
                      >
                        <Text style={[styles.dropdownOptionTitle, { textAlign: 'left' }]}>{`${mins} minutes`}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            {/* category selection removed */}
            </View>
            </ScrollView>
            
            {/* Save Button */}
            <View style={styles.saveButtonContainer}>
              <TouchableOpacity 
                style={[styles.saveButton, { backgroundColor: businessColors.primary, opacity: addSvcIsSaving ? 0.7 : 1 }]}
                onPress={handleCreateService}
                disabled={addSvcIsSaving}
                activeOpacity={0.8}
              >
                <Text style={styles.saveButtonText}>
                  {addSvcIsSaving ? 'Saving...' : 'Add Service'}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      {/* Add Appointment Modal */}
      <AddAppointmentModal
        visible={showAddAppointmentModal}
        onClose={() => setShowAddAppointmentModal(false)}
        onSuccess={() => {
          // אפשר להוסיף כאן רענון של רשימת התורים אם צריך
        }}
      />

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

      {/* Image Preview Modal */}
      <Modal
        visible={showImagePreviewModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowImagePreviewModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: '#F8F9FA' }]}>
          <View style={styles.imagePreviewHeader}>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => {
                setShowImagePreviewModal(false);
                setIsImageLoading(false);
                setImageLoadError(false);
                if (imageLoadTimeout) {
                  clearTimeout(imageLoadTimeout);
                  setImageLoadTimeout(null);
                }
                progressAnimation.stopAnimation();
              }}
            >
              <X size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: '#000000' }]}>
              {previewImageType === 'page1' ? 'Home page image' : 
               previewImageType === 'page2' ? 'Booking page image' :
               previewImageType === 'page3' ? 'Existing Booking image' :
               'Login page image'}
            </Text>
            <TouchableOpacity 
              style={[styles.modalSendButton, { backgroundColor: businessColors.primary }]}
              onPress={() => {
                setShowImagePreviewModal(false);
                if (previewImageType) {
                  handlePickBusinessImage(previewImageType);
                }
              }}
            >
              <Text style={[styles.modalSendText, { color: '#FFFFFF' }]}>Change</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.imagePreviewContainer}>
            {isImageLoading && !(previewImageType === 'login' && (profileLoginImg === 'gradient-background' || 
                                                                  profileLoginImg === 'solid-blue-background' ||
                                                                  profileLoginImg === 'solid-purple-background' ||
                                                                  profileLoginImg === 'solid-green-background' ||
                                                                  profileLoginImg === 'solid-orange-background' ||
                                                                  profileLoginImg === 'light-silver-background' ||
                                                                  profileLoginImg === 'light-white-background' ||
                                                                  profileLoginImg === 'light-gray-background' ||
                                                                  profileLoginImg === 'light-pink-background' ||
                                                                  profileLoginImg === 'light-cyan-background' ||
                                                                  profileLoginImg === 'light-lavender-background' ||
                                                                  profileLoginImg === 'light-coral-background' ||
                                                                  profileLoginImg === 'dark-black-background' ||
                                                                  profileLoginImg === 'dark-charcoal-background')) && (
              <View style={styles.imageLoadingContainer}>
                <Image
                  source={require('../../assets/images/icon.png')}
                  style={styles.placeholderImage}
                  resizeMode="contain"
                />
                <ActivityIndicator size="large" color={businessColors.primary} style={styles.loadingSpinner} />
                <Text style={[styles.imageLoadingText, { color: businessColors.primary }]}>
                  Loading image...
                </Text>
                <Text style={[styles.imageLoadingSubtext, { color: Colors.subtext }]}>
                  This may take a few seconds
                </Text>
                <View style={styles.progressBarContainer}>
                  <Animated.View 
                    style={[
                      styles.progressBar, 
                      { 
                        backgroundColor: businessColors.primary,
                        width: progressAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        })
                      }
                    ]} 
                  />
                </View>
              </View>
            )}
            
            {imageLoadError && !(previewImageType === 'login' && (profileLoginImg === 'gradient-background' || 
                                                                  profileLoginImg === 'solid-blue-background' ||
                                                                  profileLoginImg === 'solid-purple-background' ||
                                                                  profileLoginImg === 'solid-green-background' ||
                                                                  profileLoginImg === 'solid-orange-background' ||
                                                                  profileLoginImg === 'light-silver-background' ||
                                                                  profileLoginImg === 'light-white-background' ||
                                                                  profileLoginImg === 'light-gray-background' ||
                                                                  profileLoginImg === 'light-pink-background' ||
                                                                  profileLoginImg === 'light-cyan-background' ||
                                                                  profileLoginImg === 'light-lavender-background' ||
                                                                  profileLoginImg === 'light-coral-background' ||
                                                                  profileLoginImg === 'dark-black-background' ||
                                                                  profileLoginImg === 'dark-charcoal-background')) && (
              <View style={styles.imageErrorContainer}>
                <Ionicons name="image-outline" size={48} color={Colors.subtext} />
                <Text style={[styles.imageErrorText, { color: Colors.subtext }]}>
                  Failed to load image
                </Text>
                <TouchableOpacity 
                  style={[styles.retryButton, { backgroundColor: businessColors.primary }]}
                  onPress={() => {
                    setIsImageLoading(true);
                    setImageLoadError(false);
                    progressAnimation.setValue(0);
                    Animated.timing(progressAnimation, {
                      toValue: 1,
                      duration: 15000,
                      useNativeDriver: false,
                    }).start();
                    
                    // Set new timeout for retry
                    const timeout = setTimeout(() => {
                      if (isImageLoading) {
                        setIsImageLoading(false);
                        setImageLoadError(true);
                      }
                    }, 15000);
                    
                    setImageLoadTimeout(timeout);
                  }}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <ScrollView
              contentContainerStyle={previewImageType === 'login' ? styles.loginImagePreviewScrollContent : styles.imagePreviewScrollContent}
              maximumZoomScale={1}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
              pinchGestureEnabled={false}
              style={(isImageLoading || imageLoadError) && !(previewImageType === 'login' && (profileLoginImg === 'gradient-background' || 
                                                                                              profileLoginImg === 'solid-blue-background' ||
                                                                                              profileLoginImg === 'solid-purple-background' ||
                                                                                              profileLoginImg === 'solid-green-background' ||
                                                                                              profileLoginImg === 'solid-orange-background' ||
                                                                                              profileLoginImg === 'light-silver-background' ||
                                                                                              profileLoginImg === 'light-white-background' ||
                                                                                              profileLoginImg === 'light-gray-background' ||
                                                                                              profileLoginImg === 'light-pink-background' ||
                                                                                              profileLoginImg === 'light-cyan-background' ||
                                                                                              profileLoginImg === 'light-lavender-background' ||
                                                                                              profileLoginImg === 'light-coral-background' ||
                                                                                              profileLoginImg === 'dark-black-background' ||
                                                                                              profileLoginImg === 'dark-charcoal-background')) ? styles.hiddenScrollView : undefined}
            >
              {/* Special handling for gradient background */}
              {previewImageType === 'login' && (profileLoginImg === 'gradient-background' || 
                                               profileLoginImg === 'solid-blue-background' ||
                                               profileLoginImg === 'solid-purple-background' ||
                                               profileLoginImg === 'solid-green-background' ||
                                               profileLoginImg === 'solid-orange-background' ||
                                               profileLoginImg === 'light-silver-background' ||
                                               profileLoginImg === 'light-white-background' ||
                                               profileLoginImg === 'light-gray-background' ||
                                               profileLoginImg === 'light-pink-background' ||
                                               profileLoginImg === 'light-cyan-background' ||
                                               profileLoginImg === 'light-lavender-background' ||
                                               profileLoginImg === 'light-coral-background' ||
                                               profileLoginImg === 'dark-black-background' ||
                                               profileLoginImg === 'dark-charcoal-background') ? (
                <GradientBackground 
                  style={styles.loginImagePreview}
                  backgroundType={profileLoginImg}
                />
              ) : (
                <Image
                  source={{
                    uri: previewImageType === 'page1' ? profileImageOnPage1 : 
                          previewImageType === 'page2' ? profileImageOnPage2 : 
                          previewImageType === 'page3' ? profileImageOnPage3 :
                          profileLoginImg
                  }}
                  style={previewImageType === 'login' ? styles.loginImagePreview : styles.imagePreviewImage}
                  resizeMode={previewImageType === 'login' ? "cover" : "contain"}
                  onLoadStart={() => setIsImageLoading(true)}
                  onLoad={() => {
                  setIsImageLoading(false);
                  setImageLoadError(false);
                  progressAnimation.stopAnimation();
                  // Clear timeout since image loaded successfully
                  if (imageLoadTimeout) {
                    clearTimeout(imageLoadTimeout);
                    setImageLoadTimeout(null);
                  }
                }}
                onError={() => {
                  setIsImageLoading(false);
                  setImageLoadError(true);
                  progressAnimation.stopAnimation();
                  // Clear timeout since we got an error
                  if (imageLoadTimeout) {
                    clearTimeout(imageLoadTimeout);
                    setImageLoadTimeout(null);
                  }
                }}
                />
              )}
            </ScrollView>
          </View>
          
          <View style={styles.imagePreviewFooter}>
            <Text style={styles.imagePreviewInstructions}>
              Tap "Change" to replace image
            </Text>
            {previewImageType === 'login' && (
              <Text style={styles.loginImageFormatNote}>
                📱 Login page images are displayed in (9:16 ratio)
              </Text>
            )}
          </View>
        </SafeAreaView>
      </Modal>



      {/* Image Selection Modal */}
      <ImageSelectionModal
        visible={showImageSelectionModal}
        onClose={() => {
          setShowImageSelectionModal(false);
          setCurrentImageType(null);
        }}
        onImageSelected={handleImageSelected}
        title={currentImageType === 'page1' ? 'Select Home Page Image' : 
               currentImageType === 'page2' ? 'Select Booking Page Image' : 
               currentImageType === 'page3' ? 'Select Existing Booking Image' :
               'Select Login Page Image'}
        mainCategory={currentImageType === 'page1' ? 'homePage' : 
                     currentImageType === 'page2' ? 'bookingPage' : 
                     currentImageType === 'page3' ? 'existingBooking' :
                     'loginPage'}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 8,
    paddingTop: 16,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
  headerGradient: {
    paddingBottom: 8,
  },
  adminProfileCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 20,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 6,
    alignItems: 'center',
    ...shadowStyle,
  },
  adminAvatarWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  adminAvatarRing: {
    padding: 2,
    borderRadius: 34,
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
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 8,
  },
  adminPhone: {
    fontSize: 15,
    color: Colors.subtext,
  },
  adminEmail: {
    fontSize: 14,
    color: Colors.subtext,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 0,
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
  sectionTitleNew: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginLeft: 24,
    marginBottom: 10,
    marginTop: 18,
    textAlign: 'left',
  },
  cardNew: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 18,
    padding: 18,
    ...shadowStyle,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingItem_last: {
    borderBottomWidth: 0,
  },
  settingDivider: {
    height: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.primary,
    borderStyle: 'dashed',
  },
  settingIcon: {
    marginRight: 12,
  },
  settingChevron: {
    marginLeft: 12,
  },
  settingIconRight: {
    marginLeft: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 2,
    textAlign: 'left',
  },
  settingSubtitle: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'left',
  },

  // LTR Perfect alignment styles for Business details
  settingItemLTR: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingIconLTR: {
    marginRight: 12,
  },
  settingChevronLTR: {
    marginLeft: 12,
  },
  settingContentLTR: {
    flex: 1,
    alignItems: 'flex-start',
  },
  settingTitleLTR: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 2,
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  settingSubtitleLTR: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  settingItemDisabled: {
    opacity: 0.6,
  },

  logoutButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  logoutText: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '500',
    marginLeft: 8,
  },

  versionText: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 32,
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
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
  smallModalContent: {
    padding: 20,
    backgroundColor: '#F8F9FA',
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
    paddingVertical: 16,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
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
    backgroundColor: '#F8F9FA',
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
    paddingHorizontal: 20,
    paddingTop: 16,
    flexGrow: 1,
  },
  sheetBody: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
    paddingVertical: 8,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
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
    marginVertical: 8,
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  // deleteIconText removed in favor of vector icon

  // Image Preview Modal Styles
  imagePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  imagePreviewContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  imagePreviewScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    minHeight: '100%',
    paddingTop: 30,
    paddingBottom: 100,
    paddingHorizontal: 20,
  },
  loginImagePreviewScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    minHeight: '100%',
    paddingTop: 30,
    paddingBottom: 100,
    paddingHorizontal: 20,
  },
  imagePreviewImage: {
    width: '100%',
    height: '100%',
    minHeight: 400,
    maxHeight: '85%',
  },
  loginImagePreview: {
    width: '100%',
    height: '100%',
    minHeight: 400,
    aspectRatio: 9/16, // Instagram Story ratio (vertical rectangle)
    maxHeight: '85%',
    alignSelf: 'center',
    flex: 1, // Ensure it takes full available space
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  imageLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    zIndex: 10,
  },
  imageLoadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  imageLoadingSubtext: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  progressBarContainer: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  placeholderImage: {
    width: 80,
    height: 80,
    opacity: 0.3,
    marginBottom: 16,
  },
  loadingSpinner: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -10,
    marginLeft: -10,
  },
  imageErrorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    zIndex: 10,
    paddingHorizontal: 20,
  },
  imageErrorText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  hiddenScrollView: {
    opacity: 0,
  },
  imagePreviewFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    alignItems: 'center',
  },
  imagePreviewInstructions: {
    color: 'rgba(0, 0, 0, 0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
  loginImageFormatNote: {
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
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
});