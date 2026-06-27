(() => {
  const localFadeTimers = new WeakMap();
  const localFadeFrames = new WeakMap();

  function clearLocalFade(audio) {
    const timer = localFadeTimers.get(audio);
    if (timer) clearTimeout(timer);
    localFadeTimers.delete(audio);

    const frame = localFadeFrames.get(audio);
    if (frame) cancelAnimationFrame(frame);
    localFadeFrames.delete(audio);
  }

  function safeClampVolume(volume) {
    if (typeof clampVolume === "function") return clampVolume(volume);
    if (!Number.isFinite(volume)) return 1;
    return Math.min(Math.max(volume, 0), 1);
  }

  function finishSilently(audio, done) {
    audio.volume = 0;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {}
    if (typeof done === "function") done();
  }

  function quietFadeOut(audio, done) {
    if (!audio) return;

    if (typeof cancelFade === "function") cancelFade(audio);
    clearLocalFade(audio);

    const duration = 3000;
    if (audio.paused) audio.play().catch(() => {});

    if (audio._pondashiGain) {
      if (typeof resumeAudioContext === "function") resumeAudioContext();
      const gainNode = audio._pondashiGain;
      const gain = gainNode.gain;
      const now = gainNode.context.currentTime;
      const startVolume = Number.isFinite(gain.value) ? gain.value : Number(audio.dataset.baseVolume || 1);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(safeClampVolume(startVolume), now);
      gain.linearRampToValueAtTime(0, now + duration / 1000);

      const timer = setTimeout(() => {
        localFadeTimers.delete(audio);
        const stopAt = gainNode.context.currentTime;
        gain.cancelScheduledValues(stopAt);
        gain.setValueAtTime(0, stopAt);
        finishSilently(audio, done);
      }, duration + 160);
      localFadeTimers.set(audio, timer);
      return;
    }

    const startVolume = audio.volume;
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(progress, 2);
      audio.volume = Math.max(0, startVolume * eased);
      if (progress < 1) {
        localFadeFrames.set(audio, requestAnimationFrame(tick));
        return;
      }
      localFadeFrames.delete(audio);
      finishSilently(audio, done);
    };
    localFadeFrames.set(audio, requestAnimationFrame(tick));
  }

  try {
    window.fadeOut = quietFadeOut;
    fadeOut = quietFadeOut;
  } catch {
    window.fadeOut = quietFadeOut;
  }
})();
