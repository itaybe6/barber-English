import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Modal, Pressable, TextInput, ActivityIndicator, Image, Platform, I18nManager, type LayoutChangeEvent } from 'react-native';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { Ionicons } from '@expo/vector-icons';
import { ChevronLeft, FileText, Globe, LogOut, Trash2, User } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { BrandLavaLampBackground } from '@/src/components/lava-lamp-background-animation';
 
import { supabase } from '@/lib/supabase';
import { usersApi } from '@/lib/api/users';
import { normalizeAppLanguage, isRtlLanguage } from '@/lib/i18nLocale';

const PROFILE_GROUPED_BG = '#F2F2F7';

export default function ClientProfileScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, logout, updateUserProfile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { colors: businessColors } = useBusinessColors();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [profileLavaLayout, setProfileLavaLayout] = useState({ w: 0, h: 0 });
  const onProfileLavaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setProfileLavaLayout((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    }
  }, []);

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

  const isRtl = I18nManager.isRTL;
  const isRtlInput = isRtlLanguage(i18n.language);

  const openEditProfile = useCallback(async () => {
    setEditName(user?.name ?? '');
    setEditPhone(user?.phone ?? '');
    setIsEditOpen(true);
    try {
      if (user?.id) {
        const full = await usersApi.getUserById(user.id);
        if (full) {
          setEditName(full.name ?? '');
          setEditPhone(full.phone ?? '');
        }
      }
    } catch {}
  }, [user?.id, user?.name, user?.phone]);

  const confirmDeleteAccount = useCallback(async () => {
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
          },
        },
      ],
    );
  }, [isDeleting, logout, router, t, user?.id]);

  const renderSettingsRow = (
    icon: React.ReactNode,
    title: string,
    subtitle?: string,
    onPress?: () => void,
    danger?: boolean,
    hideChevron?: boolean,
  ) => {
    const chevron = hideChevron ? null : (
      <View style={[styles.settingChevron, isRtl ? styles.settingChevronRtl : styles.settingChevronLtr]}>
        <ChevronLeft size={18} color={danger ? 'rgba(60,60,67,0.35)' : businessColors.primary} />
      </View>
    );
    const content = (
      <View style={[styles.settingContent, isRtl ? styles.settingContentRtl : styles.settingContentLtr]}>
        <Text
          style={[styles.settingTitle, danger ? styles.settingTitleDanger : null, isRtl ? styles.settingTitleRtl : styles.settingTitleLtr]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.settingSubtitle, isRtl ? styles.settingSubtitleRtl : styles.settingSubtitleLtr]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
    return (
      <TouchableOpacity
        style={[
          styles.settingRow,
          isRtl ? styles.settingRowRtl : styles.settingRowLtr,
          danger ? styles.settingRowDanger : null,
        ]}
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.82}
      >
        {isRtl ? (
          <>
            {chevron}
            {content}
            <View style={styles.settingIcon}>{icon}</View>
          </>
        ) : (
          <>
            <View style={styles.settingIcon}>{icon}</View>
            {content}
            {chevron}
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.pageRoot} edges={['left', 'right']}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={false}
        bounces={false}
      >
        <View style={styles.profileHeaderRoot}>
          <View style={styles.profileHeaderColumn}>
            <View style={styles.profileHeaderBackdrop} onLayout={onProfileLavaLayout} pointerEvents="none">
              <LinearGradient
                colors={[businessColors.primary, `${businessColors.primary}CC`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1.1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {profileLavaLayout.w > 0 && profileLavaLayout.h > 0 ? (
                <BrandLavaLampBackground
                  primaryColor={businessColors.primary}
                  baseColor={businessColors.primary}
                  layoutWidth={profileLavaLayout.w}
                  layoutHeight={profileLavaLayout.h}
                  emphasis="bold"
                  count={6}
                  duration={10000}
                  blurIntensity={28}
                />
              ) : null}
            </View>

            <View style={[styles.profileHeaderContent, { paddingTop: insets.top + 12 }]}>
              <View style={styles.profileHeaderRowSlot}>
                <View style={[styles.profileHeaderRow, isRtl ? styles.profileHeaderRowRtl : styles.profileHeaderRowLtr]}>
                  <View style={styles.avatarWrap}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.14)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatarGradientRing}
                    >
                      <View style={styles.profileAvatar}>
                        {user?.image_url ? (
                          <Image source={{ uri: user.image_url }} style={styles.avatarImage} />
                        ) : (
                          <User size={32} color={Colors.subtext} strokeWidth={1.75} />
                        )}
                      </View>
                    </LinearGradient>
                    <TouchableOpacity
                      style={[styles.avatarPlusWrap, isRtl ? styles.avatarPlusWrapRtl : styles.avatarPlusWrapLtr]}
                      onPress={pickAndUploadAvatar}
                      disabled={isUploadingAvatar}
                      activeOpacity={0.9}
                    >
                      <View style={[styles.avatarPlus, { backgroundColor: businessColors.primary }]}>
                        {isUploadingAvatar ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Ionicons name="camera" size={14} color="#FFFFFF" />
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.profileHeaderInfo, isRtl ? styles.profileHeaderInfoRtl : styles.profileHeaderInfoLtr]}>
                    <Text style={[styles.profileNameNew, isRtl ? styles.profileHeaderTextRtl : styles.profileHeaderTextLtr]} numberOfLines={1}>
                      {user?.name || t('valuedClient', 'Valued Client')}
                    </Text>
                    <Text style={[styles.profilePhoneNew, isRtl ? styles.profileHeaderTextRtl : styles.profileHeaderTextLtr]} numberOfLines={1}>
                      {user?.phone || t('profile.phone', 'Phone number')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.groupedBody}>
          <View style={styles.cardNew}>
            {renderSettingsRow(
              <User size={20} color={businessColors.primary} />,
              t('profile.menu.edit', 'Edit Profile'),
              t('profile.menu.editSubtitle', 'Update personal details'),
              openEditProfile,
            )}
            <View style={[styles.settingDivider, isRtl ? styles.settingDividerRtl : styles.settingDividerLtr]} />

            {renderSettingsRow(
              <Globe size={20} color={businessColors.primary} />,
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
              () => setIsLanguageOpen(true),
            )}
            <View style={[styles.settingDivider, isRtl ? styles.settingDividerRtl : styles.settingDividerLtr]} />

            {renderSettingsRow(
              <FileText size={20} color={businessColors.primary} />,
              t('profile.terms.title', 'Terms of Use'),
              t('profile.terms.subtitle', 'View the app terms of use'),
              () => setIsTermsOpen(true),
            )}
            <View style={[styles.settingDivider, isRtl ? styles.settingDividerRtl : styles.settingDividerLtr]} />

            {renderSettingsRow(
              <Trash2 size={20} color="#FF3B30" />,
              t('profile.delete.title', 'Delete Account'),
              t('profile.delete.subtitle', 'Permanently delete your account'),
              confirmDeleteAccount,
              true,
            )}
            <View style={[styles.settingDivider, isRtl ? styles.settingDividerRtl : styles.settingDividerLtr]} />

            {renderSettingsRow(
              <LogOut size={20} color="#FF3B30" />,
              t('profile.logout.title', 'Log out'),
              t('profile.logout.subtitle', 'ניתן להתחבר שוב בכל זמן'),
              handleLogout,
              true,
              true,
            )}
          </View>

        </View>
      </ScrollView>

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
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdropPressable} onPress={() => setIsEditOpen(false)} />
          <KeyboardAwareScreenScroll
            style={styles.modalOverlayScroll}
            contentContainerStyle={styles.modalOverlayContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.editSheet}>
              <View style={styles.editSheetHandle} />

              <View style={styles.editSheetHeader}>
                <View style={{ width: 44 }} />
                <Text style={styles.editSheetTitle}>{t('profile.edit.title', 'Edit Profile')}</Text>
                <TouchableOpacity
                  onPress={() => setIsEditOpen(false)}
                  style={styles.editSheetCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('close', 'Close')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.82}
                >
                  <Ionicons name="close" size={22} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.editSheetBody}>
                <View style={styles.fieldCard}>
                  <Text style={[styles.fieldLabel, isRtl ? styles.fieldLabelRtl : styles.fieldLabelLtr]}>
                    {t('profile.edit.name', 'Name')}
                  </Text>
                  <View style={[styles.fieldRow, isRtl ? styles.fieldRowRtl : styles.fieldRowLtr]}>
                    <View style={[styles.fieldIconWrap, { backgroundColor: `${businessColors.primary}12` }]}>
                      <Ionicons name="person-outline" size={18} color={businessColors.primary} />
                    </View>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      placeholder={t('profile.edit.namePlaceholder', 'Full Name')}
                      placeholderTextColor="#9CA3AF"
                      style={[
                        styles.fieldInput,
                        isRtl ? styles.fieldInputRtl : styles.fieldInputLtr,
                        { textAlign: isRtlInput ? 'right' : 'left', writingDirection: isRtlInput ? 'rtl' : 'ltr' },
                      ]}
                      autoCorrect={false}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>
                </View>

                <View style={styles.fieldCard}>
                  <Text style={[styles.fieldLabel, isRtl ? styles.fieldLabelRtl : styles.fieldLabelLtr]}>
                    {t('profile.edit.phone', 'Phone')}
                  </Text>
                  <View style={[styles.fieldRow, isRtl ? styles.fieldRowRtl : styles.fieldRowLtr]}>
                    <View style={[styles.fieldIconWrap, { backgroundColor: `${businessColors.primary}12` }]}>
                      <Ionicons name="call-outline" size={18} color={businessColors.primary} />
                    </View>
                    <TextInput
                      value={editPhone}
                      onChangeText={setEditPhone}
                      placeholder={t('profile.edit.phonePlaceholder', 'Phone Number')}
                      placeholderTextColor="#9CA3AF"
                      keyboardType="phone-pad"
                      style={[
                        styles.fieldInput,
                        isRtl ? styles.fieldInputRtl : styles.fieldInputLtr,
                        { textAlign: isRtlInput ? 'right' : 'left', writingDirection: 'ltr' },
                      ]}
                      autoCorrect={false}
                      autoCapitalize="none"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.editSheetFooter}>
                <TouchableOpacity
                  style={[styles.footerBtn, styles.footerBtnSecondary]}
                  onPress={() => setIsEditOpen(false)}
                  disabled={isSaving}
                  activeOpacity={0.82}
                >
                  <Text style={styles.footerBtnSecondaryText}>{t('cancel', 'Cancel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.footerBtn, { overflow: 'hidden' }, isSaving ? styles.footerBtnDisabled : null]}
                  onPress={async () => {
                    if (!user?.id) {
                      setIsEditOpen(false);
                      return;
                    }
                    if (!editName.trim() || !editPhone.trim()) {
                      Alert.alert(t('error.generic', 'Error'), t('profile.edit.fillAll', 'Please fill in all fields'));
                      return;
                    }
                    try {
                      setIsSaving(true);
                      const updated = await usersApi.updateUser(user.id, {
                        name: editName.trim(),
                        phone: editPhone.trim(),
                        language: normalizeAppLanguage(i18n.language),
                      } as any);
                      if (updated) {
                        updateUserProfile({
                          name: updated.name as any,
                          phone: (updated as any).phone,
                          language: (updated as any).language,
                        } as any);
                      } else {
                        Alert.alert(t('error.generic', 'Error'), t('profile.saveFailed', 'Failed to save profile'));
                        return;
                      }
                      setIsEditOpen(false);
                    } catch (e) {
                      console.error('Failed to save profile', e);
                      Alert.alert(t('error.generic', 'Error'), t('profile.saveFailed', 'Failed to save profile'));
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={[businessColors.primary, `${businessColors.primary}CC`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.footerBtnPrimaryGradient}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.footerBtnPrimaryText}>{t('save', 'Save')}</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAwareScreenScroll>
        </View>
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
                <Text style={styles.languageOptionText}>{t('profile.language.arabic', 'Arabic')}</Text>
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
                <Text style={styles.languageOptionText}>{t('profile.language.russian', 'Russian')}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create<any>({
  pageRoot: {
    flex: 1,
    backgroundColor: PROFILE_GROUPED_BG,
  },
  scroll: {
    flex: 1,
    backgroundColor: PROFILE_GROUPED_BG,
  },
  profileHeaderRoot: {
    width: '100%',
  },
  profileHeaderColumn: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  profileHeaderBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  profileHeaderContent: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 18,
    position: 'relative',
    zIndex: 1,
  },
  profileHeaderRowSlot: {
    position: 'relative',
    width: '100%',
  },
  profileEditIconHit: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEditIconHitRtl: {
    left: 14,
  },
  profileEditIconHitLtr: {
    right: 14,
  },
  profileEditIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 16,
  },
  profileHeaderRowLtr: {
    flexDirection: 'row',
  },
  profileHeaderRowRtl: {
    flexDirection: 'row-reverse',
  },
  profileHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  profileHeaderInfoLtr: {
    alignItems: 'flex-start',
  },
  profileHeaderInfoRtl: {
    alignItems: 'flex-end',
  },
  profileHeaderTextLtr: {
    textAlign: 'left',
  },
  profileHeaderTextRtl: {
    textAlign: 'right',
  },
  profileNameNew: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  profilePhoneNew: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 1,
  },
  groupedBody: {
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: PROFILE_GROUPED_BG,
    flexGrow: 1,
  },
  sectionTitleNew: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    marginBottom: 7,
    marginTop: 14,
  },
  sectionTitleNewLtr: {
    textAlign: 'left',
    paddingLeft: 20,
    paddingRight: 0,
  },
  sectionTitleNewRtl: {
    textAlign: 'right',
    paddingRight: 20,
    paddingLeft: 0,
  },
  cardNew: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.14)',
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
  settingRow: {
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.white,
  },
  settingRowLtr: {
    flexDirection: 'row',
  },
  settingRowRtl: {
    flexDirection: 'row',
  },
  settingRowDanger: {
    backgroundColor: Colors.white,
  },
  settingIcon: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    paddingHorizontal: 10,
  },
  settingContentLtr: {
    alignItems: 'flex-start',
  },
  settingContentRtl: {
    alignItems: 'flex-end',
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  settingTitleLtr: {
    textAlign: 'left',
  },
  settingTitleRtl: {
    textAlign: 'right',
  },
  settingTitleDanger: {
    color: '#FF3B30',
  },
  settingSubtitle: {
    fontSize: 12,
    color: Colors.subtext,
    marginTop: 3,
  },
  settingSubtitleLtr: {
    textAlign: 'left',
  },
  settingSubtitleRtl: {
    textAlign: 'right',
  },
  settingChevron: {
    width: 28,
    justifyContent: 'center',
  },
  settingChevronLtr: {
    alignItems: 'flex-end',
  },
  settingChevronRtl: {
    alignItems: 'flex-start',
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60,60,67,0.14)',
  },
  settingDividerLtr: {
    marginLeft: 58,
  },
  settingDividerRtl: {
    marginRight: 58,
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
  },
  avatarPlusWrapLtr: {
    left: 2,
  },
  avatarPlusWrapRtl: {
    right: 2,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 20,
  },
  modalBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalOverlayScroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalOverlayContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSheet: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: { elevation: 10 },
    }),
  },
  editSheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(60,60,67,0.18)',
    marginTop: 2,
    marginBottom: 10,
  },
  editSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  editSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  editSheetCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(60,60,67,0.06)',
  },
  editSheetBody: {
    paddingTop: 8,
    gap: 12,
  },
  fieldCard: {
    backgroundColor: '#F6F7FB',
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.10)',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(60,60,67,0.72)',
    marginBottom: 8,
  },
  fieldLabelLtr: {
    textAlign: 'left',
  },
  fieldLabelRtl: {
    textAlign: 'right',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  fieldRowLtr: {
    flexDirection: 'row',
  },
  fieldRowRtl: {
    flexDirection: 'row-reverse',
  },
  fieldIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    paddingVertical: 8,
    textAlignVertical: 'center',
  },
  fieldInputLtr: {
    paddingLeft: 0,
    paddingRight: 6,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  fieldInputRtl: {
    paddingRight: 0,
    paddingLeft: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  editSheetFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  footerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: {
    backgroundColor: 'rgba(60,60,67,0.08)',
  },
  footerBtnSecondaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  footerBtnPrimaryGradient: {
    width: '100%',
    minHeight: 48,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  footerBtnPrimaryText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  footerBtnDisabled: {
    opacity: 0.7,
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
  // (Client profile now uses grouped settings rows; legacy menu styles intentionally kept elsewhere if needed.)
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

  // versionText removed (no version label on client profile)
});