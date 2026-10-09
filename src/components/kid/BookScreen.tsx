"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getAI } from "@/lib/ai";
import { sfx } from "@/lib/sfx";
import { planBabble } from "@/lib/sfx/babble";
import { hush, isVoiceReady, sayAsCharacter } from "@/lib/sfx/voice";
import { getStory } from "@/lib/story/db";
import { settledKind, type Kind } from "@/lib/story/kind";
import { motionFor, stagingFor, type Scene, type Staging } from "@/lib/story/staging";
import type { Story } from "@/lib/story/types";
import type { Motion } from "./alive";
import { Backdrop } from "./Backdrop";
import { speechLevel } from "./hooks";
import { CaretLeft, CaretRight, House, Play, Stop } from "./icons";
import { StagedCharacter } from "./StoryPage";
import { Button, LinkButton, TopBar } from "./ui";

/** How long a page takes to turn, and to let the character come on before reading starts. */
const TURN_MS = 720;
const SETTLE_MS = 950;
const PAUSE_BETWEEN_PAGES = 900;
const SENTENCE_GAP_MS = 260;
/** Babble carries no words, so a page stays at least this long per word: time to look and follow along. */
const MS_PER_WORD = 300;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sentences = (text: string) => (text.match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g) ?? [text]).map((s) => s.trim()).filter(Boolean);

/** /book?id=<story>: the finished storybook, kept on this device. */
export function BookScreen() {
  const id = useSearchParams().get("id");
  const [story, setStory] = useState<Story | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    (id ? getStory(id) : Promise.resolve(undefined))
      .then((s) => alive && setStory(s ?? null))
      .catch(() => alive && setStory(null));
    return () => {
      alive = false;
    };
  }, [id]);

  if (story === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col" aria-busy="true">
        <TopBar />
        <div className="mx-4 h-[70vh] animate-pulse rounded-cut-lg bg-paper-deep sm:mx-6" />
      </main>
    );
  }
  if (!story) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <TopBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-16 text-center">
          <p className="font-display text-4xl font-black text-ink">This book isn&rsquo;t on the shelf</p>
          <LinkButton href="/" tone="sun" size="lg" icon={<House size={30} weight="fill" aria-hidden="true" />}>
            Go home
          </LinkButton>
        </div>
      </main>
    );
  }
  return <Book story={story} />;
}

/** Which page is being read aloud, and how long its words take to light up. */
interface ReadAlong {
  index: number;
  ms: number;
  token: number;
}

function Book({ story }: { story: Story }) {
  const name = story.character.name;
  const cutout = story.character.cutout ?? story.character.drawing;
  const kind = settledKind(story.character);
  const title = story.title || `A story with ${name}`;
  const last = story.pages.length;
  // -1 is the cover, pages.length is "The End".
  const [at, setAt] = useState(-1);
  const atRef = useRef(-1);
  const [leaving, setLeaving] = useState<{ index: number; dir: "next" | "back" } | null>(null);
  const [reading, setReading] = useState(false);
  const [readAlong, setReadAlong] = useState<ReadAlong | null>(null);
  const readToken = useRef(0);

  const stagings = useMemo(() => story.pages.map((p) => stagingFor(p, kind)), [story, kind]);
  const coverScene = useMemo(() => mainScene(stagings.map((s) => s.scene)), [stagings]);

  const turnTo = useCallback(
    (to: number) => {
      const from = atRef.current;
      const next = Math.max(-1, Math.min(last, to));
      if (next === from) return;
      atRef.current = next;
      setLeaving({ index: from, dir: next > from ? "next" : "back" });
      setAt(next);
      sfx("page");
    },
    [last],
  );

  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => setLeaving(null), TURN_MS);
    return () => clearTimeout(id);
  }, [leaving]);

  const stopReading = useCallback(() => {
    readToken.current++;
    setReading(false);
    setReadAlong(null);
    hush();
  }, []);

  const textAt = useCallback(
    (i: number) => (i < 0 ? title : i >= last ? "The End." : story.pages[i].text),
    [last, story, title],
  );

  /**
   * Reads one page: in the storytelling voice when it is ready, otherwise the
   * character babbles it sentence by sentence while the words light up.
   */
  const readPage = useCallback(
    async (i: number, token: number) => {
      const text = textAt(i);
      if (isVoiceReady()) {
        setReadAlong({ index: i, ms: Math.max(1200, text.length * 62), token });
        await getAI().speak(text, "narrator");
        return;
      }
      const parts = sentences(text);
      const babbling = parts.reduce((sum, s) => sum + planBabble(s, kind).length * 1000 + SENTENCE_GAP_MS, 0);
      const ms = Math.max(babbling, text.split(/\s+/).length * MS_PER_WORD);
      setReadAlong({ index: i, ms, token });
      const started = performance.now();
      for (const part of parts) {
        if (readToken.current !== token) return;
        await sayAsCharacter(part, kind);
        await wait(SENTENCE_GAP_MS);
      }
      await wait(ms - (performance.now() - started));
    },
    [kind, textAt],
  );

  // Reads from the open page to the end, turning the pages by itself.
  const readToMe = async () => {
    const token = ++readToken.current;
    setReading(true);
    for (let i = atRef.current; i <= last; i++) {
      if (readToken.current !== token) return;
      if (i !== atRef.current) {
        turnTo(i);
        await wait(SETTLE_MS);
        if (readToken.current !== token) return;
      }
      try {
        await readPage(i, token);
      } catch {
        // Keep turning pages even if a sentence could not be spoken.
      }
      if (readToken.current !== token) return;
      await wait(PAUSE_BETWEEN_PAGES);
    }
    if (readToken.current === token) {
      setReading(false);
      setReadAlong(null);
    }
  };

  useEffect(() => () => stopReading(), [stopReading]);

  const step = useCallback(
    (by: number) => {
      stopReading();
      turnTo(atRef.current + by);
    },
    [stopReading, turnTo],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step]);

  // A swipe turns the page on a phone.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from || e.pointerType === "mouse") return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - from.y) * 1.5) step(dx < 0 ? 1 : -1);
  };

  const sheet = (index: number, live: boolean) => {
    const along = live && readAlong?.index === index ? readAlong : null;
    if (index < 0) {
      return (
        <Sheet
          staging={{ scene: coverScene, move: "idle", props: [] }}
          cutout={cutout}
          kind={kind}
          motion={kind === "creature" ? "wave" : "bounce"}
          cover
        >
          <p className="font-display text-base font-bold uppercase tracking-[0.18em] text-grape-deep">A Guhit storybook</p>
          <h2 className="font-display text-[2.1rem] font-black leading-[1.05] text-ink sm:text-5xl lg:text-6xl">
            <Words text={title} along={along} />
          </h2>
          <Flourish />
        </Sheet>
      );
    }
    if (index >= last) {
      return (
        <Sheet staging={{ ...(stagings[last - 1] ?? stagings[0]), props: [] }} cutout={cutout} kind={kind} motion="dance">
          <p className="font-display text-5xl font-black text-ink sm:text-6xl">
            <Words text="The End" along={along} />
          </p>
          <Flourish />
          <div className="mt-2 flex flex-wrap gap-3">
            <Button tone="sun" size="md" onClick={() => step(-(last + 1))}>
              Read it again
            </Button>
            <LinkButton href={`/friend?id=${encodeURIComponent(story.character.id)}`} tone="grass" size="md">
              Talk to {name}
            </LinkButton>
          </div>
        </Sheet>
      );
    }
    const staging = stagings[index];
    return (
      <Sheet staging={staging} cutout={cutout} kind={kind} motion={motionFor(staging.move, kind)} label={`${index + 1}`}>
        <p className="text-[1.45rem] leading-snug text-ink sm:text-[1.7rem] lg:text-[2rem] lg:leading-[1.35] [@media(max-height:700px)]:text-[1.2rem]">
          <Words text={story.pages[index].text} along={along} />
        </p>
      </Sheet>
    );
  };

  const showLeaving = leaving && leaving.index !== at ? leaving : null;
  const pageLabel = at < 0 ? "Cover" : at >= last ? "The End" : `Page ${at + 1} of ${last}`;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-6xl flex-col overflow-hidden">
      <TopBar
        title={title}
        back={`/friend?id=${encodeURIComponent(story.character.id)}`}
        backLabel={name}
        right={
          reading ? (
            <Button tone="red" size="sm" onClick={stopReading} icon={<Stop size={24} weight="fill" aria-hidden="true" />}>
              <span className="max-sm:sr-only">Stop</span>
            </Button>
          ) : (
            <Button tone="sun" size="sm" onClick={readToMe} icon={<Play size={24} weight="fill" aria-hidden="true" />}>
              Read to me
            </Button>
          )
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div
          className="relative min-h-0 flex-1 touch-pan-y [perspective:4200px]"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          aria-live="polite"
        >
          {showLeaving && (
            <div
              key={`sheet-${showLeaving.index}`}
              className={`absolute inset-0 z-20 ${showLeaving.dir === "next" ? "book-leave-next" : "book-leave-back"}`}
              aria-hidden="true"
            >
              {sheet(showLeaving.index, false)}
            </div>
          )}
          <div key={`sheet-${at}`} className="absolute inset-0 z-10">
            {sheet(at, true)}
          </div>
        </div>

        <nav className="flex items-center justify-between gap-4" aria-label="Turn the pages">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={at <= -1}
            aria-label="Previous page"
            className="crayon-edge press grid h-16 w-16 place-items-center rounded-full bg-white text-ink"
          >
            <CaretLeft size={34} weight="bold" aria-hidden="true" />
          </button>
          <div className="flex flex-col items-center gap-1.5">
            <ol className="flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: last + 2 }, (_, i) => (
                <li
                  key={i}
                  className={`h-2.5 rounded-full transition-all duration-300 ${i - 1 === at ? "w-6 bg-sun-deep" : i - 1 < at ? "w-2.5 bg-grass" : "w-2.5 bg-paper-edge"}`}
                />
              ))}
            </ol>
            <p className="font-display text-lg font-bold text-ink-soft">{pageLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={at >= last}
            aria-label="Next page"
            className="crayon-edge press grid h-16 w-16 place-items-center rounded-full bg-sun text-ink"
          >
            <CaretRight size={34} weight="bold" aria-hidden="true" />
          </button>
        </nav>
      </div>

      <style href="book-turn" precedence="default">
        {BOOK_CSS}
      </style>
    </main>
  );
}

/** The cover shows where most of the story happens (home only when nothing else is there). */
function mainScene(scenes: Scene[]): Scene {
  const counts = new Map<Scene, number>();
  for (const scene of scenes) if (scene !== "home") counts.set(scene, (counts.get(scene) ?? 0) + 1);
  let best: Scene = scenes[0] ?? "meadow";
  let most = 0;
  for (const [scene, n] of counts) if (n > most) [best, most] = [scene, n];
  return best;
}

/**
 * One sheet of the open book: the scene with the character acting it out,
 * and the words. Upright phones stack them; wide screens lay them side by
 * side like an open book.
 */
function Sheet({
  staging,
  cutout,
  kind,
  motion,
  label,
  cover = false,
  children,
}: {
  staging: Staging;
  cutout: string | undefined;
  kind: Kind;
  motion: Motion;
  label?: string;
  cover?: boolean;
  children: ReactNode;
}) {
  return (
    <article className="crayon-edge flex h-full flex-col overflow-hidden rounded-cut-lg bg-paper shadow-lift md:landscape:grid md:landscape:grid-cols-[1.45fr_1fr] md:landscape:grid-rows-1">
      <Backdrop scene={staging.scene} props={staging.props} bedtime={staging.move === "sleep"} className="min-h-0 flex-1">
        {cutout && <StagedCharacter cutout={cutout} kind={kind} motion={motion} level={speechLevel} />}
        {label && (
          <span className="absolute left-3 top-3 z-10 grid h-11 min-w-11 place-items-center rounded-full bg-white/90 px-2 font-display text-xl font-black text-ink shadow-soft">
            {label}
          </span>
        )}
      </Backdrop>
      <div
        className={`book-words relative flex shrink-0 basis-[36%] flex-col justify-center gap-2 px-5 py-4 sm:px-8 md:landscape:px-10 ${
          cover ? "items-start" : ""
        }`}
      >
        {children}
      </div>
    </article>
  );
}

/** The page's words; while it is read aloud they light up one by one. */
function Words({ text, along }: { text: string; along: ReadAlong | null }) {
  if (!along) return <>{text}</>;
  const words = text.split(/(\s+)/);
  const count = words.filter((w) => w.trim()).length || 1;
  const per = along.ms / count;
  let n = 0;
  return (
    <span key={along.token}>
      {words.map((w, i) =>
        w.trim() ? (
          <span key={i} className="read-word" style={{ "--at": `${Math.round(n++ * per)}ms` } as CSSProperties}>
            {w}
          </span>
        ) : (
          w
        ),
      )}
    </span>
  );
}

/** A little crayon squiggle under a heading. */
function Flourish() {
  return (
    <svg viewBox="0 0 160 16" className="h-4 w-36" aria-hidden="true">
      <path d="M4 10 Q24 2 44 9 T84 9 T124 9 T156 7" fill="none" stroke="var(--crayon-sun-deep)" strokeWidth="4" strokeLinecap="round" filter="url(#crayon-edge)" />
    </svg>
  );
}

const BOOK_CSS = `
@keyframes book-leave-next{0%{transform:rotateY(0)}100%{transform:rotateY(-104deg)}}
@keyframes book-leave-back{0%{transform:rotateY(0)}100%{transform:rotateY(104deg)}}
@keyframes book-shade{0%{opacity:0}100%{opacity:1}}
.book-leave-next,.book-leave-back{backface-visibility:hidden;animation:book-leave-next ${TURN_MS}ms cubic-bezier(.45,.05,.55,.95) both;transform-origin:left center;pointer-events:none}
.book-leave-back{animation-name:book-leave-back;transform-origin:right center}
.book-leave-next::after,.book-leave-back::after{content:"";position:absolute;inset:0;border-radius:var(--cut-lg);background:linear-gradient(to left,rgb(42 34 56/.38),rgb(42 34 56/.05) 70%);animation:book-shade ${TURN_MS}ms ease-in both;pointer-events:none;z-index:30}
.book-leave-back::after{background:linear-gradient(to right,rgb(42 34 56/.38),rgb(42 34 56/.05) 70%)}
.book-words{background:var(--paper)}
@media (orientation:landscape) and (min-width:768px){.book-words::before{content:"";position:absolute;inset-block:0;left:0;width:28px;background:linear-gradient(to right,rgb(42 34 56/.14),transparent);pointer-events:none}}
@keyframes read-word{0%{color:var(--ink-faint);background-size:0 40%}25%{color:var(--ink);background-size:100% 40%}100%{color:var(--ink);background-size:100% 0}}
.read-word{color:var(--ink-faint);background-image:linear-gradient(var(--crayon-sun),var(--crayon-sun));background-repeat:no-repeat;background-position:0 90%;background-size:0 40%;animation:read-word 1s ease-out var(--at) both}
`;
