// Plain maker card in the Kaya Randomized brand (its cover: near-black, a soft
// blue glow, the K mark, Fredoka wordmark, coral line).
import "@fontsource/fredoka/600.css";
import "@fontsource/nunito/700.css";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const K = { bg: "#0a0a0a", text: "#fafafa", blue: "#8fa8ff", coral: "#ff9f7a" };

export function MakerCard({ site = "guhit.iam4bs.dev" }: { site?: string }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const rise = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 150 } });
  const mark = portrait ? 260 : 230;
  return (
    <AbsoluteFill style={{ background: K.bg, alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 60% at ${portrait ? "50% 45%" : "38% 50%"}, rgba(143,168,255,0.16), rgba(143,168,255,0) 70%)` }} />
      <div
        style={{
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          alignItems: "center",
          gap: portrait ? 40 : 64,
          transform: `scale(${interpolate(pop, [0, 1], [0.94, 1])})`,
          opacity: interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <Img src={staticFile("brand/kaya/mark-A-transparent.svg")} style={{ width: mark, height: mark, margin: -mark * 0.18 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: portrait ? "center" : "flex-start" }}>
          <div style={{ fontFamily: "Fredoka, Nunito, sans-serif", fontWeight: 600, fontSize: portrait ? 110 : 112, color: K.text, letterSpacing: "-0.01em", lineHeight: 1 }}>
            Kaya Randomized
          </div>
          <div
            style={{
              marginTop: 26,
              fontFamily: "Nunito, Fredoka, sans-serif",
              fontWeight: 700,
              fontSize: portrait ? 52 : 50,
              color: K.coral,
              opacity: interpolate(rise(8), [0, 1], [0, 1]),
              transform: `translateY(${interpolate(rise(8), [0, 1], [12, 0])}px)`,
            }}
          >
            {site}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
