import { create } from 'zustand';

interface AdminWaitlistSheetState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useAdminWaitlistSheetStore = create<AdminWaitlistSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
