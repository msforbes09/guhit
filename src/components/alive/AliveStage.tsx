"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import { AliveCharacter, type AliveCharacterHandle, type AliveCharacterProps } from "./AliveCharacter";
import styles from "./alive.module.css";

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
    <div className={`${styles.stage} ${className ?? ""}`} style={style}>
      <svg className={styles.scenery} viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <defs>
          <radialGradient id="alive-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff6c4" />
            <stop offset="0.45" stopColor="#ffe08a" />
            <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
          </radialGradient>
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
            <stop offset="1" stopColor="#6cb956" />
          </linearGradient>
        </defs>

        <g className={styles.sun}>
          <circle cx="336" cy="48" r="46" fill="url(#alive-sun)" />
          <circle cx="336" cy="48" r="20" fill="#ffe27a" />
        </g>

        <g className={styles.cloudSlow} opacity="0.85">
          <Cloud x={40} y={50} s={1.1} />
        </g>
        <g className={styles.cloud} opacity="0.95">
          <Cloud x={150} y={78} s={0.8} />
          <Cloud x={-120} y={36} s={0.65} />
        </g>

        <path d="M-20 205 C 60 165, 130 175, 200 200 S 340 160, 420 190 L 420 300 L -20 300 Z" fill="url(#alive-hill-back)" />
        <path d="M-20 225 C 70 195, 160 210, 240 222 S 360 200, 420 215 L 420 300 L -20 300 Z" fill="url(#alive-hill-front)" />
        <rect x="-20" y="232" width="440" height="80" fill="url(#alive-ground)" />

        <g fill="#5fae4a" opacity="0.7">
          <Tuft x={40} y={262} />
          <Tuft x={118} y={284} />
          <Tuft x={300} y={270} />
          <Tuft x={362} y={290} />
        </g>
        <Flower x={70} y={276} c="#ff9fc4" />
        <Flower x={330} y={282} c="#ffd166" />
        <Flower x={352} y={262} c="#b8a6ff" />
        <Flower x={28} y={290} c="#ffd166" />
      </svg>

      <div className={`${styles.night} ${isNight ? styles.nightOn : ""}`} aria-hidden>
        {STARS.map(([x, y], i) => (
          <span key={i} className={styles.star} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.37}s` }} />
        ))}
      </div>

      <div className={styles.characterLayer}>
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

function Tuft({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y} q 2 -10 4 0 q 2 -13 4 0 q 2 -9 4 0 z`} />;
}

function Flower({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 L0 10" stroke="#4f9a3d" strokeWidth="1.5" />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 3.2} cy={Math.sin((a * Math.PI) / 180) * 3.2} r="2.6" fill={c} />
      ))}
      <circle r="2" fill="#fff3b0" />
    </g>
  );
}
