// Copies the brand and sample artwork the video uses into video/public/.
// assets/ is not in git: it is read from the main checkout (pass another
// assets folder as the first argument). The app's public/og and public/icons
// come from this worktree.
//
//   node scripts/copy-assets.mjs [/path/to/guhit/assets]
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const video = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(video, "..");
const assets = process.argv[2] ?? "/Volumes/Developer/Projects/Mira/projects/guhit/assets";
if (!existsSync(assets)) throw new Error(`No assets folder at ${assets}`);

const plan = [
  [join(assets, "logo", "final"), join(video, "public", "brand", "logo")],
  [join(assets, "splash-proto"), join(video, "public", "brand", "splash")],
  [join(assets, "test-drawings"), join(video, "public", "drawings")],
  [join(app, "public", "og"), join(video, "public", "brand", "og")],
  [join(app, "public", "icons"), join(video, "public", "brand", "icons")],
];

for (const [from, to] of plan) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (!/\.(svg|png|html)$/.test(name)) continue;
    copyFileSync(join(from, name), join(to, name));
    console.log(`${join(from, name)} → ${join(to, name)}`);
  }
}
