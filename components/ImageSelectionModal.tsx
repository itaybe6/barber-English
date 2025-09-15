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
import { X, Plus } from 'lucide-react-native';
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
  const [showPreview, setShowPreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
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
        Image.prefetch(Image.resolveAssetSource(imageSource).uri);
        setLoadingImages(prev => ({ ...prev, [imageKey]: true }));
      });
    }
  }, [mainCategory, selectedSubCategory]);

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
      preloadImages();
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
        onImageSelected(assetData, false);
        onClose();
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Unable to select image');
    }
  };

  const handlePresetImagePreview = (imageSource: any) => {
    setPreviewImage(imageSource);
    setShowPreview(true);
  };

  const handleConfirmSelection = () => {
    if (previewImage) {
      const imageUri = Image.resolveAssetSource(previewImage).uri;
      onImageSelected(imageUri, true);
      onClose();
    }
  };

  const handleCancelPreview = () => {
    setShowPreview(false);
    setPreviewImage(null);
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
              <X size={24} color="#000000" />
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
                  onPress={() => handlePresetImagePreview(imageSource)}
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
                      cache="force-cache"
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
      </View>

       {/* Image Preview Modal */}
       <Modal
         visible={showPreview}
         transparent={true}
         animationType="fade"
         onRequestClose={handleCancelPreview}
       >
         <View style={styles.previewOverlay}>
           {/* Full Screen Image */}
           <View style={styles.fullScreenImageContainer}>
             {previewImage && (
               <Image 
                 source={previewImage} 
                 style={styles.fullScreenImage}
                 resizeMode="cover"
               />
             )}
           </View>

           {/* Header Overlay */}
           <View style={styles.previewHeaderOverlay}>
             <TouchableOpacity onPress={handleCancelPreview} style={styles.previewCloseButton}>
               <X size={24} color="#FFFFFF" />
             </TouchableOpacity>
             <Text style={styles.previewTitleOverlay}>Preview</Text>
             <View style={styles.previewHeaderSpacer} />
           </View>

           {/* Save Button Overlay */}
           <View style={styles.saveButtonOverlay}>
             <TouchableOpacity 
               style={[styles.saveButton, { backgroundColor: colors.primary }]} 
               onPress={handleConfirmSelection}
             >
               <Text style={styles.saveButtonText}>Save</Text>
             </TouchableOpacity>
           </View>
         </View>
       </Modal>
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
   // Preview Modal Styles
   previewOverlay: {
     flex: 1,
     backgroundColor: '#000000',
   },
   fullScreenImageContainer: {
     flex: 1,
     width: '100%',
     height: '100%',
   },
   fullScreenImage: {
     width: '100%',
     height: '100%',
   },
   previewHeaderOverlay: {
     position: 'absolute',
     top: 0,
     left: 0,
     right: 0,
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'space-between',
     paddingHorizontal: 20,
     paddingVertical: 16,
     paddingTop: Platform.OS === 'ios' ? 50 : 30,
     backgroundColor: 'rgba(0, 0, 0, 0.3)',
   },
   previewCloseButton: {
     padding: 8,
   },
   previewTitleOverlay: {
     fontSize: 18,
     fontWeight: '600',
     color: '#FFFFFF',
   },
   previewHeaderSpacer: {
     width: 40, // Same width as close button for centering
   },
   saveButtonOverlay: {
     position: 'absolute',
     bottom: 0,
     left: 0,
     right: 0,
     paddingHorizontal: 20,
     paddingVertical: 30,
     paddingBottom: Platform.OS === 'ios' ? 40 : 30,
     backgroundColor: 'rgba(0, 0, 0, 0.3)',
   },
   saveButton: {
     paddingVertical: 16,
     borderRadius: 12,
     alignItems: 'center',
     justifyContent: 'center',
   },
   saveButtonText: {
     fontSize: 18,
     fontWeight: '600',
     color: '#FFFFFF',
   },
});

export default ImageSelectionModal;
