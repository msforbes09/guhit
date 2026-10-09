"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isMuted, listenForFirstTap, setMuted, sfx, subscribeMuted } from "@/lib/sfx";
import { SpeakerHigh, SpeakerSlash } from "./icons";

/** On every page: the sounds wake with the first tap (browsers allow none before it). */
export function SoundUnlock() {
  useEffect(() => listenForFirstTap(), []);
  return null;
}

/** Sounds on or off, remembered on this device. */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const Icon = muted ? SpeakerSlash : SpeakerHigh;
  return (
    <button
      type="button"
      aria-label="Sounds"
      aria-pressed={!muted}
      title={muted ? "Sounds are off" : "Sounds are on"}
      onClick={() => {
        setMuted(!muted);
        if (muted) sfx("tap");
      }}
      className={`crayon-edge press inline-flex min-h-14 min-w-14 items-center justify-center rounded-cut px-3 text-ink ${muted ? "bg-paper-deep" : "bg-paper"}`}
    >
      <Icon size={26} weight="fill" aria-hidden="true" />
    </button>
  );
}
