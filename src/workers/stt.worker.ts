import { pipeline } from "@huggingface/transformers";
import { configureTransformers, type FileProgress } from "./ort-env";

type Transcriber = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

let transcriber: Transcriber | null = null;

export type STTRequest =
  | {
      type: "load";
      model: string;
      device: "webgpu" | "wasm";
      dtype: Record<string, string>;
      /** A mirror with Hugging Face's layout, or null for Hugging Face itself. */
      modelHost: string | null;
    }
  | { type: "transcribe"; id: number; audio: Float32Array };

export type STTResponse =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; warmupMs: number }
  | { type: "result"; id: number; text: string; ms: number }
  | { type: "error"; id?: number; message: string };

const post = (message: STTResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<STTRequest>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      configureTransformers(request.modelHost);
      const asr = await pipeline("automatic-speech-recognition", request.model, {
        device: request.device,
        dtype: request.dtype as never,
        progress_callback: (p: FileProgress) => {
          if (p.status === "progress" && p.file) {
            post({ type: "progress", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
          }
        },
      });
      transcriber = asr as unknown as Transcriber;
      // One pass over a second of silence compiles the GPU kernels now, so the
      // child's first answer is not the slow one.
      const started = performance.now();
      await transcriber(new Float32Array(16000));
      post({ type: "ready", warmupMs: performance.now() - started });
      return;
    }

    if (request.type === "transcribe") {
      if (!transcriber) throw new Error("Speech recognition is not loaded yet.");
      const started = performance.now();
      const long = request.audio.length > 16000 * 30;
      const output = await transcriber(request.audio, long ? { chunk_length_s: 30, stride_length_s: 5 } : {});
      const text = (Array.isArray(output) ? output.map((o) => o.text).join(" ") : output.text).trim();
      post({ type: "result", id: request.id, text, ms: performance.now() - started });
    }
  } catch (error) {
    post({
      type: "error",
      id: request.type === "transcribe" ? request.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
