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
  /** Optional single short video — mutually exclusive with images in the create flow. */
  pickedVideo: GalleryPickedAsset | null;
  setPickedAssets: (update: PickedUpdate) => void;
  setPickedVideo: (video: GalleryPickedAsset | null) => void;
  clearPickedAssets: () => void;
}

export const useGalleryCreateDraftStore = create<GalleryCreateDraftState>((set) => ({
  pickedAssets: [],
  pickedVideo: null,
  setPickedAssets: (update) =>
    set((state) => ({
      pickedAssets: typeof update === 'function' ? (update as (p: GalleryPickedAsset[]) => GalleryPickedAsset[])(state.pickedAssets) : update,
    })),
  setPickedVideo: (video) => set({ pickedVideo: video }),
  clearPickedAssets: () => set({ pickedAssets: [], pickedVideo: null }),
}));
