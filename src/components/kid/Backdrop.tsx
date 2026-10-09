import type { CSSProperties, ReactNode } from "react";
import type { Prop, Scene } from "@/lib/story/staging";
import { ART, RATIO, STANDS, type Art } from "./scene-art";

export type { Scene } from "@/lib/story/staging";

/**
 * A storybook scene drawn in crayon from code (no downloaded art): a sky,
 * hills or a floor, and small things that twinkle, drift and sway. The
 * child's character stands between the hills and the grass in front.
 *
 * Every scene is built from the same layers, back to front:
 *   sky → far things (sun, clouds) → back hills → things on the hills (trees)
 *   → front hill → the character → things in front (grass, bubbles) → rain or
 *   snow → paper grain.
 * Things are placed in percent of the scene and sized in `cqmin`, so a scene
 * reads the same on a phone held upright and on a wide laptop screen.
 */

type Anim = "twinkle" | "drift" | "sway" | "bob" | "swim" | "rise" | "blink" | "bounce" | "shoot";

interface Spot {
  art: Art;
  /** Centre, in percent of the scene's width. */
  x: number;
  /** Centre (or, for things that stand, the bottom), in percent of the scene's height. */
  y: number;
  /** Width in cqmin (percent of the scene's shorter side). */
  s: number;
  a?: Anim;
  /** Animation delay in seconds (negative starts it part-way, so things don't move in step). */
  d?: number;
  flip?: boolean;
  /** Darker, for night. */
  dim?: boolean;
  /** A soft glow around it (the moon). */
  halo?: boolean;
}

interface SceneDef {
  sky: [string, string];
  /** Full-scene drawing behind everything (light rays), viewBox 0 0 400 300 stretched. */
  skyArt?: ReactNode;
  /** A repeating pattern over the sky (wallpaper), as a CSS background. */
  wall?: string;
  far: Spot[];
  /** Hills behind the character, viewBox 0 0 400 140 over the bottom 40%. */
  back: ReactNode;
  mid: Spot[];
  /** The ground the character stands on, same box as `back`. */
  front: ReactNode;
  near: Spot[];
  weather?: "rain" | "snow";
}

const hill = (d: string, fill: string, hatch = false) => (
  <>
    <path d={d} fill={fill} />
    {hatch && <path d={d} fill="url(#bd-hatch)" />}
  </>
);

const STARS: Spot[] = [
  [8, 10, 4], [18, 30, 3], [27, 7, 5], [36, 22, 3], [46, 5, 4], [55, 27, 3], [63, 11, 5],
  [70, 36, 3], [93, 42, 4], [13, 46, 3], [42, 40, 3], [96, 8, 3], [5, 26, 3], [58, 46, 2.5],
].map(([x, y, s], i) => ({ art: "star", x, y, s, a: "twinkle", d: -((i * 0.73) % 3) }));

const TUFTS = (dim = false): Spot[] => [
  { art: "tuft", x: 6, y: 100, s: 12, a: "sway", dim },
  { art: "tuft", x: 50, y: 101, s: 9, a: "sway", d: -0.7, dim },
  { art: "tuft", x: 95, y: 100, s: 11, a: "sway", d: -1.3, dim },
];

const SCENES: Record<Scene, SceneDef> = {
  meadow: {
    sky: ["#bfe4fb", "#fff3dc"],
    far: [
      { art: "sun", x: 84, y: 16, s: 24 },
      { art: "cloud", x: 22, y: 15, s: 30, a: "drift" },
      { art: "cloud", x: 58, y: 8, s: 20, a: "drift", d: -7 },
      { art: "bird", x: 42, y: 27, s: 8, a: "drift", d: -3 },
    ],
    back: (
      <>
        {hill("M0 40 Q70 10 150 30 T300 24 T400 30 V140 H0Z", "#b5e0a6")}
        {hill("M0 64 Q100 36 210 58 T400 52 V140 H0Z", "#86cc7d", true)}
      </>
    ),
    mid: [
      { art: "bush", x: 66, y: 77, s: 16 },
      { art: "tree", x: 9, y: 77, s: 34, a: "sway" },
      { art: "tree", x: 93, y: 75, s: 26, a: "sway", d: -1.4, flip: true },
    ],
    front: hill("M0 90 Q120 74 240 88 T400 84 V140 H0Z", "#5cb85c", true),
    near: [
      { art: "flower", x: 21, y: 95, s: 9, a: "sway", d: -0.4 },
      { art: "flower", x: 79, y: 97, s: 8, a: "sway", d: -1.1 },
      ...TUFTS(),
    ],
  },
  night: {
    sky: ["#1b2253", "#4a3f86"],
    far: [
      ...STARS,
      { art: "moon", x: 80, y: 18, s: 24, halo: true },
      { art: "comet", x: 30, y: 14, s: 16, a: "shoot" },
      { art: "pine", x: 24, y: 70, s: 12, dim: true },
      { art: "pine", x: 70, y: 69, s: 10, dim: true },
    ],
    back: (
      <>
        {hill("M0 46 Q80 20 170 40 T330 30 T400 38 V140 H0Z", "#2c5848")}
        {hill("M0 70 Q110 46 220 66 T400 60 V140 H0Z", "#244a3c", true)}
      </>
    ),
    mid: [
      { art: "pine", x: 8, y: 80, s: 30, a: "sway", dim: true },
      { art: "pine", x: 94, y: 78, s: 24, a: "sway", d: -1.2, dim: true },
    ],
    front: hill("M0 94 Q120 80 240 92 T400 88 V140 H0Z", "#1d3d33", true),
    near: [
      { art: "firefly", x: 22, y: 66, s: 4, a: "blink" },
      { art: "firefly", x: 74, y: 60, s: 3.5, a: "blink", d: -1 },
      { art: "firefly", x: 86, y: 80, s: 4, a: "blink", d: -2 },
      { art: "firefly", x: 34, y: 82, s: 3, a: "blink", d: -1.5 },
      ...TUFTS(true),
    ],
  },
  beach: {
    sky: ["#a9dbf8", "#fff1d6"],
    far: [
      { art: "sun", x: 83, y: 14, s: 20 },
      { art: "cloud", x: 24, y: 14, s: 26, a: "drift" },
      { art: "bird", x: 52, y: 22, s: 7, a: "drift", d: -2 },
      { art: "bird", x: 62, y: 29, s: 5, a: "drift", d: -6 },
    ],
    back: (
      <>
        <path d="M0 16 H400 V84 H0Z" fill="#5aaee8" />
        <g className="bd-a-wave" fill="none" strokeLinecap="round">
          <path d="M-20 30 q20 -7 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#cfe9fb" strokeWidth="4" />
          <path d="M-40 52 q20 -7 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#8cc8f0" strokeWidth="4" />
        </g>
      </>
    ),
    mid: [
      { art: "palm", x: 91, y: 82, s: 38, a: "sway" },
    ],
    front: (
      <>
        {hill("M0 74 Q100 60 200 70 T400 66 V140 H0Z", "#f4d79b", true)}
        <path d="M0 74 Q100 60 200 70 T400 66" fill="none" stroke="#fff8ec" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
    near: [
      { art: "sandcastle", x: 14, y: 93, s: 18 },
      { art: "shell", x: 72, y: 96, s: 6 },
      { art: "starfish", x: 86, y: 97, s: 7 },
    ],
  },
  underwater: {
    sky: ["#82d3f3", "#2a7fbf"],
    skyArt: (
      <g fill="#ffffff" opacity="0.13">
        <path d="M40 0 L90 0 L170 300 L100 300 Z" />
        <path d="M180 0 L215 0 L265 300 L220 300 Z" />
        <path d="M290 0 L340 0 L360 300 L300 300 Z" />
      </g>
    ),
    far: [
      { art: "fish", x: 22, y: 30, s: 12, a: "swim" },
      { art: "fish", x: 76, y: 18, s: 8, a: "swim", d: -4, flip: true },
      { art: "fish", x: 60, y: 44, s: 6, a: "swim", d: -7 },
    ],
    back: hill("M0 60 Q90 44 200 56 T400 50 V140 H0Z", "#d7bd84"),
    mid: [
      { art: "seaweed", x: 8, y: 93, s: 30, a: "sway" },
      { art: "seaweed", x: 93, y: 91, s: 34, a: "sway", d: -1.1 },
      { art: "coral", x: 78, y: 94, s: 20 },
      { art: "seaweed", x: 30, y: 96, s: 16, a: "sway", d: -0.5 },
    ],
    front: hill("M0 88 Q90 74 200 84 T400 80 V140 H0Z", "#e9cf94", true),
    near: [
      { art: "shell", x: 60, y: 99, s: 6 },
      { art: "starfish", x: 18, y: 99, s: 6 },
      ...[
        [12, 90, 4, 0], [16, 94, 3, -1.2], [62, 96, 4, -2], [88, 86, 5, -0.6], [40, 98, 3, -2.8], [80, 96, 3, -3.4],
      ].map(([x, y, s, d]): Spot => ({ art: "bubble", x, y, s, a: "rise", d })),
    ],
  },
  forest: {
    sky: ["#cdebd6", "#fff4de"],
    far: [
      { art: "sun", x: 14, y: 12, s: 16 },
      { art: "pine", x: 26, y: 69, s: 16 },
      { art: "pine", x: 36, y: 67, s: 12 },
      { art: "pine", x: 66, y: 67, s: 13 },
      { art: "pine", x: 78, y: 69, s: 18 },
      { art: "butterfly", x: 64, y: 38, s: 7, a: "drift" },
    ],
    back: (
      <>
        {hill("M0 44 Q80 18 170 38 T330 28 T400 36 V140 H0Z", "#a8d9a0")}
        {hill("M0 66 Q110 44 220 62 T400 58 V140 H0Z", "#6fbf6c", true)}
      </>
    ),
    mid: [
      { art: "tree", x: 8, y: 80, s: 40, a: "sway" },
      { art: "tree", x: 92, y: 78, s: 36, a: "sway", d: -1.5, flip: true },
    ],
    front: (
      <>
        {hill("M0 90 Q120 76 240 88 T400 84 V140 H0Z", "#4f9d5a", true)}
        <path d="M168 140 Q186 110 200 88 Q214 110 238 140 Z" fill="#d9b98a" />
      </>
    ),
    near: [
      { art: "mushroom", x: 24, y: 95, s: 9 },
      { art: "mushroom", x: 80, y: 97, s: 7 },
      ...TUFTS(),
    ],
  },
  snow: {
    sky: ["#cfe3f5", "#f5f9ff"],
    far: [{ art: "cloud", x: 70, y: 12, s: 28, a: "drift" }],
    back: (
      <>
        <path d="M0 50 L60 14 L110 44 L170 6 L240 44 L300 18 L360 46 L400 30 V140 H0Z" fill="#b9cfe6" />
        <path d="M46 22 L60 14 L74 22 L66 26 L60 22 L54 26 Z M156 14 L170 6 L184 14 L176 18 L170 14 L164 18 Z M288 25 L300 18 L312 25 L305 28 L300 25 L295 28 Z" fill="#ffffff" />
        {hill("M0 64 Q100 44 210 60 T400 56 V140 H0Z", "#ffffff")}
      </>
    ),
    mid: [
      { art: "snowPine", x: 80, y: 74, s: 14 },
      { art: "snowPine", x: 9, y: 80, s: 34, a: "sway" },
      { art: "snowPine", x: 91, y: 79, s: 28, a: "sway", d: -1 },
      { art: "snowman", x: 25, y: 86, s: 16 },
    ],
    front: hill("M0 92 Q120 78 240 90 T400 86 V140 H0Z", "#eef5fb", true),
    near: [],
    weather: "snow",
  },
  space: {
    sky: ["#120d35", "#3a2370"],
    far: [
      ...STARS,
      { art: "planet", x: 18, y: 22, s: 26, a: "bob" },
      { art: "littlePlanet", x: 86, y: 14, s: 12, a: "bob", d: -2 },
      { art: "comet", x: 52, y: 12, s: 18, a: "shoot", d: -3 },
    ],
    back: hill("M0 60 Q100 40 200 56 T400 50 V140 H0Z", "#b8aed0"),
    mid: [],
    front: (
      <>
        {hill("M0 92 Q120 80 240 90 T400 86 V140 H0Z", "#9d92b8", true)}
        <g fill="#8a7fa6">
          <ellipse cx="60" cy="78" rx="18" ry="5" />
          <ellipse cx="310" cy="72" rx="24" ry="6" />
          <ellipse cx="180" cy="120" rx="30" ry="7" />
          <ellipse cx="352" cy="122" rx="16" ry="4" />
        </g>
      </>
    ),
    near: [],
  },
  rain: {
    sky: ["#a9b6ca", "#e2e7ef"],
    far: [
      { art: "greyCloud", x: 20, y: 12, s: 36, a: "drift" },
      { art: "greyCloud", x: 70, y: 8, s: 42, a: "drift", d: -8 },
      { art: "greyCloud", x: 46, y: 21, s: 24, a: "drift", d: -3 },
    ],
    back: (
      <>
        {hill("M0 44 Q80 22 170 40 T330 30 T400 38 V140 H0Z", "#9cc69a")}
        {hill("M0 66 Q110 46 220 62 T400 58 V140 H0Z", "#7fb37d", true)}
      </>
    ),
    mid: [
      { art: "bush", x: 12, y: 80, s: 18 },
      { art: "tree", x: 90, y: 77, s: 26, a: "sway" },
    ],
    front: (
      <>
        {hill("M0 90 Q120 76 240 88 T400 84 V140 H0Z", "#6aa468", true)}
        <ellipse cx="300" cy="114" rx="42" ry="7" fill="#9ccdf0" />
        <ellipse cx="80" cy="126" rx="30" ry="5" fill="#9ccdf0" />
      </>
    ),
    near: [{ art: "flower", x: 84, y: 95, s: 8, a: "sway" }, ...TUFTS()],
    weather: "rain",
  },
  home: {
    sky: ["#fde3c8", "#fff1e0"],
    wall: "radial-gradient(circle, rgb(246 201 163 / .7) 0 3px, transparent 4px) 0 0 / 34px 30px",
    far: [
      { art: "window", x: 76, y: 30, s: 30 },
      { art: "frame", x: 22, y: 26, s: 17 },
    ],
    back: (
      <>
        <path d="M0 40 H400 V140 H0Z" fill="#e2b98a" />
        <path d="M0 36 H400 V46 H0Z" fill="#c99764" />
        <path d="M0 76 H400 M0 108 H400" stroke="#c99764" strokeWidth="2" opacity="0.6" />
        <path d="M0 40 H400 V140 H0Z" fill="url(#bd-hatch)" />
      </>
    ),
    mid: [
      { art: "bed", x: 16, y: 86, s: 34 },
      { art: "lamp", x: 94, y: 84, s: 20 },
    ],
    front: (
      <>
        <ellipse cx="200" cy="112" rx="150" ry="22" fill="#f585ae" opacity="0.7" />
        <ellipse cx="200" cy="112" rx="120" ry="15" fill="none" stroke="#fff8ec" strokeWidth="4" strokeDasharray="10 8" />
      </>
    ),
    near: [{ art: "blocks", x: 84, y: 97, s: 10 }],
  },
  castle: {
    sky: ["#c4e4fb", "#fff0dd"],
    far: [
      { art: "sun", x: 87, y: 14, s: 18 },
      { art: "cloud", x: 18, y: 14, s: 26, a: "drift" },
      { art: "bird", x: 32, y: 30, s: 6, a: "drift", d: -4 },
    ],
    back: hill("M0 44 Q80 20 170 38 T330 28 T400 36 V140 H0Z", "#b5e0a6"),
    mid: [{ art: "castle", x: 62, y: 74, s: 54 }],
    front: (
      <>
        {hill("M0 70 Q110 52 220 66 T400 62 V140 H0Z", "#86cc7d")}
        {hill("M0 92 Q120 78 240 90 T400 86 V140 H0Z", "#5cb85c", true)}
        <path d="M186 140 Q196 100 214 72 L226 72 Q222 104 252 140 Z" fill="#e9cf94" />
      </>
    ),
    near: [
      { art: "bush", x: 12, y: 92, s: 18 },
      { art: "bush", x: 90, y: 94, s: 14 },
      { art: "flower", x: 28, y: 97, s: 7, a: "sway" },
      { art: "flower", x: 74, y: 98, s: 7, a: "sway", d: -0.9 },
    ],
  },
  sky: {
    sky: ["#7cc4f2", "#e3f4ff"],
    far: [
      { art: "sun", x: 84, y: 16, s: 20 },
      { art: "airBalloon", x: 16, y: 32, s: 14, a: "bob" },
      { art: "cloud", x: 42, y: 14, s: 22, a: "drift" },
      { art: "cloud", x: 76, y: 42, s: 16, a: "drift", d: -5 },
      { art: "bird", x: 60, y: 26, s: 7, a: "drift", d: -2 },
    ],
    back: (
      <path
        d="M0 70 Q20 50 44 62 Q60 40 88 58 Q108 44 130 60 Q156 38 182 58 Q204 44 226 62 Q250 40 276 58 Q300 46 320 62 Q346 42 372 58 Q390 50 400 56 V140 H0Z"
        fill="#ffffff"
      />
    ),
    mid: [],
    front: (
      <path
        d="M0 100 Q30 84 60 96 Q90 78 124 94 Q160 80 190 96 Q224 80 256 96 Q290 82 320 98 Q356 84 400 94 V140 H0Z"
        fill="#eaf4fc"
      />
    ),
    near: [],
  },
};

/** Where a mentioned thing goes, and which layer. */
const PROP_SPOTS: Record<Prop, { spot: Spot; layer: "far" | "near" }> = {
  cake: { spot: { art: "cake", x: 70, y: 97, s: 15 }, layer: "near" },
  ball: { spot: { art: "ball", x: 24, y: 94, s: 9, a: "bounce" }, layer: "near" },
  kite: { spot: { art: "kite", x: 24, y: 24, s: 14, a: "bob" }, layer: "far" },
  rainbow: { spot: { art: "rainbow", x: 50, y: 42, s: 80 }, layer: "far" },
  balloons: { spot: { art: "balloons", x: 88, y: 44, s: 16, a: "bob", d: -1 }, layer: "far" },
  flowers: { spot: { art: "flowers", x: 15, y: 98, s: 14, a: "sway" }, layer: "near" },
  butterfly: { spot: { art: "butterfly", x: 32, y: 40, s: 8, a: "drift", d: -2 }, layer: "far" },
};

/** Night and space get dark ink for anything written over them. */
export const isDarkScene = (scene: Scene) => scene === "night" || scene === "space" || scene === "underwater";

function Spots({ spots }: { spots: Spot[] }) {
  return spots.map((spot, i) => {
    const ratio = RATIO[spot.art] ?? 1;
    const stands = STANDS[spot.art];
    const style: CSSProperties = {
      left: `${spot.x}%`,
      top: `${spot.y}%`,
      width: `${spot.s}cqmin`,
      translate: stands ? "-50% -100%" : "-50% -50%",
    };
    return (
      <span key={i} className="bd-spot" style={style}>
        <span
          className={`bd-art ${spot.a ? `bd-a-${spot.a}` : ""}`}
          style={{
            animationDelay: spot.d ? `${spot.d}s` : undefined,
            transformOrigin: stands ? "50% 100%" : undefined,
            filter: spot.dim
              ? "brightness(0.55) saturate(0.8)"
              : spot.halo
                ? "drop-shadow(0 0 1.5cqmin rgb(255 243 196 / 0.9)) drop-shadow(0 0 5cqmin rgb(255 243 196 / 0.45))"
                : undefined,
          }}
        >
          <svg viewBox={`0 0 ${100 * ratio} 100`} style={spot.flip ? { scale: "-1 1" } : undefined}>
            <g filter="url(#bd-crayon)">{ART[spot.art]()}</g>
          </svg>
        </span>
      </span>
    );
  });
}

/** Rain or snow falling over the whole scene; still (spread over it) for reduced motion. */
function Weather({ kind }: { kind: "rain" | "snow" }) {
  const count = kind === "rain" ? 26 : 22;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const x = (i * 37 + 11) % 100;
        const rest = ((i * 53) % 90) + 4;
        const dur = kind === "rain" ? 0.8 + ((i * 7) % 5) * 0.1 : 7 + ((i * 3) % 5);
        const size = kind === "rain" ? 1.6 + (i % 3) * 0.4 : 2.2 + (i % 4) * 0.8;
        return (
          <span
            key={i}
            className="bd-fall"
            style={
              {
                left: `${x}%`,
                width: `${size}cqmin`,
                "--rest": `${rest}cqh`,
                animationDuration: `${dur}s`,
                animationDelay: `${-((i * 0.61) % dur)}s`,
              } as CSSProperties
            }
          >
            <span className={kind === "snow" ? "bd-a-flake" : undefined} style={{ display: "block", animationDelay: `${-i * 0.4}s` }}>
              <svg viewBox="0 0 100 100" style={kind === "rain" ? { rotate: "12deg" } : undefined}>
                {ART[kind === "rain" ? "drop" : "snowflake"]()}
              </svg>
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function Backdrop({
  scene = "meadow",
  props = [],
  bedtime = false,
  children,
  className,
}: {
  scene?: Scene;
  /** Small things the page mentions (a cake, a kite…), drawn in too. */
  props?: Prop[];
  /** The character is going to sleep: indoors, the window shows the night. */
  bedtime?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const def = SCENES[scene] ?? SCENES.meadow;
  const [top, bottom] = def.sky;
  const extra = props.map((p) => PROP_SPOTS[p]);
  const far = [...def.far, ...extra.filter((e) => e.layer === "far").map((e) => e.spot)].map((spot) =>
    bedtime && spot.art === "window" ? { ...spot, art: "nightWindow" as const } : spot,
  );
  const near = [...def.near, ...extra.filter((e) => e.layer === "near").map((e) => e.spot)];
  return (
    <div
      className={`bd relative isolate overflow-hidden ${className ?? ""}`}
      style={{ background: `${def.wall ? `${def.wall}, ` : ""}linear-gradient(${top}, ${bottom})` }}
      data-scene={scene}
    >
      <style href="guhit-backdrop" precedence="default">
        {BACKDROP_CSS}
      </style>
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>
          <filter id="bd-crayon" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G" result="wobbly" />
            {/* Wax texture: lighter flecks of the same colour over it; the colour itself stays solid. */}
            <feComponentTransfer in="wobbly" result="light">
              <feFuncR type="linear" slope="0.82" intercept="0.18" />
              <feFuncG type="linear" slope="0.82" intercept="0.18" />
              <feFuncB type="linear" slope="0.82" intercept="0.18" />
            </feComponentTransfer>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="11" result="grain" />
            <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.4" result="mask" />
            <feComposite in="light" in2="mask" operator="in" result="flecks" />
            <feMerge>
              <feMergeNode in="wobbly" />
              <feMergeNode in="flecks" />
            </feMerge>
          </filter>
          <pattern id="bd-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#2a2238" strokeOpacity="0.1" strokeWidth="2.2" />
          </pattern>
        </defs>
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {def.skyArt && (
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="none">
            {def.skyArt}
          </svg>
        )}
        <Spots spots={far} />
        <Ground>{def.back}</Ground>
        <Spots spots={def.mid} />
        <Ground>{def.front}</Ground>
      </div>
      {children}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Spots spots={near} />
      </div>
      {def.weather && <Weather kind={def.weather} />}
      <div aria-hidden="true" className="bd-grain pointer-events-none absolute inset-0" />
    </div>
  );
}

function Ground({ children }: { children: ReactNode }) {
  return (
    <svg className="absolute inset-x-0 bottom-0 h-[40%] w-full" viewBox="0 0 400 140" preserveAspectRatio="none">
      <g filter="url(#bd-crayon)">{children}</g>
    </svg>
  );
}

const BACKDROP_CSS = `
.bd{container-type:size}
.bd-spot{position:absolute;display:block;pointer-events:none}
.bd-art{display:block}
.bd-art>svg,.bd-fall svg{display:block;width:100%;height:auto;overflow:visible}
.bd-fall{position:absolute;top:-8%;display:block;animation:bd-fall 1s linear infinite;will-change:transform}
.bd-grain{mix-blend-mode:multiply;opacity:.55;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.27 0 0 0 0 0.16 0 0 0 0.16 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.bd-a-twinkle{animation:bd-twinkle 2.6s ease-in-out infinite}
.bd-a-drift{animation:bd-drift 22s ease-in-out infinite}
.bd-a-sway{animation:bd-sway 4.2s ease-in-out infinite}
.bd-a-bob{animation:bd-bob 4s ease-in-out infinite}
.bd-a-swim{animation:bd-swim 14s ease-in-out infinite}
.bd-a-rise{animation:bd-rise 4.5s ease-in infinite}
.bd-a-blink{animation:bd-blink 2.2s ease-in-out infinite}
.bd-a-bounce{animation:bd-bounce 1.1s cubic-bezier(.3,0,.5,1) infinite}
.bd-a-shoot{animation:bd-shoot 9s ease-out infinite}
.bd-a-spin{animation:bd-spin 30s linear infinite}
.bd-a-glow{animation:bd-glow 4s ease-in-out infinite}
.bd-a-flap{animation:bd-flap .5s ease-in-out infinite}
.bd-a-flag{animation:bd-flag 1.4s ease-in-out infinite}
.bd-a-flutter{animation:bd-flutter .35s ease-in-out infinite}
.bd-a-flicker{animation:bd-flicker .6s ease-in-out infinite}
.bd-a-wave{animation:bd-wave 5s ease-in-out infinite}
.bd-a-flake{animation:bd-flake 3s ease-in-out infinite}
@keyframes bd-twinkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.65)}}
@keyframes bd-drift{0%,100%{transform:translateX(0)}50%{transform:translateX(9cqw)}}
@keyframes bd-sway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes bd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9%)}}
@keyframes bd-swim{0%,100%{transform:translateX(0)}50%{transform:translateX(14cqw)}}
@keyframes bd-rise{0%{transform:translateY(0);opacity:0}15%{opacity:.9}100%{transform:translateY(-45cqh);opacity:0}}
@keyframes bd-blink{0%,100%{opacity:.25;transform:translate(0,0)}50%{opacity:1;transform:translate(1.5cqmin,-2cqmin)}}
@keyframes bd-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-60%)}}
@keyframes bd-shoot{0%,82%{opacity:0;transform:translate(0,0)}86%{opacity:1}100%{opacity:0;transform:translate(26cqw,8cqh)}}
@keyframes bd-spin{to{transform:rotate(360deg)}}
@keyframes bd-glow{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:.5;transform:scale(1.1)}}
@keyframes bd-flap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.35)}}
@keyframes bd-flag{0%,100%{transform:skewY(0)}50%{transform:skewY(-10deg)}}
@keyframes bd-flutter{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.45)}}
@keyframes bd-flicker{0%,100%{transform:scale(1)}50%{transform:scale(.8,1.15)}}
@keyframes bd-wave{0%,100%{transform:translateX(0)}50%{transform:translateX(-20px)}}
@keyframes bd-fall{from{transform:translateY(0)}to{transform:translateY(118cqh)}}
@keyframes bd-flake{0%,100%{transform:translateX(-1.2cqmin) rotate(0)}50%{transform:translateX(1.2cqmin) rotate(40deg)}}
@media (prefers-reduced-motion:reduce){
.bd .bd-art,.bd .bd-art *,.bd .bd-a-wave,.bd .bd-a-flake{animation:none!important}
.bd .bd-fall{animation:none!important;transform:translateY(var(--rest))}
}
`;
