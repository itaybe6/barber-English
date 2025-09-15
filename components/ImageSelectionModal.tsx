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
import { Plus, Check } from 'lucide-react-native';
import Colors from '../constants/colors';
import { useColors } from '../src/theme/ThemeProvider';
import * as ImagePicker from 'expo-image-picker';

interface ImageSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onImageSelected: (imageUri: string, isPreset: boolean) => void;
  title: string;
  mainCategory: 'existingBooking' | 'bookingPage' | 'homePage' | 'loginPage';
}

interface SelectedImage {
  uri: string;
  isPreset: boolean;
  source?: any;
}

// Preset images organized by category - using local images from default folder
const PRESET_IMAGES = {
  existingBooking: {
    barber: [
      require('../assets/images/default/ExistingBooking/barber/1.jpg'),
      require('../assets/images/default/ExistingBooking/barber/2.jpg'),
      require('../assets/images/default/ExistingBooking/barber/3.jpg'),
      require('../assets/images/default/ExistingBooking/barber/4.jpg'),
      require('../assets/images/default/ExistingBooking/barber/10.png'),
    ],
    nails: [
      require('../assets/images/default/ExistingBooking/nails/1.jpg'),
      require('../assets/images/default/ExistingBooking/nails/2.jpg'),
      require('../assets/images/default/ExistingBooking/nails/3.jpg'),
      require('../assets/images/default/ExistingBooking/nails/4.jpg'),
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
      require('../assets/images/default/BookingPage/nails/1.jpg'),
      require('../assets/images/default/BookingPage/nails/2.jpg'),
      require('../assets/images/default/BookingPage/nails/3.jpg'),
      require('../assets/images/default/BookingPage/nails/4.jpg'),
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
      require('../assets/images/default/HomePage/nails/1.jpg'),
      require('../assets/images/default/HomePage/nails/2.jpg'),
      require('../assets/images/default/HomePage/nails/3.jpg'),
      require('../assets/images/default/HomePage/nails/4.jpg'),
    ],
  },
  loginPage: [
    require('../assets/images/default/LoginPage/1.jpg'),
    require('../assets/images/default/LoginPage/2.jpg'),
    require('../assets/images/default/LoginPage/3.jpg'),
    require('../assets/images/default/LoginPage/4.jpg'),
    require('../assets/images/default/LoginPage/5.jpg'),
    require('../assets/images/default/LoginPage/6.jpg'),
    require('../assets/images/default/LoginPage/7.jpg'),
    require('../assets/images/default/LoginPage/8.jpg'),
    require('../assets/images/default/LoginPage/9.jpg'),
  ],
};

const SUB_CATEGORIES = [
  { key: 'barber', name: 'Barbers', icon: 'cut-outline' },
  { key: 'nails', name: 'Nail Art', icon: 'sparkles-outline' },
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
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [previewImageLoading, setPreviewImageLoading] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const previewFadeAnim = useRef(new Animated.Value(0)).current;
  const colors = useColors();

  // Preload images for better performance
  const preloadImages = React.useCallback(() => {
    let currentImages;
    if (mainCategory === 'loginPage') {
      currentImages = PRESET_IMAGES[mainCategory];
    } else {
      currentImages = PRESET_IMAGES[mainCategory]?.[selectedSubCategory as 'barber' | 'nails'];
    }
    
    if (currentImages) {
      currentImages.forEach((imageSource, index) => {
        const imageKey = mainCategory === 'loginPage' 
          ? `${mainCategory}-${index}` 
          : `${mainCategory}-${selectedSubCategory}-${index}`;
        
        // Preload the image
        const imageUri = Image.resolveAssetSource(imageSource).uri;
        Image.prefetch(imageUri).then(() => {
          setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
        }).catch(() => {
          setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
        });
        
        setLoadingImages(prev => ({ ...prev, [imageKey]: true }));
      });
    }
  }, [mainCategory, selectedSubCategory]);

  // Preload all images when modal opens for faster preview
  const preloadAllImages = React.useCallback(() => {
    Object.keys(PRESET_IMAGES).forEach(category => {
      if (category === 'loginPage') {
        PRESET_IMAGES[category].forEach((imageSource) => {
          const imageUri = Image.resolveAssetSource(imageSource).uri;
          Image.prefetch(imageUri);
        });
      } else {
        Object.keys(PRESET_IMAGES[category]).forEach(subCategory => {
          PRESET_IMAGES[category][subCategory].forEach((imageSource) => {
            const imageUri = Image.resolveAssetSource(imageSource).uri;
            Image.prefetch(imageUri);
          });
        });
      }
    });
  }, []);

  React.useEffect(() => {
    if (visible) {
      // Reset states when modal opens
      setShowPreview(false);
      setSelectedImage(null);
      
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
      preloadImages();
      // Preload all images in background for faster preview
      preloadAllImages();
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

  // Handle preview animations
  React.useEffect(() => {
    if (showPreview) {
      Animated.timing(previewFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(previewFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showPreview]);

  // Preload images when subcategory changes
  React.useEffect(() => {
    if (visible && mainCategory !== 'loginPage') {
      preloadImages();
    }
  }, [selectedSubCategory, preloadImages, visible, mainCategory]);

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
        // Pass the asset data as a JSON string to include base64 and other metadata
        const assetData = JSON.stringify({
          uri: asset.uri,
          base64: asset.base64,
          mimeType: asset.type,
          fileName: asset.fileName
        });
        
        // Show preview instead of directly selecting
        setSelectedImage({
          uri: assetData,
          isPreset: false,
        });
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Unable to select image');
    }
  };

  const handleImagePress = (imageSource: any, isPreset: boolean) => {
    const imageUri = Image.resolveAssetSource(imageSource).uri;
    
    // Start loading the preview image immediately
    setPreviewImageLoading(true);
    
    // For preset images, they should already be preloaded
    if (isPreset) {
      // Since we preload all images, this should be instant
      setTimeout(() => {
        setPreviewImageLoading(false);
      }, 100);
    } else {
      // For gallery images, we need to load them
      setPreviewImageLoading(true);
    }
    
    setSelectedImage({
      uri: imageUri,
      isPreset: isPreset,
      source: imageSource,
    });
    setShowPreview(true);
  };

  const handleSaveImage = () => {
    if (selectedImage) {
      onImageSelected(selectedImage.uri, selectedImage.isPreset);
      onClose();
    }
  };

  const handleBackFromPreview = () => {
    setShowPreview(false);
    setSelectedImage(null);
    setPreviewImageLoading(false);
  };


  const handleImageLoadStart = (imageKey: string) => {
    setLoadingImages(prev => ({ ...prev, [imageKey]: true }));
  };

  const handleImageLoadEnd = (imageKey: string) => {
    // Add a small delay to prevent flickering for very fast loads
    setTimeout(() => {
      setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
    }, 100);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Preview Screen */}
        {showPreview && selectedImage && (
          <Animated.View 
            style={[
              styles.previewContainer,
              { opacity: previewFadeAnim }
            ]}
          >
            <BlurView intensity={100} tint="light" style={styles.previewHeaderBlur}>
              <View style={styles.previewHeader}>
                <TouchableOpacity onPress={handleBackFromPreview} style={styles.backButton}>
                  <Ionicons name="arrow-back" size={24} color="#000000" />
                </TouchableOpacity>
                <Text style={styles.previewTitle}>Preview</Text>
                <TouchableOpacity onPress={handleSaveImage} style={styles.saveButton}>
                  <View style={[styles.saveButtonContainer, { backgroundColor: colors.primary }]}>
                    <Check size={20} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              </View>
            </BlurView>
            
            <View style={styles.previewImageContainer}>
              {/* Loading indicator for preview image */}
              {previewImageLoading && (
                <View style={styles.previewLoadingContainer}>
                  <Ionicons name="image-outline" size={60} color="#CCCCCC" />
                  <Text style={styles.previewLoadingText}>Loading image...</Text>
                </View>
              )}
              
              <Image 
                source={selectedImage.isPreset ? selectedImage.source : { uri: selectedImage.uri }}
                style={[styles.previewImage, previewImageLoading && styles.hiddenPreviewImage]}
                resizeMode="contain"
                onLoadStart={() => setPreviewImageLoading(true)}
                onLoadEnd={() => setPreviewImageLoading(false)}
                onError={() => setPreviewImageLoading(false)}
                fadeDuration={0}
              />
            </View>
          </Animated.View>
        )}

        {/* Main Selection Screen */}
        {!showPreview && (
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
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={handlePickFromGallery} style={styles.galleryButton}>
                <View style={[styles.plusIconContainer, { backgroundColor: colors.primary }]}>
                  <Plus size={20} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>
          </BlurView>

        {/* Sub Category Selector - Hide for loginPage */}
        {mainCategory !== 'loginPage' && (
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
                    selectedSubCategory === subCategory.key && { 
                      backgroundColor: colors.primary, 
                      borderColor: colors.primary 
                    },
                  ]}
                  onPress={() => setSelectedSubCategory(subCategory.key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.categoryContent}>
                    <Ionicons 
                      name={subCategory.icon as any} 
                      size={20} 
                      color={selectedSubCategory === subCategory.key ? '#FFFFFF' : colors.primary}
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
        )}

        {/* Images Grid with Apple-style Cards */}
        <ScrollView 
          style={[styles.imagesContainer, mainCategory === 'loginPage' && styles.imagesContainerLoginPage]} 
          contentContainerStyle={styles.imagesGrid}
          showsVerticalScrollIndicator={false}
        >
          {(() => {
            // Handle loginPage differently - it's a direct array, not nested by subcategory
            let currentImages;
            if (mainCategory === 'loginPage') {
              currentImages = PRESET_IMAGES[mainCategory];
            } else {
              currentImages = PRESET_IMAGES[mainCategory]?.[selectedSubCategory as 'barber' | 'nails'];
            }
            
            if (!currentImages || currentImages.length === 0) {
              return (
                <View style={styles.noImagesContainer}>
                  <Text style={styles.noImagesText}>
                    {mainCategory === 'loginPage' 
                      ? 'No login page images available'
                      : `No images available for ${selectedSubCategory} in ${mainCategory}`
                    }
                  </Text>
                </View>
              );
            }
            
            return currentImages.map((imageSource, index) => {
              const imageKey = mainCategory === 'loginPage' 
                ? `${mainCategory}-${index}` 
                : `${mainCategory}-${selectedSubCategory}-${index}`;
              const isLoading = loadingImages[imageKey];
              
              return (
                <TouchableOpacity
                  key={index}
                  style={styles.imageCard}
                  onPress={() => handleImagePress(imageSource, true)}
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
                      fadeDuration={0}
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

          </Animated.View>
        )}
      </View>
    </Modal>
  );
};

const { width, height } = Dimensions.get('window');
const imageSize = (width - 80) / 2; // 2 images per row with better spacing
const imageCardHeight = imageSize * 1.2; // Optimized height for better performance

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 40 : 30,
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
  plusIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categorySection: {
    marginTop: Platform.OS === 'ios' ? 120 : 100,
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
    height: imageCardHeight,
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
    height: '100%', // Fill the entire container
    backgroundColor: '#F5F5F5', // Light background while loading
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
  imagesContainerLoginPage: {
    marginTop: Platform.OS === 'ios' ? 120 : 100, // Add more top margin when no categories are shown
  },
  // Preview Screen Styles
  previewContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  previewHeaderBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 40 : 30,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  saveButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  saveButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 120 : 100,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    maxWidth: width - 40,
    maxHeight: height - 200,
  },
  hiddenPreviewImage: {
    opacity: 0,
  },
  previewLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  previewLoadingText: {
    fontSize: 16,
    color: '#999999',
    marginTop: 16,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
});

export default ImageSelectionModal;
