"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { InstallNudge } from "@/components/kid/InstallNudge";
import { getAI, RealAI } from "@/lib/ai";
import { Speaker, type SentenceMetric } from "@/lib/ai/tts";
import {
  canDownloadInBackground,
  runningBackgroundDownload,
  startBackgroundDownload,
  waitForBackgroundDownload,
} from "@/lib/ai/background-download";
import { chooseModels, detectSupport, isAppleMobile, type DeviceSupport, type ModelChoice } from "@/lib/ai/device";
import { explainLoadError } from "@/lib/ai/friendly-errors";
import { R2_BASE, type ModelSource } from "@/lib/ai/model-fetch";
import { CUTOUT_MB, listModelFiles, readTensorIndex, savedFiles, type ModelFile } from "@/lib/ai/model-files";
import { findLLM, findSTT, findVision } from "@/lib/ai/models";
import {
  chosenParts,
  installedParts,
  isPartInstalled,
  PART_STAGES,
  partOf,
  PARTS,
  recommendParts,
  REQUIRED_PARTS,
  setChosenParts,
  type Part,
} from "@/lib/ai/parts";
import { isSetupInProgress, markSetupInProgress, shouldAutoContinue } from "@/lib/ai/setup-resume";
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
import {
  chooseTTSDevice,
  chooseTTSDtype,
  findVoice,
  KOKORO,
  PRELOADED_VOICES,
  type TTSDevice,
} from "@/lib/ai/voice/voices";

type Stage = LoadProgress["stage"];
type Phase = "checking" | "test" | "idle" | "loading" | "ready" | "error";

/** Leaves test mode ("?mock=1", pretend answers) for the real engine, wherever the flag was kept. */
function turnOffTestMode() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      storage.removeItem("guhit:mock");
    } catch {
      // Blocked storage: "?mock=0" below still switches back.
    }
  }
  window.location.replace("/setup?mock=0");
}

/** The parts a parent can have, in the order setup gets them. */
const PART_INFO: Record<Part, { label: string; detail: string }> = {
  eyes: { label: "Seeing eyes", detail: "Needed for Guhit to see the drawing: it guesses what your child drew." },
  voice: {
    label: "Storytelling voice",
    detail: "A warm voice that reads everything aloud. Without it, your drawings talk in playful 8-bit sounds.",
  },
  talk: {
    label: "Talking",
    detail: "Listening ears and a story helper, so your child can talk with their drawings and make stories.",
  },
};

/** "Seeing eyes", "Seeing eyes and Talking", "Seeing eyes, Storytelling voice and Talking". */
function namesOf(parts: Part[]): string {
  const names = parts.map((part) => PART_INFO[part].label);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const STAGE_LABEL: Record<Stage, string> = {
  vision: "Seeing eyes",
  tts: "Voice",
  stt: "Listening ears",
  llm: "Story helper",
};

const size = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

function sourceLabel(source: ModelSource): string {
  if (source === "local") return "from this computer's model mirror";
  if (source === "r2" && R2_BASE) return "from Guhit's model server (Hugging Face as backup)";
  return "from Hugging Face";
}

/**
 * Phones dim and lock mid-download, which cuts it off: keep the screen on while
 * setting up. True while the screen is actually being kept awake.
 */
function useScreenAwake(active: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (stopped) return void lock.release();
        setHeld(true);
        lock.addEventListener("release", () => setHeld(false));
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
  return active && held;
}

/** The files this device's models need, as the libraries store them. */
async function filesForThisDevice(): Promise<{ files: ModelFile[]; source: ModelSource; modelHost: string | null }> {
  const search = window.location.search;
  const support = await detectSupport();
  const choice = chooseModels(support, search);
  const dtype = chooseTTSDtype(chooseTTSDevice(support, search), search);
  const files = await listModelFiles(choice, { dtype, voices: PRELOADED_VOICES }, (url) =>
    readTensorIndex(url, choice.source),
  );
  return { files, source: choice.source, modelHost: choice.modelHost };
}

/** Bytes already saved per stage, so a resumed setup shows what it kept. */
async function savedPerStage(): Promise<Partial<Record<Stage, number>>> {
  const totals: Partial<Record<Stage, number>> = {};
  for (const { file, bytes } of await savedFiles((await filesForThisDevice()).files)) {
    totals[file.stage] = (totals[file.stage] ?? 0) + bytes;
  }
  return totals;
}

/**
 * Chrome (Android and desktop): the browser downloads whatever the chosen parts
 * still miss, even with the screen off or the page closed, and the service
 * worker stores it where the libraries look. False when this browser cannot,
 * or nothing is missing.
 */
async function downloadInBackground(
  parts: Part[],
  onProgress: (downloaded: number, total: number) => void,
): Promise<boolean> {
  if (!canDownloadInBackground()) return false;
  let download = await runningBackgroundDownload();
  if (!download) {
    const { files, source, modelHost } = await filesForThisDevice();
    const saved = new Set((await savedFiles(files)).map(({ file }) => file.key));
    const missing = files.filter((file) => parts.includes(partOf(file.stage)) && !saved.has(file.key));
    if (missing.length === 0) return false;
    download = await startBackgroundDownload(missing, source, modelHost);
  }
  if (!download) return false;
  await waitForBackgroundDownload(download, onProgress);
  return true;
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
  /** Bytes each stage already has on the device from an earlier, interrupted setup. */
  const [saved, setSaved] = useState<Partial<Record<Stage, number>>>({});
  /** Chrome's own background download, while it runs. */
  const [background, setBackground] = useState<{ downloaded: number; total: number } | null>(null);
  const autoTries = useRef(0);
  /** The parts ticked on screen, and the parts already on this device. */
  const [selected, setSelected] = useState<Part[]>([...REQUIRED_PARTS]);
  const [installed, setInstalled] = useState<Part[]>([]);
  /** What suits this device's memory: shown as a hint, never ticked for the parent. */
  const [recommended, setRecommended] = useState<Part[]>([]);

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
   * Gets the parts the parent chose (saved with setChosenParts): parts taken
   * away leave the device first, then the chosen ones download and start, in
   * order of importance. Parts already on the device only wake up.
   */
  const getReady = useCallback(async () => {
    const ai = getAI();
    if (!(ai instanceof RealAI)) return;
    const parts = chosenParts() ?? [...REQUIRED_PARTS];
    for (const part of installedParts()) if (!parts.includes(part)) await ai.removePart(part);
    setInstalled(installedParts());
    const onDevice = parts.every((part) => isPartInstalled(part));
    setPhase("loading");
    setError(null);
    setAlreadyLoaded(onDevice);
    // Until "ready", leaving or sleeping only pauses setup: it carries on by itself on return.
    if (!onDevice) markSetupInProgress(true);
    const started = performance.now();
    try {
      if (!onDevice) {
        await downloadInBackground(parts, (downloaded, total) => setBackground({ downloaded, total }));
        setBackground(null);
      }
      const report = (p: LoadProgress) => setProgress((previous) => ({ ...previous, [p.stage]: p }));
      await ai.load(report, parts);
      // The story helper may have moved to the CPU when the GPU refused it.
      setChoice(chooseModels(await detectSupport(), window.location.search));
      setSeconds((performance.now() - started) / 1000);
      setInstalled(installedParts());
      markSetupInProgress(false);
      autoTries.current = 0;
      setPhase("ready");
      const [persisted, precache] = await Promise.all([requestPersistence(), precacheApp()]);
      setOffline({ persisted, precache, usage: await storageUsage() });
    } catch (e) {
      setBackground(null);
      setInstalled(installedParts());
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
      void savedPerStage().then(setSaved, () => undefined);
    }
  }, []);

  /** The parent's ticks become the plan, then setup runs it. */
  function applyChoice() {
    setChosenParts(selected);
    void getReady();
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      // Test mode ("?mock=1"): the pretend engine needs nothing set up.
      if (!(getAI() instanceof RealAI)) {
        setPhase("test");
        return;
      }
      const found = await detectSupport();
      if (!alive) return;
      setSupport(found);
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
      if (!(llm && stt && vision && tts)) void savedPerStage().then((s) => alive && setSaved(s), () => undefined);
      const onDevice = installedParts();
      setInstalled(onDevice);
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      setRecommended(recommendParts({ ...found, deviceMemory: memory }));
      // Optional parts start unticked: downloading them is the parent's choice.
      const chosen = chosenParts();
      setSelected(chosen ?? (onDevice.length ? onDevice : [...REQUIRED_PARTS]));
      // Every page wakes the parts on the device (EarlyWake), so on a revisit
      // they are already awake or waking: show that, not a button.
      const status = getAI().status();
      const allOnDevice = chosen !== null && chosen.every((part) => onDevice.includes(part));
      if (status === "ready" && !isSetupInProgress()) {
        setAlreadyLoaded(true);
        setPhase("ready");
      } else if (status === "loading" || isSetupInProgress() || allOnDevice) {
        // Nothing downloads before the parent's tap: this only joins the same
        // wake-up EarlyWake does, or carries on a download the parent started
        // and the device interrupted (app closed, phone slept).
        void getReady();
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
    // Drawing recognition plus the AI cut-out model.
    vision: choice ? ((findVision(choice.vision)?.downloadMB ?? 0) + CUTOUT_MB) * 1e6 : 0,
    // Kokoro for this device plus the voices /lab can switch between.
    tts: choice ? (KOKORO.modelMB[ttsDevice] + KOKORO.voiceMB * PRELOADED_VOICES.length) * 1e6 : 0,
  };
  const partBytes = (part: Part) => PART_STAGES[part].reduce((sum, stage) => sum + bytes[stage], 0);
  const totalBytes = selected.reduce((sum, part) => sum + partBytes(part), 0);
  const toDownload = selected.reduce(
    (sum, part) => sum + PART_STAGES[part].reduce((s, stage) => s + (cached?.[stage] ? 0 : bytes[stage]), 0),
    0,
  );
  const changed = PARTS.some((part) => selected.includes(part) !== installed.includes(part));
  const removing = installed.filter((part) => !selected.includes(part));
  /** Ticked parts not on the device yet: what the button downloads. */
  const adding = selected.filter((part) => !installed.includes(part));
  const friendly = phase === "error" && error ? explainLoadError(error) : null;
  const awake = useScreenAwake(phase === "loading");
  const iPhone = typeof navigator !== "undefined" && isAppleMobile();

  // A download cut off by sleep, a lost connection or leaving the app carries
  // on by itself once the page is back on screen and online: no tap needed.
  const errorKind = friendly?.kind ?? null;
  useEffect(() => {
    const tryNow = () => {
      const state = {
        inProgress: isSetupInProgress(),
        phase,
        errorKind,
        visible: document.visibilityState === "visible",
        online: navigator.onLine,
        autoTries: autoTries.current,
      };
      if (!shouldAutoContinue(state)) return;
      autoTries.current++;
      void getReady();
    };
    // Coming back is a fresh chance: the tries count again from zero.
    const back = () => {
      if (document.visibilityState !== "visible") return;
      autoTries.current = 0;
      tryNow();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    window.addEventListener("online", back);
    // Failed while on screen (a dropped connection): try again shortly.
    const timer = phase === "error" ? setTimeout(tryNow, 3000) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pageshow", back);
      window.removeEventListener("online", back);
      clearTimeout(timer);
    };
  }, [phase, errorKind, getReady]);

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
        {/* Leaving mid-download only pauses it, but a parent should not wander off by accident. */}
        {phase !== "loading" && (
          <Link
            href="/"
            className="self-start rounded-full px-1 py-2 font-semibold text-orange-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            ← Back to Guhit
          </Link>
        )}
        <h1 className="text-3xl font-bold">Get Guhit ready</h1>
        <p className="text-stone-600">
          Guhit&apos;s AI runs on this device. Download it once and it keeps working with no internet. Nothing your
          child draws or says ever leaves the device.
        </p>
      </header>

      {phase === "checking" && <p className="text-stone-500">Checking this device…</p>}

      {phase === "test" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
          <p>
            Test mode: Guhit uses pretend answers and your device&apos;s voice, nothing to download. Turn off test mode
            to set up the real AI.
          </p>
          <button
            type="button"
            onClick={turnOffTestMode}
            className="self-start rounded-full bg-sky-700 px-5 py-3 font-semibold text-white hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            Turn off test mode
          </button>
        </div>
      )}

      {choice && (
        <section className="flex flex-col gap-4">
          {findLLM(choice.llm)?.cpu && (
            <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              This computer has no graphics chip support, so Guhit will be slower here.
            </p>
          )}
          <p className="text-sm text-stone-500">
            {support?.mobile ? "Phone" : "Laptop"} setup · {totalBytes ? `${size(totalBytes)} for what is ticked` : ""}
            {cached && toDownload < totalBytes && toDownload > 0 ? ` · ${size(toDownload)} left to download` : ""}
            {` · ${sourceLabel(choice.source)}`}
          </p>

          <ul className="flex flex-col gap-3">
            {PARTS.map((part) => {
              const info = PART_INFO[part];
              const required = REQUIRED_PARTS.includes(part);
              const ticked = selected.includes(part);
              const leaving = removing.includes(part);
              return (
                <li
                  key={part}
                  className={`rounded-2xl border p-4 ${ticked ? "border-stone-200 bg-white" : "border-dashed border-stone-300 bg-stone-50"}`}
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
                      checked={ticked}
                      disabled={required || phase === "loading"}
                      onChange={(event) => {
                        const on = event.target.checked;
                        setSelected((previous) => (on ? [...previous, part] : previous.filter((p) => p !== part)));
                      }}
                    />
                    <span className="flex flex-1 flex-col gap-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{info.label}</span>
                        <span className="shrink-0 text-sm text-stone-500">{size(partBytes(part))}</span>
                      </span>
                      <span className="text-sm text-stone-600">{info.detail}</span>
                      {required && <span className="text-xs font-semibold text-stone-500">Always included</span>}
                      {!required && recommended.includes(part) && !installed.includes(part) && (
                        <span className="text-xs font-semibold text-green-800">Recommended for this device</span>
                      )}
                      {leaving && (
                        <span className="text-sm font-semibold text-amber-800">
                          Will be removed from this device, freeing about {size(partBytes(part))}.
                        </span>
                      )}
                    </span>
                  </label>
                  {ticked &&
                    PART_STAGES[part].map((stage) => {
                      const p = progress[stage];
                      const isCached = cached?.[stage];
                      // Ready only when the engine says so: a full bar can still be starting up.
                      const done = !!p?.done || (phase === "ready" && installed.includes(part));
                      const live = p && p.total > 0 ? Math.min(1, p.loaded / p.total) : 0;
                      // What an interrupted setup already saved stays on the bar while loading catches up.
                      const kept =
                        !isCached && saved[stage] && bytes[stage] ? Math.min(0.99, saved[stage] / bytes[stage]) : 0;
                      const fraction = done ? 1 : Math.max(live, kept);
                      const keptText =
                        kept && !p ? `${size(saved[stage] ?? 0)} of ${size(bytes[stage])} already saved` : null;
                      const state = done
                        ? "Ready"
                        : isCached
                          ? phase === "loading"
                            ? p
                              ? "Downloaded, starting"
                              : "Downloaded, starting next"
                            : "Downloaded"
                          : phase === "loading" && !p
                            ? "Waiting its turn"
                            : null;
                      const showBar = phase === "loading" || done || kept > 0;
                      if (!state && !showBar && !keptText) return null;
                      return (
                        <div key={stage} className="mt-3 border-t border-stone-100 pt-3">
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-medium text-stone-700">{STAGE_LABEL[stage]}</span>
                            {state && <span className="text-stone-500">{state}</span>}
                          </div>
                          {(p?.text ?? keptText) && <p className="text-sm text-stone-500">{p?.text ?? keptText}</p>}
                          {showBar && (
                            <div
                              className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100"
                              role="progressbar"
                              aria-label={STAGE_LABEL[stage]}
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
                        </div>
                      );
                    })}
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
          {(phase === "idle" || phase === "error" || (phase === "ready" && changed)) && (
            <button
              type="button"
              onClick={() =>
                // The graphics chip failed: start over in the CPU tier (a fresh page re-checks the device).
                friendly?.kind === "gpu" ? window.location.replace("/setup?gpu=off") : applyChoice()
              }
              className="rounded-full bg-orange-500 px-6 py-4 text-lg font-bold text-white shadow-sm hover:bg-orange-600 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              {friendly
                ? friendly.button
                : adding.length > 0 && toDownload > 0
                  ? `Get ${namesOf(adding)} · ${size(toDownload)}`
                  : phase === "ready"
                    ? "Save changes"
                    : "Start Guhit"}
            </button>
          )}
          {background && (
            <div className="flex flex-col gap-2 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
              <p className="font-semibold">
                Downloading in the background
                {background.total > 0
                  ? `: ${size(background.downloaded)} of ${size(background.total)}`
                  : background.downloaded > 0
                    ? `: ${size(background.downloaded)} so far`
                    : ""}
              </p>
              <div
                className="h-2 overflow-hidden rounded-full bg-orange-100"
                role="progressbar"
                aria-label="Background download"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={background.total > 0 ? Math.round((background.downloaded / background.total) * 100) : 0}
              >
                <div
                  className="h-full rounded-full bg-orange-400 transition-[width] duration-300"
                  style={{ width: `${background.total > 0 ? (background.downloaded / background.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-sm">
                You can leave this screen or let the device sleep: the browser keeps downloading and shows its
                progress in a notification. Come back here when it&apos;s done.
              </p>
            </div>
          )}
          {iPhone && (phase === "idle" || phase === "loading" || phase === "error") && (
            <p className="text-center text-stone-600">
              Keep Guhit open until it says ready; if you leave, it picks up where it stopped.
            </p>
          )}
          {phase === "loading" && awake && (
            <p className="text-center text-sm text-stone-500">Keeping your screen awake while Guhit downloads.</p>
          )}
          {phase === "loading" && !iPhone && !background && (
            <p className="text-center text-stone-500">
              The first download can take a few minutes on slow Wi-Fi. If it stops, what&apos;s already downloaded is
              kept and it carries on when you come back.
            </p>
          )}

          {phase === "ready" && (
            <div className="flex flex-col gap-3 rounded-2xl bg-green-50 p-4 text-green-900">
              <p className="text-lg font-semibold">Guhit is ready. It now works without internet.</p>
              <p className="text-sm">
                On this device: {installed.map((part) => PART_INFO[part].label).join(", ")}.
                {!installed.includes("talk") && " Your child can still snap, cut out and move their drawings."}
              </p>
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
          {phase === "ready" && <InstallNudge className="mt-6" />}
        </section>
      )}
    </main>
    </div>
  );
}
