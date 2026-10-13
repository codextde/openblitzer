import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Category, Units } from '@/core/types';

export type LanguagePref = 'system' | 'de' | 'en';
export type MapStylePref = 'auto' | 'light' | 'dark';

type Values = {
  onboarded: boolean;
  legalAccepted: boolean;
  sound: boolean;
  voice: boolean;
  vibration: boolean;
  categories: Record<Category, boolean>;
  overspeed: boolean;
  tolerance: number;
  units: Units;
  mapStyle: MapStylePref;
  keepScreenOn: boolean;
  language: LanguagePref;
};

type SettingsState = Values & {
  set: (patch: Partial<Values>) => void;
  setCategory: (category: Category, on: boolean) => void;
};

export const defaultSettings: Values = {
  onboarded: false,
  legalAccepted: false,
  sound: true,
  voice: true,
  vibration: true,
  categories: { fixed: true, redlight: true, section: true, mobile: true, traffic: true },
  overspeed: true,
  tolerance: 3,
  units: 'kmh',
  mapStyle: 'auto',
  keepScreenOn: true,
  language: 'system',
};

export const syncStorage = {
  getItem: (key: string) => Storage.getItemSync(key),
  setItem: (key: string, value: string) => Storage.setItemSync(key, value),
  removeItem: (key: string) => {
    Storage.removeItemSync(key);
  },
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      set: (patch) => set(patch),
      setCategory: (category, on) => set((s) => ({ categories: { ...s.categories, [category]: on } })),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => syncStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Values>;
        return { ...current, ...p, categories: { ...current.categories, ...(p.categories ?? {}) } };
      },
    },
  ),
);

export const settings = () => useSettings.getState();
