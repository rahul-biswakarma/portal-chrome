import { create } from 'zustand';

// Progress store that can be accessed from anywhere
interface ProgressState {
  progress: number;
  isVisible: boolean;
  setProgress: (value: number) => void;
  hideProgress: () => void;
  showProgress: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  progress: 0,
  isVisible: false,
  setProgress: (value: number) =>
    set({
      progress: Math.max(0, Math.min(100, value)),
      isVisible: value > 0,
    }),
  hideProgress: () => set({ isVisible: false }),
  showProgress: () => set({ isVisible: true }),
}));
