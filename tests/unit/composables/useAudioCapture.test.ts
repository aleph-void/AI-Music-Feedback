import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { useAudioCapture as UseAudioCaptureFn } from '@/composables/useAudioCapture'
import { mockAudioContext, mockAudioWorkletNode, mockSourceNode } from '../../setup'

let useAudioCapture: typeof UseAudioCaptureFn

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useAudioCapture')
  useAudioCapture = mod.useAudioCapture
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInt16Buffer(samples: number, value = 0): ArrayBuffer {
  const buf = new ArrayBuffer(samples * 2)
  new Int16Array(buf).fill(value)
  return buf
}

describe('useAudioCapture', () => {
  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts with an empty sources array', () => {
    const { sources } = useAudioCapture()
    expect(sources.value).toEqual([])
  })

  it('starts with isCapturing = false', () => {
    const { isCapturing } = useAudioCapture()
    expect(isCapturing.value).toBe(false)
  })

  it('starts with captureError = null', () => {
    const { captureError } = useAudioCapture()
    expect(captureError.value).toBeNull()
  })

  // ── getSources() ───────────────────────────────────────────────────────────

  it('populates sources from electronAPI.getAudioSources', async () => {
    const fakeSources = [
      { id: 'screen:0', name: 'Screen 1', type: 'screen' as const },
      { id: 'window:1', name: 'Firefox', type: 'window' as const }
    ]
    window.electronAPI.getAudioSources = vi.fn().mockResolvedValue(fakeSources)
    const { sources, getSources } = useAudioCapture()
    await getSources()
    expect(sources.value).toEqual(fakeSources)
  })

  it('sets captureError when getAudioSources throws', async () => {
    window.electronAPI.getAudioSources = vi.fn().mockRejectedValue(new Error('IPC error'))
    const { captureError, getSources } = useAudioCapture()
    await getSources()
    expect(captureError.value).toContain('Failed to enumerate audio sources')
  })

  // ── startCapture() ────────────────────────────────────────────────────────

  it('calls navigator.mediaDevices.getDisplayMedia', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled()
  })

  it('creates AudioContext with 24kHz sample rate', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(AudioContext).toHaveBeenCalledWith({ sampleRate: 24000 })
  })

  it('loads the AudioWorklet processor module', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledWith(
      expect.stringContaining('pcm16-processor.js')
    )
  })

  it('creates a MediaStreamAudioSourceNode from the stream', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled()
  })

  it('connects the source node to the worklet node', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(mockSourceNode.connect).toHaveBeenCalledWith(mockAudioWorkletNode)
  })

  it('sets isCapturing to true after successful start', async () => {
    const { isCapturing, startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(true)
  })

  it('calls onChunk when the worklet port receives a message', async () => {
    const onChunk = vi.fn()
    const { startCapture } = useAudioCapture()
    await startCapture(onChunk, vi.fn())

    const buffer = makeInt16Buffer(128, 16384) // half-scale signal
    mockAudioWorkletNode.port.onmessage?.({ data: buffer } as MessageEvent<ArrayBuffer>)

    expect(onChunk).toHaveBeenCalledWith(buffer)
  })

  it('calls onLevel with a value between 0 and 1', async () => {
    const onLevel = vi.fn()
    const { startCapture } = useAudioCapture()
    await startCapture(vi.fn(), onLevel)

    const buffer = makeInt16Buffer(128, 16384)
    mockAudioWorkletNode.port.onmessage?.({ data: buffer } as MessageEvent<ArrayBuffer>)

    expect(onLevel).toHaveBeenCalledTimes(1)
    const level = onLevel.mock.calls[0][0] as number
    expect(level).toBeGreaterThan(0)
    expect(level).toBeLessThanOrEqual(1)
  })

  it('clears captureError to null on a new startCapture call', async () => {
    const { captureError, startCapture } = useAudioCapture()
    captureError.value = 'old error'
    await startCapture(vi.fn(), vi.fn())
    expect(captureError.value).toBeNull()
  })

  it('sets a permission-denied message on NotAllowedError', async () => {
    ;(navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError')
    )
    const { captureError, startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(captureError.value).toContain('permission denied')
  })

  it('sets a generic error message on other errors', async () => {
    ;(navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('device busy')
    )
    const { captureError, startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(captureError.value).toContain('Failed to start audio capture')
    expect(captureError.value).toContain('device busy')
  })

  it('sets isCapturing to false when startCapture fails', async () => {
    ;(navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('fail')
    )
    const { isCapturing, startCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(false)
  })

  // ── stopCapture() ─────────────────────────────────────────────────────────

  it('disconnects worklet and source nodes on stop', async () => {
    const { startCapture, stopCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    stopCapture()
    expect(mockAudioWorkletNode.disconnect).toHaveBeenCalled()
    expect(mockSourceNode.disconnect).toHaveBeenCalled()
  })

  it('closes the AudioContext on stop', async () => {
    const { startCapture, stopCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    stopCapture()
    expect(mockAudioContext.close).toHaveBeenCalled()
  })

  it('sets isCapturing to false on stop', async () => {
    const { isCapturing, startCapture, stopCapture } = useAudioCapture()
    await startCapture(vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(true)
    stopCapture()
    expect(isCapturing.value).toBe(false)
  })

  it('does not throw if stopCapture is called without a prior startCapture', () => {
    const { stopCapture } = useAudioCapture()
    expect(() => stopCapture()).not.toThrow()
  })
})
