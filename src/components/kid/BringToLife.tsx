"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { addFriend, newId, ShelfFullError } from "@/lib/story/db";
import { shrinkPhoto } from "@/lib/story/image";
import { cutout, type Cutout } from "./alive";
import { FriendStage } from "./FriendStage";
import { ArrowsClockwise, Check, Scissors } from "./icons";
import { Button } from "./ui";

type Phase = "idle" | "cutting" | "preview" | "saving" | "full" | "error";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Photo or canvas in, friend out: cuts the character from the picture, lets
 * the child confirm it, then keeps it on the device and opens it.
 */
export function useBringToLife() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<{ drawing: string; cut: Cutout } | null>(null);

  useEffect(
    () => () => {
      if (photo?.startsWith("blob:")) URL.revokeObjectURL(photo);
    },
    [photo],
  );

  const start = useCallback(async (image: Blob) => {
    setResult(null);
    setPhoto(URL.createObjectURL(image));
    setPhase("cutting");
    try {
      // Hold the scissors moment briefly even when cutting is instant, so the
      // child sees something happen to their drawing.
      const [cut, drawing] = await Promise.all([cutout(image), shrinkPhoto(image), wait(1100)]);
      setResult({ drawing, cut });
      setPhase("preview");
    } catch {
      setPhase("error");
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setPhoto(null);
    setPhase("idle");
  }, []);

  // After making room on a full shelf, keep the friend the child just confirmed.
  const backToPreview = useCallback(() => setPhase("preview"), []);

  const accept = useCallback(async () => {
    if (!result) return;
    setPhase("saving");
    try {
      const now = Date.now();
      const friend = await addFriend({
        id: newId(),
        name: "",
        description: "",
        drawing: result.drawing,
        cutout: result.cut.png,
        chat: [],
        createdAt: now,
        updatedAt: now,
      });
      router.push(`/friend?id=${encodeURIComponent(friend.id)}`);
    } catch (error) {
      setPhase(error instanceof ShelfFullError ? "full" : "error");
    }
  }, [result, router]);

  return { phase, photo, result, start, reset, accept, backToPreview };
}

export function CuttingView({ photo }: { photo: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6" role="status" aria-live="polite">
      <div className="crayon-edge relative w-full max-w-md overflow-hidden rounded-cut-lg bg-white p-3 shadow-soft">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={photo} alt="" className="max-h-[52vh] w-full rounded-[22px] object-contain" />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-white/70 to-transparent [animation:shimmer_1.2s_ease-in-out_infinite]"
        />
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sun shadow-lift"
        >
          <Scissors size={44} weight="fill" className="[animation:wiggle_0.6s_ease-in-out_infinite]" />
        </span>
      </div>
      <p className="font-display text-3xl font-extrabold text-ink">Cutting out your friend…</p>
    </div>
  );
}

export function CutoutPreview({
  cut,
  saving,
  retakeLabel,
  onRetake,
  onAccept,
}: {
  cut: Cutout;
  saving: boolean;
  retakeLabel: string;
  onRetake: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-5 py-2 sm:gap-6">
      <h2 className="anim-float-in text-center text-4xl font-black text-ink sm:text-5xl">Is this your friend?</h2>
      <FriendStage
        cutout={cut.png}
        name="your friend"
        motion="bounce"
        className="anim-pop-in h-[48vh] min-h-72 w-full max-w-2xl"
      />
      <div className="flex w-full max-w-2xl flex-col-reverse gap-4 sm:flex-row">
        <Button
          tone="paper"
          size="lg"
          onClick={onRetake}
          disabled={saving}
          icon={<ArrowsClockwise size={30} weight="bold" aria-hidden="true" />}
          className="sm:flex-1"
        >
          {retakeLabel}
        </Button>
        <Button
          tone="grass"
          size="lg"
          onClick={onAccept}
          disabled={saving}
          icon={<Check size={32} weight="bold" aria-hidden="true" />}
          className="sm:flex-[1.4]"
        >
          {saving ? "Waking up…" : "Yes, that's my friend!"}
        </Button>
      </div>
    </div>
  );
}

export function CutError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center" role="alert">
      <p className="font-display text-3xl font-extrabold text-ink">Oops! That picture got stuck.</p>
      <p className="max-w-sm text-xl text-ink-soft">Let&rsquo;s try one more time.</p>
      <Button tone="sun" size="lg" onClick={onRetry} icon={<ArrowsClockwise size={30} weight="bold" aria-hidden="true" />}>
        Try again
      </Button>
    </div>
  );
}
