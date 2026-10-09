"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getAI, isMarkedReady, RealAI } from "@/lib/ai";
import { Speaker, type SentenceMetric } from "@/lib/ai/tts";
import { chooseModels, detectSupport, type DeviceSupport, type ModelChoice } from "@/lib/ai/device";
import { explainLoadError } from "@/lib/ai/friendly-errors";
import { R2_BASE, type ModelSource } from "@/lib/ai/model-fetch";
import { findLLM, findSTT, findVision } from "@/lib/ai/models";
import {
  isLLMCached,
  isSTTCached,
  isVisionCached,
  precacheApp,
  requestPersistence,
  storageUsage,
  type PrecacheResult,
} from "@/lib/ai/offline";
import type { LoadProgress } from "@/lib/ai/types";
import { isKokoroCached } from "@/lib/ai/voice/kokoro";
import { chooseTTSDevice, findVoice, KOKORO, PRELOADED_VOICES, type TTSDevice } from "@/lib/ai/voice/voices";

type Stage = LoadProgress["stage"];
type Phase = "checking" | "unsupported" | "idle" | "loading" | "ready" | "error";

const STAGES: { stage: Stage; label: string; detail: string }[] = [
  { stage: "llm", label: "Story helper", detail: "talks and writes with your child" },
  { stage: "stt", label: "Listening ears", detail: "understands what your child says" },
  { stage: "vision", label: "Seeing eyes", detail: "guesses what your child drew" },
  { stage: "tts", label: "Voice", detail: "a warm storytelling voice that reads everything aloud" },
];

const size = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

function sourceLabel(source: ModelSource): string {
  if (source === "local") return "from this computer's model mirror";
  if (source === "r2" && R2_BASE) return "from Guhit's model server (Hugging Face as backup)";
  return "from Hugging Face";
}

/** Phones dim and lock mid-download, which cuts it off: keep the screen on while setting up. */
function useScreenAwake(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (stopped) void lock.release();
      } catch {
        // Not allowed here (low battery mode, no gesture yet): the download still runs.
      }
    };
    // The browser drops the lock whenever the page is hidden; take it again on return.
    const visible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", visible);
      void lock?.release();
    };
  }, [active]);
}

/** Which voice was really heard in the voice test (a sentence counts once its sound started). */
function describeVoices(spoken: SentenceMetric[], speaker: Speaker | null): string {
  const heard = spoken.filter((m) => m.firstAudioMs !== undefined);
  const why = spoken.find((m) => m.fallback)?.fallback ?? speaker?.info().reason ?? null;
  if (heard.length === 0) return `No sound came out. Tap "Test the voices" again${why ? ` (${why})` : ""}.`;
  const names = (engine: SentenceMetric["engine"]) =>
    [...new Set(heard.filter((m) => m.engine === engine).map((m) => findVoice(m.voice)?.name ?? m.voice))].join(
      " and ",
    );
  const kokoro = names("kokoro");
  const builtin = names("builtin");
  if (kokoro && !builtin) return `Spoken by Kokoro, the on-device storytelling voice (${kokoro}).`;
  if (!kokoro) return `Spoken by the built-in device voice (${builtin})${why ? `, because: ${why}` : ""}.`;
  return `Spoken by Kokoro (${kokoro}) and the built-in device voice (${builtin})${why ? `, because: ${why}` : ""}.`;
}

interface OfflineReport {
  persisted: boolean | null;
  precache: PrecacheResult | null;
  usage: { usage: number; quota: number } | null;
}

export function SetupClient() {
  const [support, setSupport] = useState<DeviceSupport | null>(null);
  const [choice, setChoice] = useState<ModelChoice | null>(null);
  const [ttsDevice, setTTSDevice] = useState<TTSDevice>("webgpu");
  const [cached, setCached] = useState<Record<Stage, boolean> | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [progress, setProgress] = useState<Partial<Record<Stage, LoadProgress>>>({});
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  /** The models were already running when this page opened (e.g. woken on the home screen). */
  const [alreadyLoaded, setAlreadyLoaded] = useState(false);
  const [offline, setOffline] = useState<OfflineReport | null>(null);
  const [voiceTest, setVoiceTest] = useState<string | null>(null);

  // A parent who follows the install tip gets the storage protection asked for again.
  useEffect(() => {
    const installed = () =>
      void requestPersistence().then((persisted) =>
        setOffline((previous) => (previous ? { ...previous, persisted } : previous)),
      );
    window.addEventListener("appinstalled", installed);
    return () => window.removeEventListener("appinstalled", installed);
  }, []);

  /**
   * `onDevice`: everything was downloaded before, so this only wakes the models
   * up. `visionCached`: drawing recognition is already stored for offline use.
   */
  const getReady = useCallback(async (onDevice: boolean, visionCached: boolean) => {
    setPhase("loading");
    setError(null);
    setAlreadyLoaded(onDevice);
    const started = performance.now();
    try {
      const ai = getAI();
      const report = (p: LoadProgress) => setProgress((previous) => ({ ...previous, [p.stage]: p }));
      await ai.load(report);
      // Drawing recognition is not part of load() (it is loaded per guess and
      // freed after); download it now so guesses work offline later.
      if (ai instanceof RealAI && !visionCached) await ai.prepareVision(report);
      setSeconds((performance.now() - started) / 1000);
      setCached({ llm: true, stt: true, vision: true, tts: true });
      setPhase("ready");
      const [persisted, precache] = await Promise.all([requestPersistence(), precacheApp()]);
      setOffline({ persisted, precache, usage: await storageUsage() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const found = await detectSupport();
      if (!alive) return;
      setSupport(found);
      if (!found.webgpu) {
        setPhase("unsupported");
        return;
      }
      const picked = chooseModels(found, window.location.search);
      setChoice(picked);
      const voiceDevice = chooseTTSDevice(found, window.location.search);
      setTTSDevice(voiceDevice);
      const [llm, stt, vision, tts] = await Promise.all([
        isLLMCached(picked.llm, picked.modelHost),
        isSTTCached(picked.stt, picked.sttDevice),
        isVisionCached(picked.vision),
        isKokoroCached(voiceDevice),
      ]);
      if (!alive) return;
      setCached({ llm, stt, vision, tts });
      // Every page wakes the models when they are on the device (EarlyWake), so
      // on a revisit they are already awake or waking: show that, not a button.
      const status = getAI().status();
      if (status === "ready") {
        setAlreadyLoaded(true);
        setPhase("ready");
      } else if (status === "loading" || isMarkedReady()) {
        // Joins (or starts) the same wake-up EarlyWake does; load() runs only once.
        void getReady(llm && stt && vision && tts, vision);
      } else {
        setPhase("idle");
      }
    })();
    return () => {
      alive = false;
    };
  }, [getReady]);

  const bytes: Record<Stage, number> = {
    llm: choice ? (findLLM(choice.llm)?.downloadMB ?? 0) * 1e6 : 0,
    stt: choice ? (findSTT(choice.stt)?.downloadMB[choice.sttDevice] ?? 0) * 1e6 : 0,
    vision: choice ? (findVision(choice.vision)?.downloadMB ?? 0) * 1e6 : 0,
    // Kokoro for this device plus the voices /lab can switch between.
    tts: choice ? (KOKORO.modelMB[ttsDevice] + KOKORO.voiceMB * PRELOADED_VOICES.length) * 1e6 : 0,
  };
  const totalBytes = STAGES.reduce((sum, { stage }) => sum + bytes[stage], 0);
  const toDownload = STAGES.reduce((sum, { stage }) => sum + (cached?.[stage] ? 0 : bytes[stage]), 0);
  const allCached = !!cached && STAGES.every(({ stage }) => cached[stage]);
  const friendly = phase === "error" && error ? explainLoadError(error) : null;
  useScreenAwake(phase === "loading");

  /** `onDevice`: everything was downloaded before, so this only wakes the models up. */
  /** Says a narrator line, then a character line, and reports which voice actually spoke. */
  async function testVoices() {
    const ai = getAI();
    const spoken: SentenceMetric[] = [];
    const speaker = Speaker.latest;
    // Still inside the tap: unlock audio before anything is awaited.
    speaker?.prime();
    const previous = speaker?.onMetric ?? null;
    if (speaker) {
      speaker.onMetric = (metric) => {
        spoken.push(metric);
        previous?.(metric);
      };
    }
    setVoiceTest("Speaking…");
    try {
      await ai.speak("Hello! Guhit is ready for your stories.", "narrator");
      await ai.speak("And I'm the voice of your drawings. Hee hee!", "character");
    } catch (e) {
      setVoiceTest(`The voice could not start: ${e instanceof Error ? e.message : String(e)}`);
      return;
    } finally {
      if (speaker) speaker.onMetric = previous;
    }
    setVoiceTest(describeVoices(spoken, speaker));
  }

  return (
    <div className="flex flex-1 flex-col bg-[#fff8ec]">
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-10 text-stone-800">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="self-start rounded-full px-1 py-2 font-semibold text-orange-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
        >
          ← Back to Guhit
        </Link>
        <h1 className="text-3xl font-bold">Get Guhit ready</h1>
        <p className="text-stone-600">
          Guhit&apos;s AI runs on this device. Download it once and it keeps working with no internet. Nothing your
          child draws or says ever leaves the device.
        </p>
      </header>

      {phase === "checking" && <p className="text-stone-500">Checking this device…</p>}

      {phase === "unsupported" && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">This device can&apos;t run Guhit yet</p>
          <p className="mt-1">{support?.problem}</p>
        </div>
      )}

      {choice && phase !== "unsupported" && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-stone-500">
            {support?.mobile ? "Phone" : "Laptop"} setup · {totalBytes ? `${size(totalBytes)} in total` : ""}
            {cached && toDownload < totalBytes && toDownload > 0 ? ` · ${size(toDownload)} left to download` : ""}
            {` · ${sourceLabel(choice.source)}`}
          </p>

          <ul className="flex flex-col gap-3">
            {STAGES.map(({ stage, label, detail }) => {
              const p = progress[stage];
              const isCached = cached?.[stage];
              const done = phase === "ready" || (p && p.total > 0 && p.loaded >= p.total);
              const fraction = done ? 1 : p && p.total > 0 ? Math.min(1, p.loaded / p.total) : 0;
              return (
                <li key={stage} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{label}</span>
                    <span className="text-sm text-stone-500">
                      {done ? "Ready" : !bytes[stage] ? "Built in" : isCached ? "On this device" : size(bytes[stage])}
                    </span>
                  </div>
                  <p className="text-sm text-stone-500">{p?.text ?? detail}</p>
                  {(phase === "loading" || done) && (
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"
                      role="progressbar"
                      aria-label={label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(fraction * 100)}
                    >
                      <div
                        className="h-full rounded-full bg-orange-400 transition-[width] duration-300"
                        style={{ width: `${fraction * 100}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {friendly && (
            <div role="alert" className="flex flex-col gap-1 rounded-2xl bg-red-50 p-4 text-red-900">
              <p className="font-semibold">{friendly.title}</p>
              <p>{friendly.action}</p>
              <details className="text-sm text-red-800/80">
                <summary className="cursor-pointer">Details for a grown-up helping</summary>
                <code className="break-words">{error}</code>
              </details>
            </div>
          )}
          {(phase === "idle" || phase === "error") && (
            <button
              type="button"
              onClick={() => void getReady(allCached || getAI().status() === "ready", !!cached?.vision)}
              className="rounded-full bg-orange-500 px-6 py-4 text-lg font-bold text-white shadow-sm hover:bg-orange-600 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              {friendly ? friendly.button : allCached ? "Start Guhit" : "Get Guhit ready"}
            </button>
          )}
          {phase === "loading" && (
            <p className="text-center text-stone-500">
              Keep this screen open and awake. The first download can take a few minutes on slow Wi-Fi; if it stops,
              what&apos;s already downloaded is kept.
            </p>
          )}

          {phase === "ready" && (
            <div className="flex flex-col gap-3 rounded-2xl bg-green-50 p-4 text-green-900">
              <p className="text-lg font-semibold">Guhit is ready. It now works without internet.</p>
              <p className="text-sm">
                {alreadyLoaded || seconds === null
                  ? "Already on this device and awake."
                  : `Downloaded and started in ${seconds.toFixed(1)} s.`}
              </p>
              {offline && (
                <ul className="flex flex-col gap-1 text-sm">
                  <li>
                    App saved for offline use:{" "}
                    {offline.precache?.ok
                      ? `yes (${offline.precache.pages} pages, ${offline.precache.assets} files)`
                      : "only in the installed (production) app"}
                  </li>
                  <li>
                    Protected from automatic clean-up:{" "}
                    {offline.persisted
                      ? "yes"
                      : "not yet. Tip: install Guhit (the ⊕ button in the address bar) so the browser keeps it."}
                  </li>
                  {offline.usage && <li>Storage used: {size(offline.usage.usage)}</li>}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={testVoices}
                  className="self-start rounded-full bg-white px-4 py-2 font-semibold text-green-900 ring-1 ring-green-300 hover:bg-green-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700"
                >
                  Test the voices
                </button>
                {voiceTest && (
                  <p className="text-sm" aria-live="polite">
                    {voiceTest}
                  </p>
                )}
              </div>
              <Link
                href="/"
                className="mt-2 rounded-full bg-orange-500 px-6 py-4 text-center text-lg font-bold text-white shadow-sm hover:bg-orange-600 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                Start drawing!
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
    </div>
  );
}
