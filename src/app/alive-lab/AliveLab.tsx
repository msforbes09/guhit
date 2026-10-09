"use client";

import { useEffect, useRef, useState } from "react";
import { AliveStage } from "@/components/alive/AliveStage";
import type { AliveCharacterHandle, AliveStats } from "@/components/alive/AliveCharacter";
import { cutout, cutoutFromCanvas, maskToCanvas } from "@/lib/alive/cutout";
import { ALIVE_MOTIONS, type AliveMotion, type CutoutWithDebug } from "@/lib/alive/types";
import { filmstrip } from "./filmstrip";
import { SAMPLES } from "./samples";

type TalkMode = "off" | "auto" | "slider";

export function AliveLab() {
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<CutoutWithDebug | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [motion, setMotion] = useState<AliveMotion>("idle");
  const [talk, setTalk] = useState<TalkMode>("off");
  const [level, setLevel] = useState(0.6);
  const [stats, setStats] = useState<AliveStats | null>(null);
  const [taps, setTaps] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [strip, setStrip] = useState<{ url: string; label: string } | null>(null);
  const charRef = useRef<AliveCharacterHandle>(null);
  const lastBlob = useRef<Blob | null>(null);

  async function run(blob: Blob, label: string) {
    setBusy(`Cutting out ${label}…`);
    setError(null);
    lastBlob.current = blob;
    setOriginal((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
    try {
      setResult(await cutout(blob, { debug: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function runCanvas(c: HTMLCanvasElement) {
    setBusy("Cutting out the drawing…");
    setError(null);
    try {
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
      lastBlob.current = blob;
      setOriginal((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      setResult(await cutoutFromCanvas(c, { debug: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const meta = result?.meta;

  return (
    <main className="flex min-h-screen w-full flex-col bg-white text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Alive lab</h1>
        <p className="text-sm text-zinc-500">Cut-out + animation engine test bench. Everything runs on this device.</p>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            className="rounded-full bg-violet-100 px-4 py-2 text-sm font-medium text-violet-900 hover:bg-violet-200 disabled:opacity-50"
            disabled={!!busy}
            onClick={async () => run(await s.make(), s.label)}
          >
            {s.label}
          </button>
        ))}
        <label className="cursor-pointer rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          Upload photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run(f, f.name);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100"
          onClick={() => setDrawing((d) => !d)}
        >
          {drawing ? "Hide draw pad" : "Draw on screen"}
        </button>
        {busy && <span className="text-sm text-violet-700">{busy}</span>}
        {error && <span className="text-sm text-red-600">Error: {error}</span>}
      </section>

      {drawing && <DrawPad onDone={runCanvas} disabled={!!busy} />}

      {result && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel title="Original">
            {original && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={original} alt="original" className="max-h-72 w-full object-contain" />
            )}
          </Panel>
          <Panel title="Mask">
            {result.debug && <MaskView result={result} />}
          </Panel>
          <Panel title="Cut-out">
            <div
              className="flex h-72 items-center justify-center"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#e4e4e7 0% 25%, #fafafa 0% 50%)",
                backgroundSize: "20px 20px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.png} alt="cut-out" className="max-h-72 max-w-full object-contain" />
            </div>
          </Panel>
        </section>
      )}

      {meta && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-4 text-sm">
            <h2 className="mb-2 font-semibold">
              Result:{" "}
              <span className={meta.quality === "good" ? "text-emerald-700" : "text-amber-700"}>{meta.quality}</span>{" "}
              <span className="font-normal text-zinc-500">({meta.method})</span>
            </h2>
            {meta.reasons.length > 0 && <p className="mb-2 text-amber-700">{meta.reasons.join("; ")}</p>}
            <p className="text-zinc-600">
              Source {meta.source.width}×{meta.source.height} → processed {meta.processed.width}×{meta.processed.height} → cut-out{" "}
              {result!.width}×{result!.height}
            </p>
            {meta.stats && (
              <p className="mt-1 font-mono text-xs text-zinc-500">
                {Object.entries(meta.stats)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("  ")}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-zinc-200 p-4 text-sm">
            <h2 className="mb-2 font-semibold">Timings (measured, ms)</h2>
            <table className="w-full font-mono text-xs">
              <tbody>
                {Object.entries(meta.timings).map(([k, v]) => (
                  <tr key={k} className={k === "total" ? "font-bold" : ""}>
                    <td className="py-0.5 pr-4">{k}</td>
                    <td className="text-right">{v.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && (
        <section className="flex flex-col gap-3">
          <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-2xl shadow-lg">
            <AliveStage
              cutout={result}
              motion={motion}
              talking={talk !== "off"}
              level={talk === "slider" ? level : undefined}
              onTap={() => setTaps((t) => t + 1)}
              onStats={setStats}
              characterRef={charRef}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ALIVE_MOTIONS.map((m) => (
              <button
                key={m}
                onClick={() => setMotion(m)}
                className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${
                  motion === m ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-900 hover:bg-violet-200"
                }`}
              >
                {m}
              </button>
            ))}
            <button
              onClick={async () => {
                const rows = [
                  ...ALIVE_MOTIONS.map((m) => ({ motion: m })),
                  { motion: "idle" as const, talking: true },
                  { motion: "idle" as const, pokeAt: 0.2 },
                ];
                const f = await filmstrip(result, rows);
                setStrip((old) => {
                  if (old) URL.revokeObjectURL(old.url);
                  return {
                    url: f.url,
                    label: `10 frames per row over 2.4 s at a fixed 60 Hz · ${f.msPerFrame.toFixed(3)} ms per frame (update + draw + GPU finish, ${f.renderer})`,
                  };
                });
              }}
              className="rounded-full border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-50"
            >
              Filmstrip (all motions)
            </button>
            <button
              onClick={() => charRef.current?.poke()}
              className="rounded-full bg-pink-100 px-4 py-2 text-sm font-semibold text-pink-900 hover:bg-pink-200"
            >
              Poke
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">Talking:</span>
            {(["off", "auto", "slider"] as TalkMode[]).map((m) => (
              <label key={m} className="flex items-center gap-1">
                <input type="radio" name="talk" checked={talk === m} onChange={() => setTalk(m)} />
                {m}
              </label>
            ))}
            {talk === "slider" && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              />
            )}
            <span className="ml-auto font-mono text-xs text-zinc-500">
              {stats ? `${stats.fps} fps · ${stats.renderer} · ${stats.triangles} triangles` : "…"} · taps {taps}
            </span>
          </div>
          {strip && (
            <figure className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={strip.url} alt="filmstrip" className="w-full rounded-lg border border-zinc-200" />
              <figcaption className="font-mono text-xs text-zinc-500">{strip.label}</figcaption>
            </figure>
          )}
        </section>
      )}
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200">
      <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function MaskView({ result }: { result: CutoutWithDebug }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !result.debug) return;
    const c = maskToCanvas(result.debug.fullAlpha, result.debug.width, result.debug.height);
    c.className = "max-h-72 w-full object-contain";
    el.replaceChildren(c);
  }, [result]);
  return <div ref={ref} className="flex h-72 items-center justify-center bg-black" />;
}

const COLORS = ["#1f2340", "#7c4dff", "#ff5c8a", "#ffb020", "#2ec27e", "#3a86ff"];

function DrawPad({ onDone, disabled }: { onDone: (c: HTMLCanvasElement) => void; disabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(14);
  const last = useRef<[number, number] | null>(null);

  const clear = () => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  };
  useEffect(clear, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height];
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 md:flex-row">
      <canvas
        ref={ref}
        width={700}
        height={700}
        className="aspect-square w-full max-w-md touch-none rounded-lg border border-zinc-300 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = pos(e);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(...last.current);
          ctx.lineTo(...p);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`colour ${c}`}
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full ${color === c ? "ring-4 ring-violet-300" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <label className="text-sm">
          Brush {width}px
          <input type="range" min={4} max={40} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="block" />
        </label>
        <div className="flex gap-2">
          <button className="rounded-full border border-zinc-300 px-4 py-2 text-sm" onClick={clear}>
            Clear
          </button>
          <button
            className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={disabled}
            onClick={() => onDone(ref.current!)}
          >
            Bring it to life
          </button>
        </div>
      </div>
    </section>
  );
}
