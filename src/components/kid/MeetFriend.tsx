"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { getAI } from "@/lib/ai";
import { deleteFriend, saveFriend, type Friend } from "@/lib/story/db";
import { nameFrom, parseIntro, readYesNo, tidy } from "@/lib/story/intro";
import { NotThisOne } from "./BringToLife";
import { FriendStage } from "./FriendStage";
import { useAIReady, usePushToTalk } from "./hooks";
import { ArrowsClockwise, Check, Keyboard, PaperPlaneRight, X } from "./icons";
import { MicButton } from "./MicButton";
import { ReadyCard } from "./ReadyCard";
import { Button, SpeechBubble, ThinkingDots, TopBar } from "./ui";

/**
 * looking  → the character studies the drawing (describeDrawing)
 * guess    → "Is that a purple dragon?" yes / no
 * describe → "What am I, then?"
 * name     → "What's my name?"
 * ask      → no guess: "Tell me who this is!" in one go
 * confirm  → check name and description, then save
 * flagged  → the engine judged the drawing not right for a friend
 */
type Step = "looking" | "guess" | "describe" | "name" | "ask" | "confirm" | "flagged";

/** Recognition must never hold the child up. */
const LOOK_TIMEOUT_MS = 8000;
/** Long enough that the "let me look" moment registers even when recognition is instant. */
const LOOK_MIN_MS = 1200;

const LINES: Record<Exclude<Step, "looking" | "guess" | "confirm" | "flagged">, string> = {
  describe: "Oops! So what am I?",
  name: "What's my name?",
  ask: "Hi! Who am I?",
};

/** First meeting: the drawing guesses what it is, the child corrects it and names it. */
export function MeetFriend({ friend, onMet }: { friend: Friend; onMet: (friend: Friend) => void }) {
  const ready = useAIReady();
  const [step, setStep] = useState<Step>("looking");
  const stepRef = useRef<Step>("looking");
  const [guess, setGuess] = useState("");
  const [hearing, setHearing] = useState(false);
  const [typed, setTyped] = useState("");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [oops, setOops] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mountedAt = useRef(0);

  const go = useCallback((next: Step) => {
    stepRef.current = next;
    setStep(next);
    setTyped("");
    setOops(null);
  }, []);

  // Look at the drawing once the engine can, but give up after a few seconds.
  useEffect(() => {
    mountedAt.current = performance.now();
    const giveUp = setTimeout(() => {
      if (stepRef.current === "looking") go("ask");
    }, LOOK_TIMEOUT_MS);
    return () => clearTimeout(giveUp);
  }, [go]);

  useEffect(() => {
    // Already looked at while it was being cut out: no second call, same moment on screen.
    const known = friend.seenAs;
    if (known === undefined && (ready === "checking" || ready === "waking")) return;
    let alive = true;
    const settle = (label: string) => {
      const wait = Math.max(0, LOOK_MIN_MS - (performance.now() - mountedAt.current));
      setTimeout(() => {
        if (!alive || stepRef.current !== "looking") return;
        if (label) {
          setGuess(label);
          setAbout(tidy(label));
          go("guess");
        } else go("ask");
      }, wait);
    };
    if (known !== undefined) settle(known);
    else if (ready !== "ready") settle("");
    else {
      getAI()
        // The original photo cropped to the cut-out carries more detail than the cut-out.
        .describeDrawing(
          friend.cutout ?? friend.drawing,
          friend.cutout && friend.photoCrop ? { image: friend.drawing, crop: friend.photoCrop } : undefined,
        )
        .then((r) => {
          if (r.flagged && alive) {
            // Saved before the engine could look: it must not stay on the device.
            deleteFriend(friend.id).catch(() => {});
            go("flagged");
          } else settle(r.label?.trim() ?? "");
        })
        .catch(() => settle(""));
    }
    return () => {
      alive = false;
    };
  }, [ready, friend, go]);

  const line =
    step === "flagged"
      ? ""
      : step === "guess" ? `Am I ${guess}?` : step === "confirm" ? (name.trim() ? `I'm ${name.trim()}! Is that right?` : "Hi! Who am I?") : step === "looking" ? "" : LINES[step];

  // The character says its question out loud when it can.
  useEffect(() => {
    if (!line || step === "confirm" || ready !== "ready") return;
    getAI()
      .speak(line, "character")
      .catch(() => {});
  }, [line, step, ready]);

  useEffect(() => () => getAI().stopSpeaking(), []);

  /** What the child said or typed, read according to the current question. */
  const takeWords = useCallback(
    (spoken: string) => {
      const words = spoken.trim();
      if (!words) return;
      const now = stepRef.current;
      if (now === "guess") {
        const reply = readYesNo(words);
        if (reply.answer === "yes") go("name");
        else if (reply.rest) {
          setAbout(tidy(reply.rest));
          go("name");
        } else go("describe");
      } else if (now === "describe") {
        const intro = parseIntro(words);
        setAbout(intro.description || tidy(words));
        if (intro.name) {
          setName(intro.name);
          go("confirm");
        } else go("name");
      } else if (now === "name") {
        setName(nameFrom(words));
        go("confirm");
      } else {
        const intro = parseIntro(words);
        setName(intro.name);
        setAbout(intro.description);
        go("confirm");
      }
    },
    [go],
  );

  const onAudio = useCallback(
    async (audio: Blob) => {
      setHearing(true);
      try {
        const words = (await getAI().transcribe(audio)).trim();
        if (words) takeWords(words);
        else setOops("I couldn't hear that. Try again, a little louder!");
      } catch {
        setOops("Oops, my ears got tangled. Can you say it again?");
      } finally {
        setHearing(false);
      }
    },
    [takeWords],
  );

  const mic = usePushToTalk(onAudio);

  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    takeWords(typed);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      onMet(await saveFriend({ ...friend, name: name.trim(), description: about.trim() }));
    } catch {
      setOops("I couldn't remember that. Try once more?");
      setSaving(false);
    }
  };

  const canHear = ready !== "needs-setup" && ready !== "error";
  const micBlock = (label: string) =>
    canHear ? (
      <MicButton
        label={label}
        state={mic.state}
        level={mic.level}
        busy={hearing || ready !== "ready"}
        busyLabel={hearing ? "Listening hard…" : "Waking up…"}
        onStart={() => {
          getAI().stopSpeaking();
          setOops(null);
          mic.start();
        }}
        onStop={mic.stop}
      />
    ) : (
      <ReadyCard name="your friend" failed={ready === "error"} />
    );

  const typeBlock = (label: string, placeholder: string) => (
    <form onSubmit={submitTyped} className="flex flex-col gap-2">
      <label htmlFor="meet-typed" className="flex items-center gap-2 font-display text-lg font-bold text-ink-soft">
        <Keyboard size={24} weight="bold" aria-hidden="true" />
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id="meet-typed"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="crayon-edge min-h-14 min-w-0 flex-1 rounded-[18px] bg-white px-4 text-lg text-ink"
        />
        <Button type="submit" tone="sky" size="sm" disabled={!typed.trim()} aria-label="OK" icon={<PaperPlaneRight size={26} weight="fill" aria-hidden="true" />} />
      </div>
    </form>
  );

  const oopsNote = oops && (
    <p role="alert" className="rounded-2xl bg-sun/40 px-4 py-3 text-center text-lg font-bold text-ink">
      {oops}
    </p>
  );

  let panel: ReactNode;
  if (step === "looking") {
    panel = (
      <div className="flex flex-col gap-4" role="status">
        <h2 id="meet-title" className="text-3xl font-black text-ink sm:text-4xl">
          Hmm, let me look…
        </h2>
        <p className="text-xl text-ink-soft">Your friend is looking at your drawing.</p>
        <Button tone="paper" size="sm" onClick={() => go("ask")} className="self-start">
          I&rsquo;ll tell you myself
        </Button>
      </div>
    );
  } else if (step === "guess") {
    panel = (
      <div className="anim-float-in flex flex-col gap-4">
        <h2 id="meet-title" className="text-3xl font-black text-ink sm:text-4xl">
          Is that {guess}?
        </h2>
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-lg font-bold text-ink-soft">You can change the words</span>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={2}
            maxLength={300}
            className="crayon-edge rounded-[18px] bg-white px-4 py-3 text-xl text-ink"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button tone="paper" size="md" onClick={() => go("describe")} icon={<X size={26} weight="bold" aria-hidden="true" />}>
            No, it&rsquo;s…
          </Button>
          <Button tone="grass" size="md" onClick={() => go("name")} disabled={!about.trim()} icon={<Check size={28} weight="bold" aria-hidden="true" />}>
            Yes!
          </Button>
        </div>
        {micBlock("Say yes or no")}
        {oopsNote}
      </div>
    );
  } else if (step === "describe" || step === "name" || step === "ask") {
    const copy = {
      describe: { title: "What is it, then?", hint: "Like: “a cat who loves fish”", mic: "Tell me", type: "Or type what it is", placeholder: "A cat who loves fish…" },
      name: { title: "What's my name?", hint: about ? `${about}` : "Give your friend a name!", mic: "Say my name", type: "Or type a name", placeholder: "Tala" },
      ask: { title: "Tell me who this is!", hint: "Like: “This is Tala, a purple dragon who is scared of rain.”", mic: "Tell me", type: "Or type it here", placeholder: "This is Tala, a purple dragon…" },
    }[step];
    panel = (
      <div className="anim-float-in flex flex-col gap-5">
        <div>
          <h2 id="meet-title" className="text-3xl font-black text-ink sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-2 text-lg text-ink-soft">{copy.hint}</p>
        </div>
        {micBlock(copy.mic)}
        {oopsNote}
        {typeBlock(copy.type, copy.placeholder)}
      </div>
    );
  } else {
    panel = (
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
          <span className="font-display text-lg font-bold text-ink-soft">All about {name.trim() || "them"}</span>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="A purple dragon who is scared of rain."
            rows={3}
            maxLength={300}
            className="crayon-edge rounded-[18px] bg-white px-4 py-3 text-xl text-ink"
          />
        </label>
        {oopsNote}
        <div className="flex flex-col-reverse gap-3">
          <Button tone="paper" size="md" onClick={() => go(guess ? "name" : "ask")} icon={<ArrowsClockwise size={26} weight="bold" aria-hidden="true" />}>
            Say it again
          </Button>
          <Button type="submit" tone="grass" size="md" disabled={!name.trim() || saving} icon={<Check size={28} weight="bold" aria-hidden="true" />}>
            {saving ? "Saving…" : "Yes! Let's talk"}
          </Button>
        </div>
      </form>
    );
  }

  if (step === "flagged") {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
        <TopBar title="Let's try another" />
        <div className="flex flex-1 flex-col px-4 pb-6 sm:px-6">
          <NotThisOne
            png={friend.cutout ?? friend.drawing}
            actions={[
              { label: "Draw a new one", icon: "draw", href: "/draw" },
              { label: "Take another photo", icon: "photo", href: "/snap" },
            ]}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <TopBar title="Meet your new friend" />
      <div className="grid flex-1 gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <FriendStage
          cutout={friend.cutout ?? friend.drawing}
          name={name}
          motion={step === "confirm" ? "bounce" : step === "looking" ? "idle" : "wave"}
          thinking={step === "looking" || hearing}
          className="h-[44vh] min-h-72 lg:h-[72vh]"
          bubble={
            step === "looking" || hearing ? (
              <SpeechBubble tone="think" className="anim-pop-in">
                <span className="flex items-center gap-3">
                  <ThinkingDots size="lg" label="Looking" />
                  {step === "looking" && <span className="font-display text-lg font-bold">Hmm, let me look…</span>}
                </span>
              </SpeechBubble>
            ) : (
              <SpeechBubble className="anim-pop-in max-w-md" key={line}>
                <p className="font-display text-xl font-bold sm:text-2xl">{line}</p>
              </SpeechBubble>
            )
          }
        />
        <section className="flex flex-col gap-5" aria-labelledby="meet-title">
          {panel}
        </section>
      </div>
    </main>
  );
}
