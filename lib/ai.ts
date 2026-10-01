"use client";

/**
 * Thin wrapper around @imgly/background-removal.
 * Dynamic import keeps the ~1MB lib (and its wasm plumbing) out of the
 * initial bundle; it only loads when the first matte or preload happens.
 */

import type { Config } from "@imgly/background-removal";
import type { ModelChoice } from "@/lib/types";

export type ImglyModule = typeof import("@imgly/background-removal");
export type ProgressCb = Config["progress"];

let mod: ImglyModule | null = null;

export function publicPath(): string {
  if (typeof window === "undefined") return "/imgly/";
  return `${window.location.origin}/imgly/`;
}

export async function getImgly(): Promise<ImglyModule> {
  if (!mod) {
    mod = await import("@imgly/background-removal");
  }
  return mod;
}

export interface MatteOptions {
  model: ModelChoice;
  onProgress?: ProgressCb;
}

function config(model: ModelChoice, onProgress?: ProgressCb): Config {
  return {
    publicPath: publicPath(),
    device: "cpu",
    model,
    debug: false,
    output: {
      format: "image/png",
      quality: 1,
    },
    progress: onProgress,
  };
}

/** Preload model + wasm into the browser cache. Resolves once warmed. */
export async function preloadModel(model: ModelChoice, onProgress?: ProgressCb): Promise<void> {
  const imgly = await getImgly();
  const cfg = config(model, onProgress);
  await imgly.preload(cfg);
}

/** Run matting on an image blob → rgba cutout PNG blob. */
export async function matteImage(input: Blob, opts: MatteOptions): Promise<Blob> {
  const imgly = await getImgly();
  return imgly.removeBackground(input, config(opts.model, opts.onProgress));
}
