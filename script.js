// ==========================
// MUSIC
// ==========================

const music = document.getElementById("bgMusic");
const timeDisplay = document.getElementById("time");
const playBtn = document.getElementById("playBtn");
const themeBtn = document.getElementById("themeBtn");
const sfxBtn = document.getElementById("sfxBtn");

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
  osc.type = kind === "hover" ? "triangle" : "square";
  osc.frequency.setValueAtTime(kind === "hover" ? 420 : 220, now);
  osc.frequency.exponentialRampToValueAtTime(kind === "hover" ? 620 : 340, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "hover" ? 0.018 : 0.03, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.start(now);
  osc.stop(now + 0.09);
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

  reactionTargetBtn.addEventListener("click", () => {
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

  function stopTapRound() {
    tapRoundActive = false;
    tapButton.disabled = true;
    tapStartBtn.disabled = false;
    tapText.textContent = `Round over! Score: ${tapScore} taps`;

    if (tapBestScore === null || tapScore > tapBestScore) {
      tapBestScore = tapScore;
      tapBest.textContent = `Best: ${tapBestScore} taps`;
      localStorage.setItem(STORAGE_KEYS.tapBest, String(tapBestScore));
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

  function stopNumberRound() {
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
