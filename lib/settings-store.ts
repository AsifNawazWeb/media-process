import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BackgroundKind, ModelChoice, OutputFormat, PreviewMode, StudioSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

type SettingsState = {
  settings: StudioSettings;
  setBackground: (bg: BackgroundKind) => void;
  setCustomColor: (hex: string) => void;
  setFormat: (format: OutputFormat) => void;
  setQuality: (q: number) => void;
  setModel: (m: ModelChoice) => void;
  reset: () => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      setBackground: (bg) =>
        set((s) => ({ settings: { ...s.settings, background: bg } })),
      setCustomColor: (hex) =>
        set((s) => ({ settings: { ...s.settings, customColor: hex } })),
      setFormat: (format) =>
        set((s) => ({ settings: { ...s.settings, format } })),
      setQuality: (quality) =>
        set((s) => ({ settings: { ...s.settings, quality } })),
      setModel: (model) => set((s) => ({ settings: { ...s.settings, model } })),
      reset: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: "cutout-studio-settings",
      version: 2,
      // Avoid SSR/client hydration mismatch: rehydrate explicitly from an effect.
      skipHydration: true,
      // v2 moved preview mode out of settings (now local to the result viewer).
      migrate: (persisted, version) => {
        const state = persisted as SettingsState;
        if (version < 2 && state?.settings) {
          delete (state.settings as StudioSettings & { previewMode?: PreviewMode }).previewMode;
        }
        return state;
      },
    }
  ),
);

export type { StudioSettings };
