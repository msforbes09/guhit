/**
 * Every model Guhit may run, with download sizes measured from the Hugging
 * Face repos (sum of all files) so the setup screen can show real numbers.
 * Only Apache-2.0 models are listed: the hackathon rules require permissive
 * licences, which rules out Gemma and Qwen2.5-3B.
 */
export interface LLMModel {
  id: string;
  label: string;
  downloadMB: number;
  /** Qwen3-family chat templates accept the no-think switch. */
  thinking: boolean;
  /**
   * Runs on the CPU through Transformers.js (devices without WebGPU) instead of
   * WebLLM: the ONNX file `onnx/<file>_<dtype>.onnx`, its weights in `dataFiles`
   * separate files (Transformers.js "use_external_data_format").
   */
  cpu?: { dtype: string; file: string; dataFiles: number };
}

export const LLM_MODELS: LLMModel[] = [
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "Qwen3 1.7B (laptop)", downloadMB: 984, thinking: true },
  { id: "Qwen3-1.7B-q4f32_1-MLC", label: "Qwen3 1.7B f32 (laptop, no f16 GPU)", downloadMB: 984, thinking: true },
  { id: "Qwen3.5-2B-q4f16_1-MLC", label: "Qwen3.5 2B (laptop, alt)", downloadMB: 1083, thinking: true },
  { id: "Qwen3-0.6B-q4f16_1-MLC", label: "Qwen3 0.6B (phone)", downloadMB: 352, thinking: true },
  { id: "Qwen3-0.6B-q4f32_1-MLC", label: "Qwen3 0.6B f32 (phone, no f16 GPU)", downloadMB: 352, thinking: true },
  { id: "Qwen3.5-0.8B-q4f16_1-MLC", label: "Qwen3.5 0.8B (phone, alt)", downloadMB: 447, thinking: true },
  // The same Qwen3-0.6B as phones, as ONNX for the CPU: 8-bit is ONNX Runtime's
  // fastest there. Its 618 MB of weights are split into files under 300 MB
  // (R2's upload limit) by scripts/split-onnx.py, served from Guhit's R2 only.
  {
    id: "onnx-community/Qwen3-0.6B-ONNX",
    label: "Qwen3 0.6B (CPU, no WebGPU)",
    downloadMB: 620,
    thinking: true,
    cpu: { dtype: "q8", file: "model_chunked", dataFiles: 3 },
  },
];

export const CPU_LLM = "onnx-community/Qwen3-0.6B-ONNX";

export type STTDevice = "webgpu" | "wasm";

export interface STTModel {
  id: string;
  label: string;
  /** Download size per device, because each device uses different precisions. */
  downloadMB: Record<STTDevice, number>;
}

export const STT_MODELS: STTModel[] = [
  { id: "onnx-community/whisper-base.en", label: "Whisper base.en", downloadMB: { webgpu: 207, wasm: 77 } },
  { id: "onnx-community/whisper-tiny.en", label: "Whisper tiny.en", downloadMB: { webgpu: 96, wasm: 41 } },
];

/**
 * WebGPU runs the encoder in full precision (Whisper loses accuracy at lower
 * precision there) with a 4-bit decoder; the CPU fallback uses 8-bit weights,
 * which wasm runs fastest.
 */
export const STT_DTYPES: Record<STTDevice, Record<string, string>> = {
  webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" },
  wasm: { encoder_model: "q8", decoder_model_merged: "q8" },
};

export interface VisionModel {
  id: string;
  label: string;
  downloadMB: number;
  /**
   * 4-bit weights run on both WebGPU and the CPU fallback, so one download
   * serves every device; the token embeddings only exist in 8-bit or larger.
   */
  dtype: Record<string, string>;
  /** The JSON files it starts with, when not the usual captioning set (see MODEL_JSON). */
  json?: string[];
}

/**
 * iPhone and iPad: the light eyes. Florence-2's guess was killed by iOS for
 * memory (seen on the owner's iPhone), so these devices pick from a list of
 * kid-drawing subjects with MobileCLIP S0's small image half instead (Apple
 * sample code licence, MIT-style); the label embeddings come with the app.
 */
export const LIGHT_VISION = "Xenova/mobileclip_s0";

export const VISION_MODELS: VisionModel[] = [
  {
    id: "onnx-community/Florence-2-base-ft",
    label: "Florence-2 base",
    downloadMB: 217,
    dtype: { vision_encoder: "q4", embed_tokens: "q8", encoder_model: "q4", decoder_model_merged: "q4" },
  },
  {
    // MIT. Three times the download of base; compared in /lab for harder drawings.
    id: "onnx-community/Florence-2-large-ft",
    label: "Florence-2 large",
    downloadMB: 635,
    dtype: { vision_encoder: "q4", embed_tokens: "q8", encoder_model: "q4", decoder_model_merged: "q4" },
  },
  {
    // Apache-2.0. A chat model that sees images, so it can be asked exactly what was drawn.
    id: "HuggingFaceTB/SmolVLM-256M-Instruct",
    label: "SmolVLM 256M",
    downloadMB: 182,
    dtype: { vision_encoder: "q4", embed_tokens: "q8", decoder_model_merged: "q4" },
  },
  {
    // Full precision: the model's own default for the image half, and still only 46 MB.
    id: LIGHT_VISION,
    label: "MobileCLIP S0 (light eyes)",
    downloadMB: 46,
    dtype: { vision_model: "fp32" },
    json: ["config.json", "preprocessor_config.json"],
  },
];

export const findLLM = (id: string) => LLM_MODELS.find((m) => m.id === id);
export const findVision = (id: string) => VISION_MODELS.find((m) => m.id === id);
export const findSTT = (id: string) => STT_MODELS.find((m) => m.id === id);
