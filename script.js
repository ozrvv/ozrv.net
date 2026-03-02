// ==========================
// MUSIC
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
// PARTICLES
// ==========================

const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particles = [];

for (let i = 0; i < 80; i++) {
  particles.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2,
    speedX: (Math.random() - 0.5) * 0.3,
    speedY: (Math.random() - 0.5) * 0.3
  });
}

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";

  particles.forEach(p => {
    p.x += p.speedX;
    p.y += p.speedY;

    if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
    if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  requestAnimationFrame(animateParticles);
}

animateParticles();

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// ==========================
// DESKTOP CUSTOM CURSOR
// ==========================

const cursor = document.getElementById("customCursor");

if (window.innerWidth > 768) {
  cursor.style.display = "block";

  document.addEventListener("mousemove", e => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
  });
}