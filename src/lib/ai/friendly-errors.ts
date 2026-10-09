/**
 * Turns a library error ("TypeError: Load failed", "Unable to find a
 * compatible GPU…") into words for a parent: what happened, what to do, and
 * which button to show. The raw text stays available for a "details" line.
 */
export interface FriendlyError {
  title: string;
  action: string;
  /** Label of the button that tries again. */
  button: string;
  /**
   * "network": a retry continues where it stopped (what is downloaded is kept).
   * "gpu": the button switches this device to the CPU tier (/setup?gpu=off).
   */
  kind: "network" | "gpu" | "space" | "memory" | "other";
}

const NETWORK =
  /load failed|failed to fetch|networkerror|network error|network connection|download failed|resume failed|no network|could not locate file|err_|timed? ?out|aborted/i;
const GPU = /compatible gpu|webgpu|gpuadapter|requestadapter|adapter|device (?:was )?lost|shader-f16/i;
const SPACE = /quota|exceeded the quota|not enough space|storage/i;
const MEMORY = /out of memory|memory|oom|allocation failed|array buffer allocation/i;

export function explainLoadError(error: unknown): FriendlyError {
  const message = error instanceof Error ? error.message : String(error);
  if (SPACE.test(message)) {
    return {
      kind: "space",
      title: "This device is running out of free space.",
      action: "Free up some space (about 2 GB on a laptop, 1 GB on a phone), then tap Continue. What's already downloaded is kept.",
      button: "Continue",
    };
  }
  if (GPU.test(message)) {
    return {
      kind: "gpu",
      title: "This browser can't use this computer's graphics chip for Guhit.",
      action: "Guhit can run without it, only slower. Tap below to carry on that way.",
      button: "Continue without the graphics chip",
    };
  }
  if (MEMORY.test(message)) {
    return {
      kind: "memory",
      title: "This device ran out of memory while getting Guhit ready.",
      action: "Close other apps and browser tabs, then tap Continue. What's already downloaded is kept.",
      button: "Continue",
    };
  }
  if (NETWORK.test(message)) {
    return {
      kind: "network",
      title: "The download was interrupted.",
      action:
        "Keep this screen open and connected to Wi-Fi, then tap Continue download. What's already downloaded is kept.",
      button: "Continue download",
    };
  }
  return {
    kind: "other",
    title: "Guhit couldn't get ready this time.",
    action: "Tap Try again. If it keeps happening, close the browser completely and open Guhit again.",
    button: "Try again",
  };
}
