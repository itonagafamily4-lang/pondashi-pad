(function () {
  var lastActionAt = 0;

  function recentlyHandled() {
    var now = performance.now();
    if (now - lastActionAt < 320) return true;
    lastActionAt = now;
    return false;
  }

  function showStatus(text) {
    if (typeof setStatus === "function") setStatus(text);
  }

  function runStopAll() {
    if (typeof stopAll === "function") {
      stopAll();
      return;
    }
    showStatus("全停止しました");
  }

  function runFadeAll() {
    if (typeof fadeAll === "function") {
      fadeAll();
      return;
    }
    showStatus("フェードアウト中");
  }

  function handleTransport(event) {
    var target = event.target && event.target.closest ? event.target.closest("#stopAllButton, #fadeAllButton") : null;
    if (!target || recentlyHandled()) return;

    event.preventDefault();
    event.stopPropagation();

    if (target.id === "stopAllButton") {
      runStopAll();
      return;
    }
    if (target.id === "fadeAllButton") {
      runFadeAll();
    }
  }

  document.addEventListener("pointerup", handleTransport, true);
  document.addEventListener("touchend", handleTransport, true);
  document.addEventListener("click", handleTransport, true);
})();
