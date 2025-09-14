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
}

// Preset images organized by category - using local images
const PRESET_IMAGES = {
  barber: [
    require('../assets/images/1homePage.jpg'),
    require('../assets/images/bookApp.jpg'),
    require('../assets/images/nextApp.jpg'),
    require('../assets/images/user.png'),
  ],
  cosmetics: [
    require('../assets/images/1homePage.jpg'),
    require('../assets/images/bookApp.jpg'),
    require('../assets/images/nextApp.jpg'),
    require('../assets/images/user.png'),
  ],
  nail: [
    require('../assets/images/1homePage.jpg'),
    require('../assets/images/bookApp.jpg'),
    require('../assets/images/nextApp.jpg'),
    require('../assets/images/user.png'),
  ],
};

const CATEGORIES = [
  { key: 'barber', name: 'Barbers', icon: 'cut-outline' },
  { key: 'cosmetics', name: 'Cosmetics', icon: 'color-palette-outline' },
  { key: 'nail', name: 'Nail Art', icon: 'hand-left-outline' },
];

const ImageSelectionModal: React.FC<ImageSelectionModalProps> = ({
  visible,
  onClose,
  onImageSelected,
  title,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('barber');
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
    }
  }, [visible]);

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

        {/* Category Selector with Apple-style Segmented Control */}
        <View style={styles.categorySection}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.categoryContainer}
            contentContainerStyle={styles.categoryScrollContent}
          >
            {CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category.key}
                style={[
                  styles.categoryButton,
                  selectedCategory === category.key && styles.selectedCategoryButton,
                ]}
                onPress={() => setSelectedCategory(category.key)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryContent}>
                  <Ionicons 
                    name={category.icon as any} 
                    size={20} 
                    color={selectedCategory === category.key ? '#FFFFFF' : Colors.primary}
                    style={styles.categoryIcon}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      selectedCategory === category.key && styles.selectedCategoryText,
                    ]}
                  >
                    {category.name}
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
          {PRESET_IMAGES[selectedCategory as keyof typeof PRESET_IMAGES]?.map((imageSource, index) => (
            <TouchableOpacity
              key={index}
              style={styles.imageCard}
              onPress={() => handlePresetImageSelect(imageSource)}
              activeOpacity={0.9}
            >
              <View style={styles.imageContainer}>
                <Image source={imageSource} style={styles.presetImage} resizeMode="cover" />
                <View style={[styles.imageOverlay, { opacity: 0 }]}>
                  <View style={styles.selectButton}>
                    <Text style={styles.selectButtonText}>Select</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
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
});

export default ImageSelectionModal;
