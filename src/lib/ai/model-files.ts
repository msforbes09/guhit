/**
 * The model files a device needs, named exactly as the libraries store them:
 * the Cache Storage bucket and the URL key each library looks up. Setup uses
 * it to show what is already saved and to hand the rest to Background Fetch.
 */
import type { ModelChoice } from "./device";
import { createModelFetch, r2Url, type ModelSource } from "./model-fetch";
import { findLLM, findVision, STT_DTYPES } from "./models";
import type { LoadProgress, Part } from "./types";
import { KOKORO, kokoroFiles, VOICE_CACHE, type KokoroDtype } from "./voice/voices";

type Stage = LoadProgress["stage"];

/** Transformers.js keeps every file in "transformers-cache"; WebLLM splits weights, configs and libraries. */
export type ModelCache = "transformers-cache" | "webllm/model" | "webllm/wasm" | typeof VOICE_CACHE;

export interface ModelFile {
  stage: Stage;
  cache: ModelCache;
  /** The URL the library uses as the cache key (Hugging Face, or this site's mirror). */
  key: string;
  bytes?: number;
}

/** The ONNX file Transformers.js loads for one part of a model at one precision. */
export const onnxFile = (part: string, dtype: string) => {
  const suffix: Record<string, string> = { fp32: "", fp16: "_fp16", q8: "_quantized", q4: "_q4", int8: "_int8" };
  return `onnx/${part}${suffix[dtype] ?? `_${dtype}`}.onnx`;
};

/** `remoteHost` as Transformers.js has it: "https://huggingface.co/" or the mirror's "<origin>/models/". */
/**
 * The JSON files Transformers.js reads to start each kind of model (config,
 * tokenizer, pre-processing). A download that saved only the ONNX files
 * (Chrome's background download) left a model that started online but not
 * offline: the eyes could not guess with Wi-Fi off.
 */
export const MODEL_JSON: Partial<Record<Stage, string[]>> = {
  vision: ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json"],
  stt: ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json"],
  llm: ["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json"],
};

export function transformersFiles(
  stage: Stage,
  modelId: string,
  dtype: Record<string, string>,
  remoteHost: string,
): ModelFile[] {
  const base = `${remoteHost.replace(/\/?$/, "/")}${modelId}/resolve/main/`;
  const file = (path: string): ModelFile => ({ stage, cache: "transformers-cache", key: `${base}${path}` });
  return [
    ...(MODEL_JSON[stage] ?? []).map(file),
    ...Object.entries(dtype).map(([part, precision]) => file(onnxFile(part, precision))),
  ];
}

export interface TensorCacheIndex {
  records: { dataPath: string; nbytes: number }[];
}

/** WebLLM's files for one model: `model` and `modelLib` as in its app config. */
export function webllmFiles(model: string, modelLib: string, index: TensorCacheIndex): ModelFile[] {
  let base = model.endsWith("/") ? model : `${model}/`;
  if (!/\/resolve\/.+\//.test(base)) base += "resolve/main/";
  return [
    { stage: "llm", cache: "webllm/model", key: `${base}tensor-cache.json` },
    ...index.records.map(
      (record): ModelFile => ({ stage: "llm", cache: "webllm/model", key: `${base}${record.dataPath}`, bytes: record.nbytes }),
    ),
    { stage: "llm", cache: "webllm/wasm", key: modelLib },
  ];
}

/**
 * Where to download a file from: Guhit's R2 copy when that is the source, this
 * computer's mirror for a Hugging Face key (the cut-out) when that is, else the key itself.
 */
export function fetchUrlFor(key: string, source: ModelSource, modelHost: string | null = null): string {
  if (source === "local" && modelHost && key.startsWith(HUGGING_FACE)) return `${modelHost}/${key.slice(HUGGING_FACE.length)}`;
  return (source === "r2" && r2Url(key)) || key;
}

const HUGGING_FACE = "https://huggingface.co/";

/**
 * The AI cut-out model as src/lib/alive/ai-segment.ts loads it (same id and
 * pinned revision; a test keeps them equal). It is fetched by the cut-out
 * code itself, always from Hugging Face, so its keys are Hugging Face URLs.
 */
const CUTOUT_MODEL = { id: "xrds/isnet-general-onnx-int8", revision: "71eff2372ec9c8edbc6ca637ded591423d23b65a" };
const CUTOUT_FILES = ["config.json", "preprocessor_config.json", "onnx/model_quantized.onnx"];

/** The cut-out model's Hugging Face repo id, for deleting its files with the eyes. */
export const CUTOUT_MODEL_ID = CUTOUT_MODEL.id;
/** Its download size (the 8-bit model; the two JSON files are tiny). */
export const CUTOUT_MB = 44;

/**
 * Every file the chosen models load. `readIndex` returns WebLLM's
 * tensor-cache.json (the list of weight shards), or null when it cannot be had.
 */
export async function listModelFiles(
  choice: Pick<ModelChoice, "llm" | "stt" | "sttDevice" | "vision" | "modelHost">,
  tts: { dtype: KokoroDtype; voices: readonly string[] },
  readIndex: (url: string) => Promise<TensorCacheIndex | null>,
): Promise<ModelFile[]> {
  const host = choice.modelHost ? `${choice.modelHost}/` : HUGGING_FACE;
  const files: ModelFile[] = [];

  const cpu = findLLM(choice.llm)?.cpu;
  if (cpu) {
    const llmFiles = transformersFiles("llm", choice.llm, { [cpu.file]: cpu.dtype }, host);
    const graph = llmFiles.at(-1)!;
    files.push(...llmFiles);
    // Its weights, split into files as Transformers.js names them.
    for (let i = 0; i < cpu.dataFiles; i++) files.push({ ...graph, key: `${graph.key}_data${i ? `_${i}` : ""}` });
  } else {
    const [{ prebuiltAppConfig }, { appConfigFor }] = await Promise.all([import("@mlc-ai/web-llm"), import("./llm")]);
    const config = appConfigFor(choice.llm, choice.modelHost) ?? prebuiltAppConfig;
    const record = config.model_list.find((m) => m.model_id === choice.llm);
    if (record) {
      const [indexFile] = webllmFiles(record.model, record.model_lib, { records: [] });
      const index = await readIndex(indexFile.key);
      files.push(...webllmFiles(record.model, record.model_lib, index ?? { records: [] }));
    }
  }

  files.push(...transformersFiles("stt", choice.stt, STT_DTYPES[choice.sttDevice], host));
  files.push(...transformersFiles("vision", choice.vision, findVision(choice.vision)?.dtype ?? {}, host));
  const cutout = `${HUGGING_FACE}${CUTOUT_MODEL.id}/resolve/${CUTOUT_MODEL.revision}/`;
  for (const file of CUTOUT_FILES) files.push({ stage: "vision", cache: "transformers-cache", key: cutout + file });
  // Full precision comes as a graph plus weight files, each under R2's 300 MB limit.
  for (const path of kokoroFiles(tts.dtype).paths) {
    files.push({ stage: "tts", cache: "transformers-cache", key: `${host}${KOKORO.id}/resolve/main/${path}` });
  }
  for (const voice of tts.voices) {
    files.push({ stage: "tts", cache: VOICE_CACHE, key: `${host}${KOKORO.id}/resolve/main/voices/${voice}.bin` });
  }
  return files;
}

/** The model ids whose cached files belong to a part (matched against cache keys). */
export function partModelIds(part: Part, choice: Pick<ModelChoice, "llm" | "stt" | "vision">): string[] {
  if (part === "eyes") return [choice.vision, CUTOUT_MODEL_ID];
  if (part === "voice") return [KOKORO.id];
  if (part === "ears") return [choice.stt];
  // WebLLM's library file is named after the model without "-MLC".
  return [choice.llm, choice.llm.replace(/-MLC$/, "")];
}

const MODEL_CACHES = ["transformers-cache", "webllm/model", "webllm/config", "webllm/wasm", VOICE_CACHE];

/** Deletes every cached file of these models (any precision), freeing their storage. */
export async function deleteModelFiles(modelIds: string[]): Promise<number> {
  if (typeof caches === "undefined") return 0;
  let deleted = 0;
  for (const name of MODEL_CACHES) {
    if (!(await caches.has(name))) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (modelIds.some((id) => request.url.includes(id)) && (await cache.delete(request))) deleted++;
    }
  }
  return deleted;
}

/**
 * Stores the AI cut-out model where the cut-out code looks for it, so it works
 * offline without ever having been tried online. Files already there are kept.
 */
export async function storeCutoutModel(source: ModelSource, modelHost: string | null): Promise<void> {
  const cache = await caches.open("transformers-cache");
  const path = `${CUTOUT_MODEL.id}/resolve/${CUTOUT_MODEL.revision}/`;
  const download = createModelFetch({ source });
  for (const file of CUTOUT_FILES) {
    const key = HUGGING_FACE + path + file;
    if (await cache.match(key)) continue;
    // This computer's mirror serves it too; the key stays the Hugging Face URL the cut-out code reads.
    const response = await download(source === "local" && modelHost ? `${modelHost}/${path}${file}` : key);
    if (!response.ok) throw new Error(`${file}: ${response.status}`);
    await cache.put(key, response);
  }
}

/** WebLLM's shard list: from its cache when it was saved before, else downloaded (it is a few KB). */
export async function readTensorIndex(url: string, source: ModelSource): Promise<TensorCacheIndex | null> {
  try {
    const cached = await (await caches.open("webllm/model")).match(url);
    if (cached) return await cached.json();
    const response = await createModelFetch({ source })(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Which files are already saved on this device, with their sizes. */
export async function savedFiles(files: ModelFile[]): Promise<{ file: ModelFile; bytes: number }[]> {
  if (typeof caches === "undefined") return [];
  const saved: { file: ModelFile; bytes: number }[] = [];
  const opened = new Map<string, Cache>();
  for (const file of files) {
    try {
      let cache = opened.get(file.cache);
      if (!cache) opened.set(file.cache, (cache = await caches.open(file.cache)));
      const hit = await cache.match(file.key);
      if (hit) saved.push({ file, bytes: file.bytes ?? (Number(hit.headers.get("Content-Length")) || 0) });
    } catch {
      // Unreadable cache entry: counted as not saved, so it is downloaded again.
    }
  }
  return saved;
}
