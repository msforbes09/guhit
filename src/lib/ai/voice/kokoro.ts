import type { TTSRequest, TTSResponse } from "@/workers/tts.worker";
import { ModelWorker } from "../model-worker";
import { isTransformersModelCached } from "../offline";
import { KOKORO, styleFor, VOICE_CACHE, type KokoroDtype, type TTSDevice } from "./voices";

/** True when the model for this device and the two voices in use are already stored. */
export async function isKokoroCached(device: TTSDevice): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  if (!(await isTransformersModelCached(KOKORO.id, { model: KOKORO.dtype[device] }))) return false;
  try {
    const cache = await caches.open(VOICE_CACHE);
    const urls = (await cache.keys()).map((r) => r.url);
    return [styleFor("narrator").voice, styleFor("character").voice].every((voice) =>
      urls.some((url) => url.includes(KOKORO.id) && url.endsWith(`/voices/${voice}.bin`)),
    );
  } catch {
    return false;
  }
}

export interface Synthesis {
  audio: Float32Array;
  /** Time the worker spent on this sentence. */
  ms: number;
  g2pMs: number;
  modelMs: number;
  phonemes: string;
}

/** Kokoro running in its own worker (src/workers/tts.worker.ts). */
export class KokoroClient {
  private worker: Worker | null = null;
  private model: ModelWorker<TTSResponse & { type: "result" }> | null = null;
  /** Bumped on every stop; the worker drops queued sentences from older epochs. */
  private epoch = 0;
  device: TTSDevice | null = null;
  /** Real-time factor measured at load (synthesis time ÷ audio length; below 1 is faster than speech). */
  loadRtf: number | null = null;

  async load(
    device: TTSDevice,
    dtype: KokoroDtype,
    modelHost: string | null,
    voices: string[],
    onProgress: (loaded: number, total: number) => void,
  ): Promise<{ warmupMs: number; rtf: number }> {
    this.worker = new Worker(new URL("../../../workers/tts.worker.ts", import.meta.url), { type: "module" });
    this.model = new ModelWorker(this.worker);
    this.device = device;
    // ModelWorker's "ready" carries only warmupMs; the RTF rides along on the same message.
    let rtf = Number.NaN;
    const capture = (event: MessageEvent<TTSResponse>) => {
      if (event.data.type === "ready") rtf = event.data.rtf;
    };
    this.worker.addEventListener("message", capture);
    try {
      const { warmupMs } = await this.model.load(
        { type: "load", device, dtype, modelHost, voices } satisfies TTSRequest,
        onProgress,
      );
      this.loadRtf = rtf;
      return { warmupMs, rtf };
    } finally {
      this.worker.removeEventListener("message", capture);
    }
  }

  async synthesize(text: string, voice: string, speed: number): Promise<Synthesis> {
    if (!this.model) throw new Error("The voice is not loaded yet.");
    const result = await this.model.call({ type: "speak", epoch: this.epoch, text, voice, speed });
    const { audio, ms, g2pMs, modelMs, phonemes } = result;
    return { audio, ms, g2pMs, modelMs, phonemes };
  }

  /** Skips every sentence still waiting in the worker (the speech was stopped). */
  cancelPending() {
    this.epoch++;
    this.worker?.postMessage({ type: "cancel", epoch: this.epoch } satisfies TTSRequest);
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.model = null;
  }
}
