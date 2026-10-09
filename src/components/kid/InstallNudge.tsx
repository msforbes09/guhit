"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Export, PlusSquare } from "./icons";
import { iosBrowser, installOffer, justInstalled, onInstallChange, promptInstall, runningInstalled, snooze, snoozed } from "./install";
import { LogoMark } from "./Logo";
import { Button } from "./ui";

export type InstallMode = "prompt" | "ios-safari" | "ios-chrome";

const subscribe = (cb: () => void) => onInstallChange(cb);

/**
 * A card for the grown-up, never over the child's flow: install Guhit so it
 * opens like an app, works offline and its downloaded models are kept safe.
 * One tap where the browser can install (Chrome, Edge, Android); Share-menu
 * steps on iPhone and iPad; nothing at all when already installed.
 */
export function InstallNudge({ className }: { className?: string }) {
  const offer = useSyncExternalStore(subscribe, installOffer, () => null);
  const installed = useSyncExternalStore(subscribe, justInstalled, () => false);
  // Browser-only facts are read after mounting so the server and first paint agree.
  const [env, setEnv] = useState<{ standalone: boolean; ios: "safari" | "chrome" | null; snoozed: boolean } | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEnv({ standalone: runningInstalled(), ios: iosBrowser(), snoozed: snoozed() }));
    return () => cancelAnimationFrame(id);
  }, []);
  const [dismissed, setDismissed] = useState(false);

  if (!env || env.standalone || env.snoozed || installed || dismissed) return null;
  const mode: InstallMode | null = offer ? "prompt" : env.ios === "safari" ? "ios-safari" : env.ios === "chrome" ? "ios-chrome" : null;
  if (!mode) return null;

  return (
    <InstallCard
      mode={mode}
      className={className}
      onInstall={() => {
        promptInstall().catch(() => {});
      }}
      onLater={() => {
        snooze();
        setDismissed(true);
      }}
    />
  );
}

/** The card itself, kept separate from the browser logic. */
export function InstallCard({
  mode,
  onInstall,
  onLater,
  className,
}: {
  mode: InstallMode;
  onInstall: () => void;
  onLater: () => void;
  className?: string;
}) {
  return (
    <aside
      aria-labelledby="install-title"
      className={`crayon-edge flex flex-col gap-4 rounded-cut-lg bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:gap-6 sm:p-6 ${className ?? ""}`}
    >
      <LogoMark className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 id="install-title" className="font-display text-2xl font-extrabold text-ink">
          Install Guhit
        </h2>
        <p className="text-lg text-ink-soft">It opens like an app, works offline, and the browser keeps its downloads safe.</p>
        {mode !== "prompt" && (
          <ol className="mt-1 flex flex-col gap-2 text-lg text-ink">
            <li className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky/25" aria-hidden="true">
                <Export size={24} weight="bold" />
              </span>
              <span>
                {mode === "ios-safari" ? (
                  <>
                    Tap <strong>Share</strong> in Safari&rsquo;s toolbar
                  </>
                ) : (
                  <>
                    Tap <strong>Share</strong> at the top right
                  </>
                )}
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sun/40" aria-hidden="true">
                <PlusSquare size={24} weight="bold" />
              </span>
              <span>
                Choose <strong>Add to Home Screen</strong>
              </span>
            </li>
          </ol>
        )}
      </div>
      <div className="flex shrink-0 flex-row gap-3 sm:flex-col">
        {mode === "prompt" && (
          <Button tone="sun" size="md" onClick={onInstall} className="flex-1">
            Install
          </Button>
        )}
        <Button tone="paper" size="md" onClick={onLater} className="flex-1">
          Not now
        </Button>
      </div>
    </aside>
  );
}
