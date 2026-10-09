import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
  type Tensor,
} from "@huggingface/transformers";
import type { ModelSource } from "@/lib/ai/model-fetch";
import { configureTransformers, type FileProgress } from "./ort-env";

/** The story helper on the CPU, for devices where WebGPU is missing or refused. */

export type CpuLLMRequest =
  | {
      type: "load";
      model: string;
      dtype: string;
      /** onnx/<file>_<dtype>.onnx, its weights in `dataFiles` separate files. */
      file: string;
      dataFiles: number;
      modelHost: string | null;
      source: ModelSource;
    }
  | {
      type: "generate";
      id: number;
      messages: { role: string; content: string }[];
      maxTokens: number;
      temperature: number;
    }
  | { type: "stop" };

export type CpuLLMResponse =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; warmupMs: number }
  | { type: "token"; id: number; text: string }
  | {
      type: "result";
      id: number;
      text: string;
      ms: number;
      firstTokenMs: number;
      promptTokens: number;
      completionTokens: number;
    }
  | { type: "error"; id?: number; message: string };

interface Generator {
  generate(options: Record<string, unknown>): Promise<Tensor>;
}
interface ChatTokenizer {
  apply_chat_template(messages: unknown[], options: Record<string, unknown>): { input_ids: Tensor };
}

let model: Generator | null = null;
let tokenizer: ChatTokenizer | null = null;
const stopper = new InterruptableStoppingCriteria();
/** One generation at a time: the session must not run two at once. */
let queue: Promise<unknown> = Promise.resolve();

const post = (message: CpuLLMResponse) => self.postMessage(message);

async function generate(request: Extract<CpuLLMRequest, { type: "generate" }>) {
  if (!model || !tokenizer) throw new Error("The story helper is not loaded yet.");
  const started = performance.now();
  // Qwen3's template takes the no-think switch as a variable: no hidden reasoning before the reply.
  const inputs = tokenizer.apply_chat_template(request.messages, {
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: false,
  });
  let firstToken = 0;
  let text = "";
  const streamer = new TextStreamer(tokenizer as never, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (piece: string) => {
      if (!piece) return;
      if (!firstToken) firstToken = performance.now();
      text += piece;
      post({ type: "token", id: request.id, text: piece });
    },
  });
  stopper.reset();
  const output = await model.generate({
    ...inputs,
    max_new_tokens: request.maxTokens,
    do_sample: request.temperature > 0,
    temperature: request.temperature,
    top_p: 0.8,
    streamer,
    stopping_criteria: stopper,
  });
  const promptTokens = inputs.input_ids.dims.at(-1) ?? 0;
  post({
    type: "result",
    id: request.id,
    text,
    ms: performance.now() - started,
    firstTokenMs: firstToken ? firstToken - started : 0,
    promptTokens,
    completionTokens: (output.dims.at(-1) ?? promptTokens) - promptTokens,
  });
}

self.onmessage = (event: MessageEvent<CpuLLMRequest>) => {
  const request = event.data;
  if (request.type === "stop") {
    stopper.interrupt();
    return;
  }
  queue = queue.then(async () => {
    try {
      if (request.type === "load") {
        await configureTransformers(request.modelHost, request.source);
        const progress_callback = (p: FileProgress) => {
          if (p.status === "progress" && p.file) {
            post({ type: "progress", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
          }
        };
        const [loadedTokenizer, loadedModel] = await Promise.all([
          AutoTokenizer.from_pretrained(request.model, { progress_callback }),
          AutoModelForCausalLM.from_pretrained(request.model, {
            device: "wasm",
            dtype: request.dtype as never,
            model_file_name: request.file,
            use_external_data_format: request.dataFiles,
            progress_callback,
          }),
        ]);
        tokenizer = loadedTokenizer as unknown as ChatTokenizer;
        model = loadedModel as unknown as Generator;
        const started = performance.now();
        await generate({ type: "generate", id: -1, messages: [{ role: "user", content: "Hi" }], maxTokens: 1, temperature: 0 });
        post({ type: "ready", warmupMs: performance.now() - started });
      } else {
        await generate(request);
      }
    } catch (error) {
      post({
        type: "error",
        id: request.type === "generate" ? request.id : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
