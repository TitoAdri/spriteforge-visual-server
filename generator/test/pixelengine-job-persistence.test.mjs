import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createLibrary } from "../src/library.mjs";

const uuid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

test("PixelEngine jobs persist per clip and never share an output asset", () => {
  const db = new DatabaseSync(":memory:"); const user = { id: uuid("1"), role: "admin" };
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY)"); db.prepare("INSERT INTO users (id) VALUES (?)").run(user.id);
  const library = createLibrary({ db, requireSession: () => user, publicUser: (value) => value });
  const sourceId = uuid("2"); const time = Date.now();
  db.prepare("INSERT INTO assets (id,user_id,kind,name,status,recipe_json,normalization_json,created_at,updated_at) VALUES (?,?, 'character','Source','approved','{}','{}',?,?)").run(sourceId, user.id, time, time);
  db.prepare("INSERT INTO asset_files (id,asset_id,variant,storage_key,mime_type,byte_size,sha256,created_at) VALUES (?,?, 'game-ready','source.png','image/png',100,'hash',?)").run(uuid("9"), sourceId, time);
  const makeClip = (name) => library.createAnimationClip({}, { sourceAssetId: sourceId, name, motion: "idle", provider: "pixel-engine", settings: { frameCount: 2, fps: 8, margin: 3 }, frames: [{ prompt: "Source", durationMs: 100 }, { prompt: "Motion", durationMs: 100 }] });
  const first = makeClip("First"); const second = makeClip("Second");
  const firstJob = library.createPixelEngineJob(user, { clipId: first.id, apiJobId: "remote-first", model: "pixel-engine-v1.1", prompt: "First motion", idempotencyKey: "a".repeat(20), creditExempt: false });
  const secondJob = library.createPixelEngineJob(user, { clipId: second.id, apiJobId: "remote-second", model: "pixel-engine-v1.1", prompt: "Second motion", idempotencyKey: "b".repeat(20), creditExempt: false });
  assert.equal(library.getPixelEngineJob({}, firstJob.id).job.api_job_id, "remote-first");
  library.updatePixelEngineJob(user.id, firstJob.id, { status: "pending", progress: 0.5 });
  const rows = db.prepare("SELECT id,clip_id,status,progress FROM pixelengine_jobs ORDER BY created_at,id").all();
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  assert.equal(rows.length, 2); assert.equal(rowsById.get(firstJob.id).clip_id, first.id); assert.equal(rowsById.get(secondJob.id).clip_id, second.id); assert.equal(rowsById.get(firstJob.id).status, "pending");
  const firstAsset = uuid("3"); const secondAsset = uuid("4");
  for (const assetId of [firstAsset, secondAsset]) db.prepare("INSERT INTO assets (id,user_id,kind,name,status,recipe_json,normalization_json,created_at,updated_at) VALUES (?,?, 'animation','Output','draft','{}','{}',?,?)").run(assetId, user.id, time, time);
  library.linkAnimationOutput(first.id, firstAsset); library.linkAnimationOutput(second.id, secondAsset);
  const outputs = db.prepare("SELECT clip_id,asset_id FROM animation_output_assets ORDER BY clip_id").all();
  assert.equal(new Set(outputs.map((row) => row.asset_id)).size, 2);
  assert.ok(secondJob.id);
});
