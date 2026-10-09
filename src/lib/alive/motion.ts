import type { AliveKind, AliveMotion } from "./types";

/**
 * Procedural motion for a drawn character. Every motion is a function of
 * time that returns a pose; springs on top add squash on landings, a happy
 * squish on tap and follow-through when the character starts or stops, so
 * the drawing feels soft and bouncy rather than rigid.
 *
 * Units: lengths are in character heights, angles in radians, y up.
 */

export interface Pose {
  /** Horizontal position on the stage (character heights from centre). */
  x: number;
  /** Height above the ground. */
  lift: number;
  /** > 0 stretches tall and thin, < 0 squashes short and wide. */
  squash: number;
  /** Sideways offset of the top, growing with height (sway). */
  bend: number;
  /** Whole-body tilt about the feet. */
  lean: number;
  wiggleAmp: number;
  wigglePhase: number;
  /** Tilt of the upper part (head nod). */
  head: number;
  /** Rotation of the arm region about its shoulder. */
  arm: number;
  /** 0..1 how much the character is "in the air", for the shadow. */
  air: number;
  /** Joint mode only: arm raise and leg swing, radians. */
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  waveR: number;
  waveSwing: number;
  /** Swimmers: a wave travelling along the body (amplitude, phase). */
  swimAmp: number;
  swimPhase: number;
}

const ZERO: Pose = {
  x: 0,
  lift: 0,
  squash: 0,
  bend: 0,
  lean: 0,
  wiggleAmp: 0,
  wigglePhase: 0,
  head: 0,
  arm: 0,
  air: 0,
  armL: 0,
  armR: 0,
  legL: 0,
  legR: 0,
  waveR: 0,
  waveSwing: 0,
  swimAmp: 0,
  swimPhase: 0,
};

interface Spring {
  x: number;
  v: number;
  k: number;
  c: number;
}

function stepSpring(s: Spring, target: number, dt: number, force = 0) {
  const a = -s.k * (s.x - target) - s.c * s.v + force;
  s.v += a * dt;
  s.x += s.v * dt;
}

const TAU = Math.PI * 2;
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Smooth pseudo-random 0..1 for natural-looking variation (no Math.random in the frame loop). */
function noise1(t: number): number {
  return (
    0.5 +
    0.25 * Math.sin(t * 1.7 + 1.3) +
    0.15 * Math.sin(t * 3.1 + 0.4) +
    0.1 * Math.sin(t * 5.3 + 2.1)
  );
}

/** Hover heights for things that float, in character heights. */
const FLY_HEIGHT = 0.38;
const SWIM_HEIGHT = 0.3;

/** Cruising speed per kind, character heights per second. */
const SPEED: Record<AliveKind, number> = {
  creature: 0.62,
  thing: 0.55,
  vehicle: 0.95,
  plant: 0,
  flyer: 0.8,
  swimmer: 0.5,
};

export class MotionController {
  motion: AliveMotion = "idle";
  /** What the drawing is; each kind has its own way of moving. */
  kind: AliveKind = "creature";
  /** Reduced motion: smaller, slower movements. */
  calm = false;
  private motionStart = 0;
  private prevMotion: AliveMotion = "idle";
  private prevStart = 0;
  private switchAt = -10;

  /** Walking state lives here so the character stays where it walked to. */
  x = 0;
  /** Current travel direction and speed (read by the stage for dust and splashes). */
  dir: 1 | -1 = 1;
  speed = 0;
  private accel = 0;
  /** Seconds when a swimmer last broke the water (leaving or landing), for a splash. */
  splashAt = -10;
  private splashCycle = -1;
  private walkPauseUntil = 0;
  private stepPhase = 0;
  private lastStepIndex = 0;
  private prevSpeed = 0;
  bounds = 1;

  private squash: Spring = { x: 0, v: 0, k: 260, c: 13 };
  private bend: Spring = { x: 0, v: 0, k: 70, c: 6 };
  private headSpring: Spring = { x: 0, v: 0, k: 90, c: 9 };

  private reactAt = -10;
  private reactLanded = true;
  private bounceIndex = -1;
  private jumpLanded = -1;
  private fidgetAt = 4;
  private fidgetKind = 0;
  private fidgetStart = -10;
  private level = 0;

  /** @param instant skip the cross-fade from the previous motion. */
  setMotion(m: AliveMotion, now: number, instant = false) {
    if (m === this.motion) return;
    this.prevMotion = this.motion;
    this.prevStart = this.motionStart;
    this.motion = m;
    this.motionStart = now;
    this.switchAt = instant ? -Infinity : now;
    this.bounceIndex = -1;
    this.jumpLanded = -1;
  }

  setCalm(calm: boolean) {
    this.calm = calm;
  }

  setKind(kind: AliveKind) {
    if (kind === this.kind) return;
    this.kind = kind;
    // A flower does not stay where a walker left it.
    if (kind === "plant") this.x = 0;
  }

  /** Tap reaction: squish, then a happy hop (or the kind's own: honk, shiver, flip, flutter). */
  poke(now: number) {
    this.reactAt = now;
    this.reactLanded = false;
    this.squash.v -= this.kind === "plant" ? 2 : this.kind === "vehicle" ? 6.5 : 5.5;
    this.headSpring.v += this.kind === "creature" || this.kind === "thing" ? 3 : 0;
  }

  /** Seconds since the last tap (for the stage's "Beep beep!"). */
  sincePoke(now: number) {
    return now - this.reactAt;
  }

  /**
   * @param level speaking loudness 0..1, or null to synthesise a speaking
   *   rhythm when `talking` is true but no audio level is available.
   */
  update(now: number, dt: number, talking: boolean, level: number | null): Pose {
    dt = Math.min(dt, 1 / 20);
    this.updateWalk(now, dt);

    const blend = ease((now - this.switchAt) / 0.4);
    const cur = this.poseFor(this.motion, now - this.motionStart, now);
    const pose: Pose =
      blend < 1 ? mixPose(this.poseFor(this.prevMotion, now - this.prevStart, now), cur, blend) : cur;
    pose.x = this.x;

    // Talking: loudness drives a stretch and a nod, so speech reads from afar.
    let target = 0;
    if (talking) {
      target = level ?? syntheticSpeech(now);
    }
    const rate = target > this.level ? 28 : 9;
    this.level += (target - this.level) * Math.min(1, dt * rate);
    const l = this.level;
    pose.squash += 0.1 * l;
    pose.head += 0.09 * l * Math.sin(now * 9.0) + 0.03 * l;
    pose.bend += 0.02 * l * Math.sin(now * 5.0);
    pose.armR += 0.35 * l * (0.5 + 0.5 * Math.sin(now * 3.1));
    pose.armL += 0.2 * l * (0.5 + 0.5 * Math.sin(now * 2.3 + 1));

    // Tap reaction layer.
    const tr = now - this.reactAt;
    if (tr >= 0 && tr < 1.4 && this.kind !== "creature" && this.kind !== "thing") {
      kindReaction(this.kind, tr, pose);
    } else if (tr >= 0 && tr < 1.4) {
      const hopStart = 0.14,
        hopDur = 0.46;
      const q = (tr - hopStart) / hopDur;
      if (q > 0 && q < 1) {
        pose.lift += 0.32 * 4 * q * (1 - q);
        pose.air = Math.max(pose.air, 4 * q * (1 - q));
        pose.armL += 1.1 * Math.sin(q * Math.PI);
        pose.armR += 1.1 * Math.sin(q * Math.PI);
        pose.squash += 0.1 * (1 - 2 * q) * (q < 0.5 ? 1 : 0.6);
      }
      if (!this.reactLanded && q >= 1) {
        this.reactLanded = true;
        this.squash.v -= 3.5;
      }
      const decay = Math.max(0, 1 - tr / 1.4);
      pose.head += 0.12 * Math.sin(tr * 18) * decay;
      pose.lean += 0.05 * Math.sin(tr * 11) * decay;
    }

    // Follow-through: the top lags when the walk speeds up or slows down.
    const acc = (this.speed - this.prevSpeed) / Math.max(dt, 1e-3);
    this.prevSpeed = this.speed;
    stepSpring(this.bend, 0, dt, -acc * 2.2 * this.dir);
    stepSpring(this.squash, 0, dt);
    stepSpring(this.headSpring, 0, dt);

    pose.squash += this.squash.x;
    pose.bend += this.bend.x;
    pose.head += this.headSpring.x;
    pose.squash = Math.max(-0.42, Math.min(0.42, pose.squash));
    if (this.calm) calmDown(pose);
    return pose;
  }

  private updateWalk(now: number, dt: number) {
    const cruise = SPEED[this.kind];
    const walking = this.motion === "walk" && cruise > 0;
    let targetSpeed = 0;
    if (walking && now >= this.walkPauseUntil) {
      targetSpeed = cruise;
      const atEdge = this.dir > 0 ? this.x >= this.bounds - 0.02 : this.x <= -this.bounds + 0.02;
      if (atEdge) {
        targetSpeed = 0;
        if (this.speed < 0.05) {
          const walker = this.kind === "creature" || this.kind === "thing";
          // Pause at the edge of the stage, then turn round (walkers with a little hop).
          this.walkPauseUntil = now + (walker ? 0.7 : 0.45);
          this.dir = this.dir > 0 ? -1 : 1;
          if (walker) {
            this.reactAt = now + 0.35;
            this.reactLanded = false;
          }
        }
      }
    }
    const before = this.speed;
    // Wheels and fins take a moment to get going and to stop.
    const grip = this.kind === "vehicle" ? 2.6 : this.kind === "swimmer" ? 2 : 5;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * grip);
    this.accel = (this.speed - before) / Math.max(dt, 1e-3);
    this.x += this.dir * this.speed * dt;
    this.x = Math.max(-this.bounds, Math.min(this.bounds, this.x));
    this.stepPhase += (this.speed / 0.62) * dt / 0.36;
  }

  private poseFor(m: AliveMotion, t: number, now: number): Pose {
    switch (this.kind) {
      case "vehicle":
        return this.vehicle(m, t, now);
      case "plant":
        return plant(m, t, now);
      case "flyer":
        return this.flyer(m, t, now);
      case "swimmer":
        return this.swimmer(m, t, now);
      case "thing":
        // No arms to wave; walking is a bouncy hop along.
        if (m === "walk") return this.hopAlong(now);
        if (m === "wave") return this.idle(t, now);
        break;
    }
    switch (m) {
      case "idle":
        return this.idle(t, now);
      case "bounce":
        return this.bounce(t);
      case "walk":
        return this.walk(t, now);
      case "jump":
        return this.jump(t, now);
      case "dance":
        return dance(t);
      case "sleep":
        return sleep(t);
      case "wave":
        return wave(t, now);
    }
  }

  /** Whole-body hops instead of steps, for drawings that are not creatures. */
  private hopAlong(now: number): Pose {
    const p = breathing(now, 2.6, 0.015);
    const moving = Math.min(1, this.speed / SPEED.thing);
    const s = this.stepPhase * 0.75;
    const k = Math.floor(s);
    const q = s - k;
    p.lift = 0.16 * 4 * q * (1 - q) * moving;
    p.air = 4 * q * (1 - q) * moving;
    p.squash += 0.06 * Math.abs(1 - 2 * q) * moving;
    p.lean = -this.dir * 0.05 * moving;
    if (k !== this.lastStepIndex) {
      this.lastStepIndex = k;
      if (moving > 0.3) this.squash.v -= 3.2 * moving;
    }
    return p;
  }

  /** Cars, buses, boats: no legs. They rumble, roll, hop bumps and honk. */
  private vehicle(m: AliveMotion, t: number, now: number): Pose {
    const p = { ...ZERO };
    // Engine rumble: a tiny fast shake whenever the engine is on.
    const rumble = m === "sleep" ? 0 : 1;
    p.lift = 0.005 * rumble * (0.5 + 0.5 * Math.sin(now * TAU * 11));
    p.squash = 0.007 * rumble * Math.sin(now * TAU * 7.3);
    switch (m) {
      case "walk": {
        const moving = Math.min(1, this.speed / SPEED.vehicle);
        // A small bump now and then on the road.
        const s = this.stepPhase * 0.5;
        const q = s - Math.floor(s);
        const bump = q < 0.18 ? Math.sin((q / 0.18) * Math.PI) : 0;
        p.lift += 0.035 * bump * moving;
        p.air = 0.2 * bump * moving;
        // Leans back when speeding up, dips forward when braking.
        p.lean = Math.max(-0.09, Math.min(0.09, this.dir * this.accel * 0.05));
        break;
      }
      case "jump": {
        const c = t % 2.0;
        if (c < 0.25) p.squash -= 0.1 * ease(c / 0.25);
        else if (c < 0.85) {
          const q = (c - 0.25) / 0.6;
          p.lift += 0.3 * 4 * q * (1 - q);
          p.air = 4 * q * (1 - q);
          p.lean = 0.12 * Math.sin(q * TAU);
          p.squash += 0.06 * Math.abs(1 - 2 * q);
        } else if (this.jumpLanded !== Math.floor(t / 2.0)) {
          this.jumpLanded = Math.floor(t / 2.0);
          this.squash.v -= 5;
        }
        break;
      }
      case "dance": {
        // Honk: two quick squashes, then a pause.
        const c = t % 1.6;
        const honk = (at: number) => (c > at && c < at + 0.22 ? Math.sin(((c - at) / 0.22) * Math.PI) : 0);
        const h = Math.max(honk(0.05), honk(0.42));
        p.squash += -0.13 * h;
        p.lift += 0.02 * h;
        break;
      }
      case "sleep": {
        const settle = ease(t / 1.2);
        p.squash = -0.035 * settle + 0.01 * Math.sin((TAU * t) / 4.2) * settle;
        break;
      }
      case "bounce": {
        const q = (t % 0.9) / 0.9;
        p.lift += 0.14 * 4 * q * (1 - q);
        p.air = 4 * q * (1 - q);
        p.squash += 0.05 * Math.abs(1 - 2 * q);
        break;
      }
    }
    return p;
  }

  /** Birds, butterflies, planes, kites: they float above the ground. */
  private flyer(m: AliveMotion, t: number, now: number): Pose {
    const p = { ...ZERO };
    const flap = (rate: number, amount: number) => amount * Math.sin(now * TAU * rate);
    p.lift = FLY_HEIGHT + 0.04 * Math.sin((TAU * now) / 1.6);
    p.squash = flap(3, 0.03);
    p.lean = 0.03 * Math.sin((TAU * now) / 2.7);
    switch (m) {
      case "walk": {
        // Loop across the sky: up and down along the way, tilting into the path.
        const moving = Math.min(1, this.speed / SPEED.flyer);
        const s = this.stepPhase * 0.55;
        p.lift = FLY_HEIGHT + 0.2 * Math.sin(s * Math.PI) * moving + 0.03 * Math.sin((TAU * now) / 1.6);
        p.lean = -this.dir * 0.22 * Math.cos(s * Math.PI) * moving;
        p.squash = flap(5, 0.05);
        break;
      }
      case "jump": {
        // Flap up hard, then glide back down.
        const c = t % 1.8;
        const up = c < 0.7 ? ease(c / 0.7) : 1 - ease((c - 0.7) / 1.1);
        p.lift = FLY_HEIGHT + 0.32 * up;
        p.squash = c < 0.7 ? flap(7, 0.09) : flap(2, 0.02);
        break;
      }
      case "dance": {
        const b = (t / 0.5) * Math.PI;
        p.lean = 0.25 * Math.sin(b);
        p.lift = FLY_HEIGHT + 0.08 * Math.abs(Math.sin(b));
        p.squash = flap(4, 0.05);
        p.wiggleAmp = 0.04;
        p.wigglePhase = 2 * b;
        break;
      }
      case "sleep": {
        // Lands, folds up and sleeps.
        const settle = ease(t / 1.4);
        const b = Math.sin((TAU * t) / 4.2);
        p.lift = FLY_HEIGHT * (1 - settle);
        p.squash = (0.03 * b - 0.04) * settle + flap(3, 0.03) * (1 - settle);
        p.head = 0.15 * settle;
        p.lean = 0.06 * settle;
        break;
      }
      case "bounce": {
        p.lift = FLY_HEIGHT + 0.1 * Math.sin((TAU * t) / 0.9);
        p.squash = flap(4, 0.05);
        break;
      }
    }
    p.air = Math.min(1, p.lift / 0.7);
    return p;
  }

  /** Fish, whales, turtles: they float in water and swim with a ripple. */
  private swimmer(m: AliveMotion, t: number, now: number): Pose {
    const p = { ...ZERO };
    p.lift = SWIM_HEIGHT + 0.05 * Math.sin((TAU * now) / 2.2);
    p.swimAmp = 0.035;
    p.swimPhase = now * 3;
    p.lean = 0.04 * Math.sin(now * 0.9);
    switch (m) {
      case "walk": {
        const moving = Math.min(1, this.speed / SPEED.swimmer);
        p.swimAmp = 0.035 + 0.06 * moving;
        p.swimPhase = now * (3 + 5 * moving);
        p.lift = SWIM_HEIGHT + 0.06 * Math.sin(this.stepPhase * 0.4);
        break;
      }
      case "jump": {
        // Leap: up out of the water in an arc, nose up then nose down, with a splash.
        const cycle = 2.4;
        const k = Math.floor(t / cycle);
        const c = t % cycle;
        const air0 = 0.2,
          air1 = 1.15;
        if (c >= air0 && c < air1) {
          const q = (c - air0) / (air1 - air0);
          p.lift = SWIM_HEIGHT + 0.55 * 4 * q * (1 - q);
          p.lean = 0.5 * (1 - 2 * q);
          p.swimAmp = 0.02;
          if (this.splashCycle !== k * 2) {
            this.splashCycle = k * 2;
            this.splashAt = now;
          }
        } else if (c >= air1 && this.splashCycle !== k * 2 + 1) {
          this.splashCycle = k * 2 + 1;
          this.splashAt = now;
          this.squash.v -= 3;
        }
        break;
      }
      case "dance": {
        const b = (t / 0.55) * Math.PI;
        p.swimAmp = 0.11;
        p.swimPhase = now * 9;
        p.lean = 0.2 * Math.sin(b);
        break;
      }
      case "sleep": {
        // Drifts down and rests near the bottom, still breathing.
        const settle = ease(t / 1.6);
        p.lift = SWIM_HEIGHT * (1 - settle) + 0.02 * settle + 0.015 * Math.sin((TAU * t) / 4.2);
        p.swimAmp = 0.035 * (1 - settle) + 0.012 * settle;
        p.swimPhase = now * (3 - 2 * settle);
        p.lean = 0.04 * settle;
        break;
      }
      case "bounce": {
        p.lift = SWIM_HEIGHT + 0.1 * Math.sin((TAU * t) / 1.1);
        break;
      }
    }
    p.air = 0.6;
    return p;
  }

  private idle(t: number, now: number): Pose {
    const p = breathing(now, 3.0, 0.036);
    p.bend = 0.05 * Math.sin((TAU * now) / 4.3 + 1);
    p.lean = 0.022 * Math.sin((TAU * now) / 5.7);
    p.head += 0.06 * Math.sin((TAU * now) / 3.9 + 0.5);
    p.armL = 0.08 * Math.sin((TAU * now) / 3.4);
    p.armR = 0.08 * Math.sin((TAU * now) / 3.4 + 1.2);

    // Every few seconds a small fidget: a hop, a look around, or a wiggle.
    if (now > this.fidgetAt) {
      this.fidgetStart = now;
      this.fidgetKind = Math.floor(noise1(now * 7.3) * 3) % 3;
      this.fidgetAt = now + 4 + noise1(now * 3.1) * 4;
    }
    const ft = now - this.fidgetStart;
    if (t > 1 && ft >= 0 && ft < 1.2) {
      if (this.fidgetKind === 0) {
        const q = ft / 0.4;
        if (q < 1) {
          p.lift += 0.07 * 4 * q * (1 - q);
          p.air = 0.5 * 4 * q * (1 - q);
        } else if (q < 1.15) {
          p.squash -= 0.06 * Math.sin(((q - 1) / 0.15) * Math.PI);
        }
      } else if (this.fidgetKind === 1) {
        const w = Math.sin((ft / 1.2) * Math.PI);
        p.head += 0.12 * w;
        p.lean += 0.04 * w;
      } else {
        const w = Math.sin((ft / 1.2) * Math.PI);
        p.wiggleAmp = 0.05 * w;
        p.wigglePhase = ft * 16;
      }
    }
    return p;
  }

  private bounce(t: number): Pose {
    const T = 0.72;
    const k = Math.floor(t / T);
    const q = (t % T) / T;
    const p = { ...ZERO };
    p.lift = 0.34 * 4 * q * (1 - q);
    p.air = 4 * q * (1 - q);
    // Stretch while moving fast, round at the top.
    p.squash = 0.1 * Math.abs(1 - 2 * q);
    p.head = 0.05 * (1 - 2 * q);
    p.wiggleAmp = 0.02;
    p.wigglePhase = t * 6;
    p.armL = p.armR = 0.7 * p.air;
    p.legL = 0.18 * p.air;
    p.legR = -0.18 * p.air;
    if (k !== this.bounceIndex) {
      if (this.bounceIndex >= 0) this.squash.v -= 4.2;
      this.bounceIndex = k;
    }
    return p;
  }

  private walk(t: number, now: number): Pose {
    void t;
    const p = breathing(now, 2.6, 0.015);
    const moving = Math.min(1, this.speed / 0.62);
    const s = this.stepPhase;
    const stepIndex = Math.floor(s);
    const q = s - stepIndex;
    p.lift = 0.085 * Math.sin(q * Math.PI) * moving;
    p.air = 0.4 * Math.sin(q * Math.PI) * moving;
    p.lean = 0.075 * Math.sin(s * Math.PI) * moving - this.dir * 0.05 * moving;
    p.head = -0.04 * Math.sin(s * Math.PI) * moving;
    p.squash += 0.03 * Math.sin(q * Math.PI) * moving;
    const swing = Math.sin(s * Math.PI) * moving;
    p.legL = 0.38 * swing;
    p.legR = -0.38 * swing;
    p.armL = (0.12 + 0.3 * swing) * moving;
    p.armR = (0.12 - 0.3 * swing) * moving;
    if (stepIndex !== this.lastStepIndex) {
      this.lastStepIndex = stepIndex;
      if (moving > 0.3) this.squash.v -= 1.6 * moving;
    }
    return p;
  }

  private jump(t: number, now: number): Pose {
    const cycle = 2.3;
    const k = Math.floor(t / cycle);
    const c = t % cycle;
    const p = breathing(now, 3.2, 0.02);
    const crouchEnd = 0.32,
      airEnd = 1.02;
    if (c < crouchEnd) {
      const e = ease(c / crouchEnd);
      p.squash = -0.17 * e;
      p.head = 0.06 * e;
      p.armL = p.armR = -0.25 * e;
    } else if (c < airEnd) {
      const q = (c - crouchEnd) / (airEnd - crouchEnd);
      p.lift = 0.62 * 4 * q * (1 - q);
      p.air = 4 * q * (1 - q);
      const launch = clamp01(q / 0.12);
      p.squash = -0.17 * (1 - launch) + launch * (0.15 * Math.abs(1 - 2 * q) - 0.02);
      p.head = -0.08 * (1 - 2 * q);
      p.lean = 0.03 * Math.sin(q * TAU);
      p.armL = p.armR = 1.5 * p.air;
      p.legL = 0.25 * p.air;
      p.legR = -0.25 * p.air;
    } else if (this.jumpLanded !== k) {
      this.jumpLanded = k;
      this.squash.v -= 5.2;
      this.headSpring.v -= 2;
    }
    return p;
  }
}

/** Flowers, trees, cacti: rooted at the bottom, they bend more the higher up. */
function plant(m: AliveMotion, t: number, now: number): Pose {
  const p = { ...ZERO };
  // Wind: a slow sway with the occasional gust.
  const gust = 0.5 + 0.5 * Math.sin((TAU * now) / 9);
  p.bend = (0.06 + 0.04 * gust) * Math.sin((TAU * now) / 3.2) + 0.02 * Math.sin((TAU * now) / 1.3 + 1);
  p.squash = 0.012 * Math.sin((TAU * now) / 3.6);
  switch (m) {
    case "jump": {
      // Grow: stretch up, hold, settle back.
      const c = t % 3.2;
      const up = c < 0.9 ? ease(c / 0.9) : c < 1.5 ? 1 : 1 - ease((c - 1.5) / 0.8);
      p.squash += 0.15 * up;
      p.bend *= 1 - 0.6 * up;
      p.wiggleAmp = 0.02 * up;
      p.wigglePhase = t * 12;
      break;
    }
    case "dance": {
      // Happy sway, side to side.
      const b = (t / 0.55) * Math.PI;
      p.bend = 0.16 * Math.sin(b);
      p.squash = 0.05 * Math.cos(2 * b);
      p.wiggleAmp = 0.03;
      p.wigglePhase = 2 * b;
      break;
    }
    case "sleep": {
      // Droops gently.
      const settle = ease(t / 1.5);
      p.bend = -0.13 * settle + 0.015 * Math.sin((TAU * t) / 4.2);
      p.squash = -0.08 * settle;
      p.head = 0.22 * settle;
      break;
    }
    case "bounce": {
      const q = (t % 0.8) / 0.8;
      p.squash += 0.08 * Math.sin(q * Math.PI);
      break;
    }
  }
  return p;
}

/** Tap reactions for kinds without a hop: honk, shiver, flip, flutter. */
function kindReaction(kind: AliveKind, tr: number, pose: Pose) {
  const decay = Math.max(0, 1 - tr / 1.4);
  switch (kind) {
    case "vehicle":
      // Honk: squash comes from the spring kick in poke(); add a little shake.
      pose.lift += 0.01 * Math.sin(tr * 50) * decay;
      break;
    case "plant":
      pose.bend += 0.05 * Math.sin(tr * 42) * decay;
      pose.wiggleAmp += 0.03 * decay;
      pose.wigglePhase = tr * 30;
      break;
    case "swimmer": {
      // Flip: a quick hop with a tail flick, nose up then down.
      const q = clamp01(tr / 0.7);
      pose.lean += 0.45 * Math.sin(q * TAU);
      pose.lift += 0.14 * Math.sin(q * Math.PI);
      pose.swimAmp += 0.1 * decay;
      pose.swimPhase = tr * 20;
      break;
    }
    case "flyer": {
      // Flutter: fast little flaps and a lift.
      pose.squash += 0.09 * Math.sin(tr * TAU * 8) * decay;
      pose.lift += 0.1 * Math.sin(clamp01(tr / 0.8) * Math.PI);
      break;
    }
  }
}

/** Reduced motion: keep the character recognisably alive, but small and slow. */
function calmDown(p: Pose) {
  p.squash *= 0.35;
  p.bend *= 0.35;
  p.lean *= 0.35;
  p.head *= 0.35;
  p.wiggleAmp = 0;
  p.swimAmp *= 0.3;
  p.armL *= 0.4;
  p.armR *= 0.4;
  p.legL *= 0.4;
  p.legR *= 0.4;
  p.arm *= 0.4;
}

function breathing(now: number, period: number, amount: number): Pose {
  const p = { ...ZERO };
  const b = Math.sin((TAU * now) / period);
  p.squash = amount * b;
  p.head = amount * 0.6 * Math.sin((TAU * now) / period - 0.6);
  return p;
}

function dance(t: number): Pose {
  const beat = 0.5;
  const p = { ...ZERO };
  const b = (t / beat) * Math.PI;
  p.lean = 0.13 * Math.sin(b);
  p.lift = 0.06 * Math.abs(Math.sin(b));
  p.air = 0.5 * Math.abs(Math.sin(b));
  p.squash = 0.07 * Math.cos(2 * b);
  p.head = -0.1 * Math.sin(b);
  p.wiggleAmp = 0.06;
  p.wigglePhase = 2 * b;
  p.arm = 0.45 + 0.4 * Math.sin(2 * b);
  p.bend = 0.04 * Math.sin(b + 0.6);
  p.armL = 0.7 + 0.7 * Math.sin(b);
  p.armR = 0.7 - 0.7 * Math.sin(b);
  p.legL = 0.22 * Math.max(0, Math.sin(b));
  p.legR = -0.22 * Math.max(0, -Math.sin(b));
  return p;
}

function sleep(t: number): Pose {
  const settle = ease(t / 1.2);
  const p = { ...ZERO };
  const b = Math.sin((TAU * t) / 4.2);
  p.squash = (0.05 * b - 0.05) * settle;
  p.lean = 0.1 * settle;
  p.head = 0.18 * settle + 0.025 * b;
  p.bend = (0.03 * b + 0.02) * settle;
  p.armL = p.armR = -0.12 * settle;
  return p;
}

function wave(t: number, now: number): Pose {
  const p = breathing(now, 3.0, 0.022);
  const up = ease(t / 0.35);
  p.arm = up * (0.55 + 0.38 * Math.sin(t * TAU * 1.6));
  p.lean = 0.04 * up;
  p.head = 0.06 * Math.sin(t * TAU * 0.8) * up;
  p.wiggleAmp = 0.012 * up;
  p.wigglePhase = t * 10;
  p.waveR = up;
  p.waveSwing = Math.sin(t * TAU * 1.6);
  p.armL = 0.1 * up;
  return p;
}

function mixPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...ZERO };
  for (const k of Object.keys(out) as (keyof Pose)[]) {
    out[k] = a[k] + (b[k] - a[k]) * t;
  }
  // Wiggle phase is an angle; blending phases jumps, so take the incoming one.
  out.wigglePhase = b.wiggleAmp > 0 ? b.wigglePhase : a.wigglePhase;
  out.swimPhase = b.swimAmp > 0 ? b.swimPhase : a.swimPhase;
  return out;
}

/** Speech-like loudness: syllables at ~4-5 per second with short pauses. */
function syntheticSpeech(now: number): number {
  const syll = Math.max(0, Math.sin(now * TAU * 4.3));
  const phrase = noise1(now * 0.9);
  const pause = phrase < 0.32 ? 0 : 1;
  return syll * (0.55 + 0.45 * noise1(now * 2.3)) * pause;
}
