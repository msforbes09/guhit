// node --test scripts/*.test.mjs (Node 24 runs the TypeScript module as is).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cutoutNote, settleWithin } from "../src/lib/alive/cutout-note.ts";

const poor = { quality: "poor", reasons: ["edge broken"] };

test("settleWithin gives the answer that comes in time", async () => {
  assert.deepEqual(await settleWithin(Promise.resolve(7), 50), { state: "done", value: 7 });
});

test("settleWithin reports a failure with its message", async () => {
  const out = await settleWithin(Promise.reject(new Error("no ORT")), 50);
  assert.equal(out.state, "failed");
  assert.equal(out.error, "no ORT");
});

test("settleWithin stops waiting after the patience runs out", async () => {
  const out = await settleWithin(new Promise(() => {}), 20);
  assert.equal(out.state, "late");
});

test("the note says which AI files are missing when the model is not saved", () => {
  const note = cutoutNote(poor, { kind: "not-saved", missing: ["config.json", "onnx/model_quantized.onnx"] }, true);
  assert.match(note, /offline/);
  assert.match(note, /edge broken/);
  assert.match(note, /missing config\.json, onnx\/model_quantized\.onnx/);
  assert.match(note, /kept the plain one/);
});

test("the note gives the AI device and times when it ran", () => {
  const note = cutoutNote(poor, { kind: "used", device: "webgpu", seconds: 4.2, modelLoadSeconds: 3.1 }, false);
  assert.doesNotMatch(note, /offline/);
  assert.match(note, /webgpu/);
  assert.match(note, /4\.2 s/);
  assert.match(note, /3\.1 s/);
  assert.match(note, /used the AI one/);
});

test("the note carries the AI error, and a late AI says how long it waited", () => {
  assert.match(cutoutNote(poor, { kind: "failed", seconds: 0.8, error: "ONNX Runtime download failed (504)." }, true), /failed after 0\.8 s: ONNX Runtime download failed \(504\)\./);
  assert.match(cutoutNote(poor, { kind: "late", seconds: 12, warm: "still starting" }, true), /no answer in 12 s \(AI model still starting\)/);
});
