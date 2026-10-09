import type { ModelSource } from "./model-fetch";
import { lightEyesChosen } from "./guess-guard";
import { CPU_LLM, LIGHT_VISION, LLM_MODELS, STT_MODELS, VISION_MODELS, type STTDevice } from "./models";

export interface DeviceSupport {
  webgpu: boolean;
  shaderF16: boolean;
  mobile: boolean;
}

export interface ModelChoice {
  llm: string;
  stt: string;
  sttDevice: STTDevice;
  vision: string;
  visionDevice: STTDevice;
  /** Florence-2 caption task; "?visionTask=detailed|more" lets /lab compare the longer ones. */
  visionTask: string;
  /** This site's own /models mirror when chosen, else null (the libraries use Hugging Face URLs). */
  modelHost: string | null;
  /** Where downloads come from (see model-fetch.ts). */
  source: ModelSource;
}

const SOURCE_KEY = "guhit:models";

/**
 * Default: Guhit's R2 copy with Hugging Face as the per-file fallback.
 * "?models=local" uses the site's own /models mirror (scripts/mirror-models.mjs),
 * "?models=hf" only Hugging Face; "?models=r2" goes back to the default. The
 * choice is remembered because the local mirror's cached files have other keys.
 */
function chooseSource(params: URLSearchParams): ModelSource {
  try {
    const value = params.get("models");
    if (value === "local" || value === "hf") localStorage.setItem(SOURCE_KEY, value);
    if (value === "r2" || value === "hub") localStorage.removeItem(SOURCE_KEY);
    const saved = localStorage.getItem(SOURCE_KEY);
    return saved === "local" || saved === "hf" ? saved : "r2";
  } catch {
    return "r2";
  }
}

interface GPUAdapterLike {
  features: { has(feature: string): boolean };
}
interface GPULike {
  requestAdapter(options?: { powerPreference?: string }): Promise<GPUAdapterLike | null>;
}

let cached: Promise<DeviceSupport> | null = null;

/** iPhone or iPad: every browser there is WebKit, which cannot download in the background. */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isMobile(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  // iPadOS reports itself as a Mac; isAppleMobile tells it by its touch support.
  return /Android|Mobile/i.test(navigator.userAgent) || isAppleMobile();
}

export function detectSupport(): Promise<DeviceSupport> {
  if (!cached) cached = probeSupport();
  return cached;
}

const GPU_KEY = "guhit:gpu";

/** "?gpu=off" runs Guhit as on a computer without a usable GPU (remembered until "?gpu=on"), for /lab. */
function gpuSwitchedOff(): boolean {
  try {
    const value = new URLSearchParams(window.location.search).get("gpu");
    if (value === "off") localStorage.setItem(GPU_KEY, "off");
    if (value === "on") localStorage.removeItem(GPU_KEY);
    return localStorage.getItem(GPU_KEY) === "off";
  } catch {
    return false;
  }
}

const LLM_CPU_KEY = "guhit:llm-cpu";

/** WebLLM's errors for a GPU it cannot use (as opposed to a broken download or running out of memory). */
export const isGpuError = (message: string) =>
  /compatible GPU|WebGPU is not supported|Cannot find WebGPU|requires feature|requires WebGPU extension/i.test(message);

/**
 * The page found a GPU but WebLLM, in its worker, could not use it (seen on a
 * Windows laptop): from now on this device runs the story helper on the CPU.
 * The other models keep their GPU, where they already work.
 */
export function rememberLLMOnCpu() {
  try {
    localStorage.setItem(LLM_CPU_KEY, "1");
  } catch {
    // Blocked storage: the fallback then happens again on the next load.
  }
}

function llmOnCpu(): boolean {
  try {
    return localStorage.getItem(LLM_CPU_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The device's tier, by what its browser really offers: a WebGPU adapter (and
 * whether it does 16-bit floats) means the GPU tier; no WebGPU, no adapter or
 * a GPU that fails to start means the CPU tier, which is slower but works.
 */
export async function probeSupport(): Promise<DeviceSupport> {
  const mobile = isMobile();
  const cpuTier: DeviceSupport = { webgpu: false, shaderF16: false, mobile };
  const gpu = (navigator as Navigator & { gpu?: GPULike }).gpu;
  if (!gpu || gpuSwitchedOff()) return cpuTier;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return cpuTier;
    return { webgpu: true, shaderF16: adapter.features.has("shader-f16"), mobile };
  } catch {
    return cpuTier;
  }
}

/**
 * Laptops get the larger model, which writes better; phones get a small one
 * that fits their memory. GPUs without 16-bit float support need the f32
 * build. "?llm=", "?stt=" and "?sttDevice=" override the choice so /lab can
 * compare models without a code change.
 */
export function chooseModels(support: DeviceSupport, search = ""): ModelChoice {
  const params = new URLSearchParams(search);
  const size = support.mobile ? "0.6B" : "1.7B";
  const precision = support.shaderF16 ? "q4f16_1" : "q4f32_1";
  // No usable GPU: the story helper runs on the CPU (slower, but it works).
  let llm = support.webgpu && !llmOnCpu() ? `Qwen3-${size}-${precision}-MLC` : CPU_LLM;
  const llmOverride = params.get("llm");
  if (llmOverride && LLM_MODELS.some((m) => m.id === llmOverride)) llm = llmOverride;

  let stt = STT_MODELS[0].id;
  const sttOverride = params.get("stt");
  if (sttOverride && STT_MODELS.some((m) => m.id === sttOverride)) stt = sttOverride;

  let sttDevice: STTDevice = support.webgpu ? "webgpu" : "wasm";
  const deviceOverride = params.get("sttDevice");
  if (deviceOverride === "wasm" || deviceOverride === "webgpu") sttDevice = deviceOverride;

  // Florence-2 large named every test drawing right (base called Tala "a purple
  // cat"); phones keep base for memory and download size.
  // Base everywhere: large's vision encoder is a single 316 MB file, over R2's
  // 300 MB upload limit (and three times the work); /lab can still try it.
  // iPhone and iPad (and a device whose full-eyes guess was cut short) get the
  // light eyes: iOS killed the page during Florence-2's guess.
  let vision = isAppleMobile() || lightEyesChosen() ? LIGHT_VISION : "onnx-community/Florence-2-base-ft";
  const visionOverride = params.get("vision");
  if (visionOverride && VISION_MODELS.some((m) => m.id === visionOverride)) vision = visionOverride;
  // The light eyes run on the CPU: small enough, and no GPU buffers on top of the page.
  const visionDevice: STTDevice =
    vision !== LIGHT_VISION && support.webgpu && params.get("visionDevice") !== "wasm" ? "webgpu" : "wasm";

  const tasks: Record<string, string> = {
    caption: "<CAPTION>",
    detailed: "<DETAILED_CAPTION>",
    more: "<MORE_DETAILED_CAPTION>",
  };
  const visionTask = tasks[params.get("visionTask") ?? ""] ?? tasks.caption;

  const source = chooseSource(params);
  const modelHost = source === "local" ? `${window.location.origin}/models` : null;
  return { llm, stt, sttDevice, vision, visionDevice, visionTask, modelHost, source };
}
