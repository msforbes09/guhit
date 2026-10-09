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

.alive-character-layer {
  position: absolute;
  inset: 0;
}

@media (prefers-reduced-motion: reduce) {
  .alive-cloud,
  .alive-cloud-slow,
  .alive-sun,
  .alive-star {
    animation: none;
  }
}
`;

export const cls = {
  burst: "alive-burst",
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
