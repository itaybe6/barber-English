import { create } from 'zustand/react';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** When true, Green Invoice Edge calls use sandbox.d.greeninvoice.co.il (demo documents). */
interface GreenInvoiceDevModeState {
  useSandboxApi: boolean;
  setUseSandboxApi: (value: boolean) => void;
}

export const useGreenInvoiceDevModeStore = create<GreenInvoiceDevModeState>()(
  persist(
    (set) => ({
      useSandboxApi: false,
      setUseSandboxApi: (value) => set({ useSandboxApi: value }),
    }),
    {
      name: 'green-invoice-dev-mode',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
