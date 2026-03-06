const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
let BetterSqlite3 = null;
try {
  BetterSqlite3 = require("better-sqlite3");
} catch {
  BetterSqlite3 = null;
}

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const SCORE_FILE = path.join(DATA_DIR, "scores.json");
const SESSION_COOKIE = "ozrv_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10;

loadEnv(path.join(ROOT, ".env"));

const {
  DISCORD_CLIENT_ID = "",
  DISCORD_CLIENT_SECRET = "",
  DISCORD_REDIRECT_URI = "http://localhost:3000/api/auth/discord/callback",
  SUPABASE_URL = "",
  SUPABASE_SERVICE_ROLE_KEY = "",
  SESSION_SECRET = "change-me",
  COOKIE_DOMAIN = "",
  PORT = "3000",
  COREX_BOT_DB_PATH = path.join(ROOT, "..", "..", "Corex-bot", "botdata.db")
} = process.env;

const app = express();
app.use(express.json());
app.set("trust proxy", true);

const sessions = new Map();
const recentScoreSubmissions = new Map();
const DISCORD_ADMIN_PERMISSION = 0x8n;
let inMemoryDb = { users: {} };
let persistenceMode = "file";
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let corexDb = null;
if (BetterSqlite3) {
  try {
    if (fs.existsSync(COREX_BOT_DB_PATH)) {
      corexDb = new BetterSqlite3(COREX_BOT_DB_PATH, { readonly: false });
      corexDb.pragma("journal_mode = WAL");
    }
  } catch (err) {
    corexDb = null;
    // eslint-disable-next-line no-console
    console.warn("corex db unavailable: " + err.message);
  }
}

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch {
  persistenceMode = "memory";
}

try {
  if (fs.existsSync(SCORE_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(SCORE_FILE, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.users) {
      inMemoryDb = { users: parsed.users };
    }
  }
} catch {
  inMemoryDb = { users: {} };
  persistenceMode = "memory";
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadScoreDb() {
  return inMemoryDb;
}

function saveScoreDb(db) {
  inMemoryDb = db;
  if (persistenceMode !== "file") return;
  try {
    fs.writeFileSync(SCORE_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    persistenceMode = "memory";
    // eslint-disable-next-line no-console
    console.warn(`scores persistence fallback to memory: ${err.code || err.message}`);
  }
}

function mapSupabaseRowToRecord(row) {
  const parseNullableNumber = value => {
    if (value === null || value === undefined || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  if (!row) {
    return {
      bests: {}
    };
  }
  return {
    username: row.username || "",
    avatar: row.avatar || "",
    tokenHash: row.token_hash || "",
    lastDiscordLoginAt: row.last_discord_login_at || "",
    lastIp: row.last_ip || "",
    bests: {
      reaction: parseNullableNumber(row.reaction_best),
      tap: parseNullableNumber(row.tap_best),
      number: parseNullableNumber(row.number_best)
    }
  };
}

function gameToColumn(game) {
  if (game === "reaction") return "reaction_best";
  if (game === "tap") return "tap_best";
  if (game === "number") return "number_best";
  return "";
}

async function supabaseRequest(pathname, options = {}) {
  const url = `${SUPABASE_URL}${pathname}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...options.headers
  };
  const resp = await fetch(url, { ...options, headers });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`supabase ${resp.status}: ${txt}`);
  }
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return resp.json();
  }
  return null;
}

async function getUserRecordAsync(userId) {
  if (!hasSupabase) {
    const db = loadScoreDb();
    return getUserRecord(db, userId);
  }
  try {
    const params = new URLSearchParams({
      select: "user_id,username,avatar,token_hash,last_discord_login_at,last_ip,reaction_best,tap_best,number_best",
      user_id: `eq.${userId}`,
      limit: "1"
    });
    const rows = await supabaseRequest(`/rest/v1/user_scores?${params.toString()}`, {
      method: "GET"
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return { bests: {} };
    }
    return mapSupabaseRowToRecord(rows[0]);
  } catch {
    const db = loadScoreDb();
    return getUserRecord(db, userId);
  }
}

async function upsertUserProfile(user, meta = {}) {
  const nowIso = new Date().toISOString();
  if (!hasSupabase) {
    const db = loadScoreDb();
    const rec = getUserRecord(db, user.id);
    rec.username = user.username || "";
    rec.avatar = user.avatar || "";
    if (meta.tokenHash) rec.tokenHash = meta.tokenHash;
    rec.lastDiscordLoginAt = meta.lastDiscordLoginAt || nowIso;
    if (meta.lastIp) rec.lastIp = meta.lastIp;
    rec.updatedAt = nowIso;
    saveScoreDb(db);
    return;
  }
  try {
    const payload = [
      {
        user_id: user.id,
        username: user.username || "",
        avatar: user.avatar || "",
        token_hash: meta.tokenHash || null,
        last_discord_login_at: meta.lastDiscordLoginAt || nowIso,
        last_ip: meta.lastIp || null,
        updated_at: nowIso
      }
    ];
    await supabaseRequest("/rest/v1/user_scores?on_conflict=user_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    const db = loadScoreDb();
    const rec = getUserRecord(db, user.id);
    rec.username = user.username || "";
    rec.avatar = user.avatar || "";
    if (meta.tokenHash) rec.tokenHash = meta.tokenHash;
    rec.lastDiscordLoginAt = meta.lastDiscordLoginAt || nowIso;
    if (meta.lastIp) rec.lastIp = meta.lastIp;
    rec.updatedAt = nowIso;
    saveScoreDb(db);
  }
}

function hashDiscordToken(discordAccessToken) {
  return crypto.createHash("sha256").update(discordAccessToken).digest("hex");
}

function normalizeIp(ip) {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length);
  return ip;
}

function getClientIp(req) {
  const fromHeader = req.headers["x-forwarded-for"];
  if (typeof fromHeader === "string" && fromHeader.trim()) {
    const first = fromHeader.split(",")[0].trim();
    return normalizeIp(first);
  }
  if (Array.isArray(fromHeader) && fromHeader.length > 0) {
    const first = String(fromHeader[0] || "").split(",")[0].trim();
    return normalizeIp(first);
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || "");
}

async function isIpBanned(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized || !hasSupabase) return false;
  try {
    const params = new URLSearchParams({
      select: "ip",
      ip: `eq.${normalized}`,
      limit: "1"
    });
    const rows = await supabaseRequest(`/rest/v1/banned_ips?${params.toString()}`, {
      method: "GET"
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function recordDiscordLogin(user, discordAccessToken, ip) {
  const nowIso = new Date().toISOString();
  const tokenHash = hashDiscordToken(discordAccessToken);
  await upsertUserProfile(user, {
    tokenHash,
    lastDiscordLoginAt: nowIso,
    lastIp: ip || null
  });
}

async function requireNotBanned(req, res, next) {
  const ip = getClientIp(req);
  if (await isIpBanned(ip)) {
    res.status(403).json({ error: "This IP address is banned." });
    return;
  }
  next();
}

async function upsertGameBest(user, game, score) {
  if (!hasSupabase) {
    const db = loadScoreDb();
    const rec = getUserRecord(db, user.id);
    if (!rec.bests) rec.bests = {};
    rec.bests[game] = score;
    rec.username = user.username || rec.username || "";
    rec.avatar = user.avatar || rec.avatar || "";
    rec.updatedAt = new Date().toISOString();
    saveScoreDb(db);
    return;
  }
  const column = gameToColumn(game);
  if (!column) return;
  try {
    const payload = [
      {
        user_id: user.id,
        username: user.username || "",
        avatar: user.avatar || "",
        [column]: score,
        updated_at: new Date().toISOString()
      }
    ];
    await supabaseRequest("/rest/v1/user_scores?on_conflict=user_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    const db = loadScoreDb();
    const rec = getUserRecord(db, user.id);
    if (!rec.bests) rec.bests = {};
    rec.bests[game] = score;
    rec.username = user.username || rec.username || "";
    rec.avatar = user.avatar || rec.avatar || "";
    rec.updatedAt = new Date().toISOString();
    saveScoreDb(db);
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

function setSessionCookie(res, sessionId) {
  const secure = false;
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (COOKIE_DOMAIN) attrs.push(`Domain=${COOKIE_DOMAIN}`);
  if (secure) attrs.push("Secure");
  appendSetCookie(res, attrs.join("; "));
}

function clearSessionCookie(res) {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (COOKIE_DOMAIN) attrs.push(`Domain=${COOKIE_DOMAIN}`);
  appendSetCookie(res, attrs.join("; "));
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const arr = Array.isArray(current) ? current : [current];
  arr.push(cookieValue);
  res.setHeader("Set-Cookie", arr);
}

function signOauthState(state, expiresAt) {
  const payload = `${state}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function createOauthStateToken() {
  const state = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
  return signOauthState(state, expiresAt);
}

function verifyOauthStateToken(token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [state, expiresAtRaw, sig] = parts;
  if (!state || !/^[a-f0-9]{48}$/i.test(state)) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`${state}.${expiresAtRaw}`)
    .digest("hex");
  return sig === expectedSig;
}

function avatarUrl(user) {
  if (!user) return "";
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  }
  const discriminator = Number(user.discriminator || 0);
  const embed = Number.isFinite(discriminator) ? discriminator % 5 : 0;
  return `https://cdn.discordapp.com/embed/avatars/${embed}.png`;
}

function formatLeaderboardRow(row, game) {
  if (!row) return null;
  const column = gameToColumn(game);
  if (!column) return null;
  const score = Number(row[column]);
  if (!Number.isFinite(score)) return null;
  return {
    userId: row.user_id || "",
    username: row.username || "Unknown",
    avatarUrl: avatarUrl({ id: row.user_id, avatar: row.avatar }),
    score
  };
}

async function getLeaderboardFromSupabase(game, limit = 25) {
  const column = gameToColumn(game);
  if (!column) return [];
  const orderDirection = game === "reaction" ? "asc" : "desc";
  const params = new URLSearchParams({
    select: `user_id,username,avatar,${column}`,
    order: `${column}.${orderDirection}.nullslast`,
    limit: String(Math.max(1, Math.min(100, limit)))
  });
  const rows = await supabaseRequest(`/rest/v1/user_scores?${params.toString()}`, {
    method: "GET"
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(row => formatLeaderboardRow(row, game)).filter(Boolean);
}

function getLeaderboardFromLocal(game, limit = 25) {
  const db = loadScoreDb();
  const out = [];
  for (const [userId, rec] of Object.entries(db.users || {})) {
    const bests = rec && rec.bests ? rec.bests : {};
    const score = Number(bests[game]);
    if (!Number.isFinite(score)) continue;
    out.push({
      userId,
      username: rec.username || "Unknown",
      avatarUrl: avatarUrl({ id: userId, avatar: rec.avatar || "" }),
      score
    });
  }
  out.sort((a, b) => {
    if (game === "reaction") return a.score - b.score;
    return b.score - a.score;
  });
  return out.slice(0, Math.max(1, Math.min(100, limit)));
}

async function getLeaderboard(game, limit = 25) {
  if (!["reaction", "tap", "number"].includes(game)) return [];
  if (hasSupabase) {
    try {
      return await getLeaderboardFromSupabase(game, limit);
    } catch {
      return getLeaderboardFromLocal(game, limit);
    }
  }
  return getLeaderboardFromLocal(game, limit);
}

function createSignedSession(user, accessToken = "") {
  const sid = crypto.randomBytes(24).toString("hex");
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(sid)
    .digest("hex");
  const token = `${sid}.${sig}`;
  sessions.set(sid, {
    userId: user.id,
    username: user.username,
    avatar: user.avatar || "",
    accessToken,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;
  const [sid, sig] = token.split(".", 2);
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(sid)
    .digest("hex");
  if (sig !== expected) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return { sid, session };
}

async function fetchDiscordGuilds(accessToken) {
  if (!accessToken) return [];
  const resp = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("Discord guild fetch failed: " + resp.status + " " + txt);
  }
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

function hasAdminPermission(guild) {
  if (!guild) return false;
  if (guild.owner) return true;
  try {
    const perms = BigInt(guild.permissions || "0");
    return (perms & DISCORD_ADMIN_PERMISSION) === DISCORD_ADMIN_PERMISSION;
  } catch {
    return false;
  }
}

function parseId(input) {
  const value = String(input || "").trim();
  if (!value) return null;
  return /^\d{16,22}$/.test(value) ? value : null;
}

function parseColorHex(input) {
  const value = String(input || "").trim();
  return /^#?[0-9a-fA-F]{6}$/.test(value) ? (value.startsWith("#") ? value : ("#" + value)) : null;
}

function toBoolInt(value, fallback) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === 1 || value === "1") return 1;
  if (value === 0 || value === "0") return 0;
  return fallback ? 1 : 0;
}

function ensureBremindRow(guildId) {
  if (!corexDb) return;
  corexDb.prepare("INSERT OR IGNORE INTO bremind_config (guildId) VALUES (?)").run(guildId);
}

function getBremindConfig(guildId) {
  if (!corexDb) return null;
  ensureBremindRow(guildId);
  return corexDb.prepare("SELECT * FROM bremind_config WHERE guildId = ?").get(guildId);
}

function isGuildConnected(guildId) {
  if (!corexDb) return false;
  const tables = ["bremind_config", "welcome", "leave_messages", "reaction_role_messages", "ticket_config"];
  for (const table of tables) {
    try {
      const row = corexDb.prepare("SELECT guildId FROM " + table + " WHERE guildId = ? LIMIT 1").get(guildId);
      if (row) return true;
    } catch {}
  }
  return false;
}

function getAuth(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  const verified = verifySessionToken(token);
  return verified;
}

function requireAuth(req, res, next) {
  const auth = getAuth(req);
  if (!auth) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.auth = auth;
  next();
}

function isBetterScore(game, candidate, current) {
  if (!Number.isFinite(candidate)) return false;
  if (!Number.isFinite(current)) return true;
  if (game === "reaction") return candidate < current;
  return candidate > current;
}

function validateScoreValue(game, score) {
  if (!Number.isFinite(score)) return "Score must be a number";
  if (game === "reaction") {
    if (!Number.isInteger(score)) return "Reaction score must be a whole number (ms)";
    if (score < 100 || score > 2000) {
      return "Suspicious reaction score rejected";
    }
    return "";
  }
  if (game === "tap") {
    if (!Number.isInteger(score)) return "Tap score must be a whole number";
    if (score < 0 || score > 80) {
      return "Suspicious tap score rejected";
    }
    return "";
  }
  if (game === "number") {
    if (!Number.isInteger(score)) return "Number score must be a whole number";
    if (score < 0 || score > 120) {
      return "Suspicious number score rejected";
    }
    return "";
  }
  return "Unknown game";
}

function canSubmitScore(userId, game) {
  const now = Date.now();
  const key = `${userId}:${game}`;
  const last = Number(recentScoreSubmissions.get(key) || 0);
  const minGapMs = 1200;
  if (now - last < minGapMs) {
    return false;
  }
  recentScoreSubmissions.set(key, now);
  return true;
}

function getUserRecord(db, userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      bests: {}
    };
  }
  return db.users[userId];
}

const handleDiscordLogin = (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
    res
      .status(500)
      .send("Discord OAuth is not configured. Set DISCORD_CLIENT_ID/SECRET/REDIRECT_URI in .env.");
    return;
  }

  const state = createOauthStateToken();

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: DISCORD_REDIRECT_URI,
    scope: "identify guilds",
    state
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
};

app.get(["/api/auth/discord/login", "/auth/discord/login"], requireNotBanned, handleDiscordLogin);

const handleDiscordCallback = async (req, res) => {
  try {
    const ip = getClientIp(req);
    if (await isIpBanned(ip)) {
      res.status(403).send("This IP address is banned.");
      return;
    }

    const { code, state } = req.query;
    const stateStr = String(state || "");
    if (!code || !stateStr || !verifyOauthStateToken(stateStr)) {
      res.status(400).send("Invalid OAuth callback.");
      return;
    }

    const body = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: DISCORD_REDIRECT_URI
    });

    const tokenResp = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      res.status(400).send(`Discord token exchange failed: ${txt}`);
      return;
    }

    const tokenData = await tokenResp.json();
    // This is the real Discord OAuth access token returned by Discord.
    const discordAccessToken = tokenData.access_token;
    if (!discordAccessToken) {
      res.status(400).send("No access token returned by Discord.");
      return;
    }

    const meResp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${discordAccessToken}` }
    });
    if (!meResp.ok) {
      const txt = await meResp.text();
      res.status(400).send(`Could not fetch Discord user: ${txt}`);
      return;
    }

    const me = await meResp.json();
    await recordDiscordLogin(me, discordAccessToken, ip);

    const sessionToken = createSignedSession(me, discordAccessToken);
    setSessionCookie(res, sessionToken);
    res.redirect("/botdash");
  } catch (err) {
    res.status(500).send(`OAuth callback failed: ${err.message}`);
  }
};

app.get(["/api/auth/discord/callback", "/auth/discord/callback"], handleDiscordCallback);

const handleLogout = (req, res) => {
  const auth = getAuth(req);
  if (auth) {
    sessions.delete(auth.sid);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
};

app.post(["/api/auth/logout", "/auth/logout"], handleLogout);

const handleMe = (req, res) => {
  const auth = getAuth(req);
  if (!auth) {
    res.json({ loggedIn: false });
    return;
  }
  const { session } = auth;
  res.json({
    loggedIn: true,
    user: {
      id: session.userId,
      username: session.username,
      avatarUrl: avatarUrl({ id: session.userId, avatar: session.avatar })
    }
  });
};

app.get(["/api/me", "/me"], requireNotBanned, handleMe);

const handleGetScores = async (req, res) => {
  try {
    const rec = await getUserRecordAsync(req.auth.session.userId);
    res.json({ bests: rec.bests || {} });
  } catch (err) {
    res.status(500).json({ error: `Could not load scores: ${err.message}` });
  }
};

app.get(["/api/scores", "/scores"], requireNotBanned, requireAuth, handleGetScores);

const handleLeaderboard = async (req, res) => {
  try {
    const game = String(req.query.game || "reaction");
    const limit = Number(req.query.limit || 5);
    if (!["reaction", "tap", "number"].includes(game)) {
      res.status(400).json({ error: "Unknown game" });
      return;
    }
    const rows = await getLeaderboard(game, limit);
    res.json({
      game,
      rows
    });
  } catch (err) {
    res.status(500).json({ error: `Could not load leaderboard: ${err.message}` });
  }
};

app.get(["/api/leaderboard", "/leaderboard"], requireNotBanned, handleLeaderboard);

const handlePostScore = async (req, res) => {
  try {
    const game = req.params.game;
    if (!["reaction", "tap", "number"].includes(game)) {
      res.status(400).json({ error: "Unknown game" });
      return;
    }
    const score = Number(req.body && req.body.score);
    const validationError = validateScoreValue(game, score);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (!canSubmitScore(req.auth.session.userId, game)) {
      res.status(429).json({ error: "Too many score submissions. Please wait a moment." });
      return;
    }

    const rec = await getUserRecordAsync(req.auth.session.userId);
    const current = Number(rec.bests && rec.bests[game]);
    const isNewBest = isBetterScore(game, score, current);
    if (!rec.bests) rec.bests = {};
    if (isNewBest) {
      rec.bests[game] = score;
      await upsertGameBest(
        {
          id: req.auth.session.userId,
          username: req.auth.session.username,
          avatar: req.auth.session.avatar
        },
        game,
        score
      );
    }

    res.json({
      ok: true,
      isNewBest,
      best: rec.bests[game]
    });
  } catch (err) {
    res.status(500).json({ error: `Could not save score: ${err.message}` });
  }
};

app.post(["/api/scores/:game", "/scores/:game"], requireNotBanned, requireAuth, handlePostScore);

const handleBotDashGuilds = async (req, res) => {
  try {
    const guilds = await fetchDiscordGuilds(req.auth.session.accessToken);
    const adminGuilds = guilds
      .filter(hasAdminPermission)
      .map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon || "",
        owner: Boolean(g.owner),
        permissions: String(g.permissions || "0"),
        connected: isGuildConnected(g.id)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ guilds: adminGuilds });
  } catch (err) {
    res.status(500).json({ error: "Could not load guilds: " + err.message });
  }
};

app.get("/api/botdash/guilds", requireNotBanned, requireAuth, handleBotDashGuilds);

const requireGuildAdmin = async (req, res, next) => {
  try {
    const guildId = parseId(req.params.guildId);
    if (!guildId) {
      res.status(400).json({ error: "Invalid guild id" });
      return;
    }
    const guilds = await fetchDiscordGuilds(req.auth.session.accessToken);
    const guild = guilds.find(g => g.id === guildId);
    if (!guild || !hasAdminPermission(guild)) {
      res.status(403).json({ error: "You must be an admin in that server" });
      return;
    }
    req.botdashGuildId = guildId;
    next();
  } catch (err) {
    res.status(500).json({ error: "Could not verify guild permissions: " + err.message });
  }
};

const handleGetBotDashConfig = (req, res) => {
  if (!corexDb) {
    res.status(500).json({ error: "Corex database not available" });
    return;
  }
  try {
    const row = getBremindConfig(req.botdashGuildId);
    if (!row) {
      res.status(404).json({ error: "No config found" });
      return;
    }
    res.json({
      config: {
        guildId: row.guildId,
        enabled: Boolean(row.enabled),
        bumpChannelId: row.bumpChannelId || "",
        pingRoleId: row.pingRoleId || "",
        remindMinutes: Number(row.remindMinutes || 120),
        mentionLastBumper: Boolean(row.mentionLastBumper),
        responseMessage: row.responseMessage || "✅ Bump detected. I will remind {role} {time}.",
        remindTitle: row.remindTitle || "Bump Ready",
        remindDescription: row.remindDescription || "Use /bump now.",
        remindColor: row.remindColor || "#57F287",
        useEmbed: Boolean(row.useEmbed)
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Could not load config: " + err.message });
  }
};

const handlePutBotDashConfig = (req, res) => {
  if (!corexDb) {
    res.status(500).json({ error: "Corex database not available" });
    return;
  }

  try {
    const guildId = req.botdashGuildId;
    const current = getBremindConfig(guildId);
    if (!current) {
      res.status(404).json({ error: "No config found" });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};

    const next = {
      enabled: toBoolInt(body.enabled, current.enabled),
      bumpChannelId: body.bumpChannelId === "" ? null : (parseId(body.bumpChannelId) || current.bumpChannelId || null),
      pingRoleId: body.pingRoleId === "" ? null : (parseId(body.pingRoleId) || current.pingRoleId || null),
      remindMinutes: Number.isFinite(Number(body.remindMinutes)) ? Math.max(1, Math.min(240, Math.floor(Number(body.remindMinutes)))) : Number(current.remindMinutes || 120),
      mentionLastBumper: toBoolInt(body.mentionLastBumper, current.mentionLastBumper),
      responseMessage: typeof body.responseMessage === "string" ? body.responseMessage.slice(0, 1500) : (current.responseMessage || "✅ Bump detected. I will remind {role} {time}."),
      remindTitle: typeof body.remindTitle === "string" ? body.remindTitle.slice(0, 256) : (current.remindTitle || "Bump Ready"),
      remindDescription: typeof body.remindDescription === "string" ? body.remindDescription.slice(0, 2000) : (current.remindDescription || "Use /bump now."),
      remindColor: parseColorHex(body.remindColor) || current.remindColor || "#57F287",
      useEmbed: toBoolInt(body.useEmbed, current.useEmbed)
    };

    corexDb.prepare(
      "UPDATE bremind_config " +
      "SET enabled = ?, " +
      "bumpChannelId = ?, " +
      "pingRoleId = ?, " +
      "remindMinutes = ?, " +
      "mentionLastBumper = ?, " +
      "responseMessage = ?, " +
      "remindTitle = ?, " +
      "remindDescription = ?, " +
      "remindColor = ?, " +
      "useEmbed = ? " +
      "WHERE guildId = ?"
    ).run(
      next.enabled,
      next.bumpChannelId,
      next.pingRoleId,
      next.remindMinutes,
      next.mentionLastBumper,
      next.responseMessage,
      next.remindTitle,
      next.remindDescription,
      next.remindColor,
      next.useEmbed,
      guildId
    );

    res.json({
      ok: true,
      config: {
        guildId: guildId,
        enabled: Boolean(next.enabled),
        bumpChannelId: next.bumpChannelId || "",
        pingRoleId: next.pingRoleId || "",
        remindMinutes: next.remindMinutes,
        mentionLastBumper: Boolean(next.mentionLastBumper),
        responseMessage: next.responseMessage,
        remindTitle: next.remindTitle,
        remindDescription: next.remindDescription,
        remindColor: next.remindColor,
        useEmbed: Boolean(next.useEmbed)
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Could not save config: " + err.message });
  }
};

app.get("/api/botdash/config/:guildId", requireNotBanned, requireAuth, requireGuildAdmin, handleGetBotDashConfig);
app.put("/api/botdash/config/:guildId", requireNotBanned, requireAuth, requireGuildAdmin, handlePutBotDashConfig);

app.get("/botdash", (req, res) => {
  res.sendFile(path.join(ROOT, "botdash.html"));
});

app.use(express.static(ROOT));

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

if (require.main === module) {
  app.listen(Number(PORT), () => {
    // eslint-disable-next-line no-console
    console.log(`ozrv site running at http://localhost:${PORT}`);
  });
}

module.exports = app;
