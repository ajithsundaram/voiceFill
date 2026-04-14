// background.js — service worker
// Stores enabled state and STT server URL; relays them to content scripts.

const DEFAULTS = {
  enabled: false,
  serverUrl: "http://localhost:8765",
  language: "",        // empty = auto-detect
  appendMode: false,   // false = replace field value, true = append
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULTS), (stored) => {
    const init = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (stored[k] === undefined) init[k] = v;
    }
    if (Object.keys(init).length) chrome.storage.local.set(init);
  });
});

// When the popup toggles `enabled`, broadcast to all tabs so content scripts
// can react without needing to re-run.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!("enabled" in changes)) return;

  const enabled = changes.enabled.newValue;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "STYI_TOGGLE", enabled }).catch(() => {
        // Tab may not have the content script — silently ignore.
      });
    }
  });
});
