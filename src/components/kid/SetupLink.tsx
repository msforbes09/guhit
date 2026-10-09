"use client";

import Link from "next/link";
import { useTestMode } from "./hooks";
import { DownloadSimple } from "./icons";

/** The grown-ups' download link; testers in test mode never need it. */
export function SetupLink() {
  const testing = useTestMode();
  if (testing) return <p className="font-bold text-ink-soft">Test mode: nothing to download.</p>;
  return (
    <Link
      href="/setup"
      className="inline-flex min-h-14 items-center gap-2 font-bold text-ink-soft underline decoration-2 underline-offset-4 hover:text-ink"
    >
      <DownloadSimple size={20} weight="bold" aria-hidden="true" />
      Grown-ups: get ready (download)
    </Link>
  );
}
