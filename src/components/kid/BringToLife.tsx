"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAI, isTestMode, photoCropFromCutout } from "@/lib/ai";
import type { DrawingDescription, PixelRect } from "@/lib/ai";
import { currentGuessStep, recordNote } from "@/lib/boot-log";
import { sfx } from "@/lib/sfx";
import { addFriend, newId, ShelfFullError } from "@/lib/story/db";
import { kindOf } from "@/lib/story/kind";
import { shrinkPhoto } from "@/lib/story/image";
import { isAppleMobile } from "@/lib/ai/device";
import { cutout, CutoutTouchUp, isAiCutoutCached, type Cutout } from "./alive";
import { FriendStage } from "./FriendStage";
import { usePart } from "./hooks";
import { ArrowsClockwise, Camera, Check, PaintBrush, Scissors, Sparkle } from "./icons";
import { Button, LinkButton } from "./ui";

type Phase = "idle" | "cutting" | "preview" | "saving" | "full" | "flagged" | "error";
type Working = "cutting" | "closer" | "looking";
/**
 * What the drawing reader saw. `flagged` (the engine's safety category)
 * marks a drawing it judged not right for a child's friend; the category is
 * never shown.
 */
type Seen = DrawingDescription;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The AI cut-out starts its model from storage first; never keep a child waiting longer. */
const AI_RETRY_MS = 12000;
/** Reading the drawing must never hold the child up. */
// A phone's first guess loads the eyes' model from storage before it looks.
const LOOK_TIMEOUT_MS = 20000;

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
  // Wakes the eyes quietly when they are on this device; the guess needs only them.
  const ready = usePart("eyes");
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [photo, setPhoto] = useState<string | null>(null);
  const [working, setWorking] = useState<Working>("cutting");
  const [result, setResult] = useState<{
    drawing: string;
    /** How much the kept photo was shrunk from the original. */
    scale: number;
    cut: Cutout;
    photoCrop?: PixelRect;
    seen: Seen | null;
  } | null>(null);

  useEffect(
    () => () => {
      if (photo?.startsWith("blob:")) URL.revokeObjectURL(photo);
    },
    [photo],
  );

  /** Asks the engine what the drawing is, once it is awake; null when it can't say in time. */
  const look = useCallback(async (png: string, picture?: { image: string; crop: PixelRect }): Promise<Seen | null> => {
    // Test mode's pretend reader always says the same thing, which only confuses testers.
    if (isTestMode()) return null;
    const deadline = performance.now() + LOOK_TIMEOUT_MS;
    const late = () => {
      recordNote(`No guess in time: the snap screen stopped waiting after ${LOOK_TIMEOUT_MS / 1000} s (eyes: ${readyRef.current}; guess: ${currentGuessStep()})`);
      return null;
    };
    while (readyRef.current === "checking" || readyRef.current === "waking") {
      if (performance.now() > deadline) return late();
      await wait(200);
    }
    if (readyRef.current !== "ready") return null;
    const answer = getAI()
      .describeDrawing(png, picture)
      .catch(() => null);
    return Promise.race([answer, wait(Math.max(0, deadline - performance.now())).then(late)]);
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
        // Editable keeps the full frame so "Fix the edges" can brush parts in or out.
        const [first, picture] = await Promise.all([cutout(image, { editable: true }), shrinkPhoto(image), wait(1100)]);
        let cut = first;
        // Only with its model already on this device (saved with the eyes): a kid
        // screen never downloads it, so a missing or slow network can't hold the
        // child up, and offline it never tries the network at all. Not in test mode.
        // Not on iPhone or iPad: the AI cut-out model and the eyes together can be
        // more memory than Safari gives a tab.
        if (first.meta?.quality === "poor" && !isTestMode() && !isAppleMobile() && (await isAiCutoutCached())) {
          // A messy cut-out gets one closer look with the on-device AI model
          // before the child is asked to take the photo again.
          setWorking("closer");
          const better = await Promise.race([cutout(image, { method: "ai", editable: true }).catch(() => null), wait(AI_RETRY_MS).then(() => null)]);
          if (better && better.meta?.quality !== "poor") cut = better;
        }
        const photoCrop = cut.meta ? scaleRect(photoCropFromCutout(cut.meta), picture.scale) : undefined;
        // The engine looks before anything comes alive or is saved.
        setWorking("looking");
        const seen = await look(cut.png, photoCrop ? { image: picture.dataUrl, crop: photoCrop } : undefined);
        setResult({ drawing: picture.dataUrl, scale: picture.scale, cut, photoCrop, seen });
        // The cut-out pops to life (or a soft "uh-oh" when it can't be a friend).
        sfx(seen?.flagged ? "oops" : "pop");
        setPhase(seen?.flagged ? "flagged" : "preview");
      } catch {
        sfx("oops");
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

  /** The child brushed the edges: same drawing, cleaner cut-out. */
  const fixEdges = useCallback((fixed: Cutout) => {
    setResult((r) =>
      r ? { ...r, cut: fixed, photoCrop: fixed.meta ? scaleRect(photoCropFromCutout(fixed.meta), r.scale) : r.photoCrop } : r,
    );
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
        kind: result.seen ? kindOf(result.seen.label) : undefined,
        chat: [],
        createdAt: now,
        updatedAt: now,
      });
      sfx("success");
      router.push(`/friend?id=${encodeURIComponent(friend.id)}`);
    } catch (error) {
      if (!(error instanceof ShelfFullError)) sfx("oops");
      setPhase(error instanceof ShelfFullError ? "full" : "error");
    }
  }, [result, router]);

  return { phase, photo, working, result, start, reset, accept, backToPreview, fixEdges };
}

const WORKING_TEXT: Record<Working, string> = {
  cutting: "Cutting out your friend…",
  closer: "Looking closer…",
  looking: "Taking a good look…",
};

export function CuttingView({ photo, working = "cutting" }: { photo: string | null; working?: Working }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6" role="status" aria-live="polite">
      <div className="crayon-edge relative max-w-md overflow-hidden rounded-cut-lg bg-white shadow-soft">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={photo} alt="" className="block max-h-[52vh] w-auto max-w-full" />
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
  onFixed,
  seenAs,
}: {
  cut: Cutout;
  saving: boolean;
  retakeLabel: string;
  onRetake: () => void;
  onAccept: () => void;
  onFixed: (fixed: Cutout) => void;
  /** What the drawing reader thought it was, so the preview already moves like it. */
  seenAs?: string;
}) {
  const [fixing, setFixing] = useState(false);

  if (fixing && cut.edit) {
    return (
      <div className="anim-float-in flex flex-1 flex-col items-center gap-4 py-2">
        <h2 className="text-center text-4xl font-black text-ink sm:text-5xl">Fix the edges</h2>
        <p className="max-w-xl text-center text-xl text-ink-soft">
          Paint <strong className="text-ink">Keep</strong> over bits of your drawing that went missing, and <strong className="text-ink">Remove</strong> over bits of paper.
        </p>
        <div className="kid-tools crayon-edge w-full max-w-2xl rounded-cut-lg bg-white p-4 shadow-soft">
          <CutoutTouchUp
            cutout={cut}
            onDone={(fixed) => {
              onFixed(fixed);
              setFixing(false);
            }}
            onCancel={() => setFixing(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-5 py-2 sm:gap-6">
      <h2 className="anim-float-in text-center text-4xl font-black text-ink sm:text-5xl">Is this your friend?</h2>
      <FriendStage cutout={cut} name="your friend" motion="bounce" kind={kindOf(seenAs)} size={0.74} className="anim-pop-in h-[48vh] min-h-72 w-full max-w-2xl" />
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
        {cut.edit && (
          <Button
            tone="paper"
            size="lg"
            onClick={() => setFixing(true)}
            disabled={saving}
            icon={<Sparkle size={28} weight="fill" aria-hidden="true" />}
            className="sm:flex-1"
          >
            Fix the edges
          </Button>
        )}
        <Button
          tone="grass"
          size="lg"
          onClick={onAccept}
          sound={false}
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
      <div className="crayon-edge max-w-sm rounded-cut-lg bg-white p-4 shadow-soft">
        {/* eslint-disable-next-line @next/next/no-img-element -- the still cut-out, from this device */}
        <img src={png} alt="" className="block max-h-[30vh] w-auto max-w-full opacity-70 grayscale-[30%]" />
      </div>
      <p className="max-w-lg font-display text-3xl font-extrabold leading-snug text-ink sm:text-4xl">
        Hmm, that one looks a bit scary for me. Can you draw me a friend instead?
      </p>
      <div className="flex w-full max-w-2xl flex-col gap-4 sm:flex-row">
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
