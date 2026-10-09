# Amendment 1 to the promo brief

## 1. Narration voice

- The narrator is an ElevenLabs voice, not Kokoro. The character's own replies in
  the app footage stay the real on-device Kokoro voice (that is the product).
- `video/scripts/voice.mjs` reads `ELEVENLABS_API_KEY` and
  `ELEVENLABS_VOICE_NARRATOR` via `node --env-file=video/.env`. The `.env` file is
  created by hand, never opened, printed or committed (`video/.gitignore` covers it).
- Default voice id: `0AqGYCQmBK5Md93Th9nF` (upbeat and friendly) unless another id
  is given.
- One mp3 per narration line so timing stays adjustable; the mp3s are committed
  as assets.
- Until the key exists, Kokoro lines stand in as placeholders.

## 2. Structure (reference reel grammar)

- Hook question over the real app in the first 2 s.
- Live interaction: snap → cut-out.
- Progress steps ticking: Guhit's real setup screen loading its models, sped up.
- A result card.
- Hard cut to a one-line problem.
- Logo reveal on a soft gradient.
- Then one idea per ~3 s with a short caption.
- A bold kinetic title card.
- A simple architecture diagram: a phone outline with everything inside it
  (camera → cut-out → seeing eyes (Florence-2) → story helper (LLM) → voice
  (Kokoro)), and a crossed-out cloud outside ("nothing leaves the device").
  It plays during the 40–50 s "all the AI runs right here" line, next to or
  alternating with the airplane-mode slot.
- Plain maker end card: "Kaya Randomized".
- Pacing about 3 scenes per 10 s, roughly 18–20 scenes in 60 s.
- The approved narration lines stay word for word.

## 3. Generated stills

- A few generated stills (a child's hands with crayons over paper; a hand holding
  a phone over the paper) with a blank area on the paper will land in
  `assets/video-gen/` of the main checkout.
- The REAL `tala-dragon.png` is composited onto the paper (corner-pin/perspective,
  multiply blend, slight grain) so the drawing is exactly the app's.
- Until they arrive, a simple paper-texture stand-in is used.
