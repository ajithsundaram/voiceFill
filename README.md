# voiceFill

Fill any web form field by speaking — powered by a local [Whisper](https://github.com/openai/whisper) speech-to-text model running on your machine. No cloud. No API keys. Your voice never leaves your computer.

---

## How it works

```
You speak → Chrome extension records audio → sends to local Whisper server → text fills the field
```

- **Chrome Extension** — attaches a mic button to any focused input or textarea on any webpage
- **Local STT Server** — a FastAPI + faster-whisper server running in Docker on `localhost:8765`

---

## Project structure

```
voiceFill/
├── extension/          # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js      # mic button + recording logic
│   ├── content.css
│   ├── popup.html/js/css
│   └── icons/
└── stt-server/         # Local Whisper API server
    ├── server.py
    ├── Dockerfile
    ├── docker-compose.yml
    └── requirements.txt
```

---

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the STT server)
- Google Chrome (for the extension)

---

## Step 1 — Start the STT server

```bash
cd stt-server
docker compose up
```

On first run, Docker will:
1. Build the image (installs Python, ffmpeg, faster-whisper)
2. Download the Whisper `base` model (~75 MB) — cached after first run

When you see this, the server is ready:

```
INFO:     Model ready.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8765
```

> **Verify it's running:**
> ```bash
> curl http://localhost:8765/health
> # {"status":"ok","model":"base"}
> ```

---

## Step 2 — Load the Chrome extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project

The voiceFill icon will appear in your Chrome toolbar.

---

## Step 3 — Use it

1. Click the **voiceFill icon** in the toolbar
2. Toggle the switch to **On**
3. Go to any webpage with a text field (e.g. Google search, a contact form, Gmail compose)
4. Click any **text input or textarea**
5. An **indigo mic button** appears near the field — click it to start recording
6. **Speak** what you want typed
7. Click the mic button again (now red) to **stop and transcribe**
8. The text fills the field automatically

---

## Popup settings

| Setting | Description |
|---------|-------------|
| **Server URL** | URL of the STT server (default: `http://localhost:8765`) |
| **Language** | Force a language code (`en`, `de`, `fr`, etc.) — leave blank for auto-detect |
| **Append mode** | Add transcribed text to existing field content instead of replacing it |

---

## Changing the Whisper model

Edit `stt-server/docker-compose.yml` and change `MODEL_SIZE`:

```yaml
environment:
  - MODEL_SIZE=base   # change this
```

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| `tiny` | ~75 MB | Fastest | Basic |
| `base` | ~145 MB | Fast | Good (default) |
| `small` | ~466 MB | Medium | Better |
| `medium` | ~1.5 GB | Slow | Great |
| `large-v3` | ~3 GB | Slowest | Best |

After changing, rebuild the server:

```bash
docker compose down
docker compose up --build
```

---

## Stopping the server

```bash
docker compose down
```

Model weights are cached in a Docker volume — they won't be re-downloaded next time.

---

## Troubleshooting

**Mic button doesn't appear**
- Make sure the extension is toggled **On** in the popup
- Refresh the page after enabling

**"Microphone access denied" toast**
- Click the lock icon in Chrome's address bar and allow microphone for that site

**"Unreachable" in the popup server status**
- Make sure `docker compose up` is running in the `stt-server/` directory
- Check the server URL in the popup matches (default `http://localhost:8765`)

**No speech detected**
- Try speaking louder or closer to the mic
- Switch to a larger model (`small` or `medium`) for better accuracy

---

## Tech stack

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — optimised Whisper inference
- [FastAPI](https://fastapi.tiangolo.com/) — STT REST API
- [Docker](https://www.docker.com/) — containerised server
- Chrome Extension Manifest V3 — content scripts, service worker
- Web Audio API / MediaRecorder — in-browser audio capture
