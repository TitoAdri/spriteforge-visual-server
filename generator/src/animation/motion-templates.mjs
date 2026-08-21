const degrees = (value) => Number(value) * Math.PI / 180;
const pose = (at, root, deltas) => ({ at, root, angleDelta: Object.fromEntries(Object.entries(deltas).map(([joint, angle]) => [joint, degrees(angle)])) });

export const MOTION_TEMPLATES = Object.freeze({
  idle: Object.freeze({
    id: "idle-v1",
    loop: true,
    keyframes: Object.freeze([
      pose(0, { x: 0, y: 0 }, {}),
      pose(0.25, { x: 0, y: -0.018 }, { chest: -2, neck: 2, leftShoulder: -3, rightShoulder: 3 }),
      pose(0.5, { x: 0, y: -0.035 }, { chest: -4, neck: 4, leftShoulder: -5, rightShoulder: 5, leftElbow: 2, rightElbow: -2 }),
      pose(0.75, { x: 0, y: -0.015 }, { chest: -1, neck: 1, leftShoulder: -2, rightShoulder: 2 }),
    ]),
    protectedRegions: Object.freeze(["face", "rigid-accessories"]),
  }),
  walk: Object.freeze({
    id: "walk-v1",
    loop: true,
    keyframes: Object.freeze([
      pose(0, { x: 0, y: 0 }, { leftHip: -28, leftKnee: 18, rightHip: 25, rightKnee: -15, leftShoulder: 19, rightShoulder: -19 }),
      pose(0.125, { x: 0, y: 0.025 }, { leftHip: -15, leftKnee: 30, rightHip: 16, rightKnee: -5, leftShoulder: 12, rightShoulder: -12 }),
      pose(0.25, { x: 0, y: 0 }, { leftHip: 2, leftKnee: 40, rightHip: 3, rightKnee: 8, leftShoulder: 0, rightShoulder: 0 }),
      pose(0.375, { x: 0, y: -0.02 }, { leftHip: 19, leftKnee: 13, rightHip: -18, rightKnee: 28, leftShoulder: -14, rightShoulder: 14 }),
      pose(0.5, { x: 0, y: 0 }, { leftHip: 25, leftKnee: -15, rightHip: -28, rightKnee: 18, leftShoulder: -19, rightShoulder: 19 }),
      pose(0.625, { x: 0, y: 0.025 }, { leftHip: 16, leftKnee: -5, rightHip: -15, rightKnee: 30, leftShoulder: -12, rightShoulder: 12 }),
      pose(0.75, { x: 0, y: 0 }, { leftHip: 3, leftKnee: 8, rightHip: 2, rightKnee: 40, leftShoulder: 0, rightShoulder: 0 }),
      pose(0.875, { x: 0, y: -0.02 }, { leftHip: -18, leftKnee: 28, rightHip: 19, rightKnee: 13, leftShoulder: 14, rightShoulder: -14 }),
    ]),
    protectedRegions: Object.freeze(["face", "rigid-accessories"]),
  }),
});

export function getMotionTemplate(id) {
  const template = MOTION_TEMPLATES[id];
  if (!template) throw new TypeError(`Unknown motion template: ${id}`);
  return template;
}

