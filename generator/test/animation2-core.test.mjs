import test from "node:test";
import assert from "node:assert/strict";
import { alphaBounds, applyRigPose, autoRig, deformSprite, motionRigs, MOTION2, RIG_JOINTS, RIG_PARENTS } from "../../animation2-core.js";

const image = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
for (let y = 2; y < 15; y += 1) for (let x = 4; x < 12; x += 1) image.data.set([20, 80, 160, 255], (y * 16 + x) * 4);

test("auto rig follows the alpha bounds", () => {
  assert.deepEqual(alphaBounds(image), { left: 4, top: 2, right: 11, bottom: 14, width: 8, height: 13 });
  const rig = autoRig(image);
  for (const joint of RIG_JOINTS) assert.ok(Number.isFinite(rig[joint].x) && Number.isFinite(rig[joint].y));
});

test("motion retargeting preserves bone lengths", () => {
  const rig = autoRig(image);
  for (const pose of motionRigs(rig, "walk", 13)) for (const joint of RIG_JOINTS.filter((name) => RIG_PARENTS[name])) {
    const parent = RIG_PARENTS[joint];
    const before = Math.hypot(rig[joint].x - rig[parent].x, rig[joint].y - rig[parent].y);
    const after = Math.hypot(pose[joint].x - pose[parent].x, pose[joint].y - pose[parent].y);
    assert.ok(Math.abs(before - after) < 1e-8);
  }
});

test("all declared motions produce their advertised frame count", () => {
  const rig = autoRig(image);
  for (const [motion, metadata] of Object.entries(MOTION2)) assert.equal(motionRigs(rig, motion, 13).length, metadata.frames);
});

test("sprite deformation is deterministic and keeps visible pixels", () => {
  const rig = autoRig(image);
  const target = applyRigPose(rig, { rootX: .05, rootY: 0, angles: { leftElbow: .4 } }, 13);
  const first = deformSprite(image, rig, target);
  const second = deformSprite(image, rig, target);
  assert.deepEqual(first, second);
  assert.ok(first.data.some((value, index) => index % 4 === 3 && value > 0));
});

test("inverse deformation does not leave enclosed holes in a solid sprite", () => {
  const rig = autoRig(image);
  const target = applyRigPose(rig, { rootX: 0, rootY: 0, angles: { leftShoulder: .35, leftElbow: -.55, rightHip: -.3 } }, 13);
  const result = deformSprite(image, rig, target);
  const transparent = new Set();
  for (let y = 0; y < result.height; y += 1) for (let x = 0; x < result.width; x += 1) {
    if (result.data[(y * result.width + x) * 4 + 3] < 8) transparent.add(`${x},${y}`);
  }
  const outside = new Set(); const queue = [];
  for (let x = 0; x < result.width; x += 1) queue.push([x, 0], [x, result.height - 1]);
  for (let y = 0; y < result.height; y += 1) queue.push([0, y], [result.width - 1, y]);
  while (queue.length) {
    const [x, y] = queue.shift(), key = `${x},${y}`;
    if (!transparent.has(key) || outside.has(key)) continue;
    outside.add(key);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) if (x + dx >= 0 && y + dy >= 0 && x + dx < result.width && y + dy < result.height) queue.push([x + dx, y + dy]);
  }
  assert.equal([...transparent].filter((key) => !outside.has(key)).length, 0);
});

test("ground lock keeps non-jump poses on the source baseline", () => {
  const rig = autoRig(image);
  const target = applyRigPose(rig, { rootX: 0, rootY: -.25, angles: { chest: .15 } }, 13);
  const locked = deformSprite(image, rig, target, { lockGround: true });
  const unlocked = deformSprite(image, rig, target, { lockGround: false });
  assert.equal(alphaBounds(locked).bottom, alphaBounds(image).bottom);
  assert.notEqual(alphaBounds(unlocked).bottom, alphaBounds(image).bottom);
});

test("walk cycle articulates limbs without spreading the hip sockets", () => {
  const rig = autoRig(image), walk = motionRigs(rig, "walk", 13);
  const hipWidths = walk.map((pose) => Math.abs(pose.rightHip.x - pose.leftHip.x));
  const ankleTravel = Math.max(...walk.map((pose) => pose.leftAnkle.x)) - Math.min(...walk.map((pose) => pose.leftAnkle.x));
  assert.ok(Math.max(...hipWidths) - Math.min(...hipWidths) < 1e-8);
  assert.ok(ankleTravel > 1);
});

test("walk skinning moves pixels belonging to both legs", () => {
  const sprite = { width: 32, height: 40, data: new Uint8ClampedArray(32 * 40 * 4) };
  const paint = (left, right, top, bottom, color) => { for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) sprite.data.set([...color, 255], (y * sprite.width + x) * 4); };
  paint(8, 23, 3, 21, [80, 80, 80]);
  paint(9, 13, 20, 37, [220, 40, 40]);
  paint(18, 22, 20, 37, [40, 80, 220]);
  const rig = autoRig(sprite), frames = motionRigs(rig, "walk", 35).map((pose) => deformSprite(sprite, rig, pose, { lockGround: false }));
  const centroidX = (frame, color) => { let total = 0, count = 0; for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) { const offset = (y * frame.width + x) * 4; if (frame.data[offset] === color[0] && frame.data[offset + 1] === color[1] && frame.data[offset + 2] === color[2]) { total += x; count += 1; } } return total / count; };
  const left = frames.map((frame) => centroidX(frame, [220, 40, 40])), right = frames.map((frame) => centroidX(frame, [40, 80, 220]));
  assert.ok(Math.max(...left) - Math.min(...left) > 1.5);
  assert.ok(Math.max(...right) - Math.min(...right) > 1.5);
});
