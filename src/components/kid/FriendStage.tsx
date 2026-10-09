"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadImage } from "@/lib/story/image";
import { AliveCharacter, AliveStage, type Cutout, type Motion } from "./alive";
import { Backdrop, type Scene } from "./Backdrop";
import { useTalkLevel } from "./hooks";

/** Rebuilds the engine's Cutout from the PNG data URL kept on the Character. */
export function useCutout(png: string | undefined): Cutout | null {
  const [cut, setCut] = useState<{ png: string; value: Cutout } | null>(null);
  useEffect(() => {
    if (!png) return;
    let alive = true;
    loadImage(png)
      .then((img) => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        const mask = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        if (alive) setCut({ png, value: { png, width: img.naturalWidth, height: img.naturalHeight, mask } });
      })
      .catch(() => {
        if (alive) setCut({ png, value: { png, width: 0, height: 0 } });
      });
    return () => {
      alive = false;
    };
  }, [png]);
  return cut && cut.png === png ? cut.value : null;
}

/**
 * The child's character standing in a scene. Thinking is shown here (a sway
 * and a thought cloud) so the screen never looks frozen while the AI works.
 */
export function FriendStage({
  cutout,
  name,
  motion = "idle",
  talking = false,
  thinking = false,
  scene = "meadow",
  bubble,
  onTap,
  className,
}: {
  cutout: string | undefined;
  name: string;
  motion?: Motion;
  talking?: boolean;
  thinking?: boolean;
  scene?: Scene;
  bubble?: ReactNode;
  onTap?: () => void;
  className?: string;
}) {
  const cut = useCutout(cutout);
  const level = useTalkLevel(talking);

  return (
    <Backdrop scene={scene} className={`crayon-edge rounded-cut-lg shadow-soft ${className ?? ""}`}>
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-4 sm:pt-5">{bubble}</div>
      <div className="absolute inset-x-0 bottom-[7%] top-[34%] flex justify-center lg:top-[30%]">
        <span
          aria-hidden="true"
          className="absolute bottom-[-3%] left-1/2 h-[7%] w-[46%] -translate-x-1/2 rounded-[50%] bg-ink/15 blur-[2px]"
        />
        <div className={`relative h-full w-[78%] max-w-[520px] origin-bottom ${thinking ? "[animation:think-sway_2.2s_ease-in-out_infinite]" : ""}`}>
          {cut ? (
            <AliveStage>
              <AliveCharacter
                cutout={cut}
                motion={motion}
                talking={talking}
                level={level}
                onTap={onTap}
                label={name || "your friend"}
              />
            </AliveStage>
          ) : (
            <div className="grid h-full place-items-center">
              <span className="h-24 w-24 animate-pulse rounded-full bg-white/60" />
            </div>
          )}
        </div>
      </div>
      <style href="friend-stage" precedence="default">
        {`@keyframes think-sway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg) translateY(-2%)}}`}
      </style>
    </Backdrop>
  );
}
