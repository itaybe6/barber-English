import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Modal, TextInput, ActivityIndicator, Switch, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { Ionicons } from '@expo/vector-icons';
import { LogOut } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { formatTime12Hour } from '@/lib/utils/timeFormat';
 
import { supabase, AvailableTimeSlot } from '@/lib/supabase';
import { usersApi } from '@/lib/api/users';
import { notificationsApi } from '@/lib/api/notifications';

export default function ClientProfileScreen() {
  const router = useRouter();
  const { user, logout, updateUserProfile, notificationsEnabled, setNotificationsEnabled } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { colors: businessColors } = useBusinessColors();
  const [isLoading, setIsLoading] = useState(true);
  const [pastAppointments, setPastAppointments] = useState<AvailableTimeSlot[]>([]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [editPassword, setEditPassword] = useState<string>('');
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean>(notificationsEnabled);
  const [isUpcomingOpen, setIsUpcomingOpen] = useState(false);
  const [upcomingAppointments, setUpcomingAppointments] = useState<AvailableTimeSlot[]>([]);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const formatTimeHHMM = (t?: string | null): string => {
    if (!t) return '';
    return formatTime12Hour(t);
  };
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

  const uploadAvatar = async (asset: { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
      let fileBody: Blob | Uint8Array;
      if (asset.base64) {
        fileBody = base64ToUint8Array(asset.base64);
      } else {
        const response = await fetch(asset.uri, { cache: 'no-store' });
        const fetched = await response.blob();
        fileBody = fetched;
        contentType = fetched.type || contentType;
      }

      const extGuess = (contentType.split('/')[1] || 'jpg').toLowerCase();
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const filePath = `${user?.id || 'anon'}/${Date.now()}_${randomId()}.${extGuess}`;
      let bucketUsed = 'avatars';
      const firstAttempt = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, { contentType, upsert: false });
      if (firstAttempt.error) {
        const msg = String((firstAttempt.error as any)?.message || '').toLowerCase();
        if (msg.includes('bucket') && msg.includes('not found')) {
          // Fallback to 'designs' bucket if 'avatars' bucket is missing
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

  const pickAndUploadAvatar = async () => {
    try {
      if (!user?.id) return;
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow gallery access to pick a profile picture');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: false,
        quality: 0.9,
        base64: true,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0] as any;
      setIsUploadingAvatar(true);
      const uploadedUrl = await uploadAvatar({ uri: a.uri, base64: a.base64 ?? null, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null });
      if (!uploadedUrl) {
        Alert.alert('Error', 'Failed to upload image');
        return;
      }
      const updated = await usersApi.updateUser(user.id, { image_url: uploadedUrl } as any);
      if (updated) {
        updateUserProfile({ image_url: uploadedUrl } as any);
      } else {
        Alert.alert('Error', 'Failed to save profile image');
      }
    } catch (e) {
      console.error('pick/upload avatar failed', e);
      Alert.alert('Error', 'Failed to upload image');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log out', 
          style: 'destructive',
          onPress: () => {
            logout();
            router.replace('/(client-tabs)');
          }
        }
      ]
    );
  };

  const menuItems = [
    {
      id: 'edit-profile',
      icon: 'person-outline',
      title: 'Edit Profile',
      subtitle: 'Update personal details',
      onPress: async () => {
        setEditName(user?.name ?? '');
        setEditPhone(user?.phone ?? '');
        setEditEmail((user as any)?.email ?? '');
        setEditPassword('');
        setIsEditOpen(true);
        // Try to load freshest user details (email, etc.)
        try {
          if (user?.id) {
            const full = await usersApi.getUserById(user.id);
            if (full) {
              setEditName(full.name ?? '');
              setEditPhone(full.phone ?? '');
              setEditEmail((full as any)?.email ?? '');
            }
          }
        } catch {}
      },
    },
    {
      id: 'notifications',
      icon: 'notifications-outline',
      title: 'Notifications',
      subtitle: pushEnabled ? 'Notifications enabled' : 'Notifications disabled',
      onPress: async () => {
        const next = !pushEnabled;
        setPushEnabled(next);
        setNotificationsEnabled(next);
        try {
          if (!user?.phone) return;
          if (next) {
            const token = await notificationsApi.requestNotificationPermissions();
            if (token) {
              await notificationsApi.registerPushToken(user.phone, token);
            }
          } else {
            await notificationsApi.clearPushToken(user.phone);
          }
        } catch {}
      },
    },
    {
      id: 'delete-account',
      icon: 'trash-outline',
      title: 'Delete Account',
      subtitle: 'Permanently delete your account',
      onPress: async () => {
        if (!user?.id || isDeleting) return;
        Alert.alert(
          'Delete Account',
          'Are you sure you want to delete your account? This action cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  setIsDeleting(true);
                  const ok = await usersApi.deleteUserAndAllDataById(user.id);
                  if (ok) {
                    logout();
                    router.replace('/login');
                  } else {
                    Alert.alert('Error', 'Failed to delete account');
                  }
                } catch (e) {
                  console.error('delete account failed', e);
                  Alert.alert('Error', 'Failed to delete account');
                } finally {
                  setIsDeleting(false);
                }
              }
            }
          ]
        );
      },
    },
    {
      id: 'terms',
      icon: 'document-text-outline',
      title: 'Terms of Use',
      subtitle: 'View the app terms of use',
      onPress: () => setIsTermsOpen(true),
    },
  ];

  useEffect(() => {
    const loadAppointments = async () => {
      try {
        setIsLoading(true);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        const { getBusinessId } = await import('@/lib/supabase');
        const businessId = getBusinessId();
        
        let query = supabase
          .from('appointments')
          .select('*')
          .eq('business_id', businessId)
          .eq('is_available', false)
          .lt('slot_date', todayStr);

        // Strictly filter by current client within current business
        if (user?.phone?.trim()) {
          query = query.eq('client_phone', user.phone.trim());
        } else if (user?.name?.trim()) {
          query = query.eq('client_name', user.name.trim());
        }

        query = query
          .order('slot_date', { ascending: false })
          .order('slot_time', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        let items: AvailableTimeSlot[] = (data || []).filter((slot) => String(slot.business_id) === String(businessId));

        setPastAppointments(items);

        // Upcoming appointments count
        let upcomingQuery = supabase
          .from('appointments')
          .select('*')
          .eq('business_id', businessId)
          .eq('is_available', false)
          .gte('slot_date', todayStr);

        // Strictly filter by current client within current business
        if (user?.phone?.trim()) {
          upcomingQuery = upcomingQuery.eq('client_phone', user.phone.trim());
        } else if (user?.name?.trim()) {
          upcomingQuery = upcomingQuery.eq('client_name', user.name.trim());
        }

        upcomingQuery = upcomingQuery
          .order('slot_date', { ascending: true })
          .order('slot_time', { ascending: true });

        const { data: upcomingData, error: upcomingError } = await upcomingQuery;
        if (upcomingError) throw upcomingError;

        let upcomingItems: AvailableTimeSlot[] = (upcomingData || []).filter((slot) => String(slot.business_id) === String(businessId));
        setUpcomingAppointments(upcomingItems);
      } catch (e) {
        console.error('Error loading past appointments:', e);
      } finally {
        setIsLoading(false);
      }
    };

    loadAppointments();
  }, [user?.name, user?.phone]);

  return (
    <View style={styles.container}>

      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.contentWrapper}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.headerContainer}>
          <View
            style={[styles.gradientHeader, { paddingTop: 16 + insets.top, backgroundColor: Colors.white }]}
          >

            <View style={styles.profileCard}>
              <View style={styles.profileTop}>
                <View style={styles.avatarWrap}>
                  <LinearGradient
                    colors={[businessColors.primary, businessColors.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarGradientRing}
                  >
                    <View style={styles.profileAvatar}>
                      {user?.image_url ? (
                        <Image source={{ uri: user.image_url }} style={styles.avatarImage} />
                      ) : (
                        <Ionicons name="person-outline" size={28} color="#2F2F2F" />
                      )}
                    </View>
                  </LinearGradient>
                  <TouchableOpacity style={styles.avatarPlusWrap} onPress={pickAndUploadAvatar} disabled={isUploadingAvatar}>
                    <LinearGradient
                      colors={[businessColors.primary, businessColors.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatarPlus}
                    >
                      {isUploadingAvatar ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Ionicons name="add" size={16} color="#FFFFFF" />
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.profileName, styles.profileNameOnGradient, styles.centerText]}>{user?.name || 'Valued Client'}</Text>
                <Text style={[styles.profilePhone, styles.profilePhoneOnGradient, styles.centerText]}>{user?.phone || 'Phone number'}</Text>
                {(user as any)?.email ? (
                  <Text style={[styles.profileEmail, styles.centerText]}>{(user as any).email}</Text>
                ) : null}
              </View>

              <View style={styles.statsRow}>
                <TouchableOpacity style={styles.statChip} onPress={() => setIsUpcomingOpen(true)}>
                  <Ionicons name="calendar-outline" size={14} color={businessColors.primary} />
                  <Text style={styles.statChipText}>Upcoming {upcomingAppointments.length}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.statChip} onPress={() => setIsHistoryOpen(true)}>
                  <Ionicons name="time-outline" size={14} color={businessColors.primary} />
                  <Text style={styles.statChipText}>Past {pastAppointments.length}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Section Header: Settings */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <Text style={styles.sectionSubtitle}>Manage profile details, notifications, and terms</Text>
        </View>

        {/* No inline history. Use the menu item to open the sheet. */}

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item) => {
            const isNotifications = item.id === 'notifications';
            return (
              <TouchableOpacity 
                key={item.id}
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={isNotifications ? 0.7 : 0.6}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: `${businessColors.primary}15` }]}>
                  <Ionicons name={item.icon as any} size={20} color={businessColors.primary} />
                </View>
                <View style={styles.menuItemContent}>
                  <View style={styles.menuItemText}>
                    <Text style={styles.menuItemTitle}>{item.title}</Text>
                    <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
                {!isNotifications && (
                  <Ionicons name="chevron-forward-outline" size={20} color={Colors.subtext} />
                )}
                {isNotifications && (
                  <Switch
                    value={pushEnabled}
                    onValueChange={async (value) => {
                      setPushEnabled(value);
                      setNotificationsEnabled(value);
                      try {
                        if (!user?.phone) return;
                        if (value) {
                          const token = await notificationsApi.requestNotificationPermissions();
                          if (token) {
                            await notificationsApi.registerPushToken(user.phone, token);
                          }
                        } else {
                          await notificationsApi.clearPushToken(user.phone);
                        }
                      } catch {}
                    }}
                    trackColor={{ false: '#E5E5EA', true: `${businessColors.primary}30` }}
                    thumbColor={pushEnabled ? businessColors.primary : Colors.card}
                    ios_backgroundColor="#E5E5EA"
                    style={styles.switch}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LinearGradient
            colors={[businessColors.primary, businessColors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoutGradient}
          >
            <LogOut size={20} color={Colors.white} />
            <Text style={styles.logoutText}>Log out</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.versionText}>Version 1.0.0</Text>
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Edit Profile Modal */}
      <Modal visible={isEditOpen} transparent animationType="slide" onRequestClose={() => setIsEditOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 12} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalOverlayContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Full Name"
                style={styles.textInput}
                textAlign="left"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Phone Number"
                keyboardType="phone-pad"
                style={styles.textInput}
                textAlign="left"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="name@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
                textAlign="left"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>New Password</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  value={editPassword}
                  onChangeText={setEditPassword}
                  placeholder="Leave empty if no change"
                  secureTextEntry={!showEditPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.textInput, { paddingRight: 44 }]}
                  textAlign="left"
                />
                <TouchableOpacity onPress={() => setShowEditPassword(v => !v)} style={styles.passwordToggle}>
                  <Ionicons name={showEditPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.subtext} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setIsEditOpen(false)} disabled={isSaving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn, { backgroundColor: businessColors.primary }]}
                onPress={async () => {
                  if (!user?.id) {
                    setIsEditOpen(false);
                    return;
                  }
                  if (!editName.trim() || !editPhone.trim()) {
                    Alert.alert('Error', 'Please fill in all fields');
                    return;
                  }
                  try {
                    setIsSaving(true);
                    const updated = await usersApi.updateUser(user.id, {
                      name: editName.trim(),
                      phone: editPhone.trim(),
                      email: (editEmail || '').trim() ? (editEmail || '').trim() : (null as any),
                      ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
                    } as any);
                    if (updated) {
                      updateUserProfile({ name: updated.name as any, phone: (updated as any).phone, email: (updated as any).email } as any);
                    } else {
                      Alert.alert('Error', 'Failed to save profile');
                      return;
                    }
                    setIsEditOpen(false);
                  } catch (e) {
                    console.error('Failed to save profile', e);
                    Alert.alert('Error', 'Failed to save profile');
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
              >
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* History Bottom Sheet */}
      <Modal visible={isHistoryOpen} transparent animationType="slide" onRequestClose={() => setIsHistoryOpen(false)}>
        <View style={styles.historyOverlay}>
          <View style={styles.historySheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ width: 44 }} />
              <Text style={styles.sheetTitle}>Appointment History</Text>
              <TouchableOpacity onPress={() => setIsHistoryOpen(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={true}>
              {isLoading ? (
                <View style={styles.historyLoadingState}>
                  <ActivityIndicator color={businessColors.primary} />
                  <Text style={styles.historyLoadingText}>Loading appointment history...</Text>
                </View>
              ) : pastAppointments.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <Ionicons name="calendar-outline" size={56} color={businessColors.primary} />
                  <Text style={styles.historyEmptyTitle}>No past appointments</Text>
                  <Text style={styles.historyEmptySubtitle}>When there's history, it'll appear here</Text>
                </View>
              ) : (
                pastAppointments.map((item) => (
                  <View key={`${item.id}-${item.slot_date}-${item.slot_time}`} style={styles.historyCard}>
                    <View style={styles.historyCardHeader}>
                      <Text style={styles.historyService}>{item.service_name || 'Service'}</Text>
                      <View style={styles.statusPill}>
                        <Ionicons name="checkmark-circle" size={16} color={businessColors.primary} />
                        <Text style={styles.statusPillText}>Completed</Text>
                      </View>
                    </View>
                    <View style={styles.historyCardBody}>
                      <View style={styles.historyMeta}>
                        <Ionicons name="calendar" size={16} color={businessColors.primary} />
                        <Text style={styles.historyMetaText}>{new Date(item.slot_date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Text>
                      </View>
                      <View style={styles.historyMeta}>
                        <Ionicons name="time" size={16} color="#8E8E93" />
                        <Text style={styles.historyMetaText}>{formatTimeHHMM(item.slot_time)}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Terms of Use Bottom Sheet */}
      <Modal visible={isTermsOpen} transparent animationType="slide" onRequestClose={() => setIsTermsOpen(false)}>
        <View style={styles.historyOverlay}>
          <View style={styles.historySheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ width: 44 }} />
              <Text style={styles.sheetTitle}>Terms of Use</Text>
              <TouchableOpacity onPress={() => setIsTermsOpen(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.termsContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.termsParagraph}>
                Welcome to the appointments management app. Your use of the app and related services is subject to the terms detailed in this document and constitutes full and informed consent to all its provisions.
              </Text>
              <Text style={styles.termsHeading}>1. Account Creation and Identification</Text>
              <Text style={styles.termsParagraph}>
                To use the services, you may be required to provide identifying information such as name and phone number. You declare that the information provided is accurate and up to date and will update it as needed. Do not use another person's details without their permission.
              </Text>
              <Text style={styles.termsHeading}>2. Booking and Changes</Text>
              <Text style={styles.termsParagraph}>
                Booking, changes, or cancellation are done through the app subject to availability. The confirmed appointment details will be displayed in the app and sent as a notification per settings. Service times are approximate and may change due to operational constraints.
              </Text>
              <Text style={styles.termsHeading}>3. Cancellations and No-Shows</Text>
              <Text style={styles.termsParagraph}>
                You may cancel or change an appointment within a reasonable time before its scheduled time. No-shows or significant delays may result in future restrictions on booking, at the business's discretion.
              </Text>
              <Text style={styles.termsHeading}>4. Payments and Receipts</Text>
              <Text style={styles.termsParagraph}>
                If payment is made through the app, it may be processed via third-party payment providers. Payment method details are not stored on our servers beyond what is necessary to complete the transaction. If payment is made at the business, it will be settled directly between you and the business.
              </Text>
              <Text style={styles.termsHeading}>5. Notifications and Messaging</Text>
              <Text style={styles.termsParagraph}>
                You can enable or disable notifications from the app or through device settings. Disabling notifications may affect receiving reminders and important updates.
              </Text>
              <Text style={styles.termsHeading}>6. Privacy and Data Security</Text>
              <Text style={styles.termsParagraph}>
                We may collect and process information necessary to operate the service, including basic identification information and appointment data. Information is stored and processed in accordance with applicable law and the privacy policy. You may contact us to review, update, or delete personal information, subject to our legal obligations.
              </Text>
              <Text style={styles.termsHeading}>7. Permitted Use and Conduct</Text>
              <Text style={styles.termsParagraph}>
                Do not use the service in a way that infringes on others' rights, violates the law, or disrupts app operations. We may limit or block access in cases of misuse or violation of these terms.
              </Text>
              <Text style={styles.termsHeading}>8. Intellectual Property</Text>
              <Text style={styles.termsParagraph}>
                All rights in the app, including name, logo, designs, content, code, and images, are reserved by their owners. Do not copy, modify, distribute, or create derivative works without prior written permission.
              </Text>
              <Text style={styles.termsHeading}>9. Limitation of Liability</Text>
              <Text style={styles.termsParagraph}>
                The service is provided as-is and as available. We are not liable for indirect or consequential damages or loss of profits arising from use of the app. You are solely responsible for use and for content you submit.
              </Text>
              <Text style={styles.termsHeading}>10. Availability and Service Changes</Text>
              <Text style={styles.termsParagraph}>
                There may be interruptions, malfunctions, or maintenance work. We may update, change, or discontinue the service, in whole or in part, from time to time.
              </Text>
              <Text style={styles.termsHeading}>11. Third Parties</Text>
              <Text style={styles.termsParagraph}>
                The app may include links to or services from third parties, such as payment or messaging services. We are not responsible for those sites or services, and their terms will apply to your use of them.
              </Text>
              <Text style={styles.termsHeading}>12. Use by Minors</Text>
              <Text style={styles.termsParagraph}>
                If you are not of legal age under applicable law, app use requires consent from a parent or legal guardian.
              </Text>
              <Text style={styles.termsHeading}>13. Updating the Terms</Text>
              <Text style={styles.termsParagraph}>
                We may update these terms from time to time. Publishing an updated version in the app constitutes notice of change. Continued use after the update constitutes consent to the updated text.
              </Text>
              <Text style={styles.termsHeading}>14. Contact</Text>
              <Text style={styles.termsParagraph}>
                For questions, issues, or requests regarding these terms or the service, you can contact us using the business contact details shown in the app.
              </Text>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Upcoming Appointments Bottom Sheet */}
      <Modal visible={isUpcomingOpen} transparent animationType="slide" onRequestClose={() => setIsUpcomingOpen(false)}>
        <View style={styles.historyOverlay}>
          <View style={styles.historySheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ width: 44 }} />
              <Text style={styles.sheetTitle}>Upcoming Appointments</Text>
              <TouchableOpacity onPress={() => setIsUpcomingOpen(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={true}>
              {isLoading ? (
                <View style={styles.historyLoadingState}>
                  <ActivityIndicator color={businessColors.primary} />
                  <Text style={styles.historyLoadingText}>Loading upcoming appointments...</Text>
                </View>
              ) : upcomingAppointments.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <Ionicons name="calendar-outline" size={56} color={businessColors.primary} />
                  <Text style={styles.historyEmptyTitle}>No upcoming appointments</Text>
                  <Text style={styles.historyEmptySubtitle}>When appointments are booked, they will appear here</Text>
                </View>
              ) : (
                upcomingAppointments.map((item) => (
                  <View key={`${item.id}-${item.slot_date}-${item.slot_time}`} style={styles.historyCard}>
                    <View style={styles.historyCardHeader}>
                      <Text style={styles.historyService}>{item.service_name || 'שירות'}</Text>
                      <View style={[styles.statusPill, { backgroundColor: `${businessColors.primary}20` }]}>
                        <Ionicons name="calendar" size={16} color={businessColors.primary} />
                        <Text style={[styles.statusPillText, { color: businessColors.primary }]}>Upcoming</Text>
                      </View>
                    </View>
                    <View style={styles.historyCardBody}>
                      <View style={styles.historyMeta}>
                        <Ionicons name="calendar" size={16} color={businessColors.primary} />
                        <Text style={styles.historyMetaText}>{new Date(item.slot_date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Text>
                      </View>
                      <View style={styles.historyMeta}>
                        <Ionicons name="time" size={16} color="#8E8E93" />
                        <Text style={styles.historyMetaText}>{formatTimeHHMM(item.slot_time)}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerContainer: {
    backgroundColor: 'transparent',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  headerDecor1: { },
  headerDecor2: { },
  gradientHeader: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 0,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 20,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  profileTop: {
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  centerText: {
    textAlign: 'center',
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  avatarGradientRing: {
    padding: 2,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 0,
  },
  avatarPlusWrap: {
    position: 'absolute',
    bottom: 2,
    left: 2,
  },
  avatarPlus: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  profileAvatarInitial: {
    color: '#2F2F2F',
    fontSize: 22,
    fontWeight: '800',
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.white,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 6,
    alignItems: 'flex-start',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  profileNameOnGradient: {
    color: Colors.text,
  },
  profilePhone: {
    fontSize: 16,
    color: Colors.text,
    opacity: 0.7,
    marginBottom: 8,
  },
  profilePhoneOnGradient: {
    color: Colors.text,
    opacity: 0.7,
    marginBottom: 0,
  },
  profileEmail: {
    fontSize: 14,
    color: Colors.subtext,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loyaltyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  loyaltyText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },

  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 20,
  },
  modalOverlayContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: Colors.subtext,
    marginBottom: 6,
    textAlign: 'left',
  },
  inputWrapper: {
    position: 'relative',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: Colors.text,
  },
  passwordToggle: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#F2F2F7',
  },
  cancelBtnText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  // History sheet styles
  historyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  historySheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginTop: 8,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  sheetCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  historyLoadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  historyLoadingText: {
    marginTop: 8,
    color: Colors.subtext,
  },
  historyEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  historyEmptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  historyEmptySubtitle: {
    fontSize: 14,
    color: Colors.subtext,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyService: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusPillText: {
    color: '#34C759',
    fontSize: 13,
    fontWeight: '700',
  },
  historyCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
  },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyMetaText: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  termsContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  termsHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'left',
  },
  termsParagraph: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
    textAlign: 'left',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: -10,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statChipText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.subtext,
    textAlign: 'center',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  quickAction: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500',
    textAlign: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'left',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.subtext,
    opacity: 0.8,
    textAlign: 'left',
  },
  menuContainer: {
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    alignItems: 'flex-start',
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 12,
    color: Colors.subtext,
  },
  switch: {
    transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }],
  },
  logoutButton: {
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 16,
    alignSelf: 'stretch',
    marginBottom: 24,
    overflow: 'hidden',
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 16,
  },
  logoutText: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '500',
    marginLeft: 8,
  },
  versionText: {
    fontSize: 12,
    color: Colors.subtext,
    textAlign: 'center',
    marginBottom: 8,
  },
});