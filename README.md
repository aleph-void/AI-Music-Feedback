# AI Music Feedback

[![Tests](https://github.com/nstarke/AI-Music-Feedback/actions/workflows/ci.yml/badge.svg)](https://github.com/nstarke/AI-Music-Feedback/actions/workflows/ci.yml)

A desktop application that streams audio from your computer to the [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) and receives live AI feedback on your music.

> **GitHub:** https://github.com/nstarke/AI-Music-Feedback

---

## What it does

AI Music Feedback captures audio playing on your computer — from a DAW, streaming service, or any other source — and sends it to OpenAI in real time. When the AI detects a pause in the audio it responds with concise, actionable feedback: mix balance, tonality, dynamics, rhythm, arrangement, and more.

You can also speak questions through a microphone or type them directly into the app while audio is streaming.

---

## Features

- **Real-time audio analysis** — streams PCM audio to OpenAI via WebSocket; feedback arrives as the AI responds
- **Any audio source** — captures system audio, DAW output, or any device visible to your OS
- **Voice prompt input** — select a separate microphone to ask questions by speaking
- **Text prompt input** — type questions into the conversation at any time while connected
- **Transcript view** — full conversation history with timestamps, copy, and clear actions
- **Export transcript** — save the conversation to a `.txt` or `.md` file via File → Export Transcript (Ctrl/Cmd+E)
- **Encrypted API key storage** — key is stored in the OS keychain where available (macOS Keychain, Windows Credential Store)
- **Internationalisation** — UI language is selectable from Settings; add a new language by dropping a JSON file in `src/i18n/`
- **Silence timeout** — automatically stops streaming after a configurable period of silence to avoid wasting tokens
- **Output mode** — choose between text responses (cheaper) or audio responses

---

## Requirements

- **Node.js** 20 or later
- **npm** 10 or later
- An **OpenAI API key** with access to the Realtime API
  → [Get an API key](https://platform.openai.com/api-keys) · [Realtime API pricing](https://openai.com/api/pricing/)

---

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/nstarke/AI-Music-Feedback.git
cd AI-Music-Feedback
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run dev
```

This starts the Electron app with hot-reload for the renderer and opens DevTools automatically.

---

## Using the application

### First-time setup

1. Open **Settings** (the ⚙ gear button in the top-left corner).
2. Paste your OpenAI API key into the **OpenAI API Key** field. The key is stored securely in your OS keychain.
3. Choose a **Realtime Model** — click **↻** to fetch the latest list from OpenAI, or use the defaults.
4. Select an **Output Mode**:
   - **Text** — AI responses appear as text (lower cost).
   - **Audio** — AI responds with synthesised speech (uses significantly more tokens).
5. Adjust the **Silence Timeout** — the number of seconds of silence before the app automatically stops streaming.
6. Optionally customise the **System Prompt** to change how the AI gives feedback.
7. Click **Save Settings**.

### Starting a session

1. Click **Connect to OpenAI** in the sidebar. The status bar at the bottom shows the connection state.
2. Select your **Music / Audio Source** from the dropdown (click **↻** to refresh the list).
3. Optionally select a **Voice Prompt Input** microphone to ask questions by speaking.
4. Click **Start Streaming** (or press **Space**).
5. Play your music. The AI will respond when it detects a pause.

### Asking questions

- **Type** a question into the input box at the bottom of the conversation and press **Enter**.
- **Speak** into the selected Voice Prompt microphone — audio from the mic is sent to the AI alongside the music stream.
- Press **Shift+Enter** to add a new line without sending.

### Exporting the transcript

Go to **File → Export Transcript…** (Ctrl+E / Cmd+E) to save the full conversation to a file. The save dialog lets you choose between `.txt` and `.md` formats.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space | Start / stop streaming |
| Enter | Send typed message |
| Shift+Enter | New line in message input |
| Ctrl/Cmd+E | Export transcript |

---

## Settings reference

| Setting | Description |
|---------|-------------|
| OpenAI API Key | Your `sk-…` key. Stored encrypted in the OS keychain where available. |
| Realtime Model | The model used for audio understanding and responses. |
| Output Mode | **Text** or **Audio**. Audio uses ~10–20× more tokens. |
| Silence Timeout | Seconds of silence before streaming stops automatically. Set to 0 to disable. |
| System Prompt | Instructions sent to the AI at the start of each session. Max ~4000 characters. |
| Language | UI display language. Determined by available locale files in `src/i18n/`. |

---

## Building for distribution

```bash
# All platforms (build then package for the current OS)
npm run pack

# Specific platform
npm run pack:mac
npm run pack:win
npm run pack:linux
```

Packaged outputs are written to the `release/` directory.

### macOS permissions

The app requests the following permissions on macOS:

| Permission | Reason |
|------------|--------|
| Screen Recording | Capturing system audio |
| Microphone | Voice prompt input |

If macOS blocks the app on first launch because it is unsigned, right-click the app icon and choose **Open**.

---

## Releases

Releases are built automatically by GitHub Actions when a version tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow:
1. Runs the full test suite.
2. Builds on Linux, Windows, macOS (arm64), and macOS (x64) in parallel.
3. Creates a GitHub Release with all distributable artifacts attached.

Pre-release tags (e.g. `v1.0.0-beta.1`) are automatically marked as pre-releases.

---

## Development

### Project structure

```
src/
  App.vue                  # Root component — layout and session logic
  components/
    AudioControls.vue      # Audio source selection, streaming controls
    MessageInput.vue       # Text question input
    SettingsPanel.vue      # Settings form
    StatusBar.vue          # Connection status and reconnect
    TranscriptView.vue     # Conversation display
  composables/
    useAudioCapture.ts     # System audio capture via AudioWorklet
    useMicCapture.ts       # Microphone capture for voice prompts
    useRealtimeApi.ts      # OpenAI Realtime API WebSocket client
    useSettings.ts         # Settings state and persistence
  i18n/
    en.json                # English locale strings
    index.ts               # Locale loader (auto-discovers *.json files)
  public/
    pcm16-processor.js     # AudioWorklet processor (PCM16 encoding)

electron/
  main/
    index.ts               # Main process entry point
    ipc-handlers.ts        # IPC channel handlers
    menu.ts                # Application menu
    store.ts               # Encrypted key storage (safeStorage)
  preload/
    index.ts               # contextBridge surface for renderer

resources/
  icon.svg                 # Source icon (music note + waveform)
  icon.png                 # 512×512 PNG used for Linux / macOS builds
  icon.ico                 # Multi-size ICO for Windows

tests/
  component/               # Vue component tests (happy-dom)
  unit/
    composables/           # Composable unit tests
    electron/              # Main-process unit tests (Node)
```

### Running tests

```bash
# All tests (single run)
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Electron main process only
npm run test:electron

# Renderer / composables only
npm run test:renderer
```

The test suite uses [Vitest](https://vitest.dev/) with `happy-dom` for the renderer environment.

### Adding a language

1. Copy `src/i18n/en.json` to `src/i18n/<locale-code>.json` (e.g. `fr.json`).
2. Translate every value. Update the top-level `"language"` key to the language's native name (e.g. `"Français"`).
3. Restart the app — the new locale appears automatically in **Settings → Language**.

No code changes are required.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Electron](https://www.electronjs.org/) 33 |
| Build system | [electron-vite](https://electron-vite.org/) |
| UI framework | [Vue 3](https://vuejs.org/) (Composition API) |
| Internationalisation | [vue-i18n](https://vue-i18n.intlify.dev/) v9 |
| AI backend | [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) |
| Audio capture | Web Audio API + AudioWorklet (PCM16) |
| Key storage | Electron `safeStorage` (OS keychain) |
| Testing | [Vitest](https://vitest.dev/) + [@vue/test-utils](https://test-utils.vuejs.org/) |
| Packaging | [electron-builder](https://www.electron.build/) |
| CI / CD | GitHub Actions |

---

## License

MIT
