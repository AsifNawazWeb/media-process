"use client";

/**
 * Batch export → ZIP (JSZip, STORE compression: images are already compressed)
 * and single-file save via file-saver.
 */

import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getBlob } from "@/lib/blobcache";
import { useQueue } from "@/lib/queue-store";
import { outputName, outputLabel } from "@/lib/utils";
import { useSettings } from "@/lib/settings-store";
import type { QueueItem } from "@/lib/types";

export function stagedItems(): QueueItem[] {
  return useQueue.getState().items.filter((it) => it.stage === "ready" && it.processedKey);
}

export function saveSingle(item: QueueItem): boolean {
  const blob = getBlob(item.processedKey);
  if (!blob) return false;
  const settings = useSettings.getState().settings;
  const name = outputName(item.name, settings.format, outputLabel(settings));
  saveAs(blob, uniqueDirSafeName(name));
  return true;
}

export interface ZipProgress {
  done: number;
  total: number;
}

export async function downloadZip(
  onProgress?: (p: ZipProgress) => void,
): Promise<{ ok: boolean; count: number }> {
  const settings = useSettings.getState().settings;
  const items = stagedItems();
  if (items.length === 0) return { ok: false, count: 0 };

  const zip = new JSZip();
  const used = new Set<string>();
  const label = outputLabel(settings);

  let done = 0;
  for (const item of items) {
    const blob = getBlob(item.processedKey);
    if (!blob) continue;
    let name = uniqueDirSafeName(outputName(item.name, settings.format, label));
    while (used.has(name.toLowerCase())) {
      name = name.replace(/(\.[a-z0-9]+)$/i, (_m, ext) => `-${Math.random().toString(36).slice(2, 6)}${ext}`);
    }
    used.add(name.toLowerCase());
    zip.file(name, blob);
    done++;
    onProgress?.({ done, total: items.length });
  }

  if (done === 0) return { ok: false, count: 0 };
  const content = await zip.generateAsync({
    type: "blob",
    compression: "STORE",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(content, `cutout-studio-${stamp}.zip`);
  return { ok: true, count: done };
}

function uniqueDirSafeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 120);
}
