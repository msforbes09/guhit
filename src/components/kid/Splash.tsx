"use client";

import { useEffect, useRef, useState } from "react";
import { BLOCK, BRAND, MARK } from "./brand";

/** Timeline, in ms. */
const T = {
  enter: [0, 180],
  write: [140, 1240],
  hop: [1240, 1480],
  squash: [1400, 1520],
  land: [1480, 1620],
  dot: [1460, 1640],
  mark: [1480, 1780],
  loop: [1500, 1800],
  face: [1720, 1840],
  eyes: [1760, 1870],
  blink: [1900, 2000],
  smile: [1800, 1920],
  rays: [1720, 1880],
  bounce: [1960, 2160],
  wave: [2060, 2380],
  crouch: [2380, 2440],
  leave: [2440, 2740],
  tagline: [1800, 2140],
  footer: [1950, 2150],
} as const;
const BUILT = 2760;
const HOLD = 500;
const FADE = 350;
const REDUCED_HOLD = 1000;
/** The pen lifts between strokes, in ms: within a letter, and on to the next letter. */
const LIFT = { stroke: 30, letter: 60 };
/** Added to every stroke's length when sharing out the writing time, so the i's dot still takes a beat. */
const STROKE_PAD = 40;

type Ease = (p: number) => number;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = {
  out: (p: number) => 1 - (1 - p) ** 3,
  inOut: (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  sine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  back: (p: number) => 1 + 2.9 * (p - 1) ** 3 + 1.9 * (p - 1) ** 2,
  linear: (p: number) => p,
};
/** A hand's speed along one stroke: quick through the middle, easing at both ends. */
const hand: Ease = (p) => 0.4 * p + 0.6 * ease.sine(p);
const along = (t: number, [a, b]: readonly [number, number], e: Ease = ease.out) => e(clamp((t - a) / (b - a)));

/** The word box is a little taller than the printed art, which sits centred in it. */
const WORD_ASPECT = 58 / 30;

const I_X = BLOCK.crayon.point.x;
/**
 * The printed word in writing order: one entry per letter, one path per pen
 * stroke. The i is plain ink here, a stand-in the crayon squashes out when it
 * lands in its place.
 */
const LETTERS = (() => {
  const [g, u, h, t] = BLOCK.letters.map((d) => d.split(/(?=M)/).map((s) => s.trim()));
  const { cx, cy, r } = BLOCK.gBowl;
  return [
    // The g's bowl starts on its right and goes up and round, the way a hand writes it.
    [`M${cx + r},${cy} A${r},${r} 0 0 0 ${cx - r},${cy} A${r},${r} 0 0 0 ${cx + r},${cy}`, ...g],
    u,
    h,
    [`M${I_X},62 V132`, `M${I_X},34 V34.5`],
    t,
  ];
})();
const INK_I = 3;
/**
 * The writing crayon is the logo's crayon at full size, held at a slant with
 * its point on the stroke. Its tail leans up and right, over letters not yet
 * written, and the hold turns more upright towards the end of the word so the
 * tail stays on a phone screen.
 */
const holdAngle = (x: number) => -135 - 28 * clamp((x - 230) / 170);
const STROKES = LETTERS.flatMap((paths, letter) => paths.map((d) => ({ d, letter })));
/** The crayon's flat end, which it squashes onto as it lands. */
const CRAYON_FOOT = { x: I_X, y: 134 };

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

/** The maker's mark (Kaya Randomized mark A), inline so it is there offline, with a crayon's rough edge. */
function KayaMark() {
  return (
    <svg viewBox="0 0 1024 1024" role="img" aria-label="Kaya Randomized" className="-m-[7px] block h-10 w-10 shrink-0">
      <defs>
        <filter id="kaya-crayon" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="28" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g fill="none" strokeWidth={116} strokeLinecap="round" filter="url(#kaya-crayon)">
        <path d="M340 260V764" stroke="#8fa8ff" />
        <path d="M372 540L690 262" stroke="#8fa8ff" />
        <path d="M540 500L712 764" stroke="#ff9f7a" />
      </g>
    </svg>
  );
}

/**
 * Cold-load splash: a crayon writes the printed "guhit" letter by letter,
 * hops into the i's place and stays there as the logo's i, then the creature
 * scribbles itself in, wakes up, bounces, waves and hops away, leaving the
 * wordmark and tagline before everything fades to the screen underneath.
 * Tap to skip.
 *
 * The writing crayon is drawn with the printed logo's geometry and colours,
 * so it lands exactly on the printed i and the last frame is the logo.
 */
export function Splash({ version }: { version: string }) {
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const strokes = useRef<(SVGPathElement | null)[]>([]);
  const inkI = useRef<SVGGElement>(null);
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
  const footer = useRef<HTMLDivElement>(null);
  const skipAt = useRef<number | null>(null);
  const clock = useRef(0);

  useEffect(() => {
    const paths = strokes.current.filter((p): p is SVGPathElement => p !== null);
    if (paths.length < STROKES.length) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tip = BLOCK.crayon.point;

    // Share the writing time out by stroke length, with the pen lifted between strokes.
    const lengths = paths.map((p) => p.getTotalLength());
    const lifts = STROKES.map((s, k) => (k === 0 ? 0 : s.letter === STROKES[k - 1].letter ? LIFT.stroke : LIFT.letter));
    const inkTime = T.write[1] - T.write[0] - lifts.reduce((a, b) => a + b, 0);
    const weight = lengths.reduce((a, b) => a + b + STROKE_PAD, 0);
    let at = T.write[0];
    const plan = paths.map((path, k) => {
      const start = at + lifts[k];
      at = start + (inkTime * (lengths[k] + STROKE_PAD)) / weight;
      return { path, length: lengths[k], start, end: at, from: path.getPointAtLength(0), to: path.getPointAtLength(lengths[k]) };
    });
    const landFrom = plan[plan.length - 1].to;

    /** Where the crayon's point is while it writes, and how far it is lifted off the paper (0 to 1). */
    const penAt = (c: number) => {
      const k = plan.findIndex((s) => c < s.end);
      if (k === -1) return { x: landFrom.x, y: landFrom.y, lift: 0 };
      const s = plan[k];
      if (c >= s.start) {
        const p = s.path.getPointAtLength(s.length * along(c, [s.start, s.end], hand));
        return { x: p.x, y: p.y, lift: 0 };
      }
      if (k === 0) return { x: s.from.x, y: s.from.y, lift: 0 };
      const prev = plan[k - 1];
      const q = along(c, [prev.end, s.start], ease.inOut);
      return { x: prev.to.x + (s.from.x - prev.to.x) * q, y: prev.to.y + (s.from.y - prev.to.y) * q, lift: Math.sin(Math.PI * q) };
    };

    // How far the creature hops: up past the top edge, and a little to the right.
    const away = mark.current ? { x: window.innerWidth * 0.3, y: mark.current.offsetTop + mark.current.offsetHeight * 1.4 } : { x: 0, y: 0 };

    const render = (t: number) => {
      const still = reduced || skipAt.current !== null;
      const c = still ? BUILT : t;

      // 1. The crayon comes in and writes the printed word, a plain ink i included.
      plan.forEach((s) => {
        const p = along(c, [s.start, s.end], hand);
        s.path.style.strokeDashoffset = `${1 - p}`;
        s.path.style.visibility = p > 0 ? "visible" : "hidden";
      });

      const enter = along(c, T.enter);
      const hop = along(c, T.hop, ease.inOut);
      let x: number, y: number, rot: number;
      if (hop <= 0) {
        const at = penAt(c);
        const wobble = c > T.write[0] && c < T.write[1] ? Math.sin(c * 0.045) : 0;
        x = at.x - (1 - enter) * 80 + wobble * 0.6;
        y = at.y - (1 - enter) * 110 - 12 * at.lift + Math.cos(c * 0.06) * 0.4;
        rot = holdAngle(at.x) + wobble * 3 - (1 - enter) * 20;
      } else {
        // 2. Hop back and land upright on the ink i, squashing it out. It
        // flips backwards, tail up and over the word, so it never swings off
        // the right edge.
        x = landFrom.x + (tip.x - landFrom.x) * hop;
        y = landFrom.y + (tip.y - landFrom.y) * hop - 280 * hop * (1 - hop);
        const from = holdAngle(landFrom.x);
        rot = from + (-360 - from) * hop;
      }
      const landed = c >= T.hop[1];
      if (pen.current) {
        pen.current.setAttribute("transform", `translate(${x} ${y}) rotate(${rot}) translate(${-tip.x} ${-tip.y})`);
        pen.current.style.opacity = landed ? "0" : `${Math.min(1, enter * 3)}`;
      }
      if (crayon.current) {
        const thud = Math.sin(Math.PI * along(c, T.land, ease.linear));
        scaleAbout(crayon.current, CRAYON_FOOT.x, CRAYON_FOOT.y, 1 + 0.08 * thud, 1 - 0.1 * thud);
        crayon.current.style.opacity = landed ? "1" : "0";
      }
      const sq = along(c, T.squash, ease.inOut);
      if (inkI.current) {
        scaleAbout(inkI.current, I_X, 132, 1 + 0.6 * sq, 1 - sq);
        inkI.current.style.opacity = `${1 - sq}`;
      }

      const dp = along(c, T.dot, ease.back);
      if (dot.current) {
        scaleAbout(dot.current, BLOCK.dot.cx, BLOCK.dot.cy, dp);
        dot.current.style.opacity = dp > 0 ? "1" : "0";
      }

      // 3. The creature scribbles itself in above the word, wakes up, bounces,
      // waves and hops away.
      const mo = along(c, [T.mark[0], T.mark[0] + 150]);
      const mp = along(c, T.mark, ease.back);
      const bounce = Math.sin(Math.PI * along(c, T.bounce, ease.linear));
      const wq = along(c, T.wave, ease.linear);
      const crouch = along(c, T.crouch);
      const gone = along(c, T.leave, (p) => p * p);
      if (mark.current) {
        const grow = 0.8 + 0.2 * mp;
        const stretch = Math.min(1, gone * 4);
        const sx = grow * (1 - 0.03 * bounce + 0.1 * crouch - 0.12 * stretch);
        const sy = grow * (1 + 0.06 * bounce - 0.14 * crouch + 0.24 * stretch);
        const tilt = 9 * Math.sin(4 * Math.PI * wq) * (1 - wq) + 30 * gone;
        const mx = away.x * gone;
        const my = (1 - mo) * 10 - 18 * bounce - away.y * gone;
        mark.current.style.opacity = gone < 1 ? `${mo}` : "0";
        mark.current.style.transform = `translate(${mx}px, ${my}px) rotate(${tilt}deg) scale(${sx}, ${sy})`;
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

  const ink = (d: string, k: number) => (
    <path
      key={k}
      ref={(el) => {
        strokes.current[k] = el;
      }}
      d={d}
      pathLength={1}
      style={{ strokeDasharray: "1 1", strokeDashoffset: 1, visibility: "hidden" }}
    />
  );

  return (
    <div
      ref={root}
      onClick={skip}
      aria-hidden="true"
      className="splash fixed inset-0 z-[100] flex justify-center bg-[#fff8ee]"
    >
      <div className="relative flex h-full w-full max-w-[420px] flex-col items-center justify-center px-6 pb-14">
        <div ref={mark} className="aspect-square w-[min(46vw,170px)] origin-bottom" style={{ opacity: 0 }}>
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
          <svg
            viewBox={`${BLOCK.viewBox.x} ${BLOCK.viewBox.y} ${BLOCK.viewBox.w} ${BLOCK.viewBox.h}`}
            className="absolute inset-0 block h-full w-full overflow-visible"
          >
            <g fill="none" stroke={BRAND.ink} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round">
              {STROKES.map((s, k) => s.letter !== INK_I && ink(s.d, k))}
              <g ref={inkI}>{STROKES.map((s, k) => s.letter === INK_I && ink(s.d, k))}</g>
            </g>
            {/* The crayon that lands stays as the printed logo's i. */}
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
        <div
          ref={footer}
          className="absolute inset-x-0 bottom-[max(1.1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-0.5 text-[#1e1b2e]"
          style={{ opacity: 0 }}
        >
          {/* The maker's logo, as on the promo video's maker card: mark A beside the wordmark. */}
          <div className="flex items-center gap-1.5 opacity-85">
            <span className="text-xs opacity-60">by</span>
            <KayaMark />
            <span className="font-[family-name:var(--font-fredoka)] text-[17px] leading-none font-semibold tracking-[-0.01em]">
              Kaya Randomized
            </span>
          </div>
          <p className="text-[11px] opacity-50">v{version} · © 2026</p>
        </div>
      </div>
      {/* If the script never runs, the splash still gets out of the way. */}
      <style href="splash-safety" precedence="default">
        {`.splash{animation:splash-away .35s ease-in 6s forwards}@keyframes splash-away{to{opacity:0;visibility:hidden}}`}
      </style>
    </div>
  );
}
