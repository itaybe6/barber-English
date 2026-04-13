import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Image,
  Modal,
  Animated as RNAnimated,
  PanResponder,
  Pressable,
  RefreshControl,
  ImageBackground,
  I18nManager,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useDesignsStore } from '@/stores/designsStore';
import { useProductsStore } from '@/stores/productsStore';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { Product } from '@/lib/api/products';
import { isVideoUrl } from '@/lib/utils/mediaUrl';
import { GalleryLoopVideo } from '@/components/GalleryLoopVideo';
import { Video, ResizeMode } from 'expo-av';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { SharedValue } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const _indicatorSize = 4;
const _spacing = 14;
const _buttonSize = 56;

type DesignItem = {
  id: string;
  name: string;
  image_url: string;
  image_urls?: string[];
  popularity?: number;
  categories?: string[];
  user_id?: string;
  description?: string;
};

type GalleryItem = DesignItem | Product;

function normalizeTabParam(value: string | string[] | undefined): 'designs' | 'products' | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'products') return 'products';
  if (raw === 'designs') return 'designs';
  return null;
}

function normalizeIdParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  return null;
}

function getGalleryMediaUrls(item: GalleryItem, isProduct: boolean): string[] {
  if (isProduct) {
    const p = item as Product;
    return p.image_url ? [p.image_url] : [];
  }
  const d = item as DesignItem;
  const urls =
    d.image_urls && d.image_urls.length > 0 ? d.image_urls : d.image_url ? [d.image_url] : [];
  return urls.map((u) => String(u || '').trim()).filter(Boolean);
}

function formatProductPrice(price: number): string {
  const whole = Math.abs((price * 100) % 100) < 0.5;
  return `₪${whole ? price.toFixed(0) : price.toFixed(2)}`;
}

function gallerySubtitle(item: GalleryItem, isProduct: boolean, t: TFunction): string {
  if (isProduct) {
    const p = item as Product;
    return (p.description && p.description.trim()) || t('gallery.subtitle', 'Discover our designs and products');
  }
  const d = item as DesignItem;
  if (d.description && d.description.trim()) return d.description.trim();
  const cats = (d.categories || []).filter(Boolean);
  if (cats.length > 0) return cats.slice(0, 3).join(' · ');
  return t('gallery.detailDesignTagline', 'Swipe for inspiration');
}

function galleryMetaLine(item: GalleryItem, isProduct: boolean, t: TFunction): string {
  if (isProduct) return formatProductPrice((item as Product).price);
  const d = item as DesignItem;
  if (typeof d.popularity === 'number' && d.popularity > 0) {
    return `${t('gallery.detailTrending', 'Trending')} · ${d.popularity}`;
  }
  return t('gallery.designs', 'Designs').toUpperCase();
}

const SkeletonTile = memo(({ fullBleed }: { fullBleed?: boolean }) => {
  const opacity = useRef(new RNAnimated.Value(0.6)).current;
  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={[styles.skeletonPage, fullBleed && styles.skeletonPageFullBleed]}>
      <RNAnimated.View style={[styles.skeletonFill, { opacity }]} />
    </View>
  );
});

const Details = memo(
  ({
    scrollY,
    item,
    index,
    subtitle,
    meta,
    stackSize,
  }: {
    scrollY: SharedValue<number>;
    item: GalleryItem;
    index: number;
    subtitle: string;
    meta: string;
    stackSize: number;
  }) => {
    const stylez = useAnimatedStyle(() => {
      return {
        opacity: interpolate(
          scrollY.value,
          [index - 1, index, index + 1],
          [0, 1, 0],
          Extrapolation.CLAMP
        ),
        transform: [
          {
            translateY: interpolate(
              scrollY.value,
              [index - 1, index, index + 1],
              [20, 0, -20],
              Extrapolation.CLAMP
            ),
          },
        ],
      };
    });
    const rtl = I18nManager.isRTL;
    const textAlign = rtl ? 'right' : 'left';
    return (
      <View style={[styles.detailsSlot, { zIndex: stackSize - index }]}>
        <Animated.View style={stylez}>
          <Text style={[styles.pagerTitle, { textAlign }]}>{item.name}</Text>
          <Text style={[styles.pagerDescription, { textAlign }]} numberOfLines={3}>
            {subtitle}
          </Text>
          <Text style={[styles.pagerMeta, { textAlign }]}>{meta}</Text>
        </Animated.View>
      </View>
    );
  }
);

const PaginationDot = memo(({ scrollY, index }: { scrollY: SharedValue<number>; index: number }) => {
  const stylez = useAnimatedStyle(() => ({
    height: interpolate(
      scrollY.value,
      [index - 1, index, index + 1],
      [_indicatorSize, _indicatorSize * 6, _indicatorSize],
      Extrapolation.CLAMP
    ),
  }));
  return (
    <Animated.View
      style={[
        {
          width: _indicatorSize,
          height: _indicatorSize,
          borderRadius: _indicatorSize / 2,
          backgroundColor: 'white',
          marginBottom: _indicatorSize / 2,
        },
        stylez,
      ]}
    />
  );
});

const PagerItem = memo(
  ({
    item,
    pageHeight,
    isProduct,
    windowWidth,
  }: {
    item: GalleryItem;
    pageHeight: number;
    isProduct: boolean;
    windowWidth: number;
  }) => {
    const urls = useMemo(() => getGalleryMediaUrls(item, isProduct), [item, isProduct]);
    const cover = urls[0];

    if (!cover) {
      return (
        <View style={[styles.pagerPage, { height: pageHeight, width: windowWidth, backgroundColor: '#0a0a0a' }]}>
          <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.35)" />
        </View>
      );
    }

    if (isVideoUrl(cover)) {
      return (
        <View style={[styles.pagerPage, { height: pageHeight, width: windowWidth, backgroundColor: '#000' }]}>
          <GalleryLoopVideo uri={cover} style={StyleSheet.absoluteFill} resizeMode={ResizeMode.COVER} />
          <LinearGradient
            colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.78)']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>
      );
    }

    return (
      <ImageBackground
        source={{ uri: cover }}
        style={[styles.pagerPage, { height: pageHeight, width: windowWidth, backgroundColor: '#000' }]}
        imageStyle={{ resizeMode: 'cover' }}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.72)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </ImageBackground>
    );
  }
);

function GalleryVerticalPager({
  data,
  isProduct,
  pageHeight,
  windowWidth,
  businessColors,
  refreshing,
  onRefresh,
  onOpenUrls,
  t,
  bottomInset = 0,
  topInset = 0,
  initialFocusItemId = null,
}: {
  data: GalleryItem[];
  isProduct: boolean;
  pageHeight: number;
  windowWidth: number;
  businessColors: { primary: string };
  refreshing: boolean;
  onRefresh: () => void;
  onOpenUrls: (urls: string[]) => void;
  t: TFunction;
  bottomInset?: number;
  topInset?: number;
  initialFocusItemId?: string | null;
}) {
  const scrollY = useSharedValue(0);
  const pageHShared = useSharedValue(pageHeight);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const isRTL = I18nManager.isRTL;
  const verticalListRef = useRef<{ scrollToOffset: (o: { offset: number; animated?: boolean }) => void } | null>(
    null
  );

  useEffect(() => {
    pageHShared.value = pageHeight;
  }, [pageHeight, pageHShared]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (ev) => {
      const h = pageHShared.value;
      if (h > 0) {
        scrollY.value = ev.contentOffset.y / h;
      }
    },
    onMomentumEnd: (ev) => {
      const h = pageHShared.value;
      if (h > 0) {
        scrollY.value = Math.floor(ev.contentOffset.y / h);
      }
    },
  });

  const snapToIndex = useCallback(
    (y: number) => {
      if (pageHeight <= 0) return;
      const idx = Math.round(y / pageHeight);
      setFocusedIndex(Math.max(0, Math.min(data.length - 1, idx)));
    },
    [pageHeight, data.length]
  );

  useEffect(() => {
    setFocusedIndex((i) => Math.min(i, Math.max(0, data.length - 1)));
  }, [data.length]);

  useEffect(() => {
    if (!initialFocusItemId || pageHeight <= 0 || data.length === 0) return;
    const idx = data.findIndex((d) => d.id === initialFocusItemId);
    if (idx < 0) return;
    const offset = idx * pageHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        verticalListRef.current?.scrollToOffset({ offset, animated: false });
      });
    });
    scrollY.value = idx;
    setFocusedIndex(idx);
  }, [initialFocusItemId, pageHeight, data]);

  const stackSize = data.length;

  if (pageHeight <= 0) {
    return <View style={styles.feedFlex} />;
  }

  if (data.length === 0) {
    return (
      <View style={[styles.feedFlex, styles.emptyState]}>
        <View style={styles.emptyIconWrap}>
          <Ionicons
            name={isProduct ? 'cube-outline' : 'images-outline'}
            size={26}
            color="rgba(255,255,255,0.9)"
          />
        </View>
        <Text style={styles.emptyTitle}>
          {isProduct ? t('gallery.empty.products', 'No products yet') : t('gallery.empty.designs', 'No designs yet')}
        </Text>
        <Text style={styles.emptySubtitle}>
          {isProduct
            ? t('gallery.emptySubtitle.products', 'When you add products, they will appear here')
            : t('gallery.emptySubtitle.designs', 'When you add designs, they will appear here')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.pagerHost}>
      <Animated.FlatList
        ref={verticalListRef}
        data={data}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <PagerItem item={item} pageHeight={pageHeight} isProduct={isProduct} windowWidth={windowWidth} />
        )}
        onScroll={onScroll}
        scrollEventThrottle={16}
        pagingEnabled
        nestedScrollEnabled
        decelerationRate="fast"
        bounces={false}
        showsVerticalScrollIndicator={false}
        snapToInterval={pageHeight}
        snapToAlignment="start"
        getItemLayout={(_, index) => ({
          length: pageHeight,
          offset: pageHeight * index,
          index,
        })}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={businessColors.primary} />
        }
        onMomentumScrollEnd={(e) => snapToIndex(e.nativeEvent.contentOffset.y)}
        style={styles.feedFlex}
      />
      <View
        style={[
          styles.paginationColumn,
          isRTL ? { right: _spacing } : { left: _spacing },
          { paddingTop: topInset + 8 },
        ]}
        pointerEvents="none"
      >
        {data.map((_, index) => (
          <PaginationDot key={`pd-${index}`} scrollY={scrollY} index={index} />
        ))}
      </View>
      <View
        style={[
          styles.detailsWrapper,
          isRTL
            ? { right: _spacing * 2 + _indicatorSize, left: _spacing }
            : { left: _spacing * 2 + _indicatorSize, right: _spacing },
          { paddingBottom: bottomInset + 8, paddingTop: topInset + 4 },
        ]}
        pointerEvents="none"
      >
        {data.map((item, index) => (
          <Details
            key={`det-${item.id}`}
            scrollY={scrollY}
            item={item}
            index={index}
            subtitle={gallerySubtitle(item, isProduct, t)}
            meta={galleryMetaLine(item, isProduct, t)}
            stackSize={stackSize}
          />
        ))}
      </View>
      <Pressable
        onPress={() => {
          const item = data[focusedIndex];
          if (!item) return;
          onOpenUrls(getGalleryMediaUrls(item, isProduct));
        }}
        style={[
          styles.pagerFab,
          { bottom: _spacing * 4 + bottomInset },
          isRTL ? { left: _spacing * 2 } : { right: _spacing * 2 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('gallery.viewAllMedia', 'View all photos')}
      >
        <View style={[styles.pagerFabInner, { backgroundColor: businessColors.primary }]}>
          <Ionicons name="images-outline" size={_buttonSize / 2.4} color="#FFFFFF" />
        </View>
      </Pressable>
    </View>
  );
}

export default function GalleryScreen() {
  const { t } = useTranslation();
  const { width: winWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { tab: tabParam, designId: designIdParam, productId: productIdParam } = useLocalSearchParams<{
    tab?: string | string[];
    designId?: string | string[];
    productId?: string | string[];
  }>();
  const designId = normalizeIdParam(designIdParam);
  const productId = normalizeIdParam(productIdParam);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [refreshingDesigns, setRefreshingDesigns] = useState(false);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [activeTab, setActiveTab] = useState<'designs' | 'products'>('designs');
  const [layoutHeight, setLayoutHeight] = useState(0);
  const chapterScrollRef = useRef<ScrollView>(null);
  const panY = useRef(new RNAnimated.Value(0)).current;
  const { colors: businessColors } = useBusinessColors();

  const normalized = normalizeTabParam(tabParam);

  useFocusEffect(
    useCallback(() => {
      try {
        setStatusBarStyle('light', true);
        setStatusBarBackgroundColor('transparent', true);
      } catch {
        /* noop */
      }
      return () => {
        try {
          setStatusBarStyle('dark', true);
        } catch {
          /* noop */
        }
      };
    }, [])
  );

  useEffect(() => {
    if (layoutHeight <= 0 || winWidth <= 0) return;
    const explicitChapter =
      normalized !== null || designId !== null || productId !== null;
    if (!explicitChapter) return;
    const targetX = productId !== null || normalized === 'products' ? winWidth : 0;
    requestAnimationFrame(() => {
      chapterScrollRef.current?.scrollTo({ x: targetX, y: 0, animated: false });
    });
    setActiveTab(targetX > winWidth * 0.25 ? 'products' : 'designs');
  }, [normalized, designId, productId, layoutHeight, winWidth]);

  const resetPan = () => {
    panY.setValue(0);
  };
  useEffect(() => {
    if (viewerVisible) resetPan();
  }, [viewerVisible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const { dx, dy } = gesture;
        return Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10;
      },
      onPanResponderMove: RNAnimated.event([null, { dy: panY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        const { dy, vy } = gesture;
        if (Math.abs(dy) > 120 || Math.abs(vy) > 1.2) {
          setViewerVisible(false);
          RNAnimated.timing(panY, { toValue: dy > 0 ? 600 : -600, duration: 150, useNativeDriver: false }).start(() => {
            resetPan();
          });
        } else {
          RNAnimated.spring(panY, { toValue: 0, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const { designs, isLoading: designsLoading, fetchDesigns } = useDesignsStore();
  const { products, isLoading: productsLoading, fetchProducts } = useProductsStore();

  useEffect(() => {
    fetchDesigns();
    fetchProducts();
  }, []);

  const onRefreshDesigns = useCallback(async () => {
    setRefreshingDesigns(true);
    try {
      await fetchDesigns();
    } finally {
      setRefreshingDesigns(false);
    }
  }, [fetchDesigns]);

  const onRefreshProducts = useCallback(async () => {
    setRefreshingProducts(true);
    try {
      await fetchProducts();
    } finally {
      setRefreshingProducts(false);
    }
  }, [fetchProducts]);

  const onChapterMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const x = e.nativeEvent.contentOffset.x;
      setActiveTab(x > winWidth * 0.5 ? 'products' : 'designs');
    },
    [winWidth]
  );

  const openViewer = useCallback((urls: string[]) => {
    if (!urls.length) return;
    setViewerImages(urls);
    setViewerIndex(0);
    setViewerVisible(true);
  }, []);

  /** Pager item height: fill tab area + extend under status bar for edge-to-edge media */
  const pageHeight = layoutHeight + insets.top;

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View
        style={styles.fullBleedMeasure}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - layoutHeight) > 1) setLayoutHeight(h);
        }}
      >
        {layoutHeight > 0 ? (
          <View
            style={[
              styles.fullBleedBleed,
              {
                top: -insets.top,
                height: pageHeight,
              },
            ]}
          >
            <ScrollView
              ref={chapterScrollRef}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              bounces={false}
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ height: pageHeight }}
              contentContainerStyle={{ width: winWidth * 2, height: pageHeight }}
              onMomentumScrollEnd={onChapterMomentumEnd}
              directionalLockEnabled
            >
              <View style={{ width: winWidth, height: pageHeight, backgroundColor: '#000' }}>
                {designsLoading ? (
                  <SkeletonTile fullBleed />
                ) : (
                  <GalleryVerticalPager
                    data={designs as GalleryItem[]}
                    isProduct={false}
                    pageHeight={pageHeight}
                    windowWidth={winWidth}
                    businessColors={businessColors}
                    refreshing={refreshingDesigns}
                    onRefresh={onRefreshDesigns}
                    onOpenUrls={openViewer}
                    t={t}
                    bottomInset={insets.bottom}
                    topInset={insets.top}
                    initialFocusItemId={designId}
                  />
                )}
              </View>
              <View style={{ width: winWidth, height: pageHeight, backgroundColor: '#000' }}>
                {productsLoading ? (
                  <SkeletonTile fullBleed />
                ) : (
                  <GalleryVerticalPager
                    data={products as GalleryItem[]}
                    isProduct
                    pageHeight={pageHeight}
                    windowWidth={winWidth}
                    businessColors={businessColors}
                    refreshing={refreshingProducts}
                    onRefresh={onRefreshProducts}
                    onOpenUrls={openViewer}
                    t={t}
                    bottomInset={insets.bottom}
                    topInset={insets.top}
                    initialFocusItemId={productId}
                  />
                )}
              </View>
            </ScrollView>
          </View>
        ) : (
          <SkeletonTile fullBleed />
        )}
      </View>

      <Modal visible={viewerVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerBackdrop}>
          <RNAnimated.View style={{ flex: 1, transform: [{ translateY: panY }] }} {...panResponder.panHandlers}>
            <SafeAreaProvider>
              <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.viewerHeader}>
                  <TouchableOpacity onPress={() => setViewerVisible(false)} style={styles.viewerCloseBtn}>
                    <Ionicons name="close" size={22} color={Colors.white} />
                  </TouchableOpacity>
                  <Text style={[styles.viewerTitle, { color: businessColors.primary }]}>
                    {activeTab === 'designs'
                      ? t('gallery.viewer.designPhotos', 'Design Photos')
                      : t('gallery.viewer.productPhotos', 'Product Photos')}
                  </Text>
                  <View style={{ width: 44 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Pressable style={styles.viewerHitAreaTop} onPress={() => setViewerVisible(false)} />
                  <Pressable style={styles.viewerHitAreaBottom} onPress={() => setViewerVisible(false)} />
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={(e) => {
                      const x = e.nativeEvent.contentOffset.x;
                      const w = e.nativeEvent.layoutMeasurement.width;
                      const idx = Math.round(x / (w || 1));
                      if (idx !== viewerIndex) setViewerIndex(idx);
                    }}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ alignItems: 'center' }}
                  >
                    {viewerImages.map((url, idx) => (
                      <View key={`viewer-${idx}`} style={{ width, height: '80%', justifyContent: 'center', alignItems: 'center' }}>
                        {isVideoUrl(url) ? (
                          <Video
                            source={{ uri: url }}
                            style={{ width: width, height: '100%' }}
                            resizeMode={ResizeMode.CONTAIN}
                            isLooping
                            shouldPlay
                            isMuted
                            useNativeControls={false}
                          />
                        ) : (
                          <Image source={{ uri: url }} style={{ width: width, height: '100%' }} resizeMode="contain" />
                        )}
                      </View>
                    ))}
                  </ScrollView>
                  {viewerImages.length > 1 && (
                    <View style={styles.viewerDots}>
                      {viewerImages.map((_, i) => (
                        <View
                          key={`dot-${i}`}
                          style={[styles.viewerDot, i === viewerIndex && { backgroundColor: businessColors.primary }]}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </SafeAreaView>
            </SafeAreaProvider>
          </RNAnimated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullBleedMeasure: {
    flex: 1,
    overflow: 'hidden',
  },
  fullBleedBleed: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  feedFlex: {
    flex: 1,
  },
  pagerHost: {
    flex: 1,
    backgroundColor: '#000',
  },
  pagerPage: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  paginationColumn: {
    position: 'absolute',
    top: '18%',
    bottom: '32%',
    justifyContent: 'center',
  },
  detailsWrapper: {
    position: 'absolute',
    bottom: 0,
    top: '52%',
    alignItems: 'flex-start',
  },
  detailsSlot: {
    position: 'absolute',
    width: '100%',
    overflow: 'hidden',
  },
  pagerTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 28,
    marginBottom: _spacing / 2,
    letterSpacing: -0.5,
  },
  pagerDescription: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: _spacing / 2,
    lineHeight: 21,
  },
  pagerMeta: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pagerFab: {
    position: 'absolute',
    zIndex: 20,
  },
  pagerFabInner: {
    width: _buttonSize,
    height: _buttonSize,
    borderRadius: _buttonSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  skeletonPage: {
    flex: 1,
    margin: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.card,
  },
  skeletonPageFullBleed: {
    margin: 0,
    borderRadius: 0,
  },
  skeletonFill: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  viewerHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    position: 'relative',
    zIndex: 3,
  },
  viewerTitle: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  viewerCloseBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerHitAreaTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '10%',
    zIndex: 1,
  },
  viewerHitAreaBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '10%',
    zIndex: 1,
  },
  viewerDots: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  viewerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
    backgroundColor: '#000',
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    paddingHorizontal: 28,
  },
});
