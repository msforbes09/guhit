"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTestMode } from "./hooks";
import { CaretDown, Flask } from "./icons";
import { Button } from "./ui";

/**
 * A small tab at the top of every screen while test mode is on, so testers
 * always know the answers are pretend. Tapping it offers a way out.
 */
const TEST_MANIFEST = "/manifest-test.webmanifest";

/**
 * Installing from test mode must open in test mode too, and an iPhone home
 * screen app gets its own storage (the saved flag does not come along). So
 * the page points at a test manifest (start_url /?mock=1) and keeps ?mock=1
 * in the address bar, which is what iOS saves when adding to the home screen.
 */
function useInstallsAsTest(testing: boolean) {
  const pathname = usePathname();

  useEffect(() => {
    if (!testing) return;
    const point = () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (link && !link.href.endsWith(TEST_MANIFEST)) link.href = TEST_MANIFEST;
    };
    point();
    // The main manifest link is rendered elsewhere; keep it pointed at the test one.
    const watch = new MutationObserver(point);
    watch.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    return () => watch.disconnect();
  }, [testing]);

  useEffect(() => {
    if (!testing) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("mock") === "1") return;
    url.searchParams.set("mock", "1");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [testing, pathname]);
}

export function TestModePill() {
  const testing = useTestMode();
  const [open, setOpen] = useState(false);
  useInstallsAsTest(testing);
  if (!testing) return null;

  const turnOff = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("mock", "0");
    // A full load swaps the pretend engine for the real one.
    window.location.assign(url.toString());
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center">
      <div className="pointer-events-auto flex flex-col items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-b-2xl bg-grape px-3 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] font-display text-sm font-bold text-white shadow-soft"
        >
          <Flask size={16} weight="fill" aria-hidden="true" />
          Test mode
          <CaretDown size={14} weight="bold" aria-hidden="true" className={open ? "rotate-180" : undefined} />
        </button>
        {open && (
          <div className="crayon-edge anim-float-in mt-2 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-cut bg-white p-4 text-center shadow-lift" role="dialog" aria-label="Test mode">
            <p className="text-base text-ink-soft">
              Guhit is using pretend answers and nothing is downloaded. Everything else works as usual.
            </p>
            <Button tone="paper" size="sm" onClick={turnOff}>
              Turn off test mode
            </Button>
            <Button tone="sun" size="sm" onClick={() => setOpen(false)}>
              Keep testing
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
