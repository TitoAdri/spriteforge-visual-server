import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { createLibrary } from "../src/library.mjs";

const uuid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const GIF = Buffer.from("47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024401003b", "hex");

function snapshot({ width = 1, height = 1, frameCount = 1, name = "Test" } = {}) {
  const layer = { name: "Layer 1", frameCount, chunks: [{ layout: [[0]], base64PNG: `data:image/png;base64,${PNG.toString("base64")}` }] };
  return {
    document: JSON.stringify({ modelVersion: 2, piskel: { name, description: "", fps: 8, width, height, layers: [JSON.stringify(layer)] } }),
    gameReadyBase64: PNG.toString("base64"),
    animationBase64: frameCount > 1 ? GIF.toString("base64") : undefined,
    width,
    height,
    frameCount,
  };
}

async function fixture() {
  const storage = await mkdtemp(path.join(tmpdir(), "spriteforge-editor-"));
  const previousStorage = process.env.SPRITEFORGE_ASSET_STORAGE_PATH;
  process.env.SPRITEFORGE_ASSET_STORAGE_PATH = storage;
  const db = new DatabaseSync(":memory:");
  const owner = { id: uuid("1"), role: "user" };
  const stranger = { id: uuid("9"), role: "user" };
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
  db.prepare("INSERT INTO users (id) VALUES (?), (?)").run(owner.id, stranger.id);
  const sessionChecks = [];
  const auth = { db, requireSession: (request, options = {}) => { sessionChecks.push(options); return request?.user || owner; }, publicUser: (user) => user };
  const library = createLibrary(auth);
  const assetId = uuid("2");
  const time = Date.now();
  db.prepare("INSERT INTO assets (id,user_id,kind,name,status,provider,recipe_json,normalization_json,created_at,updated_at) VALUES (?,?, 'character','Hero','approved','generator','{\"seed\":1}','{\"scale\":2}',?,?)").run(assetId, owner.id, time, time);
  return {
    db, owner, stranger, library, assetId, storage, sessionChecks,
    async close() {
      db.close();
      if (previousStorage == null) delete process.env.SPRITEFORGE_ASSET_STORAGE_PATH;
      else process.env.SPRITEFORGE_ASSET_STORAGE_PATH = previousStorage;
      await rm(storage, { recursive: true, force: true });
    },
  };
}

test("editor migration is repeatable and revisions retain only the latest twenty files", async () => {
  const f = await fixture();
  try {
    createLibrary({ db: f.db, requireSession: (request) => request?.user || f.owner, publicUser: (user) => user });
    let firstRevision;
    for (let number = 1; number <= 21; number += 1) {
      const saved = await f.library.saveEditorRevision({ user: f.owner }, f.assetId, snapshot({ name: `Revision ${number}` }));
      if (number === 1) firstRevision = saved.revision.id;
    }

    const rows = f.db.prepare("SELECT * FROM asset_editor_revisions WHERE asset_id=? ORDER BY revision_number").all(f.assetId);
    assert.equal(rows.length, 20);
    assert.deepEqual(rows.map((row) => row.revision_number), Array.from({ length: 20 }, (_, index) => index + 2));
    assert.equal((await f.library.editorInfo({ user: f.owner }, f.assetId)).currentRevision.number, 21);
    const current = f.db.prepare("SELECT storage_key FROM asset_files WHERE asset_id=? AND variant='game-ready'").get(f.assetId);
    assert.equal(current.storage_key, rows.at(-1).game_ready_storage_key);
    await assert.rejects(stat(path.join(f.storage, f.owner.id, f.assetId, "editor", `${firstRevision}.piskel.json`)));
    await assert.rejects(stat(path.join(f.storage, f.owner.id, f.assetId, "editor", `${firstRevision}.png`)));
    assert.equal((await readFile(path.join(f.storage, rows[0].document_storage_key), "utf8")).includes("Revision 2"), true);
  } finally { await f.close(); }
});

test("animated saves publish GIF, static saves remove only the current animation mapping", async () => {
  const f = await fixture();
  try {
    await f.library.saveEditorRevision({ user: f.owner }, f.assetId, snapshot({ frameCount: 2 }));
    const animated = await f.library.editorInfo({ user: f.owner }, f.assetId);
    assert.equal(animated.asset.files.animation.mimeType, "image/gif");
    const firstRevision = animated.currentRevision.id;

    await f.library.saveEditorRevision({ user: f.owner }, f.assetId, snapshot());
    const current = await f.library.editorInfo({ user: f.owner }, f.assetId);
    assert.equal(current.asset.files.animation, undefined);
    assert.equal(current.revisions.length, 2);
    assert.equal((await f.library.fetchEditorRevision({ user: f.owner }, f.assetId, firstRevision)).bytes.length > 0, true);
  } finally { await f.close(); }
});

test("save as new inherits asset metadata and isolates editor documents by owner", async () => {
  const f = await fixture();
  try {
    const copy = await f.library.copyEditorAsset({ user: f.owner }, f.assetId, { name: "Hero — edit", ...snapshot() });
    const row = f.db.prepare("SELECT * FROM assets WHERE id=?").get(copy.asset.id);
    assert.equal(row.parent_asset_id, f.assetId);
    assert.equal(row.kind, "character");
    assert.equal(row.recipe_json, '{"seed":1}');
    assert.equal(row.normalization_json, '{"scale":2}');
    assert.equal((await f.library.editorInfo({ user: f.owner }, copy.asset.id)).revisions.length, 1);

    await assert.rejects(f.library.editorInfo({ user: f.stranger }, f.assetId), (error) => error.status === 404 && error.code === "not_found");
    await assert.rejects(f.library.saveEditorRevision({ user: f.stranger }, f.assetId, snapshot()), (error) => error.status === 404 && error.code === "not_found");
    await assert.rejects(f.library.copyEditorAsset({ user: f.stranger }, f.assetId, { name: "Stolen", ...snapshot() }), (error) => error.status === 404 && error.code === "not_found");
  } finally { await f.close(); }
});

test("manual uploads validate real signatures and editor snapshots reject forged metadata", async () => {
  const f = await fixture();
  try {
    const request = Readable.from([PNG]);
    request.user = f.owner;
    request.headers = { "x-asset-name": encodeURIComponent("Uploaded hero"), "x-asset-kind": "character" };
    const upload = await f.library.uploadEditorAsset(request);
    assert.equal(upload.asset.status, "draft");
    assert.equal(upload.asset.files.original.mimeType, "image/png");
    assert.equal(f.sessionChecks.at(-1).csrf, true);

    const processed = Readable.from([PNG]);
    processed.user = f.owner;
    processed.headers = { ...request.headers, "x-spriteforge-pixel-art": "1" };
    const processedUpload = await f.library.uploadEditorAsset(processed);
    assert.equal(processedUpload.asset.files["game-ready"].mimeType, "image/png");

    const invalid = Readable.from([Buffer.from("not an image")]);
    invalid.user = f.owner;
    invalid.headers = request.headers;
    await assert.rejects(f.library.uploadEditorAsset(invalid), (error) => error.status === 415);
    await assert.rejects(f.library.saveEditorRevision({ user: f.owner }, f.assetId, { ...snapshot(), width: 1025 }), (error) => error.status === 400);
    await assert.rejects(f.library.saveEditorRevision({ user: f.owner }, f.assetId, snapshot({ width: 2 })), (error) => error.code === "invalid_editor_image_metadata");
    await assert.rejects(f.library.saveEditorRevision({ user: f.owner }, f.assetId, { ...snapshot(), gameReadyBase64: Buffer.from("fake png data").toString("base64") }), (error) => error.status === 415);
    const secondUpload = Readable.from([PNG]);
    secondUpload.user = f.stranger;
    secondUpload.headers = request.headers;
    const strangerUpload = await f.library.uploadEditorAsset(secondUpload);
    assert.equal(strangerUpload.asset.user_id, f.stranger.id);
  } finally { await f.close(); }
});

test("animation editor privately converts every source frame into an editable GIF", async () => {
  const f = await fixture();
  try {
    const animationId = uuid("3");
    const rawFrames = Buffer.from([255, 70, 0, 255, 20, 80, 255, 255]);
    const sourceGif = await sharp(rawFrames, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).gif({ loop: 0, delay: [100, 200] }).toBuffer();
    const folder = path.join(f.storage, f.owner.id, animationId); await mkdir(folder, { recursive: true }); await writeFile(path.join(folder, "animation.gif"), sourceGif);
    const time = Date.now();
    f.db.prepare("INSERT INTO assets (id,user_id,kind,name,status,provider,recipe_json,normalization_json,created_at,updated_at) VALUES (?,?, 'animation','Flame loop','draft','pixel-engine','{}','{}',?,?)").run(animationId, f.owner.id, time, time);
    f.db.prepare("INSERT INTO asset_files (id,asset_id,variant,storage_key,mime_type,byte_size,sha256,created_at) VALUES (?,?, 'animation',?,?,?,?,?)").run(uuid("4"), animationId, path.join(f.owner.id, animationId, "animation.gif"), "image/gif", sourceGif.length, "test", time);

    const info = await f.library.editorInfo({ user: f.owner }, animationId);
    assert.equal(info.mode, "animation");
    assert.equal(info.animationImport.frameCount, 2);
    assert.equal(info.animationImport.fps, 7);
    assert.match(info.animationImport.url, /\/editor\/import$/);
    const imported = await f.library.fetchEditorAnimationImport({ user: f.owner }, animationId);
    assert.equal(imported.mimeType, "image/gif");
    const importedMetadata = await sharp(imported.bytes, { animated: true }).metadata();
    assert.equal(importedMetadata.pages, 2);
    assert.equal(importedMetadata.delay[0], importedMetadata.delay[1]);

    const sourceWebp = await sharp(rawFrames, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).webp({ loop: 0, delay: [100, 200], lossless: true }).toBuffer();
    await writeFile(path.join(folder, "animation.webp"), sourceWebp);
    f.db.prepare("UPDATE asset_files SET storage_key=?, mime_type=?, byte_size=? WHERE asset_id=? AND variant='animation'").run(path.join(f.owner.id, animationId, "animation.webp"), "image/webp", sourceWebp.length, animationId);
    const webpInfo = await f.library.editorInfo({ user: f.owner }, animationId);
    assert.equal(webpInfo.animationImport.frameCount, 2);
    assert.equal((await sharp((await f.library.fetchEditorAnimationImport({ user: f.owner }, animationId)).bytes, { animated: true }).metadata()).pages, 2);

    await f.library.saveEditorRevision({ user: f.owner }, animationId, snapshot({ frameCount: 2, name: "Edited flame" }));
    const reopened = await f.library.editorInfo({ user: f.owner }, animationId);
    assert.equal(reopened.currentRevision.frameCount, 2);
    assert.equal(reopened.animationImport, null);
    const copied = await f.library.copyEditorAsset({ user: f.owner }, animationId, { name: "Flame loop — edit", ...snapshot({ frameCount: 2 }) });
    assert.equal(copied.asset.kind, "animation");
    await assert.rejects(f.library.fetchEditorAnimationImport({ user: f.stranger }, animationId), (error) => error.status === 404 && error.code === "not_found");
  } finally { await f.close(); }
});

test("animation editor rejects corrupt private animation sources", async () => {
  const f = await fixture();
  try {
    const animationId = uuid("5"); const folder = path.join(f.storage, f.owner.id, animationId); await mkdir(folder, { recursive: true }); await writeFile(path.join(folder, "animation.gif"), Buffer.from("not a gif"));
    const time = Date.now();
    f.db.prepare("INSERT INTO assets (id,user_id,kind,name,status,provider,recipe_json,normalization_json,created_at,updated_at) VALUES (?,?, 'animation','Broken loop','draft','pixel-engine','{}','{}',?,?)").run(animationId, f.owner.id, time, time);
    f.db.prepare("INSERT INTO asset_files (id,asset_id,variant,storage_key,mime_type,byte_size,sha256,created_at) VALUES (?,?, 'animation',?,?,?,?,?)").run(uuid("6"), animationId, path.join(f.owner.id, animationId, "animation.gif"), "image/gif", 9, "test", time);
    await assert.rejects(f.library.editorInfo({ user: f.owner }, animationId), (error) => error.status === 415 && error.code === "invalid_animation");
  } finally { await f.close(); }
});
