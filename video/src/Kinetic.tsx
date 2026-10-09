// Kinetic type: the narration's own words, popping in one by one.
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, DISPLAY } from "./theme";

/** A hand-drawn crayon ring that draws itself around a word. */
export function CrayonRing({ progress, color = C.orange }: { progress: number; color?: string }) {
  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="none" style={{ position: "absolute", left: "-14%", top: "-22%", width: "128%", height: "144%", overflow: "visible", pointerEvents: "none" }}>
      <path
        d="M30,60 C20,25 80,8 130,12 C185,16 198,52 170,74 C140,96 60,96 30,78 C12,66 18,40 52,28"
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={1 - progress}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface Word {
  text: string;
  /** Seconds into the scene when the word lands. */
  at: number;
  style?: CSSProperties;
  decorate?: (frame: number) => ReactNode;
}

export function KineticLine({ words, size = 130, color = C.ink, gap = 0.28 }: { words: Word[]; size?: number; color?: string; gap?: number }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", columnGap: size * gap, rowGap: size * 0.15, maxWidth: width - 160 }}>
        {words.map((w, i) => {
          const local = frame - Math.round(w.at * fps);
          const p = spring({ frame: local, fps, config: { damping: 12, stiffness: 190, mass: 0.7 } });
          return (
            <span
              key={i}
              style={{
                position: "relative",
                display: "inline-block",
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: size,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color,
                opacity: local < 0 ? 0 : interpolate(p, [0, 0.25], [0, 1], { extrapolateRight: "clamp" }),
                transform: `translateY(${interpolate(p, [0, 1], [size * 0.45, 0])}px) scale(${interpolate(p, [0, 1], [0.7, 1])})`,
                ...w.style,
              }}
            >
              {w.text}
              {w.decorate?.(local)}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Spreads a line's words over its spoken length, weighted by word length. */
export function timeWords(text: string, start: number, seconds: number): { text: string; at: number }[] {
  const words = text.split(" ");
  const weights = words.map((w) => w.replace(/[^\w]/g, "").length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = start;
  return words.map((w, i) => {
    const at = t;
    t += (weights[i] / total) * seconds * 0.85;
    return { text: w, at };
  });
}
