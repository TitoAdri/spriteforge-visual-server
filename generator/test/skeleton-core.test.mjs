import test from "node:test";
import assert from "node:assert/strict";
import { boneMetrics, createMotionSkeletons, sampleMotion, validateSkeleton } from "../src/animation/skeleton-core.mjs";
import { MOTION_TEMPLATES } from "../src/animation/motion-templates.mjs";

const source = {
  schema: "spriteforge-skeleton-v1",
  canvas: { width: 64, height: 64 },
  joints: {
    root: { x: 32, y: 38 }, chest: { x: 32, y: 27 }, neck: { x: 32, y: 21 }, head: { x: 32, y: 15 },
    leftShoulder: { x: 27, y: 25 }, leftElbow: { x: 24, y: 32 }, leftWrist: { x: 23, y: 39 },
    rightShoulder: { x: 37, y: 25 }, rightElbow: { x: 40, y: 32 }, rightWrist: { x: 41, y: 39 },
    leftHip: { x: 29, y: 39 }, leftKnee: { x: 28, y: 49 }, leftAnkle: { x: 27, y: 59 },
    rightHip: { x: 35, y: 39 }, rightKnee: { x: 36, y: 49 }, rightAnkle: { x: 37, y: 59 },
  },
};

test("rejects incomplete skeletons", () => {
  assert.throws(() => validateSkeleton({ schema: "spriteforge-skeleton-v1", canvas: { width: 64, height: 64 }, joints: {} }), /root/);
});

test("retargeting preserves every bone length", () => {
  const expected = boneMetrics(source);
  const frames = createMotionSkeletons(source, MOTION_TEMPLATES.walk, 8);
  for (const frame of frames) {
    const actual = boneMetrics(frame);
    for (const joint of Object.keys(expected)) assert.ok(Math.abs(actual[joint].length - expected[joint].length) < 1e-8, joint);
  }
});

test("loop templates close exactly at progress one", () => {
  assert.deepEqual(sampleMotion(MOTION_TEMPLATES.idle, 0), sampleMotion(MOTION_TEMPLATES.idle, 1));
  assert.deepEqual(sampleMotion(MOTION_TEMPLATES.walk, 0), sampleMotion(MOTION_TEMPLATES.walk, 1));
});

test("motion generation is deterministic", () => {
  assert.deepEqual(createMotionSkeletons(source, MOTION_TEMPLATES.idle, 4), createMotionSkeletons(source, MOTION_TEMPLATES.idle, 4));
});
