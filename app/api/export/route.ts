import type { NextRequest } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD = 250 * 1024 * 1024;

type Format = "png" | "webp" | "jpg" | "avif";

const FORMATS: Record<Format, string> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  avif: "image/avif",
};

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (!(entry instanceof File)) return jsonError("No file provided");
    if (entry.size > MAX_UPLOAD) return jsonError("File too large", 413);

    const format = String(form.get("format") ?? "png") as Format;
    if (!(format in FORMATS)) return jsonError(`Unsupported format: ${format}`);

    const qualityRaw = Number(form.get("quality") ?? 92);
    const quality = Number.isFinite(qualityRaw) ? Math.min(100, Math.max(0, qualityRaw)) : 92;

    const input = Buffer.from(await entry.arrayBuffer());
    let image = sharp(input, { limitInputPixels: 300_000_000 }).rotate();
    // JPG has no alpha channel — flatten those only; PNG/WebP/AVIF keep transparency.
    if (format === "jpg") image = image.flatten({ background: "#ffffff" });

    let out: import("sharp").Sharp;
    let mime: string;
    switch (format) {
      case "png":
        out = image.png({ compressionLevel: Math.round((quality / 100) * 9) });
        mime = FORMATS.png;
        break;
      case "jpg":
        out = image.jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" });
        mime = FORMATS.jpg;
        break;
      case "webp":
        out = image.webp({ quality, smartSubsample: true, effort: 4 });
        mime = FORMATS.webp;
        break;
      case "avif":
        out = image.avif({ quality: Math.max(30, quality), effort: 4 });
        mime = FORMATS.avif;
        break;
    }

    const { data, info } = await out.toBuffer({ resolveWithObject: true });
    return Response.json({
      ok: true,
      mime,
      bytes: data.length,
      width: info.width,
      height: info.height,
      dataUrl: `data:${mime};base64,${data.toString("base64")}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError(`Export failed: ${msg}`, 500);
  }
}
