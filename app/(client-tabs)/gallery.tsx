import React, { useState, useEffect, useRef, memo } from 'react';
import { StyleSheet, View, FlatList, Text, TouchableOpacity, Dimensions, Image, Modal, Animated, PanResponder, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useDesignsStore } from '@/stores/designsStore';
import { useProductsStore } from '@/stores/productsStore';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView } from 'react-native';
import { supabase, getBusinessId } from '@/lib/supabase';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { Product } from '@/lib/api/products';

const { width } = Dimensions.get('window');
const numColumns = 2;
const horizontalPadding = 16;
const interItemGap = 8;
const rawTileSize = (width - horizontalPadding * 2 - interItemGap) / numColumns;
const tileSize = Math.round(rawTileSize);
const usedWidth = tileSize * numColumns + interItemGap + horizontalPadding * 2;
const remainderSpace = Math.max(0, width - usedWidth);
const effectiveContentPadding = horizontalPadding + remainderSpace / 2;
const slideSize = tileSize - 8; // account for tile padding

type DesignItem = {
  id: string;
  name: string;
  image_url: string;
  image_urls?: string[];
  popularity?: number;
  categories?: string[];
};

type GalleryItem = DesignItem | Product;

const SkeletonTile = memo(() => {
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={styles.tile}>
      <Animated.View style={[styles.skeletonBlock, { opacity }]} />
    </View>
  );
});

const DesignTile = memo(({ item, onOpen, adminUser, businessColors, isProduct = false }: { item: GalleryItem; onOpen: (images: string[]) => void; adminUser: AdminUser | null; businessColors: any; isProduct?: boolean }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  };
  const onLoad = () => {
    Animated.timing(imageOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  };
  const urls = (item as DesignItem).image_urls && (item as DesignItem).image_urls.length > 0 ? (item as DesignItem).image_urls : [item.image_url];
  return (
    <Animated.View style={[styles.tile, { transform: [{ scale }] }]}> 
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => onOpen(urls)}
        android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
        style={{ flex: 1 }}
      >
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            style={{ flex: 1 }}
          >
            {urls.map((url, idx) => (
              <View key={`${item.id}-img-${idx}`} style={{ width: slideSize, height: slideSize }}>
                <Animated.Image
                  source={{ uri: url }}
                  style={[styles.image, { opacity: imageOpacity }]}
                  resizeMode="cover"
                  onLoad={onLoad}
                />
              </View>
            ))}
          </ScrollView>
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={styles.gradient}>
            <Text style={styles.designName}>{item.name}</Text>
            {isProduct && (item as Product).price && (
              <Text style={styles.productPrice}>${(item as Product).price}</Text>
            )}
          </LinearGradient>
          {urls.length > 1 && (
            <View style={styles.multiBadge}>
              <Ionicons name="images-outline" size={12} color={businessColors.primary} />
              <Text style={styles.multiBadgeText}>{urls.length}</Text>
            </View>
          )}
          
          {/* Manager Profile Circle - Only show for designs */}
          {adminUser && !isProduct && (
            <View style={styles.managerProfileContainer}>
              <LinearGradient
                colors={['#000000', '#333333', '#666666']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.managerProfileRing}
              >
                <View style={styles.managerProfileInner}>
                  <Image
                    source={
                      adminUser.image_url 
                        ? { uri: adminUser.image_url }
                        : require('@/assets/images/user.png')
                    }
                    style={styles.managerProfileImage}
                    resizeMode="cover"
                  />
                </View>
              </LinearGradient>
              <View style={styles.staticRing} />
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

interface AdminUser {
  id: string;
  name: string;
  image_url?: string;
}

export default function GalleryScreen() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState<'designs' | 'products'>('designs');
  const panY = useRef(new Animated.Value(0)).current;
  const { colors: businessColors } = useBusinessColors();
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
        return Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10; // vertical intent
      },
      onPanResponderMove: Animated.event([null, { dy: panY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        const { dy, vy } = gesture;
        if (Math.abs(dy) > 120 || Math.abs(vy) > 1.2) {
          setViewerVisible(false);
          Animated.timing(panY, { toValue: dy > 0 ? 600 : -600, duration: 150, useNativeDriver: true }).start(() => {
            resetPan();
          });
        } else {
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;
  
  // Use Supabase stores
  const { designs, isLoading: designsLoading, fetchDesigns } = useDesignsStore();
  const { products, isLoading: productsLoading, fetchProducts } = useProductsStore();
  
  // Load data on component mount
  useEffect(() => {
    fetchDesigns();
    fetchProducts();
  }, []);

  // Load admin user profile
  useEffect(() => {
    const loadAdminUser = async () => {
      try {
        const businessId = getBusinessId();
        
        const { data, error } = await supabase
          .from('users')
          .select('id, name, image_url')
          .eq('user_type', 'admin')
          .eq('business_id', businessId) // Filter by current business
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          setAdminUser(data);
        }
      } catch (e) {
        console.error('Error loading admin user:', e);
      }
    };

    loadAdminUser();
  }, []);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'designs') {
        await fetchDesigns();
      } else {
        await fetchProducts();
      }
    } finally {
      setRefreshing(false);
    }
  };
  
  
  
  const currentData = activeTab === 'designs' ? designs : products;
  const isLoading = activeTab === 'designs' ? designsLoading : productsLoading;
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" backgroundColor={Colors.white} />
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={{ width: 22 }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: businessColors.primary }]}>
              {activeTab === 'designs' ? 'Design Gallery' : 'Products'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {activeTab === 'designs' ? 'Inspiration for your next style' : 'Browse our products'}
            </Text>
          </View>
          <View style={{ width: 22 }} />
        </View>
        
        {/* Toggle Button */}
        <View style={styles.toggleContainer}>
          <View style={[styles.toggleWrapper, { backgroundColor: businessColors.primary + '15' }]}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                activeTab === 'designs' && [styles.toggleButtonActive, { backgroundColor: businessColors.primary }]
              ]}
              onPress={() => setActiveTab('designs')}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="images-outline" 
                size={16} 
                color={activeTab === 'designs' ? Colors.white : businessColors.primary} 
                style={styles.toggleIcon}
              />
              <Text style={[
                styles.toggleButtonText,
                activeTab === 'designs' && { color: Colors.white }
              ]}>
                Designs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                activeTab === 'products' && [styles.toggleButtonActive, { backgroundColor: businessColors.primary }]
              ]}
              onPress={() => setActiveTab('products')}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="cube-outline" 
                size={16} 
                color={activeTab === 'products' ? Colors.white : businessColors.primary} 
                style={styles.toggleIcon}
              />
              <Text style={[
                styles.toggleButtonText,
                activeTab === 'products' && { color: Colors.white }
              ]}>
                Products
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={styles.contentWrapper}>
        {isLoading ? (
          <View style={styles.skeletonContainer}>
            <View style={styles.skeletonRow}>
              {Array(2).fill(0).map((_, i) => (
                <SkeletonTile key={`s1-${i}`} />
              ))}
            </View>
            <View style={styles.skeletonRow}>
              {Array(2).fill(0).map((_, i) => (
                <SkeletonTile key={`s2-${i}`} />
              ))}
            </View>
            <View style={styles.skeletonRow}>
              {Array(2).fill(0).map((_, i) => (
                <SkeletonTile key={`s3-${i}`} />
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={currentData as GalleryItem[]}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            contentContainerStyle={[styles.listContent, { paddingHorizontal: effectiveContentPadding }]}
            columnWrapperStyle={[styles.columnWrapper, { columnGap: interItemGap }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={businessColors.primary} />} 
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons 
                    name={activeTab === 'designs' ? "images-outline" : "cube-outline"} 
                    size={26} 
                    color={businessColors.primary} 
                  />
                </View>
                <Text style={[styles.emptyTitle, { color: businessColors.primary }]}>
                  {activeTab === 'designs' ? 'No designs yet' : 'No products yet'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeTab === 'designs' 
                    ? 'When you add designs, they will appear here' 
                    : 'When you add products, they will appear here'
                  }
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <DesignTile
                item={item}
                adminUser={adminUser}
                businessColors={businessColors}
                isProduct={activeTab === 'products'}
                onOpen={(urls) => {
                  setViewerImages(urls);
                  setViewerIndex(0);
                  setViewerVisible(true);
                }}
              />
            )}
          />
        )}
      </View>
      {/* Fullscreen image viewer */}
      <Modal visible={viewerVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerBackdrop}>
          <Animated.View style={{ flex: 1, transform: [{ translateY: panY }] }} {...panResponder.panHandlers}>
          <SafeAreaProvider>
          <SafeAreaView style={{ flex: 1 }} edges={['top','bottom']}>
            <View style={styles.viewerHeader}>
              <TouchableOpacity onPress={() => setViewerVisible(false)} style={styles.viewerCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.white} />
              </TouchableOpacity>
              <Text style={[styles.viewerTitle, { color: businessColors.primary }]}>
                {activeTab === 'designs' ? 'Design Photos' : 'Product Photos'}
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
                    <Image source={{ uri: url }} style={{ width: width, height: '100%' }} resizeMode="contain" />
                  </View>
                ))}
              </ScrollView>
              {viewerImages.length > 1 && (
                <View style={styles.viewerDots}>
                  {viewerImages.map((_, i) => (
                    <View key={`dot-${i}`} style={[styles.viewerDot, i === viewerIndex && { backgroundColor: businessColors.primary }]} />
                  ))}
                </View>
              )}
            </View>
          </SafeAreaView>
          </SafeAreaProvider>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.white,
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.subtext,
    marginTop: 6,
  },
  placeholder: {
    width: 40,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.white,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  categoriesContainer: {
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectedCategoryChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: 14,
    color: Colors.text,
  },
  selectedCategoryChipText: {
    color: Colors.white,
  },
  tile: {
    width: tileSize,
    height: tileSize,
    padding: 4,
  },
  imageContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
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
    justifyContent: 'flex-start',
  },
  designName: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'left',
    marginBottom: 4,
  },
  productPrice: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'left',
    opacity: 0.9,
  },
  categoryTags: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
  categoryTag: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
    marginBottom: 4,
  },
  categoryTagText: {
    color: Colors.white,
    fontSize: 10,
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  multiBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  multiBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '600',
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
  viewerDotActive: {
    backgroundColor: Colors.white,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 120,
    paddingTop: 12,
  },
  columnWrapper: {
    gap: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 8,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  skeletonContainer: {
    paddingHorizontal: 4,
    paddingTop: 12,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skeletonBlock: {
    flex: 1,
    height: tileSize - 8,
    borderRadius: 12,
    backgroundColor: Colors.card,
    margin: 4,
  },
  // Manager Profile Styles
  managerProfileContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 20,
  },
  managerProfileRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  managerProfileInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    padding: 1,
  },
  managerProfileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
  },
  staticRing: {
    position: 'absolute',
    top: -1,
    left: -1,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: '#000000',
    opacity: 0.7,
  },
  // Toggle Button Styles
  toggleContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  toggleWrapper: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  toggleButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.subtext,
  },
  toggleIcon: {
    marginRight: 4,
  },
});