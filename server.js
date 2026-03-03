const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
  SESSION_SECRET = "change-me",
  PORT = "3000"
} = process.env;

const app = express();
app.use(express.json());

const sessions = new Map();
const oauthStates = new Map();
let inMemoryDb = { users: {} };
let persistenceMode = "file";

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
  if (secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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

function createSignedSession(user) {
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

function getUserRecord(db, userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      bests: {}
    };
  }
  return db.users[userId];
}

function pruneOauthStates() {
  const now = Date.now();
  for (const [state, info] of oauthStates.entries()) {
    if (info.expiresAt < now) oauthStates.delete(state);
  }
}

setInterval(pruneOauthStates, 60 * 1000).unref();

const handleDiscordLogin = (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
    res
      .status(500)
      .send("Discord OAuth is not configured. Set DISCORD_CLIENT_ID/SECRET/REDIRECT_URI in .env.");
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");
  oauthStates.set(state, { expiresAt: Date.now() + OAUTH_STATE_TTL_MS });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: DISCORD_REDIRECT_URI,
    scope: "identify",
    state
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
};

app.get(["/api/auth/discord/login", "/auth/discord/login"], handleDiscordLogin);

const handleDiscordCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || !oauthStates.has(state)) {
      res.status(400).send("Invalid OAuth callback.");
      return;
    }
    oauthStates.delete(state);

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
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      res.status(400).send("No access token returned by Discord.");
      return;
    }

    const meResp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!meResp.ok) {
      const txt = await meResp.text();
      res.status(400).send(`Could not fetch Discord user: ${txt}`);
      return;
    }

    const me = await meResp.json();
    const db = loadScoreDb();
    const userRec = getUserRecord(db, me.id);
    userRec.username = me.username;
    userRec.avatar = me.avatar || "";
    userRec.updatedAt = new Date().toISOString();
    saveScoreDb(db);

    const sessionToken = createSignedSession(me);
    setSessionCookie(res, sessionToken);
    res.redirect("/");
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

app.get(["/api/me", "/me"], handleMe);

const handleGetScores = (req, res) => {
  const db = loadScoreDb();
  const rec = getUserRecord(db, req.auth.session.userId);
  res.json({ bests: rec.bests || {} });
};

app.get(["/api/scores", "/scores"], requireAuth, handleGetScores);

const handlePostScore = (req, res) => {
  const game = req.params.game;
  if (!["reaction", "tap", "number"].includes(game)) {
    res.status(400).json({ error: "Unknown game" });
    return;
  }
  const score = Number(req.body && req.body.score);
  if (!Number.isFinite(score)) {
    res.status(400).json({ error: "Score must be a number" });
    return;
  }

  const db = loadScoreDb();
  const rec = getUserRecord(db, req.auth.session.userId);
  const current = Number(rec.bests && rec.bests[game]);
  const isNewBest = isBetterScore(game, score, current);
  if (!rec.bests) rec.bests = {};
  if (isNewBest) {
    rec.bests[game] = score;
    rec.updatedAt = new Date().toISOString();
    saveScoreDb(db);
  }

  res.json({
    ok: true,
    isNewBest,
    best: rec.bests[game]
  });
};

app.post(["/api/scores/:game", "/scores/:game"], requireAuth, handlePostScore);

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
