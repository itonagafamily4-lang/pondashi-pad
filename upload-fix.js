(function () {
  var audioExtensions = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4"];

  function isAudioFile(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf("audio/") === 0) return true;
    var name = file.name ? file.name.toLowerCase() : "";
    return audioExtensions.some(function (extension) {
      return name.endsWith(extension);
    });
  }

  async function assignAudioFile(pad, file) {
    if (!isAudioFile(file)) throw new Error("音声ファイルを選んでください");
    if (pad.blobKey && typeof deleteBlob === "function") await deleteBlob(pad.blobKey);

    var blobKey = typeof id === "function" ? id() : String(Date.now());
    var blob = file.slice(0, file.size, file.type || "audio/mpeg");
    var stored = typeof putBlob === "function" ? await putBlob(blobKey, blob) : false;

    pad.blobKey = blobKey;
    pad.dataUrl = "";
    if (!stored && file.size < 480000 && typeof fileToDataUrl === "function") {
      pad.dataUrl = await fileToDataUrl(file);
    }
    pad.fileName = file.name;
    if (!pad.name || /^Pad \d+$/.test(pad.name)) {
      pad.name = file.name.replace(/\.[^.]+$/, "").slice(0, 24);
    }
  }

  function showStatus(text) {
    if (typeof setStatus === "function") setStatus(text);
  }

  window.addEventListener("load", function () {
    var fileInput = document.querySelector("#singleFileInput");
    var form = document.querySelector("#padForm");
    if (fileInput) {
      fileInput.setAttribute("accept", "audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.mp4");
      fileInput.addEventListener(
        "change",
        function (event) {
          var file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
          if (!file) return;
          if (!isAudioFile(file)) {
            pendingFile = null;
            fileInput.value = "";
            showStatus("音声ファイルを選んでください");
            event.stopImmediatePropagation();
            return;
          }
          pendingFile = file;
          showStatus(file.name + " を選択しました。保存を押してください");
        },
        true,
      );
    }

    if (form) {
      form.addEventListener(
        "submit",
        async function (event) {
          var pad = typeof padById === "function" ? padById(editingPadId) : null;
          if (!pad) return;
          if (!pad.blobKey && !pendingFile) {
            event.preventDefault();
            event.stopImmediatePropagation();
            showStatus("音源ファイルを選んでから保存してください");
            return;
          }
          if (!pendingFile) return;

          event.preventDefault();
          event.stopImmediatePropagation();
          try {
            pad.name = padNameInput.value.trim() || pad.name;
            pad.mode = padForm.elements.mode.value || "restart";
            pad.volume = Number(volumeInput.value) / 100;
            pad.color = selectedColor;
            await assignAudioFile(pad, pendingFile);
            saveState();
            renderPads();
            closeDialog(padDialog);
            showStatus(pad.name + " を保存しました");
          } catch (error) {
            showStatus(error && error.message ? error.message : "音源を保存できませんでした");
          }
        },
        true,
      );
    }
  });
})();
