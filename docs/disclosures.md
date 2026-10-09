# Disclosures: AI models, libraries and what runs where

Guhit's AI runs entirely in the browser, on the child's device. Nothing the
child draws, says or types is sent to any server. There is no backend and no
database: stories are stored in the browser (IndexedDB) on the device.

## What needs the internet

Only the **first setup** (the "Get Guhit ready" button on `/setup`) downloads
anything: the app itself and the model weights. After that, Guhit works with
the network switched off.

| Downloaded once from | What | Kept in |
| --- | --- | --- |
| The Guhit web app's own host | The app (pages, scripts, icons, ONNX Runtime wasm) | Service worker cache (`guhit-pages-v1`, `guhit-assets-v1`) |
| `huggingface.co` (mlc-ai repos) | Language model weights, tokenizer, config | WebLLM's Cache Storage (`webllm/model`, `webllm/config`) |
| `raw.githubusercontent.com` (mlc-ai/binary-mlc-llm-libs) | The compiled WebGPU kernels for the language model | WebLLM's Cache Storage (`webllm/wasm`) |
| `huggingface.co` (onnx-community repos) | Speech-recognition model (Whisper) and drawing-recognition model (Florence-2) | Transformers.js Cache Storage (`transformers-cache`) |
| `huggingface.co` (onnx-community/Kokoro-82M-v1.0-ONNX) | The voice model (Kokoro) and nine voice style files (0.5 MB each) | Transformers.js Cache Storage (`transformers-cache`); voice files in `kokoro-voices` |

The service worker does not store model weights a second time; each library
caches its own files. The app asks the browser to keep this storage
(`navigator.storage.persist()`), so it is not cleaned up automatically.

## What runs locally (on the device)

| Task | How |
| --- | --- |
| The character's replies, interview questions, story pages, book titles | Language model through WebLLM on the device's GPU (WebGPU), inside a Web Worker |
| Guessing what the drawing shows (a short caption the child confirms or corrects) | Florence-2 through Transformers.js / ONNX Runtime Web, WebGPU (CPU wasm fallback), inside a Web Worker |
| Understanding the child's speech (push-to-talk) | Whisper through Transformers.js / ONNX Runtime Web, WebGPU (CPU wasm fallback), inside a Web Worker |
| Reading aloud (narrator and character voices) | Kokoro-82M through Transformers.js / ONNX Runtime Web on the GPU (WebGPU), inside a Web Worker; text is turned into phonemes by eSpeak NG (compiled to wasm) in the same worker, and the audio plays through Web Audio. Falls back to the browser's Web Speech API with voices installed on the operating system when Kokoro is missing, fails, or is slower than speech (phones) |
| Safety filtering of model output | Plain code in the app (word filter, markdown and `<think>` stripping) |

## Models

| Model | Used for | Licence | Source |
| --- | --- | --- | --- |
| Qwen3-1.7B (`Qwen3-1.7B-q4f16_1-MLC`, 4-bit, ~984 MB) | Language model on laptops | Apache-2.0 (Qwen) | huggingface.co/Qwen/Qwen3-1.7B, MLC build huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC |
| Qwen3-0.6B (`Qwen3-0.6B-q4f16_1-MLC`, 4-bit, ~352 MB) | Language model on phones | Apache-2.0 (Qwen) | huggingface.co/Qwen/Qwen3-0.6B, MLC build huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC |
| Qwen3.5-2B / Qwen3.5-0.8B (MLC builds) | Alternatives, only when chosen in `/lab` | Apache-2.0 (Qwen) | huggingface.co/Qwen, huggingface.co/mlc-ai |
| Qwen3-0.6B, ONNX 8-bit (`onnx/model_quantized.onnx`, ~618 MB) | Language model on devices without usable WebGPU (CPU tier, run by Transformers.js) | Apache-2.0 (Qwen). The onnx-community conversion repo declares no licence of its own; its weights are Qwen3-0.6B's | huggingface.co/Qwen/Qwen3-0.6B, ONNX build huggingface.co/onnx-community/Qwen3-0.6B-ONNX |
| Whisper base.en (ONNX, ~207 MB on WebGPU / ~77 MB on CPU) | Speech to text, English | Apache-2.0 (model card); OpenAI Whisper code is MIT | huggingface.co/openai/whisper-base.en, ONNX build huggingface.co/onnx-community/whisper-base.en |
| Whisper tiny.en (ONNX) | Alternative, only when chosen in `/lab` | Apache-2.0 (model card) | huggingface.co/onnx-community/whisper-tiny.en |
| Florence-2-large-ft (ONNX, 4-bit vision encoder, encoder and decoder, 8-bit embeddings, ~635 MB) | Guessing what the child drew on laptops ("Is that a purple dragon?"); the drawing itself is never changed | MIT (Microsoft) | huggingface.co/microsoft/Florence-2-large-ft, ONNX build huggingface.co/onnx-community/Florence-2-large-ft |
| Florence-2-base-ft (same precisions, ~217 MB) | The same on phones | MIT (Microsoft) | huggingface.co/microsoft/Florence-2-base-ft, ONNX build huggingface.co/onnx-community/Florence-2-base-ft |
| SmolVLM-256M-Instruct (ONNX, ~182 MB) | Only when chosen in `/lab` (compared, not used) | Apache-2.0 (Hugging Face) | huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct |
| Kokoro-82M v1.0 (ONNX, full precision ~326 MB on WebGPU; 8-bit ~92 MB on CPU) | The narrator and character voices | Apache-2.0 (weights and voices; hexgrad) | huggingface.co/hexgrad/Kokoro-82M, ONNX build huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX |

Models considered and **not** used because their licences are not permissive
open source: Gemma 3 (Gemma Terms of Use), Qwen2.5-3B-Instruct (Qwen Research
licence), Llama 3.2 (Llama Community Licence).

Voices: Kokoro's `af_heart` (narrator: warm, gentle; graded A on the voice
card) and `af_bella` (character: bright, lively; A-, played one semitone
higher), from the Apache-2.0 Kokoro-82M repository. `/lab` can switch to seven
other Kokoro voices from the same repository, or to the built-in voice. When
Kokoro cannot speak, the app uses voices that ship with the operating system
(for example "Samantha" on macOS) through the browser.

## Libraries

| Library | Version | Licence | Role |
| --- | --- | --- | --- |
| @mlc-ai/web-llm | 0.2.85 | Apache-2.0 | Runs the language model on WebGPU |
| MLC-LLM prebuilt model libraries (binary-mlc-llm-libs) | v0_2_84 | Apache-2.0 | Compiled GPU kernels used by WebLLM |
| @huggingface/transformers (Transformers.js) | 4.3.1 | Apache-2.0 | Runs Whisper, Florence-2 and Kokoro |
| phonemizer (phonemizer.js) | 1.2.1 | Apache-2.0 (the JavaScript wrapper) | Text to phonemes for Kokoro, in the voice worker |
| eSpeak NG (compiled to wasm, bundled inside phonemizer.js) | as bundled in phonemizer 1.2.1 | GPL-3.0-or-later | The grapheme-to-phoneme engine phonemizer.js runs; only its phoneme output is used, kept behind one `phonemize()` function (`src/lib/ai/voice/phonemize.ts`) |
| kokoro-js (code ported, not installed) | 1.2.1 | Apache-2.0 | Text normalisation, phoneme clean-up and voice-file handling ported into `src/lib/ai/voice/phonemize.ts` and `src/workers/tts.worker.ts`, because the package pins Transformers.js 3 |
| onnxruntime-web | 1.31.0-dev | MIT | Inference runtime under Transformers.js |
| @huggingface/tokenizers, @huggingface/jinja | 0.2.0, 0.5.10 | Apache-2.0, MIT | Tokenizer and chat templates for Transformers.js |
| Next.js | 16.4.0 | MIT | App framework |
| React, React DOM | 19.3.0 | MIT | UI |
| Tailwind CSS | 4.3.3 | MIT | Styling |
| TypeScript | 5.9.3 | Apache-2.0 | Language (build time only) |
| Geist font (via next/font, self-hosted) | – | SIL Open Font License 1.1 | Typeface |
