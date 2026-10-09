import type { ReactNode } from "react";

/**
 * The little crayon drawings scenes are made of: suns, clouds, trees, shells…
 * Each sits in its own square viewBox (0 0 100 100 unless noted), drawn in
 * Guhit's crayon colours and roughened by the backdrop's crayon filter.
 */

export type Art =
  | "sun"
  | "moon"
  | "star"
  | "cloud"
  | "greyCloud"
  | "bird"
  | "tree"
  | "pine"
  | "snowPine"
  | "palm"
  | "flower"
  | "tuft"
  | "mushroom"
  | "bush"
  | "firefly"
  | "planet"
  | "littlePlanet"
  | "comet"
  | "castle"
  | "window"
  | "frame"
  | "bed"
  | "lamp"
  | "blocks"
  | "sandcastle"
  | "shell"
  | "starfish"
  | "seaweed"
  | "coral"
  | "bubble"
  | "fish"
  | "snowman"
  | "airBalloon"
  | "snowflake"
  | "drop"
  | "cake"
  | "ball"
  | "kite"
  | "rainbow"
  | "balloons"
  | "flowers"
  | "butterfly";

const INK = "#2a2238";

/** Where a drawing is pinned: its middle, or the middle of its bottom edge (things that stand on the ground). */
export const STANDS: Partial<Record<Art, true>> = {
  tree: true,
  pine: true,
  snowPine: true,
  palm: true,
  flower: true,
  tuft: true,
  mushroom: true,
  bush: true,
  castle: true,
  bed: true,
  lamp: true,
  blocks: true,
  sandcastle: true,
  shell: true,
  starfish: true,
  seaweed: true,
  coral: true,
  snowman: true,
  cake: true,
  flowers: true,
};

/** Width over height, for drawings that are not square. */
export const RATIO: Partial<Record<Art, number>> = {
  cloud: 2,
  greyCloud: 2,
  bird: 2,
  castle: 1.2,
  rainbow: 2,
  comet: 2,
  bed: 1.6,
  fish: 1.6,
  tuft: 1.6,
};

const Face = ({ cx, cy, s = 1 }: { cx: number; cy: number; s?: number }) => (
  <g fill={INK} stroke={INK} strokeLinecap="round">
    <circle cx={cx - 8 * s} cy={cy - 3 * s} r={2.8 * s} stroke="none" />
    <circle cx={cx + 8 * s} cy={cy - 3 * s} r={2.8 * s} stroke="none" />
    <path d={`M${cx - 7 * s} ${cy + 5 * s} Q${cx} ${cy + 12 * s} ${cx + 7 * s} ${cy + 5 * s}`} fill="none" strokeWidth={2.6 * s} />
  </g>
);

const cloudPath = "M30 78 C10 78 6 58 22 52 C20 34 44 26 56 38 C66 20 98 22 104 42 C120 34 142 44 138 60 C156 62 156 80 138 80 Z";

export const ART: Record<Art, () => ReactNode> = {
  sun: () => (
    <>
      <g className="bd-a-spin" style={{ transformOrigin: "50px 50px" }} stroke="#ffb01f" strokeWidth="6" strokeLinecap="round">
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <line key={i} x1={50 + Math.cos(a) * 33} y1={50 + Math.sin(a) * 33} x2={50 + Math.cos(a) * 45} y2={50 + Math.sin(a) * 45} />;
        })}
      </g>
      <circle cx="50" cy="50" r="26" fill="#ffc93c" stroke="#e6a50f" strokeWidth="3" />
      <circle cx="40" cy="57" r="4" fill="#ff8c42" opacity="0.5" />
      <circle cx="60" cy="57" r="4" fill="#ff8c42" opacity="0.5" />
      <Face cx={50} cy={50} s={0.9} />
    </>
  ),
  moon: () => (
    <>
      <circle className="bd-a-glow" cx="50" cy="50" r="46" fill="#fff3c4" opacity="0.25" style={{ transformOrigin: "50px 50px" }} />
      <path d="M58 14 A36 36 0 1 0 86 70 A30 30 0 1 1 58 14 Z" fill="#fff3c4" stroke="#f3d77a" strokeWidth="3" />
      <circle cx="40" cy="52" r="3" fill={INK} />
      <path d="M36 64 Q42 69 48 64" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  star: () => (
    <path
      d="M50 6 L61 37 L94 38 L68 58 L78 91 L50 72 L22 91 L32 58 L6 38 L39 37 Z"
      fill="#fff4b8"
      stroke="#ffd85c"
      strokeWidth="4"
      strokeLinejoin="round"
    />
  ),
  cloud: () => <path d={cloudPath} fill="#ffffff" stroke="#dbe9f5" strokeWidth="3" transform="translate(20 8)" />,
  greyCloud: () => <path d={cloudPath} fill="#eef1f6" stroke="#b9c3d3" strokeWidth="3" transform="translate(20 8)" />,
  bird: () => (
    <g className="bd-a-flap" style={{ transformOrigin: "100px 50px" }}>
      <path d="M40 40 Q70 30 100 54 Q130 30 160 40" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  tree: () => (
    <>
      <path d="M45 100 L47 58 L53 58 L56 100 Z" fill="#9a6a45" stroke="#7a4f30" strokeWidth="2" />
      <circle cx="50" cy="36" r="26" fill="#4f9d5a" />
      <circle cx="30" cy="50" r="17" fill="#5cb85c" />
      <circle cx="70" cy="48" r="18" fill="#5cb85c" />
      <circle cx="56" cy="26" r="12" fill="#7cc673" />
      <circle cx="38" cy="40" r="3.5" fill="#e5533c" />
      <circle cx="64" cy="54" r="3.5" fill="#e5533c" />
    </>
  ),
  pine: () => (
    <>
      <rect x="45" y="80" width="10" height="20" fill="#7a4f30" />
      <path d="M50 4 L80 44 L66 44 L88 70 L70 70 L92 86 L8 86 L30 70 L12 70 L34 44 L20 44 Z" fill="#2f7d3b" stroke="#24603a" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  snowPine: () => (
    <>
      <rect x="45" y="80" width="10" height="20" fill="#7a4f30" />
      <path d="M50 4 L80 44 L66 44 L88 70 L70 70 L92 86 L8 86 L30 70 L12 70 L34 44 L20 44 Z" fill="#3d8a58" stroke="#2f6e47" strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 4 L64 23 Q50 30 36 23 Z M34 44 Q50 52 66 44 L60 36 Q50 42 40 36 Z M30 70 Q50 78 70 70 L64 62 Q50 68 36 62 Z" fill="#ffffff" />
    </>
  ),
  palm: () => (
    <>
      <path d="M48 100 Q44 70 54 36" fill="none" stroke="#9a6a45" strokeWidth="9" strokeLinecap="round" />
      <g fill="#4f9d5a" stroke="#2f7d3b" strokeWidth="2">
        <path d="M54 36 Q30 22 8 36 Q30 30 54 40 Z" />
        <path d="M54 36 Q78 20 96 34 Q76 30 54 40 Z" />
        <path d="M54 36 Q40 10 20 8 Q40 22 52 40 Z" />
        <path d="M54 36 Q70 10 88 12 Q68 22 56 40 Z" />
        <path d="M54 36 Q34 44 26 64 Q40 46 56 40 Z" />
      </g>
      <circle cx="50" cy="40" r="5" fill="#9a6a45" />
      <circle cx="58" cy="41" r="5" fill="#9a6a45" />
    </>
  ),
  flower: () => (
    <>
      <path d="M50 100 Q48 76 50 56" fill="none" stroke="#2f7d3b" strokeWidth="4" strokeLinecap="round" />
      <path d="M50 82 Q36 72 30 78 Q38 86 50 84 Z" fill="#5cb85c" />
      <g fill="#f585ae">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="50" cy="38" rx="9" ry="15" transform={`rotate(${a} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="8" fill="#ffc93c" />
    </>
  ),
  tuft: () => (
    // viewBox 0 0 160 100
    <g fill="none" stroke="#2f7d3b" strokeWidth="5" strokeLinecap="round" transform="translate(16 38)">
      <path d="M40 62 Q36 40 24 28" />
      <path d="M60 62 Q60 36 64 18" />
      <path d="M80 62 Q86 44 100 34" />
      <path d="M100 62 Q108 46 124 40" />
    </g>
  ),
  mushroom: () => (
    <>
      <path d="M40 100 Q38 74 44 62 L58 62 Q62 74 60 100 Z" fill="#fff8ec" stroke="#e8d6b5" strokeWidth="2" />
      <path d="M14 66 Q16 26 50 24 Q84 26 86 66 Z" fill="#e5533c" stroke="#b73a26" strokeWidth="2" />
      <circle cx="34" cy="48" r="6" fill="#fff8ec" />
      <circle cx="58" cy="38" r="5" fill="#fff8ec" />
      <circle cx="70" cy="56" r="4" fill="#fff8ec" />
    </>
  ),
  bush: () => (
    <g fill="#5cb85c">
      <circle cx="30" cy="70" r="24" />
      <circle cx="56" cy="62" r="28" fill="#4f9d5a" />
      <circle cx="78" cy="74" r="20" />
      <rect x="10" y="74" width="84" height="26" rx="12" />
    </g>
  ),
  firefly: () => (
    <>
      <circle cx="50" cy="50" r="40" fill="#fff59a" opacity="0.28" />
      <circle cx="50" cy="50" r="16" fill="#fff59a" />
    </>
  ),
  planet: () => (
    <>
      <circle cx="50" cy="50" r="28" fill="#f585ae" stroke="#d9608d" strokeWidth="3" />
      <path d="M30 40 Q50 34 72 42" fill="none" stroke="#ffb3cf" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="50" cy="52" rx="48" ry="11" fill="none" stroke="#ffc93c" strokeWidth="6" transform="rotate(-14 50 52)" />
    </>
  ),
  littlePlanet: () => (
    <>
      <circle cx="50" cy="50" r="40" fill="#5aaee8" stroke="#236aa3" strokeWidth="4" />
      <path d="M24 40 Q40 30 52 42 Q48 58 30 60 Z M60 62 Q74 54 82 66 Q70 78 60 72 Z" fill="#5cb85c" />
    </>
  ),
  comet: () => (
    <>
      <path d="M20 30 L150 46" stroke="#fff4b8" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
      <path d="M40 44 L150 50" stroke="#fff4b8" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      <circle cx="156" cy="48" r="9" fill="#fff4b8" />
    </>
  ),
  castle: () => (
    // viewBox 0 0 120 100
    <>
      <rect x="22" y="44" width="76" height="56" fill="#c9b8e8" stroke="#7c4cc8" strokeWidth="3" />
      <rect x="8" y="30" width="22" height="70" fill="#b6a2e0" stroke="#7c4cc8" strokeWidth="3" />
      <rect x="90" y="30" width="22" height="70" fill="#b6a2e0" stroke="#7c4cc8" strokeWidth="3" />
      <rect x="49" y="22" width="22" height="40" fill="#b6a2e0" stroke="#7c4cc8" strokeWidth="3" />
      <path d="M5 31 L19 6 L33 31 Z M87 31 L101 6 L115 31 Z M46 23 L60 0 L74 23 Z" fill="#e5533c" stroke="#b73a26" strokeWidth="2.5" strokeLinejoin="round" />
      <g className="bd-a-flag" style={{ transformOrigin: "60px 2px" }}>
        <path d="M60 0 L60 -16 L76 -11 L60 -6" fill="#ffc93c" stroke="#e6a50f" strokeWidth="2" />
      </g>
      <path d="M48 100 L48 80 Q60 66 72 80 L72 100 Z" fill="#6537ad" />
      <rect x="15" y="46" width="8" height="12" rx="4" fill="#ffe9a8" />
      <rect x="97" y="46" width="8" height="12" rx="4" fill="#ffe9a8" />
      <rect x="56" y="34" width="8" height="12" rx="4" fill="#ffe9a8" />
      <path d="M22 44 h8 v-6 h8 v6 h8 v-6 h8 v6 h8 v-6 h8 v6 h8 v-6 h8 v6 h6" fill="none" stroke="#7c4cc8" strokeWidth="3" />
    </>
  ),
  window: () => (
    <>
      <rect x="10" y="8" width="80" height="80" rx="6" fill="#bfe4fb" stroke="#c99764" strokeWidth="7" />
      <circle cx="68" cy="30" r="10" fill="#ffc93c" />
      <path d="M14 70 Q40 58 86 66 L86 84 L14 84 Z" fill="#7cc673" />
      <line x1="50" y1="8" x2="50" y2="88" stroke="#c99764" strokeWidth="5" />
      <line x1="10" y1="48" x2="90" y2="48" stroke="#c99764" strokeWidth="5" />
      <path d="M4 4 Q14 50 6 94 L22 94 Q30 50 22 4 Z M96 4 Q86 50 94 94 L78 94 Q70 50 78 4 Z" fill="#f585ae" opacity="0.92" />
    </>
  ),
  frame: () => (
    <>
      <rect x="12" y="16" width="76" height="64" fill="#fff8ec" stroke="#ff8c42" strokeWidth="6" />
      <circle cx="50" cy="44" r="12" fill="none" stroke="#ffc93c" strokeWidth="4" />
      <path d="M26 72 Q38 56 50 70 Q62 54 76 72" fill="none" stroke="#5cb85c" strokeWidth="4" strokeLinecap="round" />
      <path d="M50 16 L50 4" stroke={INK} strokeWidth="2" />
    </>
  ),
  bed: () => (
    // viewBox 0 0 160 100
    <>
      <rect x="6" y="30" width="16" height="70" rx="6" fill="#c99764" />
      <rect x="138" y="52" width="16" height="48" rx="6" fill="#c99764" />
      <rect x="14" y="60" width="132" height="24" rx="6" fill="#ffffff" stroke="#e8d6b5" strokeWidth="3" />
      <path d="M50 56 L146 56 L146 84 L50 84 Z" fill="#5aaee8" />
      <path d="M50 64 h96 M50 74 h96" stroke="#bfe4fb" strokeWidth="3" />
      <ellipse cx="34" cy="56" rx="16" ry="9" fill="#fff8ec" stroke="#e8d6b5" strokeWidth="2" />
    </>
  ),
  lamp: () => (
    <>
      <path d="M30 40 L40 10 L60 10 L70 40 Z" fill="#ffc93c" stroke="#e6a50f" strokeWidth="3" strokeLinejoin="round" />
      <ellipse className="bd-a-glow" cx="50" cy="44" rx="34" ry="14" fill="#fff3c4" opacity="0.4" style={{ transformOrigin: "50px 44px" }} />
      <rect x="47" y="40" width="6" height="52" fill="#594c6b" />
      <ellipse cx="50" cy="96" rx="18" ry="4" fill="#594c6b" />
    </>
  ),
  blocks: () => (
    <>
      <rect x="10" y="60" width="38" height="38" rx="3" fill="#e5533c" stroke="#b73a26" strokeWidth="3" />
      <rect x="52" y="60" width="38" height="38" rx="3" fill="#5aaee8" stroke="#236aa3" strokeWidth="3" />
      <rect x="31" y="22" width="38" height="38" rx="3" fill="#ffc93c" stroke="#e6a50f" strokeWidth="3" />
      <text x="50" y="50" textAnchor="middle" fontSize="22" fontWeight="800" fill={INK} fontFamily="var(--font-grandstander), sans-serif">
        A
      </text>
    </>
  ),
  sandcastle: () => (
    <>
      <path d="M10 100 L14 56 L86 56 L90 100 Z" fill="#e9c37a" stroke="#c99a4a" strokeWidth="3" />
      <path d="M30 56 L32 30 L68 30 L70 56 Z" fill="#f1cf8a" stroke="#c99a4a" strokeWidth="3" />
      <path d="M14 56 v-8 h10 v8 m14 0 v-8 h10 v8 m14 0 v-8 h10 v8 m10 0 v-8 h10 v8" fill="#e9c37a" stroke="#c99a4a" strokeWidth="3" />
      <path d="M50 30 L50 6 L66 12 L50 18" fill="#e5533c" stroke="#b73a26" strokeWidth="2" />
      <path d="M42 100 L42 82 Q50 72 58 82 L58 100 Z" fill="#c99a4a" />
    </>
  ),
  shell: () => (
    <>
      <path d="M50 96 L14 60 Q16 26 50 22 Q84 26 86 60 Z" fill="#ffb3cf" stroke="#f585ae" strokeWidth="3" strokeLinejoin="round" />
      <path d="M50 96 L30 34 M50 96 L50 24 M50 96 L70 34" stroke="#f585ae" strokeWidth="3" />
    </>
  ),
  starfish: () => (
    <path
      d="M50 10 Q56 36 62 40 Q86 36 92 42 Q72 56 70 62 Q80 86 76 92 Q56 76 50 76 Q44 76 24 92 Q20 86 30 62 Q28 56 8 42 Q14 36 38 40 Q44 36 50 10 Z"
      fill="#ff8c42"
      stroke="#e5533c"
      strokeWidth="3"
    />
  ),
  seaweed: () => (
    <g fill="none" strokeLinecap="round" strokeWidth="8">
      <path d="M40 100 Q24 80 40 62 Q56 44 40 26 Q30 14 38 2" stroke="#3a9a5b" />
      <path d="M62 100 Q76 82 62 66 Q50 50 64 34" stroke="#5cb85c" />
    </g>
  ),
  coral: () => (
    <g fill="none" stroke="#f585ae" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 100 L50 50 L32 28 M50 64 L70 40 L74 18 M70 40 L88 34 M32 28 L22 10 M32 28 L44 12" />
    </g>
  ),
  bubble: () => (
    <>
      <circle cx="50" cy="50" r="38" fill="#ffffff" fillOpacity="0.18" stroke="#e8f6ff" strokeWidth="6" />
      <path d="M32 38 Q38 28 48 26" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
    </>
  ),
  fish: () => (
    // viewBox 0 0 160 100
    <>
      <path d="M120 50 L156 26 L150 50 L156 74 Z" fill="#ffc93c" stroke="#e6a50f" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="72" cy="50" rx="54" ry="32" fill="#ffc93c" stroke="#e6a50f" strokeWidth="3" />
      <path d="M78 22 Q90 50 78 78" fill="none" stroke="#ff8c42" strokeWidth="5" />
      <circle cx="40" cy="44" r="6" fill={INK} />
    </>
  ),
  snowman: () => (
    <>
      <circle cx="50" cy="74" r="25" fill="#ffffff" stroke="#c7dcef" strokeWidth="3" />
      <circle cx="50" cy="36" r="18" fill="#ffffff" stroke="#c7dcef" strokeWidth="3" />
      <path d="M50 38 L68 42 L50 44 Z" fill="#ff8c42" />
      <circle cx="44" cy="32" r="2.6" fill={INK} />
      <circle cx="56" cy="32" r="2.6" fill={INK} />
      <path d="M32 50 Q50 58 68 50 L66 58 Q50 64 34 58 Z" fill="#e5533c" />
      <path d="M36 20 L64 20 L60 6 L40 6 Z" fill={INK} />
    </>
  ),
  airBalloon: () => (
    <>
      <path d="M50 8 C20 8 14 46 40 66 L60 66 C86 46 80 8 50 8 Z" fill="#ff8c42" stroke="#e5533c" strokeWidth="3" />
      <path d="M50 8 C38 22 38 50 44 66 M50 8 C62 22 62 50 56 66" fill="none" stroke="#ffc93c" strokeWidth="5" />
      <path d="M42 66 L44 80 M58 66 L56 80" stroke="#7a4f30" strokeWidth="2" />
      <rect x="42" y="80" width="16" height="12" rx="2" fill="#c99764" />
    </>
  ),
  snowflake: () => (
    <g stroke="#ffffff" strokeWidth="8" strokeLinecap="round">
      <path d="M50 12 V88 M17 31 L83 69 M17 69 L83 31" />
    </g>
  ),
  drop: () => <path d="M50 8 Q72 52 66 72 A17 17 0 0 1 34 72 Q28 52 50 8 Z" fill="#5aaee8" stroke="#236aa3" strokeWidth="3" />,
  cake: () => (
    <>
      <rect x="18" y="58" width="64" height="38" rx="6" fill="#f585ae" stroke="#d9608d" strokeWidth="3" />
      <path d="M18 66 Q26 74 34 66 Q42 74 50 66 Q58 74 66 66 Q74 74 82 66" fill="none" stroke="#fff8ec" strokeWidth="5" strokeLinecap="round" />
      <rect x="30" y="34" width="40" height="26" rx="5" fill="#fff8ec" stroke="#e8d6b5" strokeWidth="3" />
      <rect x="47" y="16" width="6" height="18" rx="2" fill="#5aaee8" />
      <path className="bd-a-flicker" style={{ transformOrigin: "50px 14px" }} d="M50 2 Q57 10 50 16 Q43 10 50 2 Z" fill="#ffc93c" stroke="#ff8c42" strokeWidth="2" />
    </>
  ),
  ball: () => (
    <>
      <circle cx="50" cy="50" r="40" fill="#ffffff" stroke="#e5533c" strokeWidth="4" />
      <path d="M14 36 Q50 54 86 36 M14 64 Q50 46 86 64" fill="none" stroke="#e5533c" strokeWidth="10" />
      <path d="M50 10 Q40 50 50 90" fill="none" stroke="#5aaee8" strokeWidth="8" />
    </>
  ),
  kite: () => (
    <>
      <path d="M50 4 L80 40 L50 76 L20 40 Z" fill="#e5533c" stroke="#b73a26" strokeWidth="3" strokeLinejoin="round" />
      <path d="M50 4 L50 76 M20 40 L80 40" stroke="#ffc93c" strokeWidth="4" />
      <path d="M50 76 Q40 86 52 90 Q62 94 50 100" fill="none" stroke={INK} strokeWidth="2" />
      <path d="M44 86 l6 3 l-6 3 Z M50 96 l6 3 l-6 3 Z" fill="#5aaee8" />
    </>
  ),
  rainbow: () => (
    // viewBox 0 0 200 100
    <g fill="none" strokeWidth="11" opacity="0.88">
      <path d="M12 100 A88 88 0 0 1 188 100" stroke="#e5533c" />
      <path d="M23 100 A77 77 0 0 1 177 100" stroke="#ff8c42" />
      <path d="M34 100 A66 66 0 0 1 166 100" stroke="#ffc93c" />
      <path d="M45 100 A55 55 0 0 1 155 100" stroke="#5cb85c" />
      <path d="M56 100 A44 44 0 0 1 144 100" stroke="#5aaee8" />
      <path d="M67 100 A33 33 0 0 1 133 100" stroke="#7c4cc8" />
    </g>
  ),
  balloons: () => (
    <>
      <path d="M30 46 Q36 70 50 96 M70 40 Q62 70 50 96 M50 30 Q52 64 50 96" fill="none" stroke={INK} strokeWidth="2" />
      <ellipse cx="30" cy="30" rx="16" ry="20" fill="#e5533c" />
      <ellipse cx="70" cy="26" rx="16" ry="20" fill="#5aaee8" />
      <ellipse cx="50" cy="16" rx="16" ry="20" fill="#ffc93c" />
      <path d="M24 22 Q26 16 31 15 M64 18 Q66 12 71 11 M44 8 Q46 2 51 1" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  flowers: () => (
    <>
      {[
        [22, "#e5533c"],
        [50, "#7c4cc8"],
        [78, "#ffc93c"],
      ].map(([x, color], i) => (
        <g key={i} transform={`translate(${Number(x) - 50} ${i === 1 ? -10 : 0})`}>
          <path d="M50 100 Q48 80 50 62" fill="none" stroke="#2f7d3b" strokeWidth="4" strokeLinecap="round" />
          <g fill={String(color)}>
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx="50" cy="44" rx="7" ry="11" transform={`rotate(${a} 50 54)`} />
            ))}
          </g>
          <circle cx="50" cy="54" r="6" fill="#fff8ec" />
        </g>
      ))}
    </>
  ),
  butterfly: () => (
    <g className="bd-a-flutter" style={{ transformOrigin: "50px 50px" }}>
      <path d="M50 50 Q28 14 12 30 Q8 50 50 54 Q14 62 26 82 Q42 86 50 56" fill="#f585ae" stroke="#d9608d" strokeWidth="2" />
      <path d="M50 50 Q72 14 88 30 Q92 50 50 54 Q86 62 74 82 Q58 86 50 56" fill="#7c4cc8" stroke="#6537ad" strokeWidth="2" />
      <path d="M50 36 L50 74" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </g>
  ),
};
