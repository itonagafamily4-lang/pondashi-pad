(function () {
  var fadeButton = document.querySelector("#fadeAllButton");
  var fadeFrames = typeof WeakMap !== "undefined" ? new WeakMap() : null;

  function getActivePlayers() {
    if (typeof activePlayers === "undefined" || !activePlayers || typeof activePlayers.forEach !== "function") {
      return null;
    }
    return activePlayers;
  }

  function showStatus(text) {
    if (typeof setStatus === "function") setStatus(text);
  }

  function finishFade(padId, audio, originalVolume) {
    if (fadeFrames) fadeFrames.delete(audio);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = originalVolume;
    } catch (error) {
      // Some mobile browsers can throw while resetting audio; the app state still needs cleanup.
    }
    if (typeof removePlayer === "function") removePlayer(padId, audio);
  }

  function fadeOut(padId, audio) {
    if (!audio) return;

    var previousFrame = fadeFrames ? fadeFrames.get(audio) : null;
    if (previousFrame) cancelAnimationFrame(previousFrame);

    var originalVolume = Number(audio.volume);
    if (!isFinite(originalVolume)) originalVolume = 1;
    var startVolume = originalVolume > 0 ? originalVolume : 1;
    var startTime = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var duration = 1200;

    if (audio.paused && !audio.ended) {
      try {
        var playResult = audio.play();
        if (playResult && typeof playResult.catch === "function") playResult.catch(function () {});
      } catch (error) {}
    }

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
