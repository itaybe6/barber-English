import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/lib/api/products';
import { useColors, usePrimaryContrast } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Match admin home product row (`app/(tabs)/index.tsx`) */
const PRODUCT_TILE_WIDTH = 160;
const PRODUCT_TILE_GAP = 14;
const PRODUCT_CAROUSEL_STRIDE = PRODUCT_TILE_WIDTH + PRODUCT_TILE_GAP;

const LIGHTBOX_DESC_MAX_H = Math.round(SCREEN_HEIGHT * 0.22);

interface ProductCarouselProps {
  products: Product[];
  onProductPress?: (product: Product) => void;
  title?: string;
  subtitle?: string;
  /** When false, only the carousel rows render (matches `DesignCarousel` without header). Default true. */
  showHeader?: boolean;
  /** When false, the line under the section title is hidden. Default true. */
  showSubtitle?: boolean;
}

export default function ProductCarousel({
  products,
  onProductPress,
  title,
  subtitle,
  showHeader = true,
  showSubtitle = true,
}: ProductCarouselProps) {
  const { t } = useTranslation();
  const displayTitle = title ?? t('products.carouselTitle');
  const displaySubtitle = subtitle ?? t('products.carouselSubtitle');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const colors = useColors();
  const { onPrimary } = usePrimaryContrast();
  const insets = useSafeAreaInsets();

  const closeProductLightbox = () => {
    setModalVisible(false);
    setSelectedProduct(null);
  };

  const handleProductPress = (product: Product) => {
    if (onProductPress) {
      onProductPress(product);
      return;
    }
    setSelectedProduct(product);
    setModalVisible(true);
  };

  const formatPrice = (price: number) => {
    const whole = Math.abs((price * 100) % 100) < 0.5;
    return `₪${whole ? price.toFixed(0) : price.toFixed(2)}`;
  };

  if (!products || products.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {showHeader ? (
        <View style={styles.elegantHeader}>
          <Text style={[styles.elegantTitle, { color: colors.text }]}>{displayTitle}</Text>
          <LinearGradient
            colors={[`${colors.primary}00`, `${colors.primary}99`, `${colors.primary}00`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.sectionAccentLine}
          />
          {showSubtitle ? (
            <Text style={[styles.elegantSubtitle, { color: colors.textSecondary }]}>
              {displaySubtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.productCarousel}
        contentContainerStyle={styles.productCarouselContent}
        decelerationRate="fast"
        snapToInterval={PRODUCT_CAROUSEL_STRIDE}
        snapToAlignment="start"
      >
        {products.map((product) => {
          const priceStr =
            product.price % 1 === 0
              ? `₪${product.price.toFixed(0)}`
              : `₪${product.price.toFixed(2)}`;
          return (
            <TouchableOpacity
              key={product.id}
              onPress={() => handleProductPress(product)}
              activeOpacity={0.88}
              style={styles.productTile}
            >
              <View style={styles.productImageWrap}>
                {product.image_url ? (
                  <Image
                    source={{ uri: product.image_url }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.productPlaceholder}>
                    <Ionicons name="bag-outline" size={40} color="#8E8E93" />
                  </View>
                )}
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(0,0,0,0.5)', 'transparent']}
                  locations={[0, 0.65]}
                  style={styles.overlayGradientTop}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
                  locations={[0.15, 0.55, 1]}
                  style={styles.overlayGradientBottom}
                />
                <View style={styles.pricePillWrap} pointerEvents="none">
                  <View style={[styles.pricePill, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.pricePillText, { color: onPrimary }]}>{priceStr}</Text>
                  </View>
                </View>
                <View style={styles.nameWrap} pointerEvents="none">
                  <Text style={styles.nameOverlay} numberOfLines={2}>
                    {product.name}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeProductLightbox}
      >
        <View style={styles.lightboxOverlay}>
          <SafeAreaView style={styles.lightboxSafe} edges={['left', 'right']}>
            <TouchableOpacity
              style={[
                styles.lightboxCloseButton,
                {
                  top: Math.max(insets.top, 12) + 8,
                },
              ]}
              onPress={closeProductLightbox}
              accessibilityRole="button"
              accessibilityLabel={t('close', 'Close')}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            {selectedProduct && (
              <View style={styles.lightboxBody}>
                <View style={styles.lightboxImageStage}>
                  {selectedProduct.image_url ? (
                    <ExpoImage
                      source={{ uri: selectedProduct.image_url }}
                      style={styles.lightboxImage}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                      transition={150}
                    />
                  ) : (
                    <Image
                      source={require('@/assets/images/default/HomePage/barber/101-min.png')}
                      style={styles.lightboxImage}
                      resizeMode="contain"
                    />
                  )}
                </View>

                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
                  locations={[0, 0.35, 1]}
                  style={styles.lightboxBottomFade}
                  pointerEvents="none"
                />

                <View
                  style={[
                    styles.lightboxBottom,
                    { paddingBottom: Math.max(insets.bottom, 16) + 8 },
                  ]}
                >
                  <Text style={styles.lightboxTitle}>{selectedProduct.name}</Text>
                  {selectedProduct.description ? (
                    <ScrollView
                      style={[styles.lightboxDescScroll, { maxHeight: LIGHTBOX_DESC_MAX_H }]}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled
                    >
                      <Text style={styles.lightboxDescription}>{selectedProduct.description}</Text>
                    </ScrollView>
                  ) : null}
                  <Text style={[styles.lightboxPrice, { color: colors.primary }]}>
                    {formatPrice(selectedProduct.price)}
                  </Text>
                </View>
              </View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Same shell as `DesignCarousel` on client home — no white card, flush with sheet. */
  container: {
    paddingTop: 0,
    paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  /** Aligned with `DesignCarousel` section header — no white card. */
  elegantHeader: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 14,
    marginTop: 16,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  sectionAccentLine: {
    height: 2,
    borderRadius: 1,
    marginTop: 10,
    opacity: 0.5,
    marginHorizontal: 48,
    alignSelf: 'stretch',
  },
  elegantTitle: {
    fontSize: 26,
    textAlign: 'center',
    ...(Platform.OS === 'ios'
      ? {
          fontFamily: 'Didot-Bold',
          fontWeight: '400' as const,
          letterSpacing: 0.65,
        }
      : {
          fontFamily: 'serif',
          fontWeight: '800' as const,
          letterSpacing: 0.35,
        }),
  },
  elegantSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginTop: 6,
  },
  productCarousel: {},
  productCarouselContent: {
    paddingHorizontal: 16,
    gap: PRODUCT_TILE_GAP,
    paddingVertical: 6,
    paddingBottom: 8,
  },
  productTile: {
    width: PRODUCT_TILE_WIDTH,
    height: PRODUCT_TILE_WIDTH,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#ECECEF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  productImageWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  productImage: {
    ...StyleSheet.absoluteFillObject,
  },
  productPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECECEF',
  },
  overlayGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
  overlayGradientBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '72%',
  },
  pricePillWrap: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
  },
  nameWrap: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 52,
    zIndex: 2,
    alignItems: 'flex-start',
  },
  nameOverlay: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.15,
    lineHeight: 17,
    textAlign: 'left',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pricePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pricePillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  lightboxSafe: {
    flex: 1,
    width: '100%',
  },
  lightboxCloseButton: {
    position: 'absolute',
    start: 16,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  lightboxBody: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  lightboxImageStage: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: SCREEN_HEIGHT * 0.26,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Math.round(SCREEN_HEIGHT * 0.38),
  },
  lightboxBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 20,
  },
  lightboxTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  lightboxDescScroll: {
    marginBottom: 10,
  },
  lightboxDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#D1D1D6',
    textAlign: 'center',
  },
  lightboxPrice: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: 4,
  },
});
