import { DownloadSimple } from "./icons";
import { LinkButton } from "./ui";

/**
 * Shown instead of the microphone when the AI is not on this device yet.
 * Downloading is a grown-up decision (about 1 GB), so it lives on /setup.
 */
export function ReadyCard({ name, failed = false }: { name: string; failed?: boolean }) {
  return (
    <div className="crayon-edge flex flex-col items-center gap-3 rounded-cut-lg bg-white p-5 text-center shadow-soft" role="status">
      <p className="font-display text-2xl font-extrabold text-ink">
        {failed ? `${name} is too sleepy to talk` : "Get Guhit ready first"}
      </p>
      <p className="max-w-xs text-lg text-ink-soft">
        {failed
          ? "Ask a grown-up to open Get ready and try again."
          : `A grown-up needs to get Guhit ready once. Then ${name} can talk, even with no internet.`}
      </p>
      <LinkButton href="/setup" tone="sky" size="md" icon={<DownloadSimple size={26} weight="bold" aria-hidden="true" />}>
        Get ready
      </LinkButton>
    </div>
  );
}
