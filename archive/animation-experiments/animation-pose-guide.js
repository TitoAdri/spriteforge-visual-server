import { alphaBounds, autoRig, deformSprite, motionRigs } from "./animation2-core.js?v=7";

export function walkPoseGuide(source, index, total) {
  if (!source?.data || !Number.isInteger(source.width) || !Number.isInteger(source.height)) throw new TypeError("A source ImageData is required");
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 2 || index < 0 || index >= total) throw new TypeError("Invalid walk guide position");
  const rig = autoRig(source);
  const canonical = motionRigs(rig, "walk", Math.max(1, alphaBounds(source).height));
  const canonicalIndex = Math.round(index * canonical.length / total) % canonical.length;
  return deformSprite(source, rig, canonical[canonicalIndex], { lockGround: true });
}
