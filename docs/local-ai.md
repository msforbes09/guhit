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

The OS's own voices through the Web Speech API (offline-safe). On macOS:
narrator "Samantha"; character "Tessa" at a higher pitch. The first `speak()`
needs a user gesture on the page (a tap) because of browser autoplay rules.

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
  models without a code change.
- `npm run lab:sample` (macOS) makes the Whisper test clip.
- Slow Hugging Face downloads: `node scripts/mirror-models.mjs` copies the
  models into `public/models` (gitignored, never committed), then open the app
  once with `?models=local` to load them from this machine's server
  (`?models=hub` switches back). Cached models are keyed by URL, so pick one
  source per browser and stick to it.
