import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Pressable,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';

import BookingSuccessAnimatedOverlay, {
  type SuccessLine,
} from '@/components/book-appointment/BookingSuccessAnimatedOverlay';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { supabase } from '@/lib/supabase';
import { compressImages } from '@/lib/utils/imageCompression';
import { useAuthStore } from '@/stores/authStore';
import { useColors, type ThemeColors } from '@/src/theme/ThemeProvider';
import { AdminHomeHeroMarquee } from '@/components/home/AdminHomeHeroMarquee';

type HeroImage = { url: string };

const BUCKET = 'app_design';

/**
 * `0` = expo-image-picker uses the platform maximum per gallery session (iOS/Android/Web).
 * There is no app cap on total images stored — the marquee uses the full list from the profile.
 */
const HERO_IMAGE_SELECTION_LIMIT = 0;

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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    headerAddHit: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contentSurface: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    loadingCard: {
      marginHorizontal: 20,
      marginTop: 24,
      paddingVertical: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 15,
      color: colors.textSecondary,
    },
    listContentPad: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    listContentEmpty: {
      flexGrow: 1,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 12,
      minHeight: 28,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.background,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusPillText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    /** Live admin-home-style marquee — height set inline from window (~closer to real hero band) */
    heroPreviewHost: {
      width: '100%',
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 18,
      backgroundColor: colors.background,
    },
    primaryCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 20,
      minHeight: 54,
    },
    primaryCtaText: {
      color: colors.background,
      fontSize: 16,
      fontWeight: '700',
    },
    primaryCtaDisabled: {
      opacity: 0.45,
    },
    sectionLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 22,
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    sectionCount: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    emptyIllustration: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    emptyIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTitle: {
      marginTop: 18,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },
    emptySubtitle: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 300,
    },
    tile: {
      flex: 1,
      padding: 5,
      maxWidth: '33.33%',
    },
    imageContainer: {
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.border,
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
      end: 8,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 14,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    firstBadge: {
      position: 'absolute',
      bottom: 8,
      start: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 12,
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    firstBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
    footerHint: {
      paddingHorizontal: 8,
      paddingTop: 16,
      paddingBottom: 8,
    },
    hint: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
  });
}

export default function EditHomeHeroScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadSuccessModal, setShowUploadSuccessModal] = useState(false);
  const [uploadSuccessAnimKey, setUploadSuccessAnimKey] = useState(0);
  const [heroPreviewLayout, setHeroPreviewLayout] = useState<{ w: number; h: number } | null>(null);

  /** Taller preview strip (~admin hero proportions) without crowding the whole screen */
  const heroPreviewPixelHeight = useMemo(
    () =>
      Math.round(
        Math.min(windowHeight * 0.56, Math.max(340, (windowWidth - 32) * 1.52)),
      ),
    [windowHeight, windowWidth],
  );

  const items: HeroImage[] = useMemo(() => images.map((url) => ({ url })), [images]);
  const busy = isUploading || isSaving;
  const isHebrew = (i18n?.language || 'he').startsWith('he');

  const heroUploadSuccessLines = useMemo((): SuccessLine[] => {
    if (!showUploadSuccessModal) return [];
    return [
      {
        variant: 'headline',
        text: t('settings.profile.heroUploadAnimatedHeadline', 'Images saved successfully'),
      },
      {
        variant: 'body',
        text: t('settings.profile.heroUploadSuccessMessage'),
      },
    ];
  }, [showUploadSuccessModal, t]);

  const goHomeAfterHeroUpload = useCallback(() => {
    setShowUploadSuccessModal(false);
    try {
      router.replace('/(tabs)');
    } catch {
      router.back();
    }
  }, [router]);

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
      Alert.alert(t('error.generic', 'Error'), t('auth.adminOnly', 'Admins only'));
      router.back();
      return;
    }
    load();
  }, [isAdmin, load, router, t]);

  const pickAndUpload = useCallback(async () => {
    if (busy) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('permission.required', 'Permission Required'),
          t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images')
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: HERO_IMAGE_SELECTION_LIMIT,
        quality: 1.0,
        base64: false,
      });
      if (result.canceled || !result.assets?.length) return;

      setIsUploading(true);

      const sources = result.assets.map((a) => ({
        uri: a.uri,
        width: a.width,
        height: a.height,
      }));
      const compressed = await compressImages(sources, {
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
          Alert.alert(
            t('error.generic', 'Error'),
            t('admin.gallery.uploadIndexFailed', 'Failed to upload image {{num}}', { num: i + 1 })
          );
          return;
        }
        uploadedUrls.push(url);
      }

      if (uploadedUrls.length === 0) return;
      const next = [...images, ...uploadedUrls];
      const ok = await save(next);
      if (ok) {
        setUploadSuccessAnimKey((k) => k + 1);
        setShowUploadSuccessModal(true);
      }
    } catch (e) {
      console.error('pickAndUpload home hero failed', e);
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.uploadFailed', 'Failed to upload image'));
    } finally {
      setIsUploading(false);
    }
  }, [busy, images, router, save, t]);

  const removeAt = useCallback(
    (index: number) => {
      Alert.alert(t('settings.profile.heroDeleteTitle', 'Remove image'), t('settings.profile.heroDeleteConfirm'), [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            const next = images.filter((_, i) => i !== index);
            await save(next);
          },
        },
      ]);
    },
    [images, save, t]
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

  const listHeader = useMemo(
    () => (
      <View>
        {isUploading || isSaving ? (
          <View style={styles.statusRow}>
            <View style={styles.statusPill}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusPillText}>
                {isUploading
                  ? t('settings.common.uploading', 'Uploading...')
                  : t('settings.common.saving', 'Saving...')}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={[styles.heroPreviewHost, { height: heroPreviewPixelHeight }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            const h = e.nativeEvent.layout.height;
            if (w > 0 && h > 0) {
              setHeroPreviewLayout((prev) => (prev?.w === w && prev?.h === h ? prev : { w, h }));
            }
          }}
        >
          {heroPreviewLayout ? (
            <AdminHomeHeroMarquee
              customImageUrls={images}
              layoutWidth={heroPreviewLayout.w}
              layoutHeight={heroPreviewLayout.h}
              keyPrefix="edit-home-hero"
              marqueePointerEvents="none"
            />
          ) : null}
        </View>

        <Pressable
          onPress={pickAndUpload}
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryCta,
            busy && styles.primaryCtaDisabled,
            pressed && !busy && { opacity: 0.92 },
          ]}
        >
          <Ionicons name="images" size={22} color={colors.background} />
          <Text style={styles.primaryCtaText}>
            {images.length > 0 ? t('settings.profile.heroAddMore') : t('settings.profile.heroAddPhotos')}
          </Text>
        </Pressable>

        {images.length > 0 && (
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionTitle}>{t('settings.profile.heroYourImages')}</Text>
            <Text style={styles.sectionCount}>{t('settings.profile.heroImagesCount', { count: images.length })}</Text>
          </View>
        )}
      </View>
    ),
    [
      busy,
      colors.background,
      colors.primary,
      images,
      isSaving,
      isUploading,
      heroPreviewLayout,
      heroPreviewPixelHeight,
      styles,
      t,
      pickAndUpload,
    ]
  );

  const listEmpty = useMemo(
    () => (
      <View style={[styles.emptyIllustration, { flex: 1, justifyContent: 'center' }]}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="images-outline" size={38} color={colors.textSecondary} />
        </View>
        <Text style={styles.emptyTitle}>{t('settings.profile.heroEmptyCtaTitle')}</Text>
        <Text style={styles.emptySubtitle}>{t('settings.profile.heroEmptyCtaSubtitle')}</Text>
      </View>
    ),
    [colors.textSecondary, styles, t]
  );

  const footerHint = useMemo(
    () => (
      <View style={styles.footerHint}>
        <Text style={styles.hint}>{t('settings.profile.heroHint')}</Text>
      </View>
    ),
    [styles.footerHint, styles.hint, t]
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8} style={styles.headerAddHit}>
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('settings.profile.homeHeroTitle')}</Text>
          <TouchableOpacity
            onPress={pickAndUpload}
            activeOpacity={0.8}
            disabled={busy}
            style={styles.headerAddHit}
            accessibilityRole="button"
            accessibilityLabel={t('settings.profile.heroAddPhotos')}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="add" size={28} color={busy ? colors.textSecondary : colors.text} />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.contentSurface}>
        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>{t('loading', 'Loading...')}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item, idx) => `${item.url}-${idx}`}
            numColumns={3}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={images.length > 0 ? footerHint : null}
            contentContainerStyle={[
              styles.listContentPad,
              { paddingBottom: insets.bottom + 28 },
              items.length === 0 && styles.listContentEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <View style={styles.tile}>
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => moveToFront(index)}
                  style={styles.imageContainer}
                  disabled={busy}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={t('settings.profile.heroHint')}
                >
                  <Image source={{ uri: item.url }} style={styles.image} contentFit="cover" transition={120} />
                  {index === 0 && (
                    <View style={styles.firstBadge}>
                      <Ionicons name="star" size={12} color="#fff" />
                      <Text style={styles.firstBadgeText}>{t('settings.profile.first')}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => removeAt(index)}
                    style={styles.deletePill}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t('delete', 'Delete')}
                  >
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </SafeAreaView>

      <Modal
        visible={showUploadSuccessModal}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={goHomeAfterHeroUpload}
      >
        <BookingSuccessAnimatedOverlay
          key={uploadSuccessAnimKey}
          lines={heroUploadSuccessLines}
          rtl={isHebrew}
          accentColor={colors.primary}
          onDismiss={goHomeAfterHeroUpload}
          gotItLabel={t('settings.profile.heroUploadHomeButton', 'Home')}
        />
      </Modal>
    </View>
  );
}
