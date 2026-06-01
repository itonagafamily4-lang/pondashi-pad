(() => {
  const fadeFrames = new WeakMap();

  function targets() {
    const list = [];
    activePlayers.forEach((players, padId) => {
      players.forEach((audio) => list.push({ audio, padId }));
    });
    return list;
  }

  function fadeOne(audio, padId) {
    const previousFrame = fadeFrames.get(audio);
    if (previousFrame) cancelAnimationFrame(previousFrame);

    const startVolume = audio.volume;
    const baseVolume = Number(audio.dataset.baseVolume || startVolume || 1);
    const startedAt = performance.now();
    const duration = 1200;

    if (audio.paused) audio.play().catch(() => {});

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(progress, 2);
      audio.volume = Math.max(0, startVolume * eased);

      if (progress < 1) {
        fadeFrames.set(audio, requestAnimationFrame(tick));
        return;
      }

      fadeFrames.delete(audio);
      audio.pause();
      audio.currentTime = 0;
      audio.volume = baseVolume;
      removePlayer(padId, audio);
    };

    fadeFrames.set(audio, requestAnimationFrame(tick));
  }

  function runFade(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const list = targets();
    if (!list.length) {
      setStatus("再生中の音源はありません");
      return;
    }

    list.forEach(({ audio, padId }) => fadeOne(audio, padId));
    setStatus("フェードアウト中");
  }

  window.addEventListener("load", () => {
    const button = document.querySelector("#fadeAllButton");
    if (button) button.addEventListener("click", runFade, true);
  });
})();
