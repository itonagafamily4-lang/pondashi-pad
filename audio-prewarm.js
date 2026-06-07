(function () {
  var OriginalAudio = window.Audio;
  var audioContext = null;

  if (!OriginalAudio || OriginalAudio.__pondashiPrewarmed) return;

  function getAudioContext() {
    if (audioContext) return audioContext;
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    try {
      audioContext = new AudioContextClass();
    } catch (error) {
      audioContext = null;
    }
    return audioContext;
  }

  function resumeContext(context) {
    if (!context || context.state !== "suspended" || typeof context.resume !== "function") return;
    try {
      var result = context.resume();
      if (result && typeof result.catch === "function") result.catch(function () {});
    } catch (error) {}
  }

  function baseVolumeFor(audio) {
    var volume = Number(audio.dataset.baseVolume || audio.volume);
    if (!isFinite(volume) || volume <= 0) return 1;
    return volume;
  }

  function prepareAudio(audio) {
    if (!audio || audio._pondashiGain || audio.dataset.pondashiPrewarmFailed === "true") return;

    var context = getAudioContext();
    if (!context) return;

    try {
      var volume = baseVolumeFor(audio);
      var source = context.createMediaElementSource(audio);
      var gain = context.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(context.destination);
      audio._pondashiSource = source;
      audio._pondashiGain = gain;
      audio.dataset.webAudioConnected = "true";
      audio.volume = 1;
    } catch (error) {
      audio.dataset.pondashiPrewarmFailed = "true";
    }
  }

  function patchPlay(audio) {
    if (!audio || audio.__pondashiPlayPatched || typeof audio.play !== "function") return audio;

    var originalPlay = audio.play;
    audio.__pondashiPlayPatched = true;
    audio.play = function () {
      prepareAudio(audio);
      resumeContext(audio._pondashiGain ? audio._pondashiGain.context : audioContext);
      return originalPlay.apply(audio, arguments);
    };
    return audio;
  }

  function PondashiAudio(src) {
    var audio = src === undefined ? new OriginalAudio() : new OriginalAudio(src);
    return patchPlay(audio);
  }

  try {
    Object.setPrototypeOf(PondashiAudio, OriginalAudio);
  } catch (error) {}
  PondashiAudio.prototype = OriginalAudio.prototype;
  PondashiAudio.__pondashiPrewarmed = true;

  window.Audio = PondashiAudio;
})();
