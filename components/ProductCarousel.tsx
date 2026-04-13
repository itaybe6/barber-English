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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** Narrower cards so carousel doesn’t feel full-bleed wide */
const CARD_WIDTH = SCREEN_WIDTH * 0.44;
/** Image area height — card adds white info strip + price pill below */
const PRODUCT_IMAGE_HEIGHT = CARD_WIDTH * 0.88;
const CARD_SPACING = 14;

const LIGHTBOX_DESC_MAX_H = Math.round(SCREEN_HEIGHT * 0.22);

interface ProductCarouselProps {
  products: Product[];
  onProductPress?: (product: Product) => void;
  title?: string;
  subtitle?: string;
}

export default function ProductCarousel({ 
  products, 
  onProductPress, 
  title,
  subtitle,
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

  const renderProductCard = (product: Product, index: number) => {
    return (
      <TouchableOpacity
        key={product.id}
        style={styles.productContainer}
        onPress={() => handleProductPress(product)}
        activeOpacity={0.88}
      >
        <View style={styles.productCard}>
          <View style={styles.productImageSection}>
            <Image
              source={
                product.image_url
                  ? { uri: product.image_url }
                  : require('@/assets/images/default/HomePage/barber/101-min.png')
              }
              style={styles.productImage}
              resizeMode="cover"
            />
          </View>
          <View style={styles.productInfoSection}>
            <Text style={styles.productName} numberOfLines={2}>
              {product.name}
            </Text>
          </View>
        </View>

        {/* Price pill — half outside the card (overlaps bottom of white strip) */}
        <View
          style={[
            styles.pricePill,
            { backgroundColor: colors.primary, shadowColor: colors.primary },
          ]}
        >
          <Text style={[styles.pricePillText, { color: onPrimary }]}>
            {formatPrice(product.price)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!products || products.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Elegant Header */}
      <View style={styles.elegantHeader}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.elegantTitle}>{displayTitle}</Text>
          <Text style={styles.elegantSubtitle}>{displaySubtitle}</Text>
        </View>
      </View>

      {/* Carousel */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="center"
        style={styles.scrollView}
      >
        {products.map((product, index) => renderProductCard(product, index))}
      </ScrollView>

      {/* Product lightbox (gallery-style: image focus, details at bottom) */}
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
                      <Text style={styles.lightboxDescription}>
                        {selectedProduct.description}
                      </Text>
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
  container: {
    paddingTop: 0,
    paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  elegantHeader: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
    marginTop: 20,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  elegantTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  elegantSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  scrollView: {},
  scrollContainer: {
    paddingHorizontal: 16,
  },
  productContainer: {
       width: CARD_WIDTH,
       marginRight: CARD_SPACING,
       alignItems: 'center',
       paddingBottom: 10,
     },
  productCard: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  productImageSection: {
    width: '100%',
    height: PRODUCT_IMAGE_HEIGHT,
    backgroundColor: '#E8E8ED',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productInfoSection: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    alignItems: 'center',
    minHeight: 56,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.14,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    lineHeight: 20,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  pricePill: {
    marginTop: -18,
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 5,
  },
  pricePillText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
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
