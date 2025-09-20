import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
  SafeAreaView,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/src/theme/ThemeProvider';
import { productsApi, Product, CreateProductData } from '@/lib/api/products';
import { useProductsStore } from '@/stores/productsStore';
import * as ImagePicker from 'expo-image-picker';
import { compressImage } from '@/lib/utils/imageCompression';

export default function EditProductsScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  
  const { products, isLoading, fetchProducts } = useProductsStore();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    image_url: '',
  });
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stepper state for Add/Edit Product (0: Image, 1: Details, 2: Price)
  const [prodStep, setProdStep] = useState<number>(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current; // 0..1
  const [viewportWidth, setViewportWidth] = useState<number>(Dimensions.get('window').width);

  useEffect(() => {
    fetchProducts();
  }, []);

  const resetForm = () => {
    setProductForm({
      name: '',
      description: '',
      price: '',
      image_url: '',
    });
    setEditingProduct(null);
    setProdStep(0);
    translateX.setValue(0);
    progressAnim.setValue(0);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (product: Product) => {
    setProductForm({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      image_url: product.image_url || '',
    });
    setEditingProduct(product);
    setShowAddModal(true);
    setProdStep(0);
    translateX.setValue(0);
    progressAnim.setValue(0);
  };

  const closeModal = () => {
    setShowAddModal(false);
    resetForm();
  };

  const goToProdStep = (next: number, animate: boolean = true) => {
    const clamped = Math.max(0, Math.min(2, next));
    setProdStep(clamped);
    const widthToUse = viewportWidth || Dimensions.get('window').width;
    if (animate) {
      Animated.timing(translateX, {
        toValue: -clamped * widthToUse,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      Animated.timing(progressAnim, {
        toValue: clamped / 2,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      translateX.setValue(-clamped * widthToUse);
      progressAnim.setValue(clamped / 2);
    }
  };

  const goNextProd = () => {
    if (prodStep < 2) {
      goToProdStep(prodStep + 1);
    } else {
      // Final step -> save
      handleSaveProduct();
    }
  };

  const goBackProd = () => goToProdStep(prodStep - 1);

  const handleImageSelection = async (imageUri: string, isPreset: boolean) => {
    try {
      setIsUploadingImage(true);
      
      let finalImageUrl = imageUri;
      
      if (!isPreset) {
        // Compress the image before uploading
        const compressedImage = await compressImage(imageUri, {
          quality: 0.7,
          maxWidth: 800,
          maxHeight: 800,
          format: 'jpeg'
        });
        
        // Upload compressed image
        finalImageUrl = await productsApi.uploadProductImage(compressedImage.uri);
      }
      
      setProductForm(prev => ({ ...prev, image_url: finalImageUrl }));
    } catch (error) {
      console.error('Error handling image selection:', error);
      Alert.alert('Error', 'Failed to process image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImagePicker = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to select images');
        return;
      }

      // Show action sheet
      Alert.alert(
        'Select Image',
        'Choose an option',
        [
          { text: 'Camera', onPress: () => openCamera() },
          { text: 'Photo Library', onPress: () => openImageLibrary() },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to access image picker');
    }
  };

  const openCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1.0, // Use highest quality for initial capture, we'll compress later
      });

      if (!result.canceled && result.assets[0]) {
        await handleImageSelection(result.assets[0].uri, false);
      }
    } catch (error) {
      console.error('Error opening camera:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const openImageLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1.0, // Use highest quality for initial selection, we'll compress later
      });

      if (!result.canceled && result.assets[0]) {
        await handleImageSelection(result.assets[0].uri, false);
      }
    } catch (error) {
      console.error('Error opening image library:', error);
      Alert.alert('Error', 'Failed to open image library');
    }
  };

  const handleSaveProduct = async () => {
    if (!productForm.name.trim()) {
      Alert.alert('Error', 'Please enter a product name');
      return;
    }

    if (!productForm.price || parseFloat(productForm.price) <= 0) {
      Alert.alert('Error', 'Please enter a valid price');
      return;
    }

    try {
      setIsSaving(true);
      
      const productData: CreateProductData = {
        name: productForm.name.trim(),
        description: productForm.description.trim() || undefined,
        price: parseFloat(productForm.price),
        image_url: productForm.image_url || undefined,
      };

      if (editingProduct) {
        // Update existing product
        await productsApi.updateProduct(editingProduct.id, productData);
        Alert.alert('Success', 'Product updated successfully');
      } else {
        // Create new product
        await productsApi.createProduct(productData);
        Alert.alert('Success', 'Product created successfully');
      }

      // Refresh products list
      await fetchProducts();
      closeModal();
    } catch (error) {
      console.error('Error saving product:', error);
      Alert.alert('Error', editingProduct ? 'Failed to update product' : 'Failed to create product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await productsApi.deleteProduct(product.id);
              await fetchProducts();
              Alert.alert('Success', 'Product deleted successfully');
            } catch (error) {
              console.error('Error deleting product:', error);
              Alert.alert('Error', 'Failed to delete product');
            }
          },
        },
      ]
    );
  };

  const renderProductItem = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <View style={styles.productImageContainer}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.productImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="bag-outline" size={40} color={colors.textSecondary} />
          </View>
        )}
      </View>
      
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.productDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
      </View>
      
      <View style={styles.productActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.editButton]}
          onPress={() => openEditModal(item)}
        >
          <Ionicons name="create-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteProduct(item)}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#fff' }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Edit Products</Text>
        
        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddModal}
        >
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Products List */}
      <View style={styles.screenBodyWrapper}>
      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading products...</Text>
          </View>
        ) : products.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="bag-outline" size={80} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No Products Yet</Text>
            <Text style={styles.emptySubtitle}>
              Add your first product to get started
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={openAddModal}>
              <Text style={styles.emptyButtonText}>Add Product</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={renderProductItem}
            contentContainerStyle={styles.productsList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
      </View>

      {/* Add/Edit Product Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal} style={styles.headerIconButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { position: 'absolute', left: 64, right: 64, textAlign: 'center' }]}>
              {editingProduct ? 'Edit product' : 'Add product'}
            </Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Body */}
          <View style={styles.bodyWrapper}>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Stepper */}
              <View style={styles.stepperContainer}>
                <View style={styles.stepperTrack}>
                  <Animated.View
                    style={[styles.stepperProgress, { backgroundColor: colors.primary, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
                  />
                </View>
                <View style={styles.stepperLabels}>
                  {['Image','Details','Price'].map((label, idx) => (
                    <View key={label} style={styles.stepperLabelWrap}>
                      <View style={[styles.stepDot, { borderColor: idx <= prodStep ? colors.primary : '#D1D1D6', backgroundColor: idx < prodStep ? colors.primary : '#FFFFFF' }]} />
                      <Text style={[styles.stepLabelText, { color: idx <= prodStep ? colors.primary : '#8E8E93' }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Animated steps viewport */}
              <View style={styles.groupCard}>
                <View
                  style={styles.stepsViewport}
                  onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    if (w && w > 0) {
                      setViewportWidth(w);
                      translateX.setValue(-prodStep * w);
                    }
                  }}
                >
                  <Animated.View style={[styles.stepsContainer, { width: (viewportWidth || Dimensions.get('window').width) * 3, transform: [{ translateX }] }]}> 
                    {/* Step 0: Image */}
                    <View style={[styles.stepPane, { width: viewportWidth || Dimensions.get('window').width }]}> 
                      <View style={[styles.imageSection, styles.centeredSection]}>
                        <Text style={[styles.sectionTitle, styles.centerText]}>Product Image</Text>
                        <Text style={[styles.sectionSubtitle, styles.centerText]}>Add a product cover image</Text>
                        <TouchableOpacity
                          style={styles.imageSelector}
                          onPress={handleImagePicker}
                          disabled={isUploadingImage}
                          activeOpacity={0.9}
                        >
                          {productForm.image_url ? (
                            <Image source={{ uri: productForm.image_url }} style={styles.selectedImage} />
                          ) : (
                            <View style={styles.imagePlaceholder}>
                              <Ionicons name="camera-outline" size={40} color={colors.textSecondary} />
                              <Text style={styles.imagePlaceholderText}>Add Image</Text>
                            </View>
                          )}
                          {isUploadingImage && (
                            <View style={styles.uploadingOverlay}>
                              <ActivityIndicator size="small" color={colors.primary} />
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Step 1: Details */}
                    <View style={[styles.stepPane, { width: viewportWidth || Dimensions.get('window').width }]}> 
                      <View style={styles.inputSection}>
                        <View style={{ marginBottom: 8 }}>
                          <Text style={styles.sectionTitle}>Product name *</Text>
                          <Text style={styles.sectionSubtitle}>Enter the product display name</Text>
                        </View>
                        <TextInput
                          style={styles.textInput}
                          value={productForm.name}
                          onChangeText={(text) => setProductForm(prev => ({ ...prev, name: text }))}
                          placeholder="Enter product name"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>

                      <View style={styles.inputSection}>
                        <View style={{ marginBottom: 8 }}>
                          <Text style={styles.sectionTitle}>Description</Text>
                          <Text style={styles.sectionSubtitle}>Short description about this product</Text>
                        </View>
                        <TextInput
                          style={[styles.textInput, styles.textArea]}
                          value={productForm.description}
                          onChangeText={(text) => setProductForm(prev => ({ ...prev, description: text }))}
                          placeholder="Enter product description"
                          placeholderTextColor={colors.textSecondary}
                          multiline
                          numberOfLines={3}
                        />
                      </View>
                    </View>

                    {/* Step 2: Price */}
                    <View style={[styles.stepPane, { width: viewportWidth || Dimensions.get('window').width }]}> 
                      <View style={styles.inputSection}>
                        <View style={{ marginBottom: 8 }}>
                          <Text style={styles.sectionTitle}>Price *</Text>
                          <Text style={styles.sectionSubtitle}>Set the price for this product</Text>
                        </View>
                        <View style={styles.priceInputContainer}>
                          <Text style={styles.currencySymbol}>$</Text>
                          <TextInput
                            style={[styles.textInput, styles.priceInput]}
                            value={productForm.price}
                            onChangeText={(text) => setProductForm(prev => ({ ...prev, price: text }))}
                            placeholder="0.00"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                </View>

                {/* Step navigation */}
                <View style={styles.stepNavRow}>
                  <TouchableOpacity onPress={goBackProd} disabled={prodStep === 0} style={[styles.stepNavButton, prodStep === 0 && styles.stepNavButtonDisabled]}> 
                    <Text style={[styles.stepNavText, prodStep === 0 && styles.stepNavTextDisabled]}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={prodStep < 2 ? goNextProd : handleSaveProduct}
                    disabled={
                      (prodStep === 1 && !productForm.name.trim()) ||
                      (prodStep === 2 && (isSaving || !productForm.price || isNaN(parseFloat(productForm.price)) || parseFloat(productForm.price) <= 0))
                    }
                    style={[styles.stepNavPrimary, { backgroundColor: colors.primary }, ((prodStep === 1 && !productForm.name.trim()) || (prodStep === 2 && (isSaving || !productForm.price || isNaN(parseFloat(productForm.price)) || parseFloat(productForm.price) <= 0))) && { opacity: 0.6 }]}
                  >
                    <Text style={styles.stepNavPrimaryText}>{prodStep < 2 ? 'Next' : (isSaving ? 'Saving...' : 'Done')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
          {/* Color the bottom safe area to gray to avoid white split */}
          <View
            pointerEvents="none"
            style={[
              styles.bottomSafeOverlay,
              { height: Math.max(insets.bottom || 0, 16) }
            ]}
          />
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  screenBodyWrapper: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  productsList: {
    paddingVertical: 20,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  productImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 16,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  productActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: `${colors.primary}20`,
  },
  deleteButton: {
    backgroundColor: `${colors.error}20`,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
  },
  cancelButton: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 36,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  bodyWrapper: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepperContainer: {
    marginTop: 12,
    marginBottom: 12,
  },
  stepperTrack: {
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    overflow: 'hidden',
  },
  stepperProgress: {
    height: '100%',
  },
  stepperLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  stepperLabelWrap: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  stepLabelText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  imageSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  centeredSection: {
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
    alignSelf: 'center',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: -6,
    marginBottom: 10,
    textAlign: 'left',
  },
  imageSelector: {
    width: 120,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  selectedImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputSection: {
    marginBottom: 24,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 16,
    color: colors.text,
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stepsViewport: {
    overflow: 'hidden',
  },
  stepsContainer: {
    flexDirection: 'row',
  },
  stepPane: {
    paddingRight: 4,
  },
  stepNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  stepNavButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  stepNavButtonDisabled: {
    opacity: 0.6,
  },
  stepNavText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '600',
  },
  stepNavTextDisabled: {
    color: '#8E8E93',
  },
  stepNavPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  stepNavPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomSafeOverlay: {
    backgroundColor: '#F2F2F7',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
