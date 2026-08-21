import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createLibrary } from "../src/library.mjs";

const uuid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

test("animation keyframes remain locked through range retakes and timeline edits", () => {
  const db = new DatabaseSync(":memory:");
  const user = { id: uuid("1"), role: "admin" };
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
  db.prepare("INSERT INTO users (id) VALUES (?)").run(user.id);
  const auth = { db, requireSession: () => user };
  const library = createLibrary(auth);
  const sourceId = uuid("2"); const time = Date.now();
  db.prepare("INSERT INTO assets (id,user_id,kind,name,status,recipe_json,normalization_json,created_at,updated_at) VALUES (?,?, 'character','Source','approved','{}','{}',?,?)").run(sourceId, user.id, time, time);
  db.prepare("INSERT INTO asset_files (id,asset_id,variant,storage_key,mime_type,byte_size,sha256,created_at) VALUES (?,?, 'game-ready','source.png','image/png',100,'hash',?)").run(uuid("3"), sourceId, time);
  const clip = library.createAnimationClip({}, { sourceAssetId: sourceId, name: "Walk", motion: "walk", provider: "gemini", settings: { frameCount: 4, fps: 8, margin: 3 }, frames: Array.from({ length: 4 }, (_, position) => ({ prompt: position ? `Pose ${position}` : "Source", durationMs: 125 })) });
  assert.deepEqual(clip.frames.map((frame) => frame.position), [0, 1, 2, 3]);
  assert.equal(clip.frames[0].isLocked, true);

  library.insertAnimationFrame({}, clip.id, { afterPosition: 1, prompt: "Inserted pose" });
  let frames = db.prepare("SELECT * FROM animation_frames WHERE clip_id=? ORDER BY position").all(clip.id);
  assert.deepEqual(frames.map((frame) => frame.position), [0, 1, 2, 3, 4]);

  const keyAssetId = uuid("4");
  db.prepare("INSERT INTO assets (id,user_id,collection_id,parent_asset_id,kind,name,status,recipe_json,normalization_json,created_at,updated_at) VALUES (?,?,?,?, 'frame','Approved pose','approved','{}','{}',?,?)").run(keyAssetId, user.id, clip.collection_id, sourceId, time, time);
  db.prepare("INSERT INTO asset_files (id,asset_id,variant,storage_key,mime_type,byte_size,sha256,created_at) VALUES (?,?, 'game-ready','key.png','image/png',100,'hash2',?)").run(uuid("5"), keyAssetId, time);
  const keyframe = frames.find((frame) => frame.position === 2);
  library.setAnimationKeyframe({}, clip.id, keyframe.id, { assetId: keyAssetId });
  const retake = library.retakeAnimationRange({}, clip.id, { start: 1, end: 3 });
  assert.equal(retake.queued, 2);
  assert.equal(retake.locked, 1);
  frames = db.prepare("SELECT * FROM animation_frames WHERE clip_id=? ORDER BY position").all(clip.id);
  assert.equal(frames[2].role, "keyframe");
  assert.equal(frames[2].is_locked, 1);
  assert.equal(frames[2].asset_id, keyAssetId);

  library.deleteAnimationFrame({}, clip.id, frames[1].id);
  frames = db.prepare("SELECT * FROM animation_frames WHERE clip_id=? ORDER BY position").all(clip.id);
  assert.deepEqual(frames.map((frame) => frame.position), [0, 1, 2, 3]);
  assert.equal(frames.find((frame) => frame.asset_id === keyAssetId).is_locked, 1);
});
