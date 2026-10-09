// A generated still of a table with blank paper, with the REAL sample
// drawing corner-pinned onto the paper (multiply blend, so the scene's light
// and paper grain show through). The drawing can colour itself in.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { quadMatrix, subQuad, type Quad } from "./quad";

export interface Still {
  src: string;
  w: number;
  h: number;
  /** Paper corners in still pixels: TL, TR, BR, BL. */
  paper: Quad;
}

export const STILLS = {
  handsCrayon: { src: "stills/hands-crayon.jpg", w: 2688, h: 1520, paper: [[1042, 298], [2050, 472], [1818, 1360], [574, 1070]] },
  phoneSnap: { src: "stills/phone-snap.jpg", w: 2688, h: 1520, paper: [[778, 686], [1862, 598], [2042, 1298], [802, 1386]] },
  tableWide: { src: "stills/table-wide.jpg", w: 2688, h: 1520, paper: [[634, 820], [1324, 642], [2092, 990], [1250, 1302]] },
} satisfies Record<string, Still>;

const DRAWING = { src: "drawings/tala-dragon.png", w: 1200, h: 1600 };

/**
 * Coloring-in reveal: bands of crayon strokes, alternating direction, top to
 * bottom. Every band is wound the same way (clockwise), so where neighbouring
 * bands overlap the clip stays filled instead of cancelling into seams.
 */
function revealPath(p: number, w: number, h: number) {
  if (p >= 1) return "none";
  const bands = 9;
  const bh = h / bands;
  let d = "";
  for (let i = 0; i < bands; i++) {
    const local = Math.max(0, Math.min(1, p * bands * 0.75 - i * 0.62));
    if (local <= 0) continue;
    const len = local * (w + 80);
    const y0 = i * bh - 30;
    const y1 = (i + 1) * bh + 30;
    const wob = (k: number) => Math.sin(i * 3.1 + k) * 14;
    if (i % 2 === 0) d += `M -40 ${y0} L ${len - 40 + wob(1)} ${y0} L ${len - 40 + wob(2)} ${y1} L -40 ${y1} Z `;
    else d += `M ${w + 40} ${y0} L ${w + 40} ${y1} L ${w + 40 - len + wob(2)} ${y1} L ${w + 40 - len + wob(1)} ${y0} Z `;
  }
  return d ? `path('${d.trim()}')` : "path('M0 0 Z')";
}

export interface PaperShotProps {
  still: Still;
  /** Where the drawing sits on the paper, in 0..1 paper units (u along the top edge, v down the side). */
  area?: { u0: number; v0: number; u1: number; v1: number };
  /** 0..1 reveal over the shot (1 = fully drawn from the start). */
  revealFrames?: [number, number] | null;
  /** Camera: zoom and focus point (still pixels) at start and end of the shot. */
  camera?: { from: { zoom: number; x: number; y: number }; to: { zoom: number; x: number; y: number } };
  blur?: number;
}

export function PaperShot({ still, area = { u0: 0, v0: 0, u1: 1, v1: 1 }, revealFrames = null, camera, blur = 0 }: PaperShotProps) {
  const frame = useCurrentFrame();
  const { width: W, height: H, durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { easing: Easing.inOut(Easing.quad), extrapolateRight: "clamp" });
  const cam = camera ?? { from: { zoom: 1, x: still.w / 2, y: still.h / 2 }, to: { zoom: 1.06, x: still.w / 2, y: still.h / 2 } };
  const zoom = cam.from.zoom + (cam.to.zoom - cam.from.zoom) * t;
  const fx = cam.from.x + (cam.to.x - cam.from.x) * t;
  const fy = cam.from.y + (cam.to.y - cam.from.y) * t;
  // Cover the canvas, then zoom around the focus point.
  const cover = Math.max(W / still.w, H / still.h) * zoom;
  let left = W / 2 - fx * cover;
  let top = H / 2 - fy * cover;
  left = Math.min(0, Math.max(W - still.w * cover, left));
  top = Math.min(0, Math.max(H - still.h * cover, top));

  const quad = subQuad(still.paper, area.u0, area.v0, area.u1, area.v1);
  const reveal = revealFrames ? interpolate(frame, revealFrames, [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#d9b98f" }}>
      <div style={{ position: "absolute", left, top, width: still.w, height: still.h, transform: `scale(${cover})`, transformOrigin: "0 0", filter: blur ? `blur(${blur}px)` : undefined }}>
        <Img src={staticFile(still.src)} style={{ position: "absolute", inset: 0, width: still.w, height: still.h }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: DRAWING.w,
            height: DRAWING.h,
            transformOrigin: "0 0",
            transform: quadMatrix(quad, DRAWING.w, DRAWING.h),
            mixBlendMode: "multiply",
          }}
        >
          <Img
            src={staticFile(DRAWING.src)}
            style={{
              width: DRAWING.w,
              height: DRAWING.h,
              // Lift the photo's paper to white so only the crayon multiplies onto the scene's paper.
              filter: "brightness(1.07) contrast(1.12) saturate(1.05) blur(0.7px)",
              clipPath: revealPath(reveal, DRAWING.w, DRAWING.h),
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
