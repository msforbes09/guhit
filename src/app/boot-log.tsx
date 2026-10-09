"use client";

import { useEffect } from "react";
import { recordLeave, recordStart } from "@/lib/boot-log";
import { runningInstalled } from "@/components/kid/install";

declare global {
  interface Window {
    /** What the history guard (layout) saw before Next started. */
    __guhitBoot?: { missedTraversal: boolean; how: string };
  }
}

/** Notes each app start and each normal close in the start log (boot-log.ts). */
export function BootLog() {
  useEffect(() => {
    const seen = window.__guhitBoot;
    recordStart({
      at: Date.now(),
      url: location.pathname + location.search,
      how: seen?.how ?? "",
      standalone: runningInstalled(),
      online: navigator.onLine,
      missedTraversal: !!seen?.missedTraversal,
    });
    const leave = () => recordLeave(Date.now());
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);
  return null;
}
