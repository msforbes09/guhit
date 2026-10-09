"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import { AliveCharacter, type AliveCharacterHandle, type AliveCharacterProps } from "./AliveCharacter";
import { ALIVE_CSS, cls } from "./styles";

export interface AliveStageProps extends Omit<AliveCharacterProps, "groundY" | "className" | "style" | "ref"> {
  /** Evening sky with stars; defaults to on while the character sleeps. */
  night?: boolean;
  className?: string;
  style?: CSSProperties;
  characterRef?: Ref<AliveCharacterHandle>;
  /** Extra layers drawn above the scene (speech bubbles, buttons). */
  children?: ReactNode;
}

const GROUND_Y = 0.86;

const DECOR: { x: number; y: number; s: number; c?: string }[] = [
  { x: 6, y: 4, s: 2.6, c: "#ffd166" },
  { x: 14, y: 11, s: 2.2, c: "#ff9fc4" },
  { x: 24, y: 6, s: 2.4 },
  { x: 71, y: 12, s: 2.2 },
  { x: 80, y: 5, s: 2.6, c: "#ffd166" },
  { x: 88, y: 13, s: 2.1, c: "#b8a6ff" },
  { x: 94, y: 3, s: 2.4 },
];

const STARS = [
  [8, 10],
  [22, 18],
  [35, 6],
  [48, 16],
  [63, 9],
  [77, 20],
  [90, 8],
  [15, 30],
  [56, 28],
  [83, 33],
];

/**
 * A soft meadow under a sky, drawn with plain shapes (no generated art) so
 * the child's drawing is the only character on screen.
 */
export function AliveStage({ night, className, style, characterRef, children, ...character }: AliveStageProps) {
  const isNight = night ?? character.motion === "sleep";
  return (
    <div className={`${cls.stage} ${className ?? ""}`} style={style}>
      <style href="guhit-alive" precedence="medium">
        {ALIVE_CSS}
      </style>
      {/* Sky: pinned to the top so the sun stays in view on wide and tall screens. */}
      <svg className={cls.sky} viewBox="0 0 400 120" preserveAspectRatio="xMaxYMin slice" aria-hidden>
        <defs>
          <radialGradient id="alive-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff6c4" />
            <stop offset="0.45" stopColor="#ffe08a" />
            <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className={cls.sun}>
          <circle cx="340" cy="44" r="40" fill="url(#alive-sun)" />
          <circle cx="340" cy="44" r="17" fill="#ffe27a" />
        </g>
        <g className={cls.cloudSlow} opacity="0.85">
          <Cloud x={60} y={46} s={1} />
        </g>
        <g className={cls.cloud} opacity="0.95">
          <Cloud x={180} y={74} s={0.75} />
          <Cloud x={-100} y={34} s={0.6} />
        </g>
      </svg>

      {/* Meadow: stretches to the width, the character stands on the flat front part. */}
      <svg className={cls.ground} viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="alive-hill-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b9e3a6" />
            <stop offset="1" stopColor="#a3d78f" />
          </linearGradient>
          <linearGradient id="alive-hill-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9fd67e" />
            <stop offset="1" stopColor="#7cc461" />
          </linearGradient>
          <linearGradient id="alive-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fd06f" />
            <stop offset="1" stopColor="#64b24f" />
          </linearGradient>
        </defs>
        <path d="M0 48 C 60 18, 130 26, 200 44 S 340 14, 400 34 L 400 140 L 0 140 Z" fill="url(#alive-hill-back)" />
        <path d="M0 66 C 70 44, 160 56, 240 64 S 360 48, 400 58 L 400 140 L 0 140 Z" fill="url(#alive-hill-front)" />
        <path d="M0 76 C 120 70, 280 70, 400 76 L 400 140 L 0 140 Z" fill="url(#alive-ground)" />
      </svg>
      {DECOR.map((d, i) => (
        <svg
          key={i}
          className={cls.decor}
          viewBox="-8 -12 16 24"
          style={{ left: `${d.x}%`, bottom: `${d.y}%`, width: `clamp(12px, ${d.s}%, 34px)` }}
          aria-hidden
        >
          {d.c ? <Flower c={d.c} /> : <Tuft />}
        </svg>
      ))}

      <div className={`${cls.night} ${isNight ? cls.nightOn : ""}`} aria-hidden>
        {STARS.map(([x, y], i) => (
          <span key={i} className={cls.star} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.37}s` }} />
        ))}
      </div>

      <div className={cls.characterLayer}>
        <AliveCharacter {...character} groundY={GROUND_Y} ref={characterRef} />
      </div>
      {children}
    </div>
  );
}

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#ffffff">
      <ellipse cx="0" cy="0" rx="34" ry="14" />
      <circle cx="-14" cy="-8" r="14" />
      <circle cx="8" cy="-13" r="18" />
      <circle cx="26" cy="-4" r="11" />
    </g>
  );
}

function Tuft() {
  return <path d="M-6 10 q 2 -12 4 0 q 2 -16 4 0 q 2 -11 4 0 z" fill="#5fae4a" opacity="0.75" />;
}

function Flower({ c }: { c: string }) {
  return (
    <g>
      <path d="M0 0 L0 12" stroke="#4f9a3d" strokeWidth="1.6" />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 3.4} cy={Math.sin((a * Math.PI) / 180) * 3.4} r="2.8" fill={c} />
      ))}
      <circle r="2.1" fill="#fff3b0" />
    </g>
  );
}
