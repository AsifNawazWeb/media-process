import { create } from "zustand";
import type { QueueItem } from "@/lib/types";
import { dropBlob } from "@/lib/blobcache";

type Toast = {
  id: string;
  kind: "ok" | "error" | "info";
  text: string;
};

type QueueState = {
  items: QueueItem[];
  activeId: string | null;
  toasts: Toast[];
  addFiles: (files: File[]) => QueueItem[];
  remove: (id: string) => void;
  clearAll: () => void;
  patch: (id: string, patch: Partial<QueueItem>) => void;
  setActive: (id: string | null) => void;
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: string) => void;
};

function fileOk(file: File): boolean {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const okExt = ["png", "jpg", "jpeg", "webp", "heic", "heif", "tif", "tiff"].includes(ext);
  const okType =
    file.type.startsWith("image/") && !file.type.includes("svg") && !file.type.includes("gif");
  return okExt || okType;
}

export const useQueue = create<QueueState>((set, get) => ({
  items: [],
  activeId: null,
  toasts: [],

  addFiles: (files) => {
    const accepted: QueueItem[] = [];
    let rejected = 0;
    for (const file of files) {
      if (!fileOk(file)) {
        rejected++;
        continue;
      }
      accepted.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        stage: "queued",
        progress: 0,
      });
    }
    if (rejected > 0) {
      get().toast("error", `${rejected} file${rejected > 1 ? "s" : ""} skipped — unsupported format`);
    }
    set((s) => ({ items: [...s.items, ...accepted] }));
    return accepted;
  },

  remove: (id) => {
    const item = get().items.find((it) => it.id === id);
    if (item) {
      for (const key of [item.originalKey, item.cutoutKey, item.processedKey]) {
        dropBlob(key);
      }
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    }
    set((s) => ({
      items: s.items.filter((it) => it.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }));
  },

  clearAll: () => {
    for (const item of get().items) {
      for (const key of [item.originalKey, item.cutoutKey, item.processedKey]) {
        dropBlob(key);
      }
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    }
    set({ items: [], activeId: null, toasts: [] });
  },

  patch: (id, patch) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),

  setActive: (id) => set({ activeId: id }),

  toast: (kind, text) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), kind === "error" ? 6500 : 3800);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export { type Toast };
