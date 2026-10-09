"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getAI, installedParts, isSetupInProgress, isTestMode, RealAI } from "@/lib/ai";
import type { AIStatus, Part, PartStatus } from "@/lib/ai";
import { recordNote } from "@/lib/boot-log";
import { babbleLevel, onBabbleStart } from "@/lib/sfx/babble";

/**
 * Models are on this device: /setup put at least one part here, or the canned
 * engine (?mock=1) is in use, which needs no download at all.
 */
function onThisDevice(): boolean {
  return installedParts().length > 0 || !(getAI() instanceof RealAI);
}

const noSubscribe = () => () => {};

/** Testers' mode (/?mock=1): pretend answers, nothing to download. */
export function useTestMode(): boolean {
  return useSyncExternalStore(noSubscribe, isTestMode, () => false);
}

// getAI().status() is a plain getter, so watch it with a light poll.
const pollEvery = (ms: number) => (onChange: () => void) => {
  const id = setInterval(onChange, ms);
  return () => clearInterval(id);
};
const subscribeStatus = pollEvery(500);

export function useAIStatus(): { status: AIStatus | "unknown"; onDevice: boolean } {
  const status = useSyncExternalStore<AIStatus | "unknown">(
    subscribeStatus,
    () => getAI().status(),
    () => "unknown",
  );
  const onDevice = useSyncExternalStore(subscribeStatus, onThisDevice, () => false);
  return { status, onDevice };
}

export type Readiness = "checking" | "ready" | "waking" | "needs-setup" | "error";

/**
 * Whether the screen can talk. Models already on the device are loaded
 * quietly; models that are not must never start downloading from a kid
 * screen (about 1 GB), so the parent is sent to /setup instead.
 */
export function useAIReady(): Readiness {
  const { status, onDevice } = useAIStatus();

  useEffect(() => {
    if (status === "idle" && onDevice) {
      getAI()
        .load(() => {})
        .catch(() => {
          // status() turns to "error"; the screen shows the setup card.
        });
    }
  }, [status, onDevice]);

  if (status === "unknown") return "checking";
  if (status === "ready") return "ready";
  if (status === "loading") return "waking";
  if (status === "error") return onDevice ? "error" : "needs-setup";
  return onDevice ? "waking" : "needs-setup";
}

/**
 * One part of the AI, as a screen needs it: "eyes" (guessing the drawing),
 * "voice" (the storytelling voice; without it the device's own voice speaks)
 * or "talk" (listening ears and story helper).
 * - "ready": use it; "waking": it is on the device and starting;
 * - "not-installed": the parent did not choose it, so the screen simply does without;
 * - "setting-up": a setup is still running or was interrupted; /setup finishes it;
 * - "error": it failed to start.
 */
export type PartReadiness = "checking" | "ready" | "waking" | "not-installed" | "setting-up" | "error";

export function usePart(part: Part): PartReadiness {
  const status = useSyncExternalStore<PartStatus | "unknown">(
    subscribeStatus,
    () => getAI().partStatus(part),
    () => "unknown",
  );

  useEffect(() => {
    // A part on the device wakes quietly; a missing one is never downloaded from a kid screen.
    if (status === "idle") {
      getAI()
        .load(() => {}, [part])
        .catch((error) => {
          // partStatus() turns to "error"; the reason goes in setup's grown-up details.
          recordNote(`The ${part} could not wake: ${error instanceof Error ? error.message : String(error)}`);
        });
    }
  }, [status, part]);

  if (status === "unknown") return "checking";
  if (status === "ready") return "ready";
  if (status === "loading" || status === "idle") return "waking";
  if (status === "error") return "error";
  return isSetupInProgress() ? "setting-up" : "not-installed";
}

/** True once the storytelling voice (Kokoro) is on this device and started. */
export const useVoiceReady = () => usePart("voice") === "ready";

export type MicState = "idle" | "starting" | "recording" | "denied" | "unsupported";

interface Recording {
  stream?: MediaStream;
  recorder?: MediaRecorder;
  audio?: AudioContext;
  raf?: number;
  timer?: ReturnType<typeof setTimeout>;
  startedAt: number;
  stopWanted: boolean;
  cancelled: boolean;
}

const MAX_RECORDING_MS = 15000;
const MIN_RECORDING_MS = 350;

/**
 * Push-to-talk recorder. The microphone is opened only between start() and
 * stop(), never left listening, which also keeps a noisy room out.
 */
export function usePushToTalk(onAudio: (audio: Blob) => void) {
  const [state, setState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const onAudioRef = useRef(onAudio);
  useEffect(() => {
    onAudioRef.current = onAudio;
  }, [onAudio]);

  const session = useRef<Recording | null>(null);

  const release = useCallback(() => {
    const s = session.current;
    if (!s) return;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (s.timer) clearTimeout(s.timer);
    s.stream?.getTracks().forEach((t) => t.stop());
    s.audio?.close().catch(() => {});
    session.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    const s = session.current;
    if (!s) return;
    if (s.recorder && s.recorder.state === "recording") s.recorder.stop();
    else s.stopWanted = true;
  }, []);

  const cancel = useCallback(() => {
    const s = session.current;
    if (!s) return;
    s.cancelled = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (session.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      return;
    }
    const s: Recording = { startedAt: 0, stopWanted: false, cancelled: false };
    session.current = s;
    setState("starting");
    // Created inside the tap so iOS lets it run.
    try {
      s.audio = new AudioContext();
    } catch {
      s.audio = undefined;
    }
    try {
      s.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      release();
      setState(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "unsupported");
      return;
    }
    if (s.stopWanted || session.current !== s) {
      // Let go before the microphone even opened: nothing to hear.
      release();
      setState("idle");
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(s.stream);
    s.recorder = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const tooShort = performance.now() - s.startedAt < MIN_RECORDING_MS;
      const cancelled = s.cancelled;
      release();
      setState("idle");
      if (!cancelled && !tooShort) onAudioRef.current(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorder.start();
    s.startedAt = performance.now();
    setState("recording");
    s.timer = setTimeout(() => stop(), MAX_RECORDING_MS);

    if (s.audio) {
      s.audio.resume().catch(() => {});
      const analyser = s.audio.createAnalyser();
      analyser.fftSize = 512;
      s.audio.createMediaStreamSource(s.stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let smooth = 0;
      let last = 0;
      const tick = (t: number) => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        const rms = Math.sqrt(sum / samples.length);
        smooth = smooth * 0.6 + Math.min(1, rms * 5) * 0.4;
        if (t - last > 60) {
          last = t;
          setLevel(smooth);
        }
        s.raf = requestAnimationFrame(tick);
      };
      s.raf = requestAnimationFrame(tick);
    }
  }, [release, stop]);

  useEffect(
    () => () => {
      const s = session.current;
      if (s) s.cancelled = true;
      if (s?.recorder?.state === "recording") s.recorder.stop();
      else release();
    },
    [release],
  );

  return { state, level, start, stop, cancel };
}

/** The voice's loudness (the engine's, or the 8-bit babble's), read by the character every animation frame. */
export const speechLevel = () => Math.max(getAI().speechLevel(), babbleLevel());

/** How long the voice may stay silent before a speaker counts as finished. */
const QUIET_MS = 1500;

/**
 * Which voice is audible right now. Starts when sound actually starts (not
 * when speak() was called) and ends after a stretch of silence.
 */
export function useSpeakingVoice(): "narrator" | "character" | null {
  const [voice, setVoice] = useState<"narrator" | "character" | null>(null);
  useEffect(() => {
    const ai = getAI();
    let quietSince = 0;
    const off = ai.onSpeechStart((v) => {
      quietSince = 0;
      setVoice(v);
    });
    // The babble is always the character talking.
    const offBabble = onBabbleStart(() => {
      quietSince = 0;
      setVoice("character");
    });
    const check = setInterval(() => {
      if (speechLevel() > 0.01) quietSince = 0;
      else if (!quietSince) quietSince = performance.now();
      else if (performance.now() - quietSince > QUIET_MS) setVoice(null);
    }, 150);
    return () => {
      off();
      offBabble();
      clearInterval(check);
    };
  }, []);
  return voice;
}
