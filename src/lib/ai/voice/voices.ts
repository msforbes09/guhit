import type { Accent } from "./phonemize";

export type VoiceRole = "narrator" | "character";
export type TTSDevice = "webgpu" | "wasm";
/** Precisions of the Kokoro ONNX export; /lab can try the others with "?ttsDtype=". */
export type KokoroDtype = "fp32" | "fp16" | "q8" | "q4f16";
const DTYPES: KokoroDtype[] = ["fp32", "fp16", "q8", "q4f16"];

/**
 * Kokoro-82M v1.0 (Apache-2.0, weights and voices) as converted to ONNX by
 * onnx-community. Laptops with WebGPU run the full-precision file on the GPU
 * (fp16 produced invalid audio there, and 8-bit is slow on GPUs); everything
 * else runs the 8-bit file on the CPU (wasm), the fastest there. The repo's
 * "q4" build is larger than 8-bit, so it is no help.
 */
export const KOKORO = {
  id: "onnx-community/Kokoro-82M-v1.0-ONNX",
  sampleRate: 24000,
  dtype: { webgpu: "fp32", wasm: "q8" } as Record<TTSDevice, KokoroDtype>,
  /** Model files plus tokenizer and config, from the Hugging Face repo listing. */
  modelMB: { webgpu: 325.6, wasm: 92.4 } as Record<TTSDevice, number>,
  /** Each voice is a 510×256 float32 style table. */
  voiceMB: 0.52,
} as const;

const SUFFIX: Record<KokoroDtype, string> = { fp32: "", fp16: "_fp16", q8: "_quantized", q4f16: "_q4f16" };

/**
 * The ONNX file Transformers.js loads for a precision (`name`, its
 * model_file_name) and the weight files beside it (`dataFiles`, its
 * use_external_data_format). The full-precision file (325 MB) is over R2's
 * 300 MB upload limit, so scripts/split-onnx.py splits it into a graph and two
 * weight files under the name "model_chunked".
 */
export function kokoroFiles(dtype: KokoroDtype): { name: string; dataFiles: number; paths: string[] } {
  const name = dtype === "fp32" ? "model_chunked" : "model";
  const dataFiles = dtype === "fp32" ? 2 : 0;
  const graph = `onnx/${name}${SUFFIX[dtype]}.onnx`;
  const data = Array.from({ length: dataFiles }, (_, i) => `${graph}_data${i ? `_${i}` : ""}`);
  return { name, dataFiles, paths: [graph, ...data] };
}

/** The voice worker keeps the voice style tables in this Cache Storage bucket. */
export const VOICE_CACHE = "kokoro-voices";

export interface KokoroVoice {
  id: string;
  name: string;
  accent: Accent;
  /** Overall grade from the Kokoro voice card (hexgrad/Kokoro-82M VOICES.md). */
  grade: string;
  note: string;
}

/** English female voices that suit a children's app; graded voices only. */
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: "af_heart", name: "Heart", accent: "us", grade: "A", note: "warm, gentle, the best-graded voice" },
  { id: "af_bella", name: "Bella", accent: "us", grade: "A-", note: "bright and lively" },
  { id: "af_nicole", name: "Nicole", accent: "us", grade: "B-", note: "soft, close-mic (whispery)" },
  { id: "af_aoede", name: "Aoede", accent: "us", grade: "C+", note: "clear, even" },
  { id: "af_kore", name: "Kore", accent: "us", grade: "C+", note: "clear, even" },
  { id: "af_sarah", name: "Sarah", accent: "us", grade: "C+", note: "clear, a little flat" },
  { id: "af_nova", name: "Nova", accent: "us", grade: "C", note: "crisp" },
  { id: "af_sky", name: "Sky", accent: "us", grade: "C-", note: "light, younger-sounding" },
  { id: "bf_emma", name: "Emma", accent: "gb", grade: "B-", note: "British, clear storyteller" },
];

export const findVoice = (id: string) => KOKORO_VOICES.find((v) => v.id === id);

export interface VoiceStyle {
  voice: string;
  /** Kokoro's speed input: 1 is the voice's natural pace. */
  speed: number;
  /**
   * Playback rate of the finished audio: above 1 lifts the pitch (and the
   * pace by the same factor). Kokoro has no pitch input; 1.05 is one semitone.
   */
  pitch: number;
}

/**
 * Chosen by the voice card grades and the stability measurements in /lab:
 * the narrator is the warmest voice at a slightly unhurried pace; the
 * character is the brightest graded voice, a touch quicker so the drawing
 * sounds like its own playful little person.
 */
export const DEFAULT_STYLES: Record<VoiceRole, VoiceStyle> = {
  narrator: { voice: "af_heart", speed: 0.95, pitch: 1 },
  character: { voice: "af_bella", speed: 1.03, pitch: 1.05 },
};

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export type VoiceEngine = "kokoro" | "builtin";

const ENGINE_KEY = "guhit:voice";
const styleKey = (role: VoiceRole) => `guhit:voice:${role}`;

/** The engine picked in /lab ("kokoro" unless the owner switched to the built-in voice). */
export function preferredEngine(): VoiceEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === "builtin" ? "builtin" : "kokoro";
  } catch {
    return "kokoro";
  }
}

export function setPreferredEngine(engine: VoiceEngine) {
  try {
    if (engine === "kokoro") localStorage.removeItem(ENGINE_KEY);
    else localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
}

export function styleFor(role: VoiceRole): VoiceStyle {
  try {
    const saved = JSON.parse(localStorage.getItem(styleKey(role)) ?? "null") as Partial<VoiceStyle> | null;
    const fallback = DEFAULT_STYLES[role];
    if (saved && typeof saved.voice === "string" && findVoice(saved.voice)) {
      return {
        voice: saved.voice,
        speed: clamp(saved.speed, 0.7, 1.3, fallback.speed),
        pitch: clamp(saved.pitch, 0.9, 1.15, fallback.pitch),
      };
    }
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_STYLES[role];
}

export function setStyle(role: VoiceRole, style: VoiceStyle | null) {
  try {
    if (style) localStorage.setItem(styleKey(role), JSON.stringify(style));
    else localStorage.removeItem(styleKey(role));
  } catch {
    // Blocked storage: the default voice is used.
  }
}

const SLOW_KEY = "guhit:voice-slow";

function slowVoices(): Partial<Record<TTSDevice, number>> {
  try {
    const saved = JSON.parse(localStorage.getItem(SLOW_KEY) ?? "null") as Record<string, unknown> | null;
    if (!saved) return {};
    // Older versions kept one device: { device, rtf }.
    if (typeof saved.device === "string" && typeof saved.rtf === "number") return { [saved.device]: saved.rtf };
    return Object.fromEntries(
      Object.entries(saved).filter(([device, rtf]) => (device === "webgpu" || device === "wasm") && typeof rtf === "number"),
    );
  } catch {
    return {};
  }
}

/**
 * A device where Kokoro measured slower than speech is remembered, so later
 * app starts skip loading it there (on a phone that is ~10 s and ~300 MB of
 * memory for nothing). Choosing Kokoro in /lab forgets it and measures again.
 */
export function slowVoiceMeasured(device: TTSDevice): number | null {
  return slowVoices()[device] ?? null;
}

/** `device` null forgets every device. */
export function rememberSlowVoice(device: TTSDevice | null, rtf: number | null) {
  try {
    const next = device ? { ...slowVoices(), [device]: rtf ?? undefined } : {};
    if (Object.values(next).every((value) => value === undefined)) localStorage.removeItem(SLOW_KEY);
    else localStorage.setItem(SLOW_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: it is measured again next time.
  }
}

/** Every voice the app may use offline is downloaded with the model, so /lab can switch with Wi-Fi off. */
export const PRELOADED_VOICES = KOKORO_VOICES.map((v) => v.id);

/** The precision for a device; "?ttsDtype=" lets /lab try the others. */
export function chooseTTSDtype(device: TTSDevice, search = ""): KokoroDtype {
  const override = new URLSearchParams(search).get("ttsDtype") as KokoroDtype | null;
  return override && DTYPES.includes(override) ? override : KOKORO.dtype[device];
}

/**
 * WebGPU on laptops that have it, the CPU (wasm) everywhere else;
 * "?ttsDevice=wasm|webgpu" overrides it so /lab can measure one path alone.
 */
export function chooseTTSDevice(support: { webgpu: boolean; mobile: boolean }, search = ""): TTSDevice {
  return chooseTTSDevices(support, search)[0];
}

/**
 * The devices to try in order: a laptop whose GPU cannot start the voice, or
 * runs it slower than speech, tries the CPU next. An override tries only that one.
 */
export function chooseTTSDevices(support: { webgpu: boolean; mobile: boolean }, search = ""): TTSDevice[] {
  const override = new URLSearchParams(search).get("ttsDevice");
  if (override === "wasm" || override === "webgpu") return [override];
  return support.webgpu && !support.mobile ? ["webgpu", "wasm"] : ["wasm"];
}
