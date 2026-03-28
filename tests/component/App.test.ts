import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// ── Shared mock state ─────────────────────────────────────────────────────
// Refs are created fresh each beforeEach; vi.mock factories read state lazily
// (component setup runs at mount time, after beforeEach).

type Status = 'disconnected' | 'connecting' | 'connected' | 'error'

let settingsMock: {
  apiKey: ReturnType<typeof ref<string>>
  model: ReturnType<typeof ref<string>>
  outputMode: ReturnType<typeof ref<string>>
  audioTimeoutSeconds: ReturnType<typeof ref<number>>
  systemPrompt: ReturnType<typeof ref<string>>
  storageEncrypted: ReturnType<typeof ref<boolean>>
  isLoaded: ReturnType<typeof ref<boolean>>
  load: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
}

let realtimeMock: {
  status: ReturnType<typeof ref<Status>>
  statusMessage: ReturnType<typeof ref<string>>
  transcript: ReturnType<typeof ref<never[]>>
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  appendAudio: ReturnType<typeof vi.fn>
  sendText: ReturnType<typeof vi.fn>
  clearTranscript: ReturnType<typeof vi.fn>
}

let captureMock: {
  sources: ReturnType<typeof ref<never[]>>
  isCapturing: ReturnType<typeof ref<boolean>>
  captureError: ReturnType<typeof ref<null>>
  getSources: ReturnType<typeof vi.fn>
  startCapture: ReturnType<typeof vi.fn>
  stopCapture: ReturnType<typeof vi.fn>
}

function createMocks() {
  settingsMock = {
    apiKey: ref(''),
    model: ref('gpt-4o-realtime-preview'),
    outputMode: ref('text'),
    audioTimeoutSeconds: ref(5),
    systemPrompt: ref('My prompt'),
    storageEncrypted: ref(true),
    isLoaded: ref(false),
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined)
  }
  realtimeMock = {
    status: ref<Status>('disconnected'),
    statusMessage: ref(''),
    transcript: ref([]),
    connect: vi.fn(),
    disconnect: vi.fn(),
    appendAudio: vi.fn(),
    sendText: vi.fn(),
    clearTranscript: vi.fn()
  }
  captureMock = {
    sources: ref([]),
    isCapturing: ref(false),
    captureError: ref(null),
    getSources: vi.fn().mockResolvedValue(undefined),
    startCapture: vi.fn().mockResolvedValue(undefined),
    stopCapture: vi.fn()
  }
}

vi.mock('@/composables/useSettings', () => ({
  useSettings: () => settingsMock
}))
vi.mock('@/composables/useRealtimeApi', () => ({
  useRealtimeApi: () => realtimeMock
}))
vi.mock('@/composables/useAudioCapture', () => ({
  useAudioCapture: () => captureMock
}))

// Stub child components so tests focus purely on App.vue logic
vi.mock('@/components/SettingsPanel.vue', () => ({
  default: { name: 'SettingsPanelStub', template: '<div class="settings-panel-stub" />' }
}))
vi.mock('@/components/AudioControls.vue', () => ({
  default: {
    name: 'AudioControlsStub',
    template: '<div class="audio-controls-stub" />',
    props: ['connected'],
    emits: ['chunk', 'levelUpdate', 'stopped']
  }
}))
vi.mock('@/components/TranscriptView.vue', () => ({
  default: {
    name: 'TranscriptViewStub',
    template: '<div class="transcript-view-stub" />',
    props: ['transcript'],
    emits: ['clear']
  }
}))
vi.mock('@/components/StatusBar.vue', () => ({
  default: {
    name: 'StatusBarStub',
    template: '<div class="status-bar-stub" />',
    props: ['status', 'statusMessage', 'isCapturing', 'canReconnect'],
    emits: ['reconnect']
  }
}))
vi.mock('@/components/MessageInput.vue', () => ({
  default: {
    name: 'MessageInputStub',
    template: '<div class="message-input-stub" />',
    props: ['connected'],
    emits: ['send']
  }
}))

import App from '@/App.vue'

// ── window.electronAPI mock ────────────────────────────────────────────────
// Simulates the contextBridge surface exposed by the preload script.

let exportTranscriptMock: ReturnType<typeof vi.fn>
let onMenuExportTranscriptMock: ReturnType<typeof vi.fn>
let menuExportCallback: (() => void) | null = null

beforeEach(() => {
  vi.clearAllMocks()
  createMocks()
  menuExportCallback = null
  exportTranscriptMock = vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/transcript.txt' })
  onMenuExportTranscriptMock = vi.fn((cb: () => void) => {
    menuExportCallback = cb
    return () => { menuExportCallback = null }
  })
  Object.defineProperty(window, 'electronAPI', {
    value: {
      loadApiKey: vi.fn().mockResolvedValue({ key: null, encrypted: true }),
      saveApiKey: vi.fn().mockResolvedValue({ success: true }),
      openExternal: vi.fn(),
      exportTranscript: exportTranscriptMock,
      onMenuExportTranscript: onMenuExportTranscriptMock
    },
    writable: true,
    configurable: true
  })
})

describe('App', () => {
  function mountApp() {
    return mount(App, { attachTo: document.body })
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  it('renders the sidebar', () => {
    const w = mountApp()
    expect(w.find('.sidebar').exists()).toBe(true)
  })

  it('renders the main content area', () => {
    const w = mountApp()
    expect(w.find('.main-content').exists()).toBe(true)
  })

  it('renders the app name "AI Streamer"', () => {
    const w = mountApp()
    expect(w.find('.app-name').text()).toBe('AI Streamer')
  })

  // ── Settings panel toggle ─────────────────────────────────────────────────

  it('shows the info panel by default, not settings', () => {
    const w = mountApp()
    expect(w.find('.sidebar-info').exists()).toBe(true)
    expect(w.find('.settings-panel-stub').exists()).toBe(false)
  })

  it('shows the settings panel after clicking the gear button', async () => {
    const w = mountApp()
    await w.find('.tab-toggle').trigger('click')
    expect(w.find('.settings-panel-stub').exists()).toBe(true)
    expect(w.find('.sidebar-info').exists()).toBe(false)
  })

  it('hides the settings panel when gear is clicked again', async () => {
    const w = mountApp()
    await w.find('.tab-toggle').trigger('click')
    await w.find('.tab-toggle').trigger('click')
    expect(w.find('.sidebar-info').exists()).toBe(true)
  })

  it('gear button has the "active" class while settings are open', async () => {
    const w = mountApp()
    await w.find('.tab-toggle').trigger('click')
    expect(w.find('.tab-toggle').classes()).toContain('active')
  })

  // ── Info panel content ─────────────────────────────────────────────────────

  it('info panel has 4 numbered steps', () => {
    const w = mountApp()
    expect(w.findAll('.info-steps li')).toHaveLength(4)
  })

  // ── Connection actions ─────────────────────────────────────────────────────

  it('shows the Connect button when status is disconnected', () => {
    const w = mountApp()
    const btn = w.find('.connection-actions .primary-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('Connect to OpenAI')
  })

  it('Connect button is disabled when apiKey is empty', () => {
    settingsMock.apiKey.value = ''
    const w = mountApp()
    expect((w.find('.connection-actions .primary-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('Connect button is enabled when apiKey is set', () => {
    settingsMock.apiKey.value = 'sk-test'
    const w = mountApp()
    expect((w.find('.connection-actions .primary-btn').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('calls realtimeApi.connect with apiKey and systemPrompt on Connect click', async () => {
    settingsMock.apiKey.value = 'sk-abc'
    settingsMock.systemPrompt.value = 'Feedback prompt'
    const w = mountApp()
    await w.find('.connection-actions .primary-btn').trigger('click')
    expect(realtimeMock.connect).toHaveBeenCalledWith({
      apiKey: 'sk-abc',
      systemPrompt: 'Feedback prompt',
      model: 'gpt-4o-realtime-preview',
      outputMode: 'text'
    })
  })

  it('shows the Disconnect button when status is connected', () => {
    realtimeMock.status.value = 'connected'
    const w = mountApp()
    expect(w.find('.danger-btn').exists()).toBe(true)
    expect(w.find('.danger-btn').text()).toBe('Disconnect')
  })

  it('shows the Disconnect button when status is connecting', () => {
    realtimeMock.status.value = 'connecting'
    const w = mountApp()
    expect(w.find('.danger-btn').exists()).toBe(true)
  })

  it('calls realtimeApi.disconnect when Disconnect is clicked', async () => {
    realtimeMock.status.value = 'connected'
    const w = mountApp()
    await w.find('.danger-btn').trigger('click')
    expect(realtimeMock.disconnect).toHaveBeenCalledTimes(1)
  })

  it('shows the API key hint when apiKey is empty', () => {
    settingsMock.apiKey.value = ''
    const w = mountApp()
    expect(w.find('.key-hint').exists()).toBe(true)
  })

  it('hides the API key hint when apiKey is set', () => {
    settingsMock.apiKey.value = 'sk-test'
    const w = mountApp()
    expect(w.find('.key-hint').exists()).toBe(false)
  })

  it('Connect button does not call connect() when apiKey is empty', async () => {
    settingsMock.apiKey.value = ''
    const w = mountApp()
    await w.find('.connection-actions .primary-btn').trigger('click')
    expect(realtimeMock.connect).not.toHaveBeenCalled()
  })

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  it('calls settings.load() on mount', async () => {
    mountApp()
    await vi.waitFor(() => expect(settingsMock.load).toHaveBeenCalledTimes(1))
  })

  // ── Audio chunk forwarding ────────────────────────────────────────────────

  it('forwards chunk events from AudioControls to realtimeApi.appendAudio', async () => {
    const w = mountApp()
    const buffer = new ArrayBuffer(16)
    await w.findComponent({ name: 'AudioControlsStub' }).vm.$emit('chunk', buffer)
    expect(realtimeMock.appendAudio).toHaveBeenCalledWith(buffer)
  })

  // ── StatusBar reconnect ────────────────────────────────────────────────────

  it('calls connectToApi when StatusBar emits "reconnect"', async () => {
    settingsMock.apiKey.value = 'sk-test'
    settingsMock.systemPrompt.value = 'My prompt'
    const w = mountApp()
    await w.findComponent({ name: 'StatusBarStub' }).vm.$emit('reconnect')
    expect(realtimeMock.connect).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      systemPrompt: 'My prompt',
      model: 'gpt-4o-realtime-preview',
      outputMode: 'text'
    })
  })

  // ── TranscriptView clear ───────────────────────────────────────────────────

  it('calls realtimeApi.clearTranscript when TranscriptView emits "clear"', async () => {
    const w = mountApp()
    await w.findComponent({ name: 'TranscriptViewStub' }).vm.$emit('clear')
    expect(realtimeMock.clearTranscript).toHaveBeenCalledTimes(1)
  })

  // ── MessageInput wiring ────────────────────────────────────────────────────

  it('calls realtimeApi.sendText when MessageInput emits "send"', async () => {
    const w = mountApp()
    await w.findComponent({ name: 'MessageInputStub' }).vm.$emit('send', 'What about the reverb?')
    expect(realtimeMock.sendText).toHaveBeenCalledWith('What about the reverb?')
  })

  it('passes connected=true to MessageInput when status is connected', () => {
    realtimeMock.status.value = 'connected'
    const w = mountApp()
    expect(w.findComponent({ name: 'MessageInputStub' }).props('connected')).toBe(true)
  })

  it('passes connected=false to MessageInput when status is disconnected', () => {
    realtimeMock.status.value = 'disconnected'
    const w = mountApp()
    expect(w.findComponent({ name: 'MessageInputStub' }).props('connected')).toBe(false)
  })

  it('passes connected=true to AudioControls when status is connected', () => {
    realtimeMock.status.value = 'connected'
    const w = mountApp()
    expect(w.findComponent({ name: 'AudioControlsStub' }).props('connected')).toBe(true)
  })

  it('passes connected=false to AudioControls when status is disconnected', () => {
    realtimeMock.status.value = 'disconnected'
    const w = mountApp()
    expect(w.findComponent({ name: 'AudioControlsStub' }).props('connected')).toBe(false)
  })

  it('passes connected=false to AudioControls when status is connecting', () => {
    realtimeMock.status.value = 'connecting'
    const w = mountApp()
    expect(w.findComponent({ name: 'AudioControlsStub' }).props('connected')).toBe(false)
  })

  // ── Transcript export ──────────────────────────────────────────────────────

  it('registers onMenuExportTranscript listener on mount', async () => {
    mountApp()
    await vi.waitFor(() => expect(onMenuExportTranscriptMock).toHaveBeenCalledTimes(1))
  })

  it('calls exportTranscript when the menu export event fires with transcript content', async () => {
    realtimeMock.transcript.value = [
      { id: '1', role: 'user', content: 'Hello', complete: true, timestamp: 1700000000000 }
    ] as never[]
    mountApp()
    await vi.waitFor(() => expect(menuExportCallback).not.toBeNull())
    await menuExportCallback!()
    expect(exportTranscriptMock).toHaveBeenCalledTimes(1)
    const [content, filename] = exportTranscriptMock.mock.calls[0] as [string, string]
    expect(content).toContain('Hello')
    expect(content).toContain('You')
    expect(filename).toMatch(/^transcript-\d{4}-\d{2}-\d{2}\.txt$/)
  })

  it('does not call exportTranscript when the transcript is empty', async () => {
    realtimeMock.transcript.value = [] as never[]
    mountApp()
    await vi.waitFor(() => expect(menuExportCallback).not.toBeNull())
    await menuExportCallback!()
    expect(exportTranscriptMock).not.toHaveBeenCalled()
  })

  it('formats assistant messages with "AI" speaker label', async () => {
    realtimeMock.transcript.value = [
      { id: '1', role: 'assistant', content: 'Great mix!', complete: true, timestamp: 1700000000000 }
    ] as never[]
    mountApp()
    await vi.waitFor(() => expect(menuExportCallback).not.toBeNull())
    await menuExportCallback!()
    const [content] = exportTranscriptMock.mock.calls[0] as [string, string]
    expect(content).toContain('AI')
    expect(content).toContain('Great mix!')
  })

  it('removes the export listener on unmount', async () => {
    const w = mountApp()
    await vi.waitFor(() => expect(menuExportCallback).not.toBeNull())
    w.unmount()
    expect(menuExportCallback).toBeNull()
  })
})
