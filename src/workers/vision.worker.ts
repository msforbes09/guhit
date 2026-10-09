import {
  AutoModelForVision2Seq,
  AutoProcessor,
  AutoTokenizer,
  CLIPVisionModelWithProjection,
  Florence2ForConditionalGeneration,
  RawImage,
} from "@huggingface/transformers";
import { decodeLabels, pickLabel } from "@/lib/ai/light-eyes";
import type { ModelSource } from "@/lib/ai/model-fetch";
import { configureTransformers, type FileProgress } from "./ort-env";

/** Florence-2's short caption task: one sentence naming the main subject. */
const DEFAULT_TASK = "<CAPTION>";
/** The model sees 768×768; anything larger only costs decode time. */
const MAX_SIDE = 768;
/** The light eyes see 256×256; a little more keeps thin crayon lines from aliasing on the way down. */
const LIGHT_SIDE = 448;
/** White margin around the cut-out, so wings and tails touching the crop edge stay in view. */
const MARGIN = 0.12;
/**
 * Paper kept around the character in the original photo. Captions were more
 * accurate with the drawing smaller in frame (a tight crop made Tala "a purple
 * cat"; the whole photo gave "a purple animal with wings").
 */
const PHOTO_MARGIN = 0.3;

export type VisionRequest =
  | {
      type: "load";
      model: string;
      device: "webgpu" | "wasm";
      dtype: Record<string, string>;
      modelHost: string | null;
      /** Where downloads come from (see model-fetch.ts). */
      source: ModelSource;
    }
  | {
      type: "describe";
      id: number;
      image: Blob;
      /** Set for an original photo: caption just this region of it. Unset for a cut-out with transparency. */
      crop?: { x: number; y: number; w: number; h: number };
      /** Florence-2 task token; the short caption by default. */
      task?: string;
    };

export type VisionResponse =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; warmupMs: number }
  | { type: "result"; id: number; caption: string; ms: number; detail?: string }
  | { type: "error"; id?: number; message: string };

/** One way of turning a picture into a short description (and, for the log, how it got there). */
type Captioner = (image: RawImage, task?: string) => Promise<string | { caption: string; detail: string }>;

let captioner: Captioner | null = null;
/** The light eyes crop the centre square, so their pictures are made square (and smaller) first. */
let fit = { maxSide: MAX_SIDE, square: false };

type ProgressCallback = (p: FileProgress) => void;

interface Generator {
  generate(inputs: Record<string, unknown>): Promise<{ slice(...ranges: unknown[]): unknown }>;
}

/** Florence-2: a captioning model driven by task tokens such as "<CAPTION>". */
async function loadFlorence(model: string, options: Record<string, unknown>, progress_callback: ProgressCallback) {
  const [florence, processor, tokenizer] = (await Promise.all([
    Florence2ForConditionalGeneration.from_pretrained(model, { ...options, progress_callback }),
    AutoProcessor.from_pretrained(model, { progress_callback }),
    AutoTokenizer.from_pretrained(model, { progress_callback }),
  ])) as unknown as [
    Generator,
    {
      (image: RawImage): Promise<Record<string, unknown>>;
      construct_prompts(task: string): string[];
      post_process_generation(text: string, task: string, size: [number, number]): Record<string, string>;
    },
    {
      (text: string[]): Record<string, unknown>;
      batch_decode(ids: unknown, options: { skip_special_tokens: boolean }): string[];
    },
  ];
  return async (image: RawImage, task = DEFAULT_TASK) => {
    const visionInputs = await processor(image);
    const textInputs = tokenizer(processor.construct_prompts(task));
    const ids = await florence.generate({ ...textInputs, ...visionInputs, max_new_tokens: 40 });
    const text = tokenizer.batch_decode(ids, { skip_special_tokens: false })[0];
    return processor.post_process_generation(text, task, image.size)[task] ?? "";
  };
}

// No example answer: a model this small copies it for every picture.
const SMOLVLM_QUESTION = "What animal, person or thing is in this child's drawing? Answer in a few words.";

/** SmolVLM: a small chat model that sees images, so it can be asked exactly what we want to know. */
async function loadSmolVLM(model: string, options: Record<string, unknown>, progress_callback: ProgressCallback) {
  const [vlm, processor] = (await Promise.all([
    AutoModelForVision2Seq.from_pretrained(model, { ...options, progress_callback }),
    AutoProcessor.from_pretrained(model, { progress_callback }),
  ])) as unknown as [
    Generator,
    {
      (text: string, images: RawImage[], options: Record<string, unknown>): Promise<Record<string, unknown> & { input_ids: { dims: number[] } }>;
      apply_chat_template(messages: unknown[], options: Record<string, unknown>): string;
      batch_decode(ids: unknown, options: { skip_special_tokens: boolean }): string[];
    },
  ];
  return async (image: RawImage) => {
    const messages = [{ role: "user", content: [{ type: "image" }, { type: "text", text: SMOLVLM_QUESTION }] }];
    const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
    // One 512px tile instead of many: the drawing is a single subject and splitting costs seconds.
    const inputs = await processor(prompt, [image], { do_image_splitting: false });
    const ids = await vlm.generate({ ...inputs, max_new_tokens: 24, do_sample: false });
    const answer = ids.slice(null, [inputs.input_ids.dims.at(-1), null]);
    return processor.batch_decode(answer, { skip_special_tokens: true })[0]?.trim() ?? "";
  };
}

/**
 * The light eyes (iPhone and iPad): MobileCLIP S0's image half (46 MB, on the
 * CPU) and the subjects' embeddings that come with the app, so a guess needs
 * a fraction of Florence-2's memory. It names the closest subject or nothing.
 */
async function loadLightEyes(model: string, options: Record<string, unknown>, progress_callback: ProgressCallback) {
  const [vision, processor, { default: stored }] = (await Promise.all([
    CLIPVisionModelWithProjection.from_pretrained(model, { ...options, progress_callback }),
    AutoProcessor.from_pretrained(model, { progress_callback }),
    import("@/lib/ai/light-eyes-labels.json"),
  ])) as unknown as [
    (inputs: Record<string, unknown>) => Promise<{ image_embeds: { data: Float32Array } }>,
    (image: RawImage) => Promise<Record<string, unknown>>,
    { default: Parameters<typeof decodeLabels>[0] },
  ];
  const labels = decodeLabels(stored);
  return async (image: RawImage) => {
    const { image_embeds } = await vision(await processor(image));
    const { label, top } = pickLabel(image_embeds.data, labels);
    return { caption: label, detail: top.map(([name, share]) => `${name} ${Math.round(share * 100)}%`).join(", ") };
  };
}

const post = (message: VisionResponse) => self.postMessage(message);

/** The child's cut-out has a transparent background; the model expects a photo, so it goes onto white paper. */
async function onWhite(blob: Blob): Promise<RawImage> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, (fit.maxSide * (1 - 2 * MARGIN)) / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const pad = Math.round(Math.max(w, h) * MARGIN);
  const side = Math.max(w, h) + 2 * pad;
  const canvas = fit.square ? new OffscreenCanvas(side, side) : new OffscreenCanvas(w + 2 * pad, h + 2 * pad);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas in this browser's workers.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return new RawImage(data, canvas.width, canvas.height, 4).rgb();
}

/**
 * The original photo around the cut-out, with a little of the paper for
 * context: the model reads real pixels (lines, colours, texture) far better
 * than a cut-out pasted on white.
 */
async function photoRegion(blob: Blob, crop: { x: number; y: number; w: number; h: number }): Promise<RawImage> {
  const bitmap = await createImageBitmap(blob);
  const pad = Math.round(Math.max(crop.w, crop.h) * PHOTO_MARGIN);
  const x = Math.max(0, crop.x - pad);
  const y = Math.max(0, crop.y - pad);
  const w = Math.min(bitmap.width, crop.x + crop.w + pad) - x;
  const h = Math.min(bitmap.height, crop.y + crop.h + pad) - y;
  if (w <= 0 || h <= 0) throw new Error("The crop lies outside the photo.");
  const scale = Math.min(1, fit.maxSide / Math.max(w, h));
  const [cw, ch] = [Math.round(w * scale), Math.round(h * scale)];
  // Square for the light eyes: the photo centred on white, nothing cropped away.
  const canvas = fit.square ? new OffscreenCanvas(Math.max(cw, ch), Math.max(cw, ch)) : new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas in this browser's workers.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, x, y, w, h, (canvas.width - cw) / 2, (canvas.height - ch) / 2, cw, ch);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return new RawImage(data, canvas.width, canvas.height, 4).rgb();
}

async function caption(image: RawImage, task?: string): Promise<{ caption: string; detail?: string }> {
  if (!captioner) throw new Error("Drawing recognition is not loaded yet.");
  const result = await captioner(image, task);
  return typeof result === "string" ? { caption: result } : result;
}

self.onmessage = async (event: MessageEvent<VisionRequest>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      await configureTransformers(request.modelHost, request.source);
      const progress_callback = (p: FileProgress) => {
        if (p.status === "progress" && p.file) {
          post({ type: "progress", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
        }
      };
      const options = { device: request.device, dtype: request.dtype as never };
      if (/mobileclip/i.test(request.model)) {
        captioner = await loadLightEyes(request.model, options, progress_callback);
        fit = { maxSide: LIGHT_SIDE, square: true };
      } else {
        captioner = /smolvlm/i.test(request.model)
          ? await loadSmolVLM(request.model, options, progress_callback)
          : await loadFlorence(request.model, options, progress_callback);
      }
      // No warm-up: the model is loaded right when a drawing needs a guess and
      // freed afterwards, so a blank-page run would only add to the child's wait.
      post({ type: "ready", warmupMs: 0 });
      return;
    }

    if (request.type === "describe") {
      const started = performance.now();
      const image = request.crop ? await photoRegion(request.image, request.crop) : await onWhite(request.image);
      const { caption: text, detail } = await caption(image, request.task);
      post({ type: "result", id: request.id, caption: text, ms: performance.now() - started, detail });
    }
  } catch (error) {
    post({
      type: "error",
      id: request.type === "describe" ? request.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
