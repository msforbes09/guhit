import type { ReactNode } from "react";

export type Scene = "meadow" | "night" | "sea" | "forest" | "home" | "rain" | "snow" | "space";

const SCENE_WORDS: [Scene, RegExp][] = [
  ["space", /\b(space|rocket|planet|alien|astronaut|galaxy)\b/i],
  ["night", /\b(night|moon|stars?|sleep|dark|bedtime|dream)/i],
  ["rain", /\b(rain|storm|thunder|puddle|wet|umbrella)/i],
  ["snow", /\b(snow|ice|cold|winter|frozen)/i],
  ["sea", /\b(sea|beach|ocean|river|lake|water|swim|fish|boat|wave)/i],
  ["forest", /\b(forest|tree|jungle|woods|garden|flower)/i],
  ["home", /\b(house|home|room|bed|kitchen|school|castle|cake|party)/i],
];

/** Picks a backdrop from what the story page says, so every page looks different. */
export function sceneFor(text: string, fallback: Scene = "meadow"): Scene {
  return SCENE_WORDS.find(([, words]) => words.test(text))?.[0] ?? fallback;
}

const SKY: Record<Scene, [string, string]> = {
  meadow: ["#cfe9fb", "#fff3dc"],
  night: ["#1f2a5c", "#4a3f86"],
  sea: ["#bfe3fa", "#fff1d6"],
  forest: ["#d4ecd9", "#fff4de"],
  home: ["#fde3c8", "#fff1e0"],
  rain: ["#c7cfdd", "#e9ecf2"],
  snow: ["#dceefb", "#f7fbff"],
  space: ["#1b1440", "#3b2370"],
};

/**
 * A simple, flat scene drawn from basic shapes (no generated art) for the
 * child's character to stand in. Children render on the ground line.
 */
export function Backdrop({
  scene = "meadow",
  children,
  className,
}: {
  scene?: Scene;
  children?: ReactNode;
  className?: string;
}) {
  const [top, bottom] = SKY[scene];
  return (
    <div className={`relative isolate overflow-hidden ${className ?? ""}`}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id={`sky-${scene}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={top} />
            <stop offset="1" stopColor={bottom} />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill={`url(#sky-${scene})`} />
        <SceneShapes scene={scene} />
      </svg>
      {children}
    </div>
  );
}

function Cloud({ x, y, s = 1, fill = "#fff" }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
      <ellipse cx="0" cy="8" rx="34" ry="12" />
      <circle cx="-12" cy="0" r="13" />
      <circle cx="8" cy="-4" r="16" />
      <circle cx="24" cy="4" r="10" />
    </g>
  );
}

function Tree({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} 228) scale(${s})`}>
      <rect x="-5" y="-30" width="10" height="34" rx="4" fill="#9a6a45" />
      <circle cx="0" cy="-48" r="26" fill="#4f9d5a" />
      <circle cx="-16" cy="-34" r="16" fill="#5cb85c" />
      <circle cx="16" cy="-36" r="17" fill="#5cb85c" />
    </g>
  );
}

function Stars({ count = 18 }: { count?: number }) {
  return (
    <g fill="#fff7d1">
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} cx={(i * 97) % 400} cy={(i * 53) % 170 + 8} r={i % 3 === 0 ? 2.4 : 1.4} opacity={0.6 + (i % 4) * 0.1} />
      ))}
    </g>
  );
}

function SceneShapes({ scene }: { scene: Scene }) {
  switch (scene) {
    case "night":
      return (
        <>
          <Stars />
          <circle cx="320" cy="62" r="26" fill="#fff3c4" />
          <circle cx="332" cy="54" r="22" fill="#2b3370" />
          <path d="M0 232 Q90 196 200 222 T400 214 V300 H0Z" fill="#2f5d4a" />
          <path d="M0 256 Q120 236 220 252 T400 248 V300 H0Z" fill="#244a3b" />
        </>
      );
    case "space":
      return (
        <>
          <Stars count={26} />
          <circle cx="70" cy="70" r="26" fill="#f585ae" />
          <ellipse cx="70" cy="70" rx="44" ry="9" fill="none" stroke="#ffc93c" strokeWidth="5" />
          <circle cx="334" cy="52" r="14" fill="#5aaee8" />
          <path d="M0 240 Q100 222 200 236 T400 232 V300 H0Z" fill="#8a7d99" />
          <circle cx="120" cy="262" r="10" fill="#6f6380" />
          <circle cx="290" cy="270" r="14" fill="#6f6380" />
        </>
      );
    case "sea":
      return (
        <>
          <circle cx="330" cy="58" r="28" fill="#ffc93c" />
          <Cloud x={90} y={60} />
          <rect y="170" width="400" height="70" fill="#5aaee8" />
          <path d="M0 176 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#cfe9fb" strokeWidth="5" strokeLinecap="round" />
          <path d="M0 204 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#8cc8f0" strokeWidth="4" strokeLinecap="round" />
          <path d="M0 236 Q100 222 200 234 T400 230 V300 H0Z" fill="#f4d79b" />
        </>
      );
    case "forest":
      return (
        <>
          <circle cx="60" cy="54" r="24" fill="#ffc93c" />
          <path d="M0 214 Q100 190 200 208 T400 200 V300 H0Z" fill="#8fcf8f" />
          <Tree x={40} s={1.1} />
          <Tree x={110} s={0.8} />
          <Tree x={300} s={0.9} />
          <Tree x={365} s={1.2} />
          <path d="M0 240 Q120 226 220 238 T400 234 V300 H0Z" fill="#5cb85c" />
        </>
      );
    case "home":
      return (
        <>
          <rect x="250" y="40" width="96" height="84" rx="8" fill="#cfe9fb" stroke="#e8d6b5" strokeWidth="8" />
          <line x1="298" y1="40" x2="298" y2="124" stroke="#e8d6b5" strokeWidth="6" />
          <line x1="250" y1="82" x2="346" y2="82" stroke="#e8d6b5" strokeWidth="6" />
          <circle cx="60" cy="70" r="6" fill="#f585ae" />
          <circle cx="100" cy="100" r="6" fill="#ffc93c" />
          <circle cx="140" cy="62" r="6" fill="#5aaee8" />
          <rect y="232" width="400" height="68" fill="#e2b98a" />
          <rect y="232" width="400" height="6" fill="#c99764" />
          <ellipse cx="200" cy="262" rx="120" ry="18" fill="#f585ae" opacity="0.55" />
        </>
      );
    case "rain":
      return (
        <>
          <Cloud x={90} y={50} s={1.3} fill="#f1f3f7" />
          <Cloud x={290} y={64} s={1.1} fill="#f1f3f7" />
          <g stroke="#5aaee8" strokeWidth="3" strokeLinecap="round">
            {Array.from({ length: 16 }, (_, i) => (
              <line key={i} x1={(i * 61) % 400} y1={90 + (i * 37) % 110} x2={(i * 61) % 400 - 5} y2={104 + (i * 37) % 110} />
            ))}
          </g>
          <path d="M0 236 Q100 222 200 234 T400 230 V300 H0Z" fill="#7fbf7f" />
          <ellipse cx="300" cy="262" rx="44" ry="8" fill="#9ccdf0" />
        </>
      );
    case "snow":
      return (
        <>
          <Cloud x={300} y={56} s={1.1} />
          <g fill="#fff">
            {Array.from({ length: 22 }, (_, i) => (
              <circle key={i} cx={(i * 71) % 400} cy={(i * 43) % 200 + 10} r={i % 2 ? 2.5 : 3.5} />
            ))}
          </g>
          <path d="M0 226 Q100 206 200 222 T400 216 V300 H0Z" fill="#ffffff" />
          <path d="M0 250 Q120 236 220 248 T400 244 V300 H0Z" fill="#eef5fb" />
        </>
      );
    default:
      return (
        <>
          <circle cx="332" cy="60" r="28" fill="#ffc93c" />
          <g stroke="#ffc93c" strokeWidth="5" strokeLinecap="round">
            <line x1="332" y1="16" x2="332" y2="6" />
            <line x1="376" y1="60" x2="386" y2="60" />
            <line x1="363" y1="29" x2="370" y2="22" />
            <line x1="301" y1="29" x2="294" y2="22" />
            <line x1="363" y1="91" x2="370" y2="98" />
          </g>
          <Cloud x={84} y={58} />
          <Cloud x={210} y={38} s={0.7} />
          <path d="M0 218 Q90 188 200 210 T400 200 V300 H0Z" fill="#a6dba0" />
          <path d="M0 240 Q120 224 220 238 T400 232 V300 H0Z" fill="#6cc070" />
          <g>
            <circle cx="46" cy="262" r="5" fill="#f585ae" />
            <circle cx="96" cy="276" r="4" fill="#fff" />
            <circle cx="318" cy="268" r="5" fill="#ffc93c" />
            <circle cx="360" cy="282" r="4" fill="#f585ae" />
          </g>
        </>
      );
  }
}
