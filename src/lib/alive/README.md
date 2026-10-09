# Alive engine

Cuts a child's drawing out of a photo (or an on-screen drawing) and brings it to life on a stage. It never redraws the child's drawing: the classical path only applies a scanner-style paper/lighting correction, and every motion moves the child's own pixels. All of it runs on the device. Test bench: `/alive-lab`.

## Cut-out

```ts
import { cutout, cutoutFromCanvas, loadCutout, preloadAiCutout } from "@/lib/alive";

const cut = await cutout(photoBlobOrDataUrl);          // classical, in a Web Worker, ~0.2–0.5 s
cut.png;                                               // transparent PNG data URL, cropped + padded → store as Character.cutout
cut.meta?.quality;                                     // "good" | "poor"; when "poor", offer a retake or the AI cut-out
const ai = await cutout(blob, { method: "ai", onProgress: setText }); // on-device IS-Net (WebGPU, falls back to wasm)
const fromPad = await cutoutFromCanvas(canvasEl);      // on-screen drawing (white or transparent background)
const again = await loadCutout(character.cutout!);     // stored PNG → Cutout (mask rebuilt from alpha)
await preloadAiCutout(setText);                        // call once while online (e.g. setup) so AI works offline later
```

The classical path handles uneven light, phone shadows, a table around the sheet, and ruled pad paper.

`{ editable: true }` keeps the full frame so `<CutoutTouchUp cutout={cut} onDone={setCut} />` can brush parts back in or out.

## Animation

```tsx
import { AliveStage } from "@/components/alive";

<div style={{ height: 480 }}>
  <AliveStage
    cutout={cut /* or the stored PNG string */}
    motion="idle" /* bounce | walk | jump | dance | sleep | wave */
    talking={isSpeaking}
    level={meter?.level /* optional () => 0..1, read every frame */}
    onTap={() => …}
    joints={joints /* optional, from <JointPicker> ("Make it move more") */}
    characterRef={ref /* ref.current.poke() = happy reaction from code */}
  />
</div>
```

- `AliveStage` fills its parent. `motion="sleep"` turns the sky to night and shows floating z's.
- `AliveCharacter` is the same character on a transparent canvas, for your own backgrounds.
- Keep `cutout` and `joints` referentially stable: a new object on every render reloads the character.
- **Speech sync.** `createLevelMeter(audioCtx)` returns `{ input, level }`. Connect the TTS audio to `input` and pass `level`. Without a level, `talking` plays a speech-like rhythm.
- **Rendering.** WebGL2 mesh deformation draws a grid clipped to the drawing. Without WebGL2 it falls back to Canvas 2D (squash, lean and hop, no bending).

## Offline notes

- The classical cut-out and the animation make no network calls.
- **AI cut-out.** The ONNX Runtime files are served from our own origin (`/ort/`, copied at build time and cached by the service worker, shared with speech recognition). The model is `xrds/isnet-general-onnx-int8` at a pinned revision, about 44 MB, from huggingface.co on first use. Both are kept in Cache Storage (`transformers-cache`). A page that is already open keeps working offline.
- **Fresh offline load.** The service worker must have cached the app's `/_next/static` chunks (including the worker and the Transformers.js chunk) and `/ort/`.

## Licences

| Component | Licence |
|---|---|
| `@huggingface/transformers` 4.3.1 | Apache-2.0 |
| `onnxruntime-web` (its dependency) | MIT |
| Model `xrds/isnet-general-onnx-int8` (ONNX repack) | MIT |
| Base `imgly/isnet-general-onnx` | MIT |
| IS-Net (xuebinqin/DIS) code and weights | Apache-2.0 |

The DIS5K training data has its own terms of use. Everything else here is our own code.
