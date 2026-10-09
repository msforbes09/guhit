# Guhit promo: shot list (16:9, 59.7 s)

Times are from the current edit (`node scripts/review.mjs` writes the exact ones to
`out/edit.json`; they shift by themselves when the narration or footage changes).
Narration is word for word the approved script. Every narrated line is burned in, as
a caption or as the big on-screen words.

**Real AI vs preview.** Every AI output on screen and in the sound is real, made on
this computer by Guhit's own on-device models while filming (WebGPU, models loaded
from the local mirror, no network). Test mode (`?mock=1`) was not used anywhere. What
is still preview: the airplane-mode slot (placeholder card) and the "kind" of the
three quick-cut friends (set by the capture script; see shots 10–12). The narrator is
ElevenLabs "Jeni" (speed 0.85; "Guhit" said goo-HEET), every take checked word for
word by Whisper (`scripts/check-voice.mjs`). Each line's caption stays inside its own
shot (no caption across a cut).

| # | Time (s) | Shot | Narration / caption | Source | Real AI? |
|---|---|---|---|---|---|
| 1 | 0.00–1.40 | Child's hand with crayon; Tala the dragon colours itself onto the paper | "What if every drawing had a friend inside?" | Generated still `hands-crayon` + the real `tala-dragon.png` corner-pinned (multiply, scene light); colour-in wipe is a video effect | No AI (illustrative) |
| 2 | 1.40–2.30 | Hands holding a phone over the drawing; flash + shutter | (same line) | Generated still `phone-snap` + real drawing | No AI (illustrative) |
| 3 | 2.30–4.60 | The real app: Tala on the meadow, waving hello | (same line) | `footage/hero.mp4`, meet screen (crop below the speech bubble) | Real app animation of the child's own drawing |
| 4 | 4.60–7.04 | Hard cut, ink background: "Most AI imagines **for** kids." ("for" circled in crayon) | "Most AI imagines for kids." | Motion type | — |
| 5 | 7.04–9.49 | "Guhit makes kids **imagine.**" (rainbow crayon letters) | "Guhit makes kids imagine." | Motion type | — |
| 6 | 9.49–13.39 | Logo reveal on a soft gradient: printed wordmark draws on, the crayon hops in as the "i", the creature is scribbled on, wakes, bounces, waves and hops off; "Draw it. Watch it wake up." | (music only) | Guhit logo artwork (`assets/logo/final`), animated in `src/components/Splash.tsx` (no cursive) | — |
| 7 | 13.39–15.29 | Phone screen: live camera viewfinder of the drawing on the table → tap Snap → flash | "Snap your drawing." Tag: "Snap!" | `hero.mp4` (camera = Chrome fake webcam showing the real drawing on paper on the table) | Real app |
| 8 | 15.29–17.85 | Scissors over the photo ("Cutting out your friend…") → "Is this your friend?" with the bouncing cut-out | "Guhit cuts it out, and brings it to life." Tags: "Cut out." "Same drawing." | `hero.mp4` | Real on-device cut-out (Guhit's classical pipeline) |
| 9 | 17.85–19.89 | Tap "Yes, that's my friend!" → it lands on its meadow | (same line) Tag: "It wakes up!" | `hero.mp4` (0.85× speed) | Real app |
| 10 | 19.89–22.23 | Beep the robot drives across its meadow | "It moves like what it is." Tag: "Vroom!" | `footage/move-vehicle.mp4` (laptop size) | Real animation; **kind = vehicle set by the capture script** |
| 11 | 22.23–24.21 | Lily (girl with a flower) sways like a plant | Tag: "Sway…" | `move-plant.mp4` | Real animation; **kind = plant set by the capture script** |
| 12 | 24.21–26.29 | Tala flies up and away | Tag: "Whoosh!" | `move-flyer.mp4` | Real animation; **kind = flyer set by the capture script** (the app's word list makes a dragon a walking creature today) |
| 13 | 26.29–29.04 | "Taking a good look…" → "Hmm, let me look…" | "It even guesses what you drew." Tag: "Hmm…" | `hero.mp4` | Real (Florence-2 working) |
| 14 | 29.04–32.64 | Bubble: "Am I a purple dragon with horns on it?", said out loud by Tala | Tag: "It guesses." Badge: "Seeing eyes · on this device" | `hero.mp4` with its recorded sound | **Real**: Florence-2-large guess, Kokoro `af_bella` voice |
| 15 | 32.64–35.64 | Hold the mic: "I'm listening…" | "Hold to talk, and your friend talks back." Tag: "Hold to talk." Badge: "Listening ears · on this device" | `hero.mp4` (the child's line is macOS `say` fed as the microphone; not in the video's sound) | Real Whisper base.en heard "Tala, can you fly?" |
| 16 | 35.64–40.00 | Tala answers out loud: "I can fly! How about you?" (also shown large) | Tag: "It talks back!" Badge: "Story helper + voice · on this device" | `hero.mp4` with its recorded sound | **Real**: Qwen3-1.7B reply, Kokoro voice |
| 17 | 40.00–43.00 | **Placeholder card**: "Airplane-mode phone recording goes here" over blurred app footage | "No internet? Still works." | Becomes `footage/airplane.mp4` when dropped in | Preview placeholder |
| 18 | 43.00–46.50 | Guhit's real setup screen loading all four models (timelapse) → "Guhit is ready. It now works without internet." | "All the AI runs right here, on the device." | `footage/setup.mp4`: the real `/setup` run, 25.2 s, squeezed to ~2.5 s | Real model load (2.2 GB) |
| 19 | 46.50–50.20 | Diagram: a phone with Camera → Cut-out → Seeing eyes (Florence-2) → Story helper (Qwen3 LLM) → Voice (Kokoro) inside it; a crossed-out cloud outside: "Nothing leaves the device" | "Nothing your child draws or says ever leaves it." | Motion graphic | — |
| 20 | 50.20–54.60 | Bold title card: "No cloud." "No account." "Just crayons." | (the words themselves) | Motion type | — |
| 21 | 54.60–57.40 | Guhit logo + "Every drawing has a friend inside." | (the words themselves) | Logo artwork | — |
| 22 | 57.40–59.70 | Maker card: Kaya Randomized mark + wordmark, "guhit.iam4bs.dev" | (music ends) | Kaya Randomized brand | — |

## Sound

- Narration: ElevenLabs "Jeni", one mp3 per line (`public/voice/narration/`), each
  normalised to -16 LUFS and placed by `src/timeline.ts`. Without a key the same script
  makes Kokoro `af_heart` placeholders.
- The friend's voice (shots 14, 16) is the app's own Kokoro output recorded while filming.
- Music: original chiptune, 100 BPM, sections follow the cut (sparse under the problem
  statement, full at the logo and title card, calmer for the offline part); ducked under
  every voice.
- 8-bit effects: shutter on both snaps, pops, sparkles on the logo and end card, boings on
  the moves, ticks on the diagram steps, a buzz when the cloud is crossed out, a ding on
  "Guhit is ready".

## Not done in this preview

- "Blinks" in the opening (shot 3): the app's renderer has no blink; Tala waves (real). The
  logo creature blinks in shot 6.
- Airplane-mode recording: placeholder card until `footage/airplane.mp4` exists.
- 9:16: composition exists (`Guhit9x16`), to be rendered and reviewed after the 16:9 is approved.
