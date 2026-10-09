// Diagnostic: snap one drawing (file or fake camera) and print what the page logs.
//   node capture/diag.ts file|camera
import { clearFriends, debugShot, url } from "./app.ts";
import { launch, PHONE, sleep, VIDEO } from "./lib.ts";
import { cameraFile, MIC_FILE } from "./make-media.ts";
import { join } from "node:path";

const mode = process.argv[2] ?? "file";
const { context, page } = await launch({ device: PHONE, camera: cameraFile("tala-dragon"), mic: MIC_FILE });
page.on("console", (m) => console.log(`  console.${m.type()}: ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => console.log(`  pageerror: ${e.message.slice(0, 300)}`));
await page.addInitScript(() => {
  const settings = MediaStreamTrack.prototype.getSettings;
  MediaStreamTrack.prototype.getSettings = function (this: MediaStreamTrack) {
    const s = settings.call(this);
    return this.kind === "video" ? { ...s, facingMode: "environment" } : s;
  };
});
await page.goto(url("/"));
await clearFriends(page);
await page.goto(url("/snap"));
await sleep(4000);
if (mode === "file") await page.locator('input[type="file"]').setInputFiles(process.argv[3] ?? join(VIDEO, "public", "drawings", "tala-dragon.png"));
else await page.getByRole("button", { name: "Snap the photo" }).click();
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  const h = await page.locator("h2, main p.font-display").first().textContent().catch(() => "");
  if (h && /Is this your friend|Oops/.test(h)) {
    console.log(`  → ${h}`);
    break;
  }
}
await debugShot(page, `diag-${mode}`);
await context.close();
