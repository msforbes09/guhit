// Shots "move-*" (laptop, 1280x800 @1.5): each sample drawing comes alive
// and does its own move: a vehicle drives, a plant sways, a flyer flies, a
// creature walks. No AI output is on screen in these shots.
//
// The drawings go through the real snap screen (photo upload) and the real
// cut-out. What each one IS (its "kind") normally comes from the child's
// words or the drawing guess; for these quick cuts the capture script sets it
// directly on the saved friend, so every run shows the same moves. The models
// are not woken for these shots (no greeting, no GPU load while filming).
//   node capture/moves.ts
import { join } from "node:path";
import { acceptFriend, debugShot, friendIdFromUrl, patchFriend, resetDatabase, snapFromFile, url, waitPreview, waitSplashGone } from "./app.ts";
import { LAPTOP, launch, Recorder, sleep, VIDEO } from "./lib.ts";

const SHOTS = [
  { drawing: "robot-on-table", name: "Beep", kind: "vehicle", description: "a robot car", move: "Drive", idle: 1.2, hold: 5.5 },
  { drawing: "flower-girl-thin-lines", name: "Lily", kind: "plant", description: "a flower", move: "Dance", idle: 3.5, hold: 3.5 },
  { drawing: "tala-dragon", name: "Tala", kind: "flyer", description: "a purple dragon with wings", move: "Fly", idle: 1.2, hold: 6.5 },
  { drawing: "cat-uneven-light", name: "Mimi", kind: "creature", description: "an orange cat", move: "Walk", idle: 1.2, hold: 5.5 },
] as const;

const only = process.argv[2];
const { context, page } = await launch({ device: LAPTOP });
try {
  await resetDatabase(page);
  // Keep the on-device models asleep while filming moves (restored below).
  await page.evaluate(() => localStorage.removeItem("guhit:ready"));
  for (const shot of SHOTS) {
    if (only && !shot.kind.startsWith(only)) continue;
    await page.goto(url("/snap"));
    await waitSplashGone(page);
    await snapFromFile(page, join(VIDEO, "public", "drawings", `${shot.drawing}.png`));
    await waitPreview(page);
    await sleep(800);
    await acceptFriend(page);
    const id = friendIdFromUrl(page);
    await patchFriend(page, id, { name: shot.name, description: shot.description, kind: shot.kind });
    await page.goto(url(`/friend?id=${encodeURIComponent(id)}`));
    const button = page.getByRole("button", { name: shot.move, exact: true });
    await button.waitFor();
    await waitSplashGone(page);
    await sleep(1200);
    const rec = new Recorder(page, `move-${shot.kind}`);
    await rec.start();
    await sleep(shot.idle * 1000);
    rec.mark("move");
    await button.click();
    await sleep(shot.hold * 1000);
    await rec.stop();
  }
} catch (error) {
  await debugShot(page, "moves");
  throw error;
} finally {
  await page.evaluate(() => localStorage.setItem("guhit:ready", "1")).catch(() => {});
  await context.close();
}
