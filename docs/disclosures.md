# Disclosures: AI models, libraries and what runs where

Guhit's AI runs entirely in the browser, on the child's device. Nothing the
child draws, says or types is sent to any server. There is no backend and no
database: stories are stored in the browser (IndexedDB) on the device.

## What needs the internet

Only the **first setup** (the "Get Guhit ready" screen at `/setup`) downloads
anything: the app itself and the model weights for the parts the parent
chooses (Seeing eyes always; Storytelling voice and Talking optional; on
iPhone and iPad the voice is not offered). After that, Guhit works with the
network switched off: snap, cut-out and the guess all work in airplane mode.

For a grown-up helping, "Start log (for a grown-up helping)" in Get ready and
"Why no guess?" on the meet screen show the app's last starts and why a
drawing was not guessed. Both stay on the device.

Model files come from Guhit's own model server on Cloudflare R2
(`https://models.iam4bs.dev/models/...`, same paths as on Hugging Face). When
R2 lacks a file or cannot be reached, that file is downloaded from its
original source instead. Either way the file is cached under its original
URL. Every file on R2 is under 300 MB. Where Chrome supports Background Fetch,
the browser downloads the files itself and the service worker stores them.

| Downloaded once from | What | Kept in |
| --- | --- | --- |
| The Guhit web app's own host | The app (pages, scripts, icons, fonts, ONNX Runtime wasm) | Service worker cache (`guhit-pages-v1`, `guhit-assets-v1`) |
| `models.iam4bs.dev` (R2), fallback `huggingface.co` (mlc-ai repos) | Language model weights, tokenizer, config (GPU tier) | WebLLM's Cache Storage (`webllm/model`, `webllm/config`) |
| `models.iam4bs.dev` (R2), fallback `raw.githubusercontent.com` (mlc-ai/binary-mlc-llm-libs) | The compiled WebGPU kernels for the language model | WebLLM's Cache Storage (`webllm/wasm`) |
| `models.iam4bs.dev` (R2) only | The CPU language model (Qwen3-0.6B ONNX, split into files under 300 MB) | Transformers.js Cache Storage (`transformers-cache`) |
| `models.iam4bs.dev` (R2), fallback `huggingface.co` (onnx-community repos) | Speech recognition (Whisper) and drawing recognition (Florence-2) | Transformers.js Cache Storage (`transformers-cache`) |
| `models.iam4bs.dev` (R2), fallback `huggingface.co` (Xenova/mobileclip_s0) | The light eyes on iPhone and iPad (MobileCLIP S0 image half and its config files) | Transformers.js Cache Storage (`transformers-cache`) |
| `models.iam4bs.dev` (R2), fallback `huggingface.co` (xrds/isnet-general-onnx-int8, pinned revision) | The AI cut-out model (IS-Net) | Transformers.js Cache Storage (`transformers-cache`) |
| `models.iam4bs.dev` (R2), fallback `huggingface.co` (onnx-community/Kokoro-82M-v1.0-ONNX) | The voice model (Kokoro: full precision for WebGPU, split into files under 300 MB; 8-bit for the CPU) and nine voice style files (0.5 MB each) | Transformers.js Cache Storage (`transformers-cache`); voice files in `kokoro-voices` |

The service worker does not store model weights a second time; each library
caches its own files. The app asks the browser to keep this storage
(`navigator.storage.persist()`), so it is not cleaned up automatically.

For events with slow internet, `scripts/mirror-models.mjs` can copy the models
to a local machine, which `npm run serve` then hands to the browser
(`?models=local`). `?models=hf` skips R2 and uses Hugging Face only.

## What runs locally (on the device)

Device tiers are decided by what the browser offers (`src/lib/ai/device.ts`):
a usable WebGPU adapter means the GPU tier, otherwise the CPU tier.

| Task | How |
| --- | --- |
| The character's replies, interview questions, story pages, book titles | GPU tier: language model through WebLLM on WebGPU. CPU tier (or when WebLLM cannot use the GPU): Qwen3-0.6B through Transformers.js / ONNX Runtime Web (wasm). Inside a Web Worker |
| Guessing what the drawing shows (a short caption the child confirms or corrects) | Android and laptops: Florence-2 base through Transformers.js / ONNX Runtime Web, WebGPU (CPU wasm fallback), inside a Web Worker. iPhone and iPad: the light eyes, the image half of MobileCLIP S0 on the CPU (wasm) in a Web Worker; its picture embedding is compared with built-in text embeddings for 69 kid-drawing subjects (`src/lib/ai/light-eyes-labels.json`, made once by `scripts/light-eyes-labels.mjs`) and the closest is named unless none stands out |
| Cutting the drawing out of the photo | A classical image-processing cut-out (no model), in a Web Worker. Optional AI cut-out: IS-Net through Transformers.js / ONNX Runtime Web, WebGPU (CPU wasm fallback) |
| Understanding the child's speech (push-to-talk) | Whisper through Transformers.js / ONNX Runtime Web, WebGPU (CPU wasm fallback), inside a Web Worker |
| Reading aloud (narrator and character voices) | Kokoro-82M through Transformers.js / ONNX Runtime Web, inside a Web Worker: full precision on WebGPU on laptops (the CPU if the GPU cannot start it or is too slow), 8-bit on the CPU (wasm) elsewhere; not offered on iPhone and iPad; text is turned into phonemes by eSpeak NG (compiled to wasm) in the same worker, and the audio plays through Web Audio. When Kokoro is not set up, fails, or is slower than speech on the device, the character talks in synthesized 8-bit babble (Web Audio, no model) and narration uses the browser's Web Speech API with voices installed on the operating system |
| Safety filtering of the child's input and of model output | Plain code in the app (word lists, markdown and `<think>` stripping) |

The site is cross-origin isolated (COOP/COEP headers), so ONNX Runtime can use
several CPU threads.

## Models

| Model | Used for | Licence | Source |
| --- | --- | --- | --- |
| Qwen3-1.7B (`Qwen3-1.7B-q4f16_1-MLC`, 4-bit, ~984 MB; `q4f32_1` build on GPUs without 16-bit floats) | Language model on laptops with WebGPU | Apache-2.0 (Qwen) | huggingface.co/Qwen/Qwen3-1.7B, MLC build huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC |
| Qwen3-0.6B (`Qwen3-0.6B-q4f16_1-MLC`, 4-bit, ~352 MB; `q4f32_1` build on GPUs without 16-bit floats) | Language model on phones with WebGPU | Apache-2.0 (Qwen) | huggingface.co/Qwen/Qwen3-0.6B, MLC build huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC |
| Qwen3.5-2B / Qwen3.5-0.8B (MLC builds) | Alternatives, only when chosen in `/lab` | Apache-2.0 (Qwen) | huggingface.co/Qwen, huggingface.co/mlc-ai |
| Qwen3-0.6B, ONNX 8-bit (~620 MB; split by `scripts/split-onnx.py` into a graph file `onnx/model_chunked_quantized.onnx` and three weight files under 300 MB, served from Guhit's R2 copy only) | Language model on devices without usable WebGPU (CPU tier, run by Transformers.js) | Apache-2.0 (Qwen). The onnx-community conversion repo declares no licence of its own; its weights are Qwen3-0.6B's. The split changes only how the weights are stored | huggingface.co/Qwen/Qwen3-0.6B, ONNX build huggingface.co/onnx-community/Qwen3-0.6B-ONNX |
| Whisper base.en (ONNX; WebGPU: full-precision encoder, 4-bit decoder, ~207 MB; CPU: 8-bit, ~77 MB) | Speech to text, English | Apache-2.0 (model card); OpenAI Whisper code is MIT | huggingface.co/openai/whisper-base.en, ONNX build huggingface.co/onnx-community/whisper-base.en |
| Whisper tiny.en (ONNX) | Alternative, only when chosen in `/lab` | Apache-2.0 (model card) | huggingface.co/onnx-community/whisper-tiny.en |
| Florence-2-base-ft (ONNX, 4-bit vision encoder, encoder and decoder, 8-bit embeddings, ~217 MB) | Guessing what the child drew on Android and laptops ("Is that a purple dragon?"); the drawing itself is never changed | MIT (Microsoft) | huggingface.co/microsoft/Florence-2-base-ft, ONNX build huggingface.co/onnx-community/Florence-2-base-ft |
| Florence-2-large-ft (same precisions, ~635 MB) | Only when chosen in `/lab` (its vision encoder is one 316 MB file, over Guhit's 300 MB file limit) | MIT (Microsoft) | huggingface.co/microsoft/Florence-2-large-ft, ONNX build huggingface.co/onnx-community/Florence-2-large-ft |
| SmolVLM-256M-Instruct (ONNX, ~182 MB) | Only when chosen in `/lab` (compared, not used) | Apache-2.0 (Hugging Face) | huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct |
| IS-Net general (`xrds/isnet-general-onnx-int8`, ONNX 8-bit, ~44 MB, pinned to revision `71eff23`) | The optional AI cut-out, downloaded with the Seeing eyes | MIT (ONNX repack of imgly/isnet-general-onnx, MIT); IS-Net code by xuebinqin/DIS, Apache-2.0 | huggingface.co/xrds/isnet-general-onnx-int8, from huggingface.co/imgly/isnet-general-onnx and github.com/xuebinqin/DIS |
| MobileCLIP S0 (`Xenova/mobileclip_s0`, ONNX, image half only, full precision, 46 MB; the text half runs only at build time, in `scripts/light-eyes-labels.mjs`) | The light eyes: guessing what the child drew on iPhone and iPad, by picking from 69 kid-drawing subjects | Apple sample code licence (MIT-style; listed as "other" on Hugging Face) | github.com/apple/ml-mobileclip, ONNX build huggingface.co/Xenova/mobileclip_s0 |
| Kokoro-82M v1.0 (ONNX; full precision ~326 MB on WebGPU, split into files under 300 MB; 8-bit ~92 MB on the CPU) | The narrator and character voices | Apache-2.0 (weights and voices; hexgrad) | huggingface.co/hexgrad/Kokoro-82M, ONNX build huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX |

Models considered and **not** used because their licences are not permissive
open source: Gemma 3 (Gemma Terms of Use), Qwen2.5-3B-Instruct (Qwen Research
licence), Llama 3.2 (Llama Community Licence).

Voices: Kokoro's `af_heart` (narrator: warm, gentle; graded A on the voice
card) and `af_bella` (character: bright, lively; A-, played one semitone
higher), from the Apache-2.0 Kokoro-82M repository. `/lab` can switch to seven
other Kokoro voices from the same repository, or to the built-in voice. When
Kokoro cannot speak, the character babbles in synthesized 8-bit sounds and
narration uses voices that ship with the operating system (for example
"Samantha" on macOS) through the browser.

## Libraries

| Library | Version | Licence | Role |
| --- | --- | --- | --- |
| @mlc-ai/web-llm | 0.2.85 | Apache-2.0 | Runs the language model on WebGPU |
| MLC-LLM prebuilt model libraries (binary-mlc-llm-libs) | v0_2_84 | Apache-2.0 | Compiled GPU kernels used by WebLLM |
| @huggingface/transformers (Transformers.js) | 4.3.1 | Apache-2.0 | Runs Whisper, Florence-2, MobileCLIP, IS-Net, Kokoro and the CPU language model |
| phonemizer (phonemizer.js) | 1.2.1 | Apache-2.0 (the JavaScript wrapper) | Text to phonemes for Kokoro, in the voice worker |
| eSpeak NG (compiled to wasm, bundled inside phonemizer.js) | as bundled in phonemizer 1.2.1 | GPL-3.0-or-later | The grapheme-to-phoneme engine phonemizer.js runs; only its phoneme output is used, kept behind one `phonemize()` function (`src/lib/ai/voice/phonemize.ts`) |
| kokoro-js (code ported, not installed) | 1.2.1 | Apache-2.0 | Text normalisation, phoneme clean-up and voice-file handling ported into `src/lib/ai/voice/phonemize.ts` and `src/workers/tts.worker.ts`, because the package pins Transformers.js 3 |
| onnxruntime-web | 1.31.0-dev (as pinned by Transformers.js) | MIT | Inference runtime under Transformers.js |
| @huggingface/tokenizers, @huggingface/jinja | 0.2.0, 0.5.10 | Apache-2.0, MIT | Tokenizer and chat templates for Transformers.js |
| Next.js | 16.4.0 | MIT | App framework |
| React, React DOM | 19.3.0 | MIT | UI |
| Tailwind CSS | 4.3.3 | MIT | Styling |
| TypeScript | 5.9.3 | Apache-2.0 | Language (build time only) |
| Grandstander and Andika fonts (via next/font, self-hosted) | – | SIL Open Font License 1.1 | Typefaces |

## Tools used to build Guhit

These are the tools used to make Guhit and its promo video. They are separate
from the models above, which are what the app itself runs on the device.

| Tool | What it was used for |
| --- | --- |
| Claude Code (Anthropic) | AI coding tool. It wrote and changed the app's code, the build and test scripts and these docs, under the team's direction and review. |
| ElevenLabs | AI voice for the promo video's narration (voice "Jessica", model `eleven_v3`). |
| Higgsfield | AI image generation for three background stills in the promo video: hands with crayons, a phone snapping a drawing, and a wide table shot. The child's drawing in them is composited in by code, not generated. |
| Remotion (code) | The promo video's edit, motion graphics, music and sound effects. The music and effects are synthesized from oscillators in code; no AI music model was used. |

The footage in the promo video is filmed from the real app running its own
on-device models, plus the owner's own iPhone screen recording.
