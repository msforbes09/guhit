# Guhit

**Every drawing has a friend inside.**

A child draws on paper and snaps a photo. Guhit cuts the drawing out of the
photo, brings it to life on screen, guesses what it is ("Is that a purple
dragon?"), talks back when the child speaks to it, and turns their ideas into
a storybook starring the drawing. Every AI model runs on the device, in the
browser: no cloud, no account, no sign-up.

Most AI imagines for kids. Guhit makes kids imagine.

## Try it

- **Live:** https://guhit.iam4bs.dev
- **Test mode, no downloads:** https://guhit.iam4bs.dev/?mock=1 — canned AI
  replies, for a quick look at the whole flow. It stays on until you open any
  page with `?mock=0`.

The first real visit asks a parent to run **Get Guhit ready** (`/setup`),
which downloads the models once. After that Guhit works offline.

| Device | What to expect |
| --- | --- |
| Laptop, Chrome or Edge with WebGPU | The full experience. The larger story helper (Qwen3-1.7B) runs on the GPU; seeing, listening and the voice (Kokoro at full precision) run on the GPU too. About 1.5 GB to download; Chrome keeps downloading in the background if the tab is closed. |
| Laptop without WebGPU | Works on the CPU instead: a smaller story helper (Qwen3-0.6B), about 1 GB to download. Slower replies. |
| Android, Chrome | Florence-2 for seeing; the phone-sized story helper (Qwen3-0.6B) on the GPU when WebGPU is available, else on the CPU. Parts are set up one at a time; Chrome keeps downloading in the background. On phones with less memory, setup suggests leaving out Talking. |
| iPhone / iPad, Safari | Seeing eyes only by default (about 46 MB): the **light eyes** (MobileCLIP S0 on the CPU) instead of Florence-2, which iOS stopped for memory. The storytelling voice is not offered (too slow there; the device's own voice reads instead). Talking is optional. Downloads happen in the page, so keep it open during setup; the story helper steps aside while the drawing is being guessed. |

Snapping, cutting out and animating the drawing need no model at all and work
on every device.

## How it works

**Snap → cut-out → comes alive → guesses → talk → storybook**

1. **Snap** the drawing with the camera (or draw on screen).
2. **Cut-out**: the drawing is lifted off the paper (shadows, uneven light and
   ruled paper handled), with an optional **AI cut-out** for hard photos and a
   brush to touch it up. The child's own pixels are never redrawn.
3. **Comes alive**: the cut-out gets a simple skeleton and moves on a stage
   ("make it move more" lets the child pick its joints).
4. **Guesses**: the drawing is recognised and the character asks "Is that…?";
   the child confirms or corrects it.
5. **Talk**: push-to-talk (or type) and the character answers in its own voice.
6. **Storybook**: the character asks questions, writes a page from each answer,
   and reads the finished book aloud. Friends and books are saved on the device.

What runs on the device, named as parents see it in setup:

| Part | Model | Runtime |
| --- | --- | --- |
| Seeing eyes (guesses the drawing), Android and laptops | Florence-2 base | Transformers.js / ONNX Runtime Web, WebGPU, CPU (wasm) fallback |
| Light eyes (guesses the drawing), iPhone and iPad | MobileCLIP S0, image half only (`Xenova/mobileclip_s0`, full precision, 46 MB), matched against built-in text embeddings for 69 kid-drawing subjects | Transformers.js / ONNX Runtime Web on the CPU (wasm) |
| AI cut-out | IS-Net (8-bit) | Transformers.js / ONNX Runtime Web, WebGPU, CPU fallback |
| Listening ears (speech to text) | Whisper base.en | Transformers.js / ONNX Runtime Web, WebGPU, CPU fallback |
| Story helper (replies, questions, story pages) | Qwen3-1.7B (laptops) / Qwen3-0.6B (phones) | WebLLM on WebGPU; Qwen3-0.6B 8-bit ONNX on the CPU when there is no usable GPU |
| Voice (narrator and character) | Kokoro-82M (full precision on WebGPU; 8-bit on the CPU) | Transformers.js / ONNX Runtime Web: WebGPU on laptops, CPU (wasm) elsewhere; not offered on iPhone and iPad |

Every model runs in its own Web Worker. Under the hood:

- **Model hosting.** Model files are served from Guhit's own model server
  (`models.iam4bs.dev`, Cloudflare R2), with Hugging Face as the per-file
  backup.
  Every file is kept under 300 MB (the larger CPU language model is split into
  smaller weight files). Downloads retry and resume part-way.
- **Cross-origin isolation.** The site is served with COOP/COEP headers
  (`public/_headers`), so ONNX Runtime can use several CPU threads; the CPU
  voice and story helper run about 2.5× faster.
- **Offline.** A service worker caches the app, and each library keeps its
  model files in Cache Storage, so after setup snap, cut-out and the guess all
  work in airplane mode.
- **Troubleshooting.** "Start log (for a grown-up helping)" in Get ready
  (`/setup`) and "Why no guess?" on the meet screen show what the app did on
  its last starts and why a drawing was not guessed.

## Privacy

Nothing the child draws, says or types leaves the device. There is no backend
and no database: friends and stories live in IndexedDB on the device, and the
only network traffic is the one-time download of the app and the models.
Details: [docs/disclosures.md](docs/disclosures.md).

## Run it locally

Requires Node.js 22 (see `.node-version`).

```bash
npm ci
npm run dev        # development server on http://localhost:3000
npm run build      # static export to out/ (plus the service worker's precache list)
npm run serve      # serves out/ on http://localhost:3101
ISOLATE=1 npm run serve   # same, with the cross-origin isolation headers (multi-threaded CPU inference)
npm run lint
```

`npm run serve` (`scripts/serve-static.mjs`) serves the build the way
Cloudflare Pages does. The service worker only runs in production builds.

For venues with slow internet: `node scripts/mirror-models.mjs` downloads the
models into `mirror/models`; `npm run serve` then serves them at `/models`,
and opening the app once with `?models=local` makes it use that copy.

There is no automated test suite yet; `/lab` holds the in-browser test
benches (models, voices, safety cases) and `/alive-lab` the cut-out and
animation bench.

## Project structure

```
src/
  app/            Pages: / (home), /snap, /draw, /friend, /friends, /story, /book,
                  /setup (parent setup), /lab and /alive-lab (test benches)
  components/
    kid/          The child-facing screens and UI
    alive/        The living character: stage, cut-out touch-up, joint picker
  lib/
    ai/           On-device AI engine: device tiers, model choice and download,
                  prompts, safety filters, voice, test-mode mock
    alive/        Cut-out (classical and AI), skeleton, motion, renderer
    story/        Friends and stories in IndexedDB
    sfx/          Sound effects and the 8-bit babble voice
  workers/        Web Workers: language model (GPU and CPU), speech, vision, voice
scripts/          Build helpers, local server, model mirroring and splitting
public/           Service worker, manifest, icons, Cloudflare Pages headers
```

## Known limitations

- **Talking needs the story helper.** Spoken and typed chat and the storybook
  only work once the Talking part (listening ears and story helper) is set up.
- **The voice needs a fast enough device.** Kokoro runs on the GPU on laptops
  with WebGPU and on the CPU elsewhere, and is not offered on iPhone and iPad.
  Where it measures slower than speech (most phones, older laptops), the
  character talks in playful 8-bit babble and story pages are read by the
  device's simpler built-in voice.
- **iPhones have tight memory.** They guess with the light eyes, which name
  one of 69 kid-drawing subjects rather than describing the drawing freely
  (when none stands out, the child is asked). Heavy parts load one at a time,
  and the first reply after a guess takes longer while the story helper
  reloads.
- **First setup is big.** Up to about 2 GB on laptops (about 1.5 GB with the
  default models), less on phones. Once done it never downloads again.
- **English only** for speech recognition and the voice.

## Licence and credits

Guhit is released under the GNU General Public License v3.0, see
[LICENSE](LICENSE).

It stands on open models and libraries: Qwen3 (Alibaba Qwen), Florence-2
(Microsoft), MobileCLIP (Apple), Whisper (OpenAI), Kokoro-82M (hexgrad),
IS-Net, WebLLM / MLC,
Transformers.js and ONNX Runtime. Every model and library, its licence and
where it comes from is listed in [docs/disclosures.md](docs/disclosures.md).

## How it was built

Guhit's code was written with Claude Code, an AI coding tool, under the team's
direction and review. The promo video's narration is by ElevenLabs, it was
edited in Remotion (music and sound effects synthesized in code), Higgsfield
made three background images, and its footage is the real app plus the
owner's own iPhone screen recording. Details are in
[Tools used to build Guhit](docs/disclosures.md#tools-used-to-build-guhit).
