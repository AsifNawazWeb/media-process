import sharp from "sharp";

export const runtime = "nodejs";

export async function GET() {
  try {
    const inputIds = ["jpeg", "png", "webp", "tiff", "gif", "svg", "heif", "raw"] as const;
    const formats: Record<string, boolean> = {};
    for (const id of inputIds) {
      const info = sharp.format[id] as import("sharp").AvailableFormatInfo | undefined;
      formats[id] = Boolean(info?.input?.buffer);
    }
    return Response.json({
      ok: true,
      sharp: sharp.versions.sharp ?? "unknown",
      libvips: sharp.versions.vips ?? "unknown",
      heicInput: formats.heif,
      formats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
