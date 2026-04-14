// content.js — injected into every page
// Attaches a mic button to focused form inputs and records/transcribes speech.

(function () {
  "use strict";

  // ─── State ───────────────────────────────────────────────────────────────
  let enabled = false;
  let serverUrl = "http://localhost:8765";
  let language = "";
  let appendMode = false;

  let activeInput = null;      // currently focused input element
  let micButton = null;        // floating mic button DOM node
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let stream = null;

  // ─── Bootstrap ───────────────────────────────────────────────────────────
  chrome.storage.local.get(["enabled", "serverUrl", "language", "appendMode"], (s) => {
    enabled = !!s.enabled;
    serverUrl = s.serverUrl || "http://localhost:8765";
    language = s.language || "";
    appendMode = !!s.appendMode;
    if (enabled) attachListeners();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "STYI_TOGGLE") return;
    enabled = msg.enabled;
    chrome.storage.local.get(["serverUrl", "language", "appendMode"], (s) => {
      serverUrl = s.serverUrl || "http://localhost:8765";
      language = s.language || "";
      appendMode = !!s.appendMode;
    });
    if (enabled) {
      attachListeners();
    } else {
      detachListeners();
      hideMic();
      stopRecording(false);
    }
  });

  // ─── Input detection ─────────────────────────────────────────────────────
  const SELECTOR =
    'input:not([type]):not([type="submit"]):not([type="button"]):not([type="reset"])' +
    ':not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])' +
    ':not([type="color"]):not([type="hidden"]),' +
    "textarea," +
    "[contenteditable='true']," +
    "[contenteditable='']";

  function attachListeners() {
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
  }

  function detachListeners() {
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
  }

  function onFocusIn(e) {
    const el = e.target;
    if (!el.matches(SELECTOR)) return;
    activeInput = el;
    showMic(el);
  }

  function onFocusOut(e) {
    // Give time for mic button click to fire before hiding
    setTimeout(() => {
      if (!micButton) return;
      const focused = document.activeElement;
      if (focused === micButton || focused === activeInput) return;
      if (!isRecording) hideMic();
    }, 150);
  }

  // ─── Mic button ──────────────────────────────────────────────────────────
  function showMic(inputEl) {
    if (!micButton) {
      micButton = document.createElement("button");
      micButton.id = "styi-mic-btn";
      micButton.setAttribute("aria-label", "Start voice input");
      micButton.innerHTML = svgMic();
      micButton.addEventListener("click", onMicClick);
      document.body.appendChild(micButton);
    }
    positionMic(inputEl);
    micButton.classList.remove("styi-hidden", "styi-recording", "styi-loading");
    micButton.title = "Click to start voice input";
  }

  function positionMic(inputEl) {
    const rect = inputEl.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const btnSize = 36;
    const gap = 6;

    let left = rect.right + scrollX - btnSize - gap;
    let top = rect.top + scrollY + (rect.height - btnSize) / 2;

    // If input is very narrow, put button just outside right edge
    if (rect.width < btnSize + gap * 2) {
      left = rect.right + scrollX + gap;
    }

    micButton.style.left = `${left}px`;
    micButton.style.top = `${top}px`;
  }

  function hideMic() {
    if (!micButton) return;
    micButton.classList.add("styi-hidden");
    activeInput = null;
  }

  // ─── Recording ───────────────────────────────────────────────────────────
  async function onMicClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (isRecording) {
      stopRecording(true);
    } else {
      await startRecording();
    }
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      showToast("Microphone access denied.", "error");
      return;
    }

    audioChunks = [];
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      audioChunks = [];
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      await sendToServer(blob, mediaRecorder.mimeType);
    };

    mediaRecorder.start(250); // collect data every 250 ms
    isRecording = true;
    micButton.classList.add("styi-recording");
    micButton.innerHTML = svgStop();
    micButton.title = "Click to stop and transcribe";
    micButton.setAttribute("aria-label", "Stop recording");
  }

  function stopRecording(send) {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    if (!send) {
      // Abort — discard data
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
    }
    mediaRecorder.stop();
    isRecording = false;
    if (!send && stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (micButton) {
      micButton.classList.remove("styi-recording");
      micButton.innerHTML = svgMic();
      micButton.title = "Click to start voice input";
      micButton.setAttribute("aria-label", "Start voice input");
    }
  }

  async function sendToServer(blob, mimeType) {
    if (!micButton) return;
    micButton.classList.add("styi-loading");
    micButton.innerHTML = svgSpinner();
    micButton.title = "Transcribing…";

    const formData = new FormData();
    const ext = mimeTypeToExt(mimeType);
    formData.append("audio", blob, `recording.${ext}`);
    if (language) formData.append("language", language);

    try {
      const res = await fetch(`${serverUrl}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }

      const data = await res.json();
      const text = (data.text || "").trim();

      if (text && activeInput) {
        fillInput(activeInput, text);
        showToast(`Transcribed: "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`, "success");
      } else if (!text) {
        showToast("No speech detected.", "warn");
      }
    } catch (err) {
      console.error("[STYI]", err);
      showToast(`STT error: ${err.message}`, "error");
    } finally {
      if (micButton) {
        micButton.classList.remove("styi-loading");
        micButton.innerHTML = svgMic();
        micButton.title = "Click to start voice input";
        micButton.setAttribute("aria-label", "Start voice input");
      }
    }
  }

  // ─── Fill input ──────────────────────────────────────────────────────────
  // Works with plain HTML, React, Vue, Angular controlled inputs.
  function fillInput(el, text) {
    const isContentEditable =
      el.getAttribute("contenteditable") === "true" ||
      el.getAttribute("contenteditable") === "";

    if (isContentEditable) {
      const current = appendMode ? el.textContent : "";
      el.textContent = current + (current && appendMode ? " " : "") + text;
      // Move caret to end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      const setter = el.tagName === "TEXTAREA" ? nativeTextareaSetter : nativeInputValueSetter;

      const current = appendMode ? el.value : "";
      const newVal = current + (current && appendMode ? " " : "") + text;

      if (setter) {
        setter.call(el, newVal);
      } else {
        el.value = newVal;
      }

      // Trigger React/Vue/Angular change detection
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    el.focus();
  }

  // ─── Toast notifications ──────────────────────────────────────────────────
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `styi-toast styi-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => toast.classList.add("styi-toast--visible"));
    setTimeout(() => {
      toast.classList.remove("styi-toast--visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function getSupportedMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
  }

  function mimeTypeToExt(mimeType = "") {
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mp4")) return "mp4";
    return "webm";
  }

  // ─── SVG icons ───────────────────────────────────────────────────────────
  function svgMic() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/>
      <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.08A7 7 0 0 0 19 11Z"/>
    </svg>`;
  }

  function svgStop() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>`;
  }

  function svgSpinner() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18" class="styi-spin">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
    </svg>`;
  }
})();
