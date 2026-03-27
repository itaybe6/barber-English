import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Text,
  TouchableOpacity,
  Dimensions,
  Image,
  Platform,
  Modal,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Alert,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { designCategories } from '@/constants/designs';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Heart, Plus, X, ImagePlus, Sparkles, SlidersHorizontal } from 'lucide-react-native';
import { useColors } from '@/src/theme/ThemeProvider';
import { useDesignsStore } from '@/stores/designsStore';
import type { Design, User } from '@/lib/supabase';
import { KeyboardAwareScreenScroll } from '@/components/KeyboardAwareScreenScroll';
import * as ImagePicker from 'expo-image-picker';
import { compressImages } from '@/lib/utils/imageCompression';
import { supabase } from '@/lib/supabase';
import { usersApi } from '@/lib/api/users';

const { width } = Dimensions.get('window');
const numColumns = 2;
const horizontalPad = 12;
const tileGap = 8;
const tileSize = (width - horizontalPad * 2 - tileGap) / numColumns;

type PickedAsset = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
};

function guessMimeFromUri(uriOrName: string): string {
  const ext = uriOrName.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function base64ToUint8Array(base64: string): Uint8Array {
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
}

async function uploadDesignAsset(asset: PickedAsset): Promise<string | null> {
  try {
    let contentType = asset.mimeType || guessMimeFromUri(asset.fileName || asset.uri);
    let fileBody: Blob | Uint8Array;

    if (asset.base64) {
      fileBody = base64ToUint8Array(asset.base64);
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
}

export default function GalleryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const themeColors = useColors();

  const { designs, fetchDesigns, createDesign } = useDesignsStore();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  const [addVisible, setAddVisible] = useState(false);
  const [name, setName] = useState('');
  const [pickedAssets, setPickedAssets] = useState<PickedAsset[]>([]);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setListLoading(true);
      await fetchDesigns();
      if (mounted) setListLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [fetchDesigns]);

  const loadAdmins = useCallback(async () => {
    try {
      const users = await usersApi.getAdminUsers();
      setAdminUsers(users);
      if (users.length > 0) setSelectedUserId(users[0].id);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (addVisible) loadAdmins();
  }, [addVisible, loadAdmins]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDesigns();
    setRefreshing(false);
  }, [fetchDesigns]);

  const toggleFavorite = (designId: string) => {
    setFavorites((prev) => (prev.includes(designId) ? prev.filter((id) => id !== designId) : [...prev, designId]));
  };

  const filteredDesigns = useMemo(() => {
    return designs.filter((design) => {
      const matchesCategory = selectedCategory ? design.categories?.includes(selectedCategory) : true;
      return matchesCategory;
    });
  }, [designs, selectedCategory]);

  const coverUri = (d: Design) =>
    d.image_urls && d.image_urls.length > 0 ? d.image_urls[0] : d.image_url;

  const resetAddForm = () => {
    setName('');
    setPickedAssets([]);
    setIsCreating(false);
  };

  const closeAdd = () => {
    if (isCreating) return;
    setAddVisible(false);
    resetAddForm();
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permission.required', 'Permission Required'), t('admin.gallery.permissionGallery'));
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
        const compressedImages = await compressImages(
          result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height })),
          {
            quality: 0.7,
            maxWidth: 1200,
            maxHeight: 1200,
            format: 'jpeg',
          }
        );
        setPickedAssets(
          compressedImages.map((compressed, index) => ({
            uri: compressed.uri,
            base64: null,
            mimeType: 'image/jpeg',
            fileName: `compressed_${Date.now()}_${index}.jpg`,
          }))
        );
      } catch (error) {
        console.error(error);
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.processFailed'));
      }
    }
  };

  const setCoverAt = (index: number) => {
    if (index <= 0) return;
    setPickedAssets((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.nameRequired'));
      return;
    }
    if (pickedAssets.length === 0) {
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.atLeastOneImageRequired'));
      return;
    }

    try {
      setIsCreating(true);
      const urls: string[] = [];
      for (let i = 0; i < pickedAssets.length; i++) {
        const url = await uploadDesignAsset(pickedAssets[i]);
        if (url) urls.push(url);
        else {
          Alert.alert(t('error.generic', 'Error'), t('admin.gallery.uploadIndexFailed', { num: i + 1 }));
          setIsCreating(false);
          return;
        }
      }
      if (urls.length === 0) {
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.uploadFailed'));
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
        Alert.alert(t('success.generic', 'Success'), t('admin.gallery.createSuccess'));
        setAddVisible(false);
        resetAddForm();
      } else {
        Alert.alert(t('error.generic', 'Error'), t('admin.gallery.createFailed'));
      }
    } catch (e) {
      console.error(e);
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const canPublish = name.trim().length > 0 && pickedAssets.length > 0 && !isCreating;

  const primary = themeColors.primary;
  const surface = themeColors.surface;
  const text = themeColors.text;
  const textSecondary = themeColors.textSecondary;
  const border = themeColors.border;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.topBar, { borderBottomColor: border }]}>
        <View style={styles.topBarText}>
          <Text style={[styles.screenTitle, { color: text }]}>{t('admin.gallery.title', 'Gallery')}</Text>
          <Text style={[styles.screenSubtitle, { color: textSecondary }]} numberOfLines={1}>
            {t('admin.gallery.addSheetTitle', 'Add to gallery')}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.managePill, { backgroundColor: surface, borderColor: border }]}
          onPress={() => router.push('/(tabs)/edit-gallery')}
          accessibilityRole="button"
          accessibilityLabel={t('admin.gallery.manageFull', 'Edit & delete items')}
        >
          <SlidersHorizontal size={18} color={primary} />
          <Text style={[styles.managePillText, { color: text }]}>{t('admin.gallery.manageFull', 'Edit & delete')}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.categoriesContainer, { backgroundColor: themeColors.background }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <TouchableOpacity
            style={[
              styles.categoryChip,
              { backgroundColor: surface, borderColor: border },
              selectedCategory === null && { backgroundColor: primary, borderColor: primary },
            ]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text
              style={[
                styles.categoryChipText,
                { color: text },
                selectedCategory === null && styles.selectedCategoryChipText,
              ]}
            >
              {t('admin.gallery.all', 'All')}
            </Text>
          </TouchableOpacity>

          {designCategories.map((category, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.categoryChip,
                { backgroundColor: surface, borderColor: border },
                selectedCategory === category.id && { backgroundColor: primary, borderColor: primary },
              ]}
              onPress={() => setSelectedCategory(category.id)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  { color: text },
                  selectedCategory === category.id && styles.selectedCategoryChipText,
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {listLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primary} />
        </View>
      ) : (
        <FlatList
          data={filteredDesigns}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrap : undefined}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <LinearGradient colors={[`${primary}18`, `${primary}08`]} style={styles.emptyIconBg}>
                <ImagePlus size={36} color={primary} strokeWidth={1.5} />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: text }]}>{t('admin.gallery.emptyTitle')}</Text>
              <Text style={[styles.emptySubtitle, { color: textSecondary }]}>{t('admin.gallery.emptySubtitle')}</Text>
              <TouchableOpacity
                style={[styles.emptyCta, { backgroundColor: primary }]}
                onPress={() => setAddVisible(true)}
                activeOpacity={0.9}
              >
                <Sparkles size={18} color="#fff" />
                <Text style={styles.emptyCtaText}>{t('admin.gallery.emptyCta')}</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.tile, { width: tileSize, height: tileSize }]} onPress={() => {}} activeOpacity={0.92}>
              <View style={[styles.imageContainer, { borderColor: border }]}>
                <Image source={{ uri: coverUri(item) }} style={styles.image} resizeMode="cover" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={styles.gradient}>
                  <Text style={styles.designName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <View style={styles.categoryTags}>
                    {(item.categories || []).slice(0, 2).map((cat, idx) => (
                      <View key={idx} style={styles.categoryTag}>
                        <Text style={styles.categoryTagText}>{designCategories.find((c) => c.id === cat)?.name || cat}</Text>
                      </View>
                    ))}
                  </View>
                </LinearGradient>

                <TouchableOpacity
                  style={styles.favoriteButton}
                  onPress={() => toggleFavorite(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={t('favorites.toggle', 'Favorite')}
                >
                  <Heart size={20} color={Colors.white} fill={favorites.includes(item.id) ? Colors.error : 'transparent'} />
                </TouchableOpacity>

                <View style={styles.popularityContainer}>
                  {Array(5)
                    .fill(0)
                    .map((_, idx) => (
                      <View
                        key={idx}
                        style={[styles.popularityDot, idx < (item.popularity || 0) && { backgroundColor: primary }]}
                      />
                    ))}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={[
          styles.fab,
          { backgroundColor: primary },
          Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
            },
            android: { elevation: 8 },
          }),
        ]}
        onPress={() => setAddVisible(true)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={t('admin.gallery.addDesign', 'Add design')}
      >
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>

      <Modal visible={addVisible} animationType="slide" transparent onRequestClose={closeAdd}>
        <View style={styles.modalRoot}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,14,0.72)' }]} />
          )}

          <TouchableWithoutFeedback onPress={closeAdd}>
            <View
              style={styles.modalBackdropPress}
              accessible
              accessibilityRole="button"
              accessibilityLabel={t('close', 'Close')}
            />
          </TouchableWithoutFeedback>

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: themeColors.background }]}>
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: border }]} />
            </View>

            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetTitleBlock}>
                <LinearGradient colors={[`${primary}22`, `${primary}08`]} style={styles.sheetIconRing}>
                  <Sparkles size={22} color={primary} />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetTitle, { color: text }]}>{t('admin.gallery.addSheetTitle')}</Text>
                  <Text style={[styles.sheetSubtitle, { color: textSecondary }]}>{t('admin.gallery.addSheetSubtitle')}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={closeAdd}
                style={[styles.closeCircle, { backgroundColor: surface }]}
                disabled={isCreating}
                accessibilityRole="button"
              >
                <X size={20} color={textSecondary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScreenScroll
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              <View style={styles.stepRow}>
                <View style={[styles.stepPill, { backgroundColor: `${primary}14`, borderColor: `${primary}35` }]}>
                  <Text style={[styles.stepNum, { color: primary }]}>1</Text>
                  <Text style={[styles.stepLabel, { color: text }]}>{t('admin.gallery.designImages', 'Photos')}</Text>
                </View>
                <View style={[styles.stepLine, { backgroundColor: border }]} />
                <View style={[styles.stepPill, { backgroundColor: surface, borderColor: border }]}>
                  <Text style={[styles.stepNum, { color: textSecondary }]}>2</Text>
                  <Text style={[styles.stepLabel, { color: textSecondary }]}>{t('admin.gallery.nameLabel', 'Name')}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.dropZone, { borderColor: pickedAssets.length ? primary : border, backgroundColor: surface }]}
                onPress={pickImages}
                activeOpacity={0.85}
                disabled={isCreating}
              >
                <LinearGradient
                  colors={pickedAssets.length ? [`${primary}12`, 'transparent'] : [`${primary}08`, 'transparent']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <View style={[styles.dropIconCircle, { backgroundColor: `${primary}18` }]}>
                  <ImagePlus size={28} color={primary} strokeWidth={1.75} />
                </View>
                <Text style={[styles.dropTitle, { color: text }]}>{t('admin.gallery.photoDropTitle')}</Text>
                <Text style={[styles.dropHint, { color: textSecondary }]}>{t('admin.gallery.photoDropHint')}</Text>
                {pickedAssets.length > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: primary }]}>
                    <Text style={styles.countBadgeText}>{pickedAssets.length}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {pickedAssets.length > 0 && (
                <View style={styles.thumbsSection}>
                  <Text style={[styles.thumbsHint, { color: textSecondary }]}>{t('admin.gallery.tapForCover')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsRow}>
                    {pickedAssets.map((asset, index) => (
                      <View key={`${asset.uri}-${index}`} style={styles.thumbWrap}>
                        <TouchableOpacity
                          style={styles.thumbTouchable}
                          onPress={() => setCoverAt(index)}
                          activeOpacity={0.88}
                          disabled={isCreating}
                        >
                          <Image source={{ uri: asset.uri }} style={styles.thumbImage} />
                          {index === 0 && (
                            <View style={[styles.coverBadge, { backgroundColor: primary }]}>
                              <Text style={styles.coverBadgeText}>{t('admin.gallery.coverImage', 'Cover')}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.thumbRemove}
                          onPress={() => setPickedAssets((prev) => prev.filter((_, i) => i !== index))}
                          hitSlop={12}
                          disabled={isCreating}
                        >
                          <X size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {adminUsers.length > 1 && (
                <View style={[styles.fieldBlock, { opacity: isCreating ? 0.55 : 1 }]}>
                  <Text style={[styles.fieldLabel, { color: text }]}>{t('admin.gallery.selectAdmin', 'Select admin')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminRow}>
                    {adminUsers.map((user) => (
                      <TouchableOpacity
                        key={user.id}
                        onPress={() => !isCreating && setSelectedUserId(user.id)}
                        style={[
                          styles.adminChip,
                          { borderColor: border, backgroundColor: surface },
                          selectedUserId === user.id && { borderColor: primary, backgroundColor: `${primary}12` },
                        ]}
                        disabled={isCreating}
                      >
                        <Text
                          style={[
                            styles.adminChipText,
                            { color: text },
                            selectedUserId === user.id && { color: primary, fontFamily: 'FbPragmati-Bold' },
                          ]}
                        >
                          {user.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: text }]}>{t('admin.gallery.nameLabel')}</Text>
                <TextInput
                  style={[
                    styles.nameInput,
                    {
                      color: text,
                      backgroundColor: themeColors.background,
                      borderColor: border,
                    },
                    isCreating && { opacity: 0.55 },
                  ]}
                  placeholder={t('admin.gallery.namePlaceholder')}
                  placeholderTextColor={textSecondary}
                  value={name}
                  onChangeText={setName}
                  editable={!isCreating}
                />
              </View>

              <TouchableOpacity
                style={styles.publishTouchable}
                onPress={handleCreate}
                disabled={!canPublish}
                activeOpacity={0.92}
              >
                <LinearGradient
                  colors={canPublish ? [primary, `${primary}cc`] : [textSecondary, textSecondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.publishGradient}
                >
                  {isCreating ? (
                    <View style={styles.publishInner}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.publishText}>{t('admin.gallery.uploadingImages')}</Text>
                    </View>
                  ) : (
                    <View style={styles.publishInner}>
                      <Sparkles size={20} color="#fff" />
                      <Text style={styles.publishText}>{t('admin.gallery.publish')}</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </KeyboardAwareScreenScroll>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: -42,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalPad,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarText: {
    flex: 1,
    marginRight: 10,
  },
  screenTitle: {
    fontSize: 22,
    fontFamily: 'FbPragmati-Bold',
  },
  screenSubtitle: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: 'FbPragmati-Regular',
  },
  managePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  managePillText: {
    fontSize: 13,
    fontFamily: 'FbPragmati-Regular',
  },
  categoriesContainer: {
    paddingVertical: 10,
  },
  chipsRow: {
    paddingHorizontal: horizontalPad,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 14,
    fontFamily: 'FbPragmati-Regular',
  },
  selectedCategoryChipText: {
    color: '#fff',
    fontFamily: 'FbPragmati-Bold',
  },
  listContent: {
    paddingHorizontal: horizontalPad,
    paddingTop: 8,
  },
  columnWrap: {
    gap: tileGap,
    marginBottom: tileGap,
  },
  tile: {},
  imageContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    justifyContent: 'flex-end',
  },
  designName: {
    color: Colors.white,
    fontSize: 16,
    textAlign: 'right',
    marginBottom: 4,
    fontFamily: 'FbPragmati-Bold',
  },
  categoryTags: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  categoryTag: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
    marginBottom: 4,
  },
  categoryTagText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'FbPragmati-Light',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popularityContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 3,
  },
  popularityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyIconBg: {
    width: 88,
    height: 88,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'FbPragmati-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: 'FbPragmati-Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 16,
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'FbPragmati-Bold',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 16 },
    }),
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sheetTitleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 8,
  },
  sheetIconRing: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: 'FbPragmati-Bold',
  },
  sheetSubtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
    fontFamily: 'FbPragmati-Regular',
  },
  closeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetScrollContent: {
    paddingBottom: 28,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  stepNum: {
    fontSize: 13,
    fontFamily: 'FbPragmati-Bold',
  },
  stepLabel: {
    fontSize: 13,
    fontFamily: 'FbPragmati-Regular',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    borderRadius: 1,
    opacity: 0.6,
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 168,
  },
  dropIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  dropTitle: {
    fontSize: 17,
    fontFamily: 'FbPragmati-Bold',
    textAlign: 'center',
  },
  dropHint: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    fontFamily: 'FbPragmati-Regular',
    paddingHorizontal: 12,
  },
  countBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'FbPragmati-Bold',
  },
  thumbsSection: {
    marginTop: 16,
  },
  thumbsHint: {
    fontSize: 12,
    marginBottom: 10,
    fontFamily: 'FbPragmati-Regular',
    textAlign: 'right',
  },
  thumbsRow: {
    gap: 10,
    paddingVertical: 4,
  },
  thumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: 10,
    position: 'relative',
  },
  thumbTouchable: {
    width: '100%',
    height: '100%',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
  },
  coverBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'FbPragmati-Bold',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldBlock: {
    marginTop: 20,
  },
  fieldLabel: {
    fontSize: 14,
    marginBottom: 8,
    fontFamily: 'FbPragmati-Bold',
    textAlign: 'right',
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    fontFamily: 'FbPragmati-Regular',
    textAlign: 'right',
  },
  adminRow: {
    gap: 8,
    flexDirection: 'row',
  },
  adminChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    marginRight: 8,
  },
  adminChipText: {
    fontSize: 14,
    fontFamily: 'FbPragmati-Regular',
  },
  publishTouchable: {
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  publishGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  publishText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'FbPragmati-Bold',
  },
});
