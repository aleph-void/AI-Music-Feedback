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

const DEVICE_ID = 'mic1'

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

  it('requests permission via getUserMedia before enumerating', async () => {
    const { getSources } = useAudioCapture()
    await getSources()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('stops the permission stream tracks immediately', async () => {
    const stopFn = vi.fn()
    const permStream = { getTracks: vi.fn(() => [{ stop: stopFn }]) }
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValueOnce(permStream)
    const { getSources } = useAudioCapture()
    await getSources()
    expect(stopFn).toHaveBeenCalled()
  })

  it('populates sources from enumerateDevices audioinput entries', async () => {
    ;(navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { deviceId: 'default', kind: 'audioinput', label: 'Default', groupId: '' },
      { deviceId: 'mic1', kind: 'audioinput', label: 'Built-in Mic', groupId: '' },
      { deviceId: 'cam1', kind: 'videoinput', label: 'Camera', groupId: '' }
    ])
    const { sources, getSources } = useAudioCapture()
    await getSources()
    expect(sources.value).toHaveLength(2)
    expect(sources.value[0]).toMatchObject({ id: 'default', name: 'Default', type: 'audioinput' })
    expect(sources.value[1]).toMatchObject({ id: 'mic1', name: 'Built-in Mic', type: 'audioinput' })
  })

  it('falls back to a truncated deviceId label when the label is empty', async () => {
    ;(navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { deviceId: 'abcdefghijklmnop', kind: 'audioinput', label: '', groupId: '' }
    ])
    const { sources, getSources } = useAudioCapture()
    await getSources()
    expect(sources.value[0].name).toContain('abcdefgh')
  })

  it('sets captureError when getUserMedia throws during getSources', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Permission denied')
    )
    const { captureError, getSources } = useAudioCapture()
    await getSources()
    expect(captureError.value).toContain('Failed to enumerate audio sources')
  })

  // ── startCapture() ────────────────────────────────────────────────────────

  it('calls getUserMedia with the selected deviceId', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ deviceId: { exact: DEVICE_ID } })
      })
    )
  })

  it('disables echo cancellation, noise suppression, and auto gain', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        })
      })
    )
  })

  it('creates AudioContext with 24kHz sample rate', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(AudioContext).toHaveBeenCalledWith({ sampleRate: 24000 })
  })

  it('loads the AudioWorklet processor module', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledWith(
      expect.stringContaining('pcm16-processor.js')
    )
  })

  it('creates a MediaStreamAudioSourceNode from the stream', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled()
  })

  it('connects the source node to the worklet node', async () => {
    const { startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(mockSourceNode.connect).toHaveBeenCalledWith(mockAudioWorkletNode)
  })

  it('sets isCapturing to true after successful start', async () => {
    const { isCapturing, startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(true)
  })

  it('calls onChunk when the worklet port receives a message', async () => {
    const onChunk = vi.fn()
    const { startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, onChunk, vi.fn())

    const buffer = makeInt16Buffer(128, 16384)
    mockAudioWorkletNode.port.onmessage?.({ data: buffer } as MessageEvent<ArrayBuffer>)

    expect(onChunk).toHaveBeenCalledWith(buffer)
  })

  it('calls onLevel with a value between 0 and 1', async () => {
    const onLevel = vi.fn()
    const { startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), onLevel)

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
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toBeNull()
  })

  it('sets a permission-denied message on NotAllowedError', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError')
    )
    const { captureError, startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toContain('permission denied')
  })

  it('sets a not-found message on NotFoundError', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException('Device not found', 'NotFoundError')
    )
    const { captureError, startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toContain('not found')
  })

  it('sets a generic error message on other errors', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('device busy')
    )
    const { captureError, startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toContain('Failed to start audio capture')
    expect(captureError.value).toContain('device busy')
  })

  it('sets isCapturing to false when startCapture fails', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('fail')
    )
    const { isCapturing, startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(false)
  })

  // ── stopCapture() ─────────────────────────────────────────────────────────

  it('disconnects worklet and source nodes on stop', async () => {
    const { startCapture, stopCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    stopCapture()
    expect(mockAudioWorkletNode.disconnect).toHaveBeenCalled()
    expect(mockSourceNode.disconnect).toHaveBeenCalled()
  })

  it('closes the AudioContext on stop', async () => {
    const { startCapture, stopCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    stopCapture()
    expect(mockAudioContext.close).toHaveBeenCalled()
  })

  it('sets isCapturing to false on stop', async () => {
    const { isCapturing, startCapture, stopCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(true)
    stopCapture()
    expect(isCapturing.value).toBe(false)
  })

  it('does not throw if stopCapture is called without a prior startCapture', () => {
    const { stopCapture } = useAudioCapture()
    expect(() => stopCapture()).not.toThrow()
  })

  // ── Silence timeout ────────────────────────────────────────────────────────

  it('stops capture after silence timeout when audio stays below threshold', async () => {
    vi.useFakeTimers()
    const { isCapturing, startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn(), 3000)

    // Send silent audio (all zeros)
    const silent = makeInt16Buffer(128, 0)
    mockAudioWorkletNode.port.onmessage?.({ data: silent } as MessageEvent<ArrayBuffer>)

    expect(isCapturing.value).toBe(true) // not stopped yet
    vi.advanceTimersByTime(3000)
    expect(isCapturing.value).toBe(false)
    vi.useRealTimers()
  })

  it('resets the silence timer when audio rises above the threshold', async () => {
    vi.useFakeTimers()
    const { isCapturing, startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn(), 2000)

    // Silent chunk starts the timer
    mockAudioWorkletNode.port.onmessage?.({ data: makeInt16Buffer(128, 0) } as MessageEvent<ArrayBuffer>)
    vi.advanceTimersByTime(1000) // half the timeout

    // Loud chunk resets the timer
    mockAudioWorkletNode.port.onmessage?.({ data: makeInt16Buffer(128, 16384) } as MessageEvent<ArrayBuffer>)
    vi.advanceTimersByTime(1500) // would have fired if timer wasn't reset

    expect(isCapturing.value).toBe(true) // still capturing
    vi.useRealTimers()
  })

  it('does not start a silence timer when silenceTimeoutMs is 0', async () => {
    vi.useFakeTimers()
    const { isCapturing, startCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn(), 0)

    mockAudioWorkletNode.port.onmessage?.({ data: makeInt16Buffer(128, 0) } as MessageEvent<ArrayBuffer>)
    vi.advanceTimersByTime(60_000)

    expect(isCapturing.value).toBe(true)
    vi.useRealTimers()
  })

  it('cancels a pending silence timer when stopCapture is called manually', async () => {
    vi.useFakeTimers()
    const { isCapturing, startCapture, stopCapture } = useAudioCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn(), 3000)

    mockAudioWorkletNode.port.onmessage?.({ data: makeInt16Buffer(128, 0) } as MessageEvent<ArrayBuffer>)
    stopCapture() // explicit stop before timeout fires
    vi.advanceTimersByTime(5000) // timer should be gone; no double-stop

    expect(isCapturing.value).toBe(false) // already stopped, didn't error
    vi.useRealTimers()
  })
})
