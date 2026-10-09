import type { Mesh, RigInfo } from "./rig";

/**
 * "Make it move more": the child taps the head, hands and feet on their
 * drawing; we build a tiny skeleton from those points and skin the mesh to it
 * (linear blend skinning), so an arm can really wave and legs can step.
 */

/** Points tapped on the cut-out, in cut-out PNG pixels. Hands and feet are optional. */
export interface Joints {
  head: [number, number];
  hips?: [number, number];
  handL?: [number, number];
  handR?: [number, number];
  footL?: [number, number];
  footR?: [number, number];
}

export type BoneName = "body" | "head" | "armL" | "armR" | "legL" | "legR";

export interface Bone {
  name: BoneName;
  /** Pivot (shoulder, hip, neck) in character units. */
  origin: [number, number];
  /** End point (hand, foot, head) in character units. */
  tip: [number, number];
  /** +1 if the tip is right of the pivot, -1 if left: turns "raise" into a rotation direction. */
  side: 1 | -1;
  /** Rest elevation of the limb: 0 hanging down, π/2 sideways, π straight up. */
  rest: number;
}

export interface Skeleton {
  bones: Bone[];
  neck: [number, number];
}

export interface Skin {
  /** Four bone indices per vertex. */
  index: Float32Array;
  /** Four weights per vertex (sum 1). */
  weight: Float32Array;
}

/** Limb rotations in radians; positive "raises" an arm or swings a leg forward. */
export interface LimbPose {
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  head: number;
  /** 0..1: how much the right arm goes to the waving height instead of armR. */
  waveR: number;
  /** -1..1 side-to-side swing while waving. */
  waveSwing: number;
}

/** Arms never swing past this elevation, so a raised arm can't cross the face. */
const MAX_ELEVATION = 2.75;

export const MAX_BONES = 6;

export function toUnits(rig: RigInfo, p: [number, number]): [number, number] {
  return [(p[0] - rig.anchorX) / rig.unit, (rig.anchorY - p[1]) / rig.unit];
}

export function buildSkeleton(input: Joints, rig: RigInfo): Skeleton {
  // "L"/"R" follow the screen, whichever order the child tapped them in, so
  // waving always lifts the arm on the right of the screen.
  const joints = { ...input };
  if (joints.handL && joints.handR && joints.handL[0] > joints.handR[0]) {
    [joints.handL, joints.handR] = [joints.handR, joints.handL];
  }
  if (joints.footL && joints.footR && joints.footL[0] > joints.footR[0]) {
    [joints.footL, joints.footR] = [joints.footR, joints.footL];
  }
  const head = toUnits(rig, joints.head);
  const feet = [joints.footL, joints.footR].filter(Boolean).map((f) => toUnits(rig, f!));
  const footY = feet.length ? Math.max(...feet.map((f) => f[1])) : 0;
  const hips: [number, number] = joints.hips
    ? toUnits(rig, joints.hips)
    : [feet.length ? feet.reduce((s, f) => s + f[0], 0) / feet.length : 0, footY + (head[1] - footY) * 0.35];
  const chest: [number, number] = [hips[0] + (head[0] - hips[0]) * 0.55, hips[1] + (head[1] - hips[1]) * 0.55];
  const neck: [number, number] = [hips[0] + (head[0] - hips[0]) * 0.72, hips[1] + (head[1] - hips[1]) * 0.72];

  const bones: Bone[] = [{ name: "body", origin: hips, tip: head, side: 1, rest: Math.PI }];
  bones.push({ name: "head", origin: neck, tip: head, side: 1, rest: Math.PI });
  const arm = (name: BoneName, hand?: [number, number]) => {
    if (!hand) return;
    const h = toUnits(rig, hand);
    // Shoulder: a third of the way from the chest towards the hand, at chest height.
    const origin: [number, number] = [chest[0] + (h[0] - chest[0]) * 0.3, chest[1] + (h[1] - chest[1]) * 0.15];
    bones.push({ name, origin, tip: h, side: h[0] >= origin[0] ? 1 : -1, rest: elevation(origin, h) });
  };
  const leg = (name: BoneName, foot?: [number, number]) => {
    if (!foot) return;
    const f = toUnits(rig, foot);
    const origin: [number, number] = [hips[0] + (f[0] - hips[0]) * 0.35, hips[1]];
    bones.push({ name, origin, tip: f, side: f[0] >= origin[0] ? 1 : -1, rest: elevation(origin, f) });
  };
  arm("armL", joints.handL);
  arm("armR", joints.handR);
  leg("legL", joints.footL);
  leg("legR", joints.footR);
  return { bones, neck };
}

function elevation(o: [number, number], t: [number, number]): number {
  return Math.atan2(Math.abs(t[0] - o[0]), o[1] - t[1]);
}

/** Rotation that raises an arm by `raise`, kept between hanging and nearly overhead. */
function armRotation(bone: Bone, raise: number): number {
  const target = Math.max(-0.3, Math.min(MAX_ELEVATION, bone.rest + raise));
  return (target - bone.rest) * bone.side;
}

/** Distance from p to segment ab, and how far along it p projects (0 at a, 1 at b). */
function segment(p: [number, number], a: [number, number], b: [number, number]): { d: number; t: number } {
  const vx = b[0] - a[0],
    vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy || 1e-6;
  const t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  const c = Math.max(0, Math.min(1, t));
  const dx = p[0] - (a[0] + vx * c),
    dy = p[1] - (a[1] + vy * c);
  return { d: Math.hypot(dx, dy), t };
}

/**
 * Proximity weights: each vertex follows the bones it is close to. A limb
 * only claims points past its pivot, so raising an arm never drags the other
 * side of the body along.
 */
export function computeSkin(mesh: Mesh, sk: Skeleton): Skin {
  const n = mesh.positions.length / 2;
  const index = new Float32Array(n * 4);
  const weight = new Float32Array(n * 4);
  const sigma = 0.07;
  const w = new Float32Array(sk.bones.length);
  for (let v = 0; v < n; v++) {
    const p: [number, number] = [mesh.positions[v * 2], mesh.positions[v * 2 + 1]];
    for (let b = 0; b < sk.bones.length; b++) {
      const bone = sk.bones[b];
      const { d, t } = segment(p, bone.origin, bone.tip);
      if (bone.name === "body") {
        // The body is the fallback owner of everything, with a gentle falloff.
        w[b] = 0.35 * Math.exp(-((d / (sigma * 3)) ** 2)) + 0.02;
        continue;
      }
      const gate = t < -0.05 ? 0 : t < 0.15 ? (t + 0.05) / 0.2 : 1;
      w[b] = gate * Math.exp(-((d / sigma) ** 2));
    }
    // Keep the four strongest bones.
    const order = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 4);
    let sum = 0;
    for (const b of order) sum += w[b];
    for (let k = 0; k < 4; k++) {
      const b = order[k];
      index[v * 4 + k] = b ?? 0;
      weight[v * 4 + k] = b === undefined || sum <= 0 ? (k === 0 ? 1 : 0) : w[b] / sum;
    }
  }
  return { index, weight };
}

/**
 * Bone transforms as 3x3 column-major matrices (2D affine), each rotating
 * about its pivot in rest space. Limbs and the head hang off the body.
 */
export function boneMatrices(sk: Skeleton, pose: LimbPose, out = new Float32Array(MAX_BONES * 9)): Float32Array {
  for (let b = 0; b < MAX_BONES; b++) setRotation(out, b, 0, 0, 0);
  sk.bones.forEach((bone, b) => {
    let a = 0;
    if (bone.name === "armL") a = armRotation(bone, pose.armL);
    else if (bone.name === "armR") {
      // Waving aims for a fixed height (about 130°) whatever pose the arm was drawn in.
      const wave = (2.25 + 0.4 * pose.waveSwing - bone.rest) * bone.side;
      a = armRotation(bone, pose.armR) * (1 - pose.waveR) + wave * pose.waveR;
    }
    else if (bone.name === "legL") a = pose.legL;
    else if (bone.name === "legR") a = pose.legR;
    else if (bone.name === "head") a = pose.head;
    setRotation(out, b, a, bone.origin[0], bone.origin[1]);
  });
  return out;
}

function setRotation(m: Float32Array, b: number, a: number, ox: number, oy: number) {
  const c = Math.cos(a),
    s = Math.sin(a);
  const o = b * 9;
  // Column-major: [c s 0 | -s c 0 | tx ty 1], rotating about (ox, oy).
  m[o] = c;
  m[o + 1] = s;
  m[o + 2] = 0;
  m[o + 3] = -s;
  m[o + 4] = c;
  m[o + 5] = 0;
  m[o + 6] = ox - c * ox + s * oy;
  m[o + 7] = oy - s * ox - c * oy;
  m[o + 8] = 1;
}

/** First guesses for the tap targets, from the silhouette (the child can move them). */
export function guessJoints(rig: RigInfo, mask: { width: number; height: number; data: Uint8ClampedArray }): Joints {
  const { width: W, height: H, data } = mask;
  let top: [number, number] = [rig.anchorX, rig.anchorY - rig.unit];
  let left: [number, number] | undefined;
  let right: [number, number] | undefined;
  const on = (x: number, y: number) => data[(y * W + x) * 4 + 3] > 40;
  outer: for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (on(x, y)) {
        top = [x, y];
        break outer;
      }
    }
  }
  const midTop = Math.round(rig.anchorY - rig.unit * 0.85);
  const midBot = Math.round(rig.anchorY - rig.unit * 0.25);
  for (let y = Math.max(0, midTop); y < Math.min(H, midBot); y++) {
    for (let x = 0; x < W; x++) {
      if (on(x, y)) {
        if (!left || x < left[0]) left = [x, y];
        break;
      }
    }
    for (let x = W - 1; x >= 0; x--) {
      if (on(x, y)) {
        if (!right || x > right[0]) right = [x, y];
        break;
      }
    }
  }
  const footY = Math.round(rig.anchorY - rig.unit * 0.04);
  const half = rig.footHalf * rig.unit;
  return {
    head: [top[0], top[1] + rig.unit * 0.12],
    handL: left,
    handR: right,
    footL: [rig.anchorX - half * 0.6, footY],
    footR: [rig.anchorX + half * 0.6, footY],
  };
}
