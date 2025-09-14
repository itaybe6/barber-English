import React, { useState } from 'react';
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
} from 'react-native';
import Colors from '../constants/colors';
import * as ImagePicker from 'expo-image-picker';

interface ImageSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onImageSelected: (imageUri: string, isPreset: boolean) => void;
  title: string;
}

// Preset images organized by category - using external URLs for now
const PRESET_IMAGES = {
  barber: [
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?w=800&h=600&fit=crop',
  ],
  cosmetics: [
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1608245445807-1a0b7d3f6e8b?w=800&h=600&fit=crop',
  ],
  nail: [
    'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1609205607569-7e8c3c4c5b5c?w=800&h=600&fit=crop',
  ],
};

const CATEGORIES = [
  { key: 'barber', name: 'ספרים', icon: '✂️' },
  { key: 'cosmetics', name: 'קוסמטיקאיות', icon: '💄' },
  { key: 'nail', name: 'בונות ציפורניים', icon: '💅' },
];

const ImageSelectionModal: React.FC<ImageSelectionModalProps> = ({
  visible,
  onClose,
  onImageSelected,
  title,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('barber');

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('הרשאה נדרשת', 'אנא אפשר גישה לגלריה כדי לבחור תמונה');
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
      Alert.alert('שגיאה', 'לא ניתן לבחור תמונה');
    }
  };

  const handlePresetImageSelect = (imageUri: string) => {
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
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>סגור</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={handlePickFromGallery} style={styles.galleryButton}>
            <Text style={styles.galleryButtonText}>גלריה</Text>
          </TouchableOpacity>
        </View>

        {/* Category Selector */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoryContainer}
          contentContainerStyle={styles.categoryContent}
        >
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.key}
              style={[
                styles.categoryButton,
                selectedCategory === category.key && styles.selectedCategoryButton,
              ]}
              onPress={() => setSelectedCategory(category.key)}
            >
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category.key && styles.selectedCategoryText,
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Images Grid */}
        <ScrollView style={styles.imagesContainer} contentContainerStyle={styles.imagesGrid}>
          {PRESET_IMAGES[selectedCategory as keyof typeof PRESET_IMAGES]?.map((imageUri, index) => (
            <TouchableOpacity
              key={index}
              style={styles.imageContainer}
              onPress={() => handlePresetImageSelect(imageUri)}
            >
              <Image source={{ uri: imageUri }} style={styles.presetImage} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Bottom Info */}
        <View style={styles.bottomInfo}>
          <Text style={styles.infoText}>
            בחר תמונה מוכנה מהקטגוריות למעלה או לחץ על "גלריה" להעלאת תמונה משלך
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');
const imageSize = (width - 60) / 3; // 3 images per row with padding

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  closeButton: {
    padding: 10,
  },
  closeButtonText: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  galleryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  galleryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryContainer: {
    maxHeight: 80,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  categoryContent: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  categoryButton: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 15,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    minWidth: 80,
  },
  selectedCategoryButton: {
    backgroundColor: Colors.primary,
  },
  categoryIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  categoryText: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
  },
  selectedCategoryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  imagesContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingTop: 20,
  },
  imageContainer: {
    width: imageSize,
    height: imageSize,
    marginBottom: 15,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  presetImage: {
    width: '100%',
    height: '100%',
  },
  bottomInfo: {
    padding: 20,
    backgroundColor: '#F9F9F9',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  infoText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ImageSelectionModal;
