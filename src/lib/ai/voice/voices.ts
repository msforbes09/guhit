import type { Accent } from "./phonemize";

export type VoiceRole = "narrator" | "character";
export type TTSDevice = "webgpu" | "wasm";

/**
 * Kokoro-82M v1.0 (Apache-2.0, weights and voices) as converted to ONNX by
 * onnx-community. WebGPU runs the full-precision file: Kokoro's fp16 and
 * 4-bit builds sound noticeably worse there, and the 8-bit one is slow on
 * GPUs. The CPU fallback (phones) runs the 8-bit file, the fastest on wasm;
 * the repo's "q4" build is larger than 8-bit, so it is no help on phones.
 */
export const KOKORO = {
  id: "onnx-community/Kokoro-82M-v1.0-ONNX",
  sampleRate: 24000,
  dtype: { webgpu: "fp32", wasm: "q8" } as Record<TTSDevice, "fp32" | "q8">,
  /** Model file plus tokenizer and config, from the Hugging Face repo listing. */
  modelMB: { webgpu: 325.5, wasm: 92.4 } as Record<TTSDevice, number>,
  /** Each voice is a 510×256 float32 style table. */
  voiceMB: 0.52,
} as const;

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
}

/**
 * Chosen by the voice card grades and the stability measurements in /lab:
 * the narrator is the warmest voice at a slightly unhurried pace; the
 * character is the brightest graded voice, a touch quicker so the drawing
 * sounds like its own playful little person.
 */
export const DEFAULT_STYLES: Record<VoiceRole, VoiceStyle> = {
  narrator: { voice: "af_heart", speed: 0.95 },
  character: { voice: "af_bella", speed: 1.08 },
};

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
    if (saved && typeof saved.voice === "string" && findVoice(saved.voice) && typeof saved.speed === "number") {
      return { voice: saved.voice, speed: Math.min(1.3, Math.max(0.7, saved.speed)) };
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

/** Every voice the app may use offline is downloaded with the model, so /lab can switch with Wi-Fi off. */
export const PRELOADED_VOICES = KOKORO_VOICES.map((v) => v.id);

/**
 * WebGPU on laptops, the CPU (wasm) on phones; "?ttsDevice=wasm|webgpu"
 * overrides it so /lab can measure the phone path on a laptop.
 */
export function chooseTTSDevice(support: { webgpu: boolean; mobile: boolean }, search = ""): TTSDevice {
  const override = new URLSearchParams(search).get("ttsDevice");
  if (override === "wasm" || override === "webgpu") return override;
  return support.webgpu && !support.mobile ? "webgpu" : "wasm";
}
