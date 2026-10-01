export const INPUT_ACCEPT = ".png,.jpg,.jpeg,.webp,.heic,.heif,.tif,.tiff,image/png,image/jpeg,image/webp,image/heic,image/heif,image/tiff";

export type ProcessStage =
  | "queued"
  | "decoding"
  | "matting"
  | "composing"
  | "encoding"
  | "ready"
  | "error";

export type OutputFormat = "png" | "webp" | "jpg" | "avif";

export type BackgroundKind =
  | "transparent"
  | "white"
  | "black"
  | "red"
  | "blue"
  | "studio-gray"
  | "custom";

export type ModelChoice = "isnet_fp16" | "isnet_quint8";
export type PreviewMode = "side" | "slider";

export interface ProcessedMeta {
  width: number;
  height: number;
  bytes: number;
  type: string;
}

export interface QueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  stage: ProcessStage;
  error?: string;
  /** transient status line (e.g. model download progress) shown while busy */
  note?: string;
  originalKey?: string;
  originalUrl?: string;
  /** rgba cutout blob (transparent PNG from the matting engine) */
  cutoutKey?: string;
  processedKey?: string;
  processedMeta?: ProcessedMeta;
  /** downscale factor applied to guard huge images */
  scaledDown?: number;
  progress: number;
}

export interface StudioSettings {
  background: BackgroundKind;
  customColor: string;
  format: OutputFormat;
  quality: number;
  model: ModelChoice;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  background: "transparent",
  customColor: "#f43f5e",
  format: "png",
  quality: 92,
  model: "isnet_fp16",
};
