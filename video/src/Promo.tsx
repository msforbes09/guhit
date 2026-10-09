// The promo: every scene, the narration, the captions and the sound mix.
// One component for both aspect ratios; scenes read the canvas size.
import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  getStaticFiles,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AppScreen, type Rect } from "./components/AppScreen";
import { Diagram, DIAGRAM_BEATS } from "./components/Diagram";
import { MakerCard } from "./components/MakerCard";
import { PaperShot, STILLS } from "./components/PaperShot";
import { Logo, LogoReveal } from "./components/Splash";
import { Flash, IdeaTag, isPortrait, SoftGradient, Subtitle } from "./components/ui";
import { CrayonRing, KineticLine, timeWords } from "./Kinetic";
import { BODY, C, DISPLAY, GRAIN, LONG_SHADOW } from "./theme";
import { EDIT, f, FPS, HERO, LAG, scene, type Cue, type SceneId } from "./timeline";

// ---------- footage geometry (source pixels) ----------
const PHONE_SRC = { w: 860, h: 1864 };
const LAPTOP_SRC = { w: 1920, h: 1200 };
const PHONE_FULL: Rect = { x: 0, y: 0, w: 860, h: 1700 };
/** Tighter views of the phone screen (source px). */
const PHONE_WORKING: Rect = { x: 0, y: 370, w: 860, h: 1230 }; // photo + scissors + "Cutting out…"
const PHONE_PREVIEW: Rect = { x: 0, y: 110, w: 860, h: 1290 }; // "Is this your friend?" + stage + Yes button
const PHONE_TALK: Rect = { x: 0, y: 110, w: 860, h: 1420 }; // stage + mic
/** When a marked moment is actually on screen in the hero clip. */
const M = Object.fromEntries(Object.entries(HERO.marks).map(([k, v]) => [k, v + LAG])) as Record<string, number>;

const usePortrait = () => {
  const { width, height } = useVideoConfig();
  return isPortrait(width, height);
};

/** Layout helper: footage window left/centre and an idea on the right (landscape), or stacked (portrait). */
function Split({ screen, idea, ideaTop }: { screen: (p: { x: number; y: number; height: number }) => ReactNode; idea?: ReactNode; ideaTop?: boolean }) {
  const portrait = usePortrait();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill>
      {portrait ? screen({ x: width / 2, y: height * 0.44, height: height * 0.6 }) : screen({ x: width * 0.36, y: height * 0.445, height: height * 0.76 })}
      {idea && (
        <AbsoluteFill
          style={
            portrait
              ? { alignItems: "center", justifyContent: ideaTop ? "flex-start" : "flex-end", padding: ideaTop ? "120px 60px" : "0 60px 360px" }
              : { alignItems: "flex-start", justifyContent: "center", paddingLeft: width * 0.6, paddingRight: 60 }
          }
        >
          {idea}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

/** A finger tap on the footage (a soft ring that pulses once). */
function Tap({ x, y, at, size = 110 }: { x: number; y: number; at: number; size?: number }) {
  const frame = useCurrentFrame();
  const local = frame - at;
  if (local < -6 || local > 18) return null;
  const p = interpolate(local, [-6, 0, 18], [0.6, 1, 1.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = interpolate(local, [-6, -2, 6, 18], [0, 0.85, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.55)",
        border: "6px solid rgba(42,34,56,0.55)",
        transform: `scale(${p})`,
        opacity: o,
      }}
    />
  );
}

/** Small honest label: what is running, where. */
function Badge({ children, delay = 6 }: { children: ReactNode; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const portrait = usePortrait();
  const p = spring({ frame: frame - delay, fps, config: { damping: 16 } });
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        marginTop: 26,
        padding: "12px 24px",
        borderRadius: 999,
        background: C.ink,
        color: C.cream,
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: portrait ? 34 : 30,
        opacity: interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        transform: `translateY(${interpolate(p, [0, 1], [14, 0])}px)`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 7, background: C.grass, boxShadow: `0 0 0 4px rgba(92,184,92,0.3)` }} />
      {children}
    </div>
  );
}

// ---------- scenes ----------
function Draw() {
  const { durationInFrames } = useVideoConfig();
  const s = STILLS.handsCrayon;
  return (
    <PaperShot
      still={s}
      revealFrames={[0, Math.round(durationInFrames * 0.8)]}
      camera={{ from: { zoom: 1.12, x: 1350, y: 860 }, to: { zoom: 1.22, x: 1330, y: 830 } }}
    />
  );
}

function SnapPhoto() {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill>
      <PaperShot still={STILLS.phoneSnap} camera={{ from: { zoom: 1.12, x: 1400, y: 950 }, to: { zoom: 1.3, x: 1410, y: 1000 } }} />
      <Flash at={Math.round(durationInFrames * 0.5)} length={9} />
    </AbsoluteFill>
  );
}

function Alive() {
  const { width, height } = useVideoConfig();
  const portrait = usePortrait();
  // The meet screen, below the guess bubble: the dragon waving hello on its meadow.
  const crop: Rect = portrait ? { x: 34, y: 400, w: 792, h: 570 } : { x: 34, y: 430, w: 792, h: 540 };
  return (
    <AbsoluteFill>
      <SoftGradient hue="sky" />
      <AppScreen
        src="footage/hero.mp4"
        from={M.guess + 0.2}
        source={PHONE_SRC}
        crop={crop}
        cropEnd={{ x: crop.x + 70, y: crop.y + 40, w: crop.w - 140, h: crop.h - 105 }}
        height={portrait ? height * 0.5 : height * 0.74}
        x={width / 2}
        y={portrait ? height * 0.42 : height * 0.46}
        tilt={{ x: 3, y: 0 }}
        radius={56}
      />
    </AbsoluteFill>
  );
}

function ProblemA({ cue }: { cue: Cue }) {
  const portrait = usePortrait();
  const local = Math.max(0, cue.at - scene("problemA").from - 0.15);
  const words = timeWords(cue.text, local, cue.seconds);
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.5 }} />
      <KineticLine
        size={portrait ? 128 : 140}
        color={C.cream}
        words={words.map((w) =>
          w.text === "for"
            ? {
                ...w,
                style: { color: C.yellow },
                decorate: (fr: number) => <CrayonRing progress={interpolate(fr, [3, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} color={C.orange} />,
              }
            : w,
        )}
      />
    </AbsoluteFill>
  );
}

const RAINBOW = [C.orange, C.yellow, C.grass, C.sky, C.grape, C.pink, C.red];
function ProblemB({ cue }: { cue: Cue }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const portrait = usePortrait();
  const local = Math.max(0, cue.at - scene("problemB").from - 0.15);
  const words = timeWords(cue.text, local, cue.seconds);
  return (
    <AbsoluteFill>
      <SoftGradient hue="sun" />
      <KineticLine
        size={portrait ? 128 : 140}
        words={words.map((w) =>
          w.text.startsWith("imagine")
            ? {
                ...w,
                style: { fontSize: portrait ? 170 : 190 },
                text: "",
                decorate: () => (
                  <span>
                    {"imagine.".split("").map((ch, i) => (
                      <span
                        key={i}
                        style={{
                          display: "inline-block",
                          color: RAINBOW[i % RAINBOW.length],
                          transform: `translateY(${Math.sin((frame / fps) * 6 + i * 0.9) * 8}px) rotate(${Math.sin(i * 1.7) * 6}deg)`,
                          textShadow: "0 8px 0 rgba(42,34,56,0.12)",
                        }}
                      >
                        {ch}
                      </span>
                    ))}
                  </span>
                ),
              }
            : w,
        )}
      />
    </AbsoluteFill>
  );
}

function LogoScene() {
  const portrait = usePortrait();
  return (
    <AbsoluteFill>
      <SoftGradient hue="sky" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", marginTop: portrait ? -60 : -10 }}>
        <LogoReveal width={portrait ? 760 : 620} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Snap button centre on the phone footage (source px). */
const SNAP_BUTTON = { x: 270, y: 1456 };

function SnapApp() {
  const { durationInFrames } = useVideoConfig();
  const lead = 1.5;
  const tapAt = f(lead);
  return (
    <AbsoluteFill>
      <SoftGradient hue="sky" />
      <Split
        screen={({ x, y, height }) => {
          const scale = height / PHONE_FULL.h;
          return (
            <AppScreen src="footage/hero.mp4" from={M.snap - lead} source={PHONE_SRC} crop={PHONE_FULL} height={height} x={x} y={y}>
              <Tap x={(SNAP_BUTTON.x - PHONE_FULL.x) * scale} y={(SNAP_BUTTON.y - PHONE_FULL.y) * scale} at={tapAt - 2} size={120} />
            </AppScreen>
          );
        }}
        idea={<IdeaTag color={C.orange}>Snap!</IdeaTag>}
      />
      <Flash at={Math.min(durationInFrames - 4, tapAt + 1)} length={6} />
    </AbsoluteFill>
  );
}

function Cutout() {
  const { durationInFrames } = useVideoConfig();
  const half = Math.round(durationInFrames * 0.45);
  return (
    <AbsoluteFill>
      <SoftGradient hue="sky" />
      <Split
        screen={({ x, y, height }) => (
          <>
            <Sequence durationInFrames={half} layout="none">
              <AppScreen src="footage/hero.mp4" from={M.snap + 0.6} source={PHONE_SRC} crop={PHONE_WORKING} height={height * 0.92} x={x} y={y} />
            </Sequence>
            <Sequence from={half} layout="none">
              <AppScreen src="footage/hero.mp4" from={M.preview + 0.15} source={PHONE_SRC} crop={PHONE_PREVIEW} height={height} x={x} y={y} />
            </Sequence>
          </>
        )}
        idea={
          <div>
            <IdeaTag color={C.grape}>Cut out.</IdeaTag>
            <Sequence from={half} layout="none">
              <IdeaTag color={C.grass} style={{ marginTop: 18 }}>
                Same drawing.
              </IdeaTag>
            </Sequence>
          </div>
        }
      />
    </AbsoluteFill>
  );
}

/** "Yes, that's my friend!" button centre (source px) on the preview screen. */
const YES_BUTTON = { x: 430, y: 1290 };
function Meadow() {
  const { width, height } = useVideoConfig();
  const portrait = usePortrait();
  // Slightly slowed so the shot ends on the meadow, before the guess bubble appears.
  const lead = 0.6;
  const rate = 0.85;
  const winH = portrait ? height * 0.66 : height * 0.86;
  return (
    <AbsoluteFill>
      <SoftGradient hue="sky" />
      <Split
        screen={({ x, y, height: h }) => {
          const scale = h / PHONE_PREVIEW.h;
          return (
            <AppScreen
              src="footage/hero.mp4"
              from={M.accept - lead}
              source={PHONE_SRC}
              crop={PHONE_PREVIEW}
              cropEnd={{ x: 70, y: 140, w: 720, h: 1080 }}
              height={h}
              x={x}
              y={y}
              playbackRate={rate}
            >
              <Tap x={(YES_BUTTON.x - PHONE_PREVIEW.x) * scale} y={(YES_BUTTON.y - PHONE_PREVIEW.y) * scale} at={f(lead / rate) - 3} size={130} />
            </AppScreen>
          );
        }}
        idea={<IdeaTag color={C.grass}>It wakes up!</IdeaTag>}
      />
      {void width}
      {void winH}
    </AbsoluteFill>
  );
}

/** Laptop footage: the friend's meadow, below its hello bubble. */
const STAGE: Rect = { x: 36, y: 340, w: 1248, h: 830 };
function Move({ kind, label, color, from = 0.6 }: { kind: string; label: string; color: string; from?: number }) {
  const { width, height } = useVideoConfig();
  const portrait = usePortrait();
  const crop: Rect = portrait ? { x: 236, y: 230, w: 848, h: 940 } : STAGE;
  return (
    <AbsoluteFill>
      <SoftGradient hue="cream" />
      <AppScreen
        src={`footage/move-${kind}.mp4`}
        from={from}
        source={LAPTOP_SRC}
        crop={crop}
        height={portrait ? height * 0.56 : height * 0.66}
        x={width / 2}
        y={portrait ? height * 0.44 : height * 0.49}
        tilt={{ x: 2, y: kind === "plant" ? 4 : -4 }}
        radius={60}
      />
      <AbsoluteFill style={{ alignItems: portrait ? "center" : "flex-start", justifyContent: "flex-start", padding: portrait ? "150px 60px" : "34px 90px" }}>
        <IdeaTag color={color} style={{ fontSize: portrait ? 120 : 110, textShadow: "0 6px 0 rgba(255,255,255,0.9), 0 12px 30px rgba(42,34,56,0.25)" }}>
          {label}
        </IdeaTag>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Look() {
  const { durationInFrames } = useVideoConfig();
  const half = Math.round(durationInFrames * 0.45);
  return (
    <AbsoluteFill>
      <SoftGradient hue="grape" />
      <Split
        screen={({ x, y, height }) => (
          <>
            <Sequence durationInFrames={half} layout="none">
              <AppScreen src="footage/hero.mp4" from={M.preview - 2.0} source={PHONE_SRC} crop={PHONE_WORKING} height={height * 0.92} x={x} y={y} />
            </Sequence>
            <Sequence from={half} layout="none">
              <AppScreen src="footage/hero.mp4" from={M.meet + 0.05} source={PHONE_SRC} crop={{ x: 0, y: 110, w: 860, h: 1180 }} height={height} x={x} y={y} playbackRate={0.8} />
            </Sequence>
          </>
        )}
        idea={<IdeaTag color={C.grape}>Hmm…</IdeaTag>}
      />
    </AbsoluteFill>
  );
}

function Guess() {
  const portrait = usePortrait();
  // Bubble + dragon + the question underneath, zooming in on the bubble.
  const crop: Rect = { x: 0, y: 120, w: 860, h: 1100 };
  return (
    <AbsoluteFill>
      <SoftGradient hue="grape" />
      <Split
        screen={({ x, y, height }) => (
          <AppScreen
            src="footage/hero.mp4"
            from={M.guess + 0.9}
            source={PHONE_SRC}
            crop={crop}
            cropEnd={{ x: 40, y: 150, w: 780, h: 998 }}
            height={portrait ? height * 0.85 : height}
            x={x}
            y={y}
            volume={1}
          />
        )}
        idea={
          <div>
            <IdeaTag color={C.grape} style={{ fontSize: portrait ? 104 : 96 }}>
              It guesses.
            </IdeaTag>
            <Badge delay={12}>Seeing eyes · on this device</Badge>
          </div>
        }
      />
    </AbsoluteFill>
  );
}

/** Mic button centre on the talk screen (source px). */
const MIC = { x: 430, y: 1274 };
function Hold() {
  const lead = 0.45;
  return (
    <AbsoluteFill>
      <SoftGradient hue="sun" />
      <Split
        screen={({ x, y, height }) => {
          const scale = height / PHONE_TALK.h;
          return (
            <AppScreen src="footage/hero.mp4" from={M.hold - lead} source={PHONE_SRC} crop={PHONE_TALK} height={height} x={x} y={y}>
              <HoldFinger x={(MIC.x - PHONE_TALK.x) * scale} y={(MIC.y - PHONE_TALK.y) * scale} downAt={f(lead)} upAt={f(lead + (M.release - M.hold))} />
            </AppScreen>
          );
        }}
        idea={
          <div>
            <IdeaTag color={C.red}>Hold to talk.</IdeaTag>
            <Badge delay={20}>Listening ears · on this device</Badge>
          </div>
        }
      />
    </AbsoluteFill>
  );
}

function HoldFinger({ x, y, downAt, upAt }: { x: number; y: number; downAt: number; upAt: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [downAt - 6, downAt, upAt, upAt + 6], [0, 0.85, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const s = interpolate(frame, [downAt - 6, downAt], [1.3, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: x - 60,
        top: y - 60,
        width: 120,
        height: 120,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.45)",
        border: "6px solid rgba(42,34,56,0.5)",
        opacity: o,
        transform: `scale(${s})`,
      }}
    />
  );
}

/** The friend's real words, large (the same text the app shows in its bubble). */
function Quote({ text, who, delay = 0 }: { text: string; who: string; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const portrait = usePortrait();
  const p = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 170 } });
  return (
    <div
      style={{
        position: "relative",
        marginTop: 28,
        maxWidth: portrait ? 880 : 640,
        padding: "26px 34px",
        borderRadius: 40,
        background: "white",
        border: `5px solid ${C.ink}`,
        boxShadow: LONG_SHADOW,
        opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
        transform: `scale(${interpolate(p, [0, 1], [0.8, 1])}) rotate(-1.5deg)`,
        transformOrigin: "left center",
      }}
    >
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: portrait ? 64 : 58, color: C.ink, lineHeight: 1.1 }}>“{text}”</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 26, color: C.inkSoft, marginTop: 10 }}>{who}, out loud</div>
    </div>
  );
}

function Answer() {
  const portrait = usePortrait();
  return (
    <AbsoluteFill>
      <SoftGradient hue="sun" />
      <Split
        screen={({ x, y, height }) => (
          <AppScreen
            src="footage/hero.mp4"
            from={M.heard - 0.15}
            source={PHONE_SRC}
            crop={{ x: 0, y: 110, w: 860, h: 1580 }}
            cropEnd={{ x: 40, y: 120, w: 780, h: 1433 }}
            height={height}
            x={x}
            y={y}
            volume={1}
          />
        )}
        idea={
          <div>
            <IdeaTag color={C.orange} style={{ fontSize: portrait ? 104 : 100 }}>
              It talks back!
            </IdeaTag>
            {HERO.texts.reply && <Quote text={HERO.texts.reply} who="Tala" delay={12} />}
            <Badge delay={18}>Story helper + voice · on this device</Badge>
          </div>
        }
      />
    </AbsoluteFill>
  );
}

const hasAirplane = () => getStaticFiles().some((file) => file.name === "footage/airplane.mp4");

function Airplane() {
  const { width, height } = useVideoConfig();
  const portrait = usePortrait();
  if (hasAirplane()) {
    // The real recording: fitted whole (any aspect), with a blurred copy filling the frame.
    return (
      <AbsoluteFill style={{ background: C.ink }}>
        <OffthreadVideo src={staticFile("footage/airplane.mp4")} muted style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(40px) brightness(0.7)", transform: "scale(1.15)" }} />
        <OffthreadVideo
          src={staticFile("footage/airplane.mp4")}
          muted
          style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.5))" }}
        />
      </AbsoluteFill>
    );
  }
  // Preview only: a clearly temporary card over app footage.
  return (
    <AbsoluteFill>
      <SoftGradient hue="sky" />
      <AppScreen
        src="footage/hero.mp4"
        from={M.heard + 1}
        source={PHONE_SRC}
        crop={PHONE_FULL}
        height={portrait ? height * 0.7 : height * 0.86}
        x={width / 2}
        y={height / 2}
        tilt={{ x: 0, y: 0 }}
        style={{ filter: "blur(3px) saturate(0.6) brightness(0.92)" }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: portrait ? 860 : 1100,
            padding: "46px 56px",
            borderRadius: 40,
            background: "rgba(30,27,46,0.9)",
            border: `6px dashed ${C.yellow}`,
            color: C.cream,
            textAlign: "center",
            boxShadow: LONG_SHADOW,
          }}
        >
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 30, letterSpacing: "0.14em", color: C.yellow }}>PREVIEW PLACEHOLDER</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: portrait ? 76 : 78, lineHeight: 1.05, marginTop: 14 }}>
            ✈︎ Airplane-mode phone recording goes here
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 30, marginTop: 18, opacity: 0.85 }}>drop it in as video/footage/airplane.mp4</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** The real setup screen, sped up, then its result card. */
function Setup() {
  const { durationInFrames, width, height } = useVideoConfig();
  const portrait = usePortrait();
  // footage/setup.mp4 is 7 s; its first second is the launch splash and the idle "0 MB" start.
  const timelapse = 6.0;
  const playFor = durationInFrames * 0.72;
  const rate = (timelapse * FPS) / playFor;
  const card = spring({ frame: Math.round(durationInFrames * 0.66), fps: FPS, config: { damping: 14 } });
  const cardIn = useCurrentFrame() - Math.round(durationInFrames * 0.66);
  const pop = spring({ frame: cardIn, fps: FPS, config: { damping: 13, stiffness: 160 } });
  void card;
  return (
    <AbsoluteFill>
      <SoftGradient hue="cream" />
      <AppScreen
        src="footage/setup.mp4"
        from={1.0}
        source={LAPTOP_SRC}
        crop={{ x: 530, y: 330, w: 860, h: 770 }}
        height={portrait ? height * 0.5 : height * 0.82}
        x={portrait ? width / 2 : width * 0.36}
        y={portrait ? height * 0.38 : height * 0.5}
        playbackRate={rate}
        tilt={{ x: 4, y: 8 }}
      />
      <AbsoluteFill
        style={
          portrait
            ? { alignItems: "center", justifyContent: "flex-end", paddingBottom: 380 }
            : { alignItems: "flex-start", justifyContent: "center", paddingLeft: width * 0.63, paddingRight: 70 }
        }
      >
        <div
          style={{
            opacity: cardIn < 0 ? 0 : interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
            transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])}) rotate(-2deg)`,
            background: "#ECFAEF",
            border: `5px solid ${C.ink}`,
            borderRadius: 34,
            padding: "30px 36px",
            maxWidth: 620,
            boxShadow: LONG_SHADOW,
          }}
        >
          <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 54, color: "#1F6B33", lineHeight: 1.08 }}>Guhit is ready.</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, color: C.ink, lineHeight: 1.15, marginTop: 8 }}>It now works without internet.</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function DiagramScene() {
  return (
    <AbsoluteFill>
      <SoftGradient hue="sky" />
      <Diagram />
    </AbsoluteFill>
  );
}

function CrossedIcon({ kind, progress }: { kind: "cloud" | "account"; progress: number }) {
  return (
    <svg viewBox="0 0 120 100" width={150} height={125} style={{ overflow: "visible" }}>
      {kind === "cloud" ? (
        <path d="M30 80 h62 a18 18 0 0 0 2 -36 a26 26 0 0 0 -49 -5 a20 20 0 0 0 -15 41 z" fill="none" stroke={C.cream} strokeWidth={8} strokeLinejoin="round" />
      ) : (
        <g fill="none" stroke={C.cream} strokeWidth={8}>
          <circle cx="60" cy="34" r="17" />
          <path d="M26 88 c4 -22 18 -30 34 -30 s30 8 34 30" strokeLinecap="round" />
        </g>
      )}
      <path d="M14 12 L106 92" stroke={C.yellow} strokeWidth={12} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress} />
    </svg>
  );
}

function Title({ cues }: { cues: Cue[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const portrait = usePortrait();
  const start = scene("title").from;
  const rows: { text: string; icon: ReactNode; color: string }[] = [
    { text: "No cloud.", icon: null, color: C.cream },
    { text: "No account.", icon: null, color: C.cream },
    { text: "Just crayons.", icon: null, color: C.yellow },
  ];
  return (
    <AbsoluteFill style={{ background: C.orange }}>
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.7 }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: portrait ? "center" : "flex-start", gap: portrait ? 40 : 18 }}>
          {rows.map((row, i) => {
            const at = Math.max(0, f((cues[i]?.at ?? start + i * 1.7) - start - 0.12));
            const local = frame - at;
            const p = spring({ frame: local, fps, config: { damping: 11, stiffness: 200, mass: 0.8 } });
            const cross = interpolate(local, [6, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div
                key={row.text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 36,
                  opacity: local < 0 ? 0 : 1,
                  transform: `translateX(${interpolate(p, [0, 1], [-80, 0])}px) scale(${interpolate(p, [0, 1], [1.4, 1])})`,
                  transformOrigin: "left center",
                }}
              >
                {i < 2 ? (
                  <CrossedIcon kind={i === 0 ? "cloud" : "account"} progress={cross} />
                ) : (
                  <CrayonIcon />
                )}
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 900,
                    fontSize: portrait ? 132 : 150,
                    lineHeight: 1,
                    color: row.color,
                    letterSpacing: "-0.02em",
                    textShadow: "0 10px 0 rgba(30,27,46,0.18)",
                  }}
                >
                  {row.text}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function CrayonIcon() {
  return (
    <svg viewBox="0 0 120 100" width={150} height={125}>
      <g transform="rotate(-35 60 50)">
        <rect x="30" y="38" width="64" height="26" rx="6" fill={C.yellow} stroke={C.ink} strokeWidth={5} />
        <path d="M94 38 L114 51 L94 64 Z" fill={C.cream} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
        <rect x="44" y="38" width="12" height="26" fill={C.blue} />
      </g>
    </svg>
  );
}

function EndLogo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const portrait = usePortrait();
  const p = spring({ frame, fps, config: { damping: 15 } });
  const t = spring({ frame: frame - 10, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill>
      <SoftGradient hue="sky" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
        <div style={{ transform: `scale(${interpolate(p, [0, 1], [0.85, 1])}) translateY(${Math.sin(frame / 14) * 4}px)`, opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }) }}>
          <Logo width={portrait ? 640 : 520} />
        </div>
        <div
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: portrait ? 78 : 76,
            color: C.ink,
            textAlign: "center",
            lineHeight: 1.1,
            padding: "0 60px",
            opacity: interpolate(t, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateY(${interpolate(t, [0, 1], [20, 0])}px)`,
          }}
        >
          Every drawing has a friend inside.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------- assembly ----------
const SCENES: Record<SceneId, (props: { cues: Cue[] }) => ReactNode> = {
  draw: Draw,
  snapPhoto: SnapPhoto,
  alive: Alive,
  problemA: ({ cues }) => <ProblemA cue={cues.find((c) => c.id === "problem-a")!} />,
  problemB: ({ cues }) => <ProblemB cue={cues.find((c) => c.id === "problem-b")!} />,
  logo: LogoScene,
  snapApp: SnapApp,
  cutout: Cutout,
  meadow: Meadow,
  vehicle: () => <Move kind="vehicle" label="Vroom!" color={C.sky} from={1.25} />,
  plant: () => <Move kind="plant" label="Sway…" color={C.grass} from={3.55} />,
  flyer: () => <Move kind="flyer" label="Whoosh!" color={C.grape} from={1.3} />,
  look: Look,
  guess: Guess,
  hold: Hold,
  answer: Answer,
  airplane: Airplane,
  setup: Setup,
  diagram: DiagramScene,
  title: ({ cues }) => <Title cues={cues.filter((c) => c.id.startsWith("title-"))} />,
  endLogo: EndLogo,
  maker: () => <MakerCard />,
};

/** Lines whose words are already big on screen (kinetic type, title, end card) get no subtitle. */
const ON_SCREEN = new Set(["problem-a", "problem-b", "title-a", "title-b", "title-c", "end"]);

/** Sound effects, in seconds on the final timeline. */
function sfxList(): { at: number; name: string; volume?: number }[] {
  const s = (id: SceneId) => scene(id);
  const list: { at: number; name: string; volume?: number }[] = [
    { at: s("snapPhoto").from + s("snapPhoto").dur * 0.5 - 0.05, name: "shutter" },
    { at: s("alive").from, name: "sparkle", volume: 0.5 },
    { at: s("problemA").from, name: "whoosh", volume: 0.6 },
    { at: s("logo").from + 0.05, name: "whoosh", volume: 0.35 },
    { at: s("logo").from + 1.58, name: "pop", volume: 0.6 },
    { at: s("logo").from + 1.9, name: "sparkle", volume: 0.5 },
    { at: s("logo").from + 2.36, name: "boing", volume: 0.45 },
    { at: s("logo").from + 3.22, name: "whoosh", volume: 0.5 },
    { at: s("snapApp").from + 1.5, name: "shutter" },
    { at: s("cutout").from + s("cutout").dur * 0.45, name: "pop", volume: 0.6 },
    { at: s("meadow").from + 0.5, name: "pop", volume: 0.7 },
    { at: s("vehicle").from + 0.15, name: "boing", volume: 0.5 },
    { at: s("plant").from + 0.15, name: "boing", volume: 0.5 },
    { at: s("flyer").from + 0.15, name: "boing", volume: 0.5 },
    { at: s("hold").from + 0.45, name: "mic", volume: 0.6 },
    { at: s("setup").from + s("setup").dur * 0.66, name: "ding", volume: 0.6 },
    ...DIAGRAM_BEATS.steps.map((fr) => ({ at: s("diagram").from + fr / FPS, name: "tick", volume: 0.45 })),
    { at: s("diagram").from + DIAGRAM_BEATS.cross / FPS, name: "cross", volume: 0.5 },
    { at: s("endLogo").from + 0.1, name: "sparkle", volume: 0.5 },
    { at: s("maker").from + 0.05, name: "pop", volume: 0.5 },
  ];
  return list;
}

/** Windows (s) when someone speaks: the music ducks under them. */
function speechWindows(): [number, number][] {
  const w: [number, number][] = EDIT.cues.map((c) => [c.at, c.at + c.seconds]);
  const guess = scene("guess");
  for (const v of HERO.voices) {
    const off = v.at - (M.guess + 0.9);
    if (off >= 0 && off < guess.dur) w.push([guess.from + off, guess.from + Math.min(guess.dur, off + v.seconds)]);
  }
  const answer = scene("answer");
  for (const v of HERO.voices) {
    const off = v.at - (M.heard - 0.15);
    if (off >= 0 && off < answer.dur) w.push([answer.from + off, answer.from + Math.min(answer.dur, off + v.seconds)]);
  }
  return w;
}

/** A caption stays a moment after its line, but never past the next cut. */
function subtitleFrames(c: Cue) {
  const end = c.at + c.seconds;
  const cut = EDIT.scenes.map((sc) => sc.from).find((t) => t >= end - 0.05) ?? EDIT.total;
  return Math.max(1, f(Math.min(end + 0.2, cut)) - f(c.at));
}

const MUSIC_UP = 0.32;
const MUSIC_DOWN = 0.085;
function musicVolume(frame: number, windows: [number, number][]) {
  const t = frame / FPS;
  const ramp = 0.25;
  let duck = 0;
  for (const [a, b] of windows) {
    const d = t < a ? (a - t) / ramp : t > b ? (t - b) / ramp : 0;
    duck = Math.max(duck, 1 - Math.min(1, d));
  }
  const end = EDIT.total;
  const fadeOut = interpolate(t, [end - 1.2, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (MUSIC_UP + (MUSIC_DOWN - MUSIC_UP) * duck) * fadeOut;
}

export function Promo() {
  const windows = speechWindows();
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      {EDIT.scenes.map((sc) => {
        const Comp = SCENES[sc.id];
        return (
          <Sequence key={sc.id} from={f(sc.from)} durationInFrames={f(sc.from + sc.dur) - f(sc.from)} name={sc.id}>
            <Comp cues={EDIT.cues} />
          </Sequence>
        );
      })}
      {EDIT.cues
        .filter((c) => !ON_SCREEN.has(c.id))
        .map((c) => (
          <Sequence key={`sub-${c.id}`} from={f(c.at)} durationInFrames={subtitleFrames(c)} name={`sub ${c.id}`}>
            <Subtitle text={c.text} />
          </Sequence>
        ))}
      {EDIT.cues.map(
        (c) =>
          c.file && (
            <Sequence key={`vo-${c.id}`} from={f(c.at)} durationInFrames={f(c.seconds + 0.3)} name={`vo ${c.id}`}>
              <Audio src={staticFile(c.file)} volume={1} />
            </Sequence>
          ),
      )}
      {sfxList().map((s, i) => (
        <Sequence key={`sfx-${i}`} from={Math.max(0, f(s.at))} durationInFrames={f(1)} name={`sfx ${s.name}`}>
          <Audio src={staticFile(`audio/sfx/${s.name}.wav`)} volume={s.volume ?? 0.7} />
        </Sequence>
      ))}
      <Audio src={staticFile("audio/music.wav")} volume={(fr) => musicVolume(fr, windows)} />
    </AbsoluteFill>
  );
}

export { Easing };
