# Local AI engine: how screens use it

Everything goes through `getAI()` from `@/lib/ai` (the `LocalAI` interface in
`src/lib/ai/types.ts`). It returns the real on-device engine, or the canned
`MockAI` when the page was opened with `?mock=1` (kept for the tab session;
`?mock=0` switches back).

## Loading

- A parent runs `/setup` once ("Get Guhit ready"). A successful load sets
  `localStorage["guhit:ready"] = "1"`; a failed load clears it.
- Kid screens call `getAI().load(onProgress)` only when that flag is set. The
  engine also refuses to start a download by itself without the flag: any call
  (`reply`, `transcribe`, …) before setup throws "Guhit is not set up…".
- Once the models are cached, `load()` takes seconds and works offline.
- Device tiers, by what the browser really offers (`src/lib/ai/device.ts`):
  a WebGPU adapter is the GPU tier (Qwen3-1.7B on laptops, Qwen3-0.6B on
  phones; the f32 builds when the GPU lacks shader-f16). No WebGPU, no adapter
  or a GPU that fails to start is the CPU tier: Qwen3-0.6B as 8-bit ONNX
  through Transformers.js (`src/lib/ai/llm-cpu.ts`), Whisper and Florence-2
  base on wasm, the wasm voice. When WebLLM cannot use a GPU the page found,
  the story helper moves to the CPU on that device from then on.
- Setup survives sleep and leaving: the screen is kept awake, finished files
  stay cached, and while `localStorage["guhit:setup-in-progress"]` is set the
  page carries on by itself when it is back on screen or online. Where
  Background Fetch exists (Chrome), the browser downloads the missing files
  itself and the service worker stores them under each library's cache key.

## The talk loop (character chat)

```ts
const ai = getAI();
const text = await ai.transcribe(blob);              // push-to-talk recording
const answer = await ai.reply(character, history, text);
await ai.speak(answer, "character");                 // resolves when the voice finishes
```

`reply()` streams: the character starts speaking its first sentence while
the rest is still being written. Calling `speak(answer, "character")` right
after joins the speech already playing (it does not start over), so the
pattern above works for both the real engine and the mock. `stopSpeaking()`
cuts it off. Replies are 1–2 short sentences, filtered for safety and for
"I am an AI" slips; if a reply is filtered out, a friendly fallback line is
used.

Pass `childSays = ""` with an empty history to get the character's greeting
when it first comes alive.

## Guessing the drawing

```ts
const { label } = await getAI().describeDrawing(cut.png); // e.g. "a purple dragon with wings"
```

Florence-2 captions the cut-out on white paper; the caption is trimmed to a
short noun phrase ("A cartoon drawing of …" and "on a white background" are
removed) for "Is that …?". An empty `label` means no guess (model not
available, nothing safe to say): ask the child instead. The drawing itself is
never changed.

## Safety (inside the engine, screens cannot skip it)

`src/lib/ai/safety.ts` screens three things with word lists (plurals, leetspeak
such as "k1ll" or "sh*t", English and common Tagalog swearing):

- what the child says, before it reaches a model: blocked input gets a kind,
  in-character change of subject instead of an answer ("Let's talk about
  something happy!…"; for phone numbers, addresses, schools: "That's a secret
  for grown-ups!…"); story pages say the character thought about happy things;
- every sentence a model writes, before it is shown or spoken: a blocked
  sentence is replaced and generation stops;
- drawing guesses: `describeDrawing()` returns `{ label: "", flagged }`.

Storybook adventure passes (swords, knights, dragons, monsters, pirates,
bow and arrow, "shooting star", "leche flan"); guns, bombs, stabbing, blood,
nudity, drugs, alcohol, swearing and personal details are blocked. The
cases are in `src/lib/ai/safety-cases.ts` and run in `/lab` ("Safety tests").

## Story mode

`firstQuestion(character)`, then per turn `writePage(story, question, answer)`
and `nextQuestion(story)`, and `titleFor(story)` at the end. Narration uses
`speak(text)` (narrator voice).

## Voices

Kokoro-82M, a neural voice that runs on the device (`src/lib/ai/voice/`,
`src/workers/tts.worker.ts`): WebGPU in full precision on laptops, the CPU
(8-bit) on phones. Narrator `af_heart`, character `af_bella` a semitone higher;
`/lab` switches voices, speed and pitch, or the engine. Sentences are voiced
one at a time and played back to back through Web Audio, so the first words
start while the rest is still being made.

The OS's own voices (Web Speech API; on macOS narrator "Samantha", character
"Tessa") take over automatically. When Kokoro is not downloaded, fails to load
(it is retried once on its own after the other models), errors, produces
invalid audio, or measures slower than speech on the CPU (most phones), the
session stays on the OS voice. A sentence that is merely slow (over 4 s; 12 s
for the first message after load or after the vision model ran) sends only
that message to the OS voice, and the next message tries Kokoro again; three
slow messages in a row keep the OS voice for the session. Kokoro is warmed
up at load, once more when every model is in, and after each drawing guess.
`/lab?ttsTimeout=<ms>` forces the timeout to test this. Kid screens
never start the Kokoro download: only `/setup` (or `/lab`) does. The first
`speak()` needs a user gesture on the page (a tap) because of browser
autoplay rules.

To move a mouth with the voice, poll `speechLevel()` (0..1, smoothed, 0 when
silent) every animation frame, and use `onSpeechStart(cb)` (returns its
unsubscribe) to know when sound actually starts rather than when `speak()`
was called:

```ts
const off = ai.onSpeechStart((voice) => setTalking(voice));
const tick = () => { mouth.style.scale = `1 ${1 + ai.speechLevel()}`; raf = requestAnimationFrame(tick); };
```

## Offline

A service worker (production builds only) stores the app pages (`/`, `/snap`,
`/draw`, `/friend`, `/friends`, `/story`, `/book`, `/setup`, `/lab`) and all
static files. Kid routes keep ids in the query string, so one cached page serves
every id. Model weights stay in the libraries' own caches.

## Testing and speed

- `/lab`: speed test (load time, reply latency to first spoken word, page
  time, tokens/s, Whisper time). `?llm=`, `?stt=`, `?sttDevice=wasm` compare
  models without a code change; `?gpu=off` runs the CPU tier on any computer
  (remembered until `?gpu=on`).
- `npm run lab:sample` (macOS) makes the Whisper test clip.
- Model downloads come from Guhit's R2 copy (`R2_BASE` in
  `src/lib/ai/model-fetch.ts`) with Hugging Face as the per-file fallback;
  `?models=hf` uses Hugging Face only. The cache keys stay the Hugging Face
  URLs either way.
- No internet, or a slow one: `node scripts/mirror-models.mjs` copies every
  tier's models into `mirror/models` (gitignored, never committed), `npm run
  serve` serves the build plus the mirror, and `?models=local` loads from it.
  The mirror's files have their own cache keys, so pick one source per
  browser and stick to it.
- `ISOLATE=1 npm run serve` adds the headers that make the page cross-origin
  isolated, so ONNX Runtime can use several CPU threads.
