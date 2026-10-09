"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import { loadCutout } from "@/lib/alive/cutout";
import { MotionController, type Pose } from "@/lib/alive/motion";
import { createRenderer, type Placement, type Renderer } from "@/lib/alive/renderer";
import { analyzeMask, buildMesh, hitMask, type RigInfo } from "@/lib/alive/rig";
import type { AliveMotion, Cutout } from "@/lib/alive/types";
import styles from "./alive.module.css";

export interface AliveCharacterHandle {
  /** Trigger the happy tap reaction from code (e.g. when the child answers). */
  poke(): void;
}

export interface AliveStats {
  fps: number;
  renderer: "webgl2" | "canvas2d";
  triangles: number;
}

export interface AliveCharacterProps {
  /** A cut-out, or a stored transparent PNG data URL (Character.cutout). */
  cutout: Cutout | string;
  motion?: AliveMotion;
  /** While true the character pulses as if speaking. */
  talking?: boolean;
  /**
   * Speaking loudness 0..1. Pass a function to read it every frame (e.g. from
   * an AnalyserNode) without re-rendering. Without it, a speech-like rhythm
   * is generated while `talking` is true.
   */
  level?: number | (() => number);
  onTap?: () => void;
  /** Where the feet rest, as a fraction of the height from the top. */
  groundY?: number;
  /** Character height as a fraction of the container height. */
  size?: number;
  shadow?: boolean;
  /** Called about once a second with the measured frame rate. */
  onStats?: (s: AliveStats) => void;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<AliveCharacterHandle>;
}

interface Loaded {
  cutout: Cutout;
  rig: RigInfo;
  image: HTMLImageElement;
  triangles: number;
}

interface Burst {
  id: number;
  x: number;
  y: number;
}

const HEARTS = ["💖", "⭐", "💛", "✨", "💜"];

export function AliveCharacter({
  cutout,
  motion = "idle",
  talking = false,
  level,
  onTap,
  groundY = 0.9,
  size = 0.6,
  shadow = true,
  onStats,
  className,
  style,
  ref,
}: AliveCharacterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zzzRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [ctrl] = useState(() => new MotionController());
  const loadedRef = useRef<Loaded | null>(null);
  const frameRef = useRef<{ pose: Pose; place: Placement } | null>(null);
  const props = useRef({ motion, talking, level, onTap, groundY, size, shadow, onStats });
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    props.current = { motion, talking, level, onTap, groundY, size, shadow, onStats };
  });

  const poke = useCallback(() => {
    ctrl.poke(performance.now() / 1000);
  }, [ctrl]);
  useImperativeHandle(ref, () => ({ poke }), [poke]);

  // Load the character: decode the PNG, read its mask, build the mesh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = typeof cutout === "string" ? await loadCutout(cutout) : cutout;
      const image = new Image();
      image.src = c.png;
      await image.decode();
      if (cancelled) return;
      const rig = analyzeMask(c.mask);
      const mesh = buildMesh(c.mask, rig);
      loadedRef.current = { cutout: c, rig, image, triangles: mesh.indices.length / 3 };
      rendererRef.current?.setCharacter(image, mesh, rig);
      setReady(true);
    })().catch((err) => console.error("[alive] could not load character", err));
    return () => {
      cancelled = true;
    };
  }, [cutout]);

  // Renderer and frame loop live for the component's lifetime.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;
    const loaded = loadedRef.current;
    if (loaded) {
      renderer.setCharacter(loaded.image, buildMesh(loaded.cutout.mask, loaded.rig), loaded.rig);
    }

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = root.getBoundingClientRect();
      renderer.resize(Math.max(1, Math.round(r.width * dpr)), Math.max(1, Math.round(r.height * dpr)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);

    let raf = 0;
    let last = performance.now() / 1000;
    let frames = 0;
    let fpsStart = last;

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const now = ts / 1000;
      const dt = now - last;
      last = now;
      const p = props.current;
      const L = loadedRef.current;
      const W = canvas.width,
        H = canvas.height;

      ctrl.setMotion(p.motion, now);
      const lvl = typeof p.level === "function" ? p.level() : p.level;
      const pose = ctrl.update(now, dt, p.talking || lvl !== undefined, lvl ?? null);

      if (L) {
        const rig = L.rig;
        const widthUnits = Math.max(0.3, rig.right - rig.left);
        const ground = H * p.groundY;
        // Leave head-room for the highest jump so the character never leaves the frame.
        const scale = Math.min(H * p.size, ground / 1.75, (W * 0.85) / widthUnits);
        const margin = 0.04 * W;
        const half = Math.max(-rig.left, rig.right);
        ctrl.bounds = Math.max(0, (W / 2 - margin) / scale - half);
        const place: Placement = { centerX: W / 2, groundY: ground, scale };
        renderer.draw(pose, place, p.shadow);
        frameRef.current = { pose, place };

        const z = zzzRef.current;
        if (z) {
          const zx = (place.centerX + (pose.x + rig.right * 0.6) * scale) / dpr;
          const zy = (ground - (pose.lift + 1.0) * scale) / dpr;
          z.style.transform = `translate(${zx}px, ${zy}px)`;
          z.style.fontSize = `${Math.max(14, (scale / dpr) * 0.16)}px`;
        }
      }

      frames++;
      if (now - fpsStart >= 1) {
        p.onStats?.({
          fps: Math.round(frames / (now - fpsStart)),
          renderer: renderer.kind,
          triangles: L?.triangles ?? 0,
        });
        frames = 0;
        fpsStart = now;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [ctrl]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const L = loadedRef.current;
    const f = frameRef.current;
    const canvas = canvasRef.current;
    if (!L || !f || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const cx = (e.clientX - rect.left) * sx;
    const cy = (e.clientY - rect.top) * sx;
    if (!hitsCharacter(L, f.pose, f.place, cx, cy)) return;
    poke();
    const id = performance.now();
    setBursts((b) => [...b, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1000);
    props.current.onTap?.();
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${className ?? ""}`}
      style={style}
      onPointerDown={onPointerDown}
      data-ready={ready || undefined}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden />
      {motion === "sleep" && (
        <div ref={zzzRef} className={styles.zzz} aria-hidden>
          <span className={styles.z}>z</span>
          <span className={styles.z}>z</span>
          <span className={styles.z}>Z</span>
        </div>
      )}
      {bursts.map((b) => (
        <div key={b.id} className={styles.burst} style={{ left: b.x, top: b.y }} aria-hidden>
          {HEARTS.map((h, i) => {
            const a = (i / HEARTS.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <span
                key={i}
                className={styles.heart}
                style={
                  {
                    "--dx": `${Math.cos(a) * 70}px`,
                    "--dy": `${Math.sin(a) * 70 - 40}px`,
                    "--rot": `${(i - 2) * 15}deg`,
                  } as CSSProperties
                }
              >
                {h}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Undo the main pose transforms to test whether a tap landed on the drawing. */
function hitsCharacter(L: Loaded, pose: Pose, place: Placement, cx: number, cy: number): boolean {
  const rootX = place.centerX + pose.x * place.scale;
  const rootY = place.groundY - pose.lift * place.scale;
  let x = (cx - rootX) / place.scale;
  let y = (rootY - cy) / place.scale;
  const c = Math.cos(-pose.lean),
    s = Math.sin(-pose.lean);
  [x, y] = [c * x - s * y, s * x + c * y];
  y /= 1 + pose.squash;
  x /= 1 - pose.squash * 0.55;
  const h = Math.max(0, Math.min(1.6, y));
  x -= pose.bend * h * h;
  const tx = L.rig.anchorX + x * L.rig.unit;
  const ty = L.rig.anchorY - y * L.rig.unit;
  return hitMask(L.cutout.mask, tx, ty, Math.max(4, L.rig.unit * 0.04));
}
