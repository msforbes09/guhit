"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getAI } from "@/lib/ai";
import type { AIStatus } from "@/lib/ai";

/** Set by /setup after the models were downloaded and loaded once. */
export const READY_FLAG = "guhit:ready";

function readFlag(): boolean {
  try {
    return localStorage.getItem(READY_FLAG) === "1";
  } catch {
    return false;
  }
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
  const onDevice = useSyncExternalStore(subscribeStatus, readFlag, () => false);
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

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A speaking pulse for the character. speak() reports no loudness, so this
 * shapes a syllable-like rhythm while the voice plays.
 */
export function useTalkLevel(talking: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!talking) return;
    if (prefersReducedMotion()) {
      const id = requestAnimationFrame(() => setLevel(0.3));
      return () => {
        cancelAnimationFrame(id);
        setLevel(0);
      };
    }
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      if (t - last > 55) {
        last = t;
        const s = (t - t0) / 1000;
        const syllable = Math.abs(Math.sin(s * 11)) * (0.6 + 0.4 * Math.sin(s * 2.3));
        setLevel(Math.max(0, Math.min(1, 0.2 + syllable * 0.7 + Math.random() * 0.12)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setLevel(0);
    };
  }, [talking]);
  return talking ? level : 0;
}
