// node --test scripts/*.test.mjs (Node 24 runs the TypeScript module as is).
import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeLeftover, readMark, runningMark } from "../src/lib/ai/guess-crash.ts";

const LIGHT = "Xenova/mobileclip_s0";
const FULL = "onnx-community/Florence-2-base-ft";

test("the running mark keeps the step a guess reached, spaces and all", () => {
  const mark = runningMark("p1", LIGHT, "loading the light eyes' model (since 3:01:02 AM)");
  assert.deepEqual(readMark(mark), { page: "p1", model: LIGHT, stage: "loading the light eyes' model (since 3:01:02 AM)" });
});

test("a mark left by 0.2.2 (no step) still reads", () => {
  assert.deepEqual(readMark(`p1 ${LIGHT}`), { page: "p1", model: LIGHT, stage: "" });
});

test("nothing left running, or a guess of this page, is no crash", () => {
  assert.deepEqual(judgeLeftover(null, "p2", LIGHT, 0), { kind: "none" });
  assert.deepEqual(judgeLeftover(runningMark("p2", LIGHT, "looking"), "p2", LIGHT, 0), { kind: "none" });
});

test("one light-eyes guess cut short: the next guess tries again", () => {
  assert.deepEqual(judgeLeftover(runningMark("p1", LIGHT, "looking"), "p2", LIGHT, 0), {
    kind: "retry",
    stage: "looking",
    crashes: 1,
  });
});

test("two light-eyes guesses cut short in a row: guessing rests for this page life, the count starts over", () => {
  assert.deepEqual(judgeLeftover(runningMark("p1", LIGHT, "looking"), "p2", LIGHT, 1), { kind: "rest", stage: "looking" });
});

test("a full-eyes guess cut short moves the device to the light eyes", () => {
  assert.deepEqual(judgeLeftover(runningMark("p1", FULL, "looking"), "p2", LIGHT, 0), { kind: "full-eyes", stage: "looking" });
});
