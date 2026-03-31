import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Modal, Pressable, TextInput, ActivityIndicator, Switch, Image, Platform, type LayoutChangeEvent } from 'react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { useTranslation } from 'react-i18next';
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
 
import { supabase } from '@/lib/supabase';
import { usersApi } from '@/lib/api/users';
import { normalizeAppLanguage } from '@/lib/i18nLocale';
import { notificationsApi } from '@/lib/api/notifications';
import Reanimated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

export default function ClientProfileScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, logout, updateUserProfile, notificationsEnabled, setNotificationsEnabled } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { colors: businessColors } = useBusinessColors();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [editPassword, setEditPassword] = useState<string>('');
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean>(notificationsEnabled);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  /** Same bank-app style 3D collapse on scroll as admin `settings.tsx` */
  const clientProfileScrollY = useSharedValue(0);
  const clientProfileHeaderBlockHeight = useSharedValue(120);
  const onClientProfileScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      clientProfileScrollY.value = e.contentOffset.y;
    },
  });
  const clientProfileDummySpacerStyle = useAnimatedStyle(() => ({
    height: clientProfileHeaderBlockHeight.value,
  }));
  const clientProfileCardFlipStyle = useAnimatedStyle(() => {
    const y = Math.max(clientProfileScrollY.value, 0);
    const h = Math.max(clientProfileHeaderBlockHeight.value, 72);
    return {
      transform: [
        { perspective: h * 5 },
        {
          translateY: interpolate(y, [0, h], [0, -h * 0.5], Extrapolation.CLAMP),
        },
        {
          rotateX: `${interpolate(y, [0, h], [0, 88], Extrapolation.CLAMP)}deg`,
        },
      ],
      opacity: interpolate(y, [0, h * 0.55, h], [1, 0.92, 0], Extrapolation.CLAMP),
    };
  });
  const onClientProfileHeaderLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    if (next > 0) {
      clientProfileHeaderBlockHeight.value = next;
    }
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
        Alert.alert(t('profile.permissionRequired', 'Permission Required'), t('profile.permissionGallery', 'Please allow gallery access to pick a profile picture'));
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
        Alert.alert(t('error.generic', 'Error'), t('profile.uploadFailed', 'Failed to upload image'));
        return;
      }
      const updated = await usersApi.updateUser(user.id, { image_url: uploadedUrl } as any);
      if (updated) {
        updateUserProfile({ image_url: uploadedUrl } as any);
      } else {
        Alert.alert(t('error.generic', 'Error'), t('profile.saveImageFailed', 'Failed to save profile image'));
      }
    } catch (e) {
      console.error('pick/upload avatar failed', e);
      Alert.alert(t('error.generic', 'Error'), t('profile.uploadFailed', 'Failed to upload image'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    router.replace('/(client-tabs)');
  };

  const menuItems = [
    {
      id: 'edit-profile',
      icon: 'person-outline',
      title: t('profile.menu.edit', 'Edit Profile'),
      subtitle: t('profile.menu.editSubtitle', 'Update personal details'),
      onPress: async () => {
        setEditName(user?.name ?? '');
        setEditPhone(user?.phone ?? '');
        setEditPassword('');
        setIsEditOpen(true);
        // Try to load freshest user details (email, etc.)
        try {
          if (user?.id) {
            const full = await usersApi.getUserById(user.id);
            if (full) {
              setEditName(full.name ?? '');
              setEditPhone(full.phone ?? '');
            }
          }
        } catch {}
      },
    },
    {
      id: 'notifications',
      icon: 'notifications-outline',
      title: t('notifications.title', 'Notifications'),
      subtitle: pushEnabled ? t('profile.notifications.enabled', 'Notifications enabled') : t('profile.notifications.disabled', 'Notifications disabled'),
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
      id: 'language',
      icon: 'globe-outline',
      title: t('profile.language.title', 'Language'),
      subtitle: (() => {
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
      onPress: () => setIsLanguageOpen(true),
    },
    {
      id: 'delete-account',
      icon: 'trash-outline',
      title: t('profile.delete.title', 'Delete Account'),
      subtitle: t('profile.delete.subtitle', 'Permanently delete your account'),
      onPress: async () => {
        if (!user?.id || isDeleting) return;
        Alert.alert(
          t('profile.delete.title', 'Delete Account'),
          t('profile.delete.confirm', 'Are you sure you want to delete your account? This action cannot be undone.'),
          [
            { text: t('cancel', 'Cancel'), style: 'cancel' },
            {
              text: t('profile.delete.confirmButton', 'Delete'),
              style: 'destructive',
              onPress: async () => {
                try {
                  setIsDeleting(true);
                  const ok = await usersApi.deleteUserAndAllDataById(user.id);
                  if (ok) {
                    logout();
                    router.replace('/login');
                  } else {
                    Alert.alert(t('error.generic', 'Error'), t('profile.delete.failed', 'Failed to delete account'));
                  }
                } catch (e) {
                  console.error('delete account failed', e);
                  Alert.alert(t('error.generic', 'Error'), t('profile.delete.failed', 'Failed to delete account'));
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
      title: t('profile.terms.title', 'Terms of Use'),
      subtitle: t('profile.terms.subtitle', 'View the app terms of use'),
      onPress: () => setIsTermsOpen(true),
    },
  ];

  return (
    <View style={styles.container}>

      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.contentWrapper}>
          <View style={styles.profileScrollHost}>
          <Reanimated.ScrollView
            style={styles.profileScrollFill}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={onClientProfileScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
          >
            <Reanimated.View style={clientProfileDummySpacerStyle} />

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
            <Text style={styles.logoutText}>{t('profile.logout.title', 'Log out')}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.versionText}>{t('settings.sections.version','Version')} 1.0.0</Text>
          </Reanimated.ScrollView>

          <View pointerEvents="box-none" style={styles.clientProfileStickyHost}>
            <View style={styles.clientProfileHeaderMeasure} onLayout={onClientProfileHeaderLayout}>
              <Reanimated.View style={[styles.clientProfileCardOuter, clientProfileCardFlipStyle]}>
                <View
                  style={[styles.gradientHeader, { paddingTop: 8 + insets.top, backgroundColor: Colors.white }]}
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
                      <Text style={[styles.profileName, styles.profileNameOnGradient, styles.centerText]}>{user?.name || t('valuedClient', 'Valued Client')}</Text>
                      <Text style={[styles.profilePhone, styles.profilePhoneOnGradient, styles.centerText]}>{user?.phone || t('profile.phone', 'Phone number')}</Text>
                    </View>
                  </View>
                </View>
              </Reanimated.View>
            </View>
          </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <Pressable style={styles.logoutOverlay} onPress={() => setShowLogoutModal(false)}>
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

      {/* Edit Profile Modal */}
      <Modal visible={isEditOpen} transparent animationType="slide" onRequestClose={() => setIsEditOpen(false)}>
        <KeyboardAwareScreenScroll style={styles.modalOverlay} contentContainerStyle={styles.modalOverlayContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('profile.edit.title', 'Edit Profile')}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('profile.edit.name', 'Name')}</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder={t('profile.edit.namePlaceholder', 'Full Name')}
                style={styles.textInput}
                textAlign="left"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('profile.edit.phone', 'Phone')}</Text>
              <TextInput
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder={t('profile.edit.phonePlaceholder', 'Phone Number')}
                keyboardType="phone-pad"
                style={styles.textInput}
                textAlign="left"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('profile.edit.newPassword', 'New Password')}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  value={editPassword}
                  onChangeText={setEditPassword}
                  placeholder={t('profile.edit.passwordPlaceholder', 'Leave empty if no change')}
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
                <Text style={styles.cancelBtnText}>{t('cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn, { backgroundColor: businessColors.primary }]}
                onPress={async () => {
                  if (!user?.id) {
                    setIsEditOpen(false);
                    return;
                  }
                  if (!editName.trim() || !editPhone.trim()) {
                    Alert.alert(t('error.generic','Error'), t('profile.edit.fillAll','Please fill in all fields'));
                    return;
                  }
                  try {
                    setIsSaving(true);
                    const updated = await usersApi.updateUser(user.id, {
                      name: editName.trim(),
                      phone: editPhone.trim(),
                      language: normalizeAppLanguage(i18n.language),
                      ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
                    } as any);
                    if (updated) {
                      updateUserProfile({ name: updated.name as any, phone: (updated as any).phone, language: (updated as any).language } as any);
                    } else {
                      Alert.alert(t('error.generic','Error'), t('profile.saveFailed','Failed to save profile'));
                      return;
                    }
                    setIsEditOpen(false);
                  } catch (e) {
                    console.error('Failed to save profile', e);
                    Alert.alert(t('error.generic','Error'), t('profile.saveFailed','Failed to save profile'));
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
              >
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('save', 'Save')}</Text>}
              </TouchableOpacity>
            </View>
            </View>
        </KeyboardAwareScreenScroll>
      </Modal>

      {/* Language Bottom Sheet */}
      <Modal visible={isLanguageOpen} transparent animationType="slide" onRequestClose={() => setIsLanguageOpen(false)}>
        <View style={styles.historyOverlay}>
          <View style={styles.historySheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ width: 44 }} />
              <Text style={styles.sheetTitle}>{t('profile.language.title','Language')}</Text>
              <TouchableOpacity onPress={() => setIsLanguageOpen(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <TouchableOpacity
                style={styles.languageOption}
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
                <Text style={styles.languageOptionText}>{t('profile.language.english','English')}</Text>
                {i18n.language?.startsWith('en') && <Ionicons name="checkmark" size={18} color={businessColors.primary} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.languageOption}
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
                <Text style={styles.languageOptionText}>{t('profile.language.hebrew','Hebrew')}</Text>
                {i18n.language?.startsWith('he') && <Ionicons name="checkmark" size={18} color={businessColors.primary} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.languageOption}
                onPress={async () => {
                  try {
                    await i18n.changeLanguage('ar');
                    if (user?.id) {
                      const updated = await usersApi.updateUser(user.id, { language: 'ar' } as any);
                      if (updated) updateUserProfile({ language: 'ar' } as any);
                    }
                  } finally {
                    setIsLanguageOpen(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.languageOptionText}>{t('profile.language.arabic','Arabic')}</Text>
                {i18n.language?.startsWith('ar') && <Ionicons name="checkmark" size={18} color={businessColors.primary} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.languageOption}
                onPress={async () => {
                  try {
                    await i18n.changeLanguage('ru');
                    if (user?.id) {
                      const updated = await usersApi.updateUser(user.id, { language: 'ru' } as any);
                      if (updated) updateUserProfile({ language: 'ru' } as any);
                    }
                  } finally {
                    setIsLanguageOpen(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.languageOptionText}>{t('profile.language.russian','Russian')}</Text>
                {i18n.language?.startsWith('ru') && <Ionicons name="checkmark" size={18} color={businessColors.primary} />}
              </TouchableOpacity>
              <Text style={styles.helperNote}>{t('profile.language.restartNote','Direction changes may require app restart')}</Text>
            </View>
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
              <Text style={styles.sheetTitle}>{t('profile.terms.title', 'Terms of Use')}</Text>
              <TouchableOpacity onPress={() => setIsTermsOpen(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.termsContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.intro', 'Welcome to the appointments management app. Your use of the app and related services is subject to the terms detailed in this document and constitutes full and informed consent to all its provisions.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section1.title','1. Account Creation and Identification')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section1.body',"To use the services, you may be required to provide identifying information such as name and phone number. You declare that the information provided is accurate and up to date and will update it as needed. Do not use another person's details without their permission.")}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section2.title','2. Booking and Changes')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section2.body','Booking, changes, or cancellation are done through the app subject to availability. The confirmed appointment details will be displayed in the app and sent as a notification per settings. Service times are approximate and may change due to operational constraints.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section3.title','3. Cancellations and No-Shows')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section3.body',"You may cancel or change an appointment within a reasonable time before its scheduled time. No-shows or significant delays may result in future restrictions on booking, at the business's discretion.")}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section4.title','4. Payments and Receipts')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section4.body','If payment is made through the app, it may be processed via third-party payment providers. Payment method details are not stored on our servers beyond what is necessary to complete the transaction. If payment is made at the business, it will be settled directly between you and the business.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section5.title','5. Notifications and Messaging')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section5.body','You can enable or disable notifications from the app or through device settings. Disabling notifications may affect receiving reminders and important updates.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section6.title','6. Privacy and Data Security')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section6.body','We may collect and process information necessary to operate the service, including basic identification information and appointment data. Information is stored and processed in accordance with applicable law and the privacy policy. You may contact us to review, update, or delete personal information, subject to our legal obligations.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section7.title','7. Permitted Use and Conduct')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section7.body',"Do not use the service in a way that infringes on others' rights, violates the law, or disrupts app operations. We may limit or block access in cases of misuse or violation of these terms.")}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section8.title','8. Intellectual Property')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section8.body','All rights in the app, including name, logo, designs, content, code, and images, are reserved by their owners. Do not copy, modify, distribute, or create derivative works without prior written permission.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section9.title','9. Limitation of Liability')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section9.body','The service is provided as-is and as available. We are not liable for indirect or consequential damages or loss of profits arising from use of the app. You are solely responsible for use and for content you submit.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section10.title','10. Availability and Service Changes')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section10.body','There may be interruptions, malfunctions, or maintenance work. We may update, change, or discontinue the service, in whole or in part, from time to time.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section11.title','11. Third Parties')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section11.body','The app may include links to or services from third parties, such as payment or messaging services. We are not responsible for those sites or services, and their terms will apply to your use of them.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section12.title','12. Use by Minors')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section12.body','If you are not of legal age under applicable law, app use requires consent from a parent or legal guardian.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section13.title','13. Updating the Terms')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section13.body','We may update these terms from time to time. Publishing an updated version in the app constitutes notice of change. Continued use after the update constitutes consent to the updated text.')}
              </Text>
              <Text style={styles.termsHeading}>{t('profile.terms.section14.title','14. Contact')}</Text>
              <Text style={styles.termsParagraph}>
                {t('profile.terms.section14.body','For questions, issues, or requests regarding these terms or the service, you can contact us using the business contact details shown in the app.')}
              </Text>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create<any>({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 10,
    paddingTop: 8,
  },
  profileScrollHost: {
    flex: 1,
  },
  profileScrollFill: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  clientProfileStickyHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    ...Platform.select({
      android: { elevation: 4 },
    }),
  },
  clientProfileHeaderMeasure: {
    marginBottom: 2,
  },
  clientProfileCardOuter: {
    borderRadius: 22,
    overflow: 'hidden',
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
    paddingBottom: 12,
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
    paddingTop: 14,
    paddingBottom: 12,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  profileTop: {
    alignItems: 'center',
    marginBottom: 0,
    gap: 4,
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
  languageOption: {
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
  languageOptionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
  },
  helperNote: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.subtext,
    textAlign: 'left',
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
  menuContainer: {
    paddingHorizontal: 20,
    marginTop: 8,
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