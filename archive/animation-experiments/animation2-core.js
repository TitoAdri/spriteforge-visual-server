export const RIG_PARENTS = Object.freeze({
  root: null, chest: "root", neck: "chest", head: "neck",
  leftShoulder: "chest", leftElbow: "leftShoulder", leftWrist: "leftElbow",
  rightShoulder: "chest", rightElbow: "rightShoulder", rightWrist: "rightElbow",
  leftHip: "root", leftKnee: "leftHip", leftAnkle: "leftKnee",
  rightHip: "root", rightKnee: "rightHip", rightAnkle: "rightKnee",
});

export const RIG_JOINTS = Object.freeze(Object.keys(RIG_PARENTS));
const CHILDREN = Object.freeze(RIG_JOINTS.filter((joint) => RIG_PARENTS[joint]));
const radians = (degrees) => degrees * Math.PI / 180;

export function alphaBounds(image) {
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (image.data[(y * image.width + x) * 4 + 3] < 20) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) return { left: 0, top: 0, right: image.width - 1, bottom: image.height - 1, width: image.width, height: image.height };
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

export function autoRig(image) {
  const box = alphaBounds(image);
  const at = (x, y) => ({ x: box.left + box.width * x, y: box.top + box.height * y });
  return {
    root: at(.5, .59), chest: at(.5, .37), neck: at(.5, .27), head: at(.5, .16),
    leftShoulder: at(.37, .38), leftElbow: at(.29, .51), leftWrist: at(.25, .65),
    rightShoulder: at(.63, .38), rightElbow: at(.71, .51), rightWrist: at(.75, .65),
    leftHip: at(.43, .61), leftKnee: at(.42, .78), leftAnkle: at(.4, .95),
    rightHip: at(.57, .61), rightKnee: at(.58, .78), rightAnkle: at(.6, .95),
  };
}

const METADATA = Object.freeze({
  idle: { title: "Idle", frames: 4, fps: 5, loop: true },
  walk: { title: "Walk", frames: 8, fps: 8, loop: true },
  custom: { title: "Custom", frames: 1, fps: 8, loop: true },
});

export const MOTION2 = METADATA;

const deltaPose = (rootX = 0, rootY = 0, angles = {}) => ({ rootX, rootY, angles: Object.fromEntries(Object.entries(angles).map(([joint, degrees]) => [joint, radians(degrees)])) });

const POSES = Object.freeze({
  idle: [
    deltaPose(),
    deltaPose(0, -.012, { chest: -2, neck: 2, leftShoulder: -3, rightShoulder: 3 }),
    deltaPose(0, -.026, { chest: -4, neck: 4, leftShoulder: -6, rightShoulder: 6, leftElbow: 3, rightElbow: -3 }),
    deltaPose(0, -.01, { chest: -1, neck: 1, leftShoulder: -2, rightShoulder: 2 }),
  ],
  walk: [
    // Contact: left foot forward, right foot behind.
    deltaPose(0, 0, { leftKnee: -26, leftAnkle: -12, rightKnee: 24, rightAnkle: 18, leftElbow: 14, leftWrist: 7, rightElbow: -14, rightWrist: -7 }),
    // Down/recoil: the leading leg accepts the weight; the trailing knee bends.
    deltaPose(0, .018, { leftKnee: -18, leftAnkle: 3, rightKnee: 18, rightAnkle: 32, leftElbow: 10, rightElbow: -10 }),
    // Passing: the rear leg folds and travels beneath the body.
    deltaPose(0, .006, { leftKnee: -5, leftAnkle: 0, rightKnee: -4, rightAnkle: 38, leftElbow: 3, rightElbow: -3 }),
    // Up: the passing leg reaches forward while the support leg extends behind.
    deltaPose(0, -.012, { leftKnee: 18, leftAnkle: 11, rightKnee: -22, rightAnkle: -7, leftElbow: -11, leftWrist: -5, rightElbow: 11, rightWrist: 5 }),
    // Opposite contact.
    deltaPose(0, 0, { leftKnee: 24, leftAnkle: 18, rightKnee: -26, rightAnkle: -12, leftElbow: -14, leftWrist: -7, rightElbow: 14, rightWrist: 7 }),
    // Opposite down/recoil.
    deltaPose(0, .018, { leftKnee: 18, leftAnkle: 32, rightKnee: -18, rightAnkle: 3, leftElbow: -10, rightElbow: 10 }),
    // Opposite passing.
    deltaPose(0, .006, { leftKnee: -4, leftAnkle: 38, rightKnee: -5, rightAnkle: 0, leftElbow: -3, rightElbow: 3 }),
    // Opposite up; returns cleanly to the first contact pose.
    deltaPose(0, -.012, { leftKnee: -22, leftAnkle: -7, rightKnee: 18, rightAnkle: 11, leftElbow: 11, leftWrist: 5, rightElbow: -11, rightWrist: -5 }),
  ],
  custom: [deltaPose()],
});

const metrics = (rig) => Object.fromEntries(CHILDREN.map((joint) => {
  const parent = rig[RIG_PARENTS[joint]]; const child = rig[joint];
  return [joint, { length: Math.hypot(child.x - parent.x, child.y - parent.y), angle: Math.atan2(child.y - parent.y, child.x - parent.x) }];
}));

export function applyRigPose(sourceRig, pose, characterHeight = 1) {
  const bones = metrics(sourceRig);
  const target = { root: { x: sourceRig.root.x + (pose.rootX || 0) * characterHeight, y: sourceRig.root.y + (pose.rootY || 0) * characterHeight } };
  for (const joint of CHILDREN) {
    const parent = target[RIG_PARENTS[joint]];
    const bone = bones[joint];
    const angle = bone.angle + (pose.angles?.[joint] || 0);
    target[joint] = { x: parent.x + Math.cos(angle) * bone.length, y: parent.y + Math.sin(angle) * bone.length };
  }
  return target;
}

export function motionRigs(sourceRig, motion, characterHeight = 1) {
  const poses = POSES[motion];
  if (!poses) throw new TypeError(`Unknown motion: ${motion}`);
  return poses.map((pose) => applyRigPose(sourceRig, pose, characterHeight));
}

const segmentDistance = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const amount = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / Math.max(1e-6, dx * dx + dy * dy)));
  const x = ax + dx * amount, y = ay + dy * amount;
  return (px - x) ** 2 + (py - y) ** 2;
};

const LEG_BONES = new Set(["leftHip", "leftKnee", "leftAnkle", "rightHip", "rightKnee", "rightAnkle"]);
const BONE_INDEX = Object.freeze(Object.fromEntries(CHILDREN.map((joint, index) => [joint, index])));

const boneDistance = (x, y, joint, rig, lockLegSide = false) => {
    const parent = rig[RIG_PARENTS[joint]], child = rig[joint];
    let distance = segmentDistance(x, y, parent.x, parent.y, child.x, child.y);
    if (joint === "head") distance *= .42;
    if (joint === "chest") distance *= .65;
    if (lockLegSide && LEG_BONES.has(joint)) {
      const center = (rig.leftHip.x + rig.rightHip.x) / 2;
      const margin = Math.max(1, Math.abs(rig.rightHip.x - rig.leftHip.x) * .12);
      const wrongSide = joint.startsWith("left") ? Math.max(0, x - center - margin) : Math.max(0, center - margin - x);
      distance += wrongSide ** 2 * 12;
    }
    return distance;
};

const rigSoftness = (rig) => {
  const xs = RIG_JOINTS.map((joint) => rig[joint].x), ys = RIG_JOINTS.map((joint) => rig[joint].y);
  return Math.max(1.25, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * .028);
};

const BONE_NEIGHBORS = Object.freeze({
  chest: ["neck", "leftShoulder", "rightShoulder", "leftHip", "rightHip"],
  neck: ["chest", "head"], head: ["neck"],
  leftShoulder: ["chest", "leftElbow"], leftElbow: ["leftShoulder", "leftWrist"], leftWrist: ["leftElbow"],
  rightShoulder: ["chest", "rightElbow"], rightElbow: ["rightShoulder", "rightWrist"], rightWrist: ["rightElbow"],
  leftHip: ["chest", "leftKnee"], leftKnee: ["leftHip", "leftAnkle"], leftAnkle: ["leftKnee"],
  rightHip: ["chest", "rightKnee"], rightKnee: ["rightHip", "rightAnkle"], rightAnkle: ["rightKnee"],
});

const boneBlend = (x, y, rig, softness, lockLegSide = false) => {
  let dominant = CHILDREN[0], closest = Infinity;
  for (const joint of CHILDREN) {
    const distance = boneDistance(x, y, joint, rig, lockLegSide);
    if (distance < closest) { dominant = joint; closest = distance; }
  }
  // Only directly connected body parts may share pixels. This prevents a moving
  // leg from blending with the opposite leg or the nearby torso.
  const ranked = [dominant, ...(BONE_NEIGHBORS[dominant] || [])]
    .map((joint) => ({ joint, distance: boneDistance(x, y, joint, rig, lockLegSide) }))
    .sort((a, b) => a.distance - b.distance).slice(0, 3);
  const softnessSq = softness ** 2;
  const weighted = ranked.map((entry) => ({ ...entry, weight: Math.exp(-(entry.distance - closest) / softnessSq) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  return weighted.map((entry) => ({ joint: entry.joint, weight: entry.weight / total }));
};

const transformPoint = (x, y, joint, sourceRig, targetRig) => {
  const parentName = RIG_PARENTS[joint];
  const sourceParent = sourceRig[parentName], sourceChild = sourceRig[joint];
  const targetParent = targetRig[parentName], targetChild = targetRig[joint];
  const sourceAngle = Math.atan2(sourceChild.y - sourceParent.y, sourceChild.x - sourceParent.x);
  const targetAngle = Math.atan2(targetChild.y - targetParent.y, targetChild.x - targetParent.x);
  const angle = targetAngle - sourceAngle, cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = x - sourceParent.x, dy = y - sourceParent.y;
  return { x: targetParent.x + dx * cos - dy * sin, y: targetParent.y + dx * sin + dy * cos };
};

const inverseTransformPoint = (x, y, joint, sourceRig, targetRig) => {
  const parentName = RIG_PARENTS[joint];
  const sourceParent = sourceRig[parentName], sourceChild = sourceRig[joint];
  const targetParent = targetRig[parentName], targetChild = targetRig[joint];
  const sourceAngle = Math.atan2(sourceChild.y - sourceParent.y, sourceChild.x - sourceParent.x);
  const targetAngle = Math.atan2(targetChild.y - targetParent.y, targetChild.x - targetParent.x);
  const angle = targetAngle - sourceAngle, cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = x - targetParent.x, dy = y - targetParent.y;
  return { x: sourceParent.x + dx * cos + dy * sin, y: sourceParent.y - dx * sin + dy * cos };
};

const buildSkinMap = (image, rig, softness) => {
  const bones = new Int16Array(image.width * image.height * 3); bones.fill(-1);
  const weights = new Float32Array(bones.length);
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const pixel = y * image.width + x;
    if (image.data[pixel * 4 + 3] < 8) continue;
    const influences = boneBlend(x, y, rig, softness, true);
    for (let slot = 0; slot < influences.length; slot += 1) {
      bones[pixel * 3 + slot] = BONE_INDEX[influences[slot].joint];
      weights[pixel * 3 + slot] = influences[slot].weight;
    }
  }
  return { bones, weights };
};

const skinWeight = (skin, pixel, bone) => {
  for (let slot = 0; slot < 3; slot += 1) if (skin.bones[pixel * 3 + slot] === bone) return skin.weights[pixel * 3 + slot];
  return 0;
};

const put = (output, width, height, x, y, rgba) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  if (rgba[3] >= output[offset + 3]) output.set(rgba, offset);
};

const closeInteriorCracks = (data, width, height) => {
  let current = data;
  for (let pass = 0; pass < 2; pass += 1) {
    const repaired = new Uint8ClampedArray(current);
    for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      if (current[offset + 3]) continue;
      const around = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
        .map(([dx, dy]) => ((y + dy) * width + x + dx) * 4);
      const opaque = around.filter((entry) => current[entry + 3] > 20);
      const horizontal = current[offset - 4 + 3] > 20 && current[offset + 4 + 3] > 20;
      const vertical = current[offset - width * 4 + 3] > 20 && current[offset + width * 4 + 3] > 20;
      if (opaque.length < 5 && !(opaque.length >= 4 && (horizontal || vertical))) continue;
      const source = opaque.reduce((best, entry) => current[entry + 3] > current[best + 3] ? entry : best, opaque[0]);
      repaired.set(current.slice(source, source + 4), offset);
    }
    current = repaired;
  }
  return current;
};

const lockBottomBaseline = (source, data) => {
  const target = { width: source.width, height: source.height, data };
  const offsetY = alphaBounds(source).bottom - alphaBounds(target).bottom;
  if (!offsetY) return data;
  const aligned = new Uint8ClampedArray(data.length);
  for (let y = 0; y < source.height; y += 1) {
    const targetY = y + offsetY;
    if (targetY < 0 || targetY >= source.height) continue;
    const from = y * source.width * 4, to = targetY * source.width * 4;
    aligned.set(data.slice(from, from + source.width * 4), to);
  }
  return aligned;
};

export function deformSprite(image, sourceRig, targetRig, { lockGround = true } = {}) {
  const output = new Uint8ClampedArray(image.data.length);
  const sourceSoftness = rigSoftness(sourceRig), targetSoftness = rigSoftness(targetRig);
  const skin = buildSkinMap(image, sourceRig, sourceSoftness);

  // Approximate inverse linear-blend skinning keeps neighbouring bone regions
  // continuous instead of cutting the sprite into visible nearest-bone quadrants.
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    let bestOffset = -1, bestScore = 0;
    const targets = boneBlend(x, y, targetRig, targetSoftness);
    for (const target of targets) {
      const source = inverseTransformPoint(x, y, target.joint, sourceRig, targetRig);
      const sx = Math.round(source.x), sy = Math.round(source.y);
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;
      const sourcePixel = sy * image.width + sx, sourceOffset = sourcePixel * 4;
      if (image.data[sourceOffset + 3] < 8) continue;
      const score = target.weight * skinWeight(skin, sourcePixel, BONE_INDEX[target.joint]);
      if (score > bestScore) { bestScore = score; bestOffset = sourceOffset; }
    }
    if (bestOffset >= 0) output.set(image.data.slice(bestOffset, bestOffset + 4), (y * image.width + x) * 4);
  }

  // Preserve isolated one-pixel details that can disappear under inverse sampling.
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const offset = (y * image.width + x) * 4;
    if (image.data[offset + 3] < 8) continue;
    const pixel = y * image.width + x, mapped = { x: 0, y: 0 };
    for (let slot = 0; slot < 3; slot += 1) {
      const bone = skin.bones[pixel * 3 + slot], weight = skin.weights[pixel * 3 + slot];
      if (bone < 0 || !weight) continue;
      const transformed = transformPoint(x, y, CHILDREN[bone], sourceRig, targetRig);
      mapped.x += transformed.x * weight; mapped.y += transformed.y * weight;
    }
    const targetOffset = (Math.round(mapped.y) * image.width + Math.round(mapped.x)) * 4;
    if (targetOffset < 0 || targetOffset + 3 >= output.length || output[targetOffset + 3]) continue;
    put(output, image.width, image.height, Math.round(mapped.x), Math.round(mapped.y), image.data.slice(offset, offset + 4));
  }

  const repaired = closeInteriorCracks(output, image.width, image.height);
  return { width: image.width, height: image.height, data: lockGround ? lockBottomBaseline(image, repaired) : repaired };
}
