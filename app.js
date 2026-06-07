const DB_NAME = "pondashi-pad-db";
const DB_STORE = "audio-files";
const PADS_PER_PAGE = 12;
const PAGE_COUNT = 5;
const PAD_COUNT = PADS_PER_PAGE * PAGE_COUNT;
const DEFAULT_COLORS = [
  "#4fb69f",
  "#f0b44f",
  "#e86d6d",
  "#6f93d6",
  "#b875d8",
  "#7fb866",
  "#d9824f",
  "#5ea3b8",
  "#d25f91",
  "#8b8f98",
  "#c7b56f",
  "#6bba89",
];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4"];

const padGrid = document.querySelector("#padGrid");
const padTemplate = document.querySelector("#padTemplate");
const statusText = document.querySelector("#statusText");
const activeCount = document.querySelector("#activeCount");
const pageSummary = document.querySelector("#pageSummary");
const pageTabs = document.querySelector("#pageTabs");
const stopAllButton = document.querySelector("#stopAllButton");
const pauseAllButton = document.querySelector("#pauseAllButton");
const pauseAllText = document.querySelector("#pauseAllText");
const fadeAllButton = document.querySelector("#fadeAllButton");
const masterVolumeInput = document.querySelector("#masterVolumeInput");
const masterVolumeOutput = document.querySelector("#masterVolumeOutput");
const padDialog = document.querySelector("#padDialog");
const padForm = document.querySelector("#padForm");
const dialogTitle = document.querySelector("#dialogTitle");
const closePadButton = document.querySelector("#closePadButton");
const savePadButton = document.querySelector("#savePadButton");
const padNameInput = document.querySelector("#padNameInput");
const singleFileInput = document.querySelector("#singleFileInput");
const volumeInput = document.querySelector("#volumeInput");
const volumeOutput = document.querySelector("#volumeOutput");
const colorSwatches = document.querySelector("#colorSwatches");
const deletePadButton = document.querySelector("#deletePadButton");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const closeSettingsButton = document.querySelector("#closeSettingsButton");
const vibrateToggle = document.querySelector("#vibrateToggle");
const wakeToggle = document.querySelector("#wakeToggle");
const resetButton = document.querySelector("#resetButton");

let pads = [];
let settings = { vibrate: true, keepAwake: false, masterVolume: 1 };
let currentPage = 0;
let editingPadId = null;
let selectedColor = DEFAULT_COLORS[0];
let pendingFile = null;
let wakeLock = null;
const audioUrls = new Map();
const activePlayers = new Map();
const memoryBlobs = new Map();
const fadeFrames = new WeakMap();
const fadeTimers = new WeakMap();
let audioContext = null;
let masterGain = null;

window.addEventListener("error", (event) => {
  setStatus(`エラー: ${event.message || "画面を再読み込みしてください"}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason && event.reason.message ? event.reason.message : "画面を再読み込みしてください";
  setStatus(`エラー: ${reason}`);
});

function id() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putBlob(key, blob) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    memoryBlobs.set(key, blob);
    return false;
  }
}

async function getBlob(key) {
  if (memoryBlobs.has(key)) return memoryBlobs.get(key);
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE).objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function deleteBlob(key) {
  memoryBlobs.delete(key);
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return undefined;
  }
}

function loadState() {
  try {
    const savedPads = localStorage.getItem("pondashi:pads");
    const savedSettings = localStorage.getItem("pondashi:settings");
    const savedPage = localStorage.getItem("pondashi:page");
    pads = savedPads ? JSON.parse(savedPads) : createEmptyPads();
    settings = savedSettings ? { ...settings, ...JSON.parse(savedSettings) } : settings;
    currentPage = savedPage ? Number(savedPage) : 0;
  } catch {
    pads = createEmptyPads();
  }
  if (!Array.isArray(pads) || pads.length === 0) pads = createEmptyPads();
  pads = normalizePads(pads);
  currentPage = clampPage(currentPage);
  settings.masterVolume = clampVolume(Number(settings.masterVolume ?? 1));
}

function saveState() {
  try {
    localStorage.setItem("pondashi:pads", JSON.stringify(pads));
    localStorage.setItem("pondashi:settings", JSON.stringify(settings));
    localStorage.setItem("pondashi:page", String(currentPage));
  } catch {
    setStatus("この開き方では設定保存が制限されています");
  }
}

function createEmptyPads() {
  return Array.from({ length: PAD_COUNT }, (_, index) => createPad(index));
}

function normalizePads(savedPads) {
  const normalized = [];
  for (let index = 0; index < PAD_COUNT; index += 1) {
    normalized.push({ ...createPad(index), ...(savedPads[index] || {}) });
  }
  return normalized;
}

function createPad(index) {
  return {
    id: id(),
    name: `Pad ${index + 1}`,
    fileName: "",
    blobKey: "",
    dataUrl: "",
    mode: "restart",
    volume: 1,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  };
}

function padById(padId) {
  return pads.find((pad) => pad.id === padId);
}

function pageForPadIndex(index) {
  return Math.floor(index / PADS_PER_PAGE);
}

function clampPage(page) {
  if (!Number.isFinite(page)) return 0;
  return Math.min(Math.max(Math.round(page), 0), PAGE_COUNT - 1);
}

function visiblePads() {
  const start = currentPage * PADS_PER_PAGE;
  return pads.slice(start, start + PADS_PER_PAGE).map((pad, offset) => ({
    pad,
    index: start + offset,
  }));
}

function playersFor(padId) {
  if (!activePlayers.has(padId)) activePlayers.set(padId, new Set());
  return activePlayers.get(padId);
}

function clampVolume(volume) {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(Math.max(volume, 0), 1);
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    audioContext = new AudioContextClass();
  } catch {
    audioContext = null;
  }
  return audioContext;
}

async function resumeAudioContext() {
  const context = getAudioContext();
  if (context && context.state === "suspended" && typeof context.resume === "function") {
    try {
      await context.resume();
    } catch {}
  }
  return context;
}

function getMasterGain() {
  const context = getAudioContext();
  if (!context) return null;
  if (!masterGain) {
    masterGain = context.createGain();
    masterGain.gain.value = clampVolume(settings.masterVolume);
    masterGain.connect(context.destination);
  }
  return masterGain;
}

function setMasterVolume(volume, options = {}) {
  settings.masterVolume = clampVolume(volume);
  if (masterVolumeInput) masterVolumeInput.value = Math.round(settings.masterVolume * 100);
  if (masterVolumeOutput) masterVolumeOutput.value = `${Math.round(settings.masterVolume * 100)}%`;

  if (masterGain) {
    const now = masterGain.context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(settings.masterVolume, now, 0.015);
  }

  if (options.save) saveState();
}

function connectAudioGain(audio, volume) {
  if (audio._pondashiGain) return audio._pondashiGain;
  const context = getAudioContext();
  if (!context) return null;

  try {
    const output = getMasterGain() || context.destination;
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    gain.gain.value = clampVolume(volume);
    source.connect(gain);
    gain.connect(output);
    audio._pondashiSource = source;
    audio._pondashiGain = gain;
    audio.dataset.webAudioConnected = "true";
    return gain;
  } catch {
    return null;
  }
}

function setAudioGain(audio, volume) {
  if (audio._pondashiGain) {
    const gain = audio._pondashiGain.gain;
    gain.cancelScheduledValues(gain.context.currentTime);
    gain.setValueAtTime(clampVolume(volume), gain.context.currentTime);
  }
}

function cancelFade(audio) {
  const frame = fadeFrames.get(audio);
  if (frame) cancelAnimationFrame(frame);
  fadeFrames.delete(audio);

  const timer = fadeTimers.get(audio);
  if (timer) clearTimeout(timer);
  fadeTimers.delete(audio);
}

async function urlForPad(pad) {
  if (pad.dataUrl) return pad.dataUrl;
  if (!pad.blobKey) return "";
  if (audioUrls.has(pad.blobKey)) return audioUrls.get(pad.blobKey);
  const blob = await getBlob(pad.blobKey);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  audioUrls.set(pad.blobKey, url);
  return url;
}

function renderPads() {
  padGrid.textContent = "";
  visiblePads().forEach(({ pad, index }) => {
    const node = padTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.padId = pad.id;
    node.style.setProperty("--pad-color", pad.color);
    node.classList.toggle("is-empty", !pad.blobKey);
    node.querySelector(".pad-number").textContent = String(index + 1).padStart(2, "0");
    node.querySelector(".pad-name").textContent = pad.name || `Pad ${index + 1}`;
    node.querySelector(".pad-file").textContent = pad.fileName || "音源未設定";
    node.querySelector(".pad-trigger").addEventListener("click", () => playPad(pad.id));
    node.querySelector(".pad-menu").addEventListener("click", () => openPadDialog(pad.id));
    padGrid.append(node);
  });
  renderPageTabs();
  updatePlaybackUi();
}

function renderPageTabs() {
  if (pageSummary) {
    const first = currentPage * PADS_PER_PAGE + 1;
    const last = first + PADS_PER_PAGE - 1;
    pageSummary.textContent = `Page ${currentPage + 1} / ${PAGE_COUNT} (${first}-${last})`;
  }
  if (!pageTabs) return;

  pageTabs.textContent = "";
  for (let page = 0; page < PAGE_COUNT; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-tab";
    button.textContent = String(page + 1);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(page === currentPage));
    button.addEventListener("click", () => setPage(page));
    pageTabs.append(button);
  }
}

function setPage(page) {
  const nextPage = clampPage(page);
  if (nextPage === currentPage) return;
  currentPage = nextPage;
  saveState();
  renderPads();
  setStatus(`ページ ${currentPage + 1} を表示`);
}

function renderSwatches() {
  colorSwatches.textContent = "";
  DEFAULT_COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.className = "swatch";
    button.type = "button";
    button.role = "radio";
    button.ariaLabel = color;
    button.style.setProperty("--swatch", color);
    button.setAttribute("aria-checked", String(color === selectedColor));
    button.addEventListener("click", () => {
      selectedColor = color;
      renderSwatches();
    });
    colorSwatches.append(button);
  });
}

function openPadDialog(padId, options = {}) {
  const pad = padById(padId);
  if (!pad) return;
  editingPadId = padId;
  pendingFile = null;
  dialogTitle.textContent = pad.name || "パッド編集";
  padNameInput.value = pad.name;
  singleFileInput.value = "";
  volumeInput.value = Math.round(pad.volume * 100);
  volumeOutput.value = `${volumeInput.value}%`;
  selectedColor = pad.color;
  padForm.elements.mode.value = pad.mode;
  syncModeLabels();
  deletePadButton.hidden = !pad.blobKey && !pad.name;
  renderSwatches();
  openDialog(padDialog);
  if (options.pickFile) setStatus("音源欄をタップしてファイルを選んでください");
}

function syncModeLabels() {
  document.querySelectorAll(".segmented label").forEach((label) => {
    const input = label.querySelector("input");
    label.classList.toggle("is-selected", Boolean(input && input.checked));
  });
}

function openDialog(dialog) {
  if (!dialog) return;
  if (dialog && typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "");
  dialog.classList.add("is-fallback-open");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog && typeof dialog.close === "function") {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
  dialog.classList.remove("is-fallback-open");
}

async function playPad(padId) {
  const pad = padById(padId);
  if (!pad || !pad.blobKey) {
    openPadDialog(padId, { pickFile: true });
    return;
  }

  if (settings.vibrate && "vibrate" in navigator) navigator.vibrate(14);
  const url = await urlForPad(pad);
  if (!url) {
    setStatus("音源が見つかりません。もう一度登録してください");
    return;
  }

  if (pad.mode === "restart") stopPad(padId);
  if (pad.mode === "loop" && playersFor(padId).size > 0) {
    stopPad(padId);
    return;
  }

  const audio = new Audio(url);
  audio.preload = "auto";
  audio.loop = pad.mode === "loop";
  audio.volume = 1;
  audio.dataset.baseVolume = String(pad.volume);
  audio.dataset.startedAt = String(performance.now());
  const gain = connectAudioGain(audio, pad.volume);
  if (!gain) audio.volume = pad.volume;
  playersFor(padId).add(audio);
  audio.addEventListener("ended", () => removePlayer(padId, audio));
  audio.addEventListener("pause", () => {
    if (audio.ended || audio.currentTime >= audio.duration) removePlayer(padId, audio);
  });

  try {
    await resumeAudioContext();
    await audio.play();
    setStatus(`${pad.name} を再生`);
  } catch {
    removePlayer(padId, audio);
    setStatus("再生できませんでした。画面を一度タップしてから試してください");
  }
  updatePlaybackUi();
}

function removePlayer(padId, audio) {
  cancelFade(audio);
  const players = playersFor(padId);
  players.delete(audio);
  updatePlaybackUi();
}

function stopPad(padId) {
  const players = playersFor(padId);
  players.forEach((audio) => {
    cancelFade(audio);
    setAudioGain(audio, Number(audio.dataset.baseVolume || 1));
    audio.pause();
    audio.currentTime = 0;
  });
  players.clear();
  updatePlaybackUi();
}

function stopAll() {
  activePlayers.forEach((_, padId) => stopPad(padId));
  setStatus("全停止しました");
}

async function pauseAll() {
  const players = allPlayers();
  if (!players.length) {
    setStatus("再生中の音源はありません");
    return;
  }

  const shouldResume = players.every((audio) => audio.paused);
  if (shouldResume) {
    await resumeAudioContext();
    const results = await Promise.allSettled(players.map((audio) => audio.play()));
    const resumed = results.filter((result) => result.status === "fulfilled").length;
    setStatus(resumed ? "再開しました" : "再開できませんでした");
  } else {
    players.forEach((audio) => audio.pause());
    setStatus("一時停止しました");
  }
  updatePlaybackUi();
}

function fadeAll() {
  const targets = [];
  activePlayers.forEach((players, padId) => {
    players.forEach((audio) => targets.push({ audio, padId }));
  });
  if (!targets.length) {
    setStatus("再生中の音源はありません");
    return;
  }
  targets.forEach(({ audio, padId }) => fadeOut(audio, () => removePlayer(padId, audio)));
  setStatus("フェードアウト中");
}

function fadeOut(audio, done) {
  cancelFade(audio);

  const duration = 3000;
  if (audio.paused) audio.play().catch(() => {});

  if (audio._pondashiGain) {
    resumeAudioContext();
    const gain = audio._pondashiGain.gain;
    const now = gain.context.currentTime;
    const startVolume = Number.isFinite(gain.value) ? gain.value : Number(audio.dataset.baseVolume || 1);
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(clampVolume(startVolume), now);
    gain.linearRampToValueAtTime(0, now + duration / 1000);

    const timer = setTimeout(() => {
      fadeTimers.delete(audio);
      audio.pause();
      audio.currentTime = 0;
      setAudioGain(audio, Number(audio.dataset.baseVolume || startVolume || 1));
      done();
    }, duration + 80);
    fadeTimers.set(audio, timer);
    return;
  }

  const startVolume = audio.volume;
  const startedAt = performance.now();
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
    audio.volume = Number(audio.dataset.baseVolume || startVolume || 1);
    done();
  };
  fadeFrames.set(audio, requestAnimationFrame(tick));
}

function allPlayers() {
  const list = [];
  activePlayers.forEach((players) => {
    players.forEach((audio) => list.push(audio));
  });
  return list;
}

function updatePlaybackUi() {
  let playingCount = 0;
  let pausedCount = 0;
  document.querySelectorAll(".pad").forEach((node) => {
    const padId = node.dataset.padId;
    const players = playersFor(padId);
    const playerList = [...players];
    const playing = playerList.some((audio) => !audio.paused);
    const paused = playerList.length > 0 && playerList.every((audio) => audio.paused);
    node.classList.toggle("is-playing", playing);
    node.classList.toggle("is-paused", paused);
    playingCount += playerList.filter((audio) => !audio.paused).length;
    pausedCount += playerList.filter((audio) => audio.paused).length;

    const firstAudio = playerList[0];
    let progress = 0;
    if (firstAudio && firstAudio.duration && Number.isFinite(firstAudio.duration)) {
      progress = firstAudio.currentTime / firstAudio.duration;
    }
    node.style.setProperty("--progress", String(progress));
  });
  activeCount.textContent = pausedCount ? `${playingCount} playing / ${pausedCount} paused` : `${playingCount} playing`;
  if (pauseAllText) {
    const players = allPlayers();
    pauseAllText.textContent = players.length && players.every((audio) => audio.paused) ? "再開" : "一時停止";
  }
}

function animateMeters() {
  updatePlaybackUi();
  requestAnimationFrame(animateMeters);
}

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function on(element, eventName, handler) {
  if (element) element.addEventListener(eventName, handler);
}

async function importFiles(files) {
  const fileList = Array.prototype.slice.call(files).filter(isAudioFile);
  if (!fileList.length) return;

  let addedCount = 0;
  let firstAddedIndex = -1;
  for (const file of fileList) {
    const emptyIndex = pads.findIndex((pad) => !pad.blobKey);
    if (emptyIndex < 0) break;
    const emptyPad = pads[emptyIndex];
    await assignFile(emptyPad, file, fileList.length > 1);
    if (firstAddedIndex < 0) firstAddedIndex = emptyIndex;
    addedCount += 1;
  }
  if (!addedCount) {
    setStatus("空きPadがありません。最大60件まで登録できます");
    return;
  }
  if (firstAddedIndex >= 0) currentPage = pageForPadIndex(firstAddedIndex);
  saveState();
  renderPads();
  setStatus(
    addedCount === fileList.length
      ? `${addedCount}件の音源を追加しました`
      : `${addedCount}件を追加しました。最大60件までです`,
  );
}

function isAudioFile(file) {
  if (!file) return false;
  if (file.type && file.type.indexOf("audio/") === 0) return true;
  const name = file.name ? file.name.toLowerCase() : "";
  return AUDIO_EXTENSIONS.some((extension) => name.endsWith(extension));
}

async function assignFile(pad, file, renamePad = false) {
  if (!isAudioFile(file)) throw new Error("音声ファイルを選んでください");
  if (pad.blobKey) await deleteBlob(pad.blobKey);
  const blobKey = id();
  const blob = file.slice(0, file.size, file.type || "audio/mpeg");
  const stored = await putBlob(blobKey, blob);
  pad.blobKey = blobKey;
  pad.dataUrl = "";
  if (!stored && file.size < 480000) pad.dataUrl = await fileToDataUrl(file);
  pad.fileName = file.name;
  if (renamePad || !pad.name || /^Pad \d+$/.test(pad.name)) {
    pad.name = file.name.replace(/\.[^.]+$/, "").slice(0, 24);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function savePadFromDialog() {
  const pad = padById(editingPadId);
  if (!pad) return false;
  if (!pad.blobKey && !pendingFile) {
    setStatus("音源ファイルを選んでから保存してください");
    return false;
  }

  pad.name = padNameInput.value.trim() || pad.name;
  pad.mode = padForm.elements.mode.value || "restart";
  pad.volume = Number(volumeInput.value) / 100;
  pad.color = selectedColor;
  try {
    if (pendingFile) await assignFile(pad, pendingFile);
  } catch (error) {
    setStatus(error && error.message ? error.message : "音源を保存できませんでした");
    return false;
  }
  saveState();
  renderPads();
  setStatus(`${pad.name} を保存しました`);
  return true;
}

async function clearPad(padId) {
  const pad = padById(padId);
  if (!pad) return;
  stopPad(padId);
  if (pad.blobKey) await deleteBlob(pad.blobKey);
  const padNumber = pads.indexOf(pad) + 1;
  pad.name = `Pad ${padNumber}`;
  pad.fileName = "";
  pad.blobKey = "";
  pad.dataUrl = "";
  pad.mode = "restart";
  pad.volume = 1;
  saveState();
  renderPads();
  setStatus("パッドを削除しました");
}

async function resetAll() {
  stopAll();
  await Promise.all(pads.filter((pad) => pad.blobKey).map((pad) => deleteBlob(pad.blobKey)));
  audioUrls.forEach((url) => URL.revokeObjectURL(url));
  audioUrls.clear();
  pads = createEmptyPads();
  currentPage = 0;
  saveState();
  renderPads();
  setStatus("全パッドを削除しました");
}

async function updateWakeLock() {
  if (!("wakeLock" in navigator)) return;
  if (settings.keepAwake && !wakeLock) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      settings.keepAwake = false;
      wakeToggle.checked = false;
      saveState();
      setStatus("画面維持はこの環境では使えません");
    }
  } else if (!settings.keepAwake && wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

function bindEvents() {
  on(stopAllButton, "click", stopAll);
  on(pauseAllButton, "click", pauseAll);
  on(fadeAllButton, "click", fadeAll);
  on(masterVolumeInput, "input", () => {
    setMasterVolume(Number(masterVolumeInput.value) / 100, { save: true });
  });
  on(volumeInput, "input", () => {
    volumeOutput.value = `${volumeInput.value}%`;
  });
  on(singleFileInput, "change", (event) => {
    pendingFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    if (pendingFile && !isAudioFile(pendingFile)) {
      setStatus("音声ファイルを選んでください");
      pendingFile = null;
      singleFileInput.value = "";
      return;
    }
    if (pendingFile && (!padNameInput.value || /^Pad \d+$/.test(padNameInput.value))) {
      padNameInput.value = pendingFile.name.replace(/\.[^.]+$/, "").slice(0, 24);
    }
    if (pendingFile) setStatus(`${pendingFile.name} を選択しました。保存を押してください`);
  });
  document.querySelectorAll("input[name='mode']").forEach((input) => {
    input.addEventListener("change", syncModeLabels);
  });
  on(padForm, "submit", async (event) => {
    event.preventDefault();
    const saved = await savePadFromDialog();
    if (saved) closeDialog(padDialog);
  });
  on(closePadButton, "click", () => closeDialog(padDialog));
  on(deletePadButton, "click", async () => {
    await clearPad(editingPadId);
    closeDialog(padDialog);
  });
  on(settingsButton, "click", () => openDialog(settingsDialog));
  on(closeSettingsButton, "click", () => closeDialog(settingsDialog));
  on(vibrateToggle, "change", () => {
    settings.vibrate = vibrateToggle.checked;
    saveState();
  });
  on(wakeToggle, "change", async () => {
    settings.keepAwake = wakeToggle.checked;
    saveState();
    await updateWakeLock();
  });
  on(resetButton, "click", resetAll);
  on(document, "visibilitychange", updateWakeLock);
}

async function boot() {
  try {
    loadState();
    bindEvents();
    if (vibrateToggle) vibrateToggle.checked = settings.vibrate;
    if (wakeToggle) wakeToggle.checked = settings.keepAwake;
    setMasterVolume(settings.masterVolume);
    renderPads();
    animateMeters();
    updateWakeLock();
    if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => registration.update())
        .catch(() => {});
    }
  } catch (error) {
    console.error(error);
    setStatus(`起動エラー: ${error && error.message ? error.message : "画面を再読み込みしてください"}`);
  }
}

boot();
