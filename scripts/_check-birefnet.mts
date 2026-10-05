import { readFile } from "node:fs/promises";
import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";

const LOCAL_DIR = "/tmp/opencode/birefnet-local";
env.allowRemoteModels = false;

const t0 = Date.now();
console.log("loading model from", LOCAL_DIR);
const model = await AutoModel.from_pretrained(LOCAL_DIR, { dtype: "fp16", device: "cpu" });
const processor = await AutoProcessor.from_pretrained(LOCAL_DIR);
console.log("loaded in", ((Date.now() - t0) / 1000).toFixed(1), "s");

const bytes = await readFile("public/fixtures/subject.png");
const image = await RawImage.fromBlob(new Blob([bytes], { type: "image/png" }));
console.log("image", image.width, "x", image.height, "channels", image.channels);

const t1 = Date.now();
const { pixel_values } = await processor(image);
const { output_image } = await model({ input_image: pixel_values });
const logits = (output_image as unknown as import("@huggingface/transformers").Tensor[])[0];
const rawMask = await RawImage.fromTensor(logits.sigmoid().mul(255).to("uint8"));
const mask = await rawMask.resize(image.width, image.height);
console.log("inference", ((Date.now() - t1) / 1000).toFixed(1), "s");
console.log("mask", mask.width, "x", mask.height, "channels", mask.channels, "len", mask.data.length);

let min = 255;
let max = 0;
let sum = 0;
for (const v of mask.data) {
  if (v < min) min = v;
  if (v > max) max = v;
  sum += v;
}
console.log("alpha min", min, "max", max, "mean", (sum / mask.data.length).toFixed(1));
console.log(min === 0 && max > 200 ? "PASS: mask looks like a valid alpha matte" : "SUSPICIOUS: check mask");
