import type { STTRequest, STTResponse } from "@/workers/stt.worker";
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
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: STTResponse & { type: "result" }) => void; reject: (e: Error) => void }>();

  load(
    model: string,
    device: STTDevice,
    dtype: Record<string, string>,
    onProgress: (loaded: number, total: number) => void,
  ): Promise<{ warmupMs: number }> {
    const worker = new Worker(new URL("../../workers/stt.worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    const files = new Map<string, { loaded: number; total: number }>();
    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<STTResponse>) => {
        const message = event.data;
        if (message.type === "progress") {
          files.set(message.file, { loaded: message.loaded, total: message.total });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          onProgress(loaded, total);
        } else if (message.type === "ready") {
          worker.onmessage = (e: MessageEvent<STTResponse>) => this.onResult(e.data);
          resolve({ warmupMs: message.warmupMs });
        } else if (message.type === "error") {
          reject(new Error(message.message));
        }
      };
      worker.onerror = (event) => reject(new Error(event.message || "Speech recognition failed to start."));
      worker.postMessage({ type: "load", model, device, dtype } satisfies STTRequest);
    });
  }

  private onResult(message: STTResponse) {
    if (message.type !== "result" && message.type !== "error") return;
    if (message.id === undefined) return;
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    this.pending.delete(message.id);
    if (message.type === "result") waiter.resolve(message);
    else waiter.reject(new Error(message.message));
  }

  async transcribe(blob: Blob): Promise<Transcription> {
    const worker = this.worker;
    if (!worker) throw new Error("Speech recognition is not loaded yet.");
    const audio = await decodeTo16kMono(blob);
    const audioSeconds = audio.length / SAMPLE_RATE;
    if (audio.length < SAMPLE_RATE * 0.3 || rms(audio) < SILENCE_RMS) {
      return { text: "", ms: 0, audioSeconds };
    }
    const id = this.nextId++;
    const result = await new Promise<STTResponse & { type: "result" }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: "transcribe", id, audio } satisfies STTRequest, [audio.buffer]);
    });
    return { text: cleanTranscript(result.text), ms: result.ms, audioSeconds };
  }
}
