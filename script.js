// ==========================
// MUSIC
// ==========================

const music = document.getElementById("bgMusic");
const timeDisplay = document.getElementById("time");
const playBtn = document.getElementById("playBtn");
const themeBtn = document.getElementById("themeBtn");
const sfxBtn = document.getElementById("sfxBtn");
const discordLoginBtn = document.getElementById("discordLoginBtn");
const discordProfile = document.getElementById("discordProfile");
const discordAvatar = document.getElementById("discordAvatar");
const discordName = document.getElementById("discordName");
const discordLogoutBtn = document.getElementById("discordLogoutBtn");
const syncStatus = document.getElementById("syncStatus");
const syncLoginBtn = document.getElementById("syncLoginBtn");
const leaderboardRows = document.getElementById("leaderboardRows");
const leaderboardStatus = document.getElementById("leaderboardStatus");
const leaderboardTabs = document.querySelectorAll(".lb-tab");

const STORAGE_KEYS = {
  theme: "ozrv_theme",
  sfx: "ozrv_sfx_enabled",
  reactionBest: "ozrv_reaction_best_ms",
  tapBest: "ozrv_tap_best_score",
  numberBest: "ozrv_number_best_score"
};

const FORMSPREE_ENDPOINT = "https://formspree.io/f/mykdqnlw";

let audioContext = null;
let sfxEnabled = localStorage.getItem(STORAGE_KEYS.sfx) !== "off";
let discordUser = null;
let apiAvailable = true;
let leaderboardGame = "reaction";

function setSyncStatus(message, tone) {
  if (!syncStatus) return;
  syncStatus.textContent = `Sync status: ${message}`;
  syncStatus.classList.remove("ok", "warn");
  if (tone) {
    syncStatus.classList.add(tone);
  }
  if (syncLoginBtn) {
    const needsLogin = message.toLowerCase().includes("please login with discord");
    syncLoginBtn.classList.toggle("hidden", !needsLogin);
  }
}

function ensureAudio() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

function playSfx(kind) {
  if (!sfxEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  if (kind === "hover") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.06);
  } else if (kind === "success") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.1);
  } else if (kind === "fail") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.11);
  } else {
    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.06);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "hover" ? 0.018 : 0.028, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "click" ? 0.08 : 0.12));
  osc.start(now);
  osc.stop(now + (kind === "click" ? 0.09 : 0.13));
}

function burstScore(el) {
  if (!el) return;
  el.classList.remove("score-burst");
  void el.offsetWidth;
  el.classList.add("score-burst");
}

if (sfxBtn) {
  sfxBtn.textContent = sfxEnabled ? "SFX On" : "SFX Off";
  sfxBtn.addEventListener("click", () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem(STORAGE_KEYS.sfx, sfxEnabled ? "on" : "off");
    sfxBtn.textContent = sfxEnabled ? "SFX On" : "SFX Off";
    playSfx("click");
  });
}

function bindSfx(el) {
  if (!el || el.dataset.sfxBound === "1") return;
  el.dataset.sfxBound = "1";
  el.addEventListener("pointerenter", () => playSfx("hover"));
  el.addEventListener("click", () => playSfx("click"));
}

document
  .querySelectorAll(
    "button, a, .card, .section h2, .music-bar, .contact-form input, .contact-form textarea"
  )
  .forEach(bindSfx);

function toggleMusic() {
  if (music.paused) {
    music.play();
    playBtn.textContent = "Pause";
  } else {
    music.pause();
    playBtn.textContent = "Listen";
  }
}

music.addEventListener("loadedmetadata", updateTime);
music.addEventListener("timeupdate", updateTime);

function updateTime() {
  const current = formatTime(music.currentTime);
  const duration = formatTime(music.duration);
  timeDisplay.textContent = `${current} / ${duration}`;
}

function formatTime(time) {
  const minutes = Math.floor(time / 60) || 0;
  const seconds = Math.floor(time % 60) || 0;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function applyTheme(theme) {
  const nextTheme = theme === "mono" ? "mono" : "dark";
  document.body.setAttribute("data-theme", nextTheme);
  localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
  if (themeBtn) {
    themeBtn.textContent = nextTheme === "mono" ? "Dark" : "Mono";
  }
}

const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "dark";
applyTheme(savedTheme);

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const current = document.body.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "mono" : "dark");
  });
}

function isBetterScore(game, candidate, current) {
  if (!Number.isFinite(candidate)) return false;
  if (!Number.isFinite(current)) return true;
  if (game === "reaction") return candidate < current;
  return candidate > current;
}

function updateAuthUi() {
  if (!discordLoginBtn || !discordProfile || !discordAvatar || !discordName) return;
  if (!discordUser) {
    discordLoginBtn.classList.remove("hidden");
    discordProfile.classList.add("hidden");
    return;
  }
  discordLoginBtn.classList.add("hidden");
  discordProfile.classList.remove("hidden");
  discordAvatar.src = discordUser.avatarUrl;
  discordName.textContent = discordUser.username;
}

async function saveRemoteScore(game, score) {
  if (!discordUser || !apiAvailable) return null;
  try {
    const resp = await fetch(`/api/scores/${game}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score })
    });
    if (!resp.ok) {
      if (resp.status === 404) {
        apiAvailable = false;
        setSyncStatus("API not found (local-only mode)", "warn");
      }
      return null;
    }
    const data = await resp.json();
    setSyncStatus("Synced to Discord account", "ok");
    void loadLeaderboard(leaderboardGame);
    return data;
  } catch {
    apiAvailable = false;
    setSyncStatus("API unreachable (local-only mode)", "warn");
    return null;
  }
}

function formatLeaderboardScore(game, score) {
  if (!Number.isFinite(score)) return "--";
  if (game === "reaction") return `${score} ms`;
  if (game === "tap") return `${score} taps`;
  return `${score} pts`;
}

function renderLeaderboard(game, rows) {
  if (!leaderboardRows || !leaderboardStatus) return;
  leaderboardRows.innerHTML = "";
  if (!Array.isArray(rows) || rows.length === 0) {
    leaderboardStatus.textContent = "No scores yet. Be the first to set one.";
    return;
  }
  leaderboardStatus.textContent = `Showing top ${rows.length} for ${game}.`;
  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "leaderboard-row";
    const username = row && row.username ? row.username : "Unknown";
    const avatarUrl = row && row.avatarUrl ? row.avatarUrl : "";
    const score = Number(row && row.score);
    const rank = document.createElement("div");
    rank.className = "leaderboard-rank";
    rank.textContent = `#${index + 1}`;

    const userWrap = document.createElement("div");
    userWrap.className = "leaderboard-user";
    const avatar = document.createElement("img");
    avatar.className = "leaderboard-avatar";
    avatar.src = avatarUrl;
    avatar.alt = `${username} avatar`;
    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = username;
    userWrap.appendChild(avatar);
    userWrap.appendChild(name);

    const scoreEl = document.createElement("div");
    scoreEl.className = "leaderboard-score";
    scoreEl.textContent = formatLeaderboardScore(game, score);

    item.appendChild(rank);
    item.appendChild(userWrap);
    item.appendChild(scoreEl);
    leaderboardRows.appendChild(item);
  });
}

function setLeaderboardTab(game) {
  leaderboardGame = ["reaction", "tap", "number"].includes(game) ? game : "reaction";
  leaderboardTabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.game === leaderboardGame);
  });
}

async function loadLeaderboard(game = leaderboardGame) {
  if (!leaderboardRows || !leaderboardStatus) return;
  setLeaderboardTab(game);
  try {
    const resp = await fetch(`/api/leaderboard?game=${encodeURIComponent(leaderboardGame)}&limit=25`);
    if (!resp.ok) {
      if (resp.status === 404) {
        leaderboardStatus.textContent = "Leaderboard API not available.";
      } else {
        leaderboardStatus.textContent = "Could not load leaderboard right now.";
      }
      return;
    }
    const data = await resp.json();
    renderLeaderboard(leaderboardGame, data && data.rows ? data.rows : []);
  } catch {
    leaderboardStatus.textContent = "Could not load leaderboard right now.";
  }
}

function applyRemoteBest(game, score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return;
  if (game === "reaction") {
    if (n <= 0) return;
    if (reactionBestMs === null || isBetterScore("reaction", n, reactionBestMs)) {
      reactionBestMs = n;
      reactionBest.textContent = `Best: ${reactionBestMs} ms`;
      localStorage.setItem(STORAGE_KEYS.reactionBest, String(reactionBestMs));
    }
  } else if (game === "tap") {
    if (tapBestScore === null || isBetterScore("tap", n, tapBestScore)) {
      tapBestScore = n;
      tapBest.textContent = `Best: ${tapBestScore} taps`;
      localStorage.setItem(STORAGE_KEYS.tapBest, String(tapBestScore));
    }
  } else if (game === "number") {
    if (numberBestScore === null || isBetterScore("number", n, numberBestScore)) {
      numberBestScore = n;
      numberBest.textContent = `Best: ${numberBestScore} points`;
      localStorage.setItem(STORAGE_KEYS.numberBest, String(numberBestScore));
    }
  }
}

async function loadRemoteScores() {
  if (!discordUser || !apiAvailable) return;
  try {
    const resp = await fetch("/api/scores");
    if (!resp.ok) {
      if (resp.status === 404) {
        apiAvailable = false;
        setSyncStatus("API not found (local-only mode)", "warn");
      }
      return;
    }
    const data = await resp.json();
    const bests = data && data.bests ? data.bests : {};
    applyRemoteBest("reaction", bests.reaction);
    applyRemoteBest("tap", bests.tap);
    applyRemoteBest("number", bests.number);
    setSyncStatus("Synced to Discord account", "ok");
  } catch {
    apiAvailable = false;
    setSyncStatus("API unreachable (local-only mode)", "warn");
  }
}

async function initAuth() {
  setSyncStatus("Checking...", "");
  try {
    const resp = await fetch("/api/me");
    if (resp.status === 404) {
      apiAvailable = false;
      discordUser = null;
      setSyncStatus("API not found (local-only mode)", "warn");
      updateAuthUi();
      return;
    }
    const data = await resp.json();
    if (data && data.loggedIn && data.user) {
      discordUser = data.user;
      setSyncStatus("Connected. Loading cloud scores...", "");
    } else {
      discordUser = null;
      setSyncStatus("Please login with Discord to save your progress", "warn");
    }
  } catch {
    apiAvailable = false;
    discordUser = null;
    setSyncStatus("API unreachable (local-only mode)", "warn");
  }

  updateAuthUi();
  await loadRemoteScores();
}

if (discordLogoutBtn) {
  discordLogoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // noop
    }
    discordUser = null;
    updateAuthUi();
    setSyncStatus("Please login with Discord to save your progress", "warn");
  });
}

leaderboardTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    setLeaderboardTab(tab.dataset.game || "reaction");
    void loadLeaderboard(leaderboardGame);
  });
});

// ==========================
// SMOOTH SCROLL
// ==========================

function smoothScroll(e, id) {
  e.preventDefault();
  document.getElementById(id).scrollIntoView({
    behavior: "smooth"
  });
}

// ==========================
// SCROLL REVEAL
// ==========================

const sections = document.querySelectorAll(".section");
sections.forEach((section, index) => {
  section.style.setProperty("--reveal-delay", `${Math.min(index * 70, 240)}ms`);
});

function revealOnScroll() {
  const triggerBottom = window.innerHeight * 0.85;

  sections.forEach(section => {
    const boxTop = section.getBoundingClientRect().top;
    if (boxTop < triggerBottom) {
      section.classList.add("show");
    }
  });
}

window.addEventListener("scroll", revealOnScroll);
revealOnScroll();

// ==========================
// GAMES
// ==========================

const reactionText = document.getElementById("reactionText");
const reactionBest = document.getElementById("reactionBest");
const reactionStartBtn = document.getElementById("reactionStartBtn");
const reactionTargetBtn = document.getElementById("reactionTargetBtn");

let reactionBestMs = null;
let reactionStartTime = 0;
let reactionReady = false;
let reactionTimerId = null;

if (reactionStartBtn && reactionTargetBtn && reactionText && reactionBest) {
  const storedBest = Number(localStorage.getItem(STORAGE_KEYS.reactionBest));
  if (Number.isFinite(storedBest) && storedBest > 0) {
    reactionBestMs = storedBest;
    reactionBest.textContent = `Best: ${reactionBestMs} ms`;
  }

  reactionStartBtn.addEventListener("click", () => {
    if (reactionTimerId || reactionReady) return;

    reactionText.textContent = "Wait for it...";
    reactionStartBtn.disabled = true;
    reactionTargetBtn.disabled = true;
    reactionTargetBtn.classList.remove("hot");
    reactionTargetBtn.textContent = "...";

    const delay = 1200 + Math.floor(Math.random() * 2200);
    reactionTimerId = setTimeout(() => {
      reactionReady = true;
      reactionStartTime = performance.now();
      reactionTargetBtn.disabled = false;
      reactionTargetBtn.classList.add("hot");
      reactionTargetBtn.textContent = "Click now!";
      reactionText.textContent = "GO!";
      reactionTimerId = null;
    }, delay);
  });

  reactionTargetBtn.addEventListener("click", async () => {
    if (!reactionReady) return;

    const time = Math.round(performance.now() - reactionStartTime);
    reactionReady = false;
    reactionTargetBtn.disabled = true;
    reactionTargetBtn.classList.remove("hot");
    reactionTargetBtn.textContent = "Click!";
    reactionStartBtn.disabled = false;
    reactionText.textContent = `Reaction time: ${time} ms`;

    if (reactionBestMs === null || time < reactionBestMs) {
      reactionBestMs = time;
      reactionBest.textContent = `Best: ${reactionBestMs} ms`;
      localStorage.setItem(STORAGE_KEYS.reactionBest, String(reactionBestMs));
      await saveRemoteScore("reaction", reactionBestMs);
      burstScore(reactionBest);
      playSfx("success");
    } else {
      playSfx("fail");
    }
  });
}

const tapText = document.getElementById("tapText");
const tapBest = document.getElementById("tapBest");
const tapStartBtn = document.getElementById("tapStartBtn");
const tapButton = document.getElementById("tapButton");

let tapScore = 0;
let tapBestScore = null;
let tapRoundActive = false;
let tapEndTime = 0;
let tapTickerId = null;

if (tapText && tapBest && tapStartBtn && tapButton) {
  const storedTapBest = Number(localStorage.getItem(STORAGE_KEYS.tapBest));
  if (Number.isFinite(storedTapBest) && storedTapBest >= 0) {
    tapBestScore = storedTapBest;
    tapBest.textContent = `Best: ${tapBestScore} taps`;
  }

  async function stopTapRound() {
    tapRoundActive = false;
    tapButton.disabled = true;
    tapStartBtn.disabled = false;
    tapText.textContent = `Round over! Score: ${tapScore} taps`;

    if (tapBestScore === null || tapScore > tapBestScore) {
      tapBestScore = tapScore;
      tapBest.textContent = `Best: ${tapBestScore} taps`;
      localStorage.setItem(STORAGE_KEYS.tapBest, String(tapBestScore));
      await saveRemoteScore("tap", tapBestScore);
      burstScore(tapBest);
      playSfx("success");
    } else {
      playSfx("fail");
    }

    if (tapTickerId) {
      clearInterval(tapTickerId);
      tapTickerId = null;
    }
  }

  tapStartBtn.addEventListener("click", () => {
    if (tapRoundActive) return;

    tapRoundActive = true;
    tapScore = 0;
    tapEndTime = Date.now() + 5000;
    tapStartBtn.disabled = true;
    tapButton.disabled = false;
    tapText.textContent = "Time left: 5.0s | Score: 0";

    tapTickerId = setInterval(() => {
      const msLeft = tapEndTime - Date.now();
      if (msLeft <= 0) {
        stopTapRound();
        return;
      }
      tapText.textContent = `Time left: ${(msLeft / 1000).toFixed(1)}s | Score: ${tapScore}`;
    }, 50);
  });

  tapButton.addEventListener("click", () => {
    if (!tapRoundActive) return;
    tapScore += 1;
  });
}

const numberText = document.getElementById("numberText");
const numberBest = document.getElementById("numberBest");
const numberStartBtn = document.getElementById("numberStartBtn");
const numberTarget = document.getElementById("numberTarget");
const numberGrid = document.getElementById("numberGrid");

let numberRoundActive = false;
let numberCurrentTarget = 0;
let numberScore = 0;
let numberBestScore = null;
let numberTickerId = null;
let numberEndAt = 0;

function setNumberTarget(target) {
  numberCurrentTarget = target;
  if (numberTarget) {
    numberTarget.textContent = `Target: ${target}`;
  }
  if (numberGrid) {
    numberGrid.querySelectorAll("button").forEach(btn => {
      btn.classList.toggle("active-target", Number(btn.dataset.num) === target);
    });
  }
}

if (numberGrid) {
  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.num = String(i);
    btn.textContent = String(i);
    btn.disabled = true;
    btn.addEventListener("click", () => {
      if (!numberRoundActive) return;
      if (Number(btn.dataset.num) === numberCurrentTarget) {
        numberScore += 1;
        setNumberTarget(1 + Math.floor(Math.random() * 9));
      }
    });
    bindSfx(btn);
    numberGrid.appendChild(btn);
  }
}

if (numberText && numberBest && numberStartBtn && numberTarget && numberGrid) {
  const storedNumberBest = Number(localStorage.getItem(STORAGE_KEYS.numberBest));
  if (Number.isFinite(storedNumberBest) && storedNumberBest >= 0) {
    numberBestScore = storedNumberBest;
    numberBest.textContent = `Best: ${numberBestScore} points`;
  }

  async function stopNumberRound() {
    numberRoundActive = false;
    numberGrid.querySelectorAll("button").forEach(btn => {
      btn.disabled = true;
      btn.classList.remove("active-target");
    });
    numberStartBtn.disabled = false;
    numberTarget.textContent = "Target: -";
    numberText.textContent = `Round over! Score: ${numberScore}`;

    if (numberBestScore === null || numberScore > numberBestScore) {
      numberBestScore = numberScore;
      numberBest.textContent = `Best: ${numberBestScore} points`;
      localStorage.setItem(STORAGE_KEYS.numberBest, String(numberBestScore));
      await saveRemoteScore("number", numberBestScore);
      burstScore(numberBest);
      playSfx("success");
    } else {
      playSfx("fail");
    }

    if (numberTickerId) {
      clearInterval(numberTickerId);
      numberTickerId = null;
    }
  }

  numberStartBtn.addEventListener("click", () => {
    if (numberRoundActive) return;
    numberRoundActive = true;
    numberScore = 0;
    numberStartBtn.disabled = true;
    numberGrid.querySelectorAll("button").forEach(btn => {
      btn.disabled = false;
    });
    setNumberTarget(1 + Math.floor(Math.random() * 9));
    numberEndAt = Date.now() + 10000;
    numberText.textContent = "Time left: 10.0s | Score: 0";

    numberTickerId = setInterval(() => {
      const left = numberEndAt - Date.now();
      if (left <= 0) {
        stopNumberRound();
        return;
      }
      numberText.textContent = `Time left: ${(left / 1000).toFixed(1)}s | Score: ${numberScore}`;
    }, 50);
  });
}

initAuth();
void loadLeaderboard("reaction");

// ==========================
// CONTACT FORM
// ==========================

const contactForm = document.getElementById("contactForm");
const contactStatus = document.getElementById("contactStatus");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const contactMessage = document.getElementById("contactMessage");

if (contactForm && contactStatus && contactName && contactEmail && contactMessage) {
  contactForm.addEventListener("submit", async e => {
    e.preventDefault();
    contactStatus.textContent = "Sending...";

    const payload = {
      name: contactName.value.trim(),
      email: contactEmail.value.trim(),
      message: contactMessage.value.trim()
    };

    if (!payload.name || !payload.email || !payload.message) {
      contactStatus.textContent = "Please fill out all fields.";
      return;
    }

    if (FORMSPREE_ENDPOINT) {
      try {
        const response = await fetch(FORMSPREE_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Form submit failed");

        contactStatus.textContent = "Message sent. Thank you!";
        contactForm.reset();
        return;
      } catch (_) {
        contactStatus.textContent = "Could not send right now. Trying email app...";
      }
    }

    const subject = encodeURIComponent(`Website Contact from ${payload.name}`);
    const body = encodeURIComponent(
      `Name: ${payload.name}\nEmail: ${payload.email}\n\n${payload.message}`
    );
    window.location.href = `mailto:ozrv.mail@gmail.com?subject=${subject}&body=${body}`;
    contactStatus.textContent = "Opened your email app to send the message.";
  });
}

// ==========================
// LOADING INTRO
// ==========================

const loadingIntro = document.getElementById("loadingIntro");
window.addEventListener("load", () => {
  if (!loadingIntro) return;
  setTimeout(() => {
    loadingIntro.classList.add("hidden");
  }, 350);
});

// ==========================
// DESKTOP CUSTOM CURSOR
// ==========================

const cursor = document.getElementById("customCursor");

if (cursor && window.innerWidth > 768) {
  cursor.style.display = "block";

  document.addEventListener("mousemove", e => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";

    const trail = document.createElement("div");
    trail.className = "cursor-trail";
    trail.style.left = e.clientX + "px";
    trail.style.top = e.clientY + "px";
    trail.style.background = Math.random() > 0.5 ? "#fff" : "#111";
    document.body.appendChild(trail);
    setTimeout(() => trail.remove(), 500);
  });
}
