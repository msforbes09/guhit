/**
 * What a guess cut short tells the next page life (guess-guard.ts). No
 * imports, so Node's test runner loads it as is.
 */

/** "<page> <model> <step>": the guess running now and how far it got, kept in storage. */
export const runningMark = (page: string, model: string, stage: string) => `${page} ${model} ${stage}`;

export function readMark(mark: string): { page: string; model: string; stage: string } {
  const [page = "", model = "", ...stage] = mark.split(" ");
  return { page, model, stage: stage.join(" ") };
}

export type Leftover =
  | { kind: "none" }
  /** A guess on the full eyes was cut short: this device moves to the light eyes. */
  | { kind: "full-eyes"; stage: string }
  /** A light-eyes guess was cut short: the next guess tries again. */
  | { kind: "retry"; stage: string; crashes: number }
  /** The second light-eyes guess in a row cut short: no guesses until the app is opened again. */
  | { kind: "rest"; stage: string };

/** Reads the mark a page that stopped without closing left behind; `crashes` counts light-eyes ones in a row before it. */
export function judgeLeftover(mark: string | null, page: string, lightModel: string, crashes: number): Leftover {
  if (mark === null) return { kind: "none" };
  const left = readMark(mark);
  if (left.page === page) return { kind: "none" };
  if (left.model !== lightModel) return { kind: "full-eyes", stage: left.stage };
  return crashes + 1 >= 2 ? { kind: "rest", stage: left.stage } : { kind: "retry", stage: left.stage, crashes: crashes + 1 };
}
