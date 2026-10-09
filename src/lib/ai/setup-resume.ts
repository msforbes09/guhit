/**
 * Setup survives the device sleeping or the parent leaving: every finished
 * file stays cached, and while this flag is set the setup page carries on by
 * itself when it is back on screen, instead of waiting for a tap.
 */
export const SETUP_FLAG = "guhit:setup-in-progress";

/** Automatic restarts in a row before setup waits for the parent's tap. */
export const AUTO_TRIES = 3;

export function markSetupInProgress(on: boolean) {
  try {
    if (on) localStorage.setItem(SETUP_FLAG, "1");
    else localStorage.removeItem(SETUP_FLAG);
  } catch {
    // Private mode or blocked storage: setup then continues on a tap only.
  }
}

export function isSetupInProgress(): boolean {
  try {
    return localStorage.getItem(SETUP_FLAG) === "1";
  } catch {
    return false;
  }
}

export interface ResumeState {
  inProgress: boolean;
  phase: string;
  /** From explainLoadError: only a broken download is worth retrying unattended. */
  errorKind: string | null;
  visible: boolean;
  online: boolean;
  autoTries: number;
}

export function shouldAutoContinue(s: ResumeState): boolean {
  if (!s.inProgress || !s.visible || !s.online || s.autoTries >= AUTO_TRIES) return false;
  return s.phase === "idle" || (s.phase === "error" && s.errorKind === "network");
}
