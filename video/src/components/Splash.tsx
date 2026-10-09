// Logo reveal, as the app's new splash (amendments 2): the printed Guhit
// wordmark (assets/logo/final) draws on letter by letter, "i" included; the
// crayon hops in and replaces the drawn "i"; the creature mark is scribbled
// on, wakes (eyes, blink, smile, rays), bounces, waves and hops off-screen.
// The last frame is the wordmark and the tagline. No cursive anywhere.
import { getLength } from "@remotion/paths";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, DISPLAY } from "../theme";

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const E = {
  out: (p: number) => 1 - Math.pow(1 - p, 3),
  in: (p: number) => p * p * p,
  io: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  back: (p: number) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
  },
  lin: (p: number) => p,
};
const seg = (t: number, a: number, b: number, e: (p: number) => number = E.out) => e(clamp((t - a) / (b - a)));
const around = (cx: number, cy: number, sx: number, sy = sx) => `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`;

// The block wordmark (viewBox 0 0 420 190) as strokes in writing order; the
// "i" is drawn as a plain stem first, then the crayon takes its place.
const I_STEM = "M312,66 V132";
const STROKES = [
  "M82,92 A30,30 0 1,0 22,92 A30,30 0 1,0 82,92", // g bowl
  "M82,62 V122 C82,152 62,168 34,160", // g tail
  "M126,62 V102 C126,130 168,130 171,102", // u
  "M171,62 V132",
  "M214,12 V132", // h
  "M214,98 C216,58 266,56 266,94 V132",
  I_STEM, // i
  "M368,28 V112 C368,128 382,134 402,130", // t
  "M348,64 H398",
];
const I_INDEX = 6;
const LENGTHS = STROKES.map((d) => getLength(d));
const TOTAL = LENGTHS.reduce((a, b) => a + b, 0);

const LOOP =
  "M358,388 C346,406 322,400 314,374 C310,358 308,348 305,340 A97,97 0 1 0 249,154 A97,97 0 1 0 305,340 C282,364 232,398 168,408 C122,415 85,395 85,360 C85,330 110,313 135,313 C165,313 183,335 175,360 C170,378 152,390 128,392";
const RAYS = [
  [167, 105, 203, 138, C.yellow],
  [254, 70, 254, 117, C.yellow],
  [352, 102, 322, 130, C.yellow],
  [442, 200, 407, 227, C.blue],
  [412, 262, 450, 272, C.blue],
  [130, 247, 80, 260, C.blue],
  [90, 189, 135, 213, C.blue],
] as const;
const FC = { x: 277, y: 247 };

/** Timings (ms). */
const T = {
  write: [0, 1100],
  crayon: [1100, 1400],
  dot: [1400, 1580],
  loop: [1250, 1650],
  face: [1550, 1680],
  eyes: [1620, 1730],
  smile: [1680, 1800],
  rays: 1680,
  blink: [1900, 2000],
  bounce: [2000, 2400],
  wave: [2400, 2750],
  leave: [2750, 3100],
  tag: [2500, 2850],
} as const;
export const LOGO_REVEAL_MS = 3350;

function Crayon({ transform }: { transform?: string }) {
  return (
    <g transform={transform}>
      <path d="M300,66 H324 V126 Q324,134 316,134 H308 Q300,134 300,126 Z" fill={C.orange} />
      <path d="M300,66 L312,32 L324,66 Z" fill={C.yellow} stroke={C.yellow} strokeWidth={2} strokeLinejoin="round" />
      <path d="M308,44 L312,32 L316,44 Z" fill={C.ink} />
      <rect x={300} y={86} width={24} height={12} fill={C.blue} />
    </g>
  );
}

function Mark({ c }: { c: number }) {
  const lp = seg(c, T.loop[0], T.loop[1], E.out);
  const fp = seg(c, T.face[0], T.face[1], E.back);
  const ep = seg(c, T.eyes[0], T.eyes[1], E.back);
  const bl = c > T.blink[0] ? 1 - 0.92 * (1 - Math.abs((seg(c, T.blink[0], T.blink[1], E.lin) - 0.5) * 2)) : 1;
  const sp = seg(c, T.smile[0], T.smile[1], E.out);
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" style={{ overflow: "visible" }}>
      <defs>
        <filter id="crayon" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter="url(#crayon)">
        <circle cx={FC.x} cy={FC.y} r={100} fill={C.cream} transform={around(FC.x, FC.y, Math.max(fp, 0.001))} opacity={clamp(fp * 2)} />
        {RAYS.map(([x1, y1, x2, y2, color], i) => {
          const p = seg(c, T.rays + i * 30, T.rays + 200 + i * 30, E.back);
          // Rays wiggle while it waves.
          const wig = seg(c, T.wave[0], T.wave[1], E.lin);
          const extra = Math.sin(wig * Math.PI * 4 + i) * 0.08 * (wig > 0 && wig < 1 ? 1 : 0);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={25}
              strokeLinecap="round"
              transform={around(FC.x, FC.y, Math.max(0.001, 0.25 + 0.75 * p + extra))}
              opacity={clamp(p * 3)}
            />
          );
        })}
        <path
          d={LOOP}
          pathLength={100}
          fill="none"
          stroke={C.orange}
          strokeWidth={27}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100 100"
          strokeDashoffset={100 * (1 - lp)}
          visibility={lp > 0 ? "visible" : "hidden"}
        />
        {[
          [243, 243],
          [325, 238],
        ].map(([cx, cy]) => (
          <circle key={cx} cx={cx} cy={cy} r={12.5} fill={C.ink} transform={around(cx, cy, Math.max(ep, 0.001), Math.max(ep * bl, 0.001))} opacity={ep > 0 ? 1 : 0} />
        ))}
        <path
          d="M272,261 Q287,284 304,260"
          pathLength={1}
          fill="none"
          stroke={C.ink}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray="1 1"
          strokeDashoffset={1 - sp}
          visibility={sp > 0 ? "visible" : "hidden"}
        />
      </g>
    </svg>
  );
}

/** Plays from the frame it is mounted. `width` is the wordmark's on-screen width. */
export function LogoReveal({ width = 900, tagline = "Draw it. Watch it wake up.", speed = 1 }: { width?: number; tagline?: string | null; speed?: number }) {
  const frame = useCurrentFrame();
  const { fps, width: W } = useVideoConfig();
  const c = (frame / fps) * 1000 * speed;

  // Wordmark strokes.
  const w = seg(c, T.write[0], T.write[1], (p) => 0.4 * p + 0.6 * E.io(p));
  let left = w * TOTAL;
  const shown = LENGTHS.map((len) => {
    const s = clamp(left / len);
    left -= len;
    return s;
  });
  // The crayon hops in on an arc and lands where the drawn "i" is.
  const hop = seg(c, T.crayon[0], T.crayon[1], E.io);
  const landed = c >= T.crayon[1];
  const squash = landed ? 1 - 0.12 * Math.sin(clamp((c - T.crayon[1]) / 160) * Math.PI) : 1;
  const cx = 312 + (1 - hop) * 160;
  const cy = (1 - hop) * -170 - Math.sin(hop * Math.PI) * 60;
  const crot = (1 - hop) * 50;
  const crayonOn = c >= T.crayon[0];
  const iFade = 1 - seg(c, T.crayon[1] - 60, T.crayon[1] + 40, E.lin);
  const dp = seg(c, T.dot[0], T.dot[1], E.back);

  // The creature: appears, wakes, bounces, waves, hops off to the top right.
  const markSize = width * 0.42;
  const mo = seg(c, T.loop[0], T.loop[0] + 150);
  const b = seg(c, T.bounce[0], T.bounce[1], E.lin);
  const bounceY = b > 0 && b < 1 ? -Math.abs(Math.sin(b * Math.PI * 2)) * 34 : 0;
  const bounceS = b > 0 && b < 1 ? 1 + Math.sin(b * Math.PI * 4) * 0.05 : 1;
  const wv = seg(c, T.wave[0], T.wave[1], E.lin);
  const waveRot = wv > 0 && wv < 1 ? Math.sin(wv * Math.PI * 3) * 12 : 0;
  const lv = seg(c, T.leave[0], T.leave[1], E.in);
  const leaveX = lv * (W * 0.75);
  const leaveY = -Math.sin(lv * Math.PI * 0.9) * 260 - lv * 520;
  // Once it is gone, the wordmark and tagline settle into the middle.
  const settle = seg(c, T.leave[0] + 100, T.leave[1] + 150, E.io);
  const tg = seg(c, T.tag[0], T.tag[1], E.out);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${-settle * markSize * 0.5}px)` }}>
      <div
        style={{
          width: markSize,
          height: markSize,
          opacity: mo,
          transform: `translate(${leaveX}px, ${bounceY + leaveY}px) rotate(${waveRot + lv * 40}deg) scale(${bounceS * (0.85 + 0.15 * mo)})`,
          transformOrigin: "50% 85%",
        }}
      >
        <Mark c={c} />
      </div>
      <div style={{ width, height: (width * 190) / 420, marginTop: width * 0.01 }}>
        <svg viewBox="0 0 420 190" width="100%" height="100%" style={{ overflow: "visible" }}>
          <defs>
            <filter id="crayon-word" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <g fill="none" stroke={C.ink} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" filter="url(#crayon-word)">
            {STROKES.map((d, i) => (
              <path
                key={i}
                d={d}
                pathLength={100}
                strokeDasharray="100 100"
                strokeDashoffset={100 * (1 - shown[i])}
                visibility={shown[i] > 0 ? "visible" : "hidden"}
                opacity={i === I_INDEX ? iFade : 1}
              />
            ))}
          </g>
          {crayonOn && <Crayon transform={`translate(${cx - 312} ${cy}) rotate(${crot} 312 100) ${around(312, 134, 1 / squash, squash)}`} />}
          <circle cx={312} cy={8} r={7} fill={C.yellow} transform={around(312, 8, Math.max(dp, 0))} opacity={dp > 0 ? 1 : 0} />
        </svg>
      </div>
      {tagline && (
        <div
          style={{
            marginTop: width * 0.05,
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: width * 0.1,
            color: C.ink,
            opacity: tg,
            transform: `translateY(${(1 - tg) * 18}px)`,
            whiteSpace: "nowrap",
          }}
        >
          {tagline}
        </div>
      )}
    </div>
  );
}

/** The finished lockup (mark above the printed wordmark), static. */
export function Logo({ width = 600 }: { width?: number }) {
  const markSize = width * 0.42;
  const awake = 1900; // ms into the reveal: everything drawn, eyes open, before it bounces off
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: markSize, height: markSize }}>
        <Mark c={awake + 200} />
      </div>
      <div style={{ width, height: (width * 190) / 420, marginTop: width * 0.01 }}>
        <svg viewBox="0 0 420 190" width="100%" height="100%">
          <g fill="none" stroke={C.ink} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round">
            {STROKES.filter((_, i) => i !== I_INDEX).map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <Crayon />
          <circle cx={312} cy={8} r={7} fill={C.yellow} />
        </svg>
      </div>
    </div>
  );
}
