// Quick look at single frames without a full render (one bundle, many stills).
//   node scripts/stills.mjs Guhit16x9 12.5 20.1 37   (seconds)
//   → out/stills/<comp>-<seconds>.jpg
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const video = join(dirname(fileURLToPath(import.meta.url)), "..");
const [id = "Guhit16x9", ...seconds] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: join(video, "src", "index.ts") });
const composition = await selectComposition({ serveUrl, id });
const outDir = join(video, "out", "stills");
mkdirSync(outDir, { recursive: true });
for (const s of seconds) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
  const output = join(outDir, `${id}-${s}.jpg`);
  await renderStill({ composition, serveUrl, output, frame, imageFormat: "jpeg", jpegQuality: 85 });
  console.log(output);
}
