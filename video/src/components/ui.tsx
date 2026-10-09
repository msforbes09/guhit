import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BODY, C, DISPLAY, GRAIN } from "../theme";

export const isPortrait = (w: number, h: number) => h > w;

/** Soft gradient of the app's sky and paper, with a slow colour drift and paper grain. */
export function SoftGradient({ hue = "sky" }: { hue?: "sky" | "sun" | "grape" | "cream" }) {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 6;
  const stops: Record<typeof hue, [string, string, string]> = {
    sky: [C.skyTop, C.cream, C.skyBottom],
    sun: ["#FFE7A6", C.cream, "#FFD9C7"],
    grape: ["#E6DBFF", C.cream, "#FFE1EC"],
    cream: [C.cream, C.paper, C.paperDeep],
  };
  const [a, b, c] = stops[hue];
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at ${30 + drift}% ${20 - drift}%, ${a} 0%, ${b} 55%, ${c} 100%)`,
      }}
    >
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.9 }} />
    </AbsoluteFill>
  );
}

/** Burned-in caption for the narration: big, rounded, always readable. */
export function Subtitle({ text, style }: { text: string; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 18, stiffness: 180 } });
  const portrait = isPortrait(width, height);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          marginBottom: portrait ? 260 : 64,
          maxWidth: portrait ? 940 : 1480,
          padding: portrait ? "22px 36px" : "18px 40px",
          borderRadius: 999,
          background: "rgba(255,248,238,0.94)",
          boxShadow: "0 18px 40px -18px rgba(42,34,56,0.55)",
          color: C.ink,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: portrait ? 50 : 46,
          lineHeight: 1.15,
          textAlign: "center",
          opacity: interpolate(pop, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(pop, [0, 1], [24, 0])}px)`,
          ...style,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

/** A short idea label beside the footage ("Snap.", "Cut out.", "Alive!"). */
export function IdeaTag({ children, color = C.orange, delay = 0, style }: { children: ReactNode; color?: string; delay?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontWeight: 900,
        fontSize: 120,
        lineHeight: 0.95,
        letterSpacing: "-0.02em",
        color,
        transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])}) rotate(${interpolate(pop, [0, 1], [-6, -2])}deg)`,
        opacity: interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
        textShadow: "0 10px 30px rgba(42,34,56,0.18)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Small grey note under an idea (what the viewer is looking at). */
export function Note({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 36, color: C.inkSoft, lineHeight: 1.3, ...style }}>{children}</div>
  );
}

/** White flash for a camera snap. */
export function Flash({ at, length = 8 }: { at: number; length?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 1, at + length], [0, 0.95, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: "white", opacity: o, pointerEvents: "none" }} />;
}

/** Fades a scene in and out over a few frames so cuts never flash black. */
export function FadeEdges({ children, inFrames = 0, outFrames = 0, duration }: { children: ReactNode; inFrames?: number; outFrames?: number; duration: number }) {
  const frame = useCurrentFrame();
  const a = inFrames ? interpolate(frame, [0, inFrames], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const b = outFrames ? interpolate(frame, [duration - outFrames, duration], [1, 0], { extrapolateLeft: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity: Math.min(a, b) }}>{children}</AbsoluteFill>;
}
