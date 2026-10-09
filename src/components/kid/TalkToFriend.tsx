"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { getAI } from "@/lib/ai";
import type { ChatTurn } from "@/lib/ai";
import { saveFriend, type Friend } from "@/lib/story/db";
import { JointPicker, loadCutout, type AliveCharacterHandle, type Cutout, type Joints, type Motion } from "./alive";
import { FriendBooks } from "./FriendBooks";
import { FriendStage } from "./FriendStage";
import { useAIReady, usePushToTalk } from "./hooks";
import {
  ArrowFatLineUp,
  ArrowsClockwise,
  BookOpen,
  ChatCircleDots,
  Footprints,
  HandWaving,
  MoonStars,
  MusicNotes,
  PaperPlaneRight,
  Sparkle,
  SpeakerHigh,
} from "./icons";
import { MicButton } from "./MicButton";
import { ReadyCard } from "./ReadyCard";
import { Button, Sheet, SpeechBubble, ThinkingDots, TopBar, type Tone } from "./ui";

type Phase = "idle" | "hearing" | "thinking" | "speaking" | "oops";

const MOVE_TONES: Partial<Record<Tone, string>> = {
  sun: "bg-sun text-ink",
  pink: "bg-pink text-ink",
  grass: "bg-grass text-ink",
  sky: "bg-sky text-ink",
  grape: "bg-grape text-white",
};

const MOVES: { motion: Motion; label: string; tone: Tone; icon: ReactNode; lasts: number }[] = [
  { motion: "jump", label: "Jump", tone: "sun", icon: <ArrowFatLineUp size={30} weight="fill" aria-hidden="true" />, lasts: 3300 },
  { motion: "dance", label: "Dance", tone: "pink", icon: <MusicNotes size={30} weight="fill" aria-hidden="true" />, lasts: 4000 },
  { motion: "walk", label: "Walk", tone: "grass", icon: <Footprints size={30} weight="fill" aria-hidden="true" />, lasts: 8400 },
  { motion: "sleep", label: "Sleep", tone: "sky", icon: <MoonStars size={30} weight="fill" aria-hidden="true" />, lasts: 0 },
  { motion: "wave", label: "Wave", tone: "grape", icon: <HandWaving size={30} weight="fill" aria-hidden="true" />, lasts: 2800 },
];

/** How much of the conversation the character remembers when replying. */
const MEMORY_TURNS = 16;

/** The demo's heart: hold the mic, talk, and the drawing answers out loud. */
export function TalkToFriend({ friend: initial }: { friend: Friend }) {
  const ready = useAIReady();
  const [friend, setFriend] = useState(initial);
  const friendRef = useRef(initial);
  const [phase, setPhase] = useState<Phase>("idle");
  const [said, setSaid] = useState<string | null>(null);
  const [oops, setOops] = useState<{ message: string; retry?: string } | null>(null);
  const [motion, setMotion] = useState<Motion>("idle");
  const [typed, setTyped] = useState("");
  const [showChat, setShowChat] = useState(false);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greeted = useRef(false);
  const character = useRef<AliveCharacterHandle>(null);
  // "Make it move more": the picker needs the cut-out with its mask.
  const [picking, setPicking] = useState<Cutout | null>(null);
  const name = friend.name;

  const openPicker = async () => {
    if (!friend.cutout) return;
    try {
      setPicking(await loadCutout(friend.cutout));
    } catch {
      // Without a mask there is nothing to pick on; the motions still work.
    }
  };

  const keepJoints = async (joints: Joints) => {
    setPicking(null);
    const next = { ...friendRef.current, joints };
    friendRef.current = next;
    setFriend(next);
    // Show off the new arms and legs straight away.
    setMotion("dance");
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => setMotion("idle"), 4000);
    try {
      friendRef.current = await saveFriend(next);
    } catch {
      // It still moves this time even if it could not be kept.
    }
  };

  const busy = phase === "hearing" || phase === "thinking";
  const lastLine = [...friend.chat].reverse().find((t) => t.who === "character")?.text;

  const remember = useCallback(async (chat: ChatTurn[]) => {
    const next = { ...friendRef.current, chat };
    friendRef.current = next;
    setFriend(next);
    try {
      friendRef.current = await saveFriend(next);
    } catch {
      // Talking matters more than keeping the transcript; carry on.
    }
  }, []);

  const speak = useCallback(async (text: string) => {
    setPhase("speaking");
    setMotion((m) => (m === "sleep" ? "idle" : m));
    try {
      await getAI().speak(text, "character");
    } catch {
      // The words are on screen in the bubble even if the voice fails.
    }
    setPhase((p) => (p === "speaking" ? "idle" : p));
  }, []);

  const answer = useCallback(
    async (childSays: string, history: ChatTurn[]) => {
      setPhase("thinking");
      setOops(null);
      try {
        const reply = (await getAI().reply(friendRef.current, history.slice(-MEMORY_TURNS), childSays)).trim();
        await remember([...friendRef.current.chat, { who: "character", text: reply }]);
        await speak(reply);
      } catch {
        setOops({ message: `${friendRef.current.name} got a little mixed up.`, retry: childSays });
        setPhase("oops");
      }
    },
    [remember, speak],
  );

  const childSays = useCallback(
    async (words: string) => {
      const text = words.trim();
      if (!text) return;
      setSaid(text);
      // A happy wiggle the moment the child is heard, before the reply is ready.
      character.current?.poke();
      const history = friendRef.current.chat;
      await remember([...history, { who: "child", text }]);
      await answer(text, history);
    },
    [answer, remember],
  );

  // First visit after naming: the character says hello on its own.
  useEffect(() => {
    if (ready !== "ready" || greeted.current || friendRef.current.chat.length > 0) return;
    // Marked inside the timer so a cancelled first run (React dev mounts
    // effects twice) still lets the second one say hello.
    const id = setTimeout(() => {
      greeted.current = true;
      // An empty first line asks the engine for the character's own hello.
      answer("", []);
    }, 400);
    return () => clearTimeout(id);
  }, [ready, answer]);

  useEffect(
    () => () => {
      getAI().stopSpeaking();
      if (moveTimer.current) clearTimeout(moveTimer.current);
    },
    [],
  );

  const onAudio = useCallback(
    async (audio: Blob) => {
      setPhase("hearing");
      try {
        const words = (await getAI().transcribe(audio)).trim();
        if (!words) {
          setOops({ message: `${friendRef.current.name} couldn't hear you. Try again, a bit louder!` });
          setPhase("oops");
          return;
        }
        await childSays(words);
      } catch {
        setOops({ message: "Oops, the microphone got sleepy. Try again!" });
        setPhase("oops");
      }
    },
    [childSays],
  );

  const mic = usePushToTalk(onAudio);

  const startTalking = () => {
    // Talking over the character is allowed: it stops and listens.
    if (phase === "speaking") getAI().stopSpeaking();
    setOops(null);
    setPhase("idle");
    mic.start();
  };

  const move = (next: (typeof MOVES)[number]) => {
    if (moveTimer.current) clearTimeout(moveTimer.current);
    const toggleOff = next.motion === "sleep" && motion === "sleep";
    setMotion(toggleOff ? "idle" : next.motion);
    if (next.lasts && !toggleOff) moveTimer.current = setTimeout(() => setMotion("idle"), next.lasts);
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim() || busy) return;
    const words = typed;
    setTyped("");
    if (phase === "speaking") getAI().stopSpeaking();
    childSays(words);
  };

  const canTalk = ready === "ready";
  const listening = mic.state === "recording";

  let bubble: ReactNode;
  if (phase === "thinking" || phase === "hearing") {
    bubble = (
      <SpeechBubble tone="think" className="anim-pop-in">
        <ThinkingDots size="lg" label={`${name} is thinking`} />
      </SpeechBubble>
    );
  } else if (listening) {
    bubble = (
      <SpeechBubble className="anim-pop-in" live={false}>
        <p className="font-display text-xl font-bold sm:text-2xl">I&rsquo;m listening…</p>
      </SpeechBubble>
    );
  } else if (lastLine) {
    bubble = (
      <SpeechBubble className="anim-pop-in max-w-xl" key={lastLine}>
        <p className="font-display text-lg font-bold leading-snug sm:text-2xl lg:text-[1.7rem]">{lastLine}</p>
      </SpeechBubble>
    );
  } else if (!canTalk) {
    bubble = (
      <SpeechBubble className="anim-pop-in">
        <p className="font-display text-xl font-bold sm:text-2xl">Hi! I&rsquo;m {name}!</p>
      </SpeechBubble>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
      <TopBar
        title={name}
        right={
          <Link
            href={`/story?id=${encodeURIComponent(friend.id)}`}
            className="crayon-edge press inline-flex min-h-14 items-center gap-2 rounded-cut bg-sun px-4 font-display text-lg font-bold text-ink"
          >
            <BookOpen size={26} weight="fill" aria-hidden="true" />
            <span className="max-sm:sr-only">Make a story</span>
          </Link>
        }
      />

      <div className="grid flex-1 gap-5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 lg:grid-cols-[1fr_380px] lg:items-stretch">
        {picking ? (
          <Sheet className="kid-tools flex flex-col gap-3 p-4 sm:p-6 lg:min-h-[72vh]">
            <h2 className="text-center text-3xl font-black text-ink">Show me my head, hands and feet!</h2>
            <JointPicker cutout={picking} onDone={keepJoints} onCancel={() => setPicking(null)} />
          </Sheet>
        ) : (
          <FriendStage
            cutout={friend.cutout ?? friend.drawing}
            name={name}
            joints={friend.joints}
            motion={phase === "thinking" || phase === "hearing" ? "idle" : motion}
            talking={phase === "speaking"}
            thinking={phase === "thinking" || phase === "hearing"}
            characterRef={character}
            bubble={bubble}
            className="h-[50vh] min-h-80 lg:h-auto lg:min-h-[72vh]"
          />
        )}

        <section className="flex flex-col gap-5" aria-label={`Talk to ${name}`}>
          {ready === "needs-setup" || ready === "error" ? (
            <ReadyCard name={name} failed={ready === "error"} />
          ) : (
            <div className="flex flex-col items-center gap-3 pt-1">
              <MicButton
                label={`Talk to ${name}`}
                state={mic.state}
                level={mic.level}
                busy={busy || !canTalk}
                busyLabel={!canTalk ? `Waking ${name} up…` : phase === "hearing" ? "Listening hard…" : `${name} is thinking…`}
                onStart={startTalking}
                onStop={mic.stop}
              />
              {(said || lastLine) && !listening && !busy && (
                <div className="flex w-full flex-wrap items-center justify-center gap-2">
                  {said && (
                    <p className="min-w-0 flex-1 rounded-2xl bg-white/80 px-4 py-2 text-lg text-ink-soft">
                      <span className="font-bold text-ink">You said:</span> {said}
                    </p>
                  )}
                  {lastLine && canTalk && phase !== "speaking" && (
                    <button
                      type="button"
                      onClick={() => speak(lastLine)}
                      className="crayon-edge press inline-flex min-h-14 shrink-0 items-center gap-2 rounded-full bg-white px-4 font-display text-lg font-bold text-ink"
                    >
                      <SpeakerHigh size={24} weight="fill" aria-hidden="true" />
                      Hear it again
                    </button>
                  )}
                </div>
              )}
              {oops && (
                <div role="alert" className="flex w-full flex-col items-center gap-3 rounded-cut bg-sun/35 px-4 py-3 text-center">
                  <p className="text-lg font-bold text-ink">{oops.message}</p>
                  {oops.retry !== undefined && (
                    <Button
                      tone="sun"
                      size="sm"
                      onClick={() => {
                        const retry = oops.retry ?? "";
                        // A failed greeting left no child line to drop from the history.
                        answer(retry, retry ? friendRef.current.chat.slice(0, -1) : friendRef.current.chat);
                      }}
                      icon={<ArrowsClockwise size={24} weight="bold" aria-hidden="true" />}
                    >
                      Try again
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {canTalk && (
            <form onSubmit={send} className="flex gap-2" aria-label={`Type to ${name}`}>
              <label htmlFor="talk-typed" className="sr-only">
                Type to {name}
              </label>
              <input
                id="talk-typed"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={`Or type to ${name}…`}
                autoComplete="off"
                className="crayon-edge min-h-14 min-w-0 flex-1 rounded-[18px] bg-white px-4 text-lg text-ink"
              />
              <Button
                type="submit"
                tone="sky"
                size="sm"
                disabled={!typed.trim() || busy}
                aria-label="Send"
                icon={<PaperPlaneRight size={26} weight="fill" aria-hidden="true" />}
              />
            </form>
          )}

          <div>
            <h2 className="mb-2 font-display text-xl font-extrabold text-ink">Make {name} move</h2>
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {MOVES.map((m) => (
                <button
                  key={m.motion}
                  type="button"
                  onClick={() => move(m)}
                  aria-pressed={motion === m.motion}
                  className={`crayon-edge press flex min-h-[4.75rem] flex-col items-center justify-center gap-1 rounded-[20px_24px_22px_26px] px-1 font-display text-base font-bold sm:text-lg ${
                    motion === m.motion ? "ring-4 ring-ink/70 ring-offset-2 ring-offset-paper" : ""
                  } ${MOVE_TONES[m.tone]}`}
                >
                  {m.icon}
                  {m.motion === "sleep" && motion === "sleep" ? "Wake" : m.label}
                </button>
              ))}
            </div>
            {friend.cutout && !picking && (
              <button
                type="button"
                onClick={openPicker}
                className="mt-3 inline-flex min-h-12 items-center gap-2 font-display text-lg font-bold text-ink-soft underline decoration-2 underline-offset-4 hover:text-ink"
              >
                <Sparkle size={22} weight="fill" aria-hidden="true" />
                {friend.joints ? "Change how I move" : "Make it move more"}
              </button>
            )}
          </div>

          <FriendBooks friendId={friend.id} />

          {friend.chat.length > 0 && (
            <div className="lg:mt-auto">
              <button
                type="button"
                onClick={() => setShowChat((v) => !v)}
                aria-expanded={showChat}
                className="inline-flex min-h-12 items-center gap-2 font-display text-lg font-bold text-ink-soft underline decoration-2 underline-offset-4 hover:text-ink"
              >
                <ChatCircleDots size={24} weight="bold" aria-hidden="true" />
                {showChat ? "Hide our chat" : "See our chat"}
              </button>
              {showChat && (
                <ol className="scrollbar-paper mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto rounded-cut bg-paper-deep/60 p-3">
                  {friend.chat.map((turn, i) => (
                    <li
                      key={i}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-base ${
                        turn.who === "child" ? "self-end bg-sky/30 text-ink" : "self-start bg-white text-ink"
                      }`}
                    >
                      <span className="sr-only">{turn.who === "child" ? "You" : name}: </span>
                      {turn.text}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
