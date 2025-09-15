import { create } from 'zustand';
import { productsApi, Product } from '@/lib/api/products';

interface ProductsState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  getProductById: (id: string) => Product | undefined;
}

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  isLoading: false,
  error: null,

  fetchProducts: async () => {
    set({ isLoading: true, error: null });
    try {
      const products = await productsApi.getAllProducts();
      set({ products, isLoading: false });
    } catch (error) {
      set({ error: 'Error loading products', isLoading: false });
      console.error('Error fetching products:', error);
    }
  },

  getProductById: (id: string) => {
    const { products } = get();
    return products.find(product => product.id === id);
  }
}));
