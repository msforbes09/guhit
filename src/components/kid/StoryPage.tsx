"use client";

import type { ReactNode } from "react";
import type { Kind } from "@/lib/story/kind";
import { motionFor, type Staging } from "@/lib/story/staging";
import { AliveCharacter, type Motion } from "./alive";
import { Backdrop } from "./Backdrop";

/** How the character comes onto a page: walking in, dropping in from above, or popping up. */
export function entranceFor(motion: Motion): string {
  if (motion === "walk") return "page-enter-walk";
  if (motion === "jump") return "page-enter-drop";
  if (motion === "sleep") return "page-enter-fade";
  return "page-enter-pop";
}

/** The child's own character acting out a page in its scene. */
export function StagedCharacter({
  cutout,
  kind,
  motion,
  talking = false,
  level,
}: {
  cutout: string;
  kind: Kind;
  motion: Motion;
  talking?: boolean;
  level?: () => number;
}) {
  return (
    <div className={`absolute inset-0 ${entranceFor(motion)}`}>
      <AliveCharacter cutout={cutout} motion={motion} kind={kind} talking={talking} level={level} groundY={0.9} size={0.62} />
      <style href="page-enter" precedence="default">
        {PAGE_ENTER_CSS}
      </style>
    </div>
  );
}

/**
 * One page of a storybook: the child's own character acting the page out in
 * its scene, with the words underneath in a large, easy-to-read face.
 */
export function StoryPage({
  cutout,
  staging,
  motion,
  kind = "creature",
  talking = false,
  label,
  children,
  className,
}: {
  cutout: string | undefined;
  staging: Staging;
  /** Overrides the page's own move. */
  motion?: Motion;
  kind?: Kind;
  talking?: boolean;
  /** Small caption in the scene's corner, e.g. "Page 2". */
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`crayon-edge flex flex-col overflow-hidden rounded-cut-lg bg-white shadow-soft ${className ?? ""}`}>
      <Backdrop scene={staging.scene} props={staging.props} className="aspect-[4/3] w-full max-h-[56vh] shrink-0 rounded-t-[inherit]">
        {cutout && <StagedCharacter cutout={cutout} kind={kind} motion={motion ?? motionFor(staging.move, kind)} talking={talking} />}
        {label && (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-white/90 px-3 py-1 font-display text-base font-bold text-ink shadow-soft">
            {label}
          </span>
        )}
      </Backdrop>
      <div className="flex flex-1 flex-col justify-center gap-2 px-5 py-5 sm:px-8 sm:py-6">{children}</div>
    </article>
  );
}

const PAGE_ENTER_CSS = `
@keyframes page-enter-walk{from{transform:translateX(-62%);opacity:0}25%{opacity:1}to{transform:none;opacity:1}}
@keyframes page-enter-drop{0%{transform:translateY(-70%);opacity:0}55%{transform:translateY(4%);opacity:1}75%{transform:translateY(-3%)}100%{transform:none;opacity:1}}
@keyframes page-enter-pop{0%{transform:translateY(22%);opacity:0}60%{transform:translateY(-4%);opacity:1}100%{transform:none;opacity:1}}
@keyframes page-enter-fade{from{opacity:0}to{opacity:1}}
.page-enter-walk{animation:page-enter-walk 1.1s cubic-bezier(.22,1,.36,1) .25s both}
.page-enter-drop{animation:page-enter-drop .9s cubic-bezier(.3,.7,.4,1) .25s both}
.page-enter-pop{animation:page-enter-pop .7s cubic-bezier(.34,1.56,.64,1) .25s both}
.page-enter-fade{animation:page-enter-fade .9s ease-out .25s both}
`;
