/**
 * The model files a device needs, named exactly as the libraries store them:
 * the Cache Storage bucket and the URL key each library looks up. Setup uses
 * it to show what is already saved and to hand the rest to Background Fetch.
 */
import type { ModelChoice } from "./device";
import { createModelFetch, r2Url, type ModelSource } from "./model-fetch";
import { findLLM, findVision, STT_DTYPES } from "./models";
import type { LoadProgress } from "./types";
import { KOKORO, VOICE_CACHE, type KokoroDtype } from "./voice/voices";

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
export function transformersFiles(
  stage: Stage,
  modelId: string,
  dtype: Record<string, string>,
  remoteHost: string,
): ModelFile[] {
  const base = `${remoteHost.replace(/\/?$/, "/")}${modelId}/resolve/main/`;
  return Object.entries(dtype).map(([part, precision]) => ({
    stage,
    cache: "transformers-cache",
    key: `${base}${onnxFile(part, precision)}`,
  }));
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

/** Where to download a file from: Guhit's R2 copy when that is the source, else the key itself. */
export function fetchUrlFor(key: string, source: ModelSource): string {
  return (source === "r2" && r2Url(key)) || key;
}

const HUGGING_FACE = "https://huggingface.co/";

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
    files.push(...transformersFiles("llm", choice.llm, { model: cpu.dtype }, host));
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
  files.push(...transformersFiles("tts", KOKORO.id, { model: tts.dtype }, host));
  for (const voice of tts.voices) {
    files.push({ stage: "tts", cache: VOICE_CACHE, key: `${host}${KOKORO.id}/resolve/main/voices/${voice}.bin` });
  }
  return files;
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
