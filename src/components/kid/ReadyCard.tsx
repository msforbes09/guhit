import { DownloadSimple } from "./icons";
import { LinkButton } from "./ui";

/**
 * Shown instead of the microphone only when a part is on the device but would
 * not start. A part that is missing (not chosen, or a setup still running) is
 * simply not offered on kid screens: no note, no nudge. Choosing parts is a
 * grown-up decision that lives on /setup.
 */
export function ReadyCard({
  name,
  failed = false,
}: {
  name: string;
  failed?: boolean;
  /** Why it is not ready; a missing part shows nothing, so only "failed" matters. */
  reason?: "setting-up" | "not-installed";
}) {
  if (!failed) return null;
  return (
    <div className="crayon-edge flex flex-col items-center gap-3 rounded-cut-lg bg-white p-5 text-center shadow-soft" role="status">
      <p className="font-display text-2xl font-extrabold text-ink">{`${name} is too sleepy to talk`}</p>
      <p className="max-w-xs text-lg text-ink-soft">Ask a grown-up to open Get ready and try again.</p>
      <LinkButton href="/setup" tone="sky" size="md" icon={<DownloadSimple size={26} weight="bold" aria-hidden="true" />}>
        Get ready
      </LinkButton>
    </div>
  );
}
