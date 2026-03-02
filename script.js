// Fade-in on scroll
const faders = document.querySelectorAll(".fade-in");

const appearOptions = {
  threshold: 0.2
};

const appearOnScroll = new IntersectionObserver(function(
  entries,
  appearOnScroll
) {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("visible");
    appearOnScroll.unobserve(entry.target);
  });
}, appearOptions);

faders.forEach(fader => {
  appearOnScroll.observe(fader);
});

// Reaction Game
function reactionGame() {
  const result = document.getElementById("reactionResult");
  result.innerText = "Wait for it...";
  document.body.style.background = "#0b0b0f";

  setTimeout(() => {
    document.body.style.background = "#063";
    result.innerText = "CLICK!";

    const start = Date.now();

    document.body.onclick = function () {
      const reactionTime = Date.now() - start;
      document.body.style.background = "#0b0b0f";
      result.innerText = "Reaction time: " + reactionTime + " ms";
      document.body.onclick = null;
    };

  }, Math.random() * 3000 + 1000);
}