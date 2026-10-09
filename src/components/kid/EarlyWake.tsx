"use client";

import { useEffect } from "react";
import { getAI, isMarkedReady } from "@/lib/ai";
// Loaded on every page so the browser's one-time install offer is never missed.
import "./install";

/**
 * Starts loading the on-device models the moment any page opens (behind the
 * splash and the home screen), so the character is awake by the time the
 * child needs it. Only when /setup already put them on this device: it never
 * starts a download, and load() does nothing if loading has begun.
 */
export function EarlyWake() {
  useEffect(() => {
    // A moment's grace so the first frame and the splash paint before the work starts.
    const id = setTimeout(() => {
      if (!isMarkedReady()) return;
      const ai = getAI();
      if (ai.status() !== "idle") return;
      ai.load(() => {}).catch(() => {
        // status() turns to "error"; the talk screens show the setup card.
      });
    }, 150);
    return () => clearTimeout(id);
  }, []);
  return null;
}
