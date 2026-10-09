import { AutoTokenizer, env, StyleTextToSpeech2Model, Tensor } from "@huggingface/transformers";
import { phonemize } from "@/lib/ai/voice/phonemize";
import { findVoice, KOKORO, VOICE_CACHE, type KokoroDtype, type TTSDevice } from "@/lib/ai/voice/voices";
import type { ModelSource } from "@/lib/ai/model-fetch";
import { configureTransformers, type FileProgress } from "./ort-env";

type Tokenizer = (text: string, options: { truncation: boolean }) => { input_ids: Tensor };
type Synthesizer = (inputs: Record<string, Tensor>) => Promise<{ waveform: Tensor }>;

export type TTSRequest =
  | {
      type: "load";
      device: TTSDevice;
      dtype: KokoroDtype;
      /** A mirror with Hugging Face's layout, or null for Hugging Face itself. */
      modelHost: string | null;
      /** Where downloads come from (see model-fetch.ts). */
      source: ModelSource;
      /** Voices to fetch now so they work offline later; the first one is used for the warm-up. */
      voices: string[];
    }
  | { type: "speak"; id: number; epoch: number; text: string; voice: string; speed: number }
  /** Drops queued requests from earlier epochs (the speech they were for was stopped). */
  | { type: "cancel"; epoch: number };

export type TTSResponse =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; warmupMs: number; rtf: number }
  | {
      type: "result";
      id: number;
      audio: Float32Array;
      /** Message received → samples ready. */
      ms: number;
      /** Text → phonemes (eSpeak), which runs while the previous sentence is still being voiced. */
      g2pMs: number;
      /** The model alone. */
      modelMs: number;
      phonemes: string;
    }
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
    // The same resilient path as the model files (R2 first, retries, resume).
    response = (await env.fetch(url)) as Response;
    if (!response.ok) throw new Error(`Voice ${id} download failed (${response.status}).`);
    await cache?.put(url, response.clone()).catch(() => {});
  }
  const table = new Float32Array(await response.arrayBuffer());
  voices.set(id, table);
  return table;
}

const toPhonemes = (text: string, voice: string) => phonemize(text, findVoice(voice)?.accent ?? "us");

async function voiceIt(phonemes: string, voice: string, speed: number): Promise<Float32Array> {
  if (!model || !tokenizer) throw new Error("The voice is not loaded yet.");
  const { input_ids } = tokenizer(phonemes, { truncation: true });
  // The voice file holds one 256-value style per input length (Kokoro's design).
  const tokens = Math.min(Math.max(input_ids.dims.at(-1)! - 2, 0), 509);
  const style = (await loadVoice(voice)).slice(tokens * 256, tokens * 256 + 256);
  const { waveform } = await model({
    input_ids,
    style: new Tensor("float32", style, [1, 256]),
    speed: new Tensor("float32", [speed], [1]),
  });
  const audio = waveform.data as Float32Array;
  // Reduced precisions can overflow on some GPUs (fp16 gave NaN samples on a
  // Mac): never play that, let the built-in voice say the sentence instead.
  for (let i = 0; i < audio.length; i += 97) {
    if (!Number.isFinite(audio[i])) throw new Error("produced invalid audio");
  }
  return audio;
}

const synthesize = async (text: string, voice: string, speed: number) =>
  voiceIt(await toPhonemes(text, voice), voice, speed);

/**
 * WebGPU compiles kernels for each new input size, so its warm-up says a
 * short, a medium and a long line, and the last run gives the speed. The CPU
 * has nothing to compile: one short line, then a timed one decides whether
 * this device is fast enough at all.
 */
const WARMUPS: Record<TTSDevice, string[]> = {
  webgpu: [
    "Hi!",
    "Hello there! Let's make a story together.",
    "Once upon a time, a little dragon lived in a castle on a cloud, and she loved pancakes.",
  ],
  wasm: ["Hi!", "Hello there! Let's make a story together."],
};

async function load(request: Extract<TTSRequest, { type: "load" }>) {
  await configureTransformers(request.modelHost, request.source);
  const progress_callback = (p: FileProgress) => {
    if (p.status === "progress" && p.file) {
      post({ type: "progress", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
    }
  };
  const [loadedModel, loadedTokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(KOKORO.id, {
      device: request.device,
      dtype: request.dtype,
      progress_callback,
    }),
    AutoTokenizer.from_pretrained(KOKORO.id, { progress_callback }),
    ...request.voices.map(loadVoice),
  ]);
  model = loadedModel as unknown as Synthesizer;
  tokenizer = loadedTokenizer as unknown as Tokenizer;
  const started = performance.now();
  let rtf = Number.NaN;
  for (const line of WARMUPS[request.device]) {
    const timed = performance.now();
    const audio = await synthesize(line, request.voices[0], 1);
    rtf = (performance.now() - timed) / 1000 / (audio.length / KOKORO.sampleRate);
  }
  post({ type: "ready", warmupMs: performance.now() - started, rtf });
}

function speak(request: Extract<TTSRequest, { type: "speak" }>) {
  const received = performance.now();
  // eSpeak runs now, on this thread, while the GPU may still be voicing the
  // previous sentence; only the model waits its turn.
  const g2p = toPhonemes(request.text, request.voice).then((phonemes) => ({
    phonemes,
    g2pMs: performance.now() - received,
  }));
  g2p.catch(() => {});
  queue = queue.then(async () => {
    try {
      if (request.epoch < epoch) throw new Error("cancelled");
      const { phonemes, g2pMs } = await g2p;
      const started = performance.now();
      const audio = await voiceIt(phonemes, request.voice, request.speed);
      const done = performance.now();
      post(
        { type: "result", id: request.id, audio, ms: done - received, g2pMs, modelMs: done - started, phonemes },
        [audio.buffer],
      );
    } catch (error) {
      post({ type: "error", id: request.id, message: error instanceof Error ? error.message : String(error) });
    }
  });
}

self.onmessage = (event: MessageEvent<TTSRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    epoch = Math.max(epoch, request.epoch);
  } else if (request.type === "speak") {
    speak(request);
  } else {
    queue = queue.then(() =>
      load(request).catch((error) =>
        post({ type: "error", message: error instanceof Error ? error.message : String(error) }),
      ),
    );
  }
};
