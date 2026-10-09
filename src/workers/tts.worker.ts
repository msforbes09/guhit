import { AutoTokenizer, env, StyleTextToSpeech2Model, Tensor } from "@huggingface/transformers";
import { phonemize } from "@/lib/ai/voice/phonemize";
import { findVoice, KOKORO, VOICE_CACHE, type TTSDevice } from "@/lib/ai/voice/voices";
import { configureTransformers, type FileProgress } from "./ort-env";

type Tokenizer = (text: string, options: { truncation: boolean }) => { input_ids: Tensor };
type Synthesizer = (inputs: Record<string, Tensor>) => Promise<{ waveform: Tensor }>;

export type TTSRequest =
  | {
      type: "load";
      device: TTSDevice;
      /** A mirror with Hugging Face's layout, or null for Hugging Face itself. */
      modelHost: string | null;
      /** Voices to fetch now so they work offline later; the first one is used for the warm-up. */
      voices: string[];
    }
  | { type: "speak"; id: number; epoch: number; text: string; voice: string; speed: number }
  /** Drops queued requests from earlier epochs (the speech they were for was stopped). */
  | { type: "cancel"; epoch: number };

export type TTSResponse =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; warmupMs: number; rtf: number }
  | { type: "result"; id: number; audio: Float32Array; ms: number; phonemes: string }
  | { type: "error"; id?: number; message: string };

const post = (message: TTSResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

let model: Synthesizer | null = null;
let tokenizer: Tokenizer | null = null;
const voices = new Map<string, Float32Array>();
/** One synthesis at a time: an ONNX session must not run two inferences at once. */
let queue: Promise<unknown> = Promise.resolve();
let epoch = 0;

/** Voice style tables are fetched next to the model and kept in Cache Storage for offline use. */
async function loadVoice(id: string): Promise<Float32Array> {
  const known = voices.get(id);
  if (known) return known;
  if (!findVoice(id)) throw new Error(`Unknown voice ${id}`);
  const url = `${env.remoteHost.replace(/\/?$/, "/")}${KOKORO.id}/resolve/main/voices/${id}.bin`;
  let cache: Cache | null = null;
  try {
    cache = await caches.open(VOICE_CACHE);
  } catch {
    // No Cache Storage (private mode): fetch every time.
  }
  let response = await cache?.match(url);
  if (!response) {
    response = await fetch(url);
    if (!response.ok) throw new Error(`Voice ${id} download failed (${response.status}).`);
    await cache?.put(url, response.clone()).catch(() => {});
  }
  const table = new Float32Array(await response.arrayBuffer());
  voices.set(id, table);
  return table;
}

async function synthesize(text: string, voice: string, speed: number) {
  if (!model || !tokenizer) throw new Error("The voice is not loaded yet.");
  const phonemes = await phonemize(text, findVoice(voice)?.accent ?? "us");
  const { input_ids } = tokenizer(phonemes, { truncation: true });
  // The voice file holds one 256-value style per input length (Kokoro's design).
  const tokens = Math.min(Math.max(input_ids.dims.at(-1)! - 2, 0), 509);
  const style = (await loadVoice(voice)).slice(tokens * 256, tokens * 256 + 256);
  const { waveform } = await model({
    input_ids,
    style: new Tensor("float32", style, [1, 256]),
    speed: new Tensor("float32", [speed], [1]),
  });
  return { audio: waveform.data as Float32Array, phonemes };
}

const WARMUP = "Hello there! Let's make a story together.";

self.onmessage = (event: MessageEvent<TTSRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    epoch = Math.max(epoch, request.epoch);
    return;
  }
  queue = queue.then(async () => {
    try {
      if (request.type === "load") {
        await configureTransformers(request.modelHost);
        const progress_callback = (p: FileProgress) => {
          if (p.status === "progress" && p.file) {
            post({ type: "progress", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
          }
        };
        const [loadedModel, loadedTokenizer] = await Promise.all([
          StyleTextToSpeech2Model.from_pretrained(KOKORO.id, {
            device: request.device,
            dtype: KOKORO.dtype[request.device],
            progress_callback,
          }),
          AutoTokenizer.from_pretrained(KOKORO.id, { progress_callback }),
          ...request.voices.map(loadVoice),
        ]);
        model = loadedModel as unknown as Synthesizer;
        tokenizer = loadedTokenizer as unknown as Tokenizer;
        // The first run compiles GPU kernels; the second one is a fair speed sample.
        const started = performance.now();
        await synthesize(WARMUP, request.voices[0], 1);
        const warmupMs = performance.now() - started;
        const timed = performance.now();
        const { audio } = await synthesize(WARMUP, request.voices[0], 1);
        const rtf = (performance.now() - timed) / 1000 / (audio.length / KOKORO.sampleRate);
        post({ type: "ready", warmupMs, rtf });
        return;
      }

      if (request.type === "speak") {
        if (request.epoch < epoch) throw new Error("cancelled");
        const started = performance.now();
        const { audio, phonemes } = await synthesize(request.text, request.voice, request.speed);
        post({ type: "result", id: request.id, audio, ms: performance.now() - started, phonemes }, [audio.buffer]);
      }
    } catch (error) {
      post({
        type: "error",
        id: request.type === "speak" ? request.id : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
