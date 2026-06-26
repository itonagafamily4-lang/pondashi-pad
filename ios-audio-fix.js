(() => {
  function patchAudioContext(AudioContextClass) {
    if (!AudioContextClass || !AudioContextClass.prototype) return;
    if (AudioContextClass.prototype.__pondashiGainContextPatched) return;

    const originalCreateGain = AudioContextClass.prototype.createGain;
    if (typeof originalCreateGain !== "function") return;

    Object.defineProperty(AudioContextClass.prototype, "__pondashiGainContextPatched", {
      value: true,
    });

    AudioContextClass.prototype.createGain = function createPondashiGain(...args) {
      const gainNode = originalCreateGain.apply(this, args);
      try {
        if (gainNode && gainNode.gain && !gainNode.gain.context) {
          Object.defineProperty(gainNode.gain, "context", {
            configurable: true,
            get() {
              return gainNode.context;
            },
          });
        }
      } catch {
        try {
          gainNode.gain.context = gainNode.context;
        } catch {}
      }
      return gainNode;
    };
  }

  patchAudioContext(window.AudioContext);
  patchAudioContext(window.webkitAudioContext);
})();
