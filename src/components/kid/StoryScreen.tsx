"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getAI } from "@/lib/ai";
import { sfx } from "@/lib/sfx";
import { hush, sayAsCharacter } from "@/lib/sfx/voice";
import { getFriend, newId, saveStory, type Friend } from "@/lib/story/db";
import { settledKind } from "@/lib/story/kind";
import type { Character, Story } from "@/lib/story/types";
import { sceneFor } from "./Backdrop";
import { FriendSkeleton } from "./FriendScreen";
import { FriendStage } from "./FriendStage";
import { speechLevel, useAIReady, usePushToTalk, useSpeakingVoice } from "./hooks";
import { ArrowRight, ArrowsClockwise, BookOpen, PaperPlaneRight, SpeakerHigh } from "./icons";
import { MicButton } from "./MicButton";
import { ReadyCard } from "./ReadyCard";
import { SoundToggle } from "./SoundToggle";
import { StoryPage } from "./StoryPage";
import { Button, LinkButton, SpeechBubble, ThinkingDots, TopBar } from "./ui";

type Phase = "asking" | "answering" | "hearing" | "writing" | "page" | "finishing" | "oops";
type Retry = { step: "ask" } | { step: "write"; words: string } | { step: "finish" };

/** A storybook stays short enough to finish while the child is still excited. */
const MAX_PAGES = 6;
const SUGGEST_END_AFTER = 4;

const asCharacter = ({ id, name, description, drawing, cutout, kind, seenAs }: Friend): Character => ({
  id,
  name,
  description,
  drawing,
  cutout,
  kind: settledKind({ kind, description, seenAs }),
});

/** /story?id=<friend>: the character asks, the child answers, each answer becomes a page. */
export function StoryScreen() {
  const id = useSearchParams().get("id");
  const [friend, setFriend] = useState<Friend | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    (id ? getFriend(id) : Promise.resolve(undefined))
      .then((f) => alive && setFriend(f ?? null))
      .catch(() => alive && setFriend(null));
    return () => {
      alive = false;
    };
  }, [id]);

  if (friend === undefined) return <FriendSkeleton />;
  if (!friend || !friend.name) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <TopBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-16 text-center">
          <p className="font-display text-4xl font-black text-ink">Who is in this story?</p>
          <p className="max-w-sm text-xl text-ink-soft">Pick a friend first, then make a story together.</p>
          <LinkButton href="/friends" tone="sun" size="lg">
            My friends
          </LinkButton>
        </div>
      </main>
    );
  }
  return <MakeStory key={friend.id} friend={friend} />;
}

function MakeStory({ friend }: { friend: Friend }) {
  const router = useRouter();
  const ready = useAIReady();
  const voice = useSpeakingVoice();
  const name = friend.name;
  const [phase, setPhase] = useState<Phase>("asking");
  const [question, setQuestion] = useState("");
  const [typed, setTyped] = useState("");
  const [oops, setOops] = useState<string | null>(null);
  const [story, setStory] = useState<Story>(() => {
    const now = Date.now();
    return { id: newId(), title: "", character: asCharacter(friend), pages: [], createdAt: now, updatedAt: now };
  });
  const storyRef = useRef(story);
  const retry = useRef<Retry | null>(null);
  const started = useRef(false);

  const keep = useCallback(async (next: Story) => {
    storyRef.current = next;
    setStory(next);
    try {
      storyRef.current = await saveStory(next);
    } catch {
      // The page is still on screen; saving again happens with the next page.
    }
  }, []);

  const fail = useCallback((message: string, again: Retry) => {
    retry.current = again;
    setOops(message);
    setPhase("oops");
  }, []);

  const ask = useCallback(async () => {
    setPhase("asking");
    setOops(null);
    const ai = getAI();
    try {
      const current = storyRef.current;
      const q = (current.pages.length === 0 ? await ai.firstQuestion(current.character) : await ai.nextQuestion(current)).trim();
      setQuestion(q);
      setPhase("answering");
      sayAsCharacter(q, settledKind(friend)).catch(() => {});
    } catch {
      fail(`${name} forgot the question! Let's try again.`, { step: "ask" });
    }
  }, [fail, friend, name]);

  const write = useCallback(
    async (answer: string) => {
      const words = answer.trim();
      if (!words) return;
      const ai = getAI();
      hush();
      setPhase("writing");
      setOops(null);
      try {
        const current = storyRef.current;
        const text = (await ai.writePage(current, question, words)).trim();
        await keep({ ...current, pages: [...current.pages, { id: newId(), question, answer: words, text }] });
        setPhase("page");
        ai.speak(text, "narrator").catch(() => {});
      } catch {
        fail("Oops, the pencil slipped. Let's write that page again.", { step: "write", words });
      }
    },
    [fail, keep, question],
  );

  const finish = useCallback(async () => {
    const ai = getAI();
    hush();
    setPhase("finishing");
    try {
      const current = storyRef.current;
      const title = (await ai.titleFor(current)).trim() || `A story with ${name}`;
      await keep({ ...current, title });
      sfx("celebrate");
      router.push(`/book?id=${encodeURIComponent(current.id)}`);
    } catch {
      fail("The book cover got stuck. Let's try again.", { step: "finish" });
    }
  }, [fail, keep, name, router]);

  const tryAgain = () => {
    const again = retry.current;
    if (again?.step === "ask") ask();
    else if (again?.step === "write") write(again.words);
    else if (again?.step === "finish") finish();
  };

  // The character asks the first question as soon as it can talk.
  useEffect(() => {
    if (ready !== "ready" || started.current) return;
    const id = setTimeout(() => {
      started.current = true;
      ask();
    }, 300);
    return () => clearTimeout(id);
  }, [ready, ask]);

  useEffect(() => () => hush(), []);

  // A gentle "uh-oh" whenever something goes wrong.
  useEffect(() => {
    if (oops) sfx("oops");
  }, [oops]);

  const onAudio = useCallback(
    async (audio: Blob) => {
      setPhase("hearing");
      try {
        const words = (await getAI().transcribe(audio)).trim();
        if (!words) {
          setOops(`${name} couldn't hear you. Try again, a bit louder!`);
          setPhase("answering");
          return;
        }
        write(words);
      } catch {
        setOops("Oops, the microphone got sleepy. Try again!");
        setPhase("answering");
      }
    },
    [name, write],
  );
  const mic = usePushToTalk(onAudio);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim() || phase !== "answering") return;
    const words = typed;
    setTyped("");
    write(words);
  };

  const pages = story.pages;
  const last = pages[pages.length - 1];
  const pageNumber = phase === "page" ? pages.length : pages.length + 1;
  const busy = phase === "asking" || phase === "hearing" || phase === "writing" || phase === "finishing";
  const full = pages.length >= MAX_PAGES;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <TopBar title={`A story with ${name}`} back={`/friend?id=${encodeURIComponent(friend.id)}`} backLabel={name} right={<SoundToggle />} />

      <div className="flex flex-1 flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <ol className="flex items-center gap-2" aria-label={`Page ${pageNumber} of up to ${MAX_PAGES}`}>
          {Array.from({ length: MAX_PAGES }, (_, i) => (
            <li
              key={i}
              className={`h-3.5 rounded-full transition-all duration-300 ${
                i < pages.length ? "w-8 bg-grass" : i === pages.length && phase !== "page" ? "w-8 bg-sun" : "w-3.5 bg-paper-edge"
              }`}
            />
          ))}
        </ol>

        {ready === "needs-setup" || ready === "error" ? (
          <div className="mx-auto w-full max-w-md py-8">
            <ReadyCard name={name} failed={ready === "error"} />
          </div>
        ) : phase === "page" && last ? (
          <div className="anim-float-in grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
            <StoryPage
              cutout={friend.cutout ?? friend.drawing}
              kind={story.character.kind}
              scene={sceneFor(`${last.text} ${last.answer}`)}
              motion="bounce"
              label={`Page ${pages.length}`}
            >
              <p className="text-2xl leading-relaxed text-ink sm:text-[1.7rem]">{last.text}</p>
            </StoryPage>
            <div className="flex flex-col gap-3">
              <Button
                tone="paper"
                size="md"
                onClick={() => getAI().speak(last.text, "narrator").catch(() => {})}
                icon={<SpeakerHigh size={26} weight="fill" aria-hidden="true" />}
              >
                Read it again
              </Button>
              {!full && (
                <Button
                  tone={pages.length >= SUGGEST_END_AFTER ? "paper" : "grass"}
                  size="lg"
                  onClick={() => ask()}
                  icon={<ArrowRight size={30} weight="bold" aria-hidden="true" />}
                >
                  Next page
                </Button>
              )}
              {pages.length >= 2 && (
                <Button
                  tone={pages.length >= SUGGEST_END_AFTER ? "grass" : "sun"}
                  size="lg"
                  onClick={finish}
                  icon={<BookOpen size={30} weight="fill" aria-hidden="true" />}
                >
                  The End
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid flex-1 gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
            <FriendStage
              cutout={friend.cutout ?? friend.drawing}
              name={name}
              kind={story.character.kind}
              thinking={busy}
              talking={voice === "character" && !busy}
              level={speechLevel}
              motion={phase === "finishing" ? "dance" : "idle"}
              className="h-[46vh] min-h-72 lg:h-[66vh]"
              bubble={
                busy ? (
                  <SpeechBubble tone="think" className="anim-pop-in">
                    <span className="flex items-center gap-3">
                      <ThinkingDots size="lg" label={`${name} is thinking`} />
                      <span className="font-display text-lg font-bold">
                        {phase === "writing" ? `Writing page ${pageNumber}…` : phase === "finishing" ? "Making your book…" : ""}
                      </span>
                    </span>
                  </SpeechBubble>
                ) : question ? (
                  <SpeechBubble className="anim-pop-in max-w-xl" key={question}>
                    <p className="font-display text-lg font-bold leading-snug sm:text-2xl">{question}</p>
                  </SpeechBubble>
                ) : undefined
              }
            />

            <section className="flex flex-col gap-4" aria-label="Your answer">
              {phase === "oops" ? (
                <div role="alert" className="flex flex-col items-center gap-3 rounded-cut bg-sun/35 px-4 py-5 text-center">
                  <p className="text-xl font-bold text-ink">{oops}</p>
                  <Button tone="sun" size="md" onClick={tryAgain} icon={<ArrowsClockwise size={26} weight="bold" aria-hidden="true" />}>
                    Try again
                  </Button>
                </div>
              ) : (
                <>
                  <MicButton
                    label={`Answer ${name}`}
                    state={mic.state}
                    level={mic.level}
                    busy={busy || ready !== "ready"}
                    busyLabel={ready !== "ready" ? `Waking ${name} up…` : phase === "hearing" ? "Listening hard…" : `${name} is thinking…`}
                    onStart={() => {
                      hush();
                      setOops(null);
                      mic.start();
                    }}
                    onStop={mic.stop}
                  />
                  {oops && (
                    <p role="alert" className="rounded-2xl bg-sun/40 px-4 py-3 text-center text-lg font-bold text-ink">
                      {oops}
                    </p>
                  )}
                  <form onSubmit={send} className="flex gap-2">
                    <label htmlFor="story-typed" className="sr-only">
                      Type your answer
                    </label>
                    <input
                      id="story-typed"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="Or type your answer…"
                      autoComplete="off"
                      className="crayon-edge min-h-14 min-w-0 flex-1 rounded-[18px] bg-white px-4 text-lg text-ink"
                    />
                    <Button
                      type="submit"
                      tone="sky"
                      size="sm"
                      disabled={!typed.trim() || phase !== "answering"}
                      aria-label="Send answer"
                      icon={<PaperPlaneRight size={26} weight="fill" aria-hidden="true" />}
                    />
                  </form>
                  {question && phase === "answering" && (
                    <Button
                      tone="paper"
                      size="sm"
                      sound={false}
                      onClick={() => sayAsCharacter(question, settledKind(friend)).catch(() => {})}
                      icon={<SpeakerHigh size={24} weight="fill" aria-hidden="true" />}
                      className="self-center"
                    >
                      Ask me again
                    </Button>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
