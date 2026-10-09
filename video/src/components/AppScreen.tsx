// Real app footage as a floating, tightly cropped screen: no device frame,
// a slight 3D tilt, slow drift, optional crop-zoom, a soft long shadow.
import type { CSSProperties, ReactNode } from "react";
import { interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { LONG_SHADOW } from "../theme";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AppScreenProps {
  /** Path under public/ (footage/hero.mp4). */
  src: string;
  /** Seconds into the clip where this shot starts. */
  from: number;
  /** Source frame size in pixels. */
  source: { w: number; h: number };
  /** Visible part of the source at the start and end of the shot (crop-zoom between them). */
  crop: Rect;
  cropEnd?: Rect;
  /** On-screen height of the window in px; its width follows the crop's aspect. */
  height: number;
  /** Position of the window centre on the canvas. */
  x?: number;
  y?: number;
  tilt?: { x: number; y: number };
  /** Gentle movement over the shot (px and degrees). */
  drift?: number;
  radius?: number;
  volume?: number;
  playbackRate?: number;
  style?: CSSProperties;
  children?: ReactNode;
}

const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
});

export function AppScreen({
  src,
  from,
  source,
  crop,
  cropEnd,
  height,
  x,
  y,
  tilt = { x: 4, y: -10 },
  drift = 1,
  radius = 44,
  volume = 0,
  playbackRate = 1,
  style,
  children,
}: AppScreenProps) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H, durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateRight: "clamp" });
  // The window keeps the start crop's aspect; a zoomed crop scales the video inside it.
  const view = cropEnd ? lerpRect(crop, cropEnd, t) : crop;
  const winH = height;
  const winW = (crop.w / crop.h) * height;
  const scale = winH / view.h;
  const cx = x ?? W / 2;
  const cy = y ?? H / 2;
  const s = frame / fps;
  const rx = tilt.x + Math.sin(s * 0.7) * 1.2 * drift;
  const ry = tilt.y + Math.sin(s * 0.5 + 1) * 2 * drift;
  const dy = Math.sin(s * 0.9) * 8 * drift;
  return (
    <div
      style={{
        position: "absolute",
        left: cx - winW / 2,
        top: cy - winH / 2 + dy,
        width: winW,
        height: winH,
        transform: `perspective(2400px) rotateX(${rx}deg) rotateY(${ry}deg)`,
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          overflow: "hidden",
          boxShadow: LONG_SHADOW,
          background: "#FFF8EC",
        }}
      >
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={Math.round(from * fps)}
          volume={volume}
          playbackRate={playbackRate}
          muted={volume === 0}
          style={{
            position: "absolute",
            left: -view.x * scale,
            top: -view.y * scale,
            width: source.w * scale,
            height: source.h * scale,
            maxWidth: "none",
          }}
        />
      </div>
      {children}
    </div>
  );
}
