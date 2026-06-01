const DB_NAME = "pondashi-pad-db";
const DB_STORE = "audio-files";
const PAD_COUNT = 12;
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

const padGrid = document.querySelector("#padGrid");
const padTemplate = document.querySelector("#padTemplate");
const statusText = document.querySelector("#statusText");
const activeCount = document.querySelector("#activeCount");
const stopAllButton = document.querySelector("#stopAllButton");
const pauseAllButton = document.querySelector("#pauseAllButton");
const pauseAllText = document.querySelector("#pauseAllText");
const fadeAllButton = document.querySelector("#fadeAllButton");
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
let settings = { vibrate: true, keepAwake: false };
let editingPadId = null;
let selectedColor = DEFAULT_COLORS[0];
let pendingFile = null;
let wakeLock = null;
const audioUrls = new Map();
const activePlayers = new Map();
const memoryBlobs = new Map();

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
    pads = savedPads ? JSON.parse(savedPads) : createEmptyPads();
    settings = savedSettings ? { ...settings, ...JSON.parse(savedSettings) } : settings;
  } catch {
    pads = createEmptyPads();
  }
  if (!Array.isArray(pads) || pads.length === 0) pads = createEmptyPads();
  pads = pads.map((pad, index) => ({ ...createPad(index), ...pad }));
}

function saveState() {
  try {
    localStorage.setItem("pondashi:pads", JSON.stringify(pads));
    localStorage.setItem("pondashi:settings", JSON.stringify(settings));
  } catch {
    setStatus("この開き方では設定保存が制限されています");
  }
}

function createEmptyPads() {
  return Array.from({ length: PAD_COUNT }, (_, index) => createPad(index));
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

function playersFor(padId) {
  if (!activePlayers.has(padId)) activePlayers.set(padId, new Set());
  return activePlayers.get(padId);
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
  pads.forEach((pad, index) => {
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
  updatePlaybackUi();
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
  audio.volume = pad.volume;
  audio.dataset.startedAt = String(performance.now());
  playersFor(padId).add(audio);
  audio.addEventListener("ended", () => removePlayer(padId, audio));
  audio.addEventListener("pause", () => {
    if (audio.ended || audio.currentTime >= audio.duration) removePlayer(padId, audio);
  });

  try {
    await audio.play();
    setStatus(`${pad.name} を再生`);
  } catch {
    removePlayer(padId, audio);
    setStatus("再生できませんでした。画面を一度タップしてから試してください");
  }
  updatePlaybackUi();
}

function removePlayer(padId, audio) {
  const players = playersFor(padId);
  players.delete(audio);
  updatePlaybackUi();
}

function stopPad(padId) {
  const players = playersFor(padId);
  players.forEach((audio) => {
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
  let count = 0;
  activePlayers.forEach((players, padId) => {
    players.forEach((audio) => {
      count += 1;
      fadeOut(audio, () => removePlayer(padId, audio));
    });
  });
  if (count > 0) setStatus("フェードアウト中");
}

function fadeOut(audio, done) {
  const startVolume = audio.volume;
  const startedAt = performance.now();
  const duration = 900;
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    audio.volume = startVolume * (1 - progress);
    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    done();
  };
  requestAnimationFrame(tick);
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
  const fileList = Array.prototype.slice.call(files).filter((file) => file.type && file.type.indexOf("audio/") === 0);
  if (!fileList.length) return;

  for (const file of fileList) {
    const emptyPad = pads.find((pad) => !pad.blobKey) || createPad(pads.length);
    if (!pads.includes(emptyPad)) pads.push(emptyPad);
    await assignFile(emptyPad, file, fileList.length > 1);
  }
  saveState();
  renderPads();
  setStatus(`${fileList.length}件の音源を追加しました`);
}

async function assignFile(pad, file, renamePad = false) {
  if (pad.blobKey) await deleteBlob(pad.blobKey);
  const blobKey = id();
  const blob = file.slice(0, file.size, file.type || "audio/mpeg");
  const stored = await putBlob(blobKey, blob);
  pad.blobKey = blobKey;
  pad.dataUrl = stored ? "" : await fileToDataUrl(file);
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
  if (!pad) return;

  pad.name = padNameInput.value.trim() || pad.name;
  pad.mode = padForm.elements.mode.value || "restart";
  pad.volume = Number(volumeInput.value) / 100;
  pad.color = selectedColor;
  if (pendingFile) await assignFile(pad, pendingFile);
  saveState();
  renderPads();
  setStatus(`${pad.name} を保存しました`);
}

async function clearPad(padId) {
  const pad = padById(padId);
  if (!pad) return;
  stopPad(padId);
  if (pad.blobKey) await deleteBlob(pad.blobKey);
  pad.name = `Pad ${pads.indexOf(pad) + 1}`;
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
  on(volumeInput, "input", () => {
    volumeOutput.value = `${volumeInput.value}%`;
  });
  on(singleFileInput, "change", (event) => {
    pendingFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    if (pendingFile && (!padNameInput.value || /^Pad \d+$/.test(padNameInput.value))) {
      padNameInput.value = pendingFile.name.replace(/\.[^.]+$/, "").slice(0, 24);
    }
  });
  document.querySelectorAll("input[name='mode']").forEach((input) => {
    input.addEventListener("change", syncModeLabels);
  });
  on(padForm, "submit", async (event) => {
    event.preventDefault();
    await savePadFromDialog();
    closeDialog(padDialog);
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
