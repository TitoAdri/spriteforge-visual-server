import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { createEmailer } from "./email.mjs";

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
// Keep the rolling idle window accurate without writing on every request.
const SESSION_TOUCH_MS = 15 * 60 * 1000;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
// New verified accounts receive enough credits for a first generation and a
// small animation trial. Existing balances are never changed by this value.
const STARTING_CREDITS = 40;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const SIGNUP_NETWORK_WINDOW_MS = 24 * 60 * 60 * 1000;
const SIGNUP_NETWORK_LIMIT = 10;
const ANALYTICS_EVENTS = new Set([
  "page_view",
  "pricing_viewed",
  "plan_selected",
  "checkout_started",
  "signup_verified",
  "generation_completed",
  "purchase_completed",
  "subscription_renewed",
]);
const ANALYTICS_CLIENT_EVENTS = new Set(["page_view", "pricing_viewed", "plan_selected", "checkout_started"]);
const ANALYTICS_PLAN_IDS = new Set(["starter", "creator", "studio"]);
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

const now = () => Date.now();
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalizedUserAgent = (request) => String(request.headers["user-agent"] || "").slice(0, 500);
const userAgentHash = (request) => digest(normalizedUserAgent(request));
// The API is private to nginx; nginx only forwards the proxy chain it receives
// from Traefik, so the first forwarded address is the visitor rather than a
// browser-controlled header reaching this process directly.
const clientIp = (request) => String(request.headers["x-forwarded-for"] || request.headers["x-real-ip"] || request.socket.remoteAddress || "unknown").split(",")[0].trim().slice(0, 128);
const networkPrefix = (ip) => {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip.split(".").slice(0, 3).join(".");
  return ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
};

export class AuthError extends Error {
  constructor(status, code, message = "Authentication request failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function canonicalEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, "invalid_email", "Enter a valid email address");
  return email;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 12 || password.length > 128) throw new AuthError(400, "invalid_password", "Use a password between 12 and 128 characters");
  return password;
}

function parseCookies(request) {
  const raw = String(request.headers.cookie || "");
  const cookies = {};
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function requestIsHttps(request) {
  const forwarded = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwarded === "https" || request.socket.encrypted === true;
}

function originIsSameSite(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const scheme = requestIsHttps(request) ? "https" : "http";
  return origin === `${scheme}://${request.headers.host}`;
}

function setAuthCookies(response, sessionToken, csrfToken, { sessionCookie, csrfCookie, secure }) {
  const seconds = Math.floor(SESSION_TTL_MS / 1000);
  const secureFlag = secure ? "; Secure" : "";
  response.setHeader("Set-Cookie", [
    `${sessionCookie}=${sessionToken}; Path=/; Max-Age=${seconds}; HttpOnly${secureFlag}; SameSite=Lax`,
    `${csrfCookie}=${csrfToken}; Path=/; Max-Age=${seconds}${secureFlag}; SameSite=Strict`,
  ]);
}

function clearAuthCookies(response, { sessionCookie, csrfCookie, secure }) {
  const secureFlag = secure ? "; Secure" : "";
  response.setHeader("Set-Cookie", [
    `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly${secureFlag}; SameSite=Lax`,
    `${csrfCookie}=; Path=/; Max-Age=0${secureFlag}; SameSite=Strict`,
  ]);
}

export function createAuth() {
  const dbPath = process.env.SPRITEFORGE_AUTH_DB_PATH || "/data/spriteforge-auth.db";
  const sessionSecret = process.env.SPRITEFORGE_SESSION_SECRET || "";
  const passwordPepper = process.env.SPRITEFORGE_PASSWORD_PEPPER || "";
  const requireHttps = process.env.SPRITEFORGE_AUTH_REQUIRE_HTTPS !== "false";
  // Plain HTTP is allowed only when this instance explicitly opts into the
  // disposable test mode. Production always uses Host-only Secure cookies.
  const cookieConfig = requireHttps
    ? { sessionCookie: "__Host-spriteforge_session", csrfCookie: "spriteforge_csrf", secure: true }
    : { sessionCookie: "spriteforge_test_session", csrfCookie: "spriteforge_csrf", secure: false };
  const rateLog = new Map();
  const emailer = createEmailer();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      credit_balance INTEGER NOT NULL DEFAULT 0 CHECK(credit_balance >= 0),
      credit_exempt INTEGER NOT NULL DEFAULT 0 CHECK(credit_exempt IN (0, 1)),
      email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0, 1)),
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('password', 'google', 'github', 'discord')),
      provider_subject TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(provider, provider_subject),
      UNIQUE(user_id, provider)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_hash TEXT NOT NULL,
      user_agent_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS sessions_user_index ON sessions(user_id, expires_at);
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
      reason TEXT NOT NULL CHECK(reason IN ('signup_grant', 'generation_debit', 'generation_refund', 'admin_adjustment', 'subscription_refresh')),
      idempotency_key TEXT UNIQUE,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_assist_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      usage_day TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, usage_day)
    );
    CREATE TABLE IF NOT EXISTS stripe_customers (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT NOT NULL UNIQUE,
      stripe_subscription_id TEXT UNIQUE,
      plan_id TEXT,
      subscription_status TEXT,
      current_period_end INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stripe_events (
      stripe_event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      received_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stripe_credit_grants (
      stripe_invoice_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      plan_id TEXT NOT NULL,
      credits INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS email_verification_user_index ON email_verification_tokens(user_id, expires_at);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS password_reset_user_index ON password_reset_tokens(user_id, expires_at);
    CREATE TABLE IF NOT EXISTS signup_networks (
      network_hash TEXT PRIMARY KEY,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      signup_count INTEGER NOT NULL DEFAULT 0 CHECK(signup_count >= 0),
      blocked_until INTEGER
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      id TEXT PRIMARY KEY,
      state_hash TEXT NOT NULL UNIQUE,
      code_verifier TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      path TEXT,
      plan_id TEXT,
      product TEXT,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      client_id TEXT,
      value_cents INTEGER,
      currency TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS analytics_events_name_index ON analytics_events(event_name, created_at);
    CREATE INDEX IF NOT EXISTS analytics_events_plan_index ON analytics_events(plan_id, created_at);
  `);
  // Existing installations predate subscription_refresh. SQLite cannot alter a
  // CHECK constraint, so migrate the ledger atomically while preserving rows.
  const ledgerSql = String(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='credit_ledger'").get()?.sql || "");
  if (ledgerSql && !ledgerSql.includes("subscription_refresh")) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`ALTER TABLE credit_ledger RENAME TO credit_ledger_legacy;
        CREATE TABLE credit_ledger (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          amount INTEGER NOT NULL,
          balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
          reason TEXT NOT NULL CHECK(reason IN ('signup_grant', 'generation_debit', 'generation_refund', 'admin_adjustment', 'subscription_refresh')),
          idempotency_key TEXT UNIQUE,
          metadata TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL
        );
        INSERT INTO credit_ledger SELECT id,user_id,amount,balance_after,reason,idempotency_key,metadata,created_at FROM credit_ledger_legacy;
        DROP TABLE credit_ledger_legacy;`);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  }

  const configured = () => {
    if (!sessionSecret || sessionSecret.length < 32 || !passwordPepper || passwordPepper.length < 32) throw new AuthError(503, "auth_not_configured", "Authentication is not configured");
  };
  const networkHash = (request) => crypto.createHmac("sha256", sessionSecret).update(networkPrefix(clientIp(request))).digest("hex");
  const checkSignupAbuse = (request) => {
    const key = networkHash(request); const time = now();
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = db.prepare("SELECT * FROM signup_networks WHERE network_hash=?").get(key);
      if (row?.blocked_until && row.blocked_until > time && Number(row.signup_count || 0) >= SIGNUP_NETWORK_LIMIT) throw new AuthError(429, "signup_rate_limited", "Too many sign-up attempts. Please try again later.");
      const inWindow = row && time - row.first_seen_at < SIGNUP_NETWORK_WINDOW_MS;
      const count = inWindow ? Number(row.signup_count || 0) : 0;
      if (count >= SIGNUP_NETWORK_LIMIT) {
        db.prepare("INSERT INTO signup_networks(network_hash,first_seen_at,last_seen_at,signup_count,blocked_until) VALUES (?,?,?,?,?) ON CONFLICT(network_hash) DO UPDATE SET last_seen_at=excluded.last_seen_at, blocked_until=excluded.blocked_until").run(key, row?.first_seen_at || time, time, count, time + SIGNUP_NETWORK_WINDOW_MS);
        throw new AuthError(429, "signup_rate_limited", "Too many sign-up attempts. Please try again later.");
      }
      db.prepare("INSERT INTO signup_networks(network_hash,first_seen_at,last_seen_at,signup_count,blocked_until) VALUES (?,?,?,?,NULL) ON CONFLICT(network_hash) DO UPDATE SET first_seen_at=excluded.first_seen_at,last_seen_at=excluded.last_seen_at,signup_count=excluded.signup_count,blocked_until=NULL").run(key, inWindow ? row.first_seen_at : time, time, count + 1);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  };
  const assertSecureTransport = (request) => {
    if (requireHttps && !requestIsHttps(request)) throw new AuthError(426, "https_required", "Secure HTTPS is required for account access");
    if (!originIsSameSite(request)) throw new AuthError(403, "invalid_origin", "Invalid request origin");
  };
  const rateLimit = (key, limit, windowMs) => {
    const current = now();
    const entries = (rateLog.get(key) || []).filter((time) => current - time < windowMs);
    if (entries.length >= limit) throw new AuthError(429, "rate_limited", "Try again later");
    entries.push(current);
    rateLog.set(key, entries);
  };
  const hashPassword = async (password) => {
    const salt = randomToken(16);
    const derived = await scrypt(`${password}${passwordPepper}`, salt, 64, scryptOptions);
    return `scrypt$32768$8$1$${salt}$${Buffer.from(derived).toString("base64url")}`;
  };
  const verifyPassword = async (password, encoded) => {
    const [, n, r, p, salt, expected] = String(encoded || "").split("$");
    if (!salt || !expected || n !== "32768" || r !== "8" || p !== "1") return false;
    const derived = await scrypt(`${password}${passwordPepper}`, salt, 64, scryptOptions);
    const expectedBuffer = Buffer.from(expected, "base64url");
    return expectedBuffer.length === derived.length && crypto.timingSafeEqual(expectedBuffer, derived);
  };
  const publicUser = (user) => {
    const subscription = db.prepare("SELECT plan_id, subscription_status, current_period_end FROM stripe_customers WHERE user_id=?").get(user.id);
    const subscriptionActive = ["active", "trialing"].includes(String(subscription?.subscription_status || ""));
    const premiumPlan = ["creator", "studio"].includes(String(subscription?.plan_id || ""));
    return {
      id: user.id, email: user.email, role: user.role,
      credits: user.credit_exempt ? null : user.credit_balance,
      creditExempt: Boolean(user.credit_exempt),
      emailVerified: Boolean(user.email_verified),
      plan: subscriptionActive ? subscription.plan_id : null,
      subscriptionStatus: subscription?.subscription_status || null,
      subscriptionPeriodEnd: subscription?.current_period_end || null,
      referencePremium: user.role === "admin" || Boolean(user.reference_premium) || (subscriptionActive && premiumPlan),
    };
  };
  const issueSession = (response, request, userId) => {
    const sessionToken = randomToken(32);
    const csrfToken = randomToken(32);
    const time = now();
    db.prepare("INSERT INTO sessions (id, user_id, token_hash, csrf_hash, user_agent_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(randomToken(16), userId, digest(`${sessionToken}${sessionSecret}`), digest(csrfToken), userAgentHash(request), time, time, time + SESSION_TTL_MS);
    setAuthCookies(response, sessionToken, csrfToken, cookieConfig);
  };
  const verificationTokenFor = (userId) => {
    const token = randomToken(32); const time = now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM email_verification_tokens WHERE user_id=? AND consumed_at IS NULL").run(userId);
      db.prepare("INSERT INTO email_verification_tokens(id,user_id,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)").run(randomToken(16), userId, digest(`${token}${sessionSecret}`), time, time + EMAIL_VERIFICATION_TTL_MS);
      db.exec("COMMIT"); return token;
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  };
  const passwordResetTokenFor = (userId) => {
    const token = randomToken(32); const time = now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM password_reset_tokens WHERE user_id=? OR expires_at<? OR consumed_at IS NOT NULL").run(userId, time);
      db.prepare("INSERT INTO password_reset_tokens(id,user_id,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)").run(randomToken(16), userId, digest(`${token}${sessionSecret}`), time, time + PASSWORD_RESET_TTL_MS);
      db.exec("COMMIT"); return token;
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  };
  const grantStartingCredits = (userId, source) => {
    const time = now();
    const grantKey = `signup:${userId}`;
    const prior = db.prepare("SELECT 1 FROM credit_ledger WHERE idempotency_key=?").get(grantKey);
    if (prior) return;
    const user = db.prepare("SELECT credit_balance, credit_exempt FROM users WHERE id=?").get(userId);
    if (!user || user.credit_exempt) return;
    const balance = Number(user.credit_balance || 0) + STARTING_CREDITS;
    db.prepare("UPDATE users SET credit_balance=?,updated_at=? WHERE id=?").run(balance, time, userId);
    db.prepare("INSERT INTO credit_ledger(id,user_id,amount,balance_after,reason,idempotency_key,metadata,created_at) VALUES (?,?,?,?, 'signup_grant', ?, ?, ?)").run(randomToken(16), userId, STARTING_CREDITS, balance, grantKey, JSON.stringify({ source }), time);
  };
  const verifyEmailToken = (token) => {
    if (!/^[A-Za-z0-9_-]{30,200}$/.test(String(token || ""))) throw new AuthError(400, "invalid_verification_token", "This verification link is invalid or has expired.");
    const time = now();
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = db.prepare("SELECT * FROM email_verification_tokens WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? ").get(digest(`${token}${sessionSecret}`), time);
      if (!row) throw new AuthError(400, "invalid_verification_token", "This verification link is invalid or has expired.");
      db.prepare("UPDATE email_verification_tokens SET consumed_at=? WHERE id=?").run(time, row.id);
      db.prepare("UPDATE users SET email_verified=1, updated_at=? WHERE id=?").run(time, row.user_id);
      grantStartingCredits(row.user_id, "email_verification");
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id);
      db.exec("COMMIT"); return publicUser(user);
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  };
  const oauthCookieName = "__Host-spriteforge_google_state";
  const appendCookie = (response, cookie) => {
    const current = response.getHeader("Set-Cookie");
    response.setHeader("Set-Cookie", [...(Array.isArray(current) ? current : current ? [current] : []), cookie]);
  };
  const setOAuthCookie = (response, state) => appendCookie(response, `${oauthCookieName}=${state}; Path=/; Max-Age=600; HttpOnly${cookieConfig.secure ? "; Secure" : ""}; SameSite=Lax`);
  const clearOAuthCookie = (response) => appendCookie(response, `${oauthCookieName}=; Path=/; Max-Age=0; HttpOnly${cookieConfig.secure ? "; Secure" : ""}; SameSite=Lax`);
  const googleConfig = () => ({ clientId: String(process.env.GOOGLE_OAUTH_CLIENT_ID || ""), clientSecret: String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || ""), redirectUri: String(process.env.GOOGLE_OAUTH_REDIRECT_URI || "https://spriteforge.xyz/api/auth/google/callback") });
  const googleReady = () => { const { clientId, clientSecret, redirectUri } = googleConfig(); return Boolean(clientId && clientSecret && redirectUri.startsWith("https://")); };
  const getSession = (request) => {
    configured();
    const sessionToken = parseCookies(request)[cookieConfig.sessionCookie];
    if (!sessionToken) return null;
    const time = now();
    const session = db.prepare(`SELECT s.id AS session_id, s.csrf_hash, s.user_agent_hash, s.last_seen_at, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`).get(digest(`${sessionToken}${sessionSecret}`), time);
    if (!session || session.user_agent_hash !== userAgentHash(request)) return null;
    // An issued session has both a hard 14-day lifetime and a rolling 24-hour
    // inactivity lifetime.  Do not silently renew an already-idle session.
    if (time - session.last_seen_at > SESSION_IDLE_MS) {
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(time, session.session_id);
      return null;
    }
    if (time - session.last_seen_at > SESSION_TOUCH_MS) {
      db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(time, session.session_id);
    }
    return session;
  };
  const requireSession = (request, { csrf = false } = {}) => {
    assertSecureTransport(request);
    const session = getSession(request);
    if (!session) throw new AuthError(401, "authentication_required", "Sign in to continue");
    if (csrf) {
      const csrfToken = request.headers["x-csrf-token"];
      if (!csrfToken || !crypto.timingSafeEqual(Buffer.from(digest(csrfToken)), Buffer.from(session.csrf_hash))) throw new AuthError(403, "csrf_failed", "Security validation failed");
    }
    return session;
  };
  const recordAnalyticsEvent = ({ eventName, path = null, planId = null, product = null, userId = null, clientId = null, valueCents = null, currency = null, metadata = {} }) => {
    const name = String(eventName || "");
    if (!ANALYTICS_EVENTS.has(name)) throw new AuthError(400, "invalid_analytics_event", "Unsupported analytics event");
    const normalizedPlan = planId == null || planId === "" ? null : String(planId).toLowerCase();
    if (normalizedPlan && !ANALYTICS_PLAN_IDS.has(normalizedPlan)) throw new AuthError(400, "invalid_analytics_plan", "Unsupported analytics plan");
    const normalizedPath = path == null ? null : String(path).slice(0, 200);
    const normalizedProduct = product == null ? null : String(product).slice(0, 80);
    const normalizedClient = clientId == null ? null : String(clientId).slice(0, 100);
    const normalizedValue = valueCents == null ? null : Number(valueCents);
    if (normalizedValue != null && (!Number.isInteger(normalizedValue) || normalizedValue < 0 || normalizedValue > 10_000_000)) throw new AuthError(400, "invalid_analytics_value", "Invalid analytics value");
    const normalizedCurrency = currency == null ? null : String(currency).slice(0, 3).toUpperCase();
    const metadataJson = JSON.stringify(metadata && typeof metadata === "object" ? metadata : {});
    if (metadataJson.length > 2_000) throw new AuthError(400, "analytics_metadata_too_large", "Analytics metadata is too large");
    db.prepare("INSERT INTO analytics_events (id,event_name,path,plan_id,product,user_id,client_id,value_cents,currency,metadata,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(randomToken(16), name, normalizedPath, normalizedPlan, normalizedProduct, userId ? String(userId) : null, normalizedClient, normalizedValue, normalizedCurrency, metadataJson, now());
  };
  const trackAnalyticsEvent = (request, payload = {}) => {
    configured(); assertSecureTransport(request);
    rateLimit(`analytics:${networkHash(request)}`, 240, 60 * 1000);
    const eventName = String(payload.eventName || "");
    if (!ANALYTICS_CLIENT_EVENTS.has(eventName)) throw new AuthError(400, "invalid_analytics_event", "Unsupported client analytics event");
    const clientId = String(payload.clientId || "");
    if (clientId && !/^[A-Za-z0-9_-]{8,100}$/.test(clientId)) throw new AuthError(400, "invalid_analytics_client", "Invalid analytics client id");
    const session = getSession(request);
    recordAnalyticsEvent({
      eventName,
      path: payload.path,
      planId: payload.planId,
      product: payload.product,
      userId: session?.id || null,
      clientId: clientId || null,
      valueCents: payload.valueCents,
      currency: payload.currency,
      metadata: payload.metadata,
    });
    return { ok: true };
  };
  const analyticsSummary = (request, { from = null, to = null } = {}) => {
    const session = requireSession(request);
    if (session.role !== "admin") throw new AuthError(403, "admin_required", "Administrator access required");
    const end = to && Number.isFinite(Number(to)) ? Number(to) : now();
    const start = from && Number.isFinite(Number(from)) ? Number(from) : end - 90 * 24 * 60 * 60 * 1000;
    const safeStart = Math.max(0, Math.min(start, end));
    const safeEnd = Math.max(safeStart, Math.min(end, safeStart + 366 * 24 * 60 * 60 * 1000));
    const totals = Object.fromEntries(db.prepare("SELECT event_name, COUNT(*) AS count FROM analytics_events WHERE created_at >= ? AND created_at < ? GROUP BY event_name ORDER BY event_name").all(safeStart, safeEnd).map((row) => [row.event_name, Number(row.count)]));
    const byPlan = db.prepare("SELECT event_name, plan_id, COUNT(*) AS count FROM analytics_events WHERE created_at >= ? AND created_at < ? AND plan_id IS NOT NULL GROUP BY event_name, plan_id ORDER BY event_name, plan_id").all(safeStart, safeEnd).map((row) => ({ eventName: row.event_name, planId: row.plan_id, count: Number(row.count) }));
    const daily = db.prepare("SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, event_name, COUNT(*) AS count FROM analytics_events WHERE created_at >= ? AND created_at < ? GROUP BY day, event_name ORDER BY day, event_name").all(safeStart, safeEnd).map((row) => ({ day: row.day, eventName: row.event_name, count: Number(row.count) }));
    return { range: { from: new Date(safeStart).toISOString(), to: new Date(safeEnd).toISOString() }, totals, byPlan, daily };
  };

  return {
    // Library and billing modules share this single database connection.  It is
    // deliberately not exported from the HTTP layer.
    db,
    publicUser,
    status(request) {
      const secure = requestIsHttps(request);
      const config = { emailVerificationEnabled: emailer.configured(), googleEnabled: googleReady() };
      if (!sessionSecret || !passwordPepper) return { user: null, available: false, httpsRequired: requireHttps && !secure, ...config };
      if (!parseCookies(request)[cookieConfig.sessionCookie]) return { user: null, available: !requireHttps || secure, httpsRequired: requireHttps && !secure, ...config };
      const session = getSession(request);
      return { user: session ? publicUser(session) : null, available: !requireHttps || secure, httpsRequired: requireHttps && !secure, ...config };
    },
    async register(request, response, payload) {
      configured(); assertSecureTransport(request);
      const email = canonicalEmail(payload.email); const password = validatePassword(payload.password);
      if (String(payload.website || "").trim()) throw new AuthError(400, "invalid_registration", "Unable to create this account.");
      if (!emailer.configured()) throw new AuthError(503, "email_verification_unavailable", "Email verification is temporarily unavailable. Please try again later.");
      rateLimit(`register:${networkHash(request)}`, 5, 15 * 60 * 1000); checkSignupAbuse(request);
      const passwordHash = await hashPassword(password); const id = randomToken(16); const time = now();
      try {
        db.exec("BEGIN IMMEDIATE");
        db.prepare("INSERT INTO users (id, email, password_hash, credit_balance, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)").run(id, email, passwordHash, time, time);
        db.prepare("INSERT INTO user_identities (id, user_id, provider, provider_subject, created_at) VALUES (?, ?, 'password', ?, ?)").run(randomToken(16), id, email, time);
        db.exec("COMMIT");
      } catch (error) { try { db.exec("ROLLBACK"); } catch {} if (String(error.code || "").includes("CONSTRAINT")) throw new AuthError(409, "account_exists", "An account with this email already exists"); throw error; }
      try { await emailer.sendVerification({ email, token: verificationTokenFor(id) }); } catch (error) { console.warn({ event: "verification_email_failed", code: error.code || "email_error" }); }
      // A password record is deliberately inactive until the mailbox owner
      // proves control of the address. No session, credits or API access exist
      // before the one-time link is consumed.
      return { user: null, verificationRequired: true };
    },
    async login(request, response, payload) {
      configured(); assertSecureTransport(request);
      const email = canonicalEmail(payload.email); const password = validatePassword(payload.password);
      // The API is behind Nginx/Traefik; socket.remoteAddress is the internal
      // proxy address and would throttle unrelated users together. Use the
      // trusted, HMAC-bound client network key used by signup/OAuth limits.
      rateLimit(`login-network:${networkHash(request)}`, 12, 15 * 60 * 1000); rateLimit(`login-email:${email}`, 8, 15 * 60 * 1000);
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email); const time = now();
      if (!user || !user.password_hash || (user.locked_until && user.locked_until > time) || !(await verifyPassword(password, user.password_hash))) {
        if (user) { const failures = user.failed_login_count + 1; db.prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?").run(failures, failures >= MAX_FAILED_LOGINS ? time + ACCOUNT_LOCK_MS : null, time, user.id); }
        throw new AuthError(401, "invalid_credentials", "Email or password is incorrect");
      }
      db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?").run(time, user.id);
      if (!user.credit_exempt && !user.email_verified) {
        if (emailer.configured()) {
          rateLimit(`verify-login:${user.id}`, 3, 60 * 60 * 1000);
          await emailer.sendVerification({ email: user.email, token: verificationTokenFor(user.id) });
        }
        throw new AuthError(403, "email_verification_required", "Verify your email to activate this account. We sent you a fresh verification link.");
      }
      issueSession(response, request, user.id); return { user: publicUser(user) };
    },
    logout(request, response) { const session = requireSession(request, { csrf: true }); db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(now(), session.session_id); clearAuthCookies(response, cookieConfig); return { ok: true }; },
    requireSession,
    requireVerified(request, options = {}) {
      const session = requireSession(request, options);
      if (!session.credit_exempt && !session.email_verified) throw new AuthError(403, "email_verification_required", "Verify your email address before using generation features.");
      return session;
    },
    async resendVerification(request) {
      const session = requireSession(request, { csrf: true });
      if (session.email_verified) return { ok: true, alreadyVerified: true };
      if (!emailer.configured()) throw new AuthError(503, "email_verification_unavailable", "Email verification is temporarily unavailable. Please try again later.");
      rateLimit(`verify-resend:${session.id}`, 3, 60 * 60 * 1000);
      await emailer.sendVerification({ email: session.email, token: verificationTokenFor(session.id) });
      return { ok: true };
    },
    async requestPasswordReset(request, payload) {
      configured(); assertSecureTransport(request);
      // Always return the same response so this endpoint cannot be used to
      // enumerate registered addresses. Rate limits are deliberately applied
      // to both the client network and the normalized email.
      let email = "";
      try { email = canonicalEmail(payload?.email); } catch { return { ok: true }; }
      rateLimit(`password-reset-network:${networkHash(request)}`, 8, 60 * 60 * 1000);
      rateLimit(`password-reset-email:${email}`, 3, 60 * 60 * 1000);
      const user = db.prepare("SELECT id,email,password_hash,credit_exempt FROM users WHERE email=?").get(email);
      if (user?.password_hash) {
        try { await emailer.sendPasswordReset({ email: user.email, token: passwordResetTokenFor(user.id) }); }
        catch (error) { console.warn({ event: "password_reset_email_failed", code: error.code || "email_error" }); }
      }
      return { ok: true };
    },
    async resetPassword(request, response, payload) {
      configured(); assertSecureTransport(request);
      const token = String(payload?.token || ""); const password = validatePassword(payload?.password);
      if (!/^[A-Za-z0-9_-]{30,200}$/.test(token)) throw new AuthError(400, "invalid_password_reset_token", "This password reset link is invalid or has expired.");
      const passwordHash = await hashPassword(password); const time = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? ").get(digest(`${token}${sessionSecret}`), time);
        if (!row) throw new AuthError(400, "invalid_password_reset_token", "This password reset link is invalid or has expired.");
        db.prepare("UPDATE users SET password_hash=?, failed_login_count=0, locked_until=NULL, updated_at=? WHERE id=?").run(passwordHash, time, row.user_id);
        db.prepare("UPDATE password_reset_tokens SET consumed_at=? WHERE id=?").run(time, row.id);
        // Revoke every existing session so a password reset also terminates
        // stolen or forgotten sessions.
        db.prepare("UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").run(time, row.user_id);
        db.exec("COMMIT"); return { ok: true };
      } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    },
    verifyEmail(request, response, token) { configured(); const user = verifyEmailToken(token); recordAnalyticsEvent({ eventName: "signup_verified", userId: user.id, metadata: { method: "email" } }); issueSession(response, request, user.id); return { user }; },
    beginGoogle(request, response) {
      configured();
      if (!requestIsHttps(request) || !googleReady()) throw new AuthError(503, "google_auth_unavailable", "Google sign-in is not configured yet.");
      rateLimit(`google-start:${networkHash(request)}`, 12, 60 * 60 * 1000);
      const state = randomToken(32); const verifier = randomToken(48); const time = now();
      db.prepare("DELETE FROM oauth_states WHERE expires_at < ? OR consumed_at IS NOT NULL").run(time);
      db.prepare("INSERT INTO oauth_states(id,state_hash,code_verifier,created_at,expires_at) VALUES (?,?,?,?,?)").run(randomToken(16), digest(`${state}${sessionSecret}`), verifier, time, time + 10 * 60 * 1000);
      setOAuthCookie(response, state);
      const { clientId, redirectUri } = googleConfig();
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
      const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
      return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
    },
    async completeGoogle(request, response, { state, code }) {
      configured();
      if (!googleReady() || !requestIsHttps(request)) throw new AuthError(503, "google_auth_unavailable", "Google sign-in is not configured yet.");
      const cookieState = parseCookies(request)[oauthCookieName];
      if (!state || !code || !cookieState || state !== cookieState) throw new AuthError(400, "invalid_oauth_state", "Google sign-in could not be validated. Please try again.");
      const time = now(); const stateHash = digest(`${state}${sessionSecret}`);
      const stateRow = db.prepare("SELECT * FROM oauth_states WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?").get(stateHash, time);
      if (!stateRow) throw new AuthError(400, "invalid_oauth_state", "Google sign-in could not be validated. Please try again.");
      db.prepare("UPDATE oauth_states SET consumed_at=? WHERE id=?").run(time, stateRow.id);
      const { clientId, clientSecret, redirectUri } = googleConfig();
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: stateRow.code_verifier }), signal: AbortSignal.timeout(30_000) });
      if (!tokenResponse.ok) throw new AuthError(401, "google_token_failed", "Google sign-in could not be completed. Please try again.");
      const token = await tokenResponse.json();
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(30_000) });
      const profile = profileResponse.ok ? await profileResponse.json() : null;
      if (!profile || !profile.sub || profile.email_verified !== true) throw new AuthError(403, "google_email_unverified", "Use a Google account with a verified email address.");
      const email = canonicalEmail(profile.email); const subject = String(profile.sub); let userId; let created = false;
      db.exec("BEGIN IMMEDIATE");
      try {
        const identity = db.prepare("SELECT user_id FROM user_identities WHERE provider='google' AND provider_subject=?").get(subject);
        const existing = identity ? db.prepare("SELECT * FROM users WHERE id=?").get(identity.user_id) : db.prepare("SELECT * FROM users WHERE email=?").get(email);
        if (existing) {
          userId = existing.id;
          db.prepare("UPDATE users SET email_verified=1,updated_at=? WHERE id=?").run(time, userId);
          if (!identity) db.prepare("INSERT INTO user_identities(id,user_id,provider,provider_subject,created_at) VALUES (?,?,'google',?,?)").run(randomToken(16), userId, subject, time);
        } else {
          userId = randomToken(16);
          created = true;
          db.prepare("INSERT INTO users(id,email,role,credit_balance,email_verified,created_at,updated_at) VALUES (?,?,'user',0,1,?,?)").run(userId, email, time, time);
          db.prepare("INSERT INTO user_identities(id,user_id,provider,provider_subject,created_at) VALUES (?,?,'google',?,?)").run(randomToken(16), userId, subject, time);
        }
        grantStartingCredits(userId, "google_verified_email");
        db.exec("COMMIT");
      } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
      if (created) recordAnalyticsEvent({ eventName: "signup_verified", userId, metadata: { method: "google" } });
      issueSession(response, request, userId); clearOAuthCookie(response);
      return { user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(userId)), created };
    },
    debitGeneration(request, idempotencyKey, creditCost = 1, metadata = {}) {
      const session = requireSession(request, { csrf: true });
      if (!session.credit_exempt && !session.email_verified) throw new AuthError(403, "email_verification_required", "Verify your email address before using generation features.");
      if (!/^[A-Za-z0-9_-]{20,160}$/.test(String(idempotencyKey || ""))) throw new AuthError(400, "idempotency_required", "A valid idempotency key is required");
      if (!Number.isInteger(creditCost) || creditCost < 1 || creditCost > 100) throw new AuthError(400, "invalid_credit_cost", "Invalid generation credit cost");
      if (session.credit_exempt) return { user: session, exempt: true };
      const time = now();
      try {
        db.exec("BEGIN IMMEDIATE");
        const user = db.prepare("SELECT credit_balance FROM users WHERE id = ?").get(session.id);
        if (!user || user.credit_balance < creditCost) throw new AuthError(402, "insufficient_credits", `You need ${creditCost} credits for this generation`);
        const balance = user.credit_balance - creditCost;
        db.prepare("UPDATE users SET credit_balance = ?, updated_at = ? WHERE id = ?").run(balance, time, session.id);
        db.prepare("INSERT INTO credit_ledger (id, user_id, amount, balance_after, reason, idempotency_key, metadata, created_at) VALUES (?, ?, ?, ?, 'generation_debit', ?, ?, ?)").run(randomToken(16), session.id, -creditCost, balance, idempotencyKey, JSON.stringify(metadata), time);
        db.exec("COMMIT"); return { user: { ...session, credit_balance: balance }, exempt: false, creditCost };
      } catch (error) { try { db.exec("ROLLBACK"); } catch {} if (String(error.code || "").includes("CONSTRAINT")) throw new AuthError(409, "duplicate_generation", "This generation request has already been received"); throw error; }
    },
    consumePromptAssist(request, limit = 5) {
      const session = requireSession(request, { csrf: true });
      if (session.role === "admin") return { user: session, exempt: true, remaining: null, usageDay: null };
      const usageDay = new Date().toISOString().slice(0, 10); const time = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db.prepare("SELECT request_count FROM prompt_assist_usage WHERE user_id=? AND usage_day=?").get(session.id, usageDay);
        const used = Number(row?.request_count || 0);
        if (used >= limit) throw new AuthError(429, "prompt_assist_limit_reached", `Prompt assistant limit reached: ${limit} requests per day.`);
        if (row) db.prepare("UPDATE prompt_assist_usage SET request_count=?, updated_at=? WHERE user_id=? AND usage_day=?").run(used + 1, time, session.id, usageDay);
        else db.prepare("INSERT INTO prompt_assist_usage (user_id,usage_day,request_count,updated_at) VALUES (?,?,?,?)").run(session.id, usageDay, 1, time);
        db.exec("COMMIT"); return { user: session, exempt: false, remaining: limit - used - 1, usageDay };
      } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    },
    refundPromptAssist(userId, usageDay) {
      if (!usageDay) return;
      db.prepare("UPDATE prompt_assist_usage SET request_count=CASE WHEN request_count>0 THEN request_count-1 ELSE 0 END, updated_at=? WHERE user_id=? AND usage_day=?").run(now(), userId, usageDay);
    },
    refundGeneration(userId, idempotencyKey) {
      const refundKey = `refund:${idempotencyKey}`; const time = now();
      try { db.exec("BEGIN IMMEDIATE"); const debit = db.prepare("SELECT amount FROM credit_ledger WHERE user_id = ? AND idempotency_key = ? AND reason = 'generation_debit'").get(userId, idempotencyKey); if (!debit) { db.exec("ROLLBACK"); return; } const user = db.prepare("SELECT credit_balance FROM users WHERE id = ?").get(userId); if (!user) throw new Error("Unknown user"); const amount = Math.abs(Number(debit.amount)); const balance = user.credit_balance + amount; db.prepare("UPDATE users SET credit_balance = ?, updated_at = ? WHERE id = ?").run(balance, time, userId); db.prepare("INSERT INTO credit_ledger (id, user_id, amount, balance_after, reason, idempotency_key, metadata, created_at) VALUES (?, ?, ?, ?, 'generation_refund', ?, ?, ?)").run(randomToken(16), userId, amount, balance, refundKey, JSON.stringify({ refundOf: idempotencyKey }), time); db.exec("COMMIT"); } catch (error) { try { db.exec("ROLLBACK"); } catch {} if (!String(error.code || "").includes("CONSTRAINT")) throw error; }
    },
    billingStatus(request) {
      const session = requireSession(request);
      const billing = db.prepare("SELECT stripe_customer_id, stripe_subscription_id, plan_id, subscription_status, current_period_end FROM stripe_customers WHERE user_id=?").get(session.id);
      return { customer: billing ? { planId: billing.plan_id, status: billing.subscription_status, currentPeriodEnd: billing.current_period_end, active: ["active", "trialing", "past_due"].includes(String(billing.subscription_status || "")) } : null };
    },
    billingCustomer(request) {
      const session = requireSession(request, { csrf: true });
      return { user: session, customer: db.prepare("SELECT stripe_customer_id FROM stripe_customers WHERE user_id=?").get(session.id) || null };
    },
    trackAnalyticsEvent,
    recordAnalyticsEvent,
    analyticsSummary,
    processStripeEvent(event, { planForPriceId, planForId = () => null }) {
      const eventId = String(event?.id || ""); const eventType = String(event?.type || ""); const object = event?.data?.object;
      if (!/^evt_[A-Za-z0-9]+$/.test(eventId) || !eventType || !object || typeof object !== "object") throw new AuthError(400, "invalid_stripe_event", "Invalid Stripe event");
      const time = now();
      const upsertCustomer = (userId, customerId, values = {}) => {
        if (!userId || !customerId) return;
        const user = db.prepare("SELECT id FROM users WHERE id=?").get(userId); if (!user) return;
        db.prepare(`INSERT INTO stripe_customers (user_id,stripe_customer_id,stripe_subscription_id,plan_id,subscription_status,current_period_end,updated_at)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,
          stripe_subscription_id=COALESCE(excluded.stripe_subscription_id,stripe_customers.stripe_subscription_id),
          plan_id=COALESCE(excluded.plan_id,stripe_customers.plan_id), subscription_status=COALESCE(excluded.subscription_status,stripe_customers.subscription_status),
          current_period_end=COALESCE(excluded.current_period_end,stripe_customers.current_period_end), updated_at=excluded.updated_at`)
          .run(userId, customerId, values.subscriptionId || null, values.planId || null, values.status || null, values.periodEnd || null, time);
      };
      // Stripe does not guarantee webhook delivery order. Subscription invoice
      // metadata may also live under `parent.subscription_details` depending on
      // the API version that produced the event.
      const metadata = [object.subscription_details?.metadata, object.parent?.subscription_details?.metadata, object.metadata]
        .find((value) => value && typeof value === "object") || {};
      const userFor = (customerId) => metadata.user_id || db.prepare("SELECT user_id FROM stripe_customers WHERE stripe_customer_id=?").get(String(customerId || ""))?.user_id || null;
      const grantPaidInvoice = ({ userId, customerId, invoiceId, plan, subscriptionId = null, periodEnd = null }) => {
        if (!userId || !plan || !/^in_[A-Za-z0-9]+$/.test(invoiceId)) return false;
        if (db.prepare("SELECT 1 FROM stripe_credit_grants WHERE stripe_invoice_id=?").get(invoiceId)) return false;
        const hadPriorGrant = Boolean(db.prepare("SELECT 1 FROM stripe_credit_grants WHERE user_id=? LIMIT 1").get(userId));
        const user = db.prepare("SELECT credit_balance,credit_exempt FROM users WHERE id=?").get(userId);
        if (!user) return false;
        const balance = user.credit_exempt ? user.credit_balance : plan.credits;
        if (!user.credit_exempt) {
          db.prepare("UPDATE users SET credit_balance=?,updated_at=? WHERE id=?").run(balance, time, userId);
          const ledgerKey = `stripe_invoice:${invoiceId}`;
          if (!db.prepare("SELECT 1 FROM credit_ledger WHERE idempotency_key=?").get(ledgerKey)) {
            db.prepare("INSERT INTO credit_ledger (id,user_id,amount,balance_after,reason,idempotency_key,metadata,created_at) VALUES (?,?,?,?, 'subscription_refresh', ?, ?, ?)")
              .run(randomToken(16), userId, balance - user.credit_balance, balance, ledgerKey, JSON.stringify({ invoiceId, planId: plan.id, credits: plan.credits }), time);
          }
        }
        db.prepare("INSERT INTO stripe_credit_grants (stripe_invoice_id,user_id,plan_id,credits,created_at) VALUES (?,?,?,?,?)").run(invoiceId, userId, plan.id, plan.credits, time);
        upsertCustomer(userId, customerId, { subscriptionId, planId: plan.id, status: "active", periodEnd });
        recordAnalyticsEvent({ eventName: hadPriorGrant ? "subscription_renewed" : "purchase_completed", planId: plan.id, userId, valueCents: Math.round(Number(plan.monthlyUsd || 0) * 100), currency: "USD", metadata: { invoiceId } });
        return true;
      };
      try {
        db.exec("BEGIN IMMEDIATE");
        if (db.prepare("SELECT 1 FROM stripe_events WHERE stripe_event_id=?").get(eventId)) { db.exec("ROLLBACK"); return { duplicate: true, credited: false }; }
        db.prepare("INSERT INTO stripe_events (stripe_event_id,event_type,received_at) VALUES (?,?,?)").run(eventId, eventType, time);
        if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
          const userId = String(object.client_reference_id || metadata.user_id || "");
          const customerId = String(object.customer || "");
          const plan = planForId(String(metadata.plan_id || ""));
          const invoiceId = String(object.invoice || "");
          const subscriptionId = String(object.subscription || "") || null;
          upsertCustomer(userId, customerId, { subscriptionId, planId: plan?.id || String(metadata.plan_id || "") || null, status: object.payment_status === "paid" ? "active" : null });
          // The initial invoice can arrive before checkout.session.completed.
          // When that happens, use the invoice attached to the paid Checkout
          // Session to grant exactly once instead of waiting for a second event.
          if (object.payment_status === "paid") grantPaidInvoice({ userId, customerId, invoiceId, plan, subscriptionId });
        } else if (eventType === "invoice.paid") {
          const customerId = String(object.customer || ""); const userId = userFor(customerId);
          const priceId = String(object.lines?.data?.find((line) => line?.price?.id || line?.pricing?.price_details?.price)?.price?.id || object.lines?.data?.find((line) => line?.pricing?.price_details?.price)?.pricing?.price_details?.price || "");
          const knownCustomer = db.prepare("SELECT plan_id FROM stripe_customers WHERE stripe_customer_id=?").get(customerId);
          const plan = planForPriceId(priceId) || planForId(String(metadata.plan_id || knownCustomer?.plan_id || ""));
          const invoiceId = String(object.id || "");
          grantPaidInvoice({ userId, customerId, invoiceId, plan, subscriptionId: String(object.subscription || "") || null, periodEnd: Number(object.lines?.data?.[0]?.period?.end || 0) * 1000 || null });
        } else if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
          const customerId = String(object.customer || ""); const userId = userFor(customerId);
          const priceId = String(object.items?.data?.[0]?.price?.id || ""); const plan = planForPriceId(priceId);
          upsertCustomer(userId, customerId, { subscriptionId: String(object.id || "") || null, planId: plan?.id || null, status: String(object.status || (eventType.endsWith("deleted") ? "canceled" : "")) || null, periodEnd: Number(object.current_period_end || 0) * 1000 || null });
        } else if (eventType === "invoice.payment_failed") {
          const customerId = String(object.customer || ""); const userId = userFor(customerId);
          upsertCustomer(userId, customerId, { subscriptionId: String(object.subscription || "") || null, status: "past_due" });
        }
        db.exec("COMMIT"); return { duplicate: false, credited: eventType === "invoice.paid" };
      } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    },
    createOrUpdateAdmin(emailValue, passwordValue) {
      configured(); const email = canonicalEmail(emailValue); const password = validatePassword(passwordValue); return hashPassword(password).then((passwordHash) => { const time = now(); const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email); db.exec("BEGIN IMMEDIATE"); try { const id = existing?.id || randomToken(16); if (existing) db.prepare("UPDATE users SET password_hash = ?, role = 'admin', credit_exempt = 1, email_verified = 1, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?").run(passwordHash, time, id); else { db.prepare("INSERT INTO users (id, email, password_hash, role, credit_balance, credit_exempt, email_verified, created_at, updated_at) VALUES (?, ?, ?, 'admin', 0, 1, 1, ?, ?)").run(id, email, passwordHash, time, time); db.prepare("INSERT INTO user_identities (id, user_id, provider, provider_subject, created_at) VALUES (?, ?, 'password', ?, ?)").run(randomToken(16), id, email, time); } db.exec("COMMIT"); return { id, email }; } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; } });
    },
  };
}
