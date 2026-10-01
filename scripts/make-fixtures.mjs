/**
 * Generates deterministic test fixtures with sharp (no network needed):
 *  - a simple "subject on busy background" scene (person silhouette)
 *  - a 5000px oversized image (downscale guard test)
 *  - a TIFF for /api/decode testing
 * Usage: npm run fixtures → public/fixtures/
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.resolve("public/fixtures");
await mkdir(outDir, { recursive: true });

const W = 900;
const H = 1200;
const scene = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7c3aed"/>
        <stop offset="1" stop-color="#059669"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="180" cy="240" r="90" fill="#0ea5e9" opacity="0.5"/>
    <circle cx="750" cy="960" r="130" fill="#f59e0b" opacity="0.45"/>
    <!-- head + shoulders silhouette -->
    <circle cx="450" cy="430" r="150" fill="#fbbf24"/>
    <path d="M 180 1200 C 180 820 330 640 450 640 C 570 640 720 820 720 1200 Z" fill="#fbbf24"/>
    <circle cx="450" cy="430" r="150" stroke="#b45309" stroke-width="8" fill="none"/>
  </svg>`
);
await writeFile(path.join(outDir, "subject.png"), await sharp(scene).png().toBuffer());
await writeFile(path.join(outDir, "subject.jpg"), await sharp(scene).jpeg({ quality: 92 }).toBuffer());
await writeFile(path.join(outDir, "subject.webp"), await sharp(scene).webp({ quality: 92 }).toBuffer());

// oversized image (5000×4000) to exercise the downscale guard
const big = Buffer.from(
  `<svg width="5000" height="4000" xmlns="http://www.w3.org/2000/svg">
    <rect width="5000" height="4000" fill="#334155"/>
    <circle cx="2500" cy="2000" r="1200" fill="#e2e8f0"/>
  </svg>`
);
await writeFile(path.join(outDir, "oversized.png"), await sharp(big).png({ compressionLevel: 6 }).toBuffer());

const tiffBuf = await sharp(big).resize(800, 600).ensureAlpha().tiff().toBuffer();
await writeFile(path.join(outDir, "sample.tiff"), tiffBuf);

console.log("fixtures written to public/fixtures:");
for (const f of ["subject.png", "subject.jpg", "subject.webp", "oversized.png", "sample.tiff"]) {
  console.log("  -", f);
}

