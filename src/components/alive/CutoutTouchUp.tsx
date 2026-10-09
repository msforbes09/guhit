"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyTouchUp } from "@/lib/alive/cutout";
import type { Cutout } from "@/lib/alive/types";

export interface CutoutTouchUpProps {
  /** A cut-out made with `{ editable: true }`. */
  cutout: Cutout;
  onDone: (fixed: Cutout) => void;
  onCancel?: () => void;
  className?: string;
}

type Mode = "keep" | "remove";

const MAX_UNDO = 20;

/**
 * Brush to fix a cut-out: paint "Keep" over parts the cut-out missed and
 * "Remove" over bits of paper it took. Removed areas show faded over a
 * checkerboard so it is clear what will disappear.
 */
export function CutoutTouchUp({ cutout, onDone, onCancel, className }: CutoutTouchUpProps) {
  const edit = cutout.edit;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<Uint8Array | null>(null);
  const undoRef = useRef<Uint8Array[]>([]);
  const lastRef = useRef<[number, number] | null>(null);
  const frameRef = useRef(0);
  const [mode, setMode] = useState<Mode>("keep");
  const [brush, setBrush] = useState(0.035);
  const [undoCount, setUndoCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const render = useCallback(() => {
    frameRef.current = 0;
    const c = canvasRef.current;
    const mask = maskRef.current;
    if (!c || !mask || !edit) return;
    const ctx = c.getContext("2d")!;
    const out = ctx.createImageData(edit.width, edit.height);
    const src = edit.image;
    const d = out.data;
    for (let y = 0; y < edit.height; y++) {
      for (let x = 0; x < edit.width; x++) {
        const i = y * edit.width + x;
        const j = i * 4;
        if (mask[i]) {
          d[j] = src[j];
          d[j + 1] = src[j + 1];
          d[j + 2] = src[j + 2];
        } else {
          const checker = ((x >> 4) + (y >> 4)) & 1 ? 236 : 250;
          d[j] = src[j] * 0.25 + checker * 0.75;
          d[j + 1] = src[j + 1] * 0.25 + checker * 0.75;
          d[j + 2] = src[j + 2] * 0.25 + checker * 0.75;
        }
        d[j + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }, [edit]);

  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(render);
  }, [render]);

  useEffect(() => {
    if (!edit) return;
    maskRef.current = edit.mask.slice();
    undoRef.current = [];
    render();
    return () => cancelAnimationFrame(frameRef.current);
  }, [edit, render]);

  if (!edit) {
    return <p className={className}>This cut-out cannot be touched up (cut it out with editable: true).</p>;
  }

  const stamp = (cx: number, cy: number) => {
    const mask = maskRef.current!;
    const r = Math.max(2, brush * Math.max(edit.width, edit.height));
    const v = mode === "keep" ? 1 : 0;
    const x0 = Math.max(0, Math.floor(cx - r)),
      x1 = Math.min(edit.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)),
      y1 = Math.min(edit.height - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) mask[y * edit.width + x] = v;
      }
    }
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return [((e.clientX - rect.left) * c.width) / rect.width, ((e.clientY - rect.top) * c.height) / rect.height];
  };

  const strokeTo = (p: [number, number]) => {
    const last = lastRef.current ?? p;
    const r = Math.max(2, brush * Math.max(edit.width, edit.height));
    const dist = Math.hypot(p[0] - last[0], p[1] - last[1]);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.4)));
    for (let k = 1; k <= steps; k++) {
      stamp(last[0] + ((p[0] - last[0]) * k) / steps, last[1] + ((p[1] - last[1]) * k) / steps);
    }
    lastRef.current = p;
    schedule();
  };

  const btn = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-900 hover:bg-violet-200"}`;

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        width={edit.width}
        height={edit.height}
        // Sized by its own aspect ratio (no letterboxing) so pointer maths stays exact.
        className="mx-auto block h-auto max-h-[70vh] w-auto max-w-full touch-none rounded-lg border border-zinc-200"
        style={{ cursor: "crosshair" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          undoRef.current.push(maskRef.current!.slice());
          if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
          setUndoCount(undoRef.current.length);
          lastRef.current = null;
          strokeTo(pos(e));
        }}
        onPointerMove={(e) => {
          if (lastRef.current) strokeTo(pos(e));
        }}
        onPointerUp={() => (lastRef.current = null)}
        onPointerCancel={() => (lastRef.current = null)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn(mode === "keep")} onClick={() => setMode("keep")}>
          ✋ Keep
        </button>
        <button className={btn(mode === "remove")} onClick={() => setMode("remove")}>
          🧽 Remove
        </button>
        <label className="flex items-center gap-2 text-sm">
          Brush
          <input
            type="range"
            min={0.01}
            max={0.1}
            step={0.005}
            value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
          />
        </label>
        <button
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm disabled:opacity-40"
          disabled={!undoCount}
          onClick={() => {
            const prev = undoRef.current.pop();
            if (prev) maskRef.current = prev;
            setUndoCount(undoRef.current.length);
            schedule();
          }}
        >
          ↩ Undo
        </button>
        {onCancel && (
          <button className="rounded-full border border-zinc-300 px-4 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              onDone(await applyTouchUp(edit, maskRef.current!, cutout.meta));
            } finally {
              setSaving(false);
            }
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
