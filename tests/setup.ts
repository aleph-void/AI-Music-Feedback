/**
 * Global test setup for renderer/happy-dom environment.
 * Runs before every test file in the "renderer" project.
 */
import { vi, beforeEach } from 'vitest'
import { MockWebSocket } from './mocks/MockWebSocket'

// ── WebSocket ────────────────────────────────────────────────────────────────
;(globalThis as unknown as Record<string, unknown>).WebSocket = MockWebSocket

// ── Clipboard ───────────────────────────────────────────────────────────────
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true
})

// ── MediaDevices (getDisplayMedia) ──────────────────────────────────────────
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

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getDisplayMedia: vi.fn().mockResolvedValue(mockMediaStream)
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

export const mockAudioContext = {
  sampleRate: 24000,
  audioWorklet: {
    addModule: vi.fn().mockResolvedValue(undefined)
  },
  createMediaStreamSource: vi.fn(() => mockSourceNode),
  close: vi.fn()
}

;(globalThis as unknown as Record<string, unknown>).AudioContext = vi.fn(
  () => mockAudioContext
)
;(globalThis as unknown as Record<string, unknown>).AudioWorkletNode = vi.fn(
  () => mockAudioWorkletNode
)

// ── window.electronAPI ───────────────────────────────────────────────────────
;(globalThis as unknown as Record<string, unknown>).window = globalThis

Object.defineProperty(globalThis, 'electronAPI', {
  value: {
    saveApiKey: vi.fn().mockResolvedValue({ success: true }),
    loadApiKey: vi.fn().mockResolvedValue({ key: null, encrypted: true }),
    getAudioSources: vi.fn().mockResolvedValue([]),
    openExternal: vi.fn().mockResolvedValue(undefined)
  },
  writable: true,
  configurable: true
})

// ── Reset mocks between tests ────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  MockWebSocket.reset()

  // Restore default resolved values after clearAllMocks
  ;(navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mockResolvedValue(
    mockMediaStream
  )
  mockAudioContext.audioWorklet.addModule.mockResolvedValue(undefined)
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    saveApiKey: vi.fn().mockResolvedValue({ success: true }),
    loadApiKey: vi.fn().mockResolvedValue({ key: null, encrypted: true }),
    getAudioSources: vi.fn().mockResolvedValue([]),
    openExternal: vi.fn().mockResolvedValue(undefined)
  }
})
