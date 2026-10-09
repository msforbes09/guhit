"use client";

/**
 * Remembers the browser's install offer. Chrome and Edge fire
 * `beforeinstallprompt` once, often before any component has mounted, so it
 * is caught as soon as this module loads (it is imported from the root
 * layout) and handed to whoever asks later.
 */

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let offer: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep the browser's own mini bar away; Guhit shows its own grown-up card.
    e.preventDefault();
    offer = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    offer = null;
    notify();
  });
}

export function installOffer(): InstallPromptEvent | null {
  return offer;
}

export function justInstalled(): boolean {
  return installed;
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's install dialog; true when the parent accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = offer;
  if (!e) return false;
  offer = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome === "accepted";
}

/** Running as an installed app (home-screen icon, app window). */
export function runningInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

/** iPhone and iPad have no install prompt; the parent adds Guhit from the Share menu. */
export function iosBrowser(): "safari" | "chrome" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch gives it away.
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!ios) return null;
  return /CriOS|EdgiOS|FxiOS/.test(ua) ? "chrome" : "safari";
}

const SNOOZE_KEY = "guhit:install-snoozed-until";
const SNOOZE_DAYS = 7;

export function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // Private mode: the card just comes back next time.
  }
}
