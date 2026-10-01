import type { BackgroundKind, OutputFormat, StudioSettings } from "./types";

export const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
  "image/x-tiff": "tiff",
};

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  const base = i > 0 ? name.slice(0, i) : name;
  return base.replace(/\s+/g, " ").trim() || "image";
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s.-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .toLowerCase() || "image"
  );
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(input: string): string | null {
  const m = input.trim().match(HEX_RE);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  return `#${hex.toLowerCase()}`;
}

export function isValidHex(input: string): boolean {
  return normalizeHex(input) !== null;
}

export const FORMAT_MIME: Record<OutputFormat, string> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  avif: "image/avif",
};

export function outputName(original: string, format: OutputFormat, bg: string): string {
  return `${slugify(baseName(original))}-${bg}.${format}`;
}

export const BG_PRESETS: { kind: BackgroundKind; label: string; swatch: string }[] = [
  { kind: "transparent", label: "Transparent", swatch: "" },
  { kind: "white", label: "White", swatch: "#ffffff" },
  { kind: "black", label: "Black", swatch: "#000000" },
  { kind: "red", label: "Red", swatch: "#ef4444" },
  { kind: "blue", label: "Blue", swatch: "#3b82f6" },
  { kind: "studio-gray", label: "Studio Gray", swatch: "#3f3f46" },
];

export function resolveBackground(settings: StudioSettings): string | null {
  if (settings.background === "custom") {
    return normalizeHex(settings.customColor) ?? "#ffffff";
  }
  const preset = BG_PRESETS.find((p) => p.kind === settings.background);
  return preset?.swatch ?? null;
}

export function bgLabel(kind: BackgroundKind): string {
  if (kind === "custom") return "custom";
  return BG_PRESETS.find((p) => p.kind === kind)?.label.toLowerCase() ?? kind;
}

/** Single source of truth for the background suffix used in output filenames. */
export function outputLabel(settings: StudioSettings): string {
  if (settings.background === "custom") {
    const hex = normalizeHex(settings.customColor) ?? "#ffffff";
    return `custom-${hex.slice(1)}`;
  }
  return bgLabel(settings.background).replace(/\s+/g, "-");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / 1024 ** i;
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function isHeic(name: string, type: string): boolean {
  const e = extOf(name);
  const t = type.toLowerCase();
  return e === "heic" || e === "heif" || t === "image/heic" || t === "image/heif";
}

export function isTiff(name: string, type: string): boolean {
  const e = extOf(name);
  const t = type.toLowerCase();
  return e === "tif" || e === "tiff" || t === "image/tiff" || t === "image/x-tiff";
}
