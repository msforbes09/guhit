"use client";

import { useEffect, useRef, useState } from "react";
import { getAI } from "@/lib/ai";
import { chooseModels, detectSupport, type DeviceSupport } from "@/lib/ai/device";
import { Speaker, type SentenceMetric, type VoiceInfo } from "@/lib/ai/tts";
import {
  chooseTTSDevice,
  DEFAULT_STYLES,
  KOKORO_VOICES,
  preferredEngine,
  setStyle,
  styleFor,
  type VoiceEngine,
  type VoiceRole,
  type VoiceStyle,
} from "@/lib/ai/voice/voices";

const SAMPLES: Record<VoiceRole, string> = {
  narrator:
    "Once upon a time, a little purple dragon named Tala lived in a castle on a cloud. Every morning, she ate pancakes with her best friend. What happens next? Draw it for me!",
  character: "Hi! I'm Tala, and I'm so happy you drew me! Do you want to go on an adventure with me?",
};
/** A reply as the engine streams it: the second sentence arrives while the first is being spoken. */
const STREAMED = ["Wow, that sounds like so much fun!", "Can you draw me a rainbow to fly over?"];

const ms = (v?: number) => (v === undefined ? "–" : `${Math.round(v)} ms`);
const avg = (values: (number | undefined)[]) => {
  const v = values.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

interface StartEvent {
  voice: VoiceRole;
  at: number;
}

/** /lab: the voice on its own — engine switch, voice picks, first-audio time, real-time factor, level meter. */
export function VoiceLab() {
  const [support, setSupport] = useState<DeviceSupport | null>(null);
  const [info, setInfo] = useState<VoiceInfo | null>(null);
  const [engine, setEngineState] = useState<VoiceEngine>("kokoro");
  const [styles, setStyles] = useState<Record<VoiceRole, VoiceStyle>>(DEFAULT_STYLES);
  const [metrics, setMetrics] = useState<SentenceMetric[]>([]);
  const [starts, setStarts] = useState<StartEvent[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const meter = useRef<HTMLDivElement>(null);
  const peak = useRef<HTMLSpanElement>(null);
  const t0 = useRef(0);

  const speaker = () => Speaker.latest;

  useEffect(() => {
    void detectSupport().then(setSupport);
    // Browser-only settings, read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEngineState(preferredEngine());
    setStyles({ narrator: styleFor("narrator"), character: styleFor("character") });
    t0.current = performance.now();
    const ai = getAI();
    const offStart = ai.onSpeechStart((voice) =>
      setStarts((s) => [...s.slice(-9), { voice, at: performance.now() - t0.current }]),
    );
    const s = Speaker.latest;
    if (s) s.onMetric = (m) => setMetrics((all) => [...all, m]);
    // The level meter reads the public contract, exactly as a kid screen would.
    let top = 0;
    const timer = setInterval(() => {
      const level = ai.speechLevel();
      top = Math.max(level, top * 0.995);
      if (meter.current) meter.current.style.width = `${level * 100}%`;
      if (peak.current) peak.current.textContent = `${level.toFixed(2)} (peak ${top.toFixed(2)})`;
    }, 33);
    return () => {
      offStart();
      clearInterval(timer);
      if (s) s.onMetric = null;
    };
  }, []);

  const ttsDevice = support && typeof window !== "undefined" ? chooseTTSDevice(support, window.location.search) : null;
  const emulated = !!support && !support.mobile && ttsDevice === "wasm";

  async function run(label: string, task: () => Promise<void>) {
    setBusy(true);
    setStatus(`${label}…`);
    try {
      await task();
      setStatus(`${label}: done`);
    } catch (e) {
      setStatus(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      const s = speaker();
      if (s) setInfo(s.info());
    }
  }

  async function loadVoice() {
    const s = speaker();
    if (!s || !support) throw new Error("no engine (mock mode?)");
    const { modelHost } = chooseModels(support, window.location.search);
    const result = await s.load(support, modelHost, (loaded, total, text) =>
      setStatus(`${text} ${total ? `(${Math.round(loaded / 1e6)} / ${Math.round(total / 1e6)} MB)` : ""}`),
    );
    setInfo(result);
  }

  function chooseEngine(next: VoiceEngine) {
    speaker()?.setEngine(next);
    setEngineState(next);
    setInfo(speaker()?.info() ?? null);
  }

  function changeStyle(role: VoiceRole, patch: Partial<VoiceStyle>) {
    const next = { ...styles[role], ...patch };
    setStyles({ ...styles, [role]: next });
    setStyle(role, next);
  }

  async function sayStreamed() {
    const s = speaker();
    if (!s) return;
    const playback = s.stream("character");
    playback.add(STREAMED[0]);
    // Roughly when a small model finishes writing the second sentence.
    await new Promise((r) => setTimeout(r, 700));
    playback.add(STREAMED[1]);
    playback.end();
    await playback.done;
  }

  const kokoro = metrics.filter((m) => m.engine === "kokoro");
  const firsts = kokoro.filter((m) => m.index === 0);
  const later = kokoro.filter((m) => m.index > 0);
  const builtinFirsts = metrics.filter((m) => m.engine === "builtin" && m.index === 0);
  const label = emulated ? "phone path EMULATED on this laptop (wasm q8)" : support?.mobile ? "phone (real)" : "laptop (real)";

  function copy() {
    const report = { label, device: ttsDevice, support, info, metrics, starts };
    console.log("[guhit-voice-lab]", JSON.stringify(report));
    void navigator.clipboard?.writeText(JSON.stringify(report, null, 2)).catch(() => {});
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-stone-200 p-3">
      <h2 className="text-lg font-bold">Voice</h2>
      <p>
        Engine: <strong>{info?.engine ?? "not loaded"}</strong>
        {info?.kokoro &&
          ` · Kokoro ${info.kokoro.dtype} on ${info.kokoro.device} · load RTF ${info.kokoro.rtf.toFixed(2)} · warm-up ${ms(info.kokoro.warmupMs)}`}
        {info?.reason && ` · built-in because: ${info.reason}`}
        {info && ` · built-in voices: ${info.narrator ?? "none"} / ${info.character ?? "none"}`}
      </p>
      <p className="text-stone-500">
        Measuring: {label}. Add <code>?ttsDevice=wasm</code> for the phone path, <code>&amp;ttsForce=1</code> to keep
        Kokoro even when it measures slower than speech.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => run("load voice", loadVoice)} className="rounded border px-3 py-2">
          Load voice only
        </button>
        <span>Speak with:</span>
        {(["kokoro", "builtin"] as const).map((e) => (
          <label key={e} className="flex items-center gap-1">
            <input type="radio" name="engine" checked={engine === e} onChange={() => chooseEngine(e)} />
            {e === "kokoro" ? "Kokoro" : "built-in"}
          </label>
        ))}
      </div>

      {(["narrator", "character"] as const).map((role) => (
        <div key={role} className="flex flex-wrap items-center gap-2">
          <span className="w-20">{role}</span>
          <select
            value={styles[role].voice}
            onChange={(e) => changeStyle(role, { voice: e.target.value })}
            className="border p-1"
          >
            {KOKORO_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} ({v.grade}) – {v.note}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            speed
            <input
              type="number"
              step={0.01}
              min={0.7}
              max={1.3}
              value={styles[role].speed}
              onChange={(e) => changeStyle(role, { speed: Number(e.target.value) })}
              className="w-20 border p-1"
            />
          </label>
          <label className="flex items-center gap-1">
            pitch
            <input
              type="number"
              step={0.01}
              min={0.9}
              max={1.15}
              value={styles[role].pitch}
              onChange={(e) => changeStyle(role, { pitch: Number(e.target.value) })}
              className="w-20 border p-1"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(`say (${role})`, () => getAI().speak(SAMPLES[role], role))}
            className="rounded border px-3 py-1"
          >
            Say sample
          </button>
          <button
            type="button"
            onClick={() => {
              setStyle(role, null);
              setStyles({ ...styles, [role]: DEFAULT_STYLES[role] });
            }}
            className="rounded border px-3 py-1"
          >
            Default
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => run("streamed reply", sayStreamed)} className="rounded border px-3 py-2">
          Streamed reply (2 sentences)
        </button>
        <button type="button" onClick={() => getAI().stopSpeaking()} className="rounded border px-3 py-2">
          Stop
        </button>
        <button type="button" onClick={copy} className="rounded border px-3 py-2">
          Copy voice results
        </button>
        <button type="button" onClick={() => setMetrics([])} className="rounded border px-3 py-2">
          Clear
        </button>
      </div>
      <p aria-live="polite" className="text-stone-500">
        {status}
      </p>

      <div className="flex items-center gap-2">
        <span className="w-28">speechLevel()</span>
        <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100">
          <div ref={meter} className="h-full bg-orange-400" style={{ width: "0%" }} />
        </div>
        <span ref={peak} className="w-40 text-right" />
      </div>
      <p className="text-stone-500">
        onSpeechStart: {starts.length ? starts.map((s) => `${s.voice} @ ${(s.at / 1000).toFixed(2)} s`).join(" · ") : "–"}
      </p>

      <table className="w-full max-w-xl">
        <tbody>
          {(
            [
              [`Kokoro first sentence → first audio (avg, ${label})`, ms(avg(firsts.map((m) => m.firstAudioMs)))],
              ["Kokoro first sentence synthesis (avg)", ms(avg(firsts.map((m) => m.synthMs)))],
              ["Kokoro later sentences → audio (avg)", ms(avg(later.map((m) => m.firstAudioMs)))],
              ["Kokoro real-time factor (avg, below 1 = faster than speech)", avg(kokoro.map((m) => m.rtf))?.toFixed(2) ?? "–"],
              ["Built-in first sentence → first audio (avg)", ms(avg(builtinFirsts.map((m) => m.firstAudioMs)))],
            ] as [string, string][]
          ).map(([k, v]) => (
            <tr key={k} className="border-b border-stone-100">
              <td className="py-1 pr-4">{k}</td>
              <td className="py-1 text-right font-bold">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-stone-500">
            <th>engine</th>
            <th>voice</th>
            <th>#</th>
            <th>synth</th>
            <th>audio</th>
            <th>RTF</th>
            <th>→ audio</th>
            <th>text</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => (
            <tr key={i} className="border-b border-stone-100 align-top">
              <td className="pr-2">
                {m.engine}
                {m.device ? ` (${m.device})` : ""}
                {m.fallback ? ` – ${m.fallback}` : ""}
              </td>
              <td className="pr-2">{m.voice}</td>
              <td className="pr-2">{m.index}</td>
              <td className="pr-2">
                {ms(m.synthMs)}
                {m.modelMs !== undefined ? ` (g2p ${Math.round(m.g2pMs ?? 0)} · model ${Math.round(m.modelMs)})` : ""}
              </td>
              <td className="pr-2">{m.audioSeconds ? `${m.audioSeconds.toFixed(2)} s` : "–"}</td>
              <td className="pr-2">{m.rtf?.toFixed(2) ?? "–"}</td>
              <td className="pr-2">{ms(m.firstAudioMs)}</td>
              <td className="font-sans">{m.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
