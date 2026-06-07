(function () {
  const AUTH_KEY = "pondashi:auth:v1";
  const PASSWORD_HASH = "f50f69b3524c166624f2023766e0fc874a938828be8eb0e63b6585b5f5d7f649";

  const gate = document.querySelector("#authGate");
  const form = document.querySelector("#authForm");
  const input = document.querySelector("#authPasswordInput");
  const message = document.querySelector("#authMessage");
  const logoutButton = document.querySelector("#logoutButton");

  function unlock() {
    document.body.classList.remove("auth-locked");
    document.body.classList.add("auth-ok");
    if (gate) gate.setAttribute("hidden", "");
  }

  function showMessage(text) {
    if (message) message.textContent = text;
  }

  async function sha256(text) {
    if (!window.crypto || !window.crypto.subtle) return "";
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function isRemembered() {
    try {
      return localStorage.getItem(AUTH_KEY) === PASSWORD_HASH;
    } catch {
      return false;
    }
  }

  function remember() {
    try {
      localStorage.setItem(AUTH_KEY, PASSWORD_HASH);
    } catch {
      // The app still opens for this session even if storage is unavailable.
    }
  }

  function forget() {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {}
    location.reload();
  }

  if (logoutButton) logoutButton.addEventListener("click", forget);

  if (isRemembered()) {
    unlock();
    return;
  }

  if (input) input.focus();

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = input ? input.value.trim() : "";
      if (!password) {
        showMessage("パスワードを入力してください");
        return;
      }

      showMessage("確認中です");
      const hash = await sha256(password);
      if (hash === PASSWORD_HASH) {
        remember();
        showMessage("");
        unlock();
        return;
      }

      showMessage("パスワードが違います");
      if (input) {
        input.value = "";
        input.focus();
      }
    });
  }
})();
