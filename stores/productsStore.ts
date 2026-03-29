import { create } from 'zustand/react';
import { productsApi, Product, sortProductsByDisplayOrder } from '@/lib/api/products';

interface ProductsState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  getProductById: (id: string) => Product | undefined;
  applyProductDisplayOrder: (orderedIds: string[]) => Promise<boolean>;
}

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  isLoading: false,
  error: null,

  fetchProducts: async () => {
    set({ isLoading: true, error: null });
    try {
      const raw = await productsApi.getAllProducts();
      const products = sortProductsByDisplayOrder(raw);
      set({ products, isLoading: false });
    } catch (error) {
      set({ error: 'Error loading products', isLoading: false });
      console.error('Error fetching products:', error);
    }
  },

  getProductById: (id: string) => {
    const { products } = get();
    return products.find(product => product.id === id);
  },

  applyProductDisplayOrder: async (orderedIds: string[]) => {
    const ok = await productsApi.applyProductDisplayOrder(orderedIds);
    if (ok) {
      set((state) => {
        const idToIndex = new Map(orderedIds.map((id, i) => [id, i]));
        const reordered = [...state.products].sort((a, b) => {
          const ia = idToIndex.get(a.id) ?? 9999;
          const ib = idToIndex.get(b.id) ?? 9999;
          return ia - ib;
        });
        return { products: reordered };
      });
    }
    return ok;
  },
}));
