"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getAI, RealAI } from "@/lib/ai";
import { chooseModels, detectSupport, type DeviceSupport, type ModelChoice } from "@/lib/ai/device";
import type { CallMetric, LoadTimings } from "@/lib/ai/engine";
import { LLM_MODELS, STT_MODELS } from "@/lib/ai/models";
import type { ChatTurn, LoadProgress } from "@/lib/ai/types";
import type { Character, Story } from "@/lib/story/types";

const TALA: Character = {
  id: "lab-tala",
  name: "Tala",
  description: "a purple dragon who loves pancakes and is a little shy",
  drawing: "",
};
const CHAT = ["", "Hi Tala! My name is Ana. Can you fly?", "Where do you live?", "What do you eat for breakfast?"];
const ANSWERS = [
  "she lives in a castle made of clouds",
  "her best friend is a tiny turtle called Pip",
  "they fly to the rainbow to look for pancakes",
];
const SAMPLE_CLIP = "/samples/tala-answer.wav";

const ms = (value?: number) => (value === undefined ? "–" : value >= 10000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`);
const num = (value?: number, digits = 1) => (value === undefined || value === 0 ? "–" : value.toFixed(digits));
const avg = (values: (number | undefined)[]) => {
  const v = values.filter((x): x is number => typeof x === "number" && x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

export function LabClient() {
  const [support, setSupport] = useState<DeviceSupport | null>(null);
  const [choice, setChoice] = useState<ModelChoice | null>(null);
  const [metrics, setMetrics] = useState<CallMetric[]>([]);
  const [timings, setTimings] = useState<LoadTimings>({});
  const [progress, setProgress] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  // The engine only exists in the browser; reading it before hydration would mismatch the server HTML.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const ai = mounted ? getAI() : null;
  const real = ai instanceof RealAI ? ai : null;

  useEffect(() => {
    void detectSupport().then((s) => {
      setSupport(s);
      setChoice(chooseModels(s, window.location.search));
    });
    if (!real) return;
    real.onMetric = () => setMetrics([...real.metrics]);
    return () => {
      real.onMetric = null;
    };
  }, [real]);

  async function step<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    try {
      return await run();
    } catch (e) {
      setError(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function loadModels() {
    if (!ai) return;
    await ai.load((p: LoadProgress) => setProgress(`${p.stage}: ${p.text}`));
    if (real) setTimings({ ...real.timings });
  }

  async function runChat() {
    if (!ai) return;
    await loadModels();
    if (real) real.autoSpeakReplies = speakReplies;
    const history: ChatTurn[] = [];
    for (const childSays of CHAT) {
      setBusy(`reply to "${childSays || "(hello)"}"`);
      const text = await ai.reply(TALA, history, childSays);
      if (childSays) history.push({ who: "child", text: childSays });
      history.push({ who: "character", text });
      // Wait for the voice like the real screen would, so each turn's speech latency is measured cleanly.
      if (speakReplies) await ai.speak(text, "character");
    }
  }

  async function runStory() {
    if (!ai) return;
    await loadModels();
    const story: Story = { id: "lab", title: "", character: TALA, pages: [], createdAt: Date.now(), updatedAt: Date.now() };
    let question = await ai.firstQuestion(TALA);
    for (const [i, answer] of ANSWERS.entries()) {
      const text = await ai.writePage(story, question, answer);
      story.pages.push({ id: `p${i}`, question, answer, text });
      question = await ai.nextQuestion(story);
    }
    story.title = await ai.titleFor(story);
  }

  async function transcribeSample() {
    if (!ai) return;
    await loadModels();
    const response = await fetch(SAMPLE_CLIP);
    if (!response.ok) throw new Error(`no sample clip at ${SAMPLE_CLIP}; run "npm run lab:sample" (macOS) or record one`);
    await ai.transcribe(await response.blob());
  }

  async function runAll() {
    await step("load", loadModels);
    await step("chat", runChat);
    await step("story", runStory);
    await step("whisper", transcribeSample);
    report();
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      void step("whisper (recorded)", async () => {
        await loadModels();
        await ai?.transcribe(new Blob(chunks, { type: rec.mimeType }));
      });
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
  }

  function summary() {
    const of = (kind: CallMetric["kind"]) => metrics.filter((m) => m.kind === kind);
    const replies = of("reply");
    const pages = of("writePage");
    const llmCalls = metrics.filter((m) => m.kind !== "transcribe");
    return {
      device: support,
      models: choice,
      voices: real?.voices,
      load: timings,
      replyFirstSentenceMsAvg: avg(replies.map((m) => m.firstSentenceMs)),
      replyFirstSpokenMsAvg: avg(replies.map((m) => m.firstSpokenMs)),
      replyTotalMsAvg: avg(replies.map((m) => m.ms)),
      firstQuestionMs: of("firstQuestion")[0]?.ms,
      nextQuestionMsAvg: avg(of("nextQuestion").map((m) => m.ms)),
      pageMsAvg: avg(pages.map((m) => m.ms)),
      titleMs: of("title")[0]?.ms,
      decodeTokPerSecAvg: avg(llmCalls.map((m) => m.decodeTps)),
      prefillTokPerSecAvg: avg(llmCalls.map((m) => m.prefillTps)),
      transcribe: of("transcribe").map((m) => ({ ms: m.ms, audioSeconds: m.audioSeconds, text: m.text })),
      calls: metrics,
    };
  }

  function report() {
    // Logged so a run can be read back from the console as well as copied.
    console.log("[guhit-lab]", JSON.stringify(summary()));
  }

  const s = summary();
  const rows: [string, string][] = [
    ["Model load (total)", ms(timings.totalMs)],
    ["  LLM load + warm-up", ms(timings.llmMs)],
    ["  Whisper load", ms(timings.sttMs)],
    ["  Whisper warm-up", ms(timings.sttWarmupMs)],
    ["Reply: first sentence ready (avg)", ms(s.replyFirstSentenceMsAvg)],
    ["Reply: first words spoken (avg)", ms(s.replyFirstSpokenMsAvg)],
    ["Reply: complete (avg)", ms(s.replyTotalMsAvg)],
    ["Time to first question", ms(s.firstQuestionMs)],
    ["Next question (avg)", ms(s.nextQuestionMsAvg)],
    ["Page (avg)", ms(s.pageMsAvg)],
    ["Title", ms(s.titleMs)],
    ["Decode tokens/s (avg)", num(s.decodeTokPerSecAvg)],
    ["Prefill tokens/s (avg)", num(s.prefillTokPerSecAvg)],
    [
      "Whisper (last clip)",
      s.transcribe.length
        ? `${ms(s.transcribe.at(-1)?.ms)} for ${num(s.transcribe.at(-1)?.audioSeconds)} s of audio`
        : "–",
    ],
  ];

  function applyModels(form: FormData) {
    const params = new URLSearchParams();
    for (const key of ["llm", "stt", "sttDevice"]) {
      const value = form.get(key);
      if (typeof value === "string" && value) params.set(key, value);
    }
    window.location.search = params.toString();
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-5 py-8 font-mono text-sm text-stone-800">
      <header>
        <h1 className="text-2xl font-bold">Guhit lab</h1>
        <p className="text-stone-500">Speed test for the on-device models. Not for kids.</p>
      </header>

      {mounted && !real && <p className="rounded bg-amber-50 p-3">Mock mode is on (?mock=1). Open /lab?mock=0 to test the real engine.</p>}

      <section className="flex flex-col gap-1">
        <p>
          WebGPU: {support ? (support.webgpu ? "yes" : `no – ${support.problem}`) : "…"} · shader-f16:{" "}
          {support?.shaderF16 ? "yes" : "no"} · device: {support?.mobile ? "phone" : "laptop"}
        </p>
        <p>
          LLM: {choice?.llm ?? "…"} · STT: {choice?.stt} on {choice?.sttDevice}
        </p>
        {real?.voices && (
          <p>
            Voices: narrator {real.voices.narrator ?? "none"} · character {real.voices.character ?? "none"} ·{" "}
            {real.voices.local ? "local (offline-safe)" : "NOT local – needs network"}
          </p>
        )}
      </section>

      <form action={applyModels} className="flex flex-wrap items-end gap-2 rounded border border-stone-200 p-3">
        <label className="flex flex-col">
          LLM
          <select name="llm" defaultValue={choice?.llm} key={choice?.llm} className="border p-1">
            {LLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.downloadMB} MB)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          STT
          <select name="stt" defaultValue={choice?.stt} key={choice?.stt} className="border p-1">
            {STT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          STT device
          <select name="sttDevice" defaultValue={choice?.sttDevice} key={choice?.sttDevice} className="border p-1">
            <option value="webgpu">webgpu</option>
            <option value="wasm">wasm</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-stone-800 px-3 py-1 text-white">
          Use these (reloads)
        </button>
      </form>

      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={runAll}
          className="rounded bg-orange-500 px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          Run full speed test
        </button>
        <button type="button" disabled={!!busy} onClick={() => step("load", loadModels)} className="rounded border px-3 py-2">
          Load models
        </button>
        <button type="button" disabled={!!busy} onClick={() => step("chat", runChat)} className="rounded border px-3 py-2">
          Chat test
        </button>
        <button type="button" disabled={!!busy} onClick={() => step("story", runStory)} className="rounded border px-3 py-2">
          Story test
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => step("whisper", transcribeSample)}
          className="rounded border px-3 py-2"
        >
          Whisper sample clip
        </button>
        <button
          type="button"
          disabled={!!busy && !recording}
          onClick={() => void toggleRecording()}
          className="rounded border px-3 py-2"
        >
          {recording ? "Stop recording" : "Record a clip"}
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} />
          speak replies
        </label>
        <button
          type="button"
          onClick={() => {
            report();
            void navigator.clipboard?.writeText(JSON.stringify(summary(), null, 2));
          }}
          className="rounded border px-3 py-2"
        >
          Copy results
        </button>
      </section>

      <p aria-live="polite" className="text-stone-500">
        {busy ? `Running: ${busy}… ${progress}` : progress}
      </p>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}

      <table className="w-full max-w-xl">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-stone-100">
              <td className="whitespace-pre py-1 pr-4">{label}</td>
              <td className="py-1 text-right font-bold">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-stone-500">
            <th>call</th>
            <th>total</th>
            <th>1st sentence</th>
            <th>1st spoken</th>
            <th>tok in/out</th>
            <th>decode t/s</th>
            <th>output</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => (
            <tr key={i} className="border-b border-stone-100 align-top">
              <td className="pr-2">
                {m.kind}
                {m.fallback ? " (fallback)" : ""}
              </td>
              <td className="pr-2">{ms(m.ms)}</td>
              <td className="pr-2">{ms(m.firstSentenceMs)}</td>
              <td className="pr-2">{ms(m.firstSpokenMs)}</td>
              <td className="pr-2">{m.promptTokens ? `${m.promptTokens}/${m.completionTokens}` : "–"}</td>
              <td className="pr-2">{num(m.decodeTps)}</td>
              <td className="font-sans">{m.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
