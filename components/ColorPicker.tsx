import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useColorUpdate } from '@/lib/contexts/ColorUpdateContext';
import { useTranslation } from 'react-i18next';

interface ColorPickerProps {
  onColorSelect?: (color: string) => void;
  currentColor?: string;
}

// Enhanced color palette with more professional and subtle colors
const COLOR_PALETTE = [
  // Classic & Professional
  '#000000', // Black
  '#333333', // Dark Gray
  '#666666', // Medium Gray
  '#999999', // Light Gray
  
  // Blues
  '#1E3A8A', // Deep Blue
  '#3B82F6', // Blue
  '#60A5FA', // Light Blue
  '#93C5FD', // Very Light Blue
  '#1E40AF', // Royal Blue
  '#2563EB', // Bright Blue
  
  // Greens
  '#065F46', // Dark Green
  '#10B981', // Green
  '#34D399', // Light Green
  '#6EE7B7', // Very Light Green
  '#059669', // Emerald
  '#22C55E', // Bright Green
  
  // Purples
  '#581C87', // Dark Purple
  '#8B5CF6', // Purple
  '#A78BFA', // Light Purple
  '#C4B5FD', // Very Light Purple
  '#7C3AED', // Violet
  '#A855F7', // Bright Purple
  
  // Reds & Pinks
  '#991B1B', // Dark Red
  '#EF4444', // Red
  '#F87171', // Light Red
  '#FCA5A5', // Very Light Red
  '#DC2626', // Bright Red
  '#EC4899', // Pink
  
  // Oranges & Yellows
  '#9A3412', // Dark Orange
  '#F97316', // Orange
  '#FB923C', // Light Orange
  '#FDBA74', // Very Light Orange
  '#EA580C', // Bright Orange
  '#EAB308', // Yellow
  
  // Teals & Cyans
  '#134E4A', // Dark Teal
  '#14B8A6', // Teal
  '#5EEAD4', // Light Teal
  '#99F6E4', // Very Light Teal
  '#0D9488', // Bright Teal
  '#06B6D4', // Cyan
  
  // Browns & Neutrals
  '#451A03', // Dark Brown
  '#A16207', // Brown
  '#D97706', // Light Brown
  '#F59E0B', // Amber
  '#78716C', // Stone
  '#6B7280', // Gray
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  onColorSelect,
  currentColor = '#000000',
}) => {
  const { t } = useTranslation();
  const [selectedColor, setSelectedColor] = useState(currentColor);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('#000000');
  const { updatePrimaryColor, colors, refreshColors } = useBusinessColors();
  const { triggerColorUpdate, forceAppRefresh } = useColorUpdate();

  // Color categories for better organization
  const colorCategories = {
    all: { name: 'All Colors', colors: COLOR_PALETTE },
    professional: { 
      name: 'Professional', 
      colors: ['#000000', '#333333', '#666666', '#999999', '#1E3A8A', '#3B82F6', '#065F46', '#10B981', '#581C87', '#8B5CF6'] 
    },
    blues: { 
      name: 'Blues', 
      colors: ['#1E3A8A', '#3B82F6', '#60A5FA', '#93C5FD', '#1E40AF', '#2563EB'] 
    },
    greens: { 
      name: 'Greens', 
      colors: ['#065F46', '#10B981', '#34D399', '#6EE7B7', '#059669', '#22C55E'] 
    },
    purples: { 
      name: 'Purples', 
      colors: ['#581C87', '#8B5CF6', '#A78BFA', '#C4B5FD', '#7C3AED', '#A855F7'] 
    },
    warm: { 
      name: 'Warm Colors', 
      colors: ['#991B1B', '#EF4444', '#F87171', '#9A3412', '#F97316', '#FB923C', '#EA580C', '#EAB308'] 
    },
    cool: { 
      name: 'Cool Colors', 
      colors: ['#134E4A', '#14B8A6', '#5EEAD4', '#99F6E4', '#0D9488', '#06B6D4'] 
    },
  };

  const currentColors = colorCategories[selectedCategory as keyof typeof colorCategories]?.colors || COLOR_PALETTE;

  // Update selected color when currentColor prop changes
  React.useEffect(() => {
    setSelectedColor(currentColor);
  }, [currentColor]);

  // Also update when business colors change
  React.useEffect(() => {
    if (colors.primary) {
      setSelectedColor(colors.primary);
    }
  }, [colors.primary]);


  const handleColorSelect = async (color: string) => {
    setSelectedColor(color);
    setIsModalVisible(false);
    setShowCustomPicker(false);
    
    try {
      // Update colors immediately for instant feedback
      const success = await updatePrimaryColor(color);
      if (success) {
        onColorSelect?.(color);
        
        // Force app refresh immediately after successful color update
        setTimeout(() => {
          forceAppRefresh();
          refreshColors(); // Also refresh the colors hook
        }, 100);
        
        // Show success message
        Alert.alert(
          t('success.generic','Success'), 
          t('color.updateSuccess','The new color has been saved and the app is updating automatically.'),
          [
            {
              text: t('ok','OK'),
              onPress: () => {
                // Additional refresh to ensure everything is updated
                forceAppRefresh();
              }
            }
          ]
        );
      } else {
        Alert.alert(t('error.generic','Error'), t('color.updateFailed','Unable to update the color'));
      }
    } catch (error) {
      console.error('Error updating color:', error);
      Alert.alert(t('error.generic','Error'), t('color.updateFailed','Unable to update the color'));
    }
  };

  const handleCustomColorSubmit = () => {
    // Validate hex color format
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexPattern.test(customColorHex)) {
      Alert.alert(t('color.invalidTitle', 'Invalid Color'), t('color.invalidMessage', 'Please enter a valid hex color (e.g., #FF5733)'));
      return;
    }
    handleColorSelect(customColorHex);
  };


  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('color.primary', 'Primary Color')}</Text>
      <View style={styles.currentColorContainer}>
        <View style={[styles.currentColorPreview, { backgroundColor: selectedColor }]} />
        <Text style={styles.currentColorText}>{t('color.current', 'Current')}: {selectedColor}</Text>
      </View>
      <TouchableOpacity
        style={[styles.colorButton, { backgroundColor: selectedColor }]}
        onPress={() => setIsModalVisible(true)}
      >
        <Text style={styles.colorButtonText}>{t('color.chooseApp', 'Choose App Color')}</Text>
      </TouchableOpacity>
      
      
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('color.chooseYourApp', 'Choose Your App Color')}</Text>
            
            {/* Category Selection */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryContainer}
            >
              {Object.entries(colorCategories).map(([key, category]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.categoryButton,
                    selectedCategory === key && styles.selectedCategoryButton
                  ]}
                  onPress={() => setSelectedCategory(key)}
                >
                  <Text style={[
                    styles.categoryButtonText,
                    selectedCategory === key && styles.selectedCategoryButtonText
                  ]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {!showCustomPicker ? (
              <ScrollView style={styles.colorGrid}>
                <View style={styles.colorRow}>
                  {currentColors.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        selectedColor === color && styles.selectedColor,
                      ]}
                      onPress={() => handleColorSelect(color)}
                    >
                      {selectedColor === color && (
                        <View style={styles.checkmark}>
                          <Text style={styles.checkmarkText}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                
                {/* Custom Color Button */}
                <TouchableOpacity
                  style={styles.customColorButton}
                  onPress={() => setShowCustomPicker(true)}
                >
                  <Text style={styles.customColorButtonText}>{t('color.customButton', '+ Custom Color')}</Text>
                </TouchableOpacity>
                
                {/* Reset to Default Button */}
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => handleColorSelect('#000000')}
                >
                  <Text style={styles.resetButtonText}>{t('color.reset', 'Reset to Default')}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View style={styles.customColorContainer}>
                <Text style={styles.customColorTitle}>{t('color.enterCustom', 'Enter Custom Color')}</Text>
                <Text style={styles.customColorSubtitle}>{t('color.enterHex', 'Enter a hex color code (e.g., #FF5733)')}</Text>
                
                <View style={styles.customColorInputContainer}>
                  <View style={[styles.colorPreview, { backgroundColor: customColorHex }]} />
                  <TextInput
                    style={styles.customColorInput}
                    value={customColorHex}
                    onChangeText={setCustomColorHex}
                    placeholder={t('color.placeholder', '#000000')}
                    placeholderTextColor="#999"
                    autoCapitalize="characters"
                    maxLength={7}
                  />
                </View>
                
                <View style={styles.customColorButtons}>
                  <TouchableOpacity
                    style={styles.customColorCancelButton}
                    onPress={() => setShowCustomPicker(false)}
                  >
                    <Text style={styles.customColorCancelButtonText}>{t('back', 'Back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.customColorSubmitButton}
                    onPress={handleCustomColorSubmit}
                  >
                    <Text style={styles.customColorSubmitButtonText}>{t('color.apply', 'Apply')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setIsModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>{t('cancel', 'Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  colorButton: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  colorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#000',
  },
  colorGrid: {
    maxHeight: 300,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    margin: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedColor: {
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  checkmark: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  // Category selection styles
  categoryScroll: {
    marginBottom: 16,
  },
  categoryContainer: {
    paddingHorizontal: 4,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedCategoryButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  selectedCategoryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Custom color picker styles
  customColorButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  customColorButtonText: {
    fontSize: 16,
    color: '#6c757d',
    fontWeight: '500',
  },
  customColorContainer: {
    paddingVertical: 16,
  },
  customColorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  customColorSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 20,
  },
  customColorInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  colorPreview: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  customColorInput: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    fontFamily: 'monospace',
    backgroundColor: '#fff',
  },
  customColorButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  customColorCancelButton: {
    flex: 1,
    marginRight: 8,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    alignItems: 'center',
  },
  customColorCancelButtonText: {
    fontSize: 16,
    color: '#6c757d',
    fontWeight: '500',
  },
  customColorSubmitButton: {
    flex: 1,
    marginLeft: 8,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  customColorSubmitButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  resetButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7d7',
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: 16,
    color: '#e53e3e',
    fontWeight: '500',
  },
  // Current color display styles
  currentColorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  currentColorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  currentColorText: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '500',
    fontFamily: 'monospace',
  },
});
