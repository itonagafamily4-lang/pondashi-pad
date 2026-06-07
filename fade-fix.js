(function () {
  var fadeButton = document.querySelector("#fadeAllButton");
  var fadeFrames = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var fadeTimers = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var fadeDuration = 3000;

  function getActivePlayers() {
    if (typeof activePlayers === "undefined" || !activePlayers || typeof activePlayers.forEach !== "function") {
      return null;
    }
    return activePlayers;
  }

  function showStatus(text) {
    if (typeof setStatus === "function") setStatus(text);
  }

  function resumeAudioContext(context) {
    if (!context || context.state !== "suspended" || typeof context.resume !== "function") return;
    try {
      var result = context.resume();
      if (result && typeof result.catch === "function") result.catch(function () {});
    } catch (error) {}
  }

  function clearFadeJobs(audio) {
    if (fadeFrames) {
      var previousFrame = fadeFrames.get(audio);
      if (previousFrame) cancelAnimationFrame(previousFrame);
      fadeFrames.delete(audio);
    }
    if (fadeTimers) {
      var previousTimer = fadeTimers.get(audio);
      if (previousTimer) clearTimeout(previousTimer);
      fadeTimers.delete(audio);
    }
  }

  function finishFade(padId, audio, originalVolume) {
    clearFadeJobs(audio);
    try {
      if (audio._pondashiGain) {
        var gain = audio._pondashiGain.gain;
        gain.cancelScheduledValues(gain.context.currentTime);
        gain.setValueAtTime(originalVolume, gain.context.currentTime);
      }
      audio.pause();
      audio.currentTime = 0;
      audio.volume = originalVolume;
    } catch (error) {
      // Mobile browsers can throw while resetting audio; cleanup below keeps the app usable.
    }
    if (typeof removePlayer === "function") removePlayer(padId, audio);
  }

  function fadeWithElementVolume(padId, audio, originalVolume, duration) {
    var startVolume = originalVolume > 0 ? originalVolume : 1;
    var startTime = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

    function tick(now) {
      var currentTime = now || Date.now();
      var progress = Math.min((currentTime - startTime) / duration, 1);
      var eased = progress * progress;
      audio.volume = Math.max(0, startVolume * (1 - eased));

      if (progress < 1 && !audio.ended) {
        var nextFrame = requestAnimationFrame(tick);
        if (fadeFrames) fadeFrames.set(audio, nextFrame);
        return;
      }

      finishFade(padId, audio, originalVolume);
    }

    var frame = requestAnimationFrame(tick);
    if (fadeFrames) fadeFrames.set(audio, frame);
  }

  function fadeOut(padId, audio) {
    if (!audio) return;

    clearFadeJobs(audio);

    var originalVolume = Number(audio.dataset.baseVolume || audio.volume);
    if (!isFinite(originalVolume) || originalVolume <= 0) originalVolume = 1;
    var duration = fadeDuration;
    var gain = audio._pondashiGain || null;

    if (audio.paused && !audio.ended) {
      try {
        var playResult = audio.play();
        if (playResult && typeof playResult.catch === "function") playResult.catch(function () {});
      } catch (error) {}
    }

    if (!gain) {
      fadeWithElementVolume(padId, audio, originalVolume, duration);
      return;
    }

    resumeAudioContext(gain.context);

    try {
      var now = gain.context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(originalVolume, now);
      gain.gain.linearRampToValueAtTime(0, now + duration / 1000);
    } catch (error) {
      fadeWithElementVolume(padId, audio, originalVolume, duration);
      return;
    }

    if (fadeTimers) {
      fadeTimers.set(
        audio,
        setTimeout(function () {
          finishFade(padId, audio, originalVolume);
        }, duration + 80),
      );
    } else {
      setTimeout(function () {
        finishFade(padId, audio, originalVolume);
      }, duration + 80);
    }
  }

  if (!fadeButton) return;

  fadeButton.addEventListener(
    "click",
    function (event) {
      var players = getActivePlayers();
      if (!players) return;

      var targets = [];
      players.forEach(function (padPlayers, padId) {
        padPlayers.forEach(function (audio) {
          targets.push({ padId: padId, audio: audio });
        });
      });

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!targets.length) {
        showStatus("再生中の音源はありません");
        return;
      }

      targets.forEach(function (target) {
        fadeOut(target.padId, target.audio);
      });
      showStatus("フェードアウト中");
    },
    true,
  );
})();
