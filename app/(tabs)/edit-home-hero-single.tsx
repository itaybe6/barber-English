import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
  BackHandler,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { Video } from 'expo-av';

import { businessProfileApi } from '@/lib/api/businessProfile';
import { supabase } from '@/lib/supabase';
import { compressImages } from '@/lib/utils/imageCompression';
import { useAuthStore } from '@/stores/authStore';
import { useColors, type ThemeColors } from '@/src/theme/ThemeProvider';
import { HomeHeroSingleBackdrop } from '@/components/home/HomeHeroSingleBackdrop';
import {
  getGalleryVideoPickerOptions,
  resolveGalleryVideoDurationMs,
  isVideoDurationOverGalleryLimit,
} from '@/lib/utils/galleryVideoPick';
import { copyGalleryVideoToCacheForPlayback } from '@/lib/utils/galleryVideoLocalUri';
import {
  ensureGalleryVideoWithinSizeLimit,
  GALLERY_VIDEO_MAX_SIZE_BYTES,
  isGalleryVideoCompressionUnavailableError,
  isGalleryVideoSizeLimitError,
} from '@/lib/utils/galleryVideoCompression';
import { guessMediaMimeFromUri } from '@/lib/utils/mediaUrl';
import {
  type HomeHeroSingleKind,
  normalizeHomeHeroSingleKind,
  inferHomeHeroSingleKindFromUrl,
} from '@/lib/utils/homeHeroMode';

const BUCKET = 'app_design';
const SINGLE_IMAGE_MAX_EDGE = 1920;
const SINGLE_IMAGE_JPEG_QUALITY = 0.86;

/** Thrown when Supabase Storage rejects the file because it exceeds the bucket size limit. */
class HeroStorageSizeError extends Error {
  constructor() { super('hero_single_storage_size_exceeded'); }
}

function isHeroStorageSizeError(e: unknown): e is HeroStorageSizeError {
  return e instanceof HeroStorageSizeError;
}

async function uploadBytesToAppDesign(params: {
  body: Uint8Array;
  contentType: string;
  fileExt: string;
}): Promise<string | null> {
  const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const filePath = `business-images/home-hero-single/${Date.now()}_${randomId()}.${params.fileExt}`;
  const { error } = await supabase.storage.from(BUCKET).upload(filePath, params.body as any, {
    contentType: params.contentType,
    upsert: false,
  });
  if (error) {
    const msg = String((error as any)?.message ?? '').toLowerCase();
    if (msg.includes('maximum allowed size') || msg.includes('file size') || msg.includes('too large')) {
      throw new HeroStorageSizeError();
    }
    console.error('[edit-home-hero-single] upload error', error);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

async function uploadFromReadableUri(uri: string, fallbackContentType: string, fileExt: string): Promise<string | null> {
  try {
    const response = await fetch(uri, { cache: 'no-store' });
    const arrayBuffer = await response.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);
    const contentType = response.headers.get('content-type') || fallbackContentType;
    return uploadBytesToAppDesign({ body, contentType, fileExt });
  } catch (e) {
    if (isHeroStorageSizeError(e)) throw e; // propagate — caller shows user-friendly error
    console.error('[edit-home-hero-single] fetch upload failed', e);
    return null;
  }
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerSafe: { backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    headerHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 40,
      gap: 20,
    },

    // ── Preview card ──────────────────────────────────────────────────
    previewCard: {
      width: '100%',
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    previewBadgeRow: {
      position: 'absolute',
      top: 14,
      left: 14,
      zIndex: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(0,0,0,0.52)',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    previewBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.1 },
    previewBottomGrad: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 64,
      justifyContent: 'flex-end',
      paddingBottom: 12,
      paddingHorizontal: 14,
    },
    previewChangeHint: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.88)', textAlign: 'center' },
    emptyStateGrad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyIconRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    emptySubtitle: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 20 },

    // ── Picker cards ──────────────────────────────────────────────────
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      textAlign: 'left',
      marginBottom: -8,
    },
    pickersRow: { flexDirection: 'row', gap: 12 },
    pickerCard: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 20,
      paddingVertical: 20,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 10,
      elevation: 3,
    },
    pickerCardPrimary: {
      backgroundColor: colors.primary,
    },
    pickerIconBg: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerCardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, textAlign: 'center' },
    pickerCardTitlePrimary: { color: colors.background },
    pickerCardSub: { fontSize: 11, fontWeight: '500', color: colors.textSecondary, textAlign: 'center', lineHeight: 15 },
    pickerCardSubPrimary: { color: `${colors.background}BB` },

    // ── Info row ──────────────────────────────────────────────────────
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: `${colors.info}10`,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 16,
    },
    infoText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
      textAlign: 'left',
      lineHeight: 17,
    },

    // ── Delete ────────────────────────────────────────────────────────
    deleteRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    deleteText: { fontSize: 14, fontWeight: '600', color: '#DC2626' },

    disabled: { opacity: 0.45 },
    busyOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderRadius: 20,
      zIndex: 20,
    },
    loadingCard: {
      flex: 1,
      paddingVertical: 80,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
    },
    loadingText: { fontSize: 15, color: colors.textSecondary },
  });
}

export default function EditHomeHeroSingleScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<HomeHeroSingleKind | null>(null);

  const previewH = useMemo(
    () => Math.round(Math.min(windowHeight * 0.42, Math.max(280, (windowWidth - 40) * 0.95))),
    [windowHeight, windowWidth],
  );

  const videoDurationProbeRef = useRef<Video | null>(null);

  const { returnSettingsTab: returnSettingsTabParam } = useLocalSearchParams<{
    returnSettingsTab?: string | string[];
  }>();
  const settingsTabOnExit = useMemo(() => {
    const raw = returnSettingsTabParam;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v === 'string' && v.trim()) return v.trim();
    return 'design';
  }, [returnSettingsTabParam]);

  const exitToSettingsSection = useCallback(() => {
    router.replace({
      pathname: '/(tabs)/settings',
      params: { tab: settingsTabOnExit },
    });
  }, [router, settingsTabOnExit]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        exitToSettingsSection();
        return true;
      });
      return () => sub.remove();
    }, [exitToSettingsSection]),
  );

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const p = await businessProfileApi.getProfile();
      const u = String((p as any)?.home_hero_single_url ?? '').trim();
      const storedKind = normalizeHomeHeroSingleKind((p as any)?.home_hero_single_kind);
      const resolvedKind =
        u.length > 0 ? storedKind ?? inferHomeHeroSingleKindFromUrl(u) : null;
      setUrl(u.length > 0 ? u : null);
      setKind(resolvedKind);
    } catch {
      setUrl(null);
      setKind(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      Alert.alert(t('error.generic', 'Error'), t('auth.adminOnly', 'Admins only'));
      router.replace('/(tabs)' as const);
      return;
    }
    void load();
  }, [isAdmin, load, router, t]);

  const persist = useCallback(
    async (nextUrl: string | null, nextKind: HomeHeroSingleKind | null) => {
      const updated = await businessProfileApi.upsertProfile({
        home_hero_single_url: nextUrl,
        home_hero_single_kind: nextKind,
      } as any);
      if (!updated) {
        Alert.alert(t('error.generic', 'Error'), t('settings.profile.imageSaveFailed', 'Failed to save'));
        return false;
      }
      const u = String((updated as any)?.home_hero_single_url ?? '').trim();
      const sk = normalizeHomeHeroSingleKind((updated as any)?.home_hero_single_kind);
      const rk = u.length > 0 ? sk ?? inferHomeHeroSingleKindFromUrl(u) : null;
      setUrl(u.length > 0 ? u : null);
      setKind(rk);
      return true;
    },
    [t],
  );

  const pickImage = useCallback(async () => {
    if (isBusy) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('permission.required', 'Permission Required'),
          t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images'),
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: false,
        quality: 1,
        base64: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setIsBusy(true);
      try {
        const compressed = await compressImages(
          [{ uri: result.assets[0].uri, width: result.assets[0].width, height: result.assets[0].height }],
          { quality: SINGLE_IMAGE_JPEG_QUALITY, maxWidth: SINGLE_IMAGE_MAX_EDGE, maxHeight: SINGLE_IMAGE_MAX_EDGE, format: 'jpeg' },
        );
        const uri = compressed[0]?.uri;
        if (!uri) {
          Alert.alert(t('error.generic', 'Error'), t('settings.profile.uploadFailed', 'Failed to upload image'));
          return;
        }
        const publicUrl = await uploadFromReadableUri(uri, 'image/jpeg', 'jpg');
        if (!publicUrl) {
          Alert.alert(t('error.generic', 'Error'), t('settings.profile.uploadFailed', 'Failed to upload image'));
          return;
        }
        await persist(publicUrl, 'image');
      } finally {
        setIsBusy(false);
      }
    } catch (e) {
      console.error('[edit-home-hero-single] pickImage', e);
      Alert.alert(t('error.generic', 'Error'), t('settings.profile.uploadFailed', 'Failed to upload image'));
    }
  }, [isBusy, persist, t]);

  const pickVideo = useCallback(async () => {
    if (isBusy) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('permission.required', 'Permission Required'),
          t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images'),
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(getGalleryVideoPickerOptions());
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      setIsBusy(true);
      try {
        const durationMs = await resolveGalleryVideoDurationMs(a, videoDurationProbeRef);
        if (isVideoDurationOverGalleryLimit(durationMs)) {
          Alert.alert(
            t('error.generic', 'Error'),
            t('admin.gallery.videoTooLong', 'Videos can be at most {{maxSeconds}} seconds.', { maxSeconds: 15 }),
          );
          return;
        }
        if (durationMs === null) {
          Alert.alert(
            t('error.generic', 'Error'),
            t(
              'admin.gallery.videoDurationUnknown',
              'Could not read the video length. Try choosing the file again from Photos or Gallery.',
            ),
          );
          return;
        }

        let playbackUri = a.uri;
        try {
          playbackUri = await copyGalleryVideoToCacheForPlayback(a.uri, a.fileName);
        } catch (e) {
          console.warn('[edit-home-hero-single] copy to cache failed', e);
        }

        const mimeType = a.mimeType || guessMediaMimeFromUri(a.fileName || a.uri);
        let uploadUri = playbackUri;
        let uploadMime = mimeType;
        let uploadExt = (a.fileName?.split('.').pop() || 'mp4').toLowerCase().split('?')[0] || 'mp4';

        try {
          // Try compression first (available in dev / prod builds)
          const prepared = await ensureGalleryVideoWithinSizeLimit({
            uri: playbackUri,
            durationMs,
            fileName: a.fileName,
            fileSize: a.fileSize ?? null,
            mimeType,
            compressionPreset: 'standard',
          });
          uploadUri = prepared.uri;
          uploadMime = prepared.mimeType;
          uploadExt = (prepared.fileName.split('.').pop() || 'mp4').toLowerCase().split('?')[0] || 'mp4';
        } catch (compressionError) {
          if (isGalleryVideoCompressionUnavailableError(compressionError)) {
            Alert.alert(
              t('error.generic', 'Error'),
              t(
                'admin.gallery.videoCompressionUnavailable',
                'Video compression is not available in this build. Open the app in a development build or a production build and try again.',
              ),
            );
          } else if (isGalleryVideoSizeLimitError(compressionError)) {
            Alert.alert(
              t('error.generic', 'Error'),
              t(
                'admin.gallery.videoSizeLimitExceeded',
                'The selected video must be up to {{maxMb}} MB after compression. Try a shorter or simpler clip.',
                { maxMb: Math.round(GALLERY_VIDEO_MAX_SIZE_BYTES / (1024 * 1024)) },
              ),
            );
          } else {
            Alert.alert(
              t('error.generic', 'Error'),
              t(
                'admin.gallery.videoCompressionFailed',
                'Could not prepare the video for upload. Try another clip or trim it and try again.',
              ),
            );
          }
          return;
        }

        const publicUrl = await uploadFromReadableUri(uploadUri, uploadMime, uploadExt);
        if (!publicUrl) {
          Alert.alert(t('error.generic', 'Error'), t('settings.profile.uploadFailed', 'Failed to upload image'));
          return;
        }
        await persist(publicUrl, 'video');
      } catch (error) {
        console.error('[edit-home-hero-single] pickVideo', error);
        if (isHeroStorageSizeError(error)) {
          // Storage rejected the file — size exceeds the bucket limit
          Alert.alert(
            t('error.generic', 'Error'),
            t(
              'settings.profile.heroSingleVideoStorageLimitExceeded',
              'The video file is too large for upload. Choose a shorter or lower-quality clip, or use a production build for automatic compression.',
            ),
          );
          return;
        }
        Alert.alert(
          t('error.generic', 'Error'),
          t(
            'admin.gallery.videoCompressionFailed',
            'Could not prepare the video for upload. Try another clip or trim it and try again.',
          ),
        );
      } finally {
        setIsBusy(false);
      }
    } catch (e) {
      console.error('[edit-home-hero-single] pickVideo outer', e);
    }
  }, [isBusy, persist, t]);

  const clearMedia = useCallback(async () => {
    if (isBusy || !url) return;
    Alert.alert(
      t('settings.profile.heroSingleRemoveTitle', 'Remove background media?'),
      t('settings.profile.heroSingleRemoveMessage', 'Clients will fall back to the animation images until you add a new file.'),
      [
        { text: t('cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            setIsBusy(true);
            try {
              await persist(null, null);
            } finally {
              setIsBusy(false);
            }
          },
        },
      ],
    );
  }, [isBusy, persist, t, url]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={exitToSettingsSection} activeOpacity={0.8} style={styles.headerHit}>
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('settings.profile.homeHeroSingleTitle', 'Single home background')}</Text>
          <View style={styles.headerHit} />
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.scroll}>
        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>{t('loading', 'Loading...')}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Preview ── */}
            <View style={[styles.previewCard, { height: previewH }]}>
              {url && kind ? (
                <>
                  <HomeHeroSingleBackdrop uri={url} kind={kind} />
                  {/* Kind badge */}
                  <View style={styles.previewBadgeRow}>
                    <Text style={styles.previewBadgeText}>
                      {kind === 'video'
                        ? t('settings.profile.heroSingleKindVideo', 'וידאו')
                        : t('settings.profile.heroSingleKindImage', 'תמונה')}
                    </Text>
                    <Ionicons
                      name={kind === 'video' ? 'videocam' : 'image'}
                      size={13}
                      color="#fff"
                    />
                  </View>
                  {/* Bottom gradient hint */}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.45)']}
                    style={styles.previewBottomGrad}
                    pointerEvents="none"
                  >
                    <Text style={styles.previewChangeHint}>
                      {t('settings.profile.heroSingleTapToChange', 'בחר כפתור למטה כדי להחליף')}
                    </Text>
                  </LinearGradient>
                </>
              ) : (
                <LinearGradient
                  colors={[colors.surface, colors.background]}
                  style={styles.emptyStateGrad}
                >
                  <View style={styles.emptyIconRing}>
                    <Ionicons name="image-outline" size={34} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {t('settings.profile.heroSingleEmpty', 'No image or video yet')}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {t('settings.profile.heroSingleEmptySub', 'בחר תמונה או וידאו שימלאו את ראש דף הבית')}
                  </Text>
                </LinearGradient>
              )}
              {isBusy && (
                <View style={styles.busyOverlay}>
                  <ActivityIndicator color="#fff" size="large" />
                </View>
              )}
            </View>

            {/* ── Section label ── */}
            <Text style={styles.sectionLabel}>
              {t('settings.profile.heroSingleUploadSection', 'העלאת מדיה')}
            </Text>

            {/* ── Picker cards ── */}
            <View style={[styles.pickersRow, isBusy && styles.disabled]}>
              {/* Image card — primary */}
              <Pressable
                onPress={pickImage}
                disabled={isBusy}
                style={({ pressed }) => [
                  styles.pickerCard,
                  styles.pickerCardPrimary,
                  pressed && !isBusy && { opacity: 0.88, transform: [{ scale: 0.97 }] },
                ]}
              >
                <View style={[styles.pickerIconBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons name="image" size={28} color={colors.background} />
                </View>
                <Text style={[styles.pickerCardTitle, styles.pickerCardTitlePrimary]}>
                  {t('settings.profile.heroSingleChooseImage', 'Choose image')}
                </Text>
                <Text style={[styles.pickerCardSub, styles.pickerCardSubPrimary]}>
                  {t('settings.profile.heroSingleImageSub', 'JPEG • דחוסה אוטומטית')}
                </Text>
              </Pressable>

              {/* Video card — secondary */}
              <Pressable
                onPress={pickVideo}
                disabled={isBusy}
                style={({ pressed }) => [
                  styles.pickerCard,
                  pressed && !isBusy && { opacity: 0.88, transform: [{ scale: 0.97 }] },
                ]}
              >
                <View style={[styles.pickerIconBg, { backgroundColor: `${colors.text}0D` }]}>
                  <Ionicons name="videocam" size={28} color={colors.text} />
                </View>
                <Text style={styles.pickerCardTitle}>
                  {t('settings.profile.heroSingleChooseVideo', 'Choose video')}
                </Text>
                <Text style={styles.pickerCardSub}>
                  {t('settings.profile.heroSingleVideoSub', 'עד 15 שניות')}
                </Text>
              </Pressable>
            </View>


          </ScrollView>
        )}
      </SafeAreaView>

      <Video
        ref={videoDurationProbeRef}
        pointerEvents="none"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999, top: -9999 }}
        useNativeControls={false}
      />
    </View>
  );
}
