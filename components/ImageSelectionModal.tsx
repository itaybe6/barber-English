import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Dimensions,
  Alert,
  Platform,
  StatusBar,
  SafeAreaView,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../constants/colors';
import * as ImagePicker from 'expo-image-picker';

interface ImageSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onImageSelected: (imageUri: string, isPreset: boolean) => void;
  title: string;
  mainCategory: 'existingBooking' | 'bookingPage' | 'homePage';
}

// Preset images organized by category - using local images from default folder
const PRESET_IMAGES = {
  existingBooking: {
    barber: [
      require('../assets/images/default/ExistingBooking/barber/1.jpg'),
      require('../assets/images/default/ExistingBooking/barber/2.jpg'),
      require('../assets/images/default/ExistingBooking/barber/3.jpg'),
      require('../assets/images/default/ExistingBooking/barber/4.jpg'),
    ],
    nails: [
      // Add nail images when available
    ],
  },
  bookingPage: {
    barber: [
      require('../assets/images/default/BookingPage/barber/1.jpg'),
      require('../assets/images/default/BookingPage/barber/2.jpg'),
      require('../assets/images/default/BookingPage/barber/3.jpg'),
      require('../assets/images/default/BookingPage/barber/4.jpg'),
    ],
    nails: [
      // Add nail images when available
    ],
  },
  homePage: {
    barber: [
      require('../assets/images/default/HomePage/barber/1.jpg'),
      require('../assets/images/default/HomePage/barber/2.jpg'),
      require('../assets/images/default/HomePage/barber/3.jpg'),
      require('../assets/images/default/HomePage/barber/4.jpg'),
    ],
    nails: [
      require('../assets/images/default/HomePage/barber/1.jpg'),
      require('../assets/images/default/HomePage/barber/2.jpg'),
      require('../assets/images/default/HomePage/barber/3.jpg'),
      require('../assets/images/default/HomePage/barber/4.jpg'),
    ],
  },
};

const SUB_CATEGORIES = [
  { key: 'barber', name: 'Barbers', icon: 'cut-outline' },
  { key: 'nails', name: 'Nail Art', icon: 'hand-left-outline' },
];

const ImageSelectionModal: React.FC<ImageSelectionModalProps> = ({
  visible,
  onClose,
  onImageSelected,
  title,
  mainCategory,
}) => {
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('barber');
  const [loadingImages, setLoadingImages] = useState<{[key: string]: boolean}>({});
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Preload images for better performance
      const currentImages = PRESET_IMAGES[mainCategory]?.[selectedSubCategory as 'barber' | 'nails'];
      if (currentImages) {
        currentImages.forEach((imageSource, index) => {
          const imageKey = `${mainCategory}-${selectedSubCategory}-${index}`;
          setLoadingImages(prev => ({ ...prev, [imageKey]: true }));
        });
      }
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Clear loading states when modal closes
      setLoadingImages({});
    }
  }, [visible, mainCategory, selectedSubCategory]);

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow gallery access to select an image');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: false,
        quality: 0.9,
        base64: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        onImageSelected(asset.uri, false);
        onClose();
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Unable to select image');
    }
  };

  const handlePresetImageSelect = (imageSource: any) => {
    // Convert local image source to URI for consistency
    const imageUri = Image.resolveAssetSource(imageSource).uri;
    onImageSelected(imageUri, true);
    onClose();
  };

  const handleImageLoadStart = (imageKey: string) => {
    setLoadingImages(prev => ({ ...prev, [imageKey]: true }));
  };

  const handleImageLoadEnd = (imageKey: string) => {
    setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <Animated.View 
          style={[
            styles.animatedContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header with Blur Effect */}
          <BlurView intensity={100} tint="light" style={styles.headerBlur}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={handlePickFromGallery} style={styles.galleryButton}>
              <Text style={styles.galleryButtonText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </BlurView>

        {/* Sub Category Selector */}
        <View style={styles.categorySection}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.categoryContainer}
            contentContainerStyle={styles.categoryScrollContent}
          >
            {SUB_CATEGORIES.map((subCategory) => (
              <TouchableOpacity
                key={subCategory.key}
                style={[
                  styles.categoryButton,
                  selectedSubCategory === subCategory.key && styles.selectedCategoryButton,
                ]}
                onPress={() => setSelectedSubCategory(subCategory.key)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryContent}>
                  <Ionicons 
                    name={subCategory.icon as any} 
                    size={20} 
                    color={selectedSubCategory === subCategory.key ? '#FFFFFF' : Colors.primary}
                    style={styles.categoryIcon}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      selectedSubCategory === subCategory.key && styles.selectedCategoryText,
                    ]}
                  >
                    {subCategory.name}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Images Grid with Apple-style Cards */}
        <ScrollView 
          style={styles.imagesContainer} 
          contentContainerStyle={styles.imagesGrid}
          showsVerticalScrollIndicator={false}
        >
          {(() => {
            const currentImages = PRESET_IMAGES[mainCategory]?.[selectedSubCategory as 'barber' | 'nails'];
            
            if (!currentImages || currentImages.length === 0) {
              return (
                <View style={styles.noImagesContainer}>
                  <Text style={styles.noImagesText}>
                    No images available for {selectedSubCategory} in {mainCategory}
                  </Text>
                </View>
              );
            }
            
            return currentImages.map((imageSource, index) => {
              const imageKey = `${mainCategory}-${selectedSubCategory}-${index}`;
              const isLoading = loadingImages[imageKey];
              
              return (
                <TouchableOpacity
                  key={index}
                  style={styles.imageCard}
                  onPress={() => handlePresetImageSelect(imageSource)}
                  activeOpacity={0.9}
                >
                  <View style={styles.imageContainer}>
                    {/* Loading Placeholder */}
                    {isLoading && (
                      <View style={styles.imagePlaceholder}>
                        <Ionicons name="image-outline" size={40} color="#CCCCCC" />
                        <Text style={styles.loadingText}>Loading...</Text>
                      </View>
                    )}
                    
                    <Image 
                      source={imageSource} 
                      style={[styles.presetImage, isLoading && styles.hiddenImage]} 
                      resizeMode="cover"
                      onLoadStart={() => handleImageLoadStart(imageKey)}
                      onLoadEnd={() => handleImageLoadEnd(imageKey)}
                      onError={() => handleImageLoadEnd(imageKey)}
                    />
                    
                    <View style={[styles.imageOverlay, { opacity: 0 }]}>
                      <View style={styles.selectButton}>
                        <Text style={styles.selectButtonText}>Select</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            });
          })()}
        </ScrollView>

          {/* Bottom Info with Apple-style Typography */}
          <View style={styles.bottomInfo}>
            <Text style={styles.infoText}>
              Choose a preset image from the categories above or tap "Gallery" to upload your own
            </Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
};

const { width, height } = Dimensions.get('window');
const imageSize = (width - 80) / 2; // 2 images per row with better spacing

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  animatedContainer: {
    flex: 1,
  },
  headerBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeButtonText: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '400',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  galleryButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  galleryButtonText: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '400',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  categorySection: {
    marginTop: Platform.OS === 'ios' ? 90 : 70,
    marginBottom: 24,
  },
  categoryContainer: {
    paddingHorizontal: 20,
  },
  categoryScrollContent: {
    paddingHorizontal: 0,
  },
  categoryButton: {
    marginRight: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedCategoryButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryIcon: {
    marginRight: 8,
  },
  categoryText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  selectedCategoryText: {
    color: '#FFFFFF',
  },
  imagesContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 100,
  },
  imageCard: {
    width: imageSize,
    height: imageSize + 40,
    marginBottom: 20,
  },
  imageContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  presetImage: {
    width: '100%',
    height: imageSize,
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0,
  },
  selectButton: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: 'rgba(248,249,250,0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  infoText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  noImagesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  noImagesText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  imagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  loadingText: {
    fontSize: 12,
    color: '#999999',
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  hiddenImage: {
    opacity: 0,
  },
});

export default ImageSelectionModal;
