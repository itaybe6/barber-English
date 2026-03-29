import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useColors, type ThemeColors } from '@/src/theme/ThemeProvider';
import {
  loadShortGalleryVideosFromLibrary,
  mediaLibraryAssetToImagePickerVideoAsset,
  formatVideoDurationShort,
} from '@/lib/utils/galleryShortVideoLibrary';
import { GALLERY_VIDEO_MAX_DURATION_MS } from '@/lib/utils/galleryVideoPick';
import { ShortGalleryVideoThumb } from '@/components/ShortGalleryVideoThumb';

const MAX_SECONDS = GALLERY_VIDEO_MAX_DURATION_MS / 1000;

interface ShortGalleryVideoPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onResolvedPick: (asset: ImagePickerAsset) => void;
  t: (key: string, defaultValue?: string, options?: Record<string, unknown>) => string;
}

export function ShortGalleryVideoPickerModal({
  visible,
  onClose,
  onResolvedPick,
  t,
}: ShortGalleryVideoPickerModalProps) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const gap = 8;
  const pad = 16;
  const cols = 3;
  const tile = Math.floor((windowWidth - pad * 2 - gap * (cols - 1)) / cols);

  const reset = useCallback(() => {
    setPhase('idle');
    setAssets([]);
    setBusyId(null);
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }

    let cancelled = false;

    (async () => {
      setPhase('loading');
      setAssets([]);

      try {
        const available = await MediaLibrary.isAvailableAsync();
        if (!available) {
          if (!cancelled) setPhase('error');
          return;
        }

        const perm = await MediaLibrary.requestPermissionsAsync(false, ['video']);
        const ok =
          perm.status === 'granted' ||
          perm.accessPrivileges === 'all' ||
          perm.accessPrivileges === 'limited';
        if (!ok) {
          const close = () => onCloseRef.current();
          Alert.alert(
            t('permission.required', 'Permission Required'),
            t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images'),
            [{ text: 'OK', onPress: close }]
          );
          if (!cancelled) {
            setPhase('idle');
            close();
          }
          return;
        }

        const list = await loadShortGalleryVideosFromLibrary({ targetCount: 120, pageSize: 40, maxPages: 40 });
        if (cancelled) return;
        setAssets(list);
        setPhase('ready');
      } catch (e) {
        console.warn('[ShortGalleryVideoPickerModal] load failed', e);
        if (!cancelled) setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, reset, t]);

  const onSelect = async (item: MediaLibrary.Asset) => {
    setBusyId(item.id);
    try {
      const pickerAsset = await mediaLibraryAssetToImagePickerVideoAsset(item);
      if (!pickerAsset) {
        Alert.alert(
          t('error.generic', 'Error'),
          t(
            'admin.gallery.shortVideoResolveFailed',
            'Could not open this video. If it is stored in the cloud, wait for it to download or pick another clip.'
          )
        );
        return;
      }
      onResolvedPick(pickerAsset);
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item, index }: { item: MediaLibrary.Asset; index: number }) => {
    const busy = busyId === item.id;
    const endOfRow = (index + 1) % cols === 0;
    return (
      <TouchableOpacity
        style={[styles.tile, { width: tile, height: tile, marginBottom: gap, marginRight: endOfRow ? 0 : gap }]}
        onPress={() => void onSelect(item)}
        disabled={busy || phase !== 'ready'}
        activeOpacity={0.85}
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <ShortGalleryVideoThumb asset={item} iconColor={colors.textSecondary} />
            <Text style={styles.durationLabel}>{formatVideoDurationShort(item.duration)}</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={2}>
            {t('admin.gallery.shortVideoPickerTitle', 'Videos up to {{maxSeconds}} s', { maxSeconds: MAX_SECONDS })}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        {phase === 'loading' ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.hint}>{t('admin.gallery.shortVideosLoading', 'Loading…')}</Text>
          </View>
        ) : null}

        {phase === 'error' ? (
          <View style={styles.centerFill}>
            <Text style={styles.emptyTitle}>{t('error.generic', 'Error')}</Text>
            <Text style={styles.hint}>{t('admin.gallery.shortVideosLoadFailed', 'Could not load videos.')}</Text>
          </View>
        ) : null}

        {phase === 'ready' && assets.length === 0 ? (
          <View style={styles.centerFill}>
            <Text style={styles.emptyTitle}>
              {t('admin.gallery.shortVideosEmpty', 'No videos up to {{maxSeconds}} s in your library.', {
                maxSeconds: MAX_SECONDS,
              })}
            </Text>
          </View>
        ) : null}

        {phase === 'ready' && assets.length > 0 ? (
          <FlatList
            data={assets}
            keyExtractor={(a) => a.id}
            numColumns={cols}
            columnWrapperStyle={{ paddingHorizontal: pad }}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
            renderItem={renderItem}
            initialNumToRender={9}
            maxToRenderPerBatch={6}
            windowSize={11}
            ListFooterComponent={busyId ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} /> : null}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    hint: {
      marginTop: 12,
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    tile: {
      borderRadius: 10,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
    },
    durationLabel: {
      position: 'absolute',
      bottom: 6,
      end: 6,
      fontSize: 11,
      fontWeight: '600',
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
  });
}
