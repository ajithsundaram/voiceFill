// popup.js

const $ = (id) => document.getElementById(id);

const enabledToggle = $("enabledToggle");
const statusBadge = $("statusBadge");
const serverDot = $("serverDot");
const serverLabel = $("serverLabel");
const serverUrlInput = $("serverUrl");
const languageInput = $("language");
const appendModeInput = $("appendMode");
const checkBtn = $("checkBtn");

// ── Load saved settings ───────────────────────────────────────────────────
chrome.storage.local.get(["enabled", "serverUrl", "language", "appendMode"], (s) => {
  enabledToggle.checked = !!s.enabled;
  serverUrlInput.value = s.serverUrl || "http://localhost:8765";
  languageInput.value = s.language || "";
  appendModeInput.checked = !!s.appendMode;
  updateStatusBadge(!!s.enabled);
  pingServer(serverUrlInput.value);
});

// ── Toggle enabled ────────────────────────────────────────────────────────
enabledToggle.addEventListener("change", () => {
  const enabled = enabledToggle.checked;
  chrome.storage.local.set({ enabled });
  updateStatusBadge(enabled);
});

// ── Save settings on change ───────────────────────────────────────────────
serverUrlInput.addEventListener("change", save);
languageInput.addEventListener("change", save);
appendModeInput.addEventListener("change", save);

function save() {
  chrome.storage.local.set({
    serverUrl: serverUrlInput.value.trim() || "http://localhost:8765",
    language: languageInput.value.trim(),
    appendMode: appendModeInput.checked,
  });
}

// ── Check server health ───────────────────────────────────────────────────
checkBtn.addEventListener("click", () => pingServer(serverUrlInput.value.trim()));

async function pingServer(url) {
  setDot("checking");
  serverLabel.textContent = "Checking…";
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      setDot("ok");
      serverLabel.textContent = `Connected — model: ${data.model || "?"}`;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    setDot("error");
    serverLabel.textContent = `Unreachable (${err.message})`;
  }
}

function setDot(state) {
  serverDot.className = `dot dot-${state}`;
}

function updateStatusBadge(enabled) {
  statusBadge.textContent = enabled ? "On" : "Off";
  statusBadge.className = `status-badge ${enabled ? "status-on" : "status-off"}`;
}
