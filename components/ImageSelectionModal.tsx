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
import { useTranslation } from 'react-i18next';
import { useColors } from '../src/theme/ThemeProvider';
import * as ImagePicker from 'expo-image-picker';
import GradientBackground from './GradientBackground';

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
  assetDataJson?: string;
}

// Preset images organized by category - using local images from default folder
const PRESET_IMAGES = {
  existingBooking: {
    barber: [
      require('../assets/images/default/ExistingBooking/barber/46-min.png'),
      require('../assets/images/default/ExistingBooking/barber/47-min.png'),
      require('../assets/images/default/ExistingBooking/barber/48-min.png'),
      require('../assets/images/default/ExistingBooking/barber/49-min.png'),
      require('../assets/images/default/ExistingBooking/barber/50-min.png'),
      require('../assets/images/default/ExistingBooking/barber/51-min.png'),
      require('../assets/images/default/ExistingBooking/barber/52-min.png'),
      require('../assets/images/default/ExistingBooking/barber/53-min.png'),
      require('../assets/images/default/ExistingBooking/barber/54-min.png'),
      require('../assets/images/default/ExistingBooking/barber/55-min.png'),
      require('../assets/images/default/ExistingBooking/barber/56-min.png'),
      require('../assets/images/default/ExistingBooking/barber/57-min.png'),
      require('../assets/images/default/ExistingBooking/barber/58-min.png'),
      require('../assets/images/default/ExistingBooking/barber/59-min.png'),
      require('../assets/images/default/ExistingBooking/barber/60-min.png'),
      require('../assets/images/default/ExistingBooking/barber/61-min.png'),
    ],
    nails: [
      require('../assets/images/default/ExistingBooking/nails/132-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/133-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/134-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/135-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/136-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/137-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/138-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/139-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/140-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/143-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/144-min.jpg'),
      require('../assets/images/default/ExistingBooking/nails/145-min.jpg'),
    ],
  },
  bookingPage: {
    barber: [
      require('../assets/images/default/BookingPage/barber/30-min.png'),
      require('../assets/images/default/BookingPage/barber/31-min.png'),
      require('../assets/images/default/BookingPage/barber/32-min.png'),
      require('../assets/images/default/BookingPage/barber/33-min.png'),
      require('../assets/images/default/BookingPage/barber/34-min.png'),
      require('../assets/images/default/BookingPage/barber/35-min.png'),
      require('../assets/images/default/BookingPage/barber/36-min.png'),
      require('../assets/images/default/BookingPage/barber/37-min.png'),
      require('../assets/images/default/BookingPage/barber/38-min.png'),
      require('../assets/images/default/BookingPage/barber/39-min.png'),
      require('../assets/images/default/BookingPage/barber/40-min.png'),
      require('../assets/images/default/BookingPage/barber/41-min.png'),
      require('../assets/images/default/BookingPage/barber/42-min.png'),
      require('../assets/images/default/BookingPage/barber/43-min.png'),
      require('../assets/images/default/BookingPage/barber/44-min.png'),
      require('../assets/images/default/BookingPage/barber/45-min.png'),
    ],
    nails: [
      require('../assets/images/default/BookingPage/nails/120-min.jpg'),
      require('../assets/images/default/BookingPage/nails/121-min.jpg'),
      require('../assets/images/default/BookingPage/nails/122-min.jpg'),
      require('../assets/images/default/BookingPage/nails/123-min.jpg'),
      require('../assets/images/default/BookingPage/nails/124-min.jpg'),
      require('../assets/images/default/BookingPage/nails/125-min.jpg'),
      require('../assets/images/default/BookingPage/nails/126-min.jpg'),
      require('../assets/images/default/BookingPage/nails/127-min.jpg'),
      require('../assets/images/default/BookingPage/nails/128-min.jpg'),
      require('../assets/images/default/BookingPage/nails/129-min.jpg'),
      require('../assets/images/default/BookingPage/nails/130-min.jpg'),
      require('../assets/images/default/BookingPage/nails/131-min.jpg'),
    ],
  },
  homePage: {
    barber: [
      require('../assets/images/default/HomePage/barber/101-min.png'),
      require('../assets/images/default/HomePage/barber/102-min.png'),
      require('../assets/images/default/HomePage/barber/103-min.png'),
      require('../assets/images/default/HomePage/barber/104-min.png'),
      require('../assets/images/default/HomePage/barber/105-min.png'),
      require('../assets/images/default/HomePage/barber/106-min.png'),
      require('../assets/images/default/HomePage/barber/107-min.png'),
      require('../assets/images/default/HomePage/barber/108-min.png'),
      require('../assets/images/default/HomePage/barber/109-min.png'),
      require('../assets/images/default/HomePage/barber/111-min.png'),
      require('../assets/images/default/HomePage/barber/112-min.png'),
      require('../assets/images/default/HomePage/barber/113-min.jpg'),
    ],
    nails: [
      require('../assets/images/default/HomePage/nails/150-min.jpg'),
      require('../assets/images/default/HomePage/nails/151-min.jpg'),
      require('../assets/images/default/HomePage/nails/152-min.jpg'),
      require('../assets/images/default/HomePage/nails/153-min.jpg'),
      require('../assets/images/default/HomePage/nails/154-min.jpg'),
      require('../assets/images/default/HomePage/nails/155-min.jpg'),
      require('../assets/images/default/HomePage/nails/156-min.jpg'),
      require('../assets/images/default/HomePage/nails/157-min.jpg'),
      require('../assets/images/default/HomePage/nails/158-min.jpg'),
      require('../assets/images/default/HomePage/nails/159-min.jpg'),
      require('../assets/images/default/HomePage/nails/160-min.jpg'),
      require('../assets/images/default/HomePage/nails/161-min.jpg'),
    ],
  },
  loginPage: [
    'gradient-background', // Special gradient background
    'solid-blue-background', // Solid blue with subtle gradient
    'solid-purple-background', // Solid purple with subtle gradient
    'solid-green-background', // Solid green with subtle gradient
    'solid-orange-background', // Solid orange with subtle gradient
    'light-silver-background', // Light silver with subtle gradient
    'light-white-background', // Light white with subtle gradient
    'light-gray-background', // Light gray with subtle gradient
    'light-pink-background', // Light pink with subtle gradient
    'light-cyan-background', // Light cyan with subtle gradient
    'light-lavender-background', // Light lavender with subtle gradient
    'light-coral-background', // Light coral with subtle gradient
    'dark-black-background', // Dark black with subtle gradient
    'dark-charcoal-background', // Dark charcoal with subtle gradient
    require('../assets/images/default/LoginPage/11.png'),
    require('../assets/images/default/LoginPage/12.png'),
    require('../assets/images/default/LoginPage/13.png'),
    require('../assets/images/default/LoginPage/14.png'),
    require('../assets/images/default/LoginPage/15.png'),
    require('../assets/images/default/LoginPage/16.png'),
    require('../assets/images/default/LoginPage/17.png'),
    require('../assets/images/default/LoginPage/18.png'),
    require('../assets/images/default/LoginPage/19.png'),
    require('../assets/images/default/LoginPage/20.png'),
    require('../assets/images/default/LoginPage/46921-min.jpg'),
    require('../assets/images/default/LoginPage/52822-min.jpg'),
    require('../assets/images/default/LoginPage/66981-min.jpg'),
    require('../assets/images/default/LoginPage/97390-min.jpg'),
    require('../assets/images/default/LoginPage/102501-min.jpg'),
    require('../assets/images/default/LoginPage/121784-min.jpg'),
    require('../assets/images/default/LoginPage/141733-min.jpg'),
    require('../assets/images/default/LoginPage/157745-min.jpg'),
    require('../assets/images/default/LoginPage/16237-min.jpg'),
    require('../assets/images/default/LoginPage/328398-min.jpg'),
    require('../assets/images/default/LoginPage/528-min.jpg'),
    require('../assets/images/default/LoginPage/8128-min.jpg'),
    require('../assets/images/default/LoginPage/11788897-min.jpg'),
    require('../assets/images/default/LoginPage/23337-min.jpg'),
    require('../assets/images/default/LoginPage/23999-min.jpg'),
    require('../assets/images/default/LoginPage/30869040-min.jpg'),
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
  const { t } = useTranslation();

  // Simplified preload - only for current category
  const preloadCurrentImages = React.useCallback(() => {
    let currentImages;
    if (mainCategory === 'loginPage') {
      currentImages = PRESET_IMAGES[mainCategory];
    } else {
      currentImages = PRESET_IMAGES[mainCategory]?.[selectedSubCategory as 'barber' | 'nails'];
    }
    
    if (currentImages) {
      // Clear previous loading states
      setLoadingImages({});
      
      currentImages.forEach((imageSource, index) => {
        const imageKey = mainCategory === 'loginPage' 
          ? `${mainCategory}-${index}` 
          : `${mainCategory}-${selectedSubCategory}-${index}`;
        
        // Skip preloading for special backgrounds
        if (imageSource === 'gradient-background' || 
            imageSource === 'solid-blue-background' ||
            imageSource === 'solid-purple-background' ||
            imageSource === 'solid-green-background' ||
            imageSource === 'solid-orange-background' ||
            imageSource === 'light-silver-background' ||
            imageSource === 'light-white-background' ||
            imageSource === 'light-gray-background' ||
            imageSource === 'light-pink-background' ||
            imageSource === 'light-cyan-background' ||
            imageSource === 'light-lavender-background' ||
            imageSource === 'light-coral-background' ||
            imageSource === 'dark-black-background' ||
            imageSource === 'dark-charcoal-background') {
          setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
          return;
        }
        
        // Set loading state immediately
        setLoadingImages(prev => ({ ...prev, [imageKey]: true }));
        
        // Preload the image with better caching and timeout
        const imageUri = Image.resolveAssetSource(imageSource).uri;
        
        // Set a timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
          setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
        }, 5000); // 5 second timeout
        
        Image.prefetch(imageUri).then(() => {
          clearTimeout(timeoutId);
          setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
        }).catch(() => {
          clearTimeout(timeoutId);
          setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
        });
      });
    }
  }, [mainCategory, selectedSubCategory]);

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
      
      // Preload current images for better performance
      preloadCurrentImages();
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
    if (visible) {
      preloadCurrentImages();
    }
  }, [selectedSubCategory, preloadCurrentImages, visible, mainCategory]);

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionRequired', 'Permission Required'), t('admin.gallery.permissionGallery', 'Please allow gallery access to select an image'));
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
          uri: asset.uri,
          isPreset: false,
          assetDataJson: assetData,
        });
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('error.generic', 'Error'), t('admin.gallery.pickerAccessFailed', 'Unable to select image'));
    }
  };

  const handleImagePress = (imageSource: any, isPreset: boolean) => {
    // Handle special backgrounds
    if (imageSource === 'gradient-background' || 
        imageSource === 'solid-blue-background' ||
        imageSource === 'solid-purple-background' ||
        imageSource === 'solid-green-background' ||
        imageSource === 'solid-orange-background' ||
        imageSource === 'light-silver-background' ||
        imageSource === 'light-white-background' ||
        imageSource === 'light-gray-background' ||
        imageSource === 'light-pink-background' ||
        imageSource === 'light-cyan-background' ||
        imageSource === 'light-lavender-background' ||
        imageSource === 'light-coral-background' ||
        imageSource === 'dark-black-background' ||
        imageSource === 'dark-charcoal-background') {
      setPreviewImageLoading(false);
      setSelectedImage({
        uri: imageSource,
        isPreset: true,
        source: imageSource,
      });
      setShowPreview(true);
      return;
    }
    
    const imageUri = Image.resolveAssetSource(imageSource).uri;
    
    // Start loading the preview image immediately
    setPreviewImageLoading(true);
    
    // For preset images, they should already be preloaded
    if (isPreset) {
      // Since we preload images, this should be fast
      setTimeout(() => {
        setPreviewImageLoading(false);
      }, 50); // Reduced delay for better performance
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
      onImageSelected(selectedImage.assetDataJson ?? selectedImage.uri, selectedImage.isPreset);
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
    // Immediate update for better performance
    setLoadingImages(prev => ({ ...prev, [imageKey]: false }));
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
                <Text style={styles.previewTitle}>{t('gallery.preview', 'Preview')}</Text>
                <TouchableOpacity onPress={handleSaveImage} style={styles.saveButton}>
                  <View style={[styles.saveButtonContainer, { backgroundColor: colors.primary }]}>
                    <Check size={20} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              </View>
            </BlurView>
            
            <View style={styles.previewImageContainer}>
              {/* Special backgrounds preview */}
              {selectedImage.uri === 'gradient-background' || 
               selectedImage.uri === 'solid-blue-background' ||
               selectedImage.uri === 'solid-purple-background' ||
               selectedImage.uri === 'solid-green-background' ||
               selectedImage.uri === 'solid-orange-background' ||
               selectedImage.uri === 'light-silver-background' ||
               selectedImage.uri === 'light-white-background' ||
               selectedImage.uri === 'light-gray-background' ||
               selectedImage.uri === 'light-pink-background' ||
               selectedImage.uri === 'light-cyan-background' ||
               selectedImage.uri === 'light-lavender-background' ||
               selectedImage.uri === 'light-coral-background' ||
               selectedImage.uri === 'dark-black-background' ||
               selectedImage.uri === 'dark-charcoal-background' ? (
                <GradientBackground 
                  style={[
                    mainCategory === 'loginPage' ? styles.loginPagePreviewImage : styles.previewImage,
                    styles.gradientBackground
                  ]}
                  backgroundType={selectedImage.uri}
                />
              ) : (
                <>
                  {/* Loading indicator for preview image */}
                  {previewImageLoading && (
                    <View style={styles.previewLoadingContainer}>
                      <Ionicons name="image-outline" size={60} color="#CCCCCC" />
                      <Text style={styles.previewLoadingText}>{t('gallery.loadingImage', 'Loading image...')}</Text>
                    </View>
                  )}
                  
                  <Image 
                    source={selectedImage.isPreset ? selectedImage.source : { uri: selectedImage.uri }}
                    style={[
                      mainCategory === 'loginPage' ? styles.loginPagePreviewImage : styles.previewImage, 
                      previewImageLoading && styles.hiddenPreviewImage
                    ]}
                    resizeMode={mainCategory === 'loginPage' ? "cover" : "contain"}
                    onLoadStart={() => setPreviewImageLoading(true)}
                    onLoadEnd={() => setPreviewImageLoading(false)}
                    onError={() => setPreviewImageLoading(false)}
                    fadeDuration={0}
                    cache="force-cache"
                    loadingIndicatorSource={require('../assets/images/icon.png')}
                  />
                </>
              )}
              
              {mainCategory === 'loginPage' && (
                <View style={styles.loginPageFormatNote}>
                  <Text style={styles.loginPageFormatText}>
                    📱 Login page images are displayed in (9:16 ratio)
                  </Text>
                </View>
              )}
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
          contentContainerStyle={
            mainCategory === 'bookingPage' || mainCategory === 'existingBooking' 
              ? styles.imagesGridBookingPage 
              : styles.imagesGrid
          }
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
              const isSpecialBackground = imageSource === 'gradient-background' || 
                                          imageSource === 'solid-blue-background' ||
                                          imageSource === 'solid-purple-background' ||
                                          imageSource === 'solid-green-background' ||
                                          imageSource === 'solid-orange-background' ||
                                          imageSource === 'light-silver-background' ||
                                          imageSource === 'light-white-background' ||
                                          imageSource === 'light-gray-background' ||
                                          imageSource === 'light-pink-background' ||
                                          imageSource === 'light-cyan-background' ||
                                          imageSource === 'light-lavender-background' ||
                                          imageSource === 'light-coral-background' ||
                                          imageSource === 'dark-black-background' ||
                                          imageSource === 'dark-charcoal-background';
              
              return (
                <TouchableOpacity
                  key={index}
                  style={
                    mainCategory === 'loginPage' 
                      ? styles.loginPageImageCard 
                      : mainCategory === 'bookingPage' || mainCategory === 'existingBooking'
                        ? styles.bookingPageImageCard 
                        : styles.imageCard
                  }
                  onPress={() => handleImagePress(imageSource, true)}
                  activeOpacity={0.9}
                >
                  <View style={styles.imageContainer}>
                    {/* Special backgrounds */}
                    {isSpecialBackground ? (
                      <GradientBackground 
                        style={styles.gradientBackground}
                        backgroundType={imageSource}
                      />
                    ) : (
                      <>
                        {/* Loading Placeholder */}
                        {isLoading && (
                          <View style={styles.imagePlaceholder}>
                            <Ionicons name="image-outline" size={40} color="#CCCCCC" />
                            <Text style={styles.loadingText}>{t('refreshing', 'Refreshing...')}</Text>
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
                          cache="force-cache"
                          loadingIndicatorSource={require('../assets/images/icon.png')}
                        />
                      </>
                    )}
                    
                    <View style={[styles.imageOverlay, { opacity: 0 }]}>
                      <View style={styles.selectButton}>
                        <Text style={styles.selectButtonText}>{t('common.select', 'Select')}</Text>
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
  imagesGridBookingPage: {
    flexDirection: 'column',
    paddingBottom: 100,
  },
  imageCard: {
    width: imageSize,
    height: imageCardHeight,
    marginBottom: 20,
  },
  loginPageImageCard: {
    width: imageSize,
    height: imageSize * (16/9), // Instagram Story ratio (9:16, but we want 16:9 for landscape)
    marginBottom: 20,
  },
  bookingPageImageCard: {
    width: '100%',
    height: 200, // Fixed height for rectangular format
    marginBottom: 16,
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 120 : 100,
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    maxWidth: width - 40,
    maxHeight: height - 200,
  },
  loginPagePreviewImage: {
    width: '100%',
    height: '100%',
    minHeight: 400,
    aspectRatio: 9/16, // Instagram Story ratio (vertical rectangle)
    maxHeight: '85%',
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
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
  loginPageFormatNote: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  loginPageFormatText: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  gradientBackground: {
    borderRadius: 16,
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 200, // Ensure minimum height for visibility
  },
});

export default ImageSelectionModal;
