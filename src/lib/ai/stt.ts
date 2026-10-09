import type { STTRequest, STTResponse } from "@/workers/stt.worker";
import type { ModelSource } from "./model-fetch";
import { ModelWorker } from "./model-worker";
import type { STTDevice } from "./models";

const SAMPLE_RATE = 16000;
/** Below this loudness the clip is treated as silence; Whisper invents words for silence. */
const SILENCE_RMS = 0.004;

export interface Transcription {
  text: string;
  ms: number;
  audioSeconds: number;
}

/** Whisper expects 16 kHz mono; the browser decoder resamples for us. */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const channel = audio.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / audio.numberOfChannels;
    }
    return mono;
  } finally {
    void context.close();
  }
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/** Drops the sound tags Whisper emits for non-speech, e.g. "[BLANK_AUDIO]" or "(music)". */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class STTClient {
  private worker: ModelWorker<STTResponse & { type: "result" }> | null = null;

  load(
    model: string,
    device: STTDevice,
    dtype: Record<string, string>,
    modelHost: string | null,
    source: ModelSource,
    onProgress: (loaded: number, total: number) => void,
  ): Promise<{ warmupMs: number }> {
    this.worker = new ModelWorker(
      new Worker(new URL("../../workers/stt.worker.ts", import.meta.url), { type: "module" }),
    );
    return this.worker.load({ type: "load", model, device, dtype, modelHost, source } satisfies STTRequest, onProgress);
  }

  /** Frees the model's memory; load() again to use it. */
  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }

  async transcribe(blob: Blob): Promise<Transcription> {
    if (!this.worker) throw new Error("Speech recognition is not loaded yet.");
    const audio = await decodeTo16kMono(blob);
    const audioSeconds = audio.length / SAMPLE_RATE;
    if (audio.length < SAMPLE_RATE * 0.3 || rms(audio) < SILENCE_RMS) {
      return { text: "", ms: 0, audioSeconds };
    }
    const result = await this.worker.call({ type: "transcribe", audio }, [audio.buffer]);
    return { text: cleanTranscript(result.text), ms: result.ms, audioSeconds };
  }
}
