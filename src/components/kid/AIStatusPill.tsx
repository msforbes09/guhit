"use client";

import Link from "next/link";
import { useAIStatus } from "./hooks";
import { DownloadSimple } from "./icons";

/** Tells a grown-up at a glance whether Guhit can talk yet, without any network. */
export function AIStatusPill() {
  const { status, onDevice } = useAIStatus();
  if (status === "unknown") return <span className="h-14" aria-hidden="true" />;

  const ready = status === "ready" || (onDevice && status !== "error");
  const loading = status === "loading";

  if (ready || loading) {
    return (
      <span
        className="inline-flex min-h-12 items-center gap-2.5 rounded-full bg-white/80 px-4 font-display text-lg font-bold text-ink shadow-soft"
        role="status"
      >
        <span
          aria-hidden="true"
          className={`h-3.5 w-3.5 rounded-full ${ready && !loading ? "bg-grass" : "bg-sun-deep animate-pulse"}`}
        />
        {loading ? "Waking up…" : "Ready to talk"}
      </span>
    );
  }

  return (
    <Link
      href="/setup"
      className="crayon-edge press inline-flex min-h-14 items-center gap-2.5 rounded-full bg-white px-4 font-display text-lg font-bold text-ink"
    >
      <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full bg-orange" />
      Not ready yet
      <DownloadSimple size={22} weight="bold" aria-hidden="true" />
    </Link>
  );
}
