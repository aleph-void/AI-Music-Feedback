import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// ── Shared mock state ─────────────────────────────────────────────────────
// Refs are created fresh each beforeEach; vi.mock factories read state lazily
// (component setup runs at mount time, after beforeEach).

type Status = 'disconnected' | 'connecting' | 'connected' | 'error'

let settingsMock: {
  apiKey: ReturnType<typeof ref<string>>
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

import App from '@/App.vue'

beforeEach(() => {
  vi.clearAllMocks()
  createMocks()
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
      systemPrompt: 'Feedback prompt'
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
      systemPrompt: 'My prompt'
    })
  })

  // ── TranscriptView clear ───────────────────────────────────────────────────

  it('calls realtimeApi.clearTranscript when TranscriptView emits "clear"', async () => {
    const w = mountApp()
    await w.findComponent({ name: 'TranscriptViewStub' }).vm.$emit('clear')
    expect(realtimeMock.clearTranscript).toHaveBeenCalledTimes(1)
  })
})
