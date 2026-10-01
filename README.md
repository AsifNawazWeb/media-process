# Cutout Studio

On-device background removal and format conversion for images, built with Next.js. Drop in a batch of photos, get clean cutouts on a transparent or solid background, and export them as PNG, WebP, JPG, or AVIF — individually or as a single ZIP.

The segmentation model runs entirely in the browser via WebAssembly, so images are never uploaded to a third party.

## Features

- **AI background removal** — ISNet segmentation via `@imgly/background-removal` and ONNX Runtime Web.
- **Batch queue** — drag & drop, file picker, or clipboard paste; items process one at a time with per-stage progress.
- **Wide input support** — PNG, JPG, WebP, HEIC/HEIF, and TIFF.
- **Flexible output** — PNG, WebP, JPG, and AVIF, with a quality slider for lossy formats.
- **Background styling** — transparent, white, black, red, blue, studio gray, or a custom hex color.
- **Model choice** — Balanced (`isnet_fp16`, ~88 MB) or Fast (`isnet_quint8`, ~44 MB).
- **Comparison tools** — result view, side-by-side, and draggable split slider, with zoom and pan.
- **Batch export** — download a single result or all ready images as a ZIP.
- **Persisted settings** — background, format, quality, and model survive reloads (localStorage).

## How it works

Each image moves through a four-stage pipeline (`lib/pipeline.ts`, `lib/processor.ts`):

1. **Decode** — native `createImageBitmap` for PNG/JPG/WebP. HEIC/HEIF and TIFF are normalized to RGBA PNG by `POST /api/decode` (`heic-convert` for HEVC stills, `sharp` for TIFF and other browser-unfriendly containers).
2. **Matte** — the selected ISNet model produces an RGBA cutout in the browser via WebAssembly.
3. **Compose** — the cutout is composited over the chosen background on a canvas (or kept transparent).
4. **Encode** — PNG/JPG/WebP are encoded in-browser via canvas; AVIF (and any canvas fallback) is encoded by `POST /api/export` using `sharp`.

All client/server traffic goes through `lib/bridge.ts`, which is intentionally IPC-shaped so it can be swapped for an Electron port without touching the pipeline.

## Requirements

- Node.js **20.9+** (Next.js 16 requirement)
- `tar` available on `PATH` (used once by `npm run setup:model`)

## Getting started

```bash
npm install
npm run setup:model   # one-time: vendor AI model + WASM assets into public/imgly
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`setup:model` downloads the model data tarball matching your installed `@imgly/background-removal` version and extracts the `isnet_fp16` and `isnet_quint8` models plus the ONNX Runtime WASM shards into `public/imgly/` (~160 MB). These assets are gitignored because of their size; if they are missing, the empty state shows a warning with a **Preload model** prompt. Re-run the script with `--force` (or `npm run setup:model -- --force`) after upgrading the library.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run setup:model` | Vendor model/WASM assets into `public/imgly` |
| `npm run fixtures` | Generate deterministic test images in `public/fixtures` |

## API routes

| Route | Purpose |
| --- | --- |
| `POST /api/decode` | HEIC/HEIF/TIFF → normalized RGBA PNG (base64 JSON) |
| `POST /api/export` | Encode to PNG/WebP/JPG/AVIF with `sharp`; used for AVIF and canvas fallbacks |
| `GET /api/health` | `sharp`/`libvips` versions and supported input formats |

## Project structure

```
app/                 Next.js App Router pages, layout, and API routes
components/          UI: Header, Toolbar, QueueList, DropZone, ResultView, Toasts, ModelWarmup
lib/
  ai.ts              @imgly/background-removal wrapper (lazy-loaded)
  bridge.ts          The only module that calls server endpoints
  pipeline.ts        decode → matte → compose → encode primitives
  processor.ts       Single-flight queue pump, stage progress, recompose coalescing
  exporter.ts        Single save and batch ZIP export
  blobcache.ts       In-memory blob store keyed by id
  queue-store.ts     Zustand queue state (items, toasts)
  settings-store.ts  Zustand persisted settings
  types.ts           Shared types and defaults
scripts/
  vendor-model.mjs   Model asset vendoring (npm run setup:model)
  make-fixtures.mjs  Test fixture generation (npm run fixtures)
public/imgly/        Vendored model shards (gitignored, generated)
```

## Limits and notes

- Images above 24 MP or 4096 px on the long edge are downscaled before processing; the result view flags when this happened.
- JPG has no alpha channel, so transparent backgrounds are flattened onto white when exporting to JPG.
- Large images can exceed the server encode path; AVIF export is limited to roughly 220 MB of request body.
- The app serves cross-origin isolation headers (`COOP`/`COEP`) so `SharedArrayBuffer` enables multithreaded WASM segmentation.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Zustand · `@imgly/background-removal` · `onnxruntime-web` · `sharp` · `heic-convert` · JSZip · file-saver · lucide-react
