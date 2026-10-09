"use client";

import type { ReactNode, Ref } from "react";
import { AliveStage, type AliveCharacterHandle, type Cutout, type Motion } from "./alive";

/**
 * The child's character alive in its meadow. Thinking is shown here (a sway
 * plus the thought cloud passed as the bubble) so the screen never looks
 * frozen while the AI works.
 */
export function FriendStage({
  cutout,
  name,
  motion = "idle",
  talking = false,
  thinking = false,
  bubble,
  onTap,
  characterRef,
  size,
  className,
}: {
  cutout: Cutout | string | undefined;
  name: string;
  motion?: Motion;
  talking?: boolean;
  thinking?: boolean;
  bubble?: ReactNode;
  onTap?: () => void;
  characterRef?: Ref<AliveCharacterHandle>;
  /** Character height as a share of the stage. */
  size?: number;
  className?: string;
}) {
  return (
    <div className={`crayon-edge relative overflow-hidden rounded-cut-lg bg-sky/30 shadow-soft ${thinking ? "kid-thinking" : ""} ${className ?? ""}`}>
      <span className="sr-only">{name ? `${name}, your drawing, alive` : "Your drawing, alive"}</span>
      {cutout ? (
        <AliveStage cutout={cutout} motion={motion} talking={talking} onTap={onTap} characterRef={characterRef} size={size}>
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-4 sm:pt-5">{bubble}</div>
        </AliveStage>
      ) : (
        <div className="grid h-full place-items-center">
          <span className="h-24 w-24 animate-pulse rounded-full bg-white/60" />
        </div>
      )}
      <style href="friend-stage" precedence="default">
        {`@keyframes think-sway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg) translateY(-1.5%)}}
.kid-thinking .alive-character-layer{animation:think-sway 2.2s ease-in-out infinite;transform-origin:50% 86%}
@media (prefers-reduced-motion:reduce){.kid-thinking .alive-character-layer{animation:none}}`}
      </style>
    </div>
  );
}
