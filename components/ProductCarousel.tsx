import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  InteractionManager,
  AppState,
  Modal,
  SafeAreaView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Product } from '@/lib/api/products';
import { useColors } from '@/src/theme/ThemeProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.42; // Slightly wider for better product display
const CARD_HEIGHT = 280; // Taller for product cards
const CARD_SPACING = 16;

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
  title = "Our Products",
  subtitle = "Discover our premium collection"
}: ProductCarouselProps) {
  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const colors = useColors();
  
  // Animation values for floating elements
  const floatingAnim = useRef(new Animated.Value(0)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Floating animation effect
  useEffect(() => {
    const createFloatingAnimation = () => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(floatingAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(floatingAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const createSparkleAnimation = () => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(sparkleAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(sparkleAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const createGlowAnimation = () => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 3000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 3000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      createFloatingAnimation().start();
      createSparkleAnimation().start();
      createGlowAnimation().start();
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        createFloatingAnimation().start();
        createSparkleAnimation().start();
        createGlowAnimation().start();
      }
    });

    return () => {
      interactionHandle && typeof interactionHandle.cancel === 'function' && interactionHandle.cancel();
      appStateSub.remove();
    };
  }, [floatingAnim, sparkleAnim, glowAnim]);

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
    const floatingStyle = {
      transform: [
        {
          translateY: floatingAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -8],
          }),
        },
      ],
    };

    const glowStyle = {
      opacity: glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.7],
      }),
    };

    return (
      <View key={product.id} style={styles.productContainer}>
        <Animated.View style={[styles.productCard, floatingStyle]}>
          {/* Product Image Container */}
          <View style={styles.productImageContainer}>
            <Image
              source={
                product.image_url
                  ? { uri: product.image_url }
                  : require('@/assets/images/default/HomePage/barber/1.jpg')
              }
              style={styles.productImage}
              resizeMode="cover"
            />
            
            {/* Gradient Overlay */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.3)']}
              style={styles.productImageOverlay}
            />
            
            {/* Glow Effect */}
            <Animated.View style={[styles.glowEffect, glowStyle]} />
            
            {/* Star Rating Badge */}
            <View style={styles.starRatingBadge}>
              <BlurView intensity={20} tint="light" style={styles.starRatingBlur}>
                <StarRating rating={5} size={12} />
              </BlurView>
            </View>
            
            {/* Price Badge */}
            <View style={styles.priceBadge}>
              <BlurView intensity={24} tint="light" style={styles.priceBadgeBlur}>
                <Text style={styles.priceBadgeText}>{formatPrice(product.price)}</Text>
              </BlurView>
            </View>
          </View>

          {/* Product Info */}
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>
              {product.name}
            </Text>
            {product.description && (
              <Text style={styles.productDescription} numberOfLines={2}>
                {product.description}
              </Text>
            )}
            
            {/* Bottom Row - Empty for spacing */}
            <View style={styles.productBottomRow}>
            </View>
          </View>

          {/* Touch Overlay */}
          <TouchableOpacity
            style={styles.productTouchOverlay}
            onPress={() => handleProductPress(product)}
            activeOpacity={0.95}
          >
            <View style={styles.productActionIndicator}>
              <MaterialIcons name="shopping-bag" size={20} color={colors.primary} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
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
          <Text style={[styles.elegantTitle, { color: colors.primary }]}>{title}</Text>
          <Text style={styles.elegantSubtitle}>{subtitle}</Text>
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
                        : require('@/assets/images/default/HomePage/barber/1.jpg')
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
                    <Text style={styles.modalRatingText}>5.0 (127 reviews)</Text>
                  </View>
                  
                  <View style={styles.modalPriceRow}>
                    <Text style={styles.modalPrice}>{formatPrice(selectedProduct.price)}</Text>
                    <TouchableOpacity
                      style={[styles.modalBuyButton, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        Alert.alert(
                          'Contact Us',
                          'To purchase this product, please contact us directly.',
                          [{ text: 'OK', style: 'default' }]
                        );
                      }}
                    >
                      <Text style={styles.modalBuyButtonText}>Contact Us</Text>
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
  scrollView: {
    paddingLeft: 24,
  },
  scrollContainer: {
    paddingRight: 24,
  },
  productContainer: {
    width: CARD_WIDTH,
    marginRight: CARD_SPACING,
    alignItems: 'center',
  },
  productCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  productImageContainer: {
    position: 'relative',
    height: 180,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glowEffect: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 30,
  },
  starRatingBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  starRatingBlur: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  priceBadgeBlur: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  priceBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  productInfo: {
    padding: 16,
    paddingTop: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
    lineHeight: 20,
  },
  productDescription: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 12,
    lineHeight: 16,
  },
  productBottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  productTouchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0,
  },
  productActionIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  starContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginRight: 2,
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
