"use client";

/**
 * BiRefNet_lite matting engine (transformers.js + ONNX Runtime Web).
 *
 * Model weights are downloaded from the public Hugging Face Hub on first use
 * and cached by the browser; inference runs entirely on-device (WebGPU when
 * available, WASM fallback). Images never leave the browser.
 */

export type ModelProgressCb = (key: string, current: number, total: number) => void;

type Tensor = import("@huggingface/transformers").Tensor;
type RawImage = import("@huggingface/transformers").RawImage;
type RawImageCtor = typeof import("@huggingface/transformers").RawImage;

const MODEL_ID = "onnx-community/BiRefNet_lite-ONNX";

interface BirefnetOutput {
  output_image: Tensor;
}

type BirefnetModel = (inputs: { input_image: Tensor }) => Promise<BirefnetOutput>;
type BirefnetProcessor = (image: RawImage) => Promise<{ pixel_values: Tensor }>;

interface Engine {
  model: BirefnetModel;
  processor: BirefnetProcessor;
  RawImage: RawImageCtor;
}

let enginePromise: Promise<Engine> | null = null;

/** WebGPU availability decides the execution provider (and speed). */
export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Load (once) the BiRefNet_lite model + processor. Safe to call repeatedly. */
export function loadBirefnet(onProgress?: ModelProgressCb): Promise<Engine> {
  enginePromise ??= (async () => {
    const { AutoModel, AutoProcessor, RawImage } = await import("@huggingface/transformers");
    const progress_callback = onProgress
      ? (p: { status: string; file?: string; progress?: number }) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            onProgress(`fetch:${p.file ?? MODEL_ID}`, p.progress, 100);
          }
        }
      : undefined;
    const options = {
      dtype: "fp32" as const,
      device: hasWebGPU() ? ("webgpu" as const) : ("wasm" as const),
      progress_callback,
    };
    const model = (await AutoModel.from_pretrained(
      MODEL_ID,
      options,
    )) as unknown as BirefnetModel;
    const processor = (await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback,
    })) as unknown as BirefnetProcessor;
    return { model, processor, RawImage };
  })().catch((err) => {
    enginePromise = null; // allow a retry after a network/runtime failure
    throw err;
  });
  return enginePromise;
}

/** Warm the model cache without running inference. */
export async function preloadBirefnet(onProgress?: ModelProgressCb): Promise<void> {
  await loadBirefnet(onProgress);
}

/** BiRefNet_lite alpha matte → RGBA PNG cutout (same contract as the imgly matte). */
export async function birefnetMatte(input: Blob, onProgress?: ModelProgressCb): Promise<Blob> {
  const { model, processor, RawImage } = await loadBirefnet(onProgress);
  const image = await RawImage.fromBlob(input);
  const { pixel_values } = await processor(image);
  const { output_image } = await model({ input_image: pixel_values });
  // The tensor proxy supports indexing at runtime (batch dim → [1, H, W]).
  const logits = (output_image as unknown as Tensor[])[0];
  const rawMask = await RawImage.fromTensor(logits.sigmoid().mul(255).to("uint8"));
  const mask = await rawMask.resize(image.width, image.height);
  return composite(image, mask);
}

/** Multiply the source RGB by the predicted alpha and encode as PNG. */
function composite(image: RawImage, mask: RawImage): Promise<Blob> {
  const { width, height, channels, data } = image;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const alpha = mask.data;
  for (let i = 0, j = 0; i < width * height; i++, j += 4) {
    const s = i * channels;
    rgba[j] = data[s];
    rgba[j + 1] = data[s + 1];
    rgba[j + 2] = data[s + 2];
    const a = alpha[i];
    rgba[j + 3] = channels === 4 ? Math.round((data[s + 3] * a) / 255) : a;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode cutout"))),
      "image/png",
    );
  });
}
