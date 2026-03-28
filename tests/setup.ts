/**
 * Global test setup for renderer/happy-dom environment.
 * Runs before every test file in the "renderer" project.
 */
import { vi, beforeEach } from 'vitest'
import { config } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../src/i18n/en.json'
import { MockWebSocket } from './mocks/MockWebSocket'

// ── vue-i18n (installed globally so all component mounts get t()) ──────────
config.global.plugins = [
  createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })
]

// ── WebSocket ────────────────────────────────────────────────────────────────
;(globalThis as unknown as Record<string, unknown>).WebSocket = MockWebSocket

// ── Clipboard ───────────────────────────────────────────────────────────────
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true
})

// ── MediaDevices (getUserMedia + enumerateDevices) ──────────────────────────
const mockAudioTrack = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  stop: vi.fn(),
  kind: 'audio',
  enabled: true
}

const mockMediaStream = {
  getAudioTracks: vi.fn(() => [mockAudioTrack]),
  getTracks: vi.fn(() => [mockAudioTrack])
}

const mockAudioDevices: MediaDeviceInfo[] = [
  { deviceId: 'default', kind: 'audioinput', label: 'Default', groupId: '', toJSON: () => ({}) } as MediaDeviceInfo,
  { deviceId: 'mic1', kind: 'audioinput', label: 'Built-in Microphone', groupId: '', toJSON: () => ({}) } as MediaDeviceInfo
]

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
    enumerateDevices: vi.fn().mockResolvedValue(mockAudioDevices)
  },
  writable: true,
  configurable: true
})

// ── AudioContext & AudioWorkletNode ─────────────────────────────────────────
const mockWorkletPort = {
  onmessage: null as ((e: MessageEvent) => void) | null,
  postMessage: vi.fn()
}

export const mockAudioWorkletNode = {
  port: mockWorkletPort,
  connect: vi.fn(),
  disconnect: vi.fn()
}

export const mockSourceNode = {
  connect: vi.fn(),
  disconnect: vi.fn()
}

export const mockAnalyserNode = {
  fftSize: 256,
  getFloatTimeDomainData: vi.fn((array: Float32Array) => array.fill(0))
}

export const mockAudioContext = {
  sampleRate: 24000,
  currentTime: 0,
  state: 'running' as AudioContextState,
  destination: {} as AudioDestinationNode,
  audioWorklet: {
    addModule: vi.fn().mockResolvedValue(undefined)
  },
  createAnalyser: vi.fn(() => mockAnalyserNode),
  createMediaStreamSource: vi.fn(() => mockSourceNode),
  createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
    getChannelData: vi.fn(() => new Float32Array(length)),
    duration: length / sampleRate
  })),
  createBufferSource: vi.fn(() => ({
    buffer: null as AudioBuffer | null,
    connect: vi.fn(),
    start: vi.fn(),
    disconnect: vi.fn()
  })),
  close: vi.fn()
}

;(globalThis as unknown as Record<string, unknown>).AudioContext = vi.fn(
  function () { return mockAudioContext }
)
;(globalThis as unknown as Record<string, unknown>).AudioWorkletNode = vi.fn(
  function () { return mockAudioWorkletNode }
)

// ── window.electronAPI ───────────────────────────────────────────────────────
;(globalThis as unknown as Record<string, unknown>).window = globalThis

Object.defineProperty(globalThis, 'electronAPI', {
  value: {
    platform: 'linux',
    saveApiKey: vi.fn().mockResolvedValue({ success: true }),
    loadApiKey: vi.fn().mockResolvedValue({ key: null, encrypted: true }),
    openExternal: vi.fn().mockResolvedValue(undefined)
  },
  writable: true,
  configurable: true
})

// ── Reset mocks between tests ────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  MockWebSocket.reset()

  // Re-establish constructor implementations (vi.clearAllMocks resets them in Vitest 4)
  ;(globalThis as unknown as Record<string, unknown>).AudioContext = vi.fn(
    function () { return mockAudioContext }
  )
  ;(globalThis as unknown as Record<string, unknown>).AudioWorkletNode = vi.fn(
    function () { return mockAudioWorkletNode }
  )

  // Restore default resolved values after clearAllMocks
  ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockMediaStream)
  ;(navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudioDevices)
  mockAudioContext.audioWorklet.addModule.mockResolvedValue(undefined)
  mockAudioContext.createAnalyser.mockReturnValue(mockAnalyserNode)
  mockAnalyserNode.getFloatTimeDomainData.mockImplementation((array: Float32Array) => array.fill(0))
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    platform: 'linux',
    saveApiKey: vi.fn().mockResolvedValue({ success: true }),
    loadApiKey: vi.fn().mockResolvedValue({ key: null, encrypted: true }),
    openExternal: vi.fn().mockResolvedValue(undefined)
  }
})
