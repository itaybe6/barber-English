import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  BackHandler,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import { LinearGradient } from 'expo-linear-gradient';
import { useDesignsStore } from '@/stores/designsStore';
import type { Design, User } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { usersApi } from '@/lib/api/users';
import { compressImages } from '@/lib/utils/imageCompression';
import { useTranslation } from 'react-i18next';
import { Search, ImagePlus, LayoutGrid, X } from 'lucide-react-native';
import { useColors, type ThemeColors } from '@/src/theme/ThemeProvider';
import { FabButton } from '@/components/FabButton';

const numColumns = 2;

export default function EditGalleryScreen() {
  const { t: tRoot } = useTranslation();
  const t = useCallback(
    (key: string, defaultValue?: string, options?: Record<string, unknown>) =>
      tRoot(key, { ...(options ?? {}), defaultValue, lng: 'he' } as object),
    [tRoot]
  );
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [keyboardH, setKeyboardH] = useState(0);
  const colors = useColors();

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const styles = useMemo(() => createStyles(colors, windowWidth, windowHeight), [colors, windowWidth, windowHeight]);

  const { designs, fetchDesigns, createDesign, deleteDesign, updateDesign, isLoading } = useDesignsStore();

  const [name, setName] = useState('');
  const [pickedAssets, setPickedAssets] = useState<Array<{ uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }>>([]);
  const [search, setSearch] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const [editVisible, setEditVisible] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [editName, setEditName] = useState('');
  const [editSelectedUserId, setEditSelectedUserId] = useState<string>('');
  type LocalAsset = { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null };
  type EditImage = { kind: 'remote'; url: string } | { kind: 'local'; asset: LocalAsset };
  const [editImages, setEditImages] = useState<EditImage[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchDesigns();
    loadAdminUsers();
  }, []);

  useEffect(() => {
    if (!createVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isCreating) return true;
      setCreateVisible(false);
      return true;
    });
    return () => sub.remove();
  }, [createVisible, isCreating]);

  const loadAdminUsers = async () => {
    try {
      const users = await usersApi.getAdminUsers();
      setAdminUsers(users);
      if (users.length > 0) {
        setSelectedUserId(users[0].id);
      }
    } catch (error) {
      console.error('Error loading admin users:', error);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return designs;
    return designs.filter((d) => d.name.toLowerCase().includes(q));
  }, [designs, search]);

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

  const uploadImage = async (asset: { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null }): Promise<string | null> => {
    try {
      let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
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

      const extGuess = (contentType.split('/')[1] || 'jpg').toLowerCase();
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permission.required', 'Permission Required'), t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 1.0,
      selectionLimit: 10,
      base64: false,
    });
    if (!result.canceled) {
      try {
        const imageUris = result.assets.map((a) => a.uri);
        const compressedImages = await compressImages(imageUris, {
          quality: 0.7,
          maxWidth: 1200,
          maxHeight: 1200,
          format: 'jpeg',
        });

        setPickedAssets(
          compressedImages.map((compressed, index) => ({
            uri: compressed.uri,
            base64: null,
            mimeType: 'image/jpeg',
            fileName: `compressed_${Date.now()}_${index}.jpg`,
          }))
        );
      } catch (error) {
        console.error('Error compressing images:', error);
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.processFailed', 'Failed to process selected images'));
      }
    }
  };

  const openEdit = (design: Design) => {
    setSelectedDesign(design);
    setEditName(design.name);
    setEditSelectedUserId(design.user_id || (adminUsers.length > 0 ? adminUsers[0].id : ''));
    const urls = design.image_urls && design.image_urls.length > 0 ? design.image_urls : [design.image_url];
    setEditImages(urls.map((u) => ({ kind: 'remote', url: u })));
    setEditVisible(true);
  };

  const closeEdit = () => {
    setEditVisible(false);
    setSelectedDesign(null);
    setEditName('');
    setEditSelectedUserId('');
    setEditImages([]);
    setIsSavingEdit(false);
  };

  const addImagesToEdit = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permission.required', 'Permission Required'), t('admin.gallery.permissionGallery', 'Please allow access to gallery to select images'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1.0,
      base64: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      try {
        const imageUris = result.assets.map((a) => a.uri);
        const compressedImages = await compressImages(imageUris, {
          quality: 0.7,
          maxWidth: 1200,
          maxHeight: 1200,
          format: 'jpeg',
        });

        const newItems: EditImage[] = compressedImages.map((compressed, index) => ({
          kind: 'local',
          asset: {
            uri: compressed.uri,
            base64: null,
            mimeType: 'image/jpeg',
            fileName: `compressed_${Date.now()}_${index}.jpg`,
          },
        }));
        setEditImages((prev) => [...prev, ...newItems]);
      } catch (error) {
        console.error('Error compressing images:', error);
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.processFailed', 'Failed to process selected images'));
      }
    }
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
    if (pickedAssets.length === 0) {
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.atLeastOne', 'Please select at least one image'));
      return;
    }

    try {
      setIsCreating(true);
      const urls: string[] = [];

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
        setPickedAssets([]);
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

  const toggleCreateFab = useCallback(() => {
    if (isCreating) return;
    setCreateVisible((open) => !open);
  }, [isCreating]);

  const closeCreateFab = useCallback(() => {
    if (!isCreating) setCreateVisible(false);
  }, [isCreating]);

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

  /**
   * Available height above keyboard for the FAB scroll area.
   * Subtracts: keyboard height, FAB bottom offset, header (title+subtitle ~90), panel padding.
   */
  const fabBottom = insets.bottom + 88;
  const fabHeaderH = 90;
  const fabPaddingV = 24;
  const fabMaxScrollH = Math.max(
    180,
    windowHeight - fabBottom - fabHeaderH - fabPaddingV - keyboardH - 16
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 6 }]}>
          <Search size={18} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('admin.gallery.searchDesigns', 'חיפוש לפי שם')}
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.clear', 'נקה')}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.bodySafe}>
        <View style={[styles.contentCurve, { backgroundColor: colors.surface }]}>
          {isLoading && designs.length === 0 ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingLabel, { color: colors.textSecondary }]}>{t('common.loading', 'Loading...')}</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={numColumns}
              renderItem={({ item, index }) => (
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
                    <Image source={{ uri: item.image_url }} style={styles.tileImage} resizeMode="cover" />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={styles.tileGradient}>
                      <Text style={styles.tileName} numberOfLines={2}>
                        {item.name}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id, item.image_urls && item.image_urls.length > 0 ? item.image_urls : [item.image_url])}
                    style={[styles.tileDelete, { backgroundColor: colors.error + 'E6' }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('delete', 'Delete')}
                  >
                    <Ionicons name="trash-outline" size={17} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={listEmpty}
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={isLoading && designs.length > 0} onRefresh={fetchDesigns} tintColor={colors.primary} colors={[colors.primary]} />}
            />
          )}
        </View>
      </SafeAreaView>

      {createVisible ? (
        <Pressable
          style={[styles.fabBackdrop, { paddingBottom: insets.bottom }]}
          onPress={closeCreateFab}
          accessibilityRole="button"
          accessibilityLabel={t('close', 'סגירה')}
        />
      ) : null}

      <FabButton
        isOpen={createVisible}
        onPress={toggleCreateFab}
        bottom={insets.bottom + 88}
        horizontalInset={20}
        openedSize={windowWidth * 0.92}
        closedSize={58}
        duration={480}
        grabberColor={colors.primary}
      >
        <View style={styles.fabSheetHeader}>
          <Text style={[styles.fabSheetTitle, { color: colors.text }]}>{t('admin.gallery.addDesign', 'הוספת עיצוב')}</Text>
          <Text style={[styles.fabSheetSubtitle, { color: colors.textSecondary }]}>
            {t('admin.gallery.helper', 'ניתן לבחור מספר תמונות. הראשונה תשמש כתמונת שער.')}
          </Text>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: fabMaxScrollH }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {adminUsers.length > 1 && (
            <View style={[styles.block, { opacity: isCreating ? 0.55 : 1 }]}>
              <Text style={[styles.fieldLabel, styles.fabTextRight, { color: colors.textSecondary }]}>{t('admin.gallery.selectAdmin', 'בחר/י מנהל')}</Text>
              <View style={styles.chipRow}>
                {adminUsers.map((user) => {
                  const on = selectedUserId === user.id;
                  return (
                    <TouchableOpacity
                      key={user.id}
                      onPress={() => !isCreating && setSelectedUserId(user.id)}
                      style={[
                        styles.chip,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        on && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      disabled={isCreating}
                    >
                      <Text style={[styles.chipText, { color: colors.text }, on && { color: '#fff', fontWeight: '600' }]}>{user.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={pickImages}
            style={[styles.pickCard, { borderColor: colors.primary + '55', backgroundColor: colors.primary + '0C' }]}
            activeOpacity={0.88}
            disabled={isCreating}
          >
            <View style={styles.pickTextCol}>
              <Text style={[styles.pickTitle, styles.fabTextRight, { color: colors.text }]}>{t('admin.gallery.selectImages', 'בחר/י תמונות')}</Text>
              <Text style={[styles.pickSub, styles.fabTextRight, { color: colors.textSecondary }]}>
                {t('admin.gallery.photoDropHint', 'עד 10 תמונות · דחיסה אוטומטית')}
              </Text>
            </View>
            <View style={styles.pickCardTrailing}>
              {pickedAssets.length > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.countBadgeText}>{pickedAssets.length}</Text>
                </View>
              ) : null}
              <View style={[styles.pickIconCircle, { backgroundColor: colors.primary + '24' }]}>
                <ImagePlus size={26} color={colors.primary} strokeWidth={2} />
              </View>
            </View>
          </TouchableOpacity>

          {pickedAssets.length > 0 && (
            <FlatList
              data={pickedAssets}
              keyExtractor={(item, idx) => `${item.uri}-${idx}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 12, gap: 10 }}
              renderItem={({ item, index }) => (
                <View style={styles.previewSlot}>
                  <Image source={{ uri: item.uri }} style={styles.previewImg} />
                  <TouchableOpacity
                    onPress={() => setPickedAssets((prev) => prev.filter((_, i) => i !== index))}
                    style={[styles.previewX, { backgroundColor: colors.error }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    disabled={isCreating}
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          <Text style={[styles.fieldLabel, styles.fabTextRight, { color: colors.textSecondary }]}>{t('admin.gallery.nameLabel', 'שם לתצוגה')}</Text>
          <TextInput
            style={[
              styles.fieldInput,
              styles.fabTextRight,
              styles.fabFieldInput,
              { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, opacity: isCreating ? 0.55 : 1 },
            ]}
            placeholder={t('admin.gallery.namePlaceholder', 'שם העיצוב')}
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            editable={!isCreating}
          />

          <TouchableOpacity
            onPress={handleCreate}
            style={[styles.fabPrimaryBtn, { backgroundColor: colors.primary, opacity: isLoading || isCreating ? 0.85 : 1 }]}
            disabled={isLoading || isCreating}
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
        </ScrollView>
      </FabButton>

      {/* Edit — bottom sheet */}
      <Modal
        visible={editVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isSavingEdit) closeEdit();
        }}
      >
        <View style={styles.sheetRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isSavingEdit) closeEdit();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('close', 'Close')}
          />
          <SafeAreaView edges={['bottom']} style={[styles.sheetCard, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetGrabber, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t('admin.gallery.editDesign', 'Edit Design')}</Text>
              <TouchableOpacity onPress={isSavingEdit ? undefined : closeEdit} style={[styles.sheetCloseBtn, { backgroundColor: colors.surface }]} disabled={isSavingEdit}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScreenScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 28 }}>
              <TouchableOpacity onPress={addImagesToEdit} activeOpacity={0.92} style={styles.coverTouch} disabled={isSavingEdit}>
                <Image
                  source={{
                    uri:
                      editImages[0] == null
                        ? selectedDesign?.image_url ?? ''
                        : editImages[0].kind === 'local'
                          ? editImages[0].asset.uri
                          : editImages[0].url,
                  }}
                  style={[styles.coverImage, { backgroundColor: colors.surface }]}
                  resizeMode="cover"
                />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.coverGradient} />
                <View style={styles.coverChip}>
                  <ImagePlus size={16} color="#fff" />
                  <Text style={styles.coverChipText}>{t('admin.gallery.coverImage', 'Cover Image')}</Text>
                </View>
              </TouchableOpacity>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('admin.gallery.nameLabel', 'Display name')}</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                placeholder={t('admin.gallery.namePlaceholder', 'Design name')}
                placeholderTextColor={colors.textSecondary}
                value={editName}
                onChangeText={setEditName}
                returnKeyType="done"
                editable={!isSavingEdit}
              />

              {adminUsers.length > 1 && (
                <View style={styles.block}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('admin.gallery.selectAdmin', 'Select Admin')}</Text>
                  <View style={styles.chipRow}>
                    {adminUsers.map((user) => {
                      const on = editSelectedUserId === user.id;
                      return (
                        <TouchableOpacity
                          key={user.id}
                          onPress={() => !isSavingEdit && setEditSelectedUserId(user.id)}
                          style={[
                            styles.chip,
                            { borderColor: colors.border, backgroundColor: colors.surface },
                            on && { backgroundColor: colors.primary, borderColor: colors.primary },
                          ]}
                          disabled={isSavingEdit}
                        >
                          <Text style={[styles.chipText, { color: colors.text }, on && { color: '#fff', fontWeight: '600' }]}>{user.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.thumbsHeader}>
                <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 0 }]}>{t('admin.gallery.designImages', 'Design Images')}</Text>
                <TouchableOpacity onPress={addImagesToEdit} style={[styles.miniBtn, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '33' }]} disabled={isSavingEdit}>
                  <Ionicons name="images-outline" size={16} color={colors.primary} />
                  <Text style={[styles.miniBtnText, { color: colors.primary }]}>{t('admin.gallery.addImages', 'Add Images')}</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={editImages}
                keyExtractor={(_, idx) => `edit-thumb-${idx}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 6, gap: 10 }}
                renderItem={({ item, index }) => (
                  <View style={styles.thumbWrap}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditImages((prev) => {
                          const next = [...prev];
                          const [spliced] = next.splice(index, 1);
                          next.unshift(spliced);
                          return next;
                        });
                      }}
                      activeOpacity={0.9}
                      disabled={isSavingEdit}
                    >
                      <Image source={{ uri: item.kind === 'local' ? item.asset.uri : item.url }} style={[styles.thumb, { backgroundColor: colors.surface }]} />
                      {index === 0 && (
                        <View style={[styles.coverPill, { backgroundColor: colors.primary }]}>
                          <Text style={styles.coverPillText}>{t('admin.gallery.cover', 'Cover')}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditImages((prev) => prev.filter((_, i) => i !== index))}
                      style={[styles.thumbRemove, { backgroundColor: colors.text + 'CC' }]}
                      disabled={isSavingEdit}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              />

              <TouchableOpacity
                onPress={saveEdit}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isSavingEdit ? 0.75 : 1 }]}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{t('save', 'Save')}</Text>}
              </TouchableOpacity>
            </KeyboardAwareScreenScroll>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors, windowWidth: number, windowHeight: number) {
  const paddingH = 20;
  const gap = 10;
  const layout = { paddingH, gap };

  return {
    _layout: layout,
    screen: { flex: 1 },
    bodySafe: { flex: 1 },
    contentCurve: {
      flex: 1,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingTop: 18,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 14 },
        android: { elevation: 0 },
      }),
    },
    fabBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.38)',
      zIndex: 10000,
    },
    fabSheetHeader: {
      width: '100%',
      paddingRight: 46,
      marginBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingBottom: 14,
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
      marginTop: 8,
      lineHeight: 19.5,
      width: '100%',
      textAlign: 'right',
      opacity: 0.92,
    },
    fabTextRight: {
      textAlign: 'right',
      textTransform: 'none',
      letterSpacing: 0,
    },
    fabFieldInput: {
      minHeight: Platform.OS === 'ios' ? 50 : 48,
    },
    pickTextCol: {
      flex: 1,
      minWidth: 0,
      paddingEnd: 8,
    },
    pickCardTrailing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: paddingH,
      marginBottom: 6,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 12 : 10,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 10,
    },
    searchInput: { flex: 1, fontSize: 16, padding: 0, margin: 0 },
    listContent: {
      paddingHorizontal: paddingH,
      paddingTop: 6,
      flexGrow: 1,
    },
    tileWrap: {
      marginBottom: gap,
      aspectRatio: 1,
      borderRadius: 18,
      position: 'relative',
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 14 },
        android: { elevation: 5 },
      }),
    },
    tileInner: {
      flex: 1,
      borderRadius: 18,
      overflow: 'hidden',
    },
    tileImage: { width: '100%', height: '100%' },
    tileGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      paddingTop: 28,
      paddingBottom: 11,
      justifyContent: 'flex-end',
    },
    tileName: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'left', lineHeight: 18 },
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
    sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheetCard: {
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 10,
      maxHeight: windowHeight * 0.92,
    },
    sheetGrabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
    sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 12 },
    sheetTitle: { fontSize: 20, fontWeight: '700' },
    sheetHint: { fontSize: 13, marginTop: 6, lineHeight: 18, maxWidth: windowWidth - 100 },
    sheetCloseBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    coverTouch: { borderRadius: 18, overflow: 'hidden', marginTop: 8, position: 'relative' },
    coverImage: { width: '100%', height: 200, borderRadius: 18 },
    coverGradient: { ...StyleSheet.absoluteFillObject },
    coverChip: {
      position: 'absolute',
      bottom: 14,
      left: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 14,
    },
    coverChipText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    fieldLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
    fieldInput: {
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === 'ios' ? 14 : 12,
      fontSize: 16,
      borderWidth: StyleSheet.hairlineWidth,
      textAlign: 'left',
    },
    block: { marginTop: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    chipText: { fontSize: 14, fontWeight: '500' },
    thumbsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 4 },
    miniBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
    },
    miniBtnText: { fontSize: 13, fontWeight: '700' },
    thumbWrap: { position: 'relative' },
    thumb: { width: 78, height: 78, borderRadius: 14 },
    coverPill: { position: 'absolute', bottom: 6, left: 6, right: 6, paddingVertical: 3, borderRadius: 8, alignItems: 'center' },
    coverPillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    thumbRemove: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtn: {
      marginTop: 22,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
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
    pickCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth * 2,
      marginTop: 8,
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
    pickIconCircle: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    pickTitle: { fontSize: 16, fontWeight: '700' },
    pickSub: { fontSize: 13, marginTop: 3, lineHeight: 18 },
    countBadge: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
    countBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    previewSlot: { position: 'relative' },
    previewImg: { width: 80, height: 80, borderRadius: 14 },
    previewX: {
      position: 'absolute',
      top: -5,
      right: -5,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
  };
}
