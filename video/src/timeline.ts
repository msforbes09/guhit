// The edit: beats in order, each with its scenes and (optionally) one
// narration line. A beat lasts long enough for its scenes' minimum lengths
// AND its narration (lead-in + line + tail), so new narration audio
// (ElevenLabs instead of the Kokoro placeholders) re-times the cut by itself.
// If the total runs past MAX_SECONDS, flexible scenes give back time first.
import hero from "../footage/hero.json";
import narration from "../public/voice/narration.json";

export const FPS = 30;
/** Hard ceiling: the brief says ≤ 60.0 s; keep a little margin for the AAC tail. */
export const MAX_SECONDS = 59.7;

export type SceneId =
  | "draw" | "snapPhoto" | "alive" | "problemA" | "problemB" | "logo" | "snapApp" | "cutout" | "meadow"
  | "vehicle" | "plant" | "flyer" | "look" | "guess" | "hold" | "answer" | "airplane" | "setup" | "diagram"
  | "title" | "endLogo" | "maker";

interface SceneSpec {
  id: SceneId;
  /** Shortest it can be (s); also its share when the beat is longer. */
  min: number;
  /** Can shrink to `floor` when the cut runs long. */
  floor?: number;
}

interface BeatSpec {
  scenes: SceneSpec[];
  /** Narration lines in this beat, played back to back from `lead` seconds in. */
  lines?: string[];
  lead?: number;
  tail?: number;
  gap?: number;
  /** Keep the whole line (and its caption) inside the first scene: no caption across a cut. */
  lineInFirst?: boolean;
}

type HeroMarks = Record<string, number>;
const marks = hero.marks as HeroMarks;
const voices = hero.voice as { at: number; seconds: number }[];

/** The character's spoken lines in the hero footage that start after a mark. */
export function voiceAfter(mark: string) {
  const t = marks[mark] ?? 0;
  return voices.filter((v) => v.at >= t - 0.05);
}
const replyVoice = voiceAfter("heard");
const replySeconds = replyVoice.length ? replyVoice[replyVoice.length - 1].at + replyVoice[replyVoice.length - 1].seconds - (marks.heard ?? 0) : 3.5;

export const BEATS: BeatSpec[] = [
  { scenes: [{ id: "draw", min: 1.4 }, { id: "snapPhoto", min: 0.9 }, { id: "alive", min: 2.3 }], lines: ["hook"], lead: 0.3 },
  { scenes: [{ id: "problemA", min: 2.4 }], lines: ["problem-a"], lead: 0.15, tail: 0.15 },
  { scenes: [{ id: "problemB", min: 2.0 }], lines: ["problem-b"], lead: 0.1, tail: 0.05 },
  { scenes: [{ id: "logo", min: 3.95, floor: 3.6 }] },
  { scenes: [{ id: "snapApp", min: 1.9 }], lines: ["snap-a"], lead: 0.1, tail: 0.1 },
  { scenes: [{ id: "cutout", min: 2.2 }, { id: "meadow", min: 2.4, floor: 2.0 }], lines: ["snap-b"], lead: 0.1, lineInFirst: true },
  { scenes: [{ id: "vehicle", min: 2.1, floor: 1.8 }, { id: "plant", min: 2.1, floor: 1.8 }, { id: "flyer", min: 2.2, floor: 1.9 }], lines: ["moves"], lead: 0.15, lineInFirst: true },
  // The guess is said out loud by the drawing in the guess scene: the narration finishes in "look".
  { scenes: [{ id: "look", min: 2.75 }, { id: "guess", min: 3.6, floor: 3.3 }], lines: ["guess"], lead: 0.15, lineInFirst: true },
  { scenes: [{ id: "hold", min: 3.0 }, { id: "answer", min: Math.max(3.2, replySeconds + 0.6), floor: Math.max(3.0, replySeconds + 0.4) }], lines: ["talk"], lead: 0.1, lineInFirst: true },
  { scenes: [{ id: "airplane", min: 3.0, floor: 2.6 }], lines: ["offline-a"], lead: 0.15, tail: 0.1 },
  { scenes: [{ id: "setup", min: 3.5 }], lines: ["offline-b"], lead: 0.1, tail: 0.05 },
  { scenes: [{ id: "diagram", min: 3.7 }], lines: ["offline-c"], lead: 0.1, tail: 0.1 },
  { scenes: [{ id: "title", min: 4.4 }], lines: ["title-a", "title-b", "title-c"], lead: 0.2, gap: 0.05, tail: 0.0 },
  { scenes: [{ id: "endLogo", min: 2.8 }], lines: ["end"], lead: 0.2 },
  { scenes: [{ id: "maker", min: 2.3, floor: 2.0 }] },
];

type Manifest = { lines: Record<string, { text: string; file: string; seconds: number; engine: string }> };
const lines = (narration as Manifest).lines;
export const lineSeconds = (id: string) => lines[id]?.seconds ?? 2;
export const lineText = (id: string) => lines[id]?.text ?? id;
export const lineFile = (id: string) => lines[id]?.file;
export const narrationEngine = () => Object.values(lines)[0]?.engine ?? "none";

export interface Scene {
  id: SceneId;
  from: number;
  dur: number;
}
export interface Cue {
  id: string;
  at: number;
  seconds: number;
  text: string;
  file?: string;
}

function build() {
  const sized = BEATS.map((beat) => {
    const minScenes = beat.scenes.reduce((a, s) => a + s.min, 0);
    const spoken = (beat.lines ?? []).reduce((a, id, i) => a + lineSeconds(id) + (i ? beat.gap ?? 0.05 : 0), 0);
    const need = beat.lines?.length ? (beat.lead ?? 0) + spoken + (beat.tail ?? 0) : 0;
    return { beat, length: Math.max(minScenes, need), minScenes, need };
  });
  let total = sized.reduce((a, b) => a + b.length, 0);
  // Over time: shrink flexible scenes (never below their floor, never under the narration).
  if (total > MAX_SECONDS) {
    let over = total - MAX_SECONDS;
    for (const s of sized) {
      const give = s.beat.scenes.reduce((a, sc) => a + (sc.min - (sc.floor ?? sc.min)), 0);
      const canGive = Math.min(give, s.length - Math.max(s.need, s.minScenes - give));
      const take = Math.max(0, Math.min(canGive, over));
      if (take > 0) {
        s.length -= take;
        over -= take;
      }
      if (over <= 0) break;
    }
    total = sized.reduce((a, b) => a + b.length, 0);
  }
  const scenes: Scene[] = [];
  const cues: Cue[] = [];
  let t = 0;
  for (const s of sized) {
    const weights = s.beat.scenes.reduce((a, sc) => a + sc.min, 0);
    const durs = s.beat.scenes.map((sc) => (s.length * sc.min) / weights);
    if (s.beat.lineInFirst && durs.length > 1) {
      // The first scene holds the line plus a short beat after it; the others share the rest.
      const want = s.need - (s.beat.tail ?? 0) + 0.2;
      if (durs[0] < want) {
        const restBefore = s.length - durs[0];
        durs[0] = want;
        const scale = (s.length - want) / restBefore;
        for (let i = 1; i < durs.length; i++) durs[i] *= scale;
      }
    }
    let st = t;
    for (const [i, sc] of s.beat.scenes.entries()) {
      scenes.push({ id: sc.id, from: st, dur: durs[i] });
      st += durs[i];
    }
    let ct = t + (s.beat.lead ?? 0);
    for (const id of s.beat.lines ?? []) {
      cues.push({ id, at: ct, seconds: lineSeconds(id), text: lineText(id), file: lineFile(id) });
      ct += lineSeconds(id) + (s.beat.gap ?? 0.05);
    }
    t += s.length;
  }
  return { scenes, cues, total: t };
}

export const EDIT = build();
export const TOTAL_FRAMES = Math.round(EDIT.total * FPS);
export const f = (seconds: number) => Math.round(seconds * FPS);
export const scene = (id: SceneId) => {
  const s = EDIT.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`No scene ${id}`);
  return s;
};
/**
 * Screencast frames reach the clip about a quarter second after the moment the
 * capture script marks (the page still has to paint), so cuts aim at mark + LAG.
 */
export const LAG = 0.25;
type HeroTexts = { guess?: string | null; greeting?: string | null; said?: string | null; reply?: string | null };
export const HERO = { marks, voices, replySeconds, texts: ((hero as { texts?: HeroTexts }).texts ?? {}) as HeroTexts };
