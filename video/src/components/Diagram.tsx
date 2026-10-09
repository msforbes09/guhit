// "All the AI runs right here": a phone outline with every step inside it,
// and a crossed-out cloud outside it. Simple, hand-drawn, one idea.
import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BODY, C, DISPLAY } from "../theme";

const ICON = { stroke: C.ink, strokeWidth: 5, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const icons: Record<string, ReactNode> = {
  camera: (
    <g {...ICON}>
      <rect x="8" y="18" width="48" height="34" rx="9" fill={C.sun} />
      <path d="M22 18 l4 -7 h12 l4 7" />
      <circle cx="32" cy="35" r="10" fill={C.cream} />
    </g>
  ),
  scissors: (
    <g {...ICON}>
      <circle cx="17" cy="46" r="8" fill={C.pink} />
      <circle cx="47" cy="46" r="8" fill={C.pink} />
      <path d="M22 40 L46 10 M42 40 L18 10" />
    </g>
  ),
  eye: (
    <g {...ICON}>
      <path d="M6 32 C18 12 46 12 58 32 C46 52 18 52 6 32 Z" fill={C.cream} />
      <circle cx="32" cy="32" r="9" fill={C.sky} />
      <circle cx="32" cy="32" r="3" fill={C.ink} stroke="none" />
    </g>
  ),
  chat: (
    <g {...ICON}>
      <path d="M10 12 h44 a6 6 0 0 1 6 6 v22 a6 6 0 0 1 -6 6 h-26 l-12 10 v-10 h-6 a6 6 0 0 1 -6 -6 v-22 a6 6 0 0 1 6 -6 z" fill={C.grass} />
      <circle cx="22" cy="29" r="2.5" fill={C.ink} stroke="none" />
      <circle cx="32" cy="29" r="2.5" fill={C.ink} stroke="none" />
      <circle cx="42" cy="29" r="2.5" fill={C.ink} stroke="none" />
    </g>
  ),
  voice: (
    <g {...ICON}>
      <path d="M8 24 h10 l14 -12 v40 l-14 -12 h-10 z" fill={C.orange} />
      <path d="M40 22 q8 10 0 20 M47 15 q14 17 0 34" />
    </g>
  ),
};

const STEPS = [
  { icon: "camera", label: "Camera", tech: "your photo" },
  { icon: "scissors", label: "Cut-out", tech: "on-device" },
  { icon: "eye", label: "Seeing eyes", tech: "Florence-2" },
  { icon: "chat", label: "Story helper", tech: "Qwen3 LLM" },
  { icon: "voice", label: "Voice", tech: "Kokoro" },
];

function Cloud({ cross }: { cross: number }) {
  return (
    <svg viewBox="0 0 320 220" width={360} height={248} style={{ overflow: "visible" }}>
      <path
        d="M80 180 h170 a50 50 0 0 0 4 -100 a70 70 0 0 0 -132 -14 a54 54 0 0 0 -42 114 z"
        fill="rgba(255,255,255,0.5)"
        stroke={C.inkSoft}
        strokeWidth={8}
        strokeDasharray="18 14"
        strokeLinecap="round"
      />
      <path
        d="M40 30 L290 200"
        stroke={C.red}
        strokeWidth={22}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={1 - cross}
      />
      <path
        d="M290 30 L40 200"
        stroke={C.red}
        strokeWidth={22}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={1 - Math.max(0, cross * 2 - 1)}
      />
    </svg>
  );
}

/** Timings (frames from the start of the scene) the sound effects can follow. */
export const DIAGRAM_BEATS = { steps: [2, 10, 18, 26, 34], cross: 58 };

export function Diagram() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const phoneW = portrait ? 620 : 520;
  const phoneH = portrait ? 1060 : 900;
  const cross = interpolate(frame, [DIAGRAM_BEATS.cross, DIAGRAM_BEATS.cross + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cloudIn = spring({ frame: frame - 40, fps, config: { damping: 14 } });
  // Already on its way in at the cut, so the first frame is never empty.
  const phoneIn = spring({ frame: frame + 5, fps, config: { damping: 16, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", alignItems: "center", gap: portrait ? 50 : 150, marginTop: portrait ? -120 : -40 }}>
        {/* The phone: everything happens inside it. */}
        <div
          style={{
            position: "relative",
            width: phoneW,
            height: phoneH,
            borderRadius: 78,
            border: `10px solid ${C.ink}`,
            background: "rgba(255,248,238,0.92)",
            boxShadow: "0 50px 80px -30px rgba(42,34,56,0.45)",
            transform: `scale(${interpolate(phoneIn, [0, 1], [0.85, 1])}) rotate(-2deg)`,
            opacity: interpolate(phoneIn, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 38px",
            gap: 14,
          }}
        >
          <div style={{ position: "absolute", top: 22, left: "50%", width: 110, height: 16, borderRadius: 10, background: C.ink, transform: "translateX(-50%)" }} />
          {STEPS.map((step, i) => {
            const p = spring({ frame: frame - DIAGRAM_BEATS.steps[i], fps, config: { damping: 13, stiffness: 170 } });
            return (
              <div key={step.label} style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                {i > 0 && (
                  <div style={{ height: 22, display: "flex", justifyContent: "center", opacity: p }}>
                    <svg width="30" height="22" viewBox="0 0 30 22">
                      <path d="M15 0 V16 M7 10 L15 19 L23 10" stroke={C.inkSoft} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    padding: "12px 20px",
                    borderRadius: 30,
                    background: "white",
                    border: `4px solid ${C.ink}`,
                    transform: `scale(${interpolate(p, [0, 1], [0.5, 1])})`,
                    opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
                  }}
                >
                  <svg viewBox="0 0 64 64" width={70} height={70} style={{ flexShrink: 0 }}>
                    {icons[step.icon]}
                  </svg>
                  <div>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 40, color: C.ink, lineHeight: 1 }}>{step.label}</div>
                    <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 25, color: C.inkSoft, marginTop: 4 }}>{step.tech}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Outside: the cloud it never needs. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            opacity: interpolate(cloudIn, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateY(${interpolate(cloudIn, [0, 1], [30, 0])}px)`,
          }}
        >
          <Cloud cross={cross} />
          <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: portrait ? 64 : 58, color: C.ink, textAlign: "center", lineHeight: 1.05, maxWidth: 560 }}>
            Nothing leaves
            <br />
            the device
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
