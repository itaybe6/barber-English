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
  SafeAreaView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Product } from '@/lib/api/products';
import { useColors } from '@/src/theme/ThemeProvider';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.52;
const CARD_HEIGHT = CARD_WIDTH * 1.1; // slightly taller than square
const CARD_SPACING = 14;

interface ProductCarouselProps {
  products: Product[];
  onProductPress?: (product: Product) => void;
  title?: string;
  subtitle?: string;
}

// Star Rating Component
const StarRating = ({ rating = 5, size = 14 }: { rating?: number; size?: number }) => {
  return (
    <View style={styles.starContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : 'star-outline'}
          size={size}
          color={star <= rating ? '#FFD700' : '#E5E5EA'}
          style={styles.star}
        />
      ))}
    </View>
  );
};

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

  const handleProductPress = (product: Product) => {
    setSelectedProduct(product);
    setModalVisible(true);
    if (onProductPress) {
      onProductPress(product);
    }
  };

  const formatPrice = (price: number) => {
    return `$${price.toFixed(0)}`;
  };

  const renderProductCard = (product: Product, index: number) => {
    return (
      <TouchableOpacity
        key={product.id}
        style={styles.productContainer}
        onPress={() => handleProductPress(product)}
        activeOpacity={0.88}
      >
        {/* Card — overflow hidden for image + gradient */}
        <View style={styles.productCard}>
          <Image
            source={
              product.image_url
                ? { uri: product.image_url }
                : require('@/assets/images/default/HomePage/barber/101-min.png')
            }
            style={styles.productImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.82)']}
            locations={[0.2, 0.55, 1]}
            style={styles.productGradient}
          />
          {/* Name sits on the gradient, above where the pill overlaps */}
          <View style={styles.productFooter}>
            <Text style={styles.productName} numberOfLines={2}>
              {product.name}
            </Text>
          </View>
        </View>

        {/* Price pill — half outside the card */}
        <View style={styles.pricePill}>
          <Text style={styles.pricePillText}>{formatPrice(product.price)}</Text>
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

      {/* Product Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContainer}>
            {selectedProduct && (
              <View style={styles.modalContent}>
                {/* Close Button */}
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>

                {/* Product Image */}
                <View style={styles.modalImageContainer}>
                  <Image
                    source={
                      selectedProduct.image_url
                        ? { uri: selectedProduct.image_url }
                        : require('@/assets/images/default/HomePage/barber/101-min.png')
                    }
                    style={styles.modalImage}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.7)']}
                    style={styles.modalImageGradient}
                  />
                </View>

                {/* Product Details */}
                <View style={styles.modalInfo}>
                  <Text style={styles.modalTitle}>{selectedProduct.name}</Text>
                  {selectedProduct.description && (
                    <Text style={styles.modalDescription}>
                      {selectedProduct.description}
                    </Text>
                  )}
                  
                  <View style={styles.modalRatingRow}>
                    <StarRating rating={5} size={16} />
                    <Text style={styles.modalRatingText}>{t('products.ratingSummary', { rating: '5.0', count: 127 })}</Text>
                  </View>
                  
                  <View style={styles.modalPriceRow}>
                    <Text style={styles.modalPrice}>{formatPrice(selectedProduct.price)}</Text>
                    <TouchableOpacity
                      style={[styles.modalBuyButton, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        Alert.alert(
                          t('products.contactUs', 'Contact Us'),
                          t('products.purchaseContact', 'To purchase this product, please contact us directly.'),
                          [{ text: t('ok', 'OK'), style: 'default' }]
                        );
                      }}
                    >
                      <Text style={styles.modalBuyButtonText}>{t('products.contactUs', 'Contact Us')}</Text>
                    </TouchableOpacity>
                  </View>
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
    // no overflow:hidden so the pill can hang outside the card
  },
  productCard: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 7,
  },
  productImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  productGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  productFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 26,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 19,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  pricePill: {
    marginTop: -16,
    backgroundColor: '#1C1C1E',
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
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
  },
  modalContent: {
    position: 'relative',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalImageContainer: {
    position: 'relative',
    height: 250,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalImageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  modalInfo: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
    lineHeight: 28,
  },
  modalDescription: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 16,
    lineHeight: 22,
  },
  modalRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalRatingText: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 8,
  },
  modalPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalPrice: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalBuyButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  modalBuyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
