# Guhit promo video (60 s)

A self-contained [Remotion](https://www.remotion.dev) project (React + TypeScript) for
Guhit's hackathon promo. It never touches the app's own `package.json`, `src/` or
`public/`: it films the real app from its static build and edits the footage here.

- `out/guhit-60s-16x9.mp4`: 1920×1080, 30 fps, H.264 + AAC, ≤ 60.0 s
- `out/guhit-60s-9x16.mp4`: 1080×1920 (second composition, same scenes; render after the 16:9 is approved)
- `SCRIPT.md`: shots, timings, what each shot is filmed from, real AI vs preview
- `CREDITS.md`: voice, music, fonts, models and their licences

## Layout

| Path | What |
|---|---|
| `capture/` | Playwright scripts that film the real app (headed Chrome, WebGPU) |
| `footage/` | Captured clips (`*.mp4`, git-ignored) and their timing marks (`*.json`, committed) |
| `footage/airplane.mp4` | **Swappable slot**: the owner's Android airplane-mode screen recording (any aspect) |
| `audio/synth.mjs` | Original chiptune score + 8-bit sound effects, synthesized to WAV |
| `scripts/voice.mjs` | Narration, one file per line (ElevenLabs with a key, Kokoro placeholders without) |
| `src/narration.json` | The approved narration lines, word for word |
| `src/timeline.ts` | The edit: beats, scenes, narration cues; re-times itself to the narration and footage |
| `src/Promo.tsx` | All scenes, captions and the sound mix (one component for both aspect ratios) |
| `public/` | Brand art, sample drawings, generated stills and narration used by the edit (`public/audio/` is rebuilt by `audio/synth.mjs`, not committed) |

## Re-render (from a fresh clone)

Everything runs on this computer: the app, its models (from the local mirror), the
capture browser, the voice placeholders and the music.

```sh
# 0. The app build and its model mirror (from the repo root, once)
npm ci && npm run build
mkdir -p mirror && ln -s /path/to/mirror/models mirror/models   # the 4.7 GB local model mirror

# 1. The video project
cd video
npm ci
node scripts/copy-assets.mjs /path/to/guhit/assets   # logo, splash, sample drawings, generated stills
node capture/serve-app.mjs &                           # serves ../out + the mirror on http://localhost:3191

# 2. Film the real app (headed Chrome opens; leave it alone while it runs)
node capture/setup.ts --fresh   # /setup loading every model (real timelapse) → footage/setup.mp4
node capture/hero.ts            # snap → cut-out → guess → talk with real on-device AI → footage/hero.mp4
node capture/moves.ts           # drive / sway / fly / walk → footage/move-*.mp4

# 3. Sound
node audio/synth.mjs                                  # music + sound effects (deterministic)
node --env-file-if-exists=.env scripts/voice.mjs      # narration (see "Narrator voice")
node scripts/check-voice.mjs                          # Whisper listens to every take (needs serve-app running)

# 4. Render and review
npx remotion render src/index.ts Guhit16x9 out/guhit-60s-16x9.mp4 --codec=h264 --audio-codec=aac --crf=17
node scripts/review.mjs 16x9   # duration/codecs/loudness, frames every 0.5 s + around cuts, review grids, contact sheet
node scripts/stills.mjs Guhit16x9 12.5 37   # quick single frames without a full render
```

`npx remotion studio src/index.ts` previews and scrubs the edit live.

### The airplane-mode recording

Drop the phone recording in as **`video/footage/airplane.mp4`** (any aspect; a portrait
phone recording is fitted whole over a blurred fill). Re-render: the temporary
"Airplane-mode phone recording goes here" card disappears by itself. It plays muted from
its start for the length of its scene (about 3 s); trim the file to the moment
airplane mode turns on and Guhit keeps working.

### Narrator voice

`scripts/voice.mjs` makes one audio file per line of `src/narration.json` and records
each length in `public/voice/narration.json`; `src/timeline.ts` re-times the cut from
those lengths, so new takes need no hand edits.

- **ElevenLabs** (the chosen narrator): create `video/.env` yourself with
  `ELEVENLABS_API_KEY=…` and optionally `ELEVENLABS_VOICE_NARRATOR=…` (default
  `0AqGYCQmBK5Md93Th9nF`), then `node --env-file=.env scripts/voice.mjs` (any env file
  path works, e.g. one kept in another project; the script never prints the key). `.env`
  is git-ignored; never commit it. Pace: `--speed=0.85` (default; 0.7–1.2). Every line is
  loudness-normalised (two-pass, -16 LUFS), then `node scripts/check-voice.mjs` runs
  Whisper over each take and flags any that differ from the script.
- **Placeholder** (no key): the same command without a key uses Kokoro-82M `af_heart`
  (the app's narrator voice) on this computer. Re-run one line with `--only=hook`.
- "Guhit" is read from a respelling (`say` field in `src/narration.json`) so it is
  pronounced goo-HEET; change it there if needed.

### 9:16

The `Guhit9x16` composition reuses every scene; each scene reads the canvas size and
re-lays itself out. Render it with the same command and `Guhit9x16 out/guhit-60s-9x16.mp4`.

## Capture notes

- The capture browser is Google Chrome (headed, for WebGPU) with its own profile in
  `.capture/profile` (git-ignored), so the models downloaded by `/setup` stay between
  runs. `capture/setup.ts --fresh` starts from an empty profile to film the full load.
- The phone camera is Chrome's fake camera fed with `.capture/media/<drawing>.y4m`: the
  sample drawing on paper on the same wooden table as the opening stills
  (composition `CameraFeed`), with a slow hand-held drift. The child's push-to-talk
  question is macOS `say` played as the fake microphone (only Whisper hears it).
- The friend's voice in the footage is the app's real Kokoro output, tapped from the
  page's Web Audio and muxed into the clip.
- Every clip's `footage/*.json` holds its timing marks (snap, preview, guess, hold,
  heard, …); the edit cuts on those marks, so re-captured footage lines up by itself.
