# Guhit promo: shot list (16:9, 59.50 s)

Times are from the current edit (`out/edit.json`, written by `scripts/review.mjs`; this
table by `scripts/script-md.mjs`). They shift by themselves when the narration or the
footage changes. Narration is word for word the approved script. Every narrated line is
burned in, as a caption or as the big on-screen words, and each caption stays inside its
own shot.

**Real AI vs preview.** Every AI output on screen and in the sound is real, made on this
computer by Guhit's own on-device models while filming (WebGPU, models from the local
mirror, no network). Test mode (`?mock=1`) was not used anywhere. Still preview: the
airplane-mode slot (placeholder card), the "kind" of the three quick-cut friends (set by
the capture script; shots 9–11), and the setup list clip (interim, until the final build is filmed).
The narrator is ElevenLabs "Jeni" (speed 0.85; "Guhit" said goo-HEET), every take checked
word for word by Whisper (`scripts/check-voice.mjs`).

| # | Time (s) | Shot | Narration / caption | Source | Real AI? |
|---|---|---|---|---|---|
| 1 | 0.00–1.30 | Child's hand with crayon; Tala the dragon colours itself onto the paper | "What if every drawing had a friend inside?" | Generated still `hands-crayon` + the real `tala-dragon.png` corner-pinned (multiply, scene light); colour-in wipe is a video effect | No AI output (illustrative) |
| 2 | 1.30–2.15 | Hands holding a phone over the drawing; flash + shutter | (same line) | Generated still `phone-snap` + the real drawing | No AI output (illustrative) |
| 3 | 2.15–4.40 | The real app: Tala on the meadow, waving hello | (same line) | `hero.mp4`, meet screen (crop below the speech bubble) | Real app animation of the child's own drawing |
| 4 | 4.40–6.84 | Hard cut, ink background: "Most AI imagines **for** kids." ("for" circled in crayon) | "Most AI imagines for kids." | Motion type | — |
| 5 | 6.84–9.29 | "Guhit makes kids **imagine.**" (rainbow crayon letters) | "Guhit makes kids imagine." | Motion type | — |
| 6 | 9.29–12.89 | Logo reveal: printed wordmark draws on (i included), the crayon hops in as the "i", the creature is scribbled on, wakes, bounces, waves and hops off; "Draw it. Watch it wake up." | (music only) | Guhit logo artwork, animated in `src/components/Splash.tsx` (no cursive) | — |
| 7 | 12.89–14.79 | Phone screen: live camera viewfinder of the drawing on the table → tap Snap → flash | "Snap your drawing." Tag: "Snap!" | `hero.mp4` (camera = Chrome fake webcam showing the real drawing on paper on the table) | Real app |
| 8 | 14.79–17.30 | Scissors over the photo ("Cutting out your friend…") → "Is this your friend?" with the cut-out bouncing on its meadow | "Guhit cuts it out, and brings it to life." Tags: "Cut out." "Same drawing." | `hero.mp4` | Real on-device cut-out (Guhit's classical pipeline) |
| 9 | 17.30–19.65 | Beep the robot drives across its meadow | "It moves like what it is." Tag: "Vroom!" | `move-vehicle.mp4` (laptop size) | Real animation; **kind = vehicle set by the capture script** |
| 10 | 19.65–21.35 | Lily (girl with a flower) sways like a plant | Tag: "Sway…" | `move-plant.mp4` | Real animation; **kind = plant set by the capture script** |
| 11 | 21.35–23.20 | Tala flies up and away | Tag: "Whoosh!" | `move-flyer.mp4` | Real animation; **kind = flyer set by the capture script** (the app's word list makes a dragon a walking creature today) |
| 12 | 23.20–25.85 | "Taking a good look…" → "Hmm, let me look…" | "It even guesses what you drew." Tag: "Hmm…" | `hero.mp4` | Real (the seeing eyes working) |
| 13 | 25.85–29.30 | Bubble: "Am I a purple dragon with horns on it?", said out loud by Tala | Tag: "It guesses." Badge: "Seeing eyes · on this device" | `hero.mp4` with its recorded sound | **Real**: Florence-2 guess, Kokoro voice |
| 14 | 29.30–32.30 | Hold the mic: "I'm listening…" | "Hold to talk, and your friend talks back." Tag: "Hold to talk." Badge: "Listening ears · on this device" | `hero.mp4` (the child's line is macOS `say` fed as the microphone; not in the video's sound) | Real: Whisper heard "Tala, can you fly?" |
| 15 | 32.30–36.31 | Tala answers out loud: "I can fly! How about you?" (also shown large) | Tag: "It talks back!" Badge: "Story helper + voice · on this device" | `hero.mp4` with its recorded sound | **Real**: Qwen3-1.7B reply, Kokoro voice |
| 16 | 36.31–39.11 | **Placeholder card**: "Airplane-mode phone recording goes here" over blurred app footage | "No internet? Still works." | Becomes `footage/airplane.mp4` when dropped in | Preview placeholder |
| 17 | 39.11–44.11 | The real setup screen's parts list (Story helper, Listening ears, Seeing eyes, Voice): sizes, bars filling, each row turning "Ready" (sped up); headline "Downloaded once. Runs on this device." | "All the AI runs right here, on the device." Badge: "The real setup screen · sped up" | `footage/setup-list.mp4` (**interim**: cut from the earlier full-page setup recording; recapture on the final build) | Real model load (28.1 s) |
| 18 | 44.11–47.51 | Each part matched to its moment: seeing eyes → the guess; listening ears → hold to talk; story helper → the replies and stories; voice → it speaks | (music + ticks) "→ guesses what was drawn", "→ hears your child talk", "→ thinks up every reply and story", "→ says it out loud" | Part rows from `footage/setup-row-*.png`, moments from `hero.mp4` | Real app moments |
| 19 | 47.51–51.21 | Diagram: a phone with Camera → Cut-out → Seeing eyes (Florence-2) → Listening ears (Whisper) → Story helper (Qwen3 LLM) → Voice (Kokoro) inside it; a crossed-out cloud outside: "Nothing leaves the device" | "Nothing your child draws or says ever leaves it." | Motion graphic | — |
| 20 | 51.21–54.61 | Bold title card: "No cloud." "No account." "Just crayons." | (the words themselves) | Motion type | — |
| 21 | 54.61–57.41 | Guhit logo + "Every drawing has a friend inside." | (the words themselves) | Logo artwork | — |
| 22 | 57.41–59.51 | Maker card: Kaya Randomized mark + wordmark, "guhit.iam4bs.dev" | (music ends) | Kaya Randomized brand | — |

## Sound

- Narration: ElevenLabs "Jeni", one mp3 per line (`public/voice/narration/`), each
  normalised to -16 LUFS and placed by `src/timeline.ts`. Without a key the same script
  makes Kokoro `af_heart` placeholders.
- The friend's voice (guess and answer shots) is the app's own Kokoro output recorded
  while filming.
- Music: original chiptune, 100 BPM, sections follow the cut; ducked under every voice.
- 8-bit effects: shutter on both snaps, pops, sparkles on the logo and end card, boings on
  the moves, ticks on the diagram steps and the parts beat, a buzz when the cloud is
  crossed out, a ding when every setup row says "Ready".

## Not done yet

- "Blinks" in the opening: the app's renderer has no blink; Tala waves (real). The logo
  creature blinks.
- Airplane-mode recording: placeholder card until `footage/airplane.mp4` exists.
- Final-app recapture (setup list, hero, moves): waits for the final build.
- 9:16: composition exists (`Guhit9x16`), to be rendered and reviewed on request.
