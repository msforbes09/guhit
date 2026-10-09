/**
 * The snap screen's patience with a cut-out, and the line it leaves in the
 * grown-up details when a plain cut-out was poor: whether the AI model was on
 * the device, and what the AI cut-out did (used, failed, too slow).
 */

export type Settled<T> = { state: "done"; value: T } | { state: "failed"; error: string } | { state: "late" };

/** The work's answer, its error, or "late" once `ms` pass; never rejects. */
export function settleWithin<T>(work: Promise<T>, ms: number): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Settled<T>>((resolve) => (timer = setTimeout(() => resolve({ state: "late" }), ms)));
  const answer = work.then(
    (value): Settled<T> => ({ state: "done", value }),
    (error): Settled<T> => ({ state: "failed", error: error instanceof Error ? error.message : String(error) }),
  );
  return Promise.race([answer, late]).finally(() => clearTimeout(timer));
}

export type AiOutcome =
  | { kind: "not-saved"; missing: string[] }
  | { kind: "used" | "also-poor"; device: "webgpu" | "wasm"; seconds: number; modelLoadSeconds: number }
  | { kind: "failed"; seconds: number; error: string }
  | { kind: "late"; seconds: number; warm: string };

export function cutoutNote(plain: { quality: string; reasons: string[] }, ai: AiOutcome, offline: boolean): string {
  const start = `Cut-out${offline ? " (offline)" : ""}: the plain one was ${plain.quality}${plain.reasons.length ? ` (${plain.reasons.join(", ")})` : ""}`;
  const kept = "kept the plain one";
  switch (ai.kind) {
    case "not-saved":
      return `${start}; AI model not on this device (missing ${ai.missing.join(", ")}), ${kept}`;
    case "used":
    case "also-poor":
      return `${start}; AI on ${ai.device} in ${ai.seconds} s (model start ${ai.modelLoadSeconds} s): ${ai.kind === "used" ? "used the AI one" : `also poor, ${kept}`}`;
    case "failed":
      return `${start}; AI failed after ${ai.seconds} s: ${ai.error}; ${kept}`;
    case "late":
      return `${start}; AI gave no answer in ${ai.seconds} s (AI model ${ai.warm}), ${kept}`;
  }
}
