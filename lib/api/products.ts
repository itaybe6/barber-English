import { supabase, getBusinessId } from '@/lib/supabase';

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProductData {
  name: string;
  description?: string;
  price: number;
  image_url?: string;
}

export interface UpdateProductData {
  name?: string;
  description?: string;
  price?: number;
  image_url?: string;
  is_active?: boolean;
}

export const productsApi = {
  // Get all products for the current business
  async getAllProducts(): Promise<Product[]> {
    const businessId = getBusinessId();
    
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      throw error;
    }

    return data || [];
  },

  // Get a single product by ID
  async getProduct(id: string): Promise<Product | null> {
    const businessId = getBusinessId();
    
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (error) {
      console.error('Error fetching product:', error);
      throw error;
    }

    return data;
  },

  // Create a new product
  async createProduct(productData: CreateProductData): Promise<Product> {
    const businessId = getBusinessId();
    
    const { data, error } = await supabase
      .from('products')
      .insert({
        ...productData,
        business_id: businessId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      throw error;
    }

    return data;
  },

  // Update an existing product
  async updateProduct(id: string, productData: UpdateProductData): Promise<Product> {
    const businessId = getBusinessId();
    
    const { data, error } = await supabase
      .from('products')
      .update(productData)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      throw error;
    }

    return data;
  },

  // Delete a product (soft delete by setting is_active to false)
  async deleteProduct(id: string): Promise<void> {
    const businessId = getBusinessId();
    
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id)
      .eq('business_id', businessId);

    if (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  },

  // Upload product image
  async uploadProductImage(imageUri: string, productId?: string): Promise<string> {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = productId ? `product-${productId}-${Date.now()}.${fileExt}` : `product-${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('designs')
        .upload(fileName, blob, {
          contentType: `image/${fileExt}`,
        });

      if (error) {
        console.error('Error uploading product image:', error);
        throw error;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('designs')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading product image:', error);
      throw error;
    }
  }
};
