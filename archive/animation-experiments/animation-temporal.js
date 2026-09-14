export const TEMPORAL_EDIT_MOTIONS = new Set(["idle", "walk"]);

const IDLE_PHASES = [
  "approved neutral exhale pose; feet and bottom pivot remain exactly fixed",
  "early inhale: chest expands slightly, shoulders rise by about one logical pixel, head follows subtly, loose cloth begins to lag",
  "peak inhale: readable but restrained chest and shoulder lift, head at its highest point, hanging accessories displaced slightly outward",
  "early exhale: torso settles, shoulders descend, loose cloth and carried accessories trail behind the body",
  "settled exhale: weight returns through the hips while both feet remain planted and unchanged",
  "secondary settle: tiny opposite sway in loose cloth or a carried prop, with torso nearly neutral",
  "late recovery: chest and shoulders approach the approved source pose",
  "loop bridge: almost the approved source pose, prepared to transition into frame 1 without a jump",
];

const WALK_PHASES = [
  "first contact pose derived from the approved source: near leg reaches forward and far leg reaches back; opposite arm swing; both feet readable",
  "first down pose: weight transfers onto the forward foot, knee bends and hips lower slightly; rear heel lifts",
  "first passing pose: rear leg passes beneath the hips while the supporting leg is nearly vertical; arms cross their neutral swing",
  "first up pose: passing leg advances, supporting heel rises and hips reach their highest point",
  "opposite contact pose: far leg reaches forward and near leg reaches back; arm swing is the exact opposite of the first contact",
  "opposite down pose: weight transfers onto the new forward foot, knee bends and hips lower slightly; previous heel lifts",
  "opposite passing pose: previous rear leg passes beneath the hips while the new supporting leg is nearly vertical; arms cross neutral",
  "opposite up and loop bridge: near leg advances toward the initial contact, supporting heel rises, pose prepares a smooth return to frame 1",
];
const WALK_LOOP_BRIDGE = "near-neutral loop bridge: both feet return close to the approved source stance, with only a small residual opposite arm swing; this frame must connect smoothly and without a jump back to frame 1";

const phaseTable = { idle: IDLE_PHASES, walk: WALK_PHASES };

export function temporalPhaseFor(motion, index, total) {
  const phases = phaseTable[motion];
  if (!phases) throw new TypeError(`Unsupported temporal edit motion: ${motion}`);
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 2 || index >= total) throw new TypeError("Invalid temporal frame position");
  if (index === 0) return motion === "walk" ? "approved source stance used as the loop origin" : phases[0];
  if (motion === "walk" && total === 2) return "opposite contact pose: far leg reaches forward and near leg reaches back; opposite arm swing; readable bridge back to the source stance";
  if (motion === "walk" && total === 4) return [
    null,
    phases[0],
    phases[4],
    WALK_LOOP_BRIDGE,
  ][index];
  if (motion === "walk" && total === 8) return [null, phases[0], phases[1], phases[2], phases[4], phases[5], phases[6], WALK_LOOP_BRIDGE][index];
  // The source is frame zero. Reserve the final generated slot as a loop
  // bridge and distribute the remaining frames across both half-steps.
  const phaseIndex = motion === "walk"
    ? (index === total - 1 ? phases.length - 1 : Math.min(phases.length - 2, Math.round((index - 1) * (phases.length - 1) / Math.max(1, total - 1))))
    : Math.min(phases.length - 1, Math.round(index * phases.length / total));
  return phases[phaseIndex];
}

export function temporalEditPrompt({ motion, index, total, userPrompt = "", retryReason = "" }) {
  const phase = temporalPhaseFor(motion, index, total);
  const movementRules = motion === "idle"
    ? "Both feet stay planted on exactly the same ground pixels. Motion comes from articulated breathing, shoulders, head and secondary cloth or accessory follow-through; never translate, resize or globally squash the character."
    : "This is an in-place walk cycle. Articulate hips, knees, ankles, shoulders and elbows. The two legs must exchange front/back roles across the cycle. Keep one supporting foot on the shared baseline; do not slide the whole character, merely open and close both legs, or simulate motion with global wobble.";
  return [
    `Edit the approved sprite into frame ${index + 1} of ${total} of a ${motion} loop.`,
    `Target phase: ${phase}.`,
    userPrompt ? `User motion direction: ${userPrompt}.` : "",
    "Image 1 is the immutable identity master. It exclusively controls character identity, face, anatomy, costume construction, accessories, colours, outline, apparent pixel size, facing direction and camera. Copy every visible identifying item from Image 1 into the result; none may disappear or change shape.",
    "Image 2 is the immediately preceding accepted animation frame. Use it only for temporal continuity and make one logical movement step from it; do not copy defects or allow identity drift.",
    motion === "walk" ? "Image 3, when supplied, is a deterministic full-sprite pose guide made from Image 1. Copy its hip, knee, ankle, boot, shoulder and elbow positions and its limb overlap order. Use it only for articulation: Image 1 still controls every color, pixel cluster, costume detail, face and accessory." : "If another temporal reference is supplied, it is an approved future keyframe or loop boundary. Progress toward it without changing the character design.",
    movementRules,
    motion === "walk" ? "The pose guide is authoritative for which leg is forward and which is behind. Do not replace its articulation with the preceding frame's leading leg." : "",
    motion === "walk" ? "The near and far legs are two persistent anatomical limbs, not interchangeable shapes. Across opposite-contact phases their screen positions and overlap order must visibly exchange: the leg that was behind advances and becomes readable while the former front leg recedes. Show two distinct boots whenever the pose permits. Keep the entire head, hood, goggles, face, scarf, torso, belt, pouches, shoulder decoration and cape visually identical to Image 1 and in the same arrangement relative to the torso. The copper lantern is a rigid signature prop: it must remain fully visible in the exact same hand, with the exact same attachment point, silhouette, size, colors and pixel clusters in every frame. Never omit it, swap hands, shrink it, merge it into clothing or replace it. Achieve the walk through legs, feet, arms and restrained secondary cloth motion, not by redesigning or simplifying the body." : "Keep all costume pieces and carried accessories present and attached at their original points throughout the breathing motion.",
    "Keep the same canvas, bottom-center pivot and ground baseline. Preserve hard pixel clusters and transparent/chroma background separation. Return exactly one frame, never a contact sheet.",
    "No duplicate limbs, disappearing limbs, new accessories, changed facial features, camera movement, glow, particles, motion blur, speed lines, text or scenery.",
    retryReason ? `Previous attempt was rejected because ${retryReason}. Correct that defect while obeying every identity and movement lock above.` : "",
  ].filter(Boolean).join(" ");
}
