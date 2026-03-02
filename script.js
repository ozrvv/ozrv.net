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

// Scroll reveal
const sections = document.querySelectorAll(".section");

const revealOnScroll = () => {
  const triggerBottom = window.innerHeight * 0.85;

  sections.forEach(section => {
    const boxTop = section.getBoundingClientRect().top;

    if (boxTop < triggerBottom) {
      section.classList.add("show");
    }
  });
};

window.addEventListener("scroll", revealOnScroll);
revealOnScroll();