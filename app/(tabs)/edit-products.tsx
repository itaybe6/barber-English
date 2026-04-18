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
import { useProductsStore } from '@/stores/productsStore';
import { productsApi, sortProductsByDisplayOrder, type Product } from '@/lib/api/products';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/utils/imageCompression';
import { useTranslation } from 'react-i18next';
import { Search, ImagePlus, ShoppingBag, X, GripVertical, Info } from 'lucide-react-native';
import DraggableFlatList, { ScaleDecorator, type DragEndParams } from 'react-native-draggable-flatlist';
import { useColors, type ThemeColors } from '@/src/theme/ThemeProvider';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import { useEditProductsTabBar, useEditProductsTabBarRegistration } from '@/contexts/EditProductsTabBarContext';
import { storageExtensionFromContentType } from '@/lib/utils/mediaUrl';

const numColumns = 2;

/** Inner width for product sheet content (horizontal padding 20×2, same as edit-gallery). */
function getStoreSheetInnerContentWidth(screenW: number) {
  const pad = 20;
  return Math.max(0, screenW - pad * 2);
}

function getStoreStep2ThumbSize(innerWidth: number): { thumbSize: number; gap: number } {
  const gap = 10;
  const thumbSize = Math.min(Math.round(innerWidth * 0.72), 248);
  return { thumbSize, gap };
}

export default function EditProductsScreen() {
  const { t: tRoot } = useTranslation();
  const t = useCallback(
    (key: string, defaultValue?: string, options?: Record<string, unknown>) =>
      tRoot(key, { ...(options ?? {}), defaultValue, lng: 'he' } as object),
    [tRoot]
  );
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors, windowWidth), [colors, windowWidth]);

  const storeSheetInnerW = useMemo(() => getStoreSheetInnerContentWidth(windowWidth), [windowWidth]);
  /** Square side for product cover picker tile (sheet pad 20×2, gap 12 — same as gallery photo tile). */
  const productPickTileSize = useMemo(() => {
    const inner = Math.max(0, windowWidth - 40);
    return Math.max(118, Math.min(176, Math.floor((inner - 12) / 2)));
  }, [windowWidth]);

  const { products, fetchProducts, applyProductDisplayOrder, isLoading } = useProductsStore();

  const [search, setSearch] = useState('');

  // --- Create state ---
  const [createVisible, setCreateVisible] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [isCreating, setIsCreating] = useState(false);
  const [createImageUri, setCreateImageUri] = useState<string | null>(null);
  const [createImageLocalUri, setCreateImageLocalUri] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPrice, setCreatePrice] = useState('');
  const [isPickingImage, setIsPickingImage] = useState(false);

  // --- Edit state ---
  const [editVisible, setEditVisible] = useState(false);
  const [editStep, setEditStep] = useState<1 | 2>(1);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const [editImageLocalUri, setEditImageLocalUri] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const { deleteMode, setDeleteMode, reorderMode, setReorderMode, setReorderDirty, setFloatingBarHidden } =
    useEditProductsTabBar();

  const createProductSheetRef = useRef<BottomSheetModal>(null);
  const editProductSheetRef = useRef<BottomSheetModal>(null);
  const createProductSheetScrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const editProductSheetScrollRef = useRef<BottomSheetScrollViewMethods>(null);

  const scrollProductFieldIntoView = useCallback((which: 'create' | 'edit') => {
    const ref = which === 'create' ? createProductSheetScrollRef : editProductSheetScrollRef;
    setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 260);
    setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 520);
  }, []);

  useEffect(() => {
    if (createVisible) {
      createProductSheetRef.current?.present();
    } else {
      createProductSheetRef.current?.dismiss();
    }
  }, [createVisible]);

  useEffect(() => {
    if (editVisible) {
      editProductSheetRef.current?.present();
    } else {
      editProductSheetRef.current?.dismiss();
    }
  }, [editVisible]);

  const productSheetChrome = useMemo(
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

  const renderCreateProductBackdrop = useCallback(
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

  const renderEditProductBackdrop = useCallback(
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
    if (!createVisible || createStep !== 2) return;
    const t = setTimeout(() => createProductSheetScrollRef.current?.scrollToEnd({ animated: true }), 180);
    return () => clearTimeout(t);
  }, [createVisible, createStep]);

  useEffect(() => {
    if (!editVisible || editStep !== 2) return;
    const t = setTimeout(() => editProductSheetScrollRef.current?.scrollToEnd({ animated: true }), 180);
    return () => clearTimeout(t);
  }, [editVisible, editStep]);

  useEffect(() => {
    setFloatingBarHidden(createVisible || editVisible);
  }, [createVisible, editVisible, setFloatingBarHidden]);

  useEffect(
    () => () => {
      setFloatingBarHidden(false);
    },
    [setFloatingBarHidden]
  );

  useEffect(() => {
    fetchProducts();
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
    if (!createVisible) {
      setCreateStep(1);
    }
  }, [createVisible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const sortedForReorder = useMemo(() => sortProductsByDisplayOrder(products), [products]);
  const [reorderListData, setReorderListData] = useState<Product[] | null>(null);
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
    if (!reorderMode) return [] as Product[];
    return reorderListData ?? sortedForReorder;
  }, [reorderMode, reorderListData, sortedForReorder]);

  const onReorderDragEnd = useCallback(
    ({ data }: DragEndParams<Product>) => {
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
      const ok = await applyProductDisplayOrder(list.map((p) => p.id));
      if (ok) {
        setReorderDirty(false);
        setReorderMode(false);
        setReorderListData(null);
      } else {
        Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.reorderSaveFailed', 'לא ניתן לשמור את הסדר'));
      }
    } finally {
      reorderCommitInFlight.current = false;
    }
  }, [applyProductDisplayOrder, reorderListData, sortedForReorder, setReorderDirty, setReorderMode, t]);

  // --- Image upload helpers ---
  const uploadProductCoverImage = async (localUri: string): Promise<string | null> => {
    try {
      const response = await fetch(localUri, { cache: 'no-store' });
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const fileBody = new Uint8Array(arrayBuffer);
      const ext = storageExtensionFromContentType(contentType);
      const filePath = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      let bucket = 'designs';
      const first = await supabase.storage.from(bucket).upload(filePath, fileBody as any, { contentType, upsert: false });
      if (first.error) {
        const msg = String((first.error as any)?.message || '').toLowerCase();
        if (msg.includes('bucket') && msg.includes('not found')) {
          bucket = 'public';
          const retry = await supabase.storage.from(bucket).upload(filePath, fileBody as any, { contentType, upsert: false });
          if (retry.error) return null;
        } else return null;
      }
      return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    } catch (e) {
      console.error('uploadProductCoverImage error', e);
      return null;
    }
  };

  const pickImageFromLibrary = async (): Promise<{ uri: string } | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permission.required', 'נדרשת הרשאה'), t('admin.store.galleryPermission', 'אנא אפשר גישה לגלרייה'));
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1.0,
    });
    if (result.canceled || !result.assets[0]) return null;
    const a = result.assets[0];
    try {
      const compressed = await compressImage(a.uri, {
        quality: 0.75,
        maxWidth: 1000,
        maxHeight: 1000,
        format: 'jpeg',
        sourceWidth: a.width,
        sourceHeight: a.height,
      });
      return { uri: compressed.uri };
    } catch {
      return { uri: a.uri };
    }
  };

  const handlePickCreateImage = async () => {
    if (isCreating || isPickingImage) return;
    setIsPickingImage(true);
    try {
      const img = await pickImageFromLibrary();
      if (img) {
        setCreateImageLocalUri(img.uri);
        setCreateImageUri(null);
      }
    } finally {
      setIsPickingImage(false);
    }
  };

  const handlePickEditImage = async () => {
    if (isSavingEdit || isPickingImage) return;
    setIsPickingImage(true);
    try {
      const img = await pickImageFromLibrary();
      if (img) {
        setEditImageLocalUri(img.uri);
        setEditImageUri(null);
      }
    } finally {
      setIsPickingImage(false);
    }
  };

  // --- Create ---
  const resetCreate = () => {
    setCreateImageUri(null);
    setCreateImageLocalUri(null);
    setCreateName('');
    setCreateDescription('');
    setCreatePrice('');
    setCreateStep(1);
  };

  const openCreate = useCallback(() => {
    if (isCreating) return;
    setDeleteMode(false);
    setReorderMode(false);
    setReorderDirty(false);
    resetCreate();
    setCreateVisible(true);
  }, [isCreating, setDeleteMode, setReorderMode, setReorderDirty]);

  const closeCreate = useCallback(() => {
    if (!isCreating) {
      setCreateVisible(false);
      resetCreate();
    }
  }, [isCreating]);

  const handleCreate = async () => {
    if (!createName.trim()) {
      Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.nameRequired', 'נא להזין שם מוצר'));
      return;
    }
    const parsedPrice = parseFloat(createPrice);
    if (!createPrice || isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.priceInvalid', 'נא להזין מחיר תקין'));
      return;
    }
    try {
      setIsCreating(true);
      let finalImageUrl: string | undefined;
      if (createImageLocalUri) {
        const uploaded = await uploadProductCoverImage(createImageLocalUri);
        if (!uploaded) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.uploadFailed', 'שגיאה בהעלאת התמונה'));
          setIsCreating(false);
          return;
        }
        finalImageUrl = uploaded;
      }
      await productsApi.createProduct({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        price: parsedPrice,
        image_url: finalImageUrl,
      });
      await fetchProducts();
      setCreateVisible(false);
      resetCreate();
    } catch (e) {
      console.error('handleCreate error', e);
      Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.createFailed', 'שגיאה ביצירת המוצר'));
    } finally {
      setIsCreating(false);
    }
  };

  // --- Edit ---
  const openEdit = (product: Product) => {
    setDeleteMode(false);
    setEditingProduct(product);
    setEditImageUri(product.image_url || null);
    setEditImageLocalUri(null);
    setEditName(product.name);
    setEditDescription(product.description || '');
    setEditPrice(product.price.toString());
    setEditStep(1);
    setEditVisible(true);
  };

  const closeEdit = useCallback(() => {
    setEditVisible(false);
    setEditStep(1);
    setEditingProduct(null);
    setEditImageUri(null);
    setEditImageLocalUri(null);
    setEditName('');
    setEditDescription('');
    setEditPrice('');
    setIsSavingEdit(false);
  }, []);

  useEffect(() => {
    if (!createVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isCreating) return true;
      if (createStep === 2) {
        setCreateStep(1);
        return true;
      }
      closeCreate();
      return true;
    });
    return () => sub.remove();
  }, [createVisible, isCreating, createStep, closeCreate]);

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

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    if (!editName.trim()) {
      Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.nameRequired', 'נא להזין שם מוצר'));
      return;
    }
    const parsedPrice = parseFloat(editPrice);
    if (!editPrice || isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.priceInvalid', 'נא להזין מחיר תקין'));
      return;
    }
    try {
      setIsSavingEdit(true);
      let finalImageUrl = editImageUri || undefined;
      if (editImageLocalUri) {
        const uploaded = await uploadProductCoverImage(editImageLocalUri);
        if (!uploaded) {
          Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.uploadFailed', 'שגיאה בהעלאת התמונה'));
          setIsSavingEdit(false);
          return;
        }
        finalImageUrl = uploaded;
      }
      await productsApi.updateProduct(editingProduct.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        price: parsedPrice,
        image_url: finalImageUrl,
      });
      await fetchProducts();
      closeEdit();
    } catch (e) {
      console.error('handleSaveEdit error', e);
      Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.saveFailed', 'שגיאה בשמירת המוצר'));
      setIsSavingEdit(false);
    }
  };

  // --- Delete ---
  const handleDelete = async (product: Product) => {
    Alert.alert(
      t('admin.store.deleteTitle', 'מחיקת מוצר'),
      t('admin.store.deleteConfirm', 'האם למחוק את "{{name}}"?', { name: product.name }),
      [
        { text: t('cancel', 'ביטול'), style: 'cancel' },
        {
          text: t('delete', 'מחיקה'),
          style: 'destructive',
          onPress: async () => {
            try {
              await productsApi.deleteProduct(product.id);
              await fetchProducts();
            } catch (e) {
              console.error('delete product error', e);
              Alert.alert(t('error.generic', 'שגיאה'), t('admin.store.deleteFailed', 'שגיאה במחיקת המוצר'));
            }
          },
        },
      ]
    );
  };

  // --- Tab bar registration ---
  const editTabBarActions = useMemo(
    () => ({ openCreate, commitReorder }),
    [openCreate, commitReorder]
  );
  useEditProductsTabBarRegistration(editTabBarActions);

  const tileSize = (windowWidth - styles._layout.paddingH * 2 - styles._layout.gap * (numColumns - 1)) / numColumns;

  const sheetOverlayOpen = createVisible || editVisible;
  const pageBg = colors.background;

  const listEmpty = useMemo(() => {
    if (isLoading && products.length === 0) return null;
    const isSearchEmpty = search.trim().length > 0 && filtered.length === 0;
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + '18' }]}>
          {isSearchEmpty ? <Search size={36} color={colors.primary} strokeWidth={1.75} /> : <ShoppingBag size={36} color={colors.primary} strokeWidth={1.75} />}
        </View>
        <Text style={styles.emptyTitle}>
          {isSearchEmpty ? t('admin.store.noSearchResults', 'לא נמצאו מוצרים') : t('admin.store.emptyTitle', 'אין מוצרים עדיין')}
        </Text>
        <Text style={styles.emptySubtitle}>
          {isSearchEmpty
            ? t('admin.store.tryDifferentSearch', 'נסה חיפוש אחר')
            : t('admin.store.emptySubtitle', 'הוסף את המוצר הראשון לחנות שלך')}
        </Text>
      </View>
    );
  }, [colors.primary, products.length, filtered.length, isLoading, search, styles, t]);

  const createDisplayUri = createImageLocalUri || createImageUri;
  const editDisplayUri = editImageLocalUri || editImageUri;

  const storeStep2Thumb = useMemo(() => getStoreStep2ThumbSize(storeSheetInnerW), [storeSheetInnerW]);

  return (
    <View style={[styles.screen, { backgroundColor: pageBg }]}>
      <SafeAreaView
        edges={['top']}
        style={{ backgroundColor: pageBg }}
        pointerEvents={sheetOverlayOpen ? 'none' : 'auto'}
      >
        <View style={[styles.searchRowWrap, { backgroundColor: pageBg }]}>
          <View
            style={[
              styles.searchRow,
              { direction: 'ltr' } as const,
              {
                backgroundColor: colors.text + '0A',
                ...Platform.select({
                  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6 },
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
                  textAlign: 'right',
                  writingDirection: 'rtl',
                  opacity: reorderMode ? 0.45 : 1,
                },
              ]}
              placeholder={t('admin.store.searchProducts', 'חיפוש לפי שם')}
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
                accessibilityLabel={`${t('admin.store.reorderHintDrag', 'גרירה: לחיצה ארוכה על הידית')}. ${t('admin.store.reorderHintSave', 'שמירה: סימון הוי בשורת הכלים')}`}
              >
                <View style={styles.reorderHintLines}>
                  <Text style={[styles.reorderHintLine, { color: colors.text }]}>
                    {t('admin.store.reorderHintDrag', 'גרירה: לחיצה ארוכה על הידית')}
                  </Text>
                  <Text style={[styles.reorderHintLine, styles.reorderHintLineSecond, { color: colors.text }]}>
                    {t('admin.store.reorderHintSave', 'שמירה: סימון הוי בשורת הכלים')}
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
          {isLoading && products.length === 0 ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingLabel, { color: colors.textSecondary }]}>{t('common.loading', 'טוען...')}</Text>
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
                  refreshing={isLoading && products.length > 0}
                  onRefresh={fetchProducts}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              renderItem={({ item, drag, isActive, getIndex }) => {
                const pos = (getIndex() ?? 0) + 1;
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
                          <Text style={[styles.reorderPriceBesideThumb, { color: colors.primary }]}>
                            ₪{item.price.toFixed(2)}
                          </Text>
                        </View>
                        <View style={styles.reorderThumbWrap}>
                          {item.image_url ? (
                            <ExpoImage
                              source={{ uri: item.image_url }}
                              style={styles.reorderThumb}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={120}
                            />
                          ) : (
                            <View
                              style={[
                                styles.reorderThumb,
                                {
                                  backgroundColor: colors.surface,
                                  alignItems: 'center' as const,
                                  justifyContent: 'center' as const,
                                },
                              ]}
                            >
                              <ShoppingBag size={24} color={colors.textSecondary} strokeWidth={1.5} />
                            </View>
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
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => openEdit(item)}
                    style={styles.tileInner}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                  >
                    {item.image_url ? (
                      <ExpoImage
                        source={{ uri: item.image_url }}
                        style={styles.tileImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={180}
                      />
                    ) : (
                      <View style={[styles.tileImage, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                        <ShoppingBag size={40} color={colors.textSecondary} strokeWidth={1.25} />
                      </View>
                    )}
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.82)']}
                      style={styles.tileGradient}
                      pointerEvents="none"
                    >
                      <View style={styles.tileBottomRow}>
                        <View style={[styles.tilePriceBadge, { backgroundColor: colors.primary }]}>
                          <Text style={styles.tilePriceText}>₪{item.price % 1 === 0 ? item.price.toFixed(0) : item.price.toFixed(2)}</Text>
                        </View>
                        <View style={styles.tileTextBlock}>
                          <Text style={styles.tileName} numberOfLines={2}>{item.name}</Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                  {deleteMode ? (
                    <Pressable
                      onPress={() => handleDelete(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('delete', 'מחיקה')}
                      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                      style={({ pressed }) => [
                        styles.tileDelete,
                        { backgroundColor: pressed ? colors.error : colors.error + 'E6' },
                      ]}
                    >
                      <Ionicons name="trash-outline" size={17} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>
              )}
              ListEmptyComponent={listEmpty}
              contentContainerStyle={[styles.listContent, { paddingBottom: 120 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isLoading && products.length > 0}
                  onRefresh={fetchProducts}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
            />
          )}
        </View>
      </SafeAreaView>

      <BottomSheetModal
        ref={createProductSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={Math.round(windowHeight * 0.92)}
        enablePanDownToClose={!isCreating}
        backdropComponent={renderCreateProductBackdrop}
        onDismiss={() => {
          if (!isCreating) closeCreate();
        }}
        style={I18nManager.isRTL ? ({ direction: 'rtl' } as const) : ({ direction: 'ltr' } as const)}
        handleIndicatorStyle={productSheetChrome.handle}
        backgroundStyle={productSheetChrome.background}
        topInset={insets.top + 8}
        bottomInset={insets.bottom}
        keyboardBehavior="fillParent"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        animationConfigs={{ duration: 400 }}
      >
        <BottomSheetScrollView
          ref={createProductSheetScrollRef}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            ...(I18nManager.isRTL ? ({ direction: 'rtl' as const } as const) : ({ direction: 'ltr' as const } as const)),
          }}
        >
          <View style={styles.gallerySheetHeader}>
            <Text style={[styles.gallerySheetTitle, { color: colors.text }]}>
              {createStep === 1
                ? t('admin.store.createStep1Title', 'תמונת מוצר')
                : t('admin.store.createStep2Title', 'פרטי המוצר')}
            </Text>
            <Text style={[styles.gallerySheetSubtitle, { color: colors.textSecondary }]}>
              {createStep === 1
                ? t('admin.store.createStep1Tagline', 'הוסף תמונה עבור המוצר')
                : t('admin.store.createStep2Tagline', 'הזן שם, תיאור ומחיר')}
            </Text>
          </View>

          {createStep === 1 ? (
            <>
              <View style={styles.galleryMediaPickRow}>
                <TouchableOpacity
                  onPress={handlePickCreateImage}
                  style={[
                    styles.galleryMediaPickTile,
                    {
                      width: productPickTileSize,
                      height: productPickTileSize,
                      borderColor: colors.primary + '55',
                      backgroundColor: colors.primary + '0C',
                      opacity: isCreating || isPickingImage ? 0.45 : 1,
                    },
                  ]}
                  activeOpacity={0.88}
                  disabled={isCreating || isPickingImage}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('admin.store.selectImage', 'בחר תמונה')}. ${t('admin.store.imageHint', 'תמונה ריבועית מומלצת')}`}
                >
                  {createDisplayUri ? (
                    <View style={[styles.galleryMediaPickBadgeAbs, { backgroundColor: colors.primary }]}>
                      <Text style={styles.countBadgeText}>1</Text>
                    </View>
                  ) : null}
                  <View style={[styles.galleryMediaPickTileIconWrap, { backgroundColor: colors.primary + '24' }]}>
                    <ImagePlus
                      size={Math.min(28, Math.max(22, Math.round(productPickTileSize * 0.17)))}
                      color={colors.primary}
                      strokeWidth={2}
                    />
                  </View>
                  <Text style={[styles.galleryMediaPickTileTitle, { color: colors.text }]} numberOfLines={2}>
                    {t('admin.store.selectImage', 'בחר תמונה')}
                  </Text>
                  <Text style={[styles.galleryMediaPickTileSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {t('admin.store.imageHint', 'תמונה ריבועית מומלצת')}
                  </Text>
                </TouchableOpacity>
              </View>

              {createDisplayUri ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    paddingVertical: 12,
                    width: '100%',
                    gap: storeStep2Thumb.gap,
                  }}
                >
                  {(() => {
                    const s = storeStep2Thumb.thumbSize;
                    const r = Math.min(16, Math.round(s * 0.12));
                    const xSize = Math.min(30, Math.max(22, Math.round(s * 0.28)));
                    return (
                      <View
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
                          source={{ uri: createDisplayUri }}
                          style={styles.previewImg}
                          contentFit="cover"
                          cachePolicy="none"
                          transition={120}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            if (!isCreating) {
                              setCreateImageLocalUri(null);
                              setCreateImageUri(null);
                            }
                          }}
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
                          accessibilityRole="button"
                          accessibilityLabel={t('remove', 'הסרה')}
                        >
                          <Ionicons name="close" size={Math.min(16, Math.round(xSize * 0.5))} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>
              ) : null}

              <TouchableOpacity
                onPress={() => setCreateStep(2)}
                style={[styles.fabPrimaryBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                accessibilityRole="button"
                accessibilityLabel={t('next', 'המשך')}
              >
                <Text style={styles.primaryBtnText}>{t('next', 'המשך')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {createDisplayUri ? (
                <View style={styles.step2ImageOuter}>
                  <Pressable
                    onPress={() => {
                      if (!isCreating) setCreateStep(1);
                    }}
                    disabled={isCreating}
                    style={({ pressed }) => [
                      styles.step2ImageFrame,
                      {
                        width: storeStep2Thumb.thumbSize,
                        height: storeStep2Thumb.thumbSize,
                        borderRadius: Math.min(16, Math.round(storeStep2Thumb.thumbSize * 0.12)),
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('admin.store.changeImage', 'החלף תמונה')}
                  >
                    <ExpoImage
                      source={{ uri: createDisplayUri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      cachePolicy="none"
                      transition={120}
                    />
                    <View pointerEvents="none" style={styles.step2ChangeChipWrap}>
                      <View style={styles.step2ChangeChip}>
                        <Text style={styles.step2ChangeChipText}>{t('admin.store.changeImage', 'החלף תמונה')}</Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              ) : null}

              <View style={[styles.createFieldWrap, { borderBottomColor: colors.text + '22' }]}>
                <BottomSheetTextInput
                  style={[styles.createFieldInput, { color: colors.text }]}
                  placeholder={t('admin.store.namePlaceholder', 'שם המוצר')}
                  placeholderTextColor={colors.textSecondary}
                  value={createName}
                  onChangeText={setCreateName}
                  editable={!isCreating}
                  returnKeyType="next"
                  maxLength={120}
                  onFocus={() => scrollProductFieldIntoView('create')}
                />
              </View>

              <View style={[styles.createFieldWrap, { borderBottomColor: colors.text + '22', marginTop: 8 }]}>
                <BottomSheetTextInput
                  style={[styles.createFieldInput, styles.createFieldInputMultiline, { color: colors.text }]}
                  placeholder={t('admin.store.descriptionPlaceholder', 'תיאור (אופציונלי)')}
                  placeholderTextColor={colors.textSecondary}
                  value={createDescription}
                  onChangeText={setCreateDescription}
                  editable={!isCreating}
                  returnKeyType="next"
                  multiline
                  scrollEnabled={false}
                  maxLength={300}
                  onFocus={() => scrollProductFieldIntoView('create')}
                  {...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const, includeFontPadding: false } : {})}
                />
              </View>

              <View
                style={[
                  styles.createFieldWrap,
                  { borderBottomColor: colors.text + '22', marginTop: 8, flexDirection: 'row', alignItems: 'center' },
                ]}
              >
                <Text style={[styles.currencySymbol, { color: colors.text }]}>₪</Text>
                <BottomSheetTextInput
                  style={[styles.createFieldInput, { color: colors.text, flex: 1 }]}
                  placeholder={t('admin.store.pricePlaceholder', 'מחיר')}
                  placeholderTextColor={colors.textSecondary}
                  value={createPrice}
                  onChangeText={setCreatePrice}
                  editable={!isCreating}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  maxLength={12}
                  onFocus={() => scrollProductFieldIntoView('create')}
                />
              </View>

              <View style={styles.createFooterRow}>
                <TouchableOpacity
                  onPress={handleCreate}
                  style={[
                    styles.fabPrimaryBtn,
                    styles.createPublishFlex,
                    { backgroundColor: colors.primary, opacity: isCreating ? 0.85 : 1 },
                  ]}
                  disabled={isCreating}
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.store.publish', 'פרסום')}
                >
                  {isCreating ? (
                    <View style={styles.rowCenter}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[styles.primaryBtnText, { marginStart: 10 }]}>{t('admin.store.saving', 'שומר...')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryBtnText}>{t('admin.store.publish', 'פרסום')}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setCreateStep(1)}
                  style={[styles.createBackBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  disabled={isCreating}
                  accessibilityRole="button"
                >
                  <Text style={[styles.createBackBtnText, { color: colors.text }]}>{t('back', 'חזרה')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={editProductSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={Math.round(windowHeight * 0.92)}
        enablePanDownToClose={!isSavingEdit}
        backdropComponent={renderEditProductBackdrop}
        onDismiss={() => {
          if (!isSavingEdit) closeEdit();
        }}
        style={I18nManager.isRTL ? ({ direction: 'rtl' } as const) : ({ direction: 'ltr' } as const)}
        handleIndicatorStyle={productSheetChrome.handle}
        backgroundStyle={productSheetChrome.background}
        topInset={insets.top + 8}
        bottomInset={insets.bottom}
        keyboardBehavior="fillParent"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        animationConfigs={{ duration: 400 }}
      >
        <BottomSheetScrollView
          ref={editProductSheetScrollRef}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
                ? t('admin.store.editStep1Title', 'תמונת מוצר')
                : t('admin.store.editStep2Title', 'עריכת פרטים')}
            </Text>
            <Text style={[styles.gallerySheetSubtitle, { color: colors.textSecondary }]}>
              {editStep === 1
                ? t('admin.store.editStep1Tagline', 'לחץ לשינוי תמונת המוצר')
                : t('admin.store.editStep2Tagline', 'עדכן שם, תיאור ומחיר')}
            </Text>
          </View>

          {editStep === 1 ? (
            <>
              <View style={styles.galleryMediaPickRow}>
                <TouchableOpacity
                  onPress={handlePickEditImage}
                  style={[
                    styles.galleryMediaPickTile,
                    {
                      width: productPickTileSize,
                      height: productPickTileSize,
                      borderColor: colors.primary + '55',
                      backgroundColor: colors.primary + '0C',
                      opacity: isSavingEdit || isPickingImage ? 0.45 : 1,
                    },
                  ]}
                  activeOpacity={0.88}
                  disabled={isSavingEdit || isPickingImage}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('admin.store.selectImage', 'בחר תמונה')}. ${t('admin.store.imageHint', 'תמונה ריבועית מומלצת')}`}
                >
                  {editDisplayUri ? (
                    <View style={[styles.galleryMediaPickBadgeAbs, { backgroundColor: colors.primary }]}>
                      <Text style={styles.countBadgeText}>1</Text>
                    </View>
                  ) : null}
                  <View style={[styles.galleryMediaPickTileIconWrap, { backgroundColor: colors.primary + '24' }]}>
                    <ImagePlus
                      size={Math.min(28, Math.max(22, Math.round(productPickTileSize * 0.17)))}
                      color={colors.primary}
                      strokeWidth={2}
                    />
                  </View>
                  <Text style={[styles.galleryMediaPickTileTitle, { color: colors.text }]} numberOfLines={2}>
                    {t('admin.store.selectImage', 'בחר תמונה')}
                  </Text>
                  <Text style={[styles.galleryMediaPickTileSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {t('admin.store.imageHint', 'תמונה ריבועית מומלצת')}
                  </Text>
                </TouchableOpacity>
              </View>

              {editDisplayUri ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    paddingVertical: 12,
                    width: '100%',
                    gap: storeStep2Thumb.gap,
                  }}
                >
                  {(() => {
                    const s = storeStep2Thumb.thumbSize;
                    const r = Math.min(16, Math.round(s * 0.12));
                    const xSize = Math.min(30, Math.max(22, Math.round(s * 0.28)));
                    return (
                      <View
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
                          source={{ uri: editDisplayUri }}
                          style={styles.previewImg}
                          contentFit="cover"
                          cachePolicy="none"
                          transition={120}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            if (!isSavingEdit) {
                              setEditImageLocalUri(null);
                              setEditImageUri(editingProduct?.image_url || null);
                            }
                          }}
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
                          accessibilityRole="button"
                          accessibilityLabel={t('remove', 'הסרה')}
                        >
                          <Ionicons name="close" size={Math.min(16, Math.round(xSize * 0.5))} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>
              ) : null}

              <TouchableOpacity
                onPress={() => setEditStep(2)}
                style={[styles.fabPrimaryBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>{t('next', 'המשך')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {editDisplayUri ? (
                <View style={styles.step2ImageOuter}>
                  <Pressable
                    onPress={() => {
                      if (!isSavingEdit) setEditStep(1);
                    }}
                    disabled={isSavingEdit}
                    style={({ pressed }) => [
                      styles.step2ImageFrame,
                      {
                        width: storeStep2Thumb.thumbSize,
                        height: storeStep2Thumb.thumbSize,
                        borderRadius: Math.min(16, Math.round(storeStep2Thumb.thumbSize * 0.12)),
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('admin.store.changeImage', 'החלף תמונה')}
                  >
                    <ExpoImage
                      source={{ uri: editDisplayUri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      cachePolicy="none"
                      transition={120}
                    />
                    <View pointerEvents="none" style={styles.step2ChangeChipWrap}>
                      <View style={styles.step2ChangeChip}>
                        <Text style={styles.step2ChangeChipText}>{t('admin.store.changeImage', 'החלף תמונה')}</Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              ) : null}

              <View style={[styles.createFieldWrap, { borderBottomColor: colors.text + '22' }]}>
                <BottomSheetTextInput
                  style={[styles.createFieldInput, { color: colors.text }]}
                  placeholder={t('admin.store.namePlaceholder', 'שם המוצר')}
                  placeholderTextColor={colors.textSecondary}
                  value={editName}
                  onChangeText={setEditName}
                  editable={!isSavingEdit}
                  returnKeyType="next"
                  maxLength={120}
                  onFocus={() => scrollProductFieldIntoView('edit')}
                />
              </View>

              <View style={[styles.createFieldWrap, { borderBottomColor: colors.text + '22', marginTop: 8 }]}>
                <BottomSheetTextInput
                  style={[styles.createFieldInput, styles.createFieldInputMultiline, { color: colors.text }]}
                  placeholder={t('admin.store.descriptionPlaceholder', 'תיאור (אופציונלי)')}
                  placeholderTextColor={colors.textSecondary}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  editable={!isSavingEdit}
                  returnKeyType="next"
                  multiline
                  scrollEnabled={false}
                  maxLength={300}
                  onFocus={() => scrollProductFieldIntoView('edit')}
                  {...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const, includeFontPadding: false } : {})}
                />
              </View>

              <View
                style={[
                  styles.createFieldWrap,
                  { borderBottomColor: colors.text + '22', marginTop: 8, flexDirection: 'row', alignItems: 'center' },
                ]}
              >
                <Text style={[styles.currencySymbol, { color: colors.text }]}>₪</Text>
                <BottomSheetTextInput
                  style={[styles.createFieldInput, { color: colors.text, flex: 1 }]}
                  placeholder={t('admin.store.pricePlaceholder', 'מחיר')}
                  placeholderTextColor={colors.textSecondary}
                  value={editPrice}
                  onChangeText={setEditPrice}
                  editable={!isSavingEdit}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  maxLength={12}
                  onFocus={() => scrollProductFieldIntoView('edit')}
                />
              </View>

              <View style={styles.createFooterRow}>
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  style={[
                    styles.fabPrimaryBtn,
                    styles.createPublishFlex,
                    { backgroundColor: colors.primary, opacity: isSavingEdit ? 0.85 : 1 },
                  ]}
                  disabled={isSavingEdit}
                  accessibilityRole="button"
                >
                  {isSavingEdit ? (
                    <View style={styles.rowCenter}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[styles.primaryBtnText, { marginStart: 10 }]}>{t('admin.store.saving', 'שומר...')}</Text>
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
                >
                  <Text style={[styles.createBackBtnText, { color: colors.text }]}>{t('back', 'חזרה')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}

function createStyles(colors: ThemeColors, windowWidth: number) {
  const paddingH = 20;
  const gap = 10;
  const layout = { paddingH, gap };

  return {
    _layout: layout,
    screen: { flex: 1 },
    bodySafe: { flex: 1 },
    contentMain: { flex: 1, paddingTop: 4 },
    searchRowWrap: {
      paddingHorizontal: paddingH,
      paddingTop: 8,
      paddingBottom: 14,
    },
    searchRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
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
      fontWeight: '500' as const,
      padding: 0,
      margin: 0,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    },
    searchIconBubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    searchClearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    reorderHintOuter: {
      width: '100%' as const,
      marginTop: 10,
      alignItems: 'center' as const,
    },
    reorderHintCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
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
    loadingCenter: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 12,
    },
    loadingLabel: {
      fontSize: 15,
    },
    listContent: {
      paddingHorizontal: paddingH,
      paddingTop: 6,
      flexGrow: 1,
    },
    reorderListContent: {
      paddingTop: 4,
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 32,
      paddingTop: 60,
      gap: 10,
    },
    emptyIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: 6,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.text,
      textAlign: 'center' as const,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center' as const,
      lineHeight: 21,
    },
    tileWrap: {
      marginBottom: gap,
      position: 'relative' as const,
    },
    tileInner: {
      borderRadius: 14,
      overflow: 'hidden' as const,
      aspectRatio: 1,
      backgroundColor: colors.surface,
    },
    tileImage: {
      width: '100%' as const,
      height: '100%' as const,
      position: 'absolute' as const,
      top: 0,
      left: 0,
    },
    tileGradient: {
      position: 'absolute' as const,
      bottom: 0,
      left: 0,
      right: 0,
      paddingBottom: 10,
      paddingTop: 32,
      paddingHorizontal: 10,
    },
    tileBottomRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-end' as const,
      justifyContent: 'space-between' as const,
      direction: 'ltr' as const,
    },
    tilePriceBadge: {
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    tilePriceText: {
      fontSize: 12,
      fontWeight: '700' as const,
      color: '#fff',
    },
    tileTextBlock: {
      flex: 1,
      alignItems: 'flex-end' as const,
      paddingStart: 6,
    },
    tileName: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: '#fff',
      textAlign: 'right' as const,
      writingDirection: 'rtl' as const,
      lineHeight: 18,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    tileDelete: {
      position: 'absolute' as const,
      top: 8,
      end: 8,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
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
    reorderPosText: {
      fontSize: 15,
      fontWeight: '800' as const,
      textAlign: 'center' as const,
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
    reorderPriceBesideThumb: {
      marginTop: 4,
      fontSize: 12.5,
      lineHeight: 17,
      textAlign: 'right' as const,
      writingDirection: 'rtl' as const,
      width: '100%' as const,
      fontWeight: '700' as const,
    },
    reorderThumbWrap: {
      width: 72,
      height: 72,
      borderRadius: 12,
      overflow: 'hidden' as const,
      flexShrink: 0,
    },
    reorderThumb: { width: '100%' as const, height: '100%' as const },
    reorderDragHandle: {
      paddingVertical: 8,
      paddingHorizontal: 4,
      justifyContent: 'center' as const,
    },
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
    countBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' as const },
    previewImg: { width: '100%' as const, height: '100%' as const },
    previewX: {
      position: 'absolute' as const,
      top: 5,
      end: 5,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 2,
      ...Platform.select({ android: { elevation: 3 } }),
    },
    step2ImageOuter: {
      width: '100%' as const,
      alignItems: 'center' as const,
      marginTop: 12,
      marginBottom: 10,
    },
    step2ImageFrame: {
      overflow: 'hidden' as const,
      borderWidth: StyleSheet.hairlineWidth * 2,
    },
    step2ChangeChipWrap: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      paddingBottom: 12,
      alignItems: 'center' as const,
    },
    step2ChangeChip: {
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
    },
    step2ChangeChipText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700' as const,
    },
    createFieldWrap: {
      marginTop: 14,
      marginHorizontal: 2,
      borderBottomWidth: StyleSheet.hairlineWidth * 2,
      paddingBottom: 4,
    },
    createFieldInput: {
      fontSize: 17,
      fontWeight: '400' as const,
      textAlign: 'right' as const,
      writingDirection: 'rtl' as const,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
      paddingHorizontal: 0,
      margin: 0,
      letterSpacing: 0.15,
      lineHeight: 24,
    },
    createFieldInputMultiline: {
      minHeight: Platform.OS === 'ios' ? 48 : 46,
    },
    currencySymbol: {
      fontSize: 17,
      fontWeight: '600' as const,
      marginRight: 6,
    },
    fabPrimaryBtn: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginTop: 16,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700' as const,
    },
    createPublishFlex: {
      flex: 1,
      marginTop: 0,
      minWidth: 0,
    },
    createFooterRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      marginTop: 22,
      direction: 'ltr' as const,
    },
    createBackBtn: {
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth * 2,
    },
    createBackBtnText: {
      fontSize: 16,
      fontWeight: '700' as const,
    },
    rowCenter: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
  };
}
