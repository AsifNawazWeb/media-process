"use client";

/**
 * Processes queue items through the full pipeline.
 * A single-flight pump loop scans the store for work; settings changes
 * re-compose + re-encode already-matted items without redoing the matte.
 */

import { decodeInput, drawScaled, composeOnColorCanvas, canvasToBlob, encodeTo } from "@/lib/pipeline";
import { matteImage } from "@/lib/ai";
import { putBlob, getBlob, dropBlob, newKey } from "@/lib/blobcache";
import { useQueue } from "@/lib/queue-store";
import { useSettings } from "@/lib/settings-store";
import type { OutputFormat } from "@/lib/types";
import { resolveBackground } from "@/lib/utils";

let running = false;

const STAGES = ["decoding", "matting", "composing", "encoding"] as const;
const STAGE_WEIGHT: Record<(typeof STAGES)[number], number> = {
  decoding: 0.08,
  matting: 0.6,
  composing: 0.12,
  encoding: 0.2,
};

function stageBase(stage: (typeof STAGES)[number]): number {
  const idx = STAGES.indexOf(stage);
  return STAGES.slice(0, idx).reduce((acc, s) => acc + STAGE_WEIGHT[s], 0);
}

function progressAt(stage: (typeof STAGES)[number], fraction: number): number {
  return Math.min(0.99, stageBase(stage) + STAGE_WEIGHT[stage] * Math.max(0, Math.min(1, fraction)));
}

/** Kick the processor loop; safe to call repeatedly. */
export function kick(): void {
  void pump();
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = useQueue.getState().items.find((it) => it.stage === "queued");
      if (!next) break;
      const useModel = useSettings.getState().settings.model;
      try {
        await processOne(next.id, next.file, next.name, useModel);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        useQueue.getState().patch(next.id, { stage: "error", error: msg, progress: 0, note: undefined });
        useQueue.getState().toast("error", `${next.name}: ${msg}`);
      }
    }
  } finally {
    running = false;
  }
}

export async function processOne(
  id: string,
  file: File,
  name: string,
  model: "isnet_fp16" | "isnet_quint8",
): Promise<void> {
  const store = useQueue.getState();
  const previousUrl = store.items.find((it) => it.id === id)?.originalUrl;

  // 1 — decode + downscale guard
  store.patch(id, { stage: "decoding", progress: progressAt("decoding", 0.3) });
  const decoded = await decodeInput(file, name);
  const scale = decoded.scale;
  const canvas = drawScaled(decoded.bitmap, scale);
  decoded.bitmap.close();
  const pngBlob = await canvasToBlob(canvas, "image/png");
  canvas.width = 0;
  canvas.height = 0;
  const originalKey = newKey("orig");
  putBlob(originalKey, pngBlob);
  const originalUrl = URL.createObjectURL(pngBlob);
  if (previousUrl && previousUrl !== originalUrl) URL.revokeObjectURL(previousUrl);
  if (scale < 1) {
    useQueue.getState().toast(
      "info",
      `${name}: large image downscaled to ${Math.round(scale * 100)}% for processing.`,
    );
  }
  store.patch(id, {
    stage: "matting",
    progress: progressAt("matting", 0),
    originalKey,
    originalUrl,
    scaledDown: scale < 1 ? Math.round(scale * 1000) / 1000 : undefined,
    error: undefined,
    note: undefined,
  });

  // 2 — matte (AI)
  const cutout = await matteImage(pngBlob, {
    model,
    onProgress: (key, current, total) => {
      const frac = total > 0 ? current / total : 0;
      if (key.startsWith("fetch:")) {
        useQueue.getState().patch(id, {
          stage: "matting",
          progress: progressAt("matting", frac * 0.5),
          note: `Loading AI model… ${Math.round(frac * 100)}%`,
        });
      } else {
        useQueue
          .getState()
          .patch(id, { progress: progressAt("matting", 0.5 + frac * 0.5), note: undefined });
      }
    },
  });
  const cutoutKey = newKey("cutout");
  putBlob(cutoutKey, cutout);
  useQueue.getState().patch(id, {
    cutoutKey,
    stage: "composing",
    progress: progressAt("composing", 0),
    note: undefined,
  });

  // 3 — compose + encode
  await recompose(id);
}

export interface RecomposeOptions {
  /** focus the item when done (default true) */
  activate?: boolean;
  /** suppress per-item info toasts, e.g. during bulk restyles */
  silent?: boolean;
}

interface RecomposeEntry {
  rerun: boolean;
  opts: RecomposeOptions;
  promise: Promise<void>;
}

const composing = new Map<string, RecomposeEntry>();

/**
 * (Re)compose + (re)encode an already-matted item using current settings.
 * Concurrent calls for the same item coalesce: a request arriving mid-flight
 * schedules exactly one rerun with the latest settings instead of racing.
 */
export function recompose(id: string, opts: RecomposeOptions = {}): Promise<void> {
  const existing = composing.get(id);
  if (existing) {
    existing.rerun = true;
    existing.opts = { ...existing.opts, ...opts };
    return existing.promise;
  }
  const entry: RecomposeEntry = {
    rerun: false,
    opts,
    promise: Promise.resolve(),
  };
  entry.promise = (async () => {
    do {
      entry.rerun = false;
      await recomposeNow(id, { ...entry.opts });
    } while (entry.rerun && useQueue.getState().items.some((it) => it.id === id));
  })().finally(() => composing.delete(id));
  composing.set(id, entry);
  return entry.promise;
}

async function recomposeNow(id: string, opts: RecomposeOptions): Promise<void> {
  const store = useQueue.getState();
  const item = store.items.find((it) => it.id === id);
  if (!item) return;
  const cutout = getBlob(item.cutoutKey);
  if (!cutout) return;

  try {
    const settings = useSettings.getState().settings;
    const bg = resolveBackground(settings);
    const flatForJpg = settings.format === "jpg" && bg === null;
    const color = flatForJpg ? "#ffffff" : bg;

    const composedCanvas = await composeOnColorCanvas(cutout, color);
    const composedBlob = await canvasToBlob(composedCanvas, "image/png");
    store.patch(id, { stage: "encoding", progress: progressAt("encoding", 0) });

    const { blob: out, via } = await encodeTo(
      composedBlob,
      item.name,
      settings.format,
      settings.quality / 100,
    );
    const processedKey = newKey("out");
    putBlob(processedKey, out);
    dropBlob(item.processedKey);
    useQueue.getState().patch(id, {
      stage: "ready",
      processedKey,
      processedMeta: {
        width: composedCanvas.width,
        height: composedCanvas.height,
        bytes: out.size,
        type: out.type || settings.format,
      },
      progress: 1,
      error: undefined,
      note: undefined,
    });

    if (!opts.silent) {
      if (flatForJpg) {
        store.toast("info", `${item.name}: JPG has no alpha channel — flattened onto white.`);
      } else if (via === "server") {
        store.toast("info", `${item.name}: ${settings.format.toUpperCase()} encoded via sharp.`);
      }
    }
    if (opts.activate !== false) useQueue.getState().setActive(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    useQueue.getState().patch(id, { stage: "error", error: msg, progress: 0, note: undefined });
    store.toast("error", `${item.name}: ${msg}`);
  }
}

export type { OutputFormat };
