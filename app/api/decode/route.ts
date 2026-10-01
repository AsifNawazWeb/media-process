import sharp from "sharp";
import heicConvert from "heic-convert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD = 300 * 1024 * 1024;

/** HEIC/HEIF/TIFF → normalized RGBA PNG (base64 JSON) the browser can use. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (!(entry instanceof File)) return Response.json({ ok: false, error: "No file" }, { status: 400 });
    if (entry.size > MAX_UPLOAD) return Response.json({ ok: false, error: "File too large" }, { status: 413 });

    const buf = Buffer.from(await entry.arrayBuffer());
    const kind = sniff(buf);

    let png: Buffer;
    if (kind === "heic") {
      // libheif WASM — sharp's prebuild has no HEVC decoder.
      try {
        // heic-convert resolves with a complete PNG buffer.
        const decoded = await (
          heicConvert as unknown as (args: { buffer: Buffer; format: "PNG" }) => Promise<Buffer>
        )({ buffer: buf, format: "PNG" });
        png = await sharp(decoded).rotate().png({ compressionLevel: 6 }).toBuffer();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json(
          { ok: false, error: `HEIC decode failed: ${msg}` },
          { status: 422 },
        );
      }
    } else {
      // TIFF & anything else the browser refused — libvips handles it.
      const image = sharp(buf, { limitInputPixels: 536_870_912 }).rotate(); // respects EXIF orientation
      try {
        png = await image.ensureAlpha().png({ compressionLevel: 6 }).toBuffer();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json({ ok: false, error: `Decode failed: ${msg}` }, { status: 422 });
      }
    }

    const meta = await sharp(png).metadata();
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    return Response.json({
      ok: true,
      width: meta.width,
      height: meta.height,
      mime: "image/png",
      dataUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: `Decode failed: ${msg}` }, { status: 500 });
  }
}

function sniff(buf: Buffer): "heic" | "other" {
  if (buf.length < 12) return "other";
  if (buf.subarray(4, 8).toString("latin1") !== "ftyp") return "other";
  const brand = buf.subarray(8, 12).toString("latin1");
  // HEVC/HEIF stills go through libheif; AVIF (avif/avis) goes to sharp instead.
  if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return "heic";
  return "other";
}
