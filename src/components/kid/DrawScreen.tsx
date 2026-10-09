"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { canvasToBlob } from "@/lib/story/image";
import { CutError, CutoutPreview, CuttingView, NotThisOne, useBringToLife } from "./BringToLife";
import { useFriends } from "./FriendsGrid";
import { ShelfFull } from "./ShelfFull";
import { ArrowCounterClockwise, Eraser, PaintBrush, Sparkle, Trash } from "./icons";
import { Button, TopBar } from "./ui";

const CRAYONS = [
  { name: "Black", value: "#2a2238" },
  { name: "Red", value: "#e5533c" },
  { name: "Orange", value: "#ff8c42" },
  { name: "Yellow", value: "#ffc93c" },
  { name: "Green", value: "#4cae55" },
  { name: "Blue", value: "#3b8fd9" },
  { name: "Purple", value: "#8f5fd6" },
  { name: "Pink", value: "#f585ae" },
  { name: "Brown", value: "#8b5a3c" },
];

const SIZES = [
  { name: "Thin", px: 9, dot: 12 },
  { name: "Medium", px: 20, dot: 20 },
  { name: "Fat", px: 38, dot: 30 },
];

const PAPER = "#ffffff";

type Stroke = { kind: "line"; color: string; size: number; eraser: boolean; points: [number, number][] } | { kind: "clear" };

/** Crayon grain: the colour with small lighter flecks, like wax on paper. */
function crayonPattern(ctx: CanvasRenderingContext2D, color: string, cache: Map<string, CanvasPattern>) {
  const hit = cache.get(color);
  if (hit) return hit;
  const tile = document.createElement("canvas");
  tile.width = tile.height = 96;
  const t = tile.getContext("2d")!;
  t.fillStyle = color;
  t.fillRect(0, 0, 96, 96);
  // Seeded so a replay after undo draws exactly the same grain.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  t.fillStyle = "rgba(255,255,255,0.32)";
  for (let i = 0; i < 900; i++) t.fillRect(rand() * 96, rand() * 96, 1 + rand() * 1.5, 1);
  const pattern = ctx.createPattern(tile, "repeat")!;
  cache.set(color, pattern);
  return pattern;
}

export function DrawScreen() {
  const life = useBringToLife();
  const shelf = useFriends();
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Extract<Stroke, { kind: "line" }> | null>(null);
  const patterns = useRef(new Map<string, CanvasPattern>());
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [color, setColor] = useState(CRAYONS[6].value);
  const [width, setWidth] = useState(SIZES[1].px);
  const [eraser, setEraser] = useState(false);
  const [inkCount, setInkCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);

  // Pick the paper's shape once from the room available: landscape on a
  // laptop, portrait on a phone.
  useLayoutEffect(() => {
    const el = area.current;
    // Wait until the paper is actually on screen (not behind the full-shelf notice).
    if (!el || size || !el.clientWidth) return;
    const landscape = el.clientWidth >= el.clientHeight;
    setSize(landscape ? { w: 1200, h: 900 } : { w: 900, h: 1200 });
  }, [size, shelf.full, life.phase]);

  useEffect(() => {
    const el = area.current;
    if (!el || !size) return;
    const fit = () => {
      const scale = Math.min(el.clientWidth / size.w, el.clientHeight / size.h);
      setDisplay({ w: Math.floor(size.w * scale), h: Math.floor(size.h * scale) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  const paint = useCallback((ctx: CanvasRenderingContext2D, s: Extract<Stroke, { kind: "line" }>, from = 0) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.size;
    ctx.strokeStyle = s.eraser ? PAPER : crayonPattern(ctx, s.color, patterns.current);
    ctx.fillStyle = ctx.strokeStyle;
    const p = s.points;
    if (p.length === 1) {
      ctx.beginPath();
      ctx.arc(p[0][0], p[0][1], s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Smooth curve through midpoints; drawing from `from` lets a live stroke
    // add just its newest piece.
    ctx.beginPath();
    const start = Math.max(1, from);
    const [ax, ay] = start === 1 ? p[0] : mid(p[start - 2], p[start - 1]);
    ctx.moveTo(ax, ay);
    for (let i = start; i < p.length; i++) {
      const [mx, my] = mid(p[i - 1], p[i]);
      ctx.quadraticCurveTo(p[i - 1][0], p[i - 1][1], mx, my);
    }
    ctx.stroke();
  }, []);

  const redraw = useCallback(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !size) return;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, size.w, size.h);
    const all = strokes.current;
    const lastClear = all.map((s) => s.kind).lastIndexOf("clear");
    for (const s of all.slice(lastClear + 1)) if (s.kind === "line") paint(ctx, s);
  }, [paint, size]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const point = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - rect.left) * size!.w) / rect.width, ((e.clientY - rect.top) * size!.h) / rect.height];
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!size || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { kind: "line", color, size: eraser ? width * 1.6 : width, eraser, points: [point(e)] };
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) paint(ctx, current.current);
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const before = s.points.length;
    if (events.length) {
      const rect = e.currentTarget.getBoundingClientRect();
      for (const ev of events) {
        s.points.push([((ev.clientX - rect.left) * size!.w) / rect.width, ((ev.clientY - rect.top) * size!.h) / rect.height]);
      }
    } else s.points.push(point(e));
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) paint(ctx, s, before);
  };

  const up = () => {
    const s = current.current;
    if (!s) return;
    current.current = null;
    strokes.current.push(s);
    setCanUndo(true);
    if (!s.eraser) setInkCount((n) => n + 1);
  };

  const undo = () => {
    const removed = strokes.current.pop();
    if (removed?.kind === "line" && !removed.eraser) setInkCount((n) => Math.max(0, n - 1));
    if (removed?.kind === "clear") setInkCount(countInk(strokes.current));
    setCanUndo(strokes.current.length > 0);
    redraw();
  };

  /** A clean sheet with no undo history: the last drawing is not coming back. */
  const freshPaper = () => {
    strokes.current = [];
    setInkCount(0);
    setCanUndo(false);
    redraw();
  };

  const clear = () => {
    if (!inkCount) return;
    strokes.current.push({ kind: "clear" });
    setInkCount(0);
    setCanUndo(true);
    redraw();
  };

  const done = async () => {
    if (!canvas.current) return;
    life.start(await canvasToBlob(canvas.current));
  };

  const shelfFullNow = (life.phase === "idle" && shelf.full) || life.phase === "full";
  const drawing = life.phase === "idle" && !shelf.full;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <TopBar
        title={
          shelfFullNow
            ? "Make room"
            : drawing
              ? "Draw your friend"
              : life.phase === "cutting"
                ? "Snip snip…"
                : life.phase === "flagged"
                  ? "Let's try another"
                  : "Ta-da!"
        }
      />

      <div className={`${drawing ? "flex" : "hidden"} flex-1 flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:flex-row`}>
        <div ref={area} className="relative flex min-h-[48vh] flex-1 items-center justify-center lg:min-h-[70vh]">
          {size && (
            <div className="crayon-edge rounded-[22px] bg-white shadow-soft" style={{ width: display.w, height: display.h }}>
              <canvas
                ref={canvas}
                width={size.w}
                height={size.h}
                style={{ cursor: eraser ? "cell" : "crosshair" }}
                className="block h-full w-full touch-none rounded-[22px]"
                aria-label="Drawing paper. Draw with your finger or the mouse."
                role="img"
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              />
            </div>
          )}
        </div>

        <aside aria-label="Crayons and tools" className="flex flex-col gap-4 lg:w-72">
          <fieldset>
            <legend className="sr-only">Crayon colour</legend>
            <div className="scrollbar-paper flex gap-2.5 overflow-x-auto px-1 py-2 lg:grid lg:grid-cols-5 lg:overflow-visible">
              {CRAYONS.map((c) => {
                const active = !eraser && color === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={c.name}
                    aria-pressed={active}
                    onClick={() => {
                      setColor(c.value);
                      setEraser(false);
                    }}
                    className={`crayon-edge press h-14 w-14 shrink-0 rounded-full transition-transform ${active ? "-translate-y-1 ring-4 ring-ink/80 ring-offset-2 ring-offset-paper" : ""}`}
                    style={{ background: c.value } as CSSProperties}
                  />
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2.5">
            <fieldset className="flex gap-2">
              <legend className="sr-only">Crayon size</legend>
              {SIZES.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  aria-label={s.name}
                  aria-pressed={width === s.px}
                  onClick={() => setWidth(s.px)}
                  className={`crayon-edge press grid h-14 w-14 place-items-center rounded-[18px] ${width === s.px ? "bg-sun" : "bg-white"}`}
                >
                  <span className="block rounded-full bg-ink" style={{ width: s.dot, height: s.dot }} />
                </button>
              ))}
            </fieldset>
            <button
              type="button"
              aria-pressed={!eraser}
              onClick={() => setEraser(false)}
              className={`crayon-edge press flex h-14 items-center gap-2 rounded-[18px] px-3 font-display font-bold ${!eraser ? "bg-sun" : "bg-white"}`}
            >
              <PaintBrush size={26} weight="fill" aria-hidden="true" />
              <span>Crayon</span>
            </button>
            <button
              type="button"
              aria-pressed={eraser}
              onClick={() => setEraser(true)}
              className={`crayon-edge press flex h-14 items-center gap-2 rounded-[18px] px-3 font-display font-bold ${eraser ? "bg-pink" : "bg-white"}`}
            >
              <Eraser size={26} weight="fill" aria-hidden="true" />
              <span>Eraser</span>
            </button>
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="crayon-edge press flex h-14 items-center gap-2 rounded-[18px] bg-white px-3 font-display font-bold"
            >
              <ArrowCounterClockwise size={26} weight="bold" aria-hidden="true" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!inkCount}
              className="crayon-edge press flex h-14 items-center gap-2 rounded-[18px] bg-white px-3 font-display font-bold"
            >
              <Trash size={26} weight="bold" aria-hidden="true" />
              <span>Clear</span>
            </button>
          </div>

          <Button
            tone="grass"
            size="lg"
            onClick={done}
            disabled={!inkCount}
            icon={<Sparkle size={30} weight="fill" aria-hidden="true" />}
            className="lg:mt-auto"
          >
            Bring it to life!
          </Button>
        </aside>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-6 sm:px-6">
        {shelfFullNow && shelf.friends && (
          <ShelfFull
            friends={shelf.friends}
            onChange={() => {
              shelf.refresh();
              if (life.phase === "full") life.backToPreview();
            }}
          />
        )}
        {life.phase === "cutting" && <CuttingView photo={life.photo} working={life.working} />}
        {life.phase === "flagged" && life.result && (
          <NotThisOne
            png={life.result.cut.png}
            actions={[
              {
                label: "Draw a new one",
                icon: "draw",
                onClick: () => {
                  freshPaper();
                  life.reset();
                },
              },
              { label: "Take another photo", icon: "photo", href: "/snap" },
            ]}
          />
        )}
        {(life.phase === "preview" || life.phase === "saving") && life.result && (
          <CutoutPreview
            cut={life.result.cut}
            saving={life.phase === "saving"}
            retakeLabel="Keep drawing"
            onRetake={life.reset}
            onAccept={life.accept}
            onFixed={life.fixEdges}
            seenAs={life.result.seen?.label}
          />
        )}
        {life.phase === "error" && <CutError onRetry={life.reset} />}
      </div>
    </main>
  );
}

function mid(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function countInk(all: Stroke[]) {
  const lastClear = all.map((s) => s.kind).lastIndexOf("clear");
  return all.slice(lastClear + 1).filter((s) => s.kind === "line" && !s.eraser).length;
}
