"use client";

import { useMemo, useState } from "react";
import { analyzeMask } from "@/lib/alive/rig";
import { guessJoints, type Joints } from "@/lib/alive/skeleton";
import type { Cutout } from "@/lib/alive/types";

export interface JointPickerProps {
  cutout: Cutout;
  onDone: (joints: Joints) => void;
  onCancel?: () => void;
  className?: string;
}

type Key = "head" | "handL" | "handR" | "footL" | "footR";

const STEPS: { key: Key; label: string; icon: string; optional: boolean }[] = [
  { key: "head", label: "Tap the head", icon: "🙂", optional: false },
  { key: "handL", label: "Tap a hand", icon: "✋", optional: true },
  { key: "handR", label: "Tap the other hand", icon: "✋", optional: true },
  { key: "footL", label: "Tap a foot", icon: "🦶", optional: true },
  { key: "footR", label: "Tap the other foot", icon: "🦶", optional: true },
];

/**
 * "Make it move more": the child taps the head, hands and feet on their own
 * drawing. Guesses from the silhouette are shown first, so tapping "Next"
 * through them also works; "Skip" leaves out limbs the drawing doesn't have.
 */
export function JointPicker({ cutout, onDone, onCancel, className }: JointPickerProps) {
  const guess = useMemo(() => guessJoints(analyzeMask(cutout.mask), cutout.mask), [cutout]);
  const [joints, setJoints] = useState<Partial<Joints>>(guess);
  const [step, setStep] = useState(0);
  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const finished = step >= STEPS.length;

  const place = (e: React.PointerEvent<HTMLDivElement>) => {
    if (finished) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cutout.width;
    const y = ((e.clientY - r.top) / r.height) * cutout.height;
    setJoints((j) => ({ ...j, [current.key]: [x, y] }));
    setStep((s) => s + 1);
  };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <p className="text-lg font-semibold text-violet-900">
        {finished ? "All set! Press Done." : `${current.icon} ${current.label}`}
      </p>
      <div
        className="relative mx-auto w-full max-w-sm touch-none select-none rounded-lg border border-zinc-200"
        style={{
          aspectRatio: `${cutout.width} / ${cutout.height}`,
          backgroundImage: "repeating-conic-gradient(#ececf1 0% 25%, #fafafa 0% 50%)",
          backgroundSize: "20px 20px",
        }}
        onPointerDown={place}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cutout.png} alt="your drawing" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
        {STEPS.map((s, i) => {
          const p = joints[s.key];
          if (!p) return null;
          const active = i === step;
          return (
            <span
              key={s.key}
              className={`pointer-events-none absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg shadow-md ${
                active ? "bg-amber-300 ring-4 ring-amber-200" : i < step ? "bg-emerald-300" : "bg-white/80"
              }`}
              style={{ left: `${(p[0] / cutout.width) * 100}%`, top: `${(p[1] / cutout.height) * 100}%` }}
            >
              {s.icon}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {!finished && (
          <button
            className="rounded-full bg-violet-100 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-200 disabled:opacity-40"
            disabled={!joints[current.key]}
            onClick={() => setStep((s) => s + 1)}
          >
            Looks right →
          </button>
        )}
        {!finished && current.optional && (
          <button
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm"
            onClick={() => {
              setJoints((j) => ({ ...j, [current.key]: undefined }));
              setStep((s) => s + 1);
            }}
          >
            Skip (no {current.key.startsWith("hand") ? "hand" : "foot"})
          </button>
        )}
        {step > 0 && (
          <button className="rounded-full border border-zinc-300 px-4 py-2 text-sm" onClick={() => setStep((s) => s - 1)}>
            ← Back
          </button>
        )}
        {onCancel && (
          <button className="rounded-full border border-zinc-300 px-4 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          disabled={!joints.head}
          onClick={() => onDone({ ...(joints as Joints) })}
        >
          Done
        </button>
      </div>
    </div>
  );
}
