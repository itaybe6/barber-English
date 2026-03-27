import { create } from 'zustand/react';

/** Picked files for admin "add design" — lives outside screen state so it survives activity remount after the system picker closes (common on Android). */
export type GalleryPickedAsset = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
};

type PickedUpdate = GalleryPickedAsset[] | ((prev: GalleryPickedAsset[]) => GalleryPickedAsset[]);

interface GalleryCreateDraftState {
  pickedAssets: GalleryPickedAsset[];
  setPickedAssets: (update: PickedUpdate) => void;
  clearPickedAssets: () => void;
}

export const useGalleryCreateDraftStore = create<GalleryCreateDraftState>((set) => ({
  pickedAssets: [],
  setPickedAssets: (update) =>
    set((state) => ({
      pickedAssets: typeof update === 'function' ? (update as (p: GalleryPickedAsset[]) => GalleryPickedAsset[])(state.pickedAssets) : update,
    })),
  clearPickedAssets: () => set({ pickedAssets: [] }),
}));
