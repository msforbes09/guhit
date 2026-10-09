"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Cutout } from "./placeholderCutout";

export type Motion = "idle" | "bounce" | "walk" | "jump" | "dance" | "sleep" | "wave";

export interface AliveCharacterProps {
  cutout: Cutout;
  motion?: Motion;
  talking?: boolean;
  /** Voice loudness 0..1 while talking. */
  level?: number;
  onTap?: () => void;
  /** Accessible name, e.g. the character's name. */
  label?: string;
}

/**
 * Stand-in for the alive engine's character: the child's own cut-out,
 * moved with CSS. Same props as the real one so the swap is one import.
 */
export function AliveCharacter({
  cutout,
  motion = "idle",
  talking = false,
  level = 0,
  onTap,
  label,
}: AliveCharacterProps) {
  const [giggle, setGiggle] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const tap = () => {
    setGiggle((g) => g + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setGiggle(0), 520);
    onTap?.();
  };

  const voice = talking ? Math.max(0.15, level) : 0;
  const body = (
    <span className={`ap-motion ap-${motion}`}>
      <span className={`ap-step ap-step-${motion}`}>
        <span className={giggle ? "ap-giggle" : undefined} key={giggle}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the device, no optimisation possible */}
          <img
            src={cutout.png}
            alt=""
            draggable={false}
            className="ap-img sticker"
            style={{
              transform: `scale(${1 - voice * 0.035}, ${1 + voice * 0.09})`,
            }}
          />
        </span>
      </span>
      {motion === "sleep" && (
        <span className="ap-zzz" aria-hidden="true">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </span>
      )}
    </span>
  );

  return (
    <>
      <style href="alive-placeholder" precedence="default">
        {CSS}
      </style>
      {onTap ? (
        <button type="button" onClick={tap} className="ap-root" aria-label={label ? `Tickle ${label}` : "Tickle"}>
          {body}
        </button>
      ) : (
        <span className="ap-root" role="img" aria-label={label ?? "Your drawing"}>
          {body}
        </span>
      )}
    </>
  );
}

export function AliveStage({ children }: { children: ReactNode }) {
  return <div className="relative flex h-full w-full items-end justify-center">{children}</div>;
}

const CSS = `
.ap-root{display:flex;align-items:flex-end;justify-content:center;height:100%;width:100%;background:none;border:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ap-root:focus-visible{outline-offset:-4px}
.ap-motion,.ap-step,.ap-step>span{display:flex;align-items:flex-end;justify-content:center;height:100%;width:100%;transform-origin:50% 100%}
.ap-motion{position:relative}
.ap-img{max-height:100%;max-width:100%;object-fit:contain;transform-origin:50% 100%;transition:transform 90ms ease-out;user-select:none;-webkit-user-drag:none}
.ap-idle{animation:ap-breathe 3.2s ease-in-out infinite}
.ap-bounce{animation:ap-bounce .9s cubic-bezier(.3,0,.4,1) infinite}
.ap-jump{animation:ap-jump 1.1s cubic-bezier(.3,0,.3,1) infinite}
.ap-dance{animation:ap-dance .8s ease-in-out infinite}
.ap-walk{animation:ap-walk 4.2s ease-in-out infinite}
.ap-step-walk{animation:ap-step .42s ease-in-out infinite}
.ap-sleep{animation:ap-sleep 4s ease-in-out infinite}
.ap-wave{animation:ap-wave .7s ease-in-out infinite}
.ap-giggle{animation:ap-giggle .5s ease-in-out}
.ap-zzz{position:absolute;top:4%;right:8%;font:800 1.6rem var(--font-grandstander),sans-serif;color:var(--crayon-sky-deep)}
.ap-zzz span{position:absolute;opacity:0;animation:ap-z 2.4s ease-out infinite}
.ap-zzz span:nth-child(2){animation-delay:.8s;font-size:1.2em}
.ap-zzz span:nth-child(3){animation-delay:1.6s;font-size:1.5em}
@keyframes ap-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.01,1.03)}}
@keyframes ap-bounce{0%,100%{transform:translateY(0) scale(1.04,.95)}15%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-9%) scale(.98,1.03)}85%{transform:translateY(0) scale(1,1)}}
@keyframes ap-jump{0%,100%{transform:translateY(0) scale(1,1)}18%{transform:translateY(0) scale(1.08,.86)}45%{transform:translateY(-34%) scale(.94,1.08)}70%{transform:translateY(0) scale(1.06,.9)}82%{transform:translateY(0) scale(1,1)}}
@keyframes ap-dance{0%,100%{transform:rotate(-9deg) translateY(0)}25%{transform:rotate(0) translateY(-6%)}50%{transform:rotate(9deg) translateY(0)}75%{transform:rotate(0) translateY(-6%)}}
@keyframes ap-walk{0%,100%{transform:translateX(-22%) scaleX(1)}45%{transform:translateX(22%) scaleX(1)}50%{transform:translateX(22%) scaleX(-1)}95%{transform:translateX(-22%) scaleX(-1)}}
@keyframes ap-step{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-4%) rotate(3deg)}}
@keyframes ap-sleep{0%,100%{transform:rotate(-7deg) scale(1,.97)}50%{transform:rotate(-7deg) scale(1.02,1)}}
@keyframes ap-wave{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
@keyframes ap-giggle{0%,100%{transform:rotate(0) scale(1)}20%{transform:rotate(-7deg) scale(1.05,.95)}50%{transform:rotate(6deg) scale(.97,1.04)}80%{transform:rotate(-3deg)}}
@keyframes ap-z{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translate(28px,-60px) scale(1.1)}}
@media (prefers-reduced-motion:reduce){.ap-motion,.ap-step,.ap-giggle,.ap-zzz span{animation:none!important}.ap-zzz span{opacity:1;position:static}}
`;
