"use client";

import { useEffect, useState } from "react";
import { getAI } from "@/lib/ai";
import { chooseModels, detectSupport, type DeviceSupport, type ModelChoice } from "@/lib/ai/device";
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

type Stage = LoadProgress["stage"];
type Phase = "checking" | "unsupported" | "idle" | "loading" | "ready" | "error";

const STAGES: { stage: Stage; label: string; detail: string }[] = [
  { stage: "llm", label: "Story helper", detail: "talks and writes with your child" },
  { stage: "stt", label: "Listening ears", detail: "understands what your child says" },
  { stage: "vision", label: "Seeing eyes", detail: "guesses what your child drew" },
  { stage: "tts", label: "Voice", detail: "reads everything aloud" },
];

const size = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

interface OfflineReport {
  persisted: boolean | null;
  precache: PrecacheResult | null;
  usage: { usage: number; quota: number } | null;
}

export function SetupClient() {
  const [support, setSupport] = useState<DeviceSupport | null>(null);
  const [choice, setChoice] = useState<ModelChoice | null>(null);
  const [cached, setCached] = useState<Record<Stage, boolean> | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [progress, setProgress] = useState<Partial<Record<Stage, LoadProgress>>>({});
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [offline, setOffline] = useState<OfflineReport | null>(null);

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
      const [llm, stt, vision] = await Promise.all([
        isLLMCached(picked.llm, picked.modelHost),
        isSTTCached(picked.stt, picked.sttDevice),
        isVisionCached(picked.vision),
      ]);
      if (!alive) return;
      setCached({ llm, stt, vision, tts: true });
      setPhase(getAI().status() === "ready" ? "ready" : "idle");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const bytes: Record<Stage, number> = {
    llm: choice ? (findLLM(choice.llm)?.downloadMB ?? 0) * 1e6 : 0,
    stt: choice ? (findSTT(choice.stt)?.downloadMB[choice.sttDevice] ?? 0) * 1e6 : 0,
    vision: choice ? (findVision(choice.vision)?.downloadMB ?? 0) * 1e6 : 0,
    // The voices come with the operating system.
    tts: 0,
  };
  const totalBytes = STAGES.reduce((sum, { stage }) => sum + bytes[stage], 0);
  const toDownload = STAGES.reduce((sum, { stage }) => sum + (cached?.[stage] ? 0 : bytes[stage]), 0);
  const allCached = !!cached && STAGES.every(({ stage }) => cached[stage]);

  async function getReady() {
    setPhase("loading");
    setError(null);
    const started = performance.now();
    try {
      await getAI().load((p) => setProgress((previous) => ({ ...previous, [p.stage]: p })));
      setSeconds((performance.now() - started) / 1000);
      setCached({ llm: true, stt: true, vision: true, tts: true });
      setPhase("ready");
      const [persisted, precache] = await Promise.all([requestPersistence(), precacheApp()]);
      setOffline({ persisted, precache, usage: await storageUsage() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function sayHello() {
    const ai = getAI();
    await ai.speak("Hello! Guhit is ready for your stories.", "narrator");
    await ai.speak("And I'm the voice of your drawings. Hee hee!", "character");
  }

  return (
    <div className="flex flex-1 flex-col bg-[#fff8ec]">
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-10 text-stone-800">
      <header className="flex flex-col gap-2">
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
            {choice.modelHost ? " · from this computer's model mirror" : ""}
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

          {(phase === "idle" || phase === "error") && (
            <button
              type="button"
              onClick={getReady}
              className="rounded-full bg-orange-500 px-6 py-4 text-lg font-bold text-white shadow-sm hover:bg-orange-600 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              {allCached ? "Start Guhit" : "Get Guhit ready"}
            </button>
          )}
          {phase === "loading" && (
            <p className="text-center text-stone-500">
              Keep this page open. The first download can take a few minutes on slow Wi-Fi.
            </p>
          )}
          {phase === "error" && error && (
            <p role="alert" className="rounded-2xl bg-red-50 p-4 text-red-800">
              Something went wrong: {error}
            </p>
          )}

          {phase === "ready" && (
            <div className="flex flex-col gap-3 rounded-2xl bg-green-50 p-4 text-green-900">
              <p className="text-lg font-semibold">Guhit is ready. It now works without internet.</p>
              {seconds !== null && <p className="text-sm">Started in {seconds.toFixed(1)} s.</p>}
              {offline && (
                <ul className="text-sm">
                  <li>
                    App saved for offline use:{" "}
                    {offline.precache?.ok
                      ? `yes (${offline.precache.pages} pages, ${offline.precache.assets} files)`
                      : "only in the installed (production) app"}
                  </li>
                  <li>
                    Protected from automatic clean-up:{" "}
                    {offline.persisted ? "yes" : "not granted (install Guhit to the home screen or dock to keep it)"}
                  </li>
                  {offline.usage && <li>Storage used: {size(offline.usage.usage)}</li>}
                </ul>
              )}
              <button
                type="button"
                onClick={sayHello}
                className="self-start rounded-full bg-white px-4 py-2 font-semibold text-green-900 ring-1 ring-green-300 hover:bg-green-100"
              >
                Test the voices
              </button>
            </div>
          )}
        </section>
      )}
    </main>
    </div>
  );
}
