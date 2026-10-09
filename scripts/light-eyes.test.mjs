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
