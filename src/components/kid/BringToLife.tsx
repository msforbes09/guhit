"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAI, photoCropFromCutout } from "@/lib/ai";
import type { DrawingDescription, PixelRect } from "@/lib/ai";
import { addFriend, newId, ShelfFullError } from "@/lib/story/db";
import { shrinkPhoto } from "@/lib/story/image";
import { cutout, type Cutout } from "./alive";
import { FriendStage } from "./FriendStage";
import { useAIReady } from "./hooks";
import { ArrowsClockwise, Camera, Check, PaintBrush, Scissors } from "./icons";
import { Button, LinkButton } from "./ui";

type Phase = "idle" | "cutting" | "preview" | "saving" | "full" | "flagged" | "error";
type Working = "cutting" | "closer" | "looking";
/**
 * What the drawing reader saw. A truthy `flagged` (the engine's category)
 * marks a drawing it judged not right for a child's friend; the category is
 * never shown.
 */
type Seen = DrawingDescription & { flagged?: unknown };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The AI cut-out may need its model the first time; never keep a child waiting longer. */
const AI_RETRY_MS = 12000;
/** Reading the drawing must never hold the child up. */
const LOOK_TIMEOUT_MS = 8000;

/** The crop is in the original photo's pixels; the kept photo may be smaller. */
const scaleRect = (r: PixelRect, s: number): PixelRect => ({
  x: Math.round(r.x * s),
  y: Math.round(r.y * s),
  w: Math.round(r.w * s),
  h: Math.round(r.h * s),
});

/**
 * Photo or canvas in, friend out: cuts the character from the picture, has
 * the engine look at it (a drawing it flags is never saved or animated),
 * lets the child confirm it, then keeps it on the device and opens it.
 */
export function useBringToLife() {
  const router = useRouter();
  // Wakes the engine quietly when its models are already on this device.
  const ready = useAIReady();
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [photo, setPhoto] = useState<string | null>(null);
  const [working, setWorking] = useState<Working>("cutting");
  const [result, setResult] = useState<{ drawing: string; cut: Cutout; photoCrop?: PixelRect; seen: Seen | null } | null>(null);

  useEffect(
    () => () => {
      if (photo?.startsWith("blob:")) URL.revokeObjectURL(photo);
    },
    [photo],
  );

  /** Asks the engine what the drawing is, once it is awake; null when it can't say in time. */
  const look = useCallback(async (png: string, picture?: { image: string; crop: PixelRect }): Promise<Seen | null> => {
    const deadline = performance.now() + LOOK_TIMEOUT_MS;
    while (readyRef.current === "checking" || readyRef.current === "waking") {
      if (performance.now() > deadline) return null;
      await wait(200);
    }
    if (readyRef.current !== "ready") return null;
    const answer = getAI()
      .describeDrawing(png, picture)
      .catch(() => null);
    return Promise.race([answer, wait(Math.max(0, deadline - performance.now())).then(() => null)]);
  }, []);

  const start = useCallback(
    async (image: Blob) => {
      setResult(null);
      setPhoto(URL.createObjectURL(image));
      setWorking("cutting");
      setPhase("cutting");
      try {
        // Hold the scissors moment briefly even when cutting is instant, so the
        // child sees something happen to their drawing.
        const [first, picture] = await Promise.all([cutout(image), shrinkPhoto(image), wait(1100)]);
        let cut = first;
        if (first.meta?.quality === "poor") {
          // A messy cut-out gets one closer look with the on-device AI model
          // before the child is asked to take the photo again.
          setWorking("closer");
          const better = await Promise.race([cutout(image, { method: "ai" }).catch(() => null), wait(AI_RETRY_MS).then(() => null)]);
          if (better && better.meta?.quality !== "poor") cut = better;
        }
        const photoCrop = cut.meta ? scaleRect(photoCropFromCutout(cut.meta), picture.scale) : undefined;
        // The engine looks before anything comes alive or is saved.
        setWorking("looking");
        const seen = await look(cut.png, photoCrop ? { image: picture.dataUrl, crop: photoCrop } : undefined);
        setResult({ drawing: picture.dataUrl, cut, photoCrop, seen });
        setPhase(seen && seen.flagged ? "flagged" : "preview");
      } catch {
        setPhase("error");
      }
    },
    [look],
  );

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
        photoCrop: result.photoCrop,
        // Unknown (the engine could not look in time) stays unset so the meet screen asks again.
        seenAs: result.seen ? result.seen.label.trim() : undefined,
        chat: [],
        createdAt: now,
        updatedAt: now,
      });
      router.push(`/friend?id=${encodeURIComponent(friend.id)}`);
    } catch (error) {
      setPhase(error instanceof ShelfFullError ? "full" : "error");
    }
  }, [result, router]);

  return { phase, photo, working, result, start, reset, accept, backToPreview };
}

const WORKING_TEXT: Record<Working, string> = {
  cutting: "Cutting out your friend…",
  closer: "Looking closer…",
  looking: "Taking a good look…",
};

export function CuttingView({ photo, working = "cutting" }: { photo: string | null; working?: Working }) {
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
      <p className="font-display text-3xl font-extrabold text-ink">{WORKING_TEXT[working]}</p>
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
      <FriendStage cutout={cut} name="your friend" motion="bounce" size={0.74} className="anim-pop-in h-[48vh] min-h-72 w-full max-w-2xl" />
      {cut.meta?.quality === "poor" && (
        <p className="max-w-2xl rounded-2xl bg-sun/40 px-4 py-3 text-center text-lg font-bold text-ink" role="status">
          Hmm, some bits may be missing. A brighter spot and a flat paper can help, if you want to try again.
        </p>
      )}
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

type NotThisOneAction = { label: string; icon: "draw" | "photo"; href?: string; onClick?: () => void };

/**
 * The engine judged this drawing not right for a friend: it stays still,
 * nothing is kept, and the child is gently invited to make another. No
 * reason or category is ever shown.
 */
export function NotThisOne({ png, actions }: { png: string; actions: [NotThisOneAction, NotThisOneAction] }) {
  return (
    <div className="anim-float-in flex flex-1 flex-col items-center gap-6 py-6 text-center" role="status">
      <div className="crayon-edge grid w-full max-w-sm place-items-center rounded-cut-lg bg-white p-6 shadow-soft">
        {/* eslint-disable-next-line @next/next/no-img-element -- the still cut-out, from this device */}
        <img src={png} alt="" className="max-h-[30vh] w-auto object-contain opacity-70 grayscale-[30%]" />
      </div>
      <p className="max-w-lg font-display text-3xl font-extrabold leading-snug text-ink sm:text-4xl">
        Hmm, that one looks a bit scary for me. Can you draw me a friend instead?
      </p>
      <div className="flex w-full max-w-xl flex-col gap-4 sm:flex-row">
        {actions.map((action, i) => {
          const icon =
            action.icon === "draw" ? <PaintBrush size={30} weight="fill" aria-hidden="true" /> : <Camera size={30} weight="fill" aria-hidden="true" />;
          const tone = i === 0 ? "sun" : "sky";
          return action.href ? (
            <LinkButton key={action.label} href={action.href} tone={tone} size="lg" icon={icon} className="sm:flex-1">
              {action.label}
            </LinkButton>
          ) : (
            <Button key={action.label} tone={tone} size="lg" onClick={action.onClick} icon={icon} className="sm:flex-1">
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
