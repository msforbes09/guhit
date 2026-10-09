"use client";

import { useEffect, useRef, useState } from "react";
import { BLOCK, BRAND, CURSIVE, MARK } from "./brand";

/** Timeline, in ms. */
const T = {
  enter: [0, 250],
  write: [250, 1450],
  hop: [1450, 1750],
  dot: [1750, 1980],
  tBar: [1790, 1940],
  morph: [1960, 2250],
  mark: [1950, 2250],
  loop: [1980, 2330],
  face: [2250, 2400],
  eyes: [2300, 2420],
  blink: [2480, 2600],
  smile: [2350, 2500],
  rays: [2250, 2450],
  tagline: [2250, 2600],
  footer: [2400, 2600],
} as const;
const BUILT = 2650;
const HOLD = 500;
const FADE = 350;
const REDUCED_HOLD = 1000;

type Ease = (p: number) => number;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = {
  out: (p: number) => 1 - (1 - p) ** 3,
  inOut: (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  sine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  back: (p: number) => 1 + 2.9 * (p - 1) ** 3 + 1.9 * (p - 1) ** 2,
  linear: (p: number) => p,
};
const along = (t: number, [a, b]: readonly [number, number], e: Ease = ease.out) => e(clamp((t - a) / (b - a)));

/** The word box shares the cursive art's shape; the printed art is fitted inside it. */
const WORD_ASPECT = CURSIVE.viewBox.w / CURSIVE.viewBox.h;
const toPrinted = (() => {
  const su = 1 / CURSIVE.viewBox.w;
  const sb = Math.min(1 / BLOCK.viewBox.w, 1 / WORD_ASPECT / BLOCK.viewBox.h);
  const offX = (1 - BLOCK.viewBox.w * sb) / 2;
  const offY = (1 / WORD_ASPECT - BLOCK.viewBox.h * sb) / 2;
  return (x: number, y: number) => ({
    x: ((x - CURSIVE.viewBox.x) * su - offX) / sb,
    y: ((y - CURSIVE.viewBox.y) * su - offY) / sb,
  });
})();

const scaleAbout = (el: Element, cx: number, cy: number, sx: number, sy = sx) =>
  el.setAttribute("transform", `translate(${cx} ${cy}) scale(${Math.max(sx, 0.001)} ${Math.max(sy, 0.001)}) translate(${-cx} ${-cy})`);

function Crayon() {
  const c = BLOCK.crayon;
  return (
    <>
      <path d={c.body} fill={BRAND.orange} />
      <path d={c.tip} fill={BRAND.yellow} stroke={BRAND.yellow} strokeWidth={2} strokeLinejoin="round" />
      <path d={c.lead} fill={BRAND.ink} />
      <rect {...c.band} fill={BRAND.blue} />
    </>
  );
}

/**
 * Cold-load splash: a crayon writes "guhit", hops into place as the i of the
 * printed logo, the word settles into print, the creature mark wakes up,
 * then everything fades to the screen underneath. Tap to skip.
 *
 * The crayon lives in its own layer drawn with the printed logo's geometry
 * and colours, so it lands exactly on the printed i and nothing changes
 * colour or jumps when the cursive word turns into print.
 */
export function Splash({ version }: { version: string }) {
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const cursive = useRef<HTMLDivElement>(null);
  const printed = useRef<HTMLDivElement>(null);
  const stroke = useRef<SVGPathElement>(null);
  const tBar = useRef<SVGPathElement>(null);
  const pen = useRef<SVGGElement>(null);
  const crayon = useRef<SVGGElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const loop = useRef<SVGPathElement>(null);
  const face = useRef<SVGCircleElement>(null);
  const eyes = useRef<(SVGCircleElement | null)[]>([]);
  const smile = useRef<SVGPathElement>(null);
  const rays = useRef<(SVGLineElement | null)[]>([]);
  const tagline = useRef<HTMLParagraphElement>(null);
  const footer = useRef<HTMLParagraphElement>(null);
  const skipAt = useRef<number | null>(null);
  const clock = useRef(0);

  useEffect(() => {
    const path = stroke.current;
    if (!path) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const length = path.getTotalLength();
    const end = path.getPointAtLength(length);
    const tip = BLOCK.crayon.point;
    const landFrom = toPrinted(end.x, end.y);

    const render = (t: number) => {
      const still = reduced || skipAt.current !== null;
      const c = still ? BUILT : t;

      // 1. The crayon comes in and writes the cursive word.
      const enter = along(c, T.enter);
      const written = along(c, T.write, (p) => 0.4 * p + 0.6 * ease.sine(p));
      path.style.strokeDashoffset = `${100 * (1 - written)}`;
      path.style.visibility = written > 0 ? "visible" : "hidden";

      const hop = along(c, T.hop, ease.inOut);
      let x: number, y: number, rot: number, s: number;
      if (hop <= 0) {
        const at = path.getPointAtLength(written * length);
        const p = toPrinted(at.x, at.y);
        const wobble = c > T.write[0] && c < T.write[1] ? Math.sin(c * 0.045) : 0;
        x = p.x - (1 - enter) * 80 + wobble * 0.6;
        y = p.y - (1 - enter) * 110 + Math.cos(c * 0.06) * 0.4;
        rot = -140 + wobble * 3 - (1 - enter) * 20;
        s = 0.42 + 0.04 * enter;
      } else {
        // Hop back and land upright as the printed i.
        x = landFrom.x + (tip.x - landFrom.x) * hop;
        y = landFrom.y + (tip.y - landFrom.y) * hop - 280 * hop * (1 - hop);
        rot = -140 + 140 * hop;
        s = 0.46 + 0.54 * ease.out(hop);
      }
      const landed = c >= T.hop[1];
      if (pen.current) {
        pen.current.setAttribute("transform", `translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(${-tip.x} ${-tip.y})`);
        pen.current.style.opacity = landed ? "0" : `${Math.min(1, enter * 3)}`;
      }
      if (crayon.current) crayon.current.style.opacity = landed ? "1" : "0";

      const dp = along(c, T.dot, ease.back);
      if (dot.current) {
        scaleAbout(dot.current, BLOCK.dot.cx, BLOCK.dot.cy, dp);
        dot.current.style.opacity = dp > 0 ? "1" : "0";
      }
      const tp = along(c, T.tBar);
      if (tBar.current) {
        tBar.current.style.strokeDashoffset = `${100 * (1 - tp)}`;
        tBar.current.style.visibility = tp > 0 ? "visible" : "hidden";
      }

      // 2. The cursive word settles into the printed one.
      const m = along(c, T.morph, ease.inOut);
      if (cursive.current) {
        cursive.current.style.opacity = `${1 - m}`;
        cursive.current.style.transform = `scale(${1 + 0.05 * m})`;
        cursive.current.style.filter = m > 0 ? `blur(${m * 6}px)` : "none";
      }
      if (printed.current) {
        printed.current.style.opacity = `${m}`;
        printed.current.style.transform = `scale(${0.95 + 0.05 * m})`;
        printed.current.style.filter = m < 1 ? `blur(${(1 - m) * 6}px)` : "none";
      }

      // 3. The creature mark wakes up above it.
      const mo = along(c, [T.mark[0], T.mark[0] + 150]);
      const mp = along(c, T.mark, ease.back);
      if (mark.current) {
        mark.current.style.opacity = `${mo}`;
        mark.current.style.transform = `translateY(${(1 - mo) * 10}px) scale(${0.8 + 0.2 * mp})`;
      }
      const lp = along(c, T.loop);
      if (loop.current) {
        loop.current.style.strokeDashoffset = `${100 * (1 - lp)}`;
        loop.current.style.visibility = lp > 0 ? "visible" : "hidden";
      }
      const fp = along(c, T.face, ease.back);
      if (face.current) {
        scaleAbout(face.current, MARK.face.cx, MARK.face.cy, fp);
        face.current.style.opacity = `${clamp(fp * 2)}`;
      }
      const ep = along(c, T.eyes, ease.back);
      const blink = c > T.blink[0] ? 1 - 0.9 * (1 - Math.abs((along(c, T.blink, ease.linear) - 0.5) * 2)) : 1;
      eyes.current.forEach((eye, i) => {
        if (!eye) return;
        scaleAbout(eye, MARK.eyes[i].cx, MARK.eyes[i].cy, ep, ep * blink);
        eye.style.opacity = ep > 0 ? "1" : "0";
      });
      const sp = along(c, T.smile);
      if (smile.current) {
        smile.current.style.strokeDashoffset = `${1 - sp}`;
        smile.current.style.visibility = sp > 0 ? "visible" : "hidden";
      }
      rays.current.forEach((ray, i) => {
        if (!ray) return;
        const rp = along(c, [T.rays[0] + i * 30, T.rays[1] + i * 30], ease.back);
        scaleAbout(ray, MARK.face.cx, MARK.face.cy, 0.25 + 0.75 * rp);
        ray.style.opacity = `${clamp(rp * 3)}`;
      });

      // 4. Words underneath.
      const tg = along(c, T.tagline);
      if (tagline.current) {
        tagline.current.style.opacity = `${tg}`;
        tagline.current.style.transform = `translateY(${(1 - tg) * 16}px)`;
      }
      if (footer.current) footer.current.style.opacity = `${along(c, T.footer)}`;

      // 5. Fade to the screen underneath.
      const fadeFrom = skipAt.current ?? (reduced ? REDUCED_HOLD : BUILT + HOLD);
      const f = clamp((t - fadeFrom) / FADE);
      if (root.current) root.current.style.opacity = `${1 - ease.out(f)}`;
      return t < fadeFrom + FADE;
    };

    // "?splash=1200" freezes on that moment, for reviewing single frames.
    const freeze = new URLSearchParams(window.location.search).get("splash");
    if (freeze !== null && Number.isFinite(Number(freeze))) {
      render(Math.min(Number(freeze), BUILT));
      if (root.current) root.current.style.animation = "none";
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      clock.current = now - t0;
      if (render(clock.current)) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    // Animation frames stop in a hidden tab or a choked main thread; a timer
    // still guarantees the app underneath is reachable.
    const failsafe = setTimeout(() => setDone(true), (reduced ? REDUCED_HOLD : BUILT + HOLD) + FADE + 800);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failsafe);
    };
  }, []);

  if (done) return null;

  const skip = () => {
    if (skipAt.current !== null) return;
    skipAt.current = clock.current;
    setTimeout(() => setDone(true), FADE + 100);
  };

  return (
    <div
      ref={root}
      onClick={skip}
      aria-hidden="true"
      className="splash fixed inset-0 z-[100] flex justify-center bg-[#fff8ee]"
    >
      <div className="relative flex h-full w-full max-w-[420px] flex-col items-center justify-center px-6 pb-14">
        <div ref={mark} className="aspect-square w-[min(46vw,170px)]" style={{ opacity: 0 }}>
          <svg viewBox="0 0 512 512" className="block h-full w-full overflow-visible">
            <defs>
              <filter id="splash-crayon" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" />
                <feDisplacementMap in="SourceGraphic" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
            <g filter="url(#splash-crayon)">
              <circle ref={face} {...MARK.face} fill={BRAND.cream} style={{ opacity: 0 }} />
              <g fill="none" strokeWidth={25} strokeLinecap="round">
                {MARK.rays.map(({ color, ...line }, i) => (
                  <line
                    key={i}
                    ref={(el) => {
                      rays.current[i] = el;
                    }}
                    {...line}
                    stroke={color}
                    style={{ opacity: 0 }}
                  />
                ))}
              </g>
              <path
                ref={loop}
                d={MARK.loop}
                pathLength={100}
                fill="none"
                stroke={BRAND.orange}
                strokeWidth={27}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ strokeDasharray: "100 100", strokeDashoffset: 100, visibility: "hidden" }}
              />
              {MARK.eyes.map((eye, i) => (
                <circle
                  key={i}
                  ref={(el) => {
                    eyes.current[i] = el;
                  }}
                  {...eye}
                  fill={BRAND.ink}
                  style={{ opacity: 0 }}
                />
              ))}
              <path
                ref={smile}
                d={MARK.smile}
                pathLength={1}
                fill="none"
                stroke={BRAND.ink}
                strokeWidth={9}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ strokeDasharray: "1 1", strokeDashoffset: 1, visibility: "hidden" }}
              />
            </g>
          </svg>
        </div>

        <div className="relative -mt-1.5 w-full" style={{ aspectRatio: `${WORD_ASPECT}` }}>
          <div ref={cursive} className="absolute inset-0 will-change-[transform,opacity,filter]">
            <svg
              viewBox={`${CURSIVE.viewBox.x} ${CURSIVE.viewBox.y} ${CURSIVE.viewBox.w} ${CURSIVE.viewBox.h}`}
              className="block h-full w-full overflow-visible"
            >
              <path
                ref={stroke}
                d={CURSIVE.stroke}
                pathLength={100}
                fill="none"
                stroke={BRAND.ink}
                strokeWidth={17}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ strokeDasharray: "100 100", strokeDashoffset: 100, visibility: "hidden" }}
              />
              <path
                ref={tBar}
                d={CURSIVE.tBar}
                pathLength={100}
                fill="none"
                stroke={BRAND.ink}
                strokeWidth={17}
                strokeLinecap="round"
                style={{ strokeDasharray: "100 100", strokeDashoffset: 100, visibility: "hidden" }}
              />
            </svg>
          </div>
          <div ref={printed} className="absolute inset-0 will-change-[transform,opacity,filter]" style={{ opacity: 0 }}>
            <svg
              viewBox={`${BLOCK.viewBox.x} ${BLOCK.viewBox.y} ${BLOCK.viewBox.w} ${BLOCK.viewBox.h}`}
              className="block h-full w-full overflow-visible"
            >
              <g fill="none" stroke={BRAND.ink} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round">
                <circle {...BLOCK.gBowl} />
                {BLOCK.letters.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
            </svg>
          </div>
          {/* The crayon and its dot never fade with the words: they are the printed i throughout. */}
          <svg
            viewBox={`${BLOCK.viewBox.x} ${BLOCK.viewBox.y} ${BLOCK.viewBox.w} ${BLOCK.viewBox.h}`}
            className="absolute inset-0 block h-full w-full overflow-visible"
          >
            <g ref={crayon} style={{ opacity: 0 }}>
              <Crayon />
            </g>
            <circle ref={dot} {...BLOCK.dot} fill={BRAND.yellow} style={{ opacity: 0 }} />
            <g ref={pen} style={{ opacity: 0 }}>
              <Crayon />
            </g>
          </svg>
        </div>

        <p
          ref={tagline}
          className="mt-3.5 text-center font-display text-[clamp(17px,5vw,21px)] font-bold text-[#1e1b2e]"
          style={{ opacity: 0 }}
        >
          Every drawing has a friend inside.
        </p>
        <p ref={footer} className="absolute inset-x-0 bottom-[max(1.4rem,env(safe-area-inset-bottom))] text-center text-xs text-[#1e1b2e]/60" style={{ opacity: 0 }}>
          v{version} · © 2026 Kaya Randomized
        </p>
      </div>
      {/* If the script never runs, the splash still gets out of the way. */}
      <style href="splash-safety" precedence="default">
        {`.splash{animation:splash-away .35s ease-in 6s forwards}@keyframes splash-away{to{opacity:0;visibility:hidden}}`}
      </style>
    </div>
  );
}
