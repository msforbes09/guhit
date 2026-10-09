"use client";

import { useCallback, useState, type FormEvent } from "react";
import { getAI } from "@/lib/ai";
import { saveFriend, type Friend } from "@/lib/story/db";
import { parseIntro } from "@/lib/story/intro";
import { FriendStage } from "./FriendStage";
import { useAIReady, usePushToTalk } from "./hooks";
import { ArrowsClockwise, Check, Keyboard } from "./icons";
import { MicButton } from "./MicButton";
import { ReadyCard } from "./ReadyCard";
import { Button, SpeechBubble, TopBar } from "./ui";

type Step = "ask" | "hearing" | "confirm";

/** First meeting: the child says who the character is, then checks the words. */
export function MeetFriend({ friend, onMet }: { friend: Friend; onMet: (friend: Friend) => void }) {
  const ready = useAIReady();
  const [step, setStep] = useState<Step>("ask");
  const [typed, setTyped] = useState("");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [oops, setOops] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const takeWords = useCallback((words: string) => {
    const intro = parseIntro(words);
    setName(intro.name);
    setAbout(intro.description);
    setOops(null);
    setStep("confirm");
  }, []);

  const onAudio = useCallback(
    async (audio: Blob) => {
      setStep("hearing");
      try {
        const words = (await getAI().transcribe(audio)).trim();
        if (!words) {
          setOops("I couldn't hear that. Try again, a little louder!");
          setStep("ask");
          return;
        }
        takeWords(words);
      } catch {
        setOops("Oops, my ears got tangled. Can you say it again?");
        setStep("ask");
      }
    },
    [takeWords],
  );

  const mic = usePushToTalk(onAudio);

  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim()) takeWords(typed);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const saved = await saveFriend({ ...friend, name: name.trim(), description: about.trim() });
      onMet(saved);
    } catch {
      setOops("I couldn't remember that. Try once more?");
      setSaving(false);
    }
  };

  const shownName = name.trim() || "me";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <TopBar title="Meet your new friend" />
      <div className="grid flex-1 gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <FriendStage
          cutout={friend.cutout ?? friend.drawing}
          name={name}
          motion={step === "confirm" ? "bounce" : "wave"}
          thinking={step === "hearing"}
          className="h-[44vh] min-h-72 lg:h-[72vh]"
          bubble={
            <SpeechBubble className="max-w-md">
              <p className="font-display text-xl font-bold sm:text-2xl">
                {step === "confirm" && name.trim() ? `I'm ${name.trim()}! Is that right?` : "Hi! Who am I?"}
              </p>
            </SpeechBubble>
          }
        />

        <section className="flex flex-col gap-5" aria-labelledby="meet-title">
          {step !== "confirm" ? (
            <>
              <div>
                <h2 id="meet-title" className="text-3xl font-black text-ink sm:text-4xl">
                  Tell me who this is!
                </h2>
                <p className="mt-2 text-lg text-ink-soft">
                  Like: &ldquo;This is Tala, a purple dragon who is scared of rain.&rdquo;
                </p>
              </div>

              {ready === "needs-setup" || ready === "error" ? (
                <ReadyCard name="your friend" failed={ready === "error"} />
              ) : (
                <MicButton
                  label="Tell me"
                  state={mic.state}
                  level={mic.level}
                  busy={step === "hearing" || ready !== "ready"}
                  busyLabel={step === "hearing" ? "Listening hard…" : "Waking up…"}
                  onStart={mic.start}
                  onStop={mic.stop}
                />
              )}

              {oops && (
                <p role="alert" className="rounded-2xl bg-sun/40 px-4 py-3 text-center text-lg font-bold text-ink">
                  {oops}
                </p>
              )}

              <form onSubmit={submitTyped} className="flex flex-col gap-2">
                <label htmlFor="intro-typed" className="flex items-center gap-2 font-display text-lg font-bold text-ink-soft">
                  <Keyboard size={24} weight="bold" aria-hidden="true" />
                  Or type it here
                </label>
                <div className="flex gap-2">
                  <input
                    id="intro-typed"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="This is Tala, a purple dragon…"
                    autoComplete="off"
                    className="crayon-edge min-h-14 min-w-0 flex-1 rounded-[18px] bg-white px-4 text-lg text-ink"
                  />
                  <Button type="submit" tone="sky" size="sm" disabled={!typed.trim()}>
                    OK
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <form onSubmit={save} className="anim-float-in flex flex-col gap-4">
              <h2 id="meet-title" className="text-3xl font-black text-ink sm:text-4xl">
                Did I get it right?
              </h2>
              <label className="flex flex-col gap-1.5">
                <span className="font-display text-lg font-bold text-ink-soft">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tala"
                  required
                  autoFocus={!name}
                  autoComplete="off"
                  maxLength={40}
                  className="crayon-edge min-h-16 rounded-[18px] bg-white px-4 font-display text-3xl font-extrabold text-ink"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-display text-lg font-bold text-ink-soft">All about {shownName === "me" ? "them" : shownName}</span>
                <textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="A purple dragon who is scared of rain."
                  rows={3}
                  maxLength={300}
                  className="crayon-edge rounded-[18px] bg-white px-4 py-3 text-xl text-ink"
                />
              </label>
              {oops && (
                <p role="alert" className="rounded-2xl bg-sun/40 px-4 py-3 text-center text-lg font-bold text-ink">
                  {oops}
                </p>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <Button
                  tone="paper"
                  size="md"
                  onClick={() => {
                    setStep("ask");
                    setOops(null);
                  }}
                  icon={<ArrowsClockwise size={26} weight="bold" aria-hidden="true" />}
                  className="sm:flex-1"
                >
                  Say it again
                </Button>
                <Button
                  type="submit"
                  tone="grass"
                  size="md"
                  disabled={!name.trim() || saving}
                  icon={<Check size={28} weight="bold" aria-hidden="true" />}
                  className="sm:flex-[1.4]"
                >
                  {saving ? "Saving…" : "Yes! Let's talk"}
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
