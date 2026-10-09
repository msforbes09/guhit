import type { ModelSource } from "./model-fetch";
import { LLM_MODELS, STT_MODELS, VISION_MODELS, type STTDevice } from "./models";

export interface DeviceSupport {
  webgpu: boolean;
  shaderF16: boolean;
  mobile: boolean;
  /** Friendly explanation when this device cannot run the on-device AI. */
  problem?: string;
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

function isMobile(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function detectSupport(): Promise<DeviceSupport> {
  if (!cached) cached = probe();
  return cached;
}

async function probe(): Promise<DeviceSupport> {
  const mobile = isMobile();
  const gpu = (navigator as Navigator & { gpu?: GPULike }).gpu;
  const missing = (problem: string): DeviceSupport => ({ webgpu: false, shaderF16: false, mobile, problem });
  if (!gpu) {
    return missing(
      "This browser can't run Guhit's story helper because WebGPU is missing. Please use the latest Chrome or Edge on a laptop, or Chrome on a recent Android phone.",
    );
  }
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      return missing(
        "WebGPU is on, but no graphics chip is available to it. Restart the browser, or check that hardware acceleration is enabled in the browser settings.",
      );
    }
    return { webgpu: true, shaderF16: adapter.features.has("shader-f16"), mobile };
  } catch {
    return missing("WebGPU failed to start on this device. Please try the latest Chrome on a laptop.");
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
  let llm = `Qwen3-${size}-${precision}-MLC`;
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
  let vision = support.mobile ? "onnx-community/Florence-2-base-ft" : "onnx-community/Florence-2-large-ft";
  const visionOverride = params.get("vision");
  if (visionOverride && VISION_MODELS.some((m) => m.id === visionOverride)) vision = visionOverride;
  const visionDevice: STTDevice = support.webgpu && params.get("visionDevice") !== "wasm" ? "webgpu" : "wasm";

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
