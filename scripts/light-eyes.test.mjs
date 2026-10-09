// node --test scripts/*.test.mjs (Node 24 runs the TypeScript module as is).
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeLabels, pickLabel } from "../src/lib/ai/light-eyes.ts";

const encode = (label, values) => {
  const scale = Math.max(...values.map(Math.abs)) / 127;
  const bytes = Int8Array.from(values, (x) => Math.round(x / scale));
  return { label, scale, vector: Buffer.from(bytes.buffer).toString("base64") };
};

const labels = decodeLabels({
  labels: [encode("a cat", [1, 0, 0, 0]), encode("a star", [0, 1, 0, 0]), encode("a car", [0, 0, 1, 0])],
});

test("decodes each label's 8-bit vector back to its values", () => {
  assert.deepEqual(
    labels.map((l) => l.label),
    ["a cat", "a star", "a car"],
  );
  assert.ok(Math.abs(labels[1].vector[1] - 1) < 0.01);
  assert.equal(labels[1].vector[0], 0);
});

test("names the label closest to the picture", () => {
  const pick = pickLabel([0.1, 0.9, 0.2, 0], labels);
  assert.equal(pick.label, "a star");
  assert.equal(pick.top[0][0], "a star");
  assert.ok(pick.top[0][1] > 0.9);
});

test("works with an embedding that is not normalised", () => {
  assert.equal(pickLabel([0, 0, 40, 3], labels).label, "a car");
});

test("names nothing when no label stands out", () => {
  const pick = pickLabel([1, 1, 1, 0], labels);
  assert.equal(pick.label, "");
  assert.equal(pick.top.length, 3);
});

import { LIGHT_INPUT, lightEyesFrame } from "../src/lib/ai/light-eyes.ts";

test("the light eyes see a 256 px square", () => {
  assert.equal(LIGHT_INPUT, 256);
});

test("a photo region keeps 30% paper around the crop and fits the square, centred", () => {
  const f = lightEyesFrame({ width: 1000, height: 800 }, { x: 400, y: 300, w: 200, h: 100 });
  assert.deepEqual([f.sx, f.sy, f.sw, f.sh], [340, 240, 320, 220]);
  assert.deepEqual([f.dx, f.dy, f.dw, f.dh], [0, 40, 256, 176]);
});

test("the paper around a crop stops at the photo's edge", () => {
  const f = lightEyesFrame({ width: 500, height: 500 }, { x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual([f.sx, f.sy, f.sw, f.sh], [0, 0, 130, 130]);
  assert.deepEqual([f.dx, f.dy, f.dw, f.dh], [0, 0, 256, 256]);
});

test("a cut-out goes on white with a 12% margin, centred", () => {
  const f = lightEyesFrame({ width: 400, height: 200 });
  assert.deepEqual([f.sx, f.sy, f.sw, f.sh], [0, 0, 400, 200]);
  assert.equal(f.dw, 206);
  assert.equal(f.dh, 103);
  assert.equal(f.dx, 25);
  assert.equal(f.dy, 77);
});
