import { MotionController } from "@/lib/alive/motion";
import { createRenderer } from "@/lib/alive/renderer";
import { analyzeMask, buildMesh } from "@/lib/alive/rig";
import type { AliveMotion, Cutout } from "@/lib/alive/types";

/**
 * Renders a motion at fixed 60 Hz steps through the real WebGL path and
 * lays the frames out side by side, so motions can be reviewed (and frame
 * cost measured) without relying on requestAnimationFrame, which browsers
 * pause in background tabs.
 */
export interface StripRow {
  motion: AliveMotion;
  talking?: boolean;
  /** Tap the character at this many seconds into the row. */
  pokeAt?: number;
}

export async function filmstrip(
  cut: Cutout,
  rows: StripRow[],
  opts: { frames?: number; duration?: number; size?: number } = {},
): Promise<{ url: string; msPerFrame: number; renderer: string }> {
  const frames = opts.frames ?? 10;
  const duration = opts.duration ?? 2.4;
  const size = opts.size ?? 180;
  const canvas = document.createElement("canvas");
  const renderer = createRenderer(canvas);
  renderer.resize(size, size);
  const image = new Image();
  image.src = cut.png;
  await image.decode();
  const rig = analyzeMask(cut.mask);
  renderer.setCharacter(image, buildMesh(cut.mask, rig), rig);

  const place = { centerX: size / 2, groundY: size * 0.9, scale: size * 0.48 };
  const out = document.createElement("canvas");
  out.width = size * frames + 90;
  out.height = size * rows.length;
  const octx = out.getContext("2d")!;
  octx.fillStyle = "#dff1ff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.strokeStyle = "#9cc8e8";
  octx.font = "bold 15px system-ui";

  const dt = 1 / 60;
  const steps = Math.round(duration / dt);
  let work = 0;
  let total = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const y0 = r * size;
    octx.fillStyle = "#3b2a7a";
    octx.fillText(row.motion + (row.talking ? "+talk" : "") + (row.pokeAt !== undefined ? "+tap" : ""), 6, y0 + size / 2);
    for (let i = 0; i < frames; i++) {
      const x0 = 90 + i * size;
      octx.beginPath();
      octx.moveTo(x0 + 0.5, y0);
      octx.lineTo(x0 + 0.5, y0 + size);
      octx.moveTo(x0, y0 + place.groundY + 0.5);
      octx.lineTo(x0 + size, y0 + place.groundY + 0.5);
      octx.stroke();
    }
    const ctrl = new MotionController();
    ctrl.bounds = Math.max(0, size / 2 / place.scale - Math.max(-rig.left, rig.right));
    ctrl.setMotion(row.motion, 0, true);
    let captured = 0;
    let poked = false;
    for (let s = 0; s <= steps; s++) {
      const now = s * dt;
      if (row.pokeAt !== undefined && !poked && now >= row.pokeAt) {
        ctrl.poke(now);
        poked = true;
      }
      const t0 = performance.now();
      const pose = ctrl.update(now, dt, !!row.talking, null);
      renderer.draw(pose, place, true);
      renderer.finish();
      work += performance.now() - t0;
      total++;
      if (captured < frames && s === Math.round((captured / frames) * steps)) {
        octx.drawImage(canvas, 90 + captured * size, y0);
        captured++;
      }
    }
  }
  const kind = renderer.kind;
  renderer.dispose();
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("export failed")))));
  return { url: URL.createObjectURL(blob), msPerFrame: work / total, renderer: kind };
}
