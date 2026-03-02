// ==========================
// MUSIC PLAYER
// ==========================

const music = document.getElementById("bgMusic");
const timeDisplay = document.getElementById("time");
const playBtn = document.getElementById("playBtn");

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
// REACTION GAME
// ==========================

let reactionStart = null;
let reactionTimeout = null;

function startReaction() {
  const box = document.getElementById("reactionGame");
  const text = document.getElementById("reactionText");

  text.textContent = "Wait for white...";
  box.style.background = "rgba(255,255,255,0.05)";
  box.style.color = "white";

  reactionTimeout = setTimeout(() => {
    box.style.background = "white";
    box.style.color = "black";
    text.textContent = "CLICK!";
    reactionStart = new Date().getTime();
  }, Math.random() * 3000 + 2000);
}

document.getElementById("reactionGame").addEventListener("click", function () {
  if (!reactionStart) return;

  const reactionTime = new Date().getTime() - reactionStart;

  this.style.background = "rgba(255,255,255,0.05)";
  this.style.color = "white";
  document.getElementById("reactionText").textContent =
    `Your reaction time: ${reactionTime}ms`;

  reactionStart = null;
  clearTimeout(reactionTimeout);
});

// ==========================
// EASTER EGG (TYPE "ozrv")
// ==========================

let typed = "";

window.addEventListener("keydown", (e) => {
  typed += e.key.toLowerCase();

  if (typed.includes("ozrv")) {
    document.body.style.filter = "invert(1)";
    setTimeout(() => {
      document.body.style.filter = "none";
    }, 2000);
    typed = "";
  }
});