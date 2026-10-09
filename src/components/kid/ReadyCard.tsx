import Link from "next/link";
import { DownloadSimple } from "./icons";
import { LinkButton } from "./ui";

/**
 * Shown instead of the microphone when talking cannot happen here:
 * - "setting-up": a setup started and has not finished; /setup carries it on;
 * - "not-installed": the grown-up did not choose talking, so only a small note;
 * - failed: it is on the device but would not start.
 * Downloading is a grown-up decision, so it lives on /setup.
 */
export function ReadyCard({
  name,
  failed = false,
  reason = "setting-up",
}: {
  name: string;
  failed?: boolean;
  reason?: "setting-up" | "not-installed";
}) {
  if (!failed && reason === "not-installed") {
    return (
      <p className="text-center text-lg text-ink-soft" role="status">
        {`To talk with ${name}, a grown-up can add Talking in `}
        <Link href="/setup" className="font-bold text-ink underline underline-offset-4">
          Get ready
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="crayon-edge flex flex-col items-center gap-3 rounded-cut-lg bg-white p-5 text-center shadow-soft" role="status">
      <p className="font-display text-2xl font-extrabold text-ink">
        {failed ? `${name} is too sleepy to talk` : "Guhit is still getting ready"}
      </p>
      <p className="max-w-xs text-lg text-ink-soft">
        {failed
          ? "Ask a grown-up to open Get ready and try again."
          : `A grown-up started getting Guhit ready. Open Get ready to let it finish, then ${name} can talk.`}
      </p>
      <LinkButton href="/setup" tone="sky" size="md" icon={<DownloadSimple size={26} weight="bold" aria-hidden="true" />}>
        Get ready
      </LinkButton>
    </div>
  );
}
