"use client";

/**
 * Image pipeline: decode → matte → compose → encode.
 *
 * decodeInput    normalize input into an ImageBitmap (HEIC/TIFF via /api/decode)
 * matteImage     rgba cutout via @imgly in lib/ai.ts
 * composeOnColor composite cutout over a solid color, or keep transparency
 * encodeTo       PNG/JPEG/WebP via canvas; AVIF (+ fallback) via /api/export
 */

import { matteImage } from "@/lib/ai";
import { callDecode, callExport } from "@/lib/bridge";
import type { OutputFormat } from "@/lib/types";
import { isHeic, isTiff } from "@/lib/utils";

/** Cap canvas area — segmentation/compositing on >24MP images is slow and can fail. */
export const MAX_PIXELS = 24_000_000;
export const MAX_EDGE = 4096;

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** 1 when dimensions are natural; otherwise the factor to downscale by */
  scale: number;
}

/** Compute the downscale factor (≤ 1) needed to keep huge inputs manageable. */
export function guardScale(width: number, height: number): number {
  const area = width * height;
  const long = Math.max(width, height);
  let scale = 1;
  if (area > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / area);
  if (long * scale > MAX_EDGE) scale = MAX_EDGE / long;
  return scale;
}

export async function decodeInput(
  file: File | Blob,
  name: string,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  const fileType = (file as File).type ?? "";
  // HEIC/HEIF and TIFF are not decodable in most browsers → normalize server-side.
  if (isHeic(name, fileType) || isTiff(name, fileType)) {
    const res = await callDecode({ file, name }, signal);
    const bitmap = await createImageBitmap(res.blob);
    return { bitmap, width: bitmap.width, height: bitmap.height, scale: guardScale(bitmap.width, bitmap.height) };
  }

  // Native decode (PNG/JPEG/WebP; HEIC on Safari also succeeds here).
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { bitmap, width: bitmap.width, height: bitmap.height, scale: guardScale(bitmap.width, bitmap.height) };
  } catch {
    // Quirky containers / AVIF on old browsers → fall back to the server decoder.
    const res = await callDecode({ file, name }, signal);
    const bitmap = await createImageBitmap(res.blob);
    return { bitmap, width: bitmap.width, height: bitmap.height, scale: guardScale(bitmap.width, bitmap.height) };
  }
}

/** Draw a bitmap into a fresh canvas, optionally downscaling, honoring EXIF-safe orientation. */
export function drawScaled(bitmap: ImageBitmap, scale: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

/**
 * Composite the rgba cutout over a solid color (hex like #rrggbb),
 * or return the cutout as-is when `color` is null (transparent).
 * Returns the composed canvas directly (caller encodes as needed).
 */
export async function composeOnColorCanvas(
  cutout: Blob,
  color: string | null,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(cutout);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Canvas encode failed (${mime})`))),
      mime,
      quality,
    );
  });
}

/** PNG/JPEG/WebP encode locally via canvas; AVIF (and any canvas failure) via sharp. */
export async function encodeTo(
  image: Blob,
  name: string,
  format: OutputFormat,
  quality: number,
  signal?: AbortSignal,
): Promise<{ blob: Blob; via: "canvas" | "server" }> {
  // AVIF always goes to sharp — canvas AVIF encoding is unavailable in browsers.
  if (format !== "avif") {
    try {
      const bitmap = await createImageBitmap(image);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);

        if (format === "png") {
          return { blob: await canvasToBlob(canvas, "image/png"), via: "canvas" };
        }
        if (format === "jpg") {
          return {
            blob: await canvasToBlob(canvas, "image/jpeg", clampQuality(quality)),
            via: "canvas",
          };
        }
        if (format === "webp" && (await canvasSupports("image/webp"))) {
          return {
            blob: await canvasToBlob(canvas, "image/webp", clampQuality(quality)),
            via: "canvas",
          };
        }
      } finally {
        bitmap.close();
      }
    } catch {
      // Canvas decode/encode unavailable — fall through to the sharp encoder.
    }
  }

  const res = await callExport(
    { blob: image, name, format, quality: Math.round(clampQuality(quality) * 100) },
    signal,
  );
  return { blob: res.blob, via: "server" };
}

export function clampQuality(q01: number): number {
  if (!Number.isFinite(q01)) return 0.92;
  return Math.min(1, Math.max(0, q01));
}

const supportCache = new Map<string, boolean>();
export async function canvasSupports(mime: string): Promise<boolean> {
  const hit = supportCache.get(mime);
  if (hit !== undefined) return hit;
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 2;
  let ok = false;
  try {
    const url = c.toDataURL(mime);
    ok = url.startsWith(`data:${mime};`);
  } catch {
    ok = false;
  }
  supportCache.set(mime, ok);
  return ok;
}

export { matteImage };
