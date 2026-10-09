"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { MicState } from "./hooks";
import { Microphone, Stop } from "./icons";
import { ThinkingDots } from "./ui";

const HOLD_MS = 450;

/**
 * Giant push-to-talk button. Hold it and let go, or tap once to start and
 * once more to stop: small hands manage either, and nothing listens unasked.
 */
export function MicButton({
  label,
  state,
  level,
  busy = false,
  busyLabel = "Thinking…",
  disabled = false,
  onStart,
  onStop,
  size = "lg",
}: {
  label: string;
  state: MicState;
  level: number;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  size?: "lg" | "md";
}) {
  const pressedAt = useRef(0);
  const holding = useRef(false);
  const [tapMode, setTapMode] = useState(false);
  const live = state === "starting" || state === "recording";
  const blocked = disabled || busy;

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (blocked || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (live && tapMode) {
      setTapMode(false);
      onStop();
      return;
    }
    if (live) return;
    pressedAt.current = performance.now();
    holding.current = true;
    setTapMode(false);
    onStart();
  };

  const up = () => {
    if (!holding.current) return;
    holding.current = false;
    if (performance.now() - pressedAt.current >= HOLD_MS) onStop();
    else setTapMode(true);
  };

  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (e.repeat || blocked) return;
    if (live) {
      setTapMode(false);
      onStop();
    } else {
      setTapMode(true);
      onStart();
    }
  };

  const hint = busy
    ? busyLabel
    : state === "starting"
      ? "Getting ready…"
      : state === "recording"
        ? tapMode
          ? "I'm listening! Tap to stop"
          : "I'm listening! Let go when done"
        : state === "denied"
          ? "Ask a grown-up to allow the microphone"
          : state === "unsupported"
            ? "No microphone here. Type below!"
            : "Hold to talk, or tap";

  const dim = size === "lg" ? "h-36 w-36 sm:h-40 sm:w-40" : "h-28 w-28";
  const halo = live ? 1 + Math.min(1, level) * 0.55 : 1;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid place-items-center">
        {/* Voice halo grows with how loud the child is, so they can see they are heard. */}
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full bg-red/30 transition-transform duration-75 ${live ? "" : "opacity-0"}`}
          style={{ transform: `scale(${halo})` }}
        />
        {state === "recording" && (
          <>
            <span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-red/60 [animation:ripple_1.4s_ease-out_infinite]" />
            <span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-red/40 [animation:ripple_1.4s_ease-out_0.7s_infinite]" />
          </>
        )}
        <button
          type="button"
          aria-label={live ? `Stop talking to ${label.replace(/^Talk to /, "")}` : label}
          aria-pressed={live}
          disabled={blocked}
          onPointerDown={down}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={key}
          onContextMenu={(e) => e.preventDefault()}
          className={`crayon-edge press relative grid ${dim} touch-none select-none place-items-center rounded-full text-white ${
            live ? "bg-red-deep" : "bg-red"
          } ${busy ? "!opacity-100 bg-grape" : ""}`}
        >
          {busy ? (
            <span className="rounded-full bg-white px-3 py-1">
              <ThinkingDots label={busyLabel} />
            </span>
          ) : live ? (
            <Stop size={size === "lg" ? 60 : 48} weight="fill" aria-hidden="true" />
          ) : (
            <Microphone size={size === "lg" ? 72 : 56} weight="fill" aria-hidden="true" />
          )}
        </button>
      </div>
      <div className="text-center">
        <p className="font-display text-2xl font-extrabold leading-tight text-ink">{label}</p>
        <p className="text-base font-bold text-ink-soft" aria-live="polite">
          {hint}
        </p>
      </div>
    </div>
  );
}
