const PARENTS = Object.freeze({
  root: null,
  chest: "root",
  neck: "chest",
  head: "neck",
  leftShoulder: "chest",
  leftElbow: "leftShoulder",
  leftWrist: "leftElbow",
  rightShoulder: "chest",
  rightElbow: "rightShoulder",
  rightWrist: "rightElbow",
  leftHip: "root",
  leftKnee: "leftHip",
  leftAnkle: "leftKnee",
  rightHip: "root",
  rightKnee: "rightHip",
  rightAnkle: "rightKnee",
});

export const SKELETON_JOINTS = Object.freeze(Object.keys(PARENTS));
export const SKELETON_PARENTS = PARENTS;

const finite = (value) => Number.isFinite(Number(value));
const point = (value) => value && finite(value.x) && finite(value.y);

export function validateSkeleton(value) {
  if (!value || value.schema !== "spriteforge-skeleton-v1") throw new TypeError("Unsupported skeleton schema");
  if (!value.canvas || !finite(value.canvas.width) || !finite(value.canvas.height) || value.canvas.width < 1 || value.canvas.height < 1) throw new TypeError("Invalid skeleton canvas");
  for (const joint of SKELETON_JOINTS) if (!point(value.joints?.[joint])) throw new TypeError(`Missing or invalid joint: ${joint}`);
  return value;
}

export function skeletonBounds(value) {
  const skeleton = validateSkeleton(value);
  const points = SKELETON_JOINTS.map((joint) => skeleton.joints[joint]);
  const xs = points.map(({ x }) => Number(x));
  const ys = points.map(({ y }) => Number(y));
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export function boneMetrics(value) {
  const skeleton = validateSkeleton(value);
  return Object.fromEntries(SKELETON_JOINTS.filter((joint) => PARENTS[joint]).map((joint) => {
    const child = skeleton.joints[joint];
    const parent = skeleton.joints[PARENTS[joint]];
    const dx = child.x - parent.x;
    const dy = child.y - parent.y;
    return [joint, { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) }];
  }));
}

const shortestAngle = (from, to) => {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

export function interpolateMotionPose(from, to, amount) {
  const t = Math.max(0, Math.min(1, Number(amount)));
  const joints = new Set([...Object.keys(from?.angleDelta || {}), ...Object.keys(to?.angleDelta || {})]);
  const angleDelta = {};
  for (const joint of joints) {
    const a = Number(from?.angleDelta?.[joint] || 0);
    const b = Number(to?.angleDelta?.[joint] || 0);
    angleDelta[joint] = a + shortestAngle(a, b) * t;
  }
  return {
    root: {
      x: Number(from?.root?.x || 0) + (Number(to?.root?.x || 0) - Number(from?.root?.x || 0)) * t,
      y: Number(from?.root?.y || 0) + (Number(to?.root?.y || 0) - Number(from?.root?.y || 0)) * t,
    },
    angleDelta,
  };
}

export function sampleMotion(template, progress) {
  if (!template?.keyframes?.length) throw new TypeError("Motion template has no keyframes");
  const loop = template.loop !== false;
  let t = Number(progress);
  if (!Number.isFinite(t)) t = 0;
  t = loop ? ((t % 1) + 1) % 1 : Math.max(0, Math.min(1, t));
  const frames = [...template.keyframes].sort((a, b) => a.at - b.at);
  const extended = loop ? [...frames, { ...frames[0], at: 1 }] : frames;
  if (t <= extended[0].at) return interpolateMotionPose(extended[0], extended[0], 0);
  for (let index = 0; index < extended.length - 1; index += 1) {
    const from = extended[index];
    const to = extended[index + 1];
    if (t <= to.at) return interpolateMotionPose(from, to, (t - from.at) / Math.max(1e-9, to.at - from.at));
  }
  return interpolateMotionPose(extended.at(-1), extended.at(-1), 0);
}

export function applyMotionPose(sourceValue, pose) {
  const source = validateSkeleton(sourceValue);
  const metrics = boneMetrics(source);
  const bounds = skeletonBounds(source);
  const height = Math.max(1, bounds.height);
  const root = source.joints.root;
  const joints = { root: { ...root, x: root.x + Number(pose?.root?.x || 0) * height, y: root.y + Number(pose?.root?.y || 0) * height } };
  for (const joint of SKELETON_JOINTS.slice(1)) {
    const parentName = PARENTS[joint];
    const parent = joints[parentName];
    const base = metrics[joint];
    const angle = base.angle + Number(pose?.angleDelta?.[joint] || 0);
    joints[joint] = { x: parent.x + Math.cos(angle) * base.length, y: parent.y + Math.sin(angle) * base.length, confidence: source.joints[joint].confidence ?? 1, visible: source.joints[joint].visible !== false };
  }
  return { ...source, joints, source: { ...(source.source || {}), motionGenerated: true } };
}

export function createMotionSkeletons(source, template, count) {
  validateSkeleton(source);
  const total = Math.max(2, Math.min(32, Math.trunc(Number(count) || 2)));
  return Array.from({ length: total }, (_, index) => {
    const progress = template.loop === false ? index / (total - 1) : index / total;
    return applyMotionPose(source, sampleMotion(template, progress));
  });
}

