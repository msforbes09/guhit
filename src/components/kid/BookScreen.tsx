"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAI } from "@/lib/ai";
import { getStory } from "@/lib/story/db";
import type { Story } from "@/lib/story/types";
import { sceneFor } from "./Backdrop";
import { CaretLeft, CaretRight, House, Play, Stop } from "./icons";
import { StoryPage } from "./StoryPage";
import { Button, LinkButton, TopBar } from "./ui";

const PAUSE_BETWEEN_PAGES = 700;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function Book({ story }: { story: Story }) {
  const name = story.character.name;
  const cutout = story.character.cutout ?? story.character.drawing;
  // -1 is the cover, pages.length is "The End".
  const [at, setAt] = useState(-1);
  const [turn, setTurn] = useState<"next" | "back">("next");
  const [reading, setReading] = useState(false);
  const readToken = useRef(0);
  const last = story.pages.length;

  const go = useCallback(
    (to: number) => {
      const next = Math.max(-1, Math.min(last, to));
      setTurn(next >= at ? "next" : "back");
      setAt(next);
    },
    [at, last],
  );

  const stopReading = useCallback(() => {
    readToken.current++;
    setReading(false);
    getAI().stopSpeaking();
  }, []);

  const textAt = useCallback(
    (i: number) => (i < 0 ? `${story.title}. A story with ${name}.` : i >= last ? "The End." : story.pages[i].text),
    [last, name, story],
  );

  // Reads from the open page to the end, turning pages by itself.
  const readToMe = async () => {
    const token = ++readToken.current;
    setReading(true);
    const ai = getAI();
    for (let i = at; i <= last; i++) {
      if (readToken.current !== token) return;
      setTurn("next");
      setAt(i);
      try {
        await ai.speak(textAt(i), "narrator");
      } catch {
        // Keep turning pages even if a sentence could not be spoken.
      }
      if (readToken.current !== token) return;
      await wait(PAUSE_BETWEEN_PAGES);
    }
    if (readToken.current === token) setReading(false);
  };

  useEffect(() => () => stopReading(), [stopReading]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        stopReading();
        go(at + 1);
      } else if (e.key === "ArrowLeft") {
        stopReading();
        go(at - 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [at, go, stopReading]);

  const pageLabel = at < 0 ? "Cover" : at >= last ? "The End" : `Page ${at + 1} of ${last}`;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      <TopBar
        title={story.title || `A story with ${name}`}
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

      <div className="flex flex-1 flex-col gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="relative flex-1 [perspective:1800px]">
          <div key={at} className={turn === "next" ? "book-turn-next" : "book-turn-back"} aria-live="polite">
            {at < 0 ? (
              <StoryPage cutout={cutout} scene="meadow" motion="bounce" label="Cover">
                <h2 className="text-center text-4xl font-black leading-tight text-ink sm:text-5xl">{story.title || `A story with ${name}`}</h2>
                <p className="text-center text-xl text-ink-soft">
                  A story with {name} · {new Date(story.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </StoryPage>
            ) : at >= last ? (
              <StoryPage cutout={cutout} scene="night" motion="wave" label="The End">
                <p className="text-center font-display text-5xl font-black text-ink">The End</p>
                <div className="mt-3 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button tone="sun" size="md" onClick={() => go(-1)}>
                    Read it again
                  </Button>
                  <LinkButton href={`/friend?id=${encodeURIComponent(story.character.id)}`} tone="grass" size="md">
                    Talk to {name}
                  </LinkButton>
                </div>
              </StoryPage>
            ) : (
              <StoryPage
                cutout={cutout}
                scene={sceneFor(`${story.pages[at].text} ${story.pages[at].answer}`)}
                motion={reading ? "bounce" : "idle"}
                label={`Page ${at + 1}`}
              >
                <p className="text-2xl leading-relaxed text-ink sm:text-[1.8rem]">{story.pages[at].text}</p>
              </StoryPage>
            )}
          </div>
        </div>

        <nav className="flex items-center justify-between gap-4" aria-label="Turn the pages">
          <button
            type="button"
            onClick={() => {
              stopReading();
              go(at - 1);
            }}
            disabled={at <= -1}
            aria-label="Previous page"
            className="crayon-edge press grid h-16 w-16 place-items-center rounded-full bg-white text-ink"
          >
            <CaretLeft size={34} weight="bold" aria-hidden="true" />
          </button>
          <p className="font-display text-xl font-bold text-ink-soft">{pageLabel}</p>
          <button
            type="button"
            onClick={() => {
              stopReading();
              go(at + 1);
            }}
            disabled={at >= last}
            aria-label="Next page"
            className="crayon-edge press grid h-16 w-16 place-items-center rounded-full bg-sun text-ink"
          >
            <CaretRight size={34} weight="bold" aria-hidden="true" />
          </button>
        </nav>
      </div>

      <style href="book-turn" precedence="default">
        {`@keyframes book-turn-next{from{transform:rotateY(-62deg);opacity:.2}to{transform:none;opacity:1}}
@keyframes book-turn-back{from{transform:rotateY(62deg);opacity:.2}to{transform:none;opacity:1}}
.book-turn-next{transform-origin:left center;animation:book-turn-next .55s cubic-bezier(.22,1,.36,1) both}
.book-turn-back{transform-origin:right center;animation:book-turn-back .55s cubic-bezier(.22,1,.36,1) both}`}
      </style>
    </main>
  );
}
