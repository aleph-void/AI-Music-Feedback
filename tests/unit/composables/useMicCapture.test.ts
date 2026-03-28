import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { useMicCapture as UseMicCaptureFn } from '@/composables/useMicCapture'
import { mockAudioContext, mockAudioWorkletNode, mockSourceNode } from '../../setup'

let useMicCapture: typeof UseMicCaptureFn

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useMicCapture')
  useMicCapture = mod.useMicCapture
})

const DEVICE_ID = 'mic-device-id'

describe('useMicCapture', () => {
  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts with isCapturing = false', () => {
    expect(useMicCapture().isCapturing.value).toBe(false)
  })

  it('starts with captureError = null', () => {
    expect(useMicCapture().captureError.value).toBeNull()
  })

  // ── getUserMedia constraints ───────────────────────────────────────────────
  // useMicCapture intentionally ENABLES processing unlike useAudioCapture

  it('enables echoCancellation (unlike audio capture)', async () => {
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ echoCancellation: true })
      })
    )
  })

  it('enables noiseSuppression', async () => {
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ noiseSuppression: true })
      })
    )
  })

  it('enables autoGainControl', async () => {
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ autoGainControl: true })
      })
    )
  })

  it('requests the exact deviceId provided', async () => {
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ deviceId: { exact: DEVICE_ID } })
      })
    )
  })

  // ── startCapture success path ──────────────────────────────────────────────

  it('sets isCapturing to true after successful start', async () => {
    const { isCapturing, startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(true)
  })

  it('creates AudioContext at 24kHz', async () => {
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(AudioContext).toHaveBeenCalledWith({ sampleRate: 24000 })
  })

  it('loads the AudioWorklet processor module', async () => {
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledWith(
      expect.stringContaining('pcm16-processor.js')
    )
  })

  it('connects the source node to the worklet node', async () => {
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(mockSourceNode.connect).toHaveBeenCalledWith(mockAudioWorkletNode)
  })

  it('clears captureError to null on a new startCapture call', async () => {
    const { captureError, startCapture } = useMicCapture()
    captureError.value = 'old error'
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toBeNull()
  })

  it('forwards PCM chunks to the onChunk callback', async () => {
    const onChunk = vi.fn()
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, onChunk, vi.fn())
    const buffer = new Int16Array(128).fill(1000).buffer
    mockAudioWorkletNode.port.onmessage?.({ data: buffer } as MessageEvent<ArrayBuffer>)
    expect(onChunk).toHaveBeenCalledWith(buffer)
  })

  it('calls onLevel with a value between 0 and 1', async () => {
    const onLevel = vi.fn()
    const { startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), onLevel)
    const buffer = new Int16Array(128).fill(16384).buffer
    mockAudioWorkletNode.port.onmessage?.({ data: buffer } as MessageEvent<ArrayBuffer>)
    expect(onLevel).toHaveBeenCalledTimes(1)
    const level = onLevel.mock.calls[0][0] as number
    expect(level).toBeGreaterThan(0)
    expect(level).toBeLessThanOrEqual(1)
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('sets captureError to "Microphone permission denied." on NotAllowedError', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError')
    )
    const { captureError, startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toBe('Microphone permission denied.')
  })

  it('sets captureError to "Microphone permission denied." on PermissionDeniedError', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('Permission denied', 'PermissionDeniedError')
    )
    const { captureError, startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toBe('Microphone permission denied.')
  })

  it('sets captureError to "Microphone not found." on NotFoundError', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('Not found', 'NotFoundError')
    )
    const { captureError, startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toBe('Microphone not found.')
  })

  it('sets a generic captureError message for other errors', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('device busy')
    )
    const { captureError, startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(captureError.value).toContain('Failed to start microphone')
    expect(captureError.value).toContain('device busy')
  })

  it('keeps isCapturing false when startCapture fails', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError')
    )
    const { isCapturing, startCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(false)
  })

  // ── stopCapture ────────────────────────────────────────────────────────────

  it('sets isCapturing to false on stop', async () => {
    const { isCapturing, startCapture, stopCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    expect(isCapturing.value).toBe(true)
    stopCapture()
    expect(isCapturing.value).toBe(false)
  })

  it('disconnects the worklet node on stop', async () => {
    const { startCapture, stopCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    stopCapture()
    expect(mockAudioWorkletNode.disconnect).toHaveBeenCalled()
  })

  it('disconnects the source node on stop', async () => {
    const { startCapture, stopCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    stopCapture()
    expect(mockSourceNode.disconnect).toHaveBeenCalled()
  })

  it('closes the AudioContext on stop', async () => {
    const { startCapture, stopCapture } = useMicCapture()
    await startCapture(DEVICE_ID, vi.fn(), vi.fn())
    stopCapture()
    expect(mockAudioContext.close).toHaveBeenCalled()
  })

  it('does not throw if stopCapture is called without a prior startCapture', () => {
    const { stopCapture } = useMicCapture()
    expect(() => stopCapture()).not.toThrow()
  })
})
