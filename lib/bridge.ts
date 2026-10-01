/**
 * Bridge layer — the only place that talks to server endpoints.
 * Kept thin and IPC-shaped so an Electron port can swap `callDecode` /
 * `callExport` for IPC handlers without touching the pipeline.
 */

export interface DecodeResult {
  blob: Blob;
  width: number;
  height: number;
}

export interface DecodePayload {
  file: Blob;
  name: string;
}

export interface ExportPayload {
  /** composed RGBA image (png/webpLossless) produced client-side */
  blob: Blob;
  name: string;
  format: "png" | "webp" | "jpg" | "avif";
  /** 0–100 */
  quality: number;
}

export interface ExportResult {
  blob: Blob;
  mime: string;
  bytes: number;
}

const MAX_BODY_BYTES = 220 * 1024 * 1024;

async function unwrap<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) detail = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(`${what}: ${detail}`);
  }
  return (await res.json()) as T;
}

export async function callDecode(
  payload: DecodePayload,
  signal?: AbortSignal,
): Promise<DecodeResult> {
  const form = new FormData();
  form.append("file", payload.file, payload.name);
  const res = await fetch("/api/decode", { method: "POST", body: form, signal });
  const data = await unwrap<{ ok: true; width: number; height: number; dataUrl: string }>(
    res,
    "Decode failed",
  );
  const blob = await (await fetch(data.dataUrl)).blob();
  return { blob, width: data.width, height: data.height };
}

export async function callExport(
  payload: ExportPayload,
  signal?: AbortSignal,
): Promise<ExportResult> {
  if (payload.blob.size > MAX_BODY_BYTES) {
    throw new Error(
      `Image too large for server export (${(payload.blob.size / 1e6).toFixed(0)}MB). Try PNG output or a smaller image.`,
    );
  }
  const form = new FormData();
  form.append("file", payload.blob, payload.name);
  form.append("format", payload.format);
  form.append("quality", String(payload.quality));
  const res = await fetch("/api/export", { method: "POST", body: form, signal });
  const data = await unwrap<{ ok: true; mime: string; dataUrl: string; bytes: number }>(
    res,
    "Export failed",
  );
  const blob = await (await fetch(data.dataUrl)).blob();
  return { blob, mime: data.mime, bytes: data.bytes };
}
