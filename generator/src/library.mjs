import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AuthError } from "./auth.mjs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ASSET_KINDS = new Set(["character", "enemy", "npc", "item", "weapon", "prop", "environment", "building", "tile", "tileset", "texture", "ui", "ui-icon", "ui-panel", "pack", "animation", "spritesheet", "frame", "reference"]);
const FILE_VARIANTS = new Set(["original", "game-ready", "thumbnail", "animation"]);
const REFERENCE_ROLES = new Set(["style", "identity"]);
const PACK_TYPES = new Set(["inventory", "adventure-props", "scenery", "ui-icons", "custom"]);
const PACK_ITEM_TYPES = new Set(["item", "weapon", "prop", "environment", "building", "ui-icon", "ui-panel"]);
const TILESET_TYPES = new Set(["seamless-surface", "terrain-variations", "dungeon-floor", "water-lava", "interior-material", "custom"]);
const TILE_ROLES = new Set(["surface", "variation", "edge", "corner", "overlay"]);
const ANIMATION_MOTIONS = new Set(["idle", "walk", "run", "attack", "jump", "hurt", "death", "custom"]);
const now = () => Date.now();
const id = () => crypto.randomUUID();

function text(value, field, max = 160) {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw new AuthError(400, `invalid_${field}`, `Invalid ${field}`);
  return result;
}

function optionalText(value, field, max = 12000) {
  if (value == null || value === "") return null;
  return text(value, field, max);
}

function json(value, field) {
  if (value == null) return "{}";
  if (typeof value !== "object" || Array.isArray(value)) throw new AuthError(400, `invalid_${field}`, `Invalid ${field}`);
  const serialized = JSON.stringify(value);
  if (serialized.length > 100_000) throw new AuthError(400, `invalid_${field}`, `Invalid ${field}`);
  return serialized;
}

function parseJson(value) { try { return JSON.parse(value || "{}"); } catch { return {}; } }

function imageType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: "png", mimeType: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", mimeType: "image/jpeg" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { extension: "webp", mimeType: "image/webp" };
  return null;
}

function animationType(bytes, declaredType = "") {
  const type = String(declaredType).split(";")[0].toLowerCase();
  if (type === "image/webp" || (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) return { extension: "webp", mimeType: "image/webp" };
  if (type === "image/gif" || (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a"))) return { extension: "gif", mimeType: "image/gif" };
  return imageType(bytes);
}

async function readBytes(request, limit = MAX_IMAGE_BYTES) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new AuthError(413, "file_too_large", "Image is too large"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

export function createLibrary(auth) {
  const { db } = auth;
  const root = process.env.SPRITEFORGE_ASSET_STORAGE_PATH || "/data/assets";
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT, active_theme_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_user_index ON projects(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, direction TEXT, style_tags_json TEXT NOT NULL DEFAULT '[]',
      settings_json TEXT NOT NULL DEFAULT '{}', is_archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS themes_user_index ON themes(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS user_theme_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      default_theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS theme_references (
      theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(theme_id, asset_id)
    );
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
      parent_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL, theme_version INTEGER,
      kind TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      provider TEXT, model TEXT, prompt TEXT, recipe_json TEXT NOT NULL DEFAULT '{}',
      normalization_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS presets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL,
      description TEXT, recipe_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS presets_user_index ON presets(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS assets_user_index ON assets(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS assets_project_index ON assets(project_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS asset_packs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
      name TEXT NOT NULL, pack_type TEXT NOT NULL, provider TEXT NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '{}', style_tags_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS asset_packs_user_index ON asset_packs(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS asset_pack_items (
      id TEXT PRIMARY KEY, pack_id TEXT NOT NULL REFERENCES asset_packs(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, asset_type TEXT NOT NULL, brief TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(pack_id, position)
    );
    CREATE INDEX IF NOT EXISTS asset_pack_items_pack_index ON asset_pack_items(pack_id, position);
    CREATE TABLE IF NOT EXISTS tilesets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
      name TEXT NOT NULL, tileset_type TEXT NOT NULL, provider TEXT NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '{}', style_tags_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tilesets_user_index ON tilesets(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS tileset_tiles (
      id TEXT PRIMARY KEY, tileset_id TEXT NOT NULL REFERENCES tilesets(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, tile_role TEXT NOT NULL, brief TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(tileset_id, position)
    );
    CREATE INDEX IF NOT EXISTS tileset_tiles_tileset_index ON tileset_tiles(tileset_id, position);
    CREATE TABLE IF NOT EXISTS animation_clips (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      source_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
      name TEXT NOT NULL, motion TEXT NOT NULL, provider TEXT NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '{}', style_tags_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS animation_clips_user_index ON animation_clips(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS animation_frames (
      id TEXT PRIMARY KEY, clip_id TEXT NOT NULL REFERENCES animation_clips(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, prompt TEXT NOT NULL, duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      role TEXT NOT NULL DEFAULT 'generated', is_locked INTEGER NOT NULL DEFAULT 0,
      error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(clip_id, position)
    );
    CREATE INDEX IF NOT EXISTS animation_frames_clip_index ON animation_frames(clip_id, position);
    CREATE TABLE IF NOT EXISTS asset_files (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      variant TEXT NOT NULL, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at INTEGER NOT NULL,
      UNIQUE(asset_id, variant)
    );
    CREATE TABLE IF NOT EXISTS asset_references (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      reference_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      role TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(asset_id, reference_asset_id, role)
    );
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      provider TEXT, model TEXT, status TEXT NOT NULL, idempotency_key TEXT UNIQUE,
      credit_ledger_key TEXT, error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pixelengine_jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clip_id TEXT NOT NULL REFERENCES animation_clips(id) ON DELETE CASCADE,
      api_job_id TEXT NOT NULL UNIQUE, model TEXT NOT NULL, prompt TEXT NOT NULL,
      status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL UNIQUE, credit_exempt INTEGER NOT NULL DEFAULT 0,
      refund_issued INTEGER NOT NULL DEFAULT 0, cancel_requested_at INTEGER,
      asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL, error_code TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pixelengine_jobs_user_index ON pixelengine_jobs(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS animation_output_assets (
      clip_id TEXT PRIMARY KEY REFERENCES animation_clips(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
  `);

  const animationColumns = new Set(db.prepare("PRAGMA table_info(animation_frames)").all().map((column) => column.name));
  if (!animationColumns.has("role")) db.exec("ALTER TABLE animation_frames ADD COLUMN role TEXT NOT NULL DEFAULT 'generated'");
  if (!animationColumns.has("is_locked")) db.exec("ALTER TABLE animation_frames ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0");
  db.prepare("UPDATE animation_frames SET role='source', is_locked=1 WHERE position=0 AND (role!='source' OR is_locked!=1)").run();

  const owned = (table, entityId, userId) => db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(entityId, userId);
  const requireOwned = (table, entityId, userId) => { const entity = owned(table, entityId, userId); if (!entity) throw new AuthError(404, "not_found", "Resource not found"); return entity; };
  const session = (request, write = false) => auth.requireSession(request, { csrf: write });
  const assetPublic = (asset) => ({ ...asset, recipe: parseJson(asset.recipe_json), normalization: parseJson(asset.normalization_json), recipe_json: undefined, normalization_json: undefined });
  const packPublic = (pack, items) => ({ ...pack, settings: parseJson(pack.settings_json), styleTags: parseJson(pack.style_tags_json), items, settings_json: undefined, style_tags_json: undefined });
  const tilesetPublic = (tileset, tiles) => ({ ...tileset, settings: parseJson(tileset.settings_json), styleTags: parseJson(tileset.style_tags_json), tiles, settings_json: undefined, style_tags_json: undefined });
  const animationFramePublic = (frame) => ({ ...frame, isLocked: Boolean(frame.is_locked), is_locked: undefined });
  const animationPublic = (clip, frames, sourceAsset) => ({ ...clip, settings: parseJson(clip.settings_json), styleTags: parseJson(clip.style_tags_json), frames: frames.map(animationFramePublic), sourceAsset, settings_json: undefined, style_tags_json: undefined });
  const pixelJobPublic = (job) => ({ id: job.id, clipId: job.clip_id, status: job.status, progress: Number(job.progress || 0), model: job.model, assetId: job.asset_id || null, error: job.error_code || null, cancelRequested: Boolean(job.cancel_requested_at), createdAt: job.created_at, updatedAt: job.updated_at });

  const list = (request) => {
    const user = session(request);
    const defaultThemeId = db.prepare("SELECT default_theme_id FROM user_theme_preferences WHERE user_id = ?").get(user.id)?.default_theme_id || null;
    const projects = db.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC").all(user.id);
    const themeRefs = db.prepare("SELECT tr.theme_id, a.id, a.name, af.variant FROM theme_references tr JOIN themes t ON t.id = tr.theme_id JOIN assets a ON a.id = tr.asset_id LEFT JOIN asset_files af ON af.asset_id = a.id AND af.variant IN ('game-ready','original') WHERE t.user_id = ? ORDER BY af.variant = 'game-ready' DESC").all(user.id);
    const refsByTheme = new Map(); for (const ref of themeRefs) { const list = refsByTheme.get(ref.theme_id) || []; if (!list.some((item) => item.id === ref.id)) list.push({ id: ref.id, name: ref.name, url: ref.variant ? `/api/assets/${ref.id}/files/${ref.variant}` : null }); refsByTheme.set(ref.theme_id, list); }
    const themes = db.prepare("SELECT * FROM themes WHERE user_id = ? AND is_archived = 0 ORDER BY updated_at DESC").all(user.id).map((theme) => ({ ...theme, isDefault: theme.id === defaultThemeId, styleTags: parseJson(theme.style_tags_json), settings: parseJson(theme.settings_json), references: refsByTheme.get(theme.id) || [], style_tags_json: undefined, settings_json: undefined }));
    const collections = db.prepare("SELECT * FROM collections WHERE user_id = ? ORDER BY updated_at DESC").all(user.id);
    const presets = db.prepare("SELECT * FROM presets WHERE user_id = ? ORDER BY updated_at DESC").all(user.id).map((preset) => ({ ...preset, recipe: parseJson(preset.recipe_json), recipe_json: undefined }));
    const files = db.prepare("SELECT asset_id, variant, mime_type, byte_size FROM asset_files WHERE asset_id IN (SELECT id FROM assets WHERE user_id = ?)").all(user.id);
    const fileMap = new Map();
    for (const file of files) { const entry = fileMap.get(file.asset_id) || {}; entry[file.variant] = { mimeType: file.mime_type, byteSize: file.byte_size, url: `/api/assets/${file.asset_id}/files/${file.variant}` }; fileMap.set(file.asset_id, entry); }
    const references = db.prepare("SELECT ar.asset_id, ar.reference_asset_id, ar.role FROM asset_references ar JOIN assets a ON a.id = ar.asset_id WHERE a.user_id = ?").all(user.id);
    const referenceMap = new Map();
    for (const reference of references) { const entry = referenceMap.get(reference.asset_id) || []; entry.push({ assetId: reference.reference_asset_id, role: reference.role }); referenceMap.set(reference.asset_id, entry); }
    const assets = db.prepare("SELECT * FROM assets WHERE user_id = ? ORDER BY updated_at DESC").all(user.id).map((asset) => ({ ...assetPublic(asset), files: fileMap.get(asset.id) || {}, references: referenceMap.get(asset.id) || [] }));
    const packs = db.prepare("SELECT * FROM asset_packs WHERE user_id = ? ORDER BY updated_at DESC").all(user.id);
    const packItems = db.prepare("SELECT api.* FROM asset_pack_items api JOIN asset_packs ap ON ap.id = api.pack_id WHERE ap.user_id = ? ORDER BY api.position ASC").all(user.id);
    const itemsByPack = new Map();
    for (const item of packItems) { const list = itemsByPack.get(item.pack_id) || []; list.push({ ...item, asset: item.asset_id ? assets.find((asset) => asset.id === item.asset_id) || null : null }); itemsByPack.set(item.pack_id, list); }
    const tilesets = db.prepare("SELECT * FROM tilesets WHERE user_id = ? ORDER BY updated_at DESC").all(user.id);
    const tilesetTiles = db.prepare("SELECT tt.* FROM tileset_tiles tt JOIN tilesets ts ON ts.id = tt.tileset_id WHERE ts.user_id = ? ORDER BY tt.position ASC").all(user.id);
    const tilesByTileset = new Map();
    for (const tile of tilesetTiles) { const list = tilesByTileset.get(tile.tileset_id) || []; list.push({ ...tile, asset: tile.asset_id ? assets.find((asset) => asset.id === tile.asset_id) || null : null }); tilesByTileset.set(tile.tileset_id, list); }
    const clips = db.prepare("SELECT * FROM animation_clips WHERE user_id = ? ORDER BY updated_at DESC").all(user.id);
    const animationFrames = db.prepare("SELECT af.* FROM animation_frames af JOIN animation_clips ac ON ac.id = af.clip_id WHERE ac.user_id = ? ORDER BY af.position ASC").all(user.id);
    const framesByClip = new Map();
    for (const frame of animationFrames) { const list = framesByClip.get(frame.clip_id) || []; list.push({ ...frame, asset: frame.asset_id ? assets.find((asset) => asset.id === frame.asset_id) || null : null }); framesByClip.set(frame.clip_id, list); }
    const pixelEngineJobs = db.prepare("SELECT * FROM pixelengine_jobs WHERE user_id=? ORDER BY updated_at DESC LIMIT 24").all(user.id).map(pixelJobPublic);
    return { user: auth.publicUser(user), defaultThemeId, projects, themes, collections, presets, assets, assetPacks: packs.map((pack) => packPublic(pack, itemsByPack.get(pack.id) || [])), tilesets: tilesets.map((tileset) => tilesetPublic(tileset, tilesByTileset.get(tileset.id) || [])), animations: clips.map((clip) => animationPublic(clip, framesByClip.get(clip.id) || [], assets.find((asset) => asset.id === clip.source_asset_id) || null)), pixelEngineJobs };
  };

  const createProject = (request, payload) => {
    const user = session(request, true); const name = text(payload.name, "project_name"); const description = optionalText(payload.description, "project_description", 1000); const time = now(); const project = { id: id(), user_id: user.id, name, description, active_theme_id: null, created_at: time, updated_at: time };
    db.prepare("INSERT INTO projects (id, user_id, name, description, active_theme_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(project.id, project.user_id, project.name, project.description, null, time, time); return project;
  };
  const assignAssetProject = (request, assetId, payload = {}) => {
    const user = session(request, true);
    const asset = requireOwned("assets", assetId, user.id);
    const projectId = payload.projectId == null || payload.projectId === "" ? null : String(payload.projectId);
    if (projectId) requireOwned("projects", projectId, user.id);
    const time = now();
    db.prepare("UPDATE assets SET project_id=?, updated_at=? WHERE id=? AND user_id=?").run(projectId, time, asset.id, user.id);
    return assetPublic({ ...asset, project_id: projectId, updated_at: time });
  };
  const createTheme = (request, payload) => {
    const user = session(request, true); const projectId = payload.projectId || null; if (projectId) requireOwned("projects", projectId, user.id); const tags = Array.isArray(payload.styleTags) ? [...new Set(payload.styleTags.map((tag) => String(tag).trim().toLowerCase()).filter((tag) => tag && tag.length <= 48))].slice(0, 8) : [];
    const time = now(); const theme = { id: id(), user_id: user.id, project_id: projectId, name: text(payload.name, "theme_name"), version: 1, direction: optionalText(payload.direction, "theme_direction", 3000), style_tags_json: JSON.stringify(tags), settings_json: json(payload.settings, "theme_settings"), created_at: time, updated_at: time };
    db.prepare("INSERT INTO themes (id, user_id, project_id, name, version, direction, style_tags_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(theme.id, theme.user_id, theme.project_id, theme.name, theme.version, theme.direction, theme.style_tags_json, theme.settings_json, time, time); return { ...theme, styleTags: tags, settings: parseJson(theme.settings_json) };
  };
  const updateTheme = (request, themeId, payload) => {
    const user = session(request, true); const current = requireOwned("themes", themeId, user.id); const tags = Array.isArray(payload.styleTags) ? [...new Set(payload.styleTags.map((tag) => String(tag).trim().toLowerCase()).filter((tag) => tag && tag.length <= 48))].slice(0, 8) : parseJson(current.style_tags_json);
    const name = payload.name == null ? current.name : text(payload.name, "theme_name"); const direction = payload.direction == null ? current.direction : optionalText(payload.direction, "theme_direction", 3000); const settings = payload.settings == null ? current.settings_json : json(payload.settings, "theme_settings"); const time = now();
    db.prepare("UPDATE themes SET name=?, direction=?, style_tags_json=?, settings_json=?, version=version+1, updated_at=? WHERE id=? AND user_id=?").run(name, direction, JSON.stringify(tags), settings, time, themeId, user.id);
    return { ...requireOwned("themes", themeId, user.id), styleTags: tags, settings: parseJson(settings) };
  };
  const setDefaultTheme = (request, themeId) => {
    const user = session(request, true);
    const selected = themeId == null ? null : requireOwned("themes", String(themeId), user.id).id;
    db.prepare("INSERT INTO user_theme_preferences (user_id, default_theme_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET default_theme_id=excluded.default_theme_id, updated_at=excluded.updated_at").run(user.id, selected, now());
    return { defaultThemeId: selected };
  };
  const addThemeReference = (request, themeId, assetId) => {
    const user = session(request, true); if (!(user.role === "admin" || user.reference_premium)) throw new AuthError(403, "premium_required", "Style image references are a premium feature"); requireOwned("themes", themeId, user.id); requireOwned("assets", assetId, user.id);
    const count = db.prepare("SELECT COUNT(*) AS count FROM theme_references WHERE theme_id=?").get(themeId).count; if (count >= 5) throw new AuthError(400, "reference_limit", "A theme can use up to five style references"); db.prepare("INSERT OR IGNORE INTO theme_references (theme_id, asset_id, created_at) VALUES (?, ?, ?)").run(themeId, assetId, now()); return { ok: true };
  };
  const resolveTheme = async (user, themeId) => {
    if (!themeId) return null; const theme = requireOwned("themes", themeId, user.id); const rows = db.prepare("SELECT af.storage_key, af.mime_type FROM theme_references tr JOIN asset_files af ON af.asset_id=tr.asset_id WHERE tr.theme_id=? AND af.variant IN ('game-ready','original') ORDER BY af.variant='game-ready' DESC").all(themeId); const seen = new Set(); const references=[]; for (const row of rows) { if (references.length >= 5 || seen.has(row.storage_key)) continue; seen.add(row.storage_key); references.push({ bytes: await fs.readFile(path.join(root,row.storage_key)), mimeType:row.mime_type, role:"style reference" }); } return { theme, styleTags:parseJson(theme.style_tags_json), settings:parseJson(theme.settings_json), references };
  };
  const createCollection = (request, payload) => {
    const user = session(request, true); const projectId = payload.projectId || null; if (projectId) requireOwned("projects", projectId, user.id);
    const time = now(); const collection = { id: id(), user_id: user.id, project_id: projectId, name: text(payload.name, "collection_name"), created_at: time, updated_at: time };
    db.prepare("INSERT INTO collections (id, user_id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(collection.id, collection.user_id, collection.project_id, collection.name, time, time);
    return collection;
  };
  const createAssetPack = (request, payload) => {
    const user = session(request, true);
    const packType = String(payload.packType || "").toLowerCase(); if (!PACK_TYPES.has(packType)) throw new AuthError(400, "invalid_pack_type", "Invalid asset pack type");
    const provider = String(payload.provider || "").toLowerCase(); if (!["gemini", "openai", "pixel-engine"].includes(provider)) throw new AuthError(400, "invalid_provider", "Invalid provider");
    const projectId = payload.projectId || null; if (projectId) requireOwned("projects", projectId, user.id);
    const themeId = payload.themeId || null; if (themeId) requireOwned("themes", themeId, user.id);
    const settings = typeof payload.settings === "object" && payload.settings && !Array.isArray(payload.settings) ? payload.settings : {};
    const tags = Array.isArray(payload.styleTags) ? [...new Set(payload.styleTags.map((tag) => String(tag).trim().toLowerCase()).filter((tag) => /^[a-z0-9][a-z0-9 -]{0,40}$/.test(tag)))].slice(0, 8) : [];
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length < 1 || items.length > 12) throw new AuthError(400, "invalid_pack_items", "An asset pack needs 1 to 12 items");
    const normalizedItems = items.map((item, position) => { const assetType = String(item?.assetType || "").toLowerCase(); if (!PACK_ITEM_TYPES.has(assetType)) throw new AuthError(400, "invalid_pack_item", "Invalid asset pack item"); return { id: id(), position, asset_type: assetType, brief: text(item?.brief, "pack_item_brief", 700) }; });
    const time = now(); const collection = { id: id(), user_id: user.id, project_id: projectId, name: text(payload.name, "pack_name"), created_at: time, updated_at: time };
    const pack = { id: id(), user_id: user.id, collection_id: collection.id, theme_id: themeId, name: collection.name, pack_type: packType, provider, settings_json: json(settings, "pack_settings"), style_tags_json: JSON.stringify(tags), created_at: time, updated_at: time };
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO collections (id, user_id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(collection.id, collection.user_id, collection.project_id, collection.name, time, time);
      db.prepare("INSERT INTO asset_packs (id, user_id, collection_id, theme_id, name, pack_type, provider, settings_json, style_tags_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(pack.id, pack.user_id, pack.collection_id, pack.theme_id, pack.name, pack.pack_type, pack.provider, pack.settings_json, pack.style_tags_json, time, time);
      const insert = db.prepare("INSERT INTO asset_pack_items (id, pack_id, position, asset_type, brief, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)");
      for (const item of normalizedItems) insert.run(item.id, pack.id, item.position, item.asset_type, item.brief, time, time);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    return packPublic(pack, normalizedItems.map((item) => ({ ...item, pack_id: pack.id, status: "queued", asset_id: null, error_code: null, created_at: time, updated_at: time, asset: null })));
  };
  const reservePackItem = (user, packId, itemId) => {
    const pack = requireOwned("asset_packs", packId, user.id);
    const item = db.prepare("SELECT * FROM asset_pack_items WHERE id=? AND pack_id=?").get(itemId, pack.id);
    if (!item) throw new AuthError(404, "not_found", "Asset pack item not found");
    if (item.status !== "queued") throw new AuthError(409, "pack_item_unavailable", "This asset pack item is not ready to generate");
    const time = now(); db.prepare("UPDATE asset_pack_items SET status='running', error_code=NULL, updated_at=? WHERE id=? AND pack_id=? AND status='queued'").run(time, item.id, pack.id);
    return { ...item, status: "running", pack };
  };
  const retryPackItem = (request, packId, itemId) => {
    const user = session(request, true); const pack = requireOwned("asset_packs", packId, user.id); const result = db.prepare("UPDATE asset_pack_items SET status='queued', error_code=NULL, updated_at=? WHERE id=? AND pack_id=? AND status IN ('failed','running')").run(now(), itemId, pack.id);
    if (!result.changes) throw new AuthError(409, "pack_item_unavailable", "Only failed or interrupted items can be retried"); return { ok: true };
  };
  const completePackItem = (user, itemId, assetId) => db.prepare("UPDATE asset_pack_items SET status='succeeded', asset_id=?, error_code=NULL, updated_at=? WHERE id=? AND pack_id IN (SELECT id FROM asset_packs WHERE user_id=?)").run(assetId, now(), itemId, user.id);
  const failPackItem = (user, itemId, errorCode) => db.prepare("UPDATE asset_pack_items SET status='failed', error_code=?, updated_at=? WHERE id=? AND pack_id IN (SELECT id FROM asset_packs WHERE user_id=?) AND status='running'").run(String(errorCode || "generation_failed").slice(0, 100), now(), itemId, user.id);
  const createTileset = (request, payload) => {
    const user = session(request, true);
    const tilesetType = String(payload.tilesetType || "").toLowerCase(); if (!TILESET_TYPES.has(tilesetType)) throw new AuthError(400, "invalid_tileset_type", "Invalid tileset type");
    const provider = String(payload.provider || "").toLowerCase(); if (!["gemini", "openai", "pixel-engine"].includes(provider)) throw new AuthError(400, "invalid_provider", "Invalid provider");
    const projectId = payload.projectId || null; if (projectId) requireOwned("projects", projectId, user.id);
    const themeId = payload.themeId || null; if (themeId) requireOwned("themes", themeId, user.id);
    const settings = typeof payload.settings === "object" && payload.settings && !Array.isArray(payload.settings) ? payload.settings : {};
    const tileSize = Number(settings.tileSize); if (!Number.isInteger(tileSize) || ![8, 16, 24, 32, 48, 64, 128].includes(tileSize)) throw new AuthError(400, "invalid_tile_size", "Choose a supported tile size");
    const tags = Array.isArray(payload.styleTags) ? [...new Set(payload.styleTags.map((tag) => String(tag).trim().toLowerCase()).filter((tag) => /^[a-z0-9][a-z0-9 -]{0,40}$/.test(tag)))].slice(0, 8) : [];
    const tiles = Array.isArray(payload.tiles) ? payload.tiles : [];
    if (tiles.length < 1 || tiles.length > 9) throw new AuthError(400, "invalid_tileset_tiles", "A tileset needs 1 to 9 tiles");
    const normalizedTiles = tiles.map((tile, position) => { const tileRole = String(tile?.tileRole || "").toLowerCase(); if (!TILE_ROLES.has(tileRole)) throw new AuthError(400, "invalid_tileset_tile", "Invalid tileset tile"); return { id: id(), position, tile_role: tileRole, brief: text(tile?.brief, "tileset_tile_brief", 700) }; });
    const time = now(); const name = text(payload.name, "tileset_name");
    const collection = { id: id(), user_id: user.id, project_id: projectId, name: `Tileset · ${name}`, created_at: time, updated_at: time };
    const tileset = { id: id(), user_id: user.id, collection_id: collection.id, theme_id: themeId, name, tileset_type: tilesetType, provider, settings_json: json(settings, "tileset_settings"), style_tags_json: JSON.stringify(tags), created_at: time, updated_at: time };
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO collections (id, user_id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(collection.id, collection.user_id, collection.project_id, collection.name, time, time);
      db.prepare("INSERT INTO tilesets (id, user_id, collection_id, theme_id, name, tileset_type, provider, settings_json, style_tags_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(tileset.id, tileset.user_id, tileset.collection_id, tileset.theme_id, tileset.name, tileset.tileset_type, tileset.provider, tileset.settings_json, tileset.style_tags_json, time, time);
      const insert = db.prepare("INSERT INTO tileset_tiles (id, tileset_id, position, tile_role, brief, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)");
      for (const tile of normalizedTiles) insert.run(tile.id, tileset.id, tile.position, tile.tile_role, tile.brief, time, time);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    return tilesetPublic(tileset, normalizedTiles.map((tile) => ({ ...tile, tileset_id: tileset.id, status: "queued", asset_id: null, error_code: null, created_at: time, updated_at: time, asset: null })));
  };
  const reserveTilesetTile = (user, tilesetId, tileId) => {
    const tileset = requireOwned("tilesets", tilesetId, user.id); const tile = db.prepare("SELECT * FROM tileset_tiles WHERE id=? AND tileset_id=?").get(tileId, tileset.id);
    if (!tile) throw new AuthError(404, "not_found", "Tileset tile not found"); if (tile.status !== "queued") throw new AuthError(409, "tileset_tile_unavailable", "This tile is not ready to generate");
    const time = now(); db.prepare("UPDATE tileset_tiles SET status='running', error_code=NULL, updated_at=? WHERE id=? AND tileset_id=? AND status='queued'").run(time, tile.id, tileset.id);
    return { ...tile, status: "running", tileset };
  };
  const retryTilesetTile = (request, tilesetId, tileId) => {
    const user = session(request, true); const tileset = requireOwned("tilesets", tilesetId, user.id); const result = db.prepare("UPDATE tileset_tiles SET status='queued', error_code=NULL, updated_at=? WHERE id=? AND tileset_id=? AND status IN ('failed','running')").run(now(), tileId, tileset.id);
    if (!result.changes) throw new AuthError(409, "tileset_tile_unavailable", "Only failed or interrupted tiles can be retried"); return { ok: true };
  };
  const completeTilesetTile = (user, tileId, assetId) => db.prepare("UPDATE tileset_tiles SET status='succeeded', asset_id=?, error_code=NULL, updated_at=? WHERE id=? AND tileset_id IN (SELECT id FROM tilesets WHERE user_id=?)").run(assetId, now(), tileId, user.id);
  const failTilesetTile = (user, tileId, errorCode) => db.prepare("UPDATE tileset_tiles SET status='failed', error_code=?, updated_at=? WHERE id=? AND tileset_id IN (SELECT id FROM tilesets WHERE user_id=?) AND status='running'").run(String(errorCode || "generation_failed").slice(0, 100), now(), tileId, user.id);
  const createAnimationClip = (request, payload) => {
    const user = session(request, true); const source = requireOwned("assets", String(payload.sourceAssetId || ""), user.id);
    const sourceFile = db.prepare("SELECT variant FROM asset_files WHERE asset_id=? AND variant IN ('game-ready','original') ORDER BY variant='game-ready' DESC LIMIT 1").get(source.id);
    if (!sourceFile) throw new AuthError(400, "animation_source_missing", "The source asset needs an image file");
    const motion = String(payload.motion || "").toLowerCase(); if (!ANIMATION_MOTIONS.has(motion)) throw new AuthError(400, "invalid_animation_motion", "Invalid animation motion");
    const provider = String(payload.provider || "").toLowerCase(); if (!["gemini", "openai", "pixel-engine"].includes(provider)) throw new AuthError(400, "invalid_provider", "Invalid provider");
    const themeId = payload.themeId || null; if (themeId) requireOwned("themes", themeId, user.id);
    const projectId = payload.projectId || null; if (projectId) requireOwned("projects", projectId, user.id);
    const settings = typeof payload.settings === "object" && payload.settings && !Array.isArray(payload.settings) ? payload.settings : {};
    const frameCount = Number(settings.frameCount); const fps = Number(settings.fps); const margin = Number(settings.margin);
    if (!Number.isInteger(frameCount) || frameCount < 2 || frameCount > 16) throw new AuthError(400, "invalid_animation_frames", "Animation clips need 2 to 16 frames");
    if (!Number.isInteger(fps) || fps < 1 || fps > 30) throw new AuthError(400, "invalid_animation_fps", "Animation FPS must be 1 to 30");
    if (!Number.isInteger(margin) || margin < 0 || margin > 25) throw new AuthError(400, "invalid_animation_margin", "Animation margin must be 0 to 25 percent");
    const tags = Array.isArray(payload.styleTags) ? [...new Set(payload.styleTags.map((tag) => String(tag).trim().toLowerCase()).filter((tag) => /^[a-z0-9][a-z0-9 -]{0,40}$/.test(tag)))].slice(0, 8) : [];
    const framePayloads = Array.isArray(payload.frames) ? payload.frames : []; if (framePayloads.length !== frameCount) throw new AuthError(400, "invalid_animation_frames", "Frame instructions do not match the frame count");
    const duration = Math.round(1000 / fps); const frames = framePayloads.map((frame, position) => ({ id: id(), position, prompt: position === 0 ? "Source frame" : text(frame?.prompt, "animation_frame_prompt", 700), duration_ms: Number.isInteger(frame?.durationMs) && frame.durationMs >= 40 && frame.durationMs <= 2000 ? frame.durationMs : duration }));
    const time = now(); const name = text(payload.name, "animation_name"); const collection = { id: id(), user_id: user.id, project_id: projectId, name: `Animation · ${name}`, created_at: time, updated_at: time };
    const clip = { id: id(), user_id: user.id, collection_id: collection.id, source_asset_id: source.id, theme_id: themeId, name, motion, provider, settings_json: json(settings, "animation_settings"), style_tags_json: JSON.stringify(tags), created_at: time, updated_at: time };
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO collections (id, user_id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(collection.id, collection.user_id, collection.project_id, collection.name, time, time);
      db.prepare("INSERT INTO animation_clips (id, user_id, collection_id, source_asset_id, theme_id, name, motion, provider, settings_json, style_tags_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(clip.id, clip.user_id, clip.collection_id, clip.source_asset_id, clip.theme_id, clip.name, clip.motion, clip.provider, clip.settings_json, clip.style_tags_json, time, time);
      const insert = db.prepare("INSERT INTO animation_frames (id, clip_id, position, prompt, duration_ms, status, asset_id, role, is_locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const frame of frames) insert.run(frame.id, clip.id, frame.position, frame.prompt, frame.duration_ms, frame.position === 0 ? "source" : "queued", frame.position === 0 ? source.id : null, frame.position === 0 ? "source" : "generated", frame.position === 0 ? 1 : 0, time, time);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    return animationPublic(clip, frames.map((frame) => ({ ...frame, clip_id: clip.id, status: frame.position === 0 ? "source" : "queued", asset_id: frame.position === 0 ? source.id : null, role: frame.position === 0 ? "source" : "generated", is_locked: frame.position === 0 ? 1 : 0, error_code: null, created_at: time, updated_at: time, asset: frame.position === 0 ? assetPublic(source) : null })), assetPublic(source));
  };
  const reserveAnimationFrame = (user, clipId, frameId) => {
    const clip = requireOwned("animation_clips", clipId, user.id); const frame = db.prepare("SELECT * FROM animation_frames WHERE id=? AND clip_id=?").get(frameId, clip.id);
    if (!frame) throw new AuthError(404, "not_found", "Animation frame not found"); if (!["queued", "running"].includes(frame.status) || frame.position === 0) throw new AuthError(409, "animation_frame_unavailable", "This animation frame is not ready to generate");
    const time = now(); if (frame.status === "queued") db.prepare("UPDATE animation_frames SET status='running', error_code=NULL, updated_at=? WHERE id=? AND clip_id=? AND status='queued'").run(time, frame.id, clip.id); return { ...frame, status: "running", clip };
  };
  const retryAnimationFrame = (request, clipId, frameId) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const result = db.prepare("UPDATE animation_frames SET status='queued', error_code=NULL, updated_at=? WHERE id=? AND clip_id=? AND position>0 AND status IN ('failed','running')").run(now(), frameId, clip.id);
    if (!result.changes) throw new AuthError(409, "animation_frame_unavailable", "Only failed or interrupted frames can be retried"); return { ok: true };
  };
  const regenerateAnimationFrame = (request, clipId, frameId) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const result = db.prepare("UPDATE animation_frames SET status='queued', asset_id=NULL, role='generated', is_locked=0, error_code=NULL, updated_at=? WHERE id=? AND clip_id=? AND position>0 AND is_locked=0 AND status IN ('succeeded','failed','running')").run(now(), frameId, clip.id);
    if (!result.changes) throw new AuthError(409, "animation_frame_unavailable", "This frame cannot be regenerated"); return { ok: true };
  };
  const updateAnimationGeometry = (request, clipId, payload) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const canvasWidth = Number(payload.canvasWidth); const canvasHeight = Number(payload.canvasHeight);
    if (!Number.isInteger(canvasWidth) || canvasWidth < 8 || canvasWidth > 256 || !Number.isInteger(canvasHeight) || canvasHeight < 8 || canvasHeight > 256) throw new AuthError(400, "invalid_animation_geometry", "Animation canvas must be 8 to 256 pixels");
    const settings = parseJson(clip.settings_json); settings.canvasWidth = canvasWidth; settings.canvasHeight = canvasHeight; const time = now(); db.prepare("UPDATE animation_clips SET settings_json=?, updated_at=? WHERE id=? AND user_id=?").run(JSON.stringify(settings), time, clip.id, user.id); return { ok: true, canvasWidth, canvasHeight };
  };
  const regenerateAnimationClip = (request, clipId) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const result = db.prepare("UPDATE animation_frames SET status='queued', asset_id=NULL, role='generated', error_code=NULL, updated_at=? WHERE clip_id=? AND position>0 AND is_locked=0 AND status!='running'").run(now(), clip.id);
    if (!result.changes) throw new AuthError(409, "animation_clip_unavailable", "This animation has no frames available to rebuild"); return { ok: true, queued: result.changes };
  };
  const completeAnimationFrame = (user, frameId, assetId) => db.prepare("UPDATE animation_frames SET status='succeeded', asset_id=?, error_code=NULL, updated_at=? WHERE id=? AND clip_id IN (SELECT id FROM animation_clips WHERE user_id=?)").run(assetId, now(), frameId, user.id);
  const failAnimationFrame = (user, frameId, errorCode) => db.prepare("UPDATE animation_frames SET status='failed', error_code=?, updated_at=? WHERE id=? AND clip_id IN (SELECT id FROM animation_clips WHERE user_id=?) AND status='running'").run(String(errorCode || "generation_failed").slice(0, 100), now(), frameId, user.id);
  const startAnimationSheet = (request, clipId) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const frames = db.prepare("SELECT * FROM animation_frames WHERE clip_id=? AND position>0 AND status='queued' ORDER BY position").all(clip.id);
    if (!frames.length) throw new AuthError(409, "animation_clip_unavailable", "This animation has no queued poses"); const time = now();
    db.prepare("UPDATE animation_frames SET status='running', error_code=NULL, updated_at=? WHERE clip_id=? AND position>0 AND status='queued'").run(time, clip.id);
    return { ok: true, frameIds: frames.map((frame) => frame.id) };
  };
  const setAnimationKeyframe = (request, clipId, frameId, payload = {}) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const frame = db.prepare("SELECT * FROM animation_frames WHERE id=? AND clip_id=? AND position>0").get(frameId, clip.id);
    if (!frame) throw new AuthError(404, "not_found", "Animation frame not found"); const asset = requireOwned("assets", String(payload.assetId || ""), user.id);
    if (asset.kind !== "frame" || asset.collection_id !== clip.collection_id || asset.parent_asset_id !== clip.source_asset_id) throw new AuthError(400, "invalid_animation_keyframe", "Keyframes must be normalized copies owned by this animation");
    if (!db.prepare("SELECT 1 FROM asset_files WHERE asset_id=? AND variant='game-ready'").get(asset.id)) throw new AuthError(400, "animation_file_missing", "The keyframe needs a normalized game-ready PNG");
    db.prepare("UPDATE animation_frames SET status='succeeded', asset_id=?, role='keyframe', is_locked=1, error_code=NULL, updated_at=? WHERE id=? AND clip_id=?").run(asset.id, now(), frame.id, clip.id);
    return { ok: true, assetId: asset.id, role: "keyframe", isLocked: true };
  };
  const clearAnimationKeyframe = (request, clipId, frameId) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const result = db.prepare("UPDATE animation_frames SET status='queued', asset_id=NULL, role='generated', is_locked=0, error_code=NULL, updated_at=? WHERE id=? AND clip_id=? AND position>0 AND role='keyframe'").run(now(), frameId, clip.id);
    if (!result.changes) throw new AuthError(409, "animation_frame_unavailable", "This frame is not a removable keyframe"); return { ok: true };
  };
  const insertAnimationFrame = (request, clipId, payload = {}) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const frames = db.prepare("SELECT * FROM animation_frames WHERE clip_id=? ORDER BY position").all(clip.id);
    if (frames.length >= 16) throw new AuthError(409, "animation_frame_limit", "Animation clips support up to 16 frames"); const after = Number(payload.afterPosition);
    if (!Number.isInteger(after) || after < 0 || after >= frames.length) throw new AuthError(400, "invalid_animation_position", "Choose a valid frame insertion point");
    const settings = parseJson(clip.settings_json); const duration = Math.round(1000 / (Number(settings.fps) || 8)); const time = now(); const frameId = id();
    db.exec("BEGIN IMMEDIATE"); try {
      db.prepare("UPDATE animation_frames SET position=position+1000 WHERE clip_id=? AND position>?").run(clip.id, after);
      db.prepare("UPDATE animation_frames SET position=position-999 WHERE clip_id=? AND position>=1000").run(clip.id);
      db.prepare("INSERT INTO animation_frames (id, clip_id, position, prompt, duration_ms, status, asset_id, role, is_locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', NULL, 'generated', 0, ?, ?)").run(frameId, clip.id, after + 1, optionalText(payload.prompt, "animation_frame_prompt", 700) || `Inserted frame ${after + 2}`, duration, time, time);
      settings.frameCount = frames.length + 1; db.prepare("UPDATE animation_clips SET settings_json=?, updated_at=? WHERE id=? AND user_id=?").run(JSON.stringify(settings), time, clip.id, user.id); db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    return { ok: true, frameId, position: after + 1, frameCount: frames.length + 1 };
  };
  const deleteAnimationFrame = (request, clipId, frameId) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const frames = db.prepare("SELECT * FROM animation_frames WHERE clip_id=? ORDER BY position").all(clip.id); const frame = frames.find((item) => item.id === frameId);
    if (!frame || frame.position === 0) throw new AuthError(404, "not_found", "Editable animation frame not found"); if (frames.length <= 2) throw new AuthError(409, "animation_frame_minimum", "An animation needs at least two frames");
    const settings = parseJson(clip.settings_json); const time = now(); db.exec("BEGIN IMMEDIATE"); try {
      db.prepare("DELETE FROM animation_frames WHERE id=? AND clip_id=?").run(frame.id, clip.id);
      db.prepare("UPDATE animation_frames SET position=position+1000 WHERE clip_id=? AND position>?").run(clip.id, frame.position);
      db.prepare("UPDATE animation_frames SET position=position-1001 WHERE clip_id=? AND position>=1000").run(clip.id);
      settings.frameCount = frames.length - 1; db.prepare("UPDATE animation_clips SET settings_json=?, updated_at=? WHERE id=? AND user_id=?").run(JSON.stringify(settings), time, clip.id, user.id); db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    return { ok: true, frameCount: frames.length - 1 };
  };
  const retakeAnimationRange = (request, clipId, payload = {}) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const frames = db.prepare("SELECT * FROM animation_frames WHERE clip_id=? ORDER BY position").all(clip.id); const start = Number(payload.start); const end = Number(payload.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end >= frames.length) throw new AuthError(400, "invalid_animation_range", "Retake needs one continuous range excluding the source frame");
    const editable = frames.filter((frame) => frame.position >= start && frame.position <= end && !frame.is_locked); if (!editable.length) throw new AuthError(409, "animation_range_locked", "Every frame in this range is locked"); const ids = editable.map((frame) => frame.id); const placeholders = ids.map(() => "?").join(","); const time = now();
    db.prepare(`UPDATE animation_frames SET status='queued', asset_id=NULL, role='generated', error_code=NULL, updated_at=? WHERE id IN (${placeholders})`).run(time, ...ids);
    const settings = parseJson(clip.settings_json); settings.retakeRange = { start, end, requestedAt: time }; db.prepare("UPDATE animation_clips SET settings_json=?, updated_at=? WHERE id=? AND user_id=?").run(JSON.stringify(settings), time, clip.id, user.id);
    return { ok: true, start, end, queued: ids.length, locked: end - start + 1 - ids.length };
  };
  const failAnimationSheet = (request, clipId, payload = {}) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const errorCode = String(payload.errorCode || "sheet_generation_failed").slice(0, 100);
    const result = db.prepare("UPDATE animation_frames SET status='failed', error_code=?, updated_at=? WHERE clip_id=? AND position>0 AND status='running'").run(errorCode, now(), clip.id); return { ok: true, failed: result.changes };
  };
  const attachAnimationFrame = (request, clipId, frameId, payload = {}) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id); const frame = db.prepare("SELECT * FROM animation_frames WHERE id=? AND clip_id=? AND position>0").get(frameId, clip.id);
    if (!frame) throw new AuthError(404, "not_found", "Animation frame not found"); const asset = requireOwned("assets", String(payload.assetId || ""), user.id);
    if (asset.kind !== "frame" || asset.collection_id !== clip.collection_id || asset.parent_asset_id !== clip.source_asset_id) throw new AuthError(400, "invalid_animation_asset", "The generated pose does not belong to this animation");
    if (!db.prepare("SELECT 1 FROM asset_files WHERE asset_id=? AND variant='game-ready'").get(asset.id)) throw new AuthError(400, "animation_file_missing", "The generated pose needs a game-ready PNG");
    const role = payload.role === "keyframe" ? "keyframe" : "generated"; const locked = role === "keyframe" ? 1 : 0;
    const result = db.prepare("UPDATE animation_frames SET status='succeeded', asset_id=?, role=?, is_locked=?, error_code=NULL, updated_at=? WHERE id=? AND clip_id=? AND status IN ('running','queued','succeeded')").run(asset.id, role, locked, now(), frame.id, clip.id);
    if (!result.changes) throw new AuthError(409, "animation_frame_unavailable", "This animation frame cannot accept a generated pose"); return { ok: true, assetId: asset.id };
  };
  const createPreset = (request, payload) => {
    const user = session(request, true); const projectId = payload.projectId || null; if (projectId) requireOwned("projects", projectId, user.id);
    const time = now(); const preset = { id: id(), user_id: user.id, project_id: projectId, name: text(payload.name, "preset_name"), description: optionalText(payload.description, "preset_description", 1000), recipe_json: json(payload.recipe, "preset_recipe"), created_at: time, updated_at: time };
    db.prepare("INSERT INTO presets (id, user_id, project_id, name, description, recipe_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(preset.id, preset.user_id, preset.project_id, preset.name, preset.description, preset.recipe_json, time, time);
    return { ...preset, recipe: parseJson(preset.recipe_json), recipe_json: undefined };
  };
  const createAsset = (request, payload) => {
    const user = session(request, true); const kind = String(payload.kind || "").toLowerCase(); if (!ASSET_KINDS.has(kind)) throw new AuthError(400, "invalid_asset_kind", "Invalid asset kind");
    const projectId = payload.projectId || null; const collectionId = payload.collectionId || null; const parentAssetId = payload.parentAssetId || null; const themeId = payload.themeId || null;
    if (projectId) requireOwned("projects", projectId, user.id); if (collectionId) requireOwned("collections", collectionId, user.id); if (parentAssetId) requireOwned("assets", parentAssetId, user.id);
    let themeVersion = null; if (themeId) { const theme = requireOwned("themes", themeId, user.id); themeVersion = theme.version; }
    const time = now(); const asset = { id: id(), user_id: user.id, project_id: projectId, collection_id: collectionId, parent_asset_id: parentAssetId, theme_id: themeId, theme_version: themeVersion, kind, name: text(payload.name, "asset_name"), status: ["draft", "approved", "archived"].includes(payload.status) ? payload.status : "draft", provider: optionalText(payload.provider, "provider", 80), model: optionalText(payload.model, "model", 160), prompt: optionalText(payload.prompt, "prompt", 12000), recipe_json: json(payload.recipe, "recipe"), normalization_json: json(payload.normalization, "normalization"), created_at: time, updated_at: time };
    db.prepare("INSERT INTO assets (id, user_id, project_id, collection_id, parent_asset_id, theme_id, theme_version, kind, name, status, provider, model, prompt, recipe_json, normalization_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(asset.id, asset.user_id, asset.project_id, asset.collection_id, asset.parent_asset_id, asset.theme_id, asset.theme_version, asset.kind, asset.name, asset.status, asset.provider, asset.model, asset.prompt, asset.recipe_json, asset.normalization_json, time, time);
    const references = Array.isArray(payload.references) ? payload.references : [];
    const identities = references.filter((reference) => reference.role === "identity"); const styles = references.filter((reference) => reference.role === "style");
    if (identities.length > 1 || styles.length > 2) throw new AuthError(400, "invalid_references", "Use at most one identity and two style references");
    for (const reference of references) { if (!REFERENCE_ROLES.has(reference.role)) throw new AuthError(400, "invalid_references", "Invalid reference role"); requireOwned("assets", reference.assetId, user.id); db.prepare("INSERT INTO asset_references (asset_id, reference_asset_id, role, created_at) VALUES (?, ?, ?, ?)").run(asset.id, reference.assetId, reference.role, time); }
    return assetPublic(asset);
  };
  const deleteAnimationClip = (request, clipId) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", clipId, user.id);
    const pending = db.prepare("SELECT 1 FROM pixelengine_jobs WHERE clip_id=? AND status IN ('queued','pending','cancelling')").get(clip.id);
    if (pending) throw new AuthError(409, "animation_in_progress", "This animation is still being processed");
    db.prepare("DELETE FROM animation_clips WHERE id=? AND user_id=?").run(clip.id, user.id); return { ok: true };
  };
  const uploadFile = async (request, assetId, variant) => {
    const user = session(request, true); if (!FILE_VARIANTS.has(variant)) throw new AuthError(400, "invalid_file_variant", "Invalid file variant"); const asset = requireOwned("assets", assetId, user.id); const bytes = await readBytes(request); const type = imageType(bytes); if (!type) throw new AuthError(415, "invalid_image", "Only PNG, JPG and WebP images are accepted");
    const directory = path.join(root, user.id, asset.id); await fs.mkdir(directory, { recursive: true, mode: 0o700 }); const storageKey = path.join(user.id, asset.id, `${variant}.${type.extension}`); const absolute = path.join(root, storageKey); const temporary = `${absolute}.${crypto.randomBytes(8).toString("hex")}.tmp`; await fs.writeFile(temporary, bytes, { mode: 0o600 }); await fs.rename(temporary, absolute);
    const time = now(); const existing = db.prepare("SELECT storage_key FROM asset_files WHERE asset_id = ? AND variant = ?").get(asset.id, variant); db.exec("BEGIN IMMEDIATE"); try { db.prepare("INSERT INTO asset_files (id, asset_id, variant, storage_key, mime_type, byte_size, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(asset_id, variant) DO UPDATE SET storage_key=excluded.storage_key, mime_type=excluded.mime_type, byte_size=excluded.byte_size, sha256=excluded.sha256, created_at=excluded.created_at").run(id(), asset.id, variant, storageKey, type.mimeType, bytes.length, crypto.createHash("sha256").update(bytes).digest("hex"), time); db.prepare("UPDATE assets SET updated_at = ? WHERE id = ?").run(time, asset.id); db.exec("COMMIT"); } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    if (existing?.storage_key && existing.storage_key !== storageKey) await fs.rm(path.join(root, existing.storage_key), { force: true }); return { variant, mimeType: type.mimeType, byteSize: bytes.length, url: `/api/assets/${asset.id}/files/${variant}` };
  };
  const fetchFile = async (request, assetId, variant) => {
    const user = session(request); if (!FILE_VARIANTS.has(variant)) throw new AuthError(404, "not_found", "File not found"); const asset = requireOwned("assets", assetId, user.id); const file = db.prepare("SELECT * FROM asset_files WHERE asset_id = ? AND variant = ?").get(asset.id, variant); if (!file) throw new AuthError(404, "not_found", "File not found"); const bytes = await fs.readFile(path.join(root, file.storage_key)); return { bytes, mimeType: file.mime_type };
  };
  const saveAnimationOutput = async (request, payload = {}) => {
    const user = session(request, true); const clip = requireOwned("animation_clips", String(payload.clipId || ""), user.id);
    const bytes = Buffer.from(String(payload.base64 || ""), "base64"); const type = animationType(bytes, payload.mimeType);
    if (!type || bytes.length < 8 || bytes.length > 20 * 1024 * 1024) throw new AuthError(400, "invalid_animation_output", "The animation output is invalid");
    const existing = db.prepare("SELECT a.* FROM animation_output_assets ao JOIN assets a ON a.id=ao.asset_id WHERE ao.clip_id=?").get(clip.id);
    const time = now(); const asset = existing || { id: id(), user_id: user.id, collection_id: clip.collection_id, parent_asset_id: clip.source_asset_id, theme_id: clip.theme_id, theme_version: null, kind: "animation", name: clip.name, status: "draft", provider: "pixel-engine", model: payload.model || "pixel-engine-v1.1", prompt: payload.prompt || clip.name, recipe_json: JSON.stringify({ animationClipId: clip.id, settings: parseJson(clip.settings_json) }), normalization_json: "{}", created_at: time, updated_at: time };
    const directory = path.join(root, user.id, asset.id); await fs.mkdir(directory, { recursive: true, mode: 0o700 }); const storageKey = path.join(user.id, asset.id, `animation.${type.extension}`); const absolute = path.join(root, storageKey); const temporary = `${absolute}.${crypto.randomBytes(8).toString("hex")}.tmp`; await fs.writeFile(temporary, bytes, { mode: 0o600 }); await fs.rename(temporary, absolute);
    try {
      db.exec("BEGIN IMMEDIATE");
      if (existing) db.prepare("UPDATE assets SET provider=?, model=?, prompt=?, updated_at=? WHERE id=? AND user_id=?").run("pixel-engine", payload.model || "pixel-engine-v1.1", payload.prompt || clip.name, time, asset.id, user.id);
      else db.prepare("INSERT INTO assets (id, user_id, project_id, collection_id, parent_asset_id, theme_id, theme_version, kind, name, status, provider, model, prompt, recipe_json, normalization_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(asset.id, asset.user_id, asset.collection_id, asset.parent_asset_id, asset.theme_id, asset.theme_version, asset.kind, asset.name, asset.status, asset.provider, asset.model, asset.prompt, asset.recipe_json, asset.normalization_json, asset.created_at, time);
      db.prepare("INSERT INTO asset_files (id, asset_id, variant, storage_key, mime_type, byte_size, sha256, created_at) VALUES (?, ?, 'animation', ?, ?, ?, ?, ?) ON CONFLICT(asset_id, variant) DO UPDATE SET storage_key=excluded.storage_key, mime_type=excluded.mime_type, byte_size=excluded.byte_size, sha256=excluded.sha256, created_at=excluded.created_at").run(id(), asset.id, storageKey, type.mimeType, bytes.length, crypto.createHash("sha256").update(bytes).digest("hex"), time);
      const clipSettings = { ...parseJson(clip.settings_json), outputAssetId: asset.id, outputVariant: "animation" };
      db.prepare("UPDATE animation_clips SET settings_json=?, updated_at=? WHERE id=? AND user_id=?").run(JSON.stringify(clipSettings), time, clip.id, user.id); db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} await fs.rm(absolute, { force: true }); throw error; }
    return assetPublic({ ...asset, updated_at: time });
  };
  const createPixelEngineJob = (user, payload) => {
    const clip = requireOwned("animation_clips", String(payload.clipId || ""), user.id); const time = now();
    const job = { id: id(), user_id: user.id, clip_id: clip.id, api_job_id: String(payload.apiJobId), model: text(payload.model, "pixelengine_model", 120), prompt: text(payload.prompt, "pixelengine_prompt", 3000), status: "queued", progress: 0, idempotency_key: text(payload.idempotencyKey, "idempotency_key", 160), credit_exempt: payload.creditExempt ? 1 : 0, refund_issued: 0, created_at: time, updated_at: time };
    db.prepare("INSERT INTO pixelengine_jobs (id,user_id,clip_id,api_job_id,model,prompt,status,progress,idempotency_key,credit_exempt,refund_issued,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(job.id, job.user_id, job.clip_id, job.api_job_id, job.model, job.prompt, job.status, job.progress, job.idempotency_key, job.credit_exempt, job.refund_issued, time, time); return pixelJobPublic(job);
  };
  const getPixelEngineJob = (request, jobId, write = false) => {
    const user = session(request, write); const job = db.prepare("SELECT * FROM pixelengine_jobs WHERE id=? AND user_id=?").get(jobId, user.id); if (!job) throw new AuthError(404, "not_found", "Animation job not found"); return { user, job };
  };
  const updatePixelEngineJob = (userId, jobId, patch = {}) => {
    const existing = db.prepare("SELECT * FROM pixelengine_jobs WHERE id=? AND user_id=?").get(jobId, userId); if (!existing) throw new AuthError(404, "not_found", "Animation job not found");
    const status = String(patch.status || existing.status); const progress = Number.isFinite(patch.progress) ? Math.max(0, Math.min(1, patch.progress)) : existing.progress;
    db.prepare("UPDATE pixelengine_jobs SET api_job_id=?, model=?, status=?, progress=?, asset_id=?, error_code=?, cancel_requested_at=?, refund_issued=?, updated_at=? WHERE id=? AND user_id=?").run(patch.apiJobId === undefined ? existing.api_job_id : patch.apiJobId, patch.model === undefined ? existing.model : patch.model, status, progress, patch.assetId === undefined ? existing.asset_id : patch.assetId, patch.errorCode === undefined ? existing.error_code : patch.errorCode, patch.cancelRequestedAt === undefined ? existing.cancel_requested_at : patch.cancelRequestedAt, patch.refundIssued === undefined ? existing.refund_issued : Number(Boolean(patch.refundIssued)), now(), jobId, userId);
    return db.prepare("SELECT * FROM pixelengine_jobs WHERE id=? AND user_id=?").get(jobId, userId);
  };
  const linkAnimationOutput = (clipId, assetId) => db.prepare("INSERT INTO animation_output_assets (clip_id,asset_id,created_at) VALUES (?,?,?) ON CONFLICT(clip_id) DO UPDATE SET asset_id=excluded.asset_id, created_at=excluded.created_at").run(clipId, assetId, now());
  const createGenerationJob = (user, { provider, model, idempotencyKey }) => {
    const time = now(); const job = { id: id(), user_id: user.id, provider, model, status: "running", idempotency_key: idempotencyKey, created_at: time, updated_at: time };
    db.prepare("INSERT INTO generation_jobs (id, user_id, provider, model, status, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(job.id, job.user_id, job.provider, job.model, job.status, job.idempotency_key, time, time);
    return job;
  };
  const saveGenerationResult = async (user, job, { provider, model, recipe, bytes, mimeType, themeId = null, collectionId = null, parentAssetId = null }) => {
    const type = imageType(bytes); if (!type) throw new Error("Provider returned an unsupported image");
    const assignedTheme = themeId ? requireOwned("themes", themeId, user.id) : null;
    if (collectionId) requireOwned("collections", collectionId, user.id);
    if (parentAssetId) requireOwned("assets", parentAssetId, user.id);
    const time = now(); const asset = { id: id(), user_id: user.id, project_id: null, collection_id: collectionId, parent_asset_id: parentAssetId, theme_id: assignedTheme?.id || null, theme_version: assignedTheme?.version || null, kind: ASSET_KINDS.has(recipe.assetType) ? recipe.assetType : "character", name: `${String(recipe.subject || recipe.assetType || "Generated asset").slice(0, 72)}`, status: "draft", provider, model, prompt: String(recipe.subject || ""), recipe_json: JSON.stringify(recipe), normalization_json: "{}", created_at: time, updated_at: time };
    const directory = path.join(root, user.id, asset.id); await fs.mkdir(directory, { recursive: true, mode: 0o700 }); const storageKey = path.join(user.id, asset.id, `original.${type.extension}`); const absolute = path.join(root, storageKey); const temporary = `${absolute}.${crypto.randomBytes(8).toString("hex")}.tmp`; await fs.writeFile(temporary, bytes, { mode: 0o600 }); await fs.rename(temporary, absolute);
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare("INSERT INTO assets (id, user_id, project_id, collection_id, parent_asset_id, theme_id, theme_version, kind, name, status, provider, model, prompt, recipe_json, normalization_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(asset.id, asset.user_id, null, asset.collection_id, asset.parent_asset_id, asset.theme_id, asset.theme_version, asset.kind, asset.name, asset.status, asset.provider, asset.model, asset.prompt, asset.recipe_json, asset.normalization_json, time, time);
      db.prepare("INSERT INTO asset_files (id, asset_id, variant, storage_key, mime_type, byte_size, sha256, created_at) VALUES (?, ?, 'original', ?, ?, ?, ?, ?)").run(id(), asset.id, storageKey, mimeType || type.mimeType, bytes.length, crypto.createHash("sha256").update(bytes).digest("hex"), time);
      db.prepare("UPDATE generation_jobs SET asset_id = ?, provider = ?, model = ?, status = 'succeeded', updated_at = ? WHERE id = ? AND user_id = ?").run(asset.id, provider, model, time, job.id, user.id);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} await fs.rm(absolute, { force: true }); throw error; }
    return assetPublic(asset);
  };
  const failGenerationJob = (user, job, errorCode) => db.prepare("UPDATE generation_jobs SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(String(errorCode || "generation_failed").slice(0, 100), now(), job.id, user.id);

  return { list, createProject, assignAssetProject, createTheme, updateTheme, setDefaultTheme, addThemeReference, resolveTheme, createCollection, createAssetPack, reservePackItem, retryPackItem, completePackItem, failPackItem, createTileset, reserveTilesetTile, retryTilesetTile, completeTilesetTile, failTilesetTile, createAnimationClip, deleteAnimationClip, reserveAnimationFrame, retryAnimationFrame, regenerateAnimationFrame, updateAnimationGeometry, regenerateAnimationClip, completeAnimationFrame, failAnimationFrame, startAnimationSheet, failAnimationSheet, attachAnimationFrame, setAnimationKeyframe, clearAnimationKeyframe, insertAnimationFrame, deleteAnimationFrame, retakeAnimationRange, createPreset, createAsset, uploadFile, fetchFile, saveAnimationOutput, createPixelEngineJob, getPixelEngineJob, updatePixelEngineJob, linkAnimationOutput, createGenerationJob, saveGenerationResult, failGenerationJob };
}
