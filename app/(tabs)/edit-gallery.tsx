import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  BackHandler,
  I18nManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useDesignsStore } from '@/stores/designsStore';
import type { Design, User } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { usersApi } from '@/lib/api/users';
import { compressImages } from '@/lib/utils/imageCompression';
import { useTranslation } from 'react-i18next';
import { Search, ImagePlus, LayoutGrid, X, Clapperboard, GripVertical, Info } from 'lucide-react-native';
import DraggableFlatList, { ScaleDecorator, type DragEndParams } from 'react-native-draggable-flatlist';
import { sortDesignsByDisplayOrder } from '@/lib/api/designs';
import { useColors, type ThemeColors } from '@/src/theme/ThemeProvider';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import { useAuthStore } from '@/stores/authStore';
import { useGalleryCreateDraftStore } from '@/stores/galleryCreateDraftStore';
import { useEditGalleryTabBar, useEditGalleryTabBarRegistration } from '@/contexts/EditGalleryTabBarContext';
import { isVideoUrl, guessMediaMimeFromUri, storageExtensionFromContentType } from '@/lib/utils/mediaUrl';
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
import { GalleryLoopVideo } from '@/components/GalleryLoopVideo';
import { GalleryPickedVideoPreview } from '@/components/GalleryPickedVideoPreview';
import { ShortGalleryVideoPickerModal } from '@/components/ShortGalleryVideoPickerModal';
import { ResizeMode, Video } from 'expo-av';

const numColumns = 2;

/** Max images per design in gallery create/edit flows. */
const GALLERY_MAX_IMAGES = 6;

/** Inner width for step-2 thumbnail grid (matches manager settings sheet horizontal padding). */
function getGallerySheetInnerContentWidth(screenW: number) {
  const pad = 20;
  return Math.max(0, screenW - pad * 2);
}

interface Step2ThumbGrid {
  thumbSize: number;
  gap: number;
}

/** Larger single preview for 1 image; 2 columns for 2; 3-column wrap for 3+. */
function getStep2ThumbGrid(count: number, innerWidth: number): Step2ThumbGrid {
  const gap = 10;
  if (count <= 0) return { thumbSize: 0, gap };
  if (count === 1) {
    return { thumbSize: Math.min(Math.round(innerWidth * 0.72), 248), gap };
  }
  if (count === 2) {
    const s = Math.floor((innerWidth - gap) / 2);
    return { thumbSize: Math.min(Math.max(s, 92), 172), gap };
  }
  const cols = 3;
  const s = Math.floor((innerWidth - (cols - 1) * gap) / cols);
  return { thumbSize: Math.max(84, s), gap };
}

export default function EditGalleryScreen() {
  const { t: tRoot } = useTranslation();
  const t = useCallback(
    (key: string, defaultValue?: string, options?: Record<string, unknown>) =>
      tRoot(key, { ...(options ?? {}), defaultValue, lng: 'he' } as object),
    [tRoot]
  );
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const step2ContentW = useMemo(() => getGallerySheetInnerContentWidth(windowWidth), [windowWidth]);
  /** Square side for photo / video picker tiles (sheet pad 20×2, gap 12). */
  const galleryPickTileSize = useMemo(() => {
    const inner = Math.max(0, windowWidth - 40);
    return Math.max(118, Math.min(176, Math.floor((inner - 12) / 2)));
  }, [windowWidth]);
  const colors = useColors();

  const styles = useMemo(
    () => createStyles(colors, windowWidth, windowHeight, I18nManager.isRTL),
    [colors, windowWidth, windowHeight, I18nManager.isRTL],
  );

  const { designs, fetchDesigns, createDesign, deleteDesign, updateDesign, applyDesignDisplayOrder, isLoading } =
    useDesignsStore();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [name, setName] = useState('');
  const pickedAssets = useGalleryCreateDraftStore((s) => s.pickedAssets);
  const pickedVideo = useGalleryCreateDraftStore((s) => s.pickedVideo);
  const setPickedAssets = useGalleryCreateDraftStore((s) => s.setPickedAssets);
  const setPickedVideo = useGalleryCreateDraftStore((s) => s.setPickedVideo);
  const clearPickedAssets = useGalleryCreateDraftStore((s) => s.clearPickedAssets);
  const [search, setSearch] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const [editVisible, setEditVisible] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [editName, setEditName] = useState('');
  const [editSelectedUserId, setEditSelectedUserId] = useState<string>('');
  type LocalAsset = { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null };
  type EditMediaItem =
    | { kind: 'remote'; url: string; mediaType: 'image' | 'video' }
    | { kind: 'local'; asset: LocalAsset; mediaType: 'image' | 'video' };
  const [editImages, setEditImages] = useState<EditMediaItem[]>([]);
  const createMediaCount = pickedAssets.length + (pickedVideo ? 1 : 0);
  const createStep2Grid = useMemo(
    () => getStep2ThumbGrid(createMediaCount, step2ContentW),
    [createMediaCount, step2ContentW]
  );
  const editStep2Grid = useMemo(
    () => getStep2ThumbGrid(editImages.length, step2ContentW),
    [editImages.length, step2ContentW]
  );
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editStep, setEditStep] = useState<1 | 2>(1);
  const [isCreating, setIsCreating] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const { deleteMode, setDeleteMode, reorderMode, setReorderMode, setReorderDirty, setFloatingBarHidden } =
    useEditGalleryTabBar();

  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  /** Hidden player to read duration when expo-image-picker omits `asset.duration` (some Android paths). */
  const videoDurationProbeRef = useRef<Video | null>(null);
  const [isPreparingGalleryVideo, setIsPreparingGalleryVideo] = useState(false);
  const shortVideoPickerRoleRef = useRef<'create' | 'edit'>('create');
  const [shortVideoPickerOpen, setShortVideoPickerOpen] = useState(false);
  const createMediaSheetRef = useRef<BottomSheetModal>(null);
  const editMediaSheetRef = useRef<BottomSheetModal>(null);
  const createMediaSheetScrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const editMediaSheetScrollRef = useRef<BottomSheetScrollViewMethods>(null);

  /**
   * With `keyboardBehavior="fillParent"`, the sheet expands when the keyboard opens.
   * Still nudge scroll after layout so the name field clears any thumbnails above it.
   */
  const scrollGalleryNameStepIntoView = useCallback((which: 'create' | 'edit') => {
    const ref = which === 'create' ? createMediaSheetScrollRef : editMediaSheetScrollRef;
    setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 260);
    setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 520);
  }, []);

  /** Many thumbnails: ensure name row is reachable once layout is ready (no keyboard padding). */
  useEffect(() => {
    if (!createVisible || createStep !== 2) return;
    const t = setTimeout(() => createMediaSheetScrollRef.current?.scrollToEnd({ animated: true }), 180);
    return () => clearTimeout(t);
  }, [createVisible, createStep]);

  useEffect(() => {
    if (!editVisible || editStep !== 2) return;
    const t = setTimeout(() => editMediaSheetScrollRef.current?.scrollToEnd({ animated: true }), 180);
    return () => clearTimeout(t);
  }, [editVisible, editStep]);

  useEffect(() => {
    if (createVisible) {
      createMediaSheetRef.current?.present();
    } else {
      createMediaSheetRef.current?.dismiss();
    }
  }, [createVisible]);

  useEffect(() => {
    if (editVisible) {
      editMediaSheetRef.current?.present();
    } else {
      editMediaSheetRef.current?.dismiss();
    }
  }, [editVisible]);

  const gallerySheetChrome = useMemo(
    () => ({
      background: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      } as const,
      handle: {
        backgroundColor: 'rgba(0,0,0,0.18)',
        width: 36,
        height: 4,
        borderRadius: 2,
        marginTop: 2,
      } as const,
    }),
    [colors.surface]
  );

  const renderCreateGalleryBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
        pressBehavior={isCreating ? 'none' : 'close'}
      />
    ),
    [isCreating]
  );

  const renderEditGalleryBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
        pressBehavior={isSavingEdit ? 'none' : 'close'}
      />
    ),
    [isSavingEdit]
  );

  useEffect(() => {
    setFloatingBarHidden(viewerVisible || createVisible || editVisible);
  }, [viewerVisible, createVisible, editVisible, setFloatingBarHidden]);

  useEffect(
    () => () => {
      setFloatingBarHidden(false);
    },
    [setFloatingBarHidden]
  );

  useEffect(() => {
    fetchDesigns();
    loadAdminUsers();
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setDeleteMode(false);
        setReorderMode(false);
        setReorderDirty(false);
      };
    }, [setDeleteMode, setReorderMode, setReorderDirty])
  );

  useEffect(() => {
    if (reorderMode) setSearch('');
  }, [reorderMode]);

  useEffect(() => {
    if (!createVisible) setCreateStep(1);
  }, [createVisible]);

  useEffect(() => {
    if (!createVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isCreating) return true;
      if (createStep === 2) {
        setCreateStep(1);
        return true;
      }
      setCreateVisible(false);
      return true;
    });
    return () => sub.remove();
  }, [createVisible, isCreating, createStep]);

  const loadAdminUsers = async () => {
    try {
      const users = await usersApi.getAdminUsers();
      setAdminUsers(users);
      if (users.length > 0) {
        const uid = useAuthStore.getState().user?.id;
        const self = uid ? users.find((u) => u.id === uid) : undefined;
        setSelectedUserId((prev) => (prev ? prev : self?.id ?? users[0].id));
      }
    } catch (error) {
      console.error('Error loading admin users:', error);
    }
  };

  /** Default "attributed barber" to the logged-in admin so gallery shows their profile photo. */
  useEffect(() => {
    if (!createVisible || adminUsers.length === 0) return;
    const self = currentUserId ? adminUsers.find((u) => u.id === currentUserId) : undefined;
    setSelectedUserId(self?.id ?? adminUsers[0].id);
  }, [createVisible, adminUsers, currentUserId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return designs;
    return designs.filter((d) => d.name.toLowerCase().includes(q));
  }, [designs, search]);

  const sortedForReorder = useMemo(() => sortDesignsByDisplayOrder(designs), [designs]);
  /** Local order while reordering; null = use sortedForReorder until first drag. */
  const [reorderListData, setReorderListData] = useState<Design[] | null>(null);
  const reorderCommitInFlight = useRef(false);

  useEffect(() => {
    if (reorderMode) {
      setReorderListData(null);
      setReorderDirty(false);
    } else {
      setReorderListData(null);
    }
  }, [reorderMode, setReorderDirty]);

  const reorderDisplayData = useMemo(() => {
    if (!reorderMode) return [] as Design[];
    return reorderListData ?? sortedForReorder;
  }, [reorderMode, reorderListData, sortedForReorder]);

  const onReorderDragEnd = useCallback(
    ({ data }: DragEndParams<Design>) => {
      setReorderListData(data);
      setReorderDirty(true);
    },
    [setReorderDirty]
  );

  const commitReorder = useCallback(async () => {
    if (reorderCommitInFlight.current) return;
    reorderCommitInFlight.current = true;
    try {
      const list = reorderListData ?? sortedForReorder;
      const ok = await applyDesignDisplayOrder(list.map((d) => d.id));
      if (ok) {
        setReorderDirty(false);
        setReorderMode(false);
        setReorderListData(null);
      } else {
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.reorderSaveFailed', 'Could not save order'));
      }
    } finally {
      reorderCommitInFlight.current = false;
    }
  }, [
    applyDesignDisplayOrder,
    reorderListData,
    sortedForReorder,
    setReorderDirty,
    setReorderMode,
    t,
  ]);

  /** When compression fails, still show & upload using the picker's URIs (Android content:// is sensitive). */
  const pickedAssetsFromPicker = (
    assets: { uri: string; base64?: string | null; fileName?: string | null }[]
  ) =>
    assets.map((a, index) => ({
      uri: a.uri,
      base64: a.base64 ?? null,
      mimeType: guessMediaMimeFromUri(a.fileName || a.uri),
      fileName: a.fileName ?? `picked_${Date.now()}_${index}.jpg`,
    }));

  const base64ToUint8Array = (base64: string): Uint8Array => {
    const clean = base64.replace(/^data:[^;]+;base64,/, '');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let outputLength = (clean.length / 4) * 3;
    if (clean.endsWith('==')) outputLength -= 2;
    else if (clean.endsWith('=')) outputLength -= 1;
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

  const commitPickedGalleryVideo = useCallback(
    async (a: ImagePickerAsset, role: 'create' | 'edit') => {
      setIsPreparingGalleryVideo(true);
      try {
        const durationMs = await resolveGalleryVideoDurationMs(a, videoDurationProbeRef);
        if (isVideoDurationOverGalleryLimit(durationMs)) {
          Alert.alert(
            t('error.generic', 'Error'),
            t('admin.gallery.videoTooLong', 'Videos can be at most {{maxSeconds}} seconds.', { maxSeconds: 15 })
          );
          return;
        }
        if (durationMs === null) {
          Alert.alert(
            t('error.generic', 'Error'),
            t(
              'admin.gallery.videoDurationUnknown',
              'Could not read the video length. Try choosing the file again from Photos or Gallery.'
            )
          );
          return;
        }

        let playbackUri = a.uri;
        try {
          playbackUri = await copyGalleryVideoToCacheForPlayback(a.uri, a.fileName);
        } catch (e) {
          console.warn('[edit-gallery] copyGalleryVideoToCacheForPlayback failed, using source uri', e);
        }

        const preparedVideo = await ensureGalleryVideoWithinSizeLimit({
          uri: playbackUri,
          durationMs,
          fileName: a.fileName,
          fileSize: a.fileSize ?? null,
          mimeType: a.mimeType || guessMediaMimeFromUri(a.fileName || a.uri),
          compressionPreset: role === 'edit' ? 'aggressive' : 'standard',
        });

        if (role === 'create') {
          setPickedVideo({
            uri: preparedVideo.uri,
            base64: null,
            mimeType: preparedVideo.mimeType,
            fileName: preparedVideo.fileName,
          });
        } else {
          const asset: LocalAsset = {
            uri: preparedVideo.uri,
            base64: null,
            mimeType: preparedVideo.mimeType,
            fileName: preparedVideo.fileName,
          };
          setEditImages((prev) => [...prev, { kind: 'local', asset, mediaType: 'video' }]);
        }
      } catch (error) {
        console.error('[edit-gallery] commitPickedGalleryVideo failed', error);
        if (isGalleryVideoCompressionUnavailableError(error)) {
          Alert.alert(
            t('error.generic', 'Error'),
            t(
              'admin.gallery.videoCompressionUnavailable',
              'Video compression is not available in this build. Open the app in a development build or a production build and try again.'
            )
          );
          return;
        }
        if (isGalleryVideoSizeLimitError(error)) {
          Alert.alert(
            t('error.generic', 'Error'),
            t(
              'admin.gallery.videoSizeLimitExceeded',
              'The selected video must be up to {{maxMb}} MB after compression. Try a shorter or simpler clip.',
              { maxMb: Math.round(GALLERY_VIDEO_MAX_SIZE_BYTES / (1024 * 1024)) }
            )
          );
          return;
        }
        Alert.alert(
          t('error.generic', 'Error'),
          t(
            'admin.gallery.videoCompressionFailed',
            'Could not prepare the video for upload. Try another clip or trim it and try again.'
          )
        );
      } finally {
        setIsPreparingGalleryVideo(false);
      }
    },
    [t, setPickedVideo, setEditImages]
  );

  const onShortVideoResolvedFromModal = useCallback(
    (a: ImagePickerAsset) => {
      setShortVideoPickerOpen(false);
      void commitPickedGalleryVideo(a, shortVideoPickerRoleRef.current);
    },
    [commitPickedGalleryVideo]
  );

  const uploadImage = async (asset: { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMediaMimeFromUri(asset.fileName || asset.uri);
      let fileBody: Blob | Uint8Array;

      if (asset.base64) {
        const bytes = base64ToUint8Array(asset.base64);
        fileBody = bytes;
      } else {
        const response = await fetch(asset.uri, { cache: 'no-store' });
        const arrayBuffer = await response.arrayBuffer();
        fileBody = new Uint8Array(arrayBuffer);
        contentType = response.headers.get('content-type') || contentType;
      }

      const extGuess = storageExtensionFromContentType(contentType);
      const randomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const filePath = `uploads/${Date.now()}_${randomId()}.${extGuess}`;
      let bucketUsed = 'designs';
      const firstAttempt = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, { contentType, upsert: false });
      if (firstAttempt.error) {
        const msg = String((firstAttempt.error as any)?.message || '').toLowerCase();
        if (msg.includes('bucket') && msg.includes('not found')) {
          bucketUsed = 'public';
          const retry = await supabase.storage.from(bucketUsed).upload(filePath, fileBody as any, { contentType, upsert: false });
          if (retry.error) {
            console.error('upload error (retry)', retry.error);
            return null;
          }
        } else {
          console.error('upload error', firstAttempt.error);
          return null;
        }
      }
      const { data } = supabase.storage.from(bucketUsed).getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('upload exception', e);
      return null;
    }
  };

  const pickImages = async () => {
    if (useGalleryCreateDraftStore.getState().pickedVideo) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permission.required', 'Permission Required'), t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 1.0,
      selectionLimit: GALLERY_MAX_IMAGES,
      base64: false,
    });
    if (!result.canceled && result.assets?.length) {
      const immediate = pickedAssetsFromPicker(result.assets).slice(0, GALLERY_MAX_IMAGES);
      // Persist in Zustand immediately so UI updates even if this screen remounts while the picker closes (Android).
      useGalleryCreateDraftStore.getState().setPickedAssets(immediate);

      try {
        const compressedImages = await compressImages(
          result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height })),
          {
            quality: 0.7,
            maxWidth: 1200,
            maxHeight: 1200,
            format: 'jpeg',
          }
        );

        useGalleryCreateDraftStore.getState().setPickedAssets(
          compressedImages
            .slice(0, GALLERY_MAX_IMAGES)
            .map((compressed, index) => ({
              uri: compressed.uri,
              base64: null,
              mimeType: 'image/jpeg',
              fileName: `compressed_${Date.now()}_${index}.jpg`,
            }))
        );
      } catch (error) {
        console.error('Error compressing images:', error);
        // Originals already in store from immediate update above
      }
    }
  };

  const pickVideoForCreate = async () => {
    if (useGalleryCreateDraftStore.getState().pickedAssets.length > 0) return;

    if (Platform.OS === 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('permission.required', 'Permission Required'),
          t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images')
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(getGalleryVideoPickerOptions());
      if (result.canceled || !result.assets[0]) return;
      await commitPickedGalleryVideo(result.assets[0], 'create');
      return;
    }

    shortVideoPickerRoleRef.current = 'create';
    setShortVideoPickerOpen(true);
  };

  const openEdit = (design: Design) => {
    setDeleteMode(false);
    setSelectedDesign(design);
    setEditName(design.name);
    setEditSelectedUserId(design.user_id || (adminUsers.length > 0 ? adminUsers[0].id : ''));
    const urls = design.image_urls && design.image_urls.length > 0 ? design.image_urls : [design.image_url];
    setEditImages(
      urls.filter(Boolean).map((u) => ({
        kind: 'remote' as const,
        url: u,
        mediaType: isVideoUrl(u) ? ('video' as const) : ('image' as const),
      }))
    );
    setEditStep(1);
    setEditVisible(true);
  };

  const closeEdit = useCallback(() => {
    setEditVisible(false);
    setEditStep(1);
    setSelectedDesign(null);
    setEditName('');
    setEditSelectedUserId('');
    setEditImages([]);
    setIsSavingEdit(false);
  }, []);

  useEffect(() => {
    if (!editVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSavingEdit) return true;
      if (editStep === 2) {
        setEditStep(1);
        return true;
      }
      closeEdit();
      return true;
    });
    return () => sub.remove();
  }, [editVisible, isSavingEdit, editStep, closeEdit]);

  const editImageCount = editImages.filter((e) => e.mediaType === 'image').length;
  const editHasVideo = editImages.some((e) => e.mediaType === 'video');

  const addImagesToEdit = async () => {
    if (editHasVideo) return;
    if (editImageCount >= GALLERY_MAX_IMAGES) {
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.photoDropHint', 'עד 6 תמונות · דחיסה אוטומטית'));
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permission.required', 'Permission Required'), t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: GALLERY_MAX_IMAGES - editImageCount,
      quality: 1.0,
      base64: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      try {
        const compressedImages = await compressImages(
          result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height })),
          {
            quality: 0.7,
            maxWidth: 1200,
            maxHeight: 1200,
            format: 'jpeg',
          }
        );

        const newItems: EditMediaItem[] = compressedImages.map((compressed, index) => ({
          kind: 'local',
          mediaType: 'image',
          asset: {
            uri: compressed.uri,
            base64: null,
            mimeType: 'image/jpeg',
            fileName: `compressed_${Date.now()}_${index}.jpg`,
          },
        }));
        setEditImages((prev) => {
          const prevImg = prev.filter((e) => e.mediaType === 'image').length;
          const room = GALLERY_MAX_IMAGES - prevImg;
          const toAdd = newItems.slice(0, Math.max(0, room));
          return [...prev, ...toAdd];
        });
      } catch (error) {
        console.error('Error compressing images:', error);
        const fallback: EditMediaItem[] = pickedAssetsFromPicker(result.assets).map((asset) => ({
          kind: 'local' as const,
          mediaType: 'image' as const,
          asset,
        }));
        setEditImages((prev) => {
          const prevImg = prev.filter((e) => e.mediaType === 'image').length;
          const room = GALLERY_MAX_IMAGES - prevImg;
          const toAdd = fallback.slice(0, Math.max(0, room));
          return [...prev, ...toAdd];
        });
      }
    }
  };

  const addVideoToEdit = async () => {
    if (editImageCount > 0) return;
    if (editHasVideo) {
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.oneVideoOnly', 'ניתן לצרף סרטון אחד בלבד לעיצוב'));
      return;
    }

    if (Platform.OS === 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('permission.required', 'Permission Required'),
          t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images')
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(getGalleryVideoPickerOptions());
      if (result.canceled || !result.assets[0]) return;
      await commitPickedGalleryVideo(result.assets[0], 'edit');
      return;
    }

    shortVideoPickerRoleRef.current = 'edit';
    setShortVideoPickerOpen(true);
  };

  const saveEdit = async () => {
    if (!selectedDesign) return;
    if (!editName.trim()) {
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.nameRequired', 'Please enter a design name'));
      return;
    }
    try {
      setIsSavingEdit(true);
      const finalUrls: string[] = [];
      for (const item of editImages) {
        if (item.kind === 'remote') {
          if (item.url) finalUrls.push(item.url);
        } else {
          const uploaded = await uploadImage(item.asset);
          if (!uploaded) {
            Alert.alert(t('error.generic', 'Error'), t('admin.gallery.uploadOneFailed', 'Failed to upload one of the images'));
            setIsSavingEdit(false);
            return;
          }
          finalUrls.push(uploaded);
        }
      }
      if (finalUrls.length === 0) {
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.atLeastOneImageRequired', 'At least one image is required'));
        setIsSavingEdit(false);
        return;
      }

      const updated = await updateDesign(selectedDesign.id, {
        name: editName.trim(),
        image_url: finalUrls[0],
        image_urls: finalUrls,
        user_id: editSelectedUserId || undefined,
      });

      if (!updated) {
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.saveFailed', 'Failed to save design'));
        setIsSavingEdit(false);
        return;
      }

      closeEdit();
    } catch (e) {
      console.error('saveEdit error', e);
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.saveFailed', 'Failed to save design'));
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: string, imageUrls?: string[]) => {
    try {
      const ok = await deleteDesign(id);
      if (!ok) {
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.deleteFailed', 'Failed to delete design'));
        return;
      }
      if (imageUrls && imageUrls.length > 0) {
        const paths: string[] = [];
        for (const url of imageUrls) {
          if (url && url.includes('/storage/v1/object/public/designs/')) {
            const path = url.split('/storage/v1/object/public/designs/')[1];
            if (path) paths.push(path);
          }
        }
        if (paths.length > 0) {
          await supabase.storage.from('designs').remove(paths);
        }
      }
    } catch (e) {
      console.error('delete error', e);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.nameRequired', 'Please enter a design name'));
      return;
    }
    if (pickedAssets.length === 0 && !pickedVideo) {
      Alert.alert(
        t('error.generic', 'Error'),
        t('admin.gallery.atLeastOneMedia', 'נא לבחור לפחות תמונה אחת או וידאו')
      );
      return;
    }
    if (pickedAssets.length > 0 && pickedVideo) {
      Alert.alert(
        t('error.generic', 'Error'),
        t(
          'admin.gallery.mediaExclusiveConflict',
          'נא למחוק את הווידאו או את כל התמונות — לא ניתן לשלב בין השניים.'
        )
      );
      return;
    }

    try {
      setIsCreating(true);
      const urls: string[] = [];

      if (pickedAssets.length > 0) {
        for (let i = 0; i < pickedAssets.length; i++) {
          const asset = pickedAssets[i];
          const url = await uploadImage(asset);
          if (url) {
            urls.push(url);
          } else {
            Alert.alert(t('error.generic', 'Error'), t('admin.gallery.uploadIndexFailed', 'Failed to upload image {{num}}', { num: i + 1 }));
            setIsCreating(false);
            return;
          }
        }
      } else if (pickedVideo) {
        const vUrl = await uploadImage(pickedVideo);
        if (!vUrl) {
          Alert.alert(t('error.generic', 'Error'), t('admin.gallery.uploadVideoFailed', 'שגיאה בהעלאת הווידאו'));
          setIsCreating(false);
          return;
        }
        urls.push(vUrl);
      }

      if (urls.length === 0) {
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.uploadFailed', 'Failed to upload images'));
        setIsCreating(false);
        return;
      }

      const created = await createDesign({
        name: name.trim(),
        image_url: urls[0],
        image_urls: urls,
        user_id: selectedUserId || undefined,
      });

      if (created) {
        Alert.alert(t('success.generic', 'Success'), t('admin.gallery.createSuccess', 'Design added to gallery'));
        setName('');
        clearPickedAssets();
        setCreateVisible(false);
      } else {
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.createFailed', 'Failed to add design'));
      }
    } catch (e) {
      console.error('Error in handleCreate:', e);
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.createFailed', 'Failed to add design'));
    } finally {
      setIsCreating(false);
    }
  };

  const openCreateFromTab = useCallback(() => {
    if (isCreating) return;
    setDeleteMode(false);
    setReorderMode(false);
    setReorderDirty(false);
    setCreateVisible(true);
  }, [isCreating, setDeleteMode, setReorderMode, setReorderDirty]);

  const editTabBarActions = useMemo(
    () => ({
      openCreate: openCreateFromTab,
      commitReorder,
    }),
    [openCreateFromTab, commitReorder]
  );

  useEditGalleryTabBarRegistration(editTabBarActions);

  const tileSize = (windowWidth - styles._layout.paddingH * 2 - styles._layout.gap * (numColumns - 1)) / numColumns;

  const listEmpty = useMemo(() => {
    if (isLoading && designs.length === 0) return null;
    const isSearchEmpty = search.trim().length > 0 && filtered.length === 0;
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + '18' }]}>
          {isSearchEmpty ? <Search size={36} color={colors.primary} strokeWidth={1.75} /> : <LayoutGrid size={36} color={colors.primary} strokeWidth={1.75} />}
        </View>
        <Text style={styles.emptyTitle}>{isSearchEmpty ? t('admin.gallery.noSearchResults', 'No designs match your search') : t('admin.gallery.emptyTitle', 'No designs yet')}</Text>
        <Text style={styles.emptySubtitle}>
          {isSearchEmpty ? t('admin.gallery.tryDifferentSearch', 'Try another name or clear the search') : t('admin.gallery.emptySubtitle', 'Show clients your work — add your first photos.')}
        </Text>
      </View>
    );
  }, [colors.primary, designs.length, filtered.length, isLoading, search, styles, t]);

  const pageBg = colors.background;
  /** FAB + dim backdrop must sit above list; block main tree touches so Android does not deliver them to FlatList under the sheet. */
  const fabOverlayOpen = createVisible || editVisible;

  return (
    <View style={[styles.screen, { backgroundColor: pageBg }]}>
      <SafeAreaView
        edges={['top']}
        style={{ backgroundColor: pageBg }}
        pointerEvents={fabOverlayOpen ? 'none' : 'auto'}
      >
        <View style={[styles.searchRowWrap, { backgroundColor: pageBg }]}>
          <View
            style={[
              styles.searchRow,
              { direction: 'ltr' } as const,
              {
                backgroundColor: colors.text + '0A',
                ...Platform.select({
                  ios: {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 6,
                  },
                  android: { elevation: 0 },
                }),
              },
            ]}
          >
            <TextInput
              style={[
                styles.searchInput,
                {
                  color: colors.text,
                  /* Row is forced LTR so the magnifying glass stays on the physical right; keep text/placeholder flush to that side. */
                  textAlign: 'right',
                  writingDirection: 'rtl',
                  opacity: reorderMode ? 0.45 : 1,
                },
              ]}
              placeholder={t('admin.gallery.searchDesigns', 'חיפוש לפי שם')}
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="never"
              editable={!reorderMode}
            />
            {search.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={12}
                style={[styles.searchClearBtn, { backgroundColor: colors.text + '0D' }]}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear', 'נקה')}
              >
                <X size={17} color={colors.textSecondary} strokeWidth={2.25} />
              </TouchableOpacity>
            ) : null}
            <View style={[styles.searchIconBubble, { backgroundColor: colors.primary + '18' }]}>
              <Search size={19} color={colors.primary} strokeWidth={2.25} />
            </View>
          </View>
          {reorderMode ? (
            <View style={styles.reorderHintOuter}>
              <View
                style={[
                  styles.reorderHintCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.primary + '45',
                  },
                ]}
                accessible
                accessibilityLabel={`${t('admin.gallery.reorderHintDrag', '')}. ${t('admin.gallery.reorderHintSave', '')}`}
              >
                <View style={styles.reorderHintLines}>
                  <Text style={[styles.reorderHintLine, { color: colors.text }]}>
                    {t('admin.gallery.reorderHintDrag', 'גרירה: לחיצה ארוכה על הידית')}
                  </Text>
                  <Text style={[styles.reorderHintLine, styles.reorderHintLineSecond, { color: colors.text }]}>
                    {t('admin.gallery.reorderHintSave', 'שמירה: סימון הוי בשורת הכלים')}
                  </Text>
                </View>
                <View
                  style={[styles.reorderHintIconWrap, { backgroundColor: colors.primary + '18' }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Info size={16} color={colors.primary} strokeWidth={2.5} />
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['left', 'right']} style={[styles.bodySafe, { backgroundColor: pageBg }]}>
        <View style={[styles.contentMain, { backgroundColor: pageBg }]}>
          {isLoading && designs.length === 0 ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingLabel, { color: colors.textSecondary }]}>{t('common.loading', 'Loading...')}</Text>
            </View>
          ) : reorderMode ? (
            <DraggableFlatList
              data={reorderDisplayData}
              keyExtractor={(item) => item.id}
              onDragEnd={onReorderDragEnd}
              activationDistance={12}
              containerStyle={{ flex: 1 }}
              contentContainerStyle={[styles.listContent, styles.reorderListContent, { paddingBottom: 120 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isLoading && designs.length > 0}
                  onRefresh={fetchDesigns}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              renderItem={({ item, drag, isActive, getIndex }) => {
                const list = (item.image_urls && item.image_urls.length > 0 ? item.image_urls : [item.image_url]).filter(
                  Boolean
                ) as string[];
                const coverUri = (list.find((u) => !isVideoUrl(u)) ?? list[0] ?? '').trim();
                const coverIsVideo = isVideoUrl(coverUri);
                const pos = (getIndex() ?? 0) + 1;
                const desc = (item.description ?? '').trim();
                return (
                  <ScaleDecorator>
                    <View
                      style={[
                        styles.reorderRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          opacity: isActive ? 0.92 : 1,
                        },
                      ]}
                    >
                      {/* פס צבע מלא-גובה + עיגול לבן ומספר בצבע המותג */}
                      <View style={[styles.reorderPosRail, { backgroundColor: colors.primary }]}>
                        <View style={styles.reorderPosCircle}>
                          <Text
                            style={[styles.reorderPosText, { color: colors.primary }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                          >
                            {pos}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.reorderRowBody}>
                        <View style={styles.reorderRowSpacer} />
                        <View style={styles.reorderTextBesideThumb}>
                          <Text style={[styles.reorderTitleBesideThumb, { color: colors.text }]} numberOfLines={2}>
                            {item.name}
                          </Text>
                          {desc.length > 0 ? (
                            <Text
                              style={[styles.reorderDescBesideThumb, { color: colors.textSecondary }]}
                              numberOfLines={4}
                            >
                              {desc}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.reorderThumbWrap}>
                          {coverIsVideo ? (
                            <View style={[styles.reorderThumb, { backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center' }]}>
                              <Ionicons name="play-circle" size={28} color="rgba(255,255,255,0.9)" />
                            </View>
                          ) : (
                            <ExpoImage
                              source={{ uri: coverUri }}
                              style={styles.reorderThumb}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={120}
                            />
                          )}
                        </View>
                        <Pressable
                          onLongPress={drag}
                          delayLongPress={200}
                          disabled={isActive}
                          style={(state) => [
                            styles.reorderDragHandle,
                            { opacity: state.pressed || isActive ? 0.75 : 1 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={t('admin.gallery.reorderDragHandle', 'גרירה לשינוי סדר')}
                        >
                          <GripVertical size={24} color={colors.textSecondary} strokeWidth={2} />
                        </Pressable>
                      </View>
                    </View>
                  </ScaleDecorator>
                );
              }}
              ListEmptyComponent={listEmpty}
            />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={numColumns}
              renderItem={({ item, index }) => {
                const list = (item.image_urls && item.image_urls.length > 0 ? item.image_urls : [item.image_url]).filter(Boolean) as string[];
                const imageCount = list.length > 1 ? list.length : null;
                const coverUri = (list.find((u) => !isVideoUrl(u)) ?? list[0] ?? '').trim();
                const coverIsVideo = isVideoUrl(coverUri);
                return (
                  <View
                    style={[
                      styles.tileWrap,
                      {
                        width: tileSize,
                        marginRight: index % numColumns === 0 ? styles._layout.gap : 0,
                      },
                    ]}
                  >
                    <TouchableOpacity activeOpacity={0.88} onPress={() => openEdit(item)} style={styles.tileInner} accessibilityRole="button" accessibilityLabel={item.name}>
                      {coverIsVideo ? (
                        <View style={[styles.tileImage, { backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
                        </View>
                      ) : (
                        <ExpoImage
                          source={{ uri: coverUri }}
                          style={styles.tileImage}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={180}
                        />
                      )}
                      {/* Top gradient (softens the badge area) */}
                      <LinearGradient
                        colors={['rgba(0,0,0,0.38)', 'transparent']}
                        style={styles.tileGradientTop}
                        pointerEvents="none"
                      />
                      {/* Bottom gradient with name + eye */}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.88)']}
                        style={styles.tileGradient}
                        pointerEvents="box-none"
                      >
                        {/* Eye stays physical left; name+count flush to physical right (force LTR row) */}
                        <View style={styles.tileBottomRow}>
                          <Pressable
                            onPress={() => {
                              const imgs = item.image_urls && item.image_urls.length > 0 ? item.image_urls : [item.image_url];
                              setViewerImages(imgs.filter(Boolean) as string[]);
                              setViewerIndex(0);
                              setViewerVisible(true);
                            }}
                            hitSlop={10}
                            style={({ pressed }) => [
                              styles.tileEyeBtn,
                              { opacity: pressed ? 0.6 : 1 },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={t('admin.gallery.viewImages', 'View images')}
                          >
                            <Ionicons name="eye-outline" size={20} color="#fff" />
                          </Pressable>
                          <View style={styles.tileTextBlock}>
                            <Text style={styles.tileName} numberOfLines={2}>
                              {item.name}
                            </Text>
                            {imageCount ? (
                              <View style={styles.tileImgCountRow}>
                                <Ionicons name="images-outline" size={11} color="rgba(255,255,255,0.75)" />
                                <Text style={styles.tileImgCount}>{imageCount}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </LinearGradient>
                      {/* Image count badge — top left */}
                      {imageCount ? (
                        <View style={styles.tileStackBadge} pointerEvents="none">
                          <Ionicons name="copy-outline" size={13} color="#fff" />
                          <Text style={styles.tileStackText}>{imageCount}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                    {deleteMode ? (
                      <Pressable
                        onPress={() => handleDelete(item.id, item.image_urls && item.image_urls.length > 0 ? item.image_urls : [item.image_url])}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('delete', 'Delete')}
                        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                        style={({ pressed }) => [
                          styles.tileDelete,
                          {
                            backgroundColor: pressed ? colors.error : colors.error + 'E6',
                          },
                        ]}
                      >
                        <Ionicons name="trash-outline" size={17} color="#fff" />
                      </Pressable>
                    ) : null}
                  </View>
                );
              }}
              ListEmptyComponent={listEmpty}
              contentContainerStyle={[styles.listContent, { paddingBottom: 120 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={isLoading && designs.length > 0} onRefresh={fetchDesigns} tintColor={colors.primary} colors={[colors.primary]} />}
            />
          )}
        </View>
      </SafeAreaView>

      <BottomSheetModal
        ref={createMediaSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={Math.round(windowHeight * 0.92)}
        enablePanDownToClose={!isCreating}
        backdropComponent={renderCreateGalleryBackdrop}
        onDismiss={() => {
          if (!isCreating) setCreateVisible(false);
        }}
        style={I18nManager.isRTL ? ({ direction: 'rtl' } as const) : ({ direction: 'ltr' } as const)}
        handleIndicatorStyle={gallerySheetChrome.handle}
        backgroundStyle={gallerySheetChrome.background}
        topInset={insets.top + 8}
        bottomInset={insets.bottom}
        keyboardBehavior="fillParent"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        animationConfigs={{ duration: 400 }}
      >
        <BottomSheetScrollView
          ref={createMediaSheetScrollRef}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            /* Gorhom mounts the sheet outside the normal tree — re-apply RTL so rows/chips mirror like the rest of the app */
            ...(I18nManager.isRTL ? ({ direction: 'rtl' as const } as const) : ({ direction: 'ltr' as const } as const)),
          }}
        >
          <View style={styles.gallerySheetHeader}>
            <Text style={[styles.gallerySheetTitle, { color: colors.text }]}>
              {createStep === 1
                ? t('admin.gallery.createStep1Title', 'בחירת תמונות')
                : t('admin.gallery.createStep2Title', 'שם לעיצוב')}
            </Text>
            <Text style={[styles.gallerySheetSubtitle, { color: colors.textSecondary }]}>
              {createStep === 1
                ? t('admin.gallery.createStep1Tagline', 'העלאת תמונה או סרטון לגלריה שלך')
                : t('admin.gallery.createStep2Subtitle', 'בחרו שם ברור שיופיע ללקוחות בגלריה.')}
            </Text>
          </View>

          {createStep === 1 ? (
            <>
              {adminUsers.length > 1 && (
                <View style={[styles.block, { opacity: isCreating ? 0.55 : 1 }]}>
                  <Text style={[styles.galleryTeamSelectLabel, { color: colors.textSecondary }]}>
                    {t('admin.gallery.selectAdmin', 'בחר/י איש צוות')}
                  </Text>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={adminUsers.length > 3}
                    keyboardShouldPersistTaps="handled"
                    style={styles.galleryTeamScroll}
                    contentContainerStyle={styles.galleryTeamRowScroll}
                  >
                    {adminUsers.map((user) => {
                      const on = selectedUserId === user.id;
                      const avatarUri = user.image_url?.trim();
                      return (
                        <TouchableOpacity
                          key={user.id}
                          onPress={() => !isCreating && setSelectedUserId(user.id)}
                          activeOpacity={0.88}
                          disabled={isCreating}
                          style={[
                            styles.galleryTeamPill,
                            {
                              borderColor: on ? colors.primary : colors.border,
                              backgroundColor: on ? colors.primary : colors.surface,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={user.name}
                        >
                          <View style={styles.galleryTeamPillAvatar}>
                            {avatarUri ? (
                              <ExpoImage
                                source={{ uri: avatarUri }}
                                style={styles.galleryTeamPillAvatarImg}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={100}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.galleryTeamPillAvatarFallback,
                                  {
                                    backgroundColor: on ? 'rgba(255,255,255,0.22)' : colors.text + '10',
                                  },
                                ]}
                              >
                                <Ionicons name="person" size={18} color={on ? '#fff' : colors.textSecondary} />
                              </View>
                            )}
                          </View>
                          <Text
                            style={[styles.galleryTeamPillLabel, { color: on ? '#fff' : colors.text }]}
                            numberOfLines={1}
                          >
                            {user.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.galleryMediaPickRow}>
                <TouchableOpacity
                  onPress={pickImages}
                  style={[
                    styles.galleryMediaPickTile,
                    {
                      width: galleryPickTileSize,
                      height: galleryPickTileSize,
                      borderColor: colors.primary + '55',
                      backgroundColor: colors.primary + '0C',
                      opacity: isCreating || pickedVideo ? 0.45 : 1,
                    },
                  ]}
                  activeOpacity={0.88}
                  disabled={isCreating || !!pickedVideo}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('admin.gallery.selectImages', 'בחר/י תמונות')}. ${t('admin.gallery.photoDropHint', 'עד 6 תמונות · דחיסה אוטומטית')}`}
                >
                  {pickedAssets.length > 0 ? (
                    <View style={[styles.galleryMediaPickBadgeAbs, { backgroundColor: colors.primary }]}>
                      <Text style={styles.countBadgeText}>{pickedAssets.length}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.galleryMediaPickTileIconWrap, { backgroundColor: colors.primary + '24' }]}>
                    <ImagePlus
                      size={Math.min(28, Math.max(22, Math.round(galleryPickTileSize * 0.17)))}
                      color={colors.primary}
                      strokeWidth={2}
                    />
                  </View>
                  <Text style={[styles.galleryMediaPickTileTitle, { color: colors.text }]} numberOfLines={2}>
                    {t('admin.gallery.selectImages', 'בחר/י תמונות')}
                  </Text>
                  <Text style={[styles.galleryMediaPickTileSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {t('admin.gallery.photoDropHint', 'עד 6 תמונות · דחיסה אוטומטית')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={pickVideoForCreate}
                  style={[
                    styles.galleryMediaPickTile,
                    {
                      width: galleryPickTileSize,
                      height: galleryPickTileSize,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: isCreating || isPreparingGalleryVideo || pickedAssets.length > 0 ? 0.45 : 1,
                    },
                  ]}
                  activeOpacity={0.88}
                  disabled={isCreating || isPreparingGalleryVideo || pickedAssets.length > 0}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('admin.gallery.addVideo', 'הוספת וידאו (אחד)')}. ${t('admin.gallery.videoMutedHint', 'עד 15 שניות · עד 2MB · עובד בלולאה')}`}
                >
                  {pickedVideo ? (
                    <View style={[styles.galleryMediaPickBadgeAbs, { backgroundColor: colors.primary }]}>
                      <Text style={styles.countBadgeText}>1</Text>
                    </View>
                  ) : null}
                  <View style={[styles.galleryMediaPickTileIconWrap, { backgroundColor: colors.text + '14' }]}>
                    <Clapperboard
                      size={Math.min(28, Math.max(22, Math.round(galleryPickTileSize * 0.17)))}
                      color={colors.textSecondary}
                      strokeWidth={2}
                    />
                  </View>
                  <Text style={[styles.galleryMediaPickTileTitle, { color: colors.text }]} numberOfLines={2}>
                    {t('admin.gallery.addVideo', 'הוספת וידאו (אחד)')}
                  </Text>
                  <Text style={[styles.galleryMediaPickTileSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {t('admin.gallery.videoMutedHint', 'עד 15 שניות · עד 2MB · עובד בלולאה')}
                  </Text>
                </TouchableOpacity>
              </View>

              {pickedAssets.length > 0 || pickedVideo ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    paddingVertical: 12,
                    width: '100%',
                    gap: createStep2Grid.gap,
                  }}
                >
                  {pickedAssets.map((item, index) => {
                    const s = createStep2Grid.thumbSize;
                    const r = Math.min(16, Math.round(s * 0.12));
                    const xSize = Math.min(30, Math.max(22, Math.round(s * 0.28)));
                    return (
                      <View
                        key={`${item.uri}-${index}`}
                        style={{
                          width: s,
                          height: s,
                          borderRadius: r,
                          overflow: 'hidden',
                          backgroundColor: colors.surface,
                          borderWidth: StyleSheet.hairlineWidth * 2,
                          borderColor: colors.border,
                          position: 'relative',
                        }}
                      >
                        <ExpoImage
                          source={{ uri: item.uri }}
                          style={styles.previewImg}
                          contentFit="cover"
                          cachePolicy="none"
                          transition={120}
                        />
                        <TouchableOpacity
                          onPress={() => setPickedAssets((prev) => prev.filter((_, i) => i !== index))}
                          style={[
                            styles.previewX,
                            {
                              backgroundColor: colors.error,
                              top: Math.max(4, Math.round(s * 0.05)),
                              end: Math.max(4, Math.round(s * 0.05)),
                              width: xSize,
                              height: xSize,
                              borderRadius: xSize / 2,
                            },
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          disabled={isCreating}
                        >
                          <Ionicons name="close" size={Math.min(16, Math.round(xSize * 0.5))} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  {pickedVideo ? (
                    (() => {
                      const s = createStep2Grid.thumbSize;
                      const r = Math.min(16, Math.round(s * 0.12));
                      const xSize = Math.min(30, Math.max(22, Math.round(s * 0.28)));
                      return (
                        <View
                          key={`vid-${pickedVideo.uri}`}
                          style={{
                            width: s,
                            height: s,
                            borderRadius: r,
                            overflow: 'hidden',
                            backgroundColor: colors.surface,
                            borderWidth: StyleSheet.hairlineWidth * 2,
                            borderColor: colors.border,
                            position: 'relative',
                          }}
                        >
                          <GalleryPickedVideoPreview
                            uri={pickedVideo.uri}
                            width={s}
                            height={s}
                            accentColor={colors.textSecondary}
                          />
                          <TouchableOpacity
                            onPress={() => setPickedVideo(null)}
                            style={[
                              styles.previewX,
                              {
                                backgroundColor: colors.error,
                                top: Math.max(4, Math.round(s * 0.05)),
                                end: Math.max(4, Math.round(s * 0.05)),
                                width: xSize,
                                height: xSize,
                                borderRadius: xSize / 2,
                              },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            disabled={isCreating}
                          >
                            <Ionicons name="close" size={Math.min(16, Math.round(xSize * 0.5))} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      );
                    })()
                  ) : null}
                </View>
              ) : null}

              <TouchableOpacity
                onPress={() => setCreateStep(2)}
                style={[
                  styles.fabPrimaryBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pickedAssets.length === 0 && !pickedVideo || isCreating ? 0.45 : 1,
                    marginTop: 8,
                  },
                ]}
                disabled={(pickedAssets.length === 0 && !pickedVideo) || isCreating}
                accessibilityRole="button"
                accessibilityLabel={t('admin.gallery.createNext', 'המשך')}
              >
                <Text style={styles.primaryBtnText}>{t('admin.gallery.createNext', 'המשך')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {createMediaCount > 0 ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    marginBottom: 10,
                    paddingVertical: 6,
                    width: '100%',
                    gap: createStep2Grid.gap,
                  }}
                >
                  {pickedAssets.slice(0, GALLERY_MAX_IMAGES).map((item, idx) => {
                    const s = createStep2Grid.thumbSize;
                    const r = Math.min(16, Math.round(s * 0.12));
                    return (
                      <View
                        key={`step2-${item.uri}-${idx}`}
                        style={{
                          width: s,
                          height: s,
                          borderRadius: r,
                          overflow: 'hidden',
                          backgroundColor: colors.surface,
                          borderWidth: StyleSheet.hairlineWidth * 2,
                          borderColor: colors.border,
                        }}
                      >
                        <ExpoImage
                          source={{ uri: item.uri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          cachePolicy="none"
                          transition={120}
                        />
                      </View>
                    );
                  })}
                  {pickedVideo ? (
                    <View
                      key={`step2-vid-${pickedVideo.uri}`}
                      style={{
                        width: createStep2Grid.thumbSize,
                        height: createStep2Grid.thumbSize,
                        borderRadius: Math.min(16, Math.round(createStep2Grid.thumbSize * 0.12)),
                        overflow: 'hidden',
                        backgroundColor: colors.surface,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: colors.border,
                        position: 'relative',
                      }}
                    >
                      <GalleryPickedVideoPreview
                        uri={pickedVideo.uri}
                        width={createStep2Grid.thumbSize}
                        height={createStep2Grid.thumbSize}
                        accentColor={colors.textSecondary}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View
                style={[
                  styles.createNameFieldWrap,
                  { borderBottomColor: colors.text + '22' },
                ]}
              >
                <BottomSheetTextInput
                  style={[styles.createNameInputLight, { color: colors.text }]}
                  placeholder={t('admin.gallery.namePlaceholder', 'כתבו כאן את שם העיצוב')}
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  editable={!isCreating}
                  returnKeyType="done"
                  maxLength={120}
                  accessibilityLabel={t('admin.gallery.nameLabel', 'שם לתצוגה')}
                  onFocus={() => scrollGalleryNameStepIntoView('create')}
                />
              </View>

              <View style={styles.createFooterRow}>
                <TouchableOpacity
                  onPress={handleCreate}
                  style={[
                    styles.fabPrimaryBtn,
                    styles.createPublishFlex,
                    { backgroundColor: colors.primary, opacity: isLoading || isCreating ? 0.85 : 1 },
                  ]}
                  disabled={isLoading || isCreating}
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.gallery.publish', 'פרסום')}
                >
                  {isCreating ? (
                    <View style={styles.rowCenter}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[styles.primaryBtnText, { marginStart: 10 }]}>{t('admin.gallery.uploadingImages', 'מעלה תמונות...')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryBtnText}>{isLoading ? t('common.loading', 'טוען...') : t('admin.gallery.publish', 'פרסום')}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setCreateStep(1)}
                  style={[styles.createBackBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  disabled={isCreating}
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.gallery.createBack', 'חזרה')}
                >
                  <Text style={[styles.createBackBtnText, { color: colors.text }]}>{t('admin.gallery.createBack', 'חזרה')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={editMediaSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={Math.round(windowHeight * 0.92)}
        enablePanDownToClose={!isSavingEdit}
        backdropComponent={renderEditGalleryBackdrop}
        onDismiss={closeEdit}
        style={I18nManager.isRTL ? ({ direction: 'rtl' } as const) : ({ direction: 'ltr' } as const)}
        handleIndicatorStyle={gallerySheetChrome.handle}
        backgroundStyle={gallerySheetChrome.background}
        topInset={insets.top + 8}
        bottomInset={insets.bottom}
        keyboardBehavior="fillParent"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        animationConfigs={{ duration: 400 }}
      >
        <BottomSheetScrollView
          ref={editMediaSheetScrollRef}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            ...(I18nManager.isRTL ? ({ direction: 'rtl' as const } as const) : ({ direction: 'ltr' as const } as const)),
          }}
        >
          <View style={styles.gallerySheetHeader}>
            <Text style={[styles.gallerySheetTitle, { color: colors.text }]}>
              {editStep === 1
                ? t('admin.gallery.createStep1Title', 'בחירת תמונות')
                : t('admin.gallery.createStep2Title', 'שם לעיצוב')}
            </Text>
            <Text style={[styles.gallerySheetSubtitle, { color: colors.textSecondary }]}>
              {editStep === 1
                ? t('admin.gallery.createStep1Tagline', 'העלאת תמונה או סרטון לגלריה שלך')
                : t('admin.gallery.createStep2Subtitle', 'בחרו שם ברור שיופיע ללקוחות בגלריה.')}
            </Text>
          </View>

            {editStep === 1 ? (
              <>
                {adminUsers.length > 1 && (
                  <View style={[styles.block, { opacity: isSavingEdit ? 0.55 : 1 }]}>
                    <Text style={[styles.galleryTeamSelectLabel, { color: colors.textSecondary }]}>
                      {t('admin.gallery.selectAdmin', 'בחר/י איש צוות')}
                    </Text>
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator={adminUsers.length > 3}
                      keyboardShouldPersistTaps="handled"
                      style={styles.galleryTeamScroll}
                      contentContainerStyle={styles.galleryTeamRowScroll}
                    >
                      {adminUsers.map((user) => {
                        const on = editSelectedUserId === user.id;
                        const avatarUri = user.image_url?.trim();
                        return (
                          <TouchableOpacity
                            key={user.id}
                            onPress={() => !isSavingEdit && setEditSelectedUserId(user.id)}
                            activeOpacity={0.88}
                            disabled={isSavingEdit}
                            style={[
                              styles.galleryTeamPill,
                              {
                                borderColor: on ? colors.primary : colors.border,
                                backgroundColor: on ? colors.primary : colors.surface,
                              },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={user.name}
                          >
                            <View style={styles.galleryTeamPillAvatar}>
                              {avatarUri ? (
                                <ExpoImage
                                  source={{ uri: avatarUri }}
                                  style={styles.galleryTeamPillAvatarImg}
                                  contentFit="cover"
                                  cachePolicy="memory-disk"
                                  transition={100}
                                />
                              ) : (
                                <View
                                  style={[
                                    styles.galleryTeamPillAvatarFallback,
                                    {
                                      backgroundColor: on ? 'rgba(255,255,255,0.22)' : colors.text + '10',
                                    },
                                  ]}
                                >
                                  <Ionicons name="person" size={18} color={on ? '#fff' : colors.textSecondary} />
                                </View>
                              )}
                            </View>
                            <Text
                              style={[styles.galleryTeamPillLabel, { color: on ? '#fff' : colors.text }]}
                              numberOfLines={1}
                            >
                              {user.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.galleryMediaPickRow}>
                  <TouchableOpacity
                    onPress={addImagesToEdit}
                    style={[
                      styles.galleryMediaPickTile,
                      {
                        width: galleryPickTileSize,
                        height: galleryPickTileSize,
                        borderColor: colors.primary + '55',
                        backgroundColor: colors.primary + '0C',
                        opacity: isSavingEdit || editHasVideo || editImageCount >= GALLERY_MAX_IMAGES ? 0.45 : 1,
                      },
                    ]}
                    activeOpacity={0.88}
                    disabled={isSavingEdit || editHasVideo || editImageCount >= GALLERY_MAX_IMAGES}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('admin.gallery.selectImages', 'בחר/י תמונות')}. ${t('admin.gallery.photoDropHint', 'עד 6 תמונות · דחיסה אוטומטית')}`}
                  >
                    {editImageCount > 0 ? (
                      <View style={[styles.galleryMediaPickBadgeAbs, { backgroundColor: colors.primary }]}>
                        <Text style={styles.countBadgeText}>{editImageCount}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.galleryMediaPickTileIconWrap, { backgroundColor: colors.primary + '24' }]}>
                      <ImagePlus
                        size={Math.min(28, Math.max(22, Math.round(galleryPickTileSize * 0.17)))}
                        color={colors.primary}
                        strokeWidth={2}
                      />
                    </View>
                    <Text style={[styles.galleryMediaPickTileTitle, { color: colors.text }]} numberOfLines={2}>
                      {t('admin.gallery.selectImages', 'בחר/י תמונות')}
                    </Text>
                    <Text style={[styles.galleryMediaPickTileSub, { color: colors.textSecondary }]} numberOfLines={2}>
                      {t('admin.gallery.photoDropHint', 'עד 6 תמונות · דחיסה אוטומטית')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={addVideoToEdit}
                    style={[
                      styles.galleryMediaPickTile,
                      {
                        width: galleryPickTileSize,
                        height: galleryPickTileSize,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        opacity:
                          isSavingEdit || isPreparingGalleryVideo || editHasVideo || editImageCount > 0 ? 0.45 : 1,
                      },
                    ]}
                    activeOpacity={0.88}
                    disabled={isSavingEdit || isPreparingGalleryVideo || editHasVideo || editImageCount > 0}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('admin.gallery.addVideo', 'הוספת וידאו (אחד)')}. ${t('admin.gallery.videoMutedHint', 'עד 15 שניות · עד 2MB · עובד בלולאה')}`}
                  >
                    {editHasVideo ? (
                      <View style={[styles.galleryMediaPickBadgeAbs, { backgroundColor: colors.primary }]}>
                        <Text style={styles.countBadgeText}>1</Text>
                      </View>
                    ) : null}
                    <View style={[styles.galleryMediaPickTileIconWrap, { backgroundColor: colors.text + '14' }]}>
                      <Clapperboard
                        size={Math.min(28, Math.max(22, Math.round(galleryPickTileSize * 0.17)))}
                        color={colors.textSecondary}
                        strokeWidth={2}
                      />
                    </View>
                    <Text style={[styles.galleryMediaPickTileTitle, { color: colors.text }]} numberOfLines={2}>
                      {t('admin.gallery.addVideo', 'הוספת וידאו (אחד)')}
                    </Text>
                    <Text style={[styles.galleryMediaPickTileSub, { color: colors.textSecondary }]} numberOfLines={2}>
                      {t('admin.gallery.videoMutedHint', 'עד 15 שניות · עד 2MB · עובד בלולאה')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {editImages.length > 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      alignItems: 'flex-start',
                      paddingVertical: 12,
                      width: '100%',
                      gap: editStep2Grid.gap,
                    }}
                  >
                    {editImages.map((item, index) => {
                      const uri = item.kind === 'local' ? item.asset.uri : item.url;
                      const isVid = item.mediaType === 'video';
                      const s = editStep2Grid.thumbSize;
                      const r = Math.min(16, Math.round(s * 0.12));
                      const xSize = Math.min(30, Math.max(22, Math.round(s * 0.28)));
                      return (
                        <View
                          key={`${uri}-${index}`}
                          style={{
                            width: s,
                            height: s,
                            borderRadius: r,
                            overflow: 'hidden',
                            backgroundColor: colors.surface,
                            borderWidth: StyleSheet.hairlineWidth * 2,
                            borderColor: colors.border,
                            position: 'relative',
                          }}
                        >
                          {isVid ? (
                            <GalleryPickedVideoPreview
                              uri={uri}
                              width={s}
                              height={s}
                              accentColor={colors.textSecondary}
                            />
                          ) : (
                            <ExpoImage
                              source={{ uri }}
                              style={styles.previewImg}
                              contentFit="cover"
                              cachePolicy="none"
                              transition={120}
                            />
                          )}
                          <TouchableOpacity
                            onPress={() => setEditImages((prev) => prev.filter((_, i) => i !== index))}
                            style={[
                              styles.previewX,
                              {
                                backgroundColor: colors.error,
                                top: Math.max(4, Math.round(s * 0.05)),
                                end: Math.max(4, Math.round(s * 0.05)),
                                width: xSize,
                                height: xSize,
                                borderRadius: xSize / 2,
                              },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            disabled={isSavingEdit}
                          >
                            <Ionicons name="close" size={Math.min(16, Math.round(xSize * 0.5))} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={() => setEditStep(2)}
                  style={[
                    styles.fabPrimaryBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: editImages.length === 0 || isSavingEdit ? 0.45 : 1,
                      marginTop: 8,
                    },
                  ]}
                  disabled={editImages.length === 0 || isSavingEdit}
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.gallery.createNext', 'המשך')}
                >
                  <Text style={styles.primaryBtnText}>{t('admin.gallery.createNext', 'המשך')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {editImages.length > 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      alignItems: 'flex-start',
                      marginBottom: 10,
                      paddingVertical: 6,
                      width: '100%',
                      gap: editStep2Grid.gap,
                    }}
                  >
                    {editImages.map((item, idx) => {
                      const uri = item.kind === 'local' ? item.asset.uri : item.url;
                      const isVid = item.mediaType === 'video';
                      const s = editStep2Grid.thumbSize;
                      const r = Math.min(16, Math.round(s * 0.12));
                      return (
                        <View
                          key={`edit-step2-${uri}-${idx}`}
                          style={{
                            width: s,
                            height: s,
                            borderRadius: r,
                            overflow: 'hidden',
                            backgroundColor: colors.surface,
                            borderWidth: StyleSheet.hairlineWidth * 2,
                            borderColor: colors.border,
                            position: 'relative',
                          }}
                        >
                          {isVid ? (
                            <GalleryPickedVideoPreview
                              uri={uri}
                              width={s}
                              height={s}
                              accentColor={colors.textSecondary}
                            />
                          ) : (
                            <ExpoImage
                              source={{ uri }}
                              style={{ width: '100%', height: '100%' }}
                              contentFit="cover"
                              cachePolicy="none"
                              transition={120}
                            />
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <View style={[styles.createNameFieldWrap, { borderBottomColor: colors.text + '22' }]}>
                  <BottomSheetTextInput
                    style={[styles.createNameInputLight, { color: colors.text }]}
                    placeholder={t('admin.gallery.namePlaceholder', 'כתבו כאן את שם העיצוב')}
                    placeholderTextColor={colors.textSecondary}
                    value={editName}
                    onChangeText={setEditName}
                    editable={!isSavingEdit}
                    returnKeyType="done"
                    maxLength={120}
                    accessibilityLabel={t('admin.gallery.nameLabel', 'שם לתצוגה')}
                    onFocus={() => scrollGalleryNameStepIntoView('edit')}
                  />
                </View>

                <View style={styles.createFooterRow}>
                  <TouchableOpacity
                    onPress={saveEdit}
                    style={[
                      styles.fabPrimaryBtn,
                      styles.createPublishFlex,
                      { backgroundColor: colors.primary, opacity: isSavingEdit ? 0.85 : 1 },
                    ]}
                    disabled={isSavingEdit}
                    accessibilityRole="button"
                    accessibilityLabel={t('save', 'שמירה')}
                  >
                    {isSavingEdit ? (
                      <View style={styles.rowCenter}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={[styles.primaryBtnText, { marginStart: 10 }]}>{t('admin.gallery.uploadingImages', 'מעלה תמונות...')}</Text>
                      </View>
                    ) : (
                      <Text style={styles.primaryBtnText}>{t('save', 'שמירה')}</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setEditStep(1)}
                    style={[styles.createBackBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    disabled={isSavingEdit}
                    accessibilityRole="button"
                    accessibilityLabel={t('admin.gallery.createBack', 'חזרה')}
                  >
                    <Text style={[styles.createBackBtnText, { color: colors.text }]}>{t('admin.gallery.createBack', 'חזרה')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* ───────── Image viewer modal ───────── */}
      {viewerVisible ? (
        <View style={styles.viewerRoot}>
          {/* Close */}
          <Pressable
            style={styles.viewerClose}
            onPress={() => setViewerVisible(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('close', 'סגירה')}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {/* Counter */}
          {viewerImages.length > 1 ? (
            <View style={styles.viewerCounter} pointerEvents="none">
              <Text style={styles.viewerCounterText}>{viewerIndex + 1} / {viewerImages.length}</Text>
            </View>
          ) : null}
          {/* Swipeable images */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToAlignment="center"
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
              setViewerIndex(page);
            }}
            style={{ flex: 1 }}
          >
            {viewerImages.map((uri, idx) => (
              <View key={`viewer-${idx}`} style={[styles.viewerSlide, { width: windowWidth }]}>
                {isVideoUrl(uri) ? (
                  <Video
                    source={{ uri: uri.trim() }}
                    style={styles.viewerImage}
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping
                    shouldPlay
                    isMuted
                    useNativeControls={false}
                  />
                ) : (
                  <ExpoImage
                    source={{ uri: uri.trim() }}
                    style={styles.viewerImage}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={120}
                  />
                )}
              </View>
            ))}
          </ScrollView>
          {/* Dot indicators */}
          {viewerImages.length > 1 ? (
            <View style={styles.viewerDots} pointerEvents="none">
              {viewerImages.map((_, idx) => (
                <View
                  key={`dot-${idx}`}
                  style={[
                    styles.viewerDot,
                    { backgroundColor: idx === viewerIndex ? '#fff' : 'rgba(255,255,255,0.38)' },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
          ) : null}

      <ShortGalleryVideoPickerModal
        visible={shortVideoPickerOpen}
        onClose={() => setShortVideoPickerOpen(false)}
        onResolvedPick={onShortVideoResolvedFromModal}
        t={t}
      />

      {/*
        Avoid React Native <Modal> here — on Android, dismissing a Modal can permanently
        break the touch responder system, leaving the whole screen unresponsive.
        A plain absolute overlay has the same visual effect with none of the side-effects.
      */}
      {isPreparingGalleryVideo ? (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
            zIndex: 99999,
            ...Platform.select({ android: { elevation: 99 } }),
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              paddingVertical: 22,
              paddingHorizontal: 24,
              borderRadius: 16,
              alignItems: 'center' as const,
              maxWidth: 300,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            }}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 14, textAlign: 'center' as const, color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' as const }}>
              {t('admin.gallery.preparingVideo', 'מכינים את הווידאו…')}
            </Text>
            <Text style={{ marginTop: 8, textAlign: 'center' as const, color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {t('admin.gallery.preparingVideoSub', 'בודקים אורך ומכווצים עד 2MB')}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Probe is off-screen so its native TextureView layer never overlaps visible UI */}
      <Video
        ref={videoDurationProbeRef}
        pointerEvents="none"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999, top: -9999 }}
        useNativeControls={false}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors, windowWidth: number, windowHeight: number, layoutRtl: boolean) {
  const paddingH = 20;
  const gap = 10;
  const layout = { paddingH, gap };

  return {
    _layout: layout,
    screen: { flex: 1 },
    bodySafe: { flex: 1 },
    /** Full-width content on same background as header — no gray “card” or top curve */
    contentMain: {
      flex: 1,
      paddingTop: 4,
    },
    searchRowWrap: {
      paddingHorizontal: paddingH,
      paddingTop: 8,
      paddingBottom: 14,
    },
    searchIconBubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchClearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.38)',
      zIndex: 10000,
      ...Platform.select({
        ios: {},
        android: { elevation: 12 },
      }),
    },
    fabSheetHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      direction: 'ltr',
      gap: 8,
      marginBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingBottom: 12,
    },
    /** Pushes title block + close to the physical right (Hebrew RTL). */
    fabSheetHeaderSpacer: {
      flex: 1,
      minWidth: 0,
    },
    fabHeaderCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    fabSheetHeaderBody: {
      alignItems: 'flex-end',
      flexShrink: 1,
      minWidth: 0,
      maxWidth: '100%',
    },
    fabSheetTitle: {
      fontSize: 21,
      fontWeight: '700',
      width: '100%',
      textAlign: 'right',
      letterSpacing: -0.35,
      lineHeight: 28,
    },
    fabSheetSubtitle: {
      fontSize: 13,
      marginTop: 4,
      lineHeight: 19.5,
      width: '100%',
      textAlign: 'right',
      opacity: 0.92,
    },
    /** Bottom sheet header — aligned with manager settings booking-window sheets */
    gallerySheetHeader: {
      alignItems: 'center' as const,
      paddingBottom: 14,
      marginBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    gallerySheetTitle: {
      fontSize: 17,
      fontWeight: '700' as const,
      textAlign: 'center' as const,
      alignSelf: 'stretch' as const,
      letterSpacing: -0.25,
    },
    gallerySheetSubtitle: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500' as const,
      textAlign: 'center' as const,
      alignSelf: 'stretch' as const,
    },
    /** Minimal free-text line — underline only, no inner title */
    createNameFieldWrap: {
      marginTop: 14,
      marginHorizontal: 2,
      borderBottomWidth: StyleSheet.hairlineWidth * 2,
      paddingBottom: 4,
    },
    createNameInputLight: {
      fontSize: 17,
      fontWeight: '400',
      textAlign: 'right',
      writingDirection: 'rtl' as const,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
      paddingHorizontal: 0,
      margin: 0,
      letterSpacing: 0.15,
      lineHeight: 24,
    },
    createFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 22,
    },
    createBackBtn: {
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth * 2,
    },
    createBackBtnText: { fontSize: 16, fontWeight: '700' },
    createPublishFlex: { flex: 1, marginTop: 0, minWidth: 0 },
    fabTextRight: {
      textAlign: 'right',
      textTransform: 'none',
      letterSpacing: 0,
    },
    fabFieldInput: {
      minHeight: Platform.OS === 'ios' ? 50 : 48,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 26,
      borderWidth: 0,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      padding: 0,
      margin: 0,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    },
    listContent: {
      paddingHorizontal: paddingH,
      paddingTop: 6,
      flexGrow: 1,
    },
    reorderHintOuter: {
      width: '100%' as const,
      marginTop: 10,
      alignItems: 'center' as const,
    },
    reorderHintCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      /* LTR row: טקסט משמאל, אייקון מימין — קבוע לפי צדדי המסך */
      direction: 'ltr' as const,
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      maxWidth: Math.min(300, windowWidth - paddingH * 2 - 8),
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.07,
          shadowRadius: 6,
        },
        android: { elevation: 1 },
      }),
    },
    reorderHintLines: {
      flexShrink: 1,
      minWidth: 0,
      alignItems: 'flex-end' as const,
    },
    reorderHintLine: {
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'right' as const,
      writingDirection: 'rtl' as const,
      fontWeight: '600' as const,
    },
    reorderHintLineSecond: {
      marginTop: 3,
      fontWeight: '500' as const,
      opacity: 0.92,
    },
    reorderHintIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      flexShrink: 0,
    },
    reorderListContent: {
      paddingTop: 4,
    },
    reorderRow: {
      flexDirection: 'row' as const,
      direction: 'ltr' as const,
      alignItems: 'stretch' as const,
      marginBottom: gap,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden' as const,
    },
    reorderRowBody: {
      flex: 1,
      flexDirection: 'row' as const,
      direction: 'ltr' as const,
      alignItems: 'center' as const,
      minWidth: 0,
      paddingVertical: 10,
      paddingHorizontal: 10,
      gap: 10,
    },
    reorderPosRail: {
      width: 52,
      flexShrink: 0,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    reorderPosCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#fff',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 4,
    },
    reorderRowSpacer: {
      flex: 1,
      minWidth: 6,
    },
    reorderTextBesideThumb: {
      flexShrink: 1,
      minWidth: 0,
      maxWidth: '46%' as const,
      alignItems: 'flex-end' as const,
    },
    reorderTitleBesideThumb: {
      fontSize: 15,
      fontWeight: '700' as const,
      textAlign: 'right' as const,
      writingDirection: 'rtl' as const,
      width: '100%' as const,
    },
    reorderDescBesideThumb: {
      marginTop: 4,
      fontSize: 12.5,
      lineHeight: 17,
      textAlign: 'right' as const,
      writingDirection: 'rtl' as const,
      width: '100%' as const,
    },
    reorderDragHandle: {
      paddingVertical: 8,
      paddingHorizontal: 4,
      justifyContent: 'center' as const,
    },
    reorderThumbWrap: {
      width: 72,
      height: 72,
      borderRadius: 12,
      overflow: 'hidden' as const,
      flexShrink: 0,
    },
    reorderThumb: { width: '100%' as const, height: '100%' as const },
    reorderPosText: {
      fontSize: 15,
      fontWeight: '800' as const,
      textAlign: 'center' as const,
    },
    tileWrap: {
      marginBottom: gap,
      aspectRatio: 3 / 4,
      borderRadius: 22,
      position: 'relative',
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18 },
        android: { elevation: 7 },
      }),
    },
    tileInner: {
      flex: 1,
      borderRadius: 22,
      overflow: 'hidden',
    },
    tileImage: { width: '100%', height: '100%' },
    tileGradientTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
    },
    tileGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      paddingTop: 52,
      paddingBottom: 12,
      justifyContent: 'flex-end',
    },
    /** LTR row: eye fixed left, text block grows and aligns to card’s right edge */
    tileBottomRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      direction: 'ltr',
    },
    tileTextBlock: {
      flex: 1,
      minWidth: 0,
      marginLeft: 8,
      alignItems: 'flex-end',
    },
    tileName: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'right',
      lineHeight: 20,
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    tileImgCountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
      marginTop: 3,
    },
    tileImgCount: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 11,
      fontWeight: '600',
    },
    tileEyeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    tileStackBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    tileStackText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    /* ── Image viewer ── */
    viewerRoot: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000',
      zIndex: 99999,
    },
    viewerClose: {
      position: 'absolute',
      top: 56,
      right: 20,
      zIndex: 10,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerCounter: {
      position: 'absolute',
      top: 60,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 10,
    },
    viewerCounterText: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 14,
      fontWeight: '600',
    },
    viewerSlide: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerImage: {
      width: '100%',
      height: '100%',
    },
    viewerDots: {
      position: 'absolute',
      bottom: 44,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 7,
    },
    viewerDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    tileDelete: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
    loadingLabel: { marginTop: 14, fontSize: 15, fontWeight: '500' },
    emptyWrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 28, paddingBottom: 40 },
    emptyIconCircle: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 8 },
    emptySubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
    fieldLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
    /** "בחר/י איש צוות" — centered with the pill row below */
    galleryTeamSelectLabel: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center' as const,
      alignSelf: 'stretch' as const,
    },
    block: { marginTop: 4 },
    /** Horizontal strip; many admins scroll instead of wrapping. */
    galleryTeamScroll: {
      marginTop: 4,
      alignSelf: 'stretch',
      direction: layoutRtl ? 'rtl' : 'ltr',
    },
    galleryTeamRowScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 0,
      direction: layoutRtl ? 'rtl' : 'ltr',
      /** Few pills: full width, row centered under the title. */
      flexGrow: 1,
      justifyContent: 'center',
    },
    /**
     * Pill: [avatar, name] in DOM. RTL `row` → avatar at main-start (visual right). LTR `row-reverse`
     * → same visual (name left, avatar right) for Hebrew-style chips.
     */
    galleryTeamPill: {
      flexDirection: layoutRtl ? ('row' as const) : ('row-reverse' as const),
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
      paddingVertical: 4,
      paddingStart: layoutRtl ? 4 : 14,
      paddingEnd: layoutRtl ? 14 : 4,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth * 2,
      maxWidth: 280,
    },
    galleryTeamPillAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
    },
    galleryTeamPillAvatarImg: {
      width: '100%',
      height: '100%',
    },
    galleryTeamPillAvatarFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    galleryTeamPillLabel: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: 14,
      fontWeight: '600',
    },
    fabPrimaryBtn: {
      marginTop: 20,
      borderRadius: 16,
      paddingVertical: 16,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.28,
          shadowRadius: 10,
        },
        android: { elevation: 3 },
      }),
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
    rowCenter: { flexDirection: 'row', alignItems: 'center' },
    galleryMediaPickRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 12,
      width: '100%' as const,
      marginTop: 8,
    },
    galleryMediaPickTile: {
      position: 'relative' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth * 2,
      paddingVertical: 8,
      paddingHorizontal: 6,
      flexShrink: 0,
      overflow: 'hidden' as const,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        android: { elevation: 1 },
      }),
    },
    galleryMediaPickBadgeAbs: {
      position: 'absolute' as const,
      top: 8,
      end: 8,
      zIndex: 2,
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 7,
    },
    galleryMediaPickTileIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: 2,
    },
    galleryMediaPickTileTitle: {
      fontSize: 13,
      fontWeight: '700' as const,
      textAlign: 'center' as const,
      width: '100%' as const,
      paddingHorizontal: 2,
    },
    galleryMediaPickTileSub: {
      fontSize: 10,
      lineHeight: 14,
      marginTop: 4,
      textAlign: 'center' as const,
      width: '100%' as const,
      paddingHorizontal: 2,
    },
    countBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    previewImg: { width: '100%', height: '100%' },
    previewX: {
      position: 'absolute',
      top: 5,
      end: 5,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      elevation: 3,
    },
  };
}
