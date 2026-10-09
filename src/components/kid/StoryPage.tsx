"use client";

import type { ReactNode } from "react";
import type { Kind } from "@/lib/story/kind";
import { AliveCharacter, type Motion } from "./alive";
import { Backdrop, type Scene } from "./Backdrop";

/**
 * One page of a storybook: the child's own character standing in a simple
 * scene, with the words underneath in a large, easy-to-read face.
 */
export function StoryPage({
  cutout,
  scene,
  motion = "idle",
  kind = "creature",
  talking = false,
  label,
  children,
  className,
}: {
  cutout: string | undefined;
  scene: Scene;
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
      <Backdrop scene={scene} className="aspect-[16/10] w-full max-h-[52vh] shrink-0 rounded-t-[inherit]">
        {cutout && (
          <div className="absolute inset-0">
            <AliveCharacter cutout={cutout} motion={motion} kind={kind} talking={talking} groundY={0.9} size={0.66} />
          </div>
        )}
        {label && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 font-display text-base font-bold text-ink shadow-soft">
            {label}
          </span>
        )}
      </Backdrop>
      <div className="flex flex-1 flex-col justify-center gap-2 px-5 py-5 sm:px-8 sm:py-6">{children}</div>
    </article>
  );
}
