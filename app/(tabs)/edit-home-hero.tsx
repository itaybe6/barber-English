import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Alert, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';

import Colors from '@/constants/colors';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { supabase } from '@/lib/supabase';
import { compressImages } from '@/lib/utils/imageCompression';
import { useAuthStore } from '@/stores/authStore';

type HeroImage = { url: string };

const BUCKET = 'app_design';

function sanitizeUrlArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0);
}

function guessMimeFromUri(uriOrName: string): string {
  const ext = (uriOrName.split('.').pop() || '').toLowerCase().split('?')[0];
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function uploadImageToStorage(params: { uri: string; contentType?: string | null }): Promise<string | null> {
  try {
    const response = await fetch(params.uri, { cache: 'no-store' });
    const arrayBuffer = await response.arrayBuffer();
    const fileBody = new Uint8Array(arrayBuffer);
    const contentType = response.headers.get('content-type') || params.contentType || guessMimeFromUri(params.uri);

    const extGuess = (contentType.split('/')[1] || 'jpg').toLowerCase().split(';')[0];
    const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const filePath = `business-images/home-hero/${Date.now()}_${randomId()}.${extGuess}`;

    const { error } = await supabase.storage.from(BUCKET).upload(filePath, fileBody as any, {
      contentType,
      upsert: false,
    });
    if (error) {
      console.error('home hero upload error', error);
      return null;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  } catch (e) {
    console.error('home hero upload exception', e);
    return null;
  }
}

export default function EditHomeHeroScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const items: HeroImage[] = useMemo(() => images.map((url) => ({ url })), [images]);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const p = await businessProfileApi.getProfile();
      const list = sanitizeUrlArray((p as any)?.home_hero_images);
      setImages(list);
    } catch (e) {
      setImages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const save = useCallback(
    async (next: string[]) => {
      try {
        setIsSaving(true);
        const updated = await businessProfileApi.upsertProfile({ home_hero_images: next } as any);
        if (!updated) {
          Alert.alert(t('error.generic', 'Error'), t('settings.profile.imageSaveFailed', 'Failed to save image'));
          return false;
        }
        setImages(sanitizeUrlArray((updated as any)?.home_hero_images));
        return true;
      } catch (e) {
        Alert.alert(t('error.generic', 'Error'), t('settings.profile.imageSaveFailed', 'Failed to save image'));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (!isAdmin) {
      // Soft-gate: show a message and navigate back
      Alert.alert(t('error.generic', 'Error'), t('auth.adminOnly', 'Admins only'));
      router.back();
      return;
    }
    load();
  }, [isAdmin, load, router, t]);

  const pickAndUpload = useCallback(async () => {
    if (isUploading || isSaving) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permission.required', 'Permission Required'), t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: 20,
        quality: 1.0,
        base64: false,
      });
      if (result.canceled || !result.assets?.length) return;

      setIsUploading(true);

      const originalUris = result.assets.map((a: any) => a.uri).filter(Boolean);
      const compressed = await compressImages(originalUris, {
        quality: 0.7,
        maxWidth: 1200,
        maxHeight: 1200,
        format: 'jpeg',
      });

      const uploadedUrls: string[] = [];
      for (let i = 0; i < compressed.length; i++) {
        const uri = compressed[i]?.uri;
        if (!uri) continue;
        const url = await uploadImageToStorage({ uri, contentType: 'image/jpeg' });
        if (!url) {
          Alert.alert(t('error.generic', 'Error'), t('admin.gallery.uploadIndexFailed', 'Failed to upload image {{num}}', { num: i + 1 }));
          return;
        }
        uploadedUrls.push(url);
      }

      if (uploadedUrls.length === 0) return;
      const next = [...images, ...uploadedUrls];
      const ok = await save(next);
      if (ok) {
        Alert.alert(t('success.generic', 'Success'), t('settings.profile.imageSaveSuccess', 'Image saved successfully'));
      }
    } catch (e) {
      console.error('pickAndUpload home hero failed', e);
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.uploadFailed', 'Failed to upload image'));
    } finally {
      setIsUploading(false);
    }
  }, [images, isSaving, isUploading, save, t]);

  const removeAt = useCallback(
    async (index: number) => {
      const next = images.filter((_, i) => i !== index);
      await save(next);
    },
    [images, save]
  );

  const moveToFront = useCallback(
    async (index: number) => {
      if (index <= 0) return;
      const next = [...images];
      const [picked] = next.splice(index, 1);
      next.unshift(picked);
      await save(next);
    },
    [images, save]
  );

  const resetToDefault = useCallback(async () => {
    if (isSaving || isUploading) return;
    Alert.alert(
      t('settings.reset', 'Reset'),
      t('settings.profile.resetHeroConfirm', 'Reset hero images to the default ones?'),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('confirm', 'Confirm'),
          style: 'destructive',
          onPress: async () => {
            await save([]);
          },
        },
      ]
    );
  }, [isSaving, isUploading, save, t]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-forward" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('settings.profile.homeHeroTitle', 'Home hero images')}</Text>
          <TouchableOpacity onPress={pickAndUpload} activeOpacity={0.8} disabled={isUploading || isSaving}>
            {isUploading ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Ionicons name="add" size={26} color={Colors.text} />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.contentWrapper}>
          <View style={[styles.actionsRow, { paddingBottom: 8 }]}>
            <TouchableOpacity
              onPress={pickAndUpload}
              activeOpacity={0.85}
              disabled={isUploading || isSaving}
              style={[styles.actionButton, (isUploading || isSaving) && { opacity: 0.5 }]}
            >
              <Ionicons name="images-outline" size={18} color="#1d1d1f" />
              <Text style={styles.actionButtonText}>{t('admin.gallery.selectImages', 'Select Images')}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{images.length}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={resetToDefault}
              activeOpacity={0.85}
              disabled={isUploading || isSaving}
              style={[styles.resetButton, (isUploading || isSaving) && { opacity: 0.5 }]}
            >
              <Ionicons name="refresh" size={18} color="#EF4444" />
              <Text style={styles.resetText}>{t('settings.profile.resetToDefault', 'Reset to default')}</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.loadingText}>{t('loading', 'Loading...')}</Text>
            </View>
          ) : images.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="image-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>{t('settings.profile.heroEmptyTitle', 'No hero images')}</Text>
              <Text style={styles.emptySubtitle}>
                {t('settings.profile.heroEmptySubtitle', 'Add images to show them in the top animation. If you keep this empty, the default images will be shown.')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item, idx) => `${item.url}-${idx}`}
              numColumns={3}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 12, paddingTop: 10 }}
              renderItem={({ item, index }) => (
                <View style={styles.tile}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => moveToFront(index)}
                    style={styles.imageContainer}
                    disabled={isSaving || isUploading}
                  >
                    <Image source={{ uri: item.url }} style={styles.image} resizeMode="cover" />
                    {index === 0 && (
                      <View style={styles.firstBadge}>
                        <Ionicons name="star" size={12} color="#fff" />
                        <Text style={styles.firstBadgeText}>{t('settings.profile.first', 'First')}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => removeAt(index)}
                      style={styles.deletePill}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      disabled={isSaving || isUploading}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              )}
              ListFooterComponent={() => (
                <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                  <Text style={styles.hint}>
                    {t('settings.profile.heroHint', 'Tip: tap an image to move it to the first position.')}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    fontWeight: '700',
    color: Colors.text,
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 12,
    paddingTop: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonText: {
    fontWeight: '700',
    color: '#1d1d1f',
    flexShrink: 1,
  },
  badge: {
    marginLeft: 'auto',
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  resetButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetText: {
    color: '#EF4444',
    fontWeight: '700',
  },
  loading: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#6B7280',
  },
  empty: {
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  tile: {
    flex: 1,
    padding: 6,
    maxWidth: '33.33%',
  },
  imageContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    aspectRatio: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  deletePill: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  firstBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  firstBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  hint: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
  },
});

