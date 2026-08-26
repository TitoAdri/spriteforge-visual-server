import sharp from "sharp";

export const ISOMETRIC_DIRECTIONS = Object.freeze(["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"]);
export const PLATFORMER_DIRECTIONS = Object.freeze(["left", "right"]);
export const TURNAROUND_BODY_TYPES = Object.freeze(["biped", "quadruped", "other"]);
export const PLATFORMER_EQUIPMENT_MODES = Object.freeze(["screen-locked", "physical-side"]);

const cleanNote = (value) => String(value || "").trim().replace(/\s+/g, " ");
class TurnaroundError extends Error { constructor(code, message) { super(message); this.status = 400; this.code = code; } }

export function normalizeTurnaround(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TurnaroundError("invalid_turnaround", "Sprite turnaround settings are required");
  const sourceAssetId = String(input.sourceAssetId || "");
  if (!/^[0-9a-f-]{36}$/i.test(sourceAssetId)) throw new TurnaroundError("invalid_turnaround_source", "Choose a valid source asset");
  const projection = String(input.projection || "").toLowerCase();
  if (!["platformer", "isometric"].includes(projection)) throw new TurnaroundError("invalid_turnaround_projection", "Choose platformer or isometric");
  const directionCount = projection === "platformer" ? 2 : Number(input.directionCount || 8);
  if (projection === "isometric" && ![4, 8].includes(directionCount)) throw new TurnaroundError("invalid_turnaround_direction_count", "Isometric turnarounds support 4 or 8 directions");
  const allowed = projection === "platformer" ? PLATFORMER_DIRECTIONS : ISOMETRIC_DIRECTIONS;
  const sourceDirection = String(input.sourceDirection || "").toLowerCase();
  const targetDirection = String(input.targetDirection || "").toLowerCase();
  if (!allowed.includes(sourceDirection) || !allowed.includes(targetDirection)) throw new TurnaroundError("invalid_turnaround_direction", "Choose valid source and target directions");
  if (projection === "isometric" && directionCount === 4 && (!["up-right", "down-right", "down-left", "up-left"].includes(sourceDirection) || !["up-right", "down-right", "down-left", "up-left"].includes(targetDirection))) throw new TurnaroundError("invalid_turnaround_direction", "Four-direction isometric turnarounds use the diagonal game directions");
  if (sourceDirection === targetDirection) throw new TurnaroundError("unchanged_turnaround_direction", "Target direction must differ from source direction");
  const bodyType = String(input.bodyType || "biped").toLowerCase();
  if (!TURNAROUND_BODY_TYPES.includes(bodyType)) throw new TurnaroundError("invalid_turnaround_body_type", "Choose a valid body type");
  const equipmentMode = projection === "platformer" ? String(input.equipmentMode || "screen-locked").toLowerCase() : "physical-side";
  if (!PLATFORMER_EQUIPMENT_MODES.includes(equipmentMode)) throw new TurnaroundError("invalid_turnaround_equipment_mode", "Choose a valid equipment placement mode");
  const hiddenDetails = cleanNote(input.hiddenDetails);
  if (hiddenDetails.length > 500) throw new TurnaroundError("invalid_turnaround_hidden_details", "Hidden-side notes must be 500 characters or fewer");
  return { sourceAssetId, projection, directionCount, sourceDirection, targetDirection, bodyType, equipmentMode, hiddenDetails };
}

export function turnaroundView(turnaround) {
  if (turnaround.projection === "platformer") return turnaround.targetDirection === "left" ? "left-profile" : "right-profile";
  return "isometric";
}

async function alphaMask(bytes, { mirror = false } = {}) {
  let pipeline = sharp(bytes, { animated: false, limitInputPixels: 16_000_000 }).rotate().ensureAlpha();
  if (mirror) pipeline = pipeline.flop();
  const { data, info } = await pipeline.resize({ width: 64, height: 64, fit: "contain", position: "south", kernel: sharp.kernel.nearest, background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) mask[pixel] = data[pixel * info.channels + 3] >= 96 ? 1 : 0;
  return mask;
}

const maskDistance = (first, second) => { let different = 0; for (let index = 0; index < first.length; index += 1) if (first[index] !== second[index]) different += 1; return different / first.length; };

export async function assessPlatformerTurnaround(sourceBytes, resultBytes) {
  const [source, mirrored, result] = await Promise.all([alphaMask(sourceBytes), alphaMask(sourceBytes, { mirror: true }), alphaMask(resultBytes)]);
  const sameFacingDistance = maskDistance(source, result);
  const targetFacingDistance = maskDistance(mirrored, result);
  const clearlyUnchanged = sameFacingDistance + 0.025 < targetFacingDistance && sameFacingDistance < targetFacingDistance * 0.88;
  return { changed: !clearlyUnchanged, sameFacingDistance, targetFacingDistance };
}
