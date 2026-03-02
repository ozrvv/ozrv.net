const intro = document.getElementById("intro");
const music = document.getElementById("bgMusic");
const cursor = document.querySelector(".cursor");
const panel = document.getElementById("musicPanel");

// Click to enter + autoplay
document.addEventListener("click", () => {
  if (intro.style.display !== "none") {
    intro.style.opacity = "0";
    setTimeout(() => {
      intro.style.display = "none";
    }, 600);

    music.volume = 0.5;
    music.play();
  }
});

// Custom cursor
document.addEventListener("mousemove", e => {
  cursor.style.left = e.clientX + "px";
  cursor.style.top = e.clientY + "px";
});

// Toggle music
function toggleMusic() {
  if (music.paused) {
    music.play();
  } else {
    music.pause();
  }
}

// Slide panel
function toggleMusicPanel() {
  panel.classList.toggle("active");
}

// Reaction game
function reactionGame() {
  const result = document.getElementById("reactionResult");
  result.textContent = "Wait for green...";
  
  const delay = Math.random() * 3000 + 2000;
  
  setTimeout(() => {
    result.textContent = "CLICK NOW!";
    const start = Date.now();

    document.onclick = () => {
      const time = Date.now() - start;
      result.textContent = `Your reaction time: ${time}ms`;
      document.onclick = null;
    };
  }, delay);
}