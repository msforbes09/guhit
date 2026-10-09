/**
 * Styles for the alive components, shipped as a React 19 hoisted <style>
 * (deduplicated by href). The project's Turbopack CSS rule routes every .css
 * file through Tailwind as plain CSS, which drops CSS-module class exports.
 */
export const ALIVE_CSS = `
.alive-root {
  position: relative;
  width: 100%;
  height: 100%;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.alive-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.alive-zzz {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  will-change: transform;
}

.alive-z {
  position: absolute;
  left: 0;
  bottom: 0;
  font-family: ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif;
  font-weight: 800;
  color: #6b72c9;
  text-shadow: 0 2px 0 rgba(255, 255, 255, 0.8);
  opacity: 0;
  animation: alive-zfloat 3s ease-in-out infinite;
}

.alive-z:nth-child(2) {
  animation-delay: 1s;
}

.alive-z:nth-child(3) {
  animation-delay: 2s;
}

@keyframes alive-zfloat {
  0% {
    transform: translate(0, 0) scale(0.5) rotate(-10deg);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  80% {
    opacity: 0.9;
  }
  100% {
    transform: translate(2.2em, -3.2em) scale(1.25) rotate(12deg);
    opacity: 0;
  }
}

.alive-burst {
  position: absolute;
  pointer-events: none;
  width: 0;
  height: 0;
}

.alive-heart {
  position: absolute;
  left: -0.5em;
  top: -0.5em;
  font-size: 28px;
  line-height: 1;
  animation: alive-pop 0.95s cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
}

@keyframes alive-pop {
  0% {
    transform: translate(0, 0) scale(0.2);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(1.1) rotate(var(--rot));
    opacity: 0;
  }
}

/* Stage */

.alive-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: linear-gradient(180deg, #a9dcff 0%, #d4efff 45%, #fdf3e4 72%);
  isolation: isolate;
}

.alive-sky {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 62%;
  pointer-events: none;
}

.alive-ground {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 50%;
  pointer-events: none;
}

.alive-decor {
  position: absolute;
  height: auto;
  overflow: visible;
  pointer-events: none;
  transform: translateX(-50%);
}

.alive-cloud {
  animation: alive-drift 60s linear infinite;
}

.alive-cloud-slow {
  animation: alive-drift 90s linear infinite;
  animation-delay: -40s;
}

@keyframes alive-drift {
  from {
    transform: translateX(-30%);
  }
  to {
    transform: translateX(130%);
  }
}

.alive-sun {
  transform-box: fill-box;
  transform-origin: center;
  animation: alive-glow 6s ease-in-out infinite;
}

@keyframes alive-glow {
  50% {
    transform: scale(1.06);
  }
}

.alive-night {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, #1b2459 0%, #3a3f86 50%, rgba(58, 63, 134, 0.55) 80%);
  opacity: 0;
  transition: opacity 1.6s ease;
}

.alive-night-on {
  opacity: 0.82;
}

.alive-star {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #fff8d6;
  box-shadow: 0 0 6px 2px rgba(255, 248, 214, 0.8);
  animation: alive-twinkle 2.4s ease-in-out infinite;
}

@keyframes alive-twinkle {
  50% {
    opacity: 0.3;
  }
}

.alive-dust {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  opacity: 0;
  will-change: transform, opacity;
  transition: opacity 0.3s ease;
  --dir: 1;
}
.alive-puff {
  position: absolute;
  left: -10px;
  top: -16px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(150, 128, 104, 0.45);
  animation: alive-puff 0.9s ease-out infinite;
}
.alive-puff:nth-child(2) {
  animation-delay: 0.3s;
}
.alive-puff:nth-child(3) {
  animation-delay: 0.6s;
}
@keyframes alive-puff {
  from {
    transform: translate(0, 0) scale(0.4);
    opacity: 0.85;
  }
  to {
    transform: translate(calc(var(--dir) * -46px), -20px) scale(1.5);
    opacity: 0;
  }
}

.alive-beep {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  padding: 6px 14px;
  border: 3px solid #1e1b2e;
  border-radius: 20px;
  background: #fff;
  color: #1e1b2e;
  font: 800 20px var(--font-grandstander, ui-rounded), ui-rounded, system-ui, sans-serif;
  white-space: nowrap;
  opacity: 0;
  transform-origin: 50% 100%;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  will-change: transform, opacity;
}

.alive-drop {
  position: absolute;
  left: -6px;
  top: -6px;
  width: 12px;
  height: 14px;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  background: #7fc8f8;
  border: 2px solid #ffffff;
  animation: alive-splash 0.85s cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
}
@keyframes alive-splash {
  0% {
    transform: translate(0, 0) scale(0.3);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), calc(var(--dy) + 40px)) scale(1);
    opacity: 0;
  }
}

.alive-sea {
  background: linear-gradient(180deg, #8fd6f7 0%, #4fb1e6 38%, #2a86c8 72%, #1f6aa6 100%);
}
.alive-bubble {
  position: absolute;
  bottom: -6%;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.18);
  pointer-events: none;
  animation: alive-rise 7s linear infinite;
}
@keyframes alive-rise {
  from {
    transform: translate(0, 0);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  to {
    transform: translate(12px, -115cqh);
    opacity: 0;
  }
}

.alive-character-layer {
  position: absolute;
  inset: 0;
}

@media (prefers-reduced-motion: reduce) {
  .alive-cloud,
  .alive-cloud-slow,
  .alive-sun,
  .alive-star,
  .alive-puff,
  .alive-bubble {
    animation: none;
  }
  .alive-bubble {
    opacity: 0.6;
  }
}
`;

export const cls = {
  beep: "alive-beep",
  bubble: "alive-bubble",
  burst: "alive-burst",
  drop: "alive-drop",
  dust: "alive-dust",
  puff: "alive-puff",
  sea: "alive-sea",
  canvas: "alive-canvas",
  characterLayer: "alive-character-layer",
  cloud: "alive-cloud",
  cloudSlow: "alive-cloud-slow",
  heart: "alive-heart",
  night: "alive-night",
  nightOn: "alive-night-on",
  root: "alive-root",
  sky: "alive-sky",
  ground: "alive-ground",
  decor: "alive-decor",
  stage: "alive-stage",
  star: "alive-star",
  sun: "alive-sun",
  z: "alive-z",
  zzz: "alive-zzz",
} as const;
