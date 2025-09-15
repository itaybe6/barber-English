import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/src/theme/ThemeProvider';
import { productsApi, Product, CreateProductData } from '@/lib/api/products';
import { useProductsStore } from '@/stores/productsStore';
import * as ImagePicker from 'expo-image-picker';

export default function EditProductsScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  
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
  };

  const closeModal = () => {
    setShowAddModal(false);
    resetForm();
  };

  const handleImageSelection = async (imageUri: string, isPreset: boolean) => {
    try {
      setIsUploadingImage(true);
      
      let finalImageUrl = imageUri;
      
      if (!isPreset) {
        // Upload custom image
        finalImageUrl = await productsApi.uploadProductImage(imageUri);
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
        quality: 0.8,
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
        quality: 0.8,
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
    <SafeAreaView style={styles.container}>
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

      {/* Add/Edit Product Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </Text>
            
            <TouchableOpacity onPress={handleSaveProduct} disabled={isSaving}>
              <Text style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Product Image */}
            <View style={styles.imageSection}>
              <Text style={styles.sectionTitle}>Product Image</Text>
              <TouchableOpacity
                style={styles.imageSelector}
                onPress={handleImagePicker}
                disabled={isUploadingImage}
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

            {/* Product Name */}
            <View style={styles.inputSection}>
              <Text style={styles.sectionTitle}>Product Name *</Text>
              <TextInput
                style={styles.textInput}
                value={productForm.name}
                onChangeText={(text) => setProductForm(prev => ({ ...prev, name: text }))}
                placeholder="Enter product name"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Product Description */}
            <View style={styles.inputSection}>
              <Text style={styles.sectionTitle}>Description</Text>
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

            {/* Product Price */}
            <View style={styles.inputSection}>
              <Text style={styles.sectionTitle}>Price *</Text>
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
          </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
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
    backgroundColor: '#F8F9FA',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
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
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  saveButtonDisabled: {
    color: colors.textSecondary,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
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
});
