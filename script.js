function reactionGame() {
  const result = document.getElementById("reactionResult");
  result.innerText = "Wait for green...";

  setTimeout(() => {
    result.innerText = "CLICK NOW!";
    const start = Date.now();

    document.body.onclick = function() {
      const reactionTime = Date.now() - start;
      result.innerText = "Reaction time: " + reactionTime + " ms";
      document.body.onclick = null;
    };

  }, Math.random() * 3000 + 1000);
}